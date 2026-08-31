#!/usr/bin/env node
/**
 * 氏名・メールが空の users ドキュメント調査（読み取り専用）
 *
 * 実行方法:
 *   cd CONV-FKT7-NEW-APP
 *   node scripts/inspect-empty-users.mjs
 *
 * オプション:
 *   --output=<dir>  出力先（既定: ~/Desktop/fkt7-empty-users）
 *
 * 環境変数:
 *   FKT7_EMPTY_USERS_OUTPUT … 出力先ディレクトリ
 *
 * 認証: firebase login のリフレッシュトークン（Firestore REST API）
 * 注意: Firestore への書き込みは一切行いません。
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ID = 'conv-fkt7-new-app'
const DEFAULT_OUTPUT_DIR = join(homedir(), 'Desktop', 'fkt7-empty-users')
const OUTPUT_BASENAME = 'empty-users_2026-08'

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const KNOWN_FIELDS = new Set([
  'fullName',
  'email',
  'birthMonth',
  'attribute',
  'status',
  'createdAt',
  'memberNumber',
  'yellowCards',
  'totalSavedAmount',
  'memberGroups',
  'fcmToken',
  'fcmTokenUpdatedAt',
  'notificationSettings',
  'uid',
  'role',
])

let readCount = 0

function parseArgs(argv) {
  let outputDir = process.env.FKT7_EMPTY_USERS_OUTPUT || DEFAULT_OUTPUT_DIR
  for (const arg of argv) {
    if (arg.startsWith('--output=')) outputDir = arg.slice('--output='.length)
  }
  return { outputDir }
}

async function getFirebaseCliAccessToken() {
  const configPath = join(homedir(), '.config/configstore/firebase-tools.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const refreshToken = config?.tokens?.refresh_token
  if (!refreshToken) throw new Error('firebase login が必要です')
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
  const data = await res.json()
  return data.access_token
}

/** @param {Record<string, unknown>} field */
function decodeFirestoreValue(field) {
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
function decodeDocument(fields) {
  /** @type {Record<string, unknown>} */
  const data = {}
  if (!fields) return data
  for (const [key, value] of Object.entries(fields)) {
    data[key] = decodeFirestoreValue(value)
  }
  return data
}

function getFieldNames(fields) {
  if (!fields) return []
  return Object.keys(fields).sort()
}

function isEmptyFullName(value) {
  if (value == null) return true
  if (typeof value !== 'string') return false
  return value.trim().length === 0
}

async function fetchAllUsers(accessToken) {
  /** @type {Array<{ uid: string, rawFields: Record<string, Record<string, unknown>>, data: Record<string, unknown> }>} */
  const users = []
  let pageToken = ''

  do {
    const qs = pageToken
      ? `?pageSize=300&pageToken=${encodeURIComponent(pageToken)}`
      : '?pageSize=300'
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users${qs}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`users 読み取り失敗: ${await res.text()}`)
    readCount++
    const body = await res.json()
    for (const doc of body.documents || []) {
      const uid = doc.name.split('/').pop()
      users.push({
        uid,
        rawFields: doc.fields ?? {},
        data: decodeDocument(doc.fields),
      })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)

  return users
}

async function countSubcollection(accessToken, parentPath, collectionId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runAggregationQuery`
  const body = {
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId }],
      },
      aggregations: [{ count: {}, alias: 'doc_count' }],
    },
    parent: parentPath,
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  readCount++
  if (!res.ok) {
    const text = await res.text()
    if (text.includes('NOT_FOUND') || res.status === 404) return 0
    throw new Error(`集計失敗 (${parentPath}/${collectionId}): ${text}`)
  }
  const result = await res.json()
  const row = result.result?.aggregateFields?.doc_count
  if (!row) return 0
  if ('integerValue' in row) return Number(row.integerValue)
  return 0
}

/** @param {unknown} value */
function toJstMonth(value) {
  if (!value) return '(なし)'
  const date = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(date.getTime())) return '(不正)'
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return `${y}-${m}`
}

/** @param {unknown} value */
function toJstString(value) {
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

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function maskUid(uid) {
  return uid.slice(0, 6)
}

/** @param {Record<string, unknown>} data */
function sanitizeSample(data) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [key, value] of Object.entries(data)) {
    if (key === 'fcmToken' && value) {
      out[key] = '(あり・値は省略)'
    } else if (key === 'email' || key === 'fullName') {
      out[key] = value ? '(空または省略)' : '(なし)'
    } else if (value && typeof value === 'object') {
      out[key] = JSON.stringify(value)
    } else {
      out[key] = value == null ? '(なし)' : String(value)
    }
  }
  return out
}

async function main() {
  const { outputDir } = parseArgs(process.argv.slice(2))
  const accessToken = await getFirebaseCliAccessToken()
  console.log('Firestore 読み取り開始…')

  const allUsers = await fetchAllUsers(accessToken)
  const emptyUsers = allUsers.filter((u) => isEmptyFullName(u.data.fullName))
  const normalUsers = allUsers.filter((u) => !isEmptyFullName(u.data.fullName))

  console.log(`users 全件: ${allUsers.length}`)
  console.log(`fullName 空: ${emptyUsers.length}`)
  console.log(`正常会員: ${normalUsers.length}`)

  /** @type {Record<string, number>} */
  const fieldHistogram = {}
  /** @type {Record<string, number>} */
  const patternCounts = {}
  /** @type {Record<string, number>} */
  const emptyCreatedMonth = {}
  /** @type {Record<string, number>} */
  const normalCreatedMonth = {}

  /** @type {Array<Record<string, unknown>>} */
  const rows = []
  let withCoupons = 0
  let withMessages = 0
  /** @type {Record<string, number>} */
  const unusualFields = {}

  const patterns = []
  for (const user of emptyUsers) {
    const fieldNames = getFieldNames(user.rawFields)
    for (const name of fieldNames) {
      fieldHistogram[name] = (fieldHistogram[name] || 0) + 1
      if (!KNOWN_FIELDS.has(name)) {
        unusualFields[name] = (unusualFields[name] || 0) + 1
      }
    }
    const patternKey = fieldNames.join(';') || '(フィールドなし)'
    patternCounts[patternKey] = (patternCounts[patternKey] || 0) + 1
    if (!patterns.includes(patternKey)) patterns.push(patternKey)
  }

  for (const user of normalUsers) {
    const month = toJstMonth(user.data.createdAt)
    normalCreatedMonth[month] = (normalCreatedMonth[month] || 0) + 1
  }

  let patternNo = 0
  const patternIndex = Object.fromEntries(
    Object.keys(patternCounts)
      .sort((a, b) => patternCounts[b] - patternCounts[a])
      .map((key) => [key, ++patternNo]),
  )

  for (const user of emptyUsers) {
    const fieldNames = getFieldNames(user.rawFields)
    const patternKey = fieldNames.join(';') || '(フィールドなし)'
    const month = toJstMonth(user.data.createdAt)
    emptyCreatedMonth[month] = (emptyCreatedMonth[month] || 0) + 1

    const userParent = `projects/${PROJECT_ID}/databases/(default)/documents/users/${user.uid}`
    const chatParent = `projects/${PROJECT_ID}/databases/(default)/documents/chats/${user.uid}`

    const couponCount = await countSubcollection(accessToken, userParent, 'coupons')
    const messageCount = await countSubcollection(accessToken, chatParent, 'messages')

    if (couponCount > 0) withCoupons++
    if (messageCount > 0) withMessages++

    rows.push({
      uid: maskUid(user.uid),
      fieldNames: fieldNames.join(';'),
      fieldCount: fieldNames.length,
      createdAt: toJstString(user.data.createdAt),
      status: user.data.status ?? '',
      memberNumber: user.data.memberNumber ?? '',
      hasFcmToken: user.data.fcmToken ? 'あり' : '',
      hasNotificationSettings: user.data.notificationSettings ? 'あり' : '',
      couponCount,
      messageCount,
      pattern: patternIndex[patternKey],
    })
  }

  mkdirSync(outputDir, { recursive: true })
  const csvPath = join(outputDir, `${OUTPUT_BASENAME}.csv`)
  const summaryPath = join(outputDir, `${OUTPUT_BASENAME}_summary.md`)

  const csvHeader = [
    'uid(先頭6文字)',
    '持っている項目名',
    '項目数',
    'createdAt',
    'status',
    'memberNumber',
    'fcmTokenあり',
    'notificationSettingsあり',
    'クーポン件数',
    'メッセージ件数',
    '分類',
  ]
  const csvLines = [
    '\uFEFF' + csvHeader.join(','),
    ...rows.map((r) =>
      [
        r.uid,
        r.fieldNames,
        r.fieldCount,
        r.createdAt,
        r.status,
        r.memberNumber,
        r.hasFcmToken,
        r.hasNotificationSettings,
        r.couponCount,
        r.messageCount,
        r.pattern,
      ]
        .map(csvEscape)
        .join(','),
    ),
  ]
  writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

  const sortedHistogram = Object.entries(fieldHistogram).sort((a, b) => b[1] - a[1])
  const sortedPatterns = Object.entries(patternCounts).sort((a, b) => b[1] - a[1])
  const sortedEmptyMonths = Object.entries(emptyCreatedMonth).sort((a, b) => a[0].localeCompare(b[0]))
  const sortedNormalMonths = Object.entries(normalCreatedMonth).sort((a, b) => a[0].localeCompare(b[0]))
  const sortedUnusual = Object.entries(unusualFields).sort((a, b) => b[1] - a[1])

  const sampleDocs = emptyUsers.slice(0, 3).map((u) => ({
    uid: maskUid(u.uid),
    fields: getFieldNames(u.rawFields),
    sanitized: sanitizeSample(u.data),
  }))

  const safeToDelete = rows.filter((r) => r.couponCount === 0 && r.messageCount === 0).length
  const needsReview = rows.length - safeToDelete

  const summary = `# 空会員データ調査サマリー

作成日: 2026-08-31（スクリプト実行時）

## 概要

- users 全件: **${allUsers.length}**
- fullName 空（対象）: **${emptyUsers.length}**
- 正常会員（fullName あり）: **${normalUsers.length}**
- Firestore 読み取り回数（API 呼び出し）: **${readCount}**

## 項目名ヒストグラム（対象 ${emptyUsers.length} 件）

| 項目名 | 件数 |
|---|---:|
${sortedHistogram.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

## 項目セットによる分類

| パターン | 件数 | 項目名 |
|---:|---:|---|
${sortedPatterns
  .map(([key, count], i) => `| ${i + 1} | ${count} | ${key || '(フィールドなし)'} |`)
  .join('\n')}

## createdAt 月別分布

### 対象（fullName 空）${emptyUsers.length} 件

| 年月 | 件数 |
|---|---:|
${sortedEmptyMonths.map(([m, c]) => `| ${m} | ${c} |`).join('\n')}

### 正常会員 ${normalUsers.length} 件

| 年月 | 件数 |
|---|---:|
${sortedNormalMonths.map(([m, c]) => `| ${m} | ${c} |`).join('\n')}

## 見慣れない項目名

${sortedUnusual.length === 0 ? 'なし' : sortedUnusual.map(([k, v]) => `- \`${k}\`: ${v}件`).join('\n')}

## クーポン・チャット

| 項目 | 件数 |
|---|---:|
| クーポンを1件以上持つ | **${withCoupons}** |
| メッセージを1件以上持つ | **${withMessages}** |
| 両方0（削除候補として安全そう） | **${safeToDelete}** |
| 要確認（クーポンまたはチャットあり） | **${needsReview}** |

## サンプル3件（コンソール相当・機微情報は省略）

${sampleDocs
  .map(
    (s, i) => `### サンプル ${i + 1}（uid: ${s.uid}…）

項目名: ${s.fields.join(', ') || '(なし)'}

\`\`\`json
${JSON.stringify(s.sanitized, null, 2)}
\`\`\``,
  )
  .join('\n\n')}

> 削除の実施は行っていません。判断材料のみです。
`

  writeFileSync(summaryPath, summary, 'utf8')

  console.log('\n=== 結果 ===')
  console.log(`対象: ${emptyUsers.length} 件`)
  console.log(`クーポンあり: ${withCoupons} / メッセージあり: ${withMessages}`)
  console.log(`削除候補（両方0）: ${safeToDelete} / 要確認: ${needsReview}`)
  console.log(`総読み取り API 呼び出し: ${readCount}`)
  console.log(`CSV: ${csvPath}`)
  console.log(`サマリー: ${summaryPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
