import i18n from '../i18n'

/** 日付フォーマット用 BCP 47 ロケール（i18n 言語に追従） */
export function getLocaleTag(): string {
  const base = i18n.language.split('-')[0]
  if (base === 'en') return 'en-US'
  if (base === 'vi') return 'vi-VN'
  return 'ja-JP'
}

/**
 * 日時をメッセージ表示用にフォーマット（今日は時刻のみ、それ以外は日付+時刻）
 */
export function formatTime(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString(getLocaleTag(), { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString(getLocaleTag(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 日時をリスト表示用にコンパクトにフォーマット（今日は時刻、昨日は「昨日」、それ以外は日付のみ）
 */
export function formatTimeCompact(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString(getLocaleTag(), { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return i18n.t('date.yesterday')
  return date.toLocaleDateString(getLocaleTag(), { month: 'numeric', day: 'numeric' })
}

/** 2つの日付が同じ日かどうか */
export function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.toDateString() === b.toDateString()
}

/** 日付区切り表示用（今日/昨日/年月日） */
export function formatDateDivider(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return i18n.t('date.today')
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return i18n.t('date.yesterday')
  return date.toLocaleDateString(getLocaleTag(), { year: 'numeric', month: 'long', day: 'numeric' })
}
