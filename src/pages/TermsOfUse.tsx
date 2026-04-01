import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../components/LegalPageLayout'

export default function TermsOfUse() {
  const { t } = useTranslation()
  const lt = (key: string) => t(`legal.terms.${key}`)

  const dates = t('legal.terms.dates', { returnObjects: true }) as string[]

  return (
    <LegalPageLayout title={t('legal.terms.title')}>
      <p>{lt('intro')}</p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s1_title')}</h2>
        <p>{lt('s1_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s2_title')}</h2>
        <p>{lt('s2_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s3_title')}</h2>
        <p className="whitespace-pre-line">{lt('s3_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s4_title')}</h2>
        <p>{lt('s4_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s5_title')}</h2>
        <p>
          {lt('s5_before')}
          <Link to="/privacy" className="text-[#0095B6] underline hover:text-[#007A96]">
            {t('footer.privacy')}
          </Link>
          {lt('s5_after')}
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s6_title')}</h2>
        <p>{lt('s6_p1')}</p>
        <p className="mt-2">
          {lt('s6_before_link')}
          <Link to="/advertising" className="text-[#0095B6] underline hover:text-[#007A96]">
            {lt('advertisingLinkText')}
          </Link>
          {lt('s6_after_link')}
        </p>
        <p className="mt-2">{lt('s6_p3')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s7_title')}</h2>
        <p>{lt('s7_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s8_title')}</h2>
        <p>{lt('s8_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s9_title')}</h2>
        <p>{lt('s9_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s10_title')}</h2>
        <p>{lt('s10_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s11_title')}</h2>
        <p>{lt('s11_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lt('s12_title')}</h2>
        <p>{lt('s12_body')}</p>
      </section>

      <div className="text-[#86868b] text-xs mt-8 space-y-1">
        {dates.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </LegalPageLayout>
  )
}
