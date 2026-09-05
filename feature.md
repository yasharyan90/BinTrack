# BinTrack — Complete Feature List

Multi-warehouse inventory & location tracking. Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) + React / Vite / TypeScript. Every business rule lives in the database and is enforced by Row-Level Security, so the rules hold for the app, the API and CSV alike.

Roles: **staff** (warehouse floor) and **inventory_admin** (control). Admins can do everything staff can.

---

## 1. Locations

- **Three-level hierarchy**: Warehouse → Row → Bin.
- **Unique location code** per bin, generated automatically, e.g. `WH1-R02-B017`. The code is the hero of every screen.
- **Bulk bin creation** — enter a range (row, first bin, last bin) and get all bins at once.
- Bin **capacity** with an over-capacity alert.
- **Activate / deactivate** rows and bins without deleting history.
- **Bin detail page** — every product, lot and quantity in that bin, plus its movement history.
- **Bin QR codes** printable as PDF sheets.

## 2. Products

- Catalogue with **SKU, barcode, name, category, unit, reorder point, perishable flag**, product image.
- **Live uniqueness check** on SKU and barcode while typing.
- **Product detail** — total stock, reserved, available, and every location holding it in FEFO / walking order.
- **Product barcode labels** (Code128) printable as PDF.
- Categories for grouping and reporting.

## 3. Stock & movements

- **Product ↔ bin mapping** with a live quantity per product, per bin, per lot / expiry date.
- **Four movement types** — inward, outward, transfer, adjustment.
- **Every stock change goes through one function** (`record_movement`); direct writes to stock are rejected by a trigger.
- **Immutable movement log** — rows can never be edited or deleted; each carries the actor, time, from-bin, to-bin, quantity and a reference (order, GRN, count).
- **Receive stock** screen — scan product, choose bin, enter quantity, lot and expiry (expiry mandatory for perishables).
- **Transfer** screen — move stock between bins with scan confirmation.
- **Movements log** with filters by type, product, bin, user and date.
- Invariants enforced in the DB: `reserved ≤ quantity`, no negative stock, no oversell.

## 4. Instant search

- One box for **name, SKU or barcode**.
- Four-tier ranking: exact barcode → SKU prefix → **typo-tolerant token match** (Levenshtein) → trigram similarity.
- `"bleu mug"` finds Blue Ceramic Mug; `"greek yogrt"` finds Greek Yogurt.
- 15–20 ms over 800 SKUs (GIN trigram index).
- Result shows totals and every bin, in pick order.

## 5. Orders & picking

- **Order intake** by hand, CSV, or the `order-webhook` Edge Function (external systems push orders).
- **Automatic allocation** — FEFO (first-expired-first-out), then shortest walk; row locks so two orders never claim the same unit.
- **Reserved stock** is held for the order until picked or cancelled.
- **Partial allocation** — short orders are flagged with an `order_short` alert instead of failing.
- **Pick list** sorted row → bin, optional **serpentine** routing.
- **Scan-verified picking** — scan the bin QR, then the product barcode; wrong bin / wrong product / expired lot are blocked.
- **Mismatch counter** — 2 mismatches on a task raise a `pick_discrepancy` alert; admin override with a logged reason.
- Confirm pick → outward movement and reservation release in one transaction.
- **Ship / cancel** order; cancel releases reservations.
- **Presence** — admins see who is picking which order right now.

## 6. Goods Receipt (GRN) module

Flow: **Purchase Order → Truck arrival → Seal check → Scan & count → GRN → Put-away → Inventory**

- **Purchase orders** (admin): vendor, warehouse, lines, expected date; number `PO-2026-00001`; shows received vs ordered; close when fulfilled.
- **Vendors** master.
- **Truck registration** (staff): vehicle number, driver name and ID, gate entry time, **seal status** (intact / broken / missing), challan and invoice numbers.
- **Receiving staff captured automatically** from the login session.
- **Per-SKU counting by scan**: ordered → previously received → received → accepted → damaged → rejected; **short / excess computed automatically**.
- **Wrong SKU is blocked** and logged on the timeline.
- **Partial deliveries** and **multiple GRNs per PO** — a second truck sees what was already received.
- **Verify** → GRN number issued (`GRN-2026-00124`), PO progress updated, discrepancy alert raised if needed.
- **Broken or missing seal** raises an alert before a carton is opened.
- **Put-away** of accepted units to Warehouse → Row → Bin; **inventory rises by accepted quantity only** — damaged and rejected never enter stock.
- **Evidence uploads** to storage: challan, invoice, seal photo, damage photo.
- **Discrepancy resolution** by admin with a note.
- **GRN dashboard** KPIs: total, pending verification, discrepancies, pending put-away, completed.
- **Full audit**: every put-away is a stock movement with actor and GRN reference; insert-only `grn_events` timeline; **completed GRNs cannot be deleted**.
- Uses the existing inventory and authentication systems — no duplicate stock tables.

## 7. Warehouse open / closed control

