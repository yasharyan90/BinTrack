// csv-import — admin-only bulk import of products / bins / opening stock / orders.
// POST { "job_id": "<uuid>" }  (the row in import_jobs carries kind, file_path, mode)
//
// Flow: verify admin JWT -> read job -> download CSV from Storage `imports/`
//    -> validate every row with zod -> apply in batches of 200 through the
//       SECURITY DEFINER bulk RPCs -> report progress on import_jobs (Realtime).
import { AuthError, requireAdmin, serviceClient } from '../_shared/client.ts'
import { fail, ok, preflight } from '../_shared/cors.ts'
import { chunk, parseCsv } from '../_shared/csv.ts'
import { type ImportKind, type RowError, rpcForKind, validateRow } from '../_shared/schemas.ts'

const BATCH_SIZE = 200
const MAX_REPORTED_ERRORS = 500

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre

  let jobId: string | undefined
  const admin = serviceClient()

  try {
    await requireAdmin(req)

    const body = await req.json().catch(() => ({}))
    jobId = body?.job_id
    if (!jobId) return fail('INVALID', 'job_id is required')

    const { data: job, error: jobErr } = await admin
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle()
    if (jobErr || !job) return fail('NOT_FOUND', 'import job not found', jobErr?.message, 404)
    if (job.status === 'processing') return fail('INVALID_STATE', 'job is already running')

    await admin
      .from('import_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .eq('id', jobId)

    const file = await admin.storage.from('imports').download(job.file_path)
    if (file.error || !file.data) {
      throw new Error(`could not read ${job.file_path}: ${file.error?.message ?? 'missing'}`)
    }

    const { rows } = parseCsv(await file.data.text())
    const kind = job.kind as ImportKind
    const mode: 'partial' | 'strict' = job.mode === 'strict' ? 'strict' : 'partial'

    // ---- validate -----------------------------------------------------
    const valid: Record<string, unknown>[] = []
    const validSourceRow: number[] = []
    const errors: RowError[] = []

    rows.forEach((raw, i) => {
      const rowNumber = i + 2 // 1-based + header line
      const result = validateRow(kind, raw, rowNumber)
      if (result.ok) {
        valid.push(result.value)
        validSourceRow.push(rowNumber)
      } else {
        errors.push(...result.errors)
      }
    })

    if (mode === 'strict' && errors.length > 0) {
      await finish(admin, jobId, 'failed', {
        total_rows: rows.length,
        processed_rows: rows.length,
        success_rows: 0,
        error_rows: errors.length,
        errors: errors.slice(0, MAX_REPORTED_ERRORS),
      })
      return ok({ job_id: jobId, status: 'failed', success: 0, errors })
    }

    await admin.from('import_jobs').update({ total_rows: rows.length }).eq('id', jobId)

    // ---- apply --------------------------------------------------------
    let success = 0
    let processed = rows.length - valid.length // invalid rows are already "processed"

    if (kind === 'orders') {
      const result = await importOrders(admin, valid, validSourceRow, mode)
      success += result.success
      processed += result.processed
      errors.push(...result.errors)
    } else {
      const rpc = rpcForKind[kind]
      let offset = 0
      for (const batch of chunk(valid, BATCH_SIZE)) {
        const { data, error } = await admin.rpc(rpc, { p_rows: batch, p_mode: mode })
        if (error) {
          if (mode === 'strict') throw new Error(error.message)
          batch.forEach((_, i) =>
            errors.push({ row: validSourceRow[offset + i], message: error.message }),
          )
        } else {
          const res = data as { success: number; errors: { row: number; message: string }[] }
          success += res.success ?? 0
          for (const e of res.errors ?? []) {
            // RPC row numbers are 1-based within the batch
            errors.push({ row: validSourceRow[offset + (e.row - 1)] ?? e.row, message: e.message })
          }
        }
        offset += batch.length
        processed += batch.length
        await admin
          .from('import_jobs')
          .update({
            processed_rows: processed,
            success_rows: success,
            error_rows: errors.length,
            errors: errors.slice(0, MAX_REPORTED_ERRORS),
          })
          .eq('id', jobId)
      }
    }

    await finish(admin, jobId, errors.length > 0 && success === 0 ? 'failed' : 'completed', {
      total_rows: rows.length,
      processed_rows: rows.length,
      success_rows: success,
      error_rows: errors.length,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
    })

    return ok({ job_id: jobId, total: rows.length, success, errors })
  } catch (err) {
    const e = err as Error
    if (jobId) {
      await finish(admin, jobId, 'failed', {
        errors: [{ row: 0, message: e.message }],
      }).catch(() => {})
    }
    if (err instanceof AuthError) return fail(err.code, err.message, undefined, err.status)
    return fail('IMPORT_FAILED', e.message, undefined, 500)
  }
})

/** Orders arrive as flat rows; group by order_number then call create_order once each. */
async function importOrders(
  admin: ReturnType<typeof serviceClient>,
  rows: Record<string, unknown>[],
  sourceRows: number[],
  mode: 'partial' | 'strict',
) {
  const groups = new Map<
    string,
    { customer_name: string | null; items: { sku: string; quantity: number }[]; firstRow: number }
  >()

  rows.forEach((r, i) => {
    const key = (r.order_number as string) ?? `AUTO-${i}`
    const group = groups.get(key) ?? {
      customer_name: (r.customer_name as string) ?? null,
      items: [],
      firstRow: sourceRows[i],
    }
    group.items.push({ sku: r.sku as string, quantity: r.quantity as number })
    groups.set(key, group)
  })

  const errors: RowError[] = []
  let success = 0

  for (const [orderNumber, group] of groups) {
    const { error } = await admin.rpc('create_order', {
      p_order: {
        order_number: orderNumber.startsWith('AUTO-') ? null : orderNumber,
        customer_name: group.customer_name,
        source: 'csv',
        items: group.items,
      },
    })
    if (error) {
      if (mode === 'strict') throw new Error(error.message)
      errors.push({ row: group.firstRow, message: error.message })
    } else {
      success += group.items.length
    }
  }
  return { success, processed: rows.length, errors }
}

async function finish(
  admin: ReturnType<typeof serviceClient>,
  jobId: string,
  status: 'completed' | 'failed',
  patch: Record<string, unknown>,
) {
  await admin
    .from('import_jobs')
    .update({ ...patch, status, finished_at: new Date().toISOString() })
    .eq('id', jobId)
}
