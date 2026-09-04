import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListOrdered, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { OrderStatusChip } from '@/components/stock/StatusChip'
import { useOrders } from '@/hooks/useOrders'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtime } from '@/hooks/useRealtime'
import { formatDateTime } from '@/lib/utils'
import type { OrderStatus } from '@/types/database'

const STATUSES: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'allocated', label: 'Allocated' },
  { value: 'partially_allocated', label: 'Partially allocated' },
  { value: 'picking', label: 'Picking' },
  { value: 'picked', label: 'Picked' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function Orders() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)

  const { data: orders = [], isLoading } = useOrders({ status, search: debounced })

  useRealtime('orders', ['orders', 'pick_tasks'])

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order carries its pick locations from the moment it lands."
        actions={
          <Button asChild>
            <Link to="/orders/new">
              <Plus />
              New order
            </Link>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number or customer…"
            className="pl-9"
            aria-label="Search orders"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | 'all')}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ListOrdered}
          title="No orders here"
          description={
            status === 'all'
              ? 'Create one manually, import a CSV, or push one through the order webhook.'
              : 'Try a different status filter.'
          }
          action={
            <Button asChild>
              <Link to="/orders/new">Create an order</Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Picked</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const ordered = order.items.reduce((s, i) => s + i.quantity, 0)
                const picked = order.items.reduce((s, i) => s + i.picked_qty, 0)
                return (
                  <TableRow key={order.id} className="cursor-pointer">
                    <TableCell>
                      <Link
                        to={`/orders/${order.id}`}
                        className="font-mono text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {order.order_number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-muted-foreground">
                      {order.customer_name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <OrderStatusChip status={order.status} />
                    </TableCell>
                    <TableCell className="text-right tabular">{order.items.length}</TableCell>
                    <TableCell className="text-right tabular">
                      {picked}/{ordered}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(order.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{order.source}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
