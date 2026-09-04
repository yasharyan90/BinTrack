import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PackagePlus } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ProductPicker } from '@/components/search/ProductPicker'
import { BinPicker } from '@/components/stock/BinPicker'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { useBins } from '@/hooks/useLocations'
import { useRecordMovement } from '@/hooks/useMovements'
import { useAppToast } from '@/hooks/useAppToast'
import { addDaysIso, todayIso } from '@/lib/utils'
import type { Bin, SearchResult } from '@/types/app'

/**
 * Inward stock (App Flow §4.4). Expiry is required for perishables and the
 * shelf life pre-fills the date, so the common case is one tap.
 */
export default function Receive() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const record = useRecordMovement()
  const { showSuccess, showError } = useAppToast()

  const [product, setProduct] = useState<SearchResult | null>(null)
  const [perishable, setPerishable] = useState(false)
  const [shelfLife, setShelfLife] = useState<number | null>(null)
  const [bin, setBin] = useState<Bin | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [lot, setLot] = useState('')
  const [expiry, setExpiry] = useState('')
  const [note, setNote] = useState('')

  const { data: bins = [] } = useBins()
  const prefilledProductId = params.get('product')
  const prefilledBinId = params.get('bin')

  // Deep links from the scanner and product pages pre-select what they know.
  useEffect(() => {
    if (prefilledBinId && !bin) {
      const match = bins.find((b) => b.id === prefilledBinId)
      if (match) setBin(match)
    }
  }, [bin, bins, prefilledBinId])

  useEffect(() => {
    if (!prefilledProductId || product) return
    void (async () => {
      const { supabase } = await import('@/lib/supabase')
      const { data } = await supabase
        .from('products')
        .select('id, sku, name, barcode, is_perishable, shelf_life_days, reorder_point')
        .eq('id', prefilledProductId)
        .maybeSingle()
      if (!data) return
      setProduct({
        id: data.id,
        sku: data.sku,
        name: data.name,
        barcode: data.barcode,
        category: null,
        is_perishable: data.is_perishable,
        reorder_point: data.reorder_point,
        on_hand: 0,
        reserved: 0,
        available: 0,
        locations: [],
        score: 1,
      })
      setPerishable(data.is_perishable)
      setShelfLife(data.shelf_life_days)
      if (data.is_perishable && data.shelf_life_days) setExpiry(addDaysIso(data.shelf_life_days))
    })()
  }, [prefilledProductId, product])

  // Selecting a product decides whether expiry is mandatory.
  const chooseProduct = async (next: SearchResult | null) => {
    setProduct(next)
    if (!next) {
      setPerishable(false)
      setShelfLife(null)
      setExpiry('')
      return
    }
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase
      .from('products')
      .select('is_perishable, shelf_life_days')
      .eq('id', next.id)
      .maybeSingle()
    const isPerishable = data?.is_perishable ?? next.is_perishable
    setPerishable(isPerishable)
    setShelfLife(data?.shelf_life_days ?? null)
    setExpiry(isPerishable && data?.shelf_life_days ? addDaysIso(data.shelf_life_days) : '')
  }

  const expiryMissing = perishable && !expiry
  const canSubmit = !!product && !!bin && quantity > 0 && !expiryMissing

  const submit = async () => {
    if (!product || !bin) return
    try {
      await record.mutateAsync({
        type: 'inward',
        productId: product.id,
        quantity,
        toBinId: bin.id,
        lotNumber: lot.trim() || null,
        expiryDate: expiry || null,
        note: note.trim() || null,
      })
      showSuccess(
        `${quantity} × ${product.sku} placed in ${bin.location_code}`,
        'Stock and alerts updated for everyone, live.',
      )
      // Keep the bin: receiving a pallet means many lines into the same place.
      setProduct(null)
      setQuantity(1)
      setLot('')
      setExpiry('')
      setNote('')
      setPerishable(false)
    } catch (error) {
      showError(error, 'Could not receive the stock')
    }
  }

  return (
    <>
      <PageHeader
        title="Receive stock"
        description="Inward goods with lot and expiry, placed into a scanned bin."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-5 p-4 pt-4">
            <Field label="Product" required>
              <ProductPicker
                value={product}
                onSelect={(next) => void chooseProduct(next)}
                placeholder="Search or scan the product…"
                autoFocus
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Quantity" htmlFor="qty" required>
                <Input
                  id="qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                  className="tabular"
                />
              </Field>

              <Field label="Lot number" htmlFor="lot" hint="Optional, but it makes recalls easy.">
                <Input
                  id="lot"
                  value={lot}
                  onChange={(e) => setLot(e.target.value)}
                  placeholder="L2409"
                  className="font-mono"
                />
              </Field>
            </div>

            <Field
              label="Expiry date"
              htmlFor="expiry"
              required={perishable}
              error={expiryMissing ? 'This product is perishable — an expiry date is required.' : undefined}
              hint={
                !perishable
                  ? 'Only needed for perishable goods.'
                  : shelfLife
                    ? `Suggested from a ${shelfLife}-day shelf life.`
                    : undefined
              }
            >
              <Input
                id="expiry"
                type="date"
                min={todayIso()}
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              />
            </Field>

            <Field label="Destination bin" required>
              <BinPicker value={bin} onSelect={setBin} productId={product?.id} />
            </Field>

            <Field label="Note" htmlFor="note">
              <Textarea
                id="note"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Supplier, PO number, condition…"
              />
            </Field>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-4 pt-4">
            <h2 className="text-h3">Summary</h2>

            {product ? (
              <p className="text-sm">
                <span className="font-medium">{quantity}</span> × {product.name}
                <span className="block text-small text-muted-foreground">{product.sku}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Choose a product to begin.</p>
            )}

            {bin && (
              <p className="flex items-center gap-2 text-sm">
                into <LocationBadge code={bin.location_code} size="md" />
              </p>
            )}

            {expiry && (
              <p className="text-small text-muted-foreground">
                Expires {expiry}
                {lot ? ` · lot ${lot}` : ''}
              </p>
            )}

            <Button
              className="w-full"
              size="lg"
              disabled={!canSubmit}
              loading={record.isPending}
              onClick={() => void submit()}
            >
              <PackagePlus />
              Receive stock
            </Button>

            <Button variant="ghost" className="w-full" onClick={() => navigate('/movements')}>
              View the movement log
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
