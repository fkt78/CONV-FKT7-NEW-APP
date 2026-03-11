import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { fetchWeather, type WeatherData } from './weather'

/* ── 型定義 ── */

export type WeatherCondition = 'any' | 'rain' | 'snow' | 'cold_below' | 'hot_above'
export type TargetSegment =
  | 'all' | 'male' | 'female' | 'student' | 'other'
  | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'

/** 有効期限の種類（週は月曜始まり） */
export type ExpiryType = 'same_day' | 'end_of_week' | 'end_of_month' | 'date'

export interface CouponTemplate {
  id: string
  title: string
  description: string
  discountAmount: number
  weatherCondition: WeatherCondition
  temperatureThreshold: number | null
  targetSegment: TargetSegment
  active: boolean
  createdAt: Date | null
  /** 有効期限の種類（未設定時は当日） */
  expiryType?: ExpiryType
  /** expiryType が 'date' のときのみ使用（YYYY-MM-DD） */
  expiryDate?: string
}

export const EXPIRY_LABELS: Record<ExpiryType, string> = {
  same_day: '当日',
  end_of_week: '今週中',
  end_of_month: '今月いっぱい',
  date: '日付を指定',
}

export const SEGMENT_LABELS: Record<TargetSegment, string> = {
  all: '全員',
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
  '10s': '10代',
  '20s': '20代',
  '30s': '30代',
  '40s': '40代',
  '50s': '50代',
  '60plus': '60代以上',
}

export const CONDITION_LABELS: Record<WeatherCondition, string> = {
  any: '条件なし（常時）',
  rain: '雨の日',
  snow: '雪の日',
  cold_below: '気温が○℃以下',
  hot_above: '気温が○℃以上',
}

/* ── ヘルパー ── */

function getAgeDecade(birthMonth: string): string {
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

function matchesWeather(
  cond: WeatherCondition,
  threshold: number | null,
  w: WeatherData,
): boolean {
  switch (cond) {
    case 'any':        return true
    case 'rain':       return w.isRainy
    case 'snow':       return w.isSnowy
    case 'cold_below': return threshold !== null && w.temperature <= threshold
    case 'hot_above':  return threshold !== null && w.temperature >= threshold
  }
}

function matchesSegment(seg: TargetSegment, attr: string, birth: string): boolean {
  if (seg === 'all') return true
  if (['male', 'female', 'student', 'other'].includes(seg)) return attr === seg
  return getAgeDecade(birth) === seg
}

/** 配布日から有効期限の日付を計算（23:59:59.999） */
function computeExpiryDate(
  expiryType: ExpiryType,
  expiryDateStr: string | undefined,
  distributedDate: string,
): Date {
  const [y, m, d] = distributedDate.split('-').map(Number)
  const dist = new Date(y, m - 1, d)

  switch (expiryType) {
    case 'same_day':
      return new Date(y, m - 1, d, 23, 59, 59, 999)
    case 'end_of_week': {
      // 月曜始まり → 今週の日曜 23:59:59
      const day = dist.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
      const daysUntilSunday = (7 - day) % 7
      const sunday = new Date(dist)
      sunday.setDate(sunday.getDate() + daysUntilSunday)
      return new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999)
    }
    case 'end_of_month':
      return new Date(y, m, 0, 23, 59, 59, 999) // 翌月0日 = 今月末
    case 'date':
      if (!expiryDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDateStr)) {
        return new Date(y, m - 1, d, 23, 59, 59, 999)
      }
      const [ey, em, ed] = expiryDateStr.split('-').map(Number)
      return new Date(ey, em - 1, ed, 23, 59, 59, 999)
    default:
      return new Date(y, m - 1, d, 23, 59, 59, 999)
  }
}

/* ── 配信結果 ── */

export interface DistributionResult {
  weather: WeatherData
  matchedCoupons: CouponTemplate[]
  distributedCount: number
  skippedLimitCount: number
  details: string[]
}

/* ── メイン配信関数 ── */

export async function distributeCoupons(dailyLimit: number): Promise<DistributionResult> {
  const weather = await fetchWeather()

  // アクティブなクーポンテンプレートを取得
  const cSnap = await getDocs(query(collection(db, 'coupons'), where('active', '==', true)))
  const templates: CouponTemplate[] = cSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CouponTemplate, 'id' | 'createdAt'>),
    createdAt: d.data().createdAt?.toDate() ?? null,
  }))

  // 天気条件に合致するクーポンだけ抽出
  const matched = templates.filter((t) =>
    matchesWeather(t.weatherCondition, t.temperatureThreshold, weather),
  )

  if (matched.length === 0) {
    return {
      weather,
      matchedCoupons: [],
      distributedCount: 0,
      skippedLimitCount: 0,
      details: ['現在の天気に合致するクーポンがありません'],
    }
  }

  // アクティブユーザー取得
  const uSnap = await getDocs(query(collection(db, 'users'), where('status', '==', 'active')))
  const today = new Date().toISOString().split('T')[0]

  let distributedCount = 0
  let skippedLimitCount = 0
  const details: string[] = []

  for (const coupon of matched) {
    for (const uDoc of uSnap.docs) {
      const u = uDoc.data()
      const uid = uDoc.id

      // セグメント照合
      if (!matchesSegment(coupon.targetSegment, u.attribute as string, u.birthMonth as string))
        continue

      // サイレント上限チェック
      const logRef = doc(db, 'couponLogs', `${uid}_${today}`)
      const logSnap = await getDoc(logRef)
      const count = logSnap.exists() ? (logSnap.data().count as number) : 0
      if (count >= dailyLimit) {
        skippedLimitCount++
        continue
      }

      // 同日の同一クーポン重複防止（ドキュメントIDで冪等性を担保）
      const couponDocId = `${coupon.id}_${today}`
      const existing = await getDoc(doc(db, 'users', uid, 'coupons', couponDocId))
      if (existing.exists()) continue

      const expiryType = coupon.expiryType ?? 'same_day'
      const expiryDate = coupon.expiryDate
      const expiresAtDate = computeExpiryDate(expiryType, expiryDate, today)

      await setDoc(doc(db, 'users', uid, 'coupons', couponDocId), {
        couponId: coupon.id,
        title: coupon.title,
        description: coupon.description,
        discountAmount: coupon.discountAmount ?? 0,
        status: 'unused',
        distributedAt: serverTimestamp(),
        distributedDate: today,
        expiresAt: Timestamp.fromDate(expiresAtDate),
        usedAt: null,
      })

      // 日次カウンタ更新
      await setDoc(logRef, { uid, date: today, count: count + 1 })

      distributedCount++
      details.push(`${u.fullName as string}さんに「${coupon.title}」を配信`)
    }
  }

  if (distributedCount === 0 && skippedLimitCount === 0) {
    details.push('対象セグメントの顧客がいません')
  }

  return { weather, matchedCoupons: matched, distributedCount, skippedLimitCount, details }
}
