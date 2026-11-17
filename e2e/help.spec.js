import { expect, test } from '@playwright/test'

test('help has instruction and system tabs', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: 'Справка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Справка' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Что это', { exact: true })).toBeVisible()
  await expect(dialog.getByText('С чего начать', { exact: true })).toBeVisible()
  await dialog.getByText('Ограничения', { exact: true }).click()
  await expect(dialog.getByText('200 000 символов')).toBeVisible()
  await dialog.getByRole('button', { name: 'О системе' }).click()
  await expect(dialog.getByText('Сервис текстов')).toBeVisible()
  await expect(dialog.getByText(/Доступен/)).toBeVisible({ timeout: 30000 })
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await expect(dialog).toHaveCount(0)
})

test('collection header opens the add page', async ({ page }) => {
  await page.goto('http://localhost:5173/')
  await page.getByRole('link', { name: 'Добавить текст' }).click()
  await expect(page).toHaveURL('http://localhost:5173/text')
})

test('help scrolls on a phone and keeps the footer available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: 'Справка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Справка' })
  const body = dialog.locator('div[class*="body"]').first()
  const metrics = await body.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }))
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight)
  await body.evaluate((element) => element.scrollTo(0, element.scrollHeight))
  await expect(dialog.getByRole('button', { name: 'Закрыть', exact: true }).last()).toBeInViewport()
  await dialog.getByRole('button', { name: 'О системе' }).click()
  await expect(dialog.getByRole('button', { name: 'Скопировать сведения' })).toBeInViewport()
})
