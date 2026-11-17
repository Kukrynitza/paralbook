import { expect, test } from '@playwright/test'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization,content-type',
  'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
}

const NO_KEY = {
  baseUrl: null,
  model: null,
  hasKey: false,
  keyHint: null,
  source: 'none',
  envModel: null,
  tableReady: true,
}

const ENV_KEY = { ...NO_KEY, source: 'env', envModel: 'gpt-4o-mini' }

async function mockSettings(page, settings) {
  await page.route('**/v1/llm/settings', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS })
      return
    }
    await route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(settings),
    })
  })
}

test('without a key the text page warns and blocks a file', async ({ page }) => {
  await mockSettings(page, NO_KEY)
  await page.goto('http://localhost:5173/text')
  await expect(page.getByText(/не указан API-ключ/)).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'PW nokey.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('A short english text for the no key check.'),
  })
  await page.getByRole('button', { name: 'Загрузить книгу' }).click()
  await expect(page.getByText('Без API-ключа нельзя перевести текст')).toBeVisible()
  await expect(page).toHaveURL('http://localhost:5173/text')
})

test('without a key a single language is blocked in manual input', async ({ page }) => {
  await mockSettings(page, NO_KEY)
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Название').fill('PW nokey manual')
  await page.getByLabel('Английский текст').fill('The duck lived by the lake.')
  await page.getByRole('button', { name: 'Добавить текст' }).click()
  await expect(page.getByText('Без API-ключа нельзя перевести текст')).toBeVisible()
  await expect(page).toHaveURL('http://localhost:5173/text')
})

test('without a key the chat does not start generation', async ({ page }) => {
  await mockSettings(page, NO_KEY)
  await page.goto('http://localhost:5173/chat')
  await expect(page.getByText(/не указан API-ключ/)).toBeVisible()
  await page.getByPlaceholder('Тема и время чтения').fill('PW nokey chat')
  await page.getByRole('button', { name: 'Отправить' }).click()
  await expect(page.getByText('Без API-ключа нельзя сгенерировать текст')).toBeVisible()
  await expect(page).toHaveURL('http://localhost:5173/chat')
})

test('a configured key keeps the notice away', async ({ page }) => {
  await mockSettings(page, ENV_KEY)
  await page.goto('http://localhost:5173/text')
  await expect(page.getByRole('button', { name: 'Загрузить книгу' })).toBeVisible()
  await expect(page.getByText(/не указан API-ключ/)).toHaveCount(0)
})

test('a ready pair of texts is accepted without a key', async ({ page }) => {
  test.setTimeout(180000)
  await mockSettings(page, NO_KEY)
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Название').fill('PW nokey pair')
  await page.getByLabel('Английский текст').fill('The duck lived by the lake. It was a quiet morning.')
  await page.getByLabel('Русский текст').fill('Утка жила у озера. Это было тихое утро.')
  await page.getByRole('button', { name: 'Добавить текст' }).click()
  await page.waitForURL('http://localhost:5173/', { timeout: 60000 })
  await expect(page.locator('article', { hasText: 'PW nokey pair' }).first()).toBeVisible({ timeout: 90000 })
})
