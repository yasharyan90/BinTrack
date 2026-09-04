import { Link } from 'react-router-dom'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Views } from '@/types/database'

/**
 * Bin utilisation as a grid, one row of cells per warehouse row. Fill drives
 * opacity; over 90 % turns warning and over 100 % destructive. Every cell
 * carries a title, so the colour is a shortcut, not the only information.
 */
export function RowHeatmap({ bins }: { bins: Views<'v_bin_utilization'>[] }) {
  const rows = new Map<string, Views<'v_bin_utilization'>[]>()
  for (const bin of bins) {
    const list = rows.get(bin.row_code) ?? []
    list.push(bin)
    rows.set(bin.row_code, list)
  }

  return (
    <TooltipProvider delayDuration={120}>
      <div className="space-y-2">
        {[...rows.entries()].map(([rowCode, rowBins]) => (
          <div key={rowCode} className="flex items-center gap-2">
            <span className="w-9 shrink-0 font-mono text-small text-muted-foreground">{rowCode}</span>
            <div className="flex flex-wrap gap-1">
              {rowBins.map((bin) => (
                <Tooltip key={bin.bin_id}>
                  <TooltipTrigger asChild>
                    <Link
                      to={`/bins/${bin.bin_id}`}
                      className="size-4 rounded-sm border border-border"
                      style={cellStyle(bin.fill_pct)}
                      title={`${bin.location_code}: ${bin.units} units${
                        bin.fill_pct !== null ? `, ${bin.fill_pct}% full` : ''
                      }`}
                    >
                      <span className="sr-only">{bin.location_code}</span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="location-code">{bin.location_code}</p>
                    <p>
                      {bin.units} units · {bin.sku_count} SKUs
                      {bin.fill_pct !== null ? ` · ${bin.fill_pct}% full` : ' · no capacity set'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-1 text-small text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm border border-border" style={cellStyle(0)} /> empty
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm border border-border" style={cellStyle(60)} /> filling
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm border border-border" style={cellStyle(95)} /> near full
          </span>
          <span className="flex items-center gap-1">
            <span className="size-3 rounded-sm border border-border" style={cellStyle(120)} /> over capacity
          </span>
        </div>
      </div>
    </TooltipProvider>
  )
}

function cellStyle(fillPct: number | null): React.CSSProperties {
  if (fillPct === null) return { background: 'hsl(var(--muted))' }
  if (fillPct > 100) return { background: 'hsl(var(--destructive))' }
  if (fillPct > 90) return { background: 'hsl(var(--warning))' }
  return { background: `hsl(var(--success) / ${Math.max(0.06, fillPct / 100).toFixed(2)})` }
}
