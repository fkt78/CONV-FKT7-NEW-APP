import { useState, useEffect, useRef, useMemo } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  doc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore'
import { db, functions, httpsCallable } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import RefreshButton from './RefreshButton'

interface UserRecord {
  uid: string
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  status: string
  yellowCards: number
  totalSavedAmount: number
  usedCouponCount: number
  memberNumber: number | null
  /** 例: food_support（食料支援）。管理者のみ編集 */
  memberGroups: string[]
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

const STATUS_LABELS: Record<string, string> = {
  active: '有効',
  blacklisted: 'ブラックリスト',
}

type UserSortKey =
  | 'memberNumber'
  | 'fullName'
  | 'email'
  | 'attribute'
  | 'birthMonth'
  | 'status'
  | 'totalSavedAmount'

function sortUsersList(
  list: UserRecord[],
  sortKey: UserSortKey,
  sortDir: 'asc' | 'desc',
): UserRecord[] {
  const mul = sortDir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case 'memberNumber': {
        const av = a.memberNumber
        const bv = b.memberNumber
        if (av == null && bv == null) cmp = 0
        else if (av == null) cmp = 1
        else if (bv == null) cmp = -1
        else cmp = av - bv
        break
      }
      case 'fullName':
        cmp = a.fullName.localeCompare(b.fullName, 'ja')
        break
      case 'email':
        cmp = a.email.localeCompare(b.email, 'ja', { sensitivity: 'base' })
        break
      case 'attribute':
        cmp = a.attribute.localeCompare(b.attribute, 'ja')
        break
      case 'birthMonth':
        cmp = a.birthMonth.localeCompare(b.birthMonth, 'ja')
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
      case 'totalSavedAmount':
        cmp = (a.totalSavedAmount ?? 0) - (b.totalSavedAmount ?? 0)
        break
      default:
        cmp = 0
    }
    if (cmp !== 0) return mul * cmp
    return a.uid.localeCompare(b.uid)
  })
}

interface UserManagerProps {
  onOpenChat?: (uid: string) => void
  onSendToSelected?: (uids: string[]) => void
}

