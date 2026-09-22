# Phase 3 - Play + save sync

Branch: `phase-1-foundation`. Date: 2026-09-22.

## What is built

| Piece | Where | Notes |
|---|---|---|
| Emulator wrapper | `apps/web/src/features/emulator/emulatorjs.ts` | Loads `emulator.min.js` once and instantiates the `EmulatorJS` class directly (loader.js cannot run twice: top-level classes). One instance per page load; the Player hard-navigates for the next game. Hides EmulatorJS's own save/state/netplay/exit buttons. |
| Memory stick access | `features/sync/memstick.ts` | Two paths to the same data: live FS while running (`/data/saves/PPSSPP/PSP/SAVEDATA`), and the IDBFS IndexedDB database (`/data/saves`, store `FILE_DATA`, version 21) before the emulator mounts. Stable content hash over sorted paths + bytes. |
| Bundles | `features/sync/tar.ts` | ustar pack/unpack (long paths via prefix), gzip/gunzip with CompressionStream. |
| Sync engine | `features/sync/SaveSync.ts` | `prepare()` before boot: restore newest cloud version into IDBFS, or detect a conflict when the local save is not one of the user's known versions. `start(FS)`: poll every 10 s, on tab hide and on exit; upload only when the hash changes; keep 10 versions. Homebrew savedata folders are learned from folders touched after boot and stored in `user_games.settings.savedata_dirs`. |
| Saves API | `features/sync/savesApi.ts` | `saves` rows + `saves/<uid>/<disc_id>/<uuid>.tar.gz` objects, prune. |
| Player page | `features/player/PlayerPage.tsx` | `/play/:gameId`: download-if-missing, save preparation, conflict dialog, boot, sync badge, Sync now, Fullscreen, Exit (final sync -> session end -> hard nav to library). Hidden-tab banner. |
| Play sessions | `features/player/sessions.ts` | `play_sessions` rows, `last_played_at`, `total_play_seconds`. Library shows a "Continue playing" row. |
| Homebrew zip repack | `features/library/psp/zipwrite.ts`, `zip.ts` | On add, a zip whose `.prx` files precede `EBOOT.PBP` is repacked (stored) so EmulatorJS boots the right file. |
| Dev harness | `/dev/player` | Mount via wrapper, write/read savedata through IDBFS, snapshot the live FS. |

## Verified without Supabase (in-app browser, dev harness)

- Wrote a fake savedata folder through IndexedDB, booted CSPSP through the wrapper
  (`ready` -> `saveDatabaseLoaded` -> `start`), and the live filesystem listed the same
  folder with the identical content hash. This is the restore path.
- Exit through the wrapper fires the `exit` event, flushes IDBFS and clears the global.
- 24 unit tests: tar round trip and determinism, gzip, ownership rules, snapshot hash,
  CRC32 parity with zlib, zip repacking.

## Needs Supabase credentials to verify

1. Play a retail game, save in-game, wait 10 s: a `saves` row appears and the badge reads
   "Saved to cloud just now". Reload the page and play again: no new version is uploaded
   (hash unchanged).
2. Second device / browser profile: the savedata folder is absent locally, so `prepare()`
   restores the cloud bundle before boot and the in-game load screen shows the save.
3. Conflict: save differently on both devices without syncing (go offline on one), then
   play on the other: the conflict dialog appears; both choices keep the other as a version.
4. Homebrew: play CSPSP, change a setting the game persists, confirm the learned folder
   lands in `user_games.settings.savedata_dirs` and syncs.
5. Version pruning at 11 uploads.

## Known limits

- Saves sync only while the page is alive: the final upload on tab close is best effort
  (pagehide). The 10 s poll and the hide hook make the exposure window small.
- The emulator cannot run in a hidden tab (requestAnimationFrame), so long "background"
  play is impossible by design; the Player says so.
- Save states (slots, screenshots, auto-resume) are Phase 4.
- Games that write outside `PSP/SAVEDATA` (rare homebrew) are not synced.
