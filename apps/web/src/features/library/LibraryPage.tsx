import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../app/useAuth'
import type { Profile } from '../../lib/db.types'

const GB = 1024 ** 3

/** Phase 1 placeholder: proves auth + RLS round trip by reading the caller's profile. */
export function LibraryPage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setProfile(data)
      })
  }, [user])

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Your library</h1>
      <p className="mb-6 text-zinc-400">
        No games yet. Adding games arrives in Phase 2: pick a PSP image you own, it is hashed and
        uploaded to your private storage, and it shows up on every device you sign in from.
      </p>
      {error && <p className="text-sm text-red-400">Could not load profile: {error}</p>}
      {profile && (
        <div className="rounded-lg border border-zinc-800 p-4 text-sm">
          <div className="mb-2 flex justify-between text-zinc-400">
            <span>Cloud storage</span>
            <span>
              {(profile.storage_used_bytes / GB).toFixed(2)} GB of{' '}
              {(profile.storage_quota_bytes / GB).toFixed(0)} GB
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-zinc-800">
            <div
              className="h-full bg-emerald-500"
              style={{
                width: `${Math.min(100, (100 * profile.storage_used_bytes) / profile.storage_quota_bytes)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