function escapeCsvField(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

interface UserCoupon {
  id: string
  title: string
  discountAmount: number
  status: 'unused' | 'used'
  distributedAt: Date | null
  distributedDate: string
  expiresAt: Date | null
  usedAt: Date | null
  isExpired?: boolean
}

export default function UserManager({ onOpenChat, onSendToSelected }: UserManagerProps) {
  const { currentUser } = useAuth()
  const [users, setUsers] = useState<UserRecord[]>([])
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [updatingUid, setUpdatingUid] = useState<string | null>(null)
  const [assigningNumbers, setAssigningNumbers] = useState(false)
  const [couponModalUser, setCouponModalUser] = useState<UserRecord | null>(null)
  const [userCoupons, setUserCoupons] = useState<UserCoupon[]>([])
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [sortKey, setSortKey] = useState<UserSortKey>('memberNumber')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersRefreshKey, setUsersRefreshKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setUsersLoading(true)
    getDocs(query(collection(db, 'users')))
      .then((snap) => {
        if (cancelled) return
        setUsers(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              uid: d.id,
              fullName: (data.fullName as string) ?? '',
              email: (data.email as string) ?? '',
              attribute: (data.attribute as string) ?? '',
              birthMonth: (data.birthMonth as string) ?? '',
              status: (data.status as string) ?? 'active',
              yellowCards: (data.yellowCards as number) ?? 0,
              totalSavedAmount: (data.totalSavedAmount as number) ?? 0,
              usedCouponCount: 0,
              memberNumber: (data.memberNumber as number) ?? null,
              memberGroups: Array.isArray(data.memberGroups) ? (data.memberGroups as string[]) : [],
            }
          }),
        )
        setUsersLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('[UserManager] users フェッチエラー:', err)
        setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [usersRefreshKey])

  async function handleExportCsv() {
    setExporting(true)
    try {
      const usersSnap = await getDocs(collection(db, 'users'))
      const rows: UserRecord[] = []

      for (const d of usersSnap.docs) {
        const data = d.data()
        const uid = d.id

        const usedSnap = await getDocs(
          query(
            collection(db, 'users', uid, 'coupons'),
            where('status', '==', 'used'),
          ),
        )

        rows.push({
          uid,
          fullName: (data.fullName as string) ?? '',
          email: (data.email as string) ?? '',
          attribute: (data.attribute as string) ?? '',
          birthMonth: (data.birthMonth as string) ?? '',
          status: (data.status as string) ?? 'active',
          yellowCards: (data.yellowCards as number) ?? 0,
          totalSavedAmount: (data.totalSavedAmount as number) ?? 0,
          usedCouponCount: usedSnap.size,
          memberNumber: (data.memberNumber as number) ?? null,
          memberGroups: Array.isArray(data.memberGroups) ? (data.memberGroups as string[]) : [],
        })
      }

      const header = [
        '会員番号',
        'uid',
        '氏名',
        'メール',
        '属性',
        '誕生月',
        'メンバーグループ',
        'ステータス',
        '累計節約額',
        'クーポン使用回数',
      ]
      const csvRows = rows.map((r) => [
        escapeCsvField(r.memberNumber ?? ''),
        escapeCsvField(r.uid),
        escapeCsvField(r.fullName),
        escapeCsvField(r.email),
        escapeCsvField(ATTRIBUTE_LABELS[r.attribute] ?? r.attribute),
        escapeCsvField(r.birthMonth),
        escapeCsvField(r.memberGroups.join(';')),
        escapeCsvField(STATUS_LABELS[r.status] ?? r.status),
        escapeCsvField(r.totalSavedAmount),
        escapeCsvField(r.usedCouponCount),
      ].join(','))
      const csv = '\uFEFF' + [header.join(','), ...csvRows].join('\r\n')

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users_${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSVエクスポートエラー:', err)
      alert('CSVの出力に失敗しました')
    } finally {
      setExporting(false)
    }
  }

  async function handleAssignMemberNumbers() {
    const withoutNumber = users.filter((u) => u.memberNumber == null && u.status === 'active')
    if (withoutNumber.length === 0) {
      alert('会員番号が未割り当てのユーザーがいません')
      return
    }
    if (!confirm(`${withoutNumber.length}名に会員番号を割り当てますか？`)) return
    setAssigningNumbers(true)
    try {
      const assign = httpsCallable<unknown, { assigned: number; message: string }>(functions, 'assignMemberNumbers')
      const res = await assign()
      alert(res.data.message)
    } catch (err) {
      console.error('会員番号割り当てエラー:', err)
      alert((err as { message?: string })?.message ?? '会員番号の割り当てに失敗しました')
    } finally {
      setAssigningNumbers(false)
    }
  }

  async function handleStatusChange(user: UserRecord) {
    if (user.uid === currentUser?.uid) {
      alert('自分自身のステータスは変更できません')
      return
    }
    const nextStatus = user.status === 'active' ? 'blacklisted' : 'active'
    if (nextStatus === 'blacklisted') {
      if (!confirm(`${user.fullName}さんをブラックリストに追加しますか？\nログインできなくなります。`)) return
    } else {
      if (!confirm(`${user.fullName}さんのアクセスを復元しますか？`)) return
    }
    setUpdatingUid(user.uid)
    try {
      await updateDoc(doc(db, 'users', user.uid), { status: nextStatus })
      setUsersRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('ステータス変更エラー:', err)
      alert('ステータスの変更に失敗しました')
    } finally {
      setUpdatingUid(null)
    }
  }

  async function handleYellowCard(user: UserRecord, delta: number) {
    if (user.uid === currentUser?.uid) return
    const next = Math.max(0, user.yellowCards + delta)
    const label = delta > 0 ? 'イエローカードを付与' : 'イエローカードを取消'
    if (!confirm(`${user.fullName}さんに${label}しますか？（${user.yellowCards}枚→${next}枚）${next >= 3 ? '\n⚠️ 3枚到達のためブラックリストに入ります' : ''}`)) return
    setUpdatingUid(user.uid)
    try {
      const update: Record<string, unknown> = { yellowCards: next }
      if (next >= 3 && user.status === 'active') update.status = 'blacklisted'
      if (next < 3 && user.status === 'blacklisted') update.status = 'active'
      await updateDoc(doc(db, 'users', user.uid), update)
      setUsersRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('イエローカード更新エラー:', err)
      alert('更新に失敗しました')
    } finally {
      setUpdatingUid(null)
    }
  }

  async function handleRedCard(user: UserRecord) {
    if (user.uid === currentUser?.uid) return
    if (!confirm(`${user.fullName}さんにレッドカードを出しますか？\n即座にブラックリストに入ります。`)) return
    setUpdatingUid(user.uid)
    try {
      await updateDoc(doc(db, 'users', user.uid), { status: 'blacklisted', yellowCards: 3 })
      setUsersRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('レッドカード更新エラー:', err)
      alert('更新に失敗しました')
    } finally {
      setUpdatingUid(null)
    }
  }

  async function handleToggleFoodSupport(user: UserRecord) {
    if (user.uid === currentUser?.uid) return
    const has = user.memberGroups.includes('food_support')
    const next = has
      ? user.memberGroups.filter((g) => g !== 'food_support')
      : [...user.memberGroups, 'food_support']
    setUpdatingUid(user.uid)
    try {
      await updateDoc(doc(db, 'users', user.uid), { memberGroups: next })
      setUsersRefreshKey((k) => k + 1)
    } catch (err) {
      console.error('食料支援フラグ更新エラー:', err)
      alert('更新に失敗しました')
    } finally {
      setUpdatingUid(null)
    }
  }

  const sortedUsers = useMemo(
    () => sortUsersList(users, sortKey, sortDir),
    [users, sortKey, sortDir],
  )

  function toggleUserSort(key: UserSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const couponFetchIdRef = useRef(0)

  async function handleOpenCouponModal(user: UserRecord) {
    const fetchId = ++couponFetchIdRef.current
    setCouponModalUser(user)
    setLoadingCoupons(true)
    setUserCoupons([])
    try {
      const snap = await getDocs(
        query(
          collection(db, 'users', user.uid, 'coupons'),
          orderBy('distributedAt', 'desc'),
        ),
      )
      if (couponFetchIdRef.current !== fetchId) return
      const now = Date.now()
      setUserCoupons(
        snap.docs.map((d) => {
          const data = d.data()
          const exp = data.expiresAt as Timestamp | null
          const expAt = exp?.toDate?.() ?? null
          const isExpired = expAt && now > expAt.getTime()
          return {
            id: d.id,
            title: ((data.titleJa as string) ?? (data.title as string)) ?? '',
            discountAmount: (data.discountAmount as number) ?? 0,
            status: data.status as 'unused' | 'used',
            distributedAt: (data.distributedAt as Timestamp | null)?.toDate?.() ?? null,
            distributedDate: (data.distributedDate as string) ?? '',
            expiresAt: expAt,
            usedAt: (data.usedAt as Timestamp | null)?.toDate?.() ?? null,
            isExpired: isExpired ?? false,
          }
        }),
      )
    } catch (err) {
      if (couponFetchIdRef.current !== fetchId) return
      console.error('クーポン取得エラー:', err)
      setUserCoupons([])
    } finally {
      if (couponFetchIdRef.current === fetchId) setLoadingCoupons(false)
    }
  }

  function formatDate(d: Date | null): string {
    if (!d) return '—'
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  const selectableUsers = sortedUsers.filter(
    (u) => u.status === 'active' && u.uid !== currentUser?.uid,
  )

  function toggleSelect(uid: string) {
    setSelectedUids((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedUids.size >= selectableUsers.length) {
      setSelectedUids(new Set())
    } else {
      setSelectedUids(new Set(selectableUsers.map((u) => u.uid)))
    }
  }

  function handleSendToSelected() {
    const uids = Array.from(selectedUids)
    if (uids.length === 0) {
      alert('送信先の会員を選択してください')
      return
    }
    onSendToSelected?.(uids)
    setSelectedUids(new Set())
  }

  function sortHeader(
    label: string,
    key: UserSortKey,
    opts?: { align?: 'left' | 'right' | 'center'; nowrap?: boolean },
  ) {
    const align = opts?.align ?? 'left'
    const alignClass =
      align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
    const active = sortKey === key
    const btnRow = align === 'right' ? 'w-full justify-end' : ''
    return (
      <th
        className={`${alignClass} px-4 py-3 text-[#86868b] font-medium ${opts?.nowrap ? 'whitespace-nowrap' : ''}`}
      >
        <button
          type="button"
          onClick={() => toggleUserSort(key)}
          className={`inline-flex items-center gap-1 hover:text-[#1d1d1f] transition ${btnRow} ${
            active ? 'text-[#1d1d1f] font-semibold' : ''
          }`}
          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          <span>{label}</span>
          <span
            className={`inline-flex w-4 justify-center text-[10px] ${active ? 'text-[#0095B6]' : 'text-[#c7c7cc]'}`}
            aria-hidden
          >
            {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f5f5f7]">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea]">
        <h2 className="text-[#1d1d1f] text-sm font-semibold">ユーザー管理</h2>
        <div className="flex items-center gap-2">
          <RefreshButton
            onRefresh={async () => setUsersRefreshKey((k) => k + 1)}
            loading={usersLoading}
          />
          {onSendToSelected && selectableUsers.length > 0 && (
            <button
              onClick={handleSendToSelected}
              disabled={selectedUids.size === 0}
              className="px-4 py-2 bg-[#FF9500] text-white text-sm font-medium rounded-lg hover:bg-[#E68600] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              選択したメンバーに送信 ({selectedUids.size}名)
            </button>
          )}
          {users.some((u) => u.memberNumber == null && u.status === 'active') && (
            <button
              onClick={handleAssignMemberNumbers}
              disabled={assigningNumbers}
              className="px-4 py-2 bg-[#34C759] text-white text-sm font-medium rounded-lg hover:bg-[#2DB84D] transition disabled:opacity-50"
            >
              {assigningNumbers ? '割り当て中...' : '会員番号を振る'}
            </button>
          )}
          <button
            onClick={handleExportCsv}
          disabled={exporting || users.length === 0}
          className="px-4 py-2 bg-[#0095B6] text-white text-sm font-medium rounded-lg hover:bg-[#007A96] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {exporting ? '出力中...' : 'CSV出力'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {users.length === 0 ? (
          <p className="text-[#86868b] text-sm text-center py-10">
            登録ユーザーがいません
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-[#e5e5ea] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f5f5f7] border-b border-[#e5e5ea]">
                    {onSendToSelected && (
                      <th className="w-10 px-2 py-3">
                        <input
                          type="checkbox"
                          checked={selectableUsers.length > 0 && selectedUids.size === selectableUsers.length}
                          onChange={toggleSelectAll}
                          aria-label="全選択"
                          className="rounded border-[#e5e5ea] text-[#0095B6] focus:ring-[#0095B6]"
                        />
                      </th>
                    )}
                    {sortHeader('会員番号', 'memberNumber', { nowrap: true })}
                    {sortHeader('氏名', 'fullName')}
                    {sortHeader('メール', 'email')}
                    {sortHeader('属性', 'attribute')}
                    <th className="text-center px-2 py-3 text-[#86868b] font-medium text-xs whitespace-nowrap" title="食料支援クーポン配信対象">
                      食料<br />支援
                    </th>
                    {sortHeader('誕生月', 'birthMonth')}
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">カード</th>
                    {sortHeader('ステータス', 'status')}
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">操作</th>
                    <th className="text-right px-4 py-3 text-[#86868b] font-medium">使用回数</th>
                    {sortHeader('累計節約', 'totalSavedAmount', { align: 'right' })}
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr
                      key={user.uid}
                      role={user.status === 'active' && onOpenChat ? 'button' : undefined}
                      tabIndex={user.status === 'active' && onOpenChat ? 0 : undefined}
                      onClick={
                        user.status === 'active' && onOpenChat
                          ? () => onOpenChat(user.uid)
                          : undefined
                      }
                      onKeyDown={
                        user.status === 'active' && onOpenChat
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                onOpenChat(user.uid)
                              }
                            }
                          : undefined
                      }
                      className={`border-b border-[#e5e5ea] hover:bg-[#f5f5f7]/50 ${
                        user.status === 'active' && onOpenChat ? 'cursor-pointer' : ''
                      }`}
                    >
                      {onSendToSelected && (
                        <td className="w-10 px-2 py-3" onClick={(e) => e.stopPropagation()}>
                          {user.status === 'active' && user.uid !== currentUser?.uid ? (
                            <input
                              type="checkbox"
                              checked={selectedUids.has(user.uid)}
                              onChange={() => toggleSelect(user.uid)}
                              aria-label={`${user.fullName}を選択`}
                              className="rounded border-[#e5e5ea] text-[#0095B6] focus:ring-[#0095B6]"
                            />
                          ) : (
                            <span className="inline-block w-4" />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-[#86868b] font-mono text-xs">
                        {user.memberNumber != null ? `#${String(user.memberNumber).padStart(5, '0')}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-[#1d1d1f] font-medium">{user.fullName}</td>
                      <td className="px-4 py-3 text-[#86868b] font-mono text-xs">{user.email}</td>
                      <td className="px-4 py-3 text-[#86868b]">
                        {ATTRIBUTE_LABELS[user.attribute] ?? user.attribute}
                      </td>
                      <td className="px-2 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {user.uid !== currentUser?.uid ? (
                          <label className="inline-flex items-center justify-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={user.memberGroups.includes('food_support')}
                              onChange={() => handleToggleFoodSupport(user)}
                              disabled={updatingUid === user.uid}
                              className="rounded border-[#e5e5ea] text-[#34C759] focus:ring-[#34C759] w-4 h-4"
                              title="食料支援メンバー（自動配信の対象）"
                            />
                          </label>
                        ) : (
                          <span className="text-[#86868b]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#86868b]">{user.birthMonth}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          {user.yellowCards > 0 ? (
                            <span className="text-sm" title={`イエローカード ${user.yellowCards}枚`}>
                              {'🟨'.repeat(Math.min(user.yellowCards, 3))}
                            </span>
                          ) : (
                            <span className="text-[#86868b] text-xs">—</span>
                          )}
                          {user.uid !== currentUser?.uid && user.status === 'active' && (
                            <div className="flex gap-0.5 ml-1">
                              <button
                                type="button"
                                onClick={() => handleYellowCard(user, 1)}
                                disabled={updatingUid === user.uid}
                                title="イエローカード付与"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 hover:bg-amber-200 transition disabled:opacity-50"
                              >
                                +🟨
                              </button>
                              {user.yellowCards > 0 && (
                                <button
                                  type="button"
                                  onClick={() => handleYellowCard(user, -1)}
                                  disabled={updatingUid === user.uid}
                                  title="イエローカード取消"
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition disabled:opacity-50"
                                >
                                  -1
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRedCard(user)}
                                disabled={updatingUid === user.uid}
                                title="レッドカード（即ブラックリスト）"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 transition disabled:opacity-50"
                              >
                                🟥
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            user.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {STATUS_LABELS[user.status] ?? user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {user.status === 'active' && onOpenChat && (
                            <button
                              type="button"
                              onClick={() => onOpenChat(user.uid)}
                              className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#0095B6]/10 text-[#0095B6] hover:bg-[#0095B6]/20 transition"
                            >
                              チャット
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenCouponModal(user)}
                            className="text-xs font-medium px-2.5 py-1 rounded-lg bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/20 transition"
                          >
                            クーポン
                          </button>
                          {user.uid !== currentUser?.uid ? (
                            <button
                              type="button"
                              onClick={() => handleStatusChange(user)}
                              disabled={updatingUid === user.uid}
                              className={`text-xs font-medium px-2.5 py-1 rounded-lg transition disabled:opacity-50 ${
                                user.status === 'active'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {updatingUid === user.uid
                                ? '処理中...'
                                : user.status === 'active'
                                  ? 'ブラックリスト'
                                  : '復元'}
                            </button>
                          ) : (
                            <span className="text-[#86868b] text-xs">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[#86868b] text-xs">
                        —
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#0095B6]">
                        ¥{(user.totalSavedAmount ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* クーポン一覧モーダル */}
      {couponModalUser && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#e5e5ea] flex-shrink-0">
              <h3 className="text-[#1d1d1f] font-semibold text-base">
                {couponModalUser.fullName}さん のクーポン一覧
              </h3>
              <p className="text-[#86868b] text-xs mt-1">
                {couponModalUser.memberNumber != null
                  ? `会員番号 #${String(couponModalUser.memberNumber).padStart(5, '0')}`
                  : ''}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4">
              {loadingCoupons ? (
                <div className="flex items-center justify-center py-12">
                  <span className="w-8 h-8 border-2 border-[#0095B6] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : userCoupons.length === 0 ? (
                <p className="text-[#86868b] text-sm text-center py-8">配信されたクーポンはありません</p>
              ) : (
                <div className="space-y-2">
                  {[...userCoupons]
                    .sort((a, b) => {
                      const order = (c: UserCoupon) =>
                        c.status === 'used' ? 2 : c.isExpired ? 1 : 0
                      const diff = order(a) - order(b)
                      if (diff !== 0) return diff
                      const aT = a.distributedAt?.getTime() ?? 0
                      const bT = b.distributedAt?.getTime() ?? 0
                      return bT - aT
                    })
                    .map((c) => {
                    const statusLabel =
                      c.status === 'used'
                        ? '使用済'
                        : c.isExpired
                          ? '期限切れ'
                          : '未使用'
                    const statusClass =
                      c.status === 'used'
                        ? 'bg-[#86868b]/20 text-[#86868b]'
                        : c.isExpired
                          ? 'bg-[#FF3B30]/15 text-[#FF3B30]'
                          : 'bg-[#34C759]/15 text-[#34C759]'
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-[#e5e5ea] bg-[#f5f5f7]/50"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[#1d1d1f] font-medium text-sm truncate">{c.title}</p>
                          <p className="text-[#86868b] text-xs mt-0.5">
                            {c.distributedDate} 配信
                            {c.expiresAt && (
                              <span> 〜 {formatDate(c.expiresAt)}</span>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.discountAmount > 0 && (
                            <span className="text-[#0095B6] font-bold text-sm">¥{c.discountAmount}</span>
                          )}
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
                            {statusLabel}
                          </span>
                          {c.status === 'used' && c.usedAt && (
                            <span className="text-[#86868b] text-[10px]">
                              {formatDate(c.usedAt)} 使用
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-[#e5e5ea] flex-shrink-0">
              <button
                onClick={() => setCouponModalUser(null)}
                className="w-full py-2.5 rounded-xl text-[#86868b] hover:bg-[#f5f5f7] transition font-medium text-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

