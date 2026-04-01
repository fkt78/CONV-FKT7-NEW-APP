import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import LanguageSwitcher from './LanguageSwitcher'

interface LegalPageLayoutProps {
  title: string
  children: React.ReactNode
}

export default function LegalPageLayout({ title, children }: LegalPageLayoutProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="h-dvh bg-[#f5f5f7] flex flex-col overflow-hidden">
      <div className="h-px bg-gradient-to-r from-transparent via-[#0095B6]/30 to-transparent flex-shrink-0" />
      <div className="h-px bg-gradient-to-r from-transparent via-[#5BC8D7]/20 to-transparent flex-shrink-0" />

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto px-5 py-6 pb-10 safe-area-top safe-area-bottom">
          <div className="flex items-center justify-between gap-3 mb-6">
            <button
              onClick={() => navigate(-1)}
              aria-label={t('common.back')}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2 text-[#0095B6] text-[17px] hover:text-[#007A96] transition rounded-lg"
            >
              {t('common.backWithArrow')}
            </button>
            <LanguageSwitcher className="flex-shrink-0" />
          </div>

          <h1 className="text-[#1d1d1f] font-semibold text-[22px] mb-6">{title}</h1>

          <div className="text-[#1d1d1f] text-[17px] leading-[1.5] space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
