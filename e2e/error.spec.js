const { test, expect } = require('@playwright/test')

test.use({ viewport: { width: 430, height: 900 } })

test('failed import shows an error card with retry and can be dismissed', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Название').fill('PW Error Test')
  await page.getByLabel('Английский текст').fill('short')
  await page.getByRole('button', { name: 'Добавить текст' }).click()
  await expect(page).toHaveURL('http://localhost:5173/', { timeout: 60000 })
  const card = page.locator('div[class*="JobDock_card"]').filter({ hasText: 'В файле слишком мало текста' }).first()
  await expect(card).toBeVisible({ timeout: 60000 })
  await expect(card.getByRole('button', { name: 'Повторить' })).toBeVisible()
  await card.getByRole('button', { name: 'Скрыть' }).click()
  await expect(card).toHaveCount(0)
})
