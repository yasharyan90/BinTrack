import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowRight, Repeat } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { BinPicker } from '@/components/stock/BinPicker'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { QtyBadge } from '@/components/stock/QtyBadge'
import { useBins, useBinStock } from '@/hooks/useLocations'
import { useRecordMovement } from '@/hooks/useMovements'
import { useAppToast } from '@/hooks/useAppToast'
import { cn } from '@/lib/utils'
import type { Bin } from '@/types/app'
import type { Views } from '@/types/database'

/**
 * Bin-to-bin transfer (App Flow §4.5). Source bin first, because you scan what
 * is in front of you; the lot you pick carries its expiry to the destination.
 */
export default function Transfer() {
  const [params] = useSearchParams()
  const record = useRecordMovement()
  const { showSuccess, showError } = useAppToast()

  const [source, setSource] = useState<Bin | null>(null)
  const [destination, setDestination] = useState<Bin | null>(null)
  const [line, setLine] = useState<Views<'v_stock_by_location'> | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [note, setNote] = useState('')

  const { data: bins = [] } = useBins()
  const { data: sourceStock = [], isLoading } = useBinStock(source?.id)

  const prefilledFrom = params.get('from')

  useEffect(() => {
    if (prefilledFrom && !source) {
      const match = bins.find((b) => b.id === prefilledFrom)
      if (match) setSource(match)
    }
  }, [bins, prefilledFrom, source])

  const maxQty = line?.available ?? 0
  const canSubmit = !!source && !!destination && !!line && quantity > 0 && quantity <= maxQty

  const submit = async () => {
    if (!source || !destination || !line) return
    try {
      await record.mutateAsync({
        type: 'transfer',
        productId: line.product_id,
        quantity,
        fromBinId: source.id,
        toBinId: destination.id,
        lotNumber: line.lot_number,
        expiryDate: line.expiry_date,
        note: note.trim() || null,
      })
      showSuccess(
        `Moved ${quantity} × ${line.sku}`,
        `${source.location_code} → ${destination.location_code}`,
      )
      setLine(null)
      setQuantity(1)
      setNote('')
    } catch (error) {
      showError(error, 'Transfer failed')
    }
  }

  return (
    <>
      <PageHeader
        title="Transfer stock"
        description="Move a lot from one bin to another. Both bins update instantly."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <Field label="Source bin" required>
                <BinPicker
                  value={source}
                  onSelect={(bin) => {
                    setSource(bin)
                    setLine(null)
                  }}
                  label="Source bin"
                  excludeBinId={destination?.id}
                />
              </Field>

              {source && (
                <div className="space-y-2">
                  <p className="label-small">What is in this bin</p>
                  {isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : sourceStock.length === 0 ? (
                    <EmptyState
                      icon={Repeat}
                      title="This bin is empty"
                      description="Nothing to transfer out of it."
                    />
                  ) : (
                    <ul className="space-y-1.5">
                      {sourceStock.map((row) => (
                        <li key={row.stock_level_id}>
                          <button
                            type="button"
                            onClick={() => {
                              setLine(row)
                              setQuantity(Math.min(1, row.available) || 1)
                            }}
                            disabled={row.available <= 0}
                            className={cn(
                              'flex w-full flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-left',
                              line?.stock_level_id === row.stock_level_id
                                ? 'border-foreground bg-accent'
                                : 'border-border hover:bg-accent',
                              row.available <= 0 && 'opacity-50',
                            )}
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                {row.product_name}
                              </span>
                              <span className="flex items-center gap-1.5 text-small text-muted-foreground">
                                {row.sku}
                                {row.lot_number ? ` · lot ${row.lot_number}` : ''}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {row.expiry_date && (
                                <ExpiryChip date={row.expiry_date} days={row.days_to_expiry} showDate={false} />
                              )}
                              <QtyBadge quantity={row.quantity} reserved={row.reserved_qty} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Field label="Destination bin" required>
                <BinPicker
                  value={destination}
                  onSelect={setDestination}
                  productId={line?.product_id}
                  excludeBinId={source?.id}
                />
              </Field>

              <Field
                label="Quantity"
                htmlFor="transfer-qty"
                required
                error={
                  line && quantity > maxQty
                    ? `Only ${maxQty} available in ${source?.location_code} (the rest is reserved).`
                    : undefined
                }
              >
                <Input
                  id="transfer-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={maxQty || undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  disabled={!line}
                  className="tabular"
                />
              </Field>

              <Field label="Note" htmlFor="transfer-note">
                <Textarea
                  id="transfer-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Re-slotting, consolidation, damage move…"
                />
              </Field>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-4 pt-4">
            <h2 className="text-h3">Summary</h2>

            {line ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">{quantity}</span> × {line.product_name}
                  <span className="block text-small text-muted-foreground">
                    {line.sku}
                    {line.lot_number ? ` · lot ${line.lot_number}` : ''}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <LocationBadge code={source?.location_code} />
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
                  <LocationBadge code={destination?.location_code} />
                </div>
                {line.expiry_date && (
                  <p className="text-small text-muted-foreground">
                    The lot keeps its expiry of {line.expiry_date}.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Scan a source bin and choose what to move.
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              loading={record.isPending}
              onClick={() => void submit()}
            >
              <Repeat />
              Transfer
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
