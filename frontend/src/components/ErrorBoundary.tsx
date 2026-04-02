import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('HPE Error:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{
          padding: 24, margin: 16, background: '#fde8e8', borderRadius: 8,
          border: '1px solid #f5c6cb',
        }}>
          <h3 style={{ color: '#c0392b', margin: '0 0 8px' }}>Something went wrong</h3>
          <p style={{ fontSize: 13, color: '#666', margin: '0 0 12px' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '6px 16px', background: '#c0392b', color: '#fff',
              border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13,
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
