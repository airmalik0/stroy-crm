import { Center, Loader } from '@mantine/core'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { NoProfilePage } from './pages/NoProfilePage'
import { ObjectPage } from './pages/ObjectPage'
import { ObjectsPage } from './pages/ObjectsPage'
import { TaskPage } from './pages/TaskPage'
import { TasksPage } from './pages/TasksPage'

export function App() {
  const { session, isManager, loading, profileMissing, profileFailed } = useAuth()

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  if (!session) return <LoginPage />
  if (profileMissing || profileFailed) return <NoProfilePage failed={profileFailed} />

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to={isManager ? '/objects' : '/tasks'} replace />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
