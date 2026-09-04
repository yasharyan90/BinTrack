import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Download, MoreHorizontal, Package, Pencil, Plus, Printer, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { StockHealthBar } from '@/components/stock/StockHealthBar'
import { useCategories, useProductList, useSetProductActive } from '@/hooks/useProducts'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAppToast } from '@/hooks/useAppToast'
import { downloadCsv, flattenForCsv, timestampedName, toCsv } from '@/lib/csv'
import { formatCurrency, formatNumber } from '@/lib/utils'

const PAGE_SIZE = 25

/** The catalogue with live stock alongside it (App Flow §5.3). */
export default function Products() {
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState<string>('all')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [page, setPage] = useState(0)
  const debounced = useDebouncedValue(search, 250)

  const { data, isLoading } = useProductList({
    search: debounced,
    categoryId,
    status,
    page,
    pageSize: PAGE_SIZE,
  })
  const { data: categories = [] } = useCategories()
  const setActive = useSetProductActive()
  const { showSuccess, showError } = useAppToast()

  const rows = data?.rows ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="Products"
        description={`${formatNumber(total)} in the catalogue`}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={rows.length === 0}
              onClick={() =>
                downloadCsv(
                  timestampedName('products'),
                  toCsv(rows.map((r) => flattenForCsv(r as unknown as Record<string, unknown>))),
                )
              }
            >
              <Download />
              Export page
            </Button>
            <Button asChild>
              <Link to="/admin/products/new">
                <Plus />
                Add product
              </Link>
            </Button>
          </>
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
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="SKU or name…"
            className="pl-9"
            aria-label="Search products"
          />
        </div>

        <Select
          value={categoryId}
          onValueChange={(v) => {
            setCategoryId(v)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v as 'active' | 'inactive' | 'all')
            setPage(0)
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonRows rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products match"
          description="Adjust the filters, or import a catalogue CSV."
          action={
            <Button asChild>
              <Link to="/admin/import">Import products</Link>
            </Button>
          }
        />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Bins</TableHead>
                  <TableHead className="w-40">Health</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.product_id}>
                    <TableCell>
                      <Link
                        to={`/products/${row.product_id}`}
                        className="font-mono text-small underline-offset-2 hover:underline"
                      >
                        {row.sku}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="block truncate">{row.name}</span>
                      <span className="flex gap-1.5">
                        {row.is_perishable && (
                          <Badge variant="warning" className="px-1.5 py-0">
                            perishable
                          </Badge>
                        )}
                        {!row.is_active && (
                          <Badge variant="destructive" className="px-1.5 py-0">
                            inactive
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{row.category ?? '—'}</TableCell>
                    <TableCell className="text-right tabular">{formatNumber(row.on_hand)}</TableCell>
                    <TableCell className="text-right tabular">
                      {formatNumber(row.available)}
                    </TableCell>
                    <TableCell className="text-right tabular">{row.bin_count}</TableCell>
                    <TableCell>
                      <StockHealthBar
                        available={row.available}
                        reorderPoint={row.reorder_point}
                        showLabel={false}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatCurrency(row.stock_value)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${row.sku}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/products/${row.product_id}/edit`}>
                                <Pencil className="size-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/products/${row.product_id}`}>
                                <Package className="size-4" />
                                View locations
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/admin/labels?products=${row.product_id}`}>
                                <Printer className="size-4" />
                                Print barcode label
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              destructive={row.is_active}
                              onSelect={() =>
                                setActive.mutate(
                                  { id: row.product_id, isActive: !row.is_active },
                                  {
                                    onSuccess: () =>
                                      showSuccess(
                                        row.is_active
                                          ? `${row.sku} deactivated`
                                          : `${row.sku} reactivated`,
                                        row.is_active
                                          ? 'It stays in reports but cannot be ordered or received.'
                                          : undefined,
                                      ),
                                    onError: (error) =>
                                      showError(error, 'Could not update the product'),
                                  },
                                )
                              }
                            >
                              <Ban className="size-4" />
                              {row.is_active ? 'Deactivate' : 'Reactivate'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-small text-muted-foreground">
              Page {page + 1} of {pages} · {formatNumber(total)} products
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

    </>
  )
}
