import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../components/LegalPageLayout'

export default function PrivacyPolicy() {
  const { t } = useTranslation()
  const lp = (key: string) => t(`legal.privacy.${key}`)

  const dates = t('legal.privacy.dates', { returnObjects: true }) as string[]

  return (
    <LegalPageLayout title={t('legal.privacy.title')}>
      <p>{lp('intro')}</p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s1_title')}</h2>
        <p className="whitespace-pre-line">{lp('s1_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s2_title')}</h2>
        <p className="whitespace-pre-line">{lp('s2_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s3_title')}</h2>
        <p>{lp('s3_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s4_title')}</h2>
        <p>{lp('s4_p1')}</p>
        <p className="mt-2">
          {lp('s4_p2_intro')}
          <br />
          ・
          <a
            href="https://firebase.google.com/support/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0095B6] underline hover:text-[#007A96]"
          >
            {lp('firebasePrivacy')}
          </a>
          <br />
          ・
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0095B6] underline hover:text-[#007A96]"
          >
            {lp('googlePrivacy')}
          </a>
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s5_title')}</h2>
        <p>{lp('s5_p1')}</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>{lp('s5_li1')}</li>
          <li>{lp('s5_li2')}</li>
          <li>{lp('s5_li3')}</li>
        </ul>
        <p className="mt-2">{lp('s5_p2')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s6_title')}</h2>
        <p>{lp('s6_p1')}</p>
        <p className="mt-2">
          {lp('s6_p2_before')}
          <Link to="/advertising" className="text-[#0095B6] underline hover:text-[#007A96]">
            {t('footer.advertising')}
          </Link>
          {lp('s6_p2_after')}
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s7_title')}</h2>
        <p className="whitespace-pre-line">{lp('s7_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s8_title')}</h2>
        <p>{lp('s8_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s9_title')}</h2>
        <p>{lp('s9_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s10_title')}</h2>
        <p>{lp('s10_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s11_title')}</h2>
        <p>{lp('s11_body')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lp('s12_title')}</h2>
        <p>{lp('s12_body')}</p>
      </section>

      <div className="text-[#86868b] text-xs mt-8 space-y-1">
        {dates.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </LegalPageLayout>
  )
}
