import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/** モバイルで白画面になるのを防ぐための Error Boundary */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-dvh bg-[#f5f5f7] flex flex-col items-center justify-center p-6">
          <p className="text-[#1d1d1f] font-medium text-base mb-2">読み込みに失敗しました</p>
          <p className="text-[#86868b] text-sm text-center mb-6">
            ブラウザを更新するか、別のブラウザでお試しください。
          </p>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 bg-[#007AFF] text-white font-semibold rounded-xl"
          >
            再読み込み
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
