import { useCallback, useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Drag-drop or click. Only `.csv` — the parser will not guess at a spreadsheet. */
export function CsvDropzone({
  file,
  onFile,
  onTemplate,
  disabled,
}: {
  file: File | null
  onFile: (file: File) => void
  onTemplate?: () => void
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const accept = useCallback(
    (list: FileList | null) => {
      const candidate = list?.[0]
      if (!candidate) return
      if (!/\.csv$/i.test(candidate.name)) return
      onFile(candidate)
    },
    [onFile],
  )

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a CSV file"
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled) accept(e.dataTransfer.files)
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-10 text-center transition-colors',
          dragging && 'border-foreground bg-accent',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        {file ? (
          <>
            <FileSpreadsheet className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="text-sm font-medium">{file.name}</p>
            <p className="text-small text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB · click to choose another
            </p>
          </>
        ) : (
          <>
            <Upload className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
            <p className="text-sm font-medium">Drop a CSV here, or click to browse</p>
            <p className="text-small text-muted-foreground">Header row required; UTF-8.</p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => accept(e.target.files)}
        />
      </div>

      {onTemplate && (
        <Button type="button" variant="ghost" size="sm" onClick={onTemplate}>
          Download the template
        </Button>
      )}
    </div>
  )
}
