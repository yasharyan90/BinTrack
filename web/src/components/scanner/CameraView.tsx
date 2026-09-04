import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Flashlight, Keyboard, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  hasCamera,
  listCameras,
  setTorch,
  startCameraScan,
  type CameraDevice,
  type ScanControls,
} from '@/lib/scanner'
import { cn } from '@/lib/utils'

/**
 * The camera viewport with corner guides, torch, camera switch and a manual
 * fallback. Camera permission can always be refused — a warehouse phone with a
 * dead camera must still be able to finish the pick (UI/UX §5, Risk register).
 */
export function CameraView({
  onDecode,
  hint,
  flash,
  className,
}: {
  onDecode: (code: string) => void
  hint?: string
  /** Brief overlay after a decode: green for a match, red for a mismatch. */
  flash?: 'success' | 'error' | null
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<ScanControls | null>(null)
  const [cameras, setCameras] = useState<CameraDevice[]>([])
  const [deviceIndex, setDeviceIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [manual, setManual] = useState(!hasCamera())
  const [manualValue, setManualValue] = useState('')

  useEffect(() => {
    if (manual) return
    let cancelled = false

    const start = async () => {
      setError(null)
      try {
        const devices = await listCameras()
        if (cancelled) return
        setCameras(devices)
        const deviceId = devices[deviceIndex]?.deviceId
        if (!videoRef.current) return
        controlsRef.current = await startCameraScan(videoRef.current, onDecode, deviceId)
      } catch (err) {
        if (cancelled) return
        const message = (err as Error).message ?? ''
        setError(
          /NotAllowedError|Permission/i.test(message)
            ? 'Camera permission denied. Use manual entry or a USB scanner.'
            : /NotFoundError|no camera/i.test(message)
              ? 'No camera found on this device.'
              : 'Could not start the camera. Use manual entry.',
        )
        setManual(true)
      }
    }

    void start()
    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [manual, deviceIndex, onDecode])

  const toggleTorch = async () => {
    if (!videoRef.current) return
    const applied = await setTorch(videoRef.current, !torchOn)
    if (applied) setTorchOn(!torchOn)
    else setError('This camera has no torch.')
  }

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault()
    const code = manualValue.trim()
    if (!code) return
    setManualValue('')
    onDecode(code)
  }

  return (
    <div className={cn('space-y-3', className)}>
      {!manual && (
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black">
          <video
            ref={videoRef}
            className="size-full object-cover"
            playsInline
            muted
            aria-label="Camera viewfinder"
          />

          {/* Corner guides frame the code without hiding it. */}
          <div className="pointer-events-none absolute inset-6">
            {(
              [
                'left-0 top-0 border-l-2 border-t-2',
                'right-0 top-0 border-r-2 border-t-2',
                'left-0 bottom-0 border-b-2 border-l-2',
                'right-0 bottom-0 border-b-2 border-r-2',
              ] as const
            ).map((corner) => (
              <span key={corner} className={cn('absolute size-8 border-white/80', corner)} />
            ))}
            <span className="absolute inset-x-2 h-px animate-scan-line bg-white/50" />
          </div>

          {flash && (
            <div
              className={cn(
                'pointer-events-none absolute inset-0',
                flash === 'success'
                  ? 'animate-flash-success bg-success'
                  : 'animate-flash-error bg-destructive',
              )}
            />
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent p-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => void toggleTorch()}
              aria-pressed={torchOn}
              aria-label="Toggle torch"
            >
              <Flashlight className={torchOn ? 'text-warning' : undefined} />
            </Button>
            {cameras.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setDeviceIndex((i) => (i + 1) % cameras.length)}
                aria-label="Switch camera"
              >
                <RefreshCw />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/20"
              onClick={() => setManual(true)}
            >
              <Keyboard className="mr-1" />
              Type code
            </Button>
          </div>
        </div>
      )}

      {hint && (
        <p className="text-center text-sm text-muted-foreground">
          {hint}
        </p>
      )}

      {error && (
        <p className="rounded-md bg-destructive/12 px-3 py-2 text-sm text-destructive" role="alert">
          <CameraOff className="mr-1.5 inline size-4" aria-hidden />
          {error}
        </p>
      )}

      {manual && (
        <form onSubmit={submitManual} className="space-y-2">
          <Input
            autoFocus
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            placeholder="Scan with a USB scanner or type the code"
            aria-label="Scanned code"
            autoComplete="off"
            spellCheck={false}
          />
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!manualValue.trim()}>
              Submit code
            </Button>
            {hasCamera() && (
              <Button type="button" variant="secondary" onClick={() => setManual(false)}>
                <Camera />
                Camera
              </Button>
            )}
          </div>
          <p className="text-small text-muted-foreground">
            A USB or Bluetooth scanner types the code here and presses Enter.
          </p>
        </form>
      )}
    </div>
  )
}
