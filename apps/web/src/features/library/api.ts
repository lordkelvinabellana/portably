import { supabase } from '../../lib/supabase'
import type { FileFormat, Game, Profile, UploadStatus, UserGame } from '../../lib/db.types'

export interface LibraryEntry {
  game: Game
  userGame: UserGame
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) throw new Error(error.message)
  return data
}

export async function fetchLibrary(userId: string): Promise<LibraryEntry[]> {
  const { data: rows, error } = await supabase
    .from('user_games')
    .select('*')
    .eq('user_id', userId)
    .order('last_played_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  if (!rows.length) return []
  const ids = [...new Set(rows.map((r) => r.game_id))]
  const { data: games, error: gErr } = await supabase.from('games').select('*').in('id', ids)
  if (gErr) throw new Error(gErr.message)
  const byId = new Map(games.map((g) => [g.id, g]))
  return rows
    .map((userGame) => ({ userGame, game: byId.get(userGame.game_id) }))
    .filter((e): e is LibraryEntry => !!e.game)
}

export async function fetchEntry(userId: string, gameId: number): Promise<LibraryEntry | null> {
  const { data: userGame, error } = await supabase
    .from('user_games')
    .select('*')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!userGame) return null
  const { data: game, error: gErr } = await supabase.from('games').select('*').eq('id', gameId).single()
  if (gErr) throw new Error(gErr.message)
  return { game, userGame }
}

export async function upsertGame(discId: string, title: string, region: string | null): Promise<Game> {
  const { data, error } = await supabase.rpc('upsert_game', {
    p_disc_id: discId,
    p_title: title,
    p_region: region,
  })
  if (error) throw new Error(error.message)
  return data
}

export interface NewUserGame {
  user_id: string
  game_id: number
  file_sha256: string
  file_size: number
  file_name: string
  file_format: FileFormat
}

export async function upsertUserGame(row: NewUserGame): Promise<UserGame> {
  const { data, error } = await supabase
    .from('user_games')
    .upsert({ ...row, upload_status: 'uploading' as UploadStatus, storage_path: null }, { onConflict: 'user_id,game_id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function setUploadStatus(
  userId: string,
  gameId: number,
  status: UploadStatus,
  storagePath: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('user_games')
    .update({ upload_status: status, storage_path: storagePath })
    .eq('user_id', userId)
    .eq('game_id', gameId)
  if (error) throw new Error(error.message)
}

/** Delete the cloud object (if any) and the library row. Saves are kept on purpose. */
export async function deleteUserGame(entry: LibraryEntry): Promise<void> {
  const path = entry.userGame.storage_path
  if (path) {
    const slash = path.indexOf('/')
    const { error } = await supabase.storage.from(path.slice(0, slash)).remove([path.slice(slash + 1)])
    if (error && !/not found/i.test(error.message)) throw new Error(error.message)
  }
  const { error } = await supabase
    .from('user_games')
    .delete()
    .eq('user_id', entry.userGame.user_id)
    .eq('game_id', entry.userGame.game_id)
  if (error) throw new Error(error.message)
}

export const isoObjectPath = (userId: string, sha: string, ext: string) => `isos/${userId}/${sha}.${ext}`
