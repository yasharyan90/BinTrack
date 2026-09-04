/**
 * Minimal RFC-4180 CSV parser (quotes, escaped quotes, embedded newlines).
 * Deno-native so the function has no npm dependency for parsing.
 */
export function parseCsv(text: string): { header: string[]; rows: Record<string, string>[] } {
  const records = parseRecords(text)
  if (records.length === 0) return { header: [], rows: [] }
  const header = records[0].map((h) => h.trim().toLowerCase().replace(/^﻿/, ''))
  const rows: Record<string, string>[] = []
  for (let i = 1; i < records.length; i++) {
    const rec = records[i]
    if (rec.length === 1 && rec[0].trim() === '') continue // blank line
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => (obj[h] = rec[idx] ?? ''))
    rows.push(obj)
  }
  return { header, rows }
}

function parseRecords(text: string): string[][] {
  const out: string[][] = []
  let record: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      record.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      out.push(record)
      record = []
      field = ''
    } else {
      field += ch
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    out.push(record)
  }
  return out
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
