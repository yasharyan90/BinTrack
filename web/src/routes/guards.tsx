import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { useEffect } from 'react'
import { FullPageSpinner } from '@/components/ui/spinner'
import { useAuth } from '@/stores/auth'

/**
 * Route guards (App Flow §1). The UI hides what a user cannot do, but the
 * database is the real boundary — a staff JWT is rejected by RLS even if
 * someone reaches an admin route by hand.
 */
export function RequireAuth() {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageSpinner label="Checking your session" />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (profile && !profile.is_active) return <Navigate to="/login" replace />

  return <Outlet />
}

export function RequireAdmin() {
  const { profile, loading } = useAuth()

  useEffect(() => {
    if (!loading && profile && profile.role !== 'inventory_admin') {
      toast.error('Admin access required')
    }
  }, [loading, profile])

  if (loading) return <FullPageSpinner label="Checking your access" />
  if (!profile) return <Navigate to="/login" replace />
  if (profile.role !== 'inventory_admin') return <Navigate to="/" replace />

  return <Outlet />
}

/** Signed-in users have no business on /login. */
export function RedirectIfAuthed() {
  const { session, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (session) return <Navigate to="/" replace />
  return <Outlet />
}
