import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScanStepper } from './ScanStepper'

describe('ScanStepper', () => {
  it('marks the current step for assistive tech', () => {
    render(<ScanStepper current="product" />)
    expect(screen.getByText('Scan product')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Scan bin')).not.toHaveAttribute('aria-current')
  })

  it('shows all three steps of the verification sequence', () => {
    render(<ScanStepper current="bin" />)
    expect(screen.getByLabelText('Scan progress')).toBeInTheDocument()
    for (const label of ['Scan bin', 'Scan product', 'Quantity']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('is on the quantity step once the product is verified', () => {
    render(<ScanStepper current="quantity" />)
    expect(screen.getByText('Quantity')).toHaveAttribute('aria-current', 'step')
  })
})
