import { Alert, Button, Group, Modal, Stack, TextInput } from '@mantine/core'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { ObjectInput } from '../lib/api'

type Props = {
  opened: boolean
  title: string
  initial?: ObjectInput
  onClose: () => void
  onSubmit: (input: ObjectInput) => Promise<unknown>
}

// Содержимое модального окна монтируется заново при каждом открытии, поэтому форма всегда свежая.
export function ObjectFormModal({ opened, title, onClose, ...form }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={title}>
      <ObjectForm onClose={onClose} {...form} />
    </Modal>
  )
}

function ObjectForm({ initial, onClose, onSubmit }: Pick<Props, 'initial' | 'onClose' | 'onSubmit'>) {
  const [name, setName] = useState(initial?.name ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const mutation = useMutation({ mutationFn: onSubmit, onSuccess: onClose })

  function submit(event: FormEvent) {
    event.preventDefault()
    mutation.mutate({ name: name.trim(), address: address.trim() })
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          label="Название"
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <TextInput
          label="Адрес"
          required
          maxLength={500}
          value={address}
          onChange={(event) => setAddress(event.currentTarget.value)}
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
          <Button type="submit" loading={mutation.isPending}>
            Сохранить
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
