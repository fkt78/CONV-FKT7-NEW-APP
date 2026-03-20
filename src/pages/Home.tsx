import { useState, useEffect, useRef, useMemo } from 'react'
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
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { formatTime, isSameDay, formatDateDivider } from '../lib/formatTime'
import { messageMatches, highlightMatch } from '../lib/chatUtils'
import { useAuth } from '../contexts/AuthContext'
import { uploadChatAttachment, validateFile, type AttachmentType } from '../lib/chatAttachment'
import CouponWallet from '../components/CouponWallet'
import VipNews from '../components/VipNews'
import VoiceCreditsPopup from '../components/VoiceCreditsPopup'

type HomeTab = 'home' | 'chat' | 'coupon'

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

interface UserData {
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  totalSavedAmount?: number
  memberNumber?: number | null
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

export default function Home() {
  const { currentUser, userRole } = useAuth()
  const navigate = useNavigate()

  const [homeTab, setHomeTab] = useState<HomeTab>('chat')
  const [userData, setUserData] = useState<UserData | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [couponCount, setCouponCount] = useState(0)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())

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
  }, [currentUser])

  // 未使用クーポン数（有効期限内のみ）をバッジ表示用にカウント
  useEffect(() => {
    if (!currentUser) return
    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'unused'),
    )
    return onSnapshot(q, (snap) => {
      const now = Date.now()
      const validCount = snap.docs.filter((d) => {
        const exp = d.data().expiresAt
        if (!exp) return true
        const expMs = exp.toDate?.()?.getTime?.()
        if (typeof expMs !== 'number' || Number.isNaN(expMs)) return true
        return now <= expMs
      }).length
      setCouponCount(validCount)
    })
  }, [currentUser])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 未読メッセージ数（店長からの受信で未読のもの）
  const unreadMessageCount = messages.filter(
    (m) => currentUser && m.senderId !== currentUser.uid && !m.readAt,
  ).length

  // 受信メッセージを既読にする（チャットタブを表示しているときのみ）
  useEffect(() => {
    if (!currentUser || messages.length === 0 || homeTab !== 'chat') return
    const toMark = messages.filter(
      (m) => m.senderId !== currentUser.uid && !m.readAt,
    )
    if (toMark.length === 0) return
    Promise.all(
      toMark.map((m) =>
        updateDoc(doc(db, 'chats', currentUser.uid, 'messages', m.id), {
          readAt: serverTimestamp(),
          readBy: currentUser.uid,
        }),
      ),
    ).catch((err) => {
      if ((err as { code?: string })?.code !== 'not-found') {
        console.error('既読更新エラー:', err)
      }
    })
  }, [currentUser, messages, homeTab])

  const matchedIndices = useMemo(
    () =>
      searchQuery.trim()
        ? messages
            .map((m, i) => (messageMatches(m, searchQuery) ? i : -1))
            .filter((i) => i >= 0)
        : [],
    [searchQuery, messages],
  )
  const matchCount = matchedIndices.length
  const currentMatchIndex = Math.min(searchResultIndex, Math.max(0, matchCount - 1))

  useEffect(() => {
    setSearchResultIndex(0)
  }, [searchQuery])

  useEffect(() => {
    if (searchQuery.trim() && matchCount > 0) {
      const msg = messages[matchedIndices[0]]
      if (msg) {
        const timer = setTimeout(() => {
          messageRefsMap.current.get(msg.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [searchQuery, matchCount, matchedIndices, messages])

  const scrollToMatch = (index: number) => {
    const idx = matchedIndices[index]
    const msg = messages[idx]
    if (!msg) return
    messageRefsMap.current.get(msg.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function handleSearchPrev() {
    if (matchCount <= 1) return
    const next = currentMatchIndex <= 0 ? matchCount - 1 : currentMatchIndex - 1
    setSearchResultIndex(next)
    setTimeout(() => scrollToMatch(next), 50)
  }

  function handleSearchNext() {
    if (matchCount <= 1) return
    const next = currentMatchIndex >= matchCount - 1 ? 0 : currentMatchIndex + 1
    setSearchResultIndex(next)
    setTimeout(() => scrollToMatch(next), 50)
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
    if ((!trimmed && !selectedFile) || !currentUser || sending) return

    setSending(true)
    let attachmentUrl: string | undefined
    let attachmentType: AttachmentType | undefined
    let attachmentName: string | undefined

    try {
      if (selectedFile) {
        const result = await uploadChatAttachment(currentUser.uid, selectedFile)
        attachmentUrl = result.url
        attachmentType = result.type
        attachmentName = result.name
        setSelectedFile(null)
      }

      const displayText = trimmed || (attachmentType === 'image' ? '画像' : 'ファイル')
      const ts = serverTimestamp()
      await setDoc(
        doc(db, 'chats', currentUser.uid),
        {
          customerName: userData?.fullName ?? currentUser.displayName ?? '不明',
          customerUid: currentUser.uid,
          lastMessage: displayText,
          lastMessageAt: ts,
          unreadFromCustomer: true,
        },
        { merge: true },
      )
      await addDoc(collection(db, 'chats', currentUser.uid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: ts,
        ...(attachmentUrl && { attachmentUrl, attachmentType, attachmentName }),
      })
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

  const chatId = currentUser?.uid ?? ''
  const canEditMessage = (msg: Message) => msg.senderId === currentUser?.uid

  async function handleEditMessage(msg: Message) {
    setEditingMessageId(msg.id)
    setEditingText(msg.text ?? '')
    setOpenMenuId(null)
  }

  async function handleSaveEdit() {
    if (!editingMessageId || !chatId) return
    const trimmed = editingText.trim()
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', editingMessageId), {
        text: trimmed,
        editedAt: serverTimestamp(),
      })
      setEditingMessageId(null)
      setEditingText('')
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '編集に失敗しました')
    }
  }

  function handleCancelEdit() {
    setEditingMessageId(null)
    setEditingText('')
  }

  async function handleDeleteMessage(msg: Message) {
    if (!chatId || !window.confirm('このメッセージを削除しますか？')) return
    setOpenMenuId(null)
    try {
      await deleteDoc(doc(db, 'chats', chatId, 'messages', msg.id))
    } catch (err) {
      setFileError(err instanceof Error ? err.message : '削除に失敗しました')
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

      {/* ── タブ切り替え（先に配置してモバイルで見やすく） ── */}
      <div className="flex mx-4 mt-2 rounded-2xl bg-white p-1.5 flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-[#e5e5ea]">
        <button
          onClick={() => setHomeTab('home')}
          aria-label="ホーム"
          aria-pressed={homeTab === 'home'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition ${
            homeTab === 'home'
              ? 'bg-[#007AFF] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          🏠 ホーム
        </button>
        <button
          onClick={() => setHomeTab('chat')}
          aria-label={`チャット${unreadMessageCount > 0 ? `（未読${unreadMessageCount}件）` : ''}`}
          aria-pressed={homeTab === 'chat'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition relative ${
            homeTab === 'chat'
              ? 'bg-[#007AFF] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          💬 チャット
          {unreadMessageCount > 0 && homeTab !== 'chat' && (
            <span className="absolute top-1.5 right-3 min-w-[20px] h-5 px-1.5 bg-[#FF3B30] text-white text-[12px] font-semibold rounded-full flex items-center justify-center">
              {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
            </span>
          )}
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
              {couponCount > 99 ? '99+' : couponCount}
            </span>
          )}
        </button>
      </div>

      {/* ── コンテンツ（タブごとにフルスクリーン表示） ── */}
      {homeTab === 'home' ? (
        <div className="flex-1 overflow-y-auto min-h-0 mt-2 pb-4">
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
                {userData?.memberNumber != null && (
                  <span className="text-[13px] bg-[#f5f5f7] text-[#86868b] px-3 py-1 rounded-full font-mono">
                    会員番号 #{String(userData.memberNumber).padStart(5, '0')}
                  </span>
                )}
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
          <div className="mx-4 mt-4">
            <VipNews />
          </div>
        </div>
      ) : homeTab === 'coupon' ? (
        <div className="flex-1 flex flex-col min-h-0 mt-2 overflow-hidden">
          <CouponWallet />
        </div>
      ) : (
        <>
          {/* ── メッセージ検索 ── */}
          {messages.length > 0 && (
            <div className="px-4 py-2 bg-white border-b border-[#e5e5ea] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[#86868b] text-xs flex-shrink-0" aria-hidden>🔍</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="商品名・キーワードで検索"
                  className="flex-1 bg-[#f5f5f7] border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#007AFF] transition"
                  aria-label="メッセージを検索"
                />
                {matchCount > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[#86868b] text-[10px]">
                      {currentMatchIndex + 1}/{matchCount}
                    </span>
                    <button
                      type="button"
                      onClick={handleSearchPrev}
                      aria-label="前の検索結果"
                      className="w-7 h-7 rounded flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleSearchNext}
                      aria-label="次の検索結果"
                      className="w-7 h-7 rounded flex items-center justify-center text-[#007AFF] hover:bg-[#007AFF]/10 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                )}
                {searchQuery.trim() && matchCount === 0 && (
                  <span className="text-[#86868b] text-[10px] flex-shrink-0">該当なし</span>
                )}
              </div>
            </div>
          )}

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
                // 返信があれば既読とみなす（未読のまま返信は不自然なため）
                const hasReplyAfter = isOwn && currentUser && msg.createdAt && messages.some(
                  (m) => m.senderId !== currentUser.uid && m.createdAt && m.createdAt > msg.createdAt!,
                )
                const isRead = msg.readAt || hasReplyAfter

                return (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      if (el) messageRefsMap.current.set(msg.id, el)
                    }}
                  >
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

                      <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col group/message`}>
                        {!isOwn && (
                          <span className="text-[13px] text-[#007AFF] mb-0.5 ml-1 font-medium">店長</span>
                        )}
                        <div className="flex items-end gap-1">
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-[17px] leading-relaxed ${
                            isOwn
                              ? 'bg-[#007AFF] text-white rounded-br-sm shadow-sm'
                              : 'bg-white text-[#1d1d1f] border border-[#e5e5ea] rounded-bl-sm shadow-[0_1px_4px_rgba(0,0,0,0.04)]'
                          }`}
                        >
                          {editingMessageId === msg.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                className="w-full min-h-[60px] bg-transparent border-none outline-none resize-none text-inherit placeholder-white/70"
                                placeholder="メッセージを入力..."
                                autoFocus
                                rows={2}
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="text-sm px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30"
                                >
                                  キャンセル
                                </button>
                                <button
                                  type="button"
                                  onClick={handleSaveEdit}
                                  disabled={!editingText.trim()}
                                  className="text-sm px-3 py-1 rounded-lg bg-white/30 hover:bg-white/40 disabled:opacity-50"
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          ) : (
                          <>
                          {msg.attachmentUrl && (
                            <div className="mb-2">
                              {msg.attachmentType === 'image' ? (
                                <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer" className="block">
                                  <img
                                    src={msg.attachmentUrl}
                                    alt={msg.attachmentName ?? '画像'}
                                    className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={msg.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`text-sm underline ${isOwn ? 'text-white/90' : 'text-[#007AFF]'}`}
                                >
                                  📎{' '}
                                  {searchQuery.trim() && msg.attachmentName
                                    ? highlightMatch(msg.attachmentName, searchQuery)
                                    : (msg.attachmentName ?? 'ファイル')}
                                </a>
                              )}
                            </div>
                          )}
                          {msg.text && (
                            <span>
                              {searchQuery.trim()
                                ? highlightMatch(msg.text, searchQuery)
                                : msg.text}
                            </span>
                          )}
                          </>
                          )}
                        </div>
                        {isOwn && canEditMessage(msg) && editingMessageId !== msg.id && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === msg.id ? null : msg.id)}
                              aria-label="メッセージの操作"
                              className="p-1.5 rounded-lg hover:bg-black/10 text-white/80 hover:text-white"
                            >
                              ⋮
                            </button>
                            {openMenuId === msg.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  aria-hidden
                                  onClick={() => setOpenMenuId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 py-1 bg-white rounded-lg shadow-lg border border-[#e5e5ea] z-20 min-w-[100px]">
                                  <button
                                    type="button"
                                    onClick={() => handleEditMessage(msg)}
                                    className="w-full text-left px-3 py-2 text-sm text-[#1d1d1f] hover:bg-[#f5f5f7]"
                                  >
                                    編集
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(msg)}
                                    className="w-full text-left px-3 py-2 text-sm text-[#FF3B30] hover:bg-[#f5f5f7]"
                                  >
                                    削除
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                        </div>
                        <span className={`text-[13px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                          {formatTime(msg.createdAt)}
                          {isOwn && (
                            <span className="ml-1 text-[11px] opacity-80">
                              {isRead ? '既読' : '未読'}
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

          {/* ── メッセージ入力バー（Apple風：白背景・青アクセント） ── */}
          <div className="px-4 py-3 bg-white border-t border-[#e5e5ea] flex-shrink-0 safe-area-bottom">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label="ファイルを添付"
            />
            {fileError && (
              <p className="text-[#FF3B30] text-xs mb-2">{fileError}</p>
            )}
            {selectedFile && (
              <div className="flex items-center gap-2 mb-2 text-sm">
                <span className="text-[#86868b] truncate flex-1">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-[#FF3B30] text-xs"
                >
                  削除
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="ファイルを添付"
                className="touch-target w-11 h-11 flex items-center justify-center text-[#86868b] hover:text-[#007AFF] transition flex-shrink-0"
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
                placeholder="メッセージを入力..."
                aria-label="メッセージを入力"
                className="flex-1 min-h-[44px] bg-[#f5f5f7] border border-[#e5e5ea] rounded-full px-5 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition"
              />
              <button
                onClick={handleSend}
                disabled={(!text.trim() && !selectedFile) || sending}
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
