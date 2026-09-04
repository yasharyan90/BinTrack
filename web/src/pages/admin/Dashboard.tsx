import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  IndianRupee,
  Package,
  ScanLine,
  ShoppingCart,
  Timer,
  TrendingDown,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiTile } from '@/components/dashboard/KpiTile'
import { StockByRowChart } from '@/components/dashboard/StockByRowChart'
import { RowHeatmap } from '@/components/dashboard/RowHeatmap'
import { AlertItem } from '@/components/alerts/AlertItem'
import { LiveIndicator } from '@/components/layout/ConnectionBanner'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { OrderStatusChip } from '@/components/stock/StatusChip'
import { useAcknowledgeAlert, useAlerts, useEvaluateAlerts } from '@/hooks/useAlerts'
import { useDashboardKpis, useExpiringStock, useStockByRow } from '@/hooks/useDashboard'
import { useBinUtilisation } from '@/hooks/useLocations'
import { useOpenOrders } from '@/hooks/useOrders'
import { useRecentMovements } from '@/hooks/useMovements'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { watchPickers } from '@/lib/realtime'
import { formatCompactCurrency, formatNumber, initials, relativeTime } from '@/lib/utils'

/**
 * The live admin dashboard (App Flow §5.1). Nothing here needs a refresh:
 * every widget is invalidated by the Postgres change that caused it, with a
 * 30 s poll behind it for the moments the socket is down.
 */
