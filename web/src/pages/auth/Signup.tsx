import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { useAuth } from '@/stores/auth'
import { parseError } from '@/lib/errors'

export default function Signup() {
  const navigate = useNavigate()
  const { signUp } = useAuth()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, fullName.trim())
      if (needsConfirmation) setAwaitingConfirmation(true)
      else navigate('/', { replace: true })
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setBusy(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout title="Confirm your email" description={`We sent a link to ${email}.`}>
        <p className="text-sm text-muted-foreground">
          Open it to activate your account, then sign in. New accounts start as warehouse staff; an
          inventory admin can promote you.
        </p>
        <Button asChild className="w-full">
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Create your account"
      description="New accounts start with staff access."
      footer={
        <p>
          Already have one?{' '}
          <Link to="/login" className="underline underline-offset-2 hover:no-underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="name" required>
          <Input
            id="name"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Priya Sharma"
          />
        </Field>

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

        <Field label="Password" htmlFor="password" required hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
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
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
