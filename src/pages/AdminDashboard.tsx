import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

interface UserRecord {
  uid: string
  fullName: string
  email: string
  attribute: string
  birthMonth: string
}

interface ChatMeta {
  lastMessage: string
  lastMessageAt: Date | null
}

interface Message {
  id: string
  senderId: string
  text: string
  createdAt: Date | null
}

function formatTime(date: Date | null): string {
  if (!date) return ''
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return '昨日'
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function formatMessageTime(date: Date | null): string {
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

const ATTRIBUTE_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

export default function AdminDashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()

  const [users, setUsers] = useState<UserRecord[]>([])
  const [chatMeta, setChatMeta] = useState<Record<string, ChatMeta>>({})
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showChatPanel, setShowChatPanel] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const q = query(collection(db, 'users'), where('status', '==', 'active'))
    return onSnapshot(q, (snap) => {
      setUsers(
        snap.docs.map((d) => ({
          uid: d.id,
          fullName: d.data().fullName as string,
          email: d.data().email as string,
          attribute: d.data().attribute as string,
          birthMonth: d.data().birthMonth as string,
        })),
      )
    })
  }, [])

  useEffect(() => {
    return onSnapshot(collection(db, 'chats'), (snap) => {
      const meta: Record<string, ChatMeta> = {}
      snap.docs.forEach((d) => {
        meta[d.id] = {
          lastMessage: (d.data().lastMessage as string) ?? '',
          lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
        }
      })
      setChatMeta(meta)
    })
  }, [])

  useEffect(() => {
    if (!selectedUid) return
    setMessages([])
    const q = query(
      collection(db, 'chats', selectedUid, 'messages'),
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
  }, [selectedUid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sortedUsers = [...users].sort((a, b) => {
    const aTime = chatMeta[a.uid]?.lastMessageAt
    const bTime = chatMeta[b.uid]?.lastMessageAt
    if (aTime && bTime) return bTime.getTime() - aTime.getTime()
    if (aTime) return -1
    if (bTime) return 1
    return 0
  })

  function selectUser(uid: string) {
    setSelectedUid(uid)
    setShowChatPanel(true)
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || !selectedUid || !currentUser || sending) return

    setSending(true)
    setText('')
    inputRef.current?.focus()

    try {
      const ts = serverTimestamp()
      await addDoc(collection(db, 'chats', selectedUid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: ts,
      })
      await setDoc(
        doc(db, 'chats', selectedUid),
        { lastMessage: trimmed, lastMessageAt: ts },
        { merge: true },
      )
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

  const selectedUser = users.find((u) => u.uid === selectedUid) ?? null

  return (
    <div className="h-screen bg-[#0f0f23] flex flex-col">
      {/* 管理者ヘッダー */}
      <header className="flex items-center justify-between px-4 py-3 bg-[#1a1a2e] border-b border-amber-400/10">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 text-xl">♛</span>
          <div>
            <span className="text-amber-400 font-bold text-sm tracking-widest">Admin Dashboard</span>
            <span className="text-white/30 text-[10px] ml-2">店長</span>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="text-white/40 text-xs hover:text-white transition"
        >
          ログアウト
        </button>
      </header>

      {/* メインエリア */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── 左パネル：顧客リスト ── */}
        <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-white/5 flex flex-col bg-[#12122a] ${showChatPanel ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-white/5">
            <h2 className="text-white/60 text-xs font-medium tracking-wide">
              VIP顧客 ({sortedUsers.length}名)
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedUsers.length === 0 ? (
              <p className="text-white/20 text-sm text-center py-10">
                登録済みの顧客がいません
              </p>
            ) : (
              sortedUsers.map((user) => {
                const meta = chatMeta[user.uid]
                const isSelected = selectedUid === user.uid
                const hasChat = !!meta?.lastMessageAt

                return (
                  <button
                    key={user.uid}
                    onClick={() => selectUser(user.uid)}
                    className={`w-full text-left px-4 py-3.5 border-b border-white/5 transition flex items-center gap-3 ${
                      isSelected
                        ? 'bg-amber-400/10 border-l-2 border-l-amber-400'
                        : 'hover:bg-white/5'
                    }`}
                  >
                    {/* アバター */}
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400/80 to-yellow-600/80 flex items-center justify-center">
                        <span className="text-black font-bold text-sm">
                          {user.fullName.charAt(0)}
                        </span>
                      </div>
                      {hasChat && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-[#12122a]" />
                      )}
                    </div>

                    {/* 顧客情報 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-medium truncate">
                          {user.fullName}
                        </span>
                        {meta?.lastMessageAt && (
                          <span className="text-white/20 text-[10px] flex-shrink-0 ml-2">
                            {formatTime(meta.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-white/30 text-xs truncate mt-0.5">
                        {meta?.lastMessage
                          ? meta.lastMessage
                          : `${ATTRIBUTE_LABELS[user.attribute] ?? user.attribute} · ${user.birthMonth}`}
                      </p>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── 右パネル：チャットエリア ── */}
        <div className={`flex-1 flex flex-col ${showChatPanel ? 'flex' : 'hidden md:flex'}`}>
          {selectedUser ? (
            <>
              {/* チャットヘッダー（選択中の顧客情報） */}
              <div className="flex items-center gap-3 px-4 py-3 bg-[#1a1a2e] border-b border-white/5">
                {/* モバイル: 戻るボタン */}
                <button
                  onClick={() => setShowChatPanel(false)}
                  className="md:hidden text-white/50 hover:text-white transition mr-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-black font-bold text-sm">
                    {selectedUser.fullName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-white text-sm font-medium">{selectedUser.fullName}</p>
                  <p className="text-white/30 text-[10px]">
                    {ATTRIBUTE_LABELS[selectedUser.attribute] ?? selectedUser.attribute} ·{' '}
                    {selectedUser.birthMonth}
                  </p>
                </div>
              </div>

              {/* メッセージ一覧 */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 ? (
                  <p className="text-white/20 text-sm text-center py-10">
                    まだメッセージはありません
                  </p>
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
                          {/* 顧客のアバター */}
                          {!isOwn && (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-400/80 to-yellow-600/80 flex items-center justify-center flex-shrink-0">
                              <span className="text-black text-[10px] font-bold">
                                {selectedUser.fullName.charAt(0)}
                              </span>
                            </div>
                          )}

                          <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                            {!isOwn && (
                              <span className="text-[10px] text-white/30 mb-0.5 ml-1">
                                {selectedUser.fullName}
                              </span>
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
                              {formatMessageTime(msg.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 返信入力バー */}
              <div className="px-4 py-3 bg-[#1a1a2e] border-t border-white/5">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`${selectedUser.fullName}さんに返信...`}
                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-white placeholder-white/30 text-sm focus:outline-none focus:border-amber-400/40 transition"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    className="w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center text-black disabled:opacity-30 transition hover:bg-amber-300"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="text-5xl text-amber-400/20 mb-4">♛</span>
              <p className="text-white/30 text-sm">左のリストから顧客を選択してください</p>
              <p className="text-white/15 text-xs mt-1">チャットが始まります</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
