import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from './useAuth'

export function Layout() {
  const { user, signOut } = useAuth()
  return (
    <div className="flex min-h-dvh flex-col bg-zinc-950 text-zinc-100">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-zinc-800 focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-zinc-800">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3" aria-label="Main">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <img src="/icon.svg" alt="" width="24" height="24" />
            Portably
          </Link>
          <NavLink to="/" end className="nav-link">
            Library
          </NavLink>
          <div className="ml-auto flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-zinc-400">{user.email}</span>
                <button type="button" className="btn" onClick={() => void signOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <Link to="/login" className="btn">
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <footer className="border-t border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs text-zinc-500">
          <span>Portably runs the games you own. It never hosts or shares game files.</span>
          <Link to="/legal/terms" className="hover:text-zinc-300">
            Terms
          </Link>
          <Link to="/legal/privacy" className="hover:text-zinc-300">
            Privacy
          </Link>
          <Link to="/legal/licenses" className="hover:text-zinc-300">
            Licenses
          </Link>
          <Link to="/dev/spike" className="ml-auto hover:text-zinc-300">
            Dev tools
          </Link>
        </div>
      </footer>
    </div>
  )
}
