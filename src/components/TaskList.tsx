import { Anchor, Group, Paper, Stack, Text } from '@mantine/core'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { fetchTasks } from '../lib/api'
import { formatDate } from '../lib/status'
import { StatusBadge } from './StatusBadge'

type Task = Awaited<ReturnType<typeof fetchTasks>>[number]

export function TaskList({ tasks, showObject = true }: { tasks: Task[]; showObject?: boolean }) {
  const { isManager } = useAuth()

  return (
    <Stack gap="xs" data-testid="task-list">
      {tasks.map((task) => (
        <Paper key={task.id} withBorder radius="md" p="sm" data-testid="task-row">
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <div style={{ minWidth: 0 }}>
              <Anchor component={Link} to={`/tasks/${task.id}`} fw={500} c="dark">
                {task.title}
              </Anchor>
              <Text size="sm" c="dimmed">
                {[
                  showObject && task.object.name,
                  isManager && task.assignee.full_name,
                  `от ${formatDate(task.created_at)}`,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </Text>
            </div>
            <StatusBadge status={task.status} />
          </Group>
        </Paper>
      ))}
    </Stack>
  )
}
