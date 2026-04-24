import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { getStorage } from 'firebase/storage'

const env = import.meta.env
const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_APP_ID',
] as const
const missing = required.filter((k) => !env[k])
if (missing.length > 0) {
  const msg = `Firebase 設定が不足しています: ${missing.join(', ')}`
  console.error('[firebase]', msg)
  throw new Error(msg)
}

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export { app }
export const auth = getAuth(app)

/**
 * 認証を localStorage で永続化。リロード後もログイン状態を保持する。
 * 管理者向けのアイドルタイムアウトは useAdminIdleTimeout フックが別途担当する。
 */
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.error('[firebase] setPersistence(browserLocal) failed', err)
})

/**
 * メモリキャッシュを使用。IndexedDB（persistentLocalCache）は蓄積した
 * ペンディング書き込みが多くなると addDoc/updateDoc が数十秒ブロックする
 * 既知の問題があるため、サーバーへの直接書き込みを保証する memoryLocalCache を採用。
 * admin 操作はサーバー確認が取れることが重要なため、オフラインキャッシュは不要。
 *
 * Note: experimentalAutoDetectLongPolling は初回起動時のプローブ遅延で
 * users/{uid} 初回読み取りが失敗し管理者ロールが取れなくなる副作用があるため使わない。
 */
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})
export const functions = getFunctions(app)
export const storage = getStorage(app)
export { httpsCallable }
