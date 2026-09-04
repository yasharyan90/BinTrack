import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Boxes, HelpCircle, PackagePlus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { CameraView } from './CameraView'
import { useResolveScan } from '@/hooks/useProducts'
import { useAppToast } from '@/hooks/useAppToast'
import { feedback, listenForHidScanner } from '@/lib/scanner'
import { useUi } from '@/stores/ui'
import type { ScanResolution } from '@/types/app'

/**
 * The scanner hub reachable from anywhere (App Flow §4.6). A decoded value
 * resolves to a bin or a product; the card that appears offers the actions that
 * make sense for what was scanned.
 */
export function GlobalScannerSheet() {
  const { scannerOpen, closeScanner } = useUi()
  const navigate = useNavigate()
  const resolve = useResolveScan()
  const { showError } = useAppToast()
  const [result, setResult] = useState<ScanResolution | null>(null)
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    if (scannerOpen) setResult(null)
  }, [scannerOpen])

  const handleDecode = useCallback(
    async (code: string) => {
      try {
        const resolution = await resolve.mutateAsync(code)
        const found = resolution.kind !== 'unknown'
        feedback(found ? 'success' : 'error')
        setFlash(found ? 'success' : 'error')
        setTimeout(() => setFlash(null), 320)
        setResult(resolution)
      } catch (error) {
        showError(error, 'Could not read that code')
      }
    },
    [resolve, showError],
  )

  useEffect(() => {
    if (!scannerOpen) return
    return listenForHidScanner((code) => void handleDecode(code))
  }, [handleDecode, scannerOpen])

  const go = (path: string) => {
    closeScanner()
    navigate(path)
  }

  return (
    <Sheet open={scannerOpen} onOpenChange={(open) => !open && closeScanner()}>
      <SheetContent side="bottom" className="mx-auto max-w-lg sm:rounded-lg">
        <SheetHeader>
          <SheetTitle>Scan</SheetTitle>
          <SheetDescription>Point at a bin QR label or a product barcode.</SheetDescription>
        </SheetHeader>

        {!result ? (
          <CameraView onDecode={(code) => void handleDecode(code)} flash={flash} />
        ) : result.kind === 'bin' ? (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border border-border p-4">
              <p className="label-small">Bin</p>
              <LocationBadge code={result.location_code} size="lg" />
              {!result.is_active && (
                <p className="text-sm text-warning">This bin is deactivated and cannot receive stock.</p>
              )}
            </div>
            <div className="grid gap-2">
              <Button onClick={() => go(`/bins/${result.id}`)}>
                <Boxes />
                View bin contents
                <ArrowRight className="ml-auto" />
              </Button>
              <Button variant="secondary" onClick={() => go(`/receive?bin=${result.id}`)}>
                <PackagePlus />
                Receive stock here
              </Button>
              <Button variant="secondary" onClick={() => go(`/transfer?from=${result.id}`)}>
                <Repeat />
                Transfer from here
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
              Scan another
            </Button>
          </div>
        ) : result.kind === 'product' ? (
          <div className="space-y-4">
            <div className="space-y-1 rounded-lg border border-border p-4">
              <p className="label-small">Product</p>
              <p className="text-h3">{result.name}</p>
              <p className="text-sm text-muted-foreground">
                {result.sku}
                {result.barcode ? ` · ${result.barcode}` : ''}
              </p>
            </div>
            <div className="grid gap-2">
              <Button onClick={() => go(`/products/${result.id}`)}>
                <Boxes />
                View locations
                <ArrowRight className="ml-auto" />
              </Button>
              <Button variant="secondary" onClick={() => go(`/receive?product=${result.id}`)}>
                <PackagePlus />
                Receive this product
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => setResult(null)}>
              Scan another
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-warning/12 p-4 text-warning">
              <HelpCircle className="mt-0.5 size-5 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">Nothing matches that code</p>
                <p className="location-code mt-1 text-sm">{result.code}</p>
                <p className="mt-1 text-sm opacity-90">
                  It is not a bin location code and no product carries that barcode or SKU.
                </p>
              </div>
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setResult(null)}>
              Scan again
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
