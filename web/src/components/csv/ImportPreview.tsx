import { useMemo } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { badColumns, type ValidationReport } from '@/lib/importSchemas'
import { cn } from '@/lib/utils'
import type { ImportKind } from '@/types/database'

const PREVIEW_ROWS = 20

/**
 * The first 20 rows with failing cells tinted, plus the full issue list.
 * Validation runs client-side with the same zod schemas the Edge Function uses,
 * so what the preview says is what the import will do (TRD §7.3).
 */
export function ImportPreview({
  kind,
  header,
  rows,
  report,
}: {
  kind: ImportKind
  header: string[]
  rows: Record<string, string>[]
  report: ValidationReport
}) {
  const preview = useMemo(() => rows.slice(0, PREVIEW_ROWS), [rows])
  const badByRow = useMemo(
    () => preview.map((row) => badColumns(kind, row)),
    [kind, preview],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          Preview {Math.min(PREVIEW_ROWS, rows.length)} of {rows.length.toLocaleString()} rows
        </span>
        <span className="flex items-center gap-1.5 text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          {report.validCount.toLocaleString()} valid
        </span>
        {report.errorCount > 0 && (
          <span className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            {report.errorCount.toLocaleString()} with errors
          </span>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              {header.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, index) => {
              const bad = badByRow[index]
              return (
                <TableRow key={index} className={cn(bad.size > 0 && 'bg-destructive/5')}>
                  <TableCell className="text-small text-muted-foreground">{index + 2}</TableCell>
                  {header.map((column) => (
                    <TableCell
                      key={column}
                      className={cn(
                        'max-w-48 truncate',
                        bad.has(column) && 'bg-destructive/12 text-destructive',
                      )}
                      title={row[column]}
                    >
                      {row[column] || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {report.issues.length > 0 && (
        <details className="rounded-lg border border-border p-3" open>
          <summary className="cursor-pointer text-sm font-medium">
            {report.issues.length} validation {report.issues.length === 1 ? 'issue' : 'issues'}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-small">
            {report.issues.slice(0, 200).map((issue, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 text-muted-foreground">row {issue.row}</span>
                {issue.column && <span className="shrink-0 font-mono">{issue.column}</span>}
                <span className="text-destructive">{issue.message}</span>
              </li>
            ))}
            {report.issues.length > 200 && (
              <li className="text-muted-foreground">…and {report.issues.length - 200} more.</li>
            )}
          </ul>
        </details>
      )}
    </div>
  )
}
