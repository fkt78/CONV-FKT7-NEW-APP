/** お知らせに添付できる画像の上限 */
export const MAX_NEWS_IMAGES = 5

/**
 * Firestore の `imageUrls`（配列）と旧 `imageUrl`（単一）を統合して最大5件に揃える。
 */
export function normalizeNewsImageUrls(data: { imageUrls?: unknown; imageUrl?: unknown }): string[] {
  const arr = data.imageUrls
  if (Array.isArray(arr)) {
    const urls = arr.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
    if (urls.length > 0) return urls.slice(0, MAX_NEWS_IMAGES)
  }
  const single = data.imageUrl
  if (typeof single === 'string' && single.trim()) return [single]
  return []
}
