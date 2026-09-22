import { useRef, useState } from 'react'
import { emulatorAlreadyUsed, mountEmulator, type EmulatorHandle } from '../emulator/emulatorjs'
import { fsListSavedataDirs, fsReadTree, idbReadSavedata, idbWriteSavedata, snapshotHash } from '../sync/memstick'
import { gunzip, gzip, packTar, unpackTar } from '../sync/tar'
import { formatBytes } from '../../lib/format'
import { PspShell } from '../player/PspShell'

/**
 * Dev harness for Phase 3 without Supabase: mounts the emulator through our wrapper
 * (not loader.js), and exercises the memory-stick helpers against IDBFS and the live FS.
 */
export function PlayerHarnessPage() {
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const emu = useRef<EmulatorHandle | null>(null)
  const container = useRef<HTMLDivElement>(null)
  const add = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 60))

  async function idbSnapshot() {
    const files = await idbReadSavedata()
    add(`IDBFS savedata: ${files.length} files in ${new Set(files.map((f) => f.dir)).size} folder(s)` + (files.length ? ` hash=${(await snapshotHash(files)).slice(0, 12)}` : ''))
    for (const f of files.slice(0, 8)) add(`  ${f.path} ${formatBytes(f.data.byteLength)}`)
  }

  async function boot() {
    if (emulatorAlreadyUsed()) return add('emulator already used on this page; reload first')
    const blob = await (await fetch('/dev/cspsp.zip')).blob()
    const url = URL.createObjectURL(new File([blob], 'cspsp.zip'))
    const handle = await mountEmulator({
      container: container.current!,
      gameUrl: url,
      gameName: 'CSPSP',
      gameId: 1,
      // ?opt=key:value;key:value  (defaults to none so the harness isolates page behaviour)
      coreOptions: Object.fromEntries(
        (new URLSearchParams(location.search).get('opt') ?? '')
          .split(';')
          .map((p) => p.split(':'))
          .filter((kv) => kv.length === 2)
          .map(([k, v]) => [k.trim(), v.trim()]),
      ),
      // ?nomirror=1 skips the PPSSPP asset mirror (see emulatorjs.ts)
      skipAssetMirror: new URLSearchParams(location.search).get('nomirror') === '1',
      hideButtons: ['saveState', 'loadState', 'saveSavFiles', 'loadSavFiles', 'cacheManager', 'netplay', 'exitEmulation'],
      onSaveDatabaseLoaded: (FS) => add(`saveDatabaseLoaded: /data/saves has ${FS.readdir('/data/saves').length - 2} entries`),
      onReady: () => add('ready'),
      onStart: () => {
        add('start')
        setRunning(true)
        const FS = handle.FS
        for (const p of ['/home/web_user/retroarch/system/PPSSPP/ppge_atlas.zim', '/home/web_user/retroarch/userdata/system/PPSSPP/ppge_atlas.zim']) {
          add(`${p}: ${FS.analyzePath(p).exists ? 'present' : 'missing'}`)
        }
      },
      onExit: () => {
        add('exit')
        setRunning(false)
      },
    })
    emu.current = handle
    add('mounted via wrapper (no loader.js)')
  }

  async function liveSnapshot() {
    const FS = emu.current?.FS
    if (!FS) return add('no FS')
    const dirs = fsListSavedataDirs(FS)
    add(`live SAVEDATA dirs: ${dirs.join(', ') || '(none)'}`)
    const files = dirs.flatMap((d) => fsReadTree(FS, d))
    add(`live files: ${files.length}${files.length ? ` hash=${(await snapshotHash(files)).slice(0, 12)}` : ''}`)
  }

  async function writeTestSave() {
    // Simulates a cloud restore: write a fake savedata folder through IndexedDB.
    const files = [
      { path: 'TEST00001DATA00/PARAM.SFO', data: new TextEncoder().encode('fake sfo'), mtime: Math.floor(Date.now() / 1000) },
      { path: 'TEST00001DATA00/DATA.BIN', data: new Uint8Array(2048).fill(9) },
    ]
    const gz = await gzip(packTar(files))
    const back = unpackTar(await gunzip(gz))
    await idbWriteSavedata(back)
    add(`wrote ${back.length} test files via IDBFS (bundle ${formatBytes(gz.size)}); boot to see them in the live FS`)
  }

  const [shotUrl, setShotUrl] = useState<string | null>(null)

  async function stateAndScreenshot() {
    const h = emu.current
    if (!h) return add('no emulator')
    const t0 = performance.now()
    const raw = h.getState()
    const t1 = performance.now()
    const gz = await gzip(raw)
    const t2 = performance.now()
    add(`getState ${formatBytes(raw.byteLength)} in ${(t1 - t0).toFixed(0)} ms; gzip -> ${formatBytes(gz.size)} in ${(t2 - t1).toFixed(0)} ms`)
    const shot = await h.screenshot()
    add(`screenshot: ${shot ? `${shot.type} ${formatBytes(shot.size)}` : 'null'}`)
    if (shot) setShotUrl(URL.createObjectURL(shot))
    const back = await gunzip(gz)
    h.loadState(back)
    add(`loadState(${formatBytes(back.byteLength)}) ok, frame=${h.frameCount()}`)
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold">Dev: player harness</h1>
      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => void idbSnapshot()}>
          Read IDBFS savedata
        </button>
        <button type="button" className="btn" onClick={() => void writeTestSave()} disabled={running}>
          Write test save via IDBFS
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void boot().catch((e) => add(`ERROR ${String(e)}`))} disabled={running}>
          Boot bundled homebrew
        </button>
        <button type="button" className="btn" onClick={() => void liveSnapshot()} disabled={!running}>
          Live FS snapshot
        </button>
        <button type="button" className="btn" onClick={() => void stateAndScreenshot().catch((e) => add(`ERROR ${String(e)}`))} disabled={!running}>
          State + screenshot round trip
        </button>
        <button type="button" className="btn" onClick={() => emu.current?.exit()} disabled={!running}>
          Exit
        </button>
      </div>
      {shotUrl && <img src={shotUrl} alt="screenshot" className="mb-3 h-32 rounded border border-zinc-800" />}
      <PspShell input={(id, v) => emu.current?.input(id, v)}>
        <div ref={container} id="harness-emulator" className="w-full bg-black" style={{ aspectRatio: '480 / 272' }} />
      </PspShell>
      <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">{log.join('\n') || 'idle'}</pre>
    </div>
  )
}
