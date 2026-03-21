import type { ReactNode } from 'react'

/** メッセージが検索キーワードにマッチするか */
export function messageMatches(
  msg: { text?: string; attachmentName?: string },
  q: string,
): boolean {
  if (!q.trim()) return true
  const lower = q.trim().toLowerCase()
  if (msg.text?.toLowerCase().includes(lower)) return true
  if (msg.attachmentName?.toLowerCase().includes(lower)) return true
  return false
}

/** テキスト内のキーワードをハイライト表示 */
export function highlightMatch(text: string | null | undefined, query: string): ReactNode {
  if (text == null) return ''
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="bg-[#FFE500]/70 rounded px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

/** URL が安全なスキーム（http / https）かどうかを検証 */
export function isSafeUrl(url: string | undefined | null): boolean {
  if (!url) return false
  return /^https?:\/\//i.test(url)
}
