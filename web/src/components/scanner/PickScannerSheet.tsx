import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Minus, Plus, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/input'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { ExpiryChip } from '@/components/stock/ExpiryChip'
import { CameraView } from './CameraView'
import { ScanStepper, type ScanStep } from './ScanStepper'
import { feedback, listenForHidScanner } from '@/lib/scanner'
import { useConfirmPick, useVerifyPick } from '@/hooks/useOrders'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import type { PickTask } from '@/types/app'

type Mismatch = {
  reason: 'bin' | 'product' | 'expired'
  expected: string
  scanned: string
  count: number
}

const MISMATCH_COPY: Record<Mismatch['reason'], string> = {
  bin: 'Wrong bin',
  product: 'Wrong product',
  expired: 'Lot expired — pick blocked',
}

/**
 * Scan-verified picking (App Flow §4.3). Bin, then product, then quantity.
 * A mismatch blocks and says exactly what was expected versus what was scanned;
 * only an admin can override, and only with a reason that is logged.
 */
export function PickScannerSheet({
  task,
  orderId,
  open,
  onOpenChange,
  onPicked,
}: {
  task: PickTask | null
  orderId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPicked?: (pickedTaskId: string) => void
}) {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  const verify = useVerifyPick()
  const confirm = useConfirmPick()
  const { showError, showSuccess, showInfo } = useAppToast()

  const [step, setStep] = useState<ScanStep>('bin')
  const [binCode, setBinCode] = useState('')
  const [quantity, setQuantity] = useState(0)
  const [mismatch, setMismatch] = useState<Mismatch | null>(null)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const [overrideMode, setOverrideMode] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const busy = useRef(false)

  // Reset whenever a different task opens the sheet.
  useEffect(() => {
    if (!open || !task) return
    const alreadyVerified = task.status === 'verified'
    setStep(alreadyVerified ? 'quantity' : task.bin_verified_at ? 'product' : 'bin')
    setBinCode(task.bin_verified_at ? (task.location_code ?? '') : '')
    setQuantity(task.quantity)
    setMismatch(null)
    setFlash(null)
    setOverrideMode(false)
    setOverrideReason('')
    busy.current = false
  }, [open, task])

  const pulse = (kind: 'success' | 'error') => {
    feedback(kind)
    setFlash(kind)
    setTimeout(() => setFlash(null), 320)
  }

  const handleDecode = useCallback(
    async (code: string) => {
      if (!task || busy.current || step === 'quantity') return
      busy.current = true
      try {
        const trimmed = code.trim()
        const result = await verify.mutateAsync({
          taskId: task.id,
          binCode: step === 'bin' ? trimmed : binCode,
          barcode: step === 'product' ? trimmed : null,
        })

        if (!result.ok) {
          pulse('error')
          setMismatch({
            reason: result.reason,
            expected:
              result.reason === 'bin'
                ? result.expected.location_code
                : result.reason === 'product'
                  ? (result.expected.barcode ?? result.expected.sku)
                  : 'an unexpired lot',
            scanned: (result.reason === 'bin' ? result.scanned.bin : result.scanned.barcode) ?? trimmed,
            count: result.mismatch_count,
          })
          // A bin mismatch restarts the sequence — the server cleared it too.
          setStep('bin')
          setBinCode('')
          return
        }

        setMismatch(null)
        pulse('success')

        if (result.step === 'product') {
          setBinCode(trimmed)
          setStep('product')
        } else {
          setQuantity(result.quantity)
          setStep('quantity')
        }
      } catch (error) {
        showError(error, 'Scan failed')
      } finally {
        busy.current = false
      }
    },
    [binCode, showError, step, task, verify],
  )

  // A HID scanner types into the window, not into a field.
  useEffect(() => {
    if (!open || step === 'quantity') return
    return listenForHidScanner((code) => void handleDecode(code))
  }, [handleDecode, open, step])

  if (!task) return null

  const submitPick = async () => {
    try {
      const result = await confirm.mutateAsync({
        taskId: task.id,
        orderId,
        quantity,
        overrideReason: overrideMode ? overrideReason.trim() : undefined,
      })
      if ('queued' in result) {
        showInfo('Saved offline', 'This pick will sync when you are back online.')
      } else {
        showSuccess(
          `Picked ${quantity} × ${task.sku}`,
          quantity < task.quantity ? `${task.quantity - quantity} left short.` : undefined,
        )
      }
      feedback('success')
      onOpenChange(false)
      onPicked?.(task.id)
    } catch (error) {
      showError(error, 'Could not confirm the pick')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-w-lg gap-4 sm:rounded-lg">
        <SheetHeader>
          <SheetTitle>Verify pick</SheetTitle>
          <ScanStepper current={step} />
        </SheetHeader>

        {/* What to pick — always visible, so the picker never has to remember. */}
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <LocationBadge code={task.location_code} size="lg" />
            <span className="text-right">
              <span className="kpi-value">{task.quantity}</span>
              <span className="block text-small text-muted-foreground">to pick</span>
            </span>
          </div>
          <p className="text-sm font-medium">{task.name}</p>
          <p className="text-small text-muted-foreground">
            {task.sku}
            {task.barcode ? ` · ${task.barcode}` : ''}
            {task.lot_number ? ` · lot ${task.lot_number}` : ''}
          </p>
          {task.expiry_date && <ExpiryChip date={task.expiry_date} days={task.days_to_expiry} />}
        </div>

        <div aria-live="polite" className="sr-only">
          {step === 'bin' && 'Scan the bin'}
          {step === 'product' && 'Bin verified. Scan the product'}
          {step === 'quantity' && 'Product verified. Confirm the quantity'}
          {mismatch && `${MISMATCH_COPY[mismatch.reason]}. Expected ${mismatch.expected}`}
        </div>

        {mismatch && (
          <div className="space-y-1 rounded-lg bg-destructive/12 p-3 text-destructive" role="alert">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4" aria-hidden />
              {MISMATCH_COPY[mismatch.reason]}
            </p>
            {mismatch.reason !== 'expired' && (
              <p className="text-sm">
                Expected <span className="location-code">{mismatch.expected}</span>, scanned{' '}
                <span className="location-code">{mismatch.scanned}</span>
              </p>
            )}
            <p className="text-small opacity-80">
              {mismatch.count} {mismatch.count === 1 ? 'mismatch' : 'mismatches'} on this task
              {mismatch.count >= 2 ? ' — admins have been alerted.' : '.'}
            </p>
          </div>
        )}

        {step !== 'quantity' ? (
          <>
            <CameraView
              onDecode={(code) => void handleDecode(code)}
              flash={flash}
              hint={
                step === 'bin'
                  ? `Expecting ${task.location_code}`
                  : `Expecting ${task.barcode ?? task.sku}`
              }
            />

            {isAdmin && (
              <div className="space-y-2 border-t border-border pt-3">
                {overrideMode ? (
                  <>
                    <Textarea
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder="Why is this pick being confirmed without a scan?"
                      aria-label="Override reason"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={overrideReason.trim().length < 5}
                        loading={confirm.isPending}
                        onClick={() => void submitPick()}
                      >
                        Confirm without scan
                      </Button>
                      <Button variant="secondary" onClick={() => setOverrideMode(false)}>
                        Cancel
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setOverrideMode(true)}>
                    <ShieldAlert />
                    Override without scan (logged)
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <p className="flex items-center gap-1.5 rounded-md bg-success/12 px-3 py-2 text-sm text-success">
              <Check className="size-4" aria-hidden />
              Bin and product verified.
            </p>

            <div className="space-y-1.5">
              <label htmlFor="pick-qty" className="label-small">
                Quantity picked
              </label>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                >
                  <Minus />
                </Button>
                <Input
                  id="pick-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={task.quantity}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.min(task.quantity, Math.max(1, Number(e.target.value) || 1)))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitPick()
                  }}
                  className="text-center text-lg tabular"
                />
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity((q) => Math.min(task.quantity, q + 1))}
                  aria-label="Increase quantity"
                >
                  <Plus />
                </Button>
              </div>
              {quantity < task.quantity && (
                <p className="text-small text-warning">
                  {task.quantity - quantity} of {task.quantity} will be recorded as short.
                </p>
              )}
            </div>

            <Button
              className="w-full"
              size="lg"
              loading={confirm.isPending}
              onClick={() => void submitPick()}
            >
              <Check />
              Confirm pick
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
