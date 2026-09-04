import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { DEFAULT_SETTINGS, type AppSettings, type Profile } from '@/types/app'
import type { AppRole, Database, Json } from '@/types/database'

/** Thresholds the alert engine reads (`app_settings`, TRD §5.5). */
export function useSettings() {
  return useQuery({
    queryKey: qk.settings(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from('app_settings').select('key, value')
      if (error) throw error
      const settings = { ...DEFAULT_SETTINGS }
      for (const row of data ?? []) {
        if (row.key in settings) {
          (settings as Record<string, unknown>)[row.key] = row.value
        }
      }
      return settings
    },
  })
}

export function useSaveSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ key, value }: { key: keyof AppSettings; value: number | boolean }) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key, value }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.settings() })
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useUsers() {
  return useQuery({
    queryKey: qk.users(),
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role')
        .order('full_name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSetUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase.rpc('set_user_role', {
        p_user_id: userId,
        p_role: role,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.users() }),
  })
}

export function useSetUserActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, active }: { userId: string; active: boolean }) => {
      const { data, error } = await supabase.rpc('set_user_active', {
        p_user_id: userId,
        p_active: active,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.users() }),
  })
}

/** Name, theme and digest opt-in — the fields a user owns on their own row. */
export function useUpdateOwnProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      userId,
      fullName,
      preferences,
    }: {
      userId: string
      fullName?: string
      preferences?: Record<string, unknown>
    }) => {
      const patch: Database['public']['Tables']['profiles']['Update'] = {}
      if (fullName !== undefined) patch.full_name = fullName
      if (preferences !== undefined) patch.preferences = preferences as Json
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (profile) => {
      void queryClient.invalidateQueries({ queryKey: qk.profile(profile.id) })
      void queryClient.invalidateQueries({ queryKey: qk.users() })
    },
  })
}

export function useAuditLog(entity?: string, limit = 100) {
  return useQuery({
    queryKey: qk.audit({ entity, limit }),
    queryFn: async () => {
      let query = supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (entity) query = query.eq('entity', entity)
      const { data, error } = await query
      if (error) throw error
      return data ?? []
    },
  })
}
