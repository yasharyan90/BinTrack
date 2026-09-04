import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PackageSearch, ScanLine, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { QtyBadge } from '@/components/stock/QtyBadge'
import { useSearchProducts } from '@/hooks/useProducts'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useUi } from '@/stores/ui'
import { formatNumber } from '@/lib/utils'

/**
 * The full-page answer to "where is it and how many are there?" — every match
 * with every location, quantity and expiry, in FEFO then walking order.
 */
export default function SearchPage() {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query, 200)
  const openScanner = useUi((s) => s.openScanner)
  const { data: results = [], isFetching } = useSearchProducts(debounced, 30)

  const searched = debounced.trim().length >= 2

  return (
    <>
      <PageHeader
        title="Search"
        description="Typo-tolerant: “bleu mug” finds the Blue Ceramic Mug."
        actions={
          <Button variant="secondary" onClick={openScanner}>
            <ScanLine />
            Scan
          </Button>
        }
      />

      <div className="relative mb-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Product name, SKU, barcode or category…"
          className="pl-9"
          aria-label="Search products"
        />
      </div>

      {!searched ? (
        <EmptyState
          icon={PackageSearch}
          title="Type at least two characters"
          description="Or scan a barcode to jump straight to the product."
        />
      ) : isFetching && results.length === 0 ? (
        <SkeletonRows rows={4} />
      ) : results.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={`Nothing matches “${debounced}”`}
          description="Check the spelling, or search by SKU or barcode."
        />
      ) : (
        <div className="space-y-3">
          <p className="text-small text-muted-foreground">
            {results.length} {results.length === 1 ? 'product' : 'products'}
          </p>

          {results.map((result) => (
            <Card key={result.id}>
              <CardContent className="space-y-3 p-4 pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/products/${result.id}`}
                      className="text-h3 underline-offset-2 hover:underline"
                    >
                      {result.name}
                    </Link>
                    <p className="flex flex-wrap items-center gap-1.5 text-small text-muted-foreground">
                      <span>{result.sku}</span>
                      {result.barcode && <span>· {result.barcode}</span>}
                      {result.category && <span>· {result.category}</span>}
                      {result.is_perishable && (
                        <Badge variant="warning" className="px-1.5 py-0">
                          perishable
                        </Badge>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-4 text-right">
                    <div>
                      <p className="label-small">Available</p>
                      <p className="text-lg font-semibold tabular">
                        {formatNumber(result.available)}
                      </p>
                    </div>
                    <div>
                      <p className="label-small">On hand</p>
                      <p className="text-lg font-semibold tabular text-muted-foreground">
                        {formatNumber(result.on_hand)}
                      </p>
                    </div>
                  </div>
                </div>

                {result.locations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not stocked anywhere.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {result.locations.map((location, i) => (
                      <li
                        key={`${location.bin_id}-${i}`}
                        className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                      >
                        <LocationBadge code={location.location_code} binId={location.bin_id} />
                        <QtyBadge quantity={location.quantity} reserved={location.reserved} />
                        {location.lot_number && (
                          <span className="text-small text-muted-foreground">
                            lot {location.lot_number}
                          </span>
                        )}
                        {location.expiry_date && <ExpiryChip date={location.expiry_date} />}
                        {location.status === 'quarantined' && (
                          <Badge variant="destructive">quarantined</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
