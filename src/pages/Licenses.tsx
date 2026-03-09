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
]

export default function Licenses() {
  return (
    <LegalPageLayout title="オープンソースライセンス">
      <p>
        本アプリは、有限会社吹田総業が作成しました。以下のオープンソースソフトウェアおよびサービスを利用しており、各ライセンスに従い、著作権表示およびライセンス条項を保持しています。
      </p>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">利用ライブラリ一覧</h2>
        <div className="space-y-3 mt-2">
          {LICENSES.map((item) => (
            <div
              key={item.name}
              className="rounded-lg bg-white/5 border border-white/10 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-white">{item.name}</span>
                <span className="text-amber-400/80 text-xs font-medium">{item.license}</span>
              </div>
              {item.version && (
                <p className="text-white/50 text-xs mt-1">バージョン: {item.version}</p>
              )}
              {item.url && (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400/70 text-xs underline hover:text-amber-400 mt-1 inline-block"
                >
                  プロジェクトページ
                </a>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">主なライセンスについて</h2>
        <p>
          <strong className="text-white/90">MIT License:</strong> 商用・非商用を問わず利用可能です。著作権表示および本ライセンスの複製を保持する限り、改変・再配布が許可されています。
        </p>
        <p className="mt-2">
          <strong className="text-white/90">Apache-2.0:</strong> 同様に広く利用可能です。変更箇所の明示等、一定の表示義務があります。
        </p>
        <p className="mt-2">
          <strong className="text-white/90">Firebase:</strong> Googleが提供するサービスです。利用にあたっては
          <a
            href="https://firebase.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline hover:text-amber-300 ml-1"
          >
            Firebase利用規約
          </a>
          に準拠します。
        </p>
      </section>

      <section>
        <h2 className="text-amber-400 font-bold text-base mt-6 mb-2">ライセンス全文</h2>
        <p>
          各ライセンスの全文は、上記プロジェクトページまたは
          <a
            href="https://opensource.org/licenses"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 underline hover:text-amber-300 ml-1"
          >
            Open Source Initiative
          </a>
          等でご確認いただけます。
        </p>
      </section>

      <p className="text-white/60 text-xs mt-8">
        最終更新：2025年3月
      </p>
    </LegalPageLayout>
  )
}
