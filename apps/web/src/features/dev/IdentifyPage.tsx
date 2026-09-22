import { useState } from 'react'
import { sha256File } from '../../features/library/hash'
import { identifyGame, type GameIdentity } from '../../features/library/psp/identify'
import { getLocalFile, hasLocal, listLocalShas, removeLocal, storageEstimate, writeLocal } from '../../features/library/opfs'
import { formatBytes } from '../../lib/format'

/**
 * Dev harness for the Phase 2 file pipeline without Supabase: hash -> identify -> OPFS cache.
 */
export function IdentifyPage() {
  const [log, setLog] = useState<string[]>([])
  const [identity, setIdentity] = useState<GameIdentity | null>(null)
  const [progress, setProgress] = useState<string>('')
  const add = (m: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 40))

  async function run(file: File) {
    setIdentity(null)
    const t0 = performance.now()
    add(`file ${file.name} ${formatBytes(file.size)}`)
    const sha = await sha256File(file, (d, t) => setProgress(`hashing ${Math.round((100 * d) / t)}%`))
    const t1 = performance.now()
    add(`sha256 ${sha} in ${((t1 - t0) / 1000).toFixed(2)} s (${formatBytes(file.size / ((t1 - t0) / 1000))}/s)`)
    const id = await identifyGame(file, sha)
    add(`identified in ${(performance.now() - t1).toFixed(0)} ms: ${JSON.stringify({ ...id, icon0: id.icon0 ? `${id.icon0.byteLength} B` : null })}`)
    setIdentity(id)
    if (await hasLocal(sha)) {
      add('already cached in OPFS')
    } else {
      const t2 = performance.now()
      await writeLocal(sha, id.format, file, (w) => setProgress(`caching ${Math.round((100 * w) / file.size)}%`))
      add(`cached to OPFS in ${((performance.now() - t2) / 1000).toFixed(2)} s`)
    }
    const local = await getLocalFile(sha)
    add(`OPFS readback: ${local ? `${local.name} ${formatBytes(local.size)}` : 'missing'}`)
    const est = await storageEstimate()
    if (est) add(`storage estimate: ${formatBytes(est.usage)} used of ${formatBytes(est.quota)}`)
    setProgress('')
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 text-xl font-semibold">Dev: identify + cache</h1>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".iso,.cso,.pbp,.zip"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void run(f).catch((err) => add(`ERROR ${String(err)}`))
          }}
        />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const blob = await (await fetch('/dev/cspsp.zip')).blob()
            await run(new File([blob], 'cspsp.zip', { type: 'application/zip' })).catch((err) => add(`ERROR ${String(err)}`))
          }}
        >
          Run on bundled homebrew
        </button>
        <button
          type="button"
          className="btn"
          onClick={async () => {
            const shas = await listLocalShas()
            for (const s of shas) await removeLocal(s)
            add(`cleared ${shas.size} cached file(s)`)
          }}
        >
          Clear OPFS cache
        </button>
        <span className="text-sm text-zinc-400">{progress}</span>
      </div>
      {identity && (
        <div className="mb-4 rounded border border-zinc-800 p-3 text-sm">
          <b>{identity.title}</b> · {identity.discId} · {identity.format} · {identity.region ?? 'no region'} ·{' '}
          {identity.homebrew ? 'homebrew' : 'retail'}
          {identity.icon0 && (
            <img
              className="mt-2 h-20"
              alt="ICON0"
              src={URL.createObjectURL(new Blob([identity.icon0 as BlobPart], { type: 'image/png' }))}
            />
          )}
          {identity.warnings.length > 0 && <p className="mt-2 text-amber-300">{identity.warnings.join(' · ')}</p>}
        </div>
      )}
      <pre className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-xs">{log.join('\n') || 'pick a file'}</pre>
    </div>
  )
}
