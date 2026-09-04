# Technical Requirements Document (TRD)
## BinTrack — Supabase-native Inventory & Location Tracking

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-09-04 |
| Related | `01-PRD.md`, `supabase/migrations/0001_schema.sql`, `05-IMPLEMENTATION-PLAN.md` |

---

## 1. Architecture overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          React SPA (Vite + TS)                           │
│  Staff UI (search, orders, scanner, receive, transfer)                   │
│  Admin UI (dashboard, alerts, products, bins, CSV, users, settings)      │
│  supabase-js ── PostgREST (REST) ── RPC (PL/pgSQL) ── Realtime (WS)      │
└───────────────┬───────────────────────────┬──────────────────────────────┘
                │ HTTPS (anon key + user JWT)│ WSS
┌───────────────▼───────────────────────────▼──────────────────────────────┐
│                               SUPABASE                                   │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Auth    │  │ PostgREST │  │  Realtime    │  │  Edge Functions    │   │
│  │ (GoTrue) │  │ (auto API)│  │ (WebSockets) │  │  csv-import        │   │
│  │ role in  │  │ RLS-gated │  │ pg changes,  │  │  alert-digest      │   │
│  │ JWT      │  │           │  │ broadcast,   │  │  label-pdf         │   │
│  └────┬─────┘  └─────┬─────┘  │ presence     │  └─────────┬──────────┘   │
│       │              │        └──────┬───────┘            │ service role │
│  ┌────▼──────────────▼───────────────▼───────────────────▼───────────┐   │
│  │                        PostgreSQL 15                               │   │
│  │  tables · views · RPC functions · triggers · RLS · pg_trgm ·       │   │
│  │  pg_cron (alert sweep) · supabase_realtime publication             │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│  ┌──────────┐                                                            │
│  │ Storage  │  buckets: imports/, product-images/, labels/               │
│  └──────────┘                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Why no Express server?** Every business rule that must be atomic (allocate, move stock, verify pick) is a Postgres function called via `supabase.rpc()`. Long-running or privileged jobs (CSV parsing, email) run in Edge Functions. This removes an entire tier, its hosting, and its auth plumbing. An optional Express/Node gateway (for webhook ingestion from an external order system) is described in §11.

## 2. Technology stack & versions

| Concern | Technology | Version / notes |
|---|---|---|
| Frontend | React, Vite, TypeScript | React 18.3, Vite 5, TS 5.5 |
| Routing | react-router-dom | v6.26 |
| Server state | @tanstack/react-query | v5 |
| Client state | zustand | v4 (scanner session, theme, UI prefs) |
| Styling | Tailwind CSS 3.4, shadcn/ui, lucide-react | dark mode via `class` strategy |
| Forms | react-hook-form + zod | shared zod schemas for CSV rows too |
| Supabase client | @supabase/supabase-js | v2.45+ |
| Scanning | @zxing/browser | QR, EAN-13, EAN-8, UPC-A, Code128, Code39 |
| CSV | papaparse | streaming parse, worker mode |
| Charts | recharts | v2 |
| PDF labels | pdf-lib (Edge Function) + qrcode + bwip-js | server-side generation |
| DB | Supabase Postgres 15 | extensions: `pgcrypto`, `pg_trgm`, `fuzzystrmatch`, `pg_cron`, `uuid-ossp` |
| Edge Functions | Deno 1.4x / TS | `supabase functions deploy` |
| Testing | vitest, @testing-library/react, playwright, pgTAP | |
| Lint/format | eslint, prettier | |
| Hosting | Vercel / Netlify (static) + Supabase | free tiers |

## 3. Data model (summary — full DDL in `supabase/migrations/0001_schema.sql`)

```
auth.users ─1:1─ profiles(role: inventory_admin|staff)

warehouses ─1:N─ warehouse_rows ─1:N─ bins (location_code unique)

categories ─1:N─ products (sku, barcode unique, reorder_point, is_perishable)

products ─1:N─ stock_levels ─N:1─ bins
   stock_levels(product_id, bin_id, lot_number, expiry_date, quantity, reserved_qty, status)

stock_movements (type, product, from_bin, to_bin, qty, lot, expiry, reference, performed_by)

orders ─1:N─ order_items ─1:N─ pick_tasks ─N:1─ stock_levels
   pick_tasks(status: pending|verified|picked|short|cancelled, scan mismatches)

alerts (type, severity, product, bin, status: active|acknowledged|snoozed|resolved)
alert_reads (alert_id, user_id)          -- per-admin unread tracking

count_sessions ─1:N─ count_lines          -- cycle counting
import_jobs                               -- CSV import progress + errors
audit_log                                 -- non-stock changes
app_settings (key, value jsonb)           -- thresholds
```

