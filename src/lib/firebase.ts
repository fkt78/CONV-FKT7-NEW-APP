import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
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
 * IndexedDB に書き込みを一時保存し、接続回復後に自動同期する（シングルタブ用）。
 * 一時的なネット断で addDoc が長時間待機しにくくなる。
 * IndexedDB が使えない環境は memoryLocalCache にフォールバック。
 */
let firestoreCache
try {
  firestoreCache = persistentLocalCache({
    tabManager: persistentSingleTabManager({}),
  })
} catch (e) {
  console.warn('[firebase] persistentLocalCache unavailable, using memoryLocalCache', e)
  firestoreCache = memoryLocalCache()
}

export const db = initializeFirestore(app, {
  localCache: firestoreCache,
})
export const functions = getFunctions(app)
export const storage = getStorage(app)
export { httpsCallable }
