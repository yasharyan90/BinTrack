# BinTrack — Presentation Deck

> One slide per `##`. Speaker notes in *italics*. ~12 minutes.

---

## 1. BinTrack
**Multi-Warehouse Inventory & Location Tracking**

*PS-3 · Pure Hard Development*

> "Every item has an address. Every movement has a record. Every problem raises its hand before it costs money."

Supabase · React · Realtime · Barcode/QR scanning

---

## 2. The problem
- Staff **don't know which warehouse, row or bin** holds an item
- Manual search → slow fulfilment, long walks, **wrong picks**
- **Expired stock shipped** — nobody tracks expiry at bin level
- Stock-outs discovered **only when an order fails**
- Deliveries received on paper — **no proof of what actually arrived**
- Work handed out by shouting — **one person overloaded, another idle**

---

## 3. Goals
| Goal | Target |
|---|---|
| Time to locate an item | < 1 s |
| Wrong-pick rate | 0 % via scan verification |
| Audit trail | 100 % of stock movements and receipts |
| Alert latency | < 1 s, live on the dashboard |
| Expiry handling | FEFO — first-expired-first-out |
| Work distribution | Equal load across staff, visible to admin |
| Access control | Enforced in the **database**, not the UI |

---

## 4. Users
| Persona | Role | Needs |
|---|---|---|
| **Priya — Picker / Receiver** | `staff` | Find fast, pick right, receive trucks, do assigned tasks |
| **Arjun — Inventory Admin** | `inventory_admin` | Accurate stock, early warnings, control hours, spread the work fairly |
| **Order system** | API / CSV | Push orders, get pick locations back |

Roles enforced by Postgres Row-Level Security + `SECURITY DEFINER` RPCs.

---

## 5. Core features
- **Location hierarchy** — Warehouse → Row → Bin, unique code `WH1-R02-B017`
- **Product ↔ bin mapping** — live quantity per product per bin, per lot / expiry
- **Order intake** → instant pick locations (FEFO, reserved stock, no oversell)
- **Immutable stock movement log** — inward / outward / transfer / adjustment
- **Instant, typo-tolerant search** — name, SKU, barcode (15–20 ms)
- **Scan verification** — bin QR + product barcode; wrong bin / product blocked
- **Smart alerts** — 10 types, deduplicated, auto-resolving, live
- **Live admin dashboard**, CSV import / export, cycle counts, label printing

---

## 6. New in this build — overview
| Feature | One line |
|---|---|
| **Goods Receipt (GRN)** | PO → truck → seal → scan-count → GRN → put-away; only accepted stock enters inventory |
| **Warehouse open / closed** | Admin on-off switch + opening hours; staff see "closed, opens at 10:00" |
| **Task assignment** | Admin writes tasks to staff; staff start / finish with a note; everything live |
| **Load balancing** | Auto-assign to the least-loaded person; one-click re-balance |
| **Staff performance** | Per-person picks, accuracy, receipts, tasks, share of work vs fair share |
| **Design & login** | Binance-style dark UI, warehouse-photo landing, About, project logo everywhere |

---

## 7. Goods Receipt (GRN) — flow
**PO → Truck arrival → Seal check → Scan & count → GRN → Put-away → Inventory**

1. Admin raises a **Purchase Order** — vendor, warehouse, lines, expected date
2. Staff registers the **truck** — vehicle, driver + ID, gate time, **seal** (intact / broken / missing), challan, invoice
3. Receiving staff captured **automatically** from the login
4. Each SKU by **scan**: ordered → previously received → received → accepted → damaged → rejected → **short / excess computed**
5. **Verify** → `GRN-2026-00124` issued; PO progress updated; discrepancy alert if needed
6. **Put-away** accepted units to a bin → stock rises by **accepted only**

---

## 8. GRN — business rules
- Partial deliveries and **multiple GRNs per PO** — second truck sees what was already received
- **Wrong SKU blocked** and logged on the timeline
- Damaged / rejected units **never enter inventory**
- Broken or missing seal → alert **before a carton is opened**
- Evidence uploads: challan, invoice, seal photo, damage photo
- Every put-away is a `stock_movement` with actor + GRN reference; insert-only event timeline
- **Completed GRNs cannot be deleted**
- Admin KPIs: total · pending verification · discrepancies · pending put-away · completed

*Worked example: ordered 100 · received 98 · accepted 96 · damaged 2 · short 2 → stock +96.*

---

## 9. Warehouse open / closed
**One switch on the admin dashboard controls the whole warehouse.**

