import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'

interface BannerSlide {
  id: string
  bgImage: string
  bgPosition: string
  badge: string
  badgeSub?: string
  title: string
  subtitle: string
  href: string
  /** 'foreign' = vi/en ユーザー向け | 'japanese' = ja ユーザー向け | 'all' = 全員 */
  audience: 'foreign' | 'japanese' | 'all'
}

const SLIDES: BannerSlide[] = [
  {
    id: 'vpn',
    bgImage: '/banners/vpn-bg.png',
    bgPosition: 'right center',
    badge: '2ヶ月無料',
    badgeSub: '2 Months Free',
    title: 'セカイVPN',
    subtitle: '日本の動画や母国のサイトを安全に',
    href: 'https://fkt-office.com/life-support.html',
    audience: 'foreign',
  },
]

const AUTO_PLAY_MS = 5000

export default function AffiliateBannerCarousel() {
  const { i18n } = useTranslation()
  const lang = i18n.language

  const visibleSlides = SLIDES.filter((s) => {
    if (s.audience === 'all') return true
    if (s.audience === 'foreign') return lang !== 'ja'
    if (s.audience === 'japanese') return lang === 'ja'
    return false
  })

  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goTo = useCallback(
    (index: number) => {
      setCurrent(((index % visibleSlides.length) + visibleSlides.length) % visibleSlides.length)
    },
    [visibleSlides.length],
  )

  useEffect(() => {
    if (visibleSlides.length <= 1) return
    timerRef.current = setTimeout(() => goTo(current + 1), AUTO_PLAY_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current, goTo, visibleSlides.length])

  if (visibleSlides.length === 0) return null

  const slide = visibleSlides[current]

  return (
    <div className="mx-4 mt-4">
      {/* バナー本体 */}
      <a
        href={slide.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${slide.title} — ${slide.subtitle}`}
        className="block relative overflow-hidden select-none"
        style={{
          height: '130px',
          borderRadius: '16px',
          boxShadow:
            '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
        }}
      >
        {/* ── 背景画像 ── */}
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

        {/* ── グラデーションオーバーレイ（左→右、左側を暗く） ── */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.52) 55%, rgba(0,0,0,0.10) 100%)',
          }}
        />

        {/* ── テキストコンテンツ（左寄せ） ── */}
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
          <div style={{ marginBottom: '6px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: '#ff3b30',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.02em',
                padding: '2px 10px',
                borderRadius: '100px',
                textShadow: 'none',
              }}
            >
              {slide.badge}
              {slide.badgeSub && (
                <>
                  <span style={{ opacity: 0.7, margin: '0 2px' }}>／</span>
                  {slide.badgeSub}
                </>
              )}
            </span>
          </div>

          {/* メインタイトル */}
          <p
            style={{
              margin: 0,
              color: '#ffffff',
              fontSize: '22px',
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: '-0.3px',
              textShadow: '0 1px 8px rgba(0,0,0,0.5)',
            }}
          >
            {slide.title}
          </p>

          {/* サブタイトル */}
          <p
            style={{
              margin: '5px 0 0',
              color: 'rgba(255,255,255,0.88)',
              fontSize: '12px',
              fontWeight: 400,
              lineHeight: 1.45,
              textShadow: '0 1px 4px rgba(0,0,0,0.45)',
              maxWidth: '58%',
            }}
          >
            {slide.subtitle}
          </p>
        </div>

        {/* ── 右下：詳細を見る ── */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: 'rgba(255,255,255,0.75)',
            fontSize: '11px',
            fontFamily: '-apple-system, "SF Pro Text", sans-serif',
            fontWeight: 500,
            textShadow: '0 1px 3px rgba(0,0,0,0.4)',
          }}
        >
          詳細を見る
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
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </a>

      {/* ── ドットインジケーター（複数スライド時のみ） ── */}
      {visibleSlides.length > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            marginTop: '8px',
          }}
          role="tablist"
          aria-label="スライドインジケーター"
        >
          {visibleSlides.map((s, idx) => (
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
