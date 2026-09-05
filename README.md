<div align="center">

<img src="web/public/images/logo-256.png" width="96" alt="BinTrack logo" />

<img src="docs/assets/hero.svg" width="100%" alt="BinTrack — Multi-Warehouse Inventory & Location Tracking" />

<br/>

[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%C2%B7%20Auth%20%C2%B7%20Realtime-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![React](https://img.shields.io/badge/React%2018-Vite%20%C2%B7%20TypeScript-61dafb?style=for-the-badge&logo=react&logoColor=black)](web/)
[![Tailwind](https://img.shields.io/badge/Tailwind-shadcn%20primitives-06b6d4?style=for-the-badge&logo=tailwindcss&logoColor=white)](DESIGN.md)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](vercel.json)

[![DB tests](https://img.shields.io/badge/pgTAP-141%20%2F%20141-0ecb81?style=flat-square)](supabase/tests/)
[![Unit tests](https://img.shields.io/badge/Vitest-66%20%2F%2066-0ecb81?style=flat-square)](web/src/)
[![Lint](https://img.shields.io/badge/ESLint-0%20warnings-0ecb81?style=flat-square)](web/.eslintrc.cjs)
[![TypeScript](https://img.shields.io/badge/tsc-strict-0ecb81?style=flat-square)](web/tsconfig.app.json)
[![PWA](https://img.shields.io/badge/PWA-installable-fcd535?style=flat-square)](web/vite.config.ts)
[![License](https://img.shields.io/badge/License-MIT-848e9c?style=flat-square)](#-license)

<img src="docs/assets/features.svg" width="100%" alt="Feature highlights" />

<br/>

**[Features](#-features)** · **[How it works](#-how-it-works)** · **[Quick start](#-quick-start)** · **[Screens](#-screen-map)** · **[Goods receipt](#-goods-receipt-grn)** · **[Staff & hours](#-warehouse-hours-tasks--performance)** · **[Testing](#-validation)** · **[Docs](#-documents)**

</div>

---

## 🎯 The problem

> Orders come in, but staff don't immediately know **which warehouse, row or bin** holds the item.
> Manual searching slows fulfilment, wrong picks cause returns, expired stock ships unnoticed, deliveries are received on paper, and work is handed out by shouting.

**BinTrack** gives every unit of stock an address (`WH1-R02-B017`), answers *"where is it and how many?"* in under a second, verifies every pick and receipt with a scan, tells staff when the warehouse is open, shares work fairly, and keeps admins informed through a live, alert-driven dashboard. Every rule is enforced **inside Postgres** by Row-Level Security, so it holds for the app, the API and CSV alike.

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🔎 Find it
- **Warehouse → Row → Bin** hierarchy with unique location codes
- Live **product ↔ bin** mapping per lot and expiry
- **Instant, typo-tolerant search** — name, SKU or barcode, 15–20 ms
- Bin and product detail pages with full history

### 📦 Pick it right
- Order intake → **FEFO allocation** in walking order, no oversell
- **Scan-verified picking**: bin QR then product barcode; wrong bin / product / expired lot blocked
- Mismatch counter → discrepancy alert; admin override with a reason
- Presence: who is picking what, right now

### 🚚 Receive it properly
- **Goods Receipt (GRN)**: PO → truck → seal → scan-count → GRN → put-away
- Partial deliveries, multiple GRNs per PO, auto short / excess
- Wrong SKU blocked; damaged / rejected never enter stock
- Evidence uploads, insert-only timeline, undeletable GRNs

</td>
<td width="50%" valign="top">

### ⏰ Run it on time
- **Warehouse open / closed switch** on the admin dashboard
- Opening hours **10:00 – 19:00**, open days, timezone, closed message
- Staff see a live *"Warehouse closed — opens tomorrow 10:00"* banner

### ⚖️ Share the work fairly
- Admin writes **tasks** with priority, due date and links
- **Auto-assign to the least-loaded person**; one-click **re-balance**
- Staff **Start / Done with a note**; audit of every change
- **Performance dashboard**: picks, accuracy, receipts, put-aways, tasks, share of work vs fair share

### 🔔 See it live
- **9 smart alerts** — low / out of stock, expiring, expired, dead stock, over-capacity, pick & GRN discrepancy, order short
- Deduplicated, auto-resolving, acknowledge / snooze / resolve
- WebSocket dashboard: KPIs, stock by row, bin heat-map, alert feed
- Expiry manager, cycle counts, CSV import / export, QR & barcode labels, offline scan queue, PWA

</td>
</tr>
</table>

<details>
<summary><b>Full written feature list</b></summary>

See [`feature.md`](feature.md) — 23 sections covering every module, rule and screen.

</details>

---

## 🧭 How it works

<div align="center"><img src="docs/assets/grn-flow.svg" width="100%" alt="Goods receipt flow" /></div>

```
React SPA (Vite + TS)  ──HTTPS/WSS──▶  SUPABASE
  staff UI · admin UI                 Auth (JWT role) · PostgREST (RLS)
  supabase-js · TanStack Query        Realtime (changes, broadcast, presence)
                                      Edge Functions (Deno): csv-import,
                                        label-pdf, alert-digest, order-webhook
                                      Postgres: tables · views · RPCs ·
                                        triggers · RLS · pg_trgm · pg_cron
                                      Storage: imports · product-images ·
                                        labels · grn-documents
```

**No Express server.** Every atomic business rule is a Postgres function called via `supabase.rpc()`; the anon key is safe in the browser because every table carries RLS policies.

<details>
<summary><b>Key design decisions</b></summary>

1. **Stock is stored per (product, bin, lot, expiry)** — one row per physical lot. Quantity is never edited directly; every change goes through `record_movement()`, which writes the movement log and updates stock in one transaction.
2. **Allocation is a database function** — `allocate_order()` runs FEFO (first-expired-first-out) then bin route order, and locks rows (`FOR UPDATE SKIP LOCKED`) so two staff can't pick the same unit.
3. **Alerts are derived, deduplicated, and stateful** — the rule engine upserts an `active` alert per (type, product, bin, order, GRN); it auto-resolves when the condition clears. The dashboard subscribes to the `alerts` table.
4. **RLS is the security boundary** — the anon key ships in the browser because every table has policies; the service-role key is used only inside Edge Functions.
5. **Scanning is verification, not data entry** — a pick is `verified` only when scanned bin code == expected bin AND scanned barcode == expected product.
6. **Warehouse status, tasks and performance live in the database too** — `warehouse_status()` computes open/closed from the switch and the schedule; `least_loaded_staff()` and `balance_open_tasks()` spread work; `staff_performance()` aggregates real movements, picks, GRNs and tasks.

</details>

---

## 🛠 Tech stack <sub>(all free / open-source tiers)</sub>

| Layer | Choice | Why |
|---|---|---|
| Database | **Supabase Postgres** | Relational integrity, RLS, RPC via PL/pgSQL, `pg_trgm` for instant search, `pg_cron` for alert sweeps. |
| Auth | **Supabase Auth** | Email/password + magic link; JWT carries the role claim for RLS. |
| Realtime | **Supabase Realtime** | Postgres Changes for stock / alerts / tasks / status, Broadcast for KPIs, Presence for "who is picking". |
| Serverless | **Supabase Edge Functions** (Deno) | CSV import parsing, alert email digests, label PDFs, order webhook. |
| Storage | **Supabase Storage** | CSV uploads, product images, label PDFs, GRN evidence. |
| Frontend | **React 18 + Vite + TypeScript** | Fast dev loop; SPA suits a scanner-heavy internal tool. |
| UI | **Tailwind CSS + shadcn-style primitives + lucide** | Binance-derived tokens ([`DESIGN.md`](DESIGN.md)); dark by default, light as a token swap. |
| Data | **TanStack Query + supabase-js v2** | Caching, optimistic updates, realtime cache invalidation. |
| Scanner | **@zxing/browser** + HID | QR + 1-D barcodes from the camera; USB keyboard-wedge scanners. |
| CSV / Charts / PDF | **PapaParse · Recharts · pdf-lib + qrcode + bwip-js** | Streaming parse, dashboard charts, label sheets. |
| Testing | **Vitest · Testing Library · Playwright · pgTAP · Deno test** | Unit, component, e2e, database-policy and function tests. |
| Hosting | **Vercel** (static SPA) + Supabase | `vercel.json` at the root; build fails loudly without env vars. |

---

## 🚀 Quick start

### Prerequisites
- Node.js 20+
- A free Supabase project (https://supabase.com) **or** the Supabase CLI for local dev (`npm i -g supabase`)
- Docker (only for local Supabase)

### 1 · Backend (Supabase)
```bash
# Local
supabase init            # if not already initialised
supabase start           # Postgres, Auth, Realtime, Storage, Studio
supabase db reset        # applies supabase/migrations/*.sql then supabase/seed.sql

# Hosted
supabase link --project-ref <your-project-ref>
supabase db push         # 0001 schema · 0002 GRN · 0003 warehouse status + tasks
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # load mock data
```

Enable in the Supabase dashboard (Database → Extensions): `pg_trgm`, `fuzzystrmatch`, `pgcrypto`, `pg_cron` (hosted only), `uuid-ossp`. The migration also runs `create extension if not exists` for each.

**Local dev logins** (created by `seed.sql` on local Supabase only):

| Email | Password | Role |
|---|---|---|
| `admin@bintrack.dev` | `Password123!` | inventory_admin |
| `staff@bintrack.dev` | `Password123!` | staff |

**Seed output** (deterministic, `setseed(0.42)`): 1 warehouse · 4 rows · 160 bins · 10 categories · 800 SKUs · ~1,500 stock lots (perishables with lot + expiry, some expired / expiring) · ~1,560 movements · 40 orders (15 shipped, some short, some with scan mismatches) · ~235 live alerts · 1 vendor · 2 open purchase orders.

### 2 · Create the first admin
1. Sign up a user via the app (or Auth → Users in Studio).
2. Promote them:
```sql
update public.profiles set role = 'inventory_admin' where email = 'admin@example.com';
```
All subsequent users default to `staff`; admins change roles in **Admin → Users**.

### 3 · Frontend
```bash
cd web
npm install
cp ../.env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                     # http://127.0.0.1:5173
```
An admin lands on `/admin`, staff on `/`.

### 4 · Edge Functions
```bash
supabase functions serve --env-file supabase/.env.local   # local
supabase functions deploy csv-import alert-digest label-pdf order-webhook
```
`alert-digest` no-ops without `RESEND_API_KEY`, and `order-webhook` returns 503 without `ORDER_WEBHOOK_SECRET`, so neither blocks local development.

<details>
<summary><b>5 · Deploying the frontend to Vercel</b></summary>

`vercel.json` at the repo root builds `web/` and serves it as an SPA, so the project deploys from the root with no dashboard configuration (alternatively set **Root Directory** to `web` and delete the file).

Vercel validates this file with `additionalProperties: false` — it rejects any key it does not recognise, including JSON-comment tricks like `"// note"`. Keep explanations here rather than in the config.

Set these in **Settings → Environment Variables** for every environment you deploy:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | your project base URL, e.g. `https://<ref>.supabase.co` — **not** a `/rest/v1/` path |
| `VITE_SUPABASE_ANON_KEY` | the anon key (safe in the browser; every table is RLS-protected) |

`web/.env.local` is git-ignored, so it never reaches Vercel — without those two variables the build fails with an explicit message rather than deploying a bundle that white-screens. `vite.config.ts` also rejects a URL that carries a service path, the easiest mistake to make when copying from the Supabase dashboard.

Only `VITE_*` variables are exposed to the browser. The service-role key, the Resend key and the webhook secret belong to the Edge Functions (`supabase secrets set`), never to the frontend.

</details>

### 6 · Checks
```bash
cd web
npm run lint          # eslint, zero warnings
npm test              # vitest — unit, component and app smoke tests
npm run build         # typecheck + production bundle + PWA assets
npm run test:e2e      # playwright (needs a running Supabase and dev server)

# from the repo root
supabase test db                                    # pgTAP suites
deno test --allow-env supabase/functions/tests/     # Edge Function unit tests
```

---

## 🚚 Goods receipt (GRN)

Added in [`supabase/migrations/0002_grn.sql`](supabase/migrations/0002_grn.sql). It **reuses the existing systems** rather than duplicating them:

| Concern | How the module does it |
|---|---|
| Inventory | Only `putaway_grn_line()` raises stock, and it does so by calling the existing `record_movement('inward', …, reference_type 'grn')`. Damaged and rejected units never reach that call. |
| Discrepancies | The existing alert engine: a `grn_discrepancy` alert type keyed by GRN (the dedupe index gained a `grn_id` column, and `upsert_alert()` an optional ninth argument — existing callers are unaffected). |
| Roles | The same `profiles` / `require_active()` / `require_admin()` / RLS pattern. Staff receive, count, verify and put away; only admins raise POs, resolve discrepancies and cancel. |
| Audit | `audit_row_change()` on the new tables, `stock_movements` for every put-away (with `performed_by` and the GRN reference), and a per-GRN `grn_events` timeline that is insert-only. |

**Flow:** `create_purchase_order` (admin) → `create_grn` (truck, driver, seal, challan, invoice; staff recorded from the session; a broken or missing seal raises the alert immediately) → `record_grn_line` per SKU by barcode/SKU (accepted + damaged + rejected must equal received; perishables need an expiry; a product not on the PO is returned as `wrong_sku` and logged, never received) → `verify_grn` (issues the GRN, computes short/excess, updates the PO, raises the discrepancy alert) → `putaway_grn_line` per bin (inventory rises by exactly the accepted quantity; the GRN completes when every accepted unit is in a bin).

**Numbers** are generated: `PO-YYYY-#####`, `GRN-YYYY-#####`. Partial deliveries and several GRNs per PO are normal — a second GRN snapshots what earlier trucks already brought as *previously received*. Completed GRNs cannot be deleted (no delete policy, plus a trigger).

**Evidence** goes to the private `grn-documents` bucket; the detail page flags a seal photo as needed when the seal was not intact, and a damage photo when anything was damaged or rejected.

> *Worked example (asserted in `004_grn.sql`): ordered 100 · received 98 · accepted 96 · damaged 2 · short 2 → stock +96.*

---

## ⏰ Warehouse hours, tasks & performance

Added in [`supabase/migrations/0003_warehouse_status_tasks.sql`](supabase/migrations/0003_warehouse_status_tasks.sql).

| Capability | Where | What happens |
|---|---|---|
| **Open / closed switch** | Admin dashboard header, Staff & tasks | `set_warehouse_status({is_open})`. Off → every staff screen shows the red banner with the admin's message and the next opening time; live via realtime on `app_settings`. |
| **Opening hours** | Admin → Settings → Warehouse hours | Opens **10:00**, closes **19:00** by default; open days, timezone, closed message. *Follow schedule* closes and opens automatically; the switch overrides either way. `warehouse_status()` computes the answer in the DB so every device agrees. |
| **Written tasks** | Admin → Staff & tasks → *Assign a task* | Title, description, priority, due date, optional link to an order / GRN / product / bin. Staff see them on `/tasks` and on Home; **Start** → **Done with a note**. Staff may change only status / note of their own tasks (trigger-enforced). |
| **Load balancing** | *Assignee: Auto* · *Balance open tasks* | `least_loaded_staff()` picks whoever has the fewest active tasks; `balance_open_tasks()` moves open tasks from the busiest to the freest and reports what moved. |
| **Performance dashboard** | Admin → Staff & tasks | `staff_performance(days)` per person: picks, units, accuracy %, receipts, put-aways, count lines, tasks done / on time / overdue, avg hours to complete, and **share of work vs fair share (1/N)** as a bar. |

---

## 👥 Roles at a glance

| Capability | `staff` | `inventory_admin` |
|---|:--:|:--:|
| Search products / view locations | ✅ | ✅ |
| Create orders, view pick list, scan-verify picks | ✅ | ✅ |
| Receive stock, transfer between bins | ✅ | ✅ |
| Register trucks, count and put away goods receipts | ✅ | ✅ |
| Work assigned tasks (start / finish with a note) | ✅ | ✅ |
| Stock adjustments (write-off, correction) | ❌ | ✅ |
| Create / edit products, bins, rows, purchase orders | ❌ | ✅ |
| CSV bulk import / export | export only | ✅ |
| Admin dashboard, alerts, acknowledge / resolve | ❌ | ✅ |
| Open / close the warehouse, set hours | ❌ | ✅ |
| Assign, reassign, balance tasks; performance dashboard | ❌ | ✅ |
| Cycle count approval | ❌ | ✅ |
| Manage users & roles, settings | ❌ | ✅ |

Enforced in Postgres via RLS + `SECURITY DEFINER` RPCs that check the caller's profile role.

---

## 🗺 Screen map

<details open>
<summary><b>Staff</b></summary>

| Route | What it does |
|---|---|
| `/login`, `/signup`, `/forgot-password` | `/login` opens as a landing view over the warehouse photograph; **Log in** blurs it and brings the form forward; **About** explains the project flow. Password or magic-link sign in; new accounts start as staff. |
| `/` | Closed-warehouse notice, your open tasks, quick actions, orders waiting to be picked, recent movements. |
| `/search` | Typo-tolerant search with every location, quantity and expiry. |
| `/products/:id` · `/bins/:id` | KPI strip, locations (FEFO order), movement history · bin contents, utilisation, value. |
| `/orders`, `/orders/new`, `/orders/:id` | Order list, multi-line intake with paste-SKUs, pick list grouped by row with scan verification and presence. |
| `/receive` · `/transfer` · `/scan` | Inward with lot and expiry · source bin → lot → destination bin · full-page scanner hub. |
| `/grn`, `/grn/new`, `/grn/:id` | Goods receipts: register a truck against a PO, count each SKU by scan, verify, put away, attach evidence, read the timeline. |
| `/movements` | The audit trail: filters, infinite scroll, CSV export. |
| `/counts/:id` | Scan-driven count entry, blind or open. |
| `/tasks` | Written tasks from the admin, live: start, finish with a note; priority, due dates, links to the related record. |
| `/profile`, `/more` | Name, theme, digest opt-in, password; mobile overflow menu. |

</details>

<details open>
<summary><b>Admin</b></summary>

| Route | What it does |
|---|---|
| `/admin` | Live dashboard — **warehouse open/closed switch**, KPIs, stock by row, bin heat-map, alert feed, orders in progress, expiring soon. |
| `/admin/alerts` | Alert centre: tabs, filters, acknowledge / snooze / resolve, bulk actions. |
| `/admin/products` (+ new / edit) | Catalogue with live stock; product form with live SKU/barcode uniqueness. |
| `/admin/purchase-orders` | Raise POs, see received vs ordered, jump to the truck registration, close a fulfilled PO. |
| `/admin/locations` | Warehouse → row → bin tree, bulk bin ranges, capacity, activation. |
| `/admin/expiry` | Urgency buckets, weekly chart, write-offs. |
| `/admin/counts` | Create, monitor, review variances, approve (posts corrections). |
| `/admin/import`, `/admin/export` | Four-step CSV import with live progress; export of every reporting view. |
| `/admin/labels` | Bin QR and product barcode PDF sheets. |
| `/admin/staff` | Staff performance dashboard, assign tasks in writing (auto-assigns to the least-loaded person), re-balance open work, open/closed switch. |
| `/admin/users` · `/admin/settings` | Roles with typed confirmation · alert thresholds, picking options, notifications, **warehouse hours**. |

</details>

---

## ✅ Validation

| Level | Tool | Result |
|---|---|---|
| Database | pgTAP (5 suites) | **141 / 141** — RLS, movement invariants, FEFO + no-oversell, GRN end to end, warehouse status + fair task distribution |
| Unit + component + app smoke | Vitest + Testing Library | **66 / 66** |
| Edge Functions | Deno test | CSV parser + schemas |
| End-to-end | Playwright (5 specs) | auth guards, search, scan-verified pick, cross-context realtime, a11y |
| Static | ESLint (0 warnings) · tsc strict | clean |

<details>
<summary><b>What was verified, and how</b></summary>

### Database — verified by running it
`0001_schema.sql`, `seed.sql`, `0002_grn.sql` and `0003_warehouse_status_tasks.sql` were applied end-to-end on PostgreSQL 15.19 (with a shim emulating Supabase's `auth`/`storage` schemas and roles), and the assertions in `supabase/tests/` were executed against that database:

- Migration + seed produce exactly the documented data: **1 warehouse · 4 rows · 160 bins · 800 products · 1,503 stock lots · 1,564 movements · 40 orders · 117 pick tasks · 239 alerts**.
- **141 assertions pass** — 18 RLS (`001`), 20 movement invariants (`002`), 21 allocation and scan verification (`003`), 51 goods receipt (`004`: the spec's worked example ends with inventory up by exactly 96; wrong SKU blocked and logged; broken seal alerts; second partial truck sees 98 previously received; completed GRN undeletable), 31 warehouse status, task assignment, fair distribution and performance (`005`).
- Invariants hold: no `reserved > quantity`, no negative quantities, no expired lot left `available`, reservations equal open pick-task quantities, every `location_code` matches `WH-ROW-BIN`.
- FEFO proven where it matters: with the soonest-expiring lot deliberately placed in the *farthest* row, allocation still consumes it first, while the pick list is still ordered for the shortest walk.
- No oversell: a competing order for the same SKU is `partially_allocated` with the shortfall recorded as a short task, never promised twice.
- Scan verification: wrong bin → `bin` mismatch, wrong barcode → `product` mismatch, mismatches counted, correct pair → `verified`, and confirming decrements the bin.
- Search: `"bleu mug"` → *Family Blue Ceramic Mug*, `"greek yogrt"` → *Pro Green Greek Yogurt*, `"wireles mous"` → *Eco Red Wireless Mouse*, exact barcode → exact SKU. **15–20 ms** for 800 SKUs.

### Frontend — verified by building and running it
- `npm run lint` — clean, zero warnings. `npx tsc --noEmit` — clean for the app and the e2e project; no `any` at an RPC call site.
- `npm test` — **66 tests pass**, including a jsdom smoke suite that mounts the real `App` and proves the guards and the new screens: a visitor is bounced to sign-in, staff reach `/tasks`, admins get `/admin/staff` with the open/closed switch, staff see the warehouse nav but not the admin section, and staff hitting `/admin/products` are redirected.
- `npm run build` — production bundle with route-level splitting; the scanner (442 kB) and charts (372 kB) load only on the screens that use them; the PWA service worker and icons are generated.

### Not yet run here
- **Playwright e2e** (`web/e2e/`) is written but needs a live Supabase and a browser download; CI runs it.
- **`supabase test db`** needs Docker. The five pgTAP files were instead executed statement-by-statement against the local PostgreSQL 15 described above — all 141 assertions pass; CI runs them through the real pgTAP harness.
- **Deno tests** for the Edge Functions are written; the pure CSV parser was transpiled and its 7 assertions verified under Node instead. CI runs `deno test` and `deno check`.

### One deviation from the TRD
`docs/02-TRD.md` specifies Postgres 15. `supabase/config.toml` sets `major_version = 17`, because that is what the Supabase CLI v2 provisions for a new project and `major_version` must match whatever your hosted project runs. Nothing in the schema is version-specific — it was verified on 15 and runs on 17.

### One behaviour worth knowing
`record_movement()` raises `bintrack.internal` with a **transaction-scoped** `set_config`, so within a transaction that has already made a legitimate movement, the immutability and stock-guard triggers stop firing. This is harmless in production — every PostgREST request is its own transaction, and RLS grants no `UPDATE`/`DELETE` on `stock_movements` or `stock_levels` to anyone — and `002_movements.sql` asserts both the trigger (in a clean transaction) and the RLS boundary.

</details>

---

## 📁 Repository layout

<details>
<summary><b>Show the tree</b></summary>

| Path | Purpose |
|---|---|
| `README.md` | This file. |
| `feature.md` | Every feature in written form. |
| `ppt.md` | Presentation deck (one slide per heading). |
| `DESIGN.md` | The design system the UI tokens derive from (Binance analysis, via `getdesign`). Edit this, then mirror changes into `globals.css`. |
| `docs/01-PRD.md` | Product Requirements — problem, personas, features, user stories, acceptance criteria. |
| `docs/02-TRD.md` | Technical Requirements — architecture, stack, RPC contracts, realtime, security, performance, testing. |
| `docs/03-APP-FLOW.md` | Screen map, navigation, and step-by-step flows for every feature. |
| `docs/04-UI-UX-DESIGN.md` | Theme tokens, typography, components, layouts, wireframes, accessibility. |
| `docs/05-IMPLEMENTATION-PLAN.md` | Phased plan with tasks, milestones, folder structure, definition of done, risks. |
| `docs/06-FEATURE-IDEAS.md` | Extended feature catalogue. |
| `docs/assets/` | The animated SVG banners used above. |
| `supabase/config.toml` | Local Supabase configuration — ports, buckets, auth, per-function JWT rules. |
| `supabase/migrations/0001_schema.sql` | Core schema — tables, enums, indexes, views, RPCs, triggers, RLS, realtime publication. |
| `supabase/migrations/0002_grn.sql` | Goods-receipt module — vendors, purchase orders, GRNs, lines, put-aways, documents, timeline. |
| `supabase/migrations/0003_warehouse_status_tasks.sql` | Warehouse open/closed status and hours, staff tasks, load balancing, performance. |
| `supabase/seed.sql` | Deterministic mock data generator. |
| `supabase/functions/` | Edge Functions: `csv-import`, `alert-digest`, `label-pdf`, `order-webhook`, `_shared/`, Deno tests. |
| `supabase/tests/` | pgTAP suites `001`–`005`. |
| `supabase/templates/` | Downloadable CSV templates for each import kind. |
| `web/` | The React 18 + Vite + TypeScript app. |
| `vercel.json` | Root deployment config — build, SPA rewrite, cache and security headers. |
| `.github/workflows/ci.yml` | CI: lint, typecheck, unit tests, build, `supabase db lint`, pgTAP, Deno checks. |
| `.env.example` | Environment variables for the app and the Edge Functions. |

</details>

---

## 📚 Documents

[Product Requirements](docs/01-PRD.md) · [Technical Requirements](docs/02-TRD.md) · [App Flow](docs/03-APP-FLOW.md) · [UI / UX Design System](docs/04-UI-UX-DESIGN.md) · [Implementation Plan](docs/05-IMPLEMENTATION-PLAN.md) · [Feature Ideas](docs/06-FEATURE-IDEAS.md) · [Feature list](feature.md) · [Presentation](ppt.md) · [Database schema](supabase/migrations/0001_schema.sql) · [Seed data](supabase/seed.sql)

---

## 📄 License

MIT — free for hackathon, academic, and commercial use.

<div align="center">
<sub>Built with Supabase and React · <i>Every item has an address. Every movement has a record.</i></sub>
</div>
