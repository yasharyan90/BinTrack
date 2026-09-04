import { useState } from 'react'
import { Download, Table2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EXPORT_DATASETS, useExportRows, type ExportableView } from '@/hooks/useImports'
import { useAppToast } from '@/hooks/useAppToast'
import { downloadCsv, flattenForCsv, timestampedName, toCsv } from '@/lib/csv'
import { cn, formatNumber } from '@/lib/utils'

/**
 * Export any reporting view (App Flow §5.6). The rows come back through
 * `export_rows`, which allow-lists views and leaves RLS in force — an export
 * can never reveal more than the grid it came from.
 */
export default function Export() {
  const [dataset, setDataset] = useState<ExportableView>('v_stock_by_location')
  const [lastCount, setLastCount] = useState<number | null>(null)
  const exportRows = useExportRows()
  const { showSuccess, showError } = useAppToast()

  const spec = EXPORT_DATASETS.find((d) => d.value === dataset)!

  const run = async () => {
    try {
      const rows = await exportRows.mutateAsync(dataset)
      if (rows.length === 0) {
        showError('NOT_FOUND:that view has no rows right now', 'Nothing to export')
        return
      }
      downloadCsv(
        timestampedName(dataset.replace(/^v_/, '')),
        toCsv(rows.map(flattenForCsv)),
      )
      setLastCount(rows.length)
      showSuccess(`${formatNumber(rows.length)} rows exported`)
    } catch (error) {
      showError(error, 'Export failed')
    }
  }

  return (
    <>
      <PageHeader
        title="CSV export"
        description="Every reporting view, as a spreadsheet."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-4 pt-4">
            <p className="label-small">Dataset</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPORT_DATASETS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDataset(option.value)}
                  className={cn(
                    'rounded-md border p-3 text-left',
                    dataset === option.value
                      ? 'border-foreground bg-accent'
                      : 'border-border hover:bg-accent',
                  )}
                  aria-pressed={dataset === option.value}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-small text-muted-foreground">
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="space-y-3 p-4 pt-4">
            <h2 className="text-h3">{spec.label}</h2>
            <p className="text-sm text-muted-foreground">{spec.description}</p>
            <p className="font-mono text-small text-muted-foreground">{dataset}</p>

            <Button className="w-full" loading={exportRows.isPending} onClick={() => void run()}>
              <Download />
              Download CSV
            </Button>

            {lastCount !== null && (
              <p className="flex items-center gap-1.5 text-small text-success">
                <Table2 className="size-3.5" aria-hidden />
                Last export: {formatNumber(lastCount)} rows.
              </p>
            )}

            <p className="text-small text-muted-foreground">
              Grids elsewhere in the app also carry their own Export button, which respects the
              filters you have applied there.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
