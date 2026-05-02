import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https'
import { createHash } from 'node:crypto'
import {
  getFirestore,
  FieldValue,
  Timestamp,
  type DocumentReference,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
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

type SendToUserOpts = {
  /** メッセージ通知ごとに一意のタグ（iOS で同一タグによる置き換えを避ける） */
  messageId?: string
}

async function sendToUser(
  uid: string,
  title: string,
  body: string,
  type: 'messages' | 'coupons' | 'news',
  opts?: SendToUserOpts,
): Promise<void> {
  const userSnap = await db.collection('users').doc(uid).get()
  const user = userSnap.data()
  const token = user?.fcmToken as string | undefined
  if (!token) {
    console.warn(`[sendToUser] No fcmToken for user ${uid}, skipping push`)
    return
  }

  const settings = (user?.notificationSettings ?? {}) as NotificationSettings
  if (settings.enabled === false) {
    console.warn(`[sendToUser] notifications disabled for ${uid}, skipping`)
    return
  }
  if (type === 'messages' && settings.messages === false) {
    console.warn(`[sendToUser] messages channel off for ${uid}, skipping`)
    return
  }
  if (type === 'coupons' && settings.coupons === false) {
    console.warn(`[sendToUser] coupons channel off for ${uid}, skipping`)
    return
  }
  if (type === 'news' && settings.news === false) {
    console.warn(`[sendToUser] news channel off for ${uid}, skipping`)
    return
  }

  const displayBody =
    body.trim() ||
    (type === 'messages' ? '（内容を開いて確認してください）' : body)
  const sound = settings.sound !== false
  const tag =
    type === 'messages' && opts?.messageId
      ? `fkt7-msg-${opts.messageId}`
      : `fkt7-${type}`

  try {
    await messaging.send({
      token,
      notification: { title, body: displayBody },
      webpush: {
        headers: {
          Urgency: 'high',
        },
        notification: {
          title,
          body: displayBody,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-192x192.png',
          tag,
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
        title,
        body: displayBody,
      },
    })
    console.log(`[sendToUser] OK uid=${uid} type=${type} tag=${tag}`)
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
    const messageId = event.params.messageId
    const snap = event.data
    if (!snap) return
    const data = snap.data()
    const senderId = data?.senderId as string | undefined
    const text = (data?.text as string) ?? ''
    const attachmentType = data?.attachmentType as string | undefined
    if (!senderId) {
      console.warn('[onChatMessageCreated] missing senderId, skip', { chatId, messageId })
      return
    }

    const pushBody = text
      ? text.slice(0, 80)
      : attachmentType === 'image'
        ? '画像が届きました'
        : 'ファイルが届きました'

    const lastMessageText = text
      ? text.slice(0, 50)
      : attachmentType === 'image'
        ? '画像'
        : 'ファイル'

    if (senderId === chatId) {
      /* 会員本人の送信: senderId === chatId。管理者が自分の会員チャットに送る場合も同じ形になるため role で分岐 */
      const senderDoc = await db.collection('users').doc(senderId).get()
      const role = senderDoc.data()?.role as string | undefined
      if (role === 'admin') {
        console.log('[onChatMessageCreated] admin self-chat → push + meta update', { chatId, messageId })
        await Promise.all([
          sendToUser(chatId, '新しいメッセージ', pushBody, 'messages', { messageId }),
          db
            .collection('chats')
            .doc(chatId)
            .set(
              { lastMessage: lastMessageText, lastMessageAt: FieldValue.serverTimestamp() },
              { merge: true },
            ),
        ])
        return
      }
      const customerName = (senderDoc.data()?.fullName as string | undefined) ?? ''

      // レース条件対策: 管理者がこのメッセージより後に既読操作した場合は unreadFromCustomer を立てない。
      // 1) 管理者の setDoc({unreadFromCustomer: false, lastReadAt}) が先に走った場合、
      //    Cloud Function 後続実行で誤って true に上書きするのを防ぐ。
      // 2) message.createdAt が lastReadAt より古い場合は「既読済みの過去メッセージ」とみなす。
      const chatDocSnap = await db.collection('chats').doc(chatId).get()
      const lastReadAt = chatDocSnap.data()?.lastReadAt as
        | FirebaseFirestore.Timestamp
        | undefined
      const messageCreatedAt = data?.createdAt as FirebaseFirestore.Timestamp | undefined
      const shouldMarkUnread =
        !lastReadAt ||
        !messageCreatedAt ||
        messageCreatedAt.toMillis() > lastReadAt.toMillis()

      await db
        .collection('chats')
        .doc(chatId)
        .set(
          {
            ...(shouldMarkUnread && { unreadFromCustomer: true }),
            lastMessage: lastMessageText,
            lastMessageAt: FieldValue.serverTimestamp(),
            customerUid: chatId,
            ...(customerName && { customerName }),
          },
          { merge: true },
        )
      console.log('[onChatMessageCreated] customer message → meta updated', {
        chatId,
        messageId,
        shouldMarkUnread,
      })
      return
    }

    console.log('[onChatMessageCreated] store → member push + meta update', {
      chatId,
      senderId,
      messageId,
      bodyLen: pushBody.length,
    })
    await Promise.all([
      sendToUser(chatId, '新しいメッセージ', pushBody, 'messages', { messageId }),
      db
        .collection('chats')
        .doc(chatId)
        .set(
          { lastMessage: lastMessageText, lastMessageAt: FieldValue.serverTimestamp() },
          { merge: true },
        ),
    ])
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

/** checkBlacklist 用：同一クライアントあたりの呼び出し上限（窓内） */
const CHECK_BLACKLIST_MAX_PER_WINDOW = 10
const CHECK_BLACKLIST_WINDOW_MS = 15 * 60 * 1000

function getCallableClientIp(req: CallableRequest): string {
  const raw = req.rawRequest
  if (!raw) return 'unknown'
  const xf = raw.headers['x-forwarded-for']
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim()
  const rip = raw.socket?.remoteAddress
  return typeof rip === 'string' && rip ? rip : 'unknown'
}

/** Firestore に窓単位でカウントし、総当たり緩和 */
async function assertCheckBlacklistRateLimit(req: CallableRequest): Promise<void> {
  const ip = getCallableClientIp(req)
  const id = createHash('sha256').update(`checkBlacklist:${ip}`).digest('hex').slice(0, 40)
  const ref = db.collection('callableRateLimits').doc(id)
  const now = Date.now()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = snap.data()
    const windowStartMs = (data?.windowStartMs as number | undefined) ?? 0
    let count = (data?.count as number | undefined) ?? 0
    if (now - windowStartMs > CHECK_BLACKLIST_WINDOW_MS) {
      tx.set(
        ref,
        {
          windowStartMs: now,
          count: 1,
          bucket: 'checkBlacklist',
          updatedAt: Timestamp.now(),
        },
        { merge: true },
      )
      return
    }
    if (count >= CHECK_BLACKLIST_MAX_PER_WINDOW) {
      throw new HttpsError(
        'resource-exhausted',
        'リクエストが多すぎます。しばらくしてから再試行してください。',
      )
    }
    tx.set(
      ref,
      {
        count: count + 1,
        windowStartMs,
        bucket: 'checkBlacklist',
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    )
  })
}

/** ブラックリスト照合（未認証でも呼び出し可能・レート制限あり） */
export const checkBlacklist = onCall(async (request) => {
  await assertCheckBlacklistRateLimit(request)

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

  // 逐次 await ではなく並列バッチ処理にし、タイムアウトを回避する
  const targets = usersSnap.docs.filter((doc) => {
    const user = doc.data()
    const settings = (user?.notificationSettings ?? {}) as NotificationSettings
    if (settings.news === false || settings.enabled === false) return false
    if (!user?.fcmToken) return false
    return true
  })

  const BATCH = 20
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(
      targets.slice(i, i + BATCH).map((doc) =>
        sendToUser(doc.id, '新しいお知らせ', title, 'news'),
      ),
    )
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
  /** 後方互換 */
  title?: string
  description?: string
  titleJa?: string
  titleEn?: string
  titleVi?: string
  descriptionJa?: string
  descriptionEn?: string
  descriptionVi?: string
  discountAmount: number
  weatherCondition: WeatherCondition
  temperatureThreshold: number | null
  targetAttribute?: TargetAttribute
  targetAgeRanges?: TargetAgeRange[]
  targetAgeRange?: TargetAgeRange
  targetSegment?: TargetSegment
  /** `food_support` のとき自動配信は1日5枚上限に含めない */
  targetMemberGroup?: string
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

/** ユーザー配布ドキュメント用の多言語テキスト（未入力言語は日本語にフォールバック） */
function couponUserDocTexts(c: CouponTemplate) {
  const jaT = (c.titleJa ?? c.title ?? '').trim()
  const jaD = (c.descriptionJa ?? c.description ?? '').trim()
  return {
    title: jaT,
    description: jaD,
    titleJa: jaT,
    titleEn: (c.titleEn ?? '').trim() || jaT,
    titleVi: (c.titleVi ?? '').trim() || jaT,
    descriptionJa: jaD,
    descriptionEn: (c.descriptionEn ?? '').trim() || jaD,
    descriptionVi: (c.descriptionVi ?? '').trim() || jaD,
  }
}

/** 食料支援テンプレのみ true（couponLogs の件数に含めない） */
function isDailyLimitExempt(coupon: CouponTemplate): boolean {
  return coupon.targetMemberGroup === 'food_support'
}

/** users.memberGroups にテンプレの targetMemberGroup が含まれるか */
function matchesMemberGroup(coupon: CouponTemplate, memberGroups: unknown): boolean {
  const g = coupon.targetMemberGroup ?? 'all'
  if (g === 'all' || g === '') return true
  const arr = Array.isArray(memberGroups) ? (memberGroups as string[]) : []
  return arr.includes(g)
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

/** 誕生月から年齢帯を返す。未設定・不正形式・10歳未満は ''（年代ターゲットにマッチさせない） */
function getAgeDecade(birthMonth: string): TargetAgeRange {
  if (!birthMonth || !/^\d{4}-(0[1-9]|1[0-2])$/.test(birthMonth)) return ''
  const [y, m] = birthMonth.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return ''
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m) age--
  if (age < 10) return ''
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

/**
 * Cloud Functions は UTC 動作のため、JST の「その日の終わり」を UTC で表現する。
 * JST 23:59:59 = UTC 14:59:59（UTC+9 なので 23-9=14）
 */
function jstEndOfDay(uy: number, um: number, ud: number): Date {
  return new Date(Date.UTC(uy, um - 1, ud, 14, 59, 59, 999))
}

function computeExpiryDate(expiryType: ExpiryType, expiryDateStr: string | undefined, distributedDate: string): Date {
  const [y, m, d] = distributedDate.split('-').map(Number)
  // distributedDate は JST 日付（"2026-03-27" 等）なので、JST での終端を求める
  const dist = new Date(Date.UTC(y, m - 1, d))
  switch (expiryType) {
    case 'same_day':
      return jstEndOfDay(y, m, d)
    case 'end_of_week': {
      // 日曜のみ (7-0)%7=0 だと配信日当日で切れる → 翌週日曜まで（+7日）
      const day = dist.getUTCDay()
      const daysUntilSunday = day === 0 ? 7 : (7 - day) % 7
      const sunday = new Date(dist)
      sunday.setUTCDate(sunday.getUTCDate() + daysUntilSunday)
      return jstEndOfDay(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate())
    }
    case 'end_of_month': {
      // 翌月0日 = 当月末日
      const lastDay = new Date(Date.UTC(y, m, 0))
      return jstEndOfDay(lastDay.getUTCFullYear(), lastDay.getUTCMonth() + 1, lastDay.getUTCDate())
    }
    case 'date': {
      if (!expiryDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
        return jstEndOfDay(y, m, d)
      }
      const [ey, em, ed] = expiryDateStr.split('-').map(Number)
      return jstEndOfDay(ey, em, ed)
    }
    default:
      return jstEndOfDay(y, m, d)
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

/** batchGetExistingUserCouponUids の getAll チャンク（Admin SDK は大きなまとめ読みに対応） */
const GET_ALL_COUPON_CHUNK = 500

/**
 * 同一テンプレ・同一日のクーポンが既に存在するユーザーを一括判定（ユーザー数ぶんの個別 get を避ける）
 */
async function batchGetExistingUserCouponUids(
  couponDocId: string,
  uids: string[],
): Promise<Set<string>> {
  const existing = new Set<string>()
  for (let i = 0; i < uids.length; i += GET_ALL_COUPON_CHUNK) {
    const chunk = uids.slice(i, i + GET_ALL_COUPON_CHUNK)
    const refs = chunk.map((uid) =>
      db.collection('users').doc(uid).collection('coupons').doc(couponDocId),
    )
    const snaps = await db.getAll(...refs)
    snaps.forEach((snap, j) => {
      if (snap.exists) existing.add(chunk[j]!)
    })
  }
  return existing
}

/** おみくじセット（Firestore `omikujiSets`） */
interface OmikujiSetDoc {
  name?: string
  active?: boolean
  couponIdDai?: string
  couponIdChu?: string
  couponIdSho?: string
  pctDai?: number
  pctChu?: number
  pctSho?: number
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = arr[i]!
    arr[i] = arr[j]!
    arr[j] = t
  }
}

/**
 * おみくじペナルティ（users.omikujiPenaltyLevel、0–3+）
 * ※ users.yellowCards（イエローカード）はブラックリスト連動のため別フィールド
 */
function effectiveOmikujiPercents(
  base: { pctDai: number; pctChu: number; pctSho: number },
  penalty: number,
): { pctDai: number; pctChu: number; pctSho: number } {
  const d = Math.max(0, Math.min(100, Math.floor(base.pctDai)))
  const c = Math.max(0, Math.min(100, Math.floor(base.pctChu)))
  const s = Math.max(0, Math.min(100, Math.floor(base.pctSho)))
  if (penalty >= 3) return { pctDai: 0, pctChu: 0, pctSho: 0 }
  if (penalty === 2) return { pctDai: 0, pctChu: 0, pctSho: 10 }
  if (penalty === 1) {
    return { pctDai: 0, pctChu: Math.floor(c * 0.5), pctSho: Math.floor(s * 0.5) }
  }
  return { pctDai: d, pctChu: c, pctSho: s }
}

/** 当日・いずれかの等級テンプレが既に配布済みのユーザーを検出 */
async function batchGetExistingOmikujiAnyTier(
  uids: string[],
  couponIds: [string, string, string],
  today: string,
): Promise<Set<string>> {
  const existing = new Set<string>()
  const [dId, cId, sId] = couponIds
  const docIdD = `${dId}_${today}`
  const docIdC = `${cId}_${today}`
  const docIdS = `${sId}_${today}`
  const CHUNK = 150
  for (let i = 0; i < uids.length; i += CHUNK) {
    const chunk = uids.slice(i, i + CHUNK)
    const refs: DocumentReference[] = []
    for (const uid of chunk) {
      refs.push(db.collection('users').doc(uid).collection('coupons').doc(docIdD))
      refs.push(db.collection('users').doc(uid).collection('coupons').doc(docIdC))
      refs.push(db.collection('users').doc(uid).collection('coupons').doc(docIdS))
    }
    const snaps = await db.getAll(...refs)
    snaps.forEach((snap, idx) => {
      if (!snap.exists) return
      const userIdx = Math.floor(idx / 3)
      const uid = chunk[userIdx]
      if (uid) existing.add(uid)
    })
  }
  return existing
}

type RunOmikujiCtx = {
  logCountByUid: Map<string, number>
  today: string
  dailyLimit: number
  userDocs: QueryDocumentSnapshot[]
}

/**
 * 朝のクーポン配信の後に呼ぶ。同一の couponLogs / 日次上限を共有する。
 */
async function runOmikujiDistribution(
  ctx: RunOmikujiCtx,
  options?: { omikujiSetId?: string } | null,
): Promise<number> {
  let setDocSnap: DocumentSnapshot | null = null
  if (options?.omikujiSetId) {
    const d = await db.collection('omikujiSets').doc(options.omikujiSetId).get()
    if (!d.exists) {
      console.warn('[omikujiDistribution] 指定IDのセットがありません:', options.omikujiSetId)
      return 0
    }
    setDocSnap = d
  } else {
    const q = await db.collection('omikujiSets').where('active', '==', true).limit(1).get()
    if (q.empty) {
      console.log('[omikujiDistribution] アクティブなおみくじセットなし')
      return 0
    }
    setDocSnap = q.docs[0] ?? null
  }
  if (!setDocSnap?.exists) return 0

  const setData = setDocSnap.data() as OmikujiSetDoc
  const daiId = setData.couponIdDai
  const chuId = setData.couponIdChu
  const shoId = setData.couponIdSho
  if (!daiId || !chuId || !shoId) {
    console.warn('[omikujiDistribution] couponId が不足、スキップ')
    return 0
  }

  const basePct = {
    pctDai: Math.floor(Number(setData.pctDai) ?? 0),
    pctChu: Math.floor(Number(setData.pctChu) ?? 0),
    pctSho: Math.floor(Number(setData.pctSho) ?? 0),
  }

  const [daiSnap, chuSnap, shoSnap] = await Promise.all([
    db.collection('coupons').doc(daiId).get(),
    db.collection('coupons').doc(chuId).get(),
    db.collection('coupons').doc(shoId).get(),
  ])
  if (!daiSnap.exists || !chuSnap.exists || !shoSnap.exists) {
    console.warn('[omikujiDistribution] テンプレの1つ以上が存在しません')
    return 0
  }
  const daiCoupon = { id: daiSnap.id, ...daiSnap.data() } as CouponTemplate
  const chuCoupon = { id: chuSnap.id, ...chuSnap.data() } as CouponTemplate
  const shoCoupon = { id: shoSnap.id, ...shoSnap.data() } as CouponTemplate

  const couponsByTier = {
    dai: daiCoupon,
    chu: chuCoupon,
    sho: shoCoupon,
  } as const

  const buckets: [string[], string[], string[]] = [[], [], []]
  for (const uDoc of ctx.userDocs) {
    const uid = uDoc.id
    const u = uDoc.data()
    const penaltyRaw = (u.omikujiPenaltyLevel as number) ?? 0
    const penalty = Math.min(3, Math.max(0, Math.floor(penaltyRaw)))
    if (penalty >= 3) continue
    if ((ctx.logCountByUid.get(uid) ?? 0) >= ctx.dailyLimit) continue

    const t = getTargetFromCoupon(daiCoupon)
    if (!matchesTarget(t.attr, t.ages, (u.attribute as string) ?? '', (u.birthMonth as string) ?? '')) continue
    if (!matchesMemberGroup(daiCoupon, u.memberGroups)) continue

    buckets[penalty]!.push(uid)
  }

  let distributed = 0
  const MAX_WRITE_BATCH_OPS = 500
  let writeBatch = db.batch()
  let writeBatchOpCount = 0

  async function flushWriteBatchIfNeeded(opsNeeded: number): Promise<void> {
    if (writeBatchOpCount + opsNeeded > MAX_WRITE_BATCH_OPS) {
      await writeBatch.commit()
      writeBatch = db.batch()
      writeBatchOpCount = 0
    }
  }

  async function commitWriteBatchIfAny(): Promise<void> {
    if (writeBatchOpCount > 0) {
      await writeBatch.commit()
      writeBatch = db.batch()
      writeBatchOpCount = 0
    }
  }

  const couponIdsTriple: [string, string, string] = [daiId, chuId, shoId]

  for (let penalty = 0; penalty < 3; penalty++) {
    let eligible = [...buckets[penalty]!]
    if (eligible.length === 0) continue

    const existing = await batchGetExistingOmikujiAnyTier(eligible, couponIdsTriple, ctx.today)
    eligible = eligible.filter((uid) => !existing.has(uid))
    if (eligible.length === 0) continue

    const eff = effectiveOmikujiPercents(basePct, penalty)
    const N = eligible.length
    const daiCount = Math.floor((N * eff.pctDai) / 100)
    const chuCount = Math.floor((N * eff.pctChu) / 100)
    const shoCount = Math.floor((N * eff.pctSho) / 100)

    shuffleInPlace(eligible)

    let offset = 0
    const tierQuotas: Array<{ tier: 'dai' | 'chu' | 'sho'; quota: number }> = [
      { tier: 'dai', quota: daiCount },
      { tier: 'chu', quota: chuCount },
      { tier: 'sho', quota: shoCount },
    ]

    for (const { tier, quota } of tierQuotas) {
      const slice = eligible.slice(offset, offset + quota)
      offset += quota
      const coupon = couponsByTier[tier]
      const expiryType = coupon.expiryType ?? 'same_day'
      const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, ctx.today)

      for (const uid of slice) {
        const exempt = isDailyLimitExempt(coupon)
        if (!exempt) {
          const cur = ctx.logCountByUid.get(uid) ?? 0
          if (cur >= ctx.dailyLimit) continue
        }

        const couponDocId = `${coupon.id}_${ctx.today}`
        await flushWriteBatchIfNeeded(exempt ? 1 : 2)
        const couponRef = db.collection('users').doc(uid).collection('coupons').doc(couponDocId)
        writeBatch.set(couponRef, {
          couponId: coupon.id,
          ...couponUserDocTexts(coupon),
          discountAmount: coupon.discountAmount ?? 0,
          status: 'unused',
          distributedAt: Timestamp.now(),
          distributedDate: ctx.today,
          expiresAt: Timestamp.fromDate(expiresAtDate),
          usedAt: null,
          distributedVia: 'omikuji',
          omikujiTier: tier,
        })
        writeBatchOpCount++
        if (!exempt) {
          const prev = ctx.logCountByUid.get(uid) ?? 0
          const next = prev + 1
          ctx.logCountByUid.set(uid, next)
          const logRef = db.collection('couponLogs').doc(`${uid}_${ctx.today}`)
          writeBatch.set(logRef, { uid, date: ctx.today, count: next }, { merge: true })
          writeBatchOpCount++
        }
        distributed++
      }
    }
  }

  await commitWriteBatchIfAny()
  console.log('[omikujiDistribution] 完了:', distributed, '件')
  return distributed
}

type CouponDistributionOptions = {
  /** 指定時はそのIDのテンプレのみ処理（自動配信ON不要・Firestore上に存在すれば非アクティブも可） */
  onlyCouponIds?: string[]
}

/** クーポン自動配信の本体ロジック（スケジュール / 手動テスト共通） */
async function runCouponDistribution(
  options?: CouponDistributionOptions | null,
): Promise<{ distributedCount: number; distributedOmikuji: number; weather: WeatherData | null }> {
    const onlyIds = options?.onlyCouponIds?.length ? [...new Set(options.onlyCouponIds)] : null

    const now = new Date()
    /* Cloud Functions は UTC で動作するため、JST (UTC+9) に変換して日付を求める。
     * 例: 朝7時JST = 前日22:00 UTC → now.getDate() だと前日になってしまう */
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const today = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`
    console.log(`[couponDistribution] today(JST)=${today} (UTC=${now.toISOString()})`)

    const distributionStatusRef = db.collection('settings').doc('distributionStatus')
    if (!onlyIds) {
      const statusSnap = await distributionStatusRef.get()
      const lastRunDate = statusSnap.data()?.lastScheduledRunDate as string | undefined
      if (lastRunDate === today) {
        console.log(
          `[couponDistribution] 本日(${today})の配信はすでに完了済み。2重実行を防止してスキップします。`,
        )
        return { distributedCount: 0, distributedOmikuji: 0, weather: null }
      }
    }

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

    let allTemplates: CouponTemplate[]
    if (onlyIds) {
      const snaps = await Promise.all(onlyIds.map((id) => db.collection('coupons').doc(id).get()))
      allTemplates = snaps
        .filter((s) => s.exists)
        .map((d) => ({ id: d.id, ...d.data() } as CouponTemplate))
      console.log(
        `[couponDistribution] テスト対象 ${onlyIds.length} 件指定 → 存在するテンプレ ${allTemplates.length} 件`,
      )
    } else {
      const cSnap = await db.collection('coupons').where('active', '==', true).get()
      allTemplates = cSnap.docs.map((d) => ({ id: d.id, ...d.data() } as CouponTemplate))
    }

    const uSnap = await db.collection('users').where('status', '==', 'active').get()

    /** 当日分の配信枚数（テンプレ横断で共有）。ループ内で log を毎回読まない */
    const logCountByUid = new Map<string, number>()
    const logSnap = await db.collection('couponLogs').where('date', '==', today).get()
    for (const d of logSnap.docs) {
      const data = d.data()
      const uid = data.uid as string
      logCountByUid.set(uid, (data.count as number) ?? 0)
    }

    let distributedCount = 0

    /** WriteBatch は 1 回の commit で最大 500 操作 */
    const MAX_WRITE_BATCH_OPS = 500
    let writeBatch = db.batch()
    let writeBatchOpCount = 0

    async function flushWriteBatchIfNeeded(opsNeeded: number): Promise<void> {
      if (writeBatchOpCount + opsNeeded > MAX_WRITE_BATCH_OPS) {
        await writeBatch.commit()
        writeBatch = db.batch()
        writeBatchOpCount = 0
      }
    }

    async function commitWriteBatchIfAny(): Promise<void> {
      if (writeBatchOpCount > 0) {
        await writeBatch.commit()
        writeBatch = db.batch()
        writeBatchOpCount = 0
      }
    }

    for (const coupon of allTemplates) {
      if (!onlyIds && !coupon.autoDistribute) continue

      const s = coupon.autoDistributeSchedule
      const isBirthMonth = s?.type === 'birth_month'
      const dayOfMonthForBirth = s?.dayOfMonth ?? 1

      if (isBirthMonth) {
        const eligibleUids: string[] = []
        for (const uDoc of uSnap.docs) {
          const u = uDoc.data()
          const uid = uDoc.id
          const birth = u.birthMonth as string
          if (!isBirthMonthDay(birth ?? '', dayOfMonthForBirth, jstNow)) continue
          const t = getTargetFromCoupon(coupon)
          if (!matchesTarget(t.attr, t.ages, u.attribute ?? '', birth ?? '')) continue
          if (!matchesMemberGroup(coupon, u.memberGroups)) continue
          eligibleUids.push(uid)
        }

        const couponDocId = `${coupon.id}_${today}`
        const exemptBirth = isDailyLimitExempt(coupon)
        const uidsToCheckBirth = exemptBirth
          ? eligibleUids
          : eligibleUids.filter((uid) => (logCountByUid.get(uid) ?? 0) < dailyLimit)
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, uidsToCheckBirth)

        const expiryType = coupon.expiryType ?? 'same_day'
        const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, today)

        for (const uid of eligibleUids) {
          if (existingUids.has(uid)) continue

          if (!exemptBirth) {
            const count = logCountByUid.get(uid) ?? 0
            if (count >= dailyLimit) continue
          }

          await flushWriteBatchIfNeeded(exemptBirth ? 1 : 2)
          const couponRef = db.collection('users').doc(uid).collection('coupons').doc(couponDocId)
          writeBatch.set(couponRef, {
            couponId: coupon.id,
            ...couponUserDocTexts(coupon),
            discountAmount: coupon.discountAmount ?? 0,
            status: 'unused',
            distributedAt: Timestamp.now(),
            distributedDate: today,
            expiresAt: Timestamp.fromDate(expiresAtDate),
            usedAt: null,
          })
          writeBatchOpCount++
          if (!exemptBirth) {
            const count = logCountByUid.get(uid) ?? 0
            const next = count + 1
            logCountByUid.set(uid, next)
            const logRef = db.collection('couponLogs').doc(`${uid}_${today}`)
            writeBatch.set(logRef, { uid, date: today, count: next }, { merge: true })
            writeBatchOpCount++
          }
          distributedCount++
        }
      } else {
        if (!matchesSchedule(s, jstNow)) continue
        if (!matchesWeather(coupon.weatherCondition, coupon.temperatureThreshold ?? null, weather)) {
          if (weather) {
            console.log(
              `[couponDistribution] 天候不一致でスキップ: id=${coupon.id} title=${coupon.titleJa ?? coupon.title ?? ''} cond=${coupon.weatherCondition} thr=${coupon.temperatureThreshold} ` +
                `→ 予報: 最大降水確率=${weather.precipitationProbabilityMax}% 最低=${weather.temperatureMin}℃ 最高=${weather.temperatureMax}℃（雨は${RAIN_PRECIP_PROB_MIN}%以上、寒は最低が閾値未満、暑は最高が閾値超）`,
            )
          } else {
            console.log(
              `[couponDistribution] 天気API未取得のためスキップ: id=${coupon.id} title=${coupon.titleJa ?? coupon.title ?? ''} cond=${coupon.weatherCondition}（any のみ配信可）`,
            )
          }
          continue
        }

        const expiryType = coupon.expiryType ?? 'same_day'
        const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, today)

        const eligibleUids: string[] = []
        for (const uDoc of uSnap.docs) {
          const u = uDoc.data()
          const uid = uDoc.id
          const t = getTargetFromCoupon(coupon)
          if (!matchesTarget(t.attr, t.ages, u.attribute ?? '', (u.birthMonth as string) ?? '')) continue
          if (!matchesMemberGroup(coupon, u.memberGroups)) continue
          eligibleUids.push(uid)
        }

        const couponDocId = `${coupon.id}_${today}`
        const exemptRegular = isDailyLimitExempt(coupon)
        const uidsToCheckRegular = exemptRegular
          ? eligibleUids
          : eligibleUids.filter((uid) => (logCountByUid.get(uid) ?? 0) < dailyLimit)
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, uidsToCheckRegular)

        for (const uid of eligibleUids) {
          if (existingUids.has(uid)) continue

          if (!exemptRegular) {
            const count = logCountByUid.get(uid) ?? 0
            if (count >= dailyLimit) continue
          }

          await flushWriteBatchIfNeeded(exemptRegular ? 1 : 2)
          const couponRef = db.collection('users').doc(uid).collection('coupons').doc(couponDocId)
          writeBatch.set(couponRef, {
            couponId: coupon.id,
            ...couponUserDocTexts(coupon),
            discountAmount: coupon.discountAmount ?? 0,
            status: 'unused',
            distributedAt: Timestamp.now(),
            distributedDate: today,
            expiresAt: Timestamp.fromDate(expiresAtDate),
            usedAt: null,
          })
          writeBatchOpCount++
          if (!exemptRegular) {
            const count = logCountByUid.get(uid) ?? 0
            const next = count + 1
            logCountByUid.set(uid, next)
            const logRef = db.collection('couponLogs').doc(`${uid}_${today}`)
            writeBatch.set(logRef, { uid, date: today, count: next }, { merge: true })
            writeBatchOpCount++
          }
          distributedCount++
        }
      }
    }

    await commitWriteBatchIfAny()

    let distributedOmikuji = 0
    if (!onlyIds) {
      distributedOmikuji = await runOmikujiDistribution({
        logCountByUid,
        today,
        dailyLimit,
        userDocs: uSnap.docs as QueryDocumentSnapshot[],
      })
    }

    if (!onlyIds) {
      await distributionStatusRef.set(
        {
          lastScheduledRunDate: today,
          completedAt: Timestamp.now(),
        },
        { merge: true },
      )
      console.log(`[couponDistribution] 完了ステータスを記録: lastScheduledRunDate=${today}`)
    }

    console.log(
      '[couponDistribution] 完了:',
      distributedCount,
      '件配信。おみくじ:',
      distributedOmikuji,
      '件。weather=',
      weather === null ? 'null(API失敗時は天気条件付きは未実施)' : JSON.stringify(weather),
    )
    return { distributedCount, distributedOmikuji, weather }
}

/** 毎朝7時（日本時間）に天気判定＆クーポン自動配信 */
export const scheduledCouponDistribution = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Asia/Tokyo',
    timeoutSeconds: 300,
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

    const raw = req.data as { couponIds?: unknown } | undefined
    const couponIds = Array.isArray(raw?.couponIds)
      ? raw.couponIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : undefined

    if (couponIds !== undefined && couponIds.length === 0) {
      throw new HttpsError('invalid-argument', 'テスト配信するクーポンを1件以上選択してください')
    }

    console.log(
      '[testCouponDistribution] 管理者',
      req.auth.uid,
      'が手動テスト実行',
      couponIds?.length ? `（選択 ${couponIds.length} 件）` : '（全テンプレ・従来どおり）',
    )
    const result = await runCouponDistribution(
      couponIds?.length ? { onlyCouponIds: couponIds } : null,
    )
    return {
      distributedCount: result.distributedCount,
      distributedOmikuji: result.distributedOmikuji,
      weather: result.weather,
    }
  },
)

/** テスト用: おみくじ配信のみ実行（管理者のみ） */
export const testOmikujiDistribution = onCall(
  { timeoutSeconds: 120 },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'ログインが必要です')
    const userSnap = await db.collection('users').doc(req.auth.uid).get()
    const role = userSnap.data()?.role as string | undefined
    if (role !== 'admin') throw new HttpsError('permission-denied', '管理者権限が必要です')

    const raw = req.data as { omikujiSetId?: unknown } | undefined
    const omikujiSetId =
      typeof raw?.omikujiSetId === 'string' && raw.omikujiSetId.length > 0 ? raw.omikujiSetId : undefined

    const settingsSnap = await db.collection('settings').doc('coupon').get()
    const settings = settingsSnap.data() ?? {}
    const dailyLimit = (settings.dailyLimit as number) ?? DEFAULT_DAILY_COUPON_LIMIT

    const now = new Date()
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const today = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-${String(jstNow.getUTCDate()).padStart(2, '0')}`

    const logCountByUid = new Map<string, number>()
    const logSnap = await db.collection('couponLogs').where('date', '==', today).get()
    for (const d of logSnap.docs) {
      const data = d.data()
      const uid = data.uid as string
      logCountByUid.set(uid, (data.count as number) ?? 0)
    }

    const uSnap = await db.collection('users').where('status', '==', 'active').get()

    console.log('[testOmikujiDistribution] 管理者', req.auth.uid, 'が実行', omikujiSetId ?? '（アクティブ先頭）')

    const distributedCount = await runOmikujiDistribution(
      {
        logCountByUid,
        today,
        dailyLimit,
        userDocs: uSnap.docs as QueryDocumentSnapshot[],
      },
      omikujiSetId ? { omikujiSetId } : null,
    )
    return { distributedCount }
  },
)
