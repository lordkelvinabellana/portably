import { formatBytes, formatRelative } from '../../lib/format'
import { AUTO_SLOT, MANUAL_SLOTS } from './statesApi'
import type { StatesStatus } from './StateManager'

interface Props {
  status: StatesStatus
  coreVersion: string | null
  onSave: (slot: number) => void
  onLoad: (slot: number) => void
  onDelete: (slot: number) => void
}

export function StatesPanel({ status, coreVersion, onSave, onLoad, onDelete }: Props) {
  const busy = !!status.busy
  const auto = status.slots.find((s) => s.slot === AUTO_SLOT)
  return (
    <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="mb-2 flex items-center gap-3 text-sm">
        <h2 className="font-medium">Save states</h2>
        <span className="text-zinc-500">A state is a full snapshot of the running game. It is tied to this emulator build.</span>
        {status.error && <span className="ml-auto text-red-400">{status.error}</span>}
      </div>

      <div className="mb-3 flex items-center gap-3 rounded border border-zinc-800 p-2 text-sm">
        <span className="font-medium">Auto-resume</span>
        {auto ? (
          <span className="text-zinc-400">
            {formatRelative(auto.created_at)} · {formatBytes(auto.size_bytes)}
            {coreVersion && auto.core_version !== coreVersion ? ' · different emulator build' : ''}
          </span>
        ) : (
          <span className="text-zinc-500">taken every few minutes and when you leave the tab</span>
        )}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn" disabled={busy} onClick={() => onSave(AUTO_SLOT)}>
            Snapshot now
          </button>
          <button type="button" className="btn" disabled={busy || !auto} onClick={() => onLoad(AUTO_SLOT)}>
            Load
          </button>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {MANUAL_SLOTS.map((n) => {
          const row = status.slots.find((s) => s.slot === n)
          const shot = status.shots[n]
          const isBusy = status.busy?.slot === n
          return (
            <div key={n} className="rounded border border-zinc-800 p-2 text-xs">
              <div className="mb-1 flex aspect-[480/272] items-center justify-center overflow-hidden rounded bg-zinc-950 text-zinc-600">
                {shot ? <img src={shot} alt={`Slot ${n}`} className="h-full w-full object-cover" /> : row ? 'no screenshot' : 'empty'}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Slot {n}</span>
                <span className="truncate text-zinc-500">
                  {isBusy
                    ? `${status.busy!.kind}…`
                    : row
                      ? `${formatRelative(row.created_at)} · ${formatBytes(row.size_bytes)}${
                          coreVersion && row.core_version !== coreVersion ? ' · other build' : ''
                        }`
                      : ''}
                </span>
              </div>
              <div className="mt-1 flex gap-1">
                <button type="button" className="btn px-2 py-1" disabled={busy} onClick={() => onSave(n)}>
                  Save
                </button>
                <button type="button" className="btn px-2 py-1" disabled={busy || !row} onClick={() => onLoad(n)}>
                  Load
                </button>
                <button type="button" className="btn ml-auto px-2 py-1 text-red-300" disabled={busy || !row} onClick={() => onDelete(n)}>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
