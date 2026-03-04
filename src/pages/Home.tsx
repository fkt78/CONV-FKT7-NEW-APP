import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import CouponWallet from '../components/CouponWallet'
import VipNews from '../components/VipNews'

type HomeTab = 'chat' | 'coupon'

interface Message {
  id: string
  senderId: string
  text: string
  createdAt: Date | null
}

interface UserData {
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  totalSavedAmount?: number
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

function formatTime(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function isSameDay(a: Date | null, b: Date | null): boolean {
  if (!a || !b) return false
  return a.toDateString() === b.toDateString()
}

function formatDateDivider(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return '今日'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return '昨日'
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function Home() {
  const { currentUser, userRole } = useAuth()
  const navigate = useNavigate()

  const [homeTab, setHomeTab] = useState<HomeTab>('chat')
  const [userData, setUserData] = useState<UserData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [couponCount, setCouponCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!currentUser) return
    return onSnapshot(doc(db, 'users', currentUser.uid), (snap) => {
      if (snap.exists()) setUserData(snap.data() as UserData)
    })
  }, [currentUser])

  useEffect(() => {
    if (!currentUser) return
    const q = query(
      collection(db, 'chats', currentUser.uid, 'messages'),
      orderBy('createdAt', 'asc'),
    )
    return onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({
          id: d.id,
          senderId: d.data().senderId as string,
          text: d.data().text as string,
          createdAt: (d.data().createdAt as Timestamp | null)?.toDate() ?? null,
        })),
      )
    })
  }, [currentUser])

  // 未使用クーポン数をバッジ表示用にカウント
  useEffect(() => {
    if (!currentUser) return
    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'unused'),
    )
    return onSnapshot(q, (snap) => setCouponCount(snap.size))
  }, [currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || !currentUser || sending) return

    setSending(true)
    setText('')
    inputRef.current?.focus()

    try {
      const ts = serverTimestamp()
      await setDoc(
        doc(db, 'chats', currentUser.uid),
        {
          customerName: userData?.fullName ?? currentUser.displayName ?? '不明',
          customerUid: currentUser.uid,
          lastMessage: trimmed,
          lastMessageAt: ts,
        },
        { merge: true },
      )
      await addDoc(collection(db, 'chats', currentUser.uid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: ts,
      })
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  const displayName = userData?.fullName ?? currentUser?.displayName ?? 'VIPメンバー'

  return (
    <div className="h-dvh bg-[#0f0f23] flex flex-col max-w-lg mx-auto">
      {/* ── ヘッダー ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#1a1a2e] border-b border-amber-400/10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">♛</span>
          <span className="text-amber-400 font-bold text-sm tracking-widest">VIP Store</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/install-guide')}
            title="ホーム画面に追加"
            className="text-amber-400/80 text-base hover:text-amber-400 transition"
          >
            📱
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="text-amber-400 text-xs font-semibold hover:text-amber-300 transition flex items-center gap-1"
            >
              管理者設定 👑
            </button>
          )}
          <button
            onClick={handleLogout}
            className="text-white/40 text-xs hover:text-white transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ── プロフィールカード ── */}
      <div className="mx-4 mt-3 rounded-xl bg-gradient-to-br from-[#1a1a2e] to-[#16213e] border border-amber-400/10 overflow-hidden flex-shrink-0">
        <div className="p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center flex-shrink-0">
            <span className="text-black font-bold text-lg">
              {displayName.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{displayName}さん</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-[10px] bg-amber-400/10 text-amber-400 px-2 py-0.5 rounded-full font-medium">
                VIP
              </span>
              {userData?.attribute && (
                <span className="text-[10px] bg-white/5 text-white/50 px-2 py-0.5 rounded-full">
                  {ATTRIBUTE_LABELS[userData.attribute] ?? userData.attribute}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* 累計お得額 */}
        {(userData?.totalSavedAmount ?? 0) > 0 && (
          <div className="px-3 pb-2.5 pt-0">
            <div className="flex items-center gap-2 bg-amber-400/[0.06] rounded-lg px-3 py-1.5">
              <span className="text-amber-400 text-xs">👑</span>
              <span className="text-white/50 text-[10px]">累計お得額</span>
              <span className="text-amber-400 font-black text-sm ml-auto">
                ¥{(userData?.totalSavedAmount ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── VIP NEWS ── */}
      <VipNews />

      {/* ── タブ切り替え ── */}
      <div className="flex mx-4 mt-3 rounded-lg bg-white/[0.03] p-0.5 flex-shrink-0">
        <button
          onClick={() => setHomeTab('chat')}
          className={`flex-1 py-2 rounded-md text-xs font-semibold tracking-wide transition ${
            homeTab === 'chat'
              ? 'bg-[#1a1a2e] text-amber-400 shadow-sm'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          💬 チャット
        </button>
        <button
          onClick={() => setHomeTab('coupon')}
          className={`flex-1 py-2 rounded-md text-xs font-semibold tracking-wide transition relative ${
            homeTab === 'coupon'
              ? 'bg-[#1a1a2e] text-amber-400 shadow-sm'
              : 'text-white/30 hover:text-white/50'
          }`}
        >
          🎫 クーポン
          {couponCount > 0 && homeTab !== 'coupon' && (
            <span className="absolute -top-1 -right-1 w-4.5 h-4.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {couponCount}
            </span>
          )}
        </button>
      </div>

      {/* ── コンテンツ切り替え ── */}
      {homeTab === 'coupon' ? (
        <div className="flex-1 flex flex-col min-h-0 mt-2">
          <CouponWallet />
        </div>
      ) : (
        <>
          {/* ── メッセージ一覧 ── */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3 min-h-0 mt-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-amber-400/5 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-400/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-white/30 text-sm">店長にメッセージを送れます</p>
                <p className="text-white/20 text-xs mt-1">お気軽にどうぞ</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const isOwn = msg.senderId === currentUser?.uid
                const prevMsg = messages[i - 1] ?? null
                const showDivider = !isSameDay(msg.createdAt, prevMsg?.createdAt ?? null)

                return (
                  <div key={msg.id}>
                    {showDivider && (
                      <div className="flex items-center justify-center my-4">
                        <div className="flex-1 border-t border-white/5" />
                        <span className="px-3 text-[10px] text-white/20">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                        <div className="flex-1 border-t border-white/5" />
                      </div>
                    )}

                    <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      {!isOwn && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-black text-xs font-bold">♛</span>
                        </div>
                      )}

                      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isOwn && (
                          <span className="text-[10px] text-amber-400/60 mb-0.5 ml-1">店長</span>
                        )}
                        <div
                          className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                            isOwn
                              ? 'bg-amber-400 text-black rounded-br-sm'
                              : 'bg-white/10 text-white rounded-bl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className={`text-[10px] text-white/20 mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── メッセージ入力バー ── */}
          <div className="px-4 py-3 bg-[#1a1a2e] border-t border-white/5 flex-shrink-0 safe-area-bottom">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400/40 transition"
              />
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center text-black disabled:opacity-30 transition hover:bg-amber-300 flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
