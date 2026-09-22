import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { authRedirectUrl, supabase, supabaseConfigured } from '../../lib/supabase'
import { useAuth } from '../../app/useAuth'
import { SetupNotice } from '../../app/RequireAuth'
import { enabledProviders, type OAuthProvider } from './providers'

type Mode = 'signin' | 'signup'
type Provider = OAuthProvider

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
  const [agree, setAgree] = useState(false)
  const [providers, setProviders] = useState<OAuthProvider[]>([])

  useEffect(() => {
    let cancelled = false
    enabledProviders().then((p) => {
      if (!cancelled) setProviders(p)
    })
    return () => {
      cancelled = true
    }
  }, [])

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

      {providers.length > 0 && (
        <>
          <div className="grid gap-2">
            {providers.includes('google') && (
              <button type="button" className="btn" disabled={busy} onClick={() => oauth('google')}>
                Continue with Google
              </button>
            )}
            {providers.includes('discord') && (
              <button type="button" className="btn" disabled={busy} onClick={() => oauth('discord')}>
                Continue with Discord
              </button>
            )}
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            or with email
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        </>
      )}

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
        {mode === 'signup' && (
          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input type="checkbox" required checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5" />
            <span>
              I own the games I add, I made the images myself, and I will not share them. I accept the{' '}
              <Link to="/legal/terms" className="underline">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/legal/privacy" className="underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-sm text-emerald-400" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || (mode === 'signup' && !agree)}>
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
