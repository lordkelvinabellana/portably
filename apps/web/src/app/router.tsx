import { createBrowserRouter } from 'react-router'
import { Layout } from './Layout'
import { RequireAuth } from './RequireAuth'
import { LoginPage } from '../features/auth/LoginPage'
import { AuthCallbackPage } from '../features/auth/AuthCallbackPage'
import { LibraryPage } from '../features/library/LibraryPage'
import { SpikePage } from '../features/dev/SpikePage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/auth/callback', element: <AuthCallbackPage /> },
      // Phase 0 spike stays reachable without an account for emulator work.
      { path: '/dev/spike', element: <SpikePage /> },
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <LibraryPage /> }],
      },
      { path: '*', element: <p className="text-zinc-400">Page not found.</p> },
    ],
  },
])
