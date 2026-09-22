# Phase 4 - Save states and resume anywhere

Branch: `phase-1-foundation`. Date: 2026-09-22.

## What is built

| Piece | Where | Notes |
|---|---|---|
| Core version tag | `apps/web/src/features/states/coreVersion.ts` | `emulatorjs-<release>/ppsspp-<core buildStart>` from the shipped core report. States from a different build show a warning and need confirmation to load. |
| States API | `features/states/statesApi.ts` | Slot 0 = auto-resume, slots 1..9 manual. Objects: `states/<uid>/<disc>/<slot>.state.gz` and `screenshots/<uid>/<disc>/<slot>.png` (overwritten per slot); row upserted on `(user, game, slot)`. Short-lived signed URLs for thumbnails. |
| State manager | `features/states/StateManager.ts` | Capture (`getState`, about 40 MB) -> gzip (about 4.7 MB) -> upload with a PNG screenshot. Load with version check. Auto-resume every 3 minutes, on tab hide and on exit, skipped when no frame advanced since the last snapshot. |
| Gallery UI | `features/states/StatesPanel.tsx` | Auto-resume row + 3x3 slot grid with thumbnails, time, size, build mismatch marker, Save / Load / Delete. |
| Player integration | `features/player/PlayerPage.tsx` | "States" toggle, "Resume where you left off?" offer at boot when slot 0 exists, load notices, exit takes a final auto-resume snapshot before the final save sync. |
| Emulator handle | `features/emulator/emulatorjs.ts` | `screenshot()` via EmulatorJS `takeScreenshot('canvas','png',1)`. |
| Dev harness | `/dev/player` | "State + screenshot round trip": getState -> gzip -> gunzip -> loadState, screenshot preview. |

## Verified without Supabase (dev harness)

- CSPSP through the wrapper: `getState()` 40.0 MB in 24 ms, gzip to 590 KB in 241 ms at
  the title screen (the Phase 0 measurement mid-menu was 4.7 MB), PNG screenshot
  captured, `loadState()` of the gunzipped bytes succeeded with the frame counter intact.
- The core cannot produce a state before it has executed at least one frame ("Error
  writing data"), which in a hidden tab never happens. The Player only offers state
  actions once the game is running, and auto-resume skips snapshots when no frame advanced.

## Needs Supabase credentials to verify

1. Save to slot 1 while playing: the thumbnail appears within a few seconds; the object
   sizes match (about 4 to 6 MB gzipped, PNG a few hundred KB).
2. Load slot 1 after playing further: the game jumps back.
3. Auto-resume: wait 3 minutes or hide the tab; slot 0 updates. Exit and re-enter: the
   "Resume where you left off?" bar appears and Resume restores the snapshot.
4. Version warning: temporarily edit `core_version` of a row in the dashboard; loading
   it prompts for confirmation.
5. Quota: state and screenshot objects count toward the cloud meter.

## Design notes

- States are convenience, saves are truth: a failed or refused state load never touches
  the PSP savedata or its versions.
- Each slot overwrites its object, so ten slots cost about 50 MB per game at most.
- The screenshot is taken from the canvas; if the WebGL buffer is not preserved it can be
  black on some drivers. It is best effort and never blocks the state upload.
