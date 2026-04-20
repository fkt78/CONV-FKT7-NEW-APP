import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
  Timestamp,
  type Timestamp as TimestampType,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { getLocaleTag } from '../lib/formatTime'
import { resolveCouponTexts } from '../lib/coupon'

type WalletTab = 'unused' | 'history'

interface OwnedCoupon {
  id: string
  /** 後方互換: 旧ドキュメントのみ */
  title?: string
  description?: string
  titleJa?: string
  titleEn?: string
  titleVi?: string
  descriptionJa?: string
  descriptionEn?: string
  descriptionVi?: string
  discountAmount: number
  status: 'unused' | 'used'
  distributedAt: Date | null
  usedAt: Date | null
  expiresAt: Date | null
}

function toSafeNumber(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

function formatDate(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString(getLocaleTag(), { month: 'numeric', day: 'numeric' })
}

function formatDateTime(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString(getLocaleTag(), {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ERR_COUPON_NOT_FOUND = 'COUPON_NOT_FOUND'
const ERR_COUPON_ALREADY_USED = 'COUPON_ALREADY_USED'
const ERR_COUPON_EXPIRED = 'COUPON_EXPIRED'

// ── sessionStorage キャッシュ（未使用クーポン・TTL 3分） ──────────────────
const COUPON_CACHE_KEY = 'vip-coupon-wallet-cache'
const COUPON_CACHE_TTL_MS = 3 * 60 * 1000

interface CouponCacheShape {
  items: Array<Record<string, unknown>>
  fetchedAt: number
}

function readCouponCache(): Array<Record<string, unknown>> | null {
  try {
    const raw = sessionStorage.getItem(COUPON_CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as CouponCacheShape
    if (Date.now() - cache.fetchedAt > COUPON_CACHE_TTL_MS) return null
    return cache.items
  } catch {
    return null
  }
}

function writeCouponCache(items: Array<Record<string, unknown>>) {
  try {
    const cache: CouponCacheShape = { fetchedAt: Date.now(), items }
    sessionStorage.setItem(COUPON_CACHE_KEY, JSON.stringify(cache))
  } catch {
    // 容量オーバーは無視
  }
}

function couponToSerializable(c: OwnedCoupon): Record<string, unknown> {
  return {
    ...c,
    distributedAt: c.distributedAt?.toISOString() ?? null,
    usedAt: c.usedAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
  }
}

function couponFromSerializable(raw: Record<string, unknown>): OwnedCoupon {
  return {
    ...(raw as Omit<OwnedCoupon, 'distributedAt' | 'usedAt' | 'expiresAt'>),
    distributedAt: raw.distributedAt ? new Date(raw.distributedAt as string) : null,
    usedAt: raw.usedAt ? new Date(raw.usedAt as string) : null,
    expiresAt: raw.expiresAt ? new Date(raw.expiresAt as string) : null,
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default function CouponWallet() {
  const { t, i18n } = useTranslation()
  const { currentUser } = useAuth()
  const [tab, setTab] = useState<WalletTab>('unused')
  const [unusedCoupons, setUnusedCoupons] = useState<OwnedCoupon[]>([])
  const [usedCoupons, setUsedCoupons] = useState<OwnedCoupon[]>([])
  const [presenting, setPresenting] = useState<OwnedCoupon | null>(null)
  const [marking, setMarking] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [unusedError, setUnusedError] = useState(false)
  const [usedError, setUsedError] = useState(false)
  const [showUsedTab, setShowUsedTab] = useState(false)
  const processedIds = useRef(new Set<string>())
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setUnusedError(false)

    // キャッシュがあれば即時反映（stale-while-revalidate）
    const cached = readCouponCache()
    if (cached) {
      setUnusedCoupons(cached.map(couponFromSerializable))
    }

    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'unused'),
      orderBy('distributedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setUnusedError(false)
      const coupons = snap.docs.map((d) => mapCoupon(d))
      setUnusedCoupons(coupons)
      writeCouponCache(coupons.map(couponToSerializable))
    }, (err) => {
      console.error('未使用クーポン購読エラー:', err)
      setUnusedError(true)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser || !showUsedTab) return
    setUsedError(false)
    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'used'),
      orderBy('usedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setUsedError(false)
      setUsedCoupons(snap.docs.map((d) => mapCoupon(d)))
    }, (err) => {
      console.error('使用済みクーポン購読エラー:', err)
      setUsedError(true)
    })
  }, [currentUser, showUsedTab])

  function mapCoupon(d: import('firebase/firestore').QueryDocumentSnapshot): OwnedCoupon {
    const data = d.data()
    return {
      id: d.id,
      title: data.title as string | undefined,
      description: data.description as string | undefined,
      titleJa: data.titleJa as string | undefined,
      titleEn: data.titleEn as string | undefined,
      titleVi: data.titleVi as string | undefined,
      descriptionJa: data.descriptionJa as string | undefined,
      descriptionEn: data.descriptionEn as string | undefined,
      descriptionVi: data.descriptionVi as string | undefined,
      discountAmount: toSafeNumber(data.discountAmount),
      status: data.status as 'unused' | 'used',
      distributedAt: (data.distributedAt as TimestampType | null)?.toDate() ?? null,
      usedAt: (data.usedAt as TimestampType | null)?.toDate() ?? null,
      expiresAt: (data.expiresAt as TimestampType | null)?.toDate() ?? null,
    }
  }

  function isExpired(c: OwnedCoupon): boolean {
    if (!c.expiresAt) return false
    const expMs = c.expiresAt.getTime()
    if (Number.isNaN(expMs)) return false
    return Date.now() > expMs
  }

  // onSnapshot にインデックス未作成のフォールバックが効かない場合でも
  // processedIds に入っているIDは未使用リストから除外する
  const visibleUnused = unusedCoupons.filter((c) => !processedIds.current.has(c.id))
  const validUnusedCount = visibleUnused.filter((c) => !isExpired(c)).length
  // 使えるものを上に、期限切れを下に並べる
  const sortedUnused = [...visibleUnused].sort((a, b) => {
    const aExpired = isExpired(a)
    const bExpired = isExpired(b)
    if (aExpired && !bExpired) return 1
    if (!aExpired && bExpired) return -1
    const aTime = a.distributedAt?.getTime() ?? 0
    const bTime = b.distributedAt?.getTime() ?? 0
    return bTime - aTime
  })

  async function handleUse(coupon: OwnedCoupon) {
    if (!currentUser || marking) return

    // ── 防御1: UIの物理ロック ──
    setMarking(true)
    setPresenting(null)

    // ── 防御2: 楽観的UI更新 ──
    processedIds.current.add(coupon.id)
    setUnusedCoupons((prev) => prev.filter((c) => c.id !== coupon.id))

    const amount = toSafeNumber(coupon.discountAmount)
    const couponRef = doc(db, 'users', currentUser.uid, 'coupons', coupon.id)
    const userRef = doc(db, 'users', currentUser.uid)

    try {
      await runTransaction(db, async (tx) => {
        // ── READ フェーズ（すべての get を先に完了させる） ──
        const couponSnap = await tx.get(couponRef)
        const userSnap = amount > 0 ? await tx.get(userRef) : null

        // ── 検証 ──
        if (!couponSnap.exists()) {
          throw new Error(ERR_COUPON_NOT_FOUND)
        }
        if (couponSnap.data().status === 'used') {
          throw new Error(ERR_COUPON_ALREADY_USED)
        }
        const exp = couponSnap.data().expiresAt as TimestampType | null
        if (exp && new Date() > exp.toDate()) {
          throw new Error(ERR_COUPON_EXPIRED)
        }

        // ── WRITE フェーズ（get の後にまとめて実行） ──
        const now = Timestamp.now()
        tx.update(couponRef, {
          status: 'used',
          usedAt: now,
        })

        if (amount > 0 && userSnap) {
          const currentTotal = toSafeNumber(userSnap.data()?.totalSavedAmount)
          tx.update(userRef, {
            totalSavedAmount: currentTotal + amount,
          })
        }
      })

      showToast(
        amount > 0
          ? t('coupon.savedAmount', { amount })
          : t('coupon.usedToast'),
      )
    } catch (err) {
      console.error('クーポン使用処理エラー:', err)
      const msg = err instanceof Error ? err.message : ''

      if (msg === ERR_COUPON_ALREADY_USED) {
        showToast(t('coupon.alreadyUsed'))
      } else {
        processedIds.current.delete(coupon.id)
        setUnusedCoupons((prev) =>
          prev.some((c) => c.id === coupon.id) ? prev : [...prev, coupon],
        )
        if (msg === ERR_COUPON_EXPIRED) {
          showToast(t('coupon.expired'))
        } else if (msg === ERR_COUPON_NOT_FOUND) {
          showToast(t('coupon.notFound'))
        } else {
          showToast(t('coupon.failedToast'))
        }
      }
    } finally {
      setMarking(false)
    }
  }

  const displayCoupons = tab === 'unused' ? sortedUnused : usedCoupons

  const presentingTexts = presenting
    ? resolveCouponTexts(presenting, i18n.language)
    : null

  return (
    <>
      <div className="flex mx-4 rounded-xl bg-[#e5e5ea]/60 p-1 flex-shrink-0 mb-2">
        <button
          onClick={() => {
            setTab('unused')
            setShowUsedTab(false)
          }}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
            tab === 'unused' ? 'bg-white text-[#0095B6] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          {t('coupon.tabUnused', { count: validUnusedCount })}
        </button>
        <button
          onClick={() => {
            setTab('history')
            setShowUsedTab(true)
          }}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
            tab === 'history' ? 'bg-white text-[#0095B6] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          {t('coupon.tabHistory', { count: usedCoupons.length })}
        </button>
      </div>

      {/* クーポン一覧 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* インデックス構築中などのエラー表示 */}
        {((tab === 'unused' && unusedError) || (tab === 'history' && usedError)) ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 border-2 border-[#e5e5ea] border-t-[#0095B6] rounded-full animate-spin mb-4" />
            <p className="text-[#86868b] text-sm">{t('coupon.preparing')}</p>
            <p className="text-[#86868b]/70 text-xs mt-1">{t('coupon.pleaseWait')}</p>
          </div>
        ) : displayCoupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#0095B6]/10 flex items-center justify-center mb-4">
              <span className="text-3xl opacity-50">🎫</span>
            </div>
            <p className="text-[#86868b] text-sm">
              {tab === 'unused' ? t('coupon.emptyUnused') : t('coupon.emptyHistory')}
            </p>
            <p className="text-[#86868b]/70 text-xs mt-1">
              {tab === 'unused' ? t('coupon.emptyUnusedHint') : t('coupon.emptyHistoryHint')}
            </p>
          </div>
        ) : (
          displayCoupons.map((c) => {
            const { title: couponTitle, description: couponDesc } = resolveCouponTexts(c, i18n.language)
            const isUsed = c.status === 'used'
            const expired = !isUsed && isExpired(c)
            const canUse = !isUsed && !expired && !marking
            return (
              <button
                key={c.id}
                onClick={() => canUse && setPresenting(c)}
                disabled={isUsed || expired || marking}
                className="w-full text-left group"
              >
                <div className={`relative flex rounded-2xl overflow-hidden border transition ${
                  isUsed || expired
                    ? 'border-[#e5e5ea] opacity-70'
                    : 'border-[#e5e5ea] hover:border-[#0095B6]/40'
                } bg-white shadow-sm`}>
                  <div className={`w-12 flex flex-col items-center justify-center flex-shrink-0 relative ${
                    isUsed || expired
                      ? 'bg-[#e5e5ea]'
                      : 'bg-[#0095B6]'
                  }`}>
                    <span className={`text-lg ${isUsed || expired ? 'grayscale opacity-60' : ''}`}>🎫</span>
                    <div className="absolute -right-2 top-1/4 w-4 h-4 rounded-full bg-white" />
                    <div className="absolute -right-2 bottom-1/4 w-4 h-4 rounded-full bg-white" />
                  </div>

                  <div className="flex-1 p-3 pl-4 border-l border-dashed border-[#e5e5ea]">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-semibold text-sm ${isUsed ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                        {couponTitle}
                      </p>
                      {c.discountAmount > 0 && (
                        <span className={`text-xs font-bold flex-shrink-0 ${isUsed ? 'text-[#86868b]' : 'text-[#0095B6]'}`}>
                          ¥{c.discountAmount}
                        </span>
                      )}
                    </div>
                    {couponDesc && (
                      <p className="text-[#86868b] text-xs mt-0.5 line-clamp-1">{couponDesc}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#86868b] text-[10px]">
                        {t('coupon.distributed', { date: formatDate(c.distributedAt) })}
                        {c.expiresAt && (
                          <span className="ml-1">{t('coupon.validUntil', { date: formatDate(c.expiresAt) })}</span>
                        )}
                      </span>
                      {isUsed ? (
                        <span className="text-[#86868b] text-[10px]">
                          {t('coupon.usedAt', { datetime: formatDateTime(c.usedAt) })}
                        </span>
                      ) : expired ? (
                        <span className="text-[#FF3B30] text-[10px]">{t('coupon.expiredLabel')}</span>
                      ) : (
                        <span className="text-[#0095B6] text-[10px] group-hover:text-[#007A96] transition">
                          {t('coupon.tapToUse')}
                        </span>
                      )}
                    </div>
                  </div>

                  {isUsed && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-[#e5e5ea] text-4xl font-black tracking-widest rotate-[-15deg]">
                        USED
                      </span>
                    </div>
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* 使用確認オーバーレイ */}
      {presenting && presentingTexts && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-sm my-auto">
            <div className="rounded-2xl overflow-hidden border border-[#e5e5ea] bg-white shadow-2xl flex flex-col max-h-[85dvh]">
              <div className="bg-[#0095B6] py-3 text-center flex-shrink-0">
                <span className="inline-block text-2xl animate-[coupon-float_2s_ease-in-out_infinite]" aria-hidden>🎫</span>
                <p className="text-white font-bold text-xs tracking-widest mt-1">{t('coupon.vipCoupon')}</p>
              </div>

              <div className="flex-1 overflow-y-auto overscroll-contain p-6 text-center space-y-4">
                <h2 className="text-[#1d1d1f] font-semibold text-xl">{presentingTexts.title}</h2>
                {presentingTexts.description && (
                  <div className="text-[#86868b] text-sm text-left space-y-1.5">
                    {presentingTexts.description.split(/\r?\n|\r/).map((line, i) => {
                      const trimmed = line.trim()
                      if (!trimmed) return <div key={i} className="h-2" />
                      const bulletMatch = trimmed.match(/^[-•*・]\s+(.+)$/)
                      const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/)
                      if (bulletMatch) {
                        return (
                          <div key={i} className="flex gap-2">
                            <span className="flex-shrink-0 text-[#0095B6]">•</span>
                            <span>{bulletMatch[1]}</span>
                          </div>
                        )
                      }
                      if (numberedMatch) {
                        return (
                          <div key={i} className="flex gap-2">
                            <span className="flex-shrink-0 font-medium">{numberedMatch[1]}.</span>
                            <span>{numberedMatch[2]}</span>
                          </div>
                        )
                      }
                      return (
                        <p key={i} className="leading-relaxed">
                          {trimmed}
                        </p>
                      )
                    })}
                  </div>
                )}
                {presenting.discountAmount > 0 && (
                  <p className="text-[#0095B6] text-2xl font-bold">¥{presenting.discountAmount}</p>
                )}
                <div className="border-t border-dashed border-[#e5e5ea] pt-4">
                  <p className="text-[#86868b] text-[10px]">
                    {t('coupon.distributed', { date: formatDate(presenting.distributedAt) })}
                    {presenting.expiresAt && (
                      <span>{t('coupon.validThrough', { date: formatDate(presenting.expiresAt) })}</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 space-y-3 flex-shrink-0 border-t border-[#e5e5ea]">
                <p className="text-center text-[#86868b] text-xs">
                  {t('coupon.showToStaff')}
                </p>
                <button
                  onClick={() => handleUse(presenting)}
                  disabled={marking}
                  className="relative w-full bg-[#0095B6] text-white font-semibold py-3 rounded-2xl text-sm hover:bg-[#007A96] transition disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                >
                  <span
                    className="absolute inset-0 bg-[length:200%_100%] bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.55)_45%,rgba(255,255,255,0.55)_55%,transparent_100%)] animate-[coupon-shimmer_1.8s_ease-in-out_infinite] pointer-events-none"
                    aria-hidden
                  />
                  <span className="relative z-10">
                  {marking ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t('coupon.processing')}
                    </span>
                  ) : t('coupon.markUsed')}
                  </span>
                </button>
                <button
                  onClick={() => !marking && setPresenting(null)}
                  disabled={marking}
                  className="w-full text-[#86868b] text-xs py-2 hover:text-[#1d1d1f] transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {t('coupon.cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast通知 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-[fadeInUp_0.3s_ease-out]">
          <div className="bg-[#1d1d1f] text-white text-sm px-5 py-3 rounded-2xl shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </>
  )
}