- **Off** → every staff screen shows a red banner: *"Warehouse closed — opens tomorrow 10:00"* plus the admin's message
- **Schedule** (Settings → Warehouse hours): opens **10:00**, closes **19:00**, open days Mon–Sat, timezone, closed message
- "Follow schedule" on → closes and opens **automatically**; the switch overrides either way
- Status is computed in the database (`warehouse_status()`), so every device agrees
- Change reaches staff **live** — no refresh, no app restart

*Demo: flip the switch in one window, watch the staff window turn red.*

---

## 10. Task assignment — in writing
**Admin writes it once; the right person sees it instantly.**

- Task = title, description, **priority** (low / normal / high / urgent), due date
- Optional link to the **order, GRN, product or bin** the task is about
- Staff page **My tasks**: *Start* → *Done* with a short note back to the admin
- Preview of open tasks on the staff Home screen
- Staff can only change the status and note of **their own** tasks
- Every create, reassign and status change lands in the **audit log**

---

## 11. Load balancing — nobody gets all the work
**Default assignee is "Auto" — the database picks the least-loaded person.**

```
least_loaded_staff()  →  fewest open + in-progress tasks wins
assign_task(...)      →  assignee = Auto ? least_loaded_staff() : chosen
balance_open_tasks()  →  moves open tasks from the busiest to the freest
```
- **Open work right now** cards — open / in-progress / overdue per person
- **Balance open tasks** button fixes an uneven backlog in one click
- Result shown: how many tasks moved, who has what now
- Admin can still hand-pick or reassign any task

---

## 12. Staff performance dashboard (admin)
Window: **7 / 30 / 90 days** · one row per staff member

| Column | What it counts |
|---|---|
| Picks · units · **accuracy %** | Confirmed picks, scan mismatches |
| Receipts · units · GRN lines | Trucks and SKUs counted |
| Put-aways · count lines | Stock placed, cycle-count work |
| Tasks done · on time · overdue · avg hours | Assigned task delivery |
| **Share of work vs fair share** | Bar turns red when one person carries far more than 1/N |

All numbers come from real records — movements, pick tasks, GRNs, tasks — not self-reporting.

---

## 13. Design & login
- **Binance-derived design system** (`DESIGN.md`): near-black canvas `#0b0e11`, one accent — **yellow `#fcd535` with black text**, green / red for success / destructive, flat surfaces, hairline borders
- Inter for text, **IBM Plex Sans for numbers**, JetBrains Mono for location codes
- Dark by default; light is a token swap
- **Login**: warehouse photo landing → *Log in* reveals a glass card on a blurred backdrop; **About** explains the project flow
- **Project logo** in the sidebar, top bar, login, PWA icons and favicon
- ≥ 44 px touch targets, WCAG AA contrast, reduced-motion respected

---

## 14. Architecture
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
**No Express server.** Every business rule is a Postgres function called via `supabase.rpc()`.

---

## 15. Tech stack (all free tiers)
| Layer | Choice |
|---|---|
| Database / Auth / Realtime / Storage / Functions | **Supabase** |
| Frontend | **React 18 + Vite + TypeScript** |
| UI | Tailwind CSS · shadcn-style primitives · lucide icons |
| Data | TanStack Query + supabase-js v2 |
| Scanning | @zxing/browser (camera) + HID scanner |
| CSV / Charts / PDF | PapaParse · Recharts · pdf-lib + qrcode + bwip-js |
| Testing | Vitest · Testing Library · Playwright · pgTAP · Deno test |
| Hosting | Vercel (static SPA) + Supabase |

---

## 16. Data model
```
profiles(role) ─ warehouses ─ warehouse_rows ─ bins(location_code)
products(sku, barcode, reorder_point, is_perishable) ─ categories
stock_levels(product, bin, lot, expiry, qty, reserved)    ← one row per lot
stock_movements(type, from, to, qty, actor, grn)         ← append-only
orders ─ order_items ─ pick_tasks(status, mismatch_count)
alerts(type, severity, status) · count_sessions ─ count_lines
vendors ─ purchase_orders ─ po_lines
grns ─ grn_lines ─ grn_putaways ─ grn_documents ─ grn_events
staff_tasks(assigned_to, assigned_by, priority, status, due_at, note)
app_settings(warehouse_status: is_open, hours, days, message)
```
**Invariants:** `reserved ≤ quantity` · stock only via `record_movement()` · movements immutable · completed GRNs undeletable · staff edit only their own tasks.

---

## 17. Key algorithms
**Search** — 4 tiers: exact barcode → SKU prefix → typo-tolerant tokens → trigram similarity. `"bleu mug"` → Blue Ceramic Mug.

**FEFO allocation** — available, not expired, `ORDER BY expiry, row, bin FOR UPDATE SKIP LOCKED` → reserve → pick task. Two orders can never claim the same unit.

**Scan verification** — bin QR then product barcode; 2 mismatches → discrepancy alert; offline scans queue in IndexedDB and replay idempotently.

