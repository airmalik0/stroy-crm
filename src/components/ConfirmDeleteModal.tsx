import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import type { ReactNode } from 'react'

type Props = {
  opened: boolean
  title: string
  children: ReactNode
  onClose: () => void
  onConfirm: () => Promise<unknown>
}

export function ConfirmDeleteModal({ opened, title, children, onClose, onConfirm }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <ConfirmBody onClose={onClose} onConfirm={onConfirm}>
        {children}
      </ConfirmBody>
    </Modal>
  )
}

function ConfirmBody({ children, onClose, onConfirm }: Omit<Props, 'opened' | 'title'>) {
  const mutation = useMutation({ mutationFn: onConfirm })

  return (
    <Stack>
      <Text size="sm">{children}</Text>
      {mutation.error && (
        <Alert color="red" variant="light" role="alert">
          {mutation.error.message}
        </Alert>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>
          Отмена
        </Button>
        <Button color="red" loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Удалить
        </Button>
      </Group>
    </Stack>
  )
}
