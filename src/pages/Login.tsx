import { useState, useEffect, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const blockedFromRedirect = (location.state as { blocked?: boolean } | null)?.blocked

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(blockedFromRedirect ? t('login.error.blocked') : '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (blockedFromRedirect) {
      signOut(auth)
    }
  }, [blockedFromRedirect])

  useEffect(() => {
    if (blockedFromRedirect) {
      setError(t('login.error.blocked'))
    }
  }, [blockedFromRedirect, t])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const trimmedEmail = email.trim()
    const trimmedPassword = password.trim()
    if (!trimmedEmail || !trimmedPassword) {
      setError(t('login.error.empty'))
      setLoading(false)
      return
    }

    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword)
      navigate('/')
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      const message = (err as { message?: string }).message
      if (import.meta.env.DEV) {
        console.error('[Login]', code, message, err)
      }

      if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setError(t('login.error.invalidCredentials'))
      } else if (code === 'auth/network-request-failed') {
        setError(t('login.error.network'))
      } else if (code === 'auth/too-many-requests') {
        setError(t('login.error.tooManyRequests'))
      } else if (code === 'auth/invalid-email') {
        setError(t('login.error.invalidEmail'))
      } else if (code === 'auth/user-disabled') {
        setError(t('login.error.userDisabled'))
      } else if (code === 'auth/operation-not-allowed') {
        setError(t('login.error.operationNotAllowed'))
      } else if (code === 'auth/internal-error') {
        setError(t('login.error.internalError'))
      } else if (code === 'auth/unauthorized-domain') {
        setError(t('login.error.unauthorizedDomain'))
      } else if (code === 'auth/web-storage-unsupported' || code === 'auth/operation-not-supported-in-this-environment') {
        setError(t('login.error.privateBrowsing'))
      } else {
        setError(t('login.error.generic'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-dvh bg-[#f5f5f7] flex flex-col overflow-y-auto p-5 safe-area-top safe-area-bottom">
      <div className="w-full max-w-md mx-auto flex-1 py-6">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="text-center mb-8">
          <span className="text-5xl" aria-hidden>♛</span>
          <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide mt-3">
            {t('login.title')}
          </h1>
          <p className="text-[#86868b] text-[17px] mt-2">{t('login.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] text-[15px] rounded-2xl p-4 text-center">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="login-email" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('login.email')}
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              autoComplete="email"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('login.password')}
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-[#0095B6] text-white font-semibold text-[17px] py-3 rounded-2xl hover:bg-[#007A96] active:scale-[0.98] transition disabled:opacity-50 shadow-sm"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>

          <div className="text-center">
            <Link
              to="/forgot-password"
              className="min-h-[44px] inline-flex items-center justify-center text-[#0095B6] text-[15px] hover:text-[#007A96] transition px-4 py-2 font-medium"
            >
              {t('login.resetPassword')}
            </Link>
          </div>
        </form>

        <p className="text-center text-[#86868b] text-[13px] mt-6 px-4">
          {t('login.help')}
        </p>
        <p className="text-center text-[#86868b] text-[15px] mt-8">
          {t('login.noAccount')}{' '}
          <Link to="/register" className="text-[#0095B6] hover:underline font-medium">
            {t('login.register')}
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link
            to="/install-guide"
            className="min-h-[44px] flex items-center justify-center text-[#0095B6] text-[15px] hover:text-[#007A96] transition"
          >
            {t('login.installGuide')}
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 mt-6 pt-4 border-t border-[#e5e5ea] text-[13px]">
          <Link to="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.privacy')}
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.terms')}
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/advertising" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.advertising')}
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/tokushoho" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.tokushoho')}
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/licenses" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.licenses')}
          </Link>
        </div>
      </div>
    </div>
  )
}
