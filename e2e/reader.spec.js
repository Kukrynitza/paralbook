const { test, expect } = require('@playwright/test')

test.setTimeout(120000)

test('reader prefetches pages and switches without server round-trip', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://localhost:5173/read/ca2d3810-9b6d-4a97-b46b-ce18031fd863')
  const text = page.locator('p').filter({ hasText: /[A-Za-z]/ }).last()
  await expect(text).toBeVisible({ timeout: 30000 })
  const before = await text.innerText()
  await page.getByRole('button', { name: 'Дальше' }).click()
  await expect.poll(async () => text.innerText(), { timeout: 30000 }).not.toBe(before)
  expect(errors).toEqual([])
  await context.close()
})
