import { useEffect, useRef, useState } from 'react'
import './spike.css'

// Phase 0 spike: prove that the PPSSPP core runs in this browser under
// cross-origin isolation, measure emulated FPS, and confirm the save/state
// hooks give us real bytes we can later push to Supabase.
//
// URL switches:
//   ?autostart=1                         load the bundled homebrew and start without clicks
//   ?opt=ppsspp_frameskip:1;ppsspp_x:y   libretro core option overrides (EJS_defaultOptions)

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    EJS_emulator?: any
    [key: string]: any
  }
}

const DATA_PATH = '/emulatorjs/data/'

type Check = { label: string; ok: boolean; detail?: string }

// Runs ONCE (useState initializer). Creating a WebGL context per render was the
// Phase 0 "black screen every 7 seconds" bug: Chromium allows about 16 live WebGL
// contexts per page and loses the oldest one, which was the emulator's.
function envChecks(): Check[] {
  const webgl2 = (() => {
    try {
      const c = document.createElement('canvas')
      const gl = c.getContext('webgl2')
      const ok = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext() // release the probe context
      return ok
    } catch {
      return false
    }
  })()
  return [
    { label: 'crossOriginIsolated', ok: window.crossOriginIsolated === true },
    { label: 'SharedArrayBuffer', ok: typeof SharedArrayBuffer === 'function' },
    { label: 'WebAssembly', ok: typeof WebAssembly === 'object' },
    { label: 'WebGL2', ok: webgl2 },
    { label: 'OPFS', ok: !!navigator.storage?.getDirectory },
    {
      label: 'hardwareConcurrency',
      ok: (navigator.hardwareConcurrency ?? 0) >= 4,
      detail: String(navigator.hardwareConcurrency ?? 'n/a'),
    },
  ]
}

function walkFS(FS: any, dir: string, out: string[], depth = 0) {
  if (depth > 6) return
  let entries: string[] = []
  try {
    entries = FS.readdir(dir)
  } catch {
    out.push(`${dir}  (missing)`)
    return
  }
  for (const name of entries) {
    if (name === '.' || name === '..') continue
    const path = dir.endsWith('/') ? dir + name : `${dir}/${name}`
    try {
      const st = FS.stat(path)
      if (FS.isDir(st.mode)) {
        out.push(`${path}/`)
        walkFS(FS, path, out, depth + 1)
      } else {
        out.push(`${path}  ${st.size} B`)
      }
    } catch {
      out.push(`${path}  (stat failed)`)
    }
  }
}

function parseCoreOverrides(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of (new URLSearchParams(location.search).get('opt') ?? '').split(';')) {
    const i = pair.indexOf(':')
    if (i > 0) out[pair.slice(0, i).trim()] = pair.slice(i + 1).trim()
  }
  return out
}

