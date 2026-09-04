// Deno tests for the Edge Function shared code.
//   deno test --allow-env supabase/functions/tests/
import { assertEquals, assertStrictEquals } from 'jsr:@std/assert@1'
import { chunk, parseCsv } from '../_shared/csv.ts'
import { validateRow } from '../_shared/schemas.ts'

Deno.test('parseCsv reads a plain file', () => {
  const { header, rows } = parseCsv(
    'sku,name,quantity\nMUG-0042,Blue Mug,4\nOAT-0007,Oat Milk,2\n',
  )
  assertEquals(header, ['sku', 'name', 'quantity'])
  assertEquals(rows.length, 2)
  assertEquals(rows[0], { sku: 'MUG-0042', name: 'Blue Mug', quantity: '4' })
})

Deno.test('parseCsv handles quotes, commas and escaped quotes', () => {
  const { rows } = parseCsv('sku,name\nA-1,"Mug, large"\nA-2,"He said ""hello"""\n')
  assertEquals(rows[0].name, 'Mug, large')
  assertEquals(rows[1].name, 'He said "hello"')
})

Deno.test('parseCsv keeps a newline inside a quoted field', () => {
  const { rows } = parseCsv('sku,note\nA-1,"line one\nline two"\n')
  assertEquals(rows.length, 1)
  assertEquals(rows[0].note, 'line one\nline two')
})

Deno.test('parseCsv tolerates CRLF and a trailing blank line', () => {
  const { rows } = parseCsv('sku,name\r\nA-1,Thing\r\n\r\n')
  assertEquals(rows.length, 1)
  assertEquals(rows[0].sku, 'A-1')
})

Deno.test('parseCsv lowercases the header and strips a BOM', () => {
  const { header } = parseCsv('﻿SKU,Name\nA-1,Thing\n')
  assertEquals(header[0], 'sku')
  assertEquals(header[1], 'name')
})

Deno.test('parseCsv returns nothing for an empty file', () => {
  assertEquals(parseCsv(''), { header: [], rows: [] })
})

Deno.test('chunk splits into batches of at most the given size', () => {
  const items = Array.from({ length: 450 }, (_, i) => i)
  const batches = chunk(items, 200)
  assertEquals(batches.length, 3)
  assertEquals(batches[0].length, 200)
  assertEquals(batches[2].length, 50)
  assertEquals(batches.flat().length, 450)
})

Deno.test('chunk of an empty list is an empty list', () => {
  assertEquals(chunk([], 200), [])
})

Deno.test('validateRow accepts a good product row', () => {
  const result = validateRow(
    'products',
    { sku: 'MUG-0042', name: 'Blue Mug', is_perishable: 'false' },
    2,
  )
  assertStrictEquals(result.ok, true)
})

Deno.test('validateRow rejects a perishable product with no shelf life', () => {
  const result = validateRow(
    'products',
    { sku: 'OAT-0007', name: 'Oat Milk', is_perishable: 'true', shelf_life_days: '' },
    5,
  )
  assertStrictEquals(result.ok, false)
  if (!result.ok) {
    assertEquals(result.errors[0].row, 5)
    assertEquals(result.errors[0].column, 'shelf_life_days')
  }
})

Deno.test('validateRow rejects a badly formatted expiry date', () => {
  const result = validateRow(
    'opening_stock',
    { sku: 'A', location_code: 'WH1-R01-B001', quantity: '5', expiry_date: '15-10-2026' },
    3,
  )
  assertStrictEquals(result.ok, false)
  if (!result.ok) {
    assertEquals(result.errors[0].column, 'expiry_date')
  }
})

Deno.test('validateRow rejects a zero quantity on an order line', () => {
  const result = validateRow('orders', { sku: 'A', quantity: '0' }, 2)
  assertStrictEquals(result.ok, false)
})

Deno.test('validateRow coerces the boolean spellings a spreadsheet produces', () => {
  for (const truthy of ['true', 'TRUE', 'yes', '1', 'y']) {
    const result = validateRow(
      'products',
      { sku: 'A', name: 'Thing', is_perishable: truthy, shelf_life_days: '30' },
      2,
    )
    assertStrictEquals(result.ok, true, `${truthy} should read as true`)
    if (result.ok) assertStrictEquals(result.value.is_perishable, true)
  }

  const falsy = validateRow('products', { sku: 'A', name: 'Thing', is_perishable: 'no' }, 2)
  if (falsy.ok) assertStrictEquals(falsy.value.is_perishable, false)
})
