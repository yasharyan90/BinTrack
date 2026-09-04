/**
 * CSV row validation, shared between the import preview in the browser and the
 * `csv-import` Edge Function (TRD §7.3). Both sides must agree, so this file
 * mirrors supabase/functions/_shared/schemas.ts rule for rule.
 */
import { z } from 'zod'
import type { ImportKind } from '@/types/database'

const optionalText = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((s) => {
    const v = (s ?? '').toString().trim()
    return v === '' ? null : v
  })

const boolish = optionalText.transform((v) =>
  v === null ? false : ['1', 'true', 'yes', 'y', 't'].includes(v.toLowerCase()),
)

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

const requiredText = (label: string) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((s) => (s ?? '').toString().trim())
    .pipe(z.string().min(1, `${label} is required`))

const dateish = optionalText.superRefine((v, ctx) => {
  if (v === null) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'expiry_date must be YYYY-MM-DD' })
  }
})

export const productRow = z
  .object({
    sku: requiredText('sku'),
    name: requiredText('name'),
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
  warehouse_code: requiredText('warehouse_code'),
  warehouse_name: optionalText,
  row_code: requiredText('row_code'),
  row_name: optionalText,
  bin_code: requiredText('bin_code'),
  capacity: intish('capacity'),
})

export const openingStockRow = z.object({
  sku: requiredText('sku'),
  location_code: requiredText('location_code'),
  quantity: intish('quantity').refine((n) => n !== null && n > 0, 'quantity must be greater than 0'),
  lot_number: optionalText,
  expiry_date: dateish,
  note: optionalText,
})

export const orderRow = z.object({
  order_number: optionalText,
  customer_name: optionalText,
  sku: requiredText('sku'),
  quantity: intish('quantity').refine((n) => n !== null && n > 0, 'quantity must be greater than 0'),
})

export const rowSchemas = {
  products: productRow,
  bins: binRow,
  opening_stock: openingStockRow,
  orders: orderRow,
} as const

export const IMPORT_KINDS: { value: ImportKind; label: string; template: string; columns: string[] }[] = [
  {
    value: 'products',
    label: 'Products',
    template: 'products.csv',
    columns: [
      'sku',
      'name',
      'description',
      'category',
      'barcode',
      'unit',
      'unit_cost',
      'reorder_point',
      'reorder_qty',
      'is_perishable',
      'shelf_life_days',
    ],
  },
  {
    value: 'bins',
    label: 'Rows & bins',
    template: 'bins.csv',
    columns: ['warehouse_code', 'row_code', 'row_name', 'bin_code', 'capacity'],
  },
  {
    value: 'opening_stock',
    label: 'Opening stock',
    template: 'opening_stock.csv',
    columns: ['sku', 'location_code', 'quantity', 'lot_number', 'expiry_date', 'note'],
  },
  {
    value: 'orders',
    label: 'Orders',
    template: 'orders.csv',
    columns: ['order_number', 'customer_name', 'sku', 'quantity'],
  },
]

export type RowIssue = { row: number; column?: string; message: string }

export type ValidationReport = {
  validCount: number
  errorCount: number
  issues: RowIssue[]
  /** Row numbers (1-based, header excluded) that failed, for cell highlighting. */
  badRows: Set<number>
}

/** Validates every parsed record and reports issues per row, as the UI shows them. */
export function validateRows(kind: ImportKind, rows: Record<string, string>[]): ValidationReport {
  const schema = rowSchemas[kind]
  const issues: RowIssue[] = []
  const badRows = new Set<number>()
  let validCount = 0

  rows.forEach((raw, index) => {
    const result = schema.safeParse(raw)
    if (result.success) {
      validCount++
      return
    }
    badRows.add(index)
    for (const issue of result.error.issues) {
      issues.push({
        row: index + 2, // 1-based, plus the header line
        column: issue.path.join('.') || undefined,
        message: issue.message,
      })
    }
  })

  return { validCount, errorCount: rows.length - validCount, issues, badRows }
}

/** Which columns a row failed on — used to tint cells in the preview table. */
export function badColumns(kind: ImportKind, raw: Record<string, string>): Set<string> {
  const result = rowSchemas[kind].safeParse(raw)
  if (result.success) return new Set()
  return new Set(result.error.issues.map((i) => i.path.join('.')).filter(Boolean))
}

export function templateCsv(kind: ImportKind): string {
  const spec = IMPORT_KINDS.find((k) => k.value === kind)!
  const examples: Record<ImportKind, string[]> = {
    products: [
      'MUG-0042,Blue Ceramic Mug 350ml,Stoneware mug,Kitchen,8900000000426,pcs,120.00,40,100,false,',
      'OAT-0007,Oat Milk 1L,Barista oat drink,Beverages,8900000000075,pcs,95.00,30,120,true,120',
    ],
    bins: ['WH1,R01,Row 1,B001,300', 'WH1,R01,Row 1,B002,300'],
    opening_stock: [
      'MUG-0042,WH1-R02-B017,90,,,Opening balance',
      'OAT-0007,WH1-R02-B023,48,L2409,2026-10-15,Opening balance',
    ],
    orders: [
      'SHOP-1001,Acme Retail,MUG-0042,4',
      'SHOP-1001,Acme Retail,OAT-0007,2',
      'SHOP-1002,Nimbus Cafe,OAT-0007,12',
    ],
  }
  return [spec.columns.join(','), ...examples[kind]].join('\n')
}
