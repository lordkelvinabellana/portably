import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../app/useAuth'
import type { Profile } from '../../lib/db.types'
import { supabase } from '../../lib/supabase'
import { withCoreSettings, type CoreSettings } from '../settings/coreSettings'
import {
  deleteUserGame,
  fetchLibrary,
  fetchProfile,
  isoObjectPath,
  setUploadStatus,
  upsertGame,
  upsertUserGame,
  type LibraryEntry,
} from './api'
import { downloadToDevice } from './download'
import { sha256File } from './hash'
import { hasLocal, listLocalShas, removeLocal, requestPersistentStorage, storageEstimate, writeLocal } from './opfs'
import { formatFromName, identifyGame } from './psp/identify'
import { normalizeHomebrewZip } from './psp/zip'
import { createResumableUpload, type ResumableUpload } from './upload'

/** Turn storage/tus failures into something a player can act on. */
export function friendlyUploadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/response code: 413|Maximum size exceeded|Payload too large/i.test(msg)) {
    return (
      'Cloud upload refused: this file is larger than the storage plan allows (the Supabase Free plan caps uploads at 50 MB). ' +
      'The game is saved on this device and playable here; upload it again after the plan is upgraded.'
    )
  }
  if (/quota exceeded/i.test(msg)) {
    return 'Cloud upload refused: your storage quota is full. Delete a game from the cloud to free space.'
  }
  if (/not signed in|JWT|401/i.test(msg)) return 'Your session expired. Sign in again and add the game once more to resume the upload.'
  return msg
}

export type TaskStage =
  | 'repacking'
  | 'hashing'
  | 'identifying'
  | 'caching'
  | 'uploading'
  | 'downloading'
  | 'verifying'
  | 'done'
  | 'error'

export interface Task {
  id: string
  kind: 'add' | 'download'
  label: string
  stage: TaskStage
  progress: number // 0..1
  detail?: string
  error?: string
  paused?: boolean
  pause?: () => void
  resume?: () => void
  cancel?: () => void
}

export interface LibraryState {
  entries: (LibraryEntry & { local: boolean })[]
  profile: Profile | null
  device: { usage: number; quota: number } | null
  loading: boolean
  error: string | null
  tasks: Task[]
}

