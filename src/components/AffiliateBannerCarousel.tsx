import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface BannerSlide {
  id: string
  bgImage: string
  bgPosition: string
  /** i18n キーのプレフィックス（banner.xxx） */
  i18nKey: string
  href: string
}

const SLIDES: BannerSlide[] = [
  {
    id: 'vpn',
    bgImage: '/banners/vpn-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.vpn',
    href: 'https://fkt-office.com/life-support.html',
  },
]

const AUTO_PLAY_MS = 7000

interface Props {
  /** true のとき: カード内下端に組み込む（外側マージンなし・角丸なし） */
  inCard?: boolean
}

export default function AffiliateBannerCarousel({ inCard = false }: Props) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const total = SLIDES.length

  const goTo = useCallback(
    (index: number) => {
      setCurrent(((index % total) + total) % total)
    },
    [total],
  )

  useEffect(() => {
    if (total <= 1) return
    timerRef.current = setTimeout(() => goTo(current + 1), AUTO_PLAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current, goTo, total])

  const slide = SLIDES[current]

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
      {/* ── バナー本体 ── */}
      <a
        href={slide.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t(`${slide.i18nKey}.title`)} — ${t(`${slide.i18nKey}.subtitle`)}`}
        className="block relative select-none"
        style={{ height: '118px' }}
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

        {/* グラデーションオーバーレイ（左→右: 左を暗く） */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.54) 52%, rgba(0,0,0,0.08) 100%)',
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
                backgroundColor: '#ff3b30',
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
              maxWidth: '58%',
            }}
          >
            {t(`${slide.i18nKey}.subtitle`)}
          </p>
        </div>

        {/* 右下：CTA */}
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

      {/* ドットインジケーター（複数スライド時のみ） */}
      {total > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 0',
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
                transition: 'all 0.3s ease',
                width: idx === current ? '16px' : '6px',
                height: '6px',
                backgroundColor: idx === current ? '#0095B6' : '#c7c7cc',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
