import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../components/LegalPageLayout'

interface LicenseItem {
  name: string
  version?: string
  license: string
  url?: string
}

const LICENSES: LicenseItem[] = [
  { name: 'React', version: '19.2.x', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'React DOM', version: '19.2.x', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: 'React Router DOM', version: '7.x', license: 'MIT', url: 'https://github.com/remix-run/react-router' },
  { name: 'Firebase', version: '12.x', license: 'Firebase Terms of Service', url: 'https://firebase.google.com/terms' },
  { name: 'Vite', version: '7.x', license: 'MIT', url: 'https://github.com/vitejs/vite' },
  { name: 'Tailwind CSS', version: '4.x', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: '@tailwindcss/vite', version: '4.x', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: '@vitejs/plugin-react', version: '5.x', license: 'MIT', url: 'https://github.com/vitejs/vite-plugin-react' },
  { name: 'vite-plugin-pwa', version: '1.x', license: 'MIT', url: 'https://github.com/vite-pwa/vite-plugin-pwa' },
  { name: 'workbox-precaching', version: '7.x', license: 'Apache-2.0', url: 'https://github.com/GoogleChrome/workbox' },
  { name: 'TypeScript', version: '5.9.x', license: 'Apache-2.0', url: 'https://github.com/microsoft/TypeScript' },
  { name: 'i18next', version: '26.x', license: 'MIT', url: 'https://github.com/i18next/i18next' },
  { name: 'react-i18next', version: '17.x', license: 'MIT', url: 'https://github.com/i18next/react-i18next' },
  { name: 'i18next-browser-languagedetector', version: '8.x', license: 'MIT', url: 'https://github.com/i18next/i18next-browser-languageDetector' },
]

export default function Licenses() {
  const { t } = useTranslation()
  const ll = (key: string) => t(`legal.licenses.${key}`)

  return (
    <LegalPageLayout title={t('legal.licenses.title')}>
      <p>{ll('intro')}</p>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{ll('listTitle')}</h2>
        <div className="space-y-3 mt-2">
          {LICENSES.map((item) => (
            <div
              key={item.name}
              className="rounded-xl bg-[#f5f5f7] border border-[#e5e5ea] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[#1d1d1f]">{item.name}</span>
                <span className="text-[#0095B6] text-xs font-medium">{item.license}</span>
              </div>
              {item.version && (
                <p className="text-[#86868b] text-xs mt-1">
                  {t('legal.licenses.versionLabel', { version: item.version })}
                </p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0095B6] text-xs underline hover:text-[#007A96] mt-1 inline-block"
                >
                  {ll('projectPage')}
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{ll('aboutTitle')}</h2>
        <p>
          <strong className="text-[#1d1d1f]">{ll('mit')}</strong> {ll('mitBody')}
        </p>
        <p className="mt-2">
          <strong className="text-[#1d1d1f]">{ll('apache')}</strong> {ll('apacheBody')}
        </p>
        <p className="mt-2">
          <strong className="text-[#1d1d1f]">{ll('firebase')}</strong> {ll('firebaseBefore')}
          <a
            href="https://firebase.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0095B6] underline hover:text-[#007A96] ml-1"
          >
            {ll('firebaseTerms')}
          </a>
          {ll('firebaseAfter')}
        </p>
      </section>

      <section>
        <h2 className="text-[#1d1d1f] font-semibold text-base mt-6 mb-2">{ll('fullTextTitle')}</h2>
        <p>
          {ll('fullTextBody')}
          <a
            href="https://opensource.org/licenses"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0095B6] underline hover:text-[#007A96] ml-1"
          >
            {ll('osi')}
          </a>
          {ll('fullTextAfter')}
        </p>
      </section>

      <p className="text-[#86868b] text-xs mt-8">
        {ll('lastUpdated')}
      </p>
    </LegalPageLayout>
  )
}
