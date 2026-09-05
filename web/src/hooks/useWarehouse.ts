import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type { WarehouseStatus } from '@/types/app'
import type { Json } from '@/types/database'

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * Whether the doors are open right now, resolved by the database so every
 * device agrees regardless of its own clock or timezone. Realtime on
 * `app_settings` refreshes it the moment an admin flips the switch; the
 * minute-level poll catches the scheduled open/close without a change event.
 */
export function useWarehouseStatus() {
  return useQuery({
    queryKey: qk.warehouseStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<WarehouseStatus | null> => {
      const { data, error } = await supabase.rpc('warehouse_status')
      if (error) throw error
      return data as unknown as WarehouseStatus | null
    },
  })
}

export type WarehouseStatusPatch = Partial<
  Pick<WarehouseStatus, 'is_open' | 'auto_schedule' | 'open_time' | 'close_time' | 'days' | 'timezone' | 'closed_message'>
>

export function useSetWarehouseStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: WarehouseStatusPatch): Promise<WarehouseStatus> => {
      const { data, error } = await supabase.rpc('set_warehouse_status', { p: patch as unknown as Json })
      if (error) throw error
      return data as unknown as WarehouseStatus
    },
    onSuccess: (status) => {
      queryClient.setQueryData(qk.warehouseStatus(), status)
      void queryClient.invalidateQueries({ queryKey: qk.settings() })
    },
  })
}

/** "Mon–Sat 10:00–19:00" for banners and the settings card. */
export function describeHours(status: WarehouseStatus): string {
  const days = [...status.days].sort((a, b) => a - b)
  const names = days.map((d) => DAY_NAMES[d - 1]).filter(Boolean)
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  const dayPart =
    names.length === 7 ? 'Every day' : consecutive && names.length > 2 ? `${names[0]}–${names[names.length - 1]}` : names.join(', ')
  return `${dayPart} ${status.open_time}–${status.close_time}`
}
