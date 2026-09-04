# Extended Feature Catalogue
## Beyond the PS-3 problem statement

Legend: **P0** ship in v1 · **P1** v1.1 · **P2** backlog. Effort: S (< 1 day), M (1–3 days), L (> 3 days).

## A. Requested additions (all P0)

| # | Feature | Detail | Effort |
|---|---|---|---|
| A1 | **Smart alert system** | Rule engine in Postgres (`evaluate_alerts`) with 8 alert types, dedupe, auto-resolve, snooze, ack. Delivered in-app via Realtime to admin bell + feed; optional email digest. | M |
| A2 | **QR/barcode scan verification** | Bin QR + product barcode scans for picks, put-away, transfers, counts. Camera (ZXing) + HID scanners. Mismatch blocking; repeated mismatch → alert. | M |
| A3 | **Expiry management** | Expiry/lot captured on inward; required for perishables; FEFO allocation; expiry buckets; quarantine & write-off. | M |
| A4 | **Live dashboard via WebSocket** | Supabase Realtime (Postgres Changes + Broadcast + Presence). KPIs, stock by row, alert feed, movements, orders in progress. | M |
| A5 | **CSV bulk import/export** | Products, bins, opening stock, orders; validation report; partial/strict; Edge Function; live progress. Export from every grid. | M |
| A6 | **Role-based access** | `inventory_admin` / `staff` in JWT + RLS; admin user management. | S |

## B. Recommended additions (high value, low cost)

| # | Feature | Why it matters | Effort | Priority |
|---|---|---|---|---|
| B1 | **Pick route ordering** (row → bin, serpentine) | Cuts walking distance; trivial once bins have `sort_order`. | S | P0 |
| B2 | **Stock reservation on order intake** | Prevents two orders being promised the same unit. | S | P0 |
| B3 | **Partial allocation / short-pick handling** | Real orders are often short; show available vs needed instead of failing. | S | P0 |
| B4 | **Label printing** (bin QR sheets, product barcodes) | Scanning needs labels; Edge Function PDF. | M | P1 |
| B5 | **Cycle counting** with variance approval | Keeps data trustworthy; scan-driven. | M | P1 |
| B6 | **Put-away suggestions** | On inward, suggest bins already holding the SKU with free capacity, else nearest empty bin in the SKU's category zone. | S | P1 |
| B7 | **Audit log** for non-stock changes | Who changed a reorder point or a role. | S | P1 |
| B8 | **Global keyboard + HID scanner support** | Barcode scanners type + Enter; search bar handles it → instant jump. | S | P0 |
| B9 | **Offline scan queue** | Warehouses have dead zones; queue RPC calls in IndexedDB and replay. | M | P1 |
| B10 | **Presence: who is picking what** | Avoid two pickers on one order; admin visibility. | S | P1 |
| B11 | **Order status pipeline** (allocated → picking → picked → shipped → cancelled) | Basic fulfilment tracking without a full OMS. | S | P0 |
| B12 | **Reorder suggestions** | From low-stock alerts generate a "to reorder" list with suggested qty; export CSV for the buyer. | S | P1 |
| B13 | **Bin capacity & utilisation heat-map** | Visual space planning; over-capacity alert. | S | P0 |
| B14 | **Dead-stock report** | No outward movement in N days → free up bins. | S | P1 |
| B15 | **Stock value & ABC analysis** | Value tiles; rank SKUs by velocity; suggest slotting A-items near packing. | M | P2 |
| B16 | **Returns intake** | Inward with reason `return`, optional quarantine bin, condition grade. | S | P2 |
| B17 | **Product images** | Reduce wrong picks visually (Storage bucket). | S | P1 |
| B18 | **Multi-warehouse switcher** | Schema already supports; add warehouse selector + per-warehouse RLS scoping. | M | P2 |
| B19 | **Email / push alert digests** | Edge Function cron with Resend; Web Push for critical alerts. | M | P2 |
| B20 | **Public REST for order intake** (`order-webhook`) | Let a store push orders automatically. | S | P1 |
| B21 | **Snapshot & trend charts** | Nightly `stock_snapshots` table → units/value over time, expiry waste trend. | M | P2 |
| B22 | **Bulk transfer / re-slotting wizard** | Move an entire bin or SKU across bins with one scan each. | S | P2 |
| B23 | **Anomaly detection alerts** | Sudden negative adjustment spikes or unusual outward volume by user. | M | P2 |
| B24 | **PWA install + camera permission onboarding** | Home-screen app for pickers; faster camera access. | S | P1 |
| B25 | **i18n + unit conversions** | Multi-language UI, case/pack conversions. | M | P2 |

## C. Alert type reference

| Type | Trigger | Default threshold (settings) |
|---|---|---|
| low_stock | available ≤ reorder_point | per product; fallback `default_reorder_point = 10` |
| out_of_stock | available = 0 | — |
| expiring_soon | expiry ≤ today + N | `expiry_warning_days = 30` |
| expired | expiry < today, qty > 0 | — |
| dead_stock | no outward in N days | `dead_stock_days = 90` |
| bin_over_capacity | Σ qty in bin > capacity | per bin |
| pick_discrepancy | mismatch_count ≥ 2 | `pick_mismatch_threshold = 2` |
| order_short | order partially allocated | — |
| negative_adjustment_spike (P2) | Σ adjustments today < −X units | `adjustment_spike_units = 100` |
