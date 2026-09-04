import { expect, test } from '@playwright/test'
import { scan, signIn } from './fixtures'

/**
 * The headline flow: an order lands, the bins appear, a scan verifies the pick,
 * and the wrong bin is refused (PRD §6, user stories 2 and 3).
 */
test.describe('order intake to scan-verified pick', () => {
  test('creates an order and shows its pick locations immediately', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/orders/new')

    await page.getByPlaceholder('Search or scan a product…').fill('mug')
    await page.getByRole('button', { name: /mug/i }).first().click()

    await page.getByRole('button', { name: /create & allocate/i }).click()

    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/)
    // A location code is on screen without a second request from the user.
    await expect(page.getByText(/WH\d-R\d\d-B\d\d\d/).first()).toBeVisible({ timeout: 10_000 })
  })

  test('blocks a scan of the wrong bin and says what was expected', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/orders/new')

    await page.getByPlaceholder('Search or scan a product…').fill('mug')
    await page.getByRole('button', { name: /mug/i }).first().click()
    await page.getByRole('button', { name: /create & allocate/i }).click()
    await expect(page.getByText(/WH\d-R\d\d-B\d\d\d/).first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Scan' }).first().click()
    await expect(page.getByText('Verify pick')).toBeVisible()

    await scan(page, 'WH1-R09-B999')

    await expect(page.getByRole('alert')).toContainText(/wrong bin/i)
    await expect(page.getByRole('alert')).toContainText(/expected/i)
  })

  test('verifies bin then product, then confirms the quantity', async ({ page }) => {
    await signIn(page, 'staff')
    await page.goto('/orders/new')

    await page.getByPlaceholder('Search or scan a product…').fill('mug')
    await page.getByRole('button', { name: /mug/i }).first().click()
    await page.getByRole('button', { name: /create & allocate/i }).click()

    const locationCode = await page.getByText(/WH\d-R\d\d-B\d\d\d/).first().textContent()
    expect(locationCode).toBeTruthy()

    await page.getByRole('button', { name: 'Scan' }).first().click()
    await scan(page, locationCode!.trim())
    await expect(page.getByText('Scan product')).toBeVisible()

    // The sheet states which barcode it wants; scanning it verifies the task.
    const hint = await page.getByText(/^Expecting /).textContent()
    await scan(page, hint!.replace('Expecting ', '').trim())

    await expect(page.getByText(/bin and product verified/i)).toBeVisible()
    await page.getByRole('button', { name: /confirm pick/i }).click()

    await expect(page.getByText(/picked/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
