import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExpiryChip } from './ExpiryChip'
import { StockHealthBar } from './StockHealthBar'
import { addDaysIso } from '@/lib/utils'

describe('ExpiryChip', () => {
  it('says how long is left, not only how it is coloured', () => {
    render(<ExpiryChip date={addDaysIso(12)} />)
    expect(screen.getByText('in 12 d')).toBeInTheDocument()
  })

  it('calls an expired lot expired', () => {
    render(<ExpiryChip date={addDaysIso(-2)} />)
    expect(screen.getByText('expired')).toBeInTheDocument()
  })

  it('renders an em dash when there is no expiry to show', () => {
    render(<ExpiryChip date={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('honours a server-supplied day count over its own arithmetic', () => {
    render(<ExpiryChip date="2026-12-31" days={5} />)
    expect(screen.getByText('in 5 d')).toBeInTheDocument()
  })
})

describe('StockHealthBar', () => {
  it('states the health in words for a screen reader', () => {
    render(<StockHealthBar available={4} reorderPoint={40} />)
    expect(screen.getByRole('meter')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Low stock'),
    )
    expect(screen.getByText(/Low stock · 4 available · reorder at 40/)).toBeInTheDocument()
  })

  it('calls zero available out of stock', () => {
    render(<StockHealthBar available={0} reorderPoint={10} />)
    expect(screen.getByText(/Out of stock/)).toBeInTheDocument()
  })

  it('calls comfortable stock healthy', () => {
    render(<StockHealthBar available={500} reorderPoint={40} />)
    expect(screen.getByText(/Healthy/)).toBeInTheDocument()
  })
})
