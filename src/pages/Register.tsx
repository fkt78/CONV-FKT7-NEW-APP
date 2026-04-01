import { useState, type FormEvent } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, functions, httpsCallable } from '../lib/firebase'
import LanguageSwitcher from '../components/LanguageSwitcher'

type Attribute = 'male' | 'female' | 'student' | 'other'

export default function Register() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [attribute, setAttribute] = useState<Attribute>('male')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
      setError(t('register.error.fullName'))
      return
    }
    if (!birthMonth.match(/^\d{4}-(0[1-9]|1[0-2])$/)) {
      setError(t('register.error.birthMonth'))
      return
    }
    if (!agreeTerms) {
      setError(t('register.error.agreeTerms'))
      return
    }

    setLoading(true)

    let isBlacklisted = false
    try {
      isBlacklisted = await checkBlacklist(fullName.trim(), email.trim())
    } catch {
      setError(t('register.error.failed'))
      setLoading(false)
      return
    }

    if (isBlacklisted) {
      setError(t('register.error.failed'))
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
        setError(t('register.error.emailInUse'))
      } else if (code === 'auth/weak-password') {
        setError(t('register.error.weakPassword'))
      } else {
        setError(t('register.error.generic'))
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
            {t('register.title')}
          </h1>
          <p className="text-[#86868b] text-[17px] mt-2">{t('register.subtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 text-[#FF3B30] text-[15px] rounded-2xl p-4 text-center">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="reg-name" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('register.fullName')} <span className="text-[#0095B6]">{t('register.required')}</span>
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="山田 太郎"
              autoComplete="name"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
            <p className="text-[#86868b] text-[13px] mt-1">
              {t('register.nameHint')}
            </p>
          </div>

          <div>
            <label htmlFor="reg-birth" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('register.birthMonth')} <span className="text-[#0095B6]">{t('register.required')}</span>
            </label>
            <input
              id="reg-birth"
              type="month"
              required
              value={birthMonth}
              onChange={(e) => setBirthMonth(e.target.value)}
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
          </div>

          <div>
            <label htmlFor="reg-attribute" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('register.attribute')} <span className="text-[#0095B6]">{t('register.required')}</span>
            </label>
            <select
              id="reg-attribute"
              value={attribute}
              onChange={(e) => setAttribute(e.target.value as Attribute)}
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            >
              {(['male', 'female', 'student', 'other'] as const).map((key) => (
                <option key={key} value={key}>
                  {t(`register.attributeLabels.${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('register.email')} <span className="text-[#0095B6]">{t('register.required')}</span>
            </label>
            <input
              id="reg-email"
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
            <label htmlFor="reg-password" className="block text-[#86868b] text-[15px] font-medium mb-2 tracking-wide">
              {t('register.password')} <span className="text-[#0095B6]">{t('register.required')}</span>
            </label>
            <input
              id="reg-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('register.passwordPlaceholder')}
              autoComplete="new-password"
              className="w-full min-h-[44px] bg-white border border-[#e5e5ea] rounded-2xl px-4 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition shadow-sm"
            />
          </div>

          <label className="flex items-start gap-4 cursor-pointer group min-h-[44px]">
            <input
              type="checkbox"
              checked={agreeTerms}
              onChange={(e) => setAgreeTerms(e.target.checked)}
              aria-label={t('register.agreeAria')}
              className="mt-1 w-[22px] h-[22px] flex-shrink-0 rounded border-[#e5e5ea] bg-white text-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/50 focus:ring-offset-0"
            />
            <span className="text-[#1d1d1f] text-[15px] leading-relaxed">
              <Trans
                i18nKey="register.agreeText"
                components={{
                  termsLink: (
                    <Link
                      to="/terms"
                      className="text-[#0095B6] underline hover:text-[#007A96]"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                  privacyLink: (
                    <Link
                      to="/privacy"
                      className="text-[#0095B6] underline hover:text-[#007A96]"
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  ),
                  req: <span className="text-[#0095B6]" />,
                }}
              />
            </span>
          </label>

          <button
            type="submit"
            disabled={loading || !agreeTerms}
            className="w-full min-h-[52px] bg-[#0095B6] text-white font-semibold text-[17px] py-3 rounded-2xl hover:bg-[#007A96] active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm mt-2 mb-4"
          >
            {loading ? t('register.submitting') : t('register.submit')}
          </button>
        </form>

        <p className="text-center text-[#86868b] text-[15px] mt-8">
          {t('register.hasAccount')}{' '}
          <Link to="/login" className="text-[#0095B6] hover:underline">
            {t('register.login')}
          </Link>
        </p>
        <p className="text-center mt-4">
          <Link
            to="/install-guide"
            className="min-h-[44px] flex items-center justify-center text-[#0095B6] text-[15px] hover:text-[#007A96] transition"
          >
            {t('register.installGuide')}
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
