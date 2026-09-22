# Phase 2 - Cloud library

Branch: `phase-1-foundation` (continues from Phase 1). Date: 2026-09-22.

## What is built

| Piece | Where | Notes |
|---|---|---|
| PSP container parsers | `apps/web/src/features/library/psp/` | PARAM.SFO, PBP, ISO 9660 directory walk, CISO block reader (deflate), ZIP central directory. Pure TypeScript, unit-tested with synthetic fixtures. |
| Game identification | `psp/identify.ts` | Disc id + title from `PSP_GAME/PARAM.SFO`, fallback `UMD_DATA.BIN`, region from the id prefix. Homebrew always gets a synthetic `HB<sha8>` id because homebrew SFOs copy retail ids. |
| Streaming SHA-256 | `hash.worker.ts`, `hash.ts` | hash-wasm in a Web Worker with progress; the hash is the file's identity everywhere (OPFS name, object name, dedupe). |
| Local cache | `opfs.ts` | Origin Private File System, `games/<sha>.<ext>`, temp-then-rename writes, persistent-storage request, usage estimate. |
| Resumable upload | `upload.ts` | tus-js-client against `/storage/v1/upload/resumable`, 6 MB chunks, retries, pause/resume, token refreshed per request. |
| Download + verify | `download.ts` | Signed URL -> stream into OPFS -> re-hash -> reject on mismatch. |
| Data access | `api.ts` | user_games + games queries, `upsert_game` RPC, status updates, delete (cloud object + row; saves are kept). |
| Orchestration | `useLibrary.ts` | add / download / remove-local / delete-cloud with a task list (stage, progress, pause, cancel). |
| UI | `LibraryPage.tsx`, `GameCard.tsx`, `TaskList.tsx` | Shelf with per-device state (on device / in cloud / upload incomplete / failed), cloud and device meters, add-game flow. Play is disabled until Phase 3. |
| Dev harness | `/dev/identify` | Runs hash -> identify -> OPFS without Supabase. |

Supported formats: `.iso`, `.cso`, `.pbp`, `.zip` (homebrew folder). CHD was dropped: the
EmulatorJS PPSSPP core lists `elf iso cso prx pbp` only.

## Verified without Supabase (in-app browser, dev harness)

- CSPSP homebrew zip: sha256 in 0.4 s, identified as `CSPSP` (title from the PBP's SFO,
  ICON0 extracted), cached to OPFS and read back at full size.
- 256 MB synthetic file: sha256 at 186 MB/s (about 8 s for a 1.5 GB image), OPFS write in
  0.9 s. Hashing runs in a worker, so the UI stays responsive.
- 16 unit tests cover SFO/PBP/ISO/CSO/ZIP parsing and the identification rules.

## Needs Supabase credentials to verify (do after PHASE1.md setup)

1. Add a game: watch the task go hashing -> reading disc info -> saving to device ->
   uploading; confirm the object appears under `isos/<uid>/<sha>.<ext>` and the row flips
   to `ready`. Refresh: the card shows "On this device and in cloud".
2. Pause and resume an upload; reload mid-upload, pick the same file again, and confirm
   tus resumes instead of restarting.
3. In a second browser profile: sign in, see the card as "In cloud", press Download,
   confirm the hash verification passes and the card flips to "On this device and in cloud".
4. Remove from device, Delete from cloud, and check the cloud meter drops (quota trigger).
5. Exceed the quota deliberately (set `storage_quota_bytes` low in the dashboard) and
   confirm the upload fails with the quota error.

## Known gaps / follow-ups

- Upload resume after a reload requires re-picking the file (browsers cannot keep a File
  handle across reloads without the File System Access API). Rows stuck in `uploading`
  show "Upload incomplete"; Phase 3 adds a "Resume upload" action on the card.
- Cover art: the ICON0 from PBPs is extracted but not yet stored; retail covers wait for a
  licensed metadata source (PLAN.md Phase 6).
- CISO v2 with LZ4 blocks is not decoded for identification (falls back to filename title).
- Homebrew zips whose `.prx` files sort before `EBOOT.PBP` need repacking for EmulatorJS
  (see `scripts/zip-folder.mjs`); Phase 3 will feed the emulator the extracted files
  directly instead of relying on zip order.
