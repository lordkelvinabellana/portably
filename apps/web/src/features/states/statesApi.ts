import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/db.types'
import { gunzip } from '../sync/tar'

export type StateRow = Database['public']['Tables']['save_states']['Row']

/** Slot 0 is the automatic "resume where you left off" state; 1..9 are manual. */
export const AUTO_SLOT = 0
export const MANUAL_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export const statePath = (userId: string, discId: string, slot: number) => `${userId}/${discId}/${slot}.state.gz`
export const screenshotPath = (userId: string, discId: string, slot: number) => `${userId}/${discId}/${slot}.png`

export async function listStates(userId: string, gameId: number): Promise<StateRow[]> {
  const { data, error } = await supabase
    .from('save_states')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .order('slot')
  if (error) throw new Error(error.message)
  return data
}

export interface PutStateArgs {
  userId: string
  gameId: number
  discId: string
  slot: number
  stateGz: Blob
  screenshot: Blob | null
  coreVersion: string
}

/** Upload (overwrite) a slot's state and screenshot, then upsert its row. */
export async function putState(a: PutStateArgs): Promise<StateRow> {
  const sPath = statePath(a.userId, a.discId, a.slot)
  const { error: upErr } = await supabase.storage
    .from('states')
    .upload(sPath, a.stateGz, { contentType: 'application/gzip', upsert: true })
  if (upErr) throw new Error(`state upload failed: ${upErr.message}`)

  let shot: string | null = null
  if (a.screenshot) {
    const p = screenshotPath(a.userId, a.discId, a.slot)
    const { error } = await supabase.storage.from('screenshots').upload(p, a.screenshot, { contentType: 'image/png', upsert: true })
    if (!error) shot = `screenshots/${p}`
  }

  const { data, error } = await supabase
    .from('save_states')
    .upsert(
      {
        user_id: a.userId,
        game_id: a.gameId,
        slot: a.slot,
        storage_path: `states/${sPath}`,
        screenshot_path: shot,
        size_bytes: a.stateGz.size,
        core_version: a.coreVersion,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game_id,slot' },
    )
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchStateBytes(row: StateRow): Promise<Uint8Array> {
  const slash = row.storage_path.indexOf('/')
  const { data, error } = await supabase.storage.from(row.storage_path.slice(0, slash)).download(row.storage_path.slice(slash + 1))
  if (error || !data) throw new Error(`could not download state: ${error?.message ?? 'unknown'}`)
  return gunzip(data)
}

export async function deleteState(row: StateRow): Promise<void> {
  const paths = [row.storage_path, row.screenshot_path].filter((p): p is string => !!p)
  for (const p of paths) {
    const slash = p.indexOf('/')
    await supabase.storage.from(p.slice(0, slash)).remove([p.slice(slash + 1)])
  }
  const { error } = await supabase.from('save_states').delete().eq('id', row.id)
  if (error) throw new Error(error.message)
}

/** Short-lived signed URLs for the slots' screenshots, keyed by slot. */
export async function screenshotUrls(rows: StateRow[]): Promise<Record<number, string>> {
  const withShots = rows.filter((r) => r.screenshot_path)
  if (!withShots.length) return {}
  const paths = withShots.map((r) => r.screenshot_path!.slice(r.screenshot_path!.indexOf('/') + 1))
  const { data, error } = await supabase.storage.from('screenshots').createSignedUrls(paths, 600)
  if (error || !data) return {}
  const out: Record<number, string> = {}
  data.forEach((d, i) => {
    if (d.signedUrl) out[withShots[i].slot] = d.signedUrl
  })
  return out
}
