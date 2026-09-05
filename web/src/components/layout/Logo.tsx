import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/**
 * The BinTrack mark: a black app-icon tile with a silver "B" of shelving and
 * a green location pin (public/images/logo-*.png). The tile carries its own
 * background, so it reads the same in both themes; the rounded clip hides the
 * source's square black corners at small sizes.
 */
export function LogoMark({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const px = { sm: 'size-6 rounded-md', md: 'size-8 rounded-lg', lg: 'size-12 rounded-xl', xl: 'size-20 rounded-2xl' }[size]
  return (
    <img
      src="/images/logo-96.png"
      srcSet="/images/logo-96.png 96w, /images/logo-256.png 256w"
      sizes="96px"
      alt=""
      decoding="async"
      className={cn('shrink-0 object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]', px, className)}
    />
  )
}

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('flex items-center gap-2 font-semibold', className)}>
      <LogoMark size={compact ? 'md' : 'md'} />
      {!compact && <span className="text-base tracking-tight">BinTrack</span>}
      <span className="sr-only">BinTrack home</span>
    </Link>
  )
}
