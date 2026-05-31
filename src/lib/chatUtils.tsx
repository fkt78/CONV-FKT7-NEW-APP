import { Fragment, type ReactNode } from 'react'

/** 本文中の http(s) URL（末尾の句読点は除外） */
const INLINE_URL_REGEX = /(https?:\/\/[^\s<>"')\]]+)/gi

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

/** プレーンテキスト内の URL を外部リンクに変換（改行は維持） */
export function linkifyText(text: string, linkClassName?: string): ReactNode {
  const parts = text.split(INLINE_URL_REGEX)
  if (parts.length === 1) return text

  const linkClass =
    linkClassName ?? 'text-[#0095B6] underline underline-offset-2 break-all hover:text-[#007A96]'

  return parts.map((part, i) => {
    if (!part) return null
    if (isSafeUrl(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          {part}
        </a>
      )
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

/**
 * Promise が完了しないまま固まると送信ボタンが disabled のままになるため、タイムアウトで打ち切る。
 * timeoutErrorMessage は翻訳済みの全文を渡す。
 */
export function withTimeout<T>(p: Promise<T>, ms: number, timeoutErrorMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(timeoutErrorMessage)), ms)
    p.then(
      (v) => {
        clearTimeout(id)
        resolve(v)
      },
      (e: unknown) => {
        clearTimeout(id)
        reject(e)
      },
    )
  })
}
