import { createBrowserRouter } from 'react-router'
import { Layout } from './Layout'
import { RequireAuth } from './RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage'
import { LibraryPage } from '../features/library/LibraryPage'
import { PlayerPage } from '../features/player/PlayerPage'
import { SpikePage } from '../features/dev/SpikePage'
import { IdentifyPage } from '../features/dev/IdentifyPage'
import { PlayerHarnessPage } from '../features/dev/PlayerHarnessPage'
import { LicensesPage, PrivacyPage, TermsPage } from '../features/legal/LegalPages'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      // Phase 0 spike stays reachable without an account for emulator work.
      { path: '/dev/spike', element: <SpikePage /> },
      { path: '/dev/identify', element: <IdentifyPage /> },
      { path: '/dev/player', element: <PlayerHarnessPage /> },
      { path: '/legal/terms', element: <TermsPage /> },
      { path: '/legal/privacy', element: <PrivacyPage /> },
      { path: '/legal/licenses', element: <LicensesPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <LibraryPage /> },
          { path: '/play/:gameId', element: <PlayerPage /> },
        ],
      },
      { path: '*', element: <p className="text-zinc-400">Page not found.</p> },
    ],
  },
])
