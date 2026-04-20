import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getLocaleTag } from '../lib/formatTime'
import { normalizeNewsImageUrls } from '../lib/newsImages'
import AudioPlayer from './AudioPlayer'
import i18n from '../i18n'

interface NewsItem {
  id: string
  title: string
  content: string
  audioUrl: string
  imageUrls: string[]
  createdAt: Date | null
  expiresAt: Date | null
}

const INITIAL_SHOW = 2
const CACHE_KEY = 'vip-news-cache'
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheShape {
  items: Array<{
    id: string
    title: string
    content: string
    audioUrl: string
    imageUrls: string[]
    createdAt: string | null
    expiresAt: string | null
  }>
  fetchedAt: number
}

function readCache(): NewsItem[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cache = JSON.parse(raw) as CacheShape
    if (Date.now() - cache.fetchedAt > CACHE_TTL_MS) return null
    return cache.items.map((item) => ({
      ...item,
      createdAt: item.createdAt ? new Date(item.createdAt) : null,
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
    }))
  } catch {
    return null
  }
}

function writeCache(items: NewsItem[]) {
  try {
    const cache: CacheShape = {
      fetchedAt: Date.now(),
      items: items.map((item) => ({
        id: item.id,
        title: item.title,
        content: item.content,
        audioUrl: item.audioUrl,
        imageUrls: item.imageUrls,
        createdAt: item.createdAt?.toISOString() ?? null,
        expiresAt: item.expiresAt?.toISOString() ?? null,
      })),
    }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // sessionStorage が満杯でも無視
  }
}

export default function VipNews() {
  const { t } = useTranslation()
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const cached = readCache()
    if (cached) {
      const nowMs = Date.now()
      setNewsList(cached.filter((item) => !item.expiresAt || item.expiresAt.getTime() > nowMs))
      setLoading(false)
    }

    let cancelled = false
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(10))
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        const nowMs = Date.now()
        const items: NewsItem[] = snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title as string,
          content: d.data().content as string,
          audioUrl: (d.data().audioUrl as string) ?? '',
          imageUrls: normalizeNewsImageUrls(d.data()),
          createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
          expiresAt: (d.data().expiresAt as Timestamp | null)?.toDate() ?? null,
        }))
        writeCache(items)
        setNewsList(items.filter((item) => !item.expiresAt || item.expiresAt.getTime() > nowMs))
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('VipNewsフェッチエラー:', err)
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  function formatDate(d: Date | null) {
    if (!d) return ''
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return i18n.t('date.today')
    return d.toLocaleDateString(getLocaleTag(), { month: 'numeric', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="mx-4 mt-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[#0095B6] text-[13px] font-semibold tracking-wide">{t('vipNews.sectionLabel')}</span>
        </div>
        <div className="rounded-2xl bg-white border border-[#e5e5ea] p-4 flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <span className="w-5 h-5 border-2 border-[#e5e5ea] border-t-[#0095B6] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (newsList.length === 0) return null

  const displayList = showAll ? newsList : newsList.slice(0, INITIAL_SHOW)

  return (
    <div className="mx-4 mt-4 flex-shrink-0 space-y-2">
      {/* セクションラベル */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[#0095B6] text-sm">📢</span>
          <span className="text-[#0095B6] text-[13px] font-semibold tracking-wide">{t('vipNews.sectionLabel')}</span>
        </div>
        {newsList.length > INITIAL_SHOW && (
          <button
            onClick={() => setShowAll(!showAll)}
            aria-label={
              showAll
                ? t('vipNews.collapse')
                : t('vipNews.showMore', { count: newsList.length - INITIAL_SHOW })
            }
            className="min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-[#0095B6] text-[13px] hover:text-[#007A96] transition rounded-xl"
          >
            {showAll ? t('vipNews.collapse') : t('vipNews.showMore', { count: newsList.length - INITIAL_SHOW })}
          </button>
        )}
      </div>

      {/* ニュースカード一覧（Apple風：白カード・ソフトシャドウ） */}
      {displayList.map((item) => {
        const isOpen = expanded === item.id
        return (
          <div
            key={item.id}
            className="rounded-2xl bg-white border border-[#e5e5ea] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
          >
            <button
              onClick={() => setExpanded(isOpen ? null : item.id)}
              aria-label={
                isOpen ? t('vipNews.closeItem', { title: item.title }) : t('vipNews.openItem', { title: item.title })
              }
              aria-expanded={isOpen}
              className="w-full min-h-[44px] text-left px-4 py-3 flex items-center gap-2 hover:bg-[#f5f5f7] transition"
            >
              {item.createdAt && now - item.createdAt.getTime() < 86_400_000 && (
                <span className="text-[11px] bg-[#FF3B30] text-white px-2 py-0.5 rounded-lg font-semibold flex-shrink-0">
                  NEW
                </span>
              )}
              <span className="flex-1 text-[#1d1d1f] text-[15px] font-semibold truncate">{item.title}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.imageUrls.length > 0 && (
                  <span className="text-[#0095B6]/70 text-[13px]" title={t('vipNews.hasImage')}>🖼️</span>
                )}
                {item.audioUrl && <span className="text-[#0095B6]/70 text-[13px]" title={t('vipNews.hasAudio')}>🎵</span>}
                <span className="text-[#86868b] text-[13px]">{formatDate(item.createdAt)}</span>
                <svg
                  className={`w-4 h-4 text-[#86868b] transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-[#e5e5ea]">
                {item.imageUrls.length > 0 && (
                  <div className="pt-3 space-y-3">
                    {item.imageUrls.map((url) => (
                      <img
                        key={url}
                        src={url}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full rounded-xl border border-[#e5e5ea] object-contain max-h-[min(70vh,480px)] bg-[#f5f5f7]"
                      />
                    ))}
                  </div>
                )}
                {item.content && (
                  <p className="text-[#86868b] text-[15px] leading-relaxed whitespace-pre-wrap">
                    {item.content}
                  </p>
                )}
                {item.audioUrl && (
                  <AudioPlayer src={item.audioUrl} title={item.title} />
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
