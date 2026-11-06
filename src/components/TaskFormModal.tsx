import { Alert, Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { fetchExecutors, fetchObjects, type TaskInput } from '../lib/api'

type Props = {
  opened: boolean
  title: string
  initial?: Partial<TaskInput>
  onClose: () => void
  onSubmit: (input: TaskInput) => Promise<unknown>
}

// Содержимое модального окна монтируется заново при каждом открытии, поэтому форма всегда свежая.
export function TaskFormModal({ opened, title, onClose, ...form }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <TaskForm onClose={onClose} {...form} />
    </Modal>
  )
}

function TaskForm({ initial, onClose, onSubmit }: Pick<Props, 'initial' | 'onClose' | 'onSubmit'>) {
  const [taskTitle, setTaskTitle] = useState(initial?.title ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [objectId, setObjectId] = useState<string | null>(initial?.object_id ?? null)
  const [assigneeId, setAssigneeId] = useState<string | null>(initial?.assignee_id ?? null)

  const objects = useQuery({ queryKey: ['objects'], queryFn: fetchObjects })
  const executors = useQuery({ queryKey: ['executors'], queryFn: fetchExecutors })
  const mutation = useMutation({ mutationFn: onSubmit, onSuccess: onClose })

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!objectId || !assigneeId) return
    mutation.mutate({
      title: taskTitle.trim(),
      description: description.trim(),
      object_id: objectId,
      assignee_id: assigneeId,
    })
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          label="Название"
          required
          maxLength={200}
          value={taskTitle}
          onChange={(event) => setTaskTitle(event.currentTarget.value)}
        />
        <Textarea
          label="Описание"
          autosize
          minRows={3}
          maxLength={5000}
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
        />
        <Select
          label="Объект"
          required
          searchable
          data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
          value={objectId}
          onChange={setObjectId}
        />
        <Select
          label="Исполнитель"
          required
          searchable
          data={(executors.data ?? []).map((e) => ({ value: e.id, label: e.full_name }))}
          value={assigneeId}
          onChange={setAssigneeId}
        />
        {mutation.error && (
          <Alert color="red" variant="light" role="alert">
            {mutation.error.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={!objectId || !assigneeId}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
