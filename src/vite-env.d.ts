/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Badging API（PWAアプリアイコンに未読バッジ表示） */
interface Navigator {
  setAppBadge?(contents?: number): Promise<void>
  clearAppBadge?(): Promise<void>
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string
  readonly VITE_BUILD_VERSION: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
