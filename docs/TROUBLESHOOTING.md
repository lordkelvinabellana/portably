# Troubleshooting

Observed problems, what they mean, and what to do. Console messages are quoted as they
appear in the browser's developer tools.

## Black screen but sound keeps playing

**Console:** `RuntimeError: memory access out of bounds` (in a `blob:` wasm frame)

The PPSSPP core crashed on the emulation thread while the audio thread kept running. This
is a bug in the beta EmulatorJS PPSSPP build for that particular title, not in the page.
Seen with *Yu-Gi-Oh! ARC-V Tag Force Special* (fan-translated ISO).

Try, in this order, via the gear on the game card (each takes effect on the next boot):

1. CPU emulation: switch between **Interpreter** and **IR JIT**.
2. Skip buffer effects: **On**.
3. Rendering resolution: **1x** (native).
4. Texture upscaling: **Off**; anisotropic filtering: **Off**.

If it still crashes, the title is not compatible with this core build yet. Report it with
the disc id (shown on the card) so it can be tracked; a newer `@emulatorjs/core-ppsspp`
may fix it.

## PSP system dialogs show blocks instead of text (name entry, save/load dialogs)

**Console:** `[libretro ERROR] [IO] Couldn't read data for 'ppge_atlas.zim'`

The PSP's built-in dialogs are drawn by PPSSPP's own "PPGe" renderer with a font atlas.
EmulatorJS extracts the asset bundle to `/PPSSPP`, but the core looks under RetroArch's
system directory (`system_directory = "default"` -> `~/retroarch/...`). The game itself
renders fine; only the OS-level dialogs are affected. Fixed by mirroring the assets into
the system directory right after EmulatorJS extracts them (see `mirrorPpssppAssets` in
`features/emulator/emulatorjs.ts`). If blocks still appear, check the dev harness log at
`/dev/player`: it reports whether `ppge_atlas.zim` is present in the mirrored locations.

## Playing inside the Claude desktop app's browser pane

The embedded pane throttles or pauses animation frames whenever it is hidden or the
window is occluded, so emulation there stutters or stops. Play in a normal browser tab
(Edge, Chrome) with the tab in the foreground.

## "Wake Lock permission request denied"

Harmless. RetroArch asks the browser to keep the screen awake while a game runs; browsers
refuse unless the page is visible and the request follows a user gesture. Filtered from
the in-app error toasts.

## Choppy or slow gameplay

- The app defaults to **auto frame skip on** and **native resolution**. If a game is still
  choppy, try **IR JIT** for the CPU and **Skip buffer effects** on.
- Keep the game tab visible and in the foreground. Emulation stops entirely in hidden tabs,
  and browsers throttle timers in background windows.
- Close other GPU-heavy tabs. The core runs at 60 fps on a mid-range desktop GPU when it
  has the machine to itself.
- Firefox and Safari are slower than Chromium browsers for this core.

## "Identifier 'EmulatorJS' has already been declared"

The emulator script was injected a second time on the same page. Fixed by checking for the
global class and the existing script tag before injecting; if you still see it, reload the
page. Starting a second game on the same page load always triggers a full reload by design.

## HTTP 413 "Maximum size exceeded" when adding a game

The Supabase plan's per-file upload limit (50 MB on Free). The game stays cached on the
device and is playable; cloud upload needs the Pro plan and the global upload limit raised
under Storage settings (see `docs/PHASE1.md`).

## "provider is not enabled" when signing in with Google or Discord

The OAuth client has not been configured in Supabase (Authentication -> Sign In / Providers).
The sign-in page hides providers that are disabled, so seeing this means the page cached
an older build; reload.
