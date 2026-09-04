import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { downloadCsv, timestampedName } from '@/lib/csv'
import { errorReportCsv } from '@/hooks/useImports'
import type { ImportJob, ImportRowError } from '@/types/app'

/** Live progress from `import_jobs`, pushed by Realtime as the job runs. */
export function ImportProgress({ job }: { job: ImportJob }) {
  const total = job.total_rows || 1
  const pct = Math.min(100, Math.round((job.processed_rows / total) * 100))
  const errors = (job.errors ?? []) as ImportRowError[]
  const running = job.status === 'pending' || job.status === 'processing'

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-medium">
          {running ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Importing {job.file_name ?? job.kind}…
            </>
          ) : job.status === 'completed' ? (
            <>
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              Import finished
            </>
          ) : (
            <>
              <AlertTriangle className="size-4 text-destructive" aria-hidden />
              Import failed
            </>
          )}
        </p>
        <span className="text-small tabular text-muted-foreground">{pct}%</span>
      </div>

      <Progress
        value={pct}
        indicatorClassName={job.status === 'failed' ? 'bg-destructive' : 'bg-success'}
        aria-label="Import progress"
      />

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Stat label="Total" value={job.total_rows} />
        <Stat label="Processed" value={job.processed_rows} />
        <Stat label="Imported" value={job.success_rows} tone="text-success" />
        <Stat label="Errors" value={job.error_rows} tone={job.error_rows ? 'text-destructive' : undefined} />
      </dl>

      {errors.length > 0 && (
        <>
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/50 p-2 text-small">
            {errors.slice(0, 50).map((error, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">row {error.row}</span>
                <span className="text-destructive">{error.message}</span>
              </li>
            ))}
            {errors.length > 50 && (
              <li className="text-muted-foreground">…and {errors.length - 50} more.</li>
            )}
          </ul>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadCsv(timestampedName('import-errors'), errorReportCsv(job))}
          >
            <Download className="size-4" />
            Download the error report
          </Button>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <dt className="label-small">{label}</dt>
      <dd className={`tabular font-medium ${tone ?? ''}`}>{value.toLocaleString()}</dd>
    </div>
  )
}
