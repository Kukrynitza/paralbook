const { test, expect } = require('@playwright/test')

test('chat page polls a new generation to completion', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://localhost:5173/chat')
  const before = await page.getByRole('link', { name: 'Читать' }).count()
  await page.getByPlaceholder('Тема и время чтения').fill('ZZZ polling test about a fox, 1 минута')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText(/Собираю текст/)).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => page.getByRole('link', { name: 'Читать' }).count(), { timeout: 180000 }).toBeGreaterThan(before)
  await expect(page.getByText('Собираю текст', { exact: false })).toBeHidden({ timeout: 30000 })
  expect(errors).toEqual([])
  await context.close()
})
