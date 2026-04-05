/**
 * Firebase Analytics（GA4）ラッパー
 *
 * VITE_FIREBASE_MEASUREMENT_ID が設定されていない場合は何もしない（安全にスキップ）。
 * 設定済みの場合はバナークリックイベントを GA4 に送信する。
 */
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics'
import type { Analytics } from 'firebase/analytics'
import { app } from './firebase'

let _analytics: Analytics | null = null
let _initialized = false

async function getAnalyticsInstance(): Promise<Analytics | null> {
  if (_initialized) return _analytics
  _initialized = true

  const measurementId = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined
  if (!measurementId?.trim()) return null

  const supported = await isSupported()
  if (!supported) return null

  _analytics = getAnalytics(app)
  return _analytics
}

/**
 * バナークリックイベントを GA4 に送信する。
 *
 * @param bannerId   バナーの一意キー（例: 'vpn', 'dtisim'）
 * @param bannerLabel 日本語表示名（例: 'セカイVPN'）
 */
export async function logBannerClick(bannerId: string, bannerLabel: string): Promise<void> {
  const analytics = await getAnalyticsInstance()
  if (!analytics) return

  logEvent(analytics, 'affiliate_banner_click', {
    banner_id: bannerId,
    banner_label: bannerLabel,
  })
}
