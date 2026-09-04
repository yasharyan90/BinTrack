import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { parseError } from '@/lib/errors'
import { enqueue, isOnline } from '@/lib/offlineQueue'
import type { PickList, VerifyResult } from '@/types/app'
import type { Json, OrderStatus, Tables } from '@/types/database'

export type OrderListFilters = { status?: OrderStatus | 'all'; search?: string; limit?: number }

export function useOrders(filters: OrderListFilters = {}) {
  return useQuery({
    queryKey: qk.orders(filters),
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('*, items:order_items(id, quantity, picked_qty, is_short)')
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 100)

      if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        query = query.or(`order_number.ilike.${term},customer_name.ilike.${term}`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as (Tables<'orders'> & {
        items: { id: string; quantity: number; picked_qty: number; is_short: boolean }[]
      })[]
    },
  })
}

/** Dashboard widget: what is being picked right now. */
export function useOpenOrders(limit = 8) {
  return useQuery({
    queryKey: qk.orders({ open: true }),
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, tasks:pick_tasks(id, status)')
        .in('status', ['pending', 'allocated', 'partially_allocated', 'picking'])
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as (Tables<'orders'> & { tasks: { id: string; status: string }[] })[]
    },
  })
}

export function usePickList(orderId: string | undefined) {
  return useQuery({
    queryKey: qk.order(orderId ?? 'none'),
    enabled: !!orderId,
    queryFn: async (): Promise<PickList> => {
      const { data, error } = await supabase.rpc('get_pick_list', { p_order_id: orderId! })
      if (error) throw error
      const list = data as unknown as PickList | null
      return list ?? { order: null, items: [], tasks: [] }
    },
  })
}

export type NewOrderInput = {
  order_number?: string | null
  customer_name?: string | null
  note?: string | null
  source?: string
  items: { product_id?: string; sku?: string; quantity: number }[]
}

/**
 * Creating an order allocates it in the same transaction, so the response is
 * already the pick list — bins on screen with no second round trip (PRD §5.5).
 */
export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewOrderInput): Promise<PickList> => {
      const { data, error } = await supabase.rpc('create_order', {
        p_order: input as unknown as Json,
      })
      if (error) throw error
      return data as unknown as PickList
    },
    onSuccess: (pickList) => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      if (pickList.order) {
        queryClient.setQueryData(qk.order(pickList.order.id), pickList)
      }
    },
  })
}

export function useStartPicking() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('start_picking', { p_order_id: orderId })
      if (error) throw error
      return data
    },
    onSuccess: (_d, orderId) => {
      void queryClient.invalidateQueries({ queryKey: qk.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

/**
 * Scan verification (PRD §5.6). Step 1 sends the bin alone; step 2 adds the
 * product barcode. A mismatch is a normal outcome, not an exception — it comes
 * back as `{ ok: false, reason }` so the UI can show expected vs scanned.
 */
export function useVerifyPick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      binCode,
      barcode,
    }: {
      taskId: string
      binCode: string
      barcode?: string | null
    }): Promise<VerifyResult> => {
      const { data, error } = await supabase.rpc('verify_pick', {
        p_pick_task_id: taskId,
        p_scanned_bin_code: binCode,
        p_scanned_barcode: barcode ?? null,
      })
      if (error) throw error
      return data as unknown as VerifyResult
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['order'] })
    },
  })
}

export function useConfirmPick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      quantity,
      overrideReason,
    }: {
      taskId: string
      /** Read by onSuccess, to seed the cache for the right order. */
      orderId: string
      quantity?: number
      overrideReason?: string
    }): Promise<PickList | { queued: true }> => {
      const args = {
        p_pick_task_id: taskId,
        p_qty: quantity ?? null,
        p_override_reason: overrideReason ?? null,
      }

      // Dead zone: park the call and replay it when the radio comes back.
      if (!isOnline()) {
        await enqueue('confirm_pick', args)
        return { queued: true }
      }

      const { data, error } = await supabase.rpc('confirm_pick', args)
      if (error) {
        if (parseError(error).code === 'OFFLINE') {
          await enqueue('confirm_pick', args)
          return { queued: true }
        }
        throw error
      }
      return data as unknown as PickList
    },
    onSuccess: (result, variables) => {
      if ('queued' in result) return
      queryClient.setQueryData(qk.order(variables.orderId), result)
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['movements'] })
    },
  })
}

export function useShipOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('ship_order', { p_order_id: orderId })
      if (error) throw error
      return data
    },
    onSuccess: (_d, orderId) => {
      void queryClient.invalidateQueries({ queryKey: qk.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useCancelOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: reason,
      })
      if (error) throw error
      return data
    },
    onSuccess: (_d, { orderId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** Re-run allocation after receiving stock for a short order. */
export function useReallocateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('allocate_order', { p_order_id: orderId })
      if (error) throw error
    },
    onSuccess: (_d, orderId) => {
      void queryClient.invalidateQueries({ queryKey: qk.order(orderId) })
      void queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
