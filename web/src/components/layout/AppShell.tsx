import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { toast } from 'sonner'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { BottomNav } from './BottomNav'
import { ConnectionBanner } from './ConnectionBanner'
import { WarehouseStatusBanner } from './WarehouseStatus'
import { GlobalScannerSheet } from '@/components/scanner/GlobalScannerSheet'
import { useAuth } from '@/stores/auth'
import { useTheme } from '@/stores/theme'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useOfflineQueue } from '@/hooks/useOfflineQueue'
import { useRealtime } from '@/hooks/useRealtime'

/**
 * The frame every signed-in page renders inside. It owns the cross-cutting
 * concerns: theme sync, keyboard shortcuts, the offline queue drain, and the
 * one realtime channel that keeps the bell and stock counts fresh app-wide.
 */
export function AppShell() {
  const { profile, roleChanged, refreshProfile } = useAuth()
  const syncWithSystem = useTheme((s) => s.syncWithSystem)
  const isAdmin = profile?.role === 'inventory_admin'

  useKeyboardShortcuts()
  useOfflineQueue()

  useEffect(() => syncWithSystem(), [syncWithSystem])

  // Admins hear about alerts everywhere; staff only need stock freshness.
  useRealtime(
    isAdmin ? 'shell:admin' : 'shell:staff',
    isAdmin ? ['alerts', 'stock_levels', 'app_settings', 'staff_tasks'] : ['stock_levels', 'app_settings', 'staff_tasks'],
    {
      onChange: (table, payload) => {
        if (table !== 'alerts' || payload.eventType !== 'INSERT') return
        const alert = payload.new as { severity?: string; title?: string; message?: string }
        if (alert.severity === 'critical') {
          toast.error(alert.title ?? 'Critical alert', { description: alert.message })
        }
      },
    },
  )

  // A role change mid-session must not leave stale permissions on screen.
  useEffect(() => {
    if (!roleChanged) return
    toast.info('Your role changed', { description: 'Reloading so your access matches.' })
    const timer = setTimeout(() => window.location.reload(), 1_500)
    return () => clearTimeout(timer)
  }, [roleChanged])

  // Catch a deactivation or promotion made while this tab was in the background.
  useEffect(() => {
    const onFocus = () => void refreshProfile()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshProfile])

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <ConnectionBanner />
        <WarehouseStatusBanner />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 pb-24 pt-4 md:px-6 md:pb-8">
          <Outlet />
        </main>
        <BottomNav />
      </div>
      <GlobalScannerSheet />
    </div>
  )
}
