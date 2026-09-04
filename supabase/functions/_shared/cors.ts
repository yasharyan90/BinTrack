export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function preflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Every function returns the same envelope: { ok, data? , error? } (TRD §9). */
export function ok<T>(data: T): Response {
  return json({ ok: true, data })
}

export function fail(code: string, message: string, details?: unknown, status = 400): Response {
  return json({ ok: false, error: { code, message, details } }, status)
}
