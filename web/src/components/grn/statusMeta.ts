import { Ban, CheckCircle2, ClipboardCheck, PackageCheck, ShieldAlert, ShieldCheck, ShieldOff, Truck, Warehouse } from 'lucide-react'
import type { GrnStatus, PoStatus, SealStatus } from '@/types/database'

/**
 * The receiving module is the one place the design system's "calm by default"
 * rule bends: every stage of a truck's visit gets its own hue, so a wall of
 * receipts reads at a glance. Each pair is chosen to hold contrast in both
 * themes (tinted background, saturated text).
 */
export type Tone = {
  label: string
  chip: string
  dot: string
  soft: string
  icon: typeof Truck
}

export const GRN_STATUS: Record<GrnStatus, Tone> = {
  arrived: {
    label: 'Arrived',
    chip: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300',
    dot: 'bg-sky-500',
    soft: 'from-sky-500/20 to-sky-500/5',
    icon: Truck,
  },
  verifying: {
    label: 'Verifying',
    chip: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300',
    dot: 'bg-amber-500',
    soft: 'from-amber-500/20 to-amber-500/5',
    icon: ClipboardCheck,
  },
  verified: {
    label: 'Verified',
    chip: 'bg-violet-500/15 text-violet-700 border-violet-500/30 dark:text-violet-300',
    dot: 'bg-violet-500',
    soft: 'from-violet-500/20 to-violet-500/5',
    icon: PackageCheck,
  },
  put_away: {
    label: 'Put-away',
    chip: 'bg-teal-500/15 text-teal-700 border-teal-500/30 dark:text-teal-300',
    dot: 'bg-teal-500',
    soft: 'from-teal-500/20 to-teal-500/5',
    icon: Warehouse,
  },
  completed: {
    label: 'Completed',
    chip: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    soft: 'from-emerald-500/20 to-emerald-500/5',
    icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled',
    chip: 'bg-neutral-500/15 text-neutral-600 border-neutral-500/30 dark:text-neutral-300',
    dot: 'bg-neutral-500',
    soft: 'from-neutral-500/20 to-neutral-500/5',
    icon: Ban,
  },
}

export const PO_STATUS: Record<PoStatus, { label: string; chip: string }> = {
  open: { label: 'Open', chip: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300' },
  partially_received: { label: 'Partially received', chip: 'bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300' },
  received: { label: 'Received', chip: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300' },
  closed: { label: 'Closed', chip: 'bg-neutral-500/15 text-neutral-600 border-neutral-500/30 dark:text-neutral-300' },
  cancelled: { label: 'Cancelled', chip: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300' },
}

export const SEAL: Record<SealStatus, { label: string; chip: string; icon: typeof ShieldCheck }> = {
  intact: { label: 'Seal intact', chip: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300', icon: ShieldCheck },
  broken: { label: 'Seal broken', chip: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300', icon: ShieldAlert },
  missing: { label: 'Seal missing', chip: 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300', icon: ShieldOff },
}
