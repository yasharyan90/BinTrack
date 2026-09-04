import { useEffect, useRef, useState } from 'react'
import { Check, ScanLine, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { useSearchProducts } from '@/hooks/useProducts'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useUi } from '@/stores/ui'
import { cn, formatNumber } from '@/lib/utils'
import type { SearchResult } from '@/types/app'

/**
 * Inline product search used by order lines, receiving and transfers — the
 * same ranking as the global bar, but it returns the row instead of navigating.
 */
export function ProductPicker({
  value,
  onSelect,
  placeholder = 'Search or scan a product…',
  autoFocus,
  className,
}: {
  value?: SearchResult | null
  onSelect: (product: SearchResult | null) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const debounced = useDebouncedValue(query, 200)
  const { data: results, isFetching } = useSearchProducts(debounced, 12, open)
  const openScanner = useUi((s) => s.openScanner)
  const inputRef = useRef<HTMLInputElement>(null)

  const rows = results ?? []

  useEffect(() => setHighlighted(0), [debounced])

  if (value) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2',
          className,
        )}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{value.name}</p>
          <p className="text-small text-muted-foreground">
            {value.sku} · {formatNumber(value.available)} available
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSelect(null)
            setQuery('')
            window.setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!rows.length) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setHighlighted((i) => (i + 1) % rows.length)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlighted((i) => (i - 1 + rows.length) % rows.length)
          } else if (e.key === 'Enter') {
            e.preventDefault()
            const scanned = rows.find((r) => r.barcode === query.trim())
            onSelect(scanned ?? rows[highlighted])
            setQuery('')
            setOpen(false)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
        placeholder={placeholder}
        className="pl-9 pr-10"
        aria-label="Search for a product"
        autoComplete="off"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2"
        onMouseDown={(e) => e.preventDefault()}
        onClick={openScanner}
        aria-label="Scan a barcode"
      >
        <ScanLine className="size-4" />
      </Button>

      {open && debounced.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
          {isFetching && rows.length === 0 ? (
            <div className="space-y-1 p-1">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">No match.</p>
          ) : (
            rows.map((result, index) => (
              <button
                key={result.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => {
                  onSelect(result)
                  setQuery('')
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left',
                  index === highlighted && 'bg-accent',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{result.name}</span>
                  <span className="flex items-center gap-1.5 text-small text-muted-foreground">
                    {result.sku}
                    {result.locations[0] && <LocationBadge code={result.locations[0].location_code} />}
                  </span>
                </span>
                <span className="shrink-0 text-small tabular text-muted-foreground">
                  {formatNumber(result.available)} avail
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

/** Compact confirmation used after a scan resolves to a product. */
export function PickedProduct({ product }: { product: SearchResult }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-success">
      <Check className="size-4" aria-hidden />
      {product.name} ({product.sku})
    </p>
  )
}
