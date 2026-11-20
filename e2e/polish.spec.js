const { test, expect } = require('@playwright/test')

test.use({ viewport: { width: 430, height: 900 } })

async function findCard(page, title) {
  await page.locator('article').first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => undefined)
  await page.waitForTimeout(400)
  const next = page.locator('button[aria-label="Дальше"]')
  for (let index = 0; index < 10; index += 1) {
    const card = page.locator('article', { hasText: title }).first()
    if (await card.count()) return card
    if (!(await next.count()) || (await next.isDisabled())) break
    await next.click()
    await page.waitForTimeout(600)
  }
  return page.locator('article', { hasText: title }).first()
}

test('after cancel the chat is ready for a new request', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('http://localhost:5173/chat')
  await page.getByPlaceholder('Тема и время чтения').fill('PW Cancel Polish, 60 минут')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled({ timeout: 30000 })
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'Отменить' }).first().click()
  await page.getByRole('dialog', { name: 'Остановить генерацию?' }).getByRole('button', { name: 'Остановить' }).click()

  const input = page.getByPlaceholder('Тема и время чтения')
  await expect(input).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('Собираю текст…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeEnabled()

  await input.fill('PW Second Chat, 5 минут')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByRole('button', { name: 'Отправить' })).toBeDisabled({ timeout: 30000 })
  await page.getByRole('button', { name: 'Отменить' }).first().click()
  await page.getByRole('dialog', { name: 'Остановить генерацию?' }).getByRole('button', { name: 'Остановить' }).click()
  await expect(input).toBeVisible({ timeout: 30000 })

  await page.reload()
  await expect(page.getByText('Сейчас выполняется: PW Second Chat')).toHaveCount(0, { timeout: 30000 })
  await expect(page.getByPlaceholder('Тема и время чтения')).toBeVisible({ timeout: 30000 })
})

test('published texts show a badge instead of the delete note', async ({ page }) => {
  await page.goto('http://localhost:5173/chat')
  const result = page.locator('article', { hasText: 'Mario and Pizza' }).first()
  await expect(result).toBeVisible({ timeout: 30000 })
  await expect(result.getByText('В библиотеке', { exact: true })).toBeVisible()
  await expect(result.getByText('В библиотеке — удалить нельзя')).toHaveCount(0)
  await expect(result.getByRole('button', { name: 'Удалить' })).toHaveCount(0)
  await expect(result.locator('[title*="Текст опубликован"]')).toBeVisible()

  await page.goto('http://localhost:5173/')
  const card = await findCard(page, 'Mario and Pizza')
  await expect(card).toBeVisible({ timeout: 30000 })
  await expect(card.getByText('В библиотеке', { exact: true })).toBeVisible()
})
