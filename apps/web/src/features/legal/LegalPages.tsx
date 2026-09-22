import type { ReactNode } from 'react'

// Placeholders to fill before launch. Keep them obvious so they are not shipped by accident.
const OPERATOR = '[Operator name]'
const CONTACT = '[legal contact email]'
const UPDATED = '2026-09-22'

function Doc({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="prose-invert mx-auto max-w-3xl text-sm leading-6 text-zinc-300 [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_li]:mb-1 [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6">
      <h1 className="mb-1 text-2xl font-semibold text-zinc-100">{title}</h1>
      <p className="text-xs text-zinc-500">Last updated {UPDATED}</p>
      {children}
    </article>
  )
}

export function TermsPage() {
  return (
    <Doc title="Terms of Service">
      <h2>1. What Portably is</h2>
      <p>
        Portably is a web application operated by {OPERATOR} that runs a PlayStation Portable emulator in your browser
        and stores your own game files, saves and save states in private cloud storage tied to your account. Portably
        does not provide, host, index or link to games.
      </p>
      <h2>2. Your content and your promise</h2>
      <p>By adding a game you confirm all of the following:</p>
      <ul>
        <li>You own a legitimate copy of the game and made the image from that copy yourself, or the software is homebrew you are permitted to use.</li>
        <li>You will not share your account, your files or download links with anyone else.</li>
        <li>You will not upload content you do not have the right to use.</li>
      </ul>
      <p>
        Your files are stored in a private area that only your account can read. There is no public sharing feature and
        we will not add one for game images.
      </p>
      <h2>3. Copyright complaints</h2>
      <p>
        If you believe content stored through Portably infringes your rights, contact {CONTACT}. We respond to valid
        notices by removing the content and may terminate repeat infringers.
      </p>
      <h2>4. Accounts and storage</h2>
      <ul>
        <li>Each account has a storage quota shown in the library. We may change quotas with notice.</li>
        <li>You can delete any file, save or your whole account at any time; deletion is permanent.</li>
        <li>Accounts inactive for more than 12 months may be deleted after an email warning.</li>
      </ul>
      <h2>5. No warranty</h2>
      <p>
        Portably is provided as is. Emulation is imperfect: some games will not run, run slowly, or lose progress. Save
        states depend on the exact emulator build and may stop working after an update; native saves are kept
        separately. We are not liable for lost data or for the behaviour of the games you run.
      </p>
      <h2>6. Changes</h2>
      <p>We may update these terms; material changes are announced in the app. Continued use means acceptance.</p>
    </Doc>
  )
}

export function PrivacyPage() {
  return (
    <Doc title="Privacy Policy">
      <h2>What we store</h2>
      <ul>
        <li>Account: your email address and sign-in provider (Google or Discord) if you use one.</li>
        <li>Library metadata: disc ids, titles, file sizes and cryptographic hashes of the games you add.</li>
        <li>Files: your game images, saves, save states and their screenshots, in storage only your account can read.</li>
        <li>Play sessions: when you started and stopped a game and a coarse device label such as "Chrome on Windows".</li>
      </ul>
      <h2>What stays on your device</h2>
      <p>
        Game images are cached in your browser's private storage so they are downloaded once per device. The emulator
        keeps its memory stick in the browser too. Clearing site data removes both; your cloud copies remain.
      </p>
      <h2>Providers</h2>
      <p>
        Authentication, database and file storage run on Supabase; the web app is served by Vercel. Both act as
        processors under their own terms. We do not sell data and do not run third-party advertising or analytics.
      </p>
      <h2>Cookies and local storage</h2>
      <p>We use local storage for your session token and emulator preferences. There are no tracking cookies.</p>
      <h2>Your rights</h2>
      <p>
        You can export or delete your data at any time from the library. For anything else, or to delete your account
        entirely, contact {CONTACT}.
      </p>
    </Doc>
  )
}

export function LicensesPage() {
  return (
    <Doc title="Open-source licenses">
      <p>Portably stands on free software. The emulator runtime is redistributed under its original licenses.</p>
      <h2>Emulator</h2>
      <ul>
        <li>
          <b>EmulatorJS</b> 4.2.3 (GPL-3.0) - frontend and the WebAssembly build of the core.{' '}
          <a className="underline" href="https://github.com/EmulatorJS/EmulatorJS">Source</a>
        </li>
        <li>
          <b>RetroArch</b> (GPL-3.0) - libretro frontend inside the WebAssembly build.{' '}
          <a className="underline" href="https://github.com/EmulatorJS/RetroArch">Source</a>
        </li>
        <li>
          <b>PPSSPP</b> (GPL-2.0-or-later) - PlayStation Portable emulator core.{' '}
          <a className="underline" href="https://github.com/EmulatorJS/ppsspp">Source (EmulatorJS fork)</a> ·{' '}
          <a className="underline" href="https://github.com/hrydgard/ppsspp">Upstream</a> ·{' '}
          <a className="underline" href="https://github.com/EmulatorJS/build">Build scripts</a>
        </li>
      </ul>
      <p>
        The exact runtime files served by this site are the unmodified <code>@emulatorjs/emulatorjs</code> and{' '}
        <code>@emulatorjs/core-ppsspp</code> packages, version 4.2.3, from npm. Their licenses ship next to the runtime
        at <code>/emulatorjs/data/LICENSE-emulatorjs.txt</code>.
      </p>
      <h2>Web application</h2>
      <ul>
        <li>React, React Router, Tailwind CSS, Vite, vite-plugin-pwa, Workbox (MIT)</li>
        <li>@supabase/supabase-js, tus-js-client, hash-wasm (MIT)</li>
      </ul>
      <p>PlayStation and PSP are trademarks of Sony Interactive Entertainment. Portably is not affiliated with Sony.</p>
    </Doc>
  )
}
