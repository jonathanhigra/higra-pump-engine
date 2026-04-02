import React, { Component, ErrorInfo, ReactNode } from 'react'
import t from '../i18n/pt-br'

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
          padding: 24, margin: 16, background: 'rgba(239,68,68,0.1)', borderRadius: 8,
          border: '1px solid var(--accent-danger)',
        }}>
          <h3 style={{ color: 'var(--accent-danger)', margin: '0 0 8px' }}>{t.somethingWentWrong}</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 12px' }}>
            {this.state.error?.message || t.unexpectedError}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="btn-primary"
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            {t.tryAgain}
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
