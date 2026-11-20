import { defineConfig, devices } from '@playwright/test'

const textPort = process.env.TEXT_SERVICE_PORT || '8000'
const python = process.platform === 'win32'
  ? '.venv\\Scripts\\python.exe run.py'
  : '.venv/bin/python run.py'

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    storageState: 'e2e/.auth/user.json',
    viewport: { width: 430, height: 900 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 900 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:5173/login',
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: python,
      cwd: './text-service',
      url: `http://127.0.0.1:${textPort}/health`,
      env: { TEXT_SERVICE_PORT: textPort },
      reuseExistingServer: true,
      timeout: 180_000,
    },
  ],
})
