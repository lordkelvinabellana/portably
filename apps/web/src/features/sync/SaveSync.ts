import type { Game, UserGame } from '../../lib/db.types'
import { supabase } from '../../lib/supabase'
import {
  fsDirMtime,
  fsListSavedataDirs,
  fsReadTree,
  idbReadSavedata,
  idbWriteSavedata,
  ownsDir,
  snapshotHash,
  type SaveFile,
} from './memstick'
import { downloadSaveBundle, latestSave, pruneSaves, saveWithHash, uploadSaveBundle, type SaveRow } from './savesApi'
import { gunzip, gzip, packTar, unpackTar, type TarEntry } from './tar'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SyncConflict {
  cloud: SaveRow
  cloudFiles: TarEntry[]
  local: TarEntry[]
  localHash: string
}

export interface SyncStatus {
  phase: 'idle' | 'preparing' | 'restored' | 'watching' | 'syncing' | 'error'
  lastSyncedAt: number | null
  lastVersion: SaveRow | null
  dirty: boolean
  message?: string
}

export type PrepareResult = { kind: 'ok' } | { kind: 'conflict'; conflict: SyncConflict }

const POLL_MS = 10_000
const KEEP_VERSIONS = 10

/**
 * Keeps one game's PSP savedata in sync with the user's cloud versions.
 *
 *  prepare()  before the emulator mounts: compare the local memory stick (via IndexedDB)
 *             with the newest cloud version and restore / flag a conflict.
 *  start(FS)  while running: poll the live filesystem, upload when the content hash changes,
 *             also on tab hide and before exit.
 */
export class SaveSync {
  private knownDirs: string[]
  private lastHash: string | null = null
  private dirty = false
  private timer: number | null = null
  private FS: any = null
  private bootTime = 0
  private syncing = false
  private again = false
  status: SyncStatus = { phase: 'idle', lastSyncedAt: null, lastVersion: null, dirty: false }

  private readonly userId: string
  private readonly game: Game
  private readonly userGame: UserGame
  private readonly deviceLabel: string
  private readonly onStatus: (s: SyncStatus) => void

