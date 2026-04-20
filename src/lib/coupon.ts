import {
  collection,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  query,
  where,
  documentId,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firebase'

/* ── 型定義 ── */

export type WeatherCondition = 'any' | 'rain' | 'snow' | 'cold_below' | 'hot_above' | 'warning'

/** メンバーグループ（自動配信の対象絞り込み）。`all`＝全員。`food_support` は1日5枚上限の対象外 */
export type TargetMemberGroup = 'all' | 'food_support' | string

/** 管理画面・表示用ラベル（キーは Firestore の memberGroups と一致） */
export const MEMBER_GROUP_LABELS: Record<string, string> = {
  all: '全員',
  food_support: '食料支援',
}

/** 食料支援テンプレのみ true（デイリーリミットにカウントしない） */
export function isDailyLimitExempt(c: Pick<CouponTemplate, 'targetMemberGroup'>): boolean {
  return c.targetMemberGroup === 'food_support'
}

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

/**
 * ユーザー向けに表示するタイトル・説明を解決する。
 * - 新フィールド（titleJa 等）があれば優先し、旧データは title / description を日本語として扱う。
 * - 英語・ベトナム語が空のときは日本語にフォールバック。
 */
export function resolveCouponTexts(
  data: {
    title?: string
    description?: string
    titleJa?: string
    titleEn?: string
    titleVi?: string
    descriptionJa?: string
    descriptionEn?: string
    descriptionVi?: string
  },
  lang: string,
): { title: string; description: string } {
  const jaTitle = (data.titleJa ?? data.title ?? '').trim()
  const jaDesc = (data.descriptionJa ?? data.description ?? '').trim()
  const enTitle = (data.titleEn ?? '').trim() || jaTitle
  const viTitle = (data.titleVi ?? '').trim() || jaTitle
  const enDesc = (data.descriptionEn ?? '').trim() || jaDesc
  const viDesc = (data.descriptionVi ?? '').trim() || jaDesc

  const norm = (lang.split('-')[0] ?? 'ja').toLowerCase()
  if (norm === 'en') return { title: enTitle, description: enDesc }
  if (norm === 'vi') return { title: viTitle, description: viDesc }
  return { title: jaTitle, description: jaDesc }
}

/** 配信ドキュメント用: 6言語フィールド＋後方互換の title / description（日本語） */
export function couponSnapshotForDistribution(
  c: Pick<
    CouponTemplate,
    | 'title'
    | 'description'
    | 'titleJa'
    | 'titleEn'
    | 'titleVi'
    | 'descriptionJa'
    | 'descriptionEn'
    | 'descriptionVi'
  >,
): Record<string, string> {
  const jaT = (c.titleJa ?? c.title ?? '').trim()
  const jaD = (c.descriptionJa ?? c.description ?? '').trim()
  const enT = (c.titleEn ?? '').trim() || jaT
  const viT = (c.titleVi ?? '').trim() || jaT
  const enD = (c.descriptionEn ?? '').trim() || jaD
  const viD = (c.descriptionVi ?? '').trim() || jaD
  return {
    title: jaT,
    description: jaD,
    titleJa: jaT,
    titleEn: enT,
    titleVi: viT,
    descriptionJa: jaD,
    descriptionEn: enD,
    descriptionVi: viD,
  }
}

export interface CouponTemplate {
  id: string
  /** @deprecated 後方互換。新規は titleJa を使用。未設定時は titleJa と同一扱い */
  title?: string
  description?: string
  /** 日本語（必須） */
  titleJa?: string
  titleEn?: string
  titleVi?: string
  descriptionJa?: string
  descriptionEn?: string
  descriptionVi?: string
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
  /**
   * 自動配信の対象メンバー。
   * - `all` または未設定: 属性・年代のみで絞り込み（従来どおり）
   * - `food_support`: `users.memberGroups` に `food_support` が含まれる会員のみ。デイリーリミット対象外。
   * - その他のキー: 同様に memberGroups に含まれる会員のみ（リミットは通常カウント）
   */
  targetMemberGroup?: TargetMemberGroup
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
  end_of_week: '今週の日曜まで',
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
  rain: '雨の日（当日の最大降水確率が60%以上）',
  snow: '雪の日（廃止・配信されません）',
  cold_below: '最低気温が○℃未満の日',
  hot_above: '最高気温が○℃を超える日',
  warning: '気象警報発令時（大雨・暴風・大雪など）',
}

/** 管理画面の天気条件プルダウン（雪は選択不可・既存データ互換のため型には残す） */
export const CONDITION_OPTIONS: WeatherCondition[] = ['any', 'rain', 'cold_below', 'hot_above', 'warning']

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
  const segment =
    ages.length === 0
      ? attrLabel
      : attr === 'all'
        ? ages.map((a) => AGE_RANGE_LABELS[a]).join('・')
        : `${attrLabel}の${ages.map((a) => AGE_RANGE_LABELS[a]).join('・')}`
  const mg = c.targetMemberGroup && c.targetMemberGroup !== 'all'
    ? MEMBER_GROUP_LABELS[c.targetMemberGroup] ?? c.targetMemberGroup
    : null
  return mg ? `${mg} / ${segment}` : segment
}

