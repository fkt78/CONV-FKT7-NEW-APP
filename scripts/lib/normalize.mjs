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

export const CONFIDENCE_RANK = { 高: 3, 中: 2, 低: 1 }

/** @param {string} email */
export function normalizeEmail(email) {
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

/** @param {string} name */
export function normalizeName(name) {
  if (!name || typeof name !== 'string') return ''
  let s = name.trim()
  s = s.replace(/[\u3000\s]+/g, '')
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  s = s.replace(/[\u3041-\u3096]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
  return s.toLowerCase()
}

export function runNormalizationTests() {
  const cases = [
    { input: 'FKT78@Gmail.com', expected: 'fkt78@gmail.com', label: '小文字化' },
    { input: 'fkt.78@gmail.com', expected: 'fkt78@gmail.com', label: 'gmail のドット除去' },
    { input: 'fkt78+shop@gmail.com', expected: 'fkt78@gmail.com', label: '+ 以降を除去' },
    { input: 'fkt78@googlemail.com', expected: 'fkt78@gmail.com', label: 'ドメイン読み替え' },
    {
      input: 'taro.suzuki@docomo.ne.jp',
      expected: 'taro.suzuki@docomo.ne.jp',
      label: 'docomo ドットを消さない',
    },
    {
      input: 'taro.suzuki@icloud.com',
      expected: 'taro.suzuki@icloud.com',
      label: 'icloud ドットを消さない',
    },
  ]
  const nameCases = [
    { inputs: ['吹田 克己', '吹田　克己', '吹田克己'], expected: '吹田克己', label: 'スペース除去' },
    { inputs: ['スイタ', 'すいた'], expected: 'スイタ', label: 'かな統一' },
  ]

  const results = []
  let allPass = true

  for (const c of cases) {
    const actual = normalizeEmail(c.input)
    const pass = actual === c.expected
    if (!pass) allPass = false
    results.push({ kind: 'email', label: c.label, input: c.input, expected: c.expected, actual, pass })
  }

  for (const c of nameCases) {
    for (const input of c.inputs) {
      const actual = normalizeName(input)
      const pass = actual === c.expected
      if (!pass) allPass = false
      results.push({ kind: 'name', label: c.label, input, expected: c.expected, actual, pass })
    }
  }

  return { results, allPass }
}

/** @param {Record<string, unknown>} a @param {Record<string, unknown>} b */
export function getMatchBetweenUsers(a, b) {
  if (a.normEmail && b.normEmail && a.normEmail === b.normEmail) {
    return { confidence: '高', reason: 'メール正規化一致' }
  }
  if (a.normName && b.normName && a.birthMonth && b.birthMonth && a.normName === b.normName && a.birthMonth === b.birthMonth) {
    return { confidence: '高', reason: '氏名＋生年月一致' }
  }
  if (a.normName && b.normName && a.normName === b.normName) {
    const birthA = a.birthMonth || ''
    const birthB = b.birthMonth || ''
    if (!birthA || !birthB || birthA !== birthB) {
      return { confidence: '中', reason: '氏名一致（生年月不一致）' }
    }
  }
  const rawA = String(a.email || '').trim().toLowerCase()
  const rawB = String(b.email || '').trim().toLowerCase()
  const atA = rawA.lastIndexOf('@')
  const atB = rawB.lastIndexOf('@')
  if (atA > 0 && atB > 0) {
    const localA = rawA.slice(0, atA)
    const localB = rawB.slice(0, atB)
    const domainA = rawA.slice(atA + 1)
    const domainB = rawB.slice(atB + 1)
    if (localA === localB && domainA !== domainB && a.normEmail !== b.normEmail) {
      return { confidence: '低', reason: 'ローカル部一致（ドメイン不一致）' }
    }
  }
  return null
}
