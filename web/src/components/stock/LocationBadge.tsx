import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * The bin code is the hero of every screen (UI/UX §1): always mono, always
 * tabular, always the largest thing on a pick card.
 */
export function LocationBadge({
  code,
  size = 'sm',
  binId,
  className,
}: {
  code: string | null | undefined
  size?: 'sm' | 'md' | 'lg'
  binId?: string | null
  className?: string
}) {
  if (!code) {
    return <span className={cn('text-sm text-muted-foreground', className)}>Unallocated</span>
  }

  const sizes = {
    sm: 'text-sm px-2 py-0.5',
    md: 'text-base px-2.5 py-1',
    lg: 'text-2xl leading-7 px-3 py-1.5',
  }

  const content = (
    <span
      className={cn(
        'location-code inline-flex items-center rounded-md border border-border bg-muted/60',
        sizes[size],
        className,
      )}
    >
      {code}
    </span>
  )

  if (!binId) return content
  return (
    <Link to={`/bins/${binId}`} className="rounded-md hover:opacity-80" title={`Open ${code}`}>
      {content}
    </Link>
  )
}
