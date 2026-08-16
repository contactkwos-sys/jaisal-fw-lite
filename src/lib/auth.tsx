import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppUser, Role } from './database.types'

type AuthState = {
  session: Session | null
  profile: (AppUser & { roles: Role | null }) | null
  loading: boolean
  isCeo: boolean
  loginWithPin: (role: Role, pin: string) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role_id, pin_hash, is_active, created_at, roles(*)')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as (AppUser & { roles: Role | null }) | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<(AppUser & { roles: Role | null }) | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const s = data.session
    setSession(s)
    if (s?.user?.id) {
      const p = await fetchProfile(s.user.id)
      setProfile(p)
    } else {
      setProfile(null)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        await refreshProfile()
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next)
      if (next?.user?.id) {
        try {
          const p = await fetchProfile(next.user.id)
          setProfile(p)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [refreshProfile])

  const loginWithPin = useCallback(async (role: Role, pin: string) => {
    const { data, error } = await supabase.functions.invoke('pin-login', {
      body: { role_id: role.id, role_name: role.role_name, pin },
    })
    if (error) throw error
    if (data?.error) throw new Error(data.error)
    if (!data?.access_token || !data?.refresh_token) {
      throw new Error('No session returned from pin-login')
    }
    const { error: setErr } = await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
    if (setErr) throw setErr
    await refreshProfile()
  }, [refreshProfile])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const isCeo = profile?.roles?.role_name === 'CEO'

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, isCeo, loginWithPin, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
