// order-webhook — external order intake. Authenticated with an HMAC-SHA256
// signature over the raw body, not a Supabase JWT.
//
//   POST /functions/v1/order-webhook
//   x-signature: sha256=<hex>          (HMAC of the raw body, ORDER_WEBHOOK_SECRET)
//   { "order_number": "SHOP-1001", "customer_name": "…",
//     "items": [{ "sku": "MUG-0042", "quantity": 2 }] }
//
// Returns the allocated pick list so the caller learns the bins immediately.
import { serviceClient } from '../_shared/client.ts'
import { fail, ok, preflight } from '../_shared/cors.ts'

const SECRET = Deno.env.get('ORDER_WEBHOOK_SECRET') ?? ''

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'POST only', undefined, 405)
  if (!SECRET) return fail('NOT_CONFIGURED', 'ORDER_WEBHOOK_SECRET is not set', undefined, 503)

  const raw = await req.text()
  const signature = req.headers.get('x-signature') ?? ''
  if (!(await verify(raw, signature))) {
    return fail('BAD_SIGNATURE', 'signature missing or invalid', undefined, 401)
  }

  let body: { order_number?: string; customer_name?: string; note?: string; items?: unknown }
  try {
    body = JSON.parse(raw)
  } catch {
    return fail('INVALID', 'body is not valid JSON')
  }

  const items = Array.isArray(body.items) ? body.items : []
  if (items.length === 0) return fail('INVALID', 'items must be a non-empty array')
  for (const [i, item] of items.entries()) {
    const it = item as { sku?: string; quantity?: number }
    if (!it?.sku || !Number.isInteger(it.quantity) || (it.quantity as number) <= 0) {
      return fail('INVALID', `items[${i}] needs a sku and a positive integer quantity`)
    }
  }

  const admin = serviceClient()
  const { data, error } = await admin.rpc('create_order', {
    p_order: {
      order_number: body.order_number ?? null,
      customer_name: body.customer_name ?? null,
      note: body.note ?? null,
      source: 'api',
      items,
    },
  })

  if (error) {
    const [code, ...rest] = error.message.split(':')
    return fail(code || 'ORDER_FAILED', rest.join(':') || error.message, undefined, 400)
  }
  return ok(data)
})

/** Constant-time compare of `sha256=<hex>` (the `sha256=` prefix is optional). */
async function verify(raw: string, header: string): Promise<boolean> {
  const provided = header.replace(/^sha256=/i, '').trim().toLowerCase()
  if (provided.length === 0) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')

  if (expected.length !== provided.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i)
  return diff === 0
}
