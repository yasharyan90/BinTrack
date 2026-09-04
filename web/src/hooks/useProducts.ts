import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { qk } from '@/lib/queryClient'
import type {
  Category,
  Product,
  ProductLocation,
  SearchResult,
  ScanResolution,
} from '@/types/app'
import type { Views } from '@/types/database'

/**
 * Instant search (PRD §5.4). The RPC ranks exact barcode, then SKU prefix, then
 * a typo-tolerant token match, then trigram similarity — so "bleu mug" finds
 * the Blue Ceramic Mug. Debouncing happens in the search box; this hook only
 * caches and cancels.
 */
export function useSearchProducts(query: string, limit = 20, enabled = true) {
  const trimmed = query.trim()
  return useQuery({
    queryKey: qk.search(`${trimmed}|${limit}`),
    enabled: enabled && trimmed.length >= 2,
    staleTime: 15_000,
    placeholderData: (previous) => previous, // keep old rows while typing
    queryFn: async (): Promise<SearchResult[]> => {
      const { data, error } = await supabase.rpc('search_products', { q: trimmed, lim: limit })
      if (error) throw error
      return (data ?? []) as unknown as SearchResult[]
    },
  })
}

export function useProduct(productId: string | undefined) {
  return useQuery({
    queryKey: qk.product(productId ?? 'none'),
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, category:categories(id, name)')
        .eq('id', productId!)
        .single()
      if (error) throw error
      return data as Product & { category: Category | null }
    },
  })
}

export function useProductLocations(productId: string | undefined) {
  return useQuery({
    queryKey: qk.productLocations(productId ?? 'none'),
    enabled: !!productId,
    queryFn: async (): Promise<ProductLocation[]> => {
      const { data, error } = await supabase.rpc('get_product_locations', {
        p_product_id: productId!,
      })
      if (error) throw error
      return (data ?? []) as unknown as ProductLocation[]
    },
  })
}

export function useProductMovements(productId: string | undefined, limit = 50) {
  return useQuery({
    queryKey: qk.productMovements(productId ?? 'none'),
    enabled: !!productId,
    queryFn: async (): Promise<Views<'v_movements'>[]> => {
      const { data, error } = await supabase
        .from('v_movements')
        .select('*')
        .eq('product_id', productId!)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
  })
}

export type ProductListFilters = {
  search?: string
  categoryId?: string | 'all'
  status?: 'active' | 'inactive' | 'all'
  lowStockOnly?: boolean
  page?: number
  pageSize?: number
}

/** Server-side pagination — the catalogue is 800 SKUs today, more tomorrow. */
export function useProductList(filters: ProductListFilters) {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 25

  return useQuery({
    queryKey: qk.products(filters),
    queryFn: async () => {
      let query = supabase
        .from('v_product_stock')
        .select('*', { count: 'exact' })
        .order('sku')
        .range(page * pageSize, page * pageSize + pageSize - 1)

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`
        query = query.or(`sku.ilike.${term},name.ilike.${term}`)
      }
      if (filters.categoryId && filters.categoryId !== 'all') {
        query = query.eq('category_id', filters.categoryId)
      }
      if (filters.status === 'active') query = query.eq('is_active', true)
      if (filters.status === 'inactive') query = query.eq('is_active', false)
      if (filters.lowStockOnly) query = query.lte('available', 0)

      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as Views<'v_product_stock'>[], total: count ?? 0 }
    },
  })
}

export function useCategories() {
  return useQuery({
    queryKey: qk.categories(),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('*').order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

export type ProductInput = {
  sku: string
  name: string
  description?: string | null
  category_id?: string | null
  barcode?: string | null
  unit: string
  unit_cost: number
  reorder_point: number
  reorder_qty: number
  is_perishable: boolean
  shelf_life_days?: number | null
  image_url?: string | null
  is_active?: boolean
}

export function useSaveProduct() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: ProductInput }) => {
      if (id) {
        const { data, error } = await supabase
          .from('products')
          .update(values)
          .eq('id', id)
          .select()
          .single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase.from('products').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (product) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: qk.product(product.id) })
      void queryClient.invalidateQueries({ queryKey: ['search'] })
    },
  })
}

export function useSetProductActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['product'] })
    },
  })
}

/** Live SKU/barcode uniqueness check for the product form. */
export async function isFieldTaken(
  field: 'sku' | 'barcode',
  value: string,
  excludeId?: string,
): Promise<boolean> {
  if (!value.trim()) return false
  let query = supabase.from('products').select('id').eq(field, value.trim()).limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return (data ?? []).length > 0
}

/** Scanner hub: turn a decoded string into a bin or a product. */
export function useResolveScan() {
  return useMutation({
    mutationFn: async (code: string): Promise<ScanResolution> => {
      const { data, error } = await supabase.rpc('resolve_scan', { p_code: code })
      if (error) throw error
      return data as unknown as ScanResolution
    },
  })
}
