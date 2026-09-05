import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardList, Lock, Plus, Search, Trash2, Truck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { ProductPicker } from '@/components/search/ProductPicker'
import { GrnStatusChip, PoStatusChip } from '@/components/grn/GrnStatus'
import { GrnKpiStrip } from '@/components/grn/GrnKpis'
import {
  useClosePurchaseOrder,
  useCreatePurchaseOrder,
  useGrnDashboard,
  usePurchaseOrder,
  usePurchaseOrders,
  useVendors,
} from '@/hooks/useGrn'
import { useWarehouses } from '@/hooks/useLocations'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAppToast } from '@/hooks/useAppToast'
import { cn, formatDate, formatDateTime, formatNumber } from '@/lib/utils'
import type { SearchResult } from '@/types/app'

type Line = { key: string; product: SearchResult | null; quantity: number; unitCost: string }
const newLine = (): Line => ({
  key: crypto.randomUUID() as string,
  product: null,
  quantity: 1,
  unitCost: '',
})

/** Purchase orders: what is expected, what has arrived, and the trucks against each. */
export default function PurchaseOrders() {
  const [status, setStatus] = useState<'open' | 'all'>('open')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)
  const [creating, setCreating] = useState(false)
  const [viewing, setViewing] = useState<string | null>(null)

  const { data: rows = [], isLoading } = usePurchaseOrders({ status, search: debounced })
  const { data: dashboard, isLoading: kpisLoading } = useGrnDashboard()
  const close = useClosePurchaseOrder()
  const { showError, showSuccess } = useAppToast()

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Every GRN starts here: a PO tells the gate what is expected."
        actions={
          <Button
            className="bg-info text-info-foreground hover:bg-info/90"
            onClick={() => setCreating(true)}
          >
            <Plus />
            New purchase order
          </Button>
        }
      />

      <div className="mb-5">
        <GrnKpiStrip data={dashboard} loading={kpisLoading} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(['open', 'all'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'rounded-full border border-border px-3 py-1 text-sm hover:bg-accent',
                status === s && 'border-transparent bg-info text-info-foreground hover:bg-info',
              )}
            >
              {s === 'open' ? 'Open' : 'All'}
            </button>
          ))}
        </div>
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="PO number…"
            className="pl-9"
            aria-label="Search purchase orders"
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No purchase orders"
          description="Raise one for a vendor, then register the truck when it arrives."
          action={<Button onClick={() => setCreating(true)}>New purchase order</Button>}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Received / ordered</TableHead>
                <TableHead className="text-right">GRNs</TableHead>
                <TableHead>Expected</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((po) => {
                const ordered = po.lines.reduce((s, l) => s + l.ordered_qty, 0)
                const received = po.lines.reduce((s, l) => s + l.received_qty, 0)
                const pct = ordered ? Math.round((received / ordered) * 100) : 0
                const receivable = po.status === 'open' || po.status === 'partially_received'
                return (
                  <TableRow key={po.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setViewing(po.id)}
                        className="font-mono text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {po.po_number}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{po.vendor?.name ?? '—'}</TableCell>
                    <TableCell>
                      <PoStatusChip status={po.status} />
                    </TableCell>
                    <TableCell className="text-right tabular">{po.lines.length}</TableCell>
                    <TableCell className="text-right">
                      <span className="tabular">
                        {formatNumber(received)} / {formatNumber(ordered)}
                      </span>
                      <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-muted align-middle">
                        <span
                          className={cn('block h-full', pct >= 100 ? 'bg-success' : 'bg-warning')}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{po.grns.length}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {po.expected_date ? formatDate(po.expected_date) : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        {receivable && (
                          <Button
                            asChild
                            size="sm"
                            className="bg-info text-info-foreground hover:bg-info/90"
                          >
                            <Link to={`/grn/new?po=${po.id}`}>
                              <Truck className="size-3.5" />
                              Receive truck
                            </Link>
                          </Button>
                        )}
                        {po.status === 'received' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={close.isPending}
                            onClick={() =>
                              close.mutate(po.id, {
                                onSuccess: () => showSuccess(`${po.po_number} closed`),
                                onError: (e) => showError(e, 'Could not close'),
                              })
                            }
                          >
                            <Lock className="size-3.5" />
                            Close
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {creating && <NewPoDialog onClose={() => setCreating(false)} />}
      {viewing && <PoDetailDialog poId={viewing} onClose={() => setViewing(null)} />}
    </>
  )
}

function NewPoDialog({ onClose }: { onClose: () => void }) {
  const { data: vendors = [] } = useVendors()
  const { data: warehouses = [] } = useWarehouses()
  const create = useCreatePurchaseOrder()
  const { showError, showSuccess } = useAppToast()

  const [vendorId, setVendorId] = useState<string>('new')
  const [vendorName, setVendorName] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [expected, setExpected] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [note, setNote] = useState('')
  const [lines, setLines] = useState<Line[]>([newLine()])

  const filled = lines.filter((l) => l.product && l.quantity > 0)
  const vendorOk = vendorId !== 'new' || vendorName.trim().length > 1
  const update = (key: string, patch: Partial<Line>) =>
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const submit = async () => {
    try {
      const detail = await create.mutateAsync({
        po_number: poNumber.trim() || null,
        vendor_id: vendorId === 'new' ? null : vendorId,
        vendor_name: vendorId === 'new' ? vendorName.trim() : null,
        warehouse_id: warehouseId || null,
        expected_date: expected || null,
        note: note.trim() || null,
        lines: filled.map((l) => ({
          product_id: l.product!.id,
          quantity: l.quantity,
          ...(l.unitCost ? { unit_cost: Number(l.unitCost) } : {}),
        })),
      })
      showSuccess(
        `${detail.po.po_number} raised`,
        `${filled.length} lines for ${detail.vendor.name}.`,
      )
      onClose()
    } catch (e) {
      showError(e, 'Could not create the purchase order')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>
            Trucks are received against these lines; partial deliveries and several GRNs per PO are
            fine.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Vendor" htmlFor="vendor" required>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="vendor">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">＋ New vendor…</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {vendorId === 'new' ? (
            <Field label="Vendor name" htmlFor="vendor-name" required>
              <Input
                id="vendor-name"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                placeholder="Acme Supplies Ltd"
              />
            </Field>
          ) : (
            <Field label="Warehouse" htmlFor="wh">
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger id="wh">
                  <SelectValue
                    placeholder={warehouses[0] ? `${warehouses[0].code} (default)` : 'Default'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.code} · {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          <Field label="Expected delivery" htmlFor="expected">
            <Input
              id="expected"
              type="date"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </Field>
          <Field label="PO number" htmlFor="po-number" hint="Blank generates PO-YYYY-#####.">
            <Input
              id="po-number"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value.toUpperCase())}
              className="font-mono"
              placeholder="PO-2026-00042"
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="label-small">Lines</p>
          {lines.map((l) => (
            <div key={l.key} className="flex flex-wrap items-end gap-2">
              <div className="min-w-56 flex-1">
                <ProductPicker value={l.product} onSelect={(p) => update(l.key, { product: p })} />
              </div>
              <div className="w-24">
                <label htmlFor={`q-${l.key}`} className="label-small">
                  Qty
                </label>
                <Input
                  id={`q-${l.key}`}
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) =>
                    update(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="tabular text-center"
                />
              </div>
              <div className="w-28">
                <label htmlFor={`c-${l.key}`} className="label-small">
                  Unit cost
                </label>
                <Input
                  id={`c-${l.key}`}
                  type="number"
                  min={0}
                  step="0.01"
                  value={l.unitCost}
                  onChange={(e) => update(l.key, { unitCost: e.target.value })}
                  placeholder="product"
                  className="tabular"
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))}
                disabled={lines.length === 1}
                aria-label="Remove line"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setLines((p) => [...p, newLine()])}>
            <Plus className="size-3.5" />
            Add line
          </Button>
        </div>

        <Field label="Note" htmlFor="po-note">
          <Textarea id="po-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-info text-info-foreground hover:bg-info/90"
            disabled={!vendorOk || filled.length === 0}
            loading={create.isPending}
            onClick={() => void submit()}
          >
            <ClipboardList />
            Raise PO ({filled.length} {filled.length === 1 ? 'line' : 'lines'})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PoDetailDialog({ poId, onClose }: { poId: string; onClose: () => void }) {
  const { data, isLoading } = usePurchaseOrder(poId)
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        {isLoading || !data ? (
          <SkeletonRows rows={5} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">{data.po.po_number}</DialogTitle>
              <DialogDescription>
                {data.vendor.name} · {data.warehouse.name}
                {data.po.expected_date
                  ? ` · expected ${formatDate(data.po.expected_date)}`
                  : ''} · <PoStatusChip status={data.po.status} />
              </DialogDescription>
            </DialogHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Ordered</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right text-success">Accepted</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-mono text-small">{l.sku}</span>
                      <span className="block max-w-56 truncate text-small text-muted-foreground">
                        {l.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular">{l.ordered_qty}</TableCell>
                    <TableCell className="text-right tabular">{l.received_qty}</TableCell>
                    <TableCell className="text-right tabular text-success">
                      {l.accepted_qty}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular',
                        l.remaining_qty > 0 ? 'text-warning' : 'text-muted-foreground',
                      )}
                    >
                      {l.remaining_qty}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div>
              <p className="label-small mb-1">Deliveries</p>
              {data.grns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No truck has arrived against this order yet.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {data.grns.map((g) => (
                    <li
                      key={g.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <Link
                        to={`/grn/${g.id}`}
                        className="font-mono underline-offset-2 hover:underline"
                      >
                        {g.grn_number}
                      </Link>
                      <span className="text-muted-foreground">
                        {g.vehicle_number} · {formatDateTime(g.arrived_at)}
                      </span>
                      <GrnStatusChip status={g.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              {(data.po.status === 'open' || data.po.status === 'partially_received') && (
                <Button asChild className="bg-info text-info-foreground hover:bg-info/90">
                  <Link to={`/grn/new?po=${data.po.id}`}>
                    <Truck />
                    Receive truck
                  </Link>
                </Button>
              )}
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
