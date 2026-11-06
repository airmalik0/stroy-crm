import { Button, Group, Select, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { QueryError, QueryLoader } from '../components/QueryState'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskList } from '../components/TaskList'
import { createTask, fetchTasks } from '../lib/api'
import { STATUS_LABELS, STATUS_ORDER } from '../lib/status'

export function TasksPage() {
  const { isManager } = useAuth()
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [formOpened, form] = useDisclosure(false)
  const tasks = useQuery({ queryKey: ['tasks', {}], queryFn: () => fetchTasks() })

  const visible = tasks.data?.filter((task) => !statusFilter || task.status === statusFilter)

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{isManager ? 'Все задачи' : 'Мои задачи'}</Title>
        <Group gap="xs">
          <Select
            aria-label="Фильтр по статусу"
            placeholder="Все статусы"
            clearable
            w={180}
            data={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABELS[status] }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {isManager && <Button onClick={form.open}>Добавить задачу</Button>}
        </Group>
      </Group>

      {tasks.isPending && <QueryLoader />}
      {tasks.error && <QueryError error={tasks.error} />}
      {visible?.length === 0 && <Text c="dimmed">Задач нет.</Text>}
      {visible && <TaskList tasks={visible} />}

      {isManager && (
        <TaskFormModal
          opened={formOpened}
          title="Новая задача"
          onClose={form.close}
          onSubmit={async (input) => {
            await createTask(input)
            await queryClient.invalidateQueries({ queryKey: ['tasks'] })
            await queryClient.invalidateQueries({ queryKey: ['objects'] })
          }}
        />
      )}
    </Stack>
  )
}
