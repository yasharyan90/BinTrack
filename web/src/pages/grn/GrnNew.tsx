import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, FileText, ShieldAlert, ShieldCheck, ShieldOff, Truck, UserCheck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PoStatusChip } from '@/components/grn/GrnStatus'
import { useCreateGrn, usePurchaseOrder, usePurchaseOrders } from '@/hooks/useGrn'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { cn, formatDate, formatDateTime, formatNumber } from '@/lib/utils'
import type { SealStatus } from '@/types/database'

const SEALS: { value: SealStatus; label: string; hint: string; icon: typeof ShieldCheck; tone: string }[] = [
  { value: 'intact', label: 'Intact', hint: 'Number matches, no tampering.', icon: ShieldCheck,
    tone: 'data-[active=true]:border-emerald-500 data-[active=true]:bg-emerald-500/15 data-[active=true]:text-emerald-700 dark:data-[active=true]:text-emerald-300' },
  { value: 'broken', label: 'Broken', hint: 'Raises a discrepancy alert.', icon: ShieldAlert,
    tone: 'data-[active=true]:border-rose-500 data-[active=true]:bg-rose-500/15 data-[active=true]:text-rose-700 dark:data-[active=true]:text-rose-300' },
  { value: 'missing', label: 'Missing', hint: 'Raises a discrepancy alert.', icon: ShieldOff,
    tone: 'data-[active=true]:border-rose-500 data-[active=true]:bg-rose-500/15 data-[active=true]:text-rose-700 dark:data-[active=true]:text-rose-300' },
]

