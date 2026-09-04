import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardCheck,
  Download,
  FileUp,
  Home,
  LayoutGrid,
  ListOrdered,
  Package,
  PackagePlus,
  Repeat,
  ScanLine,
  Search,
  Settings,
  Tags,
  Timer,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean }

/** Shared by the sidebar and the mobile "More" page (App Flow §2). */
export const STAFF_NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/orders', label: 'Orders', icon: ListOrdered },
  { to: '/receive', label: 'Receive', icon: PackagePlus },
  { to: '/transfer', label: 'Transfer', icon: Repeat },
  { to: '/scan', label: 'Scan', icon: ScanLine },
  { to: '/movements', label: 'Movements', icon: BarChart3 },
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutGrid, end: true },
  { to: '/admin/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/admin/products', label: 'Products', icon: Package },
  { to: '/admin/locations', label: 'Locations', icon: Boxes },
  { to: '/admin/expiry', label: 'Expiry', icon: Timer },
  { to: '/admin/counts', label: 'Cycle counts', icon: ClipboardCheck },
  { to: '/admin/import', label: 'Import', icon: FileUp },
  { to: '/admin/export', label: 'Export', icon: Download },
  { to: '/admin/labels', label: 'Labels', icon: Tags },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]
