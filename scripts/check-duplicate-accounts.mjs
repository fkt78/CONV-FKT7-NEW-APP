#!/usr/bin/env node
/**
 * 重複アカウント疑いの洗い出し（読み取り専用）
 *
 * 実行方法:
 *   cd CONV-FKT7-NEW-APP
 *   node scripts/check-duplicate-accounts.mjs
 *
 * オプション:
 *   --output=<dir>   出力先（既定: ~/Desktop/fkt7-duplicate-check）
 *   --test-normalize 正規化テストのみ実行（Firestore 接続なし）
 *
 * 環境変数:
 *   FKT7_DUPLICATE_CHECK_OUTPUT … 出力先ディレクトリ
 *   GOOGLE_APPLICATION_CREDENTIALS … サービスアカウント鍵（任意）
 *
 * 認証（この順）:
 *   1. GOOGLE_APPLICATION_CREDENTIALS（サービスアカウント）
 *   2. Application Default Credentials
 *   3. firebase login のリフレッシュトークン（Firestore REST API 読み取り）
 *
 * 注意: Firestore への書き込みは一切行いません。
 */

import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeEmail, normalizeName, runNormalizationTests, CONFIDENCE_RANK } from './lib/normalize.mjs'
import { detectDuplicateGroups } from './lib/duplicate-detection.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const requireFromFunctions = createRequire(join(__dirname, '../functions/package.json'))
const { initializeApp, cert, applicationDefault } = requireFromFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore')

const PROJECT_ID = 'conv-fkt7-new-app'
const DEFAULT_OUTPUT_DIR = join(homedir(), 'Desktop', 'fkt7-duplicate-check')
const OUTPUT_BASENAME = 'duplicate-check_2026-08'

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

function parseArgs(argv) {
  let outputDir = process.env.FKT7_DUPLICATE_CHECK_OUTPUT || DEFAULT_OUTPUT_DIR
  let testNormalizeOnly = false
  for (const arg of argv) {
    if (arg === '--test-normalize') testNormalizeOnly = true
    else if (arg.startsWith('--output=')) outputDir = arg.slice('--output='.length)
  }
  return { outputDir, testNormalizeOnly }
}

async function getFirebaseCliAccessToken() {
  const configPath = join(homedir(), '.config/configstore/firebase-tools.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const refreshToken = config?.tokens?.refresh_token
  if (!refreshToken) {
    throw new Error('firebase login が必要です。`firebase login` を実行してください。')
  }

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

  if (!res.ok) {
    throw new Error(`firebase CLI トークン更新失敗: ${await res.text()}`)
  }

  const data = await res.json()
  return data.access_token
}

function hasFirebaseCliRefreshToken() {
  try {
    const configPath = join(homedir(), '.config/configstore/firebase-tools.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    return Boolean(config?.tokens?.refresh_token)
  } catch {
    return false
  }
}

async function initFirebaseAdmin() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    initializeApp({
      credential: cert(JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'))),
      projectId: PROJECT_ID,
    })
    return 'service-account'
  }

  try {
    initializeApp({
      credential: applicationDefault(),
      projectId: PROJECT_ID,
    })
    return 'application-default'
  } catch {
    return null
  }
}

/** @param {Record<string, unknown>} field */
function decodeFirestoreValue(field) {
  if ('stringValue' in field) return field.stringValue
  if ('integerValue' in field) return Number(field.integerValue)
  if ('doubleValue' in field) return field.doubleValue
  if ('booleanValue' in field) return field.booleanValue
  if ('nullValue' in field) return null
  if ('timestampValue' in field) return new Date(String(field.timestampValue))
  return null
}

/** @param {Record<string, Record<string, unknown>> | undefined} fields */
function decodeFirestoreDocument(fields) {
  /** @type {Record<string, unknown>} */
  const data = {}
  if (!fields) return data
  for (const [key, value] of Object.entries(fields)) {
    data[key] = decodeFirestoreValue(value)
  }
  return data
}

async function fetchUsersViaRest(accessToken) {
  /** @type {Array<Record<string, unknown>>} */
  const users = []
  let pageToken = ''

  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users`,
    )
    const qs = pageToken
      ? `?pageSize=300&pageToken=${encodeURIComponent(pageToken)}`
      : '?pageSize=300'
    const res = await fetch(`${url.origin}${url.pathname}${qs}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      throw new Error(`Firestore REST 読み取り失敗 (${res.status}): ${await res.text()}`)
    }

    const body = await res.json()
    for (const doc of body.documents || []) {
      const uid = doc.name.split('/').pop()
      users.push({ uid, ...decodeFirestoreDocument(doc.fields) })
    }
    pageToken = body.nextPageToken || ''
  } while (pageToken)

  return users
}

