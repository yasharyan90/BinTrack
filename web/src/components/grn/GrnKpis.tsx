import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  PackageCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatNumber } from '@/lib/utils'
import type { GrnDashboard } from '@/types/app'

type Tone = 'info' | 'warning' | 'destructive' | 'reserved' | 'success'

const TONES: Record<Tone, { icon: string; value: string; ring: string }> = {
  info: { icon: 'bg-info text-info-foreground', value: 'text-info', ring: 'hover:ring-info/40' },
  warning: {
    icon: 'bg-warning text-warning-foreground',
    value: 'text-warning',
    ring: 'hover:ring-warning/40',
  },
  destructive: {
    icon: 'bg-destructive text-destructive-foreground',
    value: 'text-destructive',
    ring: 'hover:ring-destructive/40',
  },
  reserved: {
    icon: 'bg-reserved text-reserved-foreground',
    value: 'text-reserved',
    ring: 'hover:ring-reserved/40',
  },
  success: {
    icon: 'bg-success text-success-foreground',
    value: 'text-success',
    ring: 'hover:ring-success/40',
  },
}

/** A KPI tile on the card surface with a solid icon badge in its hue —
 *  colour on the badge and the figure, never a surface fill. */
export function ColourKpi({
  label,
  value,
  sublabel,
  icon: Icon,
  tone,
  to,
  loading,
}: {
  label: string
  value: number | string
  sublabel?: string
  icon: LucideIcon
  tone: Tone
  to?: string
  loading?: boolean
}) {
  const t = TONES[tone]
  const body = (
    <div
      className={cn(
        'flex h-full items-start gap-3 rounded-lg border border-border bg-card p-3 transition-shadow',
        to && cn('ring-0 hover:ring-2', t.ring),
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md', t.icon)}>
        <Icon className="size-4" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="label-small">{label}</p>
        {loading ? (
          <Skeleton className="mt-1 h-7 w-16" />
        ) : (
          <p className={cn('kpi-value', t.value)}>
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
        )}
        {sublabel && <p className="text-small text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  )
  return to ? (
    <Link to={to} className="block rounded-lg">
      {body}
    </Link>
  ) : (
    body
  )
}

/** The five figures the spec asks the admin to see, plus what came in today. */
export function GrnKpiStrip({
  data,
  loading,
}: {
  data: GrnDashboard | null | undefined
  loading: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <ColourKpi
        label="Total GRNs"
        value={data?.total ?? 0}
        icon={Truck}
        tone="info"
        to="/grn?status=all"
        loading={loading}
      />
      <ColourKpi
        label="Pending verification"
        value={data?.pending_verification ?? 0}
        icon={ClipboardCheck}
        tone="warning"
        to="/grn?status=verifying"
        loading={loading}
      />
      <ColourKpi
        label="Discrepancies"
        value={data?.discrepancies ?? 0}
        sublabel="unresolved"
        icon={AlertTriangle}
        tone="destructive"
        to="/grn?status=discrepancy"
        loading={loading}
      />
      <ColourKpi
        label="Pending put-away"
        value={data?.pending_put_away ?? 0}
        icon={PackageCheck}
        tone="reserved"
        to="/grn?status=put_away"
        loading={loading}
      />
      <ColourKpi
        label="Completed"
        value={data?.completed ?? 0}
        icon={CheckCircle2}
        tone="success"
        to="/grn?status=completed"
        loading={loading}
      />
      <ColourKpi
        label="Open POs"
        value={data?.open_purchase_orders ?? 0}
        sublabel={`${formatNumber(data?.units_put_away_today ?? 0)} units put away today`}
        icon={ClipboardList}
        tone="info"
        to="/admin/purchase-orders"
        loading={loading}
      />
    </div>
  )
}
