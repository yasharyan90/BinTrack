import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

/**
 * Two browser contexts: staff receives stock, and the admin dashboard reflects
 * it without anyone pressing refresh (PRD §7 "alert latency", App Flow §6.1).
 */
test('an admin dashboard updates when staff move stock', async ({ browser }) => {
  const adminContext = await browser.newContext()
  const staffContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  const staffPage = await staffContext.newPage()

  await signIn(adminPage, 'admin')
  await adminPage.goto('/admin')
  await expect(adminPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(adminPage.getByText('Live')).toBeVisible({ timeout: 15_000 })

  const unitsTile = adminPage.locator('text=Units').locator('..')
  const before = (await unitsTile.textContent()) ?? ''

  await signIn(staffPage, 'staff')
  await staffPage.goto('/receive')
  await staffPage.getByPlaceholder('Search or scan the product…').fill('mug')
  await staffPage.getByRole('button', { name: /mug/i }).first().click()
  await staffPage.getByLabel('Quantity').fill('7')
  await staffPage.getByLabel('Destination bin').fill('WH1-R01-B001')
  await staffPage.keyboard.press('Enter')
  await staffPage.getByRole('button', { name: /receive stock/i }).click()
  await expect(staffPage.getByText(/placed in/i)).toBeVisible({ timeout: 10_000 })

  // No reload on the admin side — the socket carries the change.
  await expect(async () => {
    const after = (await unitsTile.textContent()) ?? ''
    expect(after).not.toBe(before)
  }).toPass({ timeout: 20_000 })

  await adminContext.close()
  await staffContext.close()
})