export default function Dashboard() {
  const { data: kpis, isLoading: kpisLoading } = useDashboardKpis()
  const { data: byRow = [] } = useStockByRow()
  const { data: bins = [] } = useBinUtilisation()
  const { data: alerts = [] } = useAlerts({ status: ['active', 'acknowledged'] })
  const { data: orders = [] } = useOpenOrders(6)
  const { data: movements = [] } = useRecentMovements(8)
  const { data: expiring = [] } = useExpiringStock(['expired', '7d', '30d'], 8)

  const acknowledge = useAcknowledgeAlert()
  const evaluate = useEvaluateAlerts()
  const { showSuccess, showError } = useAppToast()

  const [pickers, setPickers] = useState<{ id: string; name: string; order_id: string }[]>([])

  useRealtime('dashboard', [
    'alerts',
    'stock_levels',
    'orders',
    'pick_tasks',
    'stock_movements',
  ])

  useEffect(() => watchPickers(setPickers), [])

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Stock health across the warehouse, updating as it happens."
        actions={
          <>
            <LiveIndicator />
            <Button
              variant="secondary"
              loading={evaluate.isPending}
              onClick={() =>
                evaluate.mutate(undefined, {
                  onSuccess: () => showSuccess('Alert rules re-evaluated'),
                  onError: (error) => showError(error, 'Could not run the alert sweep'),
                })
              }
            >
              Run alert sweep
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiTile label="SKUs" value={formatNumber(kpis?.total_skus ?? 0)} icon={Package} loading={kpisLoading} to="/admin/products" />
        <KpiTile label="Units" value={formatNumber(kpis?.total_units ?? 0)} icon={Boxes} loading={kpisLoading} />
        <KpiTile
          label="Stock value"
          value={formatCompactCurrency(kpis?.stock_value ?? 0)}
          icon={IndianRupee}
          loading={kpisLoading}
        />
        <KpiTile
          label="Low stock"
          value={formatNumber(kpis?.low_stock_count ?? 0)}
          icon={TrendingDown}
          tone={kpis?.low_stock_count ? 'warning' : 'neutral'}
          loading={kpisLoading}
          to="/admin/alerts"
        />
        <KpiTile
          label="Expiring"
          value={formatNumber(kpis?.expiring_count ?? 0)}
          icon={Timer}
          tone={kpis?.expiring_count ? 'warning' : 'neutral'}
          loading={kpisLoading}
          to="/admin/expiry"
        />
        <KpiTile
          label="Open orders"
          value={formatNumber(kpis?.open_orders ?? 0)}
          icon={ShoppingCart}
          loading={kpisLoading}
          to="/orders"
        />
        <KpiTile
          label="Picks today"
          value={formatNumber(kpis?.picks_today ?? 0)}
          icon={ScanLine}
          loading={kpisLoading}
        />
        <KpiTile
          label="Pick accuracy"
          value={`${kpis?.pick_accuracy_pct ?? 100}%`}
          sublabel="last 30 days"
          icon={CheckCircle2}
          tone={(kpis?.pick_accuracy_pct ?? 100) >= 99 ? 'success' : 'warning'}
          loading={kpisLoading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <h2 className="text-h3">Stock by row</h2>
              {byRow.length === 0 ? (
                <Skeleton className="h-52 w-full" />
              ) : (
                <StockByRowChart rows={byRow} />
              )}
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left">
                      <th className="label-small py-1">Row</th>
                      <th className="label-small py-1 text-right">Units</th>
                      <th className="label-small py-1 text-right">SKUs</th>
                      <th className="label-small py-1 text-right">Bins used</th>
                      <th className="label-small py-1 text-right">Expiring</th>
                      <th className="label-small py-1 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRow.map((row) => (
                      <tr key={row.row_id} className="border-t border-border">
                        <td className="py-1.5 font-mono">{row.row_code}</td>
                        <td className="py-1.5 text-right tabular">{formatNumber(row.units)}</td>
                        <td className="py-1.5 text-right tabular">{row.sku_count}</td>
                        <td className="py-1.5 text-right tabular">
                          {row.occupied_bins}/{row.bin_count}
                        </td>
                        <td className="py-1.5 text-right tabular">
                          {row.expiring_units > 0 ? (
                            <span className="text-warning">{formatNumber(row.expiring_units)}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular">
                          {formatCompactCurrency(row.stock_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <h2 className="text-h3">Bin utilisation</h2>
              {bins.length === 0 ? <Skeleton className="h-24 w-full" /> : <RowHeatmap bins={bins} />}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <h2 className="text-h3">Recent movements</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/movements">All</Link>
                  </Button>
                </div>
                {movements.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">Nothing yet.</p>
                ) : (
                  <ul>
                    {movements.map((movement) => (
                      <li
                        key={movement.id}
                        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">
                            <span className="font-medium uppercase">{movement.type}</span>{' '}
                            {movement.quantity} × {movement.sku}
                          </span>
                          <span className="location-code block truncate text-small text-muted-foreground">
                            {movement.from_location ?? '—'} → {movement.to_location ?? '—'}
                          </span>
                        </span>
                        <span className="shrink-0 text-small text-muted-foreground">
                          {relativeTime(movement.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <h2 className="text-h3">Expiring soon</h2>
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/admin/expiry">Manage</Link>
                  </Button>
                </div>
                {expiring.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    Nothing expires in the next 30 days.
                  </p>
                ) : (
                  <ul>
                    {expiring.map((row) => (
                      <li
                        key={row.stock_level_id}
                        className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{row.sku}</span>
                          <LocationBadge code={row.location_code} binId={row.bin_id} />
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular">{row.quantity}</span>
                          <ExpiryChip date={row.expiry_date} days={row.days_to_expiry} showDate={false} />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border p-3">
                <h2 className="text-h3">Alerts ({alerts.length})</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/admin/alerts">All</Link>
                </Button>
              </div>
              <div className="max-h-[32rem] overflow-y-auto">
                {alerts.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Everything is healthy"
                    description="No stock-outs, no expiries, no discrepancies."
                    className="m-3 border-0"
                  />
                ) : (
                  alerts
                    .slice(0, 12)
                    .map((alert) => (
                      <AlertItem
                        key={alert.id}
                        alert={alert}
                        compact
                        busy={acknowledge.isPending}
                        onAction={(action, snoozeUntil) =>
                          acknowledge.mutate(
                            { alertId: alert.id, action, snoozeUntil },
                            { onError: (error) => showError(error, 'Could not update the alert') },
                          )
                        }
                      />
                    ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between border-b border-border p-3">
                <h2 className="text-h3">Orders in progress</h2>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/orders">All</Link>
                </Button>
              </div>
              {orders.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Nothing is being picked.
                </p>
              ) : (
                <ul>
                  {orders.map((order) => {
                    const total = order.tasks.length
                    const picked = order.tasks.filter((t) => t.status === 'picked').length
                    const onIt = pickers.filter((p) => p.order_id === order.id)
                    return (
                      <li key={order.id} className="border-b border-border last:border-0">
                        <Link
                          to={`/orders/${order.id}`}
                          className="flex items-center justify-between gap-2 p-3 hover:bg-accent"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-sm">
                              {order.order_number}
                            </span>
                            <span className="text-small text-muted-foreground">
                              {picked}/{total} picked
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            {onIt.map((picker) => (
                              <span
                                key={picker.id}
                                className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
                                title={picker.name}
                              >
                                {initials(picker.name)}
                              </span>
                            ))}
                            <OrderStatusChip status={order.status} />
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          {(kpis?.out_of_stock_count ?? 0) > 0 && (
            <Card>
              <CardContent className="flex items-start gap-3 p-4 pt-4">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
                <div>
                  <p className="text-h3">{kpis?.out_of_stock_count} SKUs are out of stock</p>
                  <p className="text-sm text-muted-foreground">
                    Orders for them will be created short until stock is received.
                  </p>
                  <Button asChild variant="secondary" size="sm" className="mt-2">
                    <Link to="/admin/alerts?type=out_of_stock">Review them</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
