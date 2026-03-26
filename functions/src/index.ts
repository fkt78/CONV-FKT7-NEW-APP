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
/** 雨の日判定：当日の最大降水確率がこの値以上（%） */
const RAIN_PRECIP_PROB_MIN = 60
/** 1ユーザーあたり1日の自動配信クーポン合計の上限（デフォルト） */
const DEFAULT_DAILY_COUPON_LIMIT = 5

/**
 * 気象庁 警報・注意報 API（三重県）
 * https://www.jma.go.jp/bosai/warning/data/warning/240000.json
 */
const JMA_WARNING_URL = 'https://www.jma.go.jp/bosai/warning/data/warning/240000.json'
/** 伊賀市の JMA 市区町村コード（三重県=24、伊賀市=212 → "24212"） */
const IGA_CITY_CODE = '24212'
/**
 * 「警報」以上とみなすコード（注意報は含まない）
 * 3=大雨 4=洪水 5=暴風 6=暴風雪 7=大雪 10=波浪 12=高潮
 * 33=大雨特別 35=暴風特別 36=暴風雪特別 37=大雪特別 38=波浪特別 39=高潮特別
 */
const JMA_WARN_CODES = new Set(['3', '4', '5', '6', '7', '10', '12', '33', '35', '36', '37', '38', '39'])

type WeatherCondition = 'any' | 'rain' | 'snow' | 'cold_below' | 'hot_above' | 'warning'
type TargetAttribute = 'all' | 'male' | 'female' | 'student' | 'other'
type TargetAgeRange = '' | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'
type TargetSegment = 'all' | 'male' | 'female' | 'student' | 'other' | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'
type ExpiryType = 'same_day' | 'end_of_week' | 'end_of_month' | 'date'

interface WeatherData {
  /** 現在気温（ログ用） */
  temperature: number
  /** 当日の予想最高気温 */
  temperatureMax: number
  /** 当日の予想最低気温 */
  temperatureMin: number
  /** 当日の最大降水確率（0–100）。雨の日判定に使用 */
  precipitationProbabilityMax: number
  /** 気象庁から伊賀市の警報が1件以上発令中かどうか */
  hasWarning: boolean
  /** 発令中の警報名リスト（ログ・デバッグ用） */
  warningNames: string[]
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

/** 気象庁の警報・注意報コードから名称を返す（ログ用） */
const JMA_CODE_NAMES: Record<string, string> = {
  '3': '大雨警報', '4': '洪水警報', '5': '暴風警報',
  '6': '暴風雪警報', '7': '大雪警報', '10': '波浪警報', '12': '高潮警報',
  '33': '大雨特別警報', '35': '暴風特別警報', '36': '暴風雪特別警報',
  '37': '大雪特別警報', '38': '波浪特別警報', '39': '高潮特別警報',
}

/**
 * 気象庁APIから伊賀市の警報発令状況を取得。
 * 取得失敗時は false を返す（配信はスキップ）。
 */
async function fetchWarningStatus(): Promise<{ hasWarning: boolean; warningNames: string[] }> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), 10_000)
  try {
    const res = await fetch(JMA_WARNING_URL, { signal: ac.signal })
    if (!res.ok) {
      console.warn(`[fetchWarningStatus] JMA HTTP ${res.status}`)
      return { hasWarning: false, warningNames: [] }
    }
    const json = (await res.json()) as {
      areaTypes?: Array<{
        areas?: Array<{
          areaCode?: string
          warnings?: Array<{ code?: string; status?: string }>
        }>
      }>
    }
    const names: string[] = []
    for (const areaType of json.areaTypes ?? []) {
      for (const area of areaType.areas ?? []) {
        if (!area.areaCode?.startsWith(IGA_CITY_CODE)) continue
        for (const w of area.warnings ?? []) {
          if (w.code && JMA_WARN_CODES.has(w.code) && w.status && w.status !== '') {
            names.push(JMA_CODE_NAMES[w.code] ?? `code:${w.code}`)
          }
        }
      }
    }
    return { hasWarning: names.length > 0, warningNames: names }
  } catch (err) {
    console.warn('[fetchWarningStatus] 取得失敗:', (err as Error)?.message ?? err)
    return { hasWarning: false, warningNames: [] }
  } finally {
    clearTimeout(t)
  }
}

const WEATHER_FETCH_TIMEOUT_MS = 15_000
const WEATHER_RETRY_COUNT = 3
const WEATHER_RETRY_BASE_MS = 3_000

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

type WeatherBase = Omit<WeatherData, 'hasWarning' | 'warningNames'>

async function fetchWeatherOnce(): Promise<WeatherBase> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${IGA_LAT}&longitude=${IGA_LON}` +
    `&current=temperature_2m` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo`
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), WEATHER_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ac.signal })
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
    const json = (await res.json()) as {
      current?: { temperature_2m?: number }
      daily?: {
        temperature_2m_max?: number[]
        temperature_2m_min?: number[]
        precipitation_probability_max?: number[]
      }
    }
    const c = json.current
    const d = json.daily
    const pp = d?.precipitation_probability_max?.[0] as number | undefined
    return {
      temperature: c?.temperature_2m ?? 0,
      temperatureMax: (d?.temperature_2m_max?.[0] as number) ?? c?.temperature_2m ?? 0,
      temperatureMin: (d?.temperature_2m_min?.[0] as number) ?? c?.temperature_2m ?? 0,
      precipitationProbabilityMax: typeof pp === 'number' && Number.isFinite(pp) ? pp : 0,
    }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Open-Meteo からの天気取得。Cloud Functions のコールドスタートで DNS/接続が
 * 不安定なため、最大 WEATHER_RETRY_COUNT 回リトライする。
 */
