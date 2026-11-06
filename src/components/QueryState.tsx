import { Alert, Center, Loader } from '@mantine/core'

export function QueryLoader() {
  return (
    <Center py="xl">
      <Loader />
    </Center>
  )
}

export function QueryError({ error }: { error: Error }) {
  return (
    <Alert color="red" variant="light" title="Не удалось загрузить данные">
      {error.message}
    </Alert>
  )
}

export function NotFound({ what }: { what: string }) {
  return (
    <Alert color="gray" variant="light" title={`${what} не найден(а)`}>
      Запись удалена или у вас нет к ней доступа.
    </Alert>
  )
}
