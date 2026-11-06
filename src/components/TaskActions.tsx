import { Alert, Button, Group, Paper, Stack, Text, Textarea } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { changeTaskStatus, fetchAvailableTransitions } from '../lib/api'
import { STATUS_LABELS, type TaskStatus } from '../lib/status'

// Кнопки приходят из базы: функция available_transitions знает роль, статус и назначенного исполнителя.
// Даже если кнопку подделать, change_task_status проверит всё заново.
export function TaskActions({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)

  const transitions = useQuery({
    queryKey: ['transitions', taskId, status],
    queryFn: () => fetchAvailableTransitions(taskId),
  })

  const mutation = useMutation({
    mutationFn: (toStatus: TaskStatus) => changeTaskStatus(taskId, toStatus, comment),
    onSuccess: (_data, toStatus) => {
      setComment('')
      notifications.show({ color: 'green', message: `Статус: ${STATUS_LABELS[toStatus]}` })
    },
    // И при ошибке: статус мог поменяться в другой вкладке, кнопки надо обновить.
    onSettled: () => queryClient.invalidateQueries(),
  })

  if (!transitions.data?.length) return null

  const anyCommentRequired = transitions.data.some((t) => t.comment_required)

  return (
    <Paper withBorder radius="md" p="md" data-testid="task-actions">
      <Stack gap="sm">
        <Textarea
          label="Комментарий"
          description={anyCommentRequired ? 'Обязателен, если возвращаете на доработку' : 'Необязательно'}
          autosize
          minRows={2}
          maxLength={2000}
          value={comment}
          error={commentError}
          onChange={(event) => {
            setComment(event.currentTarget.value)
            setCommentError(null)
          }}
        />
        {mutation.error && (
          <Alert color="red" variant="light" role="alert">
            <Text size="sm">{mutation.error.message}</Text>
          </Alert>
        )}
        <Group gap="xs">
          {transitions.data.map((transition) => (
            <Button
              key={transition.to_status}
              color={transition.to_status === 'rework' ? 'red' : undefined}
              variant={transition.to_status === 'rework' ? 'light' : 'filled'}
              loading={mutation.isPending && mutation.variables === transition.to_status}
              disabled={mutation.isPending && mutation.variables !== transition.to_status}
              onClick={() => {
                if (transition.comment_required && !comment.trim()) {
                  setCommentError('Напишите, что нужно исправить')
                  return
                }
                mutation.mutate(transition.to_status)
              }}
            >
              {transition.action_label}
            </Button>
          ))}
        </Group>
      </Stack>
    </Paper>
  )
}