async function fetchUsersViaAdmin() {
  const db = getFirestore()
  const snapshot = await db.collection('users').get()
  return {
    readCount: snapshot.size,
    users: snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() })),
  }
}

async function fetchAllUsers() {
  const adminAuth = await initFirebaseAdmin()
  if (adminAuth) {
    try {
      const result = await fetchUsersViaAdmin()
      return { ...result, authMethod: adminAuth }
    } catch (err) {
      if (!hasFirebaseCliRefreshToken()) throw err
      console.warn('firebase-admin での接続に失敗。firebase login トークンで REST API 読み取りに切り替えます。')
    }
  }

  const accessToken = await getFirebaseCliAccessToken()
  const users = await fetchUsersViaRest(accessToken)
  return { readCount: users.length, users, authMethod: 'firebase-cli-rest' }
}

/** @param {unknown} value */
function toJstString(value) {
  if (!value) return ''
  let date
  if (value instanceof Timestamp) date = value.toDate()
  else if (value instanceof Date) date = value
  else if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
    date = value.toDate()
  } else if (typeof value === 'string' || typeof value === 'number') {
    date = new Date(value)
  } else return ''

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

/** @param {string} value */
function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** @param {string} name */
function maskName(name) {
  if (!name) return '（不明）'
  const chars = [...name]
  if (chars.length <= 2) return `${chars[0] ?? ''}○`
  return `${chars[0]}${'○'.repeat(Math.max(1, chars.length - 2))}${chars[chars.length - 1]}`
}

/** @param {string} email */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '***'
  const [local, domain] = email.split('@')
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}***@${domain}`
}

function getEmailDomain(email) {
  const at = (email || '').lastIndexOf('@')
  return at > 0 ? email.slice(at + 1).toLowerCase() : '(不明)'
}

function isCarrierDomain(domain) {
  return /^(docomo\.ne\.jp|ezweb\.ne\.jp|au\.com|softbank\.ne\.jp|i\.softbank\.jp)$/.test(domain)
}

async function main() {
  const { outputDir, testNormalizeOnly } = parseArgs(process.argv.slice(2))

  const testResult = runNormalizationTests()
  console.log('=== 正規化テスト ===')
  for (const r of testResult.results) {
    console.log(`${r.pass ? 'OK' : 'NG'} [${r.kind}] ${r.label}: ${JSON.stringify(r.input)} → ${r.actual}`)
  }
  if (!testResult.allPass) {
    console.error('正規化テストに失敗しました。Firestore 読み取りを中止します。')
    process.exit(1)
  }
  console.log('正規化テスト: 全件 OK\n')

  if (testNormalizeOnly) return

  const { readCount, users: rawUsers, authMethod } = await fetchAllUsers()
  console.log(`認証方法: ${authMethod}`)
  console.log(`Firestore 読み取り件数: ${readCount} 件`)

  /** @type {Array<Record<string, unknown>>} */
  const allUsers = rawUsers.map((data) => ({
    uid: data.uid,
    email: data.email || '',
    fullName: data.fullName || '',
    birthMonth: data.birthMonth || '',
    createdAt: data.createdAt ?? null,
    status: data.status || '',
    memberNumber: data.memberNumber ?? null,
    yellowCards: data.yellowCards ?? 0,
    totalSavedAmount: data.totalSavedAmount ?? 0,
    role: data.role || '',
  }))

  const members = allUsers.filter((u) => u.role !== 'admin')
  const users = members.map((u) => ({
    ...u,
    normEmail: normalizeEmail(String(u.email)),
    normName: normalizeName(String(u.fullName)),
  }))

  const groups = detectDuplicateGroups(users)

  mkdirSync(outputDir, { recursive: true })
  const csvPath = join(outputDir, `${OUTPUT_BASENAME}.csv`)
  const summaryPath = join(outputDir, `${OUTPUT_BASENAME}_summary.md`)

  const csvLines = [
    '\uFEFF' +
      [
        'グループ番号',
        '確度',
        '判定根拠',
        '会員番号',
        '氏名',
        'メールアドレス',
        '正規化後メール',
        '生年月',
        '登録日',
        'ステータス',
        'イエローカード',
        '累計お得額',
      ].join(','),
  ]

  groups.forEach((group, groupIndex) => {
    const groupNo = groupIndex + 1
    const sortedMembers = [...group.members].sort((a, b) => {
      const ma = users[a].memberNumber
      const mb = users[b].memberNumber
      if (ma == null && mb == null) return 0
      if (ma == null) return 1
      if (mb == null) return -1
      return Number(ma) - Number(mb)
    })

    for (const idx of sortedMembers) {
      const u = users[idx]
      const memberNo =
        u.memberNumber != null ? `#${String(u.memberNumber).padStart(5, '0')}` : ''
      const statusLabel = u.status === 'blacklisted' ? '停止中' : '有効'
      csvLines.push(
        [
          groupNo,
          group.confidence,
          group.reason,
          memberNo,
          u.fullName,
          u.email,
          u.normEmail,
          u.birthMonth,
          toJstString(u.createdAt),
          statusLabel,
          u.yellowCards,
          u.totalSavedAmount,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  })

  writeFileSync(csvPath, csvLines.join('\n'), 'utf8')

  const confidenceStats = { 高: { groups: 0, accounts: 0 }, 中: { groups: 0, accounts: 0 }, 低: { groups: 0, accounts: 0 } }
  for (const g of groups) {
    confidenceStats[g.confidence].groups++
    confidenceStats[g.confidence].accounts += g.members.length
  }

  const duplicateAccountIds = new Set(groups.flatMap((g) => g.members))
  /** @type {Record<string, number>} */
  const domainCounts = {}
  let gmailCount = 0
  let carrierCount = 0
  let otherCount = 0

  for (const u of users) {
    const domain = getEmailDomain(String(u.email))
    domainCounts[domain] = (domainCounts[domain] || 0) + 1
    if (domain === 'gmail.com' || domain === 'googlemail.com') gmailCount++
    else if (isCarrierDomain(domain)) carrierCount++
    else otherCount++
  }

  const topGroups = groups.slice(0, 10).map((g, i) => {
    const members = g.members.map((idx) => users[idx])
    return {
      rank: i + 1,
      confidence: g.confidence,
      reason: g.reason,
      count: members.length,
      members: members.map((m) => ({
        name: maskName(String(m.fullName)),
        email: maskEmail(String(m.email)),
        memberNumber: m.memberNumber != null ? `#${String(m.memberNumber).padStart(5, '0')}` : '-',
        status: m.status === 'blacklisted' ? '停止中' : '有効',
      })),
    }
  })

  const topDomains = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)

  const summary = `# 重複アカウント疑い 調査サマリー

作成日: 2026-08-31（スクリプト実行時）

## 概要

- 会員総数（admin 除外）: **${users.length}**
- Firestore 読み取り件数（users 全件）: **${readCount}**
- 疑いグループ総数: **${groups.length}**
- 疑い該当アカウント数（重複カウント）: **${duplicateAccountIds.size}**

## 確度別

| 確度 | グループ数 | 該当アカウント数 |
|---|---:|---:|
| 高 | ${confidenceStats['高'].groups} | ${confidenceStats['高'].accounts} |
| 中 | ${confidenceStats['中'].groups} | ${confidenceStats['中'].accounts} |
| 低 | ${confidenceStats['低'].groups} | ${confidenceStats['低'].accounts} |

## 上位10グループ（伏せ字）

${topGroups.length === 0 ? '該当グループなし' : topGroups
  .map(
    (g) => `### ${g.rank}. 確度${g.confidence} / ${g.reason}（${g.count}件）
