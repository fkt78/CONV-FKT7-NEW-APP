import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

/* ── 型定義 ── */

export type WeatherCondition = 'any' | 'rain' | 'snow' | 'cold_below' | 'hot_above'

/** 属性（性別・その他） */
export type TargetAttribute = 'all' | 'male' | 'female' | 'student' | 'other'

/** 年代（空文字は指定なし＝全年代） */
export type TargetAgeRange = '' | '10s' | '20s' | '30s' | '40s' | '50s' | '60plus'

/** 年代の選択肢（空以外） */
export const AGE_RANGE_KEYS = ['10s', '20s', '30s', '40s', '50s', '60plus'] as const

/** @deprecated 後方互換用。新規は targetAttribute + targetAgeRange を使用 */
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
  /** 対象属性（新仕様） */
  targetAttribute?: TargetAttribute
  /** 対象年代（新仕様・複数選択可・空配列は全年代） */
  targetAgeRanges?: TargetAgeRange[]
  /** @deprecated 後方互換。targetAgeRanges を優先 */
  targetAgeRange?: TargetAgeRange
  /** @deprecated 後方互換。targetAttribute + targetAgeRanges を優先 */
  targetSegment?: TargetSegment
  active: boolean
  createdAt: Date | null
  /** 有効期限の種類（未設定時は当日） */
  expiryType?: ExpiryType
  /** expiryType が 'date' のときのみ使用（YYYY-MM-DD） */
  expiryDate?: string
  /** 毎朝7時の自動配信に含めるか（未設定時は false） */
  autoDistribute?: boolean
  /**
   * 自動配信スケジュール（autoDistribute が true のとき使用）
   * - daily: 毎日（天気条件があれば天気チェック）
   * - weekly: 毎週○曜日
   * - monthly: 毎月○日
   * - specific_months: 指定月の○日
   * - birth_month: 誕生月の○日（会員ごとにその月の○日に配信）
   */
  autoDistributeSchedule?: {
    type: 'daily' | 'weekly' | 'monthly' | 'specific_months' | 'birth_month'
    /** weekly のとき: 0=日, 1=月, ..., 6=土 */
    dayOfWeek?: number
    /** monthly / specific_months / birth_month のとき: 1-31 */
    dayOfMonth?: number
    /** specific_months のとき: 1-12 の配列（例: [1,7,12]） */
    months?: number[]
  }
}

export const EXPIRY_LABELS: Record<ExpiryType, string> = {
  same_day: '当日',
  end_of_week: '今週中',
  end_of_month: '今月いっぱい',
  date: '日付を指定',
}

export const ATTRIBUTE_LABELS: Record<TargetAttribute, string> = {
  all: '全員',
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

export const AGE_RANGE_LABELS: Record<Exclude<TargetAgeRange, ''>, string> = {
  '10s': '10代',
  '20s': '20代',
  '30s': '30代',
  '40s': '40代',
  '50s': '50代',
  '60plus': '60代以上',
}

/** @deprecated 後方互換 */
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

type TargetAgeKey = Exclude<TargetAgeRange, ''>

/** クーポンから対象を取得（新フィールド優先、旧 targetSegment から変換） */
export function getTargetFromCoupon(c: CouponTemplate): { attr: TargetAttribute; ages: TargetAgeKey[] } {
  const ages: TargetAgeKey[] = []
  if (Array.isArray(c.targetAgeRanges) && c.targetAgeRanges.length > 0) {
    ages.push(...c.targetAgeRanges.filter((a): a is TargetAgeKey =>
      (AGE_RANGE_KEYS as readonly string[]).includes(a)))
  } else if (c.targetAgeRange && (AGE_RANGE_KEYS as readonly string[]).includes(c.targetAgeRange)) {
    ages.push(c.targetAgeRange as TargetAgeKey)
  } else if (c.targetSegment && ['10s', '20s', '30s', '40s', '50s', '60plus'].includes(c.targetSegment)) {
    ages.push(c.targetSegment as TargetAgeKey)
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

/** 対象セグメントの表示ラベル（例: 女性の10代・20代・30代） */
export function formatTargetLabel(c: CouponTemplate): string {
  const { attr, ages } = getTargetFromCoupon(c)
  const attrLabel = ATTRIBUTE_LABELS[attr]
  if (ages.length === 0) return attrLabel
  const ageLabels = ages.map((a) => AGE_RANGE_LABELS[a]).join('・')
  return attr === 'all' ? ageLabels : `${attrLabel}の${ageLabels}`
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

// 一斉配信は廃止。手動は個人配信のみ。自動は毎朝7時 Cloud Functions で実行。

/* ── 個人向け配信 ── */

export interface IndividualDistributionResult {
  distributedCount: number
  skippedCount: number
  details: string[]
}

/** 指定したクーポンを選択したユーザーに配信（天気・セグメント条件は無視） */
export async function distributeCouponToUsers(
  couponId: string,
  userIds: string[],
): Promise<IndividualDistributionResult> {
  if (userIds.length === 0) {
    return { distributedCount: 0, skippedCount: 0, details: ['対象ユーザーが選択されていません'] }
  }

  const couponSnap = await getDoc(doc(db, 'coupons', couponId))
  if (!couponSnap.exists()) {
    return { distributedCount: 0, skippedCount: 0, details: ['クーポンが見つかりません'] }
  }

  const coupon = {
    id: couponSnap.id,
    ...couponSnap.data(),
  } as CouponTemplate & { fullName?: string }

  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const expiryType = coupon.expiryType ?? 'same_day'
  const expiresAtDate = computeExpiryDate(expiryType, coupon.expiryDate, today)

  let distributedCount = 0
  let skippedCount = 0
  const details: string[] = []

  const userSnap = await getDocs(collection(db, 'users'))
  const userMap = Object.fromEntries(userSnap.docs.map((d) => [d.id, d.data()]))

  for (const uid of userIds) {
    const u = userMap[uid]
    const fullName = (u?.fullName as string) ?? '不明'

    const couponDocId = `${couponId}_${today}`
    const existing = await getDoc(doc(db, 'users', uid, 'coupons', couponDocId))
    if (existing.exists()) {
      skippedCount++
      details.push(`${fullName}さん: 本日すでに配信済み`)
      continue
    }

    await setDoc(doc(db, 'users', uid, 'coupons', couponDocId), {
      couponId,
      title: coupon.title,
      description: coupon.description ?? '',
      discountAmount: coupon.discountAmount ?? 0,
      status: 'unused',
      distributedAt: serverTimestamp(),
      distributedDate: today,
      expiresAt: Timestamp.fromDate(expiresAtDate),
      usedAt: null,
    })

    distributedCount++
    details.push(`${fullName}さんに「${coupon.title}」を配信`)
  }

  return { distributedCount, skippedCount, details }
}
