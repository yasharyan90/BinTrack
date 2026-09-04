import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to web/.env.local and fill them in.',
  )
}

/**
 * The anon key is safe in the browser: every table is RLS-protected and the
 * stock-mutating functions are SECURITY DEFINER with their own role checks
 * (TRD §7.2). One client, so realtime multiplexes over a single socket.
 */
export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'bintrack-auth',
  },
  realtime: {
    // Free tier: keep the event rate modest; bursts are coalesced client-side.
    params: { eventsPerSecond: 10 },
  },
  global: { headers: { 'x-application-name': 'bintrack-web' } },
})

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey

/** Invoke an Edge Function with the caller's session attached. */
export async function invokeFunction<T>(
  name: string,
  body: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) return { data: null, error }
  const envelope = data as { ok?: boolean; data?: T; error?: { code: string; message: string } }
  if (envelope && envelope.ok === false) {
    return {
      data: null,
      error: new Error(`${envelope.error?.code ?? 'ERROR'}:${envelope.error?.message ?? 'failed'}`),
    }
  }
  return { data: (envelope?.data ?? (data as T)) as T, error: null }
}
