import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardPaste, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { ProductPicker } from '@/components/search/ProductPicker'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { useCreateOrder } from '@/hooks/useOrders'
import { useAppToast } from '@/hooks/useAppToast'
import { formatNumber } from '@/lib/utils'
import type { SearchResult } from '@/types/app'

type Line = { key: string; product: SearchResult | null; quantity: number }

const newLine = (): Line => ({ key: crypto.randomUUID() as string, product: null, quantity: 1 })

/**
 * Order intake (App Flow §4.2). Creating the order allocates it in the same
 * transaction, so the next screen already shows the bins to walk to.
 */
export default function OrderNew() {
  const navigate = useNavigate()
  const createOrder = useCreateOrder()
  const { showError, showWarning } = useAppToast()

  const [customer, setCustomer] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const filled = lines.filter((l) => l.product && l.quantity > 0)

  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const submit = async () => {
    if (filled.length === 0) return
    try {
      const pickList = await createOrder.mutateAsync({
        order_number: orderNumber.trim() || null,
        customer_name: customer.trim() || null,
        note: note.trim() || null,
        source: 'manual',
        items: filled.map((l) => ({ product_id: l.product!.id, quantity: l.quantity })),
      })
      if (!pickList.order) throw new Error('Order was created but no pick list came back')

      const shortLines = pickList.items.filter((i) => i.is_short).length
      if (shortLines > 0) {
        showWarning(
          `${shortLines} ${shortLines === 1 ? 'line is' : 'lines are'} short`,
          'The pick list shows what is available.',
        )
      }
      navigate(`/orders/${pickList.order.id}`)
    } catch (error) {
      showError(error, 'Could not create the order')
    }
  }

  /** "sku,qty" per line — the fastest path from a spreadsheet to a pick list. */
  const applyPaste = () => {
    const parsed = pasteText
      .split(/\r?\n/)
      .map((row) => row.split(/[,\t;]/).map((cell) => cell.trim()))
      .filter((cells) => cells.length >= 2 && cells[0])
      .map((cells) => ({ sku: cells[0].toUpperCase(), quantity: Number(cells[1]) || 1 }))

    if (parsed.length === 0) {
      showWarning('Nothing to add', 'Use one line per item: SKU,quantity')
      return
    }

    // Resolve each SKU through the same search the pickers use.
    void Promise.all(
      parsed.map(async (row) => {
        const { supabase } = await import('@/lib/supabase')
        const { data } = await supabase.rpc('search_products', { q: row.sku, lim: 1 })
        const hit = (data ?? [])[0] as unknown as SearchResult | undefined
        return hit && hit.sku === row.sku
          ? ({ key: crypto.randomUUID() as string, product: hit, quantity: row.quantity } as Line)
          : null
      }),
    ).then((resolved) => {
      const found: Line[] = resolved.filter((l) => l !== null)
      const missing = parsed.length - found.length
      setLines((prev) => [...prev.filter((l) => l.product), ...found, newLine()])
      setPasteOpen(false)
      setPasteText('')
      if (missing > 0) showWarning(`${missing} SKU${missing === 1 ? '' : 's'} not recognised`)
    })
  }

  return (
    <>
      <PageHeader
        title="New order"
        description="Add lines, then allocate — the bins come back immediately."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-h3">Lines</h2>
                <Button variant="ghost" size="sm" onClick={() => setPasteOpen((o) => !o)}>
                  <ClipboardPaste className="size-4" />
                  Paste SKUs
                </Button>
              </div>

              {pasteOpen && (
                <div className="space-y-2 rounded-md border border-border p-3">
                  <Textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={4}
                    placeholder={'MUG-0042,4\nOAT-0007,2'}
                    aria-label="Paste SKU and quantity per line"
                    className="font-mono text-small"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={applyPaste}>
                      Add lines
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPasteOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <ul className="space-y-3">
                {lines.map((line) => (
                  <li key={line.key} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-56 flex-1">
                      <ProductPicker
                        value={line.product}
                        onSelect={(product) => updateLine(line.key, { product })}
                      />
                      {line.product && line.product.available < line.quantity && (
                        <p className="mt-1 text-small text-warning">
                          Only {formatNumber(line.product.available)} available — this line will be
                          short.
                        </p>
                      )}
                      {line.product && line.product.locations[0] && (
                        <p className="mt-1 flex items-center gap-1.5 text-small text-muted-foreground">
                          first pick
                          <LocationBadge code={line.product.locations[0].location_code} />
                        </p>
                      )}
                    </div>

                    <div className="w-24">
                      <label htmlFor={`qty-${line.key}`} className="label-small">
                        Qty
                      </label>
                      <Input
                        id={`qty-${line.key}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(line.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="text-center tabular"
                      />
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))}
                      disabled={lines.length === 1}
                      aria-label="Remove line"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <Button variant="secondary" onClick={() => setLines((prev) => [...prev, newLine()])}>
                <Plus />
                Add line
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <h2 className="text-h3">Details</h2>

              <Field label="Customer" htmlFor="customer" hint="Optional.">
                <Input
                  id="customer"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="Acme Retail"
                />
              </Field>

              <Field
                label="Order number"
                htmlFor="order-number"
                hint="Leave blank to generate ORD-YYYYMMDD-####."
              >
                <Input
                  id="order-number"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="SHOP-1001"
                  className="font-mono"
                />
              </Field>

              <Field label="Note" htmlFor="note">
                <Textarea
                  id="note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Anything the picker should know"
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Lines</span>
                <span className="tabular font-medium">{filled.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Units</span>
                <span className="tabular font-medium">
                  {formatNumber(filled.reduce((s, l) => s + l.quantity, 0))}
                </span>
              </div>
              <Button
                className="w-full"
                size="lg"
                disabled={filled.length === 0}
                loading={createOrder.isPending}
                onClick={() => void submit()}
              >
                Create & allocate
              </Button>
              <p className="text-small text-muted-foreground">
                Allocation is FEFO — the soonest expiry is picked first — then ordered for the
                shortest walk.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
