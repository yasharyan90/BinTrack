import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/stores/auth'
import type { BalanceResult, NewTaskInput, StaffPerformance, StaffTask } from '@/types/app'
import type { Json, TaskStatus, Views } from '@/types/database'

const TASK_SELECT =
  '*, assignee:profiles!staff_tasks_assigned_to_fkey(id, full_name, email), assigner:profiles!staff_tasks_assigned_by_fkey(id, full_name)'

/** The signed-in staff member's own list; RLS already scopes it to them. */
export function useMyTasks() {
  const userId = useAuth((s) => s.profile?.id)
  return useQuery({
    queryKey: qk.myTasks(),
    enabled: !!userId,
    queryFn: async (): Promise<StaffTask[]> => {
      const { data, error } = await supabase
        .from('staff_tasks')
        .select(TASK_SELECT)
        .eq('assigned_to', userId!)
        .order('status')
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as StaffTask[]
    },
  })
}

export type TaskFilters = { status?: TaskStatus | 'all' | 'active'; assignee?: string | 'all' }

export function useTasks(filters: TaskFilters = {}) {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.tasks(filters),
    enabled: isAdmin,
    queryFn: async (): Promise<StaffTask[]> => {
      let query = supabase
        .from('staff_tasks')
        .select(TASK_SELECT)
        .order('status')
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(300)
      if (filters.status === 'active') query = query.in('status', ['open', 'in_progress'])
      else if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.assignee && filters.assignee !== 'all') query = query.eq('assigned_to', filters.assignee)
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as StaffTask[]
    },
  })
}

function useTaskWrite<TVars, TResult>(run: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      void queryClient.invalidateQueries({ queryKey: qk.staffWorkload() })
      void queryClient.invalidateQueries({ queryKey: ['staff-performance'] })
    },
  })
}

/** Admin writes the instruction; no assignee means "whoever has the least". */
export function useAssignTask() {
  return useTaskWrite(async (input: NewTaskInput) => {
    const { data, error } = await supabase.rpc('assign_task', { p: input as unknown as Json })
    if (error) throw error
    return data
  })
}

export function useUpdateTaskStatus() {
  return useTaskWrite(async ({ taskId, status, note }: { taskId: string; status: TaskStatus; note?: string }) => {
    const { data, error } = await supabase.rpc('update_task_status', {
      p_task_id: taskId,
      p_status: status,
      p_note: note ?? null,
    })
    if (error) throw error
    return data
  })
}

export function useReassignTask() {
  return useTaskWrite(async ({ taskId, assignedTo }: { taskId: string; assignedTo: string }) => {
    const { data, error } = await supabase.rpc('reassign_task', { p_task_id: taskId, p_assigned_to: assignedTo })
    if (error) throw error
    return data
  })
}

/** Re-deals not-yet-started tasks so nobody carries more than one more than anyone else. */
export function useBalanceTasks() {
  return useTaskWrite(async (): Promise<BalanceResult> => {
    const { data, error } = await supabase.rpc('balance_open_tasks')
    if (error) throw error
    return data as unknown as BalanceResult
  })
}

export function useStaffWorkload() {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.staffWorkload(),
    enabled: isAdmin,
    queryFn: async (): Promise<Views<'v_staff_workload'>[]> => {
      const { data, error } = await supabase.from('v_staff_workload').select('*').order('full_name')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useStaffPerformance(days = 30) {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.staffPerformance(days),
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<StaffPerformance | null> => {
      const { data, error } = await supabase.rpc('staff_performance', { p_days: days })
      if (error) throw error
      return data as unknown as StaffPerformance | null
    },
  })
}
