import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Field } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { useRecordMovement } from '@/hooks/useMovements'
import { useAppToast } from '@/hooks/useAppToast'
import type { ProductLocation } from '@/types/app'

/**
 * Admin-only stock correction (PRD §5.7). An adjustment never edits a quantity
 * directly — it writes a movement, so the audit trail explains every unit.
 */
export function AdjustStockDialog({
  product,
  location,
  open,
  onOpenChange,
}: {
  product: { id: string; sku: string; name: string }
  location: ProductLocation
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const record = useRecordMovement()
  const { showSuccess, showError } = useAppToast()

  const [direction, setDirection] = useState<'decrease' | 'increase'>('decrease')
  const [quantity, setQuantity] = useState(1)
  const [reason, setReason] = useState('')

  const maxDecrease = location.available
  const tooMany = direction === 'decrease' && quantity > maxDecrease

  const submit = async () => {
    try {
      await record.mutateAsync({
        type: 'adjustment',
        productId: product.id,
        quantity,
        fromBinId: direction === 'decrease' ? location.bin_id : null,
        toBinId: direction === 'increase' ? location.bin_id : null,
        lotNumber: location.lot_number,
        expiryDate: location.expiry_date,
        note: reason.trim(),
      })
      showSuccess(
        `Adjusted ${direction === 'decrease' ? '−' : '+'}${quantity} × ${product.sku}`,
        `In ${location.location_code}.`,
      )
      onOpenChange(false)
      setQuantity(1)
      setReason('')
    } catch (error) {
      showError(error, 'Adjustment failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            This writes an adjustment movement — the original record is never changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <LocationBadge code={location.location_code} size="md" />
            <span className="tabular text-sm">
              {location.quantity} on hand · {location.available} available
            </span>
          </div>
          <p className="text-sm">
            {product.name} <span className="text-muted-foreground">({product.sku})</span>
          </p>
          <div className="flex items-center gap-2 text-small text-muted-foreground">
            {location.lot_number && <span>lot {location.lot_number}</span>}
            {location.expiry_date && (
              <ExpiryChip date={location.expiry_date} days={location.days_to_expiry} />
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Direction">
            <Select
              value={direction}
              onValueChange={(v) => setDirection(v as 'decrease' | 'increase')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="decrease">Decrease (write-off, damage, loss)</SelectItem>
                <SelectItem value="increase">Increase (found stock, correction)</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Quantity"
            htmlFor="adjust-qty"
            required
            error={tooMany ? `Only ${maxDecrease} available to remove.` : undefined}
          >
            <Input
              id="adjust-qty"
              type="number"
              inputMode="numeric"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
          </Field>
        </div>

        <Field label="Reason" htmlFor="adjust-reason" required hint="Recorded on the movement.">
          <Textarea
            id="adjust-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Damaged in handling / cycle count correction / expired write-off"
          />
        </Field>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={direction === 'decrease' ? 'destructive' : 'primary'}
            loading={record.isPending}
            disabled={tooMany || reason.trim().length < 3}
            onClick={() => void submit()}
          >
            {direction === 'decrease' ? 'Remove' : 'Add'} {quantity}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
