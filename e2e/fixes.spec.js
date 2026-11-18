const { test, expect } = require('@playwright/test')

test.use({ viewport: { width: 430, height: 900 } })

const LONG = Array.from(
  { length: 300 },
  (_, i) => `Sentence number ${i} talks about a quiet lake and a small duck that likes to swim in the morning.`,
).join(' ')

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

test('cancel an import from the dock', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Название').fill('PW Cancel Test')
  await page.getByLabel('Английский текст').fill(LONG)
  await page.getByRole('button', { name: 'Добавить текст' }).click()
  await page.waitForURL('http://localhost:5173/', { timeout: 60000 })
  await expect(page.getByText('PW Cancel Test').first()).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Отменить' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Остановить загрузку?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Остановить' }).click()
  await expect(page.getByText('Загрузка отменена')).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('PW Cancel Test')).toHaveCount(0, { timeout: 30000 })
})

test('reload during upload restores the server job and can cancel it', async ({ page }) => {
  test.setTimeout(120000)
  await page.route('**/v1/jobs/import/file', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15000))
    await route.abort()
  })
  await page.goto('http://localhost:5173/text')
  await page.getByLabel('Название').fill('PW Reload Upload')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'reload.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('The duck lived by the lake. It was a quiet morning.'),
  })
  await page.getByRole('button', { name: 'Загрузить книгу' }).click()
  await expect(page.getByText('Сейчас выполняется: PW Reload Upload')).toBeVisible({ timeout: 30000 })
  await page.reload()
  await expect(page.getByText('Сейчас выполняется: PW Reload Upload')).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Отменить' }).first().click()
  await page.getByRole('dialog', { name: 'Остановить загрузку?' }).getByRole('button', { name: 'Остановить' }).click()
  await expect(page.locator('input[type="file"]')).toBeVisible({ timeout: 60000 })
})

test('chunk size is stored in the browser', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: /Перевод/ }).click()
  await page.getByRole('button', { name: 'Предложения' }).click()
  const stored = await page.evaluate(() => localStorage.getItem('paralbook.translation.v1'))
  expect(JSON.parse(stored)).toEqual({ unit: 'sentences', size: 3 })
  await page.reload()
  await page.getByRole('button', { name: /Перевод/ }).click()
  await expect(page.getByRole('button', { name: 'Предложения' })).toHaveClass(/on/)
  await expect(page.locator('b').filter({ hasText: '3 предл.' })).toBeVisible()
  await page.getByRole('button', { name: 'Токены' }).click()
})

test('published text cannot be deleted from chat', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:5173/')
  const card = await findCard(page, 'Mario and Pizza')
  await expect(card).toBeVisible({ timeout: 30000 })
  if (await card.getByRole('button', { name: 'Опубликовать в библиотеку' }).count()) {
    await card.getByRole('button', { name: 'Опубликовать в библиотеку' }).click()
    await page.getByRole('dialog', { name: 'Опубликовать текст?' }).getByRole('button', { name: 'Опубликовать' }).click()
    await expect(page.getByText('Текст опубликован')).toBeVisible({ timeout: 30000 })
  }
  await page.goto('http://localhost:5173/chat')
  const result = page.locator('article', { hasText: 'Mario and Pizza' }).first()
  await expect(result).toBeVisible({ timeout: 30000 })
  await expect(result.getByText('В библиотеке', { exact: true })).toBeVisible()
  await expect(result.getByRole('button', { name: 'Удалить' })).toHaveCount(0)
})

test('rapid page changes keep the last page', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  const pager = page.locator('div[class*="Pager_pager"]')
  await expect(pager).toBeVisible({ timeout: 30000 })
  await pager.getByRole('button', { name: '3', exact: true }).click()
  await pager.getByRole('button', { name: '4', exact: true }).click()
  await expect(pager.getByRole('button', { name: '4', exact: true })).toHaveClass(/on/, { timeout: 30000 })
})

test('cancel chat generation', async ({ page }) => {
  test.setTimeout(120000)
  await page.goto('http://localhost:5173/chat')
  await page.getByPlaceholder('Тема и время чтения').fill('PW Cancel Chat, 60 минут')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText('Сейчас выполняется: PW Cancel Chat')).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Отменить' }).first().click()
  await page.getByRole('dialog', { name: 'Остановить генерацию?' }).getByRole('button', { name: 'Остановить' }).click()
  await expect(page.getByText('Генерация отменена')).toBeVisible({ timeout: 30000 })
  await expect(page.getByPlaceholder('Тема и время чтения')).toBeVisible({ timeout: 30000 })
})
