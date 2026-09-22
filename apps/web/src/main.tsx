import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import './index.css'
import { AuthProvider } from './app/AuthProvider'
import { ErrorBoundary } from './app/ErrorBoundary'
import { GlobalErrors } from './app/GlobalErrors'
import { router } from './app/router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
        <GlobalErrors />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
