import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './useAuth'
import { LOCAL_ONLY, supabaseConfigured } from '../lib/supabase'

/** Gate for signed-in routes. Remembers where the user was heading. */
export function RequireAuth() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (LOCAL_ONLY) return <Outlet />
  if (!supabaseConfigured) return <SetupNotice />
  if (!ready) return <FullPageMessage>Loading your session…</FullPageMessage>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-zinc-400">{children}</div>
  )
}

export function SetupNotice() {
  return (
    <div className="mx-auto max-w-lg rounded-lg border border-amber-500/40 bg-amber-500/10 p-6 text-sm">
      <h2 className="mb-2 text-base font-semibold text-amber-300">Supabase is not configured</h2>
      <p className="text-zinc-300">
        Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code> and fill in
        your project URL and anon key, then restart the dev server. The emulator spike at{' '}
        <a className="underline" href="/dev/spike">
          /dev/spike
        </a>{' '}
        works without it.
      </p>
    </div>
  )
}
