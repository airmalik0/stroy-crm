import { Badge, Box, Button, Container, Group, Text } from '@mantine/core'
import type { ReactNode } from 'react'
import { NavLink as RouterNavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <RouterNavLink to={to} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <Button component="span" size="compact-md" variant={isActive ? 'light' : 'subtle'} color={isActive ? 'blue' : 'dark'}>
          {label}
        </Button>
      )}
    </RouterNavLink>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { profile, isManager } = useAuth()

  return (
    <Box mih="100vh" bg="gray.0">
      <Box component="header" bg="white" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Container size="md" py="xs">
          <Group justify="space-between" gap="xs">
            <Group gap={4}>
              <NavItem to="/objects" label="Объекты" />
              <NavItem to="/tasks" label={isManager ? 'Все задачи' : 'Мои задачи'} />
            </Group>
            <Group gap="xs">
              <Text size="sm" data-testid="current-user">
                {profile?.full_name}
              </Text>
              <Badge variant="light" color={isManager ? 'violet' : 'teal'}>
                {isManager ? 'Постановщик' : 'Исполнитель'}
              </Badge>
              <Button size="compact-sm" variant="default" onClick={() => void supabase.auth.signOut()}>
                Выйти
              </Button>
            </Group>
          </Group>
        </Container>
      </Box>
      <Container size="md" py="lg" component="main">
        {children}
      </Container>
    </Box>
  )
}
