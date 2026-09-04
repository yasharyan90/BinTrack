import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, invokeFunction } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { toCsv } from '@/lib/csv'
import type { ImportJob } from '@/types/app'
import type { ImportKind } from '@/types/database'

export function useImportJobs(limit = 20) {
  return useQuery({
    queryKey: qk.imports(),
    queryFn: async (): Promise<ImportJob[]> => {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useImportJob(jobId: string | undefined) {
  return useQuery({
    queryKey: qk.importJob(jobId ?? 'none'),
    enabled: !!jobId,
    // Realtime drives this; the interval is the fallback while a job is running.
    refetchInterval: (query) => {
      const job = query.state.data as ImportJob | undefined
      return job && (job.status === 'pending' || job.status === 'processing') ? 1_500 : false
    },
    queryFn: async (): Promise<ImportJob | null> => {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('id', jobId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/**
 * Uploads the CSV to Storage, records the job, then hands off to the
 * `csv-import` Edge Function, which runs with the service role and reports
 * progress back on `import_jobs` over Realtime (App Flow §5.5).
 */
export function useStartImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      kind,
      file,
      mode,
      totalRows,
    }: {
      kind: ImportKind
      file: File
      mode: 'partial' | 'strict'
      totalRows: number
    }) => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('UNAUTHENTICATED:sign in again')

      const jobId = crypto.randomUUID()
      const path = `${auth.user.id}/${jobId}.csv`

      const upload = await supabase.storage
        .from('imports')
        .upload(path, file, { contentType: 'text/csv', upsert: true })
      if (upload.error) throw upload.error

      const { error: insertError } = await supabase.from('import_jobs').insert({
        id: jobId,
        kind,
        file_path: path,
        file_name: file.name,
        mode,
        total_rows: totalRows,
        created_by: auth.user.id,
      })
      if (insertError) throw insertError

      const { error } = await invokeFunction('csv-import', { job_id: jobId })
      if (error) throw error
      return jobId
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.imports() })
    },
  })
}

/** The per-row error report, as the downloadable CSV the admin asked for. */
export function errorReportCsv(job: ImportJob): string {
  const errors = (job.errors ?? []) as { row: number; column?: string; message: string }[]
  return toCsv(
    errors.map((e) => ({ row: e.row, column: e.column ?? '', message: e.message })),
    ['row', 'column', 'message'],
  )
}

/** The views `export_rows` allow-lists. Keep in step with the RPC. */
export type ExportableView =
  | 'v_product_stock'
  | 'v_stock_by_location'
  | 'v_stock_by_row'
  | 'v_bin_utilization'
  | 'v_expiring_stock'
  | 'v_low_stock'
  | 'v_movements'

export const EXPORT_DATASETS: { value: ExportableView; label: string; description: string }[] = [
  { value: 'v_product_stock', label: 'Products with stock', description: 'One row per SKU with on hand, reserved and value.' },
  { value: 'v_stock_by_location', label: 'Stock by location', description: 'Every lot in every bin, with expiry.' },
  { value: 'v_stock_by_row', label: 'Stock by row', description: 'Row totals, capacity and expiring units.' },
  { value: 'v_bin_utilization', label: 'Bin utilisation', description: 'Fill percentage per bin.' },
  { value: 'v_expiring_stock', label: 'Expiring stock', description: 'Dated lots bucketed by urgency.' },
  { value: 'v_low_stock', label: 'Low stock', description: 'SKUs at or below their reorder point.' },
  { value: 'v_movements', label: 'Movements', description: 'The full audit trail.' },
]

/** Exports run through `export_rows`, which allow-lists views and keeps RLS on. */
export function useExportRows() {
  return useMutation({
    mutationFn: async (view: ExportableView): Promise<Record<string, unknown>[]> => {
      const { data, error } = await supabase.rpc('export_rows', { p_view: view })
      if (error) throw error
      return (data ?? []) as unknown as Record<string, unknown>[]
    },
  })
}
