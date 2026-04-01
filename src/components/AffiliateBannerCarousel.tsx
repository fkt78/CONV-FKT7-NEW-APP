import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface BannerSlide {
  id: string
  bgImage: string
  bgPosition: string
  /** i18n キープレフィックス（例: banner.vpn） */
  i18nKey: string
  badgeColor: string
  href: string
}

const SLIDES: BannerSlide[] = [
  {
    id: 'vpn',
    bgImage: '/banners/vpn-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.vpn',
    badgeColor: '#ff3b30',
    href: 'https://fkt-office.com/life-support.html',
  },
  {
    id: 'abema',
    bgImage: '/banners/abema-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.abema',
    badgeColor: '#ff2d55',
    href: 'https://fkt-office.com/life-support.html',
  },
  {
    id: 'prepaid',
    bgImage: '/banners/prepaid-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.prepaid',
    badgeColor: '#34c759',
    href: 'https://fkt-office.com/life-support.html',
  },
]

const AUTO_PLAY_MS = 5000
const FADE_MS = 600

interface Props {
  /** true のとき: カード内下端に組み込む（外側マージンなし） */
  inCard?: boolean
}

export default function AffiliateBannerCarousel({ inCard = false }: Props) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(0)
  const [visible, setVisible] = useState(0)   // 実際に表示中のインデックス（フェード後に更新）
  const [fading, setFading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const total = SLIDES.length

  const goTo = useCallback(
    (next: number) => {
      const idx = ((next % total) + total) % total
      if (idx === current) return
      setFading(true)
      setTimeout(() => {
        setVisible(idx)
        setCurrent(idx)
        setFading(false)
      }, FADE_MS)
    },
    [current, total],
  )

  useEffect(() => {
    timerRef.current = setTimeout(() => goTo(current + 1), AUTO_PLAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current, goTo])

  const slide = SLIDES[visible]

  const wrapperStyle: React.CSSProperties = inCard
    ? {
        borderTop: '1px solid rgba(0,0,0,0.07)',
        borderRadius: '0 0 16px 16px',
        overflow: 'hidden',
      }
    : {
        margin: '16px 16px 0',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.08)',
      }

  return (
    <div style={wrapperStyle}>
      {/* ── バナー本体（フェード付き） ── */}
      <a
        href={slide.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t(`${slide.i18nKey}.title`)} — ${t(`${slide.i18nKey}.subtitle`)}`}
        className="block relative select-none"
        style={{
          height: '118px',
          opacity: fading ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
      >
        {/* 背景画像 */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${slide.bgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: slide.bgPosition,
            backgroundRepeat: 'no-repeat',
          }}
        />

        {/* グラデーションオーバーレイ（左→右で左を暗く） */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 52%, rgba(0,0,0,0.10) 100%)',
          }}
        />

        {/* テキストエリア（左寄せ） */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 20px',
            fontFamily: '-apple-system, "SF Pro Display", "Helvetica Neue", sans-serif',
          }}
        >
          {/* バッジ */}
          <div style={{ marginBottom: '5px' }}>
            <span
              style={{
                display: 'inline-block',
                backgroundColor: slide.badgeColor,
                color: '#fff',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.03em',
                padding: '2px 10px',
                borderRadius: '100px',
              }}
            >
              {t(`${slide.i18nKey}.badge`)}
            </span>
          </div>

          {/* メインタイトル */}
          <p
            style={{
              margin: 0,
              color: '#fff',
              fontSize: '21px',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.3px',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
            }}
          >
            {t(`${slide.i18nKey}.title`)}
          </p>

          {/* サブタイトル */}
          <p
            style={{
              margin: '5px 0 0',
              color: 'rgba(255,255,255,0.88)',
              fontSize: '12px',
              lineHeight: 1.45,
              textShadow: '0 1px 4px rgba(0,0,0,0.4)',
              maxWidth: '60%',
            }}
          >
            {t(`${slide.i18nKey}.subtitle`)}
          </p>
        </div>

        {/* 右下 CTA */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: 'rgba(255,255,255,0.80)',
            fontSize: '11px',
            fontFamily: '-apple-system, "SF Pro Text", sans-serif',
            fontWeight: 500,
            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        >
          {t(`${slide.i18nKey}.cta`)}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
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

      {/* ── ドットインジケーター ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 0 5px',
          backgroundColor: inCard ? '#fff' : 'transparent',
        }}
        role="tablist"
        aria-label="スライドインジケーター"
      >
        {SLIDES.map((s, idx) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={idx === current}
            aria-label={`スライド ${idx + 1}`}
            onClick={() => {
              if (timerRef.current) clearTimeout(timerRef.current)
              goTo(idx)
            }}
            style={{
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              borderRadius: '100px',
              transition: 'all 0.35s ease',
              width: idx === current ? '18px' : '6px',
              height: '6px',
              backgroundColor: idx === current ? '#0095B6' : '#c7c7cc',
            }}
          />
        ))}
      </div>
    </div>
  )
}
