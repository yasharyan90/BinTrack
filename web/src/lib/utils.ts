import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numberFormat = new Intl.NumberFormat('en-IN')
const currencyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export function formatNumber(n: number | null | undefined): string {
  return numberFormat.format(n ?? 0)
}

export function formatCurrency(n: number | null | undefined): string {
  return currencyFormat.format(n ?? 0)
}

/** Large money reads better in lakh/crore on a KPI tile than as 8 digits. */
export function formatCompactCurrency(n: number | null | undefined): string {
  const value = n ?? 0
  if (Math.abs(value) >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`
  if (Math.abs(value) >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`
  return currencyFormat.format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

/** "in 12 d" / "6 d ago" — short enough for a chip. */
export function relativeDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return '—'
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} d`
  return `${Math.abs(days)} d ago`
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.round(diffMs / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} d ago`
  return formatDate(value)
}

export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null
  const target = new Date(`${date}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/**
 * Expiry dates are local calendar dates, not instants. `toISOString()` would
 * convert to UTC first, which puts anyone east of Greenwich a day out in the
 * evening — so the components are read in local time instead.
 */
function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function addDaysIso(days: number, from = new Date()): string {
  const d = new Date(from)
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

/** Trailing debounce, used by the search box and by realtime invalidation. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
  wrapped.cancel = () => timer && clearTimeout(timer)
  return wrapped
}

export function pluralise(n: number, singular: string, plural = `${singular}s`): string {
  return n === 1 ? singular : plural
}

export function isLocationCode(value: string): boolean {
  return /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i.test(value.trim())
}
