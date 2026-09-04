/**
 * Offline scan queue (Feature B9, Implementation Plan 4.6).
 *
 * Warehouses have dead zones. When a confirm fails because the network is gone,
 * the call is parked in IndexedDB and replayed on reconnect. Replay is safe
 * because `confirm_pick` is idempotent per task: a task already `picked` raises
 * INVALID_STATE, which the queue treats as "already applied" and drops.
 */
import { del, get, set } from 'idb-keyval'
import { supabase } from './supabase'
import { parseError } from './errors'

const KEY = 'bintrack-scan-queue'

export type QueuedCall = {
  id: string
  rpc: 'confirm_pick' | 'verify_pick' | 'record_movement'
  args: Record<string, unknown>
  queuedAt: number
  attempts: number
}

export async function readQueue(): Promise<QueuedCall[]> {
  return (await get<QueuedCall[]>(KEY)) ?? []
}

export async function enqueue(
  rpc: QueuedCall['rpc'],
  args: Record<string, unknown>,
): Promise<QueuedCall> {
  const queue = await readQueue()
  const call: QueuedCall = {
    id: crypto.randomUUID(),
    rpc,
    args,
    queuedAt: Date.now(),
    attempts: 0,
  }
  await set(KEY, [...queue, call])
  return call
}

export async function clearQueue(): Promise<void> {
  await del(KEY)
}

export type ReplayResult = { replayed: number; dropped: number; remaining: number }

/** Replays the queue in order; stops at the first genuinely network-level failure. */
export async function replayQueue(): Promise<ReplayResult> {
  const queue = await readQueue()
  if (queue.length === 0) return { replayed: 0, dropped: 0, remaining: 0 }

  const remaining: QueuedCall[] = []
  let replayed = 0
  let dropped = 0
  let networkDown = false

  for (const call of queue) {
    if (networkDown) {
      remaining.push(call)
      continue
    }
    const { error } = await supabase.rpc(
      call.rpc as 'confirm_pick',
      call.args as never,
    )
    if (!error) {
      replayed++
      continue
    }
    const { code } = parseError(error)
    if (code === 'OFFLINE') {
      networkDown = true
      remaining.push({ ...call, attempts: call.attempts + 1 })
    } else {
      // The server rejected it on its merits (already picked, cancelled, …).
      // Re-sending will never help, so it leaves the queue.
      dropped++
    }
  }

  await set(KEY, remaining)
  return { replayed, dropped, remaining: remaining.length }
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}
