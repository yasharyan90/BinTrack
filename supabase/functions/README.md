# Edge Functions

All functions are Deno/TypeScript, deployed with `supabase functions deploy <name>`.
Shared code lives in `_shared/` (Supabase client factory, zod schemas mirrored from the web app, CORS headers).

Every function that acts on behalf of a user:
1. Reads `Authorization: Bearer <user JWT>`.
2. Creates a user-scoped client to call `rpc('auth_role')` and verify the role.
3. Only then creates a service-role client for privileged work.

## csv-import
`POST /functions/v1/csv-import`  — admin only
```json
{ "job_id": "uuid" }
```
Reads `import_jobs` (kind, file_path, mode), downloads the CSV from Storage bucket `imports/`, parses with a streaming CSV parser, validates each row with zod, and calls in batches of 200:

| kind | RPC |
|---|---|
| products | `bulk_upsert_products(rows jsonb, mode text)` |
| bins | `bulk_upsert_bins(rows jsonb, mode text)` |
| opening_stock | `bulk_receive_stock(rows jsonb, mode text)` |
| orders | `create_order(order jsonb)` per order_number group |

Updates `import_jobs.processed_rows / success_rows / error_rows / errors` after each batch (Realtime pushes progress to the UI). `mode = 'strict'` wraps the whole run in one RPC transaction and aborts on the first error.

## alert-digest
Scheduled (Supabase cron → HTTP) daily. Selects active alerts grouped by severity and emails opted-in admins (`profiles.preferences.email_digest = true`) via Resend. Skips silently if `RESEND_API_KEY` is unset.

## label-pdf
`POST /functions/v1/label-pdf` — authenticated
```json
{ "type": "bins" | "products", "ids": ["uuid", "..."] }
```
Returns `application/pdf` (A4, 3 × 8 grid). Bins → QR of `location_code` + text. Products → Code128 of `barcode` (or SKU) + name.

## order-webhook (optional)
`POST /functions/v1/order-webhook` — HMAC-SHA256 signature in `x-signature` using `ORDER_WEBHOOK_SECRET`. Body:
```json
{ "order_number": "SHOP-1001", "customer_name": "…", "items": [{ "sku": "MUG-0042", "quantity": 2 }] }
```
Calls `create_order` and returns the pick list.

## Local development
```bash
supabase functions serve --env-file supabase/.env.local
curl -X POST http://localhost:54321/functions/v1/csv-import \
  -H "Authorization: Bearer <admin jwt>" -d '{"job_id":"..."}'
```
