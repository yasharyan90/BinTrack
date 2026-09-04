/**
 * Application-level shapes for the RPCs that return `jsonb`.
 *
 * Postgres hands these back as `Json`, so they are narrowed here once and used
 * everywhere else — no `any` at an RPC call site (Implementation Plan §5).
 */
import type {
  AlertSeverity,
  AlertStatus,
  AlertType,
  OrderStatus,
  PickStatus,
  StockStatus,
  Tables,
} from './database'

export type Profile = Tables<'profiles'>
export type Product = Tables<'products'>
export type Bin = Tables<'bins'>
export type WarehouseRow = Tables<'warehouse_rows'>
export type Warehouse = Tables<'warehouses'>
export type Category = Tables<'categories'>
export type Order = Tables<'orders'>
export type Alert = Tables<'alerts'>
export type ImportJob = Tables<'import_jobs'>
export type CountSession = Tables<'count_sessions'>

/** One physical lot in one bin, as returned inside `search_products.locations`. */
export type SearchLocation = {
  bin_id: string
  location_code: string
  row_code: string
  bin_code: string
  quantity: number
  reserved: number
  lot_number: string | null
  expiry_date: string | null
  status: StockStatus
}

export type SearchResult = {
  id: string
  sku: string
  name: string
  barcode: string | null
  category: string | null
  is_perishable: boolean
  reorder_point: number
  on_hand: number
  reserved: number
  available: number
  locations: SearchLocation[]
  score: number
}

export type ProductLocation = {
  stock_level_id: string
  bin_id: string
  location_code: string
  row_code: string
  row_name: string | null
  bin_code: string
  lot_number: string | null
  expiry_date: string | null
  days_to_expiry: number | null
  quantity: number
  reserved_qty: number
  available: number
  status: StockStatus
  last_movement_at: string | null
}

export type PickTask = {
  id: string
  order_item_id: string
  product_id: string
  sku: string
  name: string
  barcode: string | null
  image_url: string | null
  bin_id: string | null
  location_code: string | null
  row_code: string | null
  row_name: string | null
  bin_code: string | null
  lot_number: string | null
  expiry_date: string | null
  days_to_expiry: number | null
  quantity: number
  picked_qty: number
  status: PickStatus
  mismatch_count: number
  last_mismatch: string | null
  bin_verified_at: string | null
  verified_at: string | null
  picked_at: string | null
}

export type PickListItem = {
  order_item_id: string
  product_id: string
  sku: string
  name: string
  quantity: number
  allocated_qty: number
  picked_qty: number
  is_short: boolean
}

export type PickList = {
  order: Order | null
  items: PickListItem[]
  tasks: PickTask[]
}

/** `verify_pick` result — either a step forward or a blocking mismatch. */
export type VerifyResult =
  | { ok: true; step: 'product'; location_code: string }
  | { ok: true; step: 'quantity'; status: 'verified'; quantity: number }
  | {
      ok: false
      reason: 'bin' | 'product' | 'expired'
      expected: { location_code: string; barcode: string | null; sku: string }
      scanned: { bin: string | null; barcode: string | null }
      mismatch_count: number
    }

export type ScanResolution =
  | { kind: 'bin'; id: string; location_code: string; is_active: boolean }
  | { kind: 'product'; id: string; sku: string; name: string; barcode: string | null }
  | { kind: 'unknown'; code: string }

export type DashboardKpis = {
  total_skus: number
  total_units: number
  stock_value: number
  low_stock_count: number
  out_of_stock_count: number
  expiring_count: number
  expired_count: number
  active_alerts: number
  open_orders: number
  picks_today: number
  pick_accuracy_pct: number
  movements_today: number
  generated_at: string
}

export type AlertFilters = {
  status?: AlertStatus[]
  type?: AlertType | 'all'
  severity?: AlertSeverity | 'all'
  search?: string
}

export type OrderFilters = { status?: OrderStatus | 'all'; search?: string }

export type ImportRowError = { row: number; column?: string; message: string }

export type AppSettings = {
  expiry_warning_days: number
  dead_stock_days: number
  default_reorder_point: number
  pick_mismatch_threshold: number
  serpentine_picking: boolean
  email_digest_enabled: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  expiry_warning_days: 30,
  dead_stock_days: 90,
  default_reorder_point: 10,
  pick_mismatch_threshold: 2,
  serpentine_picking: false,
  email_digest_enabled: false,
}
