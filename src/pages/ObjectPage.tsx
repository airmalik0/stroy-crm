import { Button, Group, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ConfirmDeleteModal } from '../components/ConfirmDeleteModal'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { NotFound, QueryError, QueryLoader } from '../components/QueryState'
import { TaskFormModal } from '../components/TaskFormModal'
import { TaskList } from '../components/TaskList'
import { createTask, deleteObject, fetchObject, fetchTasks, updateObject } from '../lib/api'

export function ObjectPage() {
  const { id = '' } = useParams()
  const { isManager } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editOpened, edit] = useDisclosure(false)
  const [deleteOpened, del] = useDisclosure(false)
  const [taskOpened, taskForm] = useDisclosure(false)

  const object = useQuery({ queryKey: ['objects', id], queryFn: () => fetchObject(id) })
  const tasks = useQuery({
    queryKey: ['tasks', { objectId: id }],
    queryFn: () => fetchTasks({ objectId: id }),
  })

  if (object.isPending) return <QueryLoader />
  if (object.error) return <QueryError error={object.error} />
  if (!object.data) return <NotFound what="Объект" />

  const taskCount = tasks.data?.length ?? 0

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={2}>{object.data.name}</Title>
          <Text c="dimmed">{object.data.address}</Text>
        </div>
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

      <Group justify="space-between">
        <Title order={4}>{isManager ? 'Задачи' : 'Ваши задачи на объекте'}</Title>
        {isManager && <Button onClick={taskForm.open}>Добавить задачу</Button>}
      </Group>

      {tasks.isPending && <QueryLoader />}
      {tasks.error && <QueryError error={tasks.error} />}
      {tasks.data?.length === 0 && <Text c="dimmed">Задач пока нет.</Text>}
      {tasks.data && <TaskList tasks={tasks.data} showObject={false} />}

      {isManager && (
        <>
          <ObjectFormModal
            opened={editOpened}
            title="Изменить объект"
            initial={{ name: object.data.name, address: object.data.address }}
            onClose={edit.close}
            onSubmit={async (input) => {
              await updateObject(id, input)
              await queryClient.invalidateQueries({ queryKey: ['objects'] })
            }}
          />
          <ConfirmDeleteModal
            opened={deleteOpened}
            title="Удалить объект?"
            onClose={del.close}
            onConfirm={async () => {
              await deleteObject(id)
              queryClient.clear()
              navigate('/objects')
            }}
          >
            Объект исчезнет из списка
            {taskCount > 0 && ` вместе с задачами (${taskCount})`}. История статусов останется в базе.
          </ConfirmDeleteModal>
          <TaskFormModal
            opened={taskOpened}
            title="Новая задача"
            initial={{ object_id: id }}
            onClose={taskForm.close}
            onSubmit={async (input) => {
              await createTask(input)
              await queryClient.invalidateQueries({ queryKey: ['tasks'] })
              await queryClient.invalidateQueries({ queryKey: ['objects'] })
            }}
          />
        </>
      )}
    </Stack>
  )
}
