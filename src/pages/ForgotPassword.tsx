import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../lib/firebase'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    const trimmed = email.trim()
    if (!trimmed) {
      setError(t('forgotPassword.error.emptyEmail'))
      return
    }
    setLoading(true)
    try {
      await sendPasswordResetEmail(auth, trimmed)
      setInfo(t('forgotPassword.success'))
    } catch (err: unknown) {
      const code = (err as { code?: string }).code
      if (import.meta.env.DEV) {
        console.error('[ForgotPassword]', code, err)
      }
      if (code === 'auth/network-request-failed') {
        setError(t('forgotPassword.error.network'))
      } else if (code === 'auth/user-not-found') {
        setError(t('forgotPassword.error.userNotFound'))
      } else if (code === 'auth/invalid-email') {
        setError(t('forgotPassword.error.invalidEmail'))
      } else {
        setError(t('forgotPassword.error.sendFailed'))
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
        <div className="text-center mb-6">
          <span className="text-5xl" aria-hidden>♛</span>
          <h1 className="text-[#1d1d1f] font-semibold text-[22px] tracking-wide mt-3">
            {t('forgotPassword.title')}
          </h1>
          <p className="text-[#86868b] text-[17px] mt-2">{t('forgotPassword.subtitle')}</p>
        </div>

        <p className="text-[#1d1d1f] text-[15px] leading-relaxed mb-4">{t('forgotPassword.intro')}</p>

        <div className="rounded-2xl bg-white border border-[#e5e5ea] p-4 mb-5 shadow-sm">
          <p className="text-[#86868b] text-[13px] font-semibold uppercase tracking-wide mb-3">
            {t('forgotPassword.stepsTitle')}
          </p>
          <ol className="list-decimal list-inside space-y-2.5 text-[#1d1d1f] text-[15px] leading-relaxed">
            <li>{t('forgotPassword.step1')}</li>
            <li>{t('forgotPassword.step2')}</li>
            <li>{t('forgotPassword.step3')}</li>
            <li>{t('forgotPassword.step4')}</li>
          </ol>
          <p className="text-[#86868b] text-[13px] mt-4 leading-relaxed border-t border-[#e5e5ea] pt-3">
            {t('forgotPassword.spamHint')}
          </p>
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
            <label htmlFor="forgot-email" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('forgotPassword.email')}
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@email.com"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] bg-[#0095B6] text-white font-semibold text-[17px] py-3 rounded-2xl hover:bg-[#007A96] active:scale-[0.98] transition disabled:opacity-50 shadow-sm"
          >
            {loading ? t('forgotPassword.sending') : t('forgotPassword.submit')}
          </button>
        </form>

        <p className="text-center mt-8">
          <Link
            to="/login"
            className="min-h-[44px] inline-flex items-center justify-center text-[#0095B6] text-[15px] hover:text-[#007A96] font-medium"
          >
            {t('forgotPassword.backToLogin')}
          </Link>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 mt-8 pt-4 border-t border-[#e5e5ea] text-[13px]">
          <Link to="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.privacy')}
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#0095B6] transition rounded-xl">
            {t('footer.terms')}
          </Link>
        </div>
      </div>
    </div>
  )
}