### Key invariants (enforced in DB)
- `stock_levels.quantity >= 0`, `reserved_qty >= 0`, `reserved_qty <= quantity` (CHECK).
- `stock_levels` unique on `(product_id, bin_id, coalesce(lot_number,''), coalesce(expiry_date,'infinity'))`.
- `stock_movements` is append-only (no UPDATE/DELETE policies; trigger raises on update).
- `stock_levels.quantity` is only modified by `fn_record_movement` (trigger blocks direct writes from non-service roles).
- `bins.location_code` generated by trigger from warehouse.code + row.code + bin.code.
- `products.is_perishable = true` ⇒ inward movements require `expiry_date` (checked in `fn_record_movement`).

## 4. API surface

All access is via supabase-js. Three flavours:

### 4.1 Table access (PostgREST, RLS-gated)
Used for reads and simple admin CRUD.

| Table | staff | admin |
|---|---|---|
| products, categories, warehouses, warehouse_rows, bins | select | all |
| stock_levels | select | select (writes via RPC only) |
| stock_movements | select, insert via RPC | select |
| orders, order_items | select, insert (own) | all |
| pick_tasks | select, update (status via RPC) | all |
| alerts | — | select, update (ack/snooze/resolve) |
| alert_reads | — | own rows |
| profiles | own row select | all |
| import_jobs | — | all |
| app_settings | select | all |
| count_sessions / count_lines | select, insert lines | all |

### 4.2 RPC functions (PL/pgSQL, `SECURITY DEFINER`, role-checked inside)

| Function | Caller | Purpose |
|---|---|---|
| `search_products(q text, lim int default 20)` | staff, admin | Exact barcode → SKU prefix → typo-tolerant token match (Levenshtein) → trigram similarity; returns product totals + locations JSON. |
| `get_product_locations(p_product_id uuid)` | staff, admin | All stock rows for a product ordered by expiry, row, bin. |
| `record_movement(p_type, p_product_id, p_from_bin, p_to_bin, p_qty, p_lot, p_expiry, p_ref_type, p_ref_id, p_note)` | staff (inward/outward/transfer), admin (all) | Atomic stock change + log + alert evaluation. |
| `create_order(p_order jsonb)` | staff, admin | Inserts order + items, calls `allocate_order`, returns pick list. |
| `allocate_order(p_order_id uuid)` | internal / admin | FEFO allocation with `FOR UPDATE SKIP LOCKED`; creates pick_tasks; reserves stock. |
| `get_pick_list(p_order_id uuid)` | staff, admin | Pick tasks grouped/ordered by row, bin. |
| `verify_pick(p_pick_task_id uuid, p_scanned_bin_code text, p_scanned_barcode text)` | staff, admin | Compares scans to expected; records mismatch or marks verified. |
| `confirm_pick(p_pick_task_id uuid, p_qty int)` | staff, admin | Requires verified; outward movement; releases reservation; updates order status. |
| `cancel_order(p_order_id uuid, p_reason text)` | admin | Releases reservations. |
| `evaluate_alerts(p_product_id uuid default null)` | trigger / cron / admin | Rule engine; upserts/resolves alerts. |
| `acknowledge_alert(p_alert_id, p_action, p_snooze_until)` | admin | ack / snooze / resolve. |
| `start_count_session(p_row_id)` / `submit_count_line(...)` / `approve_count_session(p_id)` | staff/admin | Cycle counting. |
| `stock_by_row()` | admin | Dashboard aggregate. |
| `dashboard_kpis()` | admin | Single-call KPIs. |
| `set_user_role(p_user_id, p_role)` | admin | Updates profile + `auth.users.raw_app_meta_data.role`. |
| `export_rows(p_view text)` | any active user | Returns rows of an allow-listed reporting view as JSON for CSV export (RLS applies). |

### 4.3 Edge Functions (Deno)

| Function | Auth | Purpose |
|---|---|---|
| `csv-import` | admin JWT verified; uses service role | Reads uploaded file from Storage `imports/`, validates with zod, writes rows in batches of 200 via `record_movement` / upserts, updates `import_jobs` progress. |
| `alert-digest` | cron (Supabase scheduled function) | Emails active alerts summary to opted-in admins (Resend free tier). |
| `label-pdf` | staff/admin JWT | Generates PDF of bin QR labels or product barcodes. |
| `order-webhook` (optional) | HMAC secret | Accepts external order JSON, calls `create_order`. |

## 5. Core algorithms

### 5.1 Location code generation
```
location_code = upper(warehouse.code) || '-' || upper(row.code) || '-' || upper(bin.code)
e.g. WH1-R02-B017
```
Trigger `trg_bins_location_code` BEFORE INSERT/UPDATE.

