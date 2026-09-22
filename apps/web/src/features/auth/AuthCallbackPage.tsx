import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '../../lib/supabase'
import { FullPageMessage } from '../../app/RequireAuth'

function oauthErrorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search)
  return params.get('error_description') ?? params.get('error')
}

/**
 * OAuth / magic-link landing page. supabase-js exchanges the PKCE code from the URL
 * automatically (detectSessionInUrl); we just wait for the session and move on.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(oauthErrorFromUrl)

  useEffect(() => {
    if (error) return
    let done = false
    const finish = () => {
      if (done) return
      done = true
      navigate('/', { replace: true })
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish()
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) finish()
    })
    const timeout = setTimeout(() => {
      if (!done) setError('Sign-in did not complete. Please try again.')
    }, 15000)
    return () => {
      sub.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [navigate, error])

  if (error) {
    return (
      <FullPageMessage>
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <a className="mt-3 inline-block underline" href="/login">
            Back to sign in
          </a>
        </div>
      </FullPageMessage>
    )
  }
  return <FullPageMessage>Signing you in…</FullPageMessage>
}
