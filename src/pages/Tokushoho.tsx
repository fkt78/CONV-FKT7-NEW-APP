import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../components/LegalPageLayout'

export default function Tokushoho() {
  const { t } = useTranslation()
  const lk = (key: string) => t(`legal.tokushoho.${key}`)

  const dates = t('legal.tokushoho.dates', { returnObjects: true }) as string[]

  return (
    <LegalPageLayout title={t('legal.tokushoho.title')}>
      <p>{lk('intro')}</p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('businessName')}</h2>
        <p className="whitespace-pre-line">{lk('businessNameBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('operator')}</h2>
        <p>{lk('operatorBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('address')}</h2>
        <p>{lk('addressBody')}</p>
        <p className="text-[#86868b] text-xs mt-1">{lk('addressNote')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('contact')}</h2>
        <p>{lk('contactBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('price')}</h2>
        <p>{lk('priceBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('payment')}</h2>
        <p>{lk('paymentBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('delivery')}</h2>
        <p>{lk('deliveryBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('returns')}</h2>
        <p>{lk('returnsBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('businessNumber')}</h2>
        <p>{lk('businessNumberBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('seller')}</h2>
        <p>{lk('sellerBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('serviceTiming')}</h2>
        <p>{lk('serviceTimingBody')}</p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{lk('thirdParty')}</h2>
        <p>{lk('thirdPartyBody')}</p>
      </section>

      <div className="text-[#86868b] text-xs mt-8 space-y-1">
        {dates.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </LegalPageLayout>
  )
}
