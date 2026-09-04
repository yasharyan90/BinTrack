import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, ChevronDown, ChevronRight, Plus, Printer, Rows3 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { LocationBadge } from '@/components/stock/LocationBadge'
import {
  useBinUtilisation,
  useBins,
  useCreateBinRange,
  useRows,
  useSaveBin,
  useSaveRow,
  useWarehouses,
} from '@/hooks/useLocations'
import { useAppToast } from '@/hooks/useAppToast'
import { cn, formatNumber } from '@/lib/utils'

/** Warehouse → row → bin, with bulk bin creation (App Flow §5.4). */
export default function Locations() {
  const { data: warehouses = [] } = useWarehouses()
  const { data: rows = [], isLoading } = useRows()
  const { data: bins = [] } = useBins()
  const { data: utilisation = [] } = useBinUtilisation()

  const saveRow = useSaveRow()
  const saveBin = useSaveBin()
  const createRange = useCreateBinRange()
  const { showSuccess, showError } = useAppToast()

  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rowDialog, setRowDialog] = useState(false)
  const [binDialog, setBinDialog] = useState<string | null>(null)

  const [rowForm, setRowForm] = useState({ warehouse_id: '', code: '', name: '', sort_order: 0 })
  const [rangeForm, setRangeForm] = useState({ prefix: 'B', from: 1, to: 40, pad: 3, capacity: '' })

  const binsByRow = useMemo(() => {
    const map = new Map<string, typeof bins>()
    for (const bin of bins) {
      const list = map.get(bin.row_id) ?? []
      list.push(bin)
      map.set(bin.row_id, list)
    }
    return map
  }, [bins])

  const utilByBin = useMemo(
    () => new Map(utilisation.map((u) => [u.bin_id, u])),
    [utilisation],
  )

  const toggle = (rowId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })

  const submitRow = async () => {
    try {
      await saveRow.mutateAsync({
        values: {
          warehouse_id: rowForm.warehouse_id || warehouses[0]?.id,
          code: rowForm.code.trim().toUpperCase(),
          name: rowForm.name.trim() || null,
          sort_order: rowForm.sort_order,
        },
      })
      showSuccess(`Row ${rowForm.code.toUpperCase()} created`)
      setRowDialog(false)
      setRowForm({ warehouse_id: '', code: '', name: '', sort_order: 0 })
    } catch (error) {
      showError(error, 'Could not create the row')
    }
  }

  const submitRange = async () => {
    if (!binDialog) return
    try {
      const created = await createRange.mutateAsync({
        rowId: binDialog,
        prefix: rangeForm.prefix.trim().toUpperCase(),
        from: rangeForm.from,
        to: rangeForm.to,
        pad: rangeForm.pad,
        capacity: rangeForm.capacity ? Number(rangeForm.capacity) : null,
      })
      showSuccess(`${created} bins created`, 'Location codes were generated automatically.')
      setBinDialog(null)
    } catch (error) {
      showError(error, 'Could not create the bins')
    }
  }

  if (isLoading) return <SkeletonRows rows={6} />

  return (
    <>
      <PageHeader
        title="Locations"
        description="Warehouse → row → bin. Every bin carries a unique location code."
        actions={
          <Button onClick={() => setRowDialog(true)}>
            <Plus />
            Add row
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Rows3}
          title="No rows yet"
          description="Create a row, then add its bins in one range."
          action={<Button onClick={() => setRowDialog(true)}>Add the first row</Button>}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const rowBins = binsByRow.get(row.id) ?? []
            const isOpen = expanded.has(row.id)
            const units = rowBins.reduce((sum, b) => sum + (utilByBin.get(b.id)?.units ?? 0), 0)

            return (
              <Card key={row.id}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      className="flex min-w-0 items-center gap-2 text-left"
                      aria-expanded={isOpen}
                    >
                      {isOpen ? (
                        <ChevronDown className="size-4 shrink-0" aria-hidden />
                      ) : (
                        <ChevronRight className="size-4 shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0">
                        <span className="block text-h3">
                          {row.warehouse.code}-{row.code}
                          {row.name ? ` · ${row.name}` : ''}
                        </span>
                        <span className="text-small text-muted-foreground">
                          {rowBins.length} bins · {formatNumber(units)} units · walking order{' '}
                          {row.sort_order}
                        </span>
                      </span>
                    </button>

                    <div className="flex flex-wrap items-center gap-2">
                      {!row.is_active && <Badge variant="destructive">inactive</Badge>}
                      <Button asChild variant="secondary" size="sm">
                        <Link to={`/admin/labels?row=${row.id}`}>
                          <Printer className="size-3.5" />
                          Print QR sheet
                        </Link>
                      </Button>
                      <Button size="sm" onClick={() => setBinDialog(row.id)}>
                        <Plus className="size-3.5" />
                        Add bins
                      </Button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="border-t border-border p-3">
                      {rowBins.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No bins in this row yet.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {rowBins.map((bin) => {
                            const util = utilByBin.get(bin.id)
                            return (
                              <Link
                                key={bin.id}
                                to={`/bins/${bin.id}`}
                                className={cn(
                                  'flex flex-col gap-1 rounded-md border border-border p-2 hover:bg-accent',
                                  !bin.is_active && 'opacity-50',
                                )}
                              >
                                <LocationBadge code={bin.location_code} />
                                <span className="text-small text-muted-foreground">
                                  {formatNumber(util?.units ?? 0)}
                                  {bin.capacity ? ` / ${formatNumber(bin.capacity)}` : ''} units
                                </span>
                                {util?.fill_pct !== null && util?.fill_pct !== undefined && (
                                  <span
                                    className={cn(
                                      'text-small',
                                      util.fill_pct > 100
                                        ? 'text-destructive'
                                        : util.fill_pct > 90
                                          ? 'text-warning'
                                          : 'text-muted-foreground',
                                    )}
                                  >
                                    {util.fill_pct}% full
                                  </span>
                                )}
                              </Link>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add row -------------------------------------------------------- */}
      <Dialog open={rowDialog} onOpenChange={setRowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a row</DialogTitle>
            <DialogDescription>
              Rows are walked in sort order — that is what makes a pick list efficient.
            </DialogDescription>
          </DialogHeader>

          <Field label="Warehouse" htmlFor="warehouse" required>
            <Select
              value={rowForm.warehouse_id || warehouses[0]?.id || ''}
              onValueChange={(v) => setRowForm((f) => ({ ...f, warehouse_id: v }))}
            >
              <SelectTrigger id="warehouse">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} — {warehouse.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Row code" htmlFor="row-code" required hint="Becomes part of every bin code.">
              <Input
                id="row-code"
                value={rowForm.code}
                onChange={(e) => setRowForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                placeholder="R05"
                className="font-mono"
              />
            </Field>
            <Field label="Walking order" htmlFor="sort-order">
              <Input
                id="sort-order"
                type="number"
                min={0}
                value={rowForm.sort_order}
                onChange={(e) =>
                  setRowForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                }
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Name" htmlFor="row-name">
            <Input
              id="row-name"
              value={rowForm.name}
              onChange={(e) => setRowForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Row 5 — chilled"
            />
          </Field>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setRowDialog(false)}>
              Cancel
            </Button>
            <Button
              loading={saveRow.isPending}
              disabled={!rowForm.code.trim()}
              onClick={() => void submitRow()}
            >
              Create row
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add bins ------------------------------------------------------- */}
      <Dialog open={!!binDialog} onOpenChange={(open) => !open && setBinDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add bins in bulk</DialogTitle>
            <DialogDescription>
              Creates a numbered range. Location codes are generated by the database.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Prefix" htmlFor="prefix">
              <Input
                id="prefix"
                value={rangeForm.prefix}
                onChange={(e) =>
                  setRangeForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))
                }
                className="font-mono"
              />
            </Field>
            <Field label="From" htmlFor="from">
              <Input
                id="from"
                type="number"
                min={0}
                value={rangeForm.from}
                onChange={(e) => setRangeForm((f) => ({ ...f, from: Number(e.target.value) || 0 }))}
                className="tabular"
              />
            </Field>
            <Field label="To" htmlFor="to">
              <Input
                id="to"
                type="number"
                min={0}
                value={rangeForm.to}
                onChange={(e) => setRangeForm((f) => ({ ...f, to: Number(e.target.value) || 0 }))}
                className="tabular"
              />
            </Field>
            <Field label="Digits" htmlFor="pad">
              <Input
                id="pad"
                type="number"
                min={1}
                max={6}
                value={rangeForm.pad}
                onChange={(e) => setRangeForm((f) => ({ ...f, pad: Number(e.target.value) || 3 }))}
                className="tabular"
              />
            </Field>
          </div>

          <Field label="Capacity per bin (units)" htmlFor="capacity" hint="Optional; drives the over-capacity alert.">
            <Input
              id="capacity"
              type="number"
              min={1}
              value={rangeForm.capacity}
              onChange={(e) => setRangeForm((f) => ({ ...f, capacity: e.target.value }))}
              placeholder="600"
              className="tabular"
            />
          </Field>

          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            Will create{' '}
            <span className="font-medium tabular">
              {Math.max(0, rangeForm.to - rangeForm.from + 1)}
            </span>{' '}
            bins:{' '}
            <span className="location-code">
              {rangeForm.prefix}
              {String(rangeForm.from).padStart(rangeForm.pad, '0')}
            </span>{' '}
            …{' '}
            <span className="location-code">
              {rangeForm.prefix}
              {String(rangeForm.to).padStart(rangeForm.pad, '0')}
            </span>
          </p>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setBinDialog(null)}>
              Cancel
            </Button>
            <Button
              loading={createRange.isPending}
              disabled={rangeForm.to < rangeForm.from}
              onClick={() => void submitRange()}
            >
              <Boxes />
              Create bins
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* A quick way to deactivate a bin without leaving the tree. */}
      <BinToggleHint saveBin={saveBin} />
    </>
  )
}

/** Deactivation is rare enough to keep out of the grid, but must stay reachable. */
function BinToggleHint({ saveBin }: { saveBin: ReturnType<typeof useSaveBin> }) {
  const [code, setCode] = useState('')
  const [active, setActive] = useState(false)
  const { data: bins = [] } = useBins()
  const { showSuccess, showError } = useAppToast()

  const match = bins.find((b) => b.location_code === code.trim().toUpperCase())

  return (
    <Card className="mt-6">
      <CardContent className="space-y-3 p-4 pt-4">
        <h2 className="text-h3">Activate or deactivate a bin</h2>
        <p className="text-sm text-muted-foreground">
          A deactivated bin keeps its stock and its history but can no longer receive stock or be
          allocated from.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Location code" htmlFor="toggle-bin" className="min-w-56 flex-1">
            <Input
              id="toggle-bin"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase())
                const found = bins.find((b) => b.location_code === e.target.value.toUpperCase())
                if (found) setActive(found.is_active)
              }}
              placeholder="WH1-R02-B017"
              className="font-mono"
            />
          </Field>
          <label className="flex h-10 items-center gap-2">
            <Switch
              checked={match ? active : false}
              disabled={!match}
              onCheckedChange={(checked) => {
                if (!match) return
                setActive(checked)
                saveBin.mutate(
                  { id: match.id, values: { is_active: checked } },
                  {
                    onSuccess: () =>
                      showSuccess(
                        `${match.location_code} ${checked ? 'activated' : 'deactivated'}`,
                      ),
                    onError: (error) => showError(error, 'Could not update the bin'),
                  },
                )
              }}
            />
            <span className="text-sm">{match ? (active ? 'Active' : 'Inactive') : 'Enter a code'}</span>
          </label>
        </div>
      </CardContent>
    </Card>
  )
}
