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

const __dirname = dirname(fileURLToPath(import.meta.url))
const requireFromFunctions = createRequire(join(__dirname, '../functions/package.json'))
const { initializeApp, cert, applicationDefault } = requireFromFunctions('firebase-admin/app')
const { getFirestore, Timestamp } = requireFromFunctions('firebase-admin/firestore')

const PROJECT_ID = 'conv-fkt7-new-app'
const DEFAULT_OUTPUT_DIR = join(homedir(), 'Desktop', 'fkt7-duplicate-check')
const OUTPUT_BASENAME = 'duplicate-check_2026-08'

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

const CONFIDENCE_RANK = { 高: 3, 中: 2, 低: 1 }

const FIREBASE_CLI_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

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

function parseArgs(argv) {
  let outputDir = process.env.FKT7_DUPLICATE_CHECK_OUTPUT || DEFAULT_OUTPUT_DIR
  let testNormalizeOnly = false
  for (const arg of argv) {
    if (arg === '--test-normalize') testNormalizeOnly = true
    else if (arg.startsWith('--output=')) outputDir = arg.slice('--output='.length)
  }
  return { outputDir, testNormalizeOnly }
}

function runNormalizationTests() {
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

class UnionFind {
  constructor(size) {
    this.parent = Array.from({ length: size }, (_, i) => i)
    this.rank = Array(size).fill(0)
  }

  find(x) {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x])
    return this.parent[x]
  }

  union(a, b) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) return
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra
    else {
      this.parent[rb] = ra
      this.rank[ra]++
    }
  }
}

/**
 * @param {Array<Record<string, unknown>>} users
 */
function detectDuplicateGroups(users) {
  const n = users.length
  const uf = new UnionFind(n)
  /** @type {Array<{ confidence: '高'|'中'|'低', reason: string }>} */
  const edgeMeta = []

  /** @param {number} i @param {number} j @param {'高'|'中'|'低'} confidence @param {string} reason */
  function link(i, j, confidence, reason) {
    uf.union(i, j)
    edgeMeta.push({ i, j, confidence, reason })
  }

  /** @type {Record<string, number[]>} */
  const emailMap = {}
  /** @type {Record<string, number[]>} */
  const nameBirthMap = {}
  /** @type {Record<string, number[]>} */
  const nameMap = {}
  /** @type {Record<string, number[]>} */
  const localPartMap = {}

  users.forEach((user, idx) => {
    const emailKey = user.normEmail
    if (emailKey) {
      if (!emailMap[emailKey]) emailMap[emailKey] = []
      emailMap[emailKey].push(idx)
    }

    const nameKey = user.normName
    if (nameKey) {
      if (!nameMap[nameKey]) nameMap[nameKey] = []
      nameMap[nameKey].push(idx)
    }

    const birth = user.birthMonth || ''
    if (nameKey && birth) {
      const key = `${nameKey}|${birth}`
      if (!nameBirthMap[key]) nameBirthMap[key] = []
      nameBirthMap[key].push(idx)
    }

    const rawEmail = (user.email || '').trim().toLowerCase()
    const at = rawEmail.lastIndexOf('@')
    if (at > 0) {
      const local = rawEmail.slice(0, at)
      if (!localPartMap[local]) localPartMap[local] = []
      localPartMap[local].push(idx)
    }
  })

  for (const indices of Object.values(emailMap)) {
    if (indices.length < 2) continue
    for (let k = 1; k < indices.length; k++) {
      link(indices[0], indices[k], '高', 'メール正規化一致')
    }
  }

  for (const indices of Object.values(nameBirthMap)) {
    if (indices.length < 2) continue
    for (let k = 1; k < indices.length; k++) {
      link(indices[0], indices[k], '高', '氏名＋生年月一致')
    }
  }

  for (const [nameKey, indices] of Object.entries(nameMap)) {
    if (indices.length < 2) continue
    const births = new Set(indices.map((i) => users[i].birthMonth || ''))
    if (births.size <= 1 && [...births][0]) continue
    for (let k = 1; k < indices.length; k++) {
      link(indices[0], indices[k], '中', '氏名一致（生年月不一致）')
    }
  }

  for (const indices of Object.values(localPartMap)) {
    if (indices.length < 2) continue
    const domains = new Set(
      indices.map((i) => {
        const email = (users[i].email || '').trim().toLowerCase()
        const at = email.lastIndexOf('@')
        return at > 0 ? email.slice(at + 1) : ''
      }),
    )
    if (domains.size < 2) continue

    const normEmails = new Set(indices.map((i) => users[i].normEmail))
    if (normEmails.size === 1) continue

    for (let k = 1; k < indices.length; k++) {
      link(indices[0], indices[k], '低', 'ローカル部一致（ドメイン不一致）')
    }
  }

  /** @type {Record<number, number[]>} */
  const components = {}
  for (let i = 0; i < n; i++) {
    const root = uf.find(i)
    if (!components[root]) components[root] = []
    components[root].push(i)
  }

  /** @type {Array<{ confidence: '高'|'中'|'低', reason: string, members: number[] }>} */
  const groups = []

  for (const members of Object.values(components)) {
    if (members.length < 2) continue

    const memberSet = new Set(members)
    let best = { confidence: /** @type {'低'} */ ('低'), reason: 'ローカル部一致（ドメイン不一致）' }

    for (const edge of edgeMeta) {
      if (!memberSet.has(edge.i) || !memberSet.has(edge.j)) continue
      if (CONFIDENCE_RANK[edge.confidence] > CONFIDENCE_RANK[best.confidence]) {
        best = { confidence: edge.confidence, reason: edge.reason }
      }
    }

    groups.push({ confidence: best.confidence, reason: best.reason, members })
  }

  groups.sort((a, b) => {
    const rankDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
    if (rankDiff !== 0) return rankDiff
    return b.members.length - a.members.length
  })

  return groups
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
