import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/stores/auth'
import type { Alert, AlertFilters } from '@/types/app'
import type { AlertType } from '@/types/database'

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
  dead_stock: 'Dead stock',
  bin_over_capacity: 'Bin over capacity',
  pick_discrepancy: 'Pick discrepancy',
  order_short: 'Short order',
}

export type AlertWithRefs = Alert & {
  product: { id: string; sku: string; name: string } | null
  bin: { id: string; location_code: string } | null
  order: { id: string; order_number: string } | null
}

export function useAlerts(filters: AlertFilters = {}) {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')

  return useQuery({
    queryKey: qk.alerts(filters),
    enabled: isAdmin,
    queryFn: async (): Promise<AlertWithRefs[]> => {
      let query = supabase
        .from('alerts')
        .select(
          '*, product:products(id, sku, name), bin:bins(id, location_code), order:orders(id, order_number)',
        )
        .order('severity', { ascending: false })
        .order('last_evaluated_at', { ascending: false })
        .limit(300)

      if (filters.status?.length) query = query.in('status', filters.status)
      if (filters.type && filters.type !== 'all') query = query.eq('type', filters.type)
      if (filters.severity && filters.severity !== 'all') query = query.eq('severity', filters.severity)
      if (filters.search?.trim()) query = query.ilike('title', `%${filters.search.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as AlertWithRefs[]
    },
  })
}

export function useUnreadAlertCount() {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.alertsUnread(),
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc('unread_alert_count')
      if (error) throw error
      return data ?? 0
    },
  })
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      alertId,
      action,
      snoozeUntil,
    }: {
      alertId: string
      action: 'acknowledge' | 'snooze' | 'resolve' | 'reopen'
      snoozeUntil?: string
    }) => {
      const { data, error } = await supabase.rpc('acknowledge_alert', {
        p_alert_id: alertId,
        p_action: action,
        p_snooze_until: snoozeUntil ?? null,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

/** Bulk acknowledge from the alert centre; failures on individual rows are surfaced. */
export function useBulkAcknowledge() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (alertIds: string[]) => {
      const results = await Promise.allSettled(
        alertIds.map((id) =>
          supabase.rpc('acknowledge_alert', { p_alert_id: id, p_action: 'acknowledge' }),
        ),
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      return { acknowledged: alertIds.length - failed, failed }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useMarkAlertsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (alertIds: string[]) => {
      if (alertIds.length === 0) return 0
      const { data, error } = await supabase.rpc('mark_alerts_read', { p_alert_ids: alertIds })
      if (error) throw error
      return data ?? 0
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.alertsUnread() })
    },
  })
}

/** Kicks the rule engine by hand — useful locally, where pg_cron is absent. */
export function useEvaluateAlerts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('evaluate_alerts', { p_product_id: null })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
