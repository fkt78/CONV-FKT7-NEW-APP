import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

/**
 * Web Vitals をコンソールに出力する。
 * 本番では Analytics への送信を検討するが、まずは計測のみを目的とする。
 */
function reportMetric(metric: Metric) {
  if (import.meta.env.DEV) {
    // 開発時は詳細を出力
    // eslint-disable-next-line no-console
    console.log(`[WebVitals] ${metric.name}`, {
      value: Math.round(metric.value),
      rating: metric.rating,
      delta: Math.round(metric.delta),
      id: metric.id,
    })
    return
  }
  // 本番はシンプルなログのみ（将来Analyticsに差し替え可能）
  // eslint-disable-next-line no-console
  console.log(`[WebVitals] ${metric.name}=${Math.round(metric.value)} (${metric.rating})`)
}

/**
 * 主要なWeb Vitalsの計測を開始する。
 * アプリ起動時に1度だけ呼ぶ。
 */
export function initWebVitals() {
  try {
    onCLS(reportMetric)
    onFCP(reportMetric)
    onINP(reportMetric)
    onLCP(reportMetric)
    onTTFB(reportMetric)
  } catch (err) {
    console.warn('[WebVitals] init failed', err)
  }
}
