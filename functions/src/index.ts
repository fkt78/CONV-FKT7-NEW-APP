import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { initializeApp } from 'firebase-admin/app'

initializeApp()

const db = getFirestore()
const messaging = getMessaging()

interface NotificationSettings {
  enabled?: boolean
  messages?: boolean
  coupons?: boolean
  news?: boolean
  sound?: boolean
}

async function sendToUser(
  uid: string,
  title: string,
  body: string,
  type: 'messages' | 'coupons' | 'news',
): Promise<void> {
  const userSnap = await db.collection('users').doc(uid).get()
  const user = userSnap.data()
  const token = user?.fcmToken as string | undefined
  if (!token) return

  const settings = (user?.notificationSettings ?? {}) as NotificationSettings
  if (settings.enabled === false) return
  if (type === 'messages' && settings.messages === false) return
  if (type === 'coupons' && settings.coupons === false) return
  if (type === 'news' && settings.news === false) return

  const sound = settings.sound !== false
  try {
    await messaging.send({
      token,
      notification: { title, body },
      webpush: {
        notification: {
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          tag: 'fkt7-' + type,
          renotify: true,
          silent: !sound,
        },
        fcmOptions: {
          link: '/',
        },
      },
      data: {
        url: '/',
        sound: String(sound),
      },
    })
  } catch (err) {
    console.error('FCM send error:', uid, err)
  }
}

/** チャットメッセージ受信時（管理者→ユーザー） */
export const onChatMessageCreated = onDocumentCreated(
  'chats/{chatId}/messages/{messageId}',
  async (event) => {
    const chatId = event.params.chatId
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const senderId = data?.senderId as string | undefined
    const text = (data?.text as string) ?? ''
    const attachmentType = data?.attachmentType as string | undefined
    if (!senderId) return
    if (senderId === chatId) {
      await db.collection('chats').doc(chatId).set({ unreadFromCustomer: true }, { merge: true })
      return
    }
    const body = text
      ? text.slice(0, 80)
      : attachmentType === 'image'
        ? '画像が届きました'
        : 'ファイルが届きました'
    await sendToUser(chatId, '新しいメッセージ', body, 'messages')
  },
)

/** クーポン配信時 */
export const onCouponDistributed = onDocumentCreated(
  'users/{uid}/coupons/{couponId}',
  async (event) => {
    const uid = event.params.uid
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const title = (data?.title as string) ?? 'クーポン'
    await sendToUser(uid, 'クーポンが届きました', title, 'coupons')
  },
)

/** 新規ユーザー登録時：会員番号を自動採番 */
export const onUserCreated = onDocumentCreated('users/{uid}', async (event) => {
  const uid = event.params.uid
  const snap = event.data
  if (!snap) return
  const data = snap.data()
  if (data?.memberNumber != null) return

  const counterRef = db.collection('settings').doc('memberNumberCounter')
  const userRef = db.collection('users').doc(uid)

  const nextNumber = await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef)
    const next = counterSnap.exists ? ((counterSnap.data()?.next as number) ?? 1) : 1
    tx.set(counterRef, { next: next + 1 }, { merge: true })
    tx.update(userRef, { memberNumber: next })
    return next
  })

  console.log('Assigned memberNumber', nextNumber, 'to', uid)
})

/** 既存ユーザーに会員番号を一括割り当て（管理者のみ） */
export const assignMemberNumbers = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'ログインが必要です')
  const adminUid = request.auth.uid
  const adminSnap = await db.collection('users').doc(adminUid).get()
  const role = adminSnap.data()?.role
  if (role !== 'admin') throw new HttpsError('permission-denied', '管理者のみ実行できます')

  const usersSnap = await db.collection('users')
    .where('status', '==', 'active')
    .get()

  const withoutNumber = usersSnap.docs
    .filter((d) => d.data().memberNumber == null)
    .sort((a, b) => {
      const aAt = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0
      const bAt = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0
      return aAt - bAt
    })

  if (withoutNumber.length === 0) {
    return { assigned: 0, message: '割り当て対象のユーザーがいません' }
  }

  const counterRef = db.collection('settings').doc('memberNumberCounter')

  for (const d of withoutNumber) {
    await db.runTransaction(async (tx) => {
      const c = await tx.get(counterRef)
      const n = c.exists ? ((c.data()?.next as number) ?? 1) : 1
      tx.set(counterRef, { next: n + 1 }, { merge: true })
      tx.update(db.collection('users').doc(d.id), { memberNumber: n })
    })
  }

  return { assigned: withoutNumber.length, message: `${withoutNumber.length}名に会員番号を割り当てました` }
})

/** お知らせ投稿時（全ユーザーに通知） */
export const onNewsCreated = onDocumentCreated('news/{newsId}', async (event) => {
  const snap = event.data
  if (!snap) return
  const data = snap.data()
  const title = (data?.title as string) ?? 'お知らせ'
  const usersSnap = await db.collection('users').get()
  for (const doc of usersSnap.docs) {
    const uid = doc.id
    const user = doc.data()
    const settings = (user?.notificationSettings ?? {}) as NotificationSettings
    if (settings.news === false) continue
    if (settings.enabled === false) continue
    if (!user?.fcmToken) continue
    await sendToUser(uid, '新しいお知らせ', title, 'news')
  }
})
