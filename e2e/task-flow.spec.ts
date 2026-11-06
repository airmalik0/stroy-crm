// Сквозной сценарий через настоящий интерфейс: задача проходит весь цикл статусов,
// на каждом шаге проверяется, какие кнопки видит текущий пользователь.
import { expect, test, type Page } from '@playwright/test'

const PASSWORD = process.env.DEMO_PASSWORD ?? 'local-demo-pass'
const MANAGER_1 = 'manager1@example.com'
const MANAGER_2 = 'manager2@example.com'
const EXECUTOR_1 = 'executor1@example.com'
const EXECUTOR_2 = 'executor2@example.com'
const EXECUTOR_1_NAME = 'Дмитрий Ковалёв'

const ALL_ACTIONS = ['Взять в работу', 'Отправить на проверку', 'Принять', 'Вернуть на доработку']

async function login(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByRole('textbox', { name: 'Пароль' }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByTestId('current-user')).toBeVisible()
}

async function logout(page: Page) {
  await page.getByRole('button', { name: 'Выйти' }).click()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()
}

async function asUser(page: Page, email: string, url: string, steps: () => Promise<void>) {
  await login(page, email)
  await page.goto(url)
  await steps()
  await logout(page)
}

// Видны ровно эти действия, остальных на экране нет.
async function expectActions(page: Page, expected: string[]) {
  for (const action of ALL_ACTIONS) {
    const button = page.getByRole('button', { name: action })
    if (expected.includes(action)) await expect(button).toBeVisible()
    else await expect(button).toHaveCount(0)
  }
}

async function expectStatus(page: Page, status: string) {
  await expect(page.locator('main').getByText(status, { exact: true }).first()).toBeVisible()
}

async function act(page: Page, action: string, comment?: string) {
  if (comment) await page.getByLabel('Комментарий').fill(comment)
  await page.getByRole('button', { name: action }).click()
}

