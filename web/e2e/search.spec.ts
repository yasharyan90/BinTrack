import { expect, test } from '@playwright/test'
import { signIn } from './fixtures'

test.describe('instant search', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'staff')
  })

  test('finds a product despite a typo and shows its bins', async ({ page }) => {
    await page.goto('/search')
    await page.getByLabel('Search products').fill('bleu mug')

    const firstResult = page.locator('article, .card-flat, [class*="rounded-lg"]').first()
    await expect(firstResult).toContainText(/mug/i, { timeout: 5_000 })
    // Every hit carries at least a location or an explicit "not stocked".
    await expect(page.getByText(/WH1-R\d\d-B\d\d\d|not stocked anywhere/i).first()).toBeVisible()
  })

  test('the "/" shortcut focuses the global search bar', async ({ page }) => {
    await page.goto('/')
    await page.keyboard.press('/')
    await expect(page.getByLabel('Search products')).toBeFocused()
  })

  test('an empty query asks for more characters instead of listing everything', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText(/type at least two characters/i)).toBeVisible()
  })
})
