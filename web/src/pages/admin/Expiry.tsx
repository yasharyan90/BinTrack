import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, Timer, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { useExpiringStock, useExpiryTimeline, type ExpiryBucket } from '@/hooks/useDashboard'
import { useRecordMovement } from '@/hooks/useMovements'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { downloadCsv, flattenForCsv, timestampedName, toCsv } from '@/lib/csv'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import type { Views } from '@/types/database'

const BUCKETS: { value: ExpiryBucket; label: string; tone: string }[] = [
  { value: 'expired', label: 'Expired', tone: 'text-destructive' },
  { value: '7d', label: 'Within 7 days', tone: 'text-destructive' },
  { value: '30d', label: 'Within 30 days', tone: 'text-warning' },
  { value: '60d', label: 'Within 60 days', tone: 'text-muted-foreground' },
]

/**
 * Expiry management (App Flow §5.7). Expired lots are already quarantined by
 * the alert engine — this page is where they get written off.
 */
export default function Expiry() {
  const [selected, setSelected] = useState<ExpiryBucket[]>(['expired', '7d', '30d'])
  const [writeOff, setWriteOff] = useState<Views<'v_expiring_stock'> | null>(null)
  const [reason, setReason] = useState('')

  const { data: rows = [], isLoading } = useExpiringStock(selected)
  const { data: allRows = [] } = useExpiringStock(['expired', '7d', '30d', '60d', 'later'], 1000)
  const { data: timeline } = useExpiryTimeline(8)
  const record = useRecordMovement()
  const { showSuccess, showError } = useAppToast()

  useRealtime('expiry', ['stock_levels'])

  const counts = useMemo(() => {
    const map = new Map<string, { lots: number; units: number; value: number }>()
    for (const row of allRows) {
      const current = map.get(row.bucket) ?? { lots: 0, units: 0, value: 0 }
      map.set(row.bucket, {
        lots: current.lots + 1,
        units: current.units + row.quantity,
        value: current.value + row.quantity * row.unit_cost,
      })
    }
    return map
  }, [allRows])

  const toggle = (bucket: ExpiryBucket) =>
    setSelected((prev) =>
      prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket],
    )

  const submitWriteOff = async () => {
    if (!writeOff) return
    try {
      await record.mutateAsync({
        type: 'adjustment',
        productId: writeOff.product_id,
        quantity: writeOff.quantity,
        fromBinId: writeOff.bin_id,
        lotNumber: writeOff.lot_number,
        expiryDate: writeOff.expiry_date,
        note: reason.trim() || 'Expired stock written off',
      })
      showSuccess(
        `Wrote off ${writeOff.quantity} × ${writeOff.sku}`,
        `Removed from ${writeOff.location_code}.`,
      )
      setWriteOff(null)
      setReason('')
    } catch (error) {
      showError(error, 'Write-off failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Expiry"
        description="Dated lots by urgency. Expired stock is quarantined automatically."
        actions={
          <Button
            variant="secondary"
            disabled={rows.length === 0}
            onClick={() =>
              downloadCsv(
                timestampedName('expiring-stock'),
                toCsv(rows.map((r) => flattenForCsv(r as unknown as Record<string, unknown>))),
              )
            }
          >
            <Download />
            Export
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {BUCKETS.map((bucket) => {
          const stats = counts.get(bucket.value) ?? { lots: 0, units: 0, value: 0 }
          const active = selected.includes(bucket.value)
          return (
            <button
              key={bucket.value}
              type="button"
              onClick={() => toggle(bucket.value)}
              aria-pressed={active}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                active ? 'border-foreground bg-accent' : 'border-border hover:bg-accent',
              )}
            >
              <p className="label-small">{bucket.label}</p>
              <p className={cn('kpi-value', bucket.tone)}>{formatNumber(stats.units)}</p>
              <p className="text-small text-muted-foreground">
                {stats.lots} {stats.lots === 1 ? 'lot' : 'lots'} · {formatCurrency(stats.value)}
              </p>
            </button>
          )
        })}
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-2 p-4 pt-4">
          <h2 className="text-h3">Units expiring per week</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timeline} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v: number) => formatNumber(v)}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--muted))' }}
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'hsl(var(--popover-foreground))',
                }}
                formatter={(value: number) => [formatNumber(value), 'Units']}
              />
              <Bar dataKey="units" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Timer}
          title="Nothing in these buckets"
          description="Select another bucket, or enjoy the quiet."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.stock_level_id}>
                  <TableCell>
                    <Link
                      to={`/products/${row.product_id}`}
                      className="font-mono text-small underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48 truncate">{row.product_name}</TableCell>
                  <TableCell>
                    <LocationBadge code={row.location_code} binId={row.bin_id} />
                  </TableCell>
                  <TableCell className="font-mono text-small">{row.lot_number ?? '—'}</TableCell>
                  <TableCell>
                    <ExpiryChip date={row.expiry_date} days={row.days_to_expiry} />
                  </TableCell>
                  <TableCell className="text-right tabular">{formatNumber(row.quantity)}</TableCell>
                  <TableCell className="text-right tabular">
                    {formatCurrency(row.quantity * row.unit_cost)}
                  </TableCell>
                  <TableCell>
                    {row.status === 'quarantined' ? (
                      <Badge variant="destructive">quarantined</Badge>
                    ) : (
                      <Badge variant="success">available</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setWriteOff(row)
                        setReason(
                          row.days_to_expiry !== null && row.days_to_expiry < 0
                            ? 'Expired stock written off'
                            : '',
                        )
                      }}
                    >
                      <Trash2 className="size-3.5" />
                      Write off
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={!!writeOff} onOpenChange={(open) => !open && setWriteOff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Write off expired stock</DialogTitle>
            <DialogDescription>
              This posts an adjustment movement — the units leave stock and the reason is recorded
              against them forever.
            </DialogDescription>
          </DialogHeader>

          {writeOff && (
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <LocationBadge code={writeOff.location_code} size="md" />
                <span className="tabular text-sm font-medium">{writeOff.quantity} units</span>
              </div>
              <p className="text-sm">
                {writeOff.product_name}{' '}
                <span className="text-muted-foreground">({writeOff.sku})</span>
              </p>
              <div className="flex items-center gap-2">
                {writeOff.lot_number && (
                  <span className="text-small text-muted-foreground">lot {writeOff.lot_number}</span>
                )}
                <ExpiryChip date={writeOff.expiry_date} days={writeOff.days_to_expiry} />
              </div>
              <p className="text-small text-muted-foreground">
                Value written off: {formatCurrency(writeOff.quantity * writeOff.unit_cost)}
              </p>
            </div>
          )}

          <Textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (recorded on the movement)"
            aria-label="Write-off reason"
          />

          <DialogFooter>
            <Button variant="secondary" onClick={() => setWriteOff(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={record.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => void submitWriteOff()}
            >
              <Trash2 />
              Write off {writeOff?.quantity} units
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
