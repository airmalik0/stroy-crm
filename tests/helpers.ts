import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
const password = process.env.DEMO_PASSWORD ?? 'local-demo-pass'

if (!url || !key) {
  throw new Error('Нужны VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY: запустите npm run local или задайте их вручную')
}

// Те же адрес и публичный ключ, что у браузера. Никаких служебных ключей:
// тест делает ровно то, что может сделать любой с этим ключом в обход интерфейса.
export const anonClient = (): SupabaseClient =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

export async function signIn(email: string): Promise<{ db: SupabaseClient; id: string }> {
  const db = anonClient()
  const { data, error } = await db.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Не удалось войти как ${email}: ${error.message}`)
  return { db, id: data.user.id }
}

export type Status = 'new' | 'in_progress' | 'review' | 'accepted' | 'rework'
