const PLUS_STRIP_DOMAINS = new Set([
  'gmail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.jp',
  'live.com',
])

export function normalizeEmail(email: string): string {
  if (!email || typeof email !== 'string') return ''
  let normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  if (at <= 0) return normalized

  let local = normalized.slice(0, at)
  let domain = normalized.slice(at + 1)

  if (domain === 'googlemail.com') domain = 'gmail.com'

  if (PLUS_STRIP_DOMAINS.has(domain)) {
    const plusIndex = local.indexOf('+')
    if (plusIndex >= 0) local = local.slice(0, plusIndex)
  }

  if (domain === 'gmail.com') {
    local = local.replace(/\./g, '')
  }

  return `${local}@${domain}`
}

export function normalizeName(name: string): string {
  if (!name || typeof name !== 'string') return ''
  let s = name.trim()
  s = s.replace(/[\u3000\s]+/g, '')
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  s = s.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
  return s.toLowerCase()
}
