/**
 * Crash containment. Owned by the lead.
 *
 * WHY THIS EXISTS. A render error anywhere in a React tree unmounts the WHOLE tree,
 * so one bad component turns the entire product into a white screen with nothing on
 * it but a console message. That is survivable in development and fatal on a stage.
 *
 * It also gives the user the one recovery that actually works for this app. PilSim
 * persists a working set, user-created substances, composed pills and saved subjects
 * to localStorage. State written by an older build can be read by a newer one, and a
 * shape that no longer matches is a genuine source of crashes that a reload alone
 * will never clear — the bad data is still there. So the boundary offers to clear it.
 *
 * Deliberately dependency-free and deliberately not clever: this is the component
 * that has to work when everything else did not.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Every key PilSim writes. Kept here so the reset is complete rather than partial. */
const STORAGE_PREFIXES = ['pilsim', 'PILSIM']

function clearPilSimStorage(): number {
  if (typeof localStorage === 'undefined') return 0
  let removed = 0
  try {
    for (const key of Object.keys(localStorage)) {
      if (STORAGE_PREFIXES.some((p) => key.toLowerCase().startsWith(p.toLowerCase()))) {
        localStorage.removeItem(key)
        removed++
      }
    }
  } catch {
    // A disabled or full localStorage must not break the recovery path itself.
  }
  return removed
}

interface State {
  error: Error | null
  info: string | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the component stack — it is what makes a screenshot from a tester useful.
    this.setState({ info: info.componentStack ?? null })
    // eslint-disable-next-line no-console
    console.error('PilSim render error:', error, info.componentStack)
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div className="crash">
        <div className="crash-box">
          <h1>Something in the interface failed to render.</h1>
          <p>
            The simulation engine and the dataset are unaffected — this is a display
            fault. Reloading usually fixes it. If it happens again straight away, clear
            the saved data: PilSim keeps your substances, pills and test subjects in
            this browser, and data written by an older version can be unreadable by a
            newer one.
          </p>

          <div className="crash-actions">
            <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
              Reload
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const n = clearPilSimStorage()
                // eslint-disable-next-line no-console
                console.info(`PilSim: cleared ${n} stored key(s)`)
                location.reload()
              }}
            >
              Clear saved data and reload
            </button>
          </div>

          <details className="crash-detail">
            <summary>Technical detail</summary>
            <pre>
              {error.name}: {error.message}
              {info ? `\n${info}` : ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
