import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { logBannerClick } from '../lib/analytics'

interface BannerSlide {
  id: string
  bgImage: string
  bgPosition: string
  /** i18n キープレフィックス（例: banner.vpn） */
  i18nKey: string
  badgeColor: string
  href: string
  /** GA4 に送る日本語表示名 */
  labelJa: string
}

const SLIDES: BannerSlide[] = [
  {
    id: 'local-ad-recruit',
    bgImage: '/banners/local-ad-recruit.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.localAdRecruit',
    badgeColor: '#14532d',
    href: 'https://fkt-office.com/advertise.html',
    labelJa: '地元広告（募集）',
  },
  {
    id: 'ka-nabell',
    bgImage: '/banners/ka-nabell.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.kaNabell',
    badgeColor: '#c9a227',
    href: 'https://fkt-office.com/service-guide.html#ka-nabell',
    labelJa: 'カーナベル（KA-NABELL）',
  },
  {
    id: 'biglobe-wimax',
    bgImage: '/banners/biglobe-wimax-jp.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.biglobeWimax',
    badgeColor: '#ff6600',
    href: 'https://fkt-office.com/service-guide.html#biglobe-wimax',
    labelJa: 'BIGLOBE WiMAX +5G（日本向け）',
  },
  {
    id: 'biglobe-wimax-vn',
    bgImage: '/banners/biglobe-wimax-vn.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.biglobeWimaxVn',
    badgeColor: '#007aff',
    href: 'https://fkt-office.com/life-support.html#biglobe-wimax',
    labelJa: 'BIGLOBE WiMAX（外国人向け）',
  },
  {
    id: 'goen-mobile',
    bgImage: '/banners/goen-mobile.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.goenMobile',
    badgeColor: '#2e7d32',
    href: 'https://fkt-office.com/life-support.html#goen-mobile',
    labelJa: 'ごえんモバイル',
  },
  {
    id: 'vpn',
    bgImage: '/banners/vpn-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.vpn',
    badgeColor: '#ff3b30',
    href: 'https://fkt-office.com/life-support.html',
    labelJa: 'セカイVPN',
  },
  {
    id: 'abema',
    bgImage: '/banners/abema-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.abema',
    badgeColor: '#ff2d55',
    href: 'https://fkt-office.com/life-support.html',
    labelJa: 'ABEMAプレミアム',
  },
  {
    id: 'prepaid',
    bgImage: '/banners/prepaid-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.prepaid',
    badgeColor: '#34c759',
    href: 'https://fkt-office.com/life-support.html',
    labelJa: 'スマホプリペイド',
  },
  {
    id: 'furnished-share-house',
    bgImage: '/banners/furnished-share-house.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.furnishedShareHouse',
    badgeColor: '#ea580c',
    href: 'https://fkt-office.com/life-support.html#furnished-share-house',
    labelJa: '家具家電付きシェアハウス',
  },
  {
    id: 'sim',
    bgImage: '/banners/sim-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.sim',
    badgeColor: '#007aff',
    href: 'https://fkt-office.com/life-support.html',
    labelJa: '格安SIM（エキサイト）',
  },
  {
    id: 'dtisim',
    bgImage: '/banners/dtisim.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.dtisim',
    badgeColor: '#007aff',
    href: 'https://fkt-office.com/life-support.html#dtisim',
    labelJa: 'DTI SIM',
  },
  {
    id: 'daiwan-telecom',
    bgImage: '/banners/daiwan-telecom.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.daiwanTelecom',
    badgeColor: '#e30613',
    href: 'https://fkt-office.com/life-support.html#daiwan-telecom',
    labelJa: 'ダイワンテレコム',
  },
  {
    id: 'kojo-kyujin-navi',
    bgImage: '/banners/kojo-kyujin-navi.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.kojoKyujinNavi',
    badgeColor: '#1e3a5f',
    href: 'https://fkt-office.com/life-support.html#kojo-kyujin-navi',
    labelJa: '工場求人ナビ',
  },
  {
    id: 'agoda',
    bgImage: '/banners/agoda.jpg',
    bgPosition: 'right center',
    i18nKey: 'banner.agoda',
    badgeColor: '#006ce4',
    href: 'https://fkt-office.com/life-support.html#agoda',
    labelJa: 'agoda（ホテル予約）',
  },
  {
    id: 'commufa',
    bgImage: '/banners/commufa-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.commufa',
    badgeColor: '#ff9500',
    href: 'https://fkt-office.com/service-guide.html',
    labelJa: 'コミュファ光',
  },
  {
    id: 'rakuten',
    bgImage: '/banners/rakuten-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.rakuten',
    badgeColor: '#bf0000',
    href: 'https://fkt-office.com/service-guide.html',
    labelJa: '楽天市場',
  },
  {
    id: 'onamae',
    bgImage: '/banners/onamae-bg.png',
    bgPosition: 'right center',
    i18nKey: 'banner.onamae',
    badgeColor: '#007aff',
    href: 'https://fkt-office.com/service-guide.html',
    labelJa: 'お名前.com',
  },
]

const AUTO_PLAY_MS = 5000
const FADE_MS = 600
/** これ以上横に動かしたらスワイプとみなす（px） */
const SWIPE_THRESHOLD = 48
/** 縦スクロールと区別するため、横移動が縦のこの倍率以上ならスワイプ */
const SWIPE_RATIO = 1.15

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
  /** スワイプ直後の誤タップでリンクが開かないようにする */
  const blockLinkClickRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null)
  const currentRef = useRef(current)
  const total = SLIDES.length

  useEffect(() => {
    currentRef.current = current
  }, [current])

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

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    pointerStartRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const start = pointerStartRef.current
    pointerStartRef.current = null
    if (!start || start.id !== e.pointerId) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return
    e.preventDefault()
    blockLinkClickRef.current = true
    if (timerRef.current) clearTimeout(timerRef.current)
    const i = currentRef.current
    // 左にフリック（次へ）／右にフリック（前へ）— iOS カルーセルと同じ
    if (dx < 0) goTo(i + 1)
    else goTo(i - 1)
  }

  const handlePointerCancel = () => {
    pointerStartRef.current = null
  }

  const handleBannerClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (blockLinkClickRef.current) {
      e.preventDefault()
      blockLinkClickRef.current = false
      return
    }
    const s = SLIDES[currentRef.current]
    if (s) logBannerClick(s.id, s.labelJa)
  }

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
        className="block relative select-none cursor-grab active:cursor-grabbing"
        style={{
          height: '118px',
          touchAction: 'pan-y',
          opacity: fading ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleBannerClick}
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
