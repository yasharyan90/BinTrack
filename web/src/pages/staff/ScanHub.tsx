import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, PackagePlus, Repeat, ScanLine } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CameraView } from '@/components/scanner/CameraView'
import { LocationBadge } from '@/components/stock/LocationBadge'
import { useResolveScan } from '@/hooks/useProducts'
import { useAppToast } from '@/hooks/useAppToast'
import { feedback, listenForHidScanner } from '@/lib/scanner'
import { relativeTime } from '@/lib/utils'
import type { ScanResolution } from '@/types/app'

type HistoryEntry = { at: string; code: string; result: ScanResolution }

/** A full-page scanner for a phone parked on a trolley (App Flow §4.6). */
export default function ScanHub() {
  const resolve = useResolveScan()
  const { showError } = useAppToast()
  const [flash, setFlash] = useState<'success' | 'error' | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const latest = history[0]

  const handleDecode = useCallback(
    async (code: string) => {
      try {
        const result = await resolve.mutateAsync(code)
        const found = result.kind !== 'unknown'
        feedback(found ? 'success' : 'error')
        setFlash(found ? 'success' : 'error')
        setTimeout(() => setFlash(null), 320)
        setHistory((prev) => [{ at: new Date().toISOString(), code, result }, ...prev].slice(0, 12))
      } catch (error) {
        showError(error, 'Could not read that code')
      }
    },
    [resolve, showError],
  )

  useEffect(() => listenForHidScanner((code) => void handleDecode(code)), [handleDecode])

  return (
    <>
      <PageHeader
        title="Scanner"
        description="Bin QR labels resolve to a bin, barcodes to a product."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-4 pt-4">
            <CameraView onDecode={(code) => void handleDecode(code)} flash={flash} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {latest ? (
            <Card>
              <CardContent className="space-y-3 p-4 pt-4">
                {latest.result.kind === 'bin' ? (
                  <>
                    <p className="label-small">Bin</p>
                    <LocationBadge code={latest.result.location_code} size="lg" />
                    {!latest.result.is_active && (
                      <p className="text-sm text-warning">This bin is deactivated.</p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-3">
                      <Button asChild variant="secondary">
                        <Link to={`/bins/${latest.result.id}`}>
                          <Boxes />
                          Contents
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link to={`/receive?bin=${latest.result.id}`}>
                          <PackagePlus />
                          Receive
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link to={`/transfer?from=${latest.result.id}`}>
                          <Repeat />
                          Transfer
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : latest.result.kind === 'product' ? (
                  <>
                    <p className="label-small">Product</p>
                    <p className="text-h2">{latest.result.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {latest.result.sku}
                      {latest.result.barcode ? ` · ${latest.result.barcode}` : ''}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button asChild variant="secondary">
                        <Link to={`/products/${latest.result.id}`}>
                          <Boxes />
                          Locations
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link to={`/receive?product=${latest.result.id}`}>
                          <PackagePlus />
                          Receive
                        </Link>
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="label-small">Not recognised</p>
                    <p className="location-code text-lg">{latest.result.code}</p>
                    <p className="text-sm text-muted-foreground">
                      No bin has this location code and no product carries it as a barcode or SKU.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <ScanLine className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
                <p className="text-h3">Waiting for a scan</p>
                <p className="text-sm text-muted-foreground">
                  Point the camera at a label, or use a USB scanner — it types straight into this page.
                </p>
              </CardContent>
            </Card>
          )}

          {history.length > 1 && (
            <Card>
              <CardContent className="p-0">
                <p className="border-b border-border p-3 text-h3">Recent scans</p>
                <ul>
                  {history.slice(1).map((entry, i) => (
                    <li
                      key={`${entry.at}-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-border p-3 last:border-0 text-sm"
                    >
                      <span className="location-code truncate">{entry.code}</span>
                      <span className="shrink-0 text-small text-muted-foreground">
                        {entry.result.kind} · {relativeTime(entry.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