- **On / off switch** on the admin dashboard (and on the Staff & tasks page).
- When **off**, every staff screen shows a red **"Warehouse closed"** banner with the admin's message and the next opening time, e.g. *"Opens tomorrow 10:00 (Asia/Kolkata)"*; the staff Home shows a closed card.
- **Opening hours** (Settings → Warehouse hours): opens **10:00**, closes **19:00** by default, open days (Mon–Sat), timezone, closed message.
- **Follow schedule** — the warehouse closes and opens automatically outside hours; the manual switch overrides either way.
- Status is computed in the database, so every device agrees.
- Changes reach staff **live** through realtime — no refresh.

## 8. Task assignment (admin → staff, in writing)

- Admin creates a task with **title, description, priority** (low / normal / high / urgent), **due date**, and optional links to an **order, GRN, product or bin**.
- Staff page **My tasks**: active and finished lists, **Start** and **Done with a note** back to the admin.
- Preview of open tasks on the staff Home screen.
- Priority chips, overdue highlighting, "from {admin}" and timestamps.
- Staff may change only the status and note of **their own** tasks; admins can edit, reassign or cancel any task.
- Every create, reassign and status change is written to the audit log.
- Tasks update live on both sides.

## 9. Load balancing — work divided equally

- Assignee defaults to **Auto**: the database picks the person with the **fewest open + in-progress tasks**.
- **Balance open tasks** button moves open tasks from the busiest to the least-busy person until the spread is even; shows how many moved.
- **Open work right now** cards — open, in-progress and overdue tasks per staff member.
- Admin can still hand-pick or reassign any task.

## 10. Staff performance dashboard (admin)

- Window selectable: **7 / 30 / 90 days**.
- Per staff member: picks, units picked, clean picks, mismatches, **accuracy %**; receipts (inwards), outwards, transfers, units received, GRN lines counted; put-aways and units put away; cycle-count lines; tasks open / in progress / done / overdue / on time; **average hours to complete**.
- **Share of work vs fair share** — a bar per person compared against 1/N so an overloaded or idle person is obvious.
- All figures derive from real records (movements, pick tasks, GRNs, tasks), not self-reporting.

## 11. Expiry management

- Lot and expiry captured on every inward for perishables.
- **FEFO** allocation everywhere.
- **Expiring soon** alerts N days before the date (configurable); **expired** lots are auto-quarantined and raise a critical alert.
- **Expiry manager** (admin): urgency buckets, weekly chart, one-click write-off (an adjustment movement).

## 12. Smart alert engine

Evaluated in the database after every movement and every 15 minutes (`pg_cron`).

| Alert | Condition | Severity |
|---|---|---|
| low_stock | available ≤ reorder point | warning |
| out_of_stock | available = 0 | critical |
| expiring_soon | expiry within N days | warning |
| expired | past expiry (quarantined) | critical |
| dead_stock | no outward for N days | info |
| bin_over_capacity | quantity > bin capacity | warning |
| pick_discrepancy | ≥ 2 scan mismatches on a task | warning |
| order_short | order partially allocated | warning |
| grn_discrepancy | broken seal / short / excess / damaged | warning / critical |

- **Deduplicated** — one open alert per type + product + bin + order + GRN.
- **Auto-resolving** when the condition clears.
- **Acknowledge, snooze, resolve**, bulk actions, per-user read state, unread bell count.
- **Alert centre** with tabs and filters; critical alerts pop up as toasts anywhere in the app.
- Optional **daily email digest** (`alert-digest` Edge Function).

## 13. Live admin dashboard

- KPIs: total SKUs, stock value, open orders, active alerts, GRN status.
- **Stock by row** chart and **bin heat-map**.
- Live alert feed and recent movements.
- **Who is online / picking** (presence).
- **Warehouse open / closed switch** in the header.
- All numbers refresh in **< 1 s** through WebSockets.

## 14. Cycle counting

- Admin creates a **count session** for a set of bins.
- Staff enter counts on mobile, bin by bin (scan the bin first).
- Variance review; **approve** posts correction movements automatically.
- Count work feeds the staff performance dashboard.

## 15. CSV import / export

- **Four-step import** wizard (upload → map columns → validate → run) for products, bins and stock, via the `csv-import` Edge Function.
- **Row-level error report** and **live progress** bar.
- Bulk upserts of products and bins in one transaction.
- **Export** every reporting view (stock, movements, alerts, orders, GRNs) as CSV.

## 16. Label printing

- **Bin QR sheets** and **product barcode (Code128) sheets** as PDF, generated by the `label-pdf` Edge Function.
- Scan-ready with the app camera or a hardware scanner.

## 17. Scanning

- **Camera scanning** in the browser (ZXing) for QR and 1-D barcodes.
- **Hardware HID scanner** support (keyboard-wedge input).
- **Global scanner sheet** — scan from any screen and jump to the bin or product.
- **Offline scan queue** — picks confirmed while offline are stored in IndexedDB and replayed idempotently on reconnect (degrades gracefully where IndexedDB is unavailable).

## 18. Realtime

