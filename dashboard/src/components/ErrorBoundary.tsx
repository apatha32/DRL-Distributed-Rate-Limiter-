import { Component, ErrorInfo, ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { EmptyState } from './ui'

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card">
        <EmptyState
          icon={TriangleAlert}
          title="Something went wrong on this page"
          description={this.state.error.message}
          action={
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          }
        />
      </div>
    )
  }
}
