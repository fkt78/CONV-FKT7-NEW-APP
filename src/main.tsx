import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// 未捕捉エラーで白画面になるのを防ぐ
window.addEventListener('error', (e) => {
  console.error('[App] Uncaught error', e.error ?? e)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled rejection', e.reason)
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function showError(root: HTMLElement, err: unknown) {
  const msg = escapeHtml(err instanceof Error ? err.message : String(err))
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f5f5f7;font-family:sans-serif;padding:24px;">
      <div style="text-align:center;">
        <p style="color:#1d1d1f;font-weight:600;margin-bottom:8px;">読み込みに失敗しました</p>
        <p style="color:#86868b;font-size:14px;margin-bottom:16px;">${msg}</p>
        <a href="/debug.html" style="color:#0095B6;">診断ページ</a> | 
        <button onclick="location.reload()" style="background:#0095B6;color:white;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;">再読み込み</button>
      </div>
    </div>
  `
}

async function mount() {
  const root = document.getElementById('root')
  if (!root) return
  try {
    const { default: App } = await import('./App')
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  } catch (err) {
    console.error('[App] Mount failed', err)
    showError(root, err)
  }
}

mount()
