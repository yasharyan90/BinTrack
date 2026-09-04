import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { useAuth } from '@/stores/auth'
import { parseError } from '@/lib/errors'

export default function ForgotPassword() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await resetPassword(email.trim())
      setSent(true)
    } catch (err) {
      setError(parseError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      description={sent ? undefined : 'We will email you a link to set a new one.'}
      footer={
        <Link to="/login" className="underline underline-offset-2 hover:no-underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <p className="rounded-md bg-success/12 px-3 py-2 text-sm text-success">
          If an account exists for {email}, a reset link is on its way.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error && (
            <p className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
