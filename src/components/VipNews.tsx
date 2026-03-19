import { useState, useEffect } from 'react'
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  type Timestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import AudioPlayer from './AudioPlayer'

interface NewsItem {
  id: string
  title: string
  content: string
  audioUrl: string
  createdAt: Date | null
  expiresAt: Date | null
}

const INITIAL_SHOW = 2

export default function VipNews() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(q, (snap) => {
      setLoading(false)
      const now = Date.now()
      setNewsList(
        snap.docs
          .map((d) => ({
            id: d.id,
            title: d.data().title as string,
            content: d.data().content as string,
            audioUrl: (d.data().audioUrl as string) ?? '',
            createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
            expiresAt: (d.data().expiresAt as Timestamp | null)?.toDate() ?? null,
          }))
          .filter((item) => !item.expiresAt || item.expiresAt.getTime() > now),
      )
    }, (err) => {
      console.error('VipNews購読エラー:', err)
      setLoading(false)
    })
  }, [])

  function formatDate(d: Date | null) {
    if (!d) return ''
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return '今日'
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="mx-4 mt-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[#007AFF] text-[13px] font-semibold tracking-wide">VIP NEWS</span>
        </div>
        <div className="rounded-2xl bg-white border border-[#e5e5ea] p-4 flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <span className="w-5 h-5 border-2 border-[#e5e5ea] border-t-[#007AFF] rounded-full animate-spin" />
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
          <span className="text-[#007AFF] text-sm">📢</span>
          <span className="text-[#007AFF] text-[13px] font-semibold tracking-wide">VIP NEWS</span>
        </div>
        {newsList.length > INITIAL_SHOW && (
          <button
            onClick={() => setShowAll(!showAll)}
            aria-label={showAll ? '折りたたむ' : `他 ${newsList.length - INITIAL_SHOW} 件を表示`}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center px-2 text-[#007AFF] text-[13px] hover:text-[#0051D5] transition rounded-xl"
          >
            {showAll ? '折りたたむ' : `他 ${newsList.length - INITIAL_SHOW} 件`}
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
              aria-label={isOpen ? `${item.title}を閉じる` : `${item.title}を開く`}
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
                {item.audioUrl && <span className="text-[#007AFF]/70 text-[13px]">🎵</span>}
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
              <div className="px-4 pb-4 space-y-2 border-t border-[#e5e5ea]">
                {item.content && (
                  <p className="text-[#86868b] text-[15px] leading-relaxed pt-3 whitespace-pre-wrap">
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
