import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
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
  if (!token) {
    console.warn(`[sendToUser] No fcmToken for user ${uid}, skipping push`)
    return
  }

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
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? ''
    console.error(`[sendToUser] FCM send error for ${uid}:`, code, err)
    if (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    ) {
      console.warn(`[sendToUser] Clearing invalid token for ${uid}`)
      await db.collection('users').doc(uid).update({
        fcmToken: null,
        fcmTokenUpdatedAt: null,
      })
    }
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

/** ブラックリスト照合（未認証でも呼び出し可能） */
export const checkBlacklist = onCall(async (request) => {
  const { fullName, email } = request.data as { fullName?: string; email?: string }
  if (!fullName && !email) {
    throw new HttpsError('invalid-argument', '照合するデータがありません')
  }

  const blRef = db.collection('blacklist')
  const checks: Array<Promise<FirebaseFirestore.QuerySnapshot>> = []

  if (fullName) {
    checks.push(blRef.where('fullName', '==', fullName).limit(1).get())
  }
  if (email) {
    checks.push(blRef.where('email', '==', email).limit(1).get())
  }

  const results = await Promise.all(checks)
  const isBlacklisted = results.some((snap) => !snap.empty)

  return { isBlacklisted }
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

/* ── 朝7時 天気判定＆クーポン自動配信 ── */

const IGA_LAT = 34.7667
const IGA_LON = 136.1333
const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99])
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86])

type WeatherCondition = 'any' | 'rain' | 'snow' | 'cold_below' | 'hot_above'
type TargetAttribute = 'all' | 'male' | 'female' | 'student' | 'other'
type TargetAgeRange = '' | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'
type TargetSegment = 'all' | 'male' | 'female' | 'student' | 'other' | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'
type ExpiryType = 'same_day' | 'end_of_week' | 'end_of_month' | 'date'

interface WeatherData {
  temperature: number
  temperatureMax: number
  temperatureMin: number
  weatherCode: number
  isRainy: boolean
  isSnowy: boolean
}

interface CouponTemplate {
  id: string
  title: string
  description: string
  discountAmount: number
  weatherCondition: WeatherCondition
  temperatureThreshold: number | null
  targetAttribute?: TargetAttribute
  targetAgeRanges?: TargetAgeRange[]
  targetAgeRange?: TargetAgeRange
  targetSegment?: TargetSegment
  expiryType?: ExpiryType
  expiryDate?: string
  autoDistribute?: boolean
  autoDistributeSchedule?: {
    type: 'daily' | 'weekly' | 'monthly' | 'specific_months' | 'birth_month'
    dayOfWeek?: number
    dayOfMonth?: number
    months?: number[]
  }
}

