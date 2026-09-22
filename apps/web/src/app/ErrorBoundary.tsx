import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Last line of defence for render-time errors: a readable message and a reload button. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg rounded-lg border border-red-500/40 bg-red-500/10 p-6 text-sm">
        <h1 className="mb-2 text-lg font-semibold text-red-200">Something went wrong</h1>
        <p className="mb-4 text-zinc-300">{this.state.error.message}</p>
        <p className="mb-4 text-zinc-400">Your games and cloud saves are safe. Reloading usually fixes this.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
