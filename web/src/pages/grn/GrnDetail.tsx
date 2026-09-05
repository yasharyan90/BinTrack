import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  Ban,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Truck,
  Upload,
  UserCheck,
  Warehouse,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { LocationBadge } from '@/components/stock/LocationBadge'
import { BinPicker } from '@/components/stock/BinPicker'
import { CameraView } from '@/components/scanner/CameraView'
import { GrnStatusChip, GrnStepper, PoStatusChip, SealChip } from '@/components/grn/GrnStatus'
import {
  getGrnDocumentUrl,
  useCancelGrn,
  useGrn,
  usePutawayGrnLine,
  useRecordGrnLine,
  useResolveGrnDiscrepancy,
  useUploadGrnDocument,
  useVerifyGrn,
} from '@/hooks/useGrn'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { feedback, listenForHidScanner } from '@/lib/scanner'
import { addDaysIso, cn, formatDateTime, formatNumber, relativeTime, todayIso } from '@/lib/utils'
import type { Bin, GrnDetail as GrnDetailType, GrnEvent, GrnLine } from '@/types/app'
import type { GrnDocumentKind } from '@/types/database'

const EVENT_META: Record<string, { label: string; dot: string }> = {
  arrived: { label: 'Truck arrived', dot: 'bg-info' },
  seal_issue: { label: 'Seal problem', dot: 'bg-destructive' },
  line_counted: { label: 'SKU counted', dot: 'bg-warning' },
  wrong_sku_blocked: { label: 'Wrong SKU blocked', dot: 'bg-destructive' },
  verified: { label: 'GRN verified', dot: 'bg-reserved' },
  put_away: { label: 'Put away', dot: 'bg-success' },
  completed: { label: 'Completed', dot: 'bg-success' },
  discrepancy_resolved: { label: 'Discrepancy resolved', dot: 'bg-success' },
  cancelled: { label: 'Cancelled', dot: 'bg-muted-foreground' },
  document_added: { label: 'Document attached', dot: 'bg-info' },
}

const DOC_KINDS: { kind: GrnDocumentKind; label: string; hint: string }[] = [
  { kind: 'challan', label: 'Delivery challan', hint: 'The vendor’s dispatch note.' },
  { kind: 'invoice', label: 'Invoice', hint: 'Tax invoice for this delivery.' },
  { kind: 'seal_photo', label: 'Seal photo', hint: 'Required when the seal is broken or missing.' },
  {
    kind: 'damage_photo',
    label: 'Damage photo',
    hint: 'Required when units are damaged or rejected.',
  },
]

function eventSummary(e: GrnEvent): string {
  const d = e.detail as Record<string, string | number | null | undefined>
  switch (e.event) {
    case 'arrived':
      return `${d.vehicle_number} · ${d.driver_name} · seal ${d.seal_status}`
    case 'seal_issue':
      return `Seal ${d.seal_status}${d.seal_number ? ` (${d.seal_number})` : ''}`
    case 'line_counted':
      return `${d.sku}: received ${d.received}, accepted ${d.accepted}, damaged ${d.damaged}, rejected ${d.rejected}${Number(d.short) > 0 ? `, short ${d.short}` : ''}${Number(d.excess) > 0 ? `, excess ${d.excess}` : ''}`
    case 'wrong_sku_blocked':
      return `${d.code}${d.sku ? ` (${d.sku})` : ''} — ${d.reason === 'not_on_po' ? 'not on this purchase order' : 'unknown product'}`
    case 'verified':
      return `${d.short_units} short · ${d.excess_units} excess · ${d.damaged_units} damaged · ${d.rejected_units} rejected`
    case 'put_away':
      return `${d.quantity} × ${d.sku} → ${d.location_code}`
    case 'completed':
      return `${d.accepted_units} accepted units in bins`
    case 'discrepancy_resolved':
      return String(d.note ?? '')
    case 'cancelled':
      return String(d.reason ?? '')
    case 'document_added':
      return `${d.kind}: ${d.file_name ?? ''}`
    default:
      return ''
  }
}

