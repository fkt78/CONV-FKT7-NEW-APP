/**
 * Firebase Analytics（GA4）ラッパー + Firestore バナークリック集計
 *
 * - GA4: VITE_FIREBASE_MEASUREMENT_ID が設定されていない場合はスキップ
 * - Firestore: bannerStats/{bannerId} に累計クリック数を保存（参考値）
 */
import { getAnalytics, isSupported, logEvent } from 'firebase/analytics'
import type { Analytics } from 'firebase/analytics'
import { doc, setDoc, increment, serverTimestamp } from 'firebase/firestore'
import { app } from './firebase'
import { db } from './firebase'

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
 * バナークリックを GA4 に送信し、Firestore の累計カウンタを +1 する。
 *
 * @param bannerId   バナーの一意キー（例: 'vpn', 'dtisim'）
 * @param bannerLabel 日本語表示名（例: 'セカイVPN'）
 */
export async function logBannerClick(bannerId: string, bannerLabel: string): Promise<void> {
  // GA4
  const analytics = await getAnalyticsInstance()
  if (analytics) {
    logEvent(analytics, 'affiliate_banner_click', {
      banner_id: bannerId,
      banner_label: bannerLabel,
    })
  }

  // Firestore 累計カウント（merge: true で初回も自動作成）
  try {
    await setDoc(
      doc(db, 'bannerStats', bannerId),
      {
        count: increment(1),
        label: bannerLabel,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } catch {
    // 計測失敗はサイレントに無視
  }
}
