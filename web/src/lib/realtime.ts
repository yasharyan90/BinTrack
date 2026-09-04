/**
 * Realtime plumbing (TRD §6, Implementation Plan §3.1).
 *
 * One multiplexed socket, one channel per page, torn down on unmount. Postgres
 * changes never carry UI state — they only tell React Query what went stale, so
 * a CSV import that fires 1 000 events costs one refetch, not a thousand.
 */
import type { QueryClient } from '@tanstack/react-query'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { qk } from './queryClient'
import { debounce } from './utils'

export type WatchedTable =
  | 'stock_levels'
  | 'alerts'
  | 'pick_tasks'
  | 'orders'
  | 'stock_movements'
  | 'import_jobs'
  | 'grns'
  | 'grn_lines'

type Row = Record<string, unknown>

/** Maps one changed row to the query keys it invalidates. */
function keysFor(table: WatchedTable, row: Row): unknown[][] {
  switch (table) {
    case 'stock_levels': {
      const productId = row.product_id as string | undefined
      const binId = row.bin_id as string | undefined
      return [
        productId ? [...qk.product(productId)] : [],
        binId ? [...qk.bin(binId)] : [],
        ['search'],
        ['dashboard'],
        ['expiring'],
      ].filter((k) => k.length > 0)
    }
    case 'alerts':
      return [['alerts'], ['dashboard']]
    case 'pick_tasks': {
      const orderId = row.order_id as string | undefined
      return [orderId ? [...qk.order(orderId)] : ['orders'], ['dashboard']]
    }
    case 'orders':
      return [['orders'], ['order'], ['dashboard']]
    case 'stock_movements':
      return [['movements'], ['dashboard']]
    case 'import_jobs':
      return [['imports'], ['import']]
    case 'grns':
    case 'grn_lines': {
      const grnId = (table === 'grns' ? row.id : row.grn_id) as string | undefined
      return [grnId ? [...qk.grn(grnId)] : ['grn'], ['grns'], ['grn-dashboard'], ['purchase-order']]
    }
  }
}

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'off'

export type SubscribeOptions = {
  tables: WatchedTable[]
  /** Server-side row filter, e.g. `order_id=eq.<uuid>`. */
  filter?: Partial<Record<WatchedTable, string>>
  onStatus?: (status: ConnectionStatus) => void
  /** Extra side effect per change (toasts for new critical alerts, etc.). */
  onChange?: (table: WatchedTable, payload: RealtimePostgresChangesPayload<Row>) => void
}

/**
 * Subscribes a channel and returns its teardown. Invalidations are debounced by
 * 250 ms so a burst coalesces into a single refetch per key.
 */
export function subscribeChanges(
  channelName: string,
  queryClient: QueryClient,
  options: SubscribeOptions,
): () => void {
  const pending = new Set<string>()

  const flush = debounce(() => {
    for (const serialised of pending) {
      queryClient.invalidateQueries({ queryKey: JSON.parse(serialised) as unknown[] })
    }
    pending.clear()
  }, 250)

  let channel: RealtimeChannel = supabase.channel(channelName)

  for (const table of options.tables) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(options.filter?.[table] ? { filter: options.filter[table] } : {}),
      },
      (payload: RealtimePostgresChangesPayload<Row>) => {
        const row = (payload.new ?? payload.old ?? {}) as Row
        for (const key of keysFor(table, row)) pending.add(JSON.stringify(key))
        flush()
        options.onChange?.(table, payload)
      },
    )
  }

  options.onStatus?.('connecting')
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') options.onStatus?.('live')
    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') options.onStatus?.('reconnecting')
    else if (status === 'CLOSED') options.onStatus?.('off')
  })

  return () => {
    flush.cancel()
    supabase.removeChannel(channel)
  }
}

/**
 * Presence: who is picking which order (Feature B10). Returns a teardown and
 * pushes the current roster to `onSync`.
 */
export function trackPicking(
  orderId: string,
  user: { id: string; name: string },
  onSync: (peers: { id: string; name: string; order_id: string }[]) => void,
): () => void {
  const channel = supabase.channel('presence:picking', {
    config: { presence: { key: user.id } },
  })

  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ id: string; name: string; order_id: string }>()
      onSync(Object.values(state).flat())
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ id: user.id, name: user.name, order_id: orderId })
      }
    })

  return () => {
    supabase.removeChannel(channel)
  }
}

/** Read-only presence view for the admin dashboard. */
export function watchPickers(
  onSync: (peers: { id: string; name: string; order_id: string }[]) => void,
): () => void {
  const channel = supabase.channel('presence:picking')
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<{ id: string; name: string; order_id: string }>()
      onSync(Object.values(state).flat())
    })
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
