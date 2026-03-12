import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

interface UserRecord {
  uid: string
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  status: string
  totalSavedAmount: number
  usedCouponCount: number
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

function escapeCsvField(value: string | number): string {
  const s = String(value)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export default function UserManager() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'users'))
    return onSnapshot(q, (snap) => {
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
            totalSavedAmount: (data.totalSavedAmount as number) ?? 0,
            usedCouponCount: 0,
          }
        }),
      )
    })
  }, [])

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
          totalSavedAmount: (data.totalSavedAmount as number) ?? 0,
          usedCouponCount: usedSnap.size,
        })
      }

      const header = [
        'uid',
        '氏名',
        'メール',
        '属性',
        '誕生月',
        'ステータス',
        '累計節約額',
        'クーポン使用回数',
      ]
      const csvRows = rows.map((r) => [
        escapeCsvField(r.uid),
        escapeCsvField(r.fullName),
        escapeCsvField(r.email),
        escapeCsvField(ATTRIBUTE_LABELS[r.attribute] ?? r.attribute),
        escapeCsvField(r.birthMonth),
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

  const sortedUsers = [...users].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return b.totalSavedAmount - a.totalSavedAmount
  })

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f5f5f7]">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea]">
        <h2 className="text-[#1d1d1f] text-sm font-semibold">ユーザー管理</h2>
        <button
          onClick={handleExportCsv}
          disabled={exporting || users.length === 0}
          className="px-4 py-2 bg-[#007AFF] text-white text-sm font-medium rounded-lg hover:bg-[#0051D5] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? '出力中...' : 'CSV出力'}
        </button>
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
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">氏名</th>
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">メール</th>
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">属性</th>
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">誕生月</th>
                    <th className="text-left px-4 py-3 text-[#86868b] font-medium">ステータス</th>
                    <th className="text-right px-4 py-3 text-[#86868b] font-medium">使用回数</th>
                    <th className="text-right px-4 py-3 text-[#86868b] font-medium">累計節約</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((user) => (
                    <tr
                      key={user.uid}
                      className="border-b border-[#e5e5ea] hover:bg-[#f5f5f7]/50"
                    >
                      <td className="px-4 py-3 text-[#1d1d1f] font-medium">{user.fullName}</td>
                      <td className="px-4 py-3 text-[#86868b] font-mono text-xs">{user.email}</td>
                      <td className="px-4 py-3 text-[#86868b]">
                        {ATTRIBUTE_LABELS[user.attribute] ?? user.attribute}
                      </td>
                      <td className="px-4 py-3 text-[#86868b]">{user.birthMonth}</td>
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
                      <td className="px-4 py-3 text-right text-[#86868b] text-xs">
                        CSVで確認
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-[#007AFF]">
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
    </div>
  )
}

