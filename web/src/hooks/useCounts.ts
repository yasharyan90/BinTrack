import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { CountSession } from '@/types/app'
import type { Tables } from '@/types/database'

export type CountLine = Tables<'count_lines'> & {
  bin: { id: string; location_code: string } | null
  product: { id: string; sku: string; name: string; barcode: string | null } | null
}

export function useCountSessions() {
  return useQuery({
    queryKey: qk.counts(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('count_sessions')
        .select('*, row:warehouse_rows(id, code, name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as (CountSession & {
        row: { id: string; code: string; name: string | null } | null
      })[]
    },
  })
}

export function useCountSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: qk.count(sessionId ?? 'none'),
    enabled: !!sessionId,
    queryFn: async () => {
      const [session, lines] = await Promise.all([
        supabase
          .from('count_sessions')
          .select('*, row:warehouse_rows(id, code, name)')
          .eq('id', sessionId!)
          .single(),
        supabase
          .from('count_lines')
          .select('*, bin:bins(id, location_code), product:products(id, sku, name, barcode)')
          .eq('session_id', sessionId!)
          .order('created_at'),
      ])
      if (session.error) throw session.error
      if (lines.error) throw lines.error
      return {
        session: session.data as CountSession & {
          row: { id: string; code: string; name: string | null } | null
        },
        lines: (lines.data ?? []) as unknown as CountLine[],
      }
    },
  })
}

export function useStartCountSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      rowId,
      name,
      blind,
    }: {
      rowId: string
      name?: string
      blind: boolean
    }) => {
      const { data, error } = await supabase.rpc('start_count_session', {
        p_row_id: rowId,
        p_name: name ?? null,
        p_blind: blind,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.counts() }),
  })
}

export function useSubmitCountLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      sessionId,
      binId,
      productId,
      countedQty,
      lotNumber,
      expiryDate,
    }: {
      sessionId: string
      binId: string
      productId: string
      countedQty: number
      lotNumber?: string | null
      expiryDate?: string | null
    }) => {
      const { data, error } = await supabase.rpc('submit_count_line', {
        p_session_id: sessionId,
        p_bin_id: binId,
        p_product_id: productId,
        p_counted_qty: countedQty,
        p_lot_number: lotNumber ?? null,
        p_expiry_date: expiryDate ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, { sessionId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.count(sessionId) })
    },
  })
}

/** Approving turns every variance into a `count_correction` movement. */
export function useApproveCountSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.rpc('approve_count_session', {
        p_session_id: sessionId,
      })
      if (error) throw error
      return data as unknown as { corrections: number }
    },
    onSuccess: (_d, sessionId) => {
      void queryClient.invalidateQueries({ queryKey: qk.count(sessionId) })
      void queryClient.invalidateQueries({ queryKey: qk.counts() })
      void queryClient.invalidateQueries({ queryKey: ['movements'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUpdateCountSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'submitted' | 'cancelled' }) => {
      const { error } = await supabase.from('count_sessions').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, { id }) => {
      void queryClient.invalidateQueries({ queryKey: qk.count(id) })
      void queryClient.invalidateQueries({ queryKey: qk.counts() })
    },
  })
}
