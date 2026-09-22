# Phase 6 - Runtime swap to the PPSSPP WebAssembly port

Date: 2026-09-22. Status: proposed, based on a side-by-side test.

## Why

Same machine, same ISO (Yu-Gi-Oh! ARC-V Tag Force Special, heavy 3D):

| Runtime | Result |
|---|---|
| EmulatorJS 4.2.3 stable core (what we ship) | about 20 to 24 FPS, slow motion |
| EmulatorJS nightly core | same or slightly worse |
| root-hunter PPSSPP WebAssembly port (PPSSPP 1.20.4) | "much better" per the user; exact figure to record |

The libretro core is the bottleneck, not the browser. The port is a build of the full
PPSSPP application (SDL frontend) from a recent upstream, compiled with Emscripten 5.0.7.

## What the port is (from reading the live shell)

- Artifacts: `PPSSPPSDL.js`, `PPSSPPSDL.wasm` (14.3 MB), `PPSSPPSDL.data` (22.4 MB, assets
  preloaded), plus a pthread worker. Requires cross-origin isolation (we already have it).
- Sources: emulator fork `root-hunter/ppsspp-wasm` (branch `wasm`, `make wasm-release`,
  GPL-2.0-or-later); Angular shell `root-hunter/ppsspp-web` (`wasm-page/`). We would use
  the emulator artifacts and write our own thin shell; the Angular UI is not needed.
- Boot model: classic (non-modularized) Emscripten `window.Module`. In `preRun` the shell
  writes the game into MEMFS at `/games/<name>`, restores the memory stick from OPFS into
  MEMFS, patches `PSP/SYSTEM/ppsspp.ini`, then sets `Module.arguments = [gamePath]` so
  PPSSPP launches straight into the game. The global `FS` is available in `preRun`.
- Memory stick: `/home/web_user/.config/ppsspp` (fallback `/root/.config/ppsspp`) in MEMFS.
  The shell persists it to OPFS every 30 s by diffing size and mtime. Layout is standard
  PPSSPP: `PSP/SAVEDATA/<GAMEID...>/`, `PSP/PPSSPP_STATE/<GAMEID>_<ver>_<slot>.ppst` plus a
  `.jpg` screenshot per state, `PSP/SYSTEM/ppsspp.ini`.
- Exposed wasm exports: `_PPSSPP_RefreshGameBrowser`, `_PPSSPP_ToggleFullscreen`. No
  save-state API; PPSSPP's own hotkeys write state files.
- Default keyboard map in this fork (`Core/KeyMapDefaults.cpp`, QWERTY): Cross Z, Circle X,
  Square A, Triangle S, L Q, R W, Start Space, Select V (Enter on non-Windows), D-pad
  arrows, analog I/J/K/L, fast-forward Tab, pause Esc, rewind Delete. Save/load state and
  slot keys are not in that table; PPSSPP's usual desktop defaults are F2 save, F4 load,
  F3 next slot, F12 screenshot. Verify in the spike and, if unbound, write them into
  `controls.ini` ourselves.
- Input: SDL2 keyboard and Gamepad API. Synthetic `KeyboardEvent`s dispatched to the canvas
  drive SDL, which is how the on-screen pad would work.
- WebGL context is created with `powerPreference: high-performance` (a "Dedicated GPU"
  choice in the shell); `desynchronized: true`.

## What changes in our app

| Area | Today (EmulatorJS) | After (PPSSPP port) |
|---|---|---|
| Runtime files | `public/emulatorjs/` 17 MB | `public/ppsspp/` about 37 MB, cached by the service worker on first use |
| Mount | `features/emulator/emulatorjs.ts` | new `features/emulator/ppsspp.ts`: configure `Module`, preRun hooks, launch args |
| Game file | blob URL -> EmulatorJS extracts to its FS | write the OPFS `File` into MEMFS `/games/` (or mount lazily) before boot |
| Save sync | IDBFS (`/data/saves/PPSSPP`) before boot, live FS while running | memory stick in MEMFS: restore into `PSP/SAVEDATA` in `preRun`, poll live FS while running. Same tar/gzip bundles, same `saves` table. The IDBFS reader goes away. |
| Save states | EmulatorJS `getState()`/`loadState()` bytes | PPSSPP writes `.ppst` + `.jpg` files on F2/F4. Upload those files per slot; load = write the file back and press F4. `core_version` becomes the PPSSPP build tag. |
| Per-game settings | libretro core options via `EJS_defaultOptions` | patch `ppsspp.ini` sections (Graphics: `RenderingMode`, `InternalResolution`, `FrameSkip`, `AutoFrameSkip`, `TexFiltering`; CPU: `CPUCore`). Same dialog, different keys. |
| Controls remap | EmulatorJS control menu | PPSSPP's own Settings -> Controls inside the emulator, or our own map writing `controls.ini` |
| On-screen pad | `simulateInput` | synthetic key events to the canvas mapped to PPSSPP's keyboard bindings |
| Key map panel | reads EmulatorJS controls | reads `controls.ini` from the memory stick |
| Homebrew zips | repacked so `EBOOT.PBP` is first | extract the folder into `/games/<name>/` and launch `EBOOT.PBP` directly (no repack needed) |
| Legal page | EmulatorJS + RetroArch + PPSSPP | PPSSPP (root-hunter fork commit) + SDL; link the exact commit we build from |

Unchanged: auth, library, uploads, downloads, quotas, PWA shell, sessions.

## Plan

1. **Spike (1 to 2 days).** New `/dev/ppsspp` harness that loads the port's artifacts from
   our origin, boots CSPSP and the user's ISO from OPFS via `preRun`, confirms: FPS on the
   reference desktop, memory stick path and save file writes, F2/F4 state files appear,
   synthetic key events reach the game, `ppsspp.ini` patching applies resolution.
   Exit criteria: full speed on Tag Force where the libretro core gave 24 FPS; saves and
   states land in the expected paths.
2. **Runtime adapter (2 to 3 days).** `features/emulator/ppsspp.ts` implementing the same
   `EmulatorHandle` surface the Player uses, so the Player, sync engine and states manager
   change as little as possible. Save sync switches from IDBFS to MEMFS restore in `preRun`.
3. **States and settings (2 days).** File-based states with screenshots from PPSSPP's own
   `.jpg`; settings dialog mapped to ini keys; key map from `controls.ini`.
4. **Cutover.** Feature flag per game (`settings.runtime = 'ppsspp' | 'emulatorjs'`), default
   to the port once the spike passes; keep EmulatorJS available for titles that regress.
5. **Build reproducibility (later).** Pin the fork commit, mirror the artifacts into the repo
   or a release asset, and add the Emscripten build to CI so we are not depending on a
   third party's GitHub Pages staying up.

## Risks

- The port is one maintainer's fork; pin a commit and keep the build recipe.
- 37 MB runtime download on first play (cached afterwards).
- Save-state format changes with PPSSPP versions; keep the version tag and the warning.
- Some titles may run better on the libretro core; hence the per-game runtime flag.
