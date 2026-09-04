import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { subscribeChanges, type SubscribeOptions, type WatchedTable } from '@/lib/realtime'
import { useUi } from '@/stores/ui'
import { useAuth } from '@/stores/auth'

/**
 * Subscribes a page to Postgres changes and reports socket health to the shell.
 * Channels are created on mount and removed on unmount so the free-tier
 * connection budget is never exceeded (TRD §6).
 */
export function useRealtime(
  channelName: string,
  tables: WatchedTable[],
  options: Omit<SubscribeOptions, 'tables' | 'onStatus'> = {},
): void {
  const queryClient = useQueryClient()
  const setConnection = useUi((s) => s.setConnection)
  const session = useAuth((s) => s.session)

  // Callers pass an inline arrow, and `tables` / `filter` are literals. Holding
  // the callback in a ref and comparing the rest by value keeps the channel
  // alive across renders instead of tearing it down and rebuilding it each time.
  const onChangeRef = useRef(options.onChange)
  onChangeRef.current = options.onChange

  const tableKey = tables.join(',')
  const filterKey = JSON.stringify(options.filter ?? {})

  useEffect(() => {
    if (!session) return

    return subscribeChanges(channelName, queryClient, {
      tables: tableKey.split(',') as WatchedTable[],
      filter: JSON.parse(filterKey) as SubscribeOptions['filter'],
      onStatus: setConnection,
      onChange: (table, payload) => onChangeRef.current?.(table, payload),
    })
  }, [channelName, tableKey, filterKey, queryClient, session, setConnection])
}
