import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-muted-foreground" role="status">
      <Loader2 className={cn('size-4 animate-spin', className)} aria-hidden />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  )
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center">
      <Spinner label={label} />
    </div>
  )
}
