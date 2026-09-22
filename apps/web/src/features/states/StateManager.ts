import type { Game } from '../../lib/db.types'
import type { EmulatorHandle } from '../emulator/emulatorjs'
import { gzipOffThread } from '../sync/gzipWorker'
import { getCoreVersion } from './coreVersion'
import { AUTO_SLOT, deleteState, fetchStateBytes, listStates, putState, screenshotUrls, type StateRow } from './statesApi'

export interface StatesStatus {
  busy: { kind: 'saving' | 'loading' | 'deleting'; slot: number } | null
  slots: StateRow[]
  shots: Record<number, string>
  lastAutoAt: number | null
  error?: string
}

export type LoadResult = 'ok' | 'empty' | 'version-mismatch'

const AUTO_RESUME_MS = 3 * 60_000

/**
 * Save-state slots for one running game: capture, compress, upload, list, load, delete,
 * plus a periodic auto-resume snapshot in slot 0 (also on tab hide and exit).
 */
export class StateManager {
  private readonly userId: string
  private readonly game: Game
  private readonly handle: EmulatorHandle
  private readonly onStatus: (s: StatesStatus) => void
  private timer: number | null = null
  private lastAutoFrame = -1
  status: StatesStatus = { busy: null, slots: [], shots: {}, lastAutoAt: null }

  constructor(userId: string, game: Game, handle: EmulatorHandle, onStatus: (s: StatesStatus) => void) {
    this.userId = userId
    this.game = game
    this.handle = handle
    this.onStatus = onStatus
  }

  private set(patch: Partial<StatesStatus>) {
    this.status = { ...this.status, ...patch }
    this.onStatus(this.status)
  }

  slot(n: number): StateRow | undefined {
    return this.status.slots.find((s) => s.slot === n)
  }

  async refresh(): Promise<void> {
    try {
      const slots = await listStates(this.userId, this.game.id)
      const shots = await screenshotUrls(slots)
      this.set({ slots, shots, error: undefined })
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) })
    }
  }

  /** Capture the running game into a slot. Compression happens off the emulator's hot path. */
  async saveSlot(slot: number): Promise<void> {
    if (this.status.busy) return
    this.set({ busy: { kind: 'saving', slot }, error: undefined })
    try {
      const raw = this.handle.getState()
      // Compress on a worker: gzipping 40 MB on the main thread would hitch the frame loop.
      const [shot, coreVersion, stateGz] = await Promise.all([
        this.handle.screenshot().catch(() => null),
        getCoreVersion(),
        gzipOffThread(raw),
      ])
      await putState({ userId: this.userId, gameId: this.game.id, discId: this.game.disc_id, slot, stateGz, screenshot: shot, coreVersion })
      if (slot === AUTO_SLOT) {
        this.lastAutoFrame = this.handle.frameCount()
        this.set({ lastAutoAt: Date.now() })
      }
      await this.refresh()
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      this.set({ busy: null })
    }
  }

  async loadSlot(slot: number, force = false): Promise<LoadResult> {
    const row = this.slot(slot)
    if (!row) return 'empty'
    if (!force && row.core_version !== (await getCoreVersion())) return 'version-mismatch'
    if (this.status.busy) return 'empty'
    this.set({ busy: { kind: 'loading', slot }, error: undefined })
    try {
      const bytes = await fetchStateBytes(row)
      this.handle.loadState(bytes)
      return 'ok'
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) })
      return 'empty'
    } finally {
      this.set({ busy: null })
    }
  }

  async deleteSlot(slot: number): Promise<void> {
    const row = this.slot(slot)
    if (!row || this.status.busy) return
    this.set({ busy: { kind: 'deleting', slot } })
    try {
      await deleteState(row)
      await this.refresh()
    } catch (e) {
      this.set({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      this.set({ busy: null })
    }
  }

  /** Auto-resume: slot 0 every few minutes and when the tab is hidden, only if the game advanced. */
  startAutoResume() {
    this.lastAutoFrame = this.handle.frameCount()
    this.timer = window.setInterval(() => void this.autoResume(), AUTO_RESUME_MS)
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  private onVisibility = () => {
    if (document.visibilityState === 'hidden') void this.autoResume()
  }

  async autoResume(): Promise<void> {
    if (!this.handle.isStarted()) return
    if (this.handle.frameCount() === this.lastAutoFrame) return // nothing happened since the last snapshot
    await this.saveSlot(AUTO_SLOT)
  }
}
