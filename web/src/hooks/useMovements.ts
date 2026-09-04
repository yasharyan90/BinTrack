import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { MovementType, Views } from '@/types/database'

export type MovementFilters = {
  type?: MovementType | 'all'
  productId?: string
  binId?: string
  performedBy?: string
  from?: string
  to?: string
  search?: string
}

const PAGE_SIZE = 50

/** The movement log is long by design; it loads a page at a time. */
export function useMovements(filters: MovementFilters) {
  return useInfiniteQuery({
    queryKey: qk.movements(filters),
    initialPageParam: 0,
    getNextPageParam: (last: Views<'v_movements'>[], pages) =>
      last.length < PAGE_SIZE ? undefined : pages.length,
    queryFn: async ({ pageParam }): Promise<Views<'v_movements'>[]> => {
      let query = supabase
        .from('v_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .range((pageParam as number) * PAGE_SIZE, (pageParam as number) * PAGE_SIZE + PAGE_SIZE - 1)

      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.productId) query = query.eq('product_id', filters.productId)
      if (filters.performedBy) query = query.eq('performed_by', filters.performedBy)
      if (filters.from) query = query.gte('created_at', filters.from)
      if (filters.to) query = query.lte('created_at', `${filters.to}T23:59:59`)
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        query = query.or(`sku.ilike.${term},product_name.ilike.${term}`)
      }
      if (filters.binId) {
        query = query.or(`from_location.eq.${filters.binId},to_location.eq.${filters.binId}`)
      }

      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}

export function useRecentMovements(limit = 12) {
  return useQuery({
    queryKey: qk.recentMovements(),
    refetchInterval: 30_000, // polling fallback when the socket is down
    queryFn: async (): Promise<Views<'v_movements'>[]> => {
      const { data, error } = await supabase
        .from('v_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export type MovementInput = {
  type: MovementType
  productId: string
  quantity: number
  fromBinId?: string | null
  toBinId?: string | null
  lotNumber?: string | null
  expiryDate?: string | null
  referenceType?: string | null
  referenceId?: string | null
  note?: string | null
}

/**
 * Every stock change goes through this one RPC, which writes the movement,
 * updates the level and re-evaluates alerts in a single transaction (TRD §5.2).
 */
export function useRecordMovement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: MovementInput) => {
      const { data, error } = await supabase.rpc('record_movement', {
        p_type: input.type,
        p_product_id: input.productId,
        p_qty: input.quantity,
        p_from_bin_id: input.fromBinId ?? null,
        p_to_bin_id: input.toBinId ?? null,
        p_lot_number: input.lotNumber ?? null,
        p_expiry_date: input.expiryDate ?? null,
        p_reference_type: input.referenceType ?? null,
        p_reference_id: input.referenceId ?? null,
        p_note: input.note ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.product(input.productId) })
      void queryClient.invalidateQueries({ queryKey: ['movements'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
      void queryClient.invalidateQueries({ queryKey: ['bin'] })
      void queryClient.invalidateQueries({ queryKey: ['expiring'] })
    },
  })
}

/** Who performed movements — populates the actor filter. */
export function useActors() {
  return useQuery({
    queryKey: ['actors'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name')
      if (error) throw error
      return data ?? []
    },
  })
}
