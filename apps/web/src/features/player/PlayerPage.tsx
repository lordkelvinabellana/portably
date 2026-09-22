import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../app/useAuth'
import { formatBytes, formatRelative } from '../../lib/format'
import { fetchEntry, type LibraryEntry } from '../library/api'
import { downloadToDevice } from '../library/download'
import { getLocalFile } from '../library/opfs'
import { emulatorAlreadyUsed, mountEmulator, type EmulatorHandle } from '../emulator/emulatorjs'
import { SaveSync, type SyncConflict, type SyncStatus } from '../sync/SaveSync'
import { getCoreVersion } from '../states/coreVersion'
import { StateManager, type StatesStatus } from '../states/StateManager'
import { AUTO_SLOT } from '../states/statesApi'
import { StatesPanel } from '../states/StatesPanel'
import { deviceLabel, endPlaySession, startPlaySession } from './sessions'

type Phase =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'need-download'; progress: number | null }
  | { kind: 'preparing' }
  | { kind: 'conflict'; conflict: SyncConflict }
  | { kind: 'booting' }
  | { kind: 'running' }
  | { kind: 'exited' }

const HIDDEN_BUTTONS = [
  'saveState',
  'loadState',
  'quickSave',
  'quickLoad',
  'saveSavFiles',
  'loadSavFiles',
  'cacheManager',
  'netplay',
  'exitEmulation',
  'screenRecord',
]

