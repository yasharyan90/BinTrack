import { cn } from '@/lib/utils'

/**
 * Available stock against the reorder point. The bar is a ratio, so the label
 * repeats the numbers — colour is never the only signal (UI/UX §8).
 */
export function StockHealthBar({
  available,
  reorderPoint,
  className,
  showLabel = true,
}: {
  available: number
  reorderPoint: number
  className?: string
  showLabel?: boolean
}) {
  const target = Math.max(reorderPoint * 2, 1)
  const pct = Math.min(100, Math.round((available / target) * 100))
  const tone =
    available <= 0 ? 'bg-destructive' : available <= reorderPoint ? 'bg-warning' : 'bg-success'
  const label =
    available <= 0 ? 'Out of stock' : available <= reorderPoint ? 'Low stock' : 'Healthy'

  return (
    <div className={cn('space-y-1', className)}>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={available}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${label}: ${available} available, reorder point ${reorderPoint}`}
      >
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
      {showLabel && (
        <p className="text-small text-muted-foreground">
          {label} · {available} available · reorder at {reorderPoint}
        </p>
      )}
    </div>
  )
}
