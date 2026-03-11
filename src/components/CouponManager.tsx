import { useState, useEffect } from 'react'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { fetchWeather, type WeatherData } from '../lib/weather'
import {
  distributeCoupons,
  type CouponTemplate,
  type WeatherCondition,
  type TargetSegment,
  type ExpiryType,
  type DistributionResult,
  SEGMENT_LABELS,
  CONDITION_LABELS,
  EXPIRY_LABELS,
} from '../lib/coupon'

export default function CouponManager() {
  /* ── state ── */
  const [coupons, setCoupons] = useState<CouponTemplate[]>([])
  const [dailyLimit, setDailyLimit] = useState(1)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // form
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [discount, setDiscount] = useState(0)
  const [cond, setCond] = useState<WeatherCondition>('any')
  const [threshold, setThreshold] = useState(10)
  const [segment, setSegment] = useState<TargetSegment>('all')
  const [expiryType, setExpiryType] = useState<ExpiryType>('same_day')
  const [expiryDate, setExpiryDate] = useState('')
  const [saving, setSaving] = useState(false)

  // weather & distribution
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [result, setResult] = useState<DistributionResult | null>(null)

  /* ── リアルタイム購読 ── */
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
    )
  }, [])

  useEffect(() => {
    getDoc(doc(db, 'settings', 'coupon')).then((snap) => {
      if (snap.exists()) setDailyLimit(snap.data().dailyLimit as number)
    })
  }, [])

  /* ── 天気取得 ── */
  async function handleFetchWeather() {
    setWeatherLoading(true)
    try {
      setWeather(await fetchWeather())
    } catch {
      alert('天気情報の取得に失敗しました')
    } finally {
      setWeatherLoading(false)
    }
  }

  /* ── サイレント上限保存 ── */
  async function handleSaveLimit(val: number) {
    setDailyLimit(val)
    await setDoc(doc(db, 'settings', 'coupon'), { dailyLimit: val }, { merge: true })
  }

  /* ── フォームリセット ── */
  function resetForm() {
    setTitle('')
    setDesc('')
    setDiscount(0)
    setCond('any')
    setThreshold(10)
    setSegment('all')
    setExpiryType('same_day')
    setExpiryDate('')
    setEditingId(null)
    setShowForm(false)
  }

  /* ── 編集モード開始 ── */
  function handleEdit(c: CouponTemplate) {
    setTitle(c.title)
    setDesc(c.description)
    setDiscount(c.discountAmount ?? 0)
    setCond(c.weatherCondition)
    setThreshold(c.temperatureThreshold ?? 10)
    setSegment(c.targetSegment)
    setExpiryType(c.expiryType ?? 'same_day')
    setExpiryDate(c.expiryDate ?? '')
    setEditingId(c.id)
    setShowForm(true)
  }

  /* ── 新規作成モード開始 ── */
  function handleNewForm() {
    resetForm()
    setShowForm(true)
  }

  /* ── 保存（新規 / 更新を自動分岐） ── */
  async function handleSave() {
    if (!title.trim()) return
    if (expiryType === 'date' && !expiryDate) return
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        description: desc.trim(),
        discountAmount: discount,
        weatherCondition: cond,
        temperatureThreshold: cond === 'cold_below' || cond === 'hot_above' ? threshold : null,
        targetSegment: segment,
        expiryType,
        expiryDate: expiryType === 'date' ? expiryDate : null,
      }

      if (editingId) {
        await updateDoc(doc(db, 'coupons', editingId), payload)
      } else {
        await addDoc(collection(db, 'coupons'), {
          ...payload,
          active: true,
          createdAt: serverTimestamp(),
        })
      }
      resetForm()
    } finally {
      setSaving(false)
    }
  }

  /* ── 有効/無効切り替え ── */
  async function handleToggle(id: string, current: boolean) {
    await updateDoc(doc(db, 'coupons', id), { active: !current })
  }

  /* ── 削除 ── */
  async function handleDelete(id: string) {
    if (!confirm('このクーポンテンプレートを削除しますか？')) return
    await deleteDoc(doc(db, 'coupons', id))
  }

  /* ── 配信実行 ── */
  async function handleDistribute() {
    setDistributing(true)
    setResult(null)
    try {
      const r = await distributeCoupons(dailyLimit)
      setResult(r)
      setWeather(r.weather)
    } catch {
      alert('配信処理中にエラーが発生しました')
    } finally {
      setDistributing(false)
    }
  }

  /* ── 条件バッジ文字列 ── */
  function conditionBadge(c: CouponTemplate): string {
    if (c.weatherCondition === 'cold_below') return `${c.temperatureThreshold}℃以下`
    if (c.weatherCondition === 'hot_above') return `${c.temperatureThreshold}℃以上`
    return CONDITION_LABELS[c.weatherCondition]
  }

  /* ── 有効期限バッジ文字列 ── */
  function expiryBadge(c: CouponTemplate): string {
    if (c.expiryType === 'date' && c.expiryDate) return `〜${c.expiryDate}`
    return EXPIRY_LABELS[c.expiryType ?? 'same_day']
  }

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="p-4 border-b border-[#e5e5ea] space-y-4 flex-shrink-0">
        <div className="flex items-center justify-between bg-[#f5f5f7] rounded-xl p-3 border border-[#e5e5ea]">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{weather?.emoji ?? '🌐'}</span>
            <div>
              <p className="text-[#1d1d1f] text-sm font-medium">三重県伊賀市</p>
              {weather ? (
                <p className="text-[#86868b] text-xs">
                  {weather.description} / {weather.temperature}℃ / 降水 {weather.precipitation}mm
                </p>
              ) : (
                <p className="text-[#86868b]/70 text-xs">天気未取得</p>
              )}
            </div>
          </div>
          <button
            onClick={handleFetchWeather}
            disabled={weatherLoading}
            className="text-xs bg-[#e5e5ea]/60 hover:bg-[#e5e5ea] text-[#007AFF] px-3 py-1.5 rounded-lg transition disabled:opacity-30"
          >
            {weatherLoading ? '取得中...' : '天気取得'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-[#f5f5f7] rounded-lg px-3 py-2">
            <span className="text-[#86868b] text-xs whitespace-nowrap">1日上限</span>
            <select
              value={dailyLimit}
              onChange={(e) => handleSaveLimit(Number(e.target.value))}
              className="bg-transparent text-[#007AFF] text-sm font-bold focus:outline-none"
            >
              {[1, 2, 3, 5].map((n) => (
                <option key={n} value={n} className="bg-white text-[#1d1d1f]">{n}回</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleDistribute}
            disabled={distributing}
            className="flex-1 bg-[#007AFF] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#0051D5] transition disabled:opacity-50"
          >
            {distributing ? '配信処理中...' : '⚡ 天気判定＆クーポン配信'}
          </button>
        </div>

        {result && (
          <div className="bg-[#007AFF]/5 rounded-xl p-3 border border-[#007AFF]/20 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span>{result.weather.emoji}</span>
              <span className="text-[#1d1d1f] font-medium">
                {result.weather.description} {result.weather.temperature}℃
              </span>
              <span className="text-[#86868b]">→</span>
              <span className="text-[#007AFF] font-bold">{result.distributedCount}件配信</span>
              {result.skippedLimitCount > 0 && (
                <span className="text-[#86868b] text-xs">({result.skippedLimitCount}件上限スキップ)</span>
              )}
            </div>
            {result.matchedCoupons.length > 0 && (
              <p className="text-[#86868b] text-[10px]">
                合致: {result.matchedCoupons.map((c) => c.title).join(', ')}
              </p>
            )}
            {result.details.length > 0 && (
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {result.details.map((d, i) => (
                  <p key={i} className="text-[#86868b] text-[11px]">• {d}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-[#86868b] text-xs font-medium tracking-wide">
            クーポンテンプレート ({coupons.length}件)
          </h3>
          <button
            onClick={() => showForm ? resetForm() : handleNewForm()}
            className="text-[#007AFF] text-xs font-semibold hover:text-[#0051D5] transition"
          >
            {showForm ? '✕ 閉じる' : '＋ 新規作成'}
          </button>
        </div>

        {/* 新規作成 / 編集フォーム */}
        {showForm && (
          <div className="mx-4 mb-4 p-4 rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] space-y-3">
            {editingId && (
              <p className="text-[#007AFF] text-[10px] font-medium tracking-wide">✏️ テンプレートを編集中</p>
            )}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="クーポンタイトル（例: 雨の日ドリンク無料）"
              className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF]"
            />
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="内容（例: お好きなドリンク1杯サービス）"
              rows={2}
              className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-[#86868b] text-xs whitespace-nowrap">割引額</label>
              <div className="flex items-center gap-1">
                <span className="text-[#86868b] text-sm">¥</span>
                <input
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0"
                  className="w-24 bg-white border border-[#e5e5ea] rounded-lg px-3 py-1.5 text-[#007AFF] text-sm font-bold focus:outline-none focus:border-[#007AFF]"
                />
              </div>
              <span className="text-[#86868b] text-[10px]">0 = 金額なし（サービス券等）</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[#86868b] text-[10px] block mb-1">天気条件</label>
                <select
                  value={cond}
                  onChange={(e) => setCond(e.target.value as WeatherCondition)}
                  className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                >
                  {Object.entries(CONDITION_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#86868b] text-[10px] block mb-1">対象セグメント</label>
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value as TargetSegment)}
                  className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                >
                  {Object.entries(SEGMENT_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[#86868b] text-[10px] block mb-1.5">有効期限</label>
              <div className="flex flex-wrap gap-2">
                {(Object.entries(EXPIRY_LABELS) as [ExpiryType, string][]).map(([k, v]) => (
                  <label
                    key={k}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${
                      expiryType === k
                        ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                        : 'border-[#e5e5ea] bg-white text-[#86868b] hover:border-[#007AFF]/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="expiryType"
                      value={k}
                      checked={expiryType === k}
                      onChange={() => setExpiryType(k)}
                      className="sr-only"
                    />
                    {v}
                  </label>
                ))}
              </div>
              {expiryType === 'date' && (
                <div className="mt-2">
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                  />
                </div>
              )}
            </div>

            {(cond === 'cold_below' || cond === 'hot_above') && (
              <div className="flex items-center gap-2">
                <label className="text-[#86868b] text-xs">閾値:</label>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-20 bg-white border border-[#e5e5ea] rounded-lg px-3 py-1.5 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                />
                <span className="text-[#86868b] text-xs">℃</span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving || (expiryType === 'date' && !expiryDate)}
              className="w-full bg-[#007AFF] text-white font-bold py-2 rounded-xl text-sm hover:bg-[#0051D5] transition disabled:opacity-50"
            >
              {saving ? '保存中...' : editingId ? '更新する' : 'テンプレートを保存'}
            </button>
          </div>
        )}

        {/* テンプレートリスト */}
        <div className="px-4 space-y-2 pb-4">
          {coupons.length === 0 && !showForm && (
            <p className="text-[#86868b] text-sm text-center py-10">
              クーポンテンプレートがありません
            </p>
          )}
          {coupons.map((c) => (
            <div
              key={c.id}
              className={`rounded-xl border p-3 transition ${
                c.active
                  ? 'bg-white border-[#007AFF]/20 shadow-sm'
                  : 'bg-[#f5f5f7] border-[#e5e5ea] opacity-60'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[#1d1d1f] text-sm font-medium truncate">{c.title}</p>
                  {c.description && (
                    <p className="text-[#86868b] text-xs mt-0.5 truncate">{c.description}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {(c.discountAmount ?? 0) > 0 && (
                      <span className="text-[10px] bg-[#007AFF]/10 text-[#007AFF] px-2 py-0.5 rounded-full font-bold">
                        ¥{c.discountAmount}
                      </span>
                    )}
                    <span className="text-[10px] bg-[#34C759]/15 text-[#34C759] px-2 py-0.5 rounded-full">
                      {expiryBadge(c)}
                    </span>
                    <span className="text-[10px] bg-[#5AC8FA]/15 text-[#007AFF] px-2 py-0.5 rounded-full">
                      {conditionBadge(c)}
                    </span>
                    <span className="text-[10px] bg-[#e5e5ea] text-[#86868b] px-2 py-0.5 rounded-full">
                      {SEGMENT_LABELS[c.targetSegment]}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(c)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition"
                    title="編集"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleToggle(c.id, c.active)}
                    className={`text-[10px] px-2 py-1 rounded-md transition ${
                      c.active
                        ? 'bg-green-500/15 text-green-600 hover:bg-green-500/25'
                        : 'bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#e5e5ea]'
                    }`}
                  >
                    {c.active ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-[#86868b] hover:text-red-500 transition text-xs p-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
