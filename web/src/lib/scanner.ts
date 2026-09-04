/**
 * Scanning input (Implementation Plan §3.2).
 *
 * Two sources, one interface:
 *   • the device camera, decoded by ZXing (QR for bins, 1D for products);
 *   • USB/Bluetooth HID scanners, which type the code and press Enter.
 *
 * ZXing is imported dynamically so the ~300 kB decoder is only fetched when a
 * scanner actually opens.
 */
export type ScanControls = { stop: () => void }

export type CameraDevice = { deviceId: string; label: string }

/**
 * Starts decoding from a video element. Resolves once the camera is streaming;
 * rejects with a friendly message when permission is denied or unavailable.
 */
export async function startCameraScan(
  video: HTMLVideoElement,
  onDecode: (text: string) => void,
  deviceId?: string,
): Promise<ScanControls> {
  const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ])

  const hints = new Map()
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.QR_CODE,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_128,
    BarcodeFormat.CODE_39,
    BarcodeFormat.DATA_MATRIX,
  ])
  hints.set(DecodeHintType.TRY_HARDER, true)

  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 })

  // iOS Safari refuses to play an unmuted, non-inline video (Risk register).
  video.setAttribute('playsinline', 'true')
  video.muted = true

  const controls = await reader.decodeFromVideoDevice(deviceId, video, (result) => {
    if (result) onDecode(result.getText())
  })

  return { stop: () => controls.stop() }
}

export async function listCameras(): Promise<CameraDevice[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  } catch {
    return []
  }
}

export function hasCamera(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Torch is Chrome-on-Android only; callers treat `false` as "no torch". */
export async function setTorch(video: HTMLVideoElement, on: boolean): Promise<boolean> {
  const stream = video.srcObject as MediaStream | null
  const track = stream?.getVideoTracks()[0]
  if (!track) return false
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as unknown as MediaTrackConstraintSet],
    })
    return true
  } catch {
    return false
  }
}

/**
 * HID scanners type fast and finish with Enter. Characters more than
 * `maxGapMs` apart are a human at a keyboard and are ignored.
 */
export function listenForHidScanner(
  onScan: (code: string) => void,
  { maxGapMs = 60, minLength = 4 }: { maxGapMs?: number; minLength?: number } = {},
): () => void {
  let buffer = ''
  let lastKeyAt = 0

  const handler = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null
    // A focused field handles its own input; the search box opts in explicitly.
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

    const now = Date.now()
    if (now - lastKeyAt > maxGapMs) buffer = ''
    lastKeyAt = now

    if (event.key === 'Enter') {
      const code = buffer.trim()
      buffer = ''
      if (code.length >= minLength) {
        event.preventDefault()
        onScan(code)
      }
      return
    }
    if (event.key.length === 1) buffer += event.key
  }

  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}

/** 80 ms buzz on success, double buzz on mismatch (UI/UX §7). */
export function feedback(kind: 'success' | 'error'): void {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  try {
    navigator.vibrate?.(kind === 'success' ? 80 : [60, 60, 60])
  } catch {
    /* vibration is a nicety, never a requirement */
  }
  beep(kind)
}

let audioContext: AudioContext | null = null

function beep(kind: 'success' | 'error'): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioContext ??= new Ctor()
    const ctx = audioContext
    if (ctx.state === 'suspended') void ctx.resume()

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = kind === 'success' ? 1_040 : 320
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.16)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.18)
  } catch {
    /* muted device or blocked autoplay — the visual flash still fires */
  }
}

/** Bin QR payloads are plain location codes; barcodes are digits or a SKU. */
export function classifyScan(code: string): 'bin' | 'code' {
  return /^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$/i.test(code.trim()) ? 'bin' : 'code'
}
