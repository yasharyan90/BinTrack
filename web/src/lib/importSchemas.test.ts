import { describe, expect, it } from 'vitest'
import { badColumns, templateCsv, validateRows } from './importSchemas'

describe('product row validation', () => {
  it('accepts a well-formed row', () => {
    const report = validateRows('products', [
      {
        sku: 'MUG-0042',
        name: 'Blue Ceramic Mug 350ml',
        description: 'Stoneware mug',
        category: 'Kitchen',
        barcode: '8900000000426',
        unit: 'pcs',
        unit_cost: '120.00',
        reorder_point: '40',
        reorder_qty: '100',
        is_perishable: 'false',
        shelf_life_days: '',
      },
    ])
    expect(report.validCount).toBe(1)
    expect(report.errorCount).toBe(0)
  })

  it('requires a shelf life when a product is perishable', () => {
    const report = validateRows('products', [
      { sku: 'OAT-0007', name: 'Oat Milk 1L', is_perishable: 'true', shelf_life_days: '' },
    ])
    expect(report.errorCount).toBe(1)
    expect(report.issues[0]).toMatchObject({
      row: 2, // 1-based, past the header
      column: 'shelf_life_days',
    })
  })

  it('rejects a non-integer reorder point and names the column', () => {
    const report = validateRows('products', [
      { sku: 'X-1', name: 'Thing', reorder_point: 'many' },
    ])
    expect(report.errorCount).toBe(1)
    expect(report.issues[0].column).toBe('reorder_point')
  })

  it('reports a missing SKU', () => {
    const report = validateRows('products', [{ sku: '   ', name: 'Nameless' }])
    expect(report.issues[0].message).toContain('sku is required')
  })
})

describe('opening stock validation', () => {
  it('accepts a lot with an expiry date', () => {
    const report = validateRows('opening_stock', [
      {
        sku: 'OAT-0007',
        location_code: 'WH1-R02-B023',
        quantity: '48',
        lot_number: 'L2409',
        expiry_date: '2026-10-15',
        note: 'Opening balance',
      },
    ])
    expect(report.validCount).toBe(1)
  })

  it('insists on an ISO date', () => {
    const report = validateRows('opening_stock', [
      { sku: 'A', location_code: 'WH1-R01-B001', quantity: '1', expiry_date: '15/10/2026' },
    ])
    expect(report.issues[0].message).toContain('YYYY-MM-DD')
  })

  it('rejects a zero or negative quantity', () => {
    const report = validateRows('opening_stock', [
      { sku: 'A', location_code: 'WH1-R01-B001', quantity: '0' },
    ])
    expect(report.errorCount).toBe(1)
  })

  it('marks bad rows so the preview can tint the cells', () => {
    const rows = [
      { sku: 'A', location_code: 'WH1-R01-B001', quantity: '5' },
      { sku: '', location_code: 'WH1-R01-B002', quantity: '5' },
    ]
    const report = validateRows('opening_stock', rows)
    expect(report.badRows.has(0)).toBe(false)
    expect(report.badRows.has(1)).toBe(true)
    expect([...badColumns('opening_stock', rows[1])]).toContain('sku')
  })
})

describe('templates', () => {
  it('emits a header that matches the column list', () => {
    const csv = templateCsv('bins')
    expect(csv.split('\n')[0]).toBe('warehouse_code,row_code,row_name,bin_code,capacity')
  })

  it('includes example rows that pass their own validation', () => {
    for (const kind of ['products', 'bins', 'opening_stock', 'orders'] as const) {
      const [header, ...examples] = templateCsv(kind).split('\n')
      const columns = header.split(',')
      const rows = examples.map((line) => {
        const cells = line.split(',')
        return Object.fromEntries(columns.map((c, i) => [c, cells[i] ?? '']))
      })
      const report = validateRows(kind, rows)
      expect(report.errorCount, `${kind} template should be valid`).toBe(0)
    }
  })
})
