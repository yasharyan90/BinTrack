import { useMemo, useState } from 'react'
import { Download, FileUp, Upload } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CsvDropzone } from '@/components/csv/CsvDropzone'
import { ImportPreview } from '@/components/csv/ImportPreview'
import { ImportProgress } from '@/components/csv/ImportProgress'
import { useImportJob, useImportJobs, useStartImport } from '@/hooks/useImports'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppToast } from '@/hooks/useAppToast'
import { parseCsvFile } from '@/lib/csv'
import { downloadCsv } from '@/lib/csv'
import { IMPORT_KINDS, templateCsv, validateRows } from '@/lib/importSchemas'
import { cn, formatDateTime } from '@/lib/utils'
import type { ImportKind } from '@/types/database'

/**
 * Bulk import (App Flow §5.5). The browser validates first so a bad file is
 * caught before it is uploaded; the Edge Function then applies it in batches
 * and streams progress back over Realtime.
 */
export default function Import() {
  const [kind, setKind] = useState<ImportKind>('products')
  const [file, setFile] = useState<File | null>(null)
  const [header, setHeader] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [mode, setMode] = useState<'partial' | 'strict'>('partial')
  const [jobId, setJobId] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const startImport = useStartImport()
  const { data: job } = useImportJob(jobId ?? undefined)
  const { data: history = [] } = useImportJobs(8)
  const { showError, showSuccess } = useAppToast()

  useRealtime('imports', ['import_jobs'])

  const report = useMemo(
    () => (rows.length > 0 ? validateRows(kind, rows) : null),
    [kind, rows],
  )

  const chooseFile = async (next: File) => {
    setParsing(true)
    setJobId(null)
    try {
      const parsed = await parseCsvFile(next)
      setFile(next)
      setHeader(parsed.header)
      setRows(parsed.rows)
    } catch (error) {
      showError(error, 'Could not read that CSV')
    } finally {
      setParsing(false)
    }
  }

  const submit = async () => {
    if (!file || !report) return
    if (mode === 'strict' && report.errorCount > 0) {
      showError('INVALID:fix the errors or switch to partial mode', 'Strict mode blocks bad rows')
      return
    }
    try {
      const id = await startImport.mutateAsync({
        kind,
        file,
        mode,
        totalRows: rows.length,
      })
      setJobId(id)
      showSuccess('Import started', 'Progress updates live below.')
    } catch (error) {
      showError(error, 'Could not start the import')
    }
  }

  const spec = IMPORT_KINDS.find((k) => k.value === kind)!

  return (
    <>
      <PageHeader
        title="CSV import"
        description="Products, rows and bins, opening stock, or orders."
      />

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-4 pt-4">
            <div>
              <p className="label-small mb-2">Step 1 · What are you importing?</p>
              <div className="flex flex-wrap gap-2">
                {IMPORT_KINDS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setKind(option.value)
                      setFile(null)
                      setRows([])
                      setHeader([])
                      setJobId(null)
                    }}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm',
                      kind === option.value
                        ? 'border-foreground bg-accent font-medium'
                        : 'border-border hover:bg-accent',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-small text-muted-foreground">
                Columns: <span className="font-mono">{spec.columns.join(', ')}</span>
              </p>
            </div>

            <div>
              <p className="label-small mb-2">Step 2 · The file</p>
              <CsvDropzone
                file={file}
                onFile={(next) => void chooseFile(next)}
                onTemplate={() => downloadCsv(spec.template, templateCsv(kind))}
                disabled={parsing || startImport.isPending}
              />
            </div>
          </CardContent>
        </Card>

        {report && (
          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <p className="label-small">Step 3 · Check the rows</p>
              <ImportPreview kind={kind} header={header} rows={rows} report={report} />

              <div>
                <p className="label-small mb-2">Step 4 · How should errors be handled?</p>
                <div className="flex flex-wrap gap-2">
                  <ModeOption
                    active={mode === 'partial'}
                    onClick={() => setMode('partial')}
                    title="Partial"
                    description="Import every valid row and report the rest."
                  />
                  <ModeOption
                    active={mode === 'strict'}
                    onClick={() => setMode('strict')}
                    title="Strict"
                    description="All or nothing — one bad row aborts the run."
                  />
                </div>
              </div>

              <Button
                size="lg"
                loading={startImport.isPending}
                disabled={report.validCount === 0 || (mode === 'strict' && report.errorCount > 0)}
                onClick={() => void submit()}
              >
                <Upload />
                Import {mode === 'strict' ? rows.length : report.validCount} rows
              </Button>

              {mode === 'strict' && report.errorCount > 0 && (
                <p className="text-sm text-warning">
                  Strict mode refuses to run while {report.errorCount} rows have errors. Fix the file
                  or switch to partial.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {job && <ImportProgress job={job} />}

        {history.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <p className="border-b border-border p-3 text-h3">Recent imports</p>
              <ul>
                {history.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 text-sm last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {entry.file_name ?? entry.file_path}{' '}
                        <span className="text-muted-foreground">· {entry.kind}</span>
                      </span>
                      <span className="text-small text-muted-foreground">
                        {formatDateTime(entry.created_at)} · {entry.success_rows} imported,{' '}
                        {entry.error_rows} errors
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          entry.status === 'completed'
                            ? 'success'
                            : entry.status === 'failed'
                              ? 'destructive'
                              : 'info'
                        }
                      >
                        {entry.status}
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={() => setJobId(entry.id)}>
                        <Download className="size-3.5" />
                        Details
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {!file && history.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileUp className="size-4" aria-hidden />
            Nothing has been imported yet. Start with the template.
          </p>
        )}
      </div>
    </>
  )
}

function ModeOption({
  active,
  onClick,
  title,
  description,
}: {
  active: boolean
  onClick: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-md border px-3 py-2 text-left',
        active ? 'border-foreground bg-accent' : 'border-border hover:bg-accent',
      )}
      aria-pressed={active}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="block text-small text-muted-foreground">{description}</span>
    </button>
  )
}
