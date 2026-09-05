import { QueryClient } from '@tanstack/react-query'
import { parseError } from './errors'

/**
 * Realtime is the primary freshness mechanism, so queries are allowed to go
 * stale for a while and simply get invalidated by a Postgres change. The 30 s
 * refetch interval on the dashboard is the fallback when the socket drops
 * (TRD §6, App Flow §6.3).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const { code } = parseError(error)
        // Never retry a decision the database already made.
        if (['FORBIDDEN', 'NOT_FOUND', 'INVALID', 'INVALID_STATE'].includes(code)) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})

/** Query keys in one place so realtime invalidation cannot drift from usage. */
export const qk = {
  profile: (id: string) => ['profile', id] as const,
  users: () => ['users'] as const,
  settings: () => ['settings'] as const,
  search: (q: string) => ['search', q] as const,
  product: (id: string) => ['product', id] as const,
  productLocations: (id: string) => ['product', id, 'locations'] as const,
  productMovements: (id: string) => ['product', id, 'movements'] as const,
  products: (filters: unknown) => ['products', filters] as const,
  categories: () => ['categories'] as const,
  warehouses: () => ['warehouses'] as const,
  rows: () => ['rows'] as const,
  bins: (rowId?: string) => ['bins', rowId ?? 'all'] as const,
  bin: (id: string) => ['bin', id] as const,
  binStock: (id: string) => ['bin', id, 'stock'] as const,
  orders: (filters: unknown) => ['orders', filters] as const,
  order: (id: string) => ['order', id] as const,
  movements: (filters: unknown) => ['movements', filters] as const,
  alerts: (filters: unknown) => ['alerts', filters] as const,
  alertsUnread: () => ['alerts', 'unread'] as const,
  dashboard: () => ['dashboard'] as const,
  dashboardKpis: () => ['dashboard', 'kpis'] as const,
  stockByRow: () => ['dashboard', 'by-row'] as const,
  binUtilisation: () => ['dashboard', 'bin-utilisation'] as const,
  recentMovements: () => ['dashboard', 'recent'] as const,
  expiring: (bucket: string) => ['expiring', bucket] as const,
  counts: () => ['counts'] as const,
  count: (id: string) => ['count', id] as const,
  imports: () => ['imports'] as const,
  importJob: (id: string) => ['import', id] as const,
  audit: (filters: unknown) => ['audit', filters] as const,
  vendors: () => ['vendors'] as const,
  purchaseOrders: (filters: unknown) => ['purchase-orders', filters] as const,
  purchaseOrder: (id: string) => ['purchase-order', id] as const,
  grns: (filters: unknown) => ['grns', filters] as const,
  grn: (id: string) => ['grn', id] as const,
  grnDashboard: () => ['grn-dashboard'] as const,
  warehouseStatus: () => ['warehouse-status'] as const,
  tasks: (filters: unknown) => ['tasks', filters] as const,
  myTasks: () => ['tasks', 'mine'] as const,
  staffPerformance: (days: number) => ['staff-performance', days] as const,
  staffWorkload: () => ['staff-workload'] as const,
}
