import { useTranslation } from 'react-i18next'

const OPTIONS = [
  { value: 'ja', labelKey: 'language.ja' as const },
  { value: 'en', labelKey: 'language.en' as const },
  { value: 'vi', labelKey: 'language.vi' as const },
]

function normalizeLang(code: string | undefined): string {
  const base = (code ?? 'ja').split('-')[0]
  if (base === 'en' || base === 'vi') return base
  return 'ja'
}

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { i18n, t } = useTranslation()
  const current = normalizeLang(i18n.language)

  return (
    <label className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-[#86868b] text-[13px] whitespace-nowrap">{t('language.label')}</span>
      <select
        value={current}
        onChange={(e) => {
          void i18n.changeLanguage(e.target.value)
        }}
        className="min-h-[36px] text-[15px] text-[#1d1d1f] bg-white border border-[#e5e5ea] rounded-xl px-2 py-1.5 focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20"
        aria-label={t('language.label')}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {t(opt.labelKey)}
          </option>
        ))}
      </select>
    </label>
  )
}
