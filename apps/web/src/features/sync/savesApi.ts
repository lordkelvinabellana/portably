import { supabase } from '../../lib/supabase'
import type { Database } from '../../lib/db.types'

export type SaveRow = Database['public']['Tables']['saves']['Row']

export async function latestSave(userId: string, gameId: number): Promise<SaveRow | null> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function saveWithHash(userId: string, gameId: number, hash: string): Promise<SaveRow | null> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .eq('content_hash', hash)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function downloadSaveBundle(row: SaveRow): Promise<Blob> {
  const slash = row.storage_path.indexOf('/')
  const { data, error } = await supabase.storage.from(row.storage_path.slice(0, slash)).download(row.storage_path.slice(slash + 1))
  if (error || !data) throw new Error(`could not download save: ${error?.message ?? 'unknown'}`)
  return data
}

export async function uploadSaveBundle(
  userId: string,
  gameId: number,
  discId: string,
  gz: Blob,
  contentHash: string,
  deviceLabel: string,
): Promise<SaveRow> {
  const id = crypto.randomUUID()
  const objectPath = `${userId}/${discId}/${id}.tar.gz`
  const { error: upErr } = await supabase.storage
    .from('saves')
    .upload(objectPath, gz, { contentType: 'application/gzip', upsert: false })
  if (upErr) throw new Error(`save upload failed: ${upErr.message}`)
  const { data, error } = await supabase
    .from('saves')
    .insert({
      user_id: userId,
      game_id: gameId,
      storage_path: `saves/${objectPath}`,
      content_hash: contentHash,
      size_bytes: gz.size,
      device_label: deviceLabel,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

/** Keep the newest `keep` versions; delete older objects and rows. */
export async function pruneSaves(userId: string, gameId: number, keep = 10): Promise<void> {
  const { data, error } = await supabase
    .from('saves')
    .select('id, storage_path')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
  if (error || !data || data.length <= keep) return
  const old = data.slice(keep)
  const paths = old.map((r) => r.storage_path.slice(r.storage_path.indexOf('/') + 1))
  await supabase.storage.from('saves').remove(paths)
  await supabase
    .from('saves')
    .delete()
    .in(
      'id',
      old.map((r) => r.id),
    )
}
