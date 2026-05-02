/**
 * Firebase Cloud Messaging（プッシュ通知）の登録・トークン管理
 */
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db, app } from './firebase'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined

export interface NotificationSettings {
  enabled: boolean
  messages: boolean
  coupons: boolean
  news: boolean
  sound: boolean
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  messages: true,
  coupons: true,
  news: true,
  sound: true,
}

/** プッシュ通知が利用可能か */
export async function isPushSupported(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!VAPID_KEY?.trim()) return false
  return isSupported()
}

/** 通知許可をリクエストし、トークンを取得して Firestore に保存 */
export async function registerForPushNotifications(
  uid: string,
  swRegistration: ServiceWorkerRegistration,
): Promise<string | null> {
  if (typeof window === 'undefined') return null
  if (!VAPID_KEY?.trim()) return null
  const supported = await isSupported()
  if (!supported) return null

  const messaging = getMessaging(app)
  const token = await getToken(messaging, {
    serviceWorkerRegistration: swRegistration,
    vapidKey: VAPID_KEY,
  })
  if (!token) return null

  await setDoc(
    doc(db, 'users', uid),
    { fcmToken: token, fcmTokenUpdatedAt: new Date() },
    { merge: true },
  )
  return token
}

/** FCM トークンを Firestore から削除（通知オフ時） */
export async function removePushToken(uid: string): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { fcmToken: null, fcmTokenUpdatedAt: null },
    { merge: true },
  )
}

/** 通知設定を Firestore に保存 */
export async function saveNotificationSettings(
  uid: string,
  settings: NotificationSettings,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    { notificationSettings: settings },
    { merge: true },
  )
}

/** 通知設定を Firestore から取得 */
export async function getNotificationSettings(
  uid: string,
): Promise<NotificationSettings> {
  const snap = await getDoc(doc(db, 'users', uid))
  const data = snap.data()
  const s = data?.notificationSettings
  if (!s || typeof s !== 'object') return { ...DEFAULT_NOTIFICATION_SETTINGS }
  // フィールドが undefined の場合は true（デフォルト ON）扱い。
  // Cloud Functions 側も「=== false のときだけ OFF」で統一しているため、
  // Boolean(undefined) = false にしてしまうと画面と実際の送信状況がズレる。
  return {
    enabled: s.enabled !== false,
    messages: s.messages !== false,
    coupons: s.coupons !== false,
    news: s.news !== false,
    sound: s.sound !== false,
  }
}

/**
 * フォアグラウンド（アプリが開いている状態）での通知ハンドラーを登録する。
 *
 * FCM の仕様上、アプリがフォアグラウンドのとき Service Worker の push ハンドラーは
 * 呼ばれず、代わりに onMessage が呼ばれる。
 * onMessage を登録しないと、アプリを開いた状態で受信したメッセージが
 * サイレントに破棄される（通知が一切表示されない）。
 *
 * @returns 登録解除関数（unmount 時に呼ぶこと）
 */
export async function setupForegroundMessageHandler(
  swRegistration: ServiceWorkerRegistration,
): Promise<() => void> {
  const supported = await isSupported()
  if (!supported) return () => {}

  const messaging = getMessaging(app)
  const unsubscribe = onMessage(messaging, (payload) => {
    const title =
      payload.notification?.title ?? (payload.data?.title as string | undefined) ?? 'FKT7'
    const body =
      payload.notification?.body ?? (payload.data?.body as string | undefined) ?? ''
    const url = (payload.data?.url as string | undefined) ?? '/'
    const sound = payload.data?.sound !== 'false'

    // フォアグラウンドでも確実に通知を表示するため SW の showNotification を使う
    void swRegistration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      // メッセージごとにユニークな tag にして「潰れ」を防ぐ
      tag: `fkt7-fg-${Date.now()}`,
      renotify: true,
      silent: !sound,
      data: { url },
    } as NotificationOptions)
  })

  return unsubscribe
}
