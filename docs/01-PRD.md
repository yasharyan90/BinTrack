# Product Requirements Document (PRD)
## BinTrack — Multi-Warehouse Inventory & Location Tracking System

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-09-04 |
| Status | Approved for build |
| Problem statement | PS-3 (Pure Hard Development) |
| Platform | Web (desktop + mobile browser), Supabase backend |

---

## 1. Problem statement

E-commerce orders arrive continuously, but fulfilment staff do not immediately know **which warehouse, row, or bin** holds each item. They search manually, walk unnecessary distances, and pick the wrong item or the wrong lot. Consequences:

- Slow fulfilment (minutes per order lost to searching)
- Wrong-pick errors → returns, refunds, customer complaints
- Expired stock shipped because nobody tracks expiry at bin level
- Admins discover stock-outs only when an order fails
- Inventory data lives in spreadsheets with no audit trail

## 2. Vision

> "Every item has an address. Every movement has a record. Every problem raises its hand before it costs money."

BinTrack gives every unit of stock a precise address (`WH1-R03-B012`), tells the picker exactly where to go the instant an order lands, verifies the pick with a scan, and keeps the admin dashboard live with alerts that surface problems automatically.

## 3. Goals & non-goals

### Goals
1. Reduce time-to-locate an item from minutes to **< 1 second** (search) and **0 seconds** (order intake auto-returns location).
2. Eliminate wrong-pick errors through **scan verification** (bin QR + product barcode).
3. Provide a **complete audit trail** of every stock movement.
4. Give admins a **live** view of stock health with **proactive alerts**.
5. Track **expiry** at lot level and always pick **first-expired-first-out (FEFO)**.
6. Allow **bulk onboarding** of products and stock via CSV.
7. Enforce **role-based access** at the database layer.

### Non-goals (v1)
- Multi-warehouse *transfers between warehouses* (schema supports many warehouses; UI focuses on one).
- Carrier integration, shipping labels, payment.
- Purchase-order / supplier management (reorder alerts only *suggest* a PO).
- Native mobile apps (the responsive web app + camera scanning covers mobile use).

## 4. Personas

| Persona | Role in system | Goals | Pain points today |
|---|---|---|---|
| **Priya — Warehouse Staff / Picker** | `staff` | Find items fast, pick correctly, receive inbound stock, move stock between bins. | Walks around looking for items; picks wrong variant; no idea if a lot is expired. |
| **Arjun — Inventory Admin** | `inventory_admin` | Keep stock accurate, know what's low / expiring, onboard new products in bulk, control who can do what. | Learns of stock-outs too late; spreadsheets drift from reality; no audit trail. |
| **Order system (API / CSV)** | integration | Push orders in and get pick locations back. | Manual re-keying. |

## 5. Feature requirements

Priority: **P0** = must ship, **P1** = should ship, **P2** = nice to have.

### 5.1 Location hierarchy (P0)
- Warehouse → Row → Bin. Each bin has a unique, human-readable `location_code` = `{WH}-{ROW}-{BIN}` (e.g. `WH1-R02-B017`), generated automatically.
- Bins have optional capacity (units), a QR code encoding the location code, and an active flag.
- Admins can create/edit/deactivate rows and bins; deactivated bins cannot receive stock.

### 5.2 Product catalogue (P0)
- Fields: SKU (unique), name, description, category, barcode (EAN/UPC/Code128, unique), unit of measure, unit cost, reorder point, reorder quantity, is_perishable, default shelf-life days, image.
- Admin CRUD; staff read-only.
- Product barcode label printable.

### 5.3 Product-to-bin mapping with live quantity (P0)
- Stock is held per (product, bin, lot, expiry). A product can live in many bins; a bin can hold many products.
- Quantities update instantly on every movement and propagate to all connected clients via WebSocket.
- Product detail shows all locations sorted by expiry then location, with quantity and lot.

### 5.4 Instant search (P0)
- Single search bar: matches product name (typo-tolerant: Levenshtein token match + trigram similarity), SKU prefix, exact barcode, category.
- Results within 150 ms for 1,000 SKUs; shows product, total on hand, and each location with quantity.
- Scanning a barcode into the search bar jumps directly to the product.
- Keyboard shortcut `/` focuses search from anywhere.