/** One receipt, end to end: who, what, how many, where — and what went wrong. */
export default function GrnDetail() {
  const { grnId } = useParams<{ grnId: string }>()
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  const { data, isLoading } = useGrn(grnId)
  const verify = useVerifyGrn()
  const resolve = useResolveGrnDiscrepancy()
  const cancel = useCancelGrn()
  const { showError, showSuccess } = useAppToast()

  const [countLine, setCountLine] = useState<GrnLine | null>(null)
  const [putawayLine, setPutawayLine] = useState<GrnLine | null>(null)
  const [resolveOpen, setResolveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [note, setNote] = useState('')

  useRealtime(`grn:${grnId}`, ['grns', 'grn_lines'], {
    filter: { grns: `id=eq.${grnId}`, grn_lines: `grn_id=eq.${grnId}` },
  })

  if (isLoading) return <SkeletonRows rows={8} />
  if (!data) {
    return (
      <EmptyState
        icon={Truck}
        title="GRN not found"
        action={
          <Button asChild>
            <Link to="/grn">Back to receipts</Link>
          </Button>
        }
      />
    )
  }

  const { grn, po, vendor, warehouse, lines, documents, events } = data
  const counting = grn.status === 'arrived' || grn.status === 'verifying'
  const puttingAway = grn.status === 'verified' || grn.status === 'put_away'
  const totals = lines.reduce(
    (t, l) => ({
      ordered: t.ordered + l.ordered_qty,
      received: t.received + l.received_qty,
      accepted: t.accepted + l.accepted_qty,
      damaged: t.damaged + l.damaged_qty,
      rejected: t.rejected + l.rejected_qty,
      short: t.short + l.short_qty,
      excess: t.excess + l.excess_qty,
      putAway: t.putAway + l.put_away_qty,
    }),
    {
      ordered: 0,
      received: 0,
      accepted: 0,
      damaged: 0,
      rejected: 0,
      short: 0,
      excess: 0,
      putAway: 0,
    },
  )
  const needsDamagePhoto =
    totals.damaged + totals.rejected > 0 && !documents.some((d) => d.kind === 'damage_photo')
  const needsSealPhoto =
    grn.seal_status !== 'intact' && !documents.some((d) => d.kind === 'seal_photo')
  const openDiscrepancy = grn.has_discrepancy && !grn.discrepancy_resolved_at

  return (
    <>
      <PageHeader
        title={grn.grn_number}
        description={`${po.po_number} · ${vendor.name} · ${warehouse.name}`}
        actions={
          <>
            <GrnStatusChip status={grn.status} className="text-sm" />
            {counting && (
              <Button
                className="bg-reserved text-reserved-foreground hover:bg-reserved/90"
                disabled={totals.received === 0}
                loading={verify.isPending}
                onClick={() =>
                  verify.mutate(grn.id, {
                    onSuccess: (d) =>
                      showSuccess(
                        `${d.grn.grn_number} verified`,
                        d.grn.has_discrepancy
                          ? 'A discrepancy was raised for admins.'
                          : 'No discrepancies. Ready for put-away.',
                      ),
                    onError: (e) => showError(e, 'Could not verify'),
                  })
                }
              >
                <ClipboardCheck />
                Verify & issue GRN
              </Button>
            )}
            {isAdmin && openDiscrepancy && (
              <Button variant="secondary" onClick={() => setResolveOpen(true)}>
                <CheckCircle2 />
                Resolve discrepancy
              </Button>
            )}
            {isAdmin &&
              !['completed', 'cancelled'].includes(grn.status) &&
              totals.putAway === 0 && (
                <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                  <Ban />
                  Cancel
                </Button>
              )}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4 pt-4">
          <GrnStepper status={grn.status} />
        </CardContent>
      </Card>

      {grn.has_discrepancy && (
        <div
          className={cn(
            'mb-4 rounded-lg border p-4',
            openDiscrepancy
              ? 'border-destructive/40 bg-destructive/10'
              : 'border-success/40 bg-success/10',
          )}
          role="status"
        >
          <p className="flex items-center gap-2 font-medium">
            {openDiscrepancy ? (
              <AlertTriangle className="size-4 text-destructive" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 text-success" aria-hidden />
            )}
            {openDiscrepancy
              ? 'Discrepancy — needs an admin decision'
              : `Discrepancy resolved by ${grn.resolved_by_name ?? 'an admin'}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-small">
            {grn.seal_status !== 'intact' && <SealChip status={grn.seal_status} />}
            {(grn.discrepancy_summary.short_units ?? 0) > 0 && (
              <Pill tone="rose">{grn.discrepancy_summary.short_units} short</Pill>
            )}
            {(grn.discrepancy_summary.excess_units ?? 0) > 0 && (
              <Pill tone="indigo">{grn.discrepancy_summary.excess_units} excess</Pill>
            )}
            {(grn.discrepancy_summary.damaged_units ?? 0) > 0 && (
              <Pill tone="amber">{grn.discrepancy_summary.damaged_units} damaged</Pill>
            )}
            {(grn.discrepancy_summary.rejected_units ?? 0) > 0 && (
              <Pill tone="rose">{grn.discrepancy_summary.rejected_units} rejected</Pill>
            )}
          </div>
          {grn.discrepancy_note && (
            <p className="mt-2 text-sm text-muted-foreground">“{grn.discrepancy_note}”</p>
          )}
        </div>
      )}

      {/* Who, what truck, which seal, which staff --------------------------- */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoCard tone="sky" icon={ClipboardList} title="Purchase order">
          <Row
            k="PO"
            v={
              <Link
                to="/admin/purchase-orders"
                className="font-mono underline-offset-2 hover:underline"
              >
                {po.po_number}
              </Link>
            }
          />
          <Row k="Vendor" v={vendor.name} />
          <Row k="Status" v={<PoStatusChip status={po.status} />} />
          <Row k="Warehouse" v={`${warehouse.code} · ${warehouse.name}`} />
        </InfoCard>
        <InfoCard tone="amber" icon={Truck} title="Vehicle & driver">
          <Row k="Vehicle" v={<span className="font-mono">{grn.vehicle_number}</span>} />
          <Row k="Driver" v={grn.driver_name} />
          <Row k="Driver ID" v={grn.driver_id ?? '—'} />
          <Row k="Gate entry" v={grn.gate_entry_no ?? '—'} />
          <Row k="Arrived" v={formatDateTime(grn.arrived_at)} />
        </InfoCard>
        <InfoCard tone="violet" icon={ShieldCheck} title="Shipment">
          <Row k="Seal" v={<SealChip status={grn.seal_status} />} />
          <Row k="Seal no." v={grn.seal_number ?? '—'} />
          <Row k="Challan" v={grn.challan_number ?? '—'} />
          <Row k="Invoice" v={grn.invoice_number ?? '—'} />
          <Row k="Shipment ID" v={grn.shipment_id ?? '—'} />
        </InfoCard>
        <InfoCard tone="emerald" icon={UserCheck} title="Receiving staff">
          <Row k="Received by" v={grn.received_by_name ?? '—'} />
          <Row k="At" v={formatDateTime(grn.received_at)} />
          <Row k="Verified by" v={grn.verified_by_name ?? '—'} />
          <Row k="Verified at" v={grn.verified_at ? formatDateTime(grn.verified_at) : '—'} />
          <Row k="Completed" v={grn.completed_at ? formatDateTime(grn.completed_at) : '—'} />
        </InfoCard>
      </div>

      {counting && <ScanBox lines={lines} grnId={grn.id} onLine={setCountLine} />}

      {/* Product verification ----------------------------------------------- */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="text-h3">Products</h2>
            <p className="text-small text-muted-foreground">
              {counting
                ? 'Count each line — scan a barcode or use Count.'
                : puttingAway
                  ? 'Put accepted stock into bins. Damaged and rejected units stay out.'
                  : `${formatNumber(totals.putAway)} of ${formatNumber(totals.accepted)} accepted units in bins.`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Prev.</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right text-success">Accepted</TableHead>
                <TableHead className="text-right text-warning">Damaged</TableHead>
                <TableHead className="text-right text-destructive">Rejected</TableHead>
                <TableHead className="text-right">Short / Excess</TableHead>
                <TableHead className="text-right text-success">Put away</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <LineRow
                  key={l.id}
                  line={l}
                  counting={counting}
                  puttingAway={puttingAway}
                  onCount={() => setCountLine(l)}
                  onPutaway={() => setPutawayLine(l)}
                />
              ))}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular">{formatNumber(totals.ordered)}</TableCell>
                <TableCell />
                <TableCell className="text-right tabular">
                  {formatNumber(totals.received)}
                </TableCell>
                <TableCell className="text-right tabular text-success">
                  {formatNumber(totals.accepted)}
                </TableCell>
                <TableCell className="text-right tabular text-warning">
                  {formatNumber(totals.damaged)}
                </TableCell>
                <TableCell className="text-right tabular text-destructive">
                  {formatNumber(totals.rejected)}
                </TableCell>
                <TableCell className="text-right tabular">
                  {totals.short > 0 && <span className="text-destructive">−{totals.short}</span>}
                  {totals.short > 0 && totals.excess > 0 && ' / '}
                  {totals.excess > 0 && <span className="text-info">+{totals.excess}</span>}
                  {totals.short === 0 && totals.excess === 0 && '—'}
                </TableCell>
                <TableCell className="text-right tabular text-success">
                  {formatNumber(totals.putAway)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Evidence ----------------------------------------------------------- */}
        <Card>
          <CardContent className="space-y-3 p-4 pt-4">
            <h2 className="flex items-center gap-2 text-h3">
              <FileText className="size-4 text-info" aria-hidden />
              Evidence
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {DOC_KINDS.map((k) => (
                <DocumentSlot
                  key={k.kind}
                  grnId={grn.id}
                  kind={k.kind}
                  label={k.label}
                  hint={k.hint}
                  required={
                    (k.kind === 'damage_photo' && needsDamagePhoto) ||
                    (k.kind === 'seal_photo' && needsSealPhoto)
                  }
                  documents={documents.filter((d) => d.kind === k.kind)}
                  disabled={grn.status === 'cancelled'}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Timeline ------------------------------------------------------------ */}
        <Card>
          <CardContent className="p-4 pt-4">
            <h2 className="mb-3 text-h3">Timeline</h2>
            <ol className="space-y-3">
              {events.map((e) => {
                const meta = EVENT_META[e.event] ?? { label: e.event, dot: 'bg-muted-foreground' }
                return (
                  <li key={e.id} className="flex gap-3">
                    <span
                      className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', meta.dot)}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium">{meta.label}</span>
                        <span className="text-small text-muted-foreground">
                          {e.actor_name} · {relativeTime(e.created_at)}
                        </span>
                      </p>
                      <p className="text-small text-muted-foreground">{eventSummary(e)}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>
      </div>

      {countLine && (
        <CountDialog grnId={grn.id} line={countLine} onClose={() => setCountLine(null)} />
      )}
      {putawayLine && (
        <PutawayDialog
          line={putawayLine}
          warehouseName={warehouse.name}
          onClose={() => setPutawayLine(null)}
        />
      )}

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve the discrepancy</DialogTitle>
            <DialogDescription>
              Record what was agreed with the vendor. This clears the alert and stays on the
              timeline.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Vendor credited 2 units; seal photographed and reported."
            aria-label="Resolution note"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setResolveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={note.trim().length < 3}
              loading={resolve.isPending}
              onClick={() =>
                resolve.mutate(
                  { grnId: grn.id, note: note.trim() },
                  {
                    onSuccess: () => {
                      showSuccess('Discrepancy resolved')
                      setResolveOpen(false)
                      setNote('')
                    },
                    onError: (e) => showError(e, 'Could not resolve'),
                  },
                )
              }
            >
              <Check />
              Mark resolved
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {grn.grn_number}?</DialogTitle>
            <DialogDescription>
              Nothing has been put away, so no stock is affected. Quantities counted against the PO
              are handed back.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason"
            aria-label="Cancellation reason"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(
                  { grnId: grn.id, reason: note.trim() || 'Cancelled by admin' },
                  {
                    onSuccess: () => {
                      showSuccess('GRN cancelled')
                      setCancelOpen(false)
                      setNote('')
                    },
                    onError: (e) => showError(e, 'Could not cancel'),
                  },
                )
              }
            >
              Cancel the GRN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------
const PILL: Record<string, string> = {
  rose: 'bg-destructive/15 text-destructive',
  amber: 'bg-warning/15 text-warning',
  indigo: 'bg-info/15 text-info',
  emerald: 'bg-success/15 text-success',
  teal: 'bg-success/15 text-success',
}
function Pill({ tone, children }: { tone: keyof typeof PILL; children: React.ReactNode }) {
  return <span className={cn('rounded-full px-2 py-0.5 font-medium', PILL[tone])}>{children}</span>
}

const CARD_TONE: Record<string, { border: string; icon: string }> = {
  sky: { border: 'border-l-info', icon: 'bg-info text-info-foreground' },
  amber: { border: 'border-l-warning', icon: 'bg-warning text-warning-foreground' },
  violet: { border: 'border-l-reserved', icon: 'bg-reserved text-reserved-foreground' },
  emerald: { border: 'border-l-success', icon: 'bg-success text-success-foreground' },
}
function InfoCard({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof CARD_TONE
  icon: typeof Truck
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className={cn('border-l-4', CARD_TONE[tone].border)}>
      <CardContent className="space-y-2 p-3 pt-3">
        <p className="flex items-center gap-2 text-h3">
          <span
            className={cn('flex size-6 items-center justify-center rounded', CARD_TONE[tone].icon)}
          >
            <Icon className="size-3.5" aria-hidden />
          </span>
          {title}
        </p>
        <dl className="space-y-1 text-sm">{children}</dl>
      </CardContent>
    </Card>
  )
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 truncate text-right">{v}</dd>
    </div>
  )
}

function LineRow({
  line: l,
  counting,
  puttingAway,
  onCount,
  onPutaway,
}: {
  line: GrnLine
  counting: boolean
  puttingAway: boolean
  onCount: () => void
  onPutaway: () => void
}) {
  const counted = l.counted_at !== null
  return (
    <>
      <TableRow className={cn(counting && !counted && 'bg-warning/5')}>
        <TableCell>
          <Link
            to={`/products/${l.product_id}`}
            className="block font-mono text-small underline-offset-2 hover:underline"
          >
            {l.sku}
          </Link>
          <span className="block max-w-56 truncate text-small text-muted-foreground">
            {l.name}
            {l.lot_number ? ` · lot ${l.lot_number}` : ''}
            {l.expiry_date ? ` · exp ${l.expiry_date}` : ''}
          </span>
        </TableCell>
        <TableCell className="text-right tabular">{l.ordered_qty}</TableCell>
        <TableCell className="text-right tabular text-muted-foreground">
          {l.previously_received_qty}
        </TableCell>
        <TableCell className="text-right tabular font-medium">
          {counted ? l.received_qty : <span className="text-muted-foreground">—</span>}
        </TableCell>
        <TableCell className="text-right tabular text-success">
          {counted ? l.accepted_qty : '—'}
        </TableCell>
        <TableCell className="text-right tabular text-warning">
          {counted ? l.damaged_qty : '—'}
        </TableCell>
        <TableCell className="text-right tabular text-destructive">
          {counted ? l.rejected_qty : '—'}
        </TableCell>
        <TableCell className="text-right tabular">
          {counted && l.short_qty > 0 && <Pill tone="rose">−{l.short_qty}</Pill>}
          {counted && l.excess_qty > 0 && <Pill tone="indigo">+{l.excess_qty}</Pill>}
          {counted && l.short_qty === 0 && l.excess_qty === 0 && <Pill tone="emerald">exact</Pill>}
        </TableCell>
        <TableCell className="text-right tabular text-success">
          {l.put_away_qty}/{l.accepted_qty}
        </TableCell>
        <TableCell>
          {counting && (
            <Button
              size="sm"
              variant={counted ? 'ghost' : 'primary'}
              className={cn(!counted && 'bg-warning text-warning-foreground hover:bg-warning/90')}
              onClick={onCount}
            >
              <ClipboardCheck className="size-3.5" />
              {counted ? 'Recount' : 'Count'}
            </Button>
          )}
          {puttingAway && l.remaining_to_put_away > 0 && (
            <Button
              size="sm"
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={onPutaway}
            >
              <Warehouse className="size-3.5" />
              Put away
            </Button>
          )}
          {puttingAway && l.accepted_qty > 0 && l.remaining_to_put_away === 0 && (
            <span className="inline-flex items-center gap-1 text-small text-success">
              <Check className="size-3.5" aria-hidden />
              in bins
            </span>
          )}
        </TableCell>
      </TableRow>
      {l.putaways.length > 0 && (
        <TableRow className="bg-success/5">
          <TableCell colSpan={10} className="py-1.5 text-small">
            <span className="mr-2 text-muted-foreground">Put-away:</span>
            {l.putaways.map((p) => (
              <span key={p.id} className="mr-3 inline-flex items-center gap-1">
                <span className="tabular font-medium">{p.quantity}</span> → {p.row_code} →{' '}
                <LocationBadge code={p.location_code} binId={p.bin_id} />
                <span className="text-muted-foreground">{p.performed_by_name ?? ''}</span>
              </span>
            ))}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}

/** Barcode/SKU entry for verification. A known line opens its count; an
 *  unknown or off-PO code is sent to the server so the block is on record. */
function ScanBox({
  lines,
  grnId,
  onLine,
}: {
  lines: GrnLine[]
  grnId: string
  onLine: (l: GrnLine) => void
}) {
  const [code, setCode] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [blocked, setBlocked] = useState<{
    code: string
    sku?: string
    name?: string
    reason: string
  } | null>(null)
  const record = useRecordGrnLine()
  const { showError } = useAppToast()

  const handle = useCallback(
    async (raw: string) => {
      const value = raw.trim()
      if (!value) return
      const match = lines.find((l) => l.barcode === value || l.sku === value.toUpperCase())
      setCode('')
      setCameraOpen(false)
      if (match) {
        feedback('success')
        setBlocked(null)
        onLine(match)
        return
      }
      try {
        // Zero quantities: the server logs the block without touching any line.
        const result = await record.mutateAsync({
          grnId,
          code: value,
          received: 0,
          accepted: 0,
          damaged: 0,
          rejected: 0,
        })
        feedback('error')
        if (!result.ok)
          setBlocked({ code: value, sku: result.sku, name: result.name, reason: result.reason })
      } catch (e) {
        showError(e, 'Scan failed')
      }
    },
    [grnId, lines, onLine, record, showError],
  )

  useEffect(() => listenForHidScanner((c) => void handle(c)), [handle])

  return (
    <Card className="mb-4 border-warning/40 bg-warning/5">
      <CardContent className="space-y-3 p-4 pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-64 flex-1">
            <label htmlFor="grn-scan" className="label-small">
              Scan or type a barcode / SKU
            </label>
            <div className="relative">
              <ScanLine
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="grn-scan"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handle(code)
                }}
                className="pl-9 font-mono"
                placeholder="8900000000426 or MUG-0042"
                autoComplete="off"
              />
            </div>
          </div>
          <Button variant="secondary" onClick={() => setCameraOpen(true)}>
            <Camera />
            Camera
          </Button>
          <Button
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={() => void handle(code)}
            disabled={!code.trim()}
          >
            Look up
          </Button>
        </div>
        {blocked && (
          <p
            className="flex items-start gap-2 rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <strong>Wrong SKU blocked:</strong> <span className="font-mono">{blocked.code}</span>
              {blocked.sku
                ? ` is ${blocked.sku} — ${blocked.name} — which is not on this purchase order.`
                : ' is not a known product.'}{' '}
              It has been logged on the timeline and cannot be received here.
            </span>
          </p>
        )}
        <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Scan a product</DialogTitle>
            </DialogHeader>
            <CameraView onDecode={(c) => void handle(c)} hint="Point at the product barcode" />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

function CountDialog({
  grnId,
  line,
  onClose,
}: {
  grnId: string
  line: GrnLine
  onClose: () => void
}) {
  const record = useRecordGrnLine()
  const { showError, showSuccess } = useAppToast()
  const remaining = Math.max(line.ordered_qty - line.previously_received_qty, 0)
  const [received, setReceived] = useState(line.counted_at ? line.received_qty : remaining)
  const [damaged, setDamaged] = useState(line.damaged_qty)
  const [rejected, setRejected] = useState(line.rejected_qty)
  const [lot, setLot] = useState(line.lot_number ?? '')
  const [expiry, setExpiry] = useState(
    line.expiry_date ??
      (line.is_perishable && line.shelf_life_days ? addDaysIso(line.shelf_life_days) : ''),
  )
  const [damageNote, setDamageNote] = useState(line.damage_note ?? '')

  const accepted = Math.max(received - damaged - rejected, 0)
  const short = Math.max(remaining - received, 0)
  const excess = Math.max(received - remaining, 0)
  const needsNote = damaged + rejected > 0 && damageNote.trim().length === 0
  const needsExpiry = line.is_perishable && accepted > 0 && !expiry
  const valid = received >= 0 && damaged + rejected <= received && !needsNote && !needsExpiry

  const submit = async () => {
    try {
      const result = await record.mutateAsync({
        grnId,
        code: line.sku,
        received,
        accepted,
        damaged,
        rejected,
        lotNumber: lot || null,
        expiryDate: expiry || null,
        damageNote: damageNote || null,
      })
      if (!result.ok) {
        showError(`WRONG_SKU:${result.code}`, 'Blocked')
        return
      }
      showSuccess(
        `${line.sku}: ${accepted} accepted`,
        short > 0 ? `${short} short` : excess > 0 ? `${excess} over the order` : 'exact',
      )
      onClose()
    } catch (e) {
      showError(e, 'Could not save the count')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Count {line.sku}</DialogTitle>
          <DialogDescription>
            {line.name} · ordered {line.ordered_qty}
            {line.previously_received_qty > 0
              ? `, ${line.previously_received_qty} received earlier`
              : ''}{' '}
            · {remaining} expected on this truck
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Received" htmlFor="received" required hint="Everything off the truck.">
            <Input
              id="received"
              type="number"
              inputMode="numeric"
              min={0}
              value={received}
              onChange={(e) => setReceived(Math.max(0, Number(e.target.value) || 0))}
              className="tabular text-lg"
              autoFocus
            />
          </Field>
          <Field label="Damaged" htmlFor="damaged">
            <Input
              id="damaged"
              type="number"
              inputMode="numeric"
              min={0}
              value={damaged}
              onChange={(e) => setDamaged(Math.max(0, Number(e.target.value) || 0))}
              className="tabular text-warning"
            />
          </Field>
          <Field label="Rejected" htmlFor="rejected">
            <Input
              id="rejected"
              type="number"
              inputMode="numeric"
              min={0}
              value={rejected}
              onChange={(e) => setRejected(Math.max(0, Number(e.target.value) || 0))}
              className="tabular text-destructive"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center">
          <div>
            <p className="label-small">Accepted</p>
            <p className="kpi-value text-success">{accepted}</p>
          </div>
          <div>
            <p className="label-small">Short</p>
            <p
              className={cn('kpi-value', short > 0 ? 'text-destructive' : 'text-muted-foreground')}
            >
              {short}
            </p>
          </div>
          <div>
            <p className="label-small">Excess</p>
            <p className={cn('kpi-value', excess > 0 ? 'text-info' : 'text-muted-foreground')}>
              {excess}
            </p>
          </div>
        </div>
        {damaged + rejected > received && (
          <p className="text-sm text-destructive">Damaged + rejected cannot exceed received.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lot number" htmlFor="lot">
            <Input
              id="lot"
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="font-mono"
              placeholder="L2409"
            />
          </Field>
          <Field
            label="Expiry date"
            htmlFor="expiry"
            required={line.is_perishable}
            error={needsExpiry ? 'Perishable — expiry is required to accept.' : undefined}
          >
            <Input
              id="expiry"
              type="date"
              min={todayIso()}
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </Field>
        </div>
        {damaged + rejected > 0 && (
          <Field
            label="Damage / rejection note"
            htmlFor="damage-note"
            required
            error={needsNote ? 'Say what was wrong — it goes on the record.' : undefined}
          >
            <Textarea
              id="damage-note"
              rows={2}
              value={damageNote}
              onChange={(e) => setDamageNote(e.target.value)}
              placeholder="Two cartons crushed on the pallet corner"
            />
          </Field>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            disabled={!valid}
            loading={record.isPending}
            onClick={() => void submit()}
          >
            <Check />
            Save count
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PutawayDialog({
  line,
  warehouseName,
  onClose,
}: {
  line: GrnLine
  warehouseName: string
  onClose: () => void
}) {
  const putaway = usePutawayGrnLine()
  const { showError, showSuccess } = useAppToast()
  const [bin, setBin] = useState<Bin | null>(null)
  const [qty, setQty] = useState(line.remaining_to_put_away)
  const valid = !!bin && qty > 0 && qty <= line.remaining_to_put_away

  const submit = async () => {
    if (!bin) return
    try {
      const d = await putaway.mutateAsync({ lineId: line.id, binId: bin.id, quantity: qty })
      showSuccess(
        `${qty} × ${line.sku} → ${bin.location_code}`,
        d.grn.status === 'completed'
          ? `${d.grn.grn_number} is complete — inventory updated.`
          : 'Inventory updated.',
      )
      onClose()
    } catch (e) {
      showError(e, 'Put-away failed')
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put away {line.sku}</DialogTitle>
          <DialogDescription>
            {line.remaining_to_put_away} accepted units still to place. Damaged and rejected units
            are excluded.
          </DialogDescription>
        </DialogHeader>
        <Field
          label="Quantity"
          htmlFor="pa-qty"
          required
          error={
            qty > line.remaining_to_put_away
              ? `Only ${line.remaining_to_put_away} left to put away.`
              : undefined
          }
        >
          <Input
            id="pa-qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={line.remaining_to_put_away}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="tabular text-lg"
          />
        </Field>
        <Field label="Destination bin" required>
          <BinPicker value={bin} onSelect={setBin} productId={line.product_id} />
        </Field>
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm">
          <span className="tabular font-medium">{qty}</span> accepted → {warehouseName}
          {bin ? (
            <>
              {' '}
              → row {bin.location_code.split('-')[1]} → <LocationBadge code={bin.location_code} />
            </>
          ) : (
            ' → choose a bin'
          )}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="bg-success text-success-foreground hover:bg-success/90"
            disabled={!valid}
            loading={putaway.isPending}
            onClick={() => void submit()}
          >
            <PackageCheck />
            Put away
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentSlot({
  grnId,
  kind,
  label,
  hint,
  required,
  documents,
  disabled,
}: {
  grnId: string
  kind: GrnDocumentKind
  label: string
  hint: string
  required: boolean
  documents: GrnDetailType['documents']
  disabled: boolean
}) {
  const upload = useUploadGrnDocument()
  const { showError, showSuccess } = useAppToast()
  const isPhoto = kind === 'seal_photo' || kind === 'damage_photo'

  const open = async (path: string) => {
    try {
      window.open(await getGrnDocumentUrl(path), '_blank', 'noopener')
    } catch (e) {
      showError(e, 'Could not open the document')
    }
  }

  return (
    <div
      className={cn(
        'space-y-2 rounded-lg border p-3',
        required ? 'border-destructive/50 bg-destructive/5' : 'border-border',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-small text-muted-foreground">{hint}</p>
        </div>
        {required && (
          <span className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-small font-medium text-destructive">
            needed
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 text-small">
            <span className="truncate">{d.file_name ?? d.storage_path}</span>
            <button
              type="button"
              onClick={() => void open(d.storage_path)}
              className="inline-flex shrink-0 items-center gap-1 text-info underline-offset-2 hover:underline "
            >
              <ExternalLink className="size-3" aria-hidden />
              Open
            </button>
          </li>
        ))}
      </ul>
      {!disabled && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-small text-info hover:underline ">
          <Upload className="size-3.5" aria-hidden />
          {upload.isPending
            ? 'Uploading…'
            : documents.length
              ? 'Add another'
              : isPhoto
                ? 'Take or choose a photo'
                : 'Upload'}
          <input
            type="file"
            className="sr-only"
            accept={isPhoto ? 'image/*' : 'image/*,application/pdf'}
            capture={isPhoto ? 'environment' : undefined}
            disabled={upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              upload.mutate(
                { grnId, kind, file: f },
                {
                  onSuccess: () => showSuccess(`${label} attached`),
                  onError: (err) => showError(err, 'Upload failed'),
                },
              )
            }}
          />
        </label>
      )}
    </div>
  )
}
