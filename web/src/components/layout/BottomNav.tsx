import { NavLink } from 'react-router-dom'
import { Home, ListOrdered, MoreHorizontal, ScanLine, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

/** Five targets, each ≥ 44 px, for a phone held in one gloved hand (UI/UX §4). */
export function BottomNav() {
  const openScanner = useUi((s) => s.openScanner)

  const item = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-small'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Primary"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) => cn(item, isActive ? 'text-foreground' : 'text-muted-foreground')}
      >
        <Home className="size-5" strokeWidth={1.75} aria-hidden />
        Home
      </NavLink>
      <NavLink
        to="/search"
        className={({ isActive }) => cn(item, isActive ? 'text-foreground' : 'text-muted-foreground')}
      >
        <Search className="size-5" strokeWidth={1.75} aria-hidden />
        Search
      </NavLink>

      <button type="button" onClick={openScanner} className={cn(item, 'text-foreground')}>
        <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <ScanLine className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="sr-only">Open the scanner</span>
      </button>

      <NavLink
        to="/orders"
        className={({ isActive }) => cn(item, isActive ? 'text-foreground' : 'text-muted-foreground')}
      >
        <ListOrdered className="size-5" strokeWidth={1.75} aria-hidden />
        Orders
      </NavLink>
      <NavLink
        to="/more"
        className={({ isActive }) => cn(item, isActive ? 'text-foreground' : 'text-muted-foreground')}
      >
        <MoreHorizontal className="size-5" strokeWidth={1.75} aria-hidden />
        More
      </NavLink>
    </nav>
  )
}
