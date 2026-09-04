import { Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ADMIN_NAV, STAFF_NAV, type NavItem } from '@/components/layout/nav'
import { useAuth } from '@/stores/auth'

/** The mobile overflow menu — everything the bottom bar has no room for. */
export default function More() {
  const { profile, signOut } = useAuth()
  const isAdmin = profile?.role === 'inventory_admin'

  return (
    <>
      <PageHeader title="More" description={profile?.full_name ?? profile?.email ?? undefined} />

      <div className="space-y-4">
        <Section title="Warehouse" items={STAFF_NAV} />
        {isAdmin && <Section title="Admin" items={ADMIN_NAV} />}

        <Card>
          <CardContent className="p-2">
            <Link
              to="/profile"
              className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"
            >
              Profile & preferences
            </Link>
            <Button
              variant="ghost"
              className="w-full justify-start px-3 text-destructive"
              onClick={() => void signOut()}
            >
              <LogOut />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Section({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <Card>
      <CardContent className="p-2">
        <p className="px-3 py-2 label-small">{title}</p>
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent"
          >
            <item.icon className="size-5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
            {item.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
