import type { StaffTask } from '@/types/app'

export const PRIORITY: Record<StaffTask['priority'], { label: string; chip: 'default' | 'info' | 'warning' | 'destructive' }> = {
  low: { label: 'Low', chip: 'default' },
  normal: { label: 'Normal', chip: 'info' },
  high: { label: 'High', chip: 'warning' },
  urgent: { label: 'Urgent', chip: 'destructive' },
}

export const TASK_STATUS: Record<StaffTask['status'], { label: string; rail: string }> = {
  open: { label: 'To do', rail: 'bg-info' },
  in_progress: { label: 'In progress', rail: 'bg-warning' },
  done: { label: 'Done', rail: 'bg-success' },
  cancelled: { label: 'Cancelled', rail: 'bg-muted-foreground' },
}
