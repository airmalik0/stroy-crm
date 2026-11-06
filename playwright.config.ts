import { defineConfig } from '@playwright/test'
import { loadEnv } from 'vite'

// Пароль демо-пользователей: переменная окружения или .env.local. Если нет, в тесте берётся локальный.
const { DEMO_PASSWORD } = loadEnv('', process.cwd(), 'DEMO_')
if (DEMO_PASSWORD) process.env.DEMO_PASSWORD = DEMO_PASSWORD

const externalUrl = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: externalUrl ?? 'http://localhost:5173',
    locale: 'ru-RU',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalUrl
    ? undefined
    : { command: 'npx vite', url: 'http://localhost:5173', reuseExistingServer: true },
})
