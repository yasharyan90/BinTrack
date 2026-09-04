import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, PackagePlus, Save, ScanLine, X } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SkeletonRows } from '@/components/ui/skeleton'
import {
  isFieldTaken,
  useCategories,
  useProduct,
  useSaveProduct,
  type ProductInput,
} from '@/hooks/useProducts'
import { useAppToast } from '@/hooks/useAppToast'
import { useUi } from '@/stores/ui'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

type FormState = ProductInput & { category: string }

const EMPTY: FormState = {
  sku: '',
  name: '',
  description: '',
  category_id: null,
  category: 'none',
  barcode: '',
  unit: 'pcs',
  unit_cost: 0,
  reorder_point: 10,
  reorder_qty: 50,
  is_perishable: false,
  shelf_life_days: null,
  is_active: true,
}

/**
 * Create or edit a product (App Flow §5.3). SKU and barcode uniqueness are
 * checked as you type; the database enforces it regardless.
 */
export default function ProductForm() {
  const { productId } = useParams<{ productId: string }>()
  const navigate = useNavigate()
  const isEdit = !!productId

  const { data: existing, isLoading } = useProduct(productId)
  const { data: categories = [] } = useCategories()
  const save = useSaveProduct()
  const { showSuccess, showError } = useAppToast()
  const openScanner = useUi((s) => s.openScanner)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [skuTaken, setSkuTaken] = useState(false)
  const [barcodeTaken, setBarcodeTaken] = useState(false)

  const debouncedSku = useDebouncedValue(form.sku, 400)
  const debouncedBarcode = useDebouncedValue(form.barcode ?? '', 400)

  useEffect(() => {
    if (!existing) return
    setForm({
      sku: existing.sku,
      name: existing.name,
      description: existing.description ?? '',
      category_id: existing.category_id,
      category: existing.category_id ?? 'none',
      barcode: existing.barcode ?? '',
      unit: existing.unit,
      unit_cost: existing.unit_cost,
      reorder_point: existing.reorder_point,
      reorder_qty: existing.reorder_qty,
      is_perishable: existing.is_perishable,
      shelf_life_days: existing.shelf_life_days,
      is_active: existing.is_active,
    })
  }, [existing])

  useEffect(() => {
    if (!debouncedSku.trim()) {
      setSkuTaken(false)
      return
    }
    void isFieldTaken('sku', debouncedSku, productId).then(setSkuTaken)
  }, [debouncedSku, productId])

  useEffect(() => {
    if (!debouncedBarcode.trim()) {
      setBarcodeTaken(false)
      return
    }
    void isFieldTaken('barcode', debouncedBarcode, productId).then(setBarcodeTaken)
  }, [debouncedBarcode, productId])

  if (isEdit && isLoading) return <SkeletonRows rows={8} />

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const perishableWithoutShelfLife = form.is_perishable && !form.shelf_life_days
  const canSave =
    form.sku.trim().length > 0 &&
    form.name.trim().length > 0 &&
    !skuTaken &&
    !barcodeTaken &&
    !perishableWithoutShelfLife

  const submit = async (thenReceive = false) => {
    try {
      const { category: _category, ...values } = form
      const product = await save.mutateAsync({
        id: productId,
        values: {
          ...values,
          sku: values.sku.trim().toUpperCase(),
          name: values.name.trim(),
          description: values.description?.trim() || null,
          barcode: values.barcode?.trim() || null,
          shelf_life_days: values.is_perishable ? values.shelf_life_days : null,
        },
      })
      showSuccess(isEdit ? 'Product updated' : `${product.sku} created`)
      navigate(thenReceive ? `/receive?product=${product.id}` : '/admin/products')
    } catch (error) {
      showError(error, 'Could not save the product')
    }
  }

  return (
    <>
      <PageHeader
        title={isEdit ? `Edit ${form.sku || 'product'}` : 'Add a product'}
        description={
          isEdit
            ? 'Changes are recorded in the audit log.'
            : 'Give it a SKU, a barcode to scan, and a reorder point.'
        }
        actions={
          <Button asChild variant="ghost">
            <Link to="/admin/products">
              <X />
              Cancel
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4 p-4 pt-4">
            <h2 className="text-h3">Identity</h2>

            <Field
              label="SKU"
              htmlFor="sku"
              required
              error={skuTaken ? 'Another product already uses this SKU.' : undefined}
              hint={!skuTaken && form.sku ? 'Available.' : 'Uppercase; unique across the catalogue.'}
            >
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => set('sku', e.target.value.toUpperCase())}
                placeholder="MUG-0042"
                className="font-mono"
                autoFocus={!isEdit}
              />
            </Field>

            <Field label="Name" htmlFor="name" required>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Blue Ceramic Mug 350ml"
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                rows={2}
                value={form.description ?? ''}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <Field label="Category" htmlFor="category">
              <Select
                value={form.category}
                onValueChange={(v) => {
                  set('category', v)
                  set('category_id', v === 'none' ? null : v)
                }}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Uncategorised" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Barcode"
              htmlFor="barcode"
              error={barcodeTaken ? 'Another product already uses this barcode.' : undefined}
              hint="EAN-13, UPC or Code 128. Scanning this verifies picks."
            >
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  value={form.barcode ?? ''}
                  onChange={(e) => set('barcode', e.target.value)}
                  placeholder="8901234567890"
                  className="font-mono"
                />
                <Button type="button" variant="secondary" size="icon" onClick={openScanner} aria-label="Scan to fill">
                  <ScanLine />
                </Button>
              </div>
            </Field>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-4 pt-4">
              <h2 className="text-h3">Stock rules</h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Unit" htmlFor="unit">
                  <Input
                    id="unit"
                    value={form.unit}
                    onChange={(e) => set('unit', e.target.value)}
                    placeholder="pcs"
                  />
                </Field>

                <Field label="Unit cost" htmlFor="unit-cost">
                  <Input
                    id="unit-cost"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={form.unit_cost}
                    onChange={(e) => set('unit_cost', Number(e.target.value) || 0)}
                    className="tabular"
                  />
                </Field>

                <Field
                  label="Reorder point"
                  htmlFor="reorder-point"
                  hint="Low-stock alerts fire at or below this."
                >
                  <Input
                    id="reorder-point"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.reorder_point}
                    onChange={(e) => set('reorder_point', Number(e.target.value) || 0)}
                    className="tabular"
                  />
                </Field>

                <Field label="Reorder quantity" htmlFor="reorder-qty" hint="Suggested on the alert.">
                  <Input
                    id="reorder-qty"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={form.reorder_qty}
                    onChange={(e) => set('reorder_qty', Number(e.target.value) || 0)}
                    className="tabular"
                  />
                </Field>
              </div>

              <label className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <span className="text-sm">
                  Perishable
                  <span className="block text-small text-muted-foreground">
                    Receiving will require an expiry date, and picking will be FEFO.
                  </span>
                </span>
                <Switch
                  checked={form.is_perishable}
                  onCheckedChange={(checked) => {
                    set('is_perishable', checked)
                    if (!checked) set('shelf_life_days', null)
                    else if (!form.shelf_life_days) set('shelf_life_days', 30)
                  }}
                />
              </label>

              {form.is_perishable && (
                <Field
                  label="Shelf life (days)"
                  htmlFor="shelf-life"
                  required
                  error={perishableWithoutShelfLife ? 'Perishable products need a shelf life.' : undefined}
                  hint="Used to pre-fill the expiry date on receiving."
                >
                  <Input
                    id="shelf-life"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.shelf_life_days ?? ''}
                    onChange={(e) => set('shelf_life_days', Number(e.target.value) || null)}
                    className="tabular"
                  />
                </Field>
              )}

              {isEdit && (
                <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                  <span className="text-sm">
                    Active
                    <span className="block text-small text-muted-foreground">
                      Inactive products cannot be ordered or received.
                    </span>
                  </span>
                  <Switch
                    checked={form.is_active ?? true}
                    onCheckedChange={(checked) => set('is_active', checked)}
                  />
                </label>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-wrap gap-2 p-4 pt-4">
              <Button disabled={!canSave} loading={save.isPending} onClick={() => void submit()}>
                <Save />
                {isEdit ? 'Save changes' : 'Create product'}
              </Button>
              {!isEdit && (
                <Button
                  variant="secondary"
                  disabled={!canSave}
                  loading={save.isPending}
                  onClick={() => void submit(true)}
                >
                  <PackagePlus />
                  Save & receive stock
                </Button>
              )}
              {canSave && (
                <p className="flex w-full items-center gap-1.5 text-small text-success">
                  <Check className="size-3.5" aria-hidden />
                  Ready to save.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
