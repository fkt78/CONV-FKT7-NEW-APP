/**
 * イエローカードの枚数からアバターの背景色を決める。
 * 0枚 → 通常の青 ／ 1枚 → 黄 ／ 2枚以上 → 橙（警戒）
 *
 * ※ 3枚到達＝ブラックリスト（status: 'blacklisted'）は 2枚以上に含まれるため橙になる。
 *   停止中であることは色ではなく「停止中」バッジで示す（getAvatarBg では扱わない）。
 */
export function getAvatarBg(yellowCards: number | null | undefined): string {
  const yc = typeof yellowCards === 'number' && Number.isFinite(yellowCards) ? Math.max(0, yellowCards) : 0
  if (yc >= 2) return '#f97316'
  if (yc === 1) return '#eab308'
  return '#0095B6'
}
