import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Semantic backgrounds are the hue at 12 % alpha so they read the same in both
// themes without a second palette (UI/UX §2.2).
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-small font-medium',
  {
    variants: {
      variant: {
        default: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-success/12 text-success',
        warning: 'border-transparent bg-warning/12 text-warning',
        destructive: 'border-transparent bg-destructive/12 text-destructive',
        info: 'border-transparent bg-info/12 text-info',
        reserved: 'border-transparent bg-reserved/12 text-reserved',
        solid: 'border-transparent bg-primary text-primary-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { badgeVariants }
