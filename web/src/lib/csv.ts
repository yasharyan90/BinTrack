import Papa from 'papaparse'

/** Parses a File in a worker so a 50 k-row CSV never blocks the UI. */
export function parseCsvFile(file: File): Promise<{ header: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      worker: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        resolve({
          header: (result.meta.fields ?? []).map((h) => h.trim().toLowerCase()),
          rows: result.data,
        })
      },
      error: (error) => reject(error),
    })
  })
}

export function parseCsvText(text: string): { header: string[]; rows: Record<string, string>[] } {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  })
  return { header: (result.meta.fields ?? []).map((h) => h.trim().toLowerCase()), rows: result.data }
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return columns?.join(',') ?? ''
  return Papa.unparse(rows, { columns: columns ?? Object.keys(rows[0]) })
}

/** Triggers a browser download for generated CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  // Excel needs a BOM to read UTF-8 without mangling accents.
  downloadBlob(filename, new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoke on the next tick so Safari has finished reading the blob.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function timestampedName(prefix: string, extension = 'csv'): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  return `${prefix}-${stamp}.${extension}`
}

/** Flattens nested values so a jsonb column exports as one readable cell. */
export function flattenForCsv(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    out[key] =
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : value
  }
  return out
}