async function fetchWeatherForSchedule(): Promise<WeatherData> {
  let lastErr: unknown
  let base: Omit<WeatherData, 'hasWarning' | 'warningNames'> | null = null
  for (let i = 0; i < WEATHER_RETRY_COUNT; i++) {
    try {
      base = await fetchWeatherOnce()
      break
    } catch (err) {
      lastErr = err
      console.warn(
        `[fetchWeatherForSchedule] 試行${i + 1}/${WEATHER_RETRY_COUNT} 失敗:`,
        (err as Error)?.message ?? err,
      )
      if (i < WEATHER_RETRY_COUNT - 1) {
        const wait = WEATHER_RETRY_BASE_MS * (i + 1)
        console.warn(`[fetchWeatherForSchedule] ${wait}ms 後にリトライします…`)
        await sleep(wait)
      }
    }
  }
  if (!base) throw lastErr

  /* 気象庁警報取得は失敗しても全体を止めない（hasWarning: false 扱い） */
  const warn = await fetchWarningStatus()
  console.log('[fetchWeatherForSchedule] 警報状況:', warn)
  return { ...base, hasWarning: warn.hasWarning, warningNames: warn.warningNames }
}

/**
 * 天気連動の一致判定。
 * - weather が null のときは API 失敗扱いで、rain / cold / hot / snow のテンプレは配信しない（any のみ）。
 * - rain: 最大降水確率が RAIN_PRECIP_PROB_MIN% 以上（60% 以上）
 * - cold_below: 予想最低気温が閾値「未満」（閾値と同じ温度では不一致）
 * - hot_above: 予想最高気温が閾値「超」（閾値と同じでは不一致）
 */
function matchesWeather(cond: WeatherCondition, threshold: number | null, w: WeatherData | null): boolean {
  if (w === null) return cond === 'any'
  switch (cond) {
    case 'any':
      return true
    case 'rain':
      return w.precipitationProbabilityMax >= RAIN_PRECIP_PROB_MIN
    case 'snow':
      return false
    case 'cold_below':
      return threshold !== null && w.temperatureMin < threshold
    case 'hot_above':
      return threshold !== null && w.temperatureMax > threshold
    case 'warning':
      return w.hasWarning
    default:
      return false
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

/** クーポン自動配信の本体ロジック（スケジュール / 手動テスト共通） */
async function runCouponDistribution(): Promise<{ distributedCount: number; weather: WeatherData | null }> {
    const settingsSnap = await db.collection('settings').doc('coupon').get()
    const settings = settingsSnap.data() ?? {}
    const dailyLimit = (settings.dailyLimit as number) ?? DEFAULT_DAILY_COUPON_LIMIT

    let weather: WeatherData | null = null
    try {
      weather = await fetchWeatherForSchedule()
      console.log('[couponDistribution] Open-Meteo OK:', JSON.stringify(weather))
    } catch (err) {
      console.error(
        '[couponDistribution] Open-Meteo 取得失敗。天気条件付きテンプレはスキップし、条件なし(any)のみ配信します。',
        err,
      )
    }

    const cSnap = await db.collection('coupons').where('active', '==', true).get()
    const now = new Date()
    /* Cloud Functions は UTC で動作するため、JST (UTC+9) に変換して日付を求める。
     * 例: 朝7時JST = 前日22:00 UTC → now.getDate() だと前日になってしまう */
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const today = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`
    console.log(`[couponDistribution] today(JST)=${today} (UTC=${now.toISOString()})`)

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
          if (!isBirthMonthDay(birth ?? '', dayOfMonthForBirth, jstNow)) continue
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
        if (!matchesSchedule(s, jstNow)) continue
        if (!matchesWeather(coupon.weatherCondition, coupon.temperatureThreshold ?? null, weather)) {
          if (weather) {
            console.log(
              `[couponDistribution] 天候不一致でスキップ: id=${coupon.id} title=${coupon.title} cond=${coupon.weatherCondition} thr=${coupon.temperatureThreshold} ` +
                `→ 予報: 最大降水確率=${weather.precipitationProbabilityMax}% 最低=${weather.temperatureMin}℃ 最高=${weather.temperatureMax}℃（雨は${RAIN_PRECIP_PROB_MIN}%以上、寒は最低が閾値未満、暑は最高が閾値超）`,
            )
          } else {
            console.log(
              `[couponDistribution] 天気API未取得のためスキップ: id=${coupon.id} title=${coupon.title} cond=${coupon.weatherCondition}（any のみ配信可）`,
            )
          }
          continue
        }

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

    console.log(
      '[couponDistribution] 完了:',
      distributedCount,
      '件配信。weather=',
      weather === null ? 'null(API失敗時は天気条件付きは未実施)' : JSON.stringify(weather),
    )
    return { distributedCount, weather }
}

/** 毎朝7時（日本時間）に天気判定＆クーポン自動配信 */
export const scheduledCouponDistribution = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 120,
  },
  async () => {
    await runCouponDistribution()
  },
)

/** テスト用: 手動で配信ロジックを実行（管理者のみ） */
export const testCouponDistribution = onCall(
  { timeoutSeconds: 120 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'ログインが必要です')
    const userSnap = await db.collection('users').doc(req.auth.uid).get()
    const role = userSnap.data()?.role as string | undefined
    if (role !== 'admin') throw new HttpsError('permission-denied', '管理者権限が必要です')

    console.log('[testCouponDistribution] 管理者', req.auth.uid, 'が手動テスト実行')
    const result = await runCouponDistribution()
    return {
      distributedCount: result.distributedCount,
      weather: result.weather,
    }
  },
)
