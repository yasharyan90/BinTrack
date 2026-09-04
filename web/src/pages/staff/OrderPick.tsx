import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, Ban, PackageSearch, Play, RefreshCw, Truck } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { OrderStatusChip } from '@/components/stock/StatusChip'
import { PickTaskCard } from '@/components/orders/PickTaskCard'
import { PickScannerSheet } from '@/components/scanner/PickScannerSheet'
import {
  useCancelOrder,
  usePickList,
  useReallocateOrder,
  useShipOrder,
  useStartPicking,
} from '@/hooks/useOrders'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { trackPicking } from '@/lib/realtime'
import { initials } from '@/lib/utils'
import type { PickTask } from '@/types/app'

/**
 * The pick list (App Flow §4.2–4.3): grouped by row in walking order, each task
 * scan-verified before its quantity is confirmed.
 */
export default function OrderPick() {
  const { orderId } = useParams<{ orderId: string }>()
  const profile = useAuth((s) => s.profile)
  const isAdmin = profile?.role === 'inventory_admin'

  const { data: pickList, isLoading } = usePickList(orderId)
  const startPicking = useStartPicking()
  const shipOrder = useShipOrder()
  const cancelOrder = useCancelOrder()
  const reallocate = useReallocateOrder()
  const { showError, showSuccess } = useAppToast()

  const [activeTask, setActiveTask] = useState<PickTask | null>(null)
  const [peers, setPeers] = useState<{ id: string; name: string }[]>([])
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  useRealtime(`order:${orderId}`, ['pick_tasks', 'orders'], {
    filter: { pick_tasks: `order_id=eq.${orderId}`, orders: `id=eq.${orderId}` },
  })

  const order = pickList?.order ?? null
  const isPicking = order?.status === 'picking'

  // Presence: two people should not walk the same order (Feature B10).
  useEffect(() => {
    if (!orderId || !profile || !isPicking) return
    return trackPicking(
      orderId,
      { id: profile.id, name: profile.full_name ?? profile.email ?? 'Picker' },
      (list) => setPeers(list.filter((p) => p.order_id === orderId && p.id !== profile.id)),
    )
  }, [isPicking, orderId, profile])

  const grouped = useMemo(() => {
    const tasks = pickList?.tasks ?? []
    const groups = new Map<string, PickTask[]>()
    for (const task of tasks) {
      const key = task.status === 'short' ? 'Not allocated' : (task.row_name ?? task.row_code ?? '—')
      const list = groups.get(key) ?? []
      list.push(task)
      groups.set(key, list)
    }
    return [...groups.entries()]
  }, [pickList])

  if (isLoading) return <SkeletonRows rows={6} />
  if (!order) {
    return (
      <EmptyState
        icon={PackageSearch}
        title="Order not found"
        action={
          <Button asChild>
            <Link to="/orders">Back to orders</Link>
          </Button>
        }
      />
    )
  }

  const tasks = pickList?.tasks ?? []
  const pickable = tasks.filter((t) => t.status !== 'short' && t.status !== 'cancelled')
  const picked = pickable.filter((t) => t.status === 'picked').length
  const shortTasks = tasks.filter((t) => t.status === 'short')
  const progress = pickable.length === 0 ? 0 : Math.round((picked / pickable.length) * 100)
  const nextTask = pickable.find((t) => t.status !== 'picked')

  return (
    <>
      <PageHeader
        title={order.order_number}
        description={order.customer_name ?? 'No customer'}
        actions={
          <>
            {(order.status === 'allocated' || order.status === 'partially_allocated') && (
              <Button
                loading={startPicking.isPending}
                onClick={() => startPicking.mutate(order.id)}
              >
                <Play />
                Start picking
              </Button>
            )}
            {order.status === 'picked' && (
              <Button
                loading={shipOrder.isPending}
                onClick={() => {
                  shipOrder.mutate(order.id, {
                    onSuccess: () => showSuccess(`${order.order_number} marked shipped`),
                    onError: (error) => showError(error, 'Could not ship the order'),
                  })
                }}
              >
                <Truck />
                Mark shipped
              </Button>
            )}
            {shortTasks.length > 0 && order.status !== 'cancelled' && (
              <Button
                variant="secondary"
                loading={reallocate.isPending}
                onClick={() => {
                  reallocate.mutate(order.id, {
                    onSuccess: () => showSuccess('Re-allocated', 'Short lines were retried.'),
                    onError: (error) => showError(error, 'Could not re-allocate'),
                  })
                }}
              >
                <RefreshCw />
                Re-allocate short lines
              </Button>
            )}
            {isAdmin && !['shipped', 'cancelled'].includes(order.status) && (
              <Button variant="ghost" onClick={() => setCancelOpen(true)}>
                <Ban />
                Cancel
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-5">
        <CardContent className="space-y-3 p-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <OrderStatusChip status={order.status} />
              {shortTasks.length > 0 && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden />
                  {shortTasks.length} short {shortTasks.length === 1 ? 'line' : 'lines'}
                </Badge>
              )}
              {peers.length > 0 && (
                <span className="flex items-center gap-1.5 text-small text-muted-foreground">
                  also picking:
                  {peers.map((peer) => (
                    <span
                      key={peer.id}
                      className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium"
                      title={peer.name}
                    >
                      {initials(peer.name)}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <p className="text-sm tabular">
              {picked} of {pickable.length} picked
              {nextTask?.row_name ? ` · next in ${nextTask.row_name}` : ''}
            </p>
          </div>
          <Progress value={progress} indicatorClassName="bg-success" aria-label="Picking progress" />
        </CardContent>
      </Card>

      {tasks.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to pick"
          description="This order has no allocated lines."
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(([rowName, rowTasks]) => (
            <section key={rowName} className="space-y-2">
              <h2 className="flex items-center gap-2 text-h3">
                {rowName}
                <span className="text-small font-normal text-muted-foreground">
                  {rowTasks.length} {rowTasks.length === 1 ? 'task' : 'tasks'}
                </span>
              </h2>
              <div className="space-y-2">
                {rowTasks.map((task) => (
                  <PickTaskCard
                    key={task.id}
                    task={task}
                    onScan={setActiveTask}
                    disabled={order.status === 'cancelled' || order.status === 'shipped'}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <PickScannerSheet
        task={activeTask}
        orderId={order.id}
        open={!!activeTask}
        onOpenChange={(open) => !open && setActiveTask(null)}
        onPicked={(pickedTaskId) => {
          // Auto-advance to the next task in walking order, so a picker keeps
          // moving instead of returning to the list between every bin.
          const next = (pickList?.tasks ?? []).find(
            (t) => t.status === 'pending' && t.id !== pickedTaskId,
          )
          setActiveTask(next ?? null)
        }}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel {order.order_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              Reserved stock is released back to available. Already-picked units stay picked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason (recorded on the order)"
            aria-label="Cancellation reason"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the order</AlertDialogCancel>
            <AlertDialogAction
              destructive
              onClick={() => {
                cancelOrder.mutate(
                  { orderId: order.id, reason: cancelReason.trim() || 'Cancelled by admin' },
                  {
                    onSuccess: () => showSuccess('Order cancelled'),
                    onError: (error) => showError(error, 'Could not cancel'),
                  },
                )
                setCancelOpen(false)
              }}
            >
              Cancel the order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
