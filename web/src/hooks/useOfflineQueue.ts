import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { readQueue, replayQueue } from '@/lib/offlineQueue'
import { useUi } from '@/stores/ui'
import { useAppToast } from './useAppToast'

/**
 * Watches the network and drains the parked scan queue when it returns
 * (Feature B9). Mounted once, in the app shell.
 */
export function useOfflineQueue(): void {
  const setQueuedScans = useUi((s) => s.setQueuedScans)
  const queryClient = useQueryClient()
  const { showSuccess, showWarning } = useAppToast()

  useEffect(() => {
    let cancelled = false

    const refreshCount = async () => {
      const queue = await readQueue()
      if (!cancelled) setQueuedScans(queue.length)
    }

    const drain = async () => {
      const before = await readQueue()
      if (before.length === 0) return
      const result = await replayQueue()
      if (cancelled) return
      setQueuedScans(result.remaining)
      if (result.replayed > 0) {
        showSuccess(
          `${result.replayed} queued ${result.replayed === 1 ? 'scan' : 'scans'} synced`,
          result.dropped > 0 ? `${result.dropped} were already applied.` : undefined,
        )
        void queryClient.invalidateQueries()
      } else if (result.dropped > 0) {
        showWarning(`${result.dropped} queued scans were already applied`)
      }
    }

    void refreshCount()
    void drain()

    const onOnline = () => void drain()
    const onOffline = () => void refreshCount()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = window.setInterval(refreshCount, 10_000)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.clearInterval(interval)
    }
  }, [queryClient, setQueuedScans, showSuccess, showWarning])
}
