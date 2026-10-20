import { useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AuthContext, type AuthState } from './authContext'
import { LOCAL_ONLY, supabase, supabaseConfigured } from '../lib/supabase'

// Local-only mode has no accounts; one fixed user keeps the signed-in code paths working.
const LOCAL_USER = { id: 'local' } as User

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(LOCAL_ONLY || !supabaseConfigured)

  useEffect(() => {
    if (LOCAL_ONLY || !supabaseConfigured) return
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    session,
    user: LOCAL_ONLY ? LOCAL_USER : (session?.user ?? null),
    ready,
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
