import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test.describe('authentication and role guards', () => {
  test('an unauthenticated visitor is sent to sign in', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('staff sign in and land on the warehouse home', async ({ page }) => {
    await signIn(page, 'staff')
    await expect(page.getByRole('heading', { name: /hello|bintrack/i })).toBeVisible()
  })

  test('staff cannot reach an admin route even by typing the URL', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/admin/products')
    await expect(page).toHaveURL(/\/(?!admin)/)
    await expect(page.getByText(/admin access required/i)).toBeVisible()
  })

  test('an admin sees the dashboard and the alert bell', async ({ page }) => {
    await signIn(page, 'admin')
    await page.goto('/admin')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('button', { name: /alerts/i })).toBeVisible()
  })

  test('signing out clears the session', async ({ page }) => {
    await signIn(page, 'staff')
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
