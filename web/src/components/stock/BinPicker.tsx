import { useMemo, useState } from 'react'
import { Check, ScanLine, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LocationBadge } from './LocationBadge'
import { useBins, useSuggestedBins } from '@/hooks/useLocations'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'
import type { Bin } from '@/types/app'

/**
 * Choose a bin by scanning its QR, typing its location code, or picking from
 * suggestions. Suggestions lead with bins that already hold the SKU and still
 * have room (Feature B6) — the shortest walk for the put-away.
 */
export function BinPicker({
  value,
  onSelect,
  productId,
  label = 'Destination bin',
  excludeBinId,
  className,
}: {
  value: Bin | null
  onSelect: (bin: Bin | null) => void
  productId?: string
  label?: string
  excludeBinId?: string
  className?: string
}) {
  const [query, setQuery] = useState('')
  const { data: bins = [], isLoading } = useBins()
  const { data: suggestions = [] } = useSuggestedBins(productId)
  const openScanner = useUi((s) => s.openScanner)

  const matches = useMemo(() => {
    const term = query.trim().toUpperCase()
    if (term.length < 1) return []
    return bins
      .filter((b) => b.is_active && b.id !== excludeBinId && b.location_code.includes(term))
      .slice(0, 8)
  }, [bins, excludeBinId, query])

  const suggestedBins = useMemo(
    () =>
      suggestions
        .filter((s) => s.bin_id !== excludeBinId)
        .map((s) => ({ ...s, bin: bins.find((b) => b.id === s.bin_id) }))
        .filter((s): s is typeof s & { bin: Bin } => !!s.bin),
    [bins, excludeBinId, suggestions],
  )

  if (value) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2',
          className,
        )}
      >
        <span className="flex items-center gap-2">
          <Check className="size-4 text-success" aria-hidden />
          <LocationBadge code={value.location_code} size="md" />
        </span>
        <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
          Change
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && matches.length > 0) {
              e.preventDefault()
              onSelect(matches[0])
              setQuery('')
            }
          }}
          placeholder="Scan or type a location code, e.g. WH1-R02-B017"
          className="pl-9 pr-10 font-mono"
          aria-label={label}
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2"
          onClick={openScanner}
          aria-label="Scan the bin QR"
        >
          <ScanLine className="size-4" />
        </Button>
      </div>

      {matches.length > 0 && (
        <div className="rounded-lg border border-border p-1">
          {matches.map((bin) => (
            <button
              key={bin.id}
              type="button"
              onClick={() => {
                onSelect(bin)
                setQuery('')
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-accent"
            >
              <LocationBadge code={bin.location_code} />
              {bin.capacity && (
                <span className="text-small text-muted-foreground">capacity {bin.capacity}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {query.length === 0 && suggestedBins.length > 0 && (
        <div className="space-y-1.5">
          <p className="label-small">Suggested</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestedBins.map((s) => (
              <button
                key={s.bin_id}
                type="button"
                onClick={() => onSelect(s.bin)}
                className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-accent"
                title={s.reason}
              >
                <LocationBadge code={s.bin.location_code} />
                <Badge variant="default" className="px-1.5 py-0">
                  {s.reason}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoading && <p className="text-small text-muted-foreground">Loading bins…</p>}
    </div>
  )
}
