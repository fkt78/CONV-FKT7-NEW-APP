import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../components/LegalPageLayout'

export default function AdvertisingNotice() {
  const { t } = useTranslation()
  const la = (key: string) => t(`legal.advertising.${key}`)

  return (
    <LegalPageLayout title={t('legal.advertising.title')}>
      <p>{la('intro')}</p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{la('s1_title')}</h2>
        <p>{la('s1_p1')}</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>{la('s1_li1')}</li>
          <li>{la('s1_li2')}</li>
          <li>{la('s1_li3')}</li>
        </ul>
        <p className="mt-2">{la('s1_p2')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{la('s2_title')}</h2>
        <p>{la('s2_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{la('s3_title')}</h2>
        <p>{la('s3_p1')}</p>
        <p className="mt-2">{la('s3_p2')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{la('s4_title')}</h2>
        <p>
          {la('s4_before_terms')}
          <Link to="/terms" className="text-[#0095B6] underline hover:text-[#007A96]">
            {t('footer.terms')}
          </Link>
          {la('s4_between')}
          <Link to="/privacy" className="text-[#0095B6] underline hover:text-[#007A96]">
            {t('footer.privacy')}
          </Link>
          {la('s4_after')}
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{la('s5_title')}</h2>
        <p>{la('s5_body')}</p>
      </section>

      <div className="text-[#86868b] text-xs mt-8 space-y-1">
        <p>{la('enacted')}</p>
      </div>
    </LegalPageLayout>
  )
}
