import { useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bell, Info, Mail, ScanLine, Search } from 'lucide-react'
import { AuthCard, AuthFrame } from './AuthLayout'
import { LogoMark } from '@/components/layout/Logo'
import { AboutDialog } from './AboutDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { useAuth } from '@/stores/auth'
import { useAppToast } from '@/hooks/useAppToast'
import { parseError } from '@/lib/errors'

const PROOF_POINTS = [
  {
    icon: Search,
    title: 'Instant search',
    text: 'Typo-tolerant lookup by name, SKU or barcode — every bin and quantity in under a second.',
  },
  {
    icon: ScanLine,
    title: 'Scan-verified picks',
    text: 'Bin QR, then product barcode. A wrong bin or an expired lot is blocked, not shipped.',
  },
  {
    icon: Bell,
    title: 'Live alerts',
    text: 'Low stock, expiring lots and pick discrepancies reach the dashboard the moment they happen.',
  },
]

/**
 * `/login` opens as a landing view over the warehouse photograph; **Log in**
 * blurs the photograph and brings the form forward. A visitor bounced here by
 * a route guard, or arriving with `?form`, goes straight to the form — nobody
 * who was already trying to get in should have to click twice.
 */
export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { signIn, signInWithMagicLink } = useAuth()
  const { showSuccess } = useAppToast()

  const from = (location.state as { from?: string } | null)?.from
  const [mode, setMode] = useState<'landing' | 'form'>(
    from || params.has('form') ? 'form' : 'landing',
  )

  const [aboutOpen, setAboutOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      // The role decides the landing page (App Flow §3.2); the guard sends an
      // admin on to /admin from "/" if that is where they belong.
      navigate(from ?? '/', { replace: true })
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const sendMagicLink = async () => {
    if (!email.trim()) {
      setError('Enter your email address first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signInWithMagicLink(email.trim())
      setMagicSent(true)
      showSuccess('Check your inbox', `A sign-in link is on its way to ${email.trim()}.`)
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setBusy(false)
    }
  }

  const openForm = () => setMode('form')

  return (
    <AuthFrame
      blurred={mode === 'form'}
      headerAction={
        <>
          <Button
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            onClick={() => setAboutOpen(true)}
          >
            <Info />
            About
          </Button>
          {mode === 'landing' ? (
            <Button variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={openForm}>
              Log in
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
              onClick={() => setMode('landing')}
            >
              <ArrowLeft />
              Back
            </Button>
          )}
        </>
      }
    >
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {mode === 'landing' ? (
        <main className="flex flex-1 items-center px-4 py-10 sm:px-8 lg:px-16">
          <div className="max-w-2xl space-y-8 text-white animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
            <div className="space-y-4">
              <LogoMark size="xl" className="shadow-[0_0_40px_-8px_rgba(46,224,160,0.6)]" />
              <p className="label-small text-white/70">Multi-warehouse inventory &amp; location tracking</p>
              <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
                Every item has an address.
              </h1>
              <p className="max-w-xl text-base text-white/85 sm:text-lg">
                Orders land, and the picker already knows the row and bin. Every movement is
                recorded, every pick is scanned, and every problem raises its hand before it
                costs money.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                className="bg-white text-neutral-950 hover:bg-white/90"
                onClick={openForm}
              >
                Log in
                <ArrowRight />
              </Button>
              <Button
                asChild
                size="lg"
                variant="secondary"
                className="border-white/40 bg-transparent text-white hover:bg-white/15 hover:text-white"
              >
                <Link to="/signup">Create account</Link>
              </Button>
            </div>

            <ul className="grid gap-4 sm:grid-cols-3">
              {PROOF_POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="space-y-1.5 rounded-lg border border-white/15 bg-black/30 p-4 backdrop-blur-sm">
                  <Icon className="size-5 text-white/80" strokeWidth={1.75} aria-hidden />
                  <p className="text-h3 text-white">{title}</p>
                  <p className="text-small text-white/75">{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 items-center justify-center px-4 py-8">
          <AuthCard
            title="Sign in"
            description="Find any item, verify every pick."
            footer={
              <p>
                No account yet?{' '}
                <Link to="/signup" className="underline underline-offset-2 hover:no-underline">
                  Create one
                </Link>
              </p>
            }
          >
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </Field>

              <Field label="Password" htmlFor="password" required>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {error && (
                <p className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" loading={busy}>
                Sign in
              </Button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={() => void sendMagicLink()}
                  className="inline-flex items-center gap-1.5 text-muted-foreground underline underline-offset-2 hover:no-underline"
                  disabled={busy || magicSent}
                >
                  <Mail className="size-3.5" aria-hidden />
                  {magicSent ? 'Link sent' : 'Email me a link'}
                </button>
                <Link
                  to="/forgot-password"
                  className="text-muted-foreground underline underline-offset-2 hover:no-underline"
                >
                  Forgot password?
                </Link>
              </div>
            </form>
          </AuthCard>
        </main>
      )}
    </AuthFrame>
  )
}
