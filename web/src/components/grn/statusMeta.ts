import {
  Ban,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Truck,
  Warehouse,
} from 'lucide-react'
import type { GrnStatus, PoStatus, SealStatus } from '@/types/database'

/**
 * Each stage of a truck's visit gets one of the palette's five hues, so a
 * wall of receipts reads at a glance without a second brand colour:
 * arrived blue → verifying yellow → verified turquoise → put-away green →
 * completed ink. Tints are the hue at 15 % so both themes read the same.
 */
export type Tone = {
  label: string
  chip: string
  dot: string
  /** Text colour that sits on `dot` — black on yellow, never inverted. */
  dotFg: string
  soft: string
  icon: typeof Truck
}

export const GRN_STATUS: Record<GrnStatus, Tone> = {
  arrived: {
    dotFg: 'text-info-foreground',
    label: 'Arrived',
    chip: 'bg-info/15 text-info border-info/30',
    dot: 'bg-info',
    soft: 'bg-card',
    icon: Truck,
  },
  verifying: {
    dotFg: 'text-warning-foreground',
    label: 'Verifying',
    chip: 'bg-warning/15 text-warning border-warning/30',
    dot: 'bg-warning',
    soft: 'bg-card',
    icon: ClipboardCheck,
  },
  verified: {
    dotFg: 'text-reserved-foreground',
    label: 'Verified',
    chip: 'bg-reserved/15 text-reserved border-reserved/30',
    dot: 'bg-reserved',
    soft: 'bg-card',
    icon: PackageCheck,
  },
  put_away: {
    dotFg: 'text-success-foreground',
    label: 'Put-away',
    chip: 'bg-success/15 text-success border-success/30',
    dot: 'bg-success',
    soft: 'bg-card',
    icon: Warehouse,
  },
  completed: {
    dotFg: 'text-background',
    label: 'Completed',
    chip: 'bg-foreground/15 text-foreground border-foreground/30',
    dot: 'bg-foreground',
    soft: 'bg-card',
    icon: CheckCircle2,
  },
  cancelled: {
    dotFg: 'text-background',
    label: 'Cancelled',
    chip: 'bg-muted-foreground/15 text-muted-foreground border-muted-foreground/30',
    dot: 'bg-muted-foreground',
    soft: 'bg-card',
    icon: Ban,
  },
}

export const PO_STATUS: Record<PoStatus, { label: string; chip: string }> = {
  open: { label: 'Open', chip: 'bg-info/15 text-info border-info/30' },
  partially_received: {
    label: 'Partially received',
    chip: 'bg-warning/15 text-warning border-warning/30',
  },
  received: { label: 'Received', chip: 'bg-success/15 text-success border-success/30' },
  closed: { label: 'Closed', chip: 'bg-muted text-muted-foreground border-border' },
  cancelled: {
    label: 'Cancelled',
    chip: 'bg-destructive/15 text-destructive border-destructive/30',
  },
}

export const SEAL: Record<SealStatus, { label: string; chip: string; icon: typeof ShieldCheck }> = {
  intact: {
    label: 'Seal intact',
    chip: 'bg-success/15 text-success border-success/30',
    icon: ShieldCheck,
  },
  broken: {
    label: 'Seal broken',
    chip: 'bg-destructive/15 text-destructive border-destructive/30',
    icon: ShieldAlert,
  },
  missing: {
    label: 'Seal missing',
    chip: 'bg-destructive/15 text-destructive border-destructive/30',
    icon: ShieldOff,
  },
}
