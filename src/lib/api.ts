import { supabase } from './supabase'
import type { TaskStatus } from './status'

// Все запросы идут от имени вошедшего пользователя, лишнее отсекает RLS в базе.
// Поэтому фильтров "только мои задачи" здесь нет: база и так вернёт только разрешённое.

const TASK_FIELDS = `
  id, title, description, status, created_at, object_id, assignee_id,
  object:objects!tasks_object_id_fkey (id, name, address),
  assignee:profiles!tasks_assignee_id_fkey (id, full_name),
  author:profiles!tasks_author_id_fkey (id, full_name)
`

type Result<T> = { data: T; error: { message: string } | null }

function unwrap<T>({ data, error }: Result<T>): T {
  if (error) throw new Error(error.message)
  return data
}

const rows = <T>(result: Result<T[] | null>): T[] => unwrap(result) ?? []

export const fetchProfile = async (id: string) =>
  unwrap(await supabase.from('profiles').select('id, full_name, role').eq('id', id).maybeSingle())

export const fetchExecutors = async () =>
  rows(await supabase.from('profiles').select('id, full_name').eq('role', 'executor').order('full_name'))

export const fetchObjects = async () =>
  rows(await supabase.from('objects').select('id, name, address, tasks (status)').order('name'))

export const fetchObject = async (id: string) =>
  unwrap(await supabase.from('objects').select('id, name, address').eq('id', id).maybeSingle())

export const fetchTasks = async (filter: { objectId?: string } = {}) => {
  let query = supabase.from('tasks').select(TASK_FIELDS).order('created_at', { ascending: false })
  if (filter.objectId) query = query.eq('object_id', filter.objectId)
  return rows(await query)
}

export const fetchTask = async (id: string) =>
  unwrap(await supabase.from('tasks').select(TASK_FIELDS).eq('id', id).maybeSingle())

export const fetchHistory = async (taskId: string) =>
  rows(
    await supabase
      .from('task_status_history')
      .select(
        'id, from_status, to_status, comment, changed_at, actor:profiles!task_status_history_changed_by_fkey (full_name)',
      )
      .eq('task_id', taskId)
      .order('changed_at')
      .order('id'),
  )

export const fetchAvailableTransitions = async (taskId: string) =>
  rows(await supabase.rpc('available_transitions', { p_task_id: taskId }))

export const changeTaskStatus = async (taskId: string, toStatus: TaskStatus, comment: string) => {
  unwrap(
    await supabase.rpc('change_task_status', {
      p_task_id: taskId,
      p_to_status: toStatus,
      p_comment: comment,
    }),
  )
}

export type ObjectInput = { name: string; address: string }

export const createObject = async (input: ObjectInput) => {
  return unwrap(await supabase.from('objects').insert(input).select('id').single())!.id
}

export const updateObject = async (id: string, input: ObjectInput) => {
  unwrap(await supabase.from('objects').update(input).eq('id', id))
}

export const deleteObject = async (id: string) => {
  unwrap(await supabase.rpc('delete_object', { p_object_id: id }))
}

export type TaskInput = {
  title: string
  description: string
  object_id: string
  assignee_id: string
}

export const createTask = async (input: TaskInput) => {
  return unwrap(await supabase.from('tasks').insert(input).select('id').single())!.id
}

export const updateTask = async (id: string, input: TaskInput) => {
  unwrap(await supabase.from('tasks').update(input).eq('id', id))
}

export const deleteTask = async (id: string) => {
  unwrap(await supabase.rpc('delete_task', { p_task_id: id }))
}
