import { useState, useEffect } from 'react'
import {
  collection,
  query,
  where,
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
import { auth, db } from '../lib/firebase'
import { fetchWeather, type WeatherData } from '../lib/weather'
import {
  distributeCoupons,
  distributeCouponToUsers,
  getTargetFromCoupon,
  formatTargetLabel,
  type CouponTemplate,
  type WeatherCondition,
  type TargetAttribute,
  type TargetAgeRange,
  type ExpiryType,
  type DistributionResult,
  type IndividualDistributionResult,
  ATTRIBUTE_LABELS,
  AGE_RANGE_LABELS,
  AGE_RANGE_KEYS,
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
  const [targetAttribute, setTargetAttribute] = useState<TargetAttribute>('all')
  const [targetAgeRanges, setTargetAgeRanges] = useState<TargetAgeRange[]>([])
  const [expiryType, setExpiryType] = useState<ExpiryType>('same_day')
  const [expiryDate, setExpiryDate] = useState('')
  const [autoDistribute, setAutoDistribute] = useState(false)
  const [scheduleType, setScheduleType] = useState<'daily' | 'weekly' | 'monthly' | 'specific_months' | 'birth_month'>('daily')
  const [scheduleDayOfWeek, setScheduleDayOfWeek] = useState(5)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = useState(1)
  const [scheduleMonths, setScheduleMonths] = useState<number[]>([])
  const [saving, setSaving] = useState(false)

  // weather & distribution
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)
  const [distributing, setDistributing] = useState(false)
  const [result, setResult] = useState<DistributionResult | null>(null)

  // 個人配信
  const [showIndividualModal, setShowIndividualModal] = useState(false)
  const [individualCoupon, setIndividualCoupon] = useState<CouponTemplate | null>(null)
  const [users, setUsers] = useState<Array<{ uid: string; fullName: string }>>([])
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())
  const [individualDistributing, setIndividualDistributing] = useState(false)
  const [individualResult, setIndividualResult] = useState<IndividualDistributionResult | null>(null)

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
      if (snap.exists()) {
        const data = snap.data()
        setDailyLimit((data?.dailyLimit as number) ?? 1)
      }
    })
  }, [])

  /* ── 個人配信用: モーダル表示時にユーザー一覧を取得 ── */
  useEffect(() => {
    if (!showIndividualModal) return
    const q = query(collection(db, 'users'), where('status', '==', 'active'))
    return onSnapshot(q, (snap) => {
      setUsers(
        snap.docs.map((d) => ({
          uid: d.id,
          fullName: (d.data().fullName as string) ?? '',
        })),
      )
    })
  }, [showIndividualModal])

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
    setTargetAttribute('all')
    setTargetAgeRanges([])
    setExpiryType('same_day')
    setExpiryDate('')
    setAutoDistribute(false)
    setScheduleType('daily')
    setScheduleDayOfWeek(5)
    setScheduleDayOfMonth(1)
    setScheduleMonths([])
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
    const t = getTargetFromCoupon(c)
    setTargetAttribute(t.attr)
    setTargetAgeRanges(t.ages)
    setExpiryType(c.expiryType ?? 'same_day')
    setExpiryDate(c.expiryDate ?? '')
    setAutoDistribute(c.autoDistribute ?? false)
    const s = c.autoDistributeSchedule
    setScheduleType((s?.type as typeof scheduleType) ?? 'daily')
    setScheduleDayOfWeek(s?.dayOfWeek ?? 5)
    setScheduleDayOfMonth(s?.dayOfMonth ?? 1)
    setScheduleMonths(s?.months ?? [])
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
        targetAttribute: targetAttribute,
        targetAgeRanges: targetAgeRanges,
        expiryType,
        expiryDate: expiryType === 'date' ? expiryDate : null,
        autoDistribute,
        ...(autoDistribute && {
          autoDistributeSchedule: {
            type: scheduleType,
            ...(scheduleType === 'weekly' && { dayOfWeek: scheduleDayOfWeek }),
            ...(['monthly', 'specific_months', 'birth_month'].includes(scheduleType) && { dayOfMonth: scheduleDayOfMonth }),
            ...(scheduleType === 'specific_months' && scheduleMonths.length > 0 && { months: scheduleMonths }),
          },
        }),
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
    } catch (err) {
      console.error('クーポン保存エラー:', err)
      alert('保存に失敗しました。もう一度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  /* ── 有効/無効切り替え ── */
  async function handleToggle(id: string, current: boolean) {
    await updateDoc(doc(db, 'coupons', id), { active: !current })
  }

  /* ── 自動配信オン/オフ切り替え ── */
  async function handleToggleAutoDistribute(id: string, current: boolean) {
    await updateDoc(doc(db, 'coupons', id), { autoDistribute: !current })
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
      // トークン更新（identitytoolkit 400 対策：期限切れセッションを事前検出）
      const user = auth.currentUser
      if (user) {
        await user.getIdToken(true)
      }
      const r = await distributeCoupons(dailyLimit)
      setResult(r)
      setWeather(r.weather)
    } catch (err) {
      const code = (err as { code?: string })?.code ?? ''
      const msg = err instanceof Error ? err.message : ''
      const isAuthError =
        code.startsWith('auth/') ||
        msg.includes('auth/') ||
        msg.includes('TOKEN') ||
        msg.includes('INVALID') ||
        msg.includes('network')
      if (isAuthError) {
        alert(
          'セッションが切れています。一度ログアウトして、再度ログインしてください。',
        )
      } else {
        alert('配信処理中にエラーが発生しました')
      }
    } finally {
      setDistributing(false)
    }
  }

  /* ── 個人配信モーダルを開く ── */
  function handleOpenIndividualModal(c: CouponTemplate) {
    setIndividualCoupon(c)
    setSelectedUserIds(new Set())
    setIndividualResult(null)
    setShowIndividualModal(true)
  }

  /* ── 個人配信モーダルを閉じる ── */
  function handleCloseIndividualModal() {
    setShowIndividualModal(false)
    setIndividualCoupon(null)
    setSelectedUserIds(new Set())
    setIndividualResult(null)
  }

  /* ── ユーザー選択トグル ── */
  function toggleUserSelection(uid: string) {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })
  }

  /* ── 全選択 / 全解除 ── */
  function selectAllUsers(select: boolean) {
    if (select) setSelectedUserIds(new Set(users.map((u) => u.uid)))
    else setSelectedUserIds(new Set())
  }

  /* ── 個人配信実行 ── */
  async function handleIndividualDistribute() {
    if (!individualCoupon || selectedUserIds.size === 0) return
    setIndividualDistributing(true)
    setIndividualResult(null)
    try {
      const r = await distributeCouponToUsers(individualCoupon.id, Array.from(selectedUserIds))
      setIndividualResult(r)
    } catch {
      alert('配信処理中にエラーが発生しました')
    } finally {
      setIndividualDistributing(false)
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

  /* ── 自動配信スケジュールバッジ ── */
  function scheduleBadge(c: CouponTemplate): string {
    const s = c.autoDistributeSchedule
    if (!c.autoDistribute || !s) return ''
    const days = ['日', '月', '火', '水', '木', '金', '土']
    switch (s.type) {
      case 'daily': return '毎日'
      case 'weekly': return `毎週${days[s.dayOfWeek ?? 0]}`
      case 'monthly': return `毎月${s.dayOfMonth ?? 1}日`
      case 'specific_months': return (s.months ?? []).map((m) => `${m}月`).join('・') + `${s.dayOfMonth ?? 1}日`
      case 'birth_month': return `誕生月${s.dayOfMonth ?? 1}日`
      default: return '自動'
    }
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
                  {weather.description} / 最高{weather.temperatureMax}℃ 最低{weather.temperatureMin}℃ / 降水 {weather.precipitation}mm
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

        <div className="flex flex-col gap-3">
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
                {result.weather.description} 最高{result.weather.temperatureMax}℃ 最低{result.weather.temperatureMin}℃
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
              placeholder="内容（改行・箇条書き（- や 1. で始める）がそのまま反映されます）"
              rows={5}
              className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] resize-y"
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
                <label className="text-[#86868b] text-[10px] block mb-1">対象（属性）</label>
                <select
                  value={targetAttribute}
                  onChange={(e) => setTargetAttribute(e.target.value as TargetAttribute)}
                  className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                >
                  {Object.entries(ATTRIBUTE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[#86868b] text-[10px] block mb-1">対象（年代・複数選択可）</label>
                <div className="flex flex-wrap gap-2">
                  {AGE_RANGE_KEYS.map((key) => (
                    <label
                      key={key}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border cursor-pointer transition text-sm ${
                        targetAgeRanges.includes(key)
                          ? 'border-[#007AFF] bg-[#007AFF]/10 text-[#007AFF]'
                          : 'border-[#e5e5ea] bg-white text-[#86868b] hover:border-[#007AFF]/40'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={targetAgeRanges.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTargetAgeRanges((prev) => [...prev, key])
                          } else {
                            setTargetAgeRanges((prev) => prev.filter((a) => a !== key))
                          }
                        }}
                        className="sr-only"
                      />
                      {AGE_RANGE_LABELS[key]}
                    </label>
                  ))}
                </div>
                <p className="text-[#86868b] text-[10px] mt-1">未選択＝全年代</p>
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

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDistribute}
                onChange={(e) => setAutoDistribute(e.target.checked)}
                className="rounded border-[#e5e5ea] text-[#007AFF] focus:ring-[#007AFF]"
              />
              <span className="text-[#1d1d1f] text-sm">毎朝7時に自動配信</span>
            </label>

            {autoDistribute && (
              <div className="space-y-2 pl-6 border-l-2 border-[#e5e5ea]">
                <div>
                  <label className="text-[#86868b] text-[10px] block mb-1">配信タイミング</label>
                  <select
                    value={scheduleType}
                    onChange={(e) => setScheduleType(e.target.value as typeof scheduleType)}
                    className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                  >
                    <option value="daily">毎日（天気条件があれば天気チェック）</option>
                    <option value="weekly">毎週</option>
                    <option value="monthly">毎月</option>
                    <option value="specific_months">指定した月</option>
                    <option value="birth_month">誕生月</option>
                  </select>
                </div>
                {scheduleType === 'weekly' && (
                  <div>
                    <label className="text-[#86868b] text-[10px] block mb-1">曜日</label>
                    <select
                      value={scheduleDayOfWeek}
                      onChange={(e) => setScheduleDayOfWeek(Number(e.target.value))}
                      className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                    >
                      {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                        <option key={i} value={i}>{d}曜日</option>
                      ))}
                    </select>
                  </div>
                )}
                {['monthly', 'specific_months', 'birth_month'].includes(scheduleType) && (
                  <div>
                    <label className="text-[#86868b] text-[10px] block mb-1">日</label>
                    <select
                      value={scheduleDayOfMonth}
                      onChange={(e) => setScheduleDayOfMonth(Number(e.target.value))}
                      className="w-full bg-white border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] text-sm focus:outline-none focus:border-[#007AFF]"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}日</option>
                      ))}
                    </select>
                  </div>
                )}
                {scheduleType === 'specific_months' && (
                  <div>
                    <label className="text-[#86868b] text-[10px] block mb-1">対象月（複数選択可）</label>
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                        <label
                          key={m}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-xs cursor-pointer ${
                            scheduleMonths.includes(m) ? 'bg-[#007AFF] text-white' : 'bg-[#e5e5ea] text-[#86868b]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={scheduleMonths.includes(m)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setScheduleMonths((prev) => [...prev, m].sort((a, b) => a - b))
                              } else {
                                setScheduleMonths((prev) => prev.filter((x) => x !== m))
                              }
                            }}
                            className="sr-only"
                          />
                          {m}月
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={handleSave}
              disabled={
                !title.trim() ||
                saving ||
                (expiryType === 'date' && !expiryDate) ||
                (autoDistribute && scheduleType === 'specific_months' && scheduleMonths.length === 0)
              }
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
                      {formatTargetLabel(c)}
                    </span>
                    {c.autoDistribute && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full" title="毎朝7時自動配信">
                        ⏰{scheduleBadge(c) || '自動'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleOpenIndividualModal(c)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#34C759]/15 text-[#34C759] hover:bg-[#34C759]/25 transition"
                    title="選択した人に配信"
                  >
                    👤
                  </button>
                  <button
                    onClick={() => handleEdit(c)}
                    className="text-[10px] px-2 py-1 rounded-md bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#007AFF]/10 hover:text-[#007AFF] transition"
                    title="編集"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleToggleAutoDistribute(c.id, c.autoDistribute ?? false)}
                    className={`text-[10px] px-2 py-1 rounded-md transition ${
                      c.autoDistribute
                        ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                        : 'bg-[#e5e5ea]/60 text-[#86868b] hover:bg-[#e5e5ea]'
                    }`}
                    title="毎朝7時自動配信"
                  >
                    ⏰{c.autoDistribute ? 'ON' : 'OFF'}
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

      {/* 個人配信モーダル */}
      {showIndividualModal && individualCoupon && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#e5e5ea] flex-shrink-0">
              <h3 className="text-[#1d1d1f] font-semibold text-base">個人に配信</h3>
              <p className="text-[#007AFF] text-sm font-medium mt-1">{individualCoupon.title}</p>
              <p className="text-[#86868b] text-xs mt-1">
                配信したい人を選択して「配信」を押してください
              </p>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 border-b border-[#e5e5ea] flex-shrink-0">
              <button
                onClick={() => selectAllUsers(true)}
                className="text-xs text-[#007AFF] hover:text-[#0051D5] font-medium"
              >
                全選択
              </button>
              <span className="text-[#e5e5ea]">|</span>
              <button
                onClick={() => selectAllUsers(false)}
                className="text-xs text-[#86868b] hover:text-[#1d1d1f] font-medium"
              >
                選択解除
              </button>
              <span className="text-[#86868b] text-xs ml-auto">
                {selectedUserIds.size}人選択中
              </span>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-1">
              {users.length === 0 ? (
                <p className="text-[#86868b] text-sm text-center py-8">有効な会員がいません</p>
              ) : (
                users.map((u) => (
                  <label
                    key={u.uid}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition ${
                      selectedUserIds.has(u.uid) ? 'bg-[#007AFF]/10 border border-[#007AFF]/30' : 'bg-[#f5f5f7] border border-transparent hover:bg-[#e5e5ea]/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.has(u.uid)}
                      onChange={() => toggleUserSelection(u.uid)}
                      className="w-4 h-4 rounded border-[#e5e5ea] text-[#007AFF] focus:ring-[#007AFF]"
                    />
                    <span className="text-[#1d1d1f] text-sm font-medium truncate">
                      {u.fullName || '（名前未設定）'}
                    </span>
                  </label>
                ))
              )}
            </div>

            {individualResult && (
              <div className="px-4 py-2 bg-[#007AFF]/5 border-t border-[#007AFF]/20 flex-shrink-0">
                <p className="text-[#007AFF] text-sm font-bold">
                  {individualResult.distributedCount}件配信
                  {individualResult.skippedCount > 0 && (
                    <span className="text-[#86868b] font-normal ml-1">
                      （{individualResult.skippedCount}件スキップ）
                    </span>
                  )}
                </p>
                <div className="max-h-16 overflow-y-auto mt-1 space-y-0.5">
                  {individualResult.details.map((d, i) => (
                    <p key={i} className="text-[#86868b] text-[11px]">• {d}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border-t border-[#e5e5ea] flex gap-2 flex-shrink-0">
              <button
                onClick={handleIndividualDistribute}
                disabled={individualDistributing || selectedUserIds.size === 0}
                className="flex-1 bg-[#007AFF] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#0051D5] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {individualDistributing ? '配信中...' : `${selectedUserIds.size}人に配信`}
              </button>
              <button
                onClick={handleCloseIndividualModal}
                disabled={individualDistributing}
                className="px-4 py-2.5 rounded-xl text-[#86868b] hover:bg-[#f5f5f7] transition disabled:opacity-50"
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
