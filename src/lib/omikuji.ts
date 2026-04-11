/**
 * おみくじセット（大吉・中吉・小吉の3テンプレ＋割合を1単位で管理）
 * ※ 層1ではアフィリエイト等の外部タグを持たない（クーポンテンプレは既存 coupons と同じ）
 */

export interface OmikujiSet {
  id: string
  /** 管理用ラベル */
  name?: string
  active: boolean
  couponIdDai: string
  couponIdChu: string
  couponIdSho: string
  /** 0–100（配布可能者母数に対する割合・切り捨て。ペナルティ適用は Cloud Functions 側） */
  pctDai: number
  pctChu: number
  pctSho: number
  createdAt: Date | null
}

export function validateOmikujiPercents(pctDai: number, pctChu: number, pctSho: number): string | null {
  const d = Math.floor(pctDai)
  const c = Math.floor(pctChu)
  const s = Math.floor(pctSho)
  if (d < 0 || d > 100 || c < 0 || c > 100 || s < 0 || s > 100) {
    return '割合は0〜100の整数としてください'
  }
  return null
}

export function validateOmikujiCouponIds(dai: string, chu: string, sho: string): string | null {
  if (!dai || !chu || !sho) return '大吉・中吉・小吉のクーポンテンプレをすべて選んでください'
  if (new Set([dai, chu, sho]).size !== 3) return '3つのテンプレは別々のIDである必要があります'
  return null
}
