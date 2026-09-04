import { useEffect, useState } from 'react'
import { Monitor, Moon, Save, Sun } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { useUpdateOwnProfile } from '@/hooks/useSettings'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { useTheme, type Theme } from '@/stores/theme'
import { formatDate } from '@/lib/utils'

const THEMES: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export default function Profile() {
  const { profile, refreshProfile, updatePassword } = useAuth()
  const { theme, setTheme } = useTheme()
  const update = useUpdateOwnProfile()
  const { showSuccess, showError } = useAppToast()

  const [fullName, setFullName] = useState('')
  const [digest, setDigest] = useState(false)
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setDigest(((profile.preferences ?? {}) as Record<string, unknown>).email_digest === true)
  }, [profile])

  if (!profile) return null
  const isAdmin = profile.role === 'inventory_admin'

  const save = async () => {
    try {
      await update.mutateAsync({
        userId: profile.id,
        fullName: fullName.trim(),
        preferences: {
          ...((profile.preferences ?? {}) as Record<string, unknown>),
          theme,
          email_digest: digest,
        },
      })
      await refreshProfile()
      showSuccess('Profile saved')
    } catch (error) {
      showError(error, 'Could not save your profile')
    }
  }

  const changePassword = async () => {
    if (password.length < 8) {
      showError('INVALID:use at least 8 characters', 'Password too short')
      return
    }
    try {
      await updatePassword(password)
      setPassword('')
      showSuccess('Password updated')
    } catch (error) {
      showError(error, 'Could not update your password')
    }
  }

  return (
    <>
      <PageHeader title="Profile" description="Your details, theme and notification preferences." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4 pt-4">
            <h2 className="text-h3">Account</h2>

            <Field label="Full name" htmlFor="full-name">
              <Input id="full-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>

            <Field label="Email" htmlFor="email" hint="Only an admin can change this.">
              <Input id="email" value={profile.email ?? ''} disabled />
            </Field>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={isAdmin ? 'solid' : 'default'}>
                {isAdmin ? 'Inventory admin' : 'Warehouse staff'}
              </Badge>
              <span className="text-muted-foreground">
                Joined {formatDate(profile.created_at)}
              </span>
            </div>

            <Button loading={update.isPending} onClick={() => void save()}>
              <Save />
              Save profile
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <h2 className="text-h3">Appearance</h2>
              <div className="flex gap-2">
                {THEMES.map(({ value, label, Icon }) => (
                  <Button
                    key={value}
                    variant={theme === value ? 'primary' : 'secondary'}
                    onClick={() => setTheme(value)}
                    className="flex-1"
                  >
                    <Icon />
                    {label}
                  </Button>
                ))}
              </div>
              <p className="text-small text-muted-foreground">
                Dark mode is a token swap — the same layout, the same contrast.
              </p>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card>
              <CardContent className="space-y-3 p-4 pt-4">
                <h2 className="text-h3">Notifications</h2>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    Daily alert digest by email
                    <span className="block text-small text-muted-foreground">
                      A summary of active alerts, once a day.
                    </span>
                  </span>
                  <Switch checked={digest} onCheckedChange={setDigest} />
                </label>
                <p className="text-small text-muted-foreground">
                  Saved with your profile. In-app alerts arrive live regardless.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3 p-4 pt-4">
              <h2 className="text-h3">Password</h2>
              <Field label="New password" htmlFor="new-password" hint="At least 8 characters.">
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={password.length < 8}
                onClick={() => void changePassword()}
              >
                Update password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
