import { onDocumentCreated } from 'firebase-functions/v2/firestore'
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
    if (senderId === chatId) return
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
