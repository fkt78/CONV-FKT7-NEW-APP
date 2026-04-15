import { useEffect } from 'react'
import { useChatBadge } from '../contexts/ChatBadgeContext'
import { useAuth } from '../contexts/AuthContext'

/** PWAアプリアイコンに未読件数バッジを表示（iPhoneホーム画面・ドックなど） */
export default function AppBadge() {
  const { currentUser, userRole } = useAuth()
  const { unreadMessageCount, couponCount } = useChatBadge()

  useEffect(() => {
    if (!currentUser || userRole === 'admin') return
    const nav = navigator as Navigator & { setAppBadge?(n: number): Promise<void>; clearAppBadge?(): Promise<void> }
    if (typeof nav.setAppBadge !== 'function') return

    const total = unreadMessageCount + couponCount
    if (total > 0) {
      nav.setAppBadge?.(Math.min(total, 99))
    } else {
      nav.clearAppBadge?.()
    }
  }, [currentUser, userRole, unreadMessageCount, couponCount])

  useEffect(() => {
    return () => {
      const nav = navigator as Navigator & { clearAppBadge?(): Promise<void> }
      nav.clearAppBadge?.()
    }
  }, [])

  return null
}
