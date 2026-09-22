import { useRef } from 'react'
import { Link } from 'react-router'
import { formatBytes, formatRelative } from '../../lib/format'
import { GameCard } from './GameCard'
import { TaskList } from './TaskList'
import { useLibrary } from './useLibrary'
import { opfsSupported } from './opfs'

export function LibraryPage() {
  const lib = useLibrary()
  const fileInput = useRef<HTMLInputElement>(null)
  const busy = lib.tasks.some((t) => t.stage !== 'done' && t.stage !== 'error')

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start gap-6">
        <div>
          <h1 className="text-2xl font-semibold">Your library</h1>
          <p className="text-sm text-zinc-400">
            Add a PSP image you own. It is fingerprinted, kept on this device, and uploaded to your private
            cloud storage so it appears on every device you sign in from.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            accept=".iso,.cso,.pbp,.zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void lib.addGame(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={!opfsSupported()}
            onClick={() => fileInput.current?.click()}
          >
            Add game
          </button>
        </div>
      </div>

      {!opfsSupported() && (
        <p className="mb-4 text-sm text-amber-300">
          This browser has no Origin Private File System, so games cannot be cached locally. Use a current
          desktop Chrome, Edge, Firefox or Safari.
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Meter
          label="Cloud storage"
          used={lib.profile?.storage_used_bytes ?? 0}
          total={lib.profile?.storage_quota_bytes ?? 0}
        />
        <Meter label="This device (browser cache)" used={lib.device?.usage ?? 0} total={lib.device?.quota ?? 0} />
      </div>

      <TaskList tasks={lib.tasks} onDismiss={lib.dropTask} />

      {lib.entries.some((e) => e.userGame.last_played_at) && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-zinc-400">Continue playing</h2>
          <div className="flex flex-wrap gap-2">
            {lib.entries
              .filter((e) => e.userGame.last_played_at)
              .slice(0, 4)
              .map((e) => (
                <Link key={e.userGame.game_id} to={`/play/${e.game.id}`} className="btn">
                  ▶ {e.game.title}
                  <span className="ml-2 text-xs text-zinc-500">{formatRelative(e.userGame.last_played_at)}</span>
                </Link>
              ))}
          </div>
        </section>
      )}

      {lib.error && <p className="mb-4 text-sm text-red-400">{lib.error}</p>}
      {lib.loading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : lib.entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-800 p-10 text-center text-zinc-400">
          No games yet. Press <b>Add game</b> and pick an .iso, .cso, .pbp, or a .zip of a homebrew folder.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {lib.entries.map((entry) => (
            <GameCard
              key={entry.userGame.game_id}
              entry={entry}
              busy={busy}
              onDownload={() => void lib.downloadGame(entry)}
              onRemoveLocal={() => void lib.removeFromDevice(entry)}
              onDeleteCloud={() => {
                if (
                  window.confirm(
                    `Delete "${entry.game.title}" from your cloud library? Your saves are kept. The local copy is removed too.`,
                  )
                )
                  void lib.deleteFromCloud(entry, true)
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (100 * used) / total) : 0
  return (
    <div className="rounded-lg border border-zinc-800 p-4 text-sm">
      <div className="mb-2 flex justify-between text-zinc-400">
        <span>{label}</span>
        <span>
          {formatBytes(used)} of {total > 0 ? formatBytes(total) : '-'}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-zinc-800">
        <div className={`h-full ${pct > 90 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
