import { Link } from 'react-router-dom'
import { Clock, DoorClosed, DoorOpen } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { describeHours, useSetWarehouseStatus, useWarehouseStatus } from '@/hooks/useWarehouse'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { cn } from '@/lib/utils'

/**
 * The closed notice every signed-in user sees under the top bar while the
 * warehouse is shut. Staff get the admin's message and the opening hours;
 * admins get the same plus a link to the switch. Nothing is blocked — the
 * database decides what a role may do — but nobody can miss it.
 */
export function WarehouseStatusBanner() {
  const { data: status } = useWarehouseStatus()
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  if (!status || status.open) return null

  return (
    <div
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-destructive/40 bg-destructive/12 px-4 py-2 text-sm"
      role="status"
      aria-live="polite"
    >
      <span className="inline-flex items-center gap-1.5 font-semibold text-destructive">
        <DoorClosed className="size-4" aria-hidden />
        Warehouse closed
      </span>
      <span className="text-foreground">
        {status.closed_message ?? 'The warehouse is closed.'}{' '}
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          Opens {describeHours(status)} ({status.timezone})
          {status.reason === 'manual' && ' · closed by the admin'}
        </span>
      </span>
      {isAdmin && (
        <Link to="/admin" className="text-primary underline-offset-2 hover:underline">
          Manage
        </Link>
      )}
    </div>
  )
}

/** The on/off switch on the admin dashboard header. */
export function WarehouseToggle({ className }: { className?: string }) {
  const { data: status } = useWarehouseStatus()
  const set = useSetWarehouseStatus()
  const { showSuccess, showError } = useAppToast()
  if (!status) return null

  const Icon = status.open ? DoorOpen : DoorClosed
  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
        status.open ? 'border-success/40 bg-success/12 text-success' : 'border-destructive/40 bg-destructive/12 text-destructive',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden />
      <span className="font-medium">{status.open ? 'Warehouse open' : 'Warehouse closed'}</span>
      <span className="text-small text-muted-foreground">
        {status.reason === 'outside_hours' ? `outside hours · opens ${status.open_time}` : status.auto_schedule ? describeHours(status) : 'manual'}
      </span>
      <Switch
        checked={status.is_open}
        disabled={set.isPending}
        aria-label="Warehouse open switch"
        onCheckedChange={(checked) =>
          set.mutate(
            { is_open: checked },
            {
              onSuccess: (s) =>
                showSuccess(
                  checked ? 'Warehouse switched on' : 'Warehouse closed',
                  checked && !s.open ? `Still outside hours — opens ${s.open_time}. Turn off the schedule in Settings to open now.` : 'Staff see the notice immediately.',
                ),
              onError: (e) => showError(e, 'Could not change the status'),
            },
          )
        }
      />
    </label>
  )
}