  constructor(userId: string, game: Game, userGame: UserGame, deviceLabel: string, onStatus: (s: SyncStatus) => void) {
    this.userId = userId
    this.game = game
    this.userGame = userGame
    this.deviceLabel = deviceLabel
    this.onStatus = onStatus
    const settings = (userGame.settings ?? {}) as { savedata_dirs?: string[] }
    this.knownDirs = Array.isArray(settings.savedata_dirs) ? settings.savedata_dirs : []
  }

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch, dirty: this.dirty }
    this.onStatus(this.status)
  }

  private owned(files: SaveFile[]): SaveFile[] {
    return files.filter((f) => ownsDir(f.dir, this.game.disc_id, this.knownDirs))
  }

  async prepare(): Promise<PrepareResult> {
    this.set({ phase: 'preparing' })
    const [cloud, localAll] = await Promise.all([latestSave(this.userId, this.userGame.game_id), idbReadSavedata()])
    const local = this.owned(localAll)
    const localHash = local.length ? await snapshotHash(local) : null

    if (!cloud) {
      // Nothing in the cloud yet. Anything local is uploaded after boot.
      this.dirty = local.length > 0
      this.lastHash = null
      this.set({ phase: 'restored', lastVersion: null })
      return { kind: 'ok' }
    }
    if (localHash === cloud.content_hash) {
      this.lastHash = localHash
      this.set({ phase: 'restored', lastVersion: cloud })
      return { kind: 'ok' }
    }
    const cloudFiles = unpackTar(await gunzip(await downloadSaveBundle(cloud)))
    if (!local.length || (localHash && (await saveWithHash(this.userId, this.userGame.game_id, localHash)))) {
      // Local is empty or an older known version: take the cloud copy.
      await this.applyRestore(cloudFiles, cloud)
      return { kind: 'ok' }
    }
    this.set({ phase: 'preparing', message: 'conflict' })
    return { kind: 'conflict', conflict: { cloud, cloudFiles, local, localHash: localHash! } }
  }

  /** Resolve a conflict reported by prepare(). */
  async resolve(conflict: SyncConflict, choice: 'cloud' | 'local'): Promise<void> {
    if (choice === 'cloud') {
      await this.applyRestore(conflict.cloudFiles, conflict.cloud)
    } else {
      this.dirty = true
      this.lastHash = null
      this.set({ phase: 'restored', lastVersion: conflict.cloud, message: 'keeping local save; will upload as a new version' })
    }
  }

  private async applyRestore(files: TarEntry[], row: SaveRow) {
    await idbWriteSavedata(files)
    this.learnDirs(files.map((f) => f.path.split('/')[0]))
    this.lastHash = row.content_hash
    this.dirty = false
    this.set({ phase: 'restored', lastVersion: row, lastSyncedAt: new Date(row.created_at).getTime() })
  }

  private learnDirs(dirs: string[]) {
    let changed = false
    for (const d of dirs) {
      if (!this.knownDirs.includes(d)) {
        this.knownDirs.push(d)
        changed = true
      }
    }
    if (changed) {
      void supabase
        .from('user_games')
        .update({ settings: { ...(this.userGame.settings as object), savedata_dirs: this.knownDirs } })
        .eq('user_id', this.userId)
        .eq('game_id', this.userGame.game_id)
    }
  }

  start(FS: any) {
    this.FS = FS
    this.bootTime = Date.now()
    this.set({ phase: 'watching' })
    this.timer = window.setInterval(() => void this.syncNow(), POLL_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
    window.addEventListener('pagehide', this.onPageHide)
    if (this.dirty) void this.syncNow()
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    document.removeEventListener('visibilitychange', this.onVisibility)
    window.removeEventListener('pagehide', this.onPageHide)
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.syncNow()
  }
  private onPageHide = () => {
    void this.syncNow()
  }

  /** Snapshot the game's savedata from the live FS. Homebrew learns folders touched since boot. */
  private snapshot(): SaveFile[] {
    const FS = this.FS
    if (!FS) return []
    const dirs = fsListSavedataDirs(FS)
    if (this.game.disc_id.startsWith('HB')) {
      const touched = dirs.filter((d) => !this.knownDirs.includes(d) && fsDirMtime(FS, d) >= this.bootTime - 1000)
      if (touched.length) this.learnDirs(touched)
    }
    const owned = dirs.filter((d) => ownsDir(d, this.game.disc_id, this.knownDirs))
    return owned.flatMap((d) => fsReadTree(FS, d))
  }

  async syncNow(): Promise<void> {
    if (!this.FS) return
    if (this.syncing) {
      this.again = true
      return
    }
    this.syncing = true
    try {
      const files = this.snapshot()
      if (!files.length) return
      const hash = await snapshotHash(files)
      if (hash === this.lastHash && !this.dirty) return
      // Skip if this exact content already exists in the cloud (e.g. restored then unchanged).
      const existing = await saveWithHash(this.userId, this.userGame.game_id, hash)
      if (existing) {
        this.lastHash = hash
        this.dirty = false
        this.set({ phase: 'watching', lastVersion: existing, lastSyncedAt: Date.now() })
        return
      }
      this.set({ phase: 'syncing' })
      const gz = await gzip(packTar(files))
      const row = await uploadSaveBundle(this.userId, this.userGame.game_id, this.game.disc_id, gz, hash, this.deviceLabel)
      this.lastHash = hash
      this.dirty = false
      this.set({ phase: 'watching', lastVersion: row, lastSyncedAt: Date.now(), message: undefined })
      void pruneSaves(this.userId, this.userGame.game_id, KEEP_VERSIONS)
    } catch (e) {
      this.dirty = true
      this.set({ phase: 'error', message: e instanceof Error ? e.message : String(e) })
    } finally {
      this.syncing = false
      if (this.again) {
        this.again = false
        void this.syncNow()
      }
    }
  }
}
