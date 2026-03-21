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
      const err = this.state.error
      const errMsg = err?.message ?? String(err)
      return (
        <div className="min-h-dvh bg-[#f5f5f7] flex flex-col items-center justify-center p-6">
          <p className="text-[#1d1d1f] font-medium text-base mb-2">読み込みに失敗しました</p>
          {errMsg && (
            <p className="text-[#e53935] text-xs text-center mb-3 font-mono break-all max-w-full">
              {errMsg}
            </p>
          )}
          <p className="text-[#86868b] text-sm text-center mb-6">
            ブラウザを更新するか、別のブラウザでお試しください。
          </p>
          <a href="/debug.html" className="text-[#0095B6] text-sm mb-4">診断ページ</a>
          <button
            onClick={() => window.location.reload()}
            className="min-h-[44px] px-6 bg-[#0095B6] text-white font-semibold rounded-xl"
          >
            再読み込み
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
