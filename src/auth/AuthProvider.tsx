import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchProfile } from '../lib/api'
import { supabase } from '../lib/supabase'

type Profile = NonNullable<Awaited<ReturnType<typeof fetchProfile>>>

type AuthState = {
  session: Session | null
  profile: Profile | null
  isManager: boolean
  loading: boolean
  profileMissing: boolean
  profileFailed: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const userId = session?.user.id

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  // Смена пользователя в том же браузере: данные прошлого не должны мелькнуть на экране.
  useEffect(() => {
    queryClient.clear()
  }, [userId, queryClient])

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId),
  })

  const profile = profileQuery.data ?? null

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        isManager: profile?.role === 'manager',
        loading: !sessionLoaded || (Boolean(userId) && profileQuery.isPending),
        profileMissing: Boolean(userId) && profileQuery.isSuccess && !profile,
        profileFailed: Boolean(userId) && profileQuery.isError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth вне AuthProvider')
  return value
}
