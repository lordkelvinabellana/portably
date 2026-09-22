import type { LibraryEntry } from './api'
import { formatBytes, formatRelative } from '../../lib/format'

interface Props {
  entry: LibraryEntry & { local: boolean }
  busy: boolean
  onDownload: () => void
  onRemoveLocal: () => void
  onDeleteCloud: () => void
}

export function GameCard({ entry, busy, onDownload, onRemoveLocal, onDeleteCloud }: Props) {
  const { game, userGame, local } = entry
  const cloud = userGame.upload_status === 'ready' && !!userGame.storage_path
  const status = cloud && local ? 'On this device and in cloud' : cloud ? 'In cloud' : local ? 'On this device only' : 'Missing everywhere'
  const statusClass =
    userGame.upload_status === 'failed'
      ? 'bg-red-500/20 text-red-300'
      : userGame.upload_status === 'uploading' || userGame.upload_status === 'pending'
        ? 'bg-amber-500/20 text-amber-300'
        : cloud && local
          ? 'bg-emerald-500/20 text-emerald-300'
          : 'bg-zinc-700/60 text-zinc-300'

  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex aspect-[144/80] items-center justify-center rounded bg-zinc-800 text-3xl font-bold text-zinc-600">
        {game.title.slice(0, 2).toUpperCase()}
      </div>
      <h3 className="truncate font-medium" title={game.title}>
        {game.title}
      </h3>
      <p className="text-xs text-zinc-500">
        {game.disc_id}
        {game.region ? ` · ${game.region}` : ''} · {userGame.file_format.toUpperCase()} · {formatBytes(userGame.file_size)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">Last played {formatRelative(userGame.last_played_at)}</p>
      <span className={`mt-3 inline-block w-fit rounded px-2 py-0.5 text-xs ${statusClass}`}>
        {userGame.upload_status === 'failed'
          ? 'Upload failed'
          : userGame.upload_status === 'uploading'
            ? 'Upload incomplete'
            : status}
      </span>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled title="Playing arrives in Phase 3">
          Play
        </button>
        {cloud && !local && (
          <button type="button" className="btn" disabled={busy} onClick={onDownload}>
            Download
          </button>
        )}
        {local && (
          <button type="button" className="btn" disabled={busy} onClick={onRemoveLocal}>
            Remove from device
          </button>
        )}
        <button type="button" className="btn ml-auto text-red-300" disabled={busy} onClick={onDeleteCloud}>
          Delete
        </button>
      </div>
    </div>
  )
}
