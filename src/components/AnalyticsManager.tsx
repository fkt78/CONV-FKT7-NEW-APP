import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  getDocs,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

type Period = '7d' | '30d' | 'all'

interface CouponDoc {
  id: string
  path: string
  couponId?: string
  title: string
  status: 'unused' | 'used'
  distributedAt: Date | null
  usedAt: Date | null
  discountAmount: number
}

interface MessageDoc {
  id: string
  chatId: string
  senderId: string
  createdAt: Date | null
}

interface UserDoc {
  id: string
  createdAt: Date | null
}

interface AnalyticsData {
  couponDistributed: number
  couponUsed: number
  couponUsageRate: number
  totalMessages: number
  customerMessages: number
  adminMessages: number
  activeChats: number
  newUsers: number
  totalUsers: number
  totalSavedAmount: number
  byTemplate: Array<{ title: string; distributed: number; used: number; rate: number }>
  byDay: Array<{ date: string; messages: number }>
}

function getPeriodDates(period: Period): { start: Date | null; end: Date } {
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  if (period === 'all') return { start: null, end }
  const days = period === '7d' ? 7 : 30
  const start = new Date()
  start.setDate(start.getDate() - days)
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function AnalyticsManager() {
  const [period, setPeriod] = useState<Period>('30d')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)

  const fetchAnalytics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { start, end } = getPeriodDates(period)
      const startMs = start?.getTime() ?? 0
      const endMs = end.getTime()

      const inRange = (d: Date | null) => {
        if (!d) return false
        const ms = d.getTime()
        return ms >= startMs && ms <= endMs
      }

      // 1. ユーザー一覧（会員数・新規登録）
      const usersSnap = await getDocs(
        query(collection(db, 'users'), where('status', '==', 'active')),
      )
      const users: UserDoc[] = usersSnap.docs.map((d) => ({
        id: d.id,
        createdAt: (d.data().createdAt as Timestamp | null)?.toDate?.() ?? null,
      }))
      const totalUsers = users.length
      const newUsers = period === 'all'
        ? totalUsers
        : users.filter((u) => inRange(u.createdAt)).length

      // 2. 全クーポン（collectionGroup）- ユーザー保有分のみ（users/*/coupons）
      const couponsSnap = await getDocs(collectionGroup(db, 'coupons'))
      const allCoupons: CouponDoc[] = couponsSnap.docs
        .filter((d) => d.ref.path.startsWith('users/'))
        .map((d) => {
          const x = d.data()
          return {
            id: d.id,
            path: d.ref.path,
            couponId: x.couponId as string | undefined,
            title: (x.title as string) ?? '',
            status: (x.status as 'unused' | 'used') ?? 'unused',
            distributedAt: (x.distributedAt as Timestamp | null)?.toDate?.() ?? null,
            usedAt: (x.usedAt as Timestamp | null)?.toDate?.() ?? null,
            discountAmount: (x.discountAmount as number) ?? 0,
          }
        })

      const couponsInRange = allCoupons.filter((c) => inRange(c.distributedAt))
      const couponDistributed = couponsInRange.length
      const couponUsed = couponsInRange.filter((c) => c.status === 'used').length
      const couponUsageRate = couponDistributed > 0
        ? Math.round((couponUsed / couponDistributed) * 100)
        : 0

      // テンプレート別集計
      const byTemplateMap = new Map<string, { distributed: number; used: number }>()
      for (const c of couponsInRange) {
        const key = c.title || c.couponId || '不明'
        const cur = byTemplateMap.get(key) ?? { distributed: 0, used: 0 }
        cur.distributed++
        if (c.status === 'used') cur.used++
        byTemplateMap.set(key, cur)
      }
      const byTemplate = [...byTemplateMap.entries()].map(([title, v]) => ({
        title,
        distributed: v.distributed,
        used: v.used,
        rate: v.distributed > 0 ? Math.round((v.used / v.distributed) * 100) : 0,
      })).sort((a, b) => b.distributed - a.distributed)

      // 3. 全メッセージ（collectionGroup）
      const messagesSnap = await getDocs(
        query(
          collectionGroup(db, 'messages'),
          orderBy('createdAt', 'desc'),
        ),
      )
      const allMessages: MessageDoc[] = messagesSnap.docs.map((d) => {
        const x = d.data()
        const pathParts = d.ref.path.split('/')
        const chatId = pathParts[1] ?? ''
        return {
          id: d.id,
          chatId,
          senderId: (x.senderId as string) ?? '',
          createdAt: (x.createdAt as Timestamp | null)?.toDate?.() ?? null,
        }
      })

      const messagesInRange = allMessages.filter((m) => inRange(m.createdAt))
      const totalMessages = messagesInRange.length
      const activeChatIds = new Set(messagesInRange.map((m) => m.chatId))
      const activeChats = activeChatIds.size

      const customerMessages = messagesInRange.filter((m) => m.senderId === m.chatId).length
      const adminMessages = totalMessages - customerMessages

      // 日別メッセージ数
      const byDayMap = new Map<string, number>()
      for (const m of messagesInRange) {
        if (m.createdAt) {
          const key = formatDateKey(m.createdAt)
          byDayMap.set(key, (byDayMap.get(key) ?? 0) + 1)
        }
      }
      const byDay = [...byDayMap.entries()]
        .map(([date, messages]) => ({ date, messages }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // 4. 節約額合計（users から）
      let totalSavedAmount = 0
      for (const d of usersSnap.docs) {
        totalSavedAmount += (d.data().totalSavedAmount as number) ?? 0
      }

      setData({
        couponDistributed,
        couponUsed,
        couponUsageRate,
        totalMessages,
        customerMessages,
        adminMessages,
        activeChats,
        newUsers,
        totalUsers,
        totalSavedAmount,
        byTemplate,
        byDay,
      })
    } catch (err) {
      console.error('Analytics fetch error:', err)
      setError(err instanceof Error ? err.message : 'データの取得に失敗しました')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center py-16">
        <div className="animate-pulse text-[#86868b] text-sm">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea] flex-shrink-0">
        <h3 className="text-[#86868b] text-xs font-medium tracking-wide">分析・レポート</h3>
        <div className="flex gap-1">
          {(['7d', '30d', 'all'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                period === p
                  ? 'bg-[#007AFF] text-white'
                  : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
              }`}
            >
              {p === '7d' ? '7日間' : p === '30d' ? '30日間' : '全期間'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-sm">
          {error}
          <button
            onClick={fetchAnalytics}
            className="ml-2 underline"
          >
            再試行
          </button>
        </div>
      )}

      {data && (
        <div className="flex-1 p-4 space-y-6">
          {/* サマリーカード */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-4">
              <p className="text-[#86868b] text-[10px] mb-1">クーポン利用率</p>
              <p className="text-[#1d1d1f] text-xl font-bold">{data.couponUsageRate}%</p>
              <p className="text-[#86868b] text-xs mt-0.5">
                配布 {data.couponDistributed} / 使用 {data.couponUsed}
              </p>
            </div>
            <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-4">
              <p className="text-[#86868b] text-[10px] mb-1">チャット数</p>
              <p className="text-[#1d1d1f] text-xl font-bold">{data.totalMessages}件</p>
              <p className="text-[#86868b] text-xs mt-0.5">
                会員 {data.customerMessages} / 管理者 {data.adminMessages}
              </p>
            </div>
            <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-4">
              <p className="text-[#86868b] text-[10px] mb-1">アクティブ会員</p>
              <p className="text-[#1d1d1f] text-xl font-bold">{data.activeChats}人</p>
              <p className="text-[#86868b] text-xs mt-0.5">
                期間内にチャットした会員
              </p>
            </div>
            <div className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-4">
              <p className="text-[#86868b] text-[10px] mb-1">新規登録</p>
              <p className="text-[#1d1d1f] text-xl font-bold">{data.newUsers}人</p>
              <p className="text-[#86868b] text-xs mt-0.5">
                累計 {data.totalUsers}人 / 節約額 ¥{data.totalSavedAmount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* クーポン詳細 */}
          <div>
            <h4 className="text-[#1d1d1f] text-sm font-semibold mb-2">クーポン（テンプレート別）</h4>
            <div className="rounded-xl border border-[#e5e5ea] overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#f5f5f7]">
                    <th className="text-left py-2 px-3 font-medium">クーポン名</th>
                    <th className="text-right py-2 px-3">配布</th>
                    <th className="text-right py-2 px-3">使用</th>
                    <th className="text-right py-2 px-3">利用率</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTemplate.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 px-3 text-[#86868b] text-center">
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    data.byTemplate.map((row) => (
                      <tr key={row.title} className="border-t border-[#e5e5ea]">
                        <td className="py-2 px-3 truncate max-w-[120px]" title={row.title}>
                          {row.title}
                        </td>
                        <td className="text-right py-2 px-3">{row.distributed}</td>
                        <td className="text-right py-2 px-3">{row.used}</td>
                        <td className="text-right py-2 px-3">{row.rate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* チャット詳細（日別） */}
          <div>
            <h4 className="text-[#1d1d1f] text-sm font-semibold mb-2">メッセージ数（日別）</h4>
            <div className="rounded-xl border border-[#e5e5ea] overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#f5f5f7]">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">日付</th>
                    <th className="text-right py-2 px-3">件数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDay.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-4 px-3 text-[#86868b] text-center">
                        データがありません
                      </td>
                    </tr>
                  ) : (
                    [...data.byDay].reverse().map((row) => (
                      <tr key={row.date} className="border-t border-[#e5e5ea]">
                        <td className="py-2 px-3">{row.date}</td>
                        <td className="text-right py-2 px-3">{row.messages}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
