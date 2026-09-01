#!/usr/bin/env node
/**
 * scripts/lib/normalize.mjs と functions/lib/normalize.js の同一性を確認する。
 * 事前に `npm run build --prefix functions` が必要。
 */
import { normalizeEmail, normalizeName } from './lib/normalize.mjs'
import {
  normalizeEmail as tsNormalizeEmail,
  normalizeName as tsNormalizeName,
} from '../functions/lib/normalize.js'

const emailCases = [
  ['FKT78@Gmail.com', 'fkt78@gmail.com'],
  ['fkt.78@gmail.com', 'fkt78@gmail.com'],
  ['fkt78+shop@gmail.com', 'fkt78@gmail.com'],
  ['fkt78@googlemail.com', 'fkt78@gmail.com'],
  ['taro.suzuki@docomo.ne.jp', 'taro.suzuki@docomo.ne.jp'],
  ['taro.suzuki@icloud.com', 'taro.suzuki@icloud.com'],
]

const nameCases = [
  [['吹田 克己', '吹田　克己', '吹田克己'], '吹田克己'],
  [['スイタ', 'すいた'], 'スイタ'],
]

let failed = 0

for (const [input, expected] of emailCases) {
  const mjs = normalizeEmail(input)
  const ts = tsNormalizeEmail(input)
  const ok = mjs === expected && ts === expected && mjs === ts
  console.log(ok ? 'OK' : 'NG', 'email', input, '->', mjs, ts === mjs ? '' : `(ts=${ts})`)
  if (!ok) failed++
}

for (const [inputs, expected] of nameCases) {
  for (const input of inputs) {
    const mjs = normalizeName(input)
    const ts = tsNormalizeName(input)
    const ok = mjs === expected && ts === expected && mjs === ts
    console.log(ok ? 'OK' : 'NG', 'name', input, '->', mjs, ts === mjs ? '' : `(ts=${ts})`)
    if (!ok) failed++
  }
}

if (failed > 0) {
  console.error(`\n${failed} 件失敗`)
  process.exit(1)
}

console.log('\n正規化同一性: すべて OK')
