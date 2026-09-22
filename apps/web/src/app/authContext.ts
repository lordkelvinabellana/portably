import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'

export type AuthState = {
  session: Session | null
  user: User | null
  /** false until the persisted session has been read once */
  ready: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
