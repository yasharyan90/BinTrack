import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Plus, Search, Truck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { GrnStatusChip, SealChip } from '@/components/grn/GrnStatus'
import { GrnKpiStrip } from '@/components/grn/GrnKpis'
import { useGrnDashboard, useGrns, type GrnListFilters } from '@/hooks/useGrn'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtime } from '@/hooks/useRealtime'
import { useAuth } from '@/stores/auth'
import { cn, formatDateTime } from '@/lib/utils'

const FILTERS: { value: NonNullable<GrnListFilters['status']>; label: string; tone: string }[] = [
  { value: 'open', label: 'In progress', tone: 'data-[active=true]:bg-sky-500 data-[active=true]:text-white' },
  { value: 'verifying', label: 'Pending verification', tone: 'data-[active=true]:bg-amber-500 data-[active=true]:text-white' },
  { value: 'put_away', label: 'Pending put-away', tone: 'data-[active=true]:bg-violet-500 data-[active=true]:text-white' },
  { value: 'discrepancy', label: 'Discrepancies', tone: 'data-[active=true]:bg-rose-500 data-[active=true]:text-white' },
  { value: 'completed', label: 'Completed', tone: 'data-[active=true]:bg-emerald-500 data-[active=true]:text-white' },
  { value: 'all', label: 'All', tone: 'data-[active=true]:bg-foreground data-[active=true]:text-background' },
]

/** Every truck that has arrived, with the admin's five figures on top. */
export default function GrnList() {
  const [params, setParams] = useSearchParams()
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  const status = (params.get('status') as GrnListFilters['status']) ?? 'open'
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)

  const { data: dashboard, isLoading: kpisLoading } = useGrnDashboard()
  // 'verifying' as a filter means "still needs counting" — arrived trucks too.
  const listStatus: GrnListFilters['status'] = status === 'verifying' ? 'open' : status
  const { data: rows = [], isLoading } = useGrns({ status: listStatus, search: debounced })
  const visible = status === 'verifying' ? rows.filter((r) => r.status === 'arrived' || r.status === 'verifying')
    : status === 'put_away' ? rows.filter((r) => r.status === 'verified' || r.status === 'put_away')
    : rows

  useRealtime('grns', ['grns'])

  return (
    <>
      <PageHeader
        title="Goods receipts"
        description="Every truck, from the gate to the bin. PO → seal → count → GRN → put-away."
        actions={
          <Button asChild className="bg-sky-600 text-white hover:bg-sky-600/90">
            <Link to="/grn/new">
              <Plus />
              Register arrival
            </Link>
          </Button>
        }
      />

      {isAdmin && (
        <div className="mb-5">
          <GrnKpiStrip data={dashboard} loading={kpisLoading} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              data-active={status === f.value}
              onClick={() => {
                const next = new URLSearchParams(params)
                next.set('status', f.value)
                setParams(next, { replace: true })
              }}
              className={cn(
                'rounded-full border border-border px-3 py-1 text-sm transition-colors hover:bg-accent',
                'data-[active=true]:border-transparent',
                f.tone,
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="GRN, vehicle, driver or invoice…"
            className="pl-9"
            aria-label="Search goods receipts"
          />
        </div>
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No receipts here"
          description="Register a truck against an open purchase order to start one."
          action={
            <Button asChild>
              <Link to="/grn/new">Register arrival</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>GRN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PO · Vendor</TableHead>
                <TableHead>Vehicle · Driver</TableHead>
                <TableHead>Seal</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Arrived</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((grn) => (
                <TableRow key={grn.id}>
                  <TableCell>
                    <Link to={`/grn/${grn.id}`} className="font-mono text-sm font-medium underline-offset-2 hover:underline">
                      {grn.grn_number}
                    </Link>
                    {grn.has_discrepancy && !grn.discrepancy_resolved_at && (
                      <span className="ml-2 inline-flex items-center gap-1 text-small text-rose-600 dark:text-rose-300">
                        <AlertTriangle className="size-3" aria-hidden />
                        discrepancy
                      </span>
                    )}
                  </TableCell>
                  <TableCell><GrnStatusChip status={grn.status} /></TableCell>
                  <TableCell>
                    <span className="block font-mono text-small">{grn.po?.po_number}</span>
                    <span className="block truncate text-small text-muted-foreground">{grn.vendor?.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="block font-mono text-small">{grn.vehicle_number}</span>
                    <span className="block truncate text-small text-muted-foreground">{grn.driver_name}</span>
                  </TableCell>
                  <TableCell><SealChip status={grn.seal_status} /></TableCell>
                  <TableCell className="text-muted-foreground">{grn.receiver?.full_name ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(grn.arrived_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
