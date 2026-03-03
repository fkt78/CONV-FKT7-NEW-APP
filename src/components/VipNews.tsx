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
}

const INITIAL_SHOW = 2

export default function VipNews() {
  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(q, (snap) => {
      setLoading(false)
      setNewsList(
        snap.docs.map((d) => ({
          id: d.id,
          title: d.data().title as string,
          content: d.data().content as string,
          audioUrl: (d.data().audioUrl as string) ?? '',
          createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
        })),
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
      <div className="mx-4 mt-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-amber-400/60 text-[10px] font-bold tracking-widest">VIP NEWS</span>
        </div>
        <div className="rounded-xl bg-[#1a1a2e] border border-amber-400/10 p-3 flex items-center justify-center">
          <span className="w-4 h-4 border-2 border-amber-400/20 border-t-amber-400 rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (newsList.length === 0) return null

  const displayList = showAll ? newsList : newsList.slice(0, INITIAL_SHOW)

  return (
    <div className="mx-4 mt-3 flex-shrink-0 space-y-2">
      {/* セクションラベル */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400 text-xs">📢</span>
          <span className="text-amber-400/80 text-[10px] font-bold tracking-widest">VIP NEWS</span>
        </div>
        {newsList.length > INITIAL_SHOW && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-white/30 text-[10px] hover:text-white/50 transition"
          >
            {showAll ? '折りたたむ' : `他 ${newsList.length - INITIAL_SHOW} 件`}
          </button>
        )}
      </div>

      {/* ニュースカード一覧 */}
      {displayList.map((item) => {
        const isOpen = expanded === item.id
        return (
          <div
            key={item.id}
            className="rounded-xl bg-gradient-to-r from-[#1a1a2e] to-[#16213e] border border-amber-400/10 overflow-hidden"
          >
            {/* カードヘッダー（タップで本文展開） */}
            <button
              onClick={() => setExpanded(isOpen ? null : item.id)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-2"
            >
              {/* NEW バッジ（24時間以内） */}
              {item.createdAt && Date.now() - item.createdAt.getTime() < 86_400_000 && (
                <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold flex-shrink-0">
                  NEW
                </span>
              )}
              <span className="flex-1 text-white text-xs font-bold truncate">{item.title}</span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {item.audioUrl && <span className="text-amber-400/50 text-[10px]">🎵</span>}
                <span className="text-white/20 text-[10px]">{formatDate(item.createdAt)}</span>
                <svg
                  className={`w-3 h-3 text-white/20 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </button>

            {/* 展開コンテンツ */}
            {isOpen && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/5">
                {item.content && (
                  <p className="text-white/60 text-xs leading-relaxed pt-2 whitespace-pre-wrap">
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
