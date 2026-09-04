import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ClipboardCheck, Check, EyeOff, Plus, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
import {
  useApproveCountSession,
  useCountSession,
  useCountSessions,
  useStartCountSession,
  useUpdateCountSession,
} from '@/hooks/useCounts'
import { useRows } from '@/hooks/useLocations'
import { useAppToast } from '@/hooks/useAppToast'
import { cn, formatDateTime } from '@/lib/utils'

/** Create, monitor and approve cycle counts (App Flow §5.8). */
export default function Counts() {
  const { data: sessions = [], isLoading } = useCountSessions()
  const { data: rows = [] } = useRows()
  const startSession = useStartCountSession()
  const approve = useApproveCountSession()
  const updateSession = useUpdateCountSession()
  const { showSuccess, showError } = useAppToast()

  const [creating, setCreating] = useState(false)
  const [rowId, setRowId] = useState('')
  const [name, setName] = useState('')
  const [blind, setBlind] = useState(true)
  const [reviewing, setReviewing] = useState<string | null>(null)

  const { data: detail } = useCountSession(reviewing ?? undefined)

  const create = async () => {
    try {
      const session = await startSession.mutateAsync({
        rowId,
        name: name.trim() || undefined,
        blind,
      })
      showSuccess(`${session.name} opened`, 'Expected quantities were snapshotted.')
      setCreating(false)
      setName('')
    } catch (error) {
      showError(error, 'Could not start the count')
    }
  }

  const variances = (detail?.lines ?? []).filter(
    (line) => line.counted_qty !== null && line.variance !== 0,
  )
  const uncounted = (detail?.lines ?? []).filter((line) => line.counted_qty === null)

  return (
    <>
      <PageHeader
        title="Cycle counts"
        description="Scan-driven audits. Approving a count writes correction movements."
        actions={
          <Button onClick={() => setCreating(true)} disabled={rows.length === 0}>
            <Plus />
            New count
          </Button>
        }
      />

      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No counts yet"
          description="Open one for a row; staff walk it and enter what they find."
          action={
            <Button onClick={() => setCreating(true)} disabled={rows.length === 0}>
              Start a count
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Session</TableHead>
                <TableHead>Row</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-56" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-56 truncate font-medium">{session.name}</TableCell>
                  <TableCell className="font-mono text-small">
                    {session.row?.code ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        session.status === 'approved'
                          ? 'success'
                          : session.status === 'cancelled'
                            ? 'default'
                            : 'info'
                      }
                    >
                      {session.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {session.is_blind ? (
                      <span className="flex items-center gap-1 text-small text-muted-foreground">
                        <EyeOff className="size-3.5" aria-hidden />
                        blind
                      </span>
                    ) : (
                      <span className="text-small text-muted-foreground">open</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(session.created_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1.5">
                      {session.status === 'open' && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={`/counts/${session.id}`}>Enter counts</Link>
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" onClick={() => setReviewing(session.id)}>
                        Review
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* New session ---------------------------------------------------- */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a cycle count</DialogTitle>
            <DialogDescription>
              Opening a session snapshots what the system currently believes is in every bin of the
              row.
            </DialogDescription>
          </DialogHeader>

          <Field label="Row" htmlFor="count-row" required>
            <Select value={rowId} onValueChange={setRowId}>
              <SelectTrigger id="count-row">
                <SelectValue placeholder="Choose a row" />
              </SelectTrigger>
              <SelectContent>
                {rows.map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.warehouse.code}-{row.code}
                    {row.name ? ` · ${row.name}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Name" htmlFor="count-name" hint="Defaults to the date and time.">
            <Input
              id="count-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly count — chilled"
            />
          </Field>

          <label className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
            <span className="text-sm">
              Blind count
              <span className="block text-small text-muted-foreground">
                Hides expected quantities from the counter — the only way to get an independent
                number.
              </span>
            </span>
            <Switch checked={blind} onCheckedChange={setBlind} />
          </label>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button loading={startSession.isPending} disabled={!rowId} onClick={() => void create()}>
              Open the session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review + approve ----------------------------------------------- */}
      <Dialog open={!!reviewing} onOpenChange={(open) => !open && setReviewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detail?.session.name ?? 'Count session'}</DialogTitle>
            <DialogDescription>
              {detail
                ? `${detail.lines.length - uncounted.length} of ${detail.lines.length} lines counted · ${variances.length} with a variance`
                : 'Loading…'}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <>
              {variances.length === 0 ? (
                <p className="rounded-md bg-success/12 px-3 py-2 text-sm text-success">
                  No variances so far — the shelf matches the system.
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Location</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Counted</TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {variances.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <LocationBadge code={line.bin?.location_code} binId={line.bin?.id} />
                          </TableCell>
                          <TableCell className="font-mono text-small">
                            {line.product?.sku ?? '—'}
                          </TableCell>
                          <TableCell className="text-right tabular">{line.expected_qty}</TableCell>
                          <TableCell className="text-right tabular">{line.counted_qty}</TableCell>
                          <TableCell
                            className={cn(
                              'text-right tabular font-medium',
                              line.variance > 0 ? 'text-success' : 'text-destructive',
                            )}
                          >
                            {line.variance > 0 ? `+${line.variance}` : line.variance}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {uncounted.length > 0 && detail.session.status === 'open' && (
                <p className="text-sm text-warning">
                  {uncounted.length} lines have not been counted. Approving now leaves them
                  untouched.
                </p>
              )}
            </>
          )}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setReviewing(null)}>
              Close
            </Button>
            {detail && ['open', 'submitted'].includes(detail.session.status) && (
              <>
                <Button
                  variant="ghost"
                  onClick={() =>
                    updateSession.mutate(
                      { id: detail.session.id, status: 'cancelled' },
                      {
                        onSuccess: () => {
                          showSuccess('Count cancelled')
                          setReviewing(null)
                        },
                        onError: (error) => showError(error, 'Could not cancel'),
                      },
                    )
                  }
                >
                  <X />
                  Cancel count
                </Button>
                <Button
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(detail.session.id, {
                      onSuccess: ({ corrections }) => {
                        showSuccess(
                          `${corrections} correction${corrections === 1 ? '' : 's'} posted`,
                          'Stock now matches the count.',
                        )
                        setReviewing(null)
                      },
                      onError: (error) => showError(error, 'Could not approve the count'),
                    })
                  }
                >
                  <Check />
                  Approve & correct stock
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
