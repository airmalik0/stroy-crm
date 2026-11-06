import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Адрес и публичный ключ те же, что у браузера: .env.local или переменные окружения.
    env: loadEnv('', process.cwd(), ['VITE_', 'DEMO_']),
  },
})
