import { Button, Center, Group, Stack, Text } from '@mantine/core'
import { supabase } from '../lib/supabase'

export function NoProfilePage({ failed }: { failed: boolean }) {
  return (
    <Center mih="100vh" p="md">
      <Stack align="center">
        <Text ta="center">
          {failed
            ? 'Не удалось загрузить профиль. Проверьте соединение и попробуйте ещё раз.'
            : 'Для этого входа не настроен профиль. Обратитесь к администратору.'}
        </Text>
        <Group>
          {failed && <Button onClick={() => window.location.reload()}>Повторить</Button>}
          <Button variant="default" onClick={() => void supabase.auth.signOut()}>
            Выйти
          </Button>
        </Group>
      </Stack>
    </Center>
  )
}
