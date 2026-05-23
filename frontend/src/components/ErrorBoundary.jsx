import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-icon">⚠️</div>
          <div className="error-title">组件渲染异常</div>
          <div className="error-message">{this.state.error?.message || '未知错误'}</div>
          <button
            className="error-retry-btn"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
