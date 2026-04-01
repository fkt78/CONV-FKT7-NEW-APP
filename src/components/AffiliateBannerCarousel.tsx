import { useTranslation } from 'react-i18next'

interface BannerItem {
  id: string
  bgImage: string
  badge: string
  title: string
  subtitle: string
  href: string
}

const BANNER_ITEMS: BannerItem[] = [
  {
    id: 'vpn',
    bgImage: '/banners/vpn-banner.png',
    badge: '2ヶ月無料体験',
    title: 'セカイVPN',
    subtitle: '日本の動画や母国のサイトを安全に',
    href: 'https://fkt-office.com/life-support.html',
  },
]

export default function AffiliateBannerCarousel() {
  const { i18n } = useTranslation()
  const lang = i18n.language

  const visibleBanners = BANNER_ITEMS.filter(() => {
    if (lang === 'ja') return false
    return true
  })

  if (visibleBanners.length === 0) return null

  return (
    <div className="mx-4 mt-4">
      <div
        className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visibleBanners.map((item) => (
          <a
            key={item.id}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 snap-start block w-full rounded-2xl overflow-hidden relative"
            style={{
              height: '140px',
              minWidth: '100%',
              boxShadow: '0 4px 24px rgba(0,0,0,0.16), 0 1.5px 6px rgba(0,0,0,0.10)',
            }}
            aria-label={`${item.title} - ${item.subtitle}`}
          >
            {/* 背景画像 */}
            <img
              src={item.bgImage}
              alt=""
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* グラデーションオーバーレイ（下から上に向かって暗くなる） */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  'linear-gradient(to top, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.62) 100%)',
              }}
            />

            {/* テキストコンテンツ（上部に配置） */}
            <div className="absolute inset-0 flex flex-col justify-start px-5 pt-4">
              {/* バッジ */}
              <span
                className="self-start text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full mb-2"
                style={{
                  background: 'rgba(255,255,255,0.22)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  color: '#ffffff',
                  border: '1px solid rgba(255,255,255,0.35)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {item.badge}
              </span>

              {/* メインタイトル */}
              <span
                className="text-white font-bold text-[22px] leading-tight tracking-tight"
                style={{ textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}
              >
                {item.title}
              </span>

              {/* サブテキスト */}
              <span
                className="text-white/90 text-[13px] mt-1 leading-snug"
                style={{ textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
              >
                {item.subtitle}
              </span>
            </div>

            {/* タップ領域インジケーター（右下の矢印） */}
            <div className="absolute bottom-3 right-4 flex items-center gap-1">
              <span
                className="text-white/80 text-[11px] font-medium"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}
              >
                詳しく見る
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-3.5 h-3.5 text-white/80"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </a>
        ))}
      </div>

      {/* インジケータードット（複数枚になったとき用 / 現在は1枚） */}
      {visibleBanners.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2">
          {visibleBanners.map((item, idx) => (
            <span
              key={item.id}
              className={`block rounded-full transition-all ${idx === 0 ? 'w-4 h-1.5 bg-[#0095B6]' : 'w-1.5 h-1.5 bg-[#c7c7cc]'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
