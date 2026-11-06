# Объекты и задачи

Мини-CRM для строительной компании: постановщик ставит задачи по объектам, исполнитель выполняет их и отдаёт на проверку. React, TypeScript, Mantine, Supabase. Права, переходы статусов и история держатся в базе и работают в обход интерфейса.

- **Демо:** https://stroy-crm-demo.vercel.app (доступы в сообщении со сдачей)
- **Для руководителя, без терминов:** [docs/for-manager.md](docs/for-manager.md)
- **Решения и допущения:** [docs/decisions.md](docs/decisions.md)

## Запуск одной командой

Нужны Node.js 20+ и запущенный Docker.

```bash
npm install && npm run local
```

Команда поднимает Supabase в Docker, применяет миграции, загружает демо-данные и запускает интерфейс на http://localhost:5173. Первый запуск скачивает образы Supabase и может занять несколько минут. Каждый запуск возвращает локальную базу в исходное состояние.

| Роль | Email | Пароль |
|---|---|---|
| Постановщик | `manager1@example.com`, `manager2@example.com` | `local-demo-pass` |
| Исполнитель | `executor1@example.com`, `executor2@example.com` | `local-demo-pass` |

Без Docker, на демо-базе: `cp .env.example .env.local && npm install && npm run dev`. Пароли в этом случае из сообщения со сдачей.

## Проверка

```bash
npm run test:security  # 124 прямых запроса к API от имени настоящих пользователей
npm run test:db        # 13 проверок внутри базы: RLS, права на колонки, неизменяемость истории
npm run test:e2e       # полный цикл задачи через интерфейс в браузере
```

Тесты идут к базе из `.env.local`, после `npm run local` это локальная база. Служебный ключ тестам не нужен: у них те же права, что у любого человека с публичным ключом. Те же проверки гоняет [CI](.github/workflows/ci.yml) на каждый push.

Те же тесты на демо-стенде:

```bash
cp .env.example .env.local
DEMO_PASSWORD=<пароль из сообщения> npm run test:security
DEMO_PASSWORD=<пароль из сообщения> E2E_BASE_URL=https://stroy-crm-demo.vercel.app npm run test:e2e
```

### Проверить руками в обход интерфейса

Адрес и ключ в `.env.example`. Здесь исполнитель пытается обойти правила:

```bash
source .env.example; URL=$VITE_SUPABASE_URL; KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
JSON=(-H "apikey: $KEY" -H "Content-Type: application/json")
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" "${JSON[@]}" \
  -d '{"email":"executor1@example.com","password":"<пароль>"}' | jq -r .access_token)
H=("${JSON[@]}" -H "Authorization: Bearer $TOKEN")

# Видны только свои задачи
curl -s "$URL/rest/v1/tasks?select=title,assignee_id" "${H[@]}" | jq

# Статус напрямую: permission denied for table tasks
curl -s -X PATCH "$URL/rest/v1/tasks?status=eq.review" "${H[@]}" -d '{"status":"accepted"}' | jq .message

# Подделка истории: permission denied for table task_status_history
curl -s -X POST "$URL/rest/v1/task_status_history" "${H[@]}" \
  -d '{"task_id":"00000000-0000-4000-8000-000000000000","to_status":"accepted"}' | jq .message

# Регистрация: Signups not allowed for this instance
curl -s "$URL/auth/v1/signup" "${JSON[@]}" -d '{"email":"new@example.com","password":"new-password-1"}' | jq .msg
```

## Где что лежит

| Путь | Что |
|---|---|
| `supabase/migrations/…_schema.sql` | таблицы, таблица разрешённых переходов |
| `supabase/migrations/…_access.sql` | права на колонки и политики RLS |
| `supabase/migrations/…_workflow.sql` | смена статуса, удаление, история, триггеры |
| `tests/security.test.ts` | проверки в обход интерфейса, полная матрица переходов |
| `supabase/tests/database.test.sql` | проверки на уровне базы |
| `e2e/task-flow.spec.ts` | сквозной сценарий через интерфейс |
| `src/` | интерфейс |

## Как добавить пользователя

Открытая регистрация отключена. В Supabase: Authentication, Add user. Профиль создаётся автоматически с ролью исполнителя. Постановщика назначают вручную:

```sql
update public.profiles set role = 'manager' where id = '<id пользователя>';
```

Имя меняется там же, колонка `full_name`.

## Выкат

Миграции: `npx supabase link --project-ref <ref> && npx supabase db push --remote`. Открытую регистрацию нужно отключить и в облачном проекте: Authentication, Sign In / Providers, Allow new users to sign up. Фронтенд: статическая сборка `npm run build`, на Vercel нужны переменные `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY`.
