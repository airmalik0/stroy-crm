import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core'
import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setError(
        signInError.code === 'invalid_credentials'
          ? 'Неверный email или пароль'
          : 'Не удалось войти, попробуйте ещё раз',
      )
      setSubmitting(false)
    }
  }

  return (
    <Center mih="100vh" p="md" bg="gray.0">
      <Paper withBorder radius="md" p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <div>
              <Title order={2}>Объекты и задачи</Title>
              <Text c="dimmed" size="sm">
                Доступ выдаёт администратор, самостоятельной регистрации нет.
              </Text>
            </div>
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            {error && (
              <Alert color="red" variant="light" role="alert">
                {error}
              </Alert>
            )}
            <Button type="submit" loading={submitting}>
              Войти
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
