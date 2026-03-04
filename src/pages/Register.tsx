import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

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
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /**
   * ブラックリスト照合 — フィールド名は Firestore ドキュメントに合わせて 'fullName' / 'email'
   * Firestore の読み取りに失敗した場合は例外をそのまま throw し、
   * 呼び出し元で「登録不可」として処理する（エラー握り潰し禁止）
   */
  async function checkBlacklist(name: string, emailAddr: string): Promise<boolean> {
    const blRef = collection(db, 'blacklist')

    const [nameSnap, emailSnap] = await Promise.all([
      getDocs(query(blRef, where('fullName', '==', name))),
      getDocs(query(blRef, where('email', '==', emailAddr))),
    ])

    return !nameSnap.empty || !emailSnap.empty
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
    <div className="min-h-screen bg-[#0f0f23] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <span className="text-5xl">♛</span>
          <h1 className="text-amber-400 font-bold text-xl tracking-widest mt-2">
            VIP Member
          </h1>
          <p className="text-white/40 text-sm mt-1">会員登録</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 text-center">
              {error}
            </div>
          )}

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              お名前（フルネーム） <span className="text-amber-400">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="山田 太郎"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition"
            />
            <p className="text-white/30 text-[11px] mt-1">
              ※ 店頭での身分証照合に使用します。本名を入力してください。
            </p>
          </div>

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              生年月 <span className="text-amber-400">*</span>
            </label>
            <input
              type="month"
              required
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              属性 <span className="text-amber-400">*</span>
            </label>
            <select
              value={attribute}
              onChange={(e) => setAttribute(e.target.value as Attribute)}
              className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition"
            >
              {(Object.keys(ATTRIBUTE_LABELS) as Attribute[]).map((key) => (
                <option key={key} value={key}>
                  {ATTRIBUTE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white/60 text-xs font-medium mb-1.5 tracking-wide">
              メールアドレス <span className="text-amber-400">*</span>
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
              パスワード <span className="text-amber-400">*</span>
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6文字以上"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold py-3 rounded-lg hover:from-amber-400 hover:to-yellow-400 transition disabled:opacity-50"
          >
            {loading ? '確認中...' : '登録する'}
          </button>
        </form>

        <p className="text-center text-white/40 text-sm mt-8">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-amber-400 hover:underline">
            ログイン
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
      </div>
    </div>
  )
}
