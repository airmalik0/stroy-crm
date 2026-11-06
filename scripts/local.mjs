// Полный локальный запуск одной командой: своя база в Docker, миграции, демо-данные, интерфейс.
import { execFileSync, spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const supabase = (...args) =>
  execFileSync('npx', ['supabase', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })

console.log('Запускаю Supabase в Docker. Первый раз скачиваются образы, это несколько минут.')
supabase('start')

console.log('Применяю миграции и демо-данные.')
supabase('db', 'reset')

const status = supabase('status', '-o', 'env')
const read = (name) => status.match(new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm'))?.[1]
const url = read('API_URL')
const key = read('PUBLISHABLE_KEY') ?? read('ANON_KEY')
if (!url || !key) throw new Error('Не удалось прочитать адрес и ключ из supabase status')

writeFileSync('.env.local', `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`)

console.log(`
Готово: http://localhost:5173
Постановщики: manager1@example.com, manager2@example.com
Исполнители:  executor1@example.com, executor2@example.com
Пароль у всех: local-demo-pass
`)

spawn('npx', ['vite'], { stdio: 'inherit' }).on('exit', (code) => process.exit(code ?? 0))
