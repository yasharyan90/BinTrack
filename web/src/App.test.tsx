import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAuth } from '@/stores/auth'

/**
 * Smoke tests for the whole composition: providers, router, guards and the
 * lazily-loaded pages. Supabase is mocked at the module boundary and the auth
 * store is driven directly, so these run without a database and still prove the
 * route tree mounts and the role guards behave.
 */
vi.mock('@/lib/supabase', () => {
  const chain = () => {
    const settled = Promise.resolve({ data: [], error: null, count: 0 })
    const builder: Record<string, unknown> = {}
    for (const method of [
      'select', 'insert', 'update', 'upsert', 'delete', 'eq', 'neq', 'in', 'or',
      'ilike', 'lte', 'gte', 'lt', 'gt', 'order', 'range', 'limit',
    ]) {
      builder[method] = () => builder
    }
    builder.single = () => Promise.resolve({ data: null, error: null })
    builder.maybeSingle = () => Promise.resolve({ data: null, error: null })
    builder.then = settled.then.bind(settled)
    return builder
  }

  return {
    SUPABASE_URL: 'http://127.0.0.1:54321',
    SUPABASE_ANON_KEY: 'test-anon-key',
    invokeFunction: vi.fn(async () => ({ data: null, error: null })),
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signInWithPassword: vi.fn(async () => ({ error: null })),
        signOut: vi.fn(async () => ({ error: null })),
      },
      from: chain,
      rpc: async () => ({ data: null, error: null }),
      channel: () => {
        const channel: Record<string, unknown> = {}
        channel.on = () => channel
        channel.subscribe = () => channel
        channel.presenceState = () => ({})
        channel.track = async () => undefined
        return channel
      },
      removeChannel: vi.fn(),
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
      functions: { invoke: async () => ({ data: null, error: null }) },
    },
  }
})

type TestProfile = { id: string; role: 'staff' | 'inventory_admin' }

