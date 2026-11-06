import { Anchor, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ObjectFormModal } from '../components/ObjectFormModal'
import { QueryError, QueryLoader } from '../components/QueryState'
import { createObject, fetchObjects } from '../lib/api'

export function ObjectsPage() {
  const { isManager } = useAuth()
  const queryClient = useQueryClient()
  const [formOpened, form] = useDisclosure(false)
  const objects = useQuery({ queryKey: ['objects'], queryFn: fetchObjects })

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={form.open}>Добавить объект</Button>}
      </Group>

      {objects.isPending && <QueryLoader />}
      {objects.error && <QueryError error={objects.error} />}
      {objects.data?.length === 0 && (
        <Text c="dimmed">{isManager ? 'Объектов пока нет.' : 'У вас пока нет задач ни на одном объекте.'}</Text>
      )}

      <Stack gap="xs">
        {objects.data?.map((object) => {
          const onReview = object.tasks.filter((task) => task.status === 'review').length
          return (
            <Paper key={object.id} withBorder radius="md" p="sm" data-testid="object-row">
              <Group justify="space-between" wrap="nowrap" align="flex-start">
                <div style={{ minWidth: 0 }}>
                  <Anchor component={Link} to={`/objects/${object.id}`} fw={500} c="dark">
                    {object.name}
                  </Anchor>
                  <Text size="sm" c="dimmed">
                    {object.address}
                  </Text>
                </div>
                <Text size="sm" c="dimmed" ta="right" style={{ flexShrink: 0 }}>
                  {isManager ? 'задач' : 'ваших задач'}: {object.tasks.length}
                  {onReview > 0 && `, на проверке: ${onReview}`}
                </Text>
              </Group>
            </Paper>
          )
        })}
      </Stack>

      {isManager && (
        <ObjectFormModal
          opened={formOpened}
          title="Новый объект"
          onClose={form.close}
          onSubmit={async (input) => {
            await createObject(input)
            await queryClient.invalidateQueries({ queryKey: ['objects'] })
          }}
        />
      )}
    </Stack>
  )
}
