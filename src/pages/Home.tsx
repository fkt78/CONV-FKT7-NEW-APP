import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
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
import VoiceCreditsPopup from '../components/VoiceCreditsPopup'

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
  const [creditsOpen, setCreditsOpen] = useState(false)
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
    <div className="h-dvh bg-[#f5f5f7] flex flex-col max-w-lg mx-auto">
      {/* ── ヘッダー（Apple風：白背景・控えめなシャドウ） ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea] flex-shrink-0 safe-area-top min-h-[44px] shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#007AFF] text-xl" aria-hidden>♛</span>
          <span className="text-[#1d1d1f] font-semibold text-[17px] tracking-wide">VIP Store</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/settings/notifications')}
            title="通知設定"
            aria-label="通知設定"
            className="touch-target flex items-center justify-center text-[#86868b] text-[17px] hover:text-[#007AFF] transition -m-2 p-2 rounded-xl"
          >
            🔔
          </button>
          <button
            onClick={() => navigate('/install-guide')}
            title="ホーム画面に追加"
            aria-label="ホーム画面に追加"
            className="touch-target flex items-center justify-center text-[#86868b] text-[17px] hover:text-[#007AFF] transition -m-2 p-2 rounded-xl"
          >
            📱
          </button>
          {userRole === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              aria-label="管理者設定"
              className="touch-target flex items-center justify-center text-[#007AFF] text-[15px] font-medium hover:text-[#0051D5] transition px-3 py-2 rounded-xl"
            >
              管理者設定 👑
            </button>
          )}
          <button
            onClick={handleLogout}
            aria-label="ログアウト"
            className="touch-target flex items-center justify-center text-[#86868b] text-[15px] hover:text-[#1d1d1f] transition px-3 py-2 rounded-xl"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* ── プロフィールカード（Apple風：白カード・ソフトシャドウ） ── */}
      <div className="mx-4 mt-4 rounded-2xl bg-white border border-[#e5e5ea] overflow-hidden flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <div className="p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5AC8FA] flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-white font-semibold text-xl">
              {displayName.charAt(0)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[#1d1d1f] font-semibold text-[17px] truncate">{displayName}さん</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[13px] bg-[#007AFF]/10 text-[#007AFF] px-3 py-1 rounded-full font-medium">
                VIP
              </span>
              {userData?.attribute && (
                <span className="text-[13px] bg-[#f5f5f7] text-[#86868b] px-3 py-1 rounded-full">
                  {ATTRIBUTE_LABELS[userData.attribute] ?? userData.attribute}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* 累計お得額 */}
        {(userData?.totalSavedAmount ?? 0) > 0 && (
          <div className="px-4 pb-4 pt-0">
            <div className="flex items-center gap-2 bg-[#f5f5f7] rounded-xl px-4 py-2.5">
              <span className="text-[#007AFF] text-sm">👑</span>
              <span className="text-[#86868b] text-[13px]">累計お得額</span>
              <span className="text-[#007AFF] font-bold text-[15px] ml-auto">
                ¥{(userData?.totalSavedAmount ?? 0).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── VIP NEWS ── */}
      <VipNews />

      {/* ── タブ切り替え（Apple風：白背景・アクティブは青） ── */}
      <div className="flex mx-4 mt-4 rounded-2xl bg-white p-1.5 flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-[#e5e5ea]">
        <button
          onClick={() => setHomeTab('chat')}
          aria-label="チャット"
          aria-pressed={homeTab === 'chat'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition ${
            homeTab === 'chat'
              ? 'bg-[#007AFF] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          💬 チャット
        </button>
        <button
          onClick={() => setHomeTab('coupon')}
          aria-label={`クーポン${couponCount > 0 ? `（${couponCount}件）` : ''}`}
          aria-pressed={homeTab === 'coupon'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition relative ${
            homeTab === 'coupon'
              ? 'bg-[#007AFF] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          🎫 クーポン
          {couponCount > 0 && homeTab !== 'coupon' && (
            <span className="absolute top-1.5 right-3 min-w-[20px] h-5 px-1.5 bg-[#FF3B30] text-white text-[12px] font-semibold rounded-full flex items-center justify-center">
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
                <div className="w-16 h-16 rounded-full bg-[#007AFF]/10 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#007AFF]/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-[#86868b] text-[15px]">店長にメッセージを送れます</p>
                <p className="text-[#86868b]/70 text-[13px] mt-1">お気軽にどうぞ</p>
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
                        <div className="flex-1 border-t border-[#e5e5ea]" />
                        <span className="px-3 text-[13px] text-[#86868b]">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                        <div className="flex-1 border-t border-[#e5e5ea]" />
                      </div>
                    )}

                    <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                      {!isOwn && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#007AFF] to-[#5AC8FA] flex items-center justify-center flex-shrink-0 shadow-sm">
                          <span className="text-white text-xs font-semibold">♛</span>
                        </div>
                      )}

                      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                        {!isOwn && (
                          <span className="text-[13px] text-[#007AFF] mb-0.5 ml-1 font-medium">店長</span>
                        )}
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-[17px] leading-relaxed ${
                            isOwn
                              ? 'bg-[#007AFF] text-white rounded-br-sm shadow-sm'
                              : 'bg-white text-[#1d1d1f] border border-[#e5e5ea] rounded-bl-sm shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
                          }`}
                        >
                          {msg.text}
                        </div>
                        <span className={`text-[13px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
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

          {/* ── メッセージ入力バー（Apple風：白背景・青アクセント） ── */}
          <div className="px-4 py-3 bg-white border-t border-[#e5e5ea] flex-shrink-0 safe-area-bottom">
            <div className="flex items-center gap-3">
              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                aria-label="メッセージを入力"
                className="flex-1 min-h-[44px] bg-[#f5f5f7] border border-[#e5e5ea] rounded-full px-5 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition"
              />
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending}
                aria-label="送信"
                className="touch-target w-11 h-11 bg-[#007AFF] rounded-full flex items-center justify-center text-white disabled:opacity-30 transition hover:bg-[#0051D5] active:scale-95 flex-shrink-0 shadow-sm"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── フッター（Apple風：薄いグレー背景） ── */}
      <footer className="flex-shrink-0 px-4 py-3 border-t border-[#e5e5ea] bg-white">
        <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-2 text-[13px]">
          <button
            onClick={() => setCreditsOpen(true)}
            aria-label="クレジット"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl"
          >
            クレジット
          </button>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/privacy" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            プライバシーポリシー
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/terms" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            利用規約
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/tokushoho" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            特商法表記
          </Link>
          <span className="text-[#e5e5ea]" aria-hidden>|</span>
          <Link to="/licenses" className="min-h-[44px] min-w-[44px] flex items-center justify-center px-3 py-2 text-[#86868b] hover:text-[#007AFF] transition rounded-xl">
            ライセンス
          </Link>
        </div>
      </footer>

      <VoiceCreditsPopup open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  )
}
