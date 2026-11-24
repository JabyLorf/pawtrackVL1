import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

type AuthState = {
  loading: boolean
  profile: Profile | null
  isStaff: boolean
  isAdmin: boolean
  reloadProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile((data as Profile) || null)
  }

  useEffect(() => {
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      const id = data.session?.user.id
      if (id) loadProfile(id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }
      loadProfile(session.user.id)
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      profile,
      isStaff: !!profile && (profile.role === 'staff' || profile.role === 'admin') && profile.status === 'active',
      isAdmin: !!profile && profile.role === 'admin' && profile.status === 'active',
      async reloadProfile() {
        const { data } = await supabase.auth.getUser()
        if (data.user) await loadProfile(data.user.id)
      },
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return error ? error.message : null
      },
      async signOut() {
        await supabase.auth.signOut()
        setProfile(null)
      },
    }),
    [loading, profile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
