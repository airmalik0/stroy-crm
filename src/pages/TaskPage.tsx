import { Anchor, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { NotFound, QueryError, QueryLoader } from '../components/QueryState'
import { StatusBadge } from '../components/StatusBadge'
import { TaskActions } from '../components/TaskActions'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskHistory } from '../components/TaskHistory'
import { deleteTask, fetchTask, updateTask } from '../lib/api'
import { formatDateTime } from '../lib/status'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" component="div">
        {children}
      </Text>
    </div>
  )
}

export function TaskPage() {
  const { id = '' } = useParams()
  const { isManager } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpened, edit] = useDisclosure(false)
  const [deleteOpened, del] = useDisclosure(false)

  const task = useQuery({ queryKey: ['tasks', id], queryFn: () => fetchTask(id) })

  if (task.isPending) return <QueryLoader />
  if (task.error) return <QueryError error={task.error} />
  if (!task.data) return <NotFound title="Задача не найдена" />

  const data = task.data

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <Group gap="sm" align="center">
          <Title order={2}>{data.title}</Title>
          <StatusBadge status={data.status} />
        </Group>
        {isManager && (
          <Group gap="xs">
            <Button variant="default" onClick={edit.open}>
              Изменить
            </Button>
            <Button variant="default" color="red" onClick={del.open}>
              Удалить
            </Button>
          </Group>
        )}
      </Group>

      <Paper withBorder radius="md" p="md">
        <Stack>
          <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            <Field label="Объект">
              <Anchor component={Link} to={`/objects/${data.object.id}`}>
                {data.object.name}
              </Anchor>
              <Text size="xs" c="dimmed">
                {data.object.address}
              </Text>
            </Field>
            <Field label="Исполнитель">{data.assignee.full_name}</Field>
            <Field label="Автор">{data.author.full_name}</Field>
            <Field label="Дата создания">{formatDateTime(data.created_at)}</Field>
          </SimpleGrid>
          <Field label="Описание">
            <span style={{ whiteSpace: 'pre-wrap' }}>{data.description || 'Без описания'}</span>
          </Field>
        </Stack>
      </Paper>

      <TaskActions taskId={id} status={data.status} />
      <TaskHistory taskId={id} status={data.status} />

      {isManager && (
        <>
          <TaskFormModal
            opened={editOpened}
            title="Изменить задачу"
            initial={{
              title: data.title,
              description: data.description,
              object_id: data.object_id,
              assignee_id: data.assignee_id,
            }}
            onClose={edit.close}
            onSubmit={async (input) => {
              await updateTask(id, input)
              await queryClient.invalidateQueries()
            }}
          />
          <ConfirmDeleteModal
            opened={deleteOpened}
            title="Удалить задачу?"
            onClose={del.close}
            onConfirm={async () => {
              await deleteTask(id)
              queryClient.clear()
              navigate(`/objects/${data.object_id}`)
            }}
          >
            Задача исчезнет из списков. История статусов останется в базе.
          </ConfirmDeleteModal>
        </>
      )}
    </Stack>
  )
}