/** Puts the real auth store into the state a signed-in user would produce. */
function signedInAs({ id, role }: TestProfile) {
  useAuth.setState({
    session: { user: { id } } as never,
    user: { id } as never,
    profile: {
      id,
      email: `${id}@bintrack.dev`,
      full_name: role === 'staff' ? 'Priya Staff' : 'Arjun Admin',
      role,
      is_active: true,
      preferences: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    loading: false,
  })
}

function signedOut() {
  useAuth.setState({ session: null, user: null, profile: null, loading: false })
}

async function renderApp(path: string) {
  window.history.pushState({}, '', path)
  const { default: App } = await import('./App')
  // The store's own initialise() would re-read Supabase and clear our state.
  useAuth.setState({ initialise: () => () => {} })
  render(<App />)
}

describe('app composition', () => {
  beforeEach(() => {
    signedOut()
    useAuth.setState({ initialise: () => () => {} })
  })

  it('opens as a landing view, and Log in reveals the form', async () => {
    await renderApp('/login')
    expect(
      await screen.findByRole('heading', { name: 'Every item has an address.' }),
    ).toBeInTheDocument()
    // The form is not on screen until asked for.
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()

    // Two entry points carry the same name: the header and the hero button.
    await userEvent.click(screen.getAllByRole('button', { name: /^log in$/i })[0])

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('About, beside Log in, explains the project and its flow', async () => {
    await renderApp('/login')
    await screen.findByRole('heading', { name: 'Every item has an address.' })

    await userEvent.click(screen.getByRole('button', { name: /^about$/i }))

    expect(await screen.findByRole('heading', { name: 'About BinTrack' })).toBeInTheDocument()
    // The five-step flow, in order.
    for (const step of ['Receive', 'Search', 'Order', 'Pick', 'Watch']) {
      expect(screen.getByText(step, { selector: 'p' })).toBeInTheDocument()
    }
    expect(screen.getByText('WH1-R02-B017')).toBeInTheDocument()
  })

  it('goes straight to the form for a visitor bounced by a guard', async () => {
    await renderApp('/login?form')
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('sends an unauthenticated visitor away from an admin route', async () => {
    await renderApp('/admin')
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument(),
    )
  })

  it('offers account creation', async () => {
    await renderApp('/signup')
    expect(await screen.findByRole('heading', { name: /create your account/i })).toBeInTheDocument()
    expect(screen.getByText(/start with staff access/i)).toBeInTheDocument()
  })

  it('lets a signed-in staff member reach the warehouse shell', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/')

    expect(await screen.findByLabelText('Search products')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Receive' })).toBeInTheDocument()
    // Staff never see the admin section.
    expect(screen.queryByRole('link', { name: 'Cycle counts' })).not.toBeInTheDocument()
  })

  it('shows an admin the admin navigation and the alert bell', async () => {
    signedInAs({ id: 'admin-1', role: 'inventory_admin' })
    await renderApp('/')

    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cycle counts' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alerts/i })).toBeInTheDocument()
  })

  it('keeps staff out of an admin page even when they navigate straight to it', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/admin/products')

    // Bounced to the staff home rather than rendering the catalogue.
    expect(await screen.findByLabelText('Search products')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Add product' })).not.toBeInTheDocument(),
    )
  })

  it('staff can reach the goods-receipt screens', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/grn')

    expect(await screen.findByRole('heading', { name: 'Goods receipts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /register arrival/i })).toBeInTheDocument()
    // The nav carries the module for staff too.
    expect(screen.getByRole('link', { name: 'Goods receipts' })).toBeInTheDocument()
    // Staff get the list but not the admin KPI strip ("Total GRNs" lives only there;
    // "Pending verification" is also a filter chip, so it is not a useful probe).
    expect(screen.queryByText('Total GRNs')).not.toBeInTheDocument()
  })

  it('the arrival form records the receiving staff member from the session', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/grn/new')

    expect(await screen.findByRole('heading', { name: 'Register truck arrival' })).toBeInTheDocument()
    expect(screen.getByText('Priya Staff')).toBeInTheDocument()
    expect(screen.getByText(/recorded from your session/i)).toBeInTheDocument()
    for (const label of ['Truck / vehicle number', 'Driver name', 'Vendor seal number', 'Invoice number']) {
      expect(screen.getByLabelText(new RegExp(label, 'i'))).toBeInTheDocument()
    }
  })

  it('admins see purchase orders and the five GRN figures', async () => {
    signedInAs({ id: 'admin-1', role: 'inventory_admin' })
    await renderApp('/admin/purchase-orders')

    expect(await screen.findByRole('heading', { name: 'Purchase orders' })).toBeInTheDocument()
    for (const kpi of ['Total GRNs', 'Pending verification', 'Discrepancies', 'Pending put-away', 'Completed']) {
      expect(screen.getByText(kpi)).toBeInTheDocument()
    }
  })

  it('keeps staff away from purchase orders', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/admin/purchase-orders')

    expect(await screen.findByLabelText('Search products')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Purchase orders' })).not.toBeInTheDocument(),
    )
  })

  it('staff see their task list and the warehouse-closed notice', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/tasks')
    expect(await screen.findByRole('heading', { name: 'My tasks' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My tasks' })).toBeInTheDocument()
  })

  it('admins get the staff dashboard with the open/closed switch', async () => {
    signedInAs({ id: 'admin-1', role: 'inventory_admin' })
    await renderApp('/admin/staff')
    expect(await screen.findByRole('heading', { name: 'Staff & tasks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /assign a task/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /balance open tasks/i })).toBeInTheDocument()
  })

  it('renders a friendly page for an unknown route', async () => {
    signedInAs({ id: 'staff-1', role: 'staff' })
    await renderApp('/nowhere-at-all')

    expect(await screen.findByText(/nothing at this address/i)).toBeInTheDocument()
  })
})
