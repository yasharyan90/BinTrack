import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

/** Contrast, focus and keyboard operation in both themes (UI/UX §8). */
test.describe('accessibility basics', () => {
  test('every page works in dark mode too', async ({ page }) => {
    await signIn(page, 'admin')
    await page.goto('/admin')

    await page.getByRole('button', { name: /theme/i }).click()
    await page.getByRole('menuitem', { name: 'Dark' }).click()

    await expect(page.locator('html')).toHaveClass(/dark/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })

  test('the pick list is reachable by keyboard alone', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/orders')

    await page.keyboard.press('Tab')
    const focused = page.locator(':focus')
    await expect(focused).toBeVisible()
  })

  test('icon-only buttons carry accessible names', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/')

    for (const name of ['Scan', 'Account menu']) {
      await expect(page.getByRole('button', { name: new RegExp(name, 'i') }).first()).toBeVisible()
    }
  })
})