export function useLibrary() {
  const { user } = useAuth()
  const [state, setState] = useState<LibraryState>({
    entries: [],
    profile: null,
    device: null,
    loading: true,
    error: null,
    tasks: [],
  })
  const uploads = useRef(new Map<string, ResumableUpload>())

  const patchTask = useCallback((id: string, patch: Partial<Task>) => {
    setState((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
  }, [])
  const addTask = useCallback((t: Task) => setState((s) => ({ ...s, tasks: [t, ...s.tasks] })), [])
  const dropTask = useCallback((id: string) => setState((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) })), [])

  const refresh = useCallback(async () => {
    if (!user) return
    try {
      const [entries, profile, local, device] = await Promise.all([
        fetchLibrary(user.id),
        fetchProfile(user.id),
        listLocalShas(),
        storageEstimate(),
      ])
      setState((s) => ({
        ...s,
        entries: entries.map((e) => ({ ...e, local: local.has(e.userGame.file_sha256) })),
        profile,
        device,
        loading: false,
        error: null,
      }))
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }))
    }
  }, [user])

  useEffect(() => {
    // refresh() only sets state after awaiting network/OPFS, never synchronously.
    // eslint-disable-next-line react/set-state-in-effect
    void refresh()
  }, [refresh])

  /** Full add-game pipeline: hash -> identify -> register -> cache -> upload. */
  const addGame = useCallback(
    async (file: File) => {
      if (!user) return
      const id = `add-${Date.now()}-${file.name}`
      const abort = new AbortController()
      addTask({ id, kind: 'add', label: file.name, stage: 'hashing', progress: 0, cancel: () => abort.abort() })
      try {
        void requestPersistentStorage()
        if (formatFromName(file.name) === 'zip') {
          // EmulatorJS boots the first bootable entry in a zip; make sure that is EBOOT.PBP.
          patchTask(id, { stage: 'repacking' })
          const fixed = await normalizeHomebrewZip(file)
          if (fixed) {
            file = fixed
            patchTask(id, { detail: 'repacked so EBOOT.PBP boots first' })
          }
          patchTask(id, { stage: 'hashing' })
        }
        const sha = await sha256File(file, (d, t) => patchTask(id, { progress: d / t }), abort.signal)

        patchTask(id, { stage: 'identifying', progress: 0 })
        const identity = await identifyGame(file, sha)
        patchTask(id, { detail: `${identity.title} (${identity.discId})` })

        const existing = state.entries.find((e) => e.userGame.file_sha256 === sha)
        const game = existing?.game ?? (await upsertGame(identity.discId, identity.title, identity.region))
        const userGame =
          existing && existing.userGame.upload_status === 'ready'
            ? existing.userGame
            : await upsertUserGame({
                user_id: user.id,
                game_id: game.id,
                file_sha256: sha,
                file_size: file.size,
                file_name: file.name,
                file_format: identity.format,
              })

        if (!(await hasLocal(sha))) {
          patchTask(id, { stage: 'caching', progress: 0 })
          await writeLocal(sha, identity.format, file, (w) => patchTask(id, { progress: w / file.size }), abort.signal)
        }
        await refresh()

        if (userGame.upload_status === 'ready' && userGame.storage_path) {
          patchTask(id, { stage: 'done', progress: 1, detail: 'Already in your cloud library' })
          setTimeout(() => dropTask(id), 4000)
          return
        }

        patchTask(id, { stage: 'uploading', progress: 0 })
        const objectName = `${user.id}/${sha}.${identity.format}`
        await new Promise<void>((resolve, reject) => {
          const up = createResumableUpload({
            file,
            bucket: 'isos',
            objectName,
            onProgress: (s, t) => patchTask(id, { progress: s / t, paused: false }),
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          })
          uploads.current.set(id, up)
          patchTask(id, {
            pause: () => {
              up.pause()
              patchTask(id, { paused: true })
            },
            resume: () => {
              up.start()
              patchTask(id, { paused: false })
            },
            cancel: () => {
              void up.abort()
              reject(new DOMException('upload cancelled', 'AbortError'))
            },
          })
          abort.signal.addEventListener('abort', () => void up.abort(), { once: true })
          up.start()
        })
        uploads.current.delete(id)
        await setUploadStatus(user.id, game.id, 'ready', isoObjectPath(user.id, sha, identity.format))
        patchTask(id, { stage: 'done', progress: 1 })
        await refresh()
        setTimeout(() => dropTask(id), 4000)
      } catch (e) {
        const cancelled = e instanceof DOMException && e.name === 'AbortError'
        patchTask(id, { stage: 'error', error: cancelled ? 'Cancelled' : friendlyUploadError(e) })
        // Mark the row so the shelf shows "upload failed" with a retry, if it was created.
        void refresh()
      }
    },
    [user, state.entries, addTask, patchTask, dropTask, refresh],
  )

  const downloadGame = useCallback(
    async (entry: LibraryEntry) => {
      const { userGame, game } = entry
      if (!userGame.storage_path) return
      const id = `dl-${userGame.game_id}`
      const abort = new AbortController()
      addTask({ id, kind: 'download', label: game.title, stage: 'downloading', progress: 0, cancel: () => abort.abort() })
      try {
        await downloadToDevice({
          storagePath: userGame.storage_path,
          sha256: userGame.file_sha256,
          ext: userGame.file_format,
          expectedSize: userGame.file_size,
          onProgress: (d, t) => patchTask(id, { progress: d / t }),
          signal: abort.signal,
        })
        patchTask(id, { stage: 'done', progress: 1 })
        await refresh()
        setTimeout(() => dropTask(id), 3000)
      } catch (e) {
        patchTask(id, { stage: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    },
    [addTask, patchTask, dropTask, refresh],
  )

  const removeFromDevice = useCallback(
    async (entry: LibraryEntry) => {
      await removeLocal(entry.userGame.file_sha256)
      await refresh()
    },
    [refresh],
  )

  const deleteFromCloud = useCallback(
    async (entry: LibraryEntry, alsoLocal: boolean) => {
      await deleteUserGame(entry)
      if (alsoLocal) await removeLocal(entry.userGame.file_sha256)
      await refresh()
    },
    [refresh],
  )

  const updateCoreSettings = useCallback(
    async (entry: LibraryEntry, core: CoreSettings) => {
      const { error } = await supabase
        .from('user_games')
        .update({ settings: withCoreSettings(entry.userGame.settings, core) })
        .eq('user_id', entry.userGame.user_id)
        .eq('game_id', entry.userGame.game_id)
      if (error) throw new Error(error.message)
      await refresh()
    },
    [refresh],
  )

  return { ...state, refresh, addGame, downloadGame, removeFromDevice, deleteFromCloud, dropTask, updateCoreSettings }
}
