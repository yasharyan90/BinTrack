/**
 * Database types for supabase-js.
 *
 * Hand-maintained mirror of supabase/migrations/0001_schema.sql, written in the
 * exact shape `supabase gen types typescript` emits so it can be regenerated:
 *
 *     npm run gen:types      # supabase gen types typescript --local
 *
 * Regenerate after every migration; never edit a generated file by hand.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type AppRole = 'inventory_admin' | 'staff'
export type MovementType = 'inward' | 'outward' | 'transfer' | 'adjustment' | 'count_correction'
export type StockStatus = 'available' | 'quarantined'
export type OrderStatus =
  | 'pending'
  | 'allocated'
  | 'partially_allocated'
  | 'picking'
  | 'picked'
  | 'shipped'
  | 'cancelled'
export type PickStatus = 'pending' | 'verified' | 'picked' | 'short' | 'cancelled'
export type AlertType =
  | 'low_stock'
  | 'out_of_stock'
  | 'expiring_soon'
  | 'expired'
  | 'dead_stock'
  | 'bin_over_capacity'
  | 'pick_discrepancy'
  | 'order_short'
  | 'grn_discrepancy'
export type AlertSeverity = 'info' | 'warning' | 'critical'
export type AlertStatus = 'active' | 'acknowledged' | 'snoozed' | 'resolved'
export type ImportKind = 'products' | 'bins' | 'opening_stock' | 'orders'
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type CountStatus = 'open' | 'submitted' | 'approved' | 'cancelled'
export type PoStatus = 'open' | 'partially_received' | 'received' | 'closed' | 'cancelled'
export type GrnStatus = 'arrived' | 'verifying' | 'verified' | 'put_away' | 'completed' | 'cancelled'
export type SealStatus = 'intact' | 'broken' | 'missing'
export type GrnDocumentKind = 'challan' | 'invoice' | 'seal_photo' | 'damage_photo' | 'other'

type Timestamps = { created_at: string; updated_at: string }

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          role: AppRole
          is_active: boolean
          preferences: Json
        } & Timestamps
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          role?: AppRole
          is_active?: boolean
          preferences?: Json
        }
        Update: {
          email?: string | null
          full_name?: string | null
          role?: AppRole
          is_active?: boolean
          preferences?: Json
        }
        Relationships: []
      }
      app_settings: {
        Row: { key: string; value: Json; updated_by: string | null; updated_at: string }
        Insert: { key: string; value: Json; updated_by?: string | null }
        Update: { value?: Json; updated_by?: string | null }
        Relationships: []
      }
      warehouses: {
        Row: {
          id: string
          code: string
          name: string
          address: string | null
          is_active: boolean
        } & Timestamps
        Insert: { id?: string; code: string; name: string; address?: string | null; is_active?: boolean }
        Update: { code?: string; name?: string; address?: string | null; is_active?: boolean }
        Relationships: []
      }
      warehouse_rows: {
        Row: {
          id: string
          warehouse_id: string
          code: string
          name: string | null
          sort_order: number
          is_active: boolean
        } & Timestamps
        Insert: {
          id?: string
          warehouse_id: string
          code: string
          name?: string | null
          sort_order?: number
          is_active?: boolean
        }
        Update: { code?: string; name?: string | null; sort_order?: number; is_active?: boolean }
        Relationships: [
          {
            foreignKeyName: 'warehouse_rows_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
        ]
      }
      bins: {
        Row: {
          id: string
          row_id: string
          code: string
          location_code: string
          capacity: number | null
          sort_order: number
          is_active: boolean
        } & Timestamps
        Insert: {
          id?: string
          row_id: string
          code: string
          location_code?: string
          capacity?: number | null
          sort_order?: number
          is_active?: boolean
        }
        Update: {
          row_id?: string
          code?: string
          capacity?: number | null
          sort_order?: number
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'bins_row_id_fkey'
            columns: ['row_id']
            isOneToOne: false
            referencedRelation: 'warehouse_rows'
            referencedColumns: ['id']
          },
        ]
      }
      categories: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string }
        Update: { name?: string }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          sku: string
          name: string
          description: string | null
          category_id: string | null
          barcode: string | null
          unit: string
          unit_cost: number
          reorder_point: number
          reorder_qty: number
          is_perishable: boolean
          shelf_life_days: number | null
          image_url: string | null
          is_active: boolean
          search_text: string
          created_by: string | null
        } & Timestamps
        Insert: {
          id?: string
          sku: string
          name: string
          description?: string | null
          category_id?: string | null
          barcode?: string | null
          unit?: string
          unit_cost?: number
          reorder_point?: number
          reorder_qty?: number
          is_perishable?: boolean
          shelf_life_days?: number | null
          image_url?: string | null
          is_active?: boolean
          created_by?: string | null
        }
        Update: {
          sku?: string
          name?: string
          description?: string | null
          category_id?: string | null
          barcode?: string | null
          unit?: string
          unit_cost?: number
          reorder_point?: number
          reorder_qty?: number
          is_perishable?: boolean
          shelf_life_days?: number | null
          image_url?: string | null
          is_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'products_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      stock_levels: {
        Row: {
          id: string
          product_id: string
          bin_id: string
          lot_number: string | null
          expiry_date: string | null
          quantity: number
          reserved_qty: number
          status: StockStatus
          last_movement_at: string | null
        } & Timestamps
        Insert: never // stock is written only by record_movement()
        Update: never
        Relationships: [
          {
            foreignKeyName: 'stock_levels_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_levels_bin_id_fkey'
            columns: ['bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
        ]
      }
      stock_movements: {
        Row: {
          id: string
          type: MovementType
          product_id: string
          from_bin_id: string | null
          to_bin_id: string | null
          quantity: number
          lot_number: string | null
          expiry_date: string | null
          reference_type: string | null
          reference_id: string | null
          note: string | null
          performed_by: string | null
          created_at: string
        }
        Insert: never // append-only, written by record_movement()
        Update: never
        Relationships: [
          {
            foreignKeyName: 'stock_movements_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_from_bin_id_fkey'
            columns: ['from_bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_to_bin_id_fkey'
            columns: ['to_bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
        ]
      }
      orders: {
        Row: {
          id: string
          order_number: string
          customer_name: string | null
          source: string
          status: OrderStatus
          note: string | null
          created_by: string | null
          allocated_at: string | null
          picking_started_at: string | null
          picked_at: string | null
          shipped_at: string | null
          cancelled_at: string | null
          cancel_reason: string | null
        } & Timestamps
        Insert: {
          id?: string
          order_number?: string
          customer_name?: string | null
          source?: string
          note?: string | null
          created_by?: string | null
        }
        Update: { status?: OrderStatus; note?: string | null; customer_name?: string | null }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string
          quantity: number
          allocated_qty: number
          picked_qty: number
          is_short: boolean
          created_at: string
        }
        Insert: { id?: string; order_id: string; product_id: string; quantity: number }
        Update: { quantity?: number }
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'order_items_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      pick_tasks: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          product_id: string
          stock_level_id: string | null
          bin_id: string | null
          lot_number: string | null
          expiry_date: string | null
          quantity: number
          picked_qty: number
          status: PickStatus
          mismatch_count: number
          last_mismatch: string | null
          bin_verified_at: string | null
          verified_by: string | null
          verified_at: string | null
          picked_by: string | null
          picked_at: string | null
          override_reason: string | null
        } & Timestamps
        Insert: never // created by allocate_order()
        Update: { status?: PickStatus }
        Relationships: [
          {
            foreignKeyName: 'pick_tasks_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pick_tasks_order_item_id_fkey'
            columns: ['order_item_id']
            isOneToOne: false
            referencedRelation: 'order_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pick_tasks_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'pick_tasks_bin_id_fkey'
            columns: ['bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
        ]
      }
      alerts: {
        Row: {
          id: string
          type: AlertType
          severity: AlertSeverity
          status: AlertStatus
          product_id: string | null
          bin_id: string | null
          order_id: string | null
          grn_id: string | null
          title: string
          message: string
          metadata: Json
          first_seen_at: string
          last_evaluated_at: string
          acknowledged_by: string | null
          acknowledged_at: string | null
          snooze_until: string | null
          resolved_by: string | null
          resolved_at: string | null
        } & Timestamps
        Insert: never // written by the alert engine
        Update: { status?: AlertStatus; snooze_until?: string | null }
        Relationships: [
          {
            foreignKeyName: 'alerts_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'alerts_bin_id_fkey'
            columns: ['bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'alerts_order_id_fkey'
            columns: ['order_id']
            isOneToOne: false
            referencedRelation: 'orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'alerts_grn_id_fkey'
            columns: ['grn_id']
            isOneToOne: false
            referencedRelation: 'grns'
            referencedColumns: ['id']
          },
        ]
      }
      alert_reads: {
        Row: { alert_id: string; user_id: string; read_at: string }
        Insert: { alert_id: string; user_id: string }
        Update: never
        Relationships: []
      }
      count_sessions: {
        Row: {
          id: string
          warehouse_id: string
          row_id: string | null
          name: string
          status: CountStatus
          is_blind: boolean
          created_by: string | null
          approved_by: string | null
          approved_at: string | null
        } & Timestamps
        Insert: never // created by start_count_session()
        Update: { status?: CountStatus; name?: string }
        Relationships: [
          {
            foreignKeyName: 'count_sessions_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'count_sessions_row_id_fkey'
            columns: ['row_id']
            isOneToOne: false
            referencedRelation: 'warehouse_rows'
            referencedColumns: ['id']
          },
        ]
      }
      count_lines: {
        Row: {
          id: string
          session_id: string
          bin_id: string
          product_id: string
          lot_number: string | null
          expiry_date: string | null
          expected_qty: number
          counted_qty: number | null
          variance: number
          counted_by: string | null
          counted_at: string | null
          created_at: string
        }
        Insert: never // written by submit_count_line()
        Update: never
        Relationships: [
          {
            foreignKeyName: 'count_lines_session_id_fkey'
            columns: ['session_id']
            isOneToOne: false
            referencedRelation: 'count_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'count_lines_bin_id_fkey'
            columns: ['bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'count_lines_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      import_jobs: {
        Row: {
          id: string
          kind: ImportKind
          file_path: string
          file_name: string | null
          mode: 'partial' | 'strict'
          status: ImportStatus
          total_rows: number
          processed_rows: number
          success_rows: number
          error_rows: number
          errors: Json
          created_by: string | null
          started_at: string | null
          finished_at: string | null
        } & Timestamps
        Insert: {
          id?: string
          kind: ImportKind
          file_path: string
          file_name?: string | null
          mode?: 'partial' | 'strict'
          total_rows?: number
          created_by?: string | null
        }
        Update: { status?: ImportStatus }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: number
          actor_id: string | null
          action: string
          entity: string
          entity_id: string | null
          before: Json | null
          after: Json | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      vendors: {
        Row: {
          id: string
          code: string
          name: string
          contact: string | null
          email: string | null
          phone: string | null
          is_active: boolean
          created_by: string | null
        } & Timestamps
        Insert: { id?: string; code: string; name: string; contact?: string | null; email?: string | null; phone?: string | null; is_active?: boolean }
        Update: { code?: string; name?: string; contact?: string | null; email?: string | null; phone?: string | null; is_active?: boolean }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          id: string
          po_number: string
          vendor_id: string
          warehouse_id: string
          status: PoStatus
          expected_date: string | null
          note: string | null
          created_by: string | null
          closed_at: string | null
        } & Timestamps
        Insert: never // created by create_purchase_order()
        Update: { status?: PoStatus; expected_date?: string | null; note?: string | null }
        Relationships: [
          {
            foreignKeyName: 'purchase_orders_vendor_id_fkey'
            columns: ['vendor_id']
            isOneToOne: false
            referencedRelation: 'vendors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_orders_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
        ]
      }
      purchase_order_lines: {
        Row: {
          id: string
          po_id: string
          product_id: string
          ordered_qty: number
          received_qty: number
          accepted_qty: number
          unit_cost: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'purchase_order_lines_po_id_fkey'
            columns: ['po_id']
            isOneToOne: false
            referencedRelation: 'purchase_orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'purchase_order_lines_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      grns: {
        Row: {
          id: string
          grn_number: string
          po_id: string
          vendor_id: string
          warehouse_id: string
          status: GrnStatus
          vehicle_number: string
          driver_name: string
          driver_id: string | null
          arrived_at: string
          gate_entry_no: string | null
          seal_number: string | null
          seal_status: SealStatus
          challan_number: string | null
          invoice_number: string | null
          shipment_id: string | null
          received_by: string | null
          received_at: string
          verified_by: string | null
          verified_at: string | null
          completed_at: string | null
          has_discrepancy: boolean
          discrepancy_summary: Json
          discrepancy_resolved_by: string | null
          discrepancy_resolved_at: string | null
          discrepancy_note: string | null
          note: string | null
          cancelled_at: string | null
          cancel_reason: string | null
        } & Timestamps
        Insert: never // created by create_grn()
        Update: never
        Relationships: [
          {
            foreignKeyName: 'grns_po_id_fkey'
            columns: ['po_id']
            isOneToOne: false
            referencedRelation: 'purchase_orders'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grns_vendor_id_fkey'
            columns: ['vendor_id']
            isOneToOne: false
            referencedRelation: 'vendors'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grns_warehouse_id_fkey'
            columns: ['warehouse_id']
            isOneToOne: false
            referencedRelation: 'warehouses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grns_received_by_fkey'
            columns: ['received_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      grn_lines: {
        Row: {
          id: string
          grn_id: string
          po_line_id: string
          product_id: string
          ordered_qty: number
          previously_received_qty: number
          received_qty: number
          accepted_qty: number
          damaged_qty: number
          rejected_qty: number
          put_away_qty: number
          short_qty: number
          excess_qty: number
          lot_number: string | null
          expiry_date: string | null
          damage_note: string | null
          counted_by: string | null
          counted_at: string | null
        } & Timestamps
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'grn_lines_grn_id_fkey'
            columns: ['grn_id']
            isOneToOne: false
            referencedRelation: 'grns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grn_lines_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      grn_putaways: {
        Row: {
          id: string
          grn_id: string
          grn_line_id: string
          bin_id: string
          quantity: number
          movement_id: string | null
          performed_by: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'grn_putaways_grn_id_fkey'
            columns: ['grn_id']
            isOneToOne: false
            referencedRelation: 'grns'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'grn_putaways_bin_id_fkey'
            columns: ['bin_id']
            isOneToOne: false
            referencedRelation: 'bins'
            referencedColumns: ['id']
          },
        ]
      }
      grn_documents: {
        Row: {
          id: string
          grn_id: string
          kind: GrnDocumentKind
          storage_path: string
          file_name: string | null
          content_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          grn_id: string
          kind: GrnDocumentKind
          storage_path: string
          file_name?: string | null
          content_type?: string | null
          size_bytes?: number | null
          uploaded_by: string
        }
        Update: never
        Relationships: [
          {
            foreignKeyName: 'grn_documents_grn_id_fkey'
            columns: ['grn_id']
            isOneToOne: false
            referencedRelation: 'grns'
            referencedColumns: ['id']
          },
        ]
      }
      grn_events: {
        Row: {
          id: number
          grn_id: string
          actor_id: string | null
          event: string
          detail: Json
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: 'grn_events_grn_id_fkey'
            columns: ['grn_id']
            isOneToOne: false
            referencedRelation: 'grns'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_product_stock: {
        Row: {
          product_id: string
          sku: string
          name: string
          category_id: string | null
          category: string | null
          is_perishable: boolean
          reorder_point: number
          reorder_qty: number
          unit_cost: number
          is_active: boolean
          on_hand: number
          reserved: number
          available: number
          bin_count: number
          stock_value: number
        }
        Relationships: []
      }
      v_stock_by_location: {
        Row: {
          stock_level_id: string
          warehouse_code: string
          row_id: string
          row_code: string
          row_name: string | null
          row_sort: number
          bin_id: string
          bin_code: string
          location_code: string
          capacity: number | null
          bin_sort: number
          product_id: string
          sku: string
          product_name: string
          category: string | null
          is_perishable: boolean
          unit_cost: number
          lot_number: string | null
          expiry_date: string | null
          days_to_expiry: number | null
          quantity: number
          reserved_qty: number
          available: number
          status: StockStatus
          last_movement_at: string | null
        }
        Relationships: []
      }
      v_stock_by_row: {
        Row: {
          warehouse_code: string
          row_id: string
          row_code: string
          row_name: string | null
          sort_order: number
          bin_count: number
          occupied_bins: number
          sku_count: number
          units: number
          reserved: number
          stock_value: number
          capacity: number
          expiring_units: number
        }
        Relationships: []
      }
      v_bin_utilization: {
        Row: {
          bin_id: string
          location_code: string
          bin_code: string
          capacity: number | null
          sort_order: number
          is_active: boolean
          row_id: string
          row_code: string
          row_sort: number
          units: number
          sku_count: number
          fill_pct: number | null
        }
        Relationships: []
      }
      v_expiring_stock: {
        Row: Database['public']['Views']['v_stock_by_location']['Row'] & {
          bucket: 'expired' | '7d' | '30d' | '60d' | 'later'
        }
        Relationships: []
      }
      v_low_stock: {
        Row: Database['public']['Views']['v_product_stock']['Row']
        Relationships: []
      }
      v_movements: {
        Row: {
          id: string
          type: MovementType
          quantity: number
          lot_number: string | null
          expiry_date: string | null
          reference_type: string | null
          reference_id: string | null
          note: string | null
          created_at: string
          product_id: string
          sku: string
          product_name: string
          from_location: string | null
          to_location: string | null
          performed_by_name: string | null
          performed_by: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      auth_role: { Args: Record<string, never>; Returns: AppRole }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      search_products: {
        Args: { q: string; lim?: number }
        Returns: {
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
          locations: Json
          score: number
        }[]
      }
      get_product_locations: {
        Args: { p_product_id: string }
        Returns: {
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
        }[]
      }
      resolve_scan: { Args: { p_code: string }; Returns: Json }
      record_movement: {
        Args: {
          p_type: MovementType
          p_product_id: string
          p_qty: number
          p_from_bin_id?: string | null
          p_to_bin_id?: string | null
          p_lot_number?: string | null
          p_expiry_date?: string | null
          p_reference_type?: string | null
          p_reference_id?: string | null
          p_note?: string | null
          p_release_reserved?: number
        }
        Returns: Database['public']['Tables']['stock_movements']['Row']
      }
      create_order: { Args: { p_order: Json }; Returns: Json }
      allocate_order: { Args: { p_order_id: string }; Returns: undefined }
      get_pick_list: { Args: { p_order_id: string }; Returns: Json }
      start_picking: {
        Args: { p_order_id: string }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      verify_pick: {
        Args: { p_pick_task_id: string; p_scanned_bin_code: string; p_scanned_barcode?: string | null }
        Returns: Json
      }
      confirm_pick: {
        Args: { p_pick_task_id: string; p_qty?: number | null; p_override_reason?: string | null }
        Returns: Json
      }
      ship_order: {
        Args: { p_order_id: string }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      cancel_order: {
        Args: { p_order_id: string; p_reason?: string | null }
        Returns: Database['public']['Tables']['orders']['Row']
      }
      evaluate_alerts: { Args: { p_product_id?: string | null }; Returns: undefined }
      acknowledge_alert: {
        Args: { p_alert_id: string; p_action: string; p_snooze_until?: string | null }
        Returns: Database['public']['Tables']['alerts']['Row']
      }
      mark_alerts_read: { Args: { p_alert_ids: string[] }; Returns: number }
      unread_alert_count: { Args: Record<string, never>; Returns: number }
      start_count_session: {
        Args: { p_row_id: string; p_name?: string | null; p_blind?: boolean }
        Returns: Database['public']['Tables']['count_sessions']['Row']
      }
      submit_count_line: {
        Args: {
          p_session_id: string
          p_bin_id: string
          p_product_id: string
          p_counted_qty: number
          p_lot_number?: string | null
          p_expiry_date?: string | null
        }
        Returns: Database['public']['Tables']['count_lines']['Row']
      }
      approve_count_session: { Args: { p_session_id: string }; Returns: Json }
      bulk_upsert_products: { Args: { p_rows: Json; p_mode?: string }; Returns: Json }
      bulk_upsert_bins: { Args: { p_rows: Json; p_mode?: string }; Returns: Json }
      bulk_receive_stock: {
        Args: { p_rows: Json; p_mode?: string; p_reference_id?: string | null }
        Returns: Json
      }
      set_user_role: {
        Args: { p_user_id: string; p_role: AppRole }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      set_user_active: {
        Args: { p_user_id: string; p_active: boolean }
        Returns: Database['public']['Tables']['profiles']['Row']
      }
      dashboard_kpis: { Args: Record<string, never>; Returns: Json }
      export_rows: { Args: { p_view: string }; Returns: Json[] }
      create_vendor: {
        Args: { p_name: string; p_code?: string | null; p_contact?: string | null; p_email?: string | null; p_phone?: string | null }
        Returns: Database['public']['Tables']['vendors']['Row']
      }
      create_purchase_order: { Args: { p_po: Json }; Returns: Json }
      get_purchase_order: { Args: { p_po_id: string }; Returns: Json }
      close_purchase_order: {
        Args: { p_po_id: string }
        Returns: Database['public']['Tables']['purchase_orders']['Row']
      }
      get_grn: { Args: { p_grn_id: string }; Returns: Json }
      create_grn: { Args: { p: Json }; Returns: Json }
      record_grn_line: {
        Args: {
          p_grn_id: string
          p_code: string
          p_received: number
          p_accepted: number
          p_damaged?: number
          p_rejected?: number
          p_lot_number?: string | null
          p_expiry_date?: string | null
          p_damage_note?: string | null
        }
        Returns: Json
      }
      verify_grn: { Args: { p_grn_id: string }; Returns: Json }
      putaway_grn_line: { Args: { p_grn_line_id: string; p_bin_id: string; p_qty: number }; Returns: Json }
      resolve_grn_discrepancy: { Args: { p_grn_id: string; p_note: string }; Returns: Json }
      cancel_grn: { Args: { p_grn_id: string; p_reason?: string | null }; Returns: Json }
      grn_dashboard: { Args: Record<string, never>; Returns: Json }
    }
    Enums: {
      app_role: AppRole
      movement_type: MovementType
      stock_status: StockStatus
      order_status: OrderStatus
      pick_status: PickStatus
      alert_type: AlertType
      alert_severity: AlertSeverity
      alert_status: AlertStatus
      import_kind: ImportKind
      import_status: ImportStatus
      count_status: CountStatus
      po_status: PoStatus
      grn_status: GrnStatus
      seal_status: SealStatus
      grn_document_kind: GrnDocumentKind
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Views<T extends keyof Database['public']['Views']> =
  Database['public']['Views'][T]['Row']
export type RpcReturns<T extends keyof Database['public']['Functions']> =
  Database['public']['Functions'][T]['Returns']
