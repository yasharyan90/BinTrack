import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ClipboardList, Play } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { useMyTasks, useUpdateTaskStatus } from '@/hooks/useTasks'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { cn, formatDateTime, relativeTime } from '@/lib/utils'
import type { StaffTask } from '@/types/app'
import { PRIORITY, TASK_STATUS } from './taskMeta'


export function TaskLinks({ task }: { task: StaffTask }) {
  return (
    <span className="flex flex-wrap gap-2 text-small">
      {task.order_id && <Link to={`/orders/${task.order_id}`} className="text-primary underline-offset-2 hover:underline">Order</Link>}
      {task.grn_id && <Link to={`/grn/${task.grn_id}`} className="text-primary underline-offset-2 hover:underline">GRN</Link>}
      {task.product_id && <Link to={`/products/${task.product_id}`} className="text-primary underline-offset-2 hover:underline">Product</Link>}
      {task.bin_id && <Link to={`/bins/${task.bin_id}`} className="text-primary underline-offset-2 hover:underline">Bin</Link>}
    </span>
  )
}

/** Written instructions from the admin, worked through one at a time. */
export default function MyTasks() {
  const { data: tasks = [], isLoading } = useMyTasks()
  const update = useUpdateTaskStatus()
  const { showSuccess, showError } = useAppToast()
  const [finishing, setFinishing] = useState<StaffTask | null>(null)
  const [note, setNote] = useState('')

  useRealtime('my-tasks', ['staff_tasks'])

  const active = tasks.filter((t) => t.status === 'open' || t.status === 'in_progress')
  const closed = tasks.filter((t) => t.status === 'done' || t.status === 'cancelled')

  const start = (task: StaffTask) =>
    update.mutate({ taskId: task.id, status: 'in_progress' }, {
      onSuccess: () => showSuccess(`Started: ${task.title}`),
      onError: (e) => showError(e, 'Could not start the task'),
    })

  const finish = () => {
    if (!finishing) return
    update.mutate({ taskId: finishing.id, status: 'done', note: note.trim() || undefined }, {
      onSuccess: () => { showSuccess(`Done: ${finishing.title}`); setFinishing(null); setNote('') },
      onError: (e) => showError(e, 'Could not complete the task'),
    })
  }

  return (
    <>
      <PageHeader title="My tasks" description={`${active.length} to do · ${closed.length} finished`} />

      {isLoading ? (
        <SkeletonRows rows={4} />
      ) : tasks.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing assigned to you" description="When an admin writes you a task it appears here, live." />
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            {active.map((task) => <TaskCard key={task.id} task={task} onStart={() => start(task)} onFinish={() => { setFinishing(task); setNote(task.staff_note ?? '') }} busy={update.isPending} />)}
            {active.length === 0 && <p className="text-sm text-muted-foreground">All caught up.</p>}
          </section>
          {closed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-h3 text-muted-foreground">Finished</h2>
              {closed.map((task) => <TaskCard key={task.id} task={task} busy={false} />)}
            </section>
          )}
        </div>
      )}

      <Dialog open={!!finishing} onOpenChange={(o) => !o && setFinishing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finish “{finishing?.title}”</DialogTitle>
            <DialogDescription>A short note for the admin — what you found, anything left over.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="All bins recounted, two corrections posted." aria-label="Completion note" />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setFinishing(null)}>Cancel</Button>
            <Button loading={update.isPending} onClick={finish}><Check />Mark done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function TaskCard({ task, onStart, onFinish, busy, compact = false }: { task: StaffTask; onStart?: () => void; onFinish?: () => void; busy: boolean; compact?: boolean }) {
  const overdue = task.due_at && new Date(task.due_at) < new Date() && (task.status === 'open' || task.status === 'in_progress')
  return (
    <Card className={cn(task.status === 'done' || task.status === 'cancelled' ? 'opacity-70' : undefined)}>
      <CardContent className="flex gap-3 p-3 pt-3">
        <span className={cn('w-1 shrink-0 rounded-full', TASK_STATUS[task.status].rail)} aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{task.title}</p>
            <span className="flex items-center gap-1.5">
              <Badge variant={PRIORITY[task.priority].chip}>{PRIORITY[task.priority].label}</Badge>
              <Badge variant="outline">{TASK_STATUS[task.status].label}</Badge>
            </span>
          </div>
          {task.description && !compact && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p>}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-muted-foreground">
            {task.assigner?.full_name && <span>from {task.assigner.full_name}</span>}
            <span>{relativeTime(task.created_at)}</span>
            {task.due_at && <span className={cn(overdue && 'font-medium text-destructive')}>due {formatDateTime(task.due_at)}{overdue ? ' · overdue' : ''}</span>}
            {task.completed_at && <span className="text-success">done {formatDateTime(task.completed_at)}</span>}
            <TaskLinks task={task} />
          </p>
          {task.staff_note && <p className="rounded-md bg-muted/60 px-2 py-1 text-small">“{task.staff_note}”</p>}
        </div>
        {(onStart || onFinish) && (
          <div className="flex shrink-0 flex-col justify-center gap-1.5">
            {task.status === 'open' && onStart && <Button size="sm" variant="secondary" disabled={busy} onClick={onStart}><Play className="size-3.5" />Start</Button>}
            {task.status !== 'done' && task.status !== 'cancelled' && onFinish && <Button size="sm" disabled={busy} onClick={onFinish}><Check className="size-3.5" />Done</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
