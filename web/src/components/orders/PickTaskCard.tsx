import { AlertTriangle, Check, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { cn } from '@/lib/utils'
import type { PickTask } from '@/types/app'

/**
 * One task on the pick list. The location code is the largest thing on the
 * card; a coloured rail on the left carries status, and the text repeats it
 * so colour is never the only signal (UI/UX §1, §8).
 */
export function PickTaskCard({
  task,
  onScan,
  disabled,
}: {
  task: PickTask
  onScan: (task: PickTask) => void
  disabled?: boolean
}) {
  const rail =
    task.status === 'picked'
      ? 'bg-success'
      : task.status === 'short'
        ? 'bg-warning'
        : task.status === 'verified'
          ? 'bg-info'
          : task.mismatch_count > 0
            ? 'bg-destructive'
            : 'bg-border'

  const isShort = task.status === 'short'
  const isPicked = task.status === 'picked'

  return (
    <article
      className={cn(
        'flex min-h-[72px] gap-3 rounded-lg border border-border bg-card p-3',
        isPicked && 'opacity-60',
      )}
      aria-label={`${task.sku} at ${task.location_code ?? 'no location'}`}
    >
      <span className={cn('w-1 shrink-0 rounded-full', rail)} aria-hidden />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          {isShort ? (
            <Badge variant="warning">
              <AlertTriangle className="size-3" aria-hidden />
              Not allocated — no stock available
            </Badge>
          ) : (
            <LocationBadge code={task.location_code} size="lg" binId={task.bin_id} />
          )}

          <div className="text-right">
            <p className="text-xl font-semibold tabular leading-6">
              {isPicked ? task.picked_qty : task.quantity}
            </p>
            <p className="text-small text-muted-foreground">{isPicked ? 'picked' : 'to pick'}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.name}</p>
          <p className="truncate text-small text-muted-foreground">
            {task.sku}
            {task.lot_number ? ` · lot ${task.lot_number}` : ''}
            {task.row_name ? ` · ${task.row_name}` : ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {task.expiry_date && <ExpiryChip date={task.expiry_date} days={task.days_to_expiry} />}
          {task.mismatch_count > 0 && !isPicked && (
            <Badge variant="destructive">
              <AlertTriangle className="size-3" aria-hidden />
              {task.mismatch_count} scan {task.mismatch_count === 1 ? 'mismatch' : 'mismatches'}
            </Badge>
          )}
          {task.status === 'verified' && (
            <Badge variant="info">
              <Check className="size-3" aria-hidden />
              Verified — confirm quantity
            </Badge>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center">
        {isPicked ? (
          <span className="flex size-10 items-center justify-center rounded-full bg-success/12 text-success">
            <Check className="size-5" aria-hidden />
            <span className="sr-only">Picked</span>
          </span>
        ) : isShort ? null : (
          <Button size="md" onClick={() => onScan(task)} disabled={disabled}>
            <ScanLine />
            Scan
          </Button>
        )}
      </div>
    </article>
  )
}
