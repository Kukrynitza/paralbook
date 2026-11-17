const { test, expect } = require('@playwright/test')

test('stale local job is removed on reload', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'e2e/.auth/user.json' })
  const page = await context.newPage()
  await page.goto('http://localhost:5173/')
  await page.evaluate(() => {
    localStorage.setItem('paralbook.jobs.v1', JSON.stringify([{
      id: 'stale-fake-job',
      textId: 'stale-fake-text',
      type: 'chat',
      title: 'Marshall 4 stale',
      status: 'running',
      stage: 'generating',
      progress: 22,
      error: null,
    }]))
  })
  await page.reload()
  await expect(page.getByText('Marshall 4 stale')).toBeHidden({ timeout: 30000 })
  await context.close()
})
