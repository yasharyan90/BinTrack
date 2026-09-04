import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { Bin, Warehouse, WarehouseRow } from '@/types/app'
import type { Views } from '@/types/database'

export function useWarehouses() {
  return useQuery({
    queryKey: qk.warehouses(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await supabase.from('warehouses').select('*').order('code')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useRows() {
  return useQuery({
    queryKey: qk.rows(),
    staleTime: 60_000,
    queryFn: async (): Promise<(WarehouseRow & { warehouse: Warehouse })[]> => {
      const { data, error } = await supabase
        .from('warehouse_rows')
        .select('*, warehouse:warehouses(*)')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as unknown as (WarehouseRow & { warehouse: Warehouse })[]
    },
  })
}

export function useBins(rowId?: string) {
  return useQuery({
    queryKey: qk.bins(rowId),
    staleTime: 60_000,
    queryFn: async (): Promise<Bin[]> => {
      let query = supabase.from('bins').select('*').order('sort_order')
      if (rowId) query = query.eq('row_id', rowId)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useBin(binId: string | undefined) {
  return useQuery({
    queryKey: qk.bin(binId ?? 'none'),
    enabled: !!binId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bins')
        .select('*, row:warehouse_rows(*, warehouse:warehouses(*))')
        .eq('id', binId!)
        .single()
      if (error) throw error
      return data as Bin & { row: WarehouseRow & { warehouse: Warehouse } }
    },
  })
}

/** Everything sitting in one bin, expiry first. */
export function useBinStock(binId: string | undefined) {
  return useQuery({
    queryKey: qk.binStock(binId ?? 'none'),
    enabled: !!binId,
    queryFn: async (): Promise<Views<'v_stock_by_location'>[]> => {
      const { data, error } = await supabase
        .from('v_stock_by_location')
        .select('*')
        .eq('bin_id', binId!)
        .order('expiry_date', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useBinUtilisation() {
  return useQuery({
    queryKey: qk.binUtilisation(),
    queryFn: async (): Promise<Views<'v_bin_utilization'>[]> => {
      const { data, error } = await supabase
        .from('v_bin_utilization')
        .select('*')
        .order('row_sort')
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * Put-away suggestions (Feature B6): bins that already hold this SKU and still
 * have room, then the emptiest bins nearby. Saves the picker a decision.
 */
export function useSuggestedBins(productId: string | undefined, limit = 6) {
  return useQuery({
    queryKey: ['suggested-bins', productId ?? 'none'],
    enabled: !!productId,
    staleTime: 30_000,
    queryFn: async () => {
      const [holding, utilisation] = await Promise.all([
        supabase
          .from('v_stock_by_location')
          .select('bin_id, location_code, quantity, capacity')
          .eq('product_id', productId!),
        supabase
          .from('v_bin_utilization')
          .select('*')
          .eq('is_active', true)
          .order('fill_pct', { ascending: true, nullsFirst: true })
          .limit(50),
      ])

      const alreadyHolding = new Map<string, { location_code: string; units: number }>()
      for (const row of holding.data ?? []) {
        const current = alreadyHolding.get(row.bin_id)
        alreadyHolding.set(row.bin_id, {
          location_code: row.location_code,
          units: (current?.units ?? 0) + row.quantity,
        })
      }

      const utilByBin = new Map((utilisation.data ?? []).map((b) => [b.bin_id, b]))

      const suggestions: {
        bin_id: string
        location_code: string
        reason: string
        fill_pct: number | null
      }[] = []

      for (const [binId, info] of alreadyHolding) {
        const util = utilByBin.get(binId)
        if (util && util.fill_pct !== null && util.fill_pct >= 100) continue
        suggestions.push({
          bin_id: binId,
          location_code: info.location_code,
          reason: `already holds ${info.units}`,
          fill_pct: util?.fill_pct ?? null,
        })
      }

      for (const bin of utilisation.data ?? []) {
        if (suggestions.length >= limit) break
        if (alreadyHolding.has(bin.bin_id)) continue
        if (bin.fill_pct !== null && bin.fill_pct >= 90) continue
        suggestions.push({
          bin_id: bin.bin_id,
          location_code: bin.location_code,
          reason: bin.units === 0 ? 'empty' : `${bin.units} units, ${bin.fill_pct ?? 0}% full`,
          fill_pct: bin.fill_pct,
        })
      }

      return suggestions.slice(0, limit)
    },
  })
}

export function useSaveRow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string
      values: {
        warehouse_id: string
        code: string
        name?: string | null
        sort_order?: number
        is_active?: boolean
      }
    }) => {
      if (id) {
        // warehouse_id is fixed once a row exists — a row never moves warehouse.
        const { warehouse_id: _warehouseId, ...patch } = values
        const { error } = await supabase.from('warehouse_rows').update(patch).eq('id', id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('warehouse_rows').insert(values)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.rows() })
      void queryClient.invalidateQueries({ queryKey: ['bins'] })
    },
  })
}

export function useSaveBin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id?: string
      values: { row_id?: string; code?: string; capacity?: number | null; is_active?: boolean }
    }) => {
      if (id) {
        const { error } = await supabase.from('bins').update(values).eq('id', id)
        if (error) throw error
        return
      }
      if (!values.row_id || !values.code) throw new Error('INVALID:a new bin needs a row and a code')
      const { error } = await supabase.from('bins').insert({
        row_id: values.row_id,
        code: values.code,
        capacity: values.capacity ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bins'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/**
 * Bulk bin creation: "B001–B040" in one go, because nobody types 40 forms.
 * The database generates each `location_code` from warehouse + row + bin code.
 */
export function useCreateBinRange() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rowId,
      prefix,
      from,
      to,
      pad,
      capacity,
    }: {
      rowId: string
      prefix: string
      from: number
      to: number
      pad: number
      capacity: number | null
    }) => {
      if (to < from) throw new Error('INVALID:the range end must not be before the start')
      if (to - from + 1 > 500) throw new Error('INVALID:at most 500 bins at a time')

      const rows = []
      for (let n = from; n <= to; n++) {
        rows.push({
          row_id: rowId,
          code: `${prefix}${String(n).padStart(pad, '0')}`,
          capacity,
        })
      }
      const { error } = await supabase.from('bins').insert(rows)
      if (error) throw error
      return rows.length
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bins'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
