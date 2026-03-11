#!/usr/bin/env node
/**
 * version.json のパッチバージョンを 1 つ増やす
 * 例: 1.0.0 → 1.0.1, 1.2.3 → 1.2.4
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const versionPath = resolve(__dirname, '..', 'version.json')

const data = JSON.parse(readFileSync(versionPath, 'utf-8'))
const parts = (data.version || '1.0.0').split('.').map(Number)
if (parts.length < 3) parts.push(0, 0)
parts[2] = (parts[2] ?? 0) + 1
data.version = parts.join('.')

writeFileSync(versionPath, JSON.stringify(data, null, 2) + '\n', 'utf-8')
console.log(`version: ${data.version}`)
