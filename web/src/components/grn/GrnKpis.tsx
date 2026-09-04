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

type Tone = 'sky' | 'amber' | 'rose' | 'violet' | 'emerald' | 'indigo'

const TONES: Record<Tone, { bg: string; icon: string; value: string; ring: string }> = {
  sky:     { bg: 'from-sky-500/25 via-sky-500/10 to-transparent',       icon: 'bg-sky-500 text-white',     value: 'text-sky-700 dark:text-sky-200',         ring: 'hover:ring-sky-500/40' },
  amber:   { bg: 'from-amber-500/25 via-amber-500/10 to-transparent',   icon: 'bg-amber-500 text-white',   value: 'text-amber-700 dark:text-amber-200',     ring: 'hover:ring-amber-500/40' },
  rose:    { bg: 'from-rose-500/25 via-rose-500/10 to-transparent',     icon: 'bg-rose-500 text-white',    value: 'text-rose-700 dark:text-rose-200',       ring: 'hover:ring-rose-500/40' },
  violet:  { bg: 'from-violet-500/25 via-violet-500/10 to-transparent', icon: 'bg-violet-500 text-white',  value: 'text-violet-700 dark:text-violet-200',   ring: 'hover:ring-violet-500/40' },
  emerald: { bg: 'from-emerald-500/25 via-emerald-500/10 to-transparent', icon: 'bg-emerald-500 text-white', value: 'text-emerald-700 dark:text-emerald-200', ring: 'hover:ring-emerald-500/40' },
  indigo:  { bg: 'from-indigo-500/25 via-indigo-500/10 to-transparent', icon: 'bg-indigo-500 text-white',  value: 'text-indigo-700 dark:text-indigo-200',   ring: 'hover:ring-indigo-500/40' },
}

/** A KPI tile with a tinted gradient and a solid icon badge — the receiving
 *  dashboard's answer to the neutral tiles elsewhere. */
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
        'flex h-full items-start gap-3 rounded-lg border border-border bg-gradient-to-br p-3 transition-shadow',
        t.bg,
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
          <p className={cn('kpi-value', t.value)}>{typeof value === 'number' ? formatNumber(value) : value}</p>
        )}
        {sublabel && <p className="text-small text-muted-foreground">{sublabel}</p>}
      </div>
    </div>
  )
  return to ? <Link to={to} className="block rounded-lg">{body}</Link> : body
}

/** The five figures the spec asks the admin to see, plus what came in today. */
export function GrnKpiStrip({ data, loading }: { data: GrnDashboard | null | undefined; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <ColourKpi label="Total GRNs" value={data?.total ?? 0} icon={Truck} tone="indigo" to="/grn?status=all" loading={loading} />
      <ColourKpi
        label="Pending verification"
        value={data?.pending_verification ?? 0}
        icon={ClipboardCheck}
        tone="amber"
        to="/grn?status=verifying"
        loading={loading}
      />
      <ColourKpi
        label="Discrepancies"
        value={data?.discrepancies ?? 0}
        sublabel="unresolved"
        icon={AlertTriangle}
        tone="rose"
        to="/grn?status=discrepancy"
        loading={loading}
      />
      <ColourKpi
        label="Pending put-away"
        value={data?.pending_put_away ?? 0}
        icon={PackageCheck}
        tone="violet"
        to="/grn?status=put_away"
        loading={loading}
      />
      <ColourKpi
        label="Completed"
        value={data?.completed ?? 0}
        icon={CheckCircle2}
        tone="emerald"
        to="/grn?status=completed"
        loading={loading}
      />
      <ColourKpi
        label="Open POs"
        value={data?.open_purchase_orders ?? 0}
        sublabel={`${formatNumber(data?.units_put_away_today ?? 0)} units put away today`}
        icon={ClipboardList}
        tone="sky"
        to="/admin/purchase-orders"
        loading={loading}
      />
    </div>
  )
}
