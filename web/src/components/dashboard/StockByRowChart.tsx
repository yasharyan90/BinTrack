import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber } from '@/lib/utils'
import type { Views } from '@/types/database'

/**
 * Units per row. One series, one colour — a bar chart does not need a palette
 * when every bar means the same thing.
 */
export function StockByRowChart({ rows }: { rows: Views<'v_stock_by_row'>[] }) {
  const data = rows.map((r) => ({
    row: r.row_code,
    units: r.units,
    reserved: r.reserved,
    skus: r.sku_count,
  }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="row"
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v: number) => formatNumber(v)}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted))' }}
          contentStyle={{
            background: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 8,
            fontSize: 12,
            color: 'hsl(var(--popover-foreground))',
          }}
          formatter={(value: number, name: string) => [formatNumber(value), name]}
        />
        <Bar dataKey="units" name="Units" fill="hsl(var(--foreground))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
