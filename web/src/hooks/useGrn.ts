import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import { useAuth } from '@/stores/auth'
import type { GrnDashboard, GrnDetail, PoDetail, RecordLineResult, Vendor } from '@/types/app'
import type { GrnDocumentKind, GrnStatus, Json, PoStatus, SealStatus, Tables } from '@/types/database'

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export function useGrnDashboard() {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  return useQuery({
    queryKey: qk.grnDashboard(),
    enabled: isAdmin,
    refetchInterval: 30_000,
    queryFn: async (): Promise<GrnDashboard | null> => {
      const { data, error } = await supabase.rpc('grn_dashboard')
      if (error) throw error
      return data as unknown as GrnDashboard | null
    },
  })
}

// ---------------------------------------------------------------------------
// GRN list + detail
// ---------------------------------------------------------------------------
export type GrnListFilters = {
  status?: GrnStatus | 'all' | 'open' | 'discrepancy'
  search?: string
  poId?: string
  limit?: number
}

export type GrnListRow = Tables<'grns'> & {
  vendor: { name: string } | null
  po: { po_number: string } | null
  receiver: { full_name: string | null } | null
}

export function useGrns(filters: GrnListFilters = {}) {
  return useQuery({
    queryKey: qk.grns(filters),
    queryFn: async (): Promise<GrnListRow[]> => {
      // grns has three FKs to profiles, so the receiver embed names its key.
      let query = supabase
        .from('grns')
        .select(
          '*, vendor:vendors(name), po:purchase_orders(po_number), receiver:profiles!grns_received_by_fkey(full_name)',
        )
        .order('created_at', { ascending: false })
        .limit(filters.limit ?? 100)

      if (filters.status === 'open') query = query.in('status', ['arrived', 'verifying', 'verified', 'put_away'])
      else if (filters.status === 'discrepancy') {
        query = query.eq('has_discrepancy', true).is('discrepancy_resolved_at', null).neq('status', 'cancelled')
      } else if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)

      if (filters.poId) query = query.eq('po_id', filters.poId)
      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        query = query.or(`grn_number.ilike.${term},vehicle_number.ilike.${term},driver_name.ilike.${term},invoice_number.ilike.${term}`)
      }

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as GrnListRow[]
    },
  })
}

export function useGrn(grnId: string | undefined) {
  return useQuery({
    queryKey: qk.grn(grnId ?? 'none'),
    enabled: !!grnId,
    queryFn: async (): Promise<GrnDetail | null> => {
      const { data, error } = await supabase.rpc('get_grn', { p_grn_id: grnId! })
      if (error) throw error
      const detail = data as unknown as GrnDetail | null
      return detail?.grn ? detail : null
    },
  })
}

// ---------------------------------------------------------------------------
// The receiving flow
// ---------------------------------------------------------------------------
export type NewGrnInput = {
  po_id: string
  vehicle_number: string
  driver_name: string
  driver_id?: string
  arrived_at?: string
  gate_entry_no?: string
  seal_number?: string
  seal_status: SealStatus
  challan_number?: string
  invoice_number?: string
  shipment_id?: string
  note?: string
}

/** Every write below seeds the detail cache with the RPC's own response,
 *  so the page never shows a stale step after an action. */
function useGrnWrite<TVars>(run: (vars: TVars) => Promise<GrnDetail>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: run,
    onSuccess: (detail) => {
      queryClient.setQueryData(qk.grn(detail.grn.id), detail)
      void queryClient.invalidateQueries({ queryKey: ['grns'] })
      void queryClient.invalidateQueries({ queryKey: qk.grnDashboard() })
      void queryClient.invalidateQueries({ queryKey: qk.purchaseOrder(detail.po.id) })
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      void queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })
}

/** Truck arrival + shipment verification → a new GRN in `arrived`. */
export function useCreateGrn() {
  return useGrnWrite(async (input: NewGrnInput) => {
    const { data, error } = await supabase.rpc('create_grn', { p: input as unknown as Json })
    if (error) throw error
    return data as unknown as GrnDetail
  })
}

export type RecordLineInput = {
  grnId: string
  code: string
  received: number
  accepted: number
  damaged: number
  rejected: number
  lotNumber?: string | null
  expiryDate?: string | null
  damageNote?: string | null
}

/** One SKU's count. A wrong SKU comes back as `{ ok: false }`, not a throw. */
export function useRecordGrnLine() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: RecordLineInput): Promise<RecordLineResult> => {
      const { data, error } = await supabase.rpc('record_grn_line', {
        p_grn_id: input.grnId,
        p_code: input.code,
        p_received: input.received,
        p_accepted: input.accepted,
        p_damaged: input.damaged,
        p_rejected: input.rejected,
        p_lot_number: input.lotNumber ?? null,
        p_expiry_date: input.expiryDate ?? null,
        p_damage_note: input.damageNote ?? null,
      })
      if (error) throw error
      return data as unknown as RecordLineResult
    },
    onSuccess: (_result, input) => {
      void queryClient.invalidateQueries({ queryKey: qk.grn(input.grnId) })
      void queryClient.invalidateQueries({ queryKey: ['grns'] })
    },
  })
}

export function useVerifyGrn() {
  return useGrnWrite(async (grnId: string) => {
    const { data, error } = await supabase.rpc('verify_grn', { p_grn_id: grnId })
    if (error) throw error
    return data as unknown as GrnDetail
  })
}