- Postgres Changes on stock, alerts, orders, pick tasks, movements, imports, GRNs, **warehouse status** and **staff tasks**.
- Changes invalidate React Query caches (debounced) — the UI never guesses state.
- Presence channel for pickers; 30 s polling fallback and a **"Reconnecting"** banner when the socket drops.
- RLS applies to realtime — you only receive rows you are allowed to read.

## 19. Users, roles & security

- Email / password auth with sign-up, forgot-password and profile pages.
- **Roles** in `profiles.role` (source of truth), mirrored to the JWT; role change reloads the session.
- **User management** (admin): change role with typed confirmation, activate / deactivate; the last admin cannot be demoted.
- **Row-Level Security on every table**; anonymous users read nothing; deactivated users are denied everywhere.
- All writes to stock, GRNs, status and tasks go through `SECURITY DEFINER` functions with in-function role checks.
- Guard triggers: no direct stock writes, movements immutable, GRN events insert-only, completed GRNs undeletable, staff limited to status / note on their own tasks.
- **Audit log** of row changes with actor and timestamp.
- Only `VITE_*` variables reach the browser; the service-role key never ships.

## 20. Settings (admin)

- Alert thresholds: expiry warning days, dead-stock days, default reorder point, pick mismatch threshold.
- Picking: serpentine routing on / off.
- Notifications: daily email digest on / off.
- **Warehouse hours**: schedule switch, open / close time, open days, timezone, closed message.
- **Re-evaluate alerts** button.

## 21. Design & UX

- **Binance-derived design system** (`DESIGN.md`): near-black canvas, one yellow accent with black text, green / red for success / destructive, flat surfaces, hairline borders, radius 4/6/8/12, no gradients.
- **Dark by default**, light theme as a token swap, system-sync option.
- Inter for text, **IBM Plex Sans for numbers**, JetBrains Mono for location codes.
- **Login landing** with the warehouse photo; *Log in* reveals a glass card over a blurred backdrop; **About** dialog explains the project and its flow.
- **Project logo** in the sidebar, top bar, login, favicon and PWA icons.
- Mobile-first staff UI with bottom navigation; desktop sidebar for admin.
- ≥ 44 px touch targets, WCAG AA contrast, keyboard shortcuts, reduced-motion respected.
- **PWA** — installable, offline shell, service worker.
- Route-level code splitting: scanner and charts load only where used.

## 22. Integration & deployment

- **Edge Functions**: `csv-import`, `label-pdf`, `alert-digest`, `order-webhook`.
- Storage buckets: imports, product images, labels, GRN documents.
- **Vercel** static deployment with `vercel.json` (SPA rewrite, cache and security headers); build fails loudly if Supabase env vars are missing or malformed.
- Supabase migrations: `0001` schema + seed, `0002` GRN, `0003` warehouse status + tasks.
- Deterministic demo seed: 1 warehouse, 4 rows, 160 bins, 800 SKUs, ~1,500 lots, ~1,560 movements, 40 orders, ~235 alerts, 1 vendor, 2 open POs, two staff accounts.

## 23. Testing & quality

- **pgTAP** — 5 suites, **141 assertions**: RLS, movement invariants, FEFO and no-oversell, GRN end to end, warehouse status + fair task distribution.
- **Vitest + Testing Library** — **66 tests**, including app smoke tests that mount the real app and prove the role guards and new routes.
- **Playwright** — 5 e2e specs: auth guards, search, scan-verified pick, cross-context realtime, accessibility.
- **Deno tests** for Edge Functions; ESLint with 0 warnings; strict TypeScript; CI runs all of it.

---

## Screen map

| Route | Who | Purpose |
|---|---|---|
| `/login`, `/signup`, `/forgot-password` | all | Auth, landing page, About |
| `/` | staff | Home: closed banner, my tasks, quick actions, orders to pick, recent movements |
| `/search` | staff | Instant search |
| `/products/:id`, `/bins/:id` | staff | Product / bin detail |
| `/orders`, `/orders/new`, `/orders/:id` | staff | Orders, intake, pick list + scanner |
| `/receive`, `/transfer`, `/scan`, `/movements` | staff | Inward, transfer, scanner hub, movement log |
| `/grn`, `/grn/new`, `/grn/:id` | staff | Goods receipts: list, truck arrival, count / verify / put-away |
| `/counts/:id` | staff | Cycle count entry |
| `/tasks` | staff | My tasks |
| `/profile`, `/more` | staff | Profile, extra links |
| `/admin` | admin | Live dashboard + warehouse switch |
| `/admin/alerts` | admin | Alert centre |
| `/admin/products` (+ new / edit) | admin | Catalogue |
| `/admin/purchase-orders` | admin | Purchase orders |
| `/admin/locations` | admin | Warehouses, rows, bulk bins |
| `/admin/expiry` | admin | Expiry manager |
| `/admin/counts` | admin | Cycle count sessions |
| `/admin/import`, `/admin/export` | admin | CSV import / export |
| `/admin/labels` | admin | QR / barcode PDFs |
| `/admin/staff` | admin | Performance dashboard, assign tasks, balance work, warehouse switch |
| `/admin/users` | admin | Roles and activation |
| `/admin/settings` | admin | Thresholds, picking, notifications, warehouse hours |
