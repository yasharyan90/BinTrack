import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCheck, CheckCircle2, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { AlertItem } from '@/components/alerts/AlertItem'
import {
  ALERT_TYPE_LABELS,
  useAcknowledgeAlert,
  useAlerts,
  useBulkAcknowledge,
  useEvaluateAlerts,
} from '@/hooks/useAlerts'
import { useRealtime } from '@/hooks/useRealtime'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useAppToast } from '@/hooks/useAppToast'
import type { AlertSeverity, AlertStatus, AlertType } from '@/types/database'

const TABS: { value: string; label: string; statuses: AlertStatus[] }[] = [
  { value: 'active', label: 'Active', statuses: ['active', 'acknowledged'] },
  { value: 'snoozed', label: 'Snoozed', statuses: ['snoozed'] },
  { value: 'resolved', label: 'Resolved', statuses: ['resolved'] },
]

/** Triage everything the rule engine has raised (App Flow §5.2). */
export default function AlertCentre() {
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('active')
  const [type, setType] = useState<AlertType | 'all'>(
    (params.get('type') as AlertType | null) ?? 'all',
  )
  const [severity, setSeverity] = useState<AlertSeverity | 'all'>('all')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)

  const statuses = TABS.find((t) => t.value === tab)!.statuses
  const { data: alerts = [], isLoading } = useAlerts({
    status: statuses,
    type,
    severity,
    search: debounced,
  })

  const acknowledge = useAcknowledgeAlert()
  const bulkAcknowledge = useBulkAcknowledge()
  const evaluate = useEvaluateAlerts()
  const { showSuccess, showError } = useAppToast()

  useRealtime('alerts', ['alerts'])

  const unacknowledged = useMemo(() => alerts.filter((a) => a.status === 'active'), [alerts])

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Deduplicated, auto-resolving, and raised by the database itself."
        actions={
          <>
            <Button
              variant="secondary"
              loading={evaluate.isPending}
              onClick={() =>
                evaluate.mutate(undefined, {
                  onSuccess: () => showSuccess('Rules re-evaluated'),
                  onError: (error) => showError(error, 'Sweep failed'),
                })
              }
            >
              <RefreshCw />
              Re-evaluate
            </Button>
            {unacknowledged.length > 0 && (
              <Button
                loading={bulkAcknowledge.isPending}
                onClick={() =>
                  bulkAcknowledge.mutate(
                    unacknowledged.map((a) => a.id),
                    {
                      onSuccess: ({ acknowledged, failed }) =>
                        showSuccess(
                          `${acknowledged} acknowledged`,
                          failed ? `${failed} could not be updated.` : undefined,
                        ),
                      onError: (error) => showError(error, 'Bulk acknowledge failed'),
                    },
                  )
                }
              >
                <CheckCheck />
                Acknowledge all ({unacknowledged.length})
              </Button>
            )}
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search alert titles…"
            className="pl-9"
            aria-label="Search alerts"
          />
        </div>

        <Select
          value={type}
          onValueChange={(v) => {
            setType(v as AlertType | 'all')
            const next = new URLSearchParams(params)
            if (v === 'all') next.delete('type')
            else next.set('type', v)
            setParams(next, { replace: true })
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(ALERT_TYPE_LABELS) as AlertType[]).map((key) => (
              <SelectItem key={key} value={key}>
                {ALERT_TYPE_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(v) => setSeverity(v as AlertSeverity | 'all')}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Any severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any severity</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="info">Info</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonRows rows={6} />
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={tab === 'active' ? 'Nothing needs attention' : 'Nothing here'}
          description={
            tab === 'active'
              ? 'No stock-outs, expiries, discrepancies or over-capacity bins.'
              : 'Try another tab or filter.'
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            {alerts.map((alert) => (
              <AlertItem
                key={alert.id}
                alert={alert}
                busy={acknowledge.isPending}
                onAction={(action, snoozeUntil) =>
                  acknowledge.mutate(
                    { alertId: alert.id, action, snoozeUntil },
                    {
                      onSuccess: () => showSuccess(`Alert ${action}d`),
                      onError: (error) => showError(error, 'Could not update the alert'),
                    },
                  )
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      <p className="mt-4 text-small text-muted-foreground">
        Thresholds live in{' '}
        <Link to="/admin/settings" className="underline underline-offset-2 hover:no-underline">
          Settings
        </Link>
        . Alerts re-evaluate on every stock movement and on a schedule.
      </p>
    </>
  )
}
