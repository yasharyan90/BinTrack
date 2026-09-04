import { useEffect, useState } from 'react'
import { RefreshCw, Save } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SkeletonRows } from '@/components/ui/skeleton'
import { useSaveSetting, useSettings } from '@/hooks/useSettings'
import { useEvaluateAlerts } from '@/hooks/useAlerts'
import { useAppToast } from '@/hooks/useAppToast'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types/app'

const NUMBERS: {
  key: keyof AppSettings
  label: string
  hint: string
  min: number
  max: number
}[] = [
  {
    key: 'expiry_warning_days',
    label: 'Expiry warning (days)',
    hint: 'A lot raises "expiring soon" this many days before its date.',
    min: 1,
    max: 365,
  },
  {
    key: 'dead_stock_days',
    label: 'Dead stock threshold (days)',
    hint: 'Stock with no outward movement for this long is flagged as dead.',
    min: 7,
    max: 730,
  },
  {
    key: 'default_reorder_point',
    label: 'Default reorder point',
    hint: 'Applied to imported products that do not specify one.',
    min: 0,
    max: 10_000,
  },
  {
    key: 'pick_mismatch_threshold',
    label: 'Pick mismatch threshold',
    hint: 'Scan mismatches on one task before a discrepancy alert is raised.',
    min: 1,
    max: 10,
  },
]

/** Thresholds the alert engine and the allocator read (App Flow §5.10). */
export default function Settings() {
  const { data: settings, isLoading } = useSettings()
  const saveSetting = useSaveSetting()
  const evaluate = useEvaluateAlerts()
  const { showSuccess, showError } = useAppToast()

  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    if (settings) setDraft(settings)
  }, [settings])

  if (isLoading) return <SkeletonRows rows={6} />

  const dirty = settings ? JSON.stringify(draft) !== JSON.stringify(settings) : false

  const saveAll = async () => {
    if (!settings) return
    const changed = (Object.keys(draft) as (keyof AppSettings)[]).filter(
      (key) => draft[key] !== settings[key],
    )
    try {
      for (const key of changed) {
        await saveSetting.mutateAsync({ key, value: draft[key] })
      }
      showSuccess(
        `${changed.length} ${changed.length === 1 ? 'setting' : 'settings'} saved`,
        'Alerts will use the new thresholds from the next evaluation.',
      )
    } catch (error) {
      showError(error, 'Could not save the settings')
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="These values drive the alert rules and the pick order."
        actions={
          <>
            <Button
              variant="secondary"
              loading={evaluate.isPending}
              onClick={() =>
                evaluate.mutate(undefined, {
                  onSuccess: () => showSuccess('Alerts re-evaluated with the current thresholds'),
                  onError: (error) => showError(error, 'Sweep failed'),
                })
              }
            >
              <RefreshCw />
              Re-evaluate alerts
            </Button>
            <Button disabled={!dirty} loading={saveSetting.isPending} onClick={() => void saveAll()}>
              <Save />
              Save changes
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4 pt-4">
            <h2 className="text-h3">Alert thresholds</h2>
            {NUMBERS.map((spec) => (
              <Field key={spec.key} label={spec.label} htmlFor={spec.key} hint={spec.hint}>
                <Input
                  id={spec.key}
                  type="number"
                  inputMode="numeric"
                  min={spec.min}
                  max={spec.max}
                  value={String(draft[spec.key] ?? '')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      [spec.key]: Math.min(
                        spec.max,
                        Math.max(spec.min, Number(e.target.value) || spec.min),
                      ),
                    }))
                  }
                  className="tabular"
                />
              </Field>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <h2 className="text-h3">Picking</h2>

              <label className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <span className="text-sm">
                  Serpentine picking
                  <span className="block text-small text-muted-foreground">
                    Reverses the bin order on alternate rows, so a picker walks a snake instead of
                    returning to the start of every row.
                  </span>
                </span>
                <Switch
                  checked={draft.serpentine_picking}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({ ...d, serpentine_picking: checked }))
                  }
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <h2 className="text-h3">Notifications</h2>

              <label className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <span className="text-sm">
                  Daily email digest
                  <span className="block text-small text-muted-foreground">
                    Sends the active-alert summary to admins who opted in on their profile. Needs
                    RESEND_API_KEY on the alert-digest function.
                  </span>
                </span>
                <Switch
                  checked={draft.email_digest_enabled}
                  onCheckedChange={(checked) =>
                    setDraft((d) => ({ ...d, email_digest_enabled: checked }))
                  }
                />
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-4 pt-4">
              <h2 className="text-h3">How alerts run</h2>
              <p className="text-sm text-muted-foreground">
                The rule engine runs inside the database after every stock movement, so a pick that
                drops a SKU below its reorder point raises the alert in the same transaction. Time-based
                rules — expiry and dead stock — also need a periodic sweep, which{' '}
                <span className="font-mono">pg_cron</span> runs every 15 minutes on a hosted project.
                Locally, use the button above.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
