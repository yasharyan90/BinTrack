import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import { Logo } from './Logo'
import { ADMIN_NAV, STAFF_NAV, type NavItem } from './nav'

/** 240 px expanded, 64 px collapsed. Items are filtered by role (App Flow §2). */
export function Sidebar() {
  const isAdmin = useAuth((s) => s.profile?.role === 'inventory_admin')
  const collapsed = useUi((s) => s.sidebarCollapsed)

  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-card md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center border-b border-border px-4', collapsed && 'justify-center px-0')}>
        <Logo compact={collapsed} />
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2" aria-label="Main">
        <NavGroup items={STAFF_NAV} collapsed={collapsed} />
        {isAdmin && (
          <NavGroup title="Admin" items={ADMIN_NAV} collapsed={collapsed} />
        )}
      </nav>
    </aside>
  )
}

function NavGroup({
  title,
  items,
  collapsed,
}: {
  title?: string
  items: NavItem[]
  collapsed: boolean
}) {
  return (
    <div className="space-y-0.5">
      {title && !collapsed && <p className="px-3 pb-1 pt-2 label-small">{title}</p>}
      {title && collapsed && <div className="mx-2 my-2 h-px bg-border" aria-hidden />}
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              collapsed && 'justify-center px-0',
              isActive
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )
          }
          title={collapsed ? item.label : undefined}
        >
          <item.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {collapsed && <span className="sr-only">{item.label}</span>}
        </NavLink>
      ))}
    </div>
  )
}
