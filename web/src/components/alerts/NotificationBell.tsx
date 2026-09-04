import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SeverityChip } from '@/components/stock/StatusChip'
import { useAlerts, useMarkAlertsRead, useUnreadAlertCount } from '@/hooks/useAlerts'
import { relativeTime } from '@/lib/utils'

/**
 * Unread count and the ten newest active alerts. Opening the popover marks them
 * read, which is what "unread" means here: an admin has laid eyes on it
 * (App Flow §6.2).
 */
export function NotificationBell() {
  const { data: unread = 0 } = useUnreadAlertCount()
  const { data: alerts = [] } = useAlerts({ status: ['active'] })
  const markRead = useMarkAlertsRead()

  const latest = useMemo(() => alerts.slice(0, 10), [alerts])

  return (
    <Popover
      onOpenChange={(open) => {
        if (open && latest.length > 0) {
          markRead.mutate(latest.map((a) => a.id))
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `${unread} unread alerts` : 'Alerts'}
        >
          <Bell className="size-5" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-h3">Alerts</p>
          {latest.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markRead.mutate(alerts.map((a) => a.id))}
            >
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {latest.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing needs attention.
            </p>
          ) : (
            latest.map((alert) => (
              <Link
                key={alert.id}
                to="/admin/alerts"
                className="flex gap-2.5 border-b border-border px-3 py-2.5 last:border-0 hover:bg-accent"
              >
                <span
                  className={
                    alert.severity === 'critical'
                      ? 'w-0.5 shrink-0 rounded-full bg-destructive'
                      : alert.severity === 'warning'
                        ? 'w-0.5 shrink-0 rounded-full bg-warning'
                        : 'w-0.5 shrink-0 rounded-full bg-info'
                  }
                  aria-hidden
                />
                <span className="min-w-0 flex-1 space-y-0.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{alert.title}</span>
                    <span className="shrink-0 text-small text-muted-foreground">
                      {relativeTime(alert.last_evaluated_at)}
                    </span>
                  </span>
                  <span className="line-clamp-2 block text-small text-muted-foreground">
                    {alert.message}
                  </span>
                </span>
              </Link>
            ))
          )}
        </div>

        <div className="border-t border-border p-2">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/admin/alerts">View all alerts</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { SeverityChip }
