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
    }
  }

  // onSnapshot にインデックス未作成のフォールバックが効かない場合でも
  // processedIds に入っているIDは未使用リストから除外する
  const visibleUnused = unusedCoupons.filter((c) => !processedIds.current.has(c.id))

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
      {/* タブ切り替え */}
      <div className="flex mx-4 rounded-lg bg-white/[0.03] p-0.5 flex-shrink-0 mb-2">
        <button
          onClick={() => setTab('unused')}
          className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition ${
            tab === 'unused' ? 'bg-[#1a1a2e] text-amber-400 shadow-sm' : 'text-white/30'
          }`}
        >
          未使用 ({visibleUnused.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition ${
            tab === 'history' ? 'bg-[#1a1a2e] text-amber-400 shadow-sm' : 'text-white/30'
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
            <div className="w-10 h-10 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-4" />
            <p className="text-white/40 text-sm">データを準備中です…</p>
            <p className="text-white/20 text-xs mt-1">しばらくお待ちください</p>
          </div>
        ) : displayCoupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-amber-400/5 flex items-center justify-center mb-4">
              <span className="text-3xl opacity-30">🎫</span>
            </div>
            <p className="text-white/30 text-sm">
              {tab === 'unused' ? 'クーポンはまだありません' : '使用履歴はありません'}
            </p>
            <p className="text-white/20 text-xs mt-1">
              {tab === 'unused' ? '店長からの配信をお待ちください' : 'クーポンを使うとここに表示されます'}
            </p>
          </div>
        ) : (
          displayCoupons.map((c) => {
            const isUsed = c.status === 'used'
            return (
              <button
                key={c.id}
                onClick={() => !isUsed && !marking && setPresenting(c)}
                disabled={isUsed || marking}
                className="w-full text-left group"
              >
                <div className={`relative flex rounded-xl overflow-hidden border transition ${
                  isUsed
                    ? 'border-white/5 opacity-60'
                    : 'border-amber-400/20 hover:border-amber-400/40'
                } bg-gradient-to-r from-[#1a1a2e] to-[#16213e]`}>
                  <div className={`w-12 flex flex-col items-center justify-center flex-shrink-0 relative ${
                    isUsed
                      ? 'bg-gradient-to-b from-white/10 to-white/5'
                      : 'bg-gradient-to-b from-amber-400 to-yellow-600'
                  }`}>
                    <span className={`text-lg ${isUsed ? 'grayscale opacity-50' : ''}`}>🎫</span>
                    <div className="absolute -right-2 top-1/4 w-4 h-4 rounded-full bg-[#0f0f23]" />
                    <div className="absolute -right-2 bottom-1/4 w-4 h-4 rounded-full bg-[#0f0f23]" />
                  </div>

                  <div className="flex-1 p-3 pl-4 border-l border-dashed border-amber-400/20">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`font-bold text-sm ${isUsed ? 'text-white/40' : 'text-amber-400'}`}>
                        {c.title}
                      </p>
                      {c.discountAmount > 0 && (
                        <span className={`text-xs font-bold flex-shrink-0 ${isUsed ? 'text-white/30' : 'text-amber-400'}`}>
                          ¥{c.discountAmount}
                        </span>
                      )}
                    </div>
                    {c.description && (
                      <p className="text-white/40 text-xs mt-0.5 line-clamp-1">{c.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-white/20 text-[10px]">
                        {formatDate(c.distributedAt)} 配信
                      </span>
                      {isUsed ? (
                        <span className="text-white/25 text-[10px]">
                          {formatDateTime(c.usedAt)} 使用
                        </span>
                      ) : (
                        <span className="text-amber-400/60 text-[10px] group-hover:text-amber-400 transition">
                          タップして使用 →
                        </span>
                      )}
                    </div>
                  </div>

                  {isUsed && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="text-white/[0.07] text-4xl font-black tracking-widest rotate-[-15deg]">
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
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="rounded-2xl overflow-hidden border-2 border-amber-400/40 bg-gradient-to-br from-[#1a1a2e] to-[#0f0f23]">
              <div className="bg-gradient-to-r from-amber-400 to-yellow-600 py-3 text-center">
                <span className="text-2xl">🎫</span>
                <p className="text-black font-bold text-xs tracking-widest mt-1">VIP COUPON</p>
              </div>

              <div className="p-6 text-center space-y-4">
                <h2 className="text-amber-400 font-bold text-xl">{presenting.title}</h2>
                {presenting.description && (
                  <p className="text-white/60 text-sm">{presenting.description}</p>
                )}
                {presenting.discountAmount > 0 && (
                  <p className="text-amber-400 text-2xl font-black">¥{presenting.discountAmount}</p>
                )}
                <div className="border-t border-dashed border-white/10 pt-4">
                  <p className="text-white/20 text-[10px]">
                    {formatDate(presenting.distributedAt)} 配信
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 space-y-3">
                <p className="text-center text-white/30 text-xs">
                  この画面を店員にお見せください
                </p>
                <button
                  onClick={() => handleUse(presenting)}
                  disabled={marking}
                  className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold py-3 rounded-xl text-sm hover:from-amber-400 hover:to-yellow-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {marking ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      処理中...
                    </span>
                  ) : '✓ 使用済みにする'}
                </button>
                <button
                  onClick={() => !marking && setPresenting(null)}
                  disabled={marking}
                  className="w-full text-white/30 text-xs py-2 hover:text-white/50 transition disabled:opacity-30 disabled:cursor-not-allowed"
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
          <div className="bg-[#1a1a2e] border border-amber-400/20 text-white text-sm px-5 py-3 rounded-xl shadow-2xl shadow-black/50">
            {toast}
          </div>
        </div>
      )}
    </>
  )
}