### 5.5 Order intake → instant pick locations (P0)
- Create an order manually (multi-line), via CSV, or via REST (PostgREST) call.
- On creation, the system allocates stock per line using **FEFO → then walking order (row, bin)** and returns for each line: location code, row, bin, lot, expiry, quantity to pick.
- If stock is insufficient, the line is flagged `short` with the available quantity; order status becomes `partially_allocated`.
- Allocation reserves stock (reserved quantity) so parallel orders don't double-allocate.
- Pick list is grouped by row and ordered for a shortest single-pass walk.

### 5.6 QR / barcode scan verification (P0)
- Camera scanning in-browser (mobile & laptop) plus support for USB/Bluetooth HID scanners.
- **Pick verification**: staff scans the bin QR → then the product barcode → system confirms match → quantity confirmed → stock decremented, movement logged.
- Mismatch (wrong bin / wrong product / expired lot) shows a blocking error and raises a `pick_discrepancy` alert if repeated.
- **Put-away verification**: on inward, scan the destination bin to confirm placement.
- **Transfer verification**: scan source bin, product, destination bin.
- Manual override allowed for admins only, logged with reason.

### 5.7 Stock movement log (P0)
- Types: `inward`, `outward`, `transfer`, `adjustment`, `count_correction`.
- Each record: product, from bin, to bin, quantity, lot, expiry, reference (order/import/count), actor, timestamp, note.
- Immutable (no update/delete; corrections are new adjustment records).
- Filterable by product, bin, type, actor, date range; exportable to CSV.

### 5.8 Expiry management (P0)
- Expiry date (and optional lot number) captured on inward stock for perishable products; required if `is_perishable`.
- Default expiry suggested from `shelf_life_days`.
- FEFO allocation for orders.
- Expiry views: expiring in 7 / 30 / 60 days, expired.
- Expired lots are auto-flagged `quarantined` (not allocatable) and raise a `expired` alert; admin can write-off via adjustment.

### 5.9 Smart alert system (P0)
Rule engine evaluated on every stock change (trigger) and on a schedule (pg_cron, every 15 min):

| Alert type | Condition | Severity | Auto-resolve when |
|---|---|---|---|
| `low_stock` | on-hand − reserved ≤ reorder_point | warning | on-hand rises above reorder point |
| `out_of_stock` | on-hand − reserved = 0 and product active | critical | any on-hand |
| `expiring_soon` | lot expires within N days (setting, default 30) | warning | lot consumed or expired |
| `expired` | lot expiry < today and qty > 0 | critical | lot written off |
| `dead_stock` | no outward movement in N days (default 90) and qty > 0 | info | outward movement recorded |
| `bin_over_capacity` | bin qty > capacity | warning | qty ≤ capacity |
| `pick_discrepancy` | ≥ 2 scan mismatches on same pick task | warning | admin acknowledges |
| `order_short` | order allocated partially | warning | order fully allocated / cancelled |

- Alerts appear as a **notification bell + live feed** on the admin dashboard, with unread count, in real time (WebSocket).
- Admin can **acknowledge**, **snooze** (24h/7d), or **resolve**; actions are logged.
- Deduplicated: one active alert per (type, product, bin).
- Optional daily email digest to admins (Edge Function).

### 5.10 Live admin dashboard (P0)
- KPIs: total SKUs, total units, stock value, low-stock count, expiring count, open orders, picks today, accuracy %.
- **Stock by row**: bar chart + row heat-map (bin utilisation).
- **Alert feed** (live), **recent movements** (live), **orders in progress** (live with presence: who is picking).
- All widgets subscribe to Supabase Realtime; no manual refresh.

