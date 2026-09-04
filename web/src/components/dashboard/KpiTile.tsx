import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** Small uppercase label, 28 px tabular value, optional sublabel (UI/UX §5). */
export function KpiTile({
  label,
  value,
  sublabel,
  icon: Icon,
  tone = 'neutral',
  to,
  loading,
}: {
  label: string
  value: string | number
  sublabel?: string
  icon?: LucideIcon
  tone?: 'neutral' | 'success' | 'warning' | 'destructive' | 'info'
  to?: string
  loading?: boolean
}) {
  const toneClass = {
    neutral: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
    info: 'text-info',
  }[tone]

  const body = (
    <div className="flex h-full flex-col justify-between gap-1.5 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="label-small">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <p className={cn('kpi-value', toneClass)}>{value}</p>
      )}
      {sublabel && <p className="text-small text-muted-foreground">{sublabel}</p>}
    </div>
  )

  if (!to) return body
  return (
    <Link to={to} className="rounded-lg transition-colors hover:bg-accent/40">
      {body}
    </Link>
  )
}
