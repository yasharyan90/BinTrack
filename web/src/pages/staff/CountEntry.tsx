import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ClipboardCheck, Check, EyeOff } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { BinPicker } from '@/components/stock/BinPicker'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { useCountSession, useSubmitCountLine } from '@/hooks/useCounts'
import { useBinStock } from '@/hooks/useLocations'
import { useAppToast } from '@/hooks/useAppToast'
import type { Bin } from '@/types/app'

/**
 * Scan-driven count entry (App Flow §4.8). In a blind count the expected
 * quantity is hidden — the whole point is an independent number.
 */
export default function CountEntry() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { data, isLoading } = useCountSession(sessionId)
  const submitLine = useSubmitCountLine()
  const { showSuccess, showError } = useAppToast()

  const [bin, setBin] = useState<Bin | null>(null)
  const [counts, setCounts] = useState<Record<string, string>>({})

  const { data: binStock = [] } = useBinStock(bin?.id)

  const countedByKey = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of data?.lines ?? []) {
      if (line.counted_qty === null || !line.bin || !line.product) continue
      map.set(`${line.bin.id}|${line.product.id}|${line.lot_number ?? ''}`, line.counted_qty)
    }
    return map
  }, [data])

  if (isLoading) return <SkeletonRows rows={6} />
  if (!data) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="Count session not found"
        action={
          <Button asChild>
            <Link to="/">Go home</Link>
          </Button>
        }
      />
    )
  }

  const { session, lines } = data
  const closed = session.status !== 'open'
  const counted = lines.filter((l) => l.counted_qty !== null).length

  const submit = async (
    productId: string,
    lotNumber: string | null,
    expiryDate: string | null,
    key: string,
  ) => {
    if (!bin || !sessionId) return
    const value = Number(counts[key])
    if (!Number.isInteger(value) || value < 0) {
      showError('INVALID_QTY:enter a whole number of units', 'Invalid count')
      return
    }
    try {
      await submitLine.mutateAsync({
        sessionId,
        binId: bin.id,
        productId,
        countedQty: value,
        lotNumber,
        expiryDate,
      })
      showSuccess(`Counted ${value}`)
      setCounts((prev) => ({ ...prev, [key]: '' }))
    } catch (error) {
      showError(error, 'Could not save the count')
    }
  }

  return (
    <>
      <PageHeader
        title={session.name}
        description={
          session.row ? `Counting ${session.row.name ?? session.row.code}` : 'Cycle count'
        }
        actions={
          <>
            <Badge variant={closed ? 'default' : 'info'}>{session.status}</Badge>
            {session.is_blind && (
              <Badge variant="warning">
                <EyeOff className="size-3" aria-hidden />
                blind count
              </Badge>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 pt-4">
          <p className="text-sm text-muted-foreground">
            {counted} of {lines.length} snapshot lines counted.
            {session.is_blind && ' Expected quantities are hidden until an admin approves.'}
          </p>
        </CardContent>
      </Card>

      {closed ? (
        <EmptyState
          icon={Check}
          title="This session is closed"
          description="No further counts can be entered."
        />
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <p className="label-small">Scan the bin you are standing at</p>
              <BinPicker value={bin} onSelect={setBin} label="Bin being counted" />
            </CardContent>
          </Card>

          {bin && (
            <Card>
              <CardContent className="space-y-3 p-4 pt-4">
                <div className="flex items-center justify-between">
                  <LocationBadge code={bin.location_code} size="md" />
                  <span className="text-small text-muted-foreground">
                    {binStock.length} {binStock.length === 1 ? 'lot' : 'lots'} expected here
                  </span>
                </div>

                {binStock.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    The system thinks this bin is empty. If you found stock in it, count it against
                    the product it belongs to from the product page.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {binStock.map((row) => {
                      const key = `${bin.id}|${row.product_id}|${row.lot_number ?? ''}`
                      const already = countedByKey.get(key)
                      return (
                        <li
                          key={row.stock_level_id}
                          className="flex flex-wrap items-end justify-between gap-3 rounded-md border border-border p-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{row.product_name}</p>
                            <p className="flex flex-wrap items-center gap-1.5 text-small text-muted-foreground">
                              {row.sku}
                              {row.lot_number ? ` · lot ${row.lot_number}` : ''}
                              {row.expiry_date && (
                                <ExpiryChip date={row.expiry_date} days={row.days_to_expiry} showDate={false} />
                              )}
                            </p>
                            {!session.is_blind && (
                              <p className="text-small text-muted-foreground">
                                expected {row.quantity}
                              </p>
                            )}
                            {already !== undefined && (
                              <p className="text-small text-success">already counted: {already}</p>
                            )}
                          </div>

                          <div className="flex items-end gap-2">
                            <div className="w-24">
                              <label htmlFor={`count-${key}`} className="label-small">
                                Counted
                              </label>
                              <Input
                                id={`count-${key}`}
                                type="number"
                                inputMode="numeric"
                                min={0}
                                value={counts[key] ?? ''}
                                onChange={(e) =>
                                  setCounts((prev) => ({ ...prev, [key]: e.target.value }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    void submit(row.product_id, row.lot_number, row.expiry_date, key)
                                  }
                                }}
                                className="text-center tabular"
                              />
                            </div>
                            <Button
                              loading={submitLine.isPending}
                              disabled={(counts[key] ?? '') === ''}
                              onClick={() =>
                                void submit(row.product_id, row.lot_number, row.expiry_date, key)
                              }
                            >
                              <Check />
                              Save
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  )
}
