import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/stores/auth'
import type { DashboardKpis } from '@/types/app'
import type { Views } from '@/types/database'

/** Every KPI in one round trip (TRD §4.2). Realtime invalidates it; the 30 s
 *  interval is the fallback for a dropped socket. */
export function useDashboardKpis() {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.dashboardKpis(),
    enabled: isAdmin,
    refetchInterval: 30_000,
    queryFn: async (): Promise<DashboardKpis | null> => {
      const { data, error } = await supabase.rpc('dashboard_kpis')
      if (error) throw error
      return data as unknown as DashboardKpis | null
    },
  })
}

export function useStockByRow() {
  return useQuery({
    queryKey: qk.stockByRow(),
    refetchInterval: 60_000,
    queryFn: async (): Promise<Views<'v_stock_by_row'>[]> => {
      const { data, error } = await supabase.from('v_stock_by_row').select('*').order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export type ExpiryBucket = 'expired' | '7d' | '30d' | '60d' | 'later'

export function useExpiringStock(buckets: ExpiryBucket[], limit = 200) {
  return useQuery({
    queryKey: qk.expiring(buckets.join(',')),
    queryFn: async (): Promise<Views<'v_expiring_stock'>[]> => {
      const { data, error } = await supabase
        .from('v_expiring_stock')
        .select('*')
        .in('bucket', buckets)
        .order('expiry_date', { ascending: true })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useLowStock(limit = 100) {
  return useQuery({
    queryKey: ['low-stock', limit],
    queryFn: async (): Promise<Views<'v_low_stock'>[]> => {
      const { data, error } = await supabase
        .from('v_low_stock')
        .select('*')
        .order('available')
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

/** Units expiring per week for the expiry chart. */
export function useExpiryTimeline(weeks = 8) {
  const { data: rows, ...rest } = useExpiringStock(['expired', '7d', '30d', '60d', 'later'], 1000)

  const buckets = new Map<string, number>()
  const now = new Date()
  for (let w = 0; w < weeks; w++) {
    const start = new Date(now)
    start.setDate(start.getDate() + w * 7)
    buckets.set(weekLabel(start), 0)
  }

  for (const row of rows ?? []) {
    if (!row.expiry_date) continue
    const label = weekLabel(new Date(`${row.expiry_date}T00:00:00`))
    if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + row.quantity)
  }

  return { data: [...buckets].map(([week, units]) => ({ week, units })), ...rest }
}

function weekLabel(date: Date): string {
  const monday = new Date(date)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  return monday.toISOString().slice(5, 10)
}
