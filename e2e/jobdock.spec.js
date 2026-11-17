const { test, expect } = require('@playwright/test')

test.setTimeout(240000)

test('chat generation continues in the dock after leaving chat', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto('http://localhost:5173/chat')
  await page.getByPlaceholder('Тема и время чтения').fill('JobDock UI test about a dog, 2 минуты')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText('JobDock UI test about a dog, 2 минут')).toBeVisible({ timeout: 30000 })
  await page.goto('http://localhost:5173/')
  await expect(page.getByText('JobDock UI test about a dog', { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('link', { name: 'Открыть текст' })).toBeVisible({ timeout: 180000 })
  expect(errors).toEqual([])
  await context.close()
})
