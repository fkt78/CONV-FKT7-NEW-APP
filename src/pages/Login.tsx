import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const blockedFromRedirect = (location.state as { blocked?: boolean } | null)?.blocked

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(blockedFromRedirect ? 'アカウントが停止されています。' : '')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const uid = credential.user.uid

      const snap = await getDoc(doc(db, 'users', uid))
      if (snap.exists() && snap.data().status === 'blacklisted') {
        await auth.signOut()
        setError('アカウントが停止されています。')
        return
      }

      navigate('/')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError('メールアドレスまたはパスワードが正しくありません。')
      } else {
        setError('エラーが発生しました。もう一度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePasswordReset() {
    if (!email.trim()) {
      setError('パスワードリセットには、上のフィールドにメールアドレスを入力してください。')
      return
    }
    setResetLoading(true)
    setError('')
    setInfo('')

    try {
      await sendPasswordResetEmail(auth, email.trim())
      setInfo('パスワードリセットのメールを送信しました。メールをご確認ください。')
    } catch {
      setError('メール送信に失敗しました。メールアドレスをご確認ください。')
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-[#f5f5f7] flex items-center justify-center p-5 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-5xl" aria-hidden>♛</span>
          <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide mt-3">
            VIP Member
          </h1>
          <p className="text-[#86868b] text-[17px] mt-2">ログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] text-[15px] rounded-2xl p-4 text-center">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-[#34C759]/10 border border-[#34C759]/30 text-[#34C759] text-[15px] rounded-2xl p-4 text-center">
              {info}
            </div>
          )}

          <div>
            <label htmlFor="login-email" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              メールアドレス
            </label>
            <input
              id="login-email"
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
            <label htmlFor="login-password" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              パスワード
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-[#007AFF] text-white font-semibold text-[17px] py-3 rounded-2xl hover:bg-[#0051D5] active:scale-[0.98] transition disabled:opacity-50 shadow-sm"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              aria-label="パスワードを忘れた方"
              className="min-h-[44px] flex items-center justify-center mx-auto text-[#007AFF] text-[15px] hover:text-[#0051D5] transition px-4 py-2"
            >
              {resetLoading ? '送信中...' : 'パスワードを忘れた方はこちら'}
            </button>
          </div>
        </form>

        <p className="text-center text-[#86868b] text-[15px] mt-8">
          アカウントをお持ちでない方は{' '}
          <Link to="/register" className="text-[#007AFF] hover:underline font-medium">
            新規登録
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
