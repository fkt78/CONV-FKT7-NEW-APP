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
  /** GitHub Pages 等の求人 LP 公開 URL（設定時のみバナーにスライド追加） */
  readonly VITE_JOB_RECRUITMENT_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
