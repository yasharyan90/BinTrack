import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, History, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { useActors, useMovements, type MovementFilters } from '@/hooks/useMovements'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtime } from '@/hooks/useRealtime'
import { downloadCsv, flattenForCsv, timestampedName, toCsv } from '@/lib/csv'
import { formatDateTime } from '@/lib/utils'
import type { MovementType } from '@/types/database'

const TYPES: { value: MovementType | 'all'; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'inward', label: 'Inward' },
  { value: 'outward', label: 'Outward' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'count_correction', label: 'Count correction' },
]

/** The audit trail: filterable, infinite-scrolling, exportable (App Flow §4.7). */
export default function Movements() {
  const [filters, setFilters] = useState<MovementFilters>({ type: 'all' })
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)

  const query = useMovements({ ...filters, search: debounced })
  const { data: actors = [] } = useActors()

  useRealtime('movements', ['stock_movements'])

  const rows = useMemo(() => query.data?.pages.flat() ?? [], [query.data])

  const exportCsv = () => {
    downloadCsv(
      timestampedName('movements'),
      toCsv(rows.map((row) => flattenForCsv(row as unknown as Record<string, unknown>))),
    )
  }

  return (
    <>
      <PageHeader
        title="Movements"
        description="Every unit that moved, who moved it, and why. Append-only."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download />
            Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="SKU or product name…"
            className="pl-9"
            aria-label="Search movements"
          />
        </div>

        <Select
          value={filters.type ?? 'all'}
          onValueChange={(v) => setFilters((f) => ({ ...f, type: v as MovementType | 'all' }))}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.performedBy ?? 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, performedBy: v === 'all' ? undefined : v }))
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Anyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Anyone</SelectItem>
            {actors.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.full_name ?? actor.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))}
          className="w-40"
          aria-label="From date"
        />
        <Input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))}
          className="w-40"
          aria-label="To date"
        />
      </div>

      {query.isLoading ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="No movements match these filters"
          description="Widen the date range or clear the search."
        />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Lot / expiry</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((movement) => (
                  <TableRow key={movement.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(movement.created_at)}
                    </TableCell>
                    <TableCell className="uppercase">{movement.type}</TableCell>
                    <TableCell>
                      <Link
                        to={`/products/${movement.product_id}`}
                        className="font-mono text-small underline-offset-2 hover:underline"
                      >
                        {movement.sku}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{movement.product_name}</TableCell>
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
                    <TableCell className="whitespace-nowrap text-small text-muted-foreground">
                      {movement.lot_number ?? '—'}
                      {movement.expiry_date ? ` · ${movement.expiry_date}` : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {movement.performed_by_name ?? 'system'}
                    </TableCell>
                    <TableCell className="text-small text-muted-foreground">
                      {movement.reference_type ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {query.hasNextPage && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                loading={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}
