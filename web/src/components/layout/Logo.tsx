import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/** Wordmark plus a bin-with-item glyph, monochrome so it works in both themes. */
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-semibold', className)}>
      <svg viewBox="0 0 32 32" className="size-5 shrink-0" aria-hidden fill="currentColor">
        <path d="M5 8a3 3 0 0 1 3-3h16a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8Zm3-1a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H8Z" />
        <circle cx="16" cy="16" r="4" />
      </svg>
      {!compact && <span className="text-base tracking-tight">BinTrack</span>}
      <span className="sr-only">BinTrack home</span>
    </Link>
  )
}