async function fetchWeatherForSchedule(): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${IGA_LAT}&longitude=${IGA_LON}` +
    `&current=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=Asia%2FTokyo`
  const res = await fetch(url)
  if (!res.ok) throw new Error('天気情報の取得に失敗しました')
  const json = await res.json()
  const c = json.current
  const d = json.daily
  const code = (c?.weather_code as number) ?? 0
  return {
    temperature: c?.temperature_2m ?? 0,
    temperatureMax: (d?.temperature_2m_max?.[0] as number) ?? c?.temperature_2m ?? 0,
    temperatureMin: (d?.temperature_2m_min?.[0] as number) ?? c?.temperature_2m ?? 0,
    weatherCode: code,
    isRainy: RAIN_CODES.has(code),
    isSnowy: SNOW_CODES.has(code),
  }
}

function matchesWeather(cond: WeatherCondition, threshold: number | null, w: WeatherData): boolean {
  switch (cond) {
    case 'any': return true
    case 'rain': return w.isRainy
    case 'snow': return w.isSnowy
    case 'cold_below': return threshold !== null && w.temperatureMin <= threshold
    case 'hot_above': return threshold !== null && w.temperatureMax >= threshold
    default: return false
  }
}

function getAgeDecade(birthMonth: string): TargetAgeRange {
  const [y, m] = birthMonth.split('-').map(Number)
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m) age--
  if (age < 20) return '10s'
  if (age < 30) return '20s'
  if (age < 40) return '30s'
  if (age < 50) return '40s'
  if (age < 60) return '50s'
  return '60plus'
}

const AGE_KEYS: string[] = ['10s', '20s', '30s', '40s', '50s', '60plus']

function getTargetFromCoupon(c: CouponTemplate): { attr: TargetAttribute; ages: TargetAgeRange[] } {
  const ages: TargetAgeRange[] = []
  if (Array.isArray(c.targetAgeRanges) && c.targetAgeRanges.length > 0) {
    ages.push(...c.targetAgeRanges.filter((a): a is Exclude<TargetAgeRange, ''> => AGE_KEYS.includes(a)))
  } else if (c.targetAgeRange && AGE_KEYS.includes(c.targetAgeRange)) {
    ages.push(c.targetAgeRange)
  } else if (c.targetSegment && AGE_KEYS.includes(c.targetSegment)) {
    ages.push(c.targetSegment as TargetAgeRange)
  }

  if (c.targetAttribute != null) {
    return { attr: c.targetAttribute, ages }
  }
  const seg = c.targetSegment
  if (!seg) return { attr: 'all', ages }
  if (['male', 'female', 'student', 'other'].includes(seg)) {
    return { attr: seg as TargetAttribute, ages }
  }
  return { attr: 'all', ages }
}

function matchesTarget(targetAttr: TargetAttribute, targetAges: TargetAgeRange[], userAttr: string, userBirth: string): boolean {
  if (targetAttr !== 'all' && userAttr !== targetAttr) return false
  if (targetAges.length === 0) return true
  const userAge = getAgeDecade(userBirth)
  return targetAges.includes(userAge)
}

function computeExpiryDate(expiryType: ExpiryType, expiryDateStr: string | undefined, distributedDate: string): Date {
  const [y, m, d] = distributedDate.split('-').map(Number)
  const dist = new Date(y, m - 1, d)
  switch (expiryType) {
    case 'same_day':
      return new Date(y, m - 1, d, 23, 59, 59, 999)
    case 'end_of_week': {
      const day = dist.getDay()
      const daysUntilSunday = (7 - day) % 7
      const sunday = new Date(dist)
      sunday.setDate(sunday.getDate() + daysUntilSunday)
      return new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999)
    }
    case 'end_of_month':
      return new Date(y, m, 0, 23, 59, 59, 999)
    case 'date': {
      if (!expiryDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
        return new Date(y, m - 1, d, 23, 59, 59, 999)
      }
      const [ey, em, ed] = expiryDateStr.split('-').map(Number)
      return new Date(ey, em - 1, ed, 23, 59, 59, 999)
    }
    default:
      return new Date(y, m - 1, d, 23, 59, 59, 999)
  }
}

/** 今日がスケジュールに合致するか（日付ベースのクーポン用、天気チェックなし） */
function matchesSchedule(schedule: CouponTemplate['autoDistributeSchedule'], now: Date): boolean {
  if (!schedule) return true
  if (schedule.type === 'daily') return true
  const dayOfWeek = now.getDay()
  const dayOfMonth = now.getDate()
  const month = now.getMonth() + 1

  switch (schedule.type) {
    case 'weekly':
      return schedule.dayOfWeek === dayOfWeek
    case 'monthly':
      return schedule.dayOfMonth === dayOfMonth
    case 'specific_months':
      return (schedule.months ?? []).includes(month) && schedule.dayOfMonth === dayOfMonth
    default:
      return false
  }
}

/** 誕生月の○日か（会員の birthMonth と今日の日付で判定） */
function isBirthMonthDay(birthMonth: string, dayOfMonth: number, now: Date): boolean {
  if (!birthMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(birthMonth)) return false
  const [, m] = birthMonth.split('-').map(Number)
  return m === now.getMonth() + 1 && now.getDate() === dayOfMonth
}

/** 毎朝7時（日本時間）に天気判定＆クーポン自動配信 */
export const scheduledCouponDistribution = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const settingsSnap = await db.collection('settings').doc('coupon').get()
    const settings = settingsSnap.data() ?? {}
    const dailyLimit = (settings.dailyLimit as number) ?? 1

    const weather = await fetchWeatherForSchedule()
    const cSnap = await db.collection('coupons').where('active', '==', true).get()
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    const allTemplates = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CouponTemplate))
    const uSnap = await db.collection('users').where('status', '==', 'active').get()

    let distributedCount = 0

    for (const coupon of allTemplates) {
      if (!coupon.autoDistribute) continue

      const s = coupon.autoDistributeSchedule
      const isBirthMonth = s?.type === 'birth_month'
      const dayOfMonthForBirth = s?.dayOfMonth ?? 1

      if (isBirthMonth) {
        for (const uDoc of uSnap.docs) {
          const u = uDoc.data()
          const uid = uDoc.id
          const birth = u.birthMonth as string
          if (!isBirthMonthDay(birth ?? '', dayOfMonthForBirth, now)) continue
          const t = getTargetFromCoupon(coupon)
          if (!matchesTarget(t.attr, t.ages, u.attribute ?? '', birth ?? '01-2000')) continue

          const logRef = db.collection('couponLogs').doc(`${uid}_${today}`)
          const logSnap = await logRef.get()
          const count = logSnap.exists ? (logSnap.data()?.count as number) : 0
          if (count >= dailyLimit) continue

          const couponDocId = `${coupon.id}_${today}`
          const existing = await db.collection('users').doc(uid).collection('coupons').doc(couponDocId).get()
          if (existing.exists) continue

          const expiryType = coupon.expiryType ?? 'same_day'
          const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, today)

          await db.collection('users').doc(uid).collection('coupons').doc(couponDocId).set({
            couponId: coupon.id,
            title: coupon.title,
            description: coupon.description ?? '',
            discountAmount: coupon.discountAmount ?? 0,
            status: 'unused',
            distributedAt: Timestamp.now(),
            distributedDate: today,
            expiresAt: Timestamp.fromDate(expiresAtDate),
            usedAt: null,
          })
          await logRef.set({ uid, date: today, count: count + 1 }, { merge: true })
          distributedCount++
        }
      } else {
        if (!matchesSchedule(s, now)) continue
        if ((!s || s.type === 'daily') && !matchesWeather(coupon.weatherCondition, coupon.temperatureThreshold ?? null, weather)) continue

        const expiryType = coupon.expiryType ?? 'same_day'
        const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, today)

        for (const uDoc of uSnap.docs) {
          const u = uDoc.data()
          const uid = uDoc.id
          const t = getTargetFromCoupon(coupon)
          if (!matchesTarget(t.attr, t.ages, u.attribute ?? '', u.birthMonth ?? '01-2000')) continue

          const logRef = db.collection('couponLogs').doc(`${uid}_${today}`)
          const logSnap = await logRef.get()
          const count = logSnap.exists ? (logSnap.data()?.count as number) : 0
          if (count >= dailyLimit) continue

          const couponDocId = `${coupon.id}_${today}`
          const existing = await db.collection('users').doc(uid).collection('coupons').doc(couponDocId).get()
          if (existing.exists) continue

          await db.collection('users').doc(uid).collection('coupons').doc(couponDocId).set({
            couponId: coupon.id,
            title: coupon.title,
            description: coupon.description ?? '',
            discountAmount: coupon.discountAmount ?? 0,
            status: 'unused',
            distributedAt: Timestamp.now(),
            distributedDate: today,
            expiresAt: Timestamp.fromDate(expiresAtDate),
            usedAt: null,
          })
          await logRef.set({ uid, date: today, count: count + 1 }, { merge: true })
          distributedCount++
        }
      }
    }

    console.log('scheduledCouponDistribution:', distributedCount, 'coupons distributed', weather)
  },
)
