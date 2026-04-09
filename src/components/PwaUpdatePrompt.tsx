import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { registerSW } from 'virtual:pwa-register'

/** 新バージョン検出時に表示する更新プロンプト */
export default function PwaUpdatePrompt() {
  const { t } = useTranslation()
  const [showPrompt, setShowPrompt] = useState(false)
  const updateSWRef = useRef<(() => Promise<void>) | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      const updateSW = registerSW({
        onNeedRefresh() {
          setShowPrompt(true)
        },
        onOfflineReady() {
          // オフライン対応完了
        },
        onRegistered(registration: ServiceWorkerRegistration | undefined) {
          intervalRef.current = setInterval(async () => {
            if (!registration?.installing && navigator.onLine) {
              await registration?.update()
            }
          }, 60 * 60 * 1000)
        },
      })
      updateSWRef.current = updateSW
    } catch (err) {
      console.warn('[PwaUpdatePrompt] SW registration skipped', err)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [])

  async function handleUpdate() {
    const updateSW = updateSWRef.current
    if (updateSW) {
      await updateSW()
    }
    setShowPrompt(false)
  }

  if (!showPrompt) return null

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[9999] bg-[#1d1d1f] text-white px-4 py-4 safe-area-bottom shadow-[0_-4px_20px_rgba(0,0,0,0.15)]"
      role="alert"
      aria-live="polite"
    >
      <p className="text-[15px] font-medium mb-3">
        {t('pwa.newVersion')}
      </p>
      <div className="flex gap-3">
        <button
          onClick={handleUpdate}
          className="flex-1 min-h-[44px] bg-[#0095B6] text-white font-semibold text-[15px] rounded-xl hover:bg-[#007A96] active:scale-[0.98] transition"
        >
          {t('pwa.update')}
        </button>
        <button
          onClick={() => setShowPrompt(false)}
          className="flex-1 min-h-[44px] bg-[#e5e5ea] text-[#1d1d1f] font-medium text-[15px] rounded-xl hover:bg-[#d1d1d6] active:scale-[0.98] transition"
        >
          {t('pwa.later')}
        </button>
      </div>
    </div>
  )
}
