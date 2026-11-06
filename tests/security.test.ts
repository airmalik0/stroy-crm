// Проверки прав в обход интерфейса: прямые запросы к API Supabase от имени настоящих пользователей.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, signIn, type Status } from './helpers'
import type { SupabaseClient } from '@supabase/supabase-js'

type User = { db: SupabaseClient; id: string }

let manager: User
let manager2: User
let executorA: User
let executorB: User

const TABLES = ['profiles', 'objects', 'tasks', 'task_status_history', 'task_transitions']
const STATUSES: Status[] = ['new', 'in_progress', 'review', 'accepted', 'rework']

let sharedObject: string
let onlyBObject: string
let taskA: string
let taskB: string
let taskOnlyB: string

async function createObject(name = 'Тестовый объект'): Promise<string> {
  const { data, error } = await manager.db
    .from('objects')
    .insert({ name, address: 'Тестовый адрес' })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

async function createTask(objectId: string, assigneeId: string, title = 'Тестовая задача'): Promise<string> {
  const { data, error } = await manager.db
    .from('tasks')
    .insert({ title, object_id: objectId, assignee_id: assigneeId })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id
}

const move = (user: User, taskId: string, to: string, comment?: string) =>
  user.db.rpc('change_task_status', { p_task_id: taskId, p_to_status: to, p_comment: comment })

async function moveOk(user: User, taskId: string, to: Status, comment?: string) {
  const { error } = await move(user, taskId, to, comment)
  if (error) throw new Error(error.message)
}

// Новая задача исполнителя A, доведённая до нужного статуса по разрешённому пути.
async function taskInStatus(status: Status): Promise<string> {
  const id = await createTask(sharedObject, executorA.id, `Задача в статусе ${status}`)
  if (status === 'new') return id
  await moveOk(executorA, id, 'in_progress')
  if (status === 'in_progress') return id
  await moveOk(executorA, id, 'review')
  if (status === 'review') return id
  if (status === 'accepted') await moveOk(manager, id, 'accepted')
  if (status === 'rework') await moveOk(manager, id, 'rework', 'Переделать')
  return id
}

async function statusOf(taskId: string): Promise<Status> {
  const { data, error } = await manager.db.from('tasks').select('status').eq('id', taskId).single()
  if (error) throw new Error(error.message)
  return data.status
}

async function historyOf(taskId: string) {
  const { data, error } = await manager.db
    .from('task_status_history')
    .select('*')
    .eq('task_id', taskId)
    .order('id')
  if (error) throw new Error(error.message)
  return data
}

beforeAll(async () => {
  manager = await signIn('manager1@example.com')
  manager2 = await signIn('manager2@example.com')
  executorA = await signIn('executor1@example.com')
  executorB = await signIn('executor2@example.com')

  sharedObject = await createObject('Тест: общий объект')
  onlyBObject = await createObject('Тест: объект только исполнителя B')
  taskA = await createTask(sharedObject, executorA.id, 'Задача A')
  taskB = await createTask(sharedObject, executorB.id, 'Задача B')
  taskOnlyB = await createTask(onlyBObject, executorB.id, 'Задача B на своём объекте')
})

afterAll(async () => {
  await manager.db.rpc('delete_object', { p_object_id: sharedObject })
  await manager.db.rpc('delete_object', { p_object_id: onlyBObject })
})

describe('Вход: регистрация закрыта, без входа данных нет', () => {
  it('открытая регистрация отключена', async () => {
    const { data, error } = await anonClient().auth.signUp({
      email: `stranger-${Date.now()}@example.com`,
      password: 'stranger-password-1',
    })
    expect(error).not.toBeNull()
    expect(data.user).toBeNull()
  })

  it('анонимный вход отключён', async () => {
    const { error } = await anonClient().auth.signInAnonymously()
    expect(error).not.toBeNull()
  })

  it.each(TABLES)('без входа таблица %s не читается', async (table) => {
    const { data, error } = await anonClient().from(table).select('*')
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('без входа функции не вызываются', async () => {
    const anon = anonClient()
    const calls = [
      anon.rpc('change_task_status', { p_task_id: taskA, p_to_status: 'in_progress' }),
      anon.rpc('available_transitions', { p_task_id: taskA }),
      anon.rpc('delete_task', { p_task_id: taskA }),
      anon.rpc('delete_object', { p_object_id: sharedObject }),
    ]
    for (const { error } of await Promise.all(calls)) expect(error?.code).toBe('42501')
    expect(await statusOf(taskA)).toBe('new')
  })

  it('служебная схема private не опубликована в API', async () => {
    const { error } = await executorA.db.schema('private').rpc('is_manager')
    expect(error).not.toBeNull()
  })
})

describe('Чтение: исполнитель видит только своё', () => {
  it('в общем объекте исполнитель видит только свою задачу', async () => {
    const { data } = await executorA.db.from('tasks').select('id').eq('object_id', sharedObject)
    const ids = data!.map((row) => row.id)
    expect(ids).toContain(taskA)
    expect(ids).not.toContain(taskB)
  })

  it('чужая задача не читается даже по прямому id', async () => {
    const { data, error } = await executorA.db.from('tasks').select('*').eq('id', taskB)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('точное число задач через count тоже не раскрывает чужие', async () => {
    const { count } = await executorA.db
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assignee_id', executorB.id)
    expect(count).toBe(0)
  })

  it('объект виден, только если в нём есть своя задача', async () => {
    const shared = await executorA.db.from('objects').select('id').eq('id', sharedObject)
    const foreign = await executorA.db.from('objects').select('id').eq('id', onlyBObject)
    expect(shared.data).toHaveLength(1)
    expect(foreign.data).toEqual([])
  })

  it('через вложенный запрос объект -> задачи чужое не достать', async () => {
    const { data } = await executorA.db
      .from('objects')
      .select('id, tasks (id)')
      .eq('id', sharedObject)
      .single()
    expect(data!.tasks.map((task: { id: string }) => task.id)).toEqual(
      expect.not.arrayContaining([taskB]),
    )
  })

  it('история чужой задачи не читается', async () => {
    const { data } = await executorA.db.from('task_status_history').select('*').eq('task_id', taskB)
    expect(data).toEqual([])
  })

  it('для чужой задачи нет доступных действий', async () => {
    const { data } = await executorA.db.rpc('available_transitions', { p_task_id: taskB })
    expect(data).toEqual([])
  })

  it('список сотрудников исполнителю недоступен', async () => {
    const { data } = await executorA.db.from('profiles').select('id, role')
    const ids = data!.map((row) => row.id)
    expect(ids).toContain(executorA.id)
    expect(ids).not.toContain(executorB.id)
    expect(data!.filter((row) => row.role === 'executor')).toHaveLength(1)
  })

  it('постановщик видит всё', async () => {
    const tasks = await manager.db.from('tasks').select('id').in('id', [taskA, taskB, taskOnlyB])
    const objects = await manager.db.from('objects').select('id').in('id', [sharedObject, onlyBObject])
    const people = await manager.db.from('profiles').select('id').in('id', [executorA.id, executorB.id])
    expect(tasks.data).toHaveLength(3)
    expect(objects.data).toHaveLength(2)
    expect(people.data).toHaveLength(2)
  })

  it('задача другого постановщика ему тоже видна', async () => {
    const { data } = await manager2.db.from('tasks').select('id').eq('id', taskA)
    expect(data).toHaveLength(1)
  })

  it('после смены исполнителя прежний теряет доступ, новый получает', async () => {
    const id = await createTask(onlyBObject, executorB.id, 'Передаётся другому исполнителю')
    const moved = await manager.db.from('tasks').update({ assignee_id: executorA.id }).eq('id', id)
    expect(moved.error).toBeNull()

    expect((await executorB.db.from('tasks').select('id').eq('id', id)).data).toEqual([])
    expect((await executorA.db.from('tasks').select('id').eq('id', id)).data).toHaveLength(1)
    expect((await executorA.db.from('objects').select('id').eq('id', onlyBObject)).data).toHaveLength(1)

    await manager.db.rpc('delete_task', { p_task_id: id })
    expect((await executorA.db.from('objects').select('id').eq('id', onlyBObject)).data).toEqual([])
  })
})

describe('Запись: исполнитель не меняет данные в обход действий', () => {
  it('не создаёт объект и задачу', async () => {
    const object = await executorA.db.from('objects').insert({ name: 'Взлом', address: 'Взлом' })
    const task = await executorA.db
      .from('tasks')
      .insert({ title: 'Взлом', object_id: sharedObject, assignee_id: executorA.id })
    expect(object.error?.code).toBe('42501')
    expect(task.error?.code).toBe('42501')
  })

  it('не правит поля своей задачи', async () => {
    const { data } = await executorA.db
      .from('tasks')
      .update({ title: 'Взлом', assignee_id: executorB.id })
      .eq('id', taskA)
      .select()
    expect(data).toEqual([])

    const after = await manager.db.from('tasks').select('title, assignee_id').eq('id', taskA).single()
    expect(after.data).toEqual({ title: 'Задача A', assignee_id: executorA.id })
  })

  it('не правит чужую задачу и объект', async () => {
    const task = await executorA.db.from('tasks').update({ title: 'Взлом' }).eq('id', taskB).select()
    const object = await executorA.db.from('objects').update({ name: 'Взлом' }).eq('id', sharedObject).select()
    expect(task.data).toEqual([])
    expect(object.data).toEqual([])
  })

  it('не удаляет ни своё, ни чужое', async () => {
    const results = await Promise.all([
      executorA.db.from('tasks').delete().eq('id', taskA),
      executorA.db.from('objects').delete().eq('id', sharedObject),
      executorA.db.rpc('delete_task', { p_task_id: taskA }),
      executorA.db.rpc('delete_object', { p_object_id: sharedObject }),
    ])
    for (const { error } of results) expect(error?.code).toBe('42501')
    expect((await manager.db.from('tasks').select('id').eq('id', taskA)).data).toHaveLength(1)
  })

  it('не повышает себе роль ни в таблице, ни в метаданных', async () => {
    const table = await executorA.db.from('profiles').update({ role: 'manager' }).eq('id', executorA.id)
    expect(table.error?.code).toBe('42501')

    const self = await signIn('executor1@example.com')
    await self.db.auth.updateUser({ data: { role: 'manager' } })
    const attempt = await self.db.from('objects').insert({ name: 'Взлом', address: 'Взлом' })
    expect(attempt.error?.code).toBe('42501')
    await self.db.auth.updateUser({ data: { role: null } })
  })
})

describe('Поля, которые задаёт только база', () => {
  it.each([
    ['статус', { status: 'accepted' }],
    ['автора', { author_id: 'a0000000-0000-4000-8000-000000000002' }],
    ['дату создания', { created_at: '2000-01-01T00:00:00Z' }],
    ['пометку удаления', { deleted_at: '2000-01-01T00:00:00Z' }],
  ])('постановщик не может задать %s при создании задачи', async (_name, extra) => {
    const { error } = await manager.db
      .from('tasks')
      .insert({ title: 'Подделка', object_id: sharedObject, assignee_id: executorA.id, ...extra })
    expect(error?.code).toBe('42501')
  })

  it('автор, дата и статус новой задачи выставляются сами', async () => {
    const id = await createTask(sharedObject, executorA.id, 'Проверка умолчаний')
    const { data } = await manager.db.from('tasks').select('author_id, status, created_at').eq('id', id).single()
    expect(data!.author_id).toBe(manager.id)
    expect(data!.status).toBe('new')
    expect(Math.abs(Date.now() - new Date(data!.created_at).getTime())).toBeLessThan(120_000)
  })

  it.each([
    ['постановщик', () => manager],
    ['исполнитель', () => executorA],
  ])('%s не меняет статус прямой записью в таблицу', async (_name, user) => {
    const { error } = await user().db.from('tasks').update({ status: 'accepted' }).eq('id', taskA)
    expect(error?.code).toBe('42501')
    expect(await statusOf(taskA)).toBe('new')
  })

  it('постановщик не подменяет автора и не снимает удаление напрямую', async () => {
    const author = await manager.db.from('tasks').update({ author_id: manager2.id }).eq('id', taskA)
    const deleted = await manager.db.from('tasks').update({ deleted_at: null }).eq('id', taskA)
    expect(author.error?.code).toBe('42501')
    expect(deleted.error?.code).toBe('42501')
  })

  it('назначить можно только исполнителя', async () => {
    const toManager = await manager.db
      .from('tasks')
      .insert({ title: 'Постановщику', object_id: sharedObject, assignee_id: manager2.id })
    const toNobody = await manager.db
      .from('tasks')
      .insert({ title: 'Никому', object_id: sharedObject, assignee_id: '00000000-0000-4000-8000-000000000000' })
    const update = await manager.db.from('tasks').update({ assignee_id: manager2.id }).eq('id', taskA)
    expect(toManager.error).not.toBeNull()
    expect(toNobody.error).not.toBeNull()
    expect(update.error).not.toBeNull()
  })

  it('пустое название не проходит', async () => {
    const task = await manager.db
      .from('tasks')
      .insert({ title: '   ', object_id: sharedObject, assignee_id: executorA.id })
    const object = await manager.db.from('objects').insert({ name: '\n\t', address: 'Адрес' })
    expect(task.error).not.toBeNull()
    expect(object.error).not.toBeNull()
  })
})

describe('Переходы статусов: полная матрица', () => {
  const ALLOWED = [
    ['new', 'in_progress', 'назначенный исполнитель'],
    ['in_progress', 'review', 'назначенный исполнитель'],
    ['review', 'accepted', 'постановщик'],
    ['review', 'rework', 'постановщик'],
    ['rework', 'in_progress', 'назначенный исполнитель'],
  ]
  const ACTORS = ['постановщик', 'назначенный исполнитель', 'чужой исполнитель']
  const isAllowed = (from: string, to: string, actor: string) =>
    ALLOWED.some(([f, t, a]) => f === from && t === to && a === actor)

  const actorUser = (actor: string) =>
    actor === 'постановщик' ? manager : actor === 'назначенный исполнитель' ? executorA : executorB

  const matrix = STATUSES.flatMap((from) =>
    STATUSES.flatMap((to) => ACTORS.map((actor) => [from, to, actor] as const)),
  )

  // Запрещённая попытка статус не меняет, поэтому задачу можно использовать повторно.
  const reusable = new Map<Status, Promise<string>>()
  const reusableTask = (status: Status) => {
    if (!reusable.has(status)) reusable.set(status, taskInStatus(status))
    return reusable.get(status)!
  }

  it.each(matrix)('%s -> %s, %s', async (from, to, actor) => {
    if (isAllowed(from, to, actor)) {
      const id = await taskInStatus(from)
      const { error } = await move(actorUser(actor), id, to, 'Комментарий')
      expect(error).toBeNull()
      expect(await statusOf(id)).toBe(to)
    } else {
      const id = await reusableTask(from)
      const before = await historyOf(id)
      const { error } = await move(actorUser(actor), id, to, 'Комментарий')
      expect(error).not.toBeNull()
      expect(await statusOf(id)).toBe(from)
      expect(await historyOf(id)).toEqual(before)
    }
  })

  it('несуществующий статус не проходит', async () => {
    const { error } = await move(manager, taskA, 'done')
    expect(error).not.toBeNull()
  })

  it('чужой исполнитель получает тот же ответ, что и на несуществующую задачу', async () => {
    const foreign = await move(executorB, taskA, 'in_progress')
    const missing = await move(executorB, '00000000-0000-4000-8000-000000000000', 'in_progress')
    expect(foreign.error?.message).toBe('Задача не найдена')
    expect(missing.error?.message).toBe('Задача не найдена')
  })

  it('возврат на доработку без комментария не проходит', async () => {
    const id = await taskInStatus('review')
    for (const comment of [undefined, '', '    ', '\n\t']) {
      const { error } = await move(manager, id, 'rework', comment)
      expect(error?.message).toBe('Для этого действия нужен комментарий')
    }
    expect(await statusOf(id)).toBe('review')
  })

  it('из двух одновременных решений проходит ровно одно', async () => {
    const id = await taskInStatus('review')
    const before = (await historyOf(id)).length
    const [accept, rework] = await Promise.all([
      move(manager, id, 'accepted'),
      move(manager2, id, 'rework', 'Переделать'),
    ])
    expect([accept.error, rework.error].filter((error) => error === null)).toHaveLength(1)
    expect(await historyOf(id)).toHaveLength(before + 1)
  })

  it('двойное нажатие не создаёт второй записи', async () => {
    const id = await createTask(sharedObject, executorA.id, 'Двойное нажатие')
    const results = await Promise.all([move(executorA, id, 'in_progress'), move(executorA, id, 'in_progress')])
    expect(results.filter(({ error }) => error === null)).toHaveLength(1)
    expect(await historyOf(id)).toHaveLength(2)
  })
})

describe('История: пишется сама и не подделывается', () => {
  let id: string

  beforeAll(async () => {
    id = await createTask(sharedObject, executorA.id, 'Задача для истории')
    await moveOk(executorA, id, 'in_progress')
    await moveOk(executorA, id, 'review', 'Готово')
    await moveOk(manager2, id, 'rework', 'Исправить узел')
  })

  it('каждая смена статуса записана: кто, откуда, куда, комментарий', async () => {
    const rows = await historyOf(id)
    expect(rows.map(({ from_status, to_status, changed_by, comment }) => [from_status, to_status, changed_by, comment])).toEqual([
      [null, 'new', manager.id, null],
      ['new', 'in_progress', executorA.id, null],
      ['in_progress', 'review', executorA.id, 'Готово'],
      ['review', 'rework', manager2.id, 'Исправить узел'],
    ])
    for (const row of rows) expect(row.changed_at).toBeTruthy()
  })

  it('обе роли видят одну и ту же историю', async () => {
    const asExecutor = await executorA.db.from('task_status_history').select('*').eq('task_id', id).order('id')
    expect(asExecutor.data).toEqual(await historyOf(id))
  })

  it.each([
    ['постановщик', () => manager],
    ['исполнитель', () => executorA],
  ])('%s не может добавить, изменить или удалить запись', async (_name, user) => {
    const db = user().db
    const before = await historyOf(id)
    const rowId = before[0]!.id

    const insert = await db.from('task_status_history').insert({
      task_id: id,
      from_status: 'review',
      to_status: 'accepted',
      changed_by: manager.id,
    })
    const update = await db.from('task_status_history').update({ comment: 'Подделка' }).eq('id', rowId)
    const remove = await db.from('task_status_history').delete().eq('id', rowId)

    expect(insert.error?.code).toBe('42501')
    expect(update.error?.code).toBe('42501')
    expect(remove.error?.code).toBe('42501')
    expect(await historyOf(id)).toEqual(before)
  })

  it('автора записи нельзя передать параметром', async () => {
    const { error } = await executorA.db.rpc('change_task_status', {
      p_task_id: id,
      p_to_status: 'in_progress',
      p_changed_by: manager.id,
    })
    expect(error).not.toBeNull()
    expect(await statusOf(id)).toBe('rework')
  })

  it('правила переходов менять нельзя', async () => {
    const insert = await manager.db.from('task_transitions').insert({
      from_status: 'new',
      to_status: 'accepted',
      actor: 'assignee',
      action_label: 'Подделка',
    })
    const update = await manager.db.from('task_transitions').update({ actor: 'assignee' }).eq('to_status', 'accepted')
    expect(insert.error?.code).toBe('42501')
    expect(update.error?.code).toBe('42501')
  })
})

describe('Удаление постановщиком', () => {
  it('задача исчезает для всех, действия над ней не проходят', async () => {
    const id = await createTask(sharedObject, executorA.id, 'Будет удалена')
    const { error } = await manager.db.rpc('delete_task', { p_task_id: id })
    expect(error).toBeNull()

    expect((await manager.db.from('tasks').select('id').eq('id', id)).data).toEqual([])
    expect((await executorA.db.from('tasks').select('id').eq('id', id)).data).toEqual([])
    expect((await move(executorA, id, 'in_progress')).error?.message).toBe('Задача не найдена')
    expect((await manager.db.rpc('delete_task', { p_task_id: id })).error?.message).toBe('Задача не найдена')
  })

  it('прямой delete закрыт и для постановщика: история не должна пропасть вместе с задачей', async () => {
    const { error } = await manager.db.from('tasks').delete().eq('id', taskA)
    expect(error?.code).toBe('42501')
  })

  it('объект исчезает вместе с задачами, новых задач в нём создать нельзя', async () => {
    const objectId = await createObject('Будет удалён')
    const taskId = await createTask(objectId, executorA.id)
    expect((await manager.db.rpc('delete_object', { p_object_id: objectId })).error).toBeNull()

    expect((await manager.db.from('objects').select('id').eq('id', objectId)).data).toEqual([])
    expect((await executorA.db.from('objects').select('id').eq('id', objectId)).data).toEqual([])
    expect((await executorA.db.from('tasks').select('id').eq('id', taskId)).data).toEqual([])

    const create = await manager.db
      .from('tasks')
      .insert({ title: 'В удалённый объект', object_id: objectId, assignee_id: executorA.id })
    const moveTo = await manager.db.from('tasks').update({ object_id: objectId }).eq('id', taskA)
    expect(create.error).not.toBeNull()
    expect(moveTo.error).not.toBeNull()
  })
})