/** Section heading with its own colour, so the four steps of arrival read as steps. */
function Step({ n, title, icon: Icon, tone }: { n: number; title: string; icon: typeof Truck; tone: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('flex size-8 items-center justify-center rounded-md text-white', tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="label-small">Step {n}</p>
        <h2 className="text-h3">{title}</h2>
      </div>
    </div>
  )
}

/**
 * Truck arrival + shipment verification (GRN flow steps 1–4). The receiving
 * staff member is taken from the session, never typed; the PO's lines are
 * shown so the gate knows what to expect before a carton is opened.
 */
export default function GrnNew() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const profile = useAuth((s) => s.profile)
  const createGrn = useCreateGrn()
  const { showError, showSuccess, showWarning } = useAppToast()

  const [poId, setPoId] = useState(params.get('po') ?? '')
  const [form, setForm] = useState({
    vehicle_number: '', driver_name: '', driver_id: '', gate_entry_no: '',
    seal_number: '', seal_status: 'intact' as SealStatus,
    challan_number: '', invoice_number: '', shipment_id: '', note: '',
  })
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }))

  const { data: openPos = [], isLoading: posLoading } = usePurchaseOrders({ status: 'open' })
  const { data: po } = usePurchaseOrder(poId || undefined)

  useEffect(() => {
    if (!poId && openPos.length === 1) setPoId(openPos[0].id)
  }, [openPos, poId])

  const expected = useMemo(() => (po?.lines ?? []).reduce((s, l) => s + l.remaining_qty, 0), [po])
  const canSubmit = !!poId && form.vehicle_number.trim().length > 0 && form.driver_name.trim().length > 0

  const submit = async () => {
    if (!canSubmit) return
    try {
      const detail = await createGrn.mutateAsync({
        po_id: poId,
        vehicle_number: form.vehicle_number,
        driver_name: form.driver_name,
        driver_id: form.driver_id || undefined,
        gate_entry_no: form.gate_entry_no || undefined,
        seal_number: form.seal_number || undefined,
        seal_status: form.seal_status,
        challan_number: form.challan_number || undefined,
        invoice_number: form.invoice_number || undefined,
        shipment_id: form.shipment_id || undefined,
        note: form.note || undefined,
      })
      showSuccess(`${detail.grn.grn_number} opened`, 'Now count each SKU against the order.')
      if (form.seal_status !== 'intact') {
        showWarning('Seal discrepancy raised', 'Admins have been alerted. Photograph the seal before opening.')
      }
      navigate(`/grn/${detail.grn.id}`)
    } catch (error) {
      showError(error, 'Could not register the arrival')
    }
  }

  return (
    <>
      <PageHeader
        title="Register truck arrival"
        description="Link the truck to its purchase order, record the driver and check the seal."
        actions={
          <Button asChild variant="ghost">
            <Link to="/grn">Cancel</Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 1 · PO & vendor ------------------------------------------------ */}
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="space-y-4 p-4 pt-4">
              <Step n={1} title="Purchase order & vendor" icon={ClipboardList} tone="bg-sky-500" />
              <Field label="Purchase order" htmlFor="po" required hint={posLoading ? 'Loading open orders…' : undefined}>
                <Select value={poId} onValueChange={setPoId}>
                  <SelectTrigger id="po"><SelectValue placeholder="Choose an open purchase order" /></SelectTrigger>
                  <SelectContent>
                    {openPos.map((row) => (
                      <SelectItem key={row.id} value={row.id}>
                        {row.po_number} · {row.vendor?.name ?? 'vendor'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {po && (
                <div className="grid gap-3 rounded-lg bg-sky-500/10 p-3 sm:grid-cols-3">
                  <div>
                    <p className="label-small">Vendor</p>
                    <p className="font-medium">{po.vendor.name}</p>
                    <p className="text-small text-muted-foreground">{po.vendor.code}</p>
                  </div>
                  <div>
                    <p className="label-small">Warehouse</p>
                    <p className="font-medium">{po.warehouse.name}</p>
                    <p className="text-small text-muted-foreground">{po.warehouse.code}</p>
                  </div>
                  <div>
                    <p className="label-small">Expected</p>
                    <p className="font-medium">{formatNumber(expected)} units still due</p>
                    <p className="text-small text-muted-foreground">
                      {po.po.expected_date ? `by ${formatDate(po.po.expected_date)}` : 'no date set'} · <PoStatusChip status={po.po.status} />
                    </p>
                  </div>
                  <ul className="sm:col-span-3 divide-y divide-border rounded-md border border-border bg-card">
                    {po.lines.map((l) => (
                      <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
                        <span className="min-w-0 truncate"><span className="font-mono text-small">{l.sku}</span> · {l.name}</span>
                        <span className="shrink-0 tabular text-muted-foreground">
                          {l.received_qty}/{l.ordered_qty} received
                        </span>
                      </li>
                    ))}
                  </ul>
                  {po.grns.length > 0 && (
                    <p className="sm:col-span-3 text-small text-muted-foreground">
                      {po.grns.length} earlier {po.grns.length === 1 ? 'delivery' : 'deliveries'} against this order — partial receiving is fine.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 2 · Vehicle & driver --------------------------------------------- */}
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="space-y-4 p-4 pt-4">
              <Step n={2} title="Vehicle & driver" icon={Truck} tone="bg-amber-500" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Truck / vehicle number" htmlFor="vehicle" required>
                  <Input id="vehicle" value={form.vehicle_number} onChange={(e) => set('vehicle_number', e.target.value.toUpperCase())} placeholder="KA01AB1234" className="font-mono" />
                </Field>
                <Field label="Gate entry no." htmlFor="gate" hint="Optional.">
                  <Input id="gate" value={form.gate_entry_no} onChange={(e) => set('gate_entry_no', e.target.value)} placeholder="G-0042" />
                </Field>
                <Field label="Driver name" htmlFor="driver" required>
                  <Input id="driver" value={form.driver_name} onChange={(e) => set('driver_name', e.target.value)} placeholder="Ravi Kumar" />
                </Field>
                <Field label="Driver ID" htmlFor="driver-id" hint="Licence or ID number.">
                  <Input id="driver-id" value={form.driver_id} onChange={(e) => set('driver_id', e.target.value)} placeholder="DL-778" className="font-mono" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* 3 · Shipment verification ---------------------------------------- */}
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="space-y-4 p-4 pt-4">
              <Step n={3} title="Shipment verification" icon={FileText} tone="bg-violet-500" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Vendor seal number" htmlFor="seal">
                  <Input id="seal" value={form.seal_number} onChange={(e) => set('seal_number', e.target.value)} placeholder="SEAL-4471" className="font-mono" />
                </Field>
                <Field label="Seal status" required>
                  <div className="grid grid-cols-3 gap-1.5">
                    {SEALS.map(({ value, label, icon: Icon, tone }) => (
                      <button
                        key={value}
                        type="button"
                        data-active={form.seal_status === value}
                        onClick={() => set('seal_status', value)}
                        className={cn('flex flex-col items-center gap-1 rounded-md border border-border px-2 py-2 text-small transition-colors hover:bg-accent', tone)}
                        title={SEALS.find((s) => s.value === value)?.hint}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Delivery challan number" htmlFor="challan">
                  <Input id="challan" value={form.challan_number} onChange={(e) => set('challan_number', e.target.value)} placeholder="DC-1001" className="font-mono" />
                </Field>
                <Field label="Invoice number" htmlFor="invoice">
                  <Input id="invoice" value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} placeholder="INV-2026-88" className="font-mono" />
                </Field>
                <Field label="Shipment / package ID" htmlFor="shipment" hint="If the vendor provides one.">
                  <Input id="shipment" value={form.shipment_id} onChange={(e) => set('shipment_id', e.target.value)} className="font-mono" />
                </Field>
                <Field label="Note" htmlFor="note">
                  <Textarea id="note" rows={2} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder="Anything the receiving team should know" />
                </Field>
              </div>
              {form.seal_status !== 'intact' && (
                <p className="rounded-md bg-rose-500/12 px-3 py-2 text-sm text-rose-700 dark:text-rose-300" role="status">
                  A {form.seal_status} seal will be recorded as a discrepancy and admins alerted the moment you save. Photograph it on the next screen.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 4 · Receiving staff (automatic) ---------------------------------- */}
        <div className="space-y-4">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="space-y-3 p-4 pt-4">
              <Step n={4} title="Receiving staff" icon={UserCheck} tone="bg-emerald-500" />
              <dl className="space-y-2 rounded-lg bg-emerald-500/10 p-3 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{profile?.full_name ?? '—'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Staff ID</dt><dd className="font-mono text-small">{profile?.id.slice(0, 8)}…</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Date / time</dt><dd>{formatDateTime(new Date().toISOString())}</dd></div>
              </dl>
              <p className="text-small text-muted-foreground">Recorded from your session — it cannot be edited.</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <Button className="w-full bg-sky-600 text-white hover:bg-sky-600/90" size="lg" disabled={!canSubmit} loading={createGrn.isPending} onClick={() => void submit()}>
                <Truck />
                Open GRN & start counting
              </Button>
              <p className="text-small text-muted-foreground">
                A GRN number is generated now. Nothing enters inventory until the counts are verified and put away.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
