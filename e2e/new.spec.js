const { test, expect } = require('@playwright/test')

test.use({ viewport: { width: 420, height: 900 } })

async function openCard(page, lemma) {
  for (let index = 0; index < 60; index += 1) {
    const heading = page.locator('h2').first()
    await expect(heading).toBeVisible({ timeout: 30000 })
    if ((await heading.innerText()).trim() === lemma) return
    const know = page.getByRole('button', { name: 'Знаю', exact: true })
    if (!(await know.count())) break
    await know.click()
    await page.waitForTimeout(700)
  }
  await expect(page.getByRole('heading', { name: lemma }).first()).toBeVisible({ timeout: 30000 })
}

test('pager shows five pages and accepts a typed page', async ({ page }) => {
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  const pager = page.locator('div[class*="Pager_pager"]')
  await expect(pager).toBeVisible({ timeout: 30000 })
  await expect(pager.locator('button').filter({ hasText: /^\d+$/ })).toHaveCount(5)
  const input = pager.getByLabel('Номер страницы')
  await input.fill('3')
  await input.press('Enter')
  await expect(pager.getByRole('button', { name: '3', exact: true })).toHaveClass(/on/, { timeout: 30000 })
})

test('star saves a word together with its sentence and removes it again', async ({ page }) => {
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  const token = page.locator('p button').first()
  await expect(token).toBeVisible({ timeout: 30000 })
  await token.click()
  await token.click()
  const star = page.getByRole('button', { name: /В словарь|Убрать из словаря/ })
  await expect(star).toBeVisible({ timeout: 30000 })
  const startedSaved = (await star.getAttribute('aria-label')) === 'Убрать из словаря'
  if (startedSaved) {
    await star.click()
    const dialog = page.getByRole('dialog', { name: 'Убрать слово из словаря?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Убрать' }).click()
    await expect(page.getByText('Убрано из словаря')).toBeVisible()
    await token.click()
    await token.click()
    await page.getByRole('button', { name: 'В словарь' }).click()
    await expect(page.getByText('Добавлено в «Свои слова»')).toBeVisible()
  } else {
    await star.click()
    await expect(page.getByText('Добавлено в «Свои слова»')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Убрать из словаря' })).toBeVisible()
    await page.getByRole('button', { name: 'Убрать из словаря' }).click()
    const dialog = page.getByRole('dialog', { name: 'Убрать слово из словаря?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Убрать' }).click()
    await expect(page.getByText('Убрано из словаря')).toBeVisible()
    await token.click()
    await token.click()
    await page.getByRole('button', { name: 'В словарь' }).click()
    await expect(page.getByText('Добавлено в «Свои слова»')).toBeVisible()
  }
})

test('text page aligns ready english and russian', async ({ page }) => {
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Название').fill('PW Parallel Test')
  await page.getByLabel('Английский текст').fill('The duck lived by the lake.\n\nIt was a quiet morning.')
  await page.getByLabel('Русский текст').fill('Утка жила у озера.\n\nЭто было тихое утро.')
  await expect(page.getByText('система только соотнесёт их', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Добавить текст' }).click()
  await page.waitForURL('http://localhost:5173/', { timeout: 60000 })
  const card = page.locator('article', { hasText: 'PW Parallel Test' }).first()
  await expect(card).toBeVisible({ timeout: 90000 })
  const href = await card.locator('a').first().getAttribute('href')
  expect(href).toContain('/read/')
  await page.goto(`http://localhost:5173${href}`)
  await expect(page.getByText('The duck lived by the lake.', { exact: false })).toBeVisible({ timeout: 30000 })
})

test('text page keeps the 200k limit', async ({ page }) => {
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Английский текст').fill('a'.repeat(200001))
  await expect(page.getByText('200 001 / 200 000')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Добавить текст' })).toBeDisabled()
})

test('last page has a finish button', async ({ page }) => {
  await page.goto('http://localhost:5173/read/0f36f4fd-775d-4966-a05f-866b1cf1208c')
  const pager = page.locator('div[class*="Pager_pager"]')
  const input = pager.getByLabel('Номер страницы')
  await input.fill('11')
  await input.press('Enter')
  const finish = pager.getByRole('button', { name: 'Завершить' })
  await expect(finish).toBeVisible({ timeout: 30000 })
  await finish.click()
  await expect(page.getByText('Текст прочитан')).toBeVisible({ timeout: 30000 })
})

test('manual text requires a title', async ({ page }) => {
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  await page.getByLabel('Английский текст').fill('Hello world.')
  const submit = page.getByRole('button', { name: 'Добавить текст' })
  await expect(submit).toBeDisabled()
  await page.getByLabel('Название').fill('PW Title Required')
  await expect(submit).toBeEnabled()
})

test('manual fields grow up to double height', async ({ page }) => {
  await page.goto('http://localhost:5173/text')
  await page.getByRole('button', { name: 'Добавить текст вручную' }).click()
  const area = page.getByLabel('Английский текст')
  const base = await area.evaluate((element) => element.clientHeight)
  await area.fill(Array.from({ length: 30 }, (_, index) => `line ${index}`).join('\n'))
  const grown = await area.evaluate((element) => element.clientHeight)
  expect(grown).toBeGreaterThan(base)
  expect(grown).toBeLessThanOrEqual(337)
})

test('file without title gets a title from the text', async ({ page }) => {
  await page.goto('http://localhost:5173/text')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'fallback.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('PW fallback title test sentence. Second sentence follows.'),
  })
  await expect(page.getByLabel('Название')).toHaveValue('')
  await page.getByRole('button', { name: 'Загрузить книгу' }).click()
  await page.waitForURL('http://localhost:5173/', { timeout: 60000 })
  await expect(page.getByRole('heading', { name: 'PW fallback title test sentence' })).toBeVisible({
    timeout: 90000,
  })
})

test('settings show system info', async ({ page }) => {
  await page.goto('http://localhost:5173/settings')
  await page.getByRole('button', { name: 'Справка', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Справка' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'О системе' }).click()
  await expect(dialog.getByText('Сервис текстов')).toBeVisible()
  await expect(dialog.getByText(/Доступен/)).toBeVisible({ timeout: 30000 })
  await expect(dialog.getByText('Словарь', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).last().click()
  await expect(dialog).toHaveCount(0)
})

test('training card shows the saved text example', async ({ page }) => {
  await page.goto('http://localhost:5173/study?mode=learn&packs=own&daily=60')
  await openCard(page, 'that')
  await page.getByRole('button', { name: 'Показать подсказку' }).click()
  await expect(page.getByText('Из вашего текста')).toBeVisible()
  await expect(page.getByText('PW context check for the first card.')).toBeVisible()
})

test('training card keeps one height and scrolls inside', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 })
  await page.goto('http://localhost:5173/study?mode=learn&packs=own&daily=60')
  await openCard(page, 'that')
  await page.getByRole('button', { name: 'Показать подсказку' }).click()
  await page.waitForTimeout(600)
  const info = await page.evaluate(() => {
    const faces = Array.from(document.querySelectorAll('div[class*="face"]'))
    const back = document.querySelector('div[class*="back"]')
    const actions = document.querySelector('.actions')
    const nav = document.querySelector('nav')
    return {
      heights: faces.map((face) => Math.round(face.getBoundingClientRect().height)),
      backScroll: back ? back.scrollHeight : 0,
      backClient: back ? back.clientHeight : 0,
      actionsBottom: actions ? Math.round(actions.getBoundingClientRect().bottom) : 0,
      navTop: nav ? Math.round(nav.getBoundingClientRect().top) : window.innerHeight,
      viewport: window.innerHeight,
      body: document.body.scrollHeight,
    }
  })
  expect(new Set(info.heights).size).toBe(1)
  expect(info.backScroll).toBeGreaterThan(info.backClient)
  expect(info.navTop - info.actionsBottom).toBeGreaterThanOrEqual(50)
  expect(info.body).toBe(info.viewport)
  const back = page.locator('div[class*="back"]')
  await back.evaluate((element) => { element.scrollTop = 100 })
  await expect.poll(() => back.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
})
