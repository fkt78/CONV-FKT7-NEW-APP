import { normalizeEmail, normalizeName } from './normalize.js'

export interface BlacklistCandidate {
  id?: string
  fullName?: string
  email?: string
  normalizedFullName?: string
  normalizedEmail?: string
  birthMonth?: string
  active?: boolean
}

export function isActiveBlacklistEntry(entry: BlacklistCandidate): boolean {
  return entry.active !== false
}

function candidateNormalizedEmail(entry: BlacklistCandidate): string {
  if (entry.normalizedEmail) return entry.normalizedEmail
  if (entry.email) return normalizeEmail(entry.email)
  return ''
}

function candidateNormalizedName(entry: BlacklistCandidate): string {
  if (entry.normalizedFullName) return entry.normalizedFullName
  if (entry.fullName) return normalizeName(entry.fullName)
  return ''
}

function rawEmailMatches(entry: BlacklistCandidate, rawEmail: string): boolean {
  if (!rawEmail || !entry.email) return false
  return entry.email.trim().toLowerCase() === rawEmail.trim().toLowerCase()
}

function rawNameMatches(entry: BlacklistCandidate, rawFullName: string): boolean {
  if (!rawFullName || !entry.fullName) return false
  return entry.fullName.trim() === rawFullName.trim()
}

/**
 * 照合結果。拒否条件はメール正規化一致、または氏名＋生年月一致のみ。
 */
export function evaluateBlacklistMatch(
  input: {
    normalizedEmail: string
    normalizedFullName: string
    birthMonth: string
    rawEmail: string
    rawFullName: string
  },
  candidates: BlacklistCandidate[],
): { isBlacklisted: boolean; nameOnlyMatchCount: number } {
  const active = candidates.filter(isActiveBlacklistEntry)
  let nameOnlyMatchCount = 0

  if (input.normalizedEmail) {
    for (const entry of active) {
      const entryEmail = candidateNormalizedEmail(entry)
      if (entryEmail && entryEmail === input.normalizedEmail) {
        return { isBlacklisted: true, nameOnlyMatchCount: 0 }
      }
    }
  }

  if (input.rawEmail) {
    for (const entry of active) {
      if (rawEmailMatches(entry, input.rawEmail)) {
        return { isBlacklisted: true, nameOnlyMatchCount: 0 }
      }
    }
  }

  if (input.normalizedFullName && input.birthMonth) {
    for (const entry of active) {
      const entryName = candidateNormalizedName(entry)
      const entryBirth = entry.birthMonth || ''
      if (entryName && entryName === input.normalizedFullName && entryBirth === input.birthMonth) {
        return { isBlacklisted: true, nameOnlyMatchCount: 0 }
      }
      if (
        rawNameMatches(entry, input.rawFullName) &&
        entryBirth &&
        entryBirth === input.birthMonth
      ) {
        return { isBlacklisted: true, nameOnlyMatchCount: 0 }
      }
    }
  }

  if (input.normalizedFullName) {
    for (const entry of active) {
      const entryName = candidateNormalizedName(entry)
      if (entryName && entryName === input.normalizedFullName) {
        nameOnlyMatchCount++
      }
    }
  }

  return { isBlacklisted: false, nameOnlyMatchCount }
}
