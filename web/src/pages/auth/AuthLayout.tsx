import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { HeroBackdrop } from '@/components/layout/HeroBackdrop'
import { cn } from '@/lib/utils'

/**
 * Chrome shared by every screen outside the app shell: the warehouse
 * photograph, a light-on-dark header and footer. `blurred` is the only
 * difference between the open landing view and the sign-in view, so the two
 * can cross-fade without remounting the image.
 */
export function AuthFrame({
  blurred,
  headerAction,
  children,
}: {
  blurred: boolean
  headerAction?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <HeroBackdrop blurred={blurred} />

      <header className="flex items-center justify-between px-4 py-3 text-white">
        <Logo />
        <div className="flex items-center gap-1">
          {headerAction}
          <ThemeToggle />
        </div>
      </header>

      {children}

      <footer className="px-4 py-4 text-center text-small text-white/70">
        BinTrack — every item has an address.
      </footer>
    </div>
  )
}

/**
 * The glass card the forms live in. Opaque enough that the design system's
 * text contrast holds; the photograph behind it is atmosphere, not a surface.
 */
export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'w-full max-w-sm space-y-6 rounded-lg border border-white/15 bg-card/95 p-6 shadow-lg backdrop-blur-md',
        'animate-in fade-in-0 zoom-in-95 duration-300',
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-display">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
    </div>
  )
}

/** Sign-up and password reset: the card, centred, over the blurred backdrop. */
export function AuthLayout(props: React.ComponentProps<typeof AuthCard>) {
  return (
    <AuthFrame blurred>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <AuthCard {...props} />
      </main>
    </AuthFrame>
  )
}
