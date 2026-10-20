import { createClient } from '@supabase/supabase-js'
import type { Database } from './db.types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// shortcut: accounts and cloud sync are off while the Supabase project is paused; the library,
// saves and settings stay in this browser. Set to false to bring sign-in back.
export const LOCAL_ONLY: boolean = true

/** True when the app has Supabase credentials. The dev spike works without them. */
export const supabaseConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'))

// A missing configuration must not crash the whole app at import time; pages that
// need auth render a setup notice instead (see RequireSupabase).
export const supabase = createClient<Database>(
  url && supabaseConfigured ? url : 'https://placeholder.supabase.co',
  anonKey && supabaseConfigured ? anonKey : 'placeholder',
  {
    auth: {
      // Redirect-based OAuth only: COOP same-origin (needed for the emulator's threads)
      // breaks popup flows, so every provider returns to /auth/callback.
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
)

export const authRedirectUrl = () => `${window.location.origin}/auth/callback`
