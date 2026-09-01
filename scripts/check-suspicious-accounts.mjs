#!/usr/bin/env node
/**
 * ブラックリスト実態・出戻り・複数アカウントの一括点検（読み取り専用）
 *
 * 実行方法:
 *   cd CONV-FKT7-NEW-APP
 *   node scripts/check-suspicious-accounts.mjs
 *
 * オプション:
 *   --output=<dir>       出力先（既定: ~/Desktop/fkt7-account-audit）
 *   --recent-days=<n>    直近N日（既定: 60）
 *
 * 環境変数:
 *   FKT7_ACCOUNT_AUDIT_OUTPUT
 *   FKT7_ACCOUNT_AUDIT_RECENT_DAYS
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { normalizeEmail, normalizeName, runNormalizationTests, CONFIDENCE_RANK } from './lib/normalize.mjs'
import {
  fetchCollection,
  getFirebaseCliAccessToken,
  getApiCallCount,
  resetApiCallCount,
  toJstString,
  toDate,
  csvEscape,
  maskName,
  maskEmail,
} from './lib/firestore-read.mjs'
import {
  detectDuplicateGroups,
  detectCrossMatches,
  analyzeDuplicateGroup,
} from './lib/duplicate-detection.mjs'

const DEFAULT_OUTPUT_DIR = join(homedir(), 'Desktop', 'fkt7-account-audit')
const DEFAULT_RECENT_DAYS = 60

function parseArgs(argv) {
  let outputDir = process.env.FKT7_ACCOUNT_AUDIT_OUTPUT || DEFAULT_OUTPUT_DIR
  let recentDays = Number(process.env.FKT7_ACCOUNT_AUDIT_RECENT_DAYS || DEFAULT_RECENT_DAYS)
  for (const arg of argv) {
    if (arg.startsWith('--output=')) outputDir = arg.slice('--output='.length)
    else if (arg.startsWith('--recent-days=')) recentDays = Number(arg.slice('--recent-days='.length))
  }
  return { outputDir, recentDays }
}

function enrichUser(raw) {
  const fullName = String(raw.fullName || '').trim()
  const email = String(raw.email || '').trim()
  return {
    uid: raw.uid,
    fullName,
    email,
    birthMonth: String(raw.birthMonth || '').trim(),
    status: String(raw.status || 'active'),
    memberNumber: raw.memberNumber ?? null,
    yellowCards: Number(raw.yellowCards ?? 0),
    totalSavedAmount: Number(raw.totalSavedAmount ?? 0),
    createdAt: raw.createdAt ?? null,
    role: String(raw.role || ''),
    normEmail: normalizeEmail(email),
    normName: normalizeName(fullName),
  }
}

function blacklistRegistrationStatus(user, blacklistDocs) {
  const fn = user.fullName
  const em = user.email
  let nameHit = false
  let emailHit = false
  for (const bl of blacklistDocs) {
    const blName = String(bl.data.fullName || '').trim()
    const blEmail = String(bl.data.email || '').trim()
    if (fn && blName && fn === blName) nameHit = true
    if (em && blEmail && em === blEmail) emailHit = true
  }
  if (nameHit && emailHit) return '登録済み（氏名・メール完全一致）'
  if (nameHit) return '登録済み（氏名完全一致）'
  if (emailHit) return '登録済み（メール完全一致）'
  return '未登録'
}

function memberNo(n) {
  return n != null ? `#${String(n).padStart(5, '0')}` : ''
}

function statusLabel(s) {
  return s === 'blacklisted' ? '停止中' : '有効'
}

function writeCsv(path, header, rows) {
  writeFileSync(path, '\uFEFF' + [header.join(','), ...rows].join('\n'), 'utf8')
}

async function main() {
  const { outputDir, recentDays } = parseArgs(process.argv.slice(2))

  const testResult = runNormalizationTests()
  console.log('=== 正規化テスト ===')
  for (const r of testResult.results) {
    console.log(`${r.pass ? 'OK' : 'NG'} [${r.kind}] ${r.label}: ${JSON.stringify(r.input)} → ${r.actual}`)
  }
  if (!testResult.allPass) {
    console.error('正規化テスト失敗。中止します。')
    process.exit(1)
  }
  console.log('正規化テスト: 全件 OK\n')

  resetApiCallCount()
  const accessToken = await getFirebaseCliAccessToken()

  const [userDocs, blacklistDocs] = await Promise.all([
    fetchCollection(accessToken, 'users'),
    fetchCollection(accessToken, 'blacklist'),
  ])

  const allUsers = userDocs.map((d) => enrichUser({ uid: d.id, ...d.data }))
  const members = allUsers.filter((u) => u.role !== 'admin')
  const blacklistedUsers = members.filter((u) => u.status === 'blacklisted')
  const activeUsers = members.filter((u) => u.status === 'active')

  // 4-1 blacklist analysis
  const blFieldHistogram = {}
  const blEmptyName = []
  const blEmptyEmail = []
  for (const bl of blacklistDocs) {
    const names = Object.keys(bl.rawFields)
    for (const n of names) blFieldHistogram[n] = (blFieldHistogram[n] || 0) + 1
    const fn = String(bl.data.fullName || '').trim()
    const em = String(bl.data.email || '').trim()
    if (!fn) blEmptyName.push(bl.id)
    if (!em) blEmptyEmail.push(bl.id)
  }

  // 4-3 blacklist registration status for blacklisted users
  const blStatusRows = []
  let blRegistered = 0
  let blNotRegistered = 0
  for (const u of blacklistedUsers) {
    const reg = blacklistRegistrationStatus(u, blacklistDocs)
    if (reg.startsWith('登録済み')) blRegistered++
    else blNotRegistered++
    blStatusRows.push(
      [
        u.uid.slice(0, 6),
        memberNo(u.memberNumber),
        u.fullName,
        u.email,
        u.birthMonth,
        u.yellowCards,
        toJstString(u.createdAt),
        u.totalSavedAmount,
        reg,
      ]
        .map(csvEscape)
        .join(','),
    )
  }

  // 4-4 returnee detection
  const returneeSources = [
    ...blacklistedUsers.map((u) => ({ ...u, sourceType: 'users.blacklisted' })),
    ...blacklistDocs.map((bl) =>
      enrichUser({
        uid: `bl:${bl.id}`,
        fullName: bl.data.fullName,
        email: bl.data.email,
        birthMonth: bl.data.birthMonth,
        status: 'blacklist-collection',
        memberNumber: null,
        yellowCards: 0,
        totalSavedAmount: 0,
        createdAt: bl.data.createdAt,
        role: '',
      }),
    ).map((u) => ({ ...u, sourceType: 'blacklist.collection' })),
  ]

  const returneeGroups = detectCrossMatches(returneeSources, activeUsers)
  const returneeRows = []
  const returneeConfidence = { 高: 0, 中: 0, 低: 0 }
  returneeGroups.forEach((group, gi) => {
    returneeConfidence[group.confidence]++
    for (const idx of group.members) {
      const node = idx < returneeSources.length ? returneeSources[idx] : activeUsers[idx - returneeSources.length]
      const side = idx < returneeSources.length ? '照合元' : 'active会員'
      returneeRows.push(
        [
          gi + 1,
          group.confidence,
          group.reason,
          side,
          node.sourceType || 'users.active',
          node.uid.slice(0, 6),
          memberNo(node.memberNumber),
          node.fullName,
          node.email,
          node.birthMonth,
          statusLabel(node.status),
          toJstString(node.createdAt),
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  })

  // 4-5 duplicate detection
  const duplicateGroups = detectDuplicateGroups(members)
  const duplicateRows = []
  const dupConfidence = { 高: { groups: 0, accounts: 0 }, 中: { groups: 0, accounts: 0 }, 低: { groups: 0, accounts: 0 } }
  duplicateGroups.forEach((group, gi) => {
    dupConfidence[group.confidence].groups++
    dupConfidence[group.confidence].accounts += group.members.length
    const groupMembers = group.members.map((i) => members[i])
    const analysis = analyzeDuplicateGroup(groupMembers, toDate)
    for (const idx of group.members) {
      const u = members[idx]
      duplicateRows.push(
        [
          gi + 1,
          group.confidence,
          group.reason,
          memberNo(u.memberNumber),
          u.fullName,
          u.email,
          u.normEmail,
          u.birthMonth,
          toJstString(u.createdAt),
          statusLabel(u.status),
          u.yellowCards,
          u.totalSavedAmount,
          analysis.regIntervalDays,
          analysis.sameDayReg,
          analysis.consecutiveMemberNo,
          analysis.bothUsed,
        ]
          .map(csvEscape)
          .join(','),
      )
    }
  })

  // 4-6 recent suspects
  const now = Date.now()
  const recentCutoff = now - recentDays * 24 * 60 * 60 * 1000
  const isRecent = (u) => {
    const d = toDate(u.createdAt)
    return d && d.getTime() >= recentCutoff
  }

  /** @type {Record<string, boolean>} */
  const suspectUidMap = {}
  for (const g of returneeGroups) {
    for (const idx of g.members) {
      if (idx >= returneeSources.length) {
        const u = activeUsers[idx - returneeSources.length]
        if (isRecent(u)) suspectUidMap[u.uid] = true
      }
    }
  }
  for (const g of duplicateGroups) {
    const hasRecent = g.members.some((i) => isRecent(members[i]))
    if (hasRecent) g.members.forEach((i) => { suspectUidMap[members[i].uid] = true })
  }

  const recentRows = []
  for (const uid of Object.keys(suspectUidMap)) {
    const u = members.find((m) => m.uid === uid)
    if (!u) continue
    const inReturnee = returneeGroups.some((g) =>
      g.members.some((idx) => idx >= returneeSources.length && activeUsers[idx - returneeSources.length].uid === uid),
    )
    const inDup = duplicateGroups.find((g) => g.members.some((i) => members[i].uid === uid))
    recentRows.push(
      [
        u.uid.slice(0, 6),
        memberNo(u.memberNumber),
        u.fullName,
        u.email,
        u.birthMonth,
        toJstString(u.createdAt),
        statusLabel(u.status),
        inReturnee ? '出戻り疑い' : '',
        inDup ? `複数アカウント疑い(${inDup.confidence})` : '',
        inDup?.reason ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
  }

  mkdirSync(outputDir, { recursive: true })

  writeCsv(
    join(outputDir, 'blacklist-status_2026-08.csv'),
    [
      'uid(先頭6文字)',
      '会員番号',
      '氏名',
      'メール',
      '生年月',
      'イエローカード',
      '登録日',
      '累計お得額',
      'blacklist登録状況',
    ],
    blStatusRows,
  )

  writeCsv(
    join(outputDir, 'returnee-suspects_2026-08.csv'),
    [
      'グループ番号',
      '確度',
      '判定根拠',
      '側',
      'ソース種別',
      'uid(先頭6文字)',
      '会員番号',
      '氏名',
      'メール',
      '生年月',
      'ステータス',
      '登録日',
    ],
    returneeRows,
  )

  writeCsv(
    join(outputDir, 'duplicate-accounts_2026-08.csv'),
    [
      'グループ番号',
      '確度',
      '判定根拠',
      '会員番号',
      '氏名',
      'メール',
      '正規化後メール',
      '生年月',
      '登録日',
      'ステータス',
      'イエローカード',
      '累計お得額',
      '登録間隔(日)',
      '同日登録',
      '会員番号連番',
      '両方使用(累計>0)',
    ],
    duplicateRows,
  )

  writeCsv(
    join(outputDir, 'recent-suspects_2026-08.csv'),
    [
      'uid(先頭6文字)',
      '会員番号',
      '氏名',
      'メール',
      '生年月',
      '登録日',
      'ステータス',
      '出戻り疑い',
      '複数アカウント疑い',
      '判定根拠',
    ],
    recentRows,
  )

  const prevGroups = 21
  const groupDelta = duplicateGroups.length - prevGroups

  const topReturnee = returneeGroups.slice(0, 5).map((g, i) => {
    const nodes = g.members.map((idx) =>
      idx < returneeSources.length ? returneeSources[idx] : activeUsers[idx - returneeSources.length],
    )
    return {
      rank: i + 1,
      confidence: g.confidence,
      reason: g.reason,
      nodes: nodes.map((n) => ({
        side: n.sourceType || 'users.active',
        name: maskName(n.fullName),
        email: maskEmail(n.email),
        status: statusLabel(n.status),
      })),
    }
  })

  const summary = `# アカウント監査サマリー

作成日: 2026-09-01（スクリプト実行時）

## ⚠️ この調査の限界

**「過去にブラックだった」という履歴は、システム上どこにも残っていません。**

- 分かるのは **現在** \`status === 'blacklisted'\` の人だけ
- イエローカードを取り消して \`active\` に戻した人は、**ブラックだった事実が消えている**
- \`blacklist\` コレクションだけが唯一の履歴になり得るが、**自動追加の仕組みが無い**

**この調査で「出戻りなし」となっても、それは「見つからなかった」のであって「いない」ではありません。**

---

## 1. blacklist コレクション

| 項目 | 値 |
|---|---:|
| 件数 | **${blacklistDocs.length}** |
| fullName 空 | **${blEmptyName.length}** |
| email 空 | **${blEmptyEmail.length}** |

### 項目名ヒストグラム

| 項目名 | 件数 |
|---|---:|
${Object.entries(blFieldHistogram)
  .sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `| ${k} | ${v} |`)
  .join('\n') || '| (ドキュメントなし) | — |'}

---

## 2. 現在ブラックリスト状態の会員（users）

| 項目 | 件数 |
|---|---:|
| status=blacklisted | **${blacklistedUsers.length}** |
| blacklist に登録済み | **${blRegistered}** |
| **blacklist 未登録（再登録可能）** | **${blNotRegistered}** |

---

## 3. 出戻り疑い（blacklisted/blacklist → active）

| 確度 | グループ数 |
|---|---:|
| 高 | ${returneeConfidence['高']} |
| 中 | ${returneeConfidence['中']} |
| 低 | ${returneeConfidence['低']} |
| **合計** | **${returneeGroups.length}** |

${topReturnee.length === 0 ? '該当なし' : topReturnee.map((g) => `### ${g.rank}. 確度${g.confidence} / ${g.reason}\n${g.nodes.map((n) => `- [${n.side}] ${n.name} / ${n.email}（${n.status}）`).join('\n')}`).join('\n\n')}

---

## 4. 複数アカウント疑い（全会員・前回比較）

| 確度 | グループ数 | アカウント数 |
|---|---:|---:|
| 高 | ${dupConfidence['高'].groups} | ${dupConfidence['高'].accounts} |
| 中 | ${dupConfidence['中'].groups} | ${dupConfidence['中'].accounts} |
| 低 | ${dupConfidence['低'].groups} | ${dupConfidence['低'].accounts} |
| **合計** | **${duplicateGroups.length}** | **${duplicateGroups.reduce((s, g) => s + g.members.length, 0)}** |

- 前回（2026-08）: **21グループ / 45アカウント**
- 今回との差: **${groupDelta >= 0 ? '+' : ''}${groupDelta} グループ**

---

## 5. 直近${recentDays}日の疑い

| 項目 | 件数 |
|---|---:|
| 該当会員 | **${recentRows.length}** |

---

## 6. 読み取り

- Firestore API 呼び出し回数: **${getApiCallCount()}**

> 判定はすべて「疑い」です。削除・ブラックリスト追加等の判断はオーナーが行ってください。
`

  writeFileSync(join(outputDir, 'account-audit_2026-08_summary.md'), summary, 'utf8')

  console.log('\n=== 結果 ===')
  console.log(`blacklist コレクション: ${blacklistDocs.length} 件`)
  console.log(`blacklisted 会員: ${blacklistedUsers.length} 件（未登録: ${blNotRegistered}）`)
  console.log(`出戻り疑い: ${returneeGroups.length} グループ`)
  console.log(`複数アカウント疑い: ${duplicateGroups.length} グループ（前回比 ${groupDelta >= 0 ? '+' : ''}${groupDelta}）`)
  console.log(`直近${recentDays}日の疑い: ${recentRows.length} 件`)
  console.log(`API 呼び出し: ${getApiCallCount()}`)
  console.log(`出力: ${outputDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
