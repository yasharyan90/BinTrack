import { Logo } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h1 className="text-display">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
          {footer && <div className="text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>

      <footer className="px-4 py-4 text-center text-small text-muted-foreground">
        BinTrack — every item has an address.
      </footer>
    </div>
  )
}