${g.members.map((m) => `- ${m.memberNumber} ${m.name} / ${m.email}（${m.status}）`).join('\n')}`,
  )
  .join('\n\n')}

## ドメイン別件数（上位10）

| ドメイン | 件数 |
|---|---:|
${topDomains.map(([d, c]) => `| ${d} | ${c} |`).join('\n')}

## メール種別比率（admin 除外会員）

- Gmail（gmail.com / googlemail.com）: **${gmailCount}**（${users.length ? ((gmailCount / users.length) * 100).toFixed(1) : '0.0'}%）
- キャリアメール（docomo/au/softbank 系）: **${carrierCount}**（${users.length ? ((carrierCount / users.length) * 100).toFixed(1) : '0.0'}%）
- その他: **${otherCount}**（${users.length ? ((otherCount / users.length) * 100).toFixed(1) : '0.0'}%）

> 判定は「疑い」であり確定ではありません。オーナーの目視確認用です。
`

  writeFileSync(summaryPath, summary, 'utf8')

  console.log('\n=== 結果 ===')
  console.log(`会員総数（admin 除外）: ${users.length}`)
  console.log(`疑いグループ: ${groups.length}`)
  console.log(`  高: ${confidenceStats['高'].groups} グループ / ${confidenceStats['高'].accounts} アカウント`)
  console.log(`  中: ${confidenceStats['中'].groups} グループ / ${confidenceStats['中'].accounts} アカウント`)
  console.log(`  低: ${confidenceStats['低'].groups} グループ / ${confidenceStats['低'].accounts} アカウント`)
  console.log(`CSV: ${csvPath}`)
  console.log(`サマリー: ${summaryPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
