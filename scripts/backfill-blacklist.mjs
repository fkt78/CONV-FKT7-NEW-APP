#!/usr/bin/env node
/**
 * 既存 blacklisted 会員を blacklist コレクションへバックフィルする。
 * 既定は dry-run。--apply のときのみ書き込む。
 */
import { normalizeEmail, normalizeName } from './lib/normalize.mjs'
import {
  PROJECT_ID,
  fetchCollection,
  getFirebaseCliAccessToken,
  maskEmail,
  maskName,
} from './lib/firestore-read.mjs'

const APPLY = process.argv.includes('--apply')

/** @param {unknown} value */
function encodeFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) }
    return { doubleValue: value }
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  throw new Error(`Unsupported value type: ${typeof value}`)
}

/** @param {Record<string, unknown>} data */
function encodeDocumentFields(data) {
  /** @type {Record<string, unknown>} */
  const fields = {}
  for (const [key, value] of Object.entries(data)) {
    fields[key] = encodeFirestoreValue(value)
  }
  return fields
}

/**
 * @param {string} accessToken
 * @param {string} uid
 * @param {Record<string, unknown>} data
 */
async function createBlacklistDoc(accessToken, uid, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/blacklist?documentId=${encodeURIComponent(uid)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: encodeDocumentFields(data) }),
  })
  if (!res.ok) {
    throw new Error(`blacklist/${uid} 書き込み失敗: ${await res.text()}`)
  }
}

function hasBothNameAndEmail(user) {
  const fullName = typeof user.fullName === 'string' ? user.fullName.trim() : ''
  const email = typeof user.email === 'string' ? user.email.trim() : ''
  return fullName.length > 0 && email.length > 0
}

async function main() {
  console.log(APPLY ? '=== バックフィル実行（--apply）===' : '=== バックフィル dry-run ====')

  const accessToken = await getFirebaseCliAccessToken()
  const [users, blacklistDocs] = await Promise.all([
    fetchCollection(accessToken, 'users'),
    fetchCollection(accessToken, 'blacklist'),
  ])

  const existingBlacklistIds = new Set(blacklistDocs.map((d) => d.id))

  let excludedEmpty = 0
  let excludedAdmin = 0
  let excludedNotBlacklisted = 0
  /** @type {Array<{ uid: string, memberNumber: unknown, fullName: string, email: string }>} */
  const targets = []

  for (const { id, data } of users) {
    if (data.role === 'admin') {
      excludedAdmin++
      continue
    }
    if (data.status !== 'blacklisted') {
      excludedNotBlacklisted++
      continue
    }
    if (!hasBothNameAndEmail(data)) {
      excludedEmpty++
      continue
    }
    targets.push({
      uid: id,
      memberNumber: data.memberNumber ?? null,
      fullName: String(data.fullName).trim(),
      email: String(data.email).trim(),
      birthMonth: typeof data.birthMonth === 'string' ? data.birthMonth : '',
    })
  }

  let skipExisting = 0
  let registered = 0

  console.log('')
  console.log(`blacklisted 会員（氏名・メールあり）: ${targets.length}件`)
  console.log(`除外（氏名またはメール空）: ${excludedEmpty}件`)
  console.log(`除外（admin）: ${excludedAdmin}件`)
  console.log('')

  for (const t of targets.sort((a, b) => {
    const na = Number(a.memberNumber) || 0
    const nb = Number(b.memberNumber) || 0
    return na - nb
  })) {
    const memberLabel = t.memberNumber != null ? `#${String(t.memberNumber).padStart(5, '0')}` : '（番号なし）'
    const masked = `${memberLabel} / ${maskName(t.fullName)} / ${maskEmail(t.email)}`

    if (existingBlacklistIds.has(t.uid)) {
      skipExisting++
      console.log(`  スキップ（既存）: ${masked}`)
      continue
    }

    console.log(`  対象: ${masked}`)

    if (APPLY) {
      await createBlacklistDoc(accessToken, t.uid, {
        uid: t.uid,
        fullName: t.fullName,
        email: t.email,
        normalizedFullName: normalizeName(t.fullName),
        normalizedEmail: normalizeEmail(t.email),
        birthMonth: t.birthMonth || '',
        memberNumber: t.memberNumber,
        reason: 'backfill',
        createdAt: new Date(),
        active: true,
        removedAt: null,
      })
      registered++
    }
  }

  console.log('')
  console.log('=== 結果 ===')
  if (APPLY) {
    console.log(`登録: ${registered}件`)
  } else {
    console.log(`登録予定: ${targets.length - skipExisting}件`)
  }
  console.log(`スキップ（既存）: ${skipExisting}件`)
  console.log(`除外（空シェル）: ${excludedEmpty}件`)
  console.log(`除外（admin）: ${excludedAdmin}件`)

  if (!APPLY) {
    console.log('')
    console.log('書き込む場合: node scripts/backfill-blacklist.mjs --apply')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
