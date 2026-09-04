import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Icon + one-line reason + a single call to action (UI/UX §5). */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
    >
      <Icon className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <div className="space-y-1">
        <p className="text-h3">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  )
}
