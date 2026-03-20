import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, functions, httpsCallable } from '../lib/firebase'

type Attribute = 'male' | 'female' | 'student' | 'other'

const ATTRIBUTE_LABELS: Record<Attribute, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

export default function Register() {
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [attribute, setAttribute] = useState<Attribute>('male')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * ブラックリスト照合 — Cloud Function 経由で照合（blacklist の中身をクライアントに公開しない）
   */
  async function checkBlacklist(name: string, emailAddr: string): Promise<boolean> {
    const fn = httpsCallable<{ fullName?: string; email?: string }, { isBlacklisted: boolean }>(
      functions,
      'checkBlacklist',
    )
    const { data } = await fn({ fullName: name || undefined, email: emailAddr || undefined })
    return data.isBlacklisted
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) {
      setError('フルネームを入力してください。')
      return
    }
    if (!birthMonth.match(/^\d{4}-(0[1-9]|1[0-2])$/)) {
      setError('生年月を YYYY-MM 形式で入力してください。')
      return
    }
    if (!agreeTerms) {
      setError('利用規約およびプライバシーポリシーへの同意が必要です。')
      return
    }

    setLoading(true)

    let isBlacklisted = false
    try {
      isBlacklisted = await checkBlacklist(fullName.trim(), email.trim())
    } catch {
      setError('登録できませんでした。')
      setLoading(false)
      return
    }

    if (isBlacklisted) {
      setError('登録できませんでした。')
      setLoading(false)
      return
    }

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const uid = credential.user.uid

      await updateProfile(credential.user, { displayName: fullName.trim() })

      await setDoc(doc(db, 'users', uid), {
        uid,
        fullName: fullName.trim(),
        birthMonth,
        attribute,
        email: email.trim(),
        status: 'active',
        createdAt: serverTimestamp(),
      })

      navigate('/')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (code === 'auth/email-already-in-use') {
        setError('このメールアドレスはすでに使用されています。')
      } else if (code === 'auth/weak-password') {
        setError('パスワードは6文字以上で入力してください。')
      } else {
        setError('エラーが発生しました。もう一度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex flex-col overflow-y-auto p-5 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md mx-auto flex-1 py-6">
        <div className="text-center mb-8">
          <span className="text-5xl" aria-hidden>♛</span>
          <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide mt-3">
            VIP Member
          </h1>
          <p className="text-[#86868b] text-[17px] mt-2">会員登録</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] text-[15px] rounded-2xl p-4 text-center">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="reg-name" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              お名前（フルネーム） <span className="text-[#007AFF]">*</span>
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="山田 太郎"
              autoComplete="name"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            />
            <p className="text-[#86868b] text-[13px] mt-1">
              ※ 店頭での身分証照合に使用します。本名を入力してください。
            </p>
          </div>

          <div>
            <label htmlFor="reg-birth" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              生年月 <span className="text-[#007AFF]">*</span>
            </label>
            <input
              id="reg-birth"
              type="month"
              required
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            />
          </div>

          <div>
            <label htmlFor="reg-attribute" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              属性 <span className="text-[#007AFF]">*</span>
            </label>
            <select
              id="reg-attribute"
              value={attribute}
              onChange={(e) => setAttribute(e.target.value as Attribute)}
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            >
              {(Object.keys(ATTRIBUTE_LABELS) as Attribute[]).map((key) => (
                <option key={key} value={key}>
                  {ATTRIBUTE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              メールアドレス <span className="text-[#007AFF]">*</span>
            </label>
            <input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              パスワード <span className="text-[#007AFF]">*</span>
            </label>
            <input
              id="reg-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
              autoComplete="new-password"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            />
          </div>

          <label className="flex items-start gap-4 cursor-pointer group min-h-[44px]">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              aria-label="利用規約およびプライバシーポリシーに同意する"
              className="mt-1 w-[22px] h-[22px] flex-shrink-0 rounded border-[#e5e5ea] bg-white text-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/50 focus:ring-offset-0"
            />
            <span className="text-[#1d1d1f] text-[15px] leading-relaxed">
              <Link to="/terms" className="text-[#007AFF] underline hover:text-[#0051D5]" target="_blank">
                利用規約
              </Link>
              および
              <Link to="/privacy" className="text-[#007AFF] underline hover:text-[#0051D5]" target="_blank">
                プライバシーポリシー
              </Link>
              に同意する <span className="text-[#007AFF]">*</span>
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !agreeTerms}
            className="w-full min-h-[52px] bg-[#007AFF] text-white font-semibold text-[17px] py-3 rounded-2xl hover:bg-[#0051D5] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-2 mb-4"
          >
            {loading ? '確認中...' : '登録する'}
          </button>
        </form>

        <p className="text-center text-[#86868b] text-[15px] mt-8">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-[#007AFF] hover:underline">
            ログイン
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link
            to="/install-guide"
            className="min-h-[44px] flex items-center justify-center text-[#007AFF] text-[15px] hover:text-[#0051D5] transition"
          >
            📱 ホーム画面に追加する方法
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 mt-6 pt-4 border-t border-[#e5e5ea] text-[13px]">
          <Link to="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            プライバシーポリシー
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            利用規約
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/tokushoho" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            特商法表記
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/licenses" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            ライセンス
          </Link>
        </div>
      </div>
    </div>
  )
}
