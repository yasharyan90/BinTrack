// Row schemas for CSV import. Mirrored in web/src/lib/importSchemas.ts so the
// browser preview and the server apply identical rules (TRD §7.3).
import { z } from 'https://deno.land/x/zod@v3.23.8/mod.ts'

const trimmed = z.string().transform((s) => s.trim())
const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((s) => {
    const v = (s ?? '').toString().trim()
    return v === '' ? null : v
  })

const boolish = optionalText.transform((v) => {
  if (v === null) return false
  return ['1', 'true', 'yes', 'y', 't'].includes(v.toLowerCase())
})

const intish = (label: string) =>
  optionalText.transform((v, ctx) => {
    if (v === null) return null
    const n = Number(v)
    if (!Number.isInteger(n)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} must be a whole number` })
      return z.NEVER
    }
    return n
  })

const dateish = optionalText.superRefine((v, ctx) => {
  if (v === null) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expiry_date must be YYYY-MM-DD' })
  }
})

export const productRow = z
  .object({
    sku: trimmed.pipe(z.string().min(1, 'sku is required')),
    name: trimmed.pipe(z.string().min(1, 'name is required')),
    description: optionalText,
    category: optionalText,
    barcode: optionalText,
    unit: optionalText,
    unit_cost: optionalText,
    reorder_point: intish('reorder_point'),
    reorder_qty: intish('reorder_qty'),
    is_perishable: boolish,
    shelf_life_days: intish('shelf_life_days'),
  })
  .superRefine((row, ctx) => {
    if (row.is_perishable && !row.shelf_life_days) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shelf_life_days'],
        message: 'perishable products need shelf_life_days',
      })
    }
  })

export const binRow = z.object({
  warehouse_code: trimmed.pipe(z.string().min(1, 'warehouse_code is required')),
  warehouse_name: optionalText,
  row_code: trimmed.pipe(z.string().min(1, 'row_code is required')),
  row_name: optionalText,
  bin_code: trimmed.pipe(z.string().min(1, 'bin_code is required')),
  capacity: intish('capacity'),
})

export const openingStockRow = z.object({
  sku: trimmed.pipe(z.string().min(1, 'sku is required')),
  location_code: trimmed.pipe(z.string().min(1, 'location_code is required')),
  quantity: intish('quantity').refine((n) => n !== null && n > 0, 'quantity must be > 0'),
  lot_number: optionalText,
  expiry_date: dateish,
  note: optionalText,
})

export const orderRow = z.object({
  order_number: optionalText,
  customer_name: optionalText,
  sku: trimmed.pipe(z.string().min(1, 'sku is required')),
  quantity: intish('quantity').refine((n) => n !== null && n > 0, 'quantity must be > 0'),
})

export const rowSchemas = {
  products: productRow,
  bins: binRow,
  opening_stock: openingStockRow,
  orders: orderRow,
} as const

export type ImportKind = keyof typeof rowSchemas

export const rpcForKind: Record<Exclude<ImportKind, 'orders'>, string> = {
  products: 'bulk_upsert_products',
  bins: 'bulk_upsert_bins',
  opening_stock: 'bulk_receive_stock',
}

export type RowError = { row: number; column?: string; message: string }

/** Validates one parsed CSV record; returns either the coerced row or errors. */
export function validateRow(
  kind: ImportKind,
  raw: Record<string, unknown>,
  rowNumber: number,
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: RowError[] } {
  const parsed = rowSchemas[kind].safeParse(raw)
  if (parsed.success) return { ok: true, value: parsed.data as Record<string, unknown> }
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => ({
      row: rowNumber,
      column: i.path.join('.') || undefined,
      message: i.message,
    })),
  }
}
