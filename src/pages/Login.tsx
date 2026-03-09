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
    <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <span className="text-5xl">♛</span>
          <h1 className="text-amber-400 font-bold text-xl tracking-widest mt-2">
            VIP Member
          </h1>
          <p className="text-white/40 text-sm mt-1">ログイン</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 text-center">
              {error}
            </div>
          )}
          {info && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-3 text-center">
              {info}
            </div>
          )}

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              メールアドレス
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition"
            />
          </div>

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              パスワード
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold py-3 rounded-lg hover:from-amber-400 hover:to-yellow-400 transition disabled:opacity-50"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={handlePasswordReset}
              disabled={resetLoading}
              className="text-amber-400/60 text-xs hover:text-amber-400 transition"
            >
              {resetLoading ? '送信中...' : 'パスワードを忘れた方はこちら'}
            </button>
          </div>
        </form>

        <p className="text-center text-white/40 text-sm mt-8">
          アカウントをお持ちでない方は{' '}
          <Link to="/register" className="text-amber-400 hover:underline">
            新規登録
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link
            to="/install-guide"
            className="text-amber-400/80 text-sm hover:text-amber-400 transition inline-flex items-center gap-1"
          >
            📱 ホーム画面に追加する方法
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 mt-6 pt-4 border-t border-white/10 text-[11px]">
          <Link to="/privacy" className="text-white/40 hover:text-amber-400/80 transition">プライバシーポリシー</Link>
          <span className="text-white/20">|</span>
          <Link to="/terms" className="text-white/40 hover:text-amber-400/80 transition">利用規約</Link>
          <span className="text-white/20">|</span>
          <Link to="/tokushoho" className="text-white/40 hover:text-amber-400/80 transition">特商法表記</Link>
          <span className="text-white/20">|</span>
          <Link to="/licenses" className="text-white/40 hover:text-amber-400/80 transition">ライセンス</Link>
        </div>
      </div>
    </div>
  )
}
