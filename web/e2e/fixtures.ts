import { test as base, type Page } from '@playwright/test'

/**
 * Shared e2e setup (Implementation Plan 8.1).
 *
 * These specs run against a real local Supabase with the seed applied:
 *
 *     supabase start && supabase db reset
 *     cd web && npm run dev
 *     npm run test:e2e
 */
export const SEED_USERS = {
  admin: { email: 'admin@bintrack.dev', password: 'Password123!' },
  staff: { email: 'staff@bintrack.dev', password: 'Password123!' },
} as const

export async function signIn(page: Page, who: keyof typeof SEED_USERS) {
  const user = SEED_USERS[who]
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/**
 * Replaces the camera decoder with a queue the test controls, so a scan is a
 * deterministic function call rather than a webcam pointed at a screen.
 */
export async function mockScanner(page: Page) {
  await page.addInitScript(() => {
    const queue: string[] = []
    ;(window as unknown as { __scan: (code: string) => void }).__scan = (code: string) => {
      queue.push(code)
      window.dispatchEvent(new CustomEvent('bintrack:test-scan', { detail: code }))
    }
  })
}

/** Feeds a code in through the HID path, which needs no camera permission. */
export async function scan(page: Page, code: string) {
  await page.evaluate((value: string) => {
    for (const char of value) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }))
    }
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }, code)
}

export const test = base.extend<{ scannerReady: void }>({
  scannerReady: [
    async ({ page }, use) => {
      await mockScanner(page)
      await use()
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