### 5.2 Movement application (`record_movement`)
```
BEGIN
  validate role & type
  validate qty > 0
  if type in (outward, transfer, adjustment-) : lock source stock row FOR UPDATE, check quantity - reserved >= qty (unless p_release_reservation)
  if product.is_perishable and type = inward and expiry is null: RAISE
  apply:
    inward     -> upsert stock_levels(to_bin) += qty
    outward    -> stock_levels(from_bin) -= qty
    transfer   -> from -= qty ; upsert to += qty (same lot/expiry)
    adjustment -> from/to ± qty (admin only)
  insert stock_movements
  delete stock_levels rows where quantity = 0 and reserved_qty = 0
  perform evaluate_alerts(product_id)
COMMIT
```

### 5.3 FEFO allocation (`allocate_order`)
```
for each order_item:
  need = qty
  for stock in (select * from stock_levels
                where product_id = item.product_id
                  and status = 'available'
                  and quantity - reserved_qty > 0
                  and (expiry_date is null or expiry_date >= current_date)
                order by expiry_date nulls last, row.sort_order, bin.sort_order
                for update skip locked):
     take = least(need, stock.quantity - stock.reserved_qty)
     insert pick_task(order_item, stock_level, bin, take)
     stock.reserved_qty += take
     need -= take
     exit when need = 0
  if need > 0: insert pick_task(status='short', qty=need); mark item short
order.status = case when any short then 'partially_allocated' else 'allocated' end
```
Walking order: pick list sorted by `row.sort_order, bin.sort_order`; serpentine option flips bin order on even rows.

### 5.4 Scan verification (`verify_pick`)
```
expected_bin  = bins.location_code of pick_task.bin_id
expected_code = products.barcode (or sku) of pick_task.product
if scanned_bin != expected_bin  -> mismatch('bin'), increment pick_task.mismatch_count
elif scanned_code not in (barcode, sku) -> mismatch('product')
elif stock_level.expiry_date < today -> mismatch('expired')
else -> status = 'verified', verified_by, verified_at
if mismatch_count >= 2 -> evaluate_alerts raises pick_discrepancy
return jsonb {ok, reason, expected, scanned}
```

### 5.5 Alert engine (`evaluate_alerts`)
- Computes per-product available = Σ(quantity − reserved_qty) over `available` stock.
- For each rule, `INSERT ... ON CONFLICT (type, product_id, bin_id) WHERE status in ('active','snoozed') DO UPDATE` (partial unique index), else `UPDATE alerts SET status='resolved', resolved_at=now()` when condition no longer holds.
- Trigger `AFTER INSERT ON stock_movements` calls it for that product; `pg_cron` runs it for all products every 15 min (catches time-based rules like expiry and dead stock).
- Thresholds read from `app_settings` (`expiry_warning_days`, `dead_stock_days`, `default_reorder_point`).

### 5.6 Search (`search_products`)
Ranking tiers, highest first:
1. Exact barcode match (scanner input).
2. SKU prefix match (`sku ilike q || '%'`).
3. **Typo-tolerant token match** — `fuzzy_token_score(name || category, q)`: every query token must match a word of the product name either as a substring or within Levenshtein distance 1 (3-char tokens) / 2 (4+ chars). Score = average per-token closeness. "bleu mug" → *Blue Ceramic Mug* (0.75), "greek yogrt" → *Greek Yogurt* (0.92).
4. Trigram similarity (`pg_trgm`, threshold 0.25, GIN index on `search_text`) as a fallback / tie-breaker.

Each hit is then joined to `stock_levels` → `bins` → `warehouse_rows` and returns on-hand / reserved / available totals plus a `locations` JSON array ordered by expiry (FEFO) then walking order. Measured: 12–18 ms for 800 SKUs on a laptop, unindexed Levenshtein pass included (linear in SKU count; fine to ~20k SKUs).

## 6. Realtime design

| Channel | Mechanism | Subscribers | Payload |
|---|---|---|---|
| `stock:{warehouse}` | Postgres Changes on `stock_levels` | all | row diff → invalidate product/bin queries |
| `alerts:admin` | Postgres Changes on `alerts` | admins | new/updated alert → toast + bell count |
| `orders:{order_id}` | Postgres Changes on `pick_tasks` filter `order_id=eq.X` | picker + admin | status updates |
| `dashboard` | Broadcast (server → client) from trigger `pg_notify` bridged by Realtime; plus 30 s polling fallback for KPIs | admins | `{kpis, by_row}` |
| `presence:picking` | Presence | admins | who is picking which order |

RLS applies to Postgres Changes: Realtime only delivers rows the JWT can `SELECT`. Tables added to publication: `stock_levels`, `alerts`, `pick_tasks`, `orders`, `import_jobs`, `stock_movements`.

