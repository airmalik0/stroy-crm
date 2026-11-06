import type { Database } from './database.types'

export type TaskStatus = Database['public']['Enums']['task_status']

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
}

export const STATUS_COLORS: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  review: 'orange',
  accepted: 'green',
  rework: 'red',
}

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'review', 'rework', 'accepted']

const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
const date = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short' })

export const formatDateTime = (value: string) => dateTime.format(new Date(value))
export const formatDate = (value: string) => date.format(new Date(value))
