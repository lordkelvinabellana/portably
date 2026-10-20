import type { UserGame } from '../../lib/db.types'
import type { LibraryEntry } from './api'
import type { GameIdentity } from './psp/identify'

/** Local-only mode: the library index lives in localStorage; the game files are in OPFS. */
const KEY = 'portably:library'

export function readLocalLibrary(): LibraryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as LibraryEntry[]
  } catch {
    return []
  }
}

const write = (entries: LibraryEntry[]) => localStorage.setItem(KEY, JSON.stringify(entries))

/** Add or replace a game, one entry per disc id like the cloud library. */
export function putLocalEntry(sha: string, file: File, id: GameIdentity): LibraryEntry {
  const entries = readLocalLibrary()
  const found = entries.find((e) => e.game.disc_id === id.discId)
  const now = new Date().toISOString()
  const gameId = found?.game.id ?? Math.max(0, ...entries.map((e) => e.game.id)) + 1
  const entry: LibraryEntry = {
    game: { id: gameId, disc_id: id.discId, title: id.title, region: id.region, cover_url: null, created_at: found?.game.created_at ?? now },
    userGame: {
      user_id: 'local',
      game_id: gameId,
      file_sha256: sha,
      file_size: file.size,
      file_name: file.name,
      file_format: id.format,
      storage_path: null,
      upload_status: 'ready',
      settings: found?.userGame.settings ?? {},
      last_played_at: found?.userGame.last_played_at ?? null,
      total_play_seconds: found?.userGame.total_play_seconds ?? 0,
      created_at: found?.userGame.created_at ?? now,
      updated_at: now,
    },
  }
  write([entry, ...entries.filter((e) => e.game.id !== gameId)])
  return entry
}

export function patchLocalEntry(gameId: number, patch: Partial<UserGame>) {
  write(readLocalLibrary().map((e) => (e.game.id === gameId ? { ...e, userGame: { ...e.userGame, ...patch } } : e)))
}

export function removeLocalEntry(gameId: number) {
  write(readLocalLibrary().filter((e) => e.game.id !== gameId))
}