### 5.11 CSV bulk import / export (P0)
- Import: products, bins/rows, opening stock (with lot & expiry), orders.
- Download template CSVs; drag-drop upload; preview first 20 rows; validation report (row #, column, error); partial or all-or-nothing mode.
- Import runs in an Edge Function with the service role; progress reported via Realtime.
- Export: products, stock by location, movements (filtered), alerts, orders — as CSV, respecting current filters.

### 5.12 Role-based access control (P0)
- Roles: `inventory_admin`, `staff`. Stored in `profiles.role`, mirrored into JWT `app_metadata` for RLS.
- Matrix in README §5. Enforced by RLS policies and `SECURITY DEFINER` functions; the UI hides what the user can't do but never relies on hiding for security.
- Admin can invite users, assign roles, deactivate accounts.

### 5.13 Cycle counting / stock audit (P1)
- Admin creates a count task for a row or set of bins; staff scans bin then products, enters counted quantity; variance report; admin approves → `count_correction` movements.

### 5.14 Label printing (P1)
- Print sheets of bin QR labels (per row) and product barcode labels (per product) as PDF.

### 5.15 Pick route optimisation (P1)
- Pick list ordered by row sort order then bin sort order; optional serpentine (alternating direction) per row.

### 5.16 Activity / audit log (P1)
- Non-stock changes (product edits, role changes, settings) logged with before/after JSON.

### 5.17 Returns & put-away suggestions (P2)
- Return intake creates an `inward` with reason; system suggests the bin already holding that product with most free capacity.

### 5.18 ABC analysis & dead-stock report (P2)
- Rank SKUs by outward velocity; suggest moving A-items to the rows nearest packing.

## 6. User stories & acceptance criteria

### Staff
1. **Search** — *As staff, I type "blue mug" and within a second see every bin holding it and how many.*
   - AC: results appear ≤ 150 ms p95 after keystroke debounce (200 ms); typo "bleu mug" still matches; each result shows `location_code`, qty, expiry if any.
2. **Order pick** — *As staff, I open an order and see exactly which bins to visit, in walking order.*
   - AC: each line shows location, lot, expiry, qty; grouped by row; short lines are clearly marked.
3. **Scan verify** — *As staff, I scan the bin then the product and the system confirms or blocks me.*
   - AC: match → green confirmation and qty prompt; mismatch → red blocking message with expected vs scanned; expired lot → blocked.
4. **Receive stock** — *As staff, I receive 50 units of a perishable product, enter expiry, scan the bin, and stock appears instantly.*
   - AC: expiry required for perishables; default suggested; movement log row created; dashboard updates without refresh.
5. **Transfer** — *As staff, I move 10 units from bin A to bin B with scans.*
   - AC: single transfer movement; both bins update; cannot exceed source qty.

### Admin
6. **Dashboard** — *As admin, I see stock by row and get notified the moment something is low or expiring.*
   - AC: alert appears in bell within 1 s of the triggering stock change; unread count increments; acknowledging removes it from unread.
7. **CSV import** — *As admin, I upload 800 products and 1,200 stock lines and get a per-row error report.*
   - AC: invalid rows listed with reason; valid rows imported (partial mode); import job status live.
8. **Roles** — *As admin, I can promote a staff user; as staff, I cannot access admin pages or admin RPCs even via API.*
   - AC: direct PostgREST call with staff JWT to `products` insert returns 401/403.
9. **Expiry** — *As admin, I see everything expiring in 30 days and can write off expired lots.*
   - AC: expired lots are excluded from allocation; write-off creates adjustment movement.

## 7. Success metrics

| Metric | Target |
|---|---|
| Time from order creation to pick locations displayed | < 500 ms |
| Search latency (p95, 1k SKUs) | < 150 ms |
| Wrong-pick rate (scan-verified picks) | 0 % |
| Stock accuracy after cycle count | ≥ 99 % |
| Alert latency (stock change → dashboard) | < 1 s |
| CSV import of 1,000 rows | < 10 s |
| Realtime update propagation | < 1 s |

## 8. Constraints & assumptions
- Free tiers only: Supabase Free (500 MB DB, 2 Realtime concurrent connections per client, 500k Edge Function invocations), Vercel/Netlify Hobby for hosting.
- One warehouse in mock data (3–4 rows, 500–1000 SKUs) but schema is multi-warehouse.
- Devices: modern Chrome/Safari with camera permission for scanning.
- Mock data must be internally consistent (same product IDs across stock and orders).

## 9. Open questions
1. Should staff be allowed to create products on the fly during receiving? (Default: no; admin only.)
2. Should reserved stock be visible to staff in search results? (Default: yes, shown as "available / on hand".)
3. Email alerts: opt-in per admin? (Default: daily digest opt-in in Settings.)
