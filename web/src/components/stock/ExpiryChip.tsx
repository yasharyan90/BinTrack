import { Badge } from '@/components/ui/badge'
import { daysUntil, formatDate, relativeDays } from '@/lib/utils'

/**
 * Colour follows urgency: > 30 d muted, ≤ 30 d warning, ≤ 7 d destructive,
 * already expired filled (UI/UX §5). Text carries the same signal as the colour.
 */
export function ExpiryChip({
  date,
  days,
  showDate = true,
}: {
  date: string | null | undefined
  days?: number | null
  showDate?: boolean
}) {
  if (!date) return <span className="text-muted-foreground">—</span>

  const left = days ?? daysUntil(date)
  const variant =
    left === null ? 'default' : left < 0 ? 'destructive' : left <= 7 ? 'destructive' : left <= 30 ? 'warning' : 'default'

  return (
    <Badge variant={variant} title={`Expires ${formatDate(date)}`}>
      {showDate && <span className="tabular">{formatDate(date)}</span>}
      <span className={showDate ? 'opacity-80' : undefined}>
        {left !== null && left < 0 ? 'expired' : relativeDays(left)}
      </span>
    </Badge>
  )
}
