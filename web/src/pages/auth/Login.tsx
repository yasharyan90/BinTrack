import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { useAuth } from '@/stores/auth'
import { useAppToast } from '@/hooks/useAppToast'
import { parseError } from '@/lib/errors'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signInWithMagicLink } = useAuth()
  const { showSuccess } = useAppToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const from = (location.state as { from?: string } | null)?.from

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

  return (
    <AuthLayout
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
    </AuthLayout>
  )
}
