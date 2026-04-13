import { initializeApp } from 'firebase/app'
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth'
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
 * 認証をメモリのみに保持。ブラウザをリロードするとセッションは失われ、ログイン画面から入り直す。
 * （デフォルトの local 永続化を上書きするため、初回ロード時に非同期で完了する）
 */
export const authPersistenceReady = setPersistence(auth, inMemoryPersistence).catch((err) => {
  console.error('[firebase] setPersistence(inMemory) failed', err)
})
/**
 * Firestore はメモリキャッシュのみ使用。
 * Auth が inMemoryPersistence のためオフライン永続化は不要。
 * IndexedDB の QuotaExceededError を防ぐ。
 */
export const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
})
export const functions = getFunctions(app)
export const storage = getStorage(app)
export { httpsCallable }