export function SpikePage() {
  const [checks] = useState<Check[]>(envChecks)
  const [file, setFile] = useState<File | null>(null)
  const [started, setStarted] = useState(false)
  const [booted, setBooted] = useState(false)
  const [fps, setFps] = useState<number | null>(null)
  const [fpsHistory, setFpsHistory] = useState<number[]>([])
  const [log, setLog] = useState<string[]>([])
  const [fsDump, setFsDump] = useState('')
  const [autoStartPending, setAutoStartPending] = useState(false)
  const heldState = useRef<Uint8Array | null>(null)
  const coreReady = checks.slice(0, 4).every((c) => c.ok)

  const addLog = (msg: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 60))

  async function loadBundledHomebrew() {
    // Dev-only: CSPSP homebrew repacked by scripts/zip-folder.mjs into public/dev/
    const blob = await (await fetch('/dev/cspsp.zip')).blob()
    setFile(new File([blob], 'cspsp.zip', { type: 'application/zip' }))
    addLog('loaded bundled homebrew cspsp.zip')
  }

  useEffect(() => {
    if (new URLSearchParams(location.search).get('autostart') !== '1' || !coreReady) return
    loadBundledHomebrew().then(() => setAutoStartPending(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (autoStartPending && file && !started) {
      setAutoStartPending(false)
      start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPending, file])

  // Emulated FPS: delta of the core's frame counter per wall-clock second.
  // Also logs WebGL context loss/restore on the emulator canvas.
  useEffect(() => {
    if (!booted) return
    const canvas = document.querySelector('#ejs canvas')
    const onCtx = (e: Event) => addLog(`WebGL event: ${e.type}`)
    canvas?.addEventListener('webglcontextlost', onCtx)
    canvas?.addEventListener('webglcontextrestored', onCtx)
    let last = -1
    let lastT = performance.now()
    const id = setInterval(() => {
      const gm = window.EJS_emulator?.gameManager
      if (!gm) return
      try {
        const n = Number(gm.getFrameNum())
        const now = performance.now()
        if (last >= 0) {
          const f = ((n - last) * 1000) / (now - lastT)
          setFps(Math.round(f))
          setFpsHistory((h) => [...h.slice(-59), f])
        }
        last = n
        lastT = now
      } catch {
        /* core not ready yet */
      }
    }, 1000)
    return () => {
      clearInterval(id)
      canvas?.removeEventListener('webglcontextlost', onCtx)
      canvas?.removeEventListener('webglcontextrestored', onCtx)
    }
  }, [booted])

  function start() {
    if (!file) return
    const url = URL.createObjectURL(file)
    const coreOverrides = parseCoreOverrides()
    if (Object.keys(coreOverrides).length) addLog(`core overrides: ${JSON.stringify(coreOverrides)}`)
    Object.assign(window, {
      EJS_defaultOptions: coreOverrides,
      EJS_player: '#ejs',
      EJS_core: 'psp',
      EJS_threads: true,
      EJS_gameUrl: url,
      EJS_gameName: file.name.replace(/\.[^.]+$/, ''),
      EJS_gameID: 1,
      EJS_pathtodata: DATA_PATH,
      // Debug mode would pass "-v" to RetroArch and flood the console; the copy
      // script builds emulator.min.js so the normal loader path works.
      EJS_DEBUG_XX: false,
      EJS_startOnLoaded: true,
      EJS_ready: () => addLog('ready: core + UI loaded'),
      EJS_onGameStart: () => {
        addLog('start: game running')
        setBooted(true)
      },
      EJS_onSaveState: (e: { state: Uint8Array; screenshot: Uint8Array; format: string }) => {
        heldState.current = e.state
        addLog(
          `saveState hook: state=${e.state?.byteLength ?? 0} B, screenshot=${
            e.screenshot?.byteLength ?? 0
          } B (${e.format})`,
        )
        return true
      },
      EJS_onLoadState: () => {
        if (heldState.current) {
          window.EJS_emulator.gameManager.loadState(heldState.current)
          addLog(`loadState hook: restored ${heldState.current.byteLength} B`)
        } else {
          addLog('loadState hook: no held state yet')
        }
        return true
      },
      EJS_onSaveSave: (e: { save: Uint8Array | null }) => {
        addLog(
          `saveSave hook: path=${window.EJS_emulator.gameManager.getSaveFilePath()} bytes=${
            e.save?.byteLength ?? 'null'
          }`,
        )
        return true
      },
    })
    const s = document.createElement('script')
    s.src = `${DATA_PATH}loader.js`
    document.body.appendChild(s)
    setStarted(true)
    addLog(`loading core for ${file.name} (${(file.size / 1048576).toFixed(1)} MB)`)
  }

  function dumpFS() {
    const FS = window.EJS_emulator?.gameManager?.FS
    if (!FS) return setFsDump('emulator FS not available yet')
    const out: string[] = []
    // Verified in the spike: the libretro core roots its memory stick at
    // /data/saves/PPSSPP (IDBFS, persisted). /PPSSPP holds read-only assets.
    for (const d of ['/data/saves', '/PPSSPP', '/']) {
      out.push(`== ${d}`)
      if (d === '/') {
        try {
          out.push(FS.readdir('/').join('  '))
        } catch {
          out.push('(readdir failed)')
        }
      } else {
        walkFS(FS, d, out)
      }
      out.push('')
    }
    setFsDump(out.join('\n'))
  }

  function flushSaves() {
    try {
      window.EJS_emulator.gameManager.saveSaveFiles()
      addLog('called saveSaveFiles()')
    } catch (e) {
      addLog(`saveSaveFiles failed: ${String(e)}`)
    }
  }

  function takeState() {
    try {
      const st: Uint8Array = window.EJS_emulator.gameManager.getState()
      heldState.current = st
      addLog(`getState(): ${st.byteLength} B`)
    } catch (e) {
      addLog(`getState failed: ${String(e)}`)
    }
  }

  const avg = fpsHistory.length
    ? Math.round(fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length)
    : null

  return (
    <div className="spike">
      <h1>Portably: Phase 0 spike</h1>

      <div className="row">
        {checks.map((c) => (
          <span key={c.label} className={c.ok ? 'ok' : 'bad'}>
            {c.ok ? '✓' : '✗'} {c.label}
            {c.detail ? ` (${c.detail})` : ''}
          </span>
        ))}
      </div>

      {!coreReady && (
        <p className="bad">
          This page is not cross-origin isolated or lacks WebGL2. The PSP core will refuse to
          start. Check the COOP/COEP headers.
        </p>
      )}

      <div className="row">
        <input
          type="file"
          accept=".iso,.cso,.pbp,.chd,.zip,.7z"
          disabled={started}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button onClick={start} disabled={!file || started || !coreReady}>
          Start emulator
        </button>
        <button disabled={started || !coreReady} onClick={loadBundledHomebrew}>
          Use bundled homebrew (dev)
        </button>
        <span>
          FPS now: <b>{fps ?? '-'}</b> · avg (60 s): <b>{avg ?? '-'}</b>
        </span>
      </div>

      <div id="ejs-wrap">
        <div id="ejs" />
      </div>

      <div className="row">
        <button onClick={takeState} disabled={!booted}>
          getState()
        </button>
        <button
          onClick={() => window.EJS_emulator?.gameManager?.loadState(heldState.current)}
          disabled={!booted || !heldState.current}
        >
          loadState(held)
        </button>
        <button onClick={flushSaves} disabled={!booted}>
          saveSaveFiles()
        </button>
        <button onClick={dumpFS} disabled={!started}>
          Dump memstick FS
        </button>
      </div>

      <div className="grid2">
        <div>
          <h3>Event log</h3>
          <pre>{log.join('\n') || 'nothing yet'}</pre>
        </div>
        <div>
          <h3>Filesystem</h3>
          <pre>{fsDump || 'press "Dump memstick FS" after boot'}</pre>
        </div>
      </div>

      <p style={{ opacity: 0.7, fontSize: 12 }}>
        Emulation by <a href="https://emulatorjs.org">EmulatorJS</a> running the PPSSPP libretro
        core (GPL). No game files are included; load your own dump.
      </p>
    </div>
  )
}