export function PlayerPage() {
  const { gameId } = useParams()
  const { user } = useAuth()
  const [entry, setEntry] = useState<LibraryEntry | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [states, setStates] = useState<StatesStatus | null>(null)
  const [coreVersion, setCoreVersion] = useState<string | null>(null)
  const [showStates, setShowStates] = useState(false)
  const [resumeOffer, setResumeOffer] = useState<{ at: string; device: string | null; otherBuild: boolean } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden')
  const syncRef = useRef<SaveSync | null>(null)
  const statesRef = useRef<StateManager | null>(null)
  const emuRef = useRef<EmulatorHandle | null>(null)
  const sessionRef = useRef<{ id: string | null; startedAt: number } | null>(null)
  const container = useRef<HTMLDivElement>(null)

  // A second game in the same page load needs a fresh page (EmulatorJS is single-instance).
  useEffect(() => {
    if (emulatorAlreadyUsed()) window.location.reload()
  }, [])

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Load the library entry and decide whether the file is on this device.
  useEffect(() => {
    if (!user || !gameId) return
    let cancelled = false
    ;(async () => {
      try {
        const e = await fetchEntry(user.id, Number(gameId))
        if (cancelled) return
        if (!e) return setPhase({ kind: 'error', message: 'This game is not in your library.' })
        setEntry(e)
        const local = await getLocalFile(e.userGame.file_sha256)
        if (cancelled) return
        setPhase(local ? { kind: 'preparing' } : { kind: 'need-download', progress: null })
      } catch (err) {
        if (!cancelled) setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user, gameId])

  // Prepare saves (restore / conflict), then boot.
  useEffect(() => {
    if (!user || !entry || phase.kind !== 'preparing' || emulatorAlreadyUsed()) return
    const s = new SaveSync(user.id, entry.game, entry.userGame, deviceLabel(), setSync)
    syncRef.current = s
    let cancelled = false
    s.prepare()
      .then((r) => {
        if (cancelled) return
        if (r.kind === 'conflict') setPhase({ kind: 'conflict', conflict: r.conflict })
        else setPhase({ kind: 'booting' })
      })
      .catch((err) => !cancelled && setPhase({ kind: 'error', message: `Save sync failed: ${err instanceof Error ? err.message : String(err)}` }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, entry, phase.kind])

  // Boot the emulator.
  useEffect(() => {
    if (!user || !entry || phase.kind !== 'booting' || !container.current) return
    const s = syncRef.current
    let cancelled = false
    ;(async () => {
      const file = await getLocalFile(entry.userGame.file_sha256)
      if (!file) return setPhase({ kind: 'need-download', progress: null })
      const url = URL.createObjectURL(file)
      const handle = await mountEmulator({
        container: container.current!,
        gameUrl: url,
        gameName: entry.game.title,
        gameId: entry.game.id,
        hideButtons: HIDDEN_BUTTONS,
        onStart: () => {
          if (cancelled) return
          setPhase({ kind: 'running' })
          if (s) s.start(handle.FS)
          sessionRef.current = { id: null, startedAt: Date.now() }
          void startPlaySession(user.id, entry.game.id).then((id) => {
            if (sessionRef.current) sessionRef.current.id = id
          })
          // Save states: list slots, offer auto-resume, start periodic snapshots.
          const sm = new StateManager(user.id, entry.game, handle, setStates)
          statesRef.current = sm
          void (async () => {
            const cv = await getCoreVersion()
            setCoreVersion(cv)
            await sm.refresh()
            const auto = sm.slot(AUTO_SLOT)
            if (auto) setResumeOffer({ at: auto.created_at, device: null, otherBuild: auto.core_version !== cv })
            sm.startAutoResume()
          })()
        },
        onExit: () => {
          if (!cancelled) setPhase({ kind: 'exited' })
        },
      })
      emuRef.current = handle
    })().catch((err) => setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) }))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  async function download() {
    if (!entry?.userGame.storage_path) return
    setPhase({ kind: 'need-download', progress: 0 })
    try {
      await downloadToDevice({
        storagePath: entry.userGame.storage_path,
        sha256: entry.userGame.file_sha256,
        ext: entry.userGame.file_format,
        expectedSize: entry.userGame.file_size,
        onProgress: (d, t) => setPhase({ kind: 'need-download', progress: d / t }),
      })
      setPhase({ kind: 'preparing' })
    } catch (err) {
      setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  async function resolveConflict(choice: 'cloud' | 'local') {
    if (phase.kind !== 'conflict' || !syncRef.current) return
    await syncRef.current.resolve(phase.conflict, choice)
    setPhase({ kind: 'booting' })
  }

  async function loadSlot(slot: number) {
    const sm = statesRef.current
    if (!sm) return
    let result = await sm.loadSlot(slot)
    if (result === 'version-mismatch') {
      if (
        window.confirm(
          'This state was made with a different emulator build and may not load correctly. Your saves are unaffected. Try anyway?',
        )
      ) {
        result = await sm.loadSlot(slot, true)
      } else return
    }
    setNotice(result === 'ok' ? `Loaded ${slot === AUTO_SLOT ? 'auto-resume' : `slot ${slot}`}` : 'Could not load that state')
    window.setTimeout(() => setNotice(null), 3000)
  }

  async function exitToLibrary() {
    const s = syncRef.current
    const sm = statesRef.current
    const emu = emuRef.current
    if (sm) {
      sm.stop()
      await sm.autoResume()
    }
    if (s) {
      await s.syncNow()
      s.stop()
    }
    if (user && entry && sessionRef.current) {
      const secs = (Date.now() - sessionRef.current.startedAt) / 1000
      await endPlaySession(sessionRef.current.id, user.id, entry.game.id, secs, entry.userGame.total_play_seconds)
    }
    emu?.exit()
    // Hard navigation clears EmulatorJS's global state for the next game.
    window.location.assign('/')
  }

  const title = entry?.game.title ?? 'Loading…'
  const running = phase.kind === 'running'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {entry && (
          <span className="text-sm text-zinc-500">
            {entry.game.disc_id} · {formatBytes(entry.userGame.file_size)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <>
              <SyncBadge status={sync} />
              <button type="button" className="btn" onClick={() => void syncRef.current?.syncNow()}>
                Sync now
              </button>
              <button type="button" className={`btn ${showStates ? 'bg-zinc-700' : ''}`} onClick={() => setShowStates((v) => !v)}>
                States
              </button>
              <button type="button" className="btn" onClick={() => emuRef.current?.fullscreen(true)}>
                Fullscreen
              </button>
            </>
          )}
          {(running || phase.kind === 'exited' || phase.kind === 'error') && (
            <button type="button" className="btn" onClick={() => void exitToLibrary()}>
              Exit to library
            </button>
          )}
          {!running && phase.kind !== 'exited' && phase.kind !== 'error' && (
            <Link to="/" className="btn">
              Back
            </Link>
          )}
        </div>
      </div>

      {hidden && running && (
        <p className="mb-2 rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
          Emulation is paused while this tab is hidden. Your progress was synced.
        </p>
      )}
      {notice && <p className="mb-2 rounded bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}

      {phase.kind === 'error' && <p className="mb-3 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{phase.message}</p>}

      {phase.kind === 'need-download' && entry && (
        <div className="mb-3 rounded-lg border border-zinc-800 p-4 text-sm">
          <p className="mb-3">
            <b>{entry.game.title}</b> is in your cloud library but not on this device ({formatBytes(entry.userGame.file_size)}).
          </p>
          {phase.progress === null ? (
            <button type="button" className="btn btn-primary" onClick={() => void download()} disabled={!entry.userGame.storage_path}>
              Download and play
            </button>
          ) : (
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-sky-500" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {phase.kind === 'conflict' && <ConflictDialog conflict={phase.conflict} onChoose={(c) => void resolveConflict(c)} />}

      {(phase.kind === 'preparing' || phase.kind === 'loading') && (
        <p className="mb-3 text-sm text-zinc-400">{phase.kind === 'loading' ? 'Loading…' : 'Checking cloud saves…'}</p>
      )}

      {running && resumeOffer && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
          <span>
            Resume where you left off? Snapshot from {formatRelative(resumeOffer.at)}
            {resumeOffer.otherBuild ? ' (different emulator build)' : ''}.
          </span>
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setResumeOffer(null)
                void loadSlot(AUTO_SLOT)
              }}
            >
              Resume
            </button>
            <button type="button" className="btn" onClick={() => setResumeOffer(null)}>
              Start fresh
            </button>
          </span>
        </div>
      )}

      <div
        ref={container}
        id="portably-emulator"
        className="w-full max-w-[960px] bg-black"
        style={{ aspectRatio: '480 / 272', display: phase.kind === 'booting' || running || phase.kind === 'exited' ? undefined : 'none' }}
      />

      {running && showStates && states && (
        <StatesPanel
          status={states}
          coreVersion={coreVersion}
          onSave={(slot) => void statesRef.current?.saveSlot(slot)}
          onLoad={(slot) => void loadSlot(slot)}
          onDelete={(slot) => {
            if (window.confirm(`Delete save state in slot ${slot}?`)) void statesRef.current?.deleteSlot(slot)
          }}
        />
      )}

      {phase.kind === 'exited' && <p className="mt-3 text-sm text-zinc-400">The emulator has exited.</p>}
    </div>
  )
}

function SyncBadge({ status }: { status: SyncStatus | null }) {
  if (!status) return null
  const text =
    status.phase === 'syncing'
      ? 'Syncing save…'
      : status.phase === 'error'
        ? `Sync error: ${status.message ?? ''}`
        : status.dirty
          ? 'Changes pending'
          : status.lastSyncedAt
            ? `Saved to cloud ${formatRelative(new Date(status.lastSyncedAt).toISOString())}`
            : 'No cloud save yet'
  const cls = status.phase === 'error' ? 'text-red-300' : status.phase === 'syncing' || status.dirty ? 'text-amber-300' : 'text-emerald-300'
  return <span className={`text-sm ${cls}`}>{text}</span>
}

function ConflictDialog({ conflict, onChoose }: { conflict: SyncConflict; onChoose: (c: 'cloud' | 'local') => void }) {
  const cloudBytes = conflict.cloudFiles.reduce((n, f) => n + f.data.byteLength, 0)
  const localBytes = conflict.local.reduce((n, f) => n + f.data.byteLength, 0)
  return (
    <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
      <h2 className="mb-2 font-semibold text-amber-200">Two different saves found</h2>
      <p className="mb-3 text-zinc-300">
        The save on this device differs from the newest cloud version and is not one of your earlier versions. Pick
        which one to play with. The other is kept as a version either way.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" className="btn flex-col items-start" onClick={() => onChoose('cloud')}>
          <span className="font-medium">Use cloud save</span>
          <span className="text-xs text-zinc-400">
            from {conflict.cloud.device_label ?? 'another device'} · {formatRelative(conflict.cloud.created_at)} ·{' '}
            {conflict.cloudFiles.length} files, {formatBytes(cloudBytes)}
          </span>
        </button>
        <button type="button" className="btn flex-col items-start" onClick={() => onChoose('local')}>
          <span className="font-medium">Keep this device's save</span>
          <span className="text-xs text-zinc-400">
            {conflict.local.length} files, {formatBytes(localBytes)} · uploaded as a new version
          </span>
        </button>
      </div>
    </div>
  )
}
