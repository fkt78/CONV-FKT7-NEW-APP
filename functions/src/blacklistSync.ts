import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { normalizeEmail, normalizeName } from './normalize.js'

function hasRequiredProfileFields(data: FirebaseFirestore.DocumentData | undefined): boolean {
  const fullName = typeof data?.fullName === 'string' ? data.fullName.trim() : ''
  const email = typeof data?.email === 'string' ? data.email.trim() : ''
  return fullName.length > 0 && email.length > 0
}

export async function syncBlacklistOnUserStatusChange(
  db: Firestore,
  uid: string,
  before: FirebaseFirestore.DocumentData | undefined,
  after: FirebaseFirestore.DocumentData | undefined,
): Promise<void> {
  const beforeStatus = before?.status
  const afterStatus = after?.status

  if (beforeStatus !== 'blacklisted' && afterStatus === 'blacklisted') {
    if (!hasRequiredProfileFields(after)) {
      console.log(`blacklist auto-register skipped for ${uid}: empty fullName or email`)
      return
    }
    await upsertBlacklistEntry(db, uid, after!, 'auto')
    return
  }

  if (beforeStatus === 'blacklisted' && afterStatus !== 'blacklisted') {
    await deactivateBlacklistEntry(db, uid)
  }
}

async function upsertBlacklistEntry(
  db: Firestore,
  uid: string,
  userData: FirebaseFirestore.DocumentData,
  reason: 'auto' | 'backfill' | 'manual',
): Promise<void> {
  const fullName = String(userData.fullName).trim()
  const email = String(userData.email).trim()
  const ref = db.collection('blacklist').doc(uid)
  const existing = await ref.get()

  const payload: Record<string, unknown> = {
    uid,
    fullName,
    email,
    normalizedFullName: normalizeName(fullName),
    normalizedEmail: normalizeEmail(email),
    birthMonth: typeof userData.birthMonth === 'string' ? userData.birthMonth : '',
    memberNumber: userData.memberNumber ?? null,
    reason,
    active: true,
    removedAt: null,
  }

  if (!existing.exists) {
    payload.createdAt = Timestamp.now()
  }

  await ref.set(payload, { merge: true })
}

async function deactivateBlacklistEntry(db: Firestore, uid: string): Promise<void> {
  const ref = db.collection('blacklist').doc(uid)
  const snap = await ref.get()
  if (!snap.exists) return
  await ref.set(
    {
      active: false,
      removedAt: Timestamp.now(),
    },
    { merge: true },
  )
}
