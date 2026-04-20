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

interface BannerStat {
  id: string
  label: string
  count: number
}

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
  bannerStats: BannerStat[]
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

function periodLabel(p: Period): string {
  return p === '7d' ? '7日間' : p === '30d' ? '30日間' : '全期間'
}

function escapeCsvField(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function buildAnalyticsCsv(data: AnalyticsData, period: Period): string {
  const lines: string[] = []
  const pLabel = periodLabel(period)
  const generated = new Date().toISOString()

  lines.push(`分析レポート,期間:${pLabel},生成:${generated}`)
  lines.push('')
  lines.push('サマリー')
  lines.push(['指標', '値'].map(escapeCsvField).join(','))
  lines.push(['クーポン利用率(%)', data.couponUsageRate].map(escapeCsvField).join(','))
  lines.push(['クーポン配布数', data.couponDistributed].map(escapeCsvField).join(','))
  lines.push(['クーポン使用数', data.couponUsed].map(escapeCsvField).join(','))
  lines.push(['チャットメッセージ数', data.totalMessages].map(escapeCsvField).join(','))
  lines.push(['会員メッセージ数', data.customerMessages].map(escapeCsvField).join(','))
  lines.push(['管理者メッセージ数', data.adminMessages].map(escapeCsvField).join(','))
  lines.push(['アクティブ会員（チャットした会員数）', data.activeChats].map(escapeCsvField).join(','))
  lines.push(['新規登録数', data.newUsers].map(escapeCsvField).join(','))
  lines.push(['累計会員数', data.totalUsers].map(escapeCsvField).join(','))
  lines.push(['累計節約額', data.totalSavedAmount].map(escapeCsvField).join(','))
  lines.push('')
  lines.push('クーポン（テンプレート別）')
  lines.push(['クーポン名', '配布', '使用', '利用率(%)'].map(escapeCsvField).join(','))
  for (const row of data.byTemplate) {
    lines.push(
      [row.title, row.distributed, row.used, row.rate].map(escapeCsvField).join(','),
    )
  }
  lines.push('')
  lines.push('メッセージ数（日別）')
  lines.push(['日付', '件数'].map(escapeCsvField).join(','))
  for (const row of data.byDay) {
    lines.push([row.date, row.messages].map(escapeCsvField).join(','))
  }

  lines.push('')
  lines.push('バナークリック数（累計・参考値）')
  lines.push(['バナーID', 'バナー名', 'クリック数'].map(escapeCsvField).join(','))
  for (const row of data.bannerStats) {
    lines.push([row.id, row.label, row.count].map(escapeCsvField).join(','))
  }

  return '\uFEFF' + lines.join('\r\n')
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

      // 2. 全クーポン（collectionGroup）- 期間内のみ取得して読み取り数を削減
      const couponsSnap = await getDocs(
        start
          ? query(collectionGroup(db, 'coupons'), where('distributedAt', '>=', start))
          : query(collectionGroup(db, 'coupons')),
      )
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

      // 3. 全メッセージ（collectionGroup）- 期間内のみ取得して読み取り数を削減
      const messagesSnap = await getDocs(
        start
          ? query(
              collectionGroup(db, 'messages'),
              where('createdAt', '>=', start),
              orderBy('createdAt', 'desc'),
            )
          : query(
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

      // 5. バナークリック統計（累計・期間フィルタなし）
      const bannerSnap = await getDocs(collection(db, 'bannerStats'))
      const bannerStats: BannerStat[] = bannerSnap.docs
        .map((d) => ({
          id: d.id,
          label: (d.data().label as string) ?? d.id,
          count: (d.data().count as number) ?? 0,
        }))
        .sort((a, b) => b.count - a.count)

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
        bannerStats,
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

  function handleExportCsv() {
    if (!data) return
    const csv = buildAnalyticsCsv(data, period)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_${period}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center py-16">
        <div className="animate-pulse text-[#86868b] text-sm">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5ea] flex-shrink-0 gap-2 flex-wrap">
        <h3 className="text-[#86868b] text-xs font-medium tracking-wide">分析・レポート</h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data || loading}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-[#0095B6] text-white hover:bg-[#007A96] transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            CSV出力
          </button>
          <div className="flex gap-1">
            {(['7d', '30d', 'all'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                  period === p
                    ? 'bg-[#0095B6] text-white'
                    : 'bg-[#f5f5f7] text-[#86868b] hover:text-[#1d1d1f]'
                }`}
              >
                {p === '7d' ? '7日間' : p === '30d' ? '30日間' : '全期間'}
              </button>
            ))}
          </div>
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

          {/* バナークリック統計 */}
          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <h4 className="text-[#1d1d1f] text-sm font-semibold">バナークリック数</h4>
              <span className="text-[#86868b] text-[10px]">累計・参考値（期間フィルタ対象外）</span>
            </div>
            <div className="rounded-xl border border-[#e5e5ea] overflow-hidden max-h-56 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#f5f5f7]">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">バナー名</th>
                    <th className="text-right py-2 px-3 font-medium">クリック数</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bannerStats.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-4 px-3 text-[#86868b] text-center">
                        まだデータがありません
                      </td>
                    </tr>
                  ) : (
                    data.bannerStats.map((row) => (
                      <tr key={row.id} className="border-t border-[#e5e5ea]">
                        <td className="py-2 px-3 truncate max-w-[180px]" title={row.label}>
                          {row.label}
                        </td>
                        <td className="text-right py-2 px-3 font-mono font-semibold text-[#0095B6]">
                          {row.count.toLocaleString()}
                        </td>
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
