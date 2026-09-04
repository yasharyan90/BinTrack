import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/utils'

/** Quantity with the reserved portion called out in the reserved hue. */
export function QtyBadge({
  quantity,
  reserved = 0,
  className,
}: {
  quantity: number
  reserved?: number
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 tabular', className)}>
      <span className="font-medium">{formatNumber(quantity)}</span>
      {reserved > 0 && (
        <span className="text-small text-reserved" title={`${reserved} reserved for open orders`}>
          ({formatNumber(reserved)} res)
        </span>
      )}
    </span>
  )
}
