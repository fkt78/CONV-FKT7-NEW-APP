import { Fragment, type ReactNode } from 'react'

/** http(s) URL（末尾の句読点は除外） */
const INLINE_URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi

/** mailto: リンク */
const MAILTO_REGEX = /mailto:[^\s<>"')\]]+/gi

/** メールアドレス */
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi

/** @example.com 形式（ドメインへのショートカット） */
const AT_DOMAIN_REGEX = /(?<![\w.@/])@([a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,})/gi

const RICH_TEXT_REGEX = new RegExp(
  `(${INLINE_URL_REGEX.source})|(${MAILTO_REGEX.source})|(${EMAIL_REGEX.source})|(${AT_DOMAIN_REGEX.source})`,
  'giu',
)

type RichToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }
  | { type: 'mailto'; value: string }
  | { type: 'email'; value: string }
  | { type: 'at-domain'; value: string; href: string }

function tokenizeRichText(text: string): RichToken[] {
  const tokens: RichToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const re = new RegExp(RICH_TEXT_REGEX.source, RICH_TEXT_REGEX.flags)
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }

    const raw = match[0]
    if (isSafeUrl(raw)) {
      tokens.push({ type: 'url', value: raw })
    } else if (isSafeMailto(raw)) {
      tokens.push({ type: 'mailto', value: raw })
    } else if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/i.test(raw)) {
      tokens.push({ type: 'email', value: raw })
    } else if (raw.startsWith('@')) {
      const domain = raw.slice(1)
      tokens.push({ type: 'at-domain', value: raw, href: `https://${domain}` })
    } else {
      tokens.push({ type: 'text', value: raw })
    }

    lastIndex = match.index + raw.length
  }

  if (lastIndex < text.length) {
    tokens.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return tokens.length > 0 ? tokens : [{ type: 'text', value: text }]
}

function renderTextSegment(
  segment: string,
  searchQuery: string | undefined,
  key: number,
): ReactNode {
  if (!searchQuery?.trim()) return <Fragment key={key}>{segment}</Fragment>
  return <Fragment key={key}>{highlightMatch(segment, searchQuery)}</Fragment>
}

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

/** mailto: が安全かどうかを検証 */
export function isSafeMailto(url: string | undefined | null): boolean {
  if (!url) return false
  return /^mailto:[^\s"'<>]+$/i.test(url)
}

export interface FormatMessageTextOptions {
  searchQuery?: string
  linkClassName?: string
}

/**
 * チャット・お知らせ本文向け: URL / mailto / メール / @domain をリンク化。
 * 検索クエリがある場合はプレーンテキスト部分のみハイライト。
 */
export function formatMessageText(text: string, options?: FormatMessageTextOptions): ReactNode {
  const tokens = tokenizeRichText(text)
  const linkClass =
    options?.linkClassName ??
    'text-[#0095B6] underline underline-offset-2 break-all hover:text-[#007A96]'

  if (tokens.length === 1 && tokens[0].type === 'text') {
    return renderTextSegment(text, options?.searchQuery, 0)
  }

  return tokens.map((token, i) => {
    switch (token.type) {
      case 'url':
        return (
          <a
            key={i}
            href={token.value}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {renderTextSegment(token.value, options?.searchQuery, i)}
          </a>
        )
      case 'mailto':
        return (
          <a key={i} href={token.value} className={linkClass}>
            {renderTextSegment(token.value, options?.searchQuery, i)}
          </a>
        )
      case 'email':
        return (
          <a key={i} href={`mailto:${token.value}`} className={linkClass}>
            {renderTextSegment(token.value, options?.searchQuery, i)}
          </a>
        )
      case 'at-domain':
        return (
          <a
            key={i}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {renderTextSegment(token.value, options?.searchQuery, i)}
          </a>
        )
      default:
        return renderTextSegment(token.value, options?.searchQuery, i)
    }
  })
}

/** プレーンテキスト内の URL を外部リンクに変換（改行は維持） */
export function linkifyText(text: string, linkClassName?: string): ReactNode {
  return formatMessageText(text, { linkClassName })
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
