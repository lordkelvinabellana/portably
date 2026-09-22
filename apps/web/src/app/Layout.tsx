import { Link, NavLink, Outlet } from 'react-router'
import { useAuth } from './useAuth'

export function Layout() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800">
        <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link to="/" className="font-semibold tracking-tight">
            Portably
          </Link>
          <NavLink to="/" end className="nav-link">
            Library
          </NavLink>
          <NavLink to="/dev/spike" className="nav-link">
            Dev spike
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
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
