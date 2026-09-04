import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw, Wifi } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'

/**
 * "Live" when the socket is up, amber while it reconnects, and an offline note
 * with the parked-scan count when the radio is gone (App Flow §6.3).
 */
export function LiveIndicator({ className }: { className?: string }) {
  const connection = useUi((s) => s.connection)

  const spec = {
    live: { label: 'Live', dot: 'bg-success', Icon: Wifi },
    connecting: { label: 'Connecting', dot: 'bg-warning', Icon: RefreshCw },
    reconnecting: { label: 'Reconnecting', dot: 'bg-warning', Icon: RefreshCw },
    off: { label: 'Offline', dot: 'bg-muted-foreground', Icon: CloudOff },
  }[connection]

  return (
    <span className={cn('flex items-center gap-1.5 text-small text-muted-foreground', className)}>
      <span className={cn('size-2 rounded-full', spec.dot)} aria-hidden />
      {spec.label}
    </span>
  )
}

export function ConnectionBanner() {
  const { connection, queuedScans } = useUi()
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (online && connection !== 'reconnecting') return null

  return (
    <div
      className="flex items-center justify-center gap-2 bg-warning/12 px-4 py-1.5 text-small text-warning"
      role="status"
    >
      <CloudOff className="size-3.5" aria-hidden />
      {online
        ? 'Live updates paused, reconnecting… data still refreshes every 30 s.'
        : 'You are offline. Scans are queued and will sync automatically.'}
      {queuedScans > 0 && <span className="font-medium">({queuedScans} queued)</span>}
    </div>
  )
}
