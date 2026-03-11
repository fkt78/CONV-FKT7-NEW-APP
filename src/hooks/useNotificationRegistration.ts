import { useEffect, useRef } from 'react'
import {
  isPushSupported,
  registerForPushNotifications,
  removePushToken,
  getNotificationSettings,
} from '../lib/messaging'

/**
 * ログイン中ユーザーのプッシュ通知登録を管理
 * - 通知設定が有効かつ許可済みならトークンを登録
 * - 無効ならトークンを削除
 */
export function useNotificationRegistration(uid: string | null) {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!uid) return

    let cancelled = false

    async function run() {
      const supported = await isPushSupported()
      if (!supported || cancelled) return

      const settings = await getNotificationSettings(uid!)
      if (!settings.enabled || cancelled) {
        await removePushToken(uid!)
        return
      }

      if (Notification.permission !== 'granted') return

      const reg = await navigator.serviceWorker.ready
      if (cancelled) return

      await registerForPushNotifications(uid!, reg)
      registeredRef.current = true
    }

    run()
    return () => {
      cancelled = true
    }
  }, [uid])
}