Client pattern: on change event → `queryClient.invalidateQueries(['product', id])`, with debounce 250 ms to coalesce bursts (CSV import).

## 7. Security

### 7.1 Auth
- Supabase Auth email/password; optional magic link. Email confirmation on for hosted.
- On signup, trigger `handle_new_user` inserts `profiles` with role `staff`.
- Role mirrored into `auth.users.raw_app_meta_data->>'role'` by `set_user_role` so the JWT carries it; RLS helper `auth_role()` reads `auth.jwt()->'app_metadata'->>'role'`, falling back to a `profiles` lookup.
- Deactivated users (`profiles.is_active=false`) are denied by all policies.

### 7.2 RLS principles
- RLS enabled on every table; no table is readable by `anon`.
- Writes to stock go only through `SECURITY DEFINER` RPCs owned by `postgres` with `search_path = public` pinned, `REVOKE EXECUTE FROM public`, `GRANT EXECUTE TO authenticated`; role checks inside.
- `service_role` (Edge Functions) bypasses RLS; functions verify the caller JWT before doing privileged work.
- Storage policies: `imports/` write admin only; `product-images/` read all authenticated, write admin.

### 7.3 Input validation
- zod schemas shared between forms, CSV import, and Edge Functions.
- Postgres CHECK constraints as final guard.

### 7.4 Secrets
- Anon key in the browser (safe by design). Service role and Resend keys only in Edge Function secrets.

## 8. Performance

| Item | Approach |
|---|---|
| Search | `pg_trgm` GIN index; debounce 200 ms; limit 20; `AbortController` to cancel stale requests. |
| Product locations | index `(product_id, expiry_date, bin_id)` on `stock_levels`. |
| Allocation | `FOR UPDATE SKIP LOCKED`; index `(product_id, status) where quantity - reserved_qty > 0`. |
| Dashboard | materialised-free: `stock_by_row()` aggregates over ≤ 200 k rows in ms; cached 30 s in React Query, invalidated by realtime. |
| CSV import | batches of 200 in a single RPC call `bulk_upsert_products(jsonb)`; total 1 000 rows < 10 s. |
| Bundle | route-level code splitting; scanner lib lazy-loaded (≈ 300 kB). |
| Realtime | one multiplexed socket; channels subscribed per page and torn down on unmount. |

## 9. Error handling & observability
- RPCs raise with SQLSTATE `P0001` and structured messages `CODE:message` (e.g. `INSUFFICIENT_STOCK:Only 3 available in WH1-R01-B004`). Client maps codes to friendly toasts.
- Edge Functions log to Supabase logs; return `{ ok, error: {code, message, details} }`.
- Frontend error boundary per route; Sentry optional (free tier).
- `import_jobs.errors` stores row-level failures as jsonb array.

## 10. Testing strategy

| Level | Tool | Coverage |
|---|---|---|
| DB unit | pgTAP | `record_movement` invariants, FEFO order, RLS denial for staff on admin tables, alert dedupe. |
| Edge | Deno test | CSV validation, batch chunking. |
| Component | Vitest + RTL | Search box, scanner modal states, alert bell. |
| E2E | Playwright | Login as staff → search → order → scan-verify (mocked camera) → dashboard updates in second admin context. |
| Load | k6 (optional) | 50 concurrent searches, 10 concurrent allocations on same SKU → no oversell. |

## 11. Optional Node/Express gateway
If an external order system must push orders via a stable REST endpoint or you need server-side webhooks with custom auth:
- `POST /api/orders` → validates HMAC → calls `supabase.rpc('create_order')` with service role.
- Deploy as a Supabase Edge Function (`order-webhook`) instead unless Node-specific libraries are required. Express is **not** on the critical path.

## 12. Deployment
- **DB**: `supabase db push` (migrations), `supabase db reset` locally. Seed via `supabase/seed.sql`.
- **Edge Functions**: `supabase functions deploy csv-import alert-digest label-pdf`.
- **Cron**: `select cron.schedule('alert-sweep','*/15 * * * *', $$select public.evaluate_alerts();$$);`
- **Frontend**: Vercel/Netlify from `web/` with env vars; SPA fallback rewrite to `index.html`.
- **Environments**: local (Docker), staging & prod Supabase projects; migrations are the single source of truth.

## 13. Non-functional requirements
- Availability: dependent on Supabase free tier SLA; app degrades gracefully offline (read-only cached search results, scanner queue retries).
- Accessibility: WCAG 2.1 AA (see UI/UX doc).
- Browser support: last 2 versions Chrome, Safari, Edge, Firefox; iOS Safari 16+ for camera.
- Data retention: movements & audit forever; import files 30 days (Storage lifecycle).
