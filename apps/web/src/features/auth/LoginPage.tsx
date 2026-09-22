import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { authRedirectUrl, supabase, supabaseConfigured } from '../../lib/supabase'
import { useAuth } from '../../app/useAuth'
import { SetupNotice } from '../../app/RequireAuth'

type Mode = 'signin' | 'signup'
type Provider = 'google' | 'discord'

export function LoginPage() {
  const { user, ready } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!supabaseConfigured) return <SetupNotice />
  if (ready && user) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        })
        if (error) throw error
        if (!data.session) setNotice('Check your inbox to confirm your email, then sign in.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function oauth(provider: Provider) {
    setBusy(true)
    setError(null)
    // Redirect flow (not a popup): the page is cross-origin isolated for the emulator,
    // and COOP same-origin severs popup communication.
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: authRedirectUrl() },
    })
    if (error) {
      setError(error.message)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
      <p className="mb-6 text-sm text-zinc-400">Your games and saves follow you to any desktop browser.</p>

      <div className="grid gap-2">
        <button type="button" className="btn" disabled={busy} onClick={() => oauth('google')}>
          Continue with Google
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => oauth('discord')}>
          Continue with Discord
        </button>
      </div>

      <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
        <span className="h-px flex-1 bg-zinc-800" />
        or with email
        <span className="h-px flex-1 bg-zinc-800" />
      </div>

      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          Email
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Password
          <input
            className="input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-400">
        {mode === 'signin' ? 'No account yet? ' : 'Already have an account? '}
        <button
          type="button"
          className="underline"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            setError(null)
            setNotice(null)
          }}
        >
          {mode === 'signin' ? 'Create one' : 'Sign in'}
        </button>
      </p>
    </div>
  )
}
