import { Link, useParams } from 'react-router-dom'
import { Boxes, PackagePlus, Printer, Repeat } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { QtyBadge } from '@/components/stock/QtyBadge'
import { useBin, useBinStock } from '@/hooks/useLocations'
import { useRealtime } from '@/hooks/useRealtime'
import { useAuth } from '@/stores/auth'
import { formatCurrency, formatNumber } from '@/lib/utils'

/** What is in one bin, how full it is, and what to do about it. */
export default function BinDetail() {
  const { binId } = useParams<{ binId: string }>()
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')

  const { data: bin, isLoading } = useBin(binId)
  const { data: stock = [], isLoading: stockLoading } = useBinStock(binId)

  useRealtime(`bin:${binId}`, ['stock_levels'])

  if (isLoading) return <SkeletonRows rows={5} />
  if (!bin) {
    return (
      <EmptyState
        icon={Boxes}
        title="Bin not found"
        action={
          <Button asChild>
            <Link to="/search">Back to search</Link>
          </Button>
        }
      />
    )
  }

  const units = stock.reduce((sum, s) => sum + s.quantity, 0)
  const value = stock.reduce((sum, s) => sum + s.quantity * s.unit_cost, 0)
  const fillPct = bin.capacity ? Math.round((units / bin.capacity) * 100) : null

  return (
    <>
      <PageHeader
        title={bin.location_code}
        description={`${bin.row.warehouse.name} · ${bin.row.name ?? bin.row.code}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={`/receive?bin=${bin.id}`}>
                <PackagePlus />
                Receive here
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to={`/transfer?from=${bin.id}`}>
                <Repeat />
                Transfer out
              </Link>
            </Button>
            {isAdmin && (
              <Button asChild variant="secondary">
                <Link to={`/admin/labels?bins=${bin.id}`}>
                  <Printer />
                  Print QR
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-3 pt-3">
            <p className="label-small">Units</p>
            <p className="kpi-value">{formatNumber(units)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 pt-3">
            <p className="label-small">SKUs</p>
            <p className="kpi-value">{new Set(stock.map((s) => s.product_id)).size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 pt-3">
            <p className="label-small">Stock value</p>
            <p className="kpi-value">{formatCurrency(value)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2 p-3 pt-3">
            <p className="label-small">Utilisation</p>
            {bin.capacity ? (
              <>
                <p
                  className={`kpi-value ${
                    fillPct! > 100 ? 'text-destructive' : fillPct! > 90 ? 'text-warning' : ''
                  }`}
                >
                  {fillPct}%
                </p>
                <p className="text-small text-muted-foreground">
                  {formatNumber(units)} of {formatNumber(bin.capacity)} units
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No capacity set.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {!bin.is_active && (
        <p className="mb-4 rounded-md bg-warning/12 px-3 py-2 text-sm text-warning">
          This bin is deactivated: it cannot receive stock or be allocated from.
        </p>
      )}

      {stockLoading ? (
        <SkeletonRows rows={4} />
      ) : stock.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="This bin is empty"
          description="Receive stock here to fill it."
          action={
            <Button asChild>
              <Link to={`/receive?bin=${bin.id}`}>Receive stock</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Lot</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((row) => (
                <TableRow key={row.stock_level_id}>
                  <TableCell>
                    <Link
                      to={`/products/${row.product_id}`}
                      className="font-mono text-small underline-offset-2 hover:underline"
                    >
                      {row.sku}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">{row.product_name}</TableCell>
                  <TableCell className="font-mono text-small">{row.lot_number ?? '—'}</TableCell>
                  <TableCell>
                    {row.expiry_date ? (
                      <ExpiryChip date={row.expiry_date} days={row.days_to_expiry} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <QtyBadge quantity={row.quantity} reserved={row.reserved_qty} />
                  </TableCell>
                  <TableCell className="text-right tabular">{row.available}</TableCell>
                  <TableCell>
                    {row.status === 'quarantined' ? (
                      <Badge variant="destructive">quarantined</Badge>
                    ) : (
                      <Badge variant="success">available</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="mt-4">
        <LocationBadge code={bin.location_code} size="lg" />
        <span className="ml-2 text-small text-muted-foreground">
          This is what the bin QR label encodes.
        </span>
      </p>
    </>
  )
}