/**
 * 配布日・期限日の YYYY-MM-DD は日本（JST）の暦日。終日 23:59:59.999 JST を UTC の Date で表す（Cloud Functions と同一）。
 * ブラウザのローカルタイムゾーンに依存させない。
 */
function jstEndOfDay(uy: number, um: number, ud: number): Date {
  return new Date(Date.UTC(uy, um - 1, ud, 14, 59, 59, 999))
}

/** 配布日から有効期限を計算（Functions の computeExpiryDate と同ロジック） */
function computeExpiryDate(
  expiryType: ExpiryType,
  expiryDateStr: string | undefined,
  distributedDate: string,
): Date {
  const [y, m, d] = distributedDate.split('-').map(Number)
  const dist = new Date(Date.UTC(y, m - 1, d))

  switch (expiryType) {
    case 'same_day':
      return jstEndOfDay(y, m, d)
    case 'end_of_week': {
      const day = dist.getUTCDay()
      const daysUntilSunday = day === 0 ? 7 : (7 - day) % 7
      const sunday = new Date(dist)
      sunday.setUTCDate(sunday.getUTCDate() + daysUntilSunday)
      return jstEndOfDay(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate())
    }
    case 'end_of_month': {
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

  const CHUNK = 10

  // ユーザー名を in クエリで並列一括取得
  const chunks = Array.from({ length: Math.ceil(userIds.length / CHUNK) }, (_, i) =>
    userIds.slice(i * CHUNK, i * CHUNK + CHUNK),
  )
  const userMapEntries = await Promise.all(
    chunks.map((chunk) =>
      getDocs(query(collection(db, 'users'), where(documentId(), 'in', chunk))).then((snap) =>
        snap.docs.map((d) => [d.id, d.data()] as [string, ReturnType<typeof d.data>]),
      ),
    ),
  )
  const userMap = Object.fromEntries(userMapEntries.flat())

  // 配信済みチェックを全 uid で並列実行
  const couponDocId = `${couponId}_${today}`
  const existingChecks = await Promise.all(
    userIds.map((uid) =>
      getDoc(doc(db, 'users', uid, 'coupons', couponDocId)).then((snap) => ({
        uid,
        exists: snap.exists(),
      })),
    ),
  )

  const textFields = couponSnapshotForDistribution(coupon)
  const expiresAt = Timestamp.fromDate(expiresAtDate)
  const jaTitle = textFields.titleJa ?? textFields.title ?? ''

  let distributedCount = 0
  let skippedCount = 0
  const details: string[] = []

  // writeBatch で一括書き込み（500件/バッチ上限に合わせてチャンク）
  const toWrite = existingChecks.filter((r) => !r.exists)
  const toSkip  = existingChecks.filter((r) => r.exists)

  for (const { uid } of toSkip) {
    const fullName = (userMap[uid]?.fullName as string) ?? '不明'
    skippedCount++
    details.push(`${fullName}さん: 本日すでに配信済み`)
  }

  const BATCH_SIZE = 499
  for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    const slice = toWrite.slice(i, i + BATCH_SIZE)
    for (const { uid } of slice) {
      batch.set(doc(db, 'users', uid, 'coupons', couponDocId), {
        couponId,
        ...textFields,
        discountAmount: coupon.discountAmount ?? 0,
        status: 'unused',
        distributedAt: serverTimestamp(),
        distributedDate: today,
        expiresAt,
        usedAt: null,
      })
    }
    await batch.commit()
    for (const { uid } of slice) {
      const fullName = (userMap[uid]?.fullName as string) ?? '不明'
      distributedCount++
      details.push(`${fullName}さんに「${jaTitle}」を配信`)
    }
  }

  return { distributedCount, skippedCount, details }
}
