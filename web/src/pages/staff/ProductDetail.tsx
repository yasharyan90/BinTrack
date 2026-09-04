import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PackagePlus, PackageX, Pencil, Printer, Repeat, Wrench } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { QtyBadge } from '@/components/stock/QtyBadge'
import { StockHealthBar } from '@/components/stock/StockHealthBar'
import { AdjustStockDialog } from './AdjustStockDialog'
import { useProduct, useProductLocations, useProductMovements } from '@/hooks/useProducts'
import { useRealtime } from '@/hooks/useRealtime'
import { useAuth } from '@/stores/auth'
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils'
import type { ProductLocation } from '@/types/app'

/** Where is it, how many, and what has happened to it (App Flow §4.1). */
export default function ProductDetail() {
  const { productId } = useParams<{ productId: string }>()
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')

  const { data: product, isLoading } = useProduct(productId)
  const { data: locations = [], isLoading: locationsLoading } = useProductLocations(productId)
  const { data: movements = [] } = useProductMovements(productId)

  const [adjusting, setAdjusting] = useState<ProductLocation | null>(null)

  useRealtime(`product:${productId}`, ['stock_levels', 'stock_movements'])

  if (isLoading) return <SkeletonRows rows={6} />
  if (!product) {
    return (
      <EmptyState
        icon={PackageX}
        title="Product not found"
        description="It may have been removed."
        action={
          <Button asChild>
            <Link to="/search">Back to search</Link>
          </Button>
        }
      />
    )
  }

  const onHand = locations.reduce((sum, l) => sum + l.quantity, 0)
  const reserved = locations.reduce((sum, l) => sum + l.reserved_qty, 0)
  const available = locations
    .filter((l) => l.status === 'available' && (l.days_to_expiry === null || l.days_to_expiry >= 0))
    .reduce((sum, l) => sum + l.available, 0)

  return (
    <>
      <PageHeader
        title={product.name}
        description={product.description ?? undefined}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={`/receive?product=${product.id}`}>
                <PackagePlus />
                Receive
              </Link>
            </Button>
            {locations.length > 0 && (
              <Button asChild variant="secondary">
                <Link to={`/transfer?product=${product.id}&from=${locations[0].bin_id}`}>
                  <Repeat />
                  Transfer
                </Link>
              </Button>
            )}
            {isAdmin && (
              <>
                <Button asChild variant="secondary">
                  <Link to={`/admin/labels?products=${product.id}`}>
                    <Printer />
                    Label
                  </Link>
                </Button>
                <Button asChild>
                  <Link to={`/admin/products/${product.id}/edit`}>
                    <Pencil />
                    Edit
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <span className="font-mono">{product.sku}</span>
        {product.barcode && <span>· {product.barcode}</span>}
        {product.category && <span>· {product.category.name}</span>}
        <Badge variant={product.is_perishable ? 'warning' : 'default'}>
          {product.is_perishable ? `perishable · ${product.shelf_life_days} d shelf life` : 'non-perishable'}
        </Badge>
        {!product.is_active && <Badge variant="destructive">inactive</Badge>}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="On hand" value={formatNumber(onHand)} />
        <Kpi label="Reserved" value={formatNumber(reserved)} tone="text-reserved" />
        <Kpi label="Available" value={formatNumber(available)} tone="text-success" />
        <Card>
          <CardContent className="space-y-2 p-3 pt-3">
            <p className="label-small">Stock health</p>
            <StockHealthBar available={available} reorderPoint={product.reorder_point} />
            <p className="text-small text-muted-foreground">
              Unit cost {formatCurrency(product.unit_cost)} · reorder {product.reorder_qty}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="locations">
        <TabsList>
          <TabsTrigger value="locations">Locations ({locations.length})</TabsTrigger>
          <TabsTrigger value="movements">Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="locations">
          {locationsLoading ? (
            <SkeletonRows rows={4} />
          ) : locations.length === 0 ? (
            <EmptyState
              icon={PackageX}
              title="Not stocked anywhere"
              description="Receive stock to give this product an address."
              action={
                <Button asChild>
                  <Link to={`/receive?product=${product.id}`}>Receive stock</Link>
                </Button>
              }
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Row</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {locations.map((location) => (
                    <TableRow key={location.stock_level_id}>
                      <TableCell>
                        <LocationBadge code={location.location_code} binId={location.bin_id} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {location.row_name ?? location.row_code}
                      </TableCell>
                      <TableCell className="font-mono text-small">
                        {location.lot_number ?? '—'}
                      </TableCell>
                      <TableCell>
                        {location.expiry_date ? (
                          <ExpiryChip date={location.expiry_date} days={location.days_to_expiry} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <QtyBadge quantity={location.quantity} reserved={location.reserved_qty} />
                      </TableCell>
                      <TableCell className="text-right tabular">{location.available}</TableCell>
                      <TableCell>
                        {location.status === 'quarantined' ? (
                          <Badge variant="destructive">quarantined</Badge>
                        ) : (
                          <Badge variant="success">available</Badge>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setAdjusting(location)}
                            aria-label={`Adjust stock in ${location.location_code}`}
                          >
                            <Wrench className="size-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="movements">
          {movements.length === 0 ? (
            <EmptyState icon={PackageX} title="No movements yet" />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>From</TableHead>
                    <TableHead>To</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movements.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(movement.created_at)}
                      </TableCell>
                      <TableCell className="uppercase">{movement.type}</TableCell>
                      <TableCell className="text-right tabular">{movement.quantity}</TableCell>
                      <TableCell>
                        {movement.from_location ? (
                          <LocationBadge code={movement.from_location} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {movement.to_location ? (
                          <LocationBadge code={movement.to_location} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {movement.performed_by_name ?? 'system'}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">
                        {movement.note ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {adjusting && (
        <AdjustStockDialog
          product={{ id: product.id, sku: product.sku, name: product.name }}
          location={adjusting}
          open
          onOpenChange={(open) => !open && setAdjusting(null)}
        />
      )}
    </>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="p-3 pt-3">
        <p className="label-small">{label}</p>
        <p className={`kpi-value ${tone ?? ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
