import { useState, useEffect } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db, functions } from '../lib/firebase'
import { httpsCallable } from 'firebase/functions'
import type { CouponTemplate } from '../lib/coupon'
import { type OmikujiSet, validateOmikujiCouponIds, validateOmikujiPercents } from '../lib/omikuji'

export default function OmikujiSetManager() {
  const [sets, setSets] = useState<OmikujiSet[]>([])
  const [coupons, setCoupons] = useState<CouponTemplate[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testRunning, setTestRunning] = useState(false)

  const [name, setName] = useState('')
  const [active, setActive] = useState(false)
  const [couponIdDai, setCouponIdDai] = useState('')
  const [couponIdChu, setCouponIdChu] = useState('')
  const [couponIdSho, setCouponIdSho] = useState('')
  const [pctDai, setPctDai] = useState(10)
  const [pctChu, setPctChu] = useState(30)
  const [pctSho, setPctSho] = useState(60)

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'omikujiSets'), orderBy('createdAt', 'desc')),
      (snap) => {
        setSets(
          snap.docs.map((d) => {
            const x = d.data()
            return {
              id: d.id,
              name: (x.name as string) ?? '',
              active: Boolean(x.active),
              couponIdDai: (x.couponIdDai as string) ?? '',
              couponIdChu: (x.couponIdChu as string) ?? '',
              couponIdSho: (x.couponIdSho as string) ?? '',
              pctDai: Number(x.pctDai) ?? 0,
              pctChu: Number(x.pctChu) ?? 0,
              pctSho: Number(x.pctSho) ?? 0,
              createdAt: (x.createdAt as Timestamp | null)?.toDate() ?? null,
            }
          }),
        )
      },
      (err) => console.error('omikujiSets 購読エラー:', err),
    )
  }, [])

  useEffect(() => {
    return onSnapshot(
      query(collection(db, 'coupons'), orderBy('createdAt', 'desc')),
      (snap) => {
        setCoupons(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CouponTemplate, 'id' | 'createdAt'>),
            createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
          })),
        )
      },
      (err) => console.error('coupons 購読エラー:', err),
    )
  }, [])

  const activeCount = sets.filter((s) => s.active).length

  function resetForm() {
    setName('')
    setActive(false)
    setCouponIdDai('')
    setCouponIdChu('')
    setCouponIdSho('')
    setPctDai(10)
    setPctChu(30)
    setPctSho(60)
    setEditingId(null)
    setShowForm(false)
  }

  function handleEdit(s: OmikujiSet) {
    setName(s.name ?? '')
    setActive(s.active)
    setCouponIdDai(s.couponIdDai)
    setCouponIdChu(s.couponIdChu)
    setCouponIdSho(s.couponIdSho)
    setPctDai(s.pctDai)
    setPctChu(s.pctChu)
    setPctSho(s.pctSho)
    setEditingId(s.id)
    setShowForm(true)
  }

  async function handleSave() {
    const errPct = validateOmikujiPercents(pctDai, pctChu, pctSho)
    if (errPct) {
      alert(errPct)
      return
    }
    const errIds = validateOmikujiCouponIds(couponIdDai, couponIdChu, couponIdSho)
    if (errIds) {
      alert(errIds)
      return
    }
    if (active) {
      const otherActive = sets.filter((x) => x.active && x.id !== editingId)
      if (otherActive.length > 0) {
        if (
          !confirm(
            '既に別のセットが有効です。複数同時ONにすると、朝の配信は先頭1件のみが使われます。続行しますか？',
          )
        ) {
          return
        }
      }
    }
    setSaving(true)
    try {
      const payload = {
        name: name.trim() || 'おみくじセット',
        active,
        couponIdDai,
        couponIdChu,
        couponIdSho,
        pctDai: Math.floor(pctDai),
        pctChu: Math.floor(pctChu),
        pctSho: Math.floor(pctSho),
      }
      if (editingId) {
        await updateDoc(doc(db, 'omikujiSets', editingId), payload)
      } else {
        await addDoc(collection(db, 'omikujiSets'), {
          ...payload,
          createdAt: serverTimestamp(),
        })
      }
      resetForm()
    } catch (err) {
      console.error('おみくじセット保存エラー:', err)
      alert(`保存に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(s: OmikujiSet) {
    if (!confirm(`「${s.name || s.id}」を削除しますか？`)) return
    try {
      await deleteDoc(doc(db, 'omikujiSets', s.id))
    } catch (err) {
      console.error('削除エラー:', err)
      alert(`削除に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleTestDistribution() {
    const activeSet = sets.find((x) => x.active)
    if (!activeSet) {
      alert('有効（active）なおみくじセットがありません。')
      return
    }
    if (
      !confirm(
        `有効セット「${activeSet.name || activeSet.id}」でテスト配信を実行しますか？\n（本番と同じロジック・実ユーザーに配布されます）`,
      )
    ) {
      return
    }
    setTestRunning(true)
    try {
      const fn = httpsCallable(functions, 'testOmikujiDistribution')
      const result = await fn({ omikujiSetId: activeSet.id })
      const data = result.data as { distributedCount?: number }
      alert(`テスト配信完了: ${data.distributedCount ?? 0} 件`)
    } catch (err) {
      console.error('testOmikujiDistribution:', err)
      alert(`テスト失敗: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTestRunning(false)
    }
  }

  function couponLabel(id: string): string {
    const c = coupons.find((x) => x.id === id)
    if (!c) return id
    const t = (c.titleJa ?? c.title ?? '').trim() || id
    return `${t} (${id.slice(0, 8)}…)`
  }

  return (
    <div className="flex flex-col h-full bg-white overflow-auto">
      <div className="p-4 border-b border-[#e5e5ea] space-y-2">
        <h2 className="text-sm font-semibold text-[#1d1d1f]">おみくじセット</h2>
        <p className="text-xs text-[#86868b] leading-relaxed">
          大吉・中吉・小吉用のクーポンテンプレ3件と割合を1セットで管理します。朝7時の自動配信は、通常クーポン配信の直後に同じ日次上限（couponLogs）を共有して実行されます。
        </p>
        {activeCount > 1 && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
            有効なセットが {activeCount} 件あります。配信では先頭の1件のみが使われます。
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0095B6] text-white hover:bg-[#007A96]"
          >
            ＋ 新規セット
          </button>
          <button
            type="button"
            onClick={handleTestDistribution}
            disabled={testRunning || !sets.some((s) => s.active)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1d1d1f] text-white disabled:opacity-40"
          >
            {testRunning ? 'テスト実行中…' : '有効セットでテスト配信'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="p-4 border-b border-[#e5e5ea] bg-[#f5f5f7] space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-[#86868b]">
              セット名
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
                placeholder="例: 2026春のおみくじ"
              />
            </label>
            <label className="text-xs text-[#86868b] flex items-end gap-2 pb-0.5">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>有効（朝7時のおみくじ配信の対象）</span>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-[#86868b]">
              大吉テンプレ
              <select
                value={couponIdDai}
                onChange={(e) => setCouponIdDai(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              >
                <option value="">選択</option>
                {coupons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.titleJa ?? c.title ?? c.id).slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#86868b]">
              中吉テンプレ
              <select
                value={couponIdChu}
                onChange={(e) => setCouponIdChu(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              >
                <option value="">選択</option>
                {coupons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.titleJa ?? c.title ?? c.id).slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[#86868b]">
              小吉テンプレ
              <select
                value={couponIdSho}
                onChange={(e) => setCouponIdSho(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              >
                <option value="">選択</option>
                {coupons.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.titleJa ?? c.title ?? c.id).slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-[#86868b]">
              大吉 %
              <input
                type="number"
                min={0}
                max={100}
                value={pctDai}
                onChange={(e) => setPctDai(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#86868b]">
              中吉 %
              <input
                type="number"
                min={0}
                max={100}
                value={pctChu}
                onChange={(e) => setPctChu(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[#86868b]">
              小吉 %
              <input
                type="number"
                min={0}
                max={100}
                value={pctSho}
                onChange={(e) => setPctSho(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-[#e5e5ea] px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <p className="text-[11px] text-[#86868b]">
            対象者の絞り込みは<strong>大吉テンプレ</strong>の属性・年代・メンバーグループに合わせます（3テンプレは運用上同条件に揃えることを推奨）。
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0095B6] text-white disabled:opacity-40"
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-xs rounded-lg border border-[#e5e5ea]">
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-2">
        {sets.length === 0 ? (
          <p className="text-sm text-[#86868b] text-center py-8">セットがありません</p>
        ) : (
          <ul className="space-y-2">
            {sets.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border border-[#e5e5ea] p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div>
                  <div className="text-sm font-medium text-[#1d1d1f]">
                    {s.name || '（無題）'}
                    {s.active ? (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">有効</span>
                    ) : (
                      <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">オフ</span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#86868b] mt-1">
                    大吉 {s.pctDai}% / 中吉 {s.pctChu}% / 小吉 {s.pctSho}% — {couponLabel(s.couponIdDai)} / {couponLabel(s.couponIdChu)} /{' '}
                    {couponLabel(s.couponIdSho)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleEdit(s)}
                    className="text-xs px-2 py-1 rounded-lg border border-[#e5e5ea] hover:bg-[#f5f5f7]"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    className="text-xs px-2 py-1 rounded-lg text-red-600 border border-red-200 hover:bg-red-50"
                  >
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