test('задача проходит полный цикл, каждый видит только свои действия', async ({ page }) => {
  const suffix = Date.now()
  const objectName = `Объект e2e ${suffix}`
  const taskTitle = `Задача e2e ${suffix}`
  let objectUrl = ''
  let taskUrl = ''

  await test.step('постановщик создаёт объект и задачу', async () => {
    await login(page, MANAGER_1)
    await page.getByRole('button', { name: 'Добавить объект' }).click()
    const objectDialog = page.getByRole('dialog')
    await objectDialog.getByLabel('Название').fill(objectName)
    await objectDialog.getByLabel('Адрес').fill('г. Тестовый, ул. Сквозная, 1')
    await objectDialog.getByRole('button', { name: 'Сохранить' }).click()

    await page.getByRole('link', { name: objectName }).click()
    await expect(page.getByRole('heading', { name: objectName })).toBeVisible()
    objectUrl = page.url()

    await page.getByRole('button', { name: 'Добавить задачу' }).click()
    const taskDialog = page.getByRole('dialog')
    await taskDialog.getByLabel('Название').fill(taskTitle)
    await taskDialog.getByLabel('Описание').fill('Проверка сквозного сценария')
    await taskDialog.getByRole('combobox', { name: 'Исполнитель' }).click()
    await page.getByRole('option', { name: EXECUTOR_1_NAME }).click()
    await taskDialog.getByRole('button', { name: 'Сохранить' }).click()

    await page.getByRole('link', { name: taskTitle }).click()
    await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible()
    taskUrl = page.url()
    await expectStatus(page, 'Новая')
    await expect(page.getByTestId('task-history')).toContainText('Создана, статус Новая')
    // Брать задачу в работу может только исполнитель.
    await expectActions(page, [])
    await logout(page)
  })

  await test.step('чужой исполнитель не видит ни задачу, ни объект', async () => {
    await login(page, EXECUTOR_2)
    await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
    await expect(page.getByText(taskTitle)).toHaveCount(0)

    await page.goto(taskUrl)
    await expect(page.getByText('Задача не найден(а)')).toBeVisible()
    await page.goto(objectUrl)
    await expect(page.getByText('Объект не найден(а)')).toBeVisible()
    await logout(page)
  })

  await test.step('исполнитель берёт задачу и отправляет на проверку', async () => {
    await login(page, EXECUTOR_1)
    await expect(page.getByRole('heading', { name: 'Мои задачи' })).toBeVisible()
    await page.getByRole('link', { name: taskTitle }).click()
    await expectStatus(page, 'Новая')
    await expectActions(page, ['Взять в работу'])
    // Править и удалять исполнитель не может.
    await expect(page.getByRole('button', { name: 'Изменить' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Удалить' })).toHaveCount(0)

    await act(page, 'Взять в работу')
    await expectActions(page, ['Отправить на проверку'])
    await expectStatus(page, 'В работе')

    await act(page, 'Отправить на проверку', 'Сделано, проверьте')
    await expectActions(page, [])
    await expectStatus(page, 'На проверке')

    await page.getByRole('link', { name: 'Объекты' }).click()
    await expect(page.getByRole('button', { name: 'Добавить объект' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: objectName })).toBeVisible()
    await logout(page)
  })

  await test.step('другой постановщик возвращает: без комментария нельзя', async () => {
    await asUser(page, MANAGER_2, taskUrl, async () => {
      await expectActions(page, ['Принять', 'Вернуть на доработку'])

      await act(page, 'Вернуть на доработку')
      await expect(page.getByText('Напишите, что нужно исправить')).toBeVisible()
      await expectStatus(page, 'На проверке')

      await act(page, 'Вернуть на доработку', 'Переделать узел примыкания')
      await expectStatus(page, 'На доработке')
      await expectActions(page, [])
    })
  })

  await test.step('исполнитель видит причину возврата и отправляет снова', async () => {
    await asUser(page, EXECUTOR_1, taskUrl, async () => {
      await expect(page.getByTestId('task-history')).toContainText('Переделать узел примыкания')
      await expectActions(page, ['Взять в работу'])
      await act(page, 'Взять в работу')
      await expectActions(page, ['Отправить на проверку'])
      await act(page, 'Отправить на проверку')
      await expectStatus(page, 'На проверке')
    })
  })

  await test.step('постановщик принимает, правит и удаляет', async () => {
    await asUser(page, MANAGER_1, taskUrl, async () => {
      await act(page, 'Принять')
      await expectStatus(page, 'Принята')
      await expectActions(page, [])

      const history = page.getByTestId('task-history')
      for (const line of [
        'Создана, статус Новая',
        'Новая → В работе',
        'В работе → На проверке',
        'На проверке → На доработке',
        'На доработке → В работе',
        'На проверке → Принята',
      ]) {
        await expect(history).toContainText(line)
      }

      await page.getByRole('button', { name: 'Изменить' }).click()
      const dialog = page.getByRole('dialog')
      await dialog.getByLabel('Название').fill(`${taskTitle} (правка)`)
      await dialog.getByRole('button', { name: 'Сохранить' }).click()
      await expect(page.getByRole('heading', { name: `${taskTitle} (правка)` })).toBeVisible()

      await page.getByRole('button', { name: 'Удалить' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
      await expect(page.getByRole('heading', { name: objectName })).toBeVisible()
      await expect(page.getByText(taskTitle)).toHaveCount(0)

      await page.getByRole('button', { name: 'Удалить' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Удалить' }).click()
      await expect(page.getByRole('heading', { name: 'Объекты', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: objectName })).toHaveCount(0)
    })
  })
})

test('неверный пароль не пускает, регистрации в интерфейсе нет', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(MANAGER_1)
  await page.getByRole('textbox', { name: 'Пароль' }).fill('wrong-password')
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByText('Неверный email или пароль')).toBeVisible()
  await expect(page.getByRole('button', { name: /регистр/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /регистр/i })).toHaveCount(0)
})
