import { useEffect, useRef } from 'react'

/**
 * ログイン中ユーザーのプッシュ通知登録を管理
 * - 通知設定が有効ならトークンを登録（許可が未決定の場合は requestPermission を呼ぶ）
 * - 無効ならトークンを削除
 * - 起動ごとにトークンを再取得し、変更があれば Firestore を更新
 * - OS/ブラウザで通知が拒否された場合は Firestore のトークンを削除
 * - フォアグラウンド中のメッセージ受信ハンドラーを登録し、アプリを開いた状態でも
 *   通知が表示されるようにする（FCM はフォアグラウンド時 SW の push を呼ばないため）
 * - firebase/messaging は動的インポート（Safari/LINE内ブラウザで白画面を防ぐ）
 */
export function useNotificationRegistration(uid: string | null) {
  // フォアグラウンドハンドラーの登録解除関数
  const fgUnsubRef = useRef<(() => void) | null>(null)

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
        if (cancelled) return
        if (perm !== 'granted') {
          // OS/ブラウザ側で拒否された場合は Firestore のトークンも削除し、
          // Cloud Functions が無効なトークンに送信し続けるのを防ぐ
          if (perm === 'denied') {
            await mod.removePushToken(uid!)
          }
          return
        }

        const reg = await navigator.serviceWorker.ready
        if (cancelled) return

        await mod.registerForPushNotifications(uid!, reg)

        // フォアグラウンド通知ハンドラーを登録
        // アプリが開いているときは SW の push ではなく onMessage が呼ばれるため
        // ここで明示的に showNotification しないと通知が表示されない
        if (!fgUnsubRef.current) {
          fgUnsubRef.current = await mod.setupForegroundMessageHandler(reg)
        }
      } catch (err) {
        console.warn('[NotificationRegistration] Push not supported', err)
      }
    }

    run()
    return () => {
      cancelled = true
      // フォアグラウンドハンドラーの解除
      fgUnsubRef.current?.()
      fgUnsubRef.current = null
    }
  }, [uid])
}
