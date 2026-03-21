import { useEffect, useRef } from 'react'

/**
 * ログイン中ユーザーのプッシュ通知登録を管理
 * - 通知設定が有効ならトークンを登録（許可が未決定の場合は requestPermission を呼ぶ）
 * - 無効ならトークンを削除
 * - 起動ごとにトークンを再取得し、変更があれば Firestore を更新
 * - firebase/messaging は動的インポート（Safari/LINE内ブラウザで白画面を防ぐ）
 */
export function useNotificationRegistration(uid: string | null) {
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!uid) return

    let cancelled = false

    async function run() {
      try {
        const mod = await import('../lib/messaging')
        const supported = await mod.isPushSupported()
        if (!supported || cancelled) return

        const settings = await mod.getNotificationSettings(uid!)
        if (!settings.enabled || cancelled) {
          await mod.removePushToken(uid!)
          return
        }

        let perm = Notification.permission
        if (perm === 'default') {
          perm = await Notification.requestPermission()
        }
        if (perm !== 'granted' || cancelled) return

        const reg = await navigator.serviceWorker.ready
        if (cancelled) return

        await mod.registerForPushNotifications(uid!, reg)
        registeredRef.current = true
      } catch (err) {
        console.warn('[NotificationRegistration] Push not supported', err)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [uid])
}
