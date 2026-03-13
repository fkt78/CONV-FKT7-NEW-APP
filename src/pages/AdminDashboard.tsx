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
  updateDoc,
  where,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import { uploadChatAttachment, validateFile, type AttachmentType } from '../lib/chatAttachment'
import CouponManager from '../components/CouponManager'
import NewsManager from '../components/NewsManager'
import RoadmapManager from '../components/RoadmapManager'
import UserManager from '../components/UserManager'

type AdminTab = 'chat' | 'coupon' | 'news' | 'users' | 'roadmap'

interface UserRecord {
  uid: string
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  totalSavedAmount: number
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
  readAt: Date | null
  attachmentUrl?: string
  attachmentType?: AttachmentType
  attachmentName?: string
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showChatPanel, setShowChatPanel] = useState(false)
  const [adminTab, setAdminTab] = useState<AdminTab>('chat')

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
          totalSavedAmount: (d.data().totalSavedAmount as number) ?? 0,
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
        snap.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            senderId: data.senderId as string,
            text: (data.text as string) ?? '',
            createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
            attachmentUrl: data.attachmentUrl as string | undefined,
            attachmentType: data.attachmentType as AttachmentType | undefined,
            attachmentName: data.attachmentName as string | undefined,
          }
        }),
      )
    })
  }, [selectedUid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 受信メッセージを既読にする（顧客からのメッセージ）
  useEffect(() => {
    if (!currentUser || !selectedUid || messages.length === 0) return
    const toMark = messages.filter(
      (m) => m.senderId === selectedUid && !m.readAt,
    )
    if (toMark.length === 0) return
    Promise.all(
      toMark.map((m) =>
        updateDoc(doc(db, 'chats', selectedUid, 'messages', m.id), {
          readAt: serverTimestamp(),
          readBy: currentUser.uid,
        }),
      ),
    ).catch((err) => console.error('既読更新エラー:', err))
  }, [currentUser, selectedUid, messages])

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null)
    const file = e.target.files?.[0]
    if (!file) return
    const err = validateFile(file)
    if (err) {
      setFileError(err)
      return
    }
    setSelectedFile(file)
    e.target.value = ''
  }

  async function handleSend() {
    const trimmed = text.trim()
    if ((!trimmed && !selectedFile) || !selectedUid || !currentUser || sending) return

    setSending(true)
    let attachmentUrl: string | undefined
    let attachmentType: AttachmentType | undefined
    let attachmentName: string | undefined

    try {
      if (selectedFile) {
        const result = await uploadChatAttachment(selectedUid, selectedFile)
        attachmentUrl = result.url
        attachmentType = result.type
        attachmentName = result.name
        setSelectedFile(null)
      }

      const displayText = trimmed || (attachmentType === 'image' ? '画像' : 'ファイル')
      const ts = serverTimestamp()
      await addDoc(collection(db, 'chats', selectedUid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: ts,
        ...(attachmentUrl && { attachmentUrl, attachmentType, attachmentName }),
      })
      await setDoc(
        doc(db, 'chats', selectedUid),
        { lastMessage: displayText, lastMessageAt: ts },
        { merge: true },
      )
      setText('')
      inputRef.current?.focus()
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'アップロードに失敗しました')
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
    <div className="h-screen bg-[#f5f5f7] flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea] shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#007AFF] text-xl">♛</span>
          <div>
            <span className="text-[#1d1d1f] font-semibold text-sm tracking-wide">Admin Dashboard</span>
            <span className="text-[#86868b] text-[10px] ml-2">店長</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-[#007AFF] text-xs hover:text-[#0051D5] transition"
            aria-label="通常画面へ戻る"
          >
            戻る
          </button>
          <button
            onClick={handleLogout}
            className="text-[#86868b] text-xs hover:text-[#1d1d1f] transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <div className="flex border-b border-[#e5e5ea] bg-white flex-shrink-0">
        <button
          onClick={() => setAdminTab('chat')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'chat'
              ? 'text-[#007AFF] border-b-2 border-[#007AFF]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          💬 チャット
        </button>
        <button
          onClick={() => setAdminTab('coupon')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'coupon'
              ? 'text-[#007AFF] border-b-2 border-[#007AFF]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          🎫 クーポン管理
        </button>
        <button
          onClick={() => setAdminTab('news')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'news'
              ? 'text-[#007AFF] border-b-2 border-[#007AFF]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📢 お知らせ管理
        </button>
        <button
          onClick={() => setAdminTab('users')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'users'
              ? 'text-[#007AFF] border-b-2 border-[#007AFF]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          👥 ユーザー管理
        </button>
        <button
          onClick={() => setAdminTab('roadmap')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'roadmap'
              ? 'text-[#007AFF] border-b-2 border-[#007AFF]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📋 実装予定
        </button>
      </div>

      {/* メインエリア */}
      {adminTab === 'roadmap' ? (
        <RoadmapManager />
      ) : adminTab === 'coupon' ? (
        <CouponManager />
      ) : adminTab === 'news' ? (
        <NewsManager />
      ) : adminTab === 'users' ? (
        <UserManager
          onOpenChat={(uid) => {
            setAdminTab('chat')
            setSelectedUid(uid)
            setShowChatPanel(true)
          }}
        />
      ) : adminTab === 'chat' ? (
        <div className="flex-1 flex overflow-hidden">
        {/* ── 左パネル：顧客リスト ── */}
        <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-[#e5e5ea] flex flex-col bg-white ${showChatPanel ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-4 py-3 border-b border-[#e5e5ea]">
            <h2 className="text-[#86868b] text-xs font-medium tracking-wide">
              VIP顧客 ({sortedUsers.length}名)
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto">
            {sortedUsers.length === 0 ? (
              <p className="text-[#86868b] text-sm text-center py-10">
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
                    className={`w-full text-left px-4 py-3.5 border-b border-[#e5e5ea] transition flex items-center gap-3 ${
                      isSelected
                        ? 'bg-[#007AFF]/10 border-l-4 border-l-[#007AFF]'
                        : 'hover:bg-[#f5f5f7]'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-[#007AFF] flex items-center justify-center">
                        <span className="text-white font-bold text-sm">
                          {user.fullName.charAt(0)}
                        </span>
                      </div>
                      {hasChat && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[#1d1d1f] text-sm font-medium truncate">
                          {user.fullName}
                        </span>
                        {meta?.lastMessageAt && (
                          <span className="text-[#86868b] text-[10px] flex-shrink-0 ml-2">
                            {formatTime(meta.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-[#86868b] text-xs truncate mt-0.5">
                        {meta?.lastMessage
                          ? meta.lastMessage
                          : `${ATTRIBUTE_LABELS[user.attribute] ?? user.attribute} · ${user.birthMonth}`}
                      </p>
                      {user.totalSavedAmount > 0 && (
                        <span className="text-[9px] text-[#007AFF] mt-0.5 inline-block">
                          👑 累計 ¥{user.totalSavedAmount.toLocaleString()}
                        </span>
                      )}
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
              <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-[#e5e5ea]">
                <button
                  onClick={() => setShowChatPanel(false)}
                  className="md:hidden text-[#007AFF] hover:text-[#0051D5] transition mr-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div className="w-9 h-9 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">
                    {selectedUser.fullName.charAt(0)}
                  </span>
                </div>
                <div>
                  <p className="text-[#1d1d1f] text-sm font-medium">{selectedUser.fullName}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[#86868b] text-[10px]">
                      {ATTRIBUTE_LABELS[selectedUser.attribute] ?? selectedUser.attribute} · {selectedUser.birthMonth}
                    </p>
                    {selectedUser.totalSavedAmount > 0 && (
                      <span className="text-[9px] bg-[#007AFF]/10 text-[#007AFF] px-1.5 py-0.5 rounded-full font-bold">
                        👑 ¥{selectedUser.totalSavedAmount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-[#f5f5f7]">
                {messages.length === 0 ? (
                  <p className="text-[#86868b] text-sm text-center py-10">
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
                            <div className="flex-1 border-t border-[#e5e5ea]" />
                            <span className="px-3 text-[10px] text-[#86868b]">
                              {formatDateDivider(msg.createdAt)}
                            </span>
                            <div className="flex-1 border-t border-[#e5e5ea]" />
                          </div>
                        )}

                        <div className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          {!isOwn && (
                            <div className="w-7 h-7 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0">
                              <span className="text-white text-[10px] font-bold">
                                {selectedUser.fullName.charAt(0)}
                              </span>
                            </div>
                          )}

                          <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                            {!isOwn && (
                              <span className="text-[10px] text-[#86868b] mb-0.5 ml-1">
                                {selectedUser.fullName}
                              </span>
                            )}
                            <div
                              className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                                isOwn
                                  ? 'bg-[#007AFF] text-white rounded-br-sm'
                                  : 'bg-white text-[#1d1d1f] rounded-bl-sm shadow-sm border border-[#e5e5ea]'
                              }`}
                            >
                              {msg.attachmentUrl && (
                                <div className="mb-2">
                                  {msg.attachmentType === 'image' ? (
                                    <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block">
                                      <img
                                        src={msg.attachmentUrl}
                                        alt={msg.attachmentName ?? '画像'}
                                        className="max-w-[160px] max-h-[160px] rounded-lg object-cover"
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      href={msg.attachmentUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`text-xs underline ${isOwn ? 'text-white/90' : 'text-[#007AFF]'}`}
                                    >
                                      📎 {msg.attachmentName ?? 'ファイル'}
                                    </a>
                                  )}
                                </div>
                              )}
                              {msg.text && <span>{msg.text}</span>}
                            </div>
                            <span className={`text-[10px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                              {formatMessageTime(msg.createdAt)}
                              {isOwn && (
                                <span className="ml-1 text-[9px] opacity-80">
                                  {msg.readAt ? '既読' : '未読'}
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-4 py-3 bg-white border-t border-[#e5e5ea]">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="ファイルを添付"
                />
                {fileError && (
                  <p className="text-[#FF3B30] text-[10px] mb-2">{fileError}</p>
                )}
                {selectedFile && (
                  <div className="flex items-center gap-2 mb-2 text-xs">
                    <span className="text-[#86868b] truncate flex-1">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFile(null)}
                      className="text-[#FF3B30] text-[10px]"
                    >
                      削除
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="ファイルを添付"
                    className="w-10 h-10 flex items-center justify-center text-[#86868b] hover:text-[#007AFF] transition flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={inputRef}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={`${selectedUser.fullName}さんに返信...`}
                    className="flex-1 bg-[#f5f5f7] border border-[#e5e5ea] rounded-full px-4 py-2.5 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#007AFF] transition"
                  />
                  <button
                    onClick={handleSend}
                    disabled={(!text.trim() && !selectedFile) || sending}
                    className="w-10 h-10 bg-[#007AFF] rounded-full flex items-center justify-center text-white disabled:opacity-30 transition hover:bg-[#0051D5]"
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
            <div className="flex-1 flex flex-col items-center justify-center text-center bg-[#f5f5f7]">
              <span className="text-5xl text-[#007AFF]/30 mb-4">♛</span>
              <p className="text-[#86868b] text-sm">左のリストから顧客を選択してください</p>
              <p className="text-[#86868b]/70 text-xs mt-1">チャットが始まります</p>
            </div>
          )}
        </div>
        </div>
      ) : null}
    </div>
  )
}
