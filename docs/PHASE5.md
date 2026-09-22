# Phase 5 - Input, settings, polish

Branch: `phase-1-foundation`. Date: 2026-09-22.

## What is built

| Piece | Where | Notes |
|---|---|---|
| Per-game emulator settings | `apps/web/src/features/settings/` | 11 PPSSPP core options (resolution, CPU core, frame skip, texture filtering/upscaling, effects, confirm button, language) edited from the gear on each game card, stored in `user_games.settings.core`, applied as `EJS_defaultOptions` at boot. Unknown keys/values are dropped on read and write. |
| Controls | Player "Controls" button | Opens EmulatorJS's own keyboard and gamepad remapping menu (persisted by EmulatorJS in local storage). We deliberately reuse it instead of writing a second mapper. |
| PWA | `vite.config.ts` (vite-plugin-pwa), `public/icon.svg`, `index.html` | Installable app shell with auto-update. Precache: built JS/CSS/HTML/SVG only. The emulator runtime under `/emulatorjs/` is cached on first use (CacheFirst, 30 days). Game images are never cached by the service worker (they live in OPFS). Auth and dev routes are excluded from the navigation fallback. |
| Error handling | `app/ErrorBoundary.tsx`, `app/GlobalErrors.tsx` | Render errors show a reload panel; uncaught errors and rejections show dismissible toasts with an `aria-live` region. Known emulator noise (WakeLock, ExitStatus) is filtered. |
| Loading state | `LibraryPage.tsx` | Skeleton cards while the library loads. |
| Accessibility | `index.css`, `Layout.tsx`, dialogs | Skip link, `main` landmark, visible focus ring for keyboard users, reduced-motion respect, labelled icon buttons, `role=dialog` with `aria-modal`, progress bars with ARIA values, `role=alert/status` for messages. |
| Legal | `features/legal/LegalPages.tsx`, footer, sign-up | Terms (ownership affirmation, no sharing, takedown contact), Privacy (what is stored, providers, local storage), Licenses (GPL attribution with source links, exact npm packages and versions). Sign-up requires ticking the ownership/terms box. Operator name and contact email are bracketed placeholders to fill before launch. |

## Verify locally

- `/legal/terms`, `/legal/privacy`, `/legal/licenses` render; footer links present.
- Sign-up form disables "Create account" until the affirmation is ticked.
- `npm run build` emits `sw.js`, `manifest.webmanifest`, `registerSW.js`; `npm run preview`
  then DevTools -> Application shows the service worker and manifest. The `/emulatorjs/`
  core lands in the `emulatorjs-runtime` cache after the first game boot.
- Game card gear opens the settings dialog; Escape and backdrop close it.

## Needs Supabase credentials

- Saving settings writes `settings.core` on the row and the Player boots with them
  (check the RetroArch core options file in the console, or observe the resolution change).

## Deliberate non-goals for now

- No on-screen touch controls (desktop-only MVP).
- No external error reporting service; the hooks are in place for one.
- Legal texts are a starting point, not legal advice; have them reviewed before launch.
