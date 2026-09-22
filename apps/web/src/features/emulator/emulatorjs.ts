/**
 * Thin wrapper around EmulatorJS's global, script-based API.
 *
 * emulator.min.js declares top-level classes, so it can be executed only once per page
 * load, and EmulatorJS keeps global state (window.EJS_emulator, EJS_Runtime). We load the
 * scripts once and allow exactly one emulator instance per page load; the Player page
 * hard-navigates when a second game is started.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const EmulatorJS: any // global lexical class from emulator.min.js

export const EJS_DATA_PATH = '/emulatorjs/data/'

let scripts: Promise<void> | null = null

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error(`failed to load ${src}`))
    document.head.appendChild(s)
  })
}
function loadStyle(href: string) {
  return new Promise<void>((resolve) => {
    const l = document.createElement('link')
    l.rel = 'stylesheet'
    l.href = href
    l.onload = () => resolve()
    l.onerror = () => resolve()
    document.head.appendChild(l)
  })
}

/** True when emulator.min.js has already executed on this page (top-level class binding). */
function emulatorClassPresent(): boolean {
  try {
    return new Function('return typeof EmulatorJS')() === 'function'
  } catch {
    return false
  }
}

export function loadEmulatorScripts(): Promise<void> {
  if (!scripts) {
    scripts = (async () => {
      // Never inject twice: a second execution throws "Identifier 'EmulatorJS' has already been declared".
      const src = `${EJS_DATA_PATH}emulator.min.js`
      if (emulatorClassPresent() || document.querySelector(`script[src="${src}"]`)) return
      await loadScript(src)
      await loadStyle(`${EJS_DATA_PATH}emulator.min.css`)
    })()
  }
  return scripts
}

export function emulatorAlreadyUsed(): boolean {
  return !!(window as any).__portablyEmulatorUsed
}

export interface MountOptions {
  /** Element with an id; EmulatorJS renders into it. */
  container: HTMLElement
  gameUrl: string
  gameName: string
  gameId: number
  coreOptions?: Record<string, string>
  /** EmulatorJS bottom-bar buttons to hide */
  hideButtons?: string[]
  /** Fired after the save filesystem (IDBFS) is mounted and before the game boots. Must be synchronous. */
  onSaveDatabaseLoaded?: (FS: any) => void
  onReady?: () => void
  onStart?: () => void
  onExit?: () => void
}

export interface EmulatorHandle {
  ejs: any
  readonly FS: any
  readonly gameManager: any
  isStarted(): boolean
  pause(): void
  play(): void
  fullscreen(on: boolean): void
  /** Opens EmulatorJS's keyboard/gamepad remapping menu. */
  openControls(): void
  getState(): Uint8Array
  loadState(state: Uint8Array): void
  /** PNG of the current frame, or null when capture is unavailable. */
  screenshot(): Promise<Blob | null>
  frameCount(): number
  /** Flushes saves, aborts the wasm module. Irreversible for this page load. */
  exit(): void
}

export async function mountEmulator(o: MountOptions): Promise<EmulatorHandle> {
  if ((window as any).EJS_emulator) {
    throw new Error('An emulator is already running on this page. Reload to start another game.')
  }
  if (!o.container.id) throw new Error('container needs an id')
  await loadEmulatorScripts()
  ;(window as any).__portablyEmulatorUsed = true

  const hide = Object.fromEntries((o.hideButtons ?? []).map((k) => [k, false]))
  // Mirrors the config mapping in EmulatorJS's loader.js.
  const config: Record<string, unknown> = {
    gameUrl: o.gameUrl,
    dataPath: EJS_DATA_PATH,
    system: 'psp',
    gameName: o.gameName,
    gameId: o.gameId,
    threads: true,
    startOnLoad: true,
    buttonOpts: hide,
    defaultOptions: o.coreOptions ?? {},
    backgroundColor: '#000000',
    color: '#10b981',
    shaders: Object.assign({}, (window as any).EJS_SHADERS ?? {}),
  }
  const ejs = new EmulatorJS(`#${o.container.id}`, config)
  ;(window as any).EJS_emulator = ejs
  if (o.onReady) ejs.on('ready', o.onReady)
  if (o.onStart) ejs.on('start', o.onStart)
  if (o.onExit) ejs.on('exit', o.onExit)
  if (o.onSaveDatabaseLoaded) ejs.on('saveDatabaseLoaded', o.onSaveDatabaseLoaded)

  return {
    ejs,
    get FS() {
      return ejs.gameManager?.FS
    },
    get gameManager() {
      return ejs.gameManager
    },
    isStarted: () => !!ejs.started,
    pause: () => ejs.pause?.(),
    play: () => ejs.play?.(),
    fullscreen: (on) => ejs.toggleFullscreen?.(on),
    openControls: () => {
      if (ejs.controlMenu) ejs.controlMenu.style.display = ''
    },
    getState: () => ejs.gameManager.getState(),
    loadState: (s) => ejs.gameManager.loadState(s),
    screenshot: async () => {
      const r = await ejs.takeScreenshot?.('canvas', 'png', 1)
      return r?.blob instanceof Blob ? r.blob : null
    },
    frameCount: () => Number(ejs.gameManager?.getFrameNum?.() ?? 0),
    exit: () => {
      try {
        // Runs EmulatorJS's own handler (flush IDBFS, abort the wasm module) plus ours.
        if (ejs.started) ejs.callEvent('exit')
      } catch (e) {
        console.warn('EmulatorJS exit handler threw', e)
      } finally {
        ;(window as any).EJS_emulator = undefined
      }
    },
  }
}
