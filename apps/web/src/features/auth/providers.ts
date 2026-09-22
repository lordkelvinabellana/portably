import { supabaseConfigured } from '../../lib/supabase'

export type OAuthProvider = 'google' | 'discord'

/**
 * Which social providers the Supabase project has enabled. Read from the public
 * auth settings endpoint so the sign-in page never offers a button that would fail
 * with "provider is not enabled". Falls back to none on any error.
 */
export async function enabledProviders(): Promise<OAuthProvider[]> {
  if (!supabaseConfigured) return []
  try {
    const url = import.meta.env.VITE_SUPABASE_URL as string
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
    if (!res.ok) return []
    const json = (await res.json()) as { external?: Record<string, boolean> }
    const ext = json.external ?? {}
    return (['google', 'discord'] as OAuthProvider[]).filter((p) => ext[p] === true)
  } catch {
    return []
  }
}
