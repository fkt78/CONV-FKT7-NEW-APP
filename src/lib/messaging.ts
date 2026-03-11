/**
 * Firebase Cloud Messaging（プッシュ通知）の登録・トークン管理
 */
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
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
  return {
    enabled: Boolean(s.enabled),
    messages: Boolean(s.messages),
    coupons: Boolean(s.coupons),
    news: Boolean(s.news),
    sound: Boolean(s.sound),
  }
}
