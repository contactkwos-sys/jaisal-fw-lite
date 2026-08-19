import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AppUser, Role } from './database.types'

type Profile = AppUser & { roles: Role | null }

type AuthState = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isCeo: boolean
  isManager: boolean
  loginWithPin: (role: Role, pin: string) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

function profileFromAuthUser(user: User): Profile {
  const meta = (user.user_metadata || {}) as Record<string, string>
  const roleName = meta.role_name || meta.full_name || 'User'
  return {
    id: user.id,
    full_name: meta.full_name || roleName,
    role_id: meta.role_id || `meta-${roleName.toLowerCase()}`,
    pin_hash: meta.pin_hash || '',
    is_active: true,
    created_at: user.created_at || new Date().toISOString(),
    roles: {
      id: meta.role_id || `meta-${roleName.toLowerCase()}`,
      role_name: roleName,
      is_custom: false,
      created_at: user.created_at || new Date().toISOString(),
    },
  }
}

async function fetchProfile(user: User): Promise<Profile> {
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, role_id, pin_hash, is_active, created_at, roles(*)')
    .eq('id', user.id)
    .maybeSingle()

  if (!error && data) {
    const row = data as any
    const roles = Array.isArray(row.roles) ? row.roles[0] ?? null : row.roles ?? null
    return {
      id: row.id,
      full_name: row.full_name,
      role_id: row.role_id,
      pin_hash: row.pin_hash,
      is_active: row.is_active,
      created_at: row.created_at,
      roles,
    } as Profile
  }
  // Tables may lack GRANTs yet — fall back to auth metadata
  return profileFromAuthUser(user)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    const s = data.session
    setSession(s)
    if (s?.user) {
      const p = await fetchProfile(s.user)
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
      if (next?.user) {
        try {
          const p = await fetchProfile(next.user)
          setProfile(p)
        } catch {
          setProfile(profileFromAuthUser(next.user))
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

  const loginWithPin = useCallback(
    async (role: Role, pin: string) => {
      // Local UI smoke only — never enabled in production builds without the env flag.
      if (import.meta.env.VITE_SMOKE_BYPASS === '1') {
        const mockUser = {
          id: `smoke-${role.id}`,
          full_name: role.role_name,
          role_id: role.id,
          pin_hash: '',
          is_active: true,
          created_at: new Date().toISOString(),
          roles: role,
        }
        setProfile(mockUser)
        setSession({
          access_token: 'smoke',
          refresh_token: 'smoke',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: mockUser.id,
            app_metadata: {},
            user_metadata: {
              full_name: role.role_name,
              role_name: role.role_name,
              role_id: role.id,
            },
            aud: 'authenticated',
            created_at: mockUser.created_at,
          },
        } as Session)
        return
      }
      const { data, error } = await supabase.functions.invoke('pin-login', {
        body: { role_id: role.id, role_name: role.role_name, pin },
      })
      if (error) {
        const bodyError = (data as { error?: string; message?: string } | null)?.error
          ?? (data as { message?: string } | null)?.message
        const ctx = (error as { context?: Response }).context
        let gatewayMessage: string | undefined
        if (!bodyError && ctx && typeof ctx.json === 'function') {
          try {
            const payload = (await ctx.clone().json()) as { error?: string; message?: string }
            gatewayMessage = payload.error ?? payload.message
          } catch {
            /* ignore non-JSON gateway bodies */
          }
        }
        throw new Error(bodyError ?? gatewayMessage ?? error.message ?? 'Login failed')
      }
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
    },
    [refreshProfile],
  )

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }, [])

  const roleName =
    profile?.roles?.role_name ||
    (session?.user?.user_metadata as { role_name?: string } | undefined)?.role_name ||
    ''
  const isCeo =
    roleName === 'CEO' ||
    profile?.full_name === 'CEO' ||
    (session?.user?.user_metadata as { full_name?: string } | undefined)?.full_name === 'CEO'
  const isManager =
    roleName === 'Manager' ||
    profile?.full_name === 'Manager' ||
    (session?.user?.user_metadata as { full_name?: string } | undefined)?.full_name === 'Manager'

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, isCeo, isManager, loginWithPin, logout, refreshProfile }}
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
