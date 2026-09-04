import { useState } from 'react'
import { ShieldCheck, UserCheck, UserX, Users as UsersIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonRows } from '@/components/ui/skeleton'
import { useSetUserActive, useSetUserRole, useUsers } from '@/hooks/useSettings'
import { useAppToast } from '@/hooks/useAppToast'
import { useAuth } from '@/stores/auth'
import { formatDate, initials } from '@/lib/utils'
import type { AppRole } from '@/types/database'
import type { Profile } from '@/types/app'

/**
 * Users and roles (App Flow §5.9). The role change is confirmed by typing the
 * user's email — a promotion to admin is not a click you make by accident.
 */
export default function Users() {
  const { data: users = [], isLoading } = useUsers()
  const setRole = useSetUserRole()
  const setActive = useSetUserActive()
  const { showSuccess, showError } = useAppToast()
  const currentUserId = useAuth((s) => s.profile?.id)

  const [pending, setPending] = useState<{ user: Profile; role: AppRole } | null>(null)
  const [confirmText, setConfirmText] = useState('')

  const activeAdmins = users.filter((u) => u.role === 'inventory_admin' && u.is_active).length

  const applyRole = () => {
    if (!pending) return
    setRole.mutate(
      { userId: pending.user.id, role: pending.role },
      {
        onSuccess: () => {
          showSuccess(
            `${pending.user.full_name ?? pending.user.email} is now ${
              pending.role === 'inventory_admin' ? 'an inventory admin' : 'warehouse staff'
            }`,
            'They will see the change on their next token refresh.',
          )
          setPending(null)
          setConfirmText('')
        },
        onError: (error) => showError(error, 'Could not change the role'),
      },
    )
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Roles are enforced by the database, not by hiding buttons."
        actions={
          <Badge variant="default">
            <ShieldCheck className="size-3" aria-hidden />
            {activeAdmins} active {activeAdmins === 1 ? 'admin' : 'admins'}
          </Badge>
        }
      />

      {isLoading ? (
        <SkeletonRows rows={5} />
      ) : users.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No users yet" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId
                const isLastAdmin = user.role === 'inventory_admin' && activeAdmins <= 1

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-small font-medium">
                          {initials(user.full_name ?? user.email)}
                        </span>
                        <span className="truncate">
                          {user.full_name ?? '—'}
                          {isSelf && <span className="text-muted-foreground"> (you)</span>}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {user.email}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={user.role}
                        disabled={isLastAdmin || setRole.isPending}
                        onValueChange={(role) =>
                          setPending({ user, role: role as AppRole })
                        }
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="staff">Warehouse staff</SelectItem>
                          <SelectItem value="inventory_admin">Inventory admin</SelectItem>
                        </SelectContent>
                      </Select>
                      {isLastAdmin && (
                        <p className="mt-1 text-small text-muted-foreground">
                          The last admin cannot be demoted.
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.is_active ? (
                        <Badge variant="success">active</Badge>
                      ) : (
                        <Badge variant="destructive">deactivated</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf || setActive.isPending}
                        onClick={() =>
                          setActive.mutate(
                            { userId: user.id, active: !user.is_active },
                            {
                              onSuccess: () =>
                                showSuccess(
                                  user.is_active
                                    ? `${user.email} deactivated`
                                    : `${user.email} reactivated`,
                                  user.is_active
                                    ? 'Every policy now denies them, immediately.'
                                    : undefined,
                                ),
                              onError: (error) => showError(error, 'Could not update the account'),
                            },
                          )
                        }
                      >
                        {user.is_active ? (
                          <>
                            <UserX className="size-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck className="size-3.5" />
                            Reactivate
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <p className="mt-4 text-small text-muted-foreground">
        New sign-ups start as warehouse staff. Invite people from Supabase Studio (Auth → Users), or
        let them sign up and promote them here.
      </p>

      <AlertDialog
        open={!!pending}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null)
            setConfirmText('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.role === 'inventory_admin' ? 'Promote to inventory admin?' : 'Demote to staff?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.role === 'inventory_admin'
                ? 'Admins can edit the catalogue, post adjustments, import data and manage users.'
                : 'They will lose the dashboard, alerts, adjustments and user management.'}{' '}
              Type <span className="font-mono">{pending?.user.email}</span> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={pending?.user.email ?? ''}
            aria-label="Type the email address to confirm"
            autoComplete="off"
          />

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              destructive={pending?.role === 'staff'}
              disabled={confirmText.trim() !== pending?.user.email}
              onClick={(event) => {
                if (confirmText.trim() !== pending?.user.email) {
                  event.preventDefault()
                  return
                }
                applyRole()
              }}
            >
              Change the role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