export function usePutawayGrnLine() {
  const queryClient = useQueryClient()
  const write = useGrnWrite(
    async ({ lineId, binId, quantity }: { lineId: string; binId: string; quantity: number }) => {
      const { data, error } = await supabase.rpc('putaway_grn_line', {
        p_grn_line_id: lineId,
        p_bin_id: binId,
        p_qty: quantity,
      })
      if (error) throw error
      // Put-away is the moment inventory changes; everything stock-related is stale.
      void queryClient.invalidateQueries({ queryKey: ['product'] })
      void queryClient.invalidateQueries({ queryKey: ['bin'] })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
      void queryClient.invalidateQueries({ queryKey: ['movements'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      return data as unknown as GrnDetail
    },
  )
  return write
}

export function useResolveGrnDiscrepancy() {
  return useGrnWrite(async ({ grnId, note }: { grnId: string; note: string }) => {
    const { data, error } = await supabase.rpc('resolve_grn_discrepancy', { p_grn_id: grnId, p_note: note })
    if (error) throw error
    return data as unknown as GrnDetail
  })
}

export function useCancelGrn() {
  return useGrnWrite(async ({ grnId, reason }: { grnId: string; reason: string }) => {
    const { data, error } = await supabase.rpc('cancel_grn', { p_grn_id: grnId, p_reason: reason })
    if (error) throw error
    return data as unknown as GrnDetail
  })
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
const DOCUMENT_BUCKET = 'grn-documents'

export function useUploadGrnDocument() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ grnId, kind, file }: { grnId: string; kind: GrnDocumentKind; file: File }) => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('UNAUTHENTICATED:sign in again')
      if (file.size > 20 * 1024 * 1024) throw new Error('INVALID:files must be under 20 MB')

      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, '_')
      const path = `${grnId}/${kind}-${Date.now()}-${safeName}`

      const upload = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
      if (upload.error) throw upload.error

      const { error } = await supabase.from('grn_documents').insert({
        grn_id: grnId,
        kind,
        storage_path: path,
        file_name: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
        uploaded_by: auth.user.id,
      })
      if (error) throw error
      return path
    },
    onSuccess: (_path, { grnId }) => {
      void queryClient.invalidateQueries({ queryKey: qk.grn(grnId) })
    },
  })
}

/** The bucket is private; viewing a document means minting a short-lived URL. */
export async function getGrnDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(storagePath, 300)
  if (error) throw error
  return data.signedUrl
}

// ---------------------------------------------------------------------------
// Purchase orders & vendors (admin)
// ---------------------------------------------------------------------------
export function useVendors() {
  return useQuery({
    queryKey: qk.vendors(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Vendor[]> => {
      const { data, error } = await supabase.from('vendors').select('*').eq('is_active', true).order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export type PoListRow = Tables<'purchase_orders'> & {
  vendor: { name: string } | null
  lines: { ordered_qty: number; received_qty: number }[]
  grns: { id: string; status: GrnStatus }[]
}

export function usePurchaseOrders(filters: { status?: PoStatus | 'all' | 'open'; search?: string } = {}) {
  return useQuery({
    queryKey: qk.purchaseOrders(filters),
    queryFn: async (): Promise<PoListRow[]> => {
      let query = supabase
        .from('purchase_orders')
        .select('*, vendor:vendors(name), lines:purchase_order_lines(ordered_qty, received_qty), grns(id, status)')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filters.status === 'open') query = query.in('status', ['open', 'partially_received'])
      else if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
      if (filters.search?.trim()) query = query.ilike('po_number', `%${filters.search.trim()}%`)

      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as PoListRow[]
    },
  })
}

export function usePurchaseOrder(poId: string | undefined) {
  return useQuery({
    queryKey: qk.purchaseOrder(poId ?? 'none'),
    enabled: !!poId,
    queryFn: async (): Promise<PoDetail | null> => {
      const { data, error } = await supabase.rpc('get_purchase_order', { p_po_id: poId! })
      if (error) throw error
      const detail = data as unknown as PoDetail | null
      return detail?.po ? detail : null
    },
  })
}

export type NewPurchaseOrderInput = {
  po_number?: string | null
  vendor_id?: string | null
  vendor_name?: string | null
  warehouse_id?: string | null
  expected_date?: string | null
  note?: string | null
  lines: { product_id?: string; sku?: string; quantity: number; unit_cost?: number }[]
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewPurchaseOrderInput): Promise<PoDetail> => {
      const { data, error } = await supabase.rpc('create_purchase_order', { p_po: input as unknown as Json })
      if (error) throw error
      return data as unknown as PoDetail
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(qk.purchaseOrder(detail.po.id), detail)
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      void queryClient.invalidateQueries({ queryKey: qk.vendors() })
      void queryClient.invalidateQueries({ queryKey: qk.grnDashboard() })
    },
  })
}

export function useClosePurchaseOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (poId: string) => {
      const { data, error } = await supabase.rpc('close_purchase_order', { p_po_id: poId })
      if (error) throw error
      return data
    },
    onSuccess: (_d, poId) => {
      void queryClient.invalidateQueries({ queryKey: qk.purchaseOrder(poId) })
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      void queryClient.invalidateQueries({ queryKey: qk.grnDashboard() })
    },
  })
}
