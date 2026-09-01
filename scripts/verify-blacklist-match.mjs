#!/usr/bin/env node
/**
 * blacklistMatch ロジックの単体確認。
 * 事前に `npm run build --prefix functions` が必要。
 */
import { evaluateBlacklistMatch } from '../functions/lib/blacklistMatch.js'

function assert(label, condition) {
  if (!condition) {
    console.error('NG', label)
    process.exitCode = 1
    return
  }
  console.log('OK', label)
}

const activeEmail = {
  normalizedEmail: 'blocked@gmail.com',
  normalizedFullName: 'blockeduser',
  birthMonth: '1990-01',
  active: true,
}

const activeNameBirth = {
  normalizedEmail: 'other@gmail.com',
  normalizedFullName: 'nguyenvana',
  birthMonth: '1996-08',
  active: true,
}

const inactive = {
  ...activeEmail,
  active: false,
}

const legacy = {
  email: 'badguy2@test.com',
  fullName: '悪い 転売ヤー2',
  birthMonth: '2000-01',
  active: true,
}

assert(
  'メール正規化一致 → 拒否',
  evaluateBlacklistMatch(
    {
      normalizedEmail: 'blocked@gmail.com',
      normalizedFullName: '',
      birthMonth: '',
      rawEmail: 'blocked@gmail.com',
      rawFullName: '',
    },
    [activeEmail],
  ).isBlacklisted,
)

assert(
  '氏名＋生年月一致 → 拒否',
  evaluateBlacklistMatch(
    {
      normalizedEmail: 'new@gmail.com',
      normalizedFullName: 'nguyenvana',
      birthMonth: '1996-08',
      rawEmail: 'new@gmail.com',
      rawFullName: 'NGUYEN VAN A',
    },
    [activeNameBirth],
  ).isBlacklisted,
)

assert(
  '氏名だけ一致（生年月違い）→ 拒否されない',
  !evaluateBlacklistMatch(
    {
      normalizedEmail: 'unique@gmail.com',
      normalizedFullName: 'nguyenvana',
      birthMonth: '1990-01',
      rawEmail: 'unique@gmail.com',
      rawFullName: 'NGUYEN VAN A',
    },
    [activeNameBirth],
  ).isBlacklisted,
)

assert(
  '空文字メール → ヒットしない',
  !evaluateBlacklistMatch(
    {
      normalizedEmail: '',
      normalizedFullName: '',
      birthMonth: '',
      rawEmail: '',
      rawFullName: '',
    },
    [{ normalizedEmail: '', normalizedFullName: '', active: true }],
  ).isBlacklisted,
)

assert(
  'active:false → ヒットしない',
  !evaluateBlacklistMatch(
    {
      normalizedEmail: 'blocked@gmail.com',
      normalizedFullName: '',
      birthMonth: '',
      rawEmail: 'blocked@gmail.com',
      rawFullName: '',
    },
    [inactive],
  ).isBlacklisted,
)

assert(
  '旧形式（完全一致メール）→ 拒否',
  evaluateBlacklistMatch(
    {
      normalizedEmail: 'badguy2@test.com',
      normalizedFullName: '',
      birthMonth: '',
      rawEmail: 'badguy2@test.com',
      rawFullName: '',
    },
    [legacy],
  ).isBlacklisted,
)

if (process.exitCode) {
  console.error('\n照合ロジックテスト: 失敗あり')
  process.exit(1)
}

console.log('\n照合ロジックテスト: すべて OK')
