import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Card } from './ui'

// A render throw on one page used to leave a white screen with no way
// back. This catches it under the tab bar, so the tabs still work, and
// offers a reload. Shell keys it by route, so navigating away clears it.
type Props = { children: ReactNode }
type State = { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="pt-10">
        <Card tile className="p-5 text-center">
          <p className="text-body font-bold text-ink">Something went wrong on this screen</p>
          <p className="text-footnote text-ink-dim mt-1.5 break-words">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="mt-4 text-footnote font-bold text-green">
            Reload the app
          </button>
        </Card>
      </div>
    )
  }
}
