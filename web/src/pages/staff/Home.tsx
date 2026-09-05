import { Link } from 'react-router-dom'
import {
  ArrowRight,
  ListOrdered,
  PackagePlus,
  Repeat,
  ScanLine,
  Search,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { OrderStatusChip } from '@/components/stock/StatusChip'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { useOpenOrders } from '@/hooks/useOrders'
import { useRecentMovements } from '@/hooks/useMovements'
import { useRealtime } from '@/hooks/useRealtime'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import { useWarehouseStatus, describeHours } from '@/hooks/useWarehouse'
import { useMyTasks } from '@/hooks/useTasks'
import { TaskCard } from './MyTasks'
import { DoorClosed, ClipboardList as TasksIcon } from 'lucide-react'
import { relativeTime } from '@/lib/utils'

/** Quick actions plus what is in flight — the picker's starting point. */
export default function Home() {
  const profile = useAuth((s) => s.profile)
  const isAdmin = profile?.role === 'inventory_admin'
  const openScanner = useUi((s) => s.openScanner)

  const { data: orders = [], isLoading } = useOpenOrders(6)
  const { data: movements = [] } = useRecentMovements(6)

  const { data: status } = useWarehouseStatus()
  const { data: myTasks = [] } = useMyTasks()
  const activeTasks = myTasks.filter((t) => t.status === 'open' || t.status === 'in_progress')

  useRealtime('home', ['orders', 'pick_tasks', 'stock_movements', 'app_settings', 'staff_tasks'])

  const firstName = (profile?.full_name ?? '').split(' ')[0]

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : 'BinTrack'}
        description="Every item has an address. Every movement has a record."
        actions={
          isAdmin ? (
            <Button asChild variant="secondary">
              <Link to="/admin">Admin dashboard</Link>
            </Button>
          ) : undefined
        }
      />

      {status && !status.open && (
        <Card className="mb-4 border-destructive/40 bg-destructive/12">
          <CardContent className="flex items-start gap-3 p-4 pt-4">
            <DoorClosed className="mt-0.5 size-6 shrink-0 text-destructive" aria-hidden />
            <div>
              <p className="text-h3 text-destructive">The warehouse is closed</p>
              <p className="text-sm">{status.closed_message ?? 'Operations are paused.'}</p>
              <p className="mt-1 text-small text-muted-foreground">
                Opens {describeHours(status)} ({status.timezone}){status.reason === 'manual' ? ' — closed by the admin' : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTasks.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="flex items-center gap-2 text-h3"><TasksIcon className="size-4 text-muted-foreground" aria-hidden />Your tasks ({activeTasks.length})</h2>
              <Button asChild variant="ghost" size="sm"><Link to="/tasks">All tasks<ArrowRight className="size-3.5" /></Link></Button>
            </div>
            <div className="space-y-2 p-3">
              {activeTasks.slice(0, 3).map((t) => <TaskCard key={t.id} task={t} busy={false} compact />)}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction to="/search" icon={Search} title="Find an item" description="Name, SKU or barcode" />
        <button type="button" onClick={openScanner} className="text-left">
          <QuickAction icon={ScanLine} title="Scan" description="Bin QR or product barcode" />
        </button>
        <QuickAction to="/receive" icon={PackagePlus} title="Receive stock" description="Inward with expiry" />
        <QuickAction to="/transfer" icon={Repeat} title="Transfer" description="Move between bins" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="text-h3">Orders to pick</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/orders">
                  All orders
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            {isLoading ? (
              <SkeletonRows rows={3} className="p-3" />
            ) : orders.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="Nothing waiting"
                description="New orders show up here the moment they are allocated."
                action={
                  <Button asChild size="sm">
                    <Link to="/orders/new">Create an order</Link>
                  </Button>
                }
                className="m-3 border-0"
              />
            ) : (
              <ul>
                {orders.map((order) => {
                  const total = order.tasks.length
                  const picked = order.tasks.filter((t) => t.status === 'picked').length
                  return (
                    <li key={order.id}>
                      <Link
                        to={`/orders/${order.id}`}
                        className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-0 hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-sm font-medium">
                            {order.order_number}
                          </span>
                          <span className="text-small text-muted-foreground">
                            {order.customer_name ?? 'No customer'} · {picked}/{total} picked
                          </span>
                        </span>
                        <OrderStatusChip status={order.status} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border p-3">
              <h2 className="text-h3">Recent movements</h2>
              <Button asChild variant="ghost" size="sm">
                <Link to="/movements">
                  Full log
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            {movements.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No stock has moved yet.
              </p>
            ) : (
              <ul>
                {movements.map((movement) => (
                  <li
                    key={movement.id}
                    className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">
                        <span className="font-medium uppercase">{movement.type}</span>{' '}
                        {movement.quantity} × {movement.sku}
                      </span>
                      <span className="location-code block truncate text-small text-muted-foreground">
                        {movement.from_location ?? '—'} → {movement.to_location ?? '—'}
                      </span>
                    </span>
                    <span className="shrink-0 text-small text-muted-foreground">
                      {relativeTime(movement.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function QuickAction({
  to,
  icon: Icon,
  title,
  description,
}: {
  to?: string
  icon: typeof Search
  title: string
  description: string
}) {
  const body = (
    <Card className="h-full transition-colors hover:bg-accent">
      <CardContent className="flex items-start gap-3 p-4 pt-4">
        <Icon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
        <span>
          <span className="block text-h3">{title}</span>
          <span className="block text-small text-muted-foreground">{description}</span>
        </span>
      </CardContent>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}
