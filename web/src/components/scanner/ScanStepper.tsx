import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ScanStep = 'bin' | 'product' | 'quantity'

const STEPS: { key: ScanStep; label: string }[] = [
  { key: 'bin', label: 'Scan bin' },
  { key: 'product', label: 'Scan product' },
  { key: 'quantity', label: 'Quantity' },
]

/** Bin → Product → Qty. The current step is announced for screen readers. */
export function ScanStepper({ current }: { current: ScanStep }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <ol className="flex items-center gap-1.5" aria-label="Scan progress">
      {STEPS.map((step, index) => {
        const done = index < currentIndex
        const active = index === currentIndex
        return (
          <li key={step.key} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border text-small font-medium',
                done && 'border-success bg-success text-success-foreground',
                active && 'border-foreground bg-foreground text-background',
                !done && !active && 'border-border text-muted-foreground',
              )}
              aria-hidden
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'truncate text-sm',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className={cn('h-px flex-1', done ? 'bg-success' : 'bg-border')} aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}
