/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

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

self.addEventListener('push', (event) => {
  if (!event.data) return
  let data: { notification?: { title?: string; body?: string }; title?: string; body?: string; data?: { url?: string; sound?: string } } = {}
  try {
    data = event.data.json()
  } catch {
    return
  }
  const title = data.notification?.title ?? data.title ?? 'FKT7'
  const body = data.notification?.body ?? data.body ?? ''
  const url = data.data?.url ?? '/'
  const sound = data.data?.sound !== 'false'
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      tag: 'fkt7-notification',
      renotify: true,
      silent: !sound,
      data: { url },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    }),
  )
})
