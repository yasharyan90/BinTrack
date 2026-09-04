import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL')!
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Client bound to the caller's JWT — RLS applies, used to verify identity/role. */
export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? ''
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Privileged client — bypasses RLS. Only after the caller has been verified. */
export function serviceClient(): SupabaseClient {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 401,
  ) {
    super(message)
  }
}

export type Caller = { id: string; email: string | null; role: 'inventory_admin' | 'staff' }

/**
 * Verifies the bearer token and resolves the caller's role from `profiles`
 * (source of truth — never a possibly-stale JWT claim).
 */
export async function requireUser(req: Request): Promise<Caller> {
  if (!req.headers.get('Authorization')) {
    throw new AuthError('UNAUTHENTICATED', 'Missing Authorization header')
  }
  const supabase = userClient(req)
  const { data: auth, error } = await supabase.auth.getUser()
  if (error || !auth?.user) throw new AuthError('UNAUTHENTICATED', 'Invalid or expired token')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, is_active')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (!profile || !profile.is_active) {
    throw new AuthError('FORBIDDEN', 'Account inactive or unknown', 403)
  }
  return { id: profile.id, email: profile.email, role: profile.role }
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireUser(req)
  if (caller.role !== 'inventory_admin') {
    throw new AuthError('FORBIDDEN', 'inventory_admin role required', 403)
  }
  return caller
}
