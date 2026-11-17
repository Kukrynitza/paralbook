const { test, expect } = require('@playwright/test')

const READER = 'http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c'

function accent(page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
}

test('each section has its own accent', async ({ page }) => {
  await page.goto('http://localhost:5173/chat')
  await expect.poll(() => accent(page)).toBe('#3b82f6')
  await page.goto('http://localhost:5173/')
  await expect.poll(() => accent(page)).toBe('#ff6229')
  await page.goto('http://localhost:5173/settings')
  await expect.poll(() => accent(page)).toBe('#64748b')
  await page.goto(READER)
  await expect.poll(() => accent(page)).toBe('#8b5cf6')
})

test('a section color can be changed and survives a reload', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: 'Настроить цвета' }).click()
  const dialog = page.getByRole('dialog', { name: 'Оформление' })
  await dialog.getByRole('button', { name: 'Цвета разделов' }).click()
  await dialog.getByRole('button', { name: 'Чат: #22a06b' }).click()
  await page.waitForTimeout(900)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await page.reload()
  await page.goto('http://localhost:5173/chat')
  await expect.poll(() => accent(page)).toBe('#22a06b')
})

test('theme and fonts are stored in the account', async ({ browser }) => {
  const first = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const firstPage = await first.newPage()
  await firstPage.goto('http://localhost:5173/settings')
  await firstPage.getByRole('button', { name: /Шрифты/ }).click()
  await firstPage.getByLabel('Чтение').selectOption('cormorant')
  await firstPage.getByRole('button', { name: 'L', exact: true }).click()
  await firstPage.waitForTimeout(1100)
  await first.close()

  const second = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await second.newPage()
  await page.goto(READER)
  const text = page.locator('p[class*="text"]').first()
  await expect(text).toBeVisible({ timeout: 30000 })
  await expect
    .poll(async () => (await text.evaluate((element) => getComputedStyle(element).fontFamily)).toLowerCase(), {
      timeout: 30000,
    })
    .toContain('cormorant')
  expect(await text.evaluate((element) => getComputedStyle(element).fontSize)).toBe('22px')
  await second.close()
})

test('text size buttons update the preview', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: /Шрифты/ }).click()
  const sample = page.locator('div[class*="fontSample"]')
  await page.getByRole('button', { name: 'L', exact: true }).click()
  await expect(page.getByText('Размер текста · 22px')).toBeVisible()
  await expect.poll(async () => sample.evaluate((element) => getComputedStyle(element).fontSize)).toBe('22px')
  await page.getByRole('button', { name: 'S', exact: true }).click()
  await expect(page.getByText('Размер текста · 17px')).toBeVisible()
  await expect.poll(async () => sample.evaluate((element) => getComputedStyle(element).fontSize)).toBe('17px')
  await page.getByRole('button', { name: 'M', exact: true }).click()
  await expect(page.getByText('Размер текста · 19px')).toBeVisible()
})

test('resetting the theme restores the defaults', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: 'Настроить цвета' }).click()
  const dialog = page.getByRole('dialog', { name: 'Оформление' })
  await dialog.getByRole('button', { name: 'Сбросить оформление' }).click()
  await page.waitForTimeout(900)
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await page.goto('http://localhost:5173/chat')
  await expect.poll(() => accent(page)).toBe('#3b82f6')
  await page.goto(READER)
  const text = page.locator('p[class*="text"]').first()
  await expect(text).toBeVisible({ timeout: 30000 })
  await expect
    .poll(async () => text.evaluate((element) => getComputedStyle(element).fontSize), { timeout: 30000 })
    .toBe('19px')
})
