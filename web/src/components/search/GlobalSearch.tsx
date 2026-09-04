import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ScanLine, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { useSearchProducts } from '@/hooks/useProducts'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useUi } from '@/stores/ui'
import { cn, formatNumber } from '@/lib/utils'
import type { SearchResult } from '@/types/app'

/**
 * One search bar for name, SKU, barcode and category (PRD §5.4).
 *
 * A HID scanner types straight into this field and presses Enter, which is why
 * Enter on a single exact match jumps to the product instead of just selecting.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const { searchOpen, setSearchOpen, openScanner } = useUi()

  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const debounced = useDebouncedValue(query, 200)
  const { data: results, isFetching } = useSearchProducts(debounced)

  const open = searchOpen && debounced.trim().length >= 2
  const rows = useMemo(() => results ?? [], [results])

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => setHighlighted(0), [debounced])

  const choose = (result: SearchResult) => {
    setQuery('')
    setSearchOpen(false)
    inputRef.current?.blur()
    navigate(`/products/${result.id}`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!rows.length) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlighted((i) => (i + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlighted((i) => (i - 1 + rows.length) % rows.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      // A scanned barcode resolves to exactly one product — go straight there.
      const scanned = rows.find((r) => r.barcode && r.barcode === query.trim())
      choose(scanned ?? rows[highlighted])
    }
  }

  return (
    <div className={cn('relative w-full', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSearchOpen(true)
        }}
        onFocus={() => setSearchOpen(true)}
        onBlur={() => window.setTimeout(() => setSearchOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Search products, SKU, barcode…"
        className="pl-9 pr-20"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
        aria-label="Search products"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
        {query && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
          >
            <X className="size-3.5" />
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onMouseDown={(e) => e.preventDefault()}
          onClick={openScanner}
          aria-label="Scan a code"
        >
          <ScanLine className="size-4" />
        </Button>
      </div>

      {open && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {isFetching && rows.length === 0 ? (
            <div className="space-y-1 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nothing matches “{debounced}”.
            </p>
          ) : (
            rows.map((result, index) => (
              <button
                key={result.id}
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => choose(result)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md px-3 py-2 text-left',
                  index === highlighted && 'bg-accent',
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{result.name}</span>
                  <span className="shrink-0 text-small tabular text-muted-foreground">
                    {formatNumber(result.available)} / {formatNumber(result.on_hand)}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-small text-muted-foreground">{result.sku}</span>
                  {result.is_perishable && (
                    <Badge variant="warning" className="px-1.5 py-0">
                      perishable
                    </Badge>
                  )}
                  {result.locations.slice(0, 3).map((loc, i) => (
                    <span key={`${loc.bin_id}-${i}`} className="flex items-center gap-1">
                      <LocationBadge code={loc.location_code} />
                      <span className="text-small tabular text-muted-foreground">
                        {formatNumber(loc.quantity)}
                      </span>
                    </span>
                  ))}
                  {result.locations.length > 3 && (
                    <span className="text-small text-muted-foreground">
                      +{result.locations.length - 3} more
                    </span>
                  )}
                  {result.locations.length === 0 && (
                    <span className="text-small text-muted-foreground">not stocked anywhere</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