**Least-loaded assignment** — count active tasks per staff, pick the minimum; balance moves tasks until the spread is ≤ 1.

---

## 18. Alerts & realtime
| Type | Condition |
|---|---|
| low_stock / out_of_stock | available ≤ reorder point / = 0 |
| expiring_soon / expired | ≤ N days / past date (auto-quarantine) |
| dead_stock · bin_over_capacity | no outward for N days · qty > capacity |
| pick_discrepancy · order_short | ≥ 2 mismatches · partial allocation |
| **grn_discrepancy** | seal / short / excess / damaged |

Evaluated after every movement + every 15 min. **Realtime** on stock, alerts, orders, picks, GRNs, **warehouse status and tasks** → React Query invalidation, presence, reconnect banner. RLS applies to realtime too.

---

## 19. Security
- **RLS on every table**; `anon` reads nothing
- Stock, GRN, status and task writes only through `SECURITY DEFINER` RPCs with in-function role checks
- Role source of truth = `profiles.role`; deactivated users denied everywhere; last admin cannot be demoted
- Guard triggers: no direct stock writes, movements immutable, completed GRNs undeletable, staff limited to status / note on own tasks
- Only `VITE_*` vars reach the browser; service-role key never ships

---

## 20. Screens
**Staff** — Home (closed banner + my tasks) · Search · Product · Bin · Orders / Pick list + scanner · Receive · Transfer · Movements · Count entry · **Goods receipts** (list / truck arrival / detail) · **My tasks** · Profile

**Admin** — Live dashboard (**open / closed switch**) · Alert centre · Products · **Purchase orders** · Locations · Expiry · Cycle counts · Import / Export · Labels · **Staff & tasks** (performance, assign, balance) · Users · Settings (**warehouse hours**)

Route-level code splitting: scanner and charts load only where used.

---

## 21. Mock data
Deterministic seed:
- **1 warehouse · 4 rows · 160 bins · 800 SKUs · ~1,500 stock lots**
- **~1,560 movements · 40 orders · ~235 live alerts**
- 1 vendor · 2 open purchase orders for the GRN demo
- Two staff accounts for the task-balancing demo
- Dev logins: `admin@bintrack.dev` / `staff@bintrack.dev` · `Password123!`

---

## 22. Testing & validation
| Level | Tool | Result |
|---|---|---|
| Database | pgTAP (5 suites) | **141 / 141** — RLS, movement invariants, FEFO, GRN flow, warehouse status + fair task distribution |
| Unit + component + app smoke | Vitest + Testing Library | **66 / 66** |
| Edge Functions | Deno test | CSV parser + schemas |
| End-to-end | Playwright (5 specs) | auth guards, search, scan-verified pick, realtime, a11y |
| Static | ESLint (0 warnings) · tsc strict | clean |

---

## 23. Deployment
```bash
supabase link && supabase db push        # 0001 schema · 0002 GRN · 0003 status + tasks
supabase functions deploy csv-import label-pdf alert-digest order-webhook
cd web && npm run build                   # fails loudly if Supabase env vars are missing
```
- **Vercel** from the repo root (`vercel.json`: SPA rewrite, cache + security headers)
- Env: `VITE_SUPABASE_URL` (base URL, no path) + `VITE_SUPABASE_ANON_KEY`
- CI: lint · types · tests · build · pgTAP · Deno checks

---

## 24. Live demo script (6 min)
1. **Search** "bleu mug" → bins + quantities instantly
2. **New order** → pick list in walking order; scan wrong bin → blocked; right bin → stock drops live
3. **GRN**: truck with broken seal → alert; count 98 / 96 / 2 → verify → put away 96 → inventory +96
4. **Warehouse switch off** → staff window shows *closed, opens at 10:00*
5. **Assign a task** on Auto → lands on the least-loaded staff; staff starts and finishes it with a note
6. **Staff & tasks** → performance table, share-of-work bars, *Balance open tasks*

---

## 25. Roadmap
- Racks between row and bin; multi-warehouse switcher
- Reorder suggestions → purchase orders automatically
- Task templates and recurring tasks (daily counts, end-of-shift checks)
- Shift roster feeding the opening hours
- Returns intake with quarantine bins; Web Push for critical alerts

---

## 26. Summary
- **Where is it?** — answered in < 1 s, typo-tolerant
- **Pick it right** — scan-verified, FEFO, no oversell
- **Receive it properly** — PO → GRN → put-away, only accepted stock counts
- **Run it on time** — admin-controlled open / closed hours, staff always informed
- **Share the work fairly** — written tasks, auto-balanced, performance visible
- **Trust it** — RLS-enforced roles, immutable log, 207 automated assertions

**Thank you.**
