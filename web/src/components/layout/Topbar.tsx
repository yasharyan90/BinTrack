import { Link, useNavigate } from 'react-router-dom'
import { LogOut, PanelLeft, ScanLine, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { NotificationBell } from '@/components/alerts/NotificationBell'
import { ThemeToggle } from './ThemeToggle'
import { LiveIndicator } from './ConnectionBanner'
import { Logo } from './Logo'
import { useAuth } from '@/stores/auth'
import { useUi } from '@/stores/ui'
import { initials } from '@/lib/utils'

export function Topbar() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { toggleSidebar, openScanner } = useUi()
  const isAdmin = profile?.role === 'inventory_admin'

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-3 md:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-5" strokeWidth={1.75} />
        </Button>

        <Logo compact className="md:hidden" />

        <div className="mx-auto w-full max-w-xl">
          <GlobalSearch />
        </div>

        <LiveIndicator className="hidden lg:flex" />

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={openScanner}
          aria-label="Scan"
        >
          <ScanLine className="size-5" strokeWidth={1.75} />
        </Button>

        {isAdmin && <NotificationBell />}
        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu">
              <span className="flex size-7 items-center justify-center rounded-full bg-muted text-small font-medium">
                {initials(profile?.full_name ?? profile?.email)}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <span className="block truncate normal-case tracking-normal text-foreground">
                {profile?.full_name ?? 'Signed in'}
              </span>
              <span className="block truncate font-normal">{profile?.email}</span>
              <span className="mt-1 block font-normal">
                {isAdmin ? 'Inventory admin' : 'Warehouse staff'}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">
                <User className="size-4" />
                Profile & preferences
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => {
                void signOut().then(() => navigate('/login'))
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
