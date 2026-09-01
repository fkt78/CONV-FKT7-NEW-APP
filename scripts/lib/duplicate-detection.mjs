import { CONFIDENCE_RANK, getMatchBetweenUsers } from './normalize.mjs'

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
export function detectDuplicateGroups(users) {
  const n = users.length
  const uf = new UnionFind(n)
  /** @type {Array<{ i: number, j: number, confidence: '高'|'中'|'低', reason: string }>} */
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

  for (const indices of Object.values(nameMap)) {
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

  return buildGroupsFromUnionFind(users, uf, edgeMeta)
}

/**
 * @param {Array<Record<string, unknown>>} sources
 * @param {Array<Record<string, unknown>>} targets
 */
export function detectCrossMatches(sources, targets) {
  const total = sources.length + targets.length
  const uf = new UnionFind(total)
  /** @type {Array<{ i: number, j: number, confidence: '高'|'中'|'低', reason: string }>} */
  const edgeMeta = []

  for (let si = 0; si < sources.length; si++) {
    for (let ti = 0; ti < targets.length; ti++) {
      const s = sources[si]
      const t = targets[ti]
      if (s.uid && t.uid && s.uid === t.uid) continue
      const match = getMatchBetweenUsers(s, t)
      if (!match) continue
      const sourceIndex = si
      const targetIndex = sources.length + ti
      uf.union(sourceIndex, targetIndex)
      edgeMeta.push({ i: sourceIndex, j: targetIndex, confidence: match.confidence, reason: match.reason })
    }
  }

  const allNodes = [...sources, ...targets]
  const groups = buildGroupsFromUnionFind(allNodes, uf, edgeMeta)

  return groups.filter((g) => {
    const hasSource = g.members.some((idx) => idx < sources.length)
    const hasTarget = g.members.some((idx) => idx >= sources.length)
    return hasSource && hasTarget
  })
}

/**
 * @param {Array<Record<string, unknown>>} nodes
 * @param {UnionFind} uf
 * @param {Array<{ i: number, j: number, confidence: '高'|'中'|'低', reason: string }>} edgeMeta
 */
function buildGroupsFromUnionFind(nodes, uf, edgeMeta) {
  const n = nodes.length
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

/** @param {Array<Record<string, unknown>>} members */
export function analyzeDuplicateGroup(members, toDate) {
  const dates = members.map((m) => toDate(m.createdAt)).filter(Boolean)
  let minDays = ''
  let maxDays = ''
  if (dates.length >= 2) {
    const sorted = dates.sort((a, b) => a.getTime() - b.getTime())
    const diffMs = sorted[sorted.length - 1].getTime() - sorted[0].getTime()
    minDays = String(Math.round(diffMs / (1000 * 60 * 60 * 24)))
    maxDays = minDays
  }

  const dateKeys = new Set(dates.map((d) => d.toISOString().slice(0, 10)))
  const sameDay = dateKeys.size === 1 && dates.length >= 2 ? 'はい' : 'いいえ'

  const numbers = members
    .map((m) => m.memberNumber)
    .filter((n) => n != null)
    .map(Number)
    .sort((a, b) => a - b)
  let consecutive = 'いいえ'
  if (numbers.length >= 2) {
    consecutive = numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1) ? 'はい' : 'いいえ'
  }

  const positiveSaved = members.filter((m) => Number(m.totalSavedAmount ?? 0) > 0).length
  const bothUsed = positiveSaved >= 2 ? 'はい' : 'いいえ'

  return { regIntervalDays: minDays, sameDayReg: sameDay, consecutiveMemberNo: consecutive, bothUsed }
}
