import { useState, useEffect, useCallback, useRef } from 'react'
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

type WalletTab = 'unused' | 'history'

interface OwnedCoupon {
  id: string
  title: string
  description: string
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
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function formatDateTime(d: Date | null): string {
  if (!d) return ''
  return d.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function CouponWallet() {
  const { currentUser } = useAuth()
  const [tab, setTab] = useState<WalletTab>('unused')
  const [unusedCoupons, setUnusedCoupons] = useState<OwnedCoupon[]>([])
  const [usedCoupons, setUsedCoupons] = useState<OwnedCoupon[]>([])
  const [presenting, setPresenting] = useState<OwnedCoupon | null>(null)
  const [marking, setMarking] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [unusedError, setUnusedError] = useState(false)
  const [usedError, setUsedError] = useState(false)
  const processedIds = useRef(new Set<string>())

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => {
    if (!currentUser) return
    setUnusedError(false)
    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'unused'),
      orderBy('distributedAt', 'desc'),
    )
    return onSnapshot(q, (snap) => {
      setUnusedError(false)
      setUnusedCoupons(snap.docs.map((d) => mapCoupon(d)))
    }, (err) => {
      console.error('未使用クーポン購読エラー:', err)
      setUnusedError(true)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
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
  }, [currentUser])

  function mapCoupon(d: import('firebase/firestore').QueryDocumentSnapshot): OwnedCoupon {
    const data = d.data()
    return {
      id: d.id,
      title: (data.title as string) ?? '',
      description: (data.description as string) ?? '',
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
          throw new Error('クーポンが見つかりません')
        }
        if (couponSnap.data().status === 'used') {
          throw new Error('このクーポンはすでに使用済みです')
        }
        const exp = couponSnap.data().expiresAt as TimestampType | null
        if (exp && new Date() > exp.toDate()) {
          throw new Error('このクーポンは期限切れです')
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

      showToast(amount > 0 ? `¥${amount} お得になりました！` : 'クーポンを使用しました')
    } catch (err) {
      console.error('クーポン使用処理エラー:', err)
      const msg = err instanceof Error ? err.message : ''

      if (msg.includes('すでに使用済み')) {
        showToast('このクーポンはすでに使用済みです')
      } else {
        // 楽観的UIをロールバック
        processedIds.current.delete(coupon.id)
        setUnusedCoupons((prev) =>
          prev.some((c) => c.id === coupon.id) ? prev : [...prev, coupon],
        )
        showToast('処理に失敗しました。もう一度お試しください。')
      }
    } finally {
      setMarking(false)
    }
  }

  const displayCoupons = tab === 'unused' ? visibleUnused : usedCoupons

  return (
    <>
      <div className="flex mx-4 rounded-xl bg-[#e5e5ea]/60 p-1 flex-shrink-0 mb-2">
        <button
          onClick={() => setTab('unused')}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
            tab === 'unused' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          未使用 ({validUnusedCount})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-2 rounded-lg text-[13px] font-semibold transition ${
            tab === 'history' ? 'bg-white text-[#007AFF] shadow-sm' : 'text-[#86868b]'
          }`}
        >
          使用履歴 ({usedCoupons.length})
        </button>
      </div>

      {/* クーポン一覧 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* インデックス構築中などのエラー表示 */}
        {((tab === 'unused' && unusedError) || (tab === 'history' && usedError)) ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-10 h-10 border-2 border-[#e5e5ea] border-t-[#007AFF] rounded-full animate-spin mb-4" />
            <p className="text-[#86868b] text-sm">データを準備中です…</p>
            <p className="text-[#86868b]/70 text-xs mt-1">しばらくお待ちください</p>
          </div>
        ) : displayCoupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-[#007AFF]/10 flex items-center justify-center mb-4">
              <span className="text-3xl opacity-50">🎫</span>
            </div>
            <p className="text-[#86868b] text-sm">
              {tab === 'unused' ? 'クーポンはまだありません' : '使用履歴はありません'}
            </p>
            <p className="text-[#86868b]/70 text-xs mt-1">
              {tab === 'unused' ? '店長からの配信をお待ちください' : 'クーポンを使うとここに表示されます'}
            </p>
          </div>
        ) : (
          displayCoupons.map((c) => {
            const isUsed = c.status === 'used'
            const expired = !isUsed && isExpired(c)
            const canUse = !isUsed && !expired && !marking
            return (
              <button
                key={c.id}
                onClick={() => canUse && setPresenting(c)}
                disabled={isUsed || marking}
                className="w-full text-left group"
              >
                <div className={`relative flex rounded-2xl overflow-hidden border transition ${
                  isUsed || expired
                    ? 'border-[#e5e5ea] opacity-70'
                    : 'border-[#e5e5ea] hover:border-[#007AFF]/40'
                } bg-white shadow-sm`}>
                  <div className={`w-12 flex flex-col items-center justify-center flex-shrink-0 relative ${
                    isUsed || expired
                      ? 'bg-[#e5e5ea]'
                      : 'bg-[#007AFF]'
                  }`}>
                    <span className={`text-lg ${isUsed || expired ? 'grayscale opacity-60' : ''}`}>🎫</span>
                    <div className="absolute -right-2 top-1/4 w-4 h-4 rounded-full bg-white" />
                    <div className="absolute -right-2 bottom-1/4 w-4 h-4 rounded-full bg-white" />
                  </div>

                  <div className="flex-1 p-3 pl-4 border-l border-dashed border-[#e5e5ea]">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-semibold text-sm ${isUsed ? 'text-[#86868b]' : 'text-[#1d1d1f]'}`}>
                        {c.title}
                      </p>
                      {c.discountAmount > 0 && (
                        <span className={`text-xs font-bold flex-shrink-0 ${isUsed ? 'text-[#86868b]' : 'text-[#007AFF]'}`}>
                          ¥{c.discountAmount}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-[#86868b] text-xs mt-0.5 line-clamp-1">{c.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[#86868b] text-[10px]">
                        {formatDate(c.distributedAt)} 配信
                        {c.expiresAt && (
                          <span className="ml-1">〜{formatDate(c.expiresAt)}</span>
                        )}
                      </span>
                      {isUsed ? (
                        <span className="text-[#86868b] text-[10px]">
                          {formatDateTime(c.usedAt)} 使用
                        </span>
                      ) : expired ? (
                        <span className="text-[#FF3B30] text-[10px]">期限切れ</span>
                      ) : (
                        <span className="text-[#007AFF] text-[10px] group-hover:text-[#0051D5] transition">
                          タップして使用 →
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
      {presenting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl overflow-hidden border border-[#e5e5ea] bg-white shadow-2xl">
              <div className="bg-[#007AFF] py-3 text-center">
                <span className="text-2xl">🎫</span>
                <p className="text-white font-bold text-xs tracking-widest mt-1">VIP COUPON</p>
              </div>

              <div className="p-6 text-center space-y-4">
                <h2 className="text-[#1d1d1f] font-semibold text-xl">{presenting.title}</h2>
                {presenting.description && (
                  <p className="text-[#86868b] text-sm">{presenting.description}</p>
                )}
                {presenting.discountAmount > 0 && (
                  <p className="text-[#007AFF] text-2xl font-bold">¥{presenting.discountAmount}</p>
                )}
                <div className="border-t border-dashed border-[#e5e5ea] pt-4">
                  <p className="text-[#86868b] text-[10px]">
                    {formatDate(presenting.distributedAt)} 配信
                    {presenting.expiresAt && (
                      <span> 〜 {formatDate(presenting.expiresAt)} まで有効</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-3">
                <p className="text-center text-[#86868b] text-xs">
                  この画面を店員にお見せください
                </p>
                <button
                  onClick={() => handleUse(presenting)}
                  disabled={marking}
                  className="w-full bg-[#007AFF] text-white font-semibold py-3 rounded-2xl text-sm hover:bg-[#0051D5] transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {marking ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      処理中...
                    </span>
                  ) : '✓ 使用済みにする'}
                </button>
                <button
                  onClick={() => !marking && setPresenting(null)}
                  disabled={marking}
                  className="w-full text-[#86868b] text-xs py-2 hover:text-[#1d1d1f] transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  キャンセル
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
