import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  BellOff,
  Check,
  Clock,
  PackageX,
  ShoppingCart,
  Timer,
  TrendingDown,
  Warehouse,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AlertStatusChip } from '@/components/stock/StatusChip'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ALERT_TYPE_LABELS, type AlertWithRefs } from '@/hooks/useAlerts'
import { cn, relativeTime } from '@/lib/utils'
import type { AlertType } from '@/types/database'

const TYPE_ICON: Record<AlertType, typeof AlertTriangle> = {
  low_stock: TrendingDown,
  out_of_stock: PackageX,
  expiring_soon: Timer,
  expired: Ban,
  dead_stock: Clock,
  bin_over_capacity: Warehouse,
  pick_discrepancy: AlertTriangle,
  order_short: ShoppingCart,
}

/**
 * One alert with its severity rail, the objects it points at, and the actions
 * that resolve it. Ack, snooze and resolve are inline — an admin should never
 * have to open a detail page to clear a queue.
 */
export function AlertItem({
  alert,
  onAction,
  busy,
  compact = false,
}: {
  alert: AlertWithRefs
  onAction?: (action: 'acknowledge' | 'snooze' | 'resolve' | 'reopen', snoozeUntil?: string) => void
  busy?: boolean
  compact?: boolean
}) {
  const Icon = TYPE_ICON[alert.type]
  const rail =
    alert.severity === 'critical'
      ? 'bg-destructive'
      : alert.severity === 'warning'
        ? 'bg-warning'
        : 'bg-info'

  const snooze = (hours: number) =>
    onAction?.('snooze', new Date(Date.now() + hours * 3_600_000).toISOString())

  return (
    <article className="flex gap-3 border-b border-border p-3 last:border-0">
      <span className={cn('w-1 shrink-0 rounded-full', rail)} aria-hidden />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{alert.title}</span>
          </p>
          <span className="shrink-0 text-small text-muted-foreground">
            {relativeTime(alert.last_evaluated_at)}
          </span>
        </div>

        <p className={cn('text-sm text-muted-foreground', compact && 'line-clamp-2')}>
          {alert.message}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-small text-muted-foreground">{ALERT_TYPE_LABELS[alert.type]}</span>
          {alert.product && (
            <Link
              to={`/products/${alert.product.id}`}
              className="text-small underline underline-offset-2 hover:no-underline"
            >
              {alert.product.sku}
            </Link>
          )}
          {alert.bin && <LocationBadge code={alert.bin.location_code} binId={alert.bin.id} />}
          {alert.order && (
            <Link
              to={`/orders/${alert.order.id}`}
              className="text-small underline underline-offset-2 hover:no-underline"
            >
              {alert.order.order_number}
            </Link>
          )}
          {!compact && <AlertStatusChip status={alert.status} />}
        </div>

        {onAction && alert.status !== 'resolved' && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {alert.status === 'active' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction('acknowledge')}>
                <Check className="size-3.5" />
                Acknowledge
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => snooze(24)}>
              <BellOff className="size-3.5" />
              Snooze 24 h
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => snooze(24 * 7)}>
              Snooze 7 d
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('resolve')}>
              Resolve
            </Button>
          </div>
        )}

        {onAction && alert.status === 'resolved' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAction('reopen')}>
            Reopen
          </Button>
        )}
      </div>
    </article>
  )
}
