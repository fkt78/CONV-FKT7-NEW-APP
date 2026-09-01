import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const PROJECT_ID = 'conv-fkt7-new-app'

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

/** @type {number} */
let apiCallCount = 0

export function getApiCallCount() {
  return apiCallCount
}

export function resetApiCallCount() {
  apiCallCount = 0
}

export async function getFirebaseCliAccessToken() {
  const configPath = join(homedir(), '.config/configstore/firebase-tools.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const refreshToken = config?.tokens?.refresh_token
  if (!refreshToken) throw new Error('firebase login が必要です')
  apiCallCount++
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FIREBASE_CLI_CLIENT_ID,
      client_secret: FIREBASE_CLI_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`トークン更新失敗: ${await res.text()}`)
  return (await res.json()).access_token
}

/** @param {Record<string, unknown>} field */
export function decodeFirestoreValue(field) {
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return field.doubleValue
  if ('booleanValue' in field) return field.booleanValue
  if ('nullValue' in field) return null
  if ('timestampValue' in field) return new Date(String(field.timestampValue))
  if ('mapValue' in field) {
    const fields = field.mapValue?.fields ?? {}
    /** @type {Record<string, unknown>} */
    const obj = {}
    for (const [k, v] of Object.entries(fields)) obj[k] = decodeFirestoreValue(v)
    return obj
  }
  if ('arrayValue' in field) {
    return (field.arrayValue?.values ?? []).map((v) => decodeFirestoreValue(v))
  }
  return null
}

/** @param {Record<string, Record<string, unknown>> | undefined} fields */
export function decodeDocument(fields) {
  /** @type {Record<string, unknown>} */
  const data = {}
  if (!fields) return data
  for (const [key, value] of Object.entries(fields)) {
    data[key] = decodeFirestoreValue(value)
  }
  return data
}

/**
 * @param {string} accessToken
 * @param {string} collectionId
 */
export async function fetchCollection(accessToken, collectionId) {
  /** @type {Array<{ id: string, rawFields: Record<string, Record<string, unknown>>, data: Record<string, unknown> }>} */
  const docs = []
  let pageToken = ''

  do {
    const qs = pageToken
      ? `?pageSize=300&pageToken=${encodeURIComponent(pageToken)}`
      : '?pageSize=300'
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionId}${qs}`
    apiCallCount++
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`${collectionId} 読み取り失敗: ${await res.text()}`)
    const body = await res.json()
    for (const doc of body.documents || []) {
      const id = doc.name.split('/').pop()
      docs.push({ id, rawFields: doc.fields ?? {}, data: decodeDocument(doc.fields) })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)

  return docs
}

/** @param {unknown} value */
export function toJstString(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const get = (type) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/** @param {unknown} value */
export function toDate(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

/** @param {string} value */
export function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** @param {string} name */
export function maskName(name) {
  if (!name) return '（不明）'
  const chars = [...name]
  if (chars.length <= 2) return `${chars[0] ?? ''}○`
  return `${chars[0]}${'○'.repeat(Math.max(1, chars.length - 2))}${chars[chars.length - 1]}`
}

/** @param {string} email */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}
