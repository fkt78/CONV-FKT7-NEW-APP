import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

// 未捕捉エラーで白画面になるのを防ぐ
window.addEventListener('error', (e) => {
  console.error('[App] Uncaught error', e.error ?? e)
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[App] Unhandled rejection', e.reason)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
