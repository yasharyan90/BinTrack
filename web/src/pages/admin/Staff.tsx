import { useMemo, useState } from 'react'
import { Ban, ClipboardList, Plus, Scale, Users, UserRoundCog } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { WarehouseToggle } from '@/components/layout/WarehouseStatus'
import { TaskCard } from '@/pages/staff/MyTasks'
import { PRIORITY } from '@/pages/staff/taskMeta'
import {
  useAssignTask, useBalanceTasks, useReassignTask, useStaffPerformance, useStaffWorkload, useTasks, useUpdateTaskStatus,
} from '@/hooks/useTasks'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { cn, formatNumber } from '@/lib/utils'
import type { StaffPerformanceRow, TaskPriority, TaskStatus } from '@/types/app'

const WINDOWS = [7, 30, 90] as const

/**
 * Staff performance and the written tasks that drive it. The share-of-work
 * bars are measured against a fair share (100 % ÷ staff), which is what
 * "divided equally" means here; auto-assignment and Balance keep it there.
 */
export default function Staff() {
  const [days, setDays] = useState<number>(30)
  const [taskStatus, setTaskStatus] = useState<TaskStatus | 'all' | 'active'>('active')
  const [assignee, setAssignee] = useState<string>('all')
  const [assigning, setAssigning] = useState(false)

  const { data: perf, isLoading } = useStaffPerformance(days)
  const { data: workload = [] } = useStaffWorkload()
  const { data: tasks = [], isLoading: tasksLoading } = useTasks({ status: taskStatus, assignee })
  const balance = useBalanceTasks()
  const update = useUpdateTaskStatus()
  const reassign = useReassignTask()
  const { showSuccess, showError } = useAppToast()

  useRealtime('staff-admin', ['staff_tasks', 'app_settings', 'stock_movements', 'pick_tasks'])

  const maxShare = useMemo(() => Math.max(1, ...(perf?.staff ?? []).map((s) => s.share_pct)), [perf])
  const activeStaff = workload.filter((w) => w.role === 'staff')

  return (
    <>
      <PageHeader
        title="Staff & tasks"
        description="Who is doing what, how well, and whether the work is spread evenly."
        actions={
          <>
            <WarehouseToggle />
            <Button
              variant="secondary"
              loading={balance.isPending}
              onClick={() => balance.mutate(undefined, {
                onSuccess: (r) => showSuccess(r.moved ? `${r.moved} task${r.moved === 1 ? '' : 's'} moved` : 'Already balanced', `${r.staff} staff, ${r.considered} open tasks considered.`),
                onError: (e) => showError(e, 'Could not balance'),
              })}
            >
              <Scale />
              Balance open tasks
            </Button>
            <Button onClick={() => setAssigning(true)}>
              <Plus />
              Assign a task
            </Button>
          </>
        }
      />

      {/* Workload right now ------------------------------------------------ */}
      <Card className="mb-4">
        <CardContent className="p-4 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-h3"><Users className="size-4 text-muted-foreground" aria-hidden />Open work right now</h2>
            <p className="text-small text-muted-foreground">Auto-assignment always picks the lightest column.</p>
          </div>
          {activeStaff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active staff accounts.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {activeStaff.map((w) => {
                const max = Math.max(1, ...activeStaff.map((x) => x.active_tasks))
                return (
                  <div key={w.staff_id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{w.full_name ?? w.email}</p>
                      <span className="tabular text-sm">{w.active_tasks} active</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', w.overdue_tasks > 0 ? 'bg-destructive' : 'bg-info')} style={{ width: `${(w.active_tasks / max) * 100}%` }} />
                    </div>
                    <p className="mt-1 text-small text-muted-foreground">
                      {w.open_tasks} to do · {w.in_progress_tasks} in progress{w.overdue_tasks > 0 ? ` · ${w.overdue_tasks} overdue` : ''}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Performance ------------------------------------------------------ */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-h3"><UserRoundCog className="size-4 text-muted-foreground" aria-hidden />Performance</h2>
            <div className="flex items-center gap-2 text-small text-muted-foreground">
              {perf && <span>fair share {perf.fair_share_pct}% · {formatNumber(perf.total_work_units)} work units</span>}
              <div className="flex gap-1">
                {WINDOWS.map((w) => (
                  <button key={w} type="button" onClick={() => setDays(w)} className={cn('rounded-full border border-border px-2.5 py-0.5', days === w && 'border-transparent bg-primary text-primary-foreground')}>
                    {w} d
                  </button>
                ))}
              </div>
            </div>
          </div>
          {isLoading ? (
            <SkeletonRows rows={4} className="p-3" />
          ) : !perf || perf.staff.length === 0 ? (
            <EmptyState icon={Users} title="No staff yet" className="m-3 border-0" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff</TableHead>
                  <TableHead className="w-56">Share of work</TableHead>
                  <TableHead className="text-right">Picks</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Transfers</TableHead>
                  <TableHead className="text-right">GRN lines</TableHead>
                  <TableHead className="text-right">Put-aways</TableHead>
                  <TableHead className="text-right">Tasks done</TableHead>
                  <TableHead className="text-right">Overdue</TableHead>
                  <TableHead className="text-right">Avg hrs/task</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perf.staff.map((s) => <PerfRow key={s.id} row={s} fair={perf.fair_share_pct} maxShare={maxShare} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Tasks -------------------------------------------------------------- */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <h2 className="flex items-center gap-2 text-h3"><ClipboardList className="size-4 text-muted-foreground" aria-hidden />Tasks</h2>
            <div className="flex flex-wrap gap-2">
              <Select value={taskStatus} onValueChange={(v) => setTaskStatus(v as TaskStatus | 'all' | 'active')}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="open">To do</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-8 w-44"><SelectValue placeholder="Everyone" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {activeStaff.map((w) => <SelectItem key={w.staff_id} value={w.staff_id}>{w.full_name ?? w.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2 p-3">
            {tasksLoading ? <SkeletonRows rows={3} /> : tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No tasks match.</p>
            ) : tasks.map((task) => (
              <div key={task.id} className="space-y-1.5">
                <TaskCard task={task} busy={false} compact />
                {(task.status === 'open' || task.status === 'in_progress') && (
                  <div className="flex flex-wrap items-center gap-2 pl-4 text-small">
                    <span className="text-muted-foreground">Assigned to <strong>{task.assignee?.full_name ?? '—'}</strong> · move to</span>
                    <Select value={task.assigned_to ?? ''} onValueChange={(v) => reassign.mutate({ taskId: task.id, assignedTo: v }, { onSuccess: () => showSuccess('Task reassigned'), onError: (e) => showError(e, 'Could not reassign') })}>
                      <SelectTrigger className="h-7 w-44 text-small"><SelectValue /></SelectTrigger>
                      <SelectContent>{activeStaff.map((w) => <SelectItem key={w.staff_id} value={w.staff_id}>{w.full_name ?? w.email} ({w.active_tasks})</SelectItem>)}</SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" onClick={() => update.mutate({ taskId: task.id, status: 'cancelled' }, { onSuccess: () => showSuccess('Task cancelled'), onError: (e) => showError(e, 'Could not cancel') })}>
                      <Ban className="size-3.5" />Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {assigning && <AssignDialog staff={activeStaff.map((w) => ({ id: w.staff_id, name: w.full_name ?? w.email ?? 'staff', active: w.active_tasks }))} onClose={() => setAssigning(false)} />}
    </>
  )
}

function PerfRow({ row: s, fair, maxShare }: { row: StaffPerformanceRow; fair: number; maxShare: number }) {
  const over = s.share_pct > fair * 1.25
  const under = s.share_pct < fair * 0.5 && maxShare > 0
  return (
    <TableRow>
      <TableCell>
        <span className="block font-medium">{s.full_name ?? s.email}</span>
        <span className="text-small text-muted-foreground">{s.tasks_open + s.tasks_in_progress} active tasks</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className={cn('h-full rounded-full', over ? 'bg-destructive' : under ? 'bg-warning' : 'bg-success')} style={{ width: `${(s.share_pct / maxShare) * 100}%` }} />
          </div>
          <span className={cn('w-12 text-right tabular text-small', over && 'text-destructive', under && 'text-warning')}>{s.share_pct}%</span>
        </div>
        {(over || under) && <span className="text-small text-muted-foreground">{over ? 'carrying more than a fair share' : 'well under a fair share'}</span>}
      </TableCell>
      <TableCell className="text-right tabular">{s.picks}<span className="text-small text-muted-foreground"> / {formatNumber(s.units_picked)}u</span></TableCell>
      <TableCell className="text-right tabular">{s.accuracy_pct === null ? '—' : <span className={cn(s.accuracy_pct < 95 && 'text-destructive')}>{s.accuracy_pct}%</span>}</TableCell>
      <TableCell className="text-right tabular">{s.inwards}</TableCell>
      <TableCell className="text-right tabular">{s.transfers}</TableCell>
      <TableCell className="text-right tabular">{s.grn_lines_counted}</TableCell>
      <TableCell className="text-right tabular">{s.putaways}</TableCell>
      <TableCell className="text-right tabular">{s.tasks_done}<span className="text-small text-muted-foreground"> ({s.tasks_on_time} on time)</span></TableCell>
      <TableCell className={cn('text-right tabular', s.tasks_overdue > 0 && 'text-destructive')}>{s.tasks_overdue}</TableCell>
      <TableCell className="text-right tabular">{s.avg_hours_to_complete || '—'}</TableCell>
    </TableRow>
  )
}

function AssignDialog({ staff, onClose }: { staff: { id: string; name: string; active: number }[]; onClose: () => void }) {
  const assign = useAssignTask()
  const { showSuccess, showError } = useAppToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('normal')
  const [assignee, setAssignee] = useState<string>('auto')
  const [due, setDue] = useState('')
  const lightest = [...staff].sort((a, b) => a.active - b.active)[0]

  const submit = () =>
    assign.mutate(
      { title: title.trim(), description: description.trim() || null, priority, assigned_to: assignee === 'auto' ? null : assignee, due_at: due ? new Date(due).toISOString() : null },
      {
        onSuccess: (t) => { showSuccess('Task assigned', `To ${staff.find((s) => s.id === t.assigned_to)?.name ?? 'staff'}.`); onClose() },
        onError: (e) => showError(e, 'Could not assign the task'),
      },
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign a task</DialogTitle>
          <DialogDescription>Written instructions, delivered live. Leave the assignee on Auto and it goes to whoever has the least on.</DialogDescription>
        </DialogHeader>
        <Field label="Task" htmlFor="task-title" required>
          <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Recount row R02 before 3 pm" autoFocus />
        </Field>
        <Field label="Details" htmlFor="task-desc">
          <Textarea id="task-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Every bin, blind count. Flag anything expired." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Assign to" htmlFor="task-assignee">
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger id="task-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto — least loaded{lightest ? ` (${lightest.name})` : ''}</SelectItem>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.active} active)</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Priority" htmlFor="task-priority">
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger id="task-priority"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(PRIORITY) as TaskPriority[]).map((p) => <SelectItem key={p} value={p}>{PRIORITY[p].label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Due" htmlFor="task-due">
            <Input id="task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={title.trim().length < 3} loading={assign.isPending} onClick={submit}><Plus />Assign</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

