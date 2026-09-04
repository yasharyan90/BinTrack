import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PickTaskCard } from './PickTaskCard'
import type { PickTask } from '@/types/app'

const baseTask: PickTask = {
  id: 'task-1',
  order_item_id: 'item-1',
  product_id: 'product-1',
  sku: 'MUG-0042',
  name: 'Blue Ceramic Mug 350ml',
  barcode: '8900000000426',
  image_url: null,
  bin_id: 'bin-1',
  location_code: 'WH1-R02-B017',
  row_code: 'R02',
  row_name: 'Row 2',
  bin_code: 'B017',
  lot_number: null,
  expiry_date: null,
  days_to_expiry: null,
  quantity: 4,
  picked_qty: 0,
  status: 'pending',
  mismatch_count: 0,
  last_mismatch: null,
  bin_verified_at: null,
  verified_at: null,
  picked_at: null,
}

function renderCard(task: Partial<PickTask> = {}, onScan = vi.fn()) {
  render(
    <MemoryRouter>
      <PickTaskCard task={{ ...baseTask, ...task }} onScan={onScan} />
    </MemoryRouter>,
  )
  return onScan
}

describe('PickTaskCard', () => {
  it('makes the bin code the thing you cannot miss', () => {
    renderCard()
    expect(screen.getByText('WH1-R02-B017')).toBeInTheDocument()
    expect(screen.getByText('MUG-0042', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('to pick')).toBeInTheDocument()
  })

  it('opens the scanner for the task it belongs to', async () => {
    const onScan = renderCard()
    await userEvent.click(screen.getByRole('button', { name: /scan/i }))
    expect(onScan).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
  })

  it('shows a short line as unallocated rather than offering a scan', () => {
    renderCard({ status: 'short', location_code: null, bin_id: null, quantity: 2 })
    expect(screen.getByText(/not allocated/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /scan/i })).not.toBeInTheDocument()
  })

  it('reports the picked quantity once done, and hides the scan button', () => {
    renderCard({ status: 'picked', picked_qty: 4 })
    expect(screen.getByText('picked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^scan$/i })).not.toBeInTheDocument()
  })

  it('says how many times a scan has mismatched — in words, not just colour', () => {
    renderCard({ mismatch_count: 2 })
    expect(screen.getByText(/2 scan mismatches/i)).toBeInTheDocument()
  })

  it('surfaces the expiry of the allocated lot', () => {
    renderCard({ expiry_date: '2026-10-01', days_to_expiry: 6, lot_number: 'L2409' })
    expect(screen.getByText(/lot L2409/)).toBeInTheDocument()
    expect(screen.getByText('in 6 d')).toBeInTheDocument()
  })
})
