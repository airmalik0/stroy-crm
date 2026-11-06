import { Button, Center, Stack, Text } from '@mantine/core'
import { supabase } from '../lib/supabase'

export function NoProfilePage() {
  return (
    <Center mih="100vh" p="md">
      <Stack align="center">
        <Text>Для этого входа не настроен профиль. Обратитесь к администратору.</Text>
        <Button variant="default" onClick={() => void supabase.auth.signOut()}>
          Выйти
        </Button>
      </Stack>
    </Center>
  )
}
