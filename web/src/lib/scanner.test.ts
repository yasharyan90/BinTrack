import { describe, expect, it, vi } from 'vitest'
import { classifyScan, listenForHidScanner } from './scanner'

describe('classifyScan', () => {
  it('recognises a bin location code', () => {
    expect(classifyScan('WH1-R02-B017')).toBe('bin')
    expect(classifyScan('  wh1-r02-b017 ')).toBe('bin')
  })

  it('treats a barcode or SKU as a code', () => {
    expect(classifyScan('8900000000426')).toBe('code')
    expect(classifyScan('MUG-0042')).toBe('code') // two segments, not three
  })
})

describe('listenForHidScanner', () => {
  /** Types a string the way a hardware scanner does: fast, then Enter. */
  function typeFast(text: string) {
    for (const char of text) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }

  it('reports a fast burst followed by Enter', () => {
    const onScan = vi.fn()
    const stop = listenForHidScanner(onScan)

    typeFast('WH1-R02-B017')

    expect(onScan).toHaveBeenCalledWith('WH1-R02-B017')
    stop()
  })

  it('ignores input that is too short to be a scan', () => {
    const onScan = vi.fn()
    const stop = listenForHidScanner(onScan)

    typeFast('AB')

    expect(onScan).not.toHaveBeenCalled()
    stop()
  })

  it('leaves a focused field alone — a picker typing a lot number is not scanning', () => {
    const onScan = vi.fn()
    const stop = listenForHidScanner(onScan)

    const input = document.createElement('input')
    document.body.appendChild(input)
    for (const char of '8900000000426') {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(onScan).not.toHaveBeenCalled()
    input.remove()
    stop()
  })

  it('stops listening once torn down', () => {
    const onScan = vi.fn()
    const stop = listenForHidScanner(onScan)
    stop()

    typeFast('WH1-R02-B017')

    expect(onScan).not.toHaveBeenCalled()
  })

  it('discards characters typed slowly by a human', async () => {
    vi.useFakeTimers()
    const onScan = vi.fn()
    const stop = listenForHidScanner(onScan, { maxGapMs: 30 })

    for (const char of 'WH1-R02-B017') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char }))
      vi.advanceTimersByTime(200) // slower than any scanner
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))

    expect(onScan).not.toHaveBeenCalled()
    stop()
    vi.useRealTimers()
  })
})
