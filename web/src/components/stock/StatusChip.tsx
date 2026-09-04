import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  PackageCheck,
  ScanLine,
  Truck,
} from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import type { AlertSeverity, AlertStatus, OrderStatus, PickStatus } from '@/types/database'

type Spec = { label: string; variant: BadgeProps['variant']; Icon: typeof Circle }

const ORDER: Record<OrderStatus, Spec> = {
  pending: { label: 'Pending', variant: 'default', Icon: Clock },
  allocated: { label: 'Allocated', variant: 'info', Icon: PackageCheck },
  partially_allocated: { label: 'Partially allocated', variant: 'warning', Icon: AlertTriangle },
  picking: { label: 'Picking', variant: 'info', Icon: ScanLine },
  picked: { label: 'Picked', variant: 'success', Icon: CheckCircle2 },
  shipped: { label: 'Shipped', variant: 'success', Icon: Truck },
  cancelled: { label: 'Cancelled', variant: 'default', Icon: Ban },
}

const PICK: Record<PickStatus, Spec> = {
  pending: { label: 'To pick', variant: 'default', Icon: Circle },
  verified: { label: 'Verified', variant: 'info', Icon: ScanLine },
  picked: { label: 'Picked', variant: 'success', Icon: CheckCircle2 },
  short: { label: 'Short', variant: 'warning', Icon: AlertTriangle },
  cancelled: { label: 'Cancelled', variant: 'default', Icon: Ban },
}

const ALERT_STATUS: Record<AlertStatus, Spec> = {
  active: { label: 'Active', variant: 'destructive', Icon: AlertTriangle },
  acknowledged: { label: 'Acknowledged', variant: 'info', Icon: CheckCircle2 },
  snoozed: { label: 'Snoozed', variant: 'default', Icon: Clock },
  resolved: { label: 'Resolved', variant: 'success', Icon: CheckCircle2 },
}

const SEVERITY: Record<AlertSeverity, Spec> = {
  info: { label: 'Info', variant: 'info', Icon: Circle },
  warning: { label: 'Warning', variant: 'warning', Icon: AlertTriangle },
  critical: { label: 'Critical', variant: 'destructive', Icon: AlertTriangle },
}

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <Chip spec={ORDER[status]} />
}
export function PickStatusChip({ status }: { status: PickStatus }) {
  return <Chip spec={PICK[status]} />
}
export function AlertStatusChip({ status }: { status: AlertStatus }) {
  return <Chip spec={ALERT_STATUS[status]} />
}
export function SeverityChip({ severity }: { severity: AlertSeverity }) {
  return <Chip spec={SEVERITY[severity]} />
}

function Chip({ spec }: { spec: Spec }) {
  const { label, variant, Icon } = spec
  return (
    <Badge variant={variant}>
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  )
}
