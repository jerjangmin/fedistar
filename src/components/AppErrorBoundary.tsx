import { invoke } from '@tauri-apps/api/core'
import React from 'react'

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
}

class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false
  }

  static getDerivedStateFromError() {
    return {
      hasError: true
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    void invoke('frontend_log', {
      level: 'error',
      message: [
        error.stack ?? error.message,
        errorInfo.componentStack,
        `URL: ${window.location.href}`
      ]
        .filter(Boolean)
        .join('\n')
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            alignItems: 'center',
            backgroundColor: '#111',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '24px'
          }}
        >
          <h1 style={{ fontSize: '20px', margin: 0 }}>Application Error</h1>
          <p style={{ margin: 0, maxWidth: '480px', textAlign: 'center' }}>
            The current screen crashed. Reload the app to recover.
          </p>
          <button
            onClick={() => {
              window.location.reload()
            }}
            style={{
              backgroundColor: '#fff',
              border: 0,
              borderRadius: '6px',
              color: '#111',
              cursor: 'pointer',
              padding: '10px 16px'
            }}
            type="button"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

export default AppErrorBoundary
