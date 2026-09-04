import { describe, expect, it, vi } from 'vitest'
import { addDaysIso, cn, daysUntil, debounce, isLocationCode, relativeDays } from './utils'

describe('cn', () => {
  it('lets a later Tailwind class win over an earlier one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('drops falsy values', () => {
    expect(cn('flex', false && 'hidden', undefined, 'gap-2')).toBe('flex gap-2')
  })
})

describe('daysUntil', () => {
  it('counts forward to a future date', () => {
    expect(daysUntil(addDaysIso(12))).toBe(12)
  })

  it('goes negative once a lot has expired', () => {
    expect(daysUntil(addDaysIso(-3))).toBe(-3)
  })

  it('returns null when there is no expiry', () => {
    expect(daysUntil(null)).toBeNull()
  })
})

describe('relativeDays', () => {
  it('reads naturally in both directions', () => {
    expect(relativeDays(12)).toBe('in 12 d')
    expect(relativeDays(0)).toBe('today')
    expect(relativeDays(-6)).toBe('6 d ago')
    expect(relativeDays(null)).toBe('—')
  })
})

describe('isLocationCode', () => {
  it('accepts a three-part bin code', () => {
    expect(isLocationCode('WH1-R02-B017')).toBe(true)
  })

  it('rejects a SKU', () => {
    expect(isLocationCode('MUG-0042')).toBe(false)
  })
})

describe('debounce', () => {
  it('fires once for a burst, with the last arguments', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced('b')
    debounced('bl')
    debounced('blue')
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('blue')
    vi.useRealTimers()
  })

  it('can be cancelled before it fires', () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 100)
    debounced('x')
    debounced.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
