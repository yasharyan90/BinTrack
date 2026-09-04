import { cn } from '@/lib/utils'

/**
 * Full-viewport warehouse photograph behind the auth screens.
 *
 * The image is decorative, so it carries an empty alt and every word on top of
 * it sits on a dark gradient — white text over a bright photo would fail the
 * 4.5:1 contrast the design system promises (UI/UX §8). `blurred` swaps the
 * open landing view for the softened backdrop the sign-in card sits on; the
 * change is a filter transition, which `prefers-reduced-motion` collapses to
 * an instant swap via the global rule.
 */
export function HeroBackdrop({ blurred }: { blurred: boolean }) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-neutral-950" aria-hidden>
      <picture>
        <source srcSet="/images/warehouse-hero.avif" type="image/avif" />
        <img
          src="/images/warehouse-hero.jpg"
          alt=""
          fetchPriority="high"
          decoding="async"
          className={cn(
            'size-full object-cover object-center transition-[filter,transform] duration-500 ease-out',
            // Scaling slightly hides the blurred edge that would otherwise show
            // the backdrop colour around the frame.
            blurred ? 'scale-105 blur-md' : 'scale-100 blur-0',
          )}
        />
      </picture>

      {/* Landing: text sits on the darker left; the forklifts stay visible right. */}
      <div
        className={cn(
          'absolute inset-0 bg-gradient-to-r from-black/80 via-black/55 to-black/25 transition-opacity duration-500',
          blurred ? 'opacity-0' : 'opacity-100',
        )}
      />
      {/* Form: an even veil so the card reads the same wherever it lands. */}
      <div
        className={cn(
          'absolute inset-0 bg-black/60 transition-opacity duration-500',
          blurred ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
