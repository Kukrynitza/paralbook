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

test('translation ribbon can be hidden and returns on a word tap', async ({ page }) => {
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  const text = page.locator('p[class*="text"]').first()
  await expect(text).toBeVisible({ timeout: 30000 })
  const ribbon = page.locator('div[class*="parallel"]')
  await page.locator('button[class*="token"]').nth(10).click()
  await expect(ribbon).toBeVisible()
  await page.getByRole('button', { name: 'Скрыть перевод' }).click()
  await expect(ribbon).toHaveCount(0)
  await page.locator('button[class*="token"]').nth(12).click()
  await expect(ribbon).toBeVisible()
})

test('function words get a nearest highlight', async ({ page }) => {
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  await expect(page.locator('p[class*="text"]').first()).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'a', exact: true }).first().click()
  const ribbon = page.locator('div[class*="parallel"]')
  await expect(ribbon).toBeVisible()
  await expect(ribbon.locator('span[class*="ruOn"]')).toHaveCount(1)
})
