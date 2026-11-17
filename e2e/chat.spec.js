const { test, expect } = require('@playwright/test')

test('chat generation completes through job polling', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://localhost:5173/chat')
  const input = page.getByPlaceholder('Тема и время чтения')
  await input.fill('ZZZ UI chat test about a cat, 2 минуты')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText(/Собираю текст/)).toBeVisible({ timeout: 30000 })
  await expect(page.locator('a', { hasText: 'Читать' }).first()).toBeVisible({ timeout: 180000 })
  expect(errors).toEqual([])
  await context.close()
})
