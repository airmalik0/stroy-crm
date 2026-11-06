import { Paper, Text, Timeline, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { fetchHistory } from '../lib/api'
import { formatDateTime, STATUS_LABELS } from '../lib/status'
import { QueryError, QueryLoader } from './QueryState'

export function TaskHistory({ taskId, status }: { taskId: string; status: string }) {
  const history = useQuery({
    queryKey: ['history', taskId, status],
    queryFn: () => fetchHistory(taskId),
  })

  return (
    <Paper withBorder radius="md" p="md">
      <Title order={4} mb="md">
        История
      </Title>
      {history.isPending && <QueryLoader />}
      {history.error && <QueryError error={history.error} />}
      {history.data && (
        <Timeline active={history.data.length - 1} bulletSize={14} lineWidth={2} data-testid="task-history">
          {history.data.map((row) => (
            <Timeline.Item
              key={row.id}
              title={
                row.from_status
                  ? `${STATUS_LABELS[row.from_status]} → ${STATUS_LABELS[row.to_status]}`
                  : `Создана, статус ${STATUS_LABELS[row.to_status]}`
              }
            >
              <Text size="sm" c="dimmed">
                {row.actor.full_name}, {formatDateTime(row.changed_at)}
              </Text>
              {row.comment && (
                <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                  {row.comment}
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </Paper>
  )
}
