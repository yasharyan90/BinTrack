import { Ban, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GrnStatus, PoStatus, SealStatus } from '@/types/database'
import { GRN_STATUS, PO_STATUS, SEAL } from './statusMeta'

const chipBase =
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-small font-medium'

export function GrnStatusChip({ status, className }: { status: GrnStatus; className?: string }) {
  const { label, chip, icon: Icon } = GRN_STATUS[status]
  return (
    <span className={cn(chipBase, chip, className)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

export function PoStatusChip({ status }: { status: PoStatus }) {
  const { label, chip } = PO_STATUS[status]
  return <span className={cn(chipBase, chip)}>{label}</span>
}

export function SealChip({ status }: { status: SealStatus }) {
  const { label, chip, icon: Icon } = SEAL[status]
  return (
    <span className={cn(chipBase, chip)}>
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  )
}

const STEPS: GrnStatus[] = ['arrived', 'verifying', 'verified', 'put_away', 'completed']

/** Where the truck is in its visit; each completed stage keeps its own colour. */
export function GrnStepper({ status }: { status: GrnStatus }) {
  if (status === 'cancelled') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-muted-foreground/30 bg-muted-foreground/10 px-3 py-2 text-sm">
        <Ban className="size-4" aria-hidden />
        This GRN was cancelled. No stock entered inventory.
      </div>
    )
  }
  const current = STEPS.indexOf(status)
  return (
    <ol className="flex items-center gap-1" aria-label="Receiving progress">
      {STEPS.map((step, index) => {
        const tone = GRN_STATUS[step]
        const done = index < current
        const active = index === current
        const Icon = tone.icon
        return (
          <li key={step} className="flex flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors',
                done || active
                  ? cn(tone.dot, tone.dotFg, 'border-transparent')
                  : 'border-border bg-muted text-muted-foreground',
                active && 'ring-2 ring-offset-2 ring-offset-background',
                active && tone.dot.replace('bg-', 'ring-'),
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <Check className="size-3.5" aria-hidden />
              ) : (
                <Icon className="size-3.5" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                'hidden truncate text-small sm:block',
                active ? 'font-semibold' : 'text-muted-foreground',
              )}
            >
              {tone.label}
            </span>
            {index < STEPS.length - 1 && (
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full',
                  index < current ? tone.dot : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
