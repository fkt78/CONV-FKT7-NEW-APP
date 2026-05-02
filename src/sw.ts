/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// ── Firebase Messaging (SW) ───────────────────────────────────────────────────
// Firebase Messaging をここで初期化することで、フォアグラウンド時の
// 「SW → アプリページ」メッセージ中継チャンネルが確立される。
// これがないと onMessage() にメッセージが届かない。
const firebaseApp = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
})

const fbMessaging = getMessaging(firebaseApp)

// バックグラウンド受信時（アプリが閉じているまたは非表示）の通知表示
// ※フォアグラウンド時はアプリ側の onMessage() が呼ばれるため、この関数は呼ばれない
onBackgroundMessage(fbMessaging, (payload) => {
  const title =
    payload.notification?.title ?? (payload.data?.title as string | undefined) ?? 'FKT7'
  const body =
    payload.notification?.body ?? (payload.data?.body as string | undefined) ?? ''
  const url = (payload.data?.url as string | undefined) ?? '/'
  const sound = payload.data?.sound !== 'false'

  void self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: 'fkt7-notification',
    renotify: true,
    silent: !sound,
    data: { url },
  } as NotificationOptions)
})
// ─────────────────────────────────────────────────────────────────────────────

// ── ランタイムキャッシュ ──────────────────────────────────────────────────────

// Firebase Storage の画像（アバター・添付ファイル等）: 30日間 CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://firebasestorage.googleapis.com',
  new CacheFirst({
    cacheName: 'firebase-storage-images',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  }),
)

// Google Fonts スタイルシート: StaleWhileRevalidate
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({
    cacheName: 'google-fonts-stylesheets',
  }),
)

// Google Fonts フォントファイル: 1年間 CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 365 * 24 * 60 * 60,
      }),
    ],
  }),
)

// バナー画像（/banners/）: 14日間 StaleWhileRevalidate
registerRoute(
  ({ url }) => url.pathname.startsWith('/banners/'),
  new StaleWhileRevalidate({
    cacheName: 'app-banners',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 14 * 24 * 60 * 60,
      }),
    ],
  }),
)
// ─────────────────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          void (client as WindowClient).navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
