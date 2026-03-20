import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
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
  memberNumber: number | null
  role?: string
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

/** メッセージが検索キーワードにマッチするか */
function messageMatches(msg: Message, q: string): boolean {
  if (!q.trim()) return true
  const lower = q.trim().toLowerCase()
  if (msg.text?.toLowerCase().includes(lower)) return true
  if (msg.attachmentName?.toLowerCase().includes(lower)) return true
  return false
}

/** テキスト内のキーワードをハイライト表示 */
function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={i} className="bg-[#FFE500]/70 rounded px-0.5">{part}</mark>
    ) : (
      part
    ),
  )
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [globalSearchResults, setGlobalSearchResults] = useState<
    Array<{ chatId: string; fullName: string; memberNumber: number | null; messages: Array<Message & { chatId: string }> }>
  >([])
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState<{ current: number; total: number } | null>(null)
  const [sendTargetUids, setSendTargetUids] = useState<string[] | null>(null)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const messagesForChatRef = useRef<string | null>(null)

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
          memberNumber: (d.data().memberNumber as number) ?? null,
          role: d.data().role as string | undefined,
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
    setSearchQuery('')
    messagesForChatRef.current = null
    const q = query(
      collection(db, 'chats', selectedUid, 'messages'),
      orderBy('createdAt', 'asc'),
    )
    return onSnapshot(q, (snap) => {
      messagesForChatRef.current = selectedUid
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
    if (messagesForChatRef.current !== selectedUid) return
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
    ).catch((err) => {
      if ((err as { code?: string })?.code !== 'not-found') {
        console.error('既読更新エラー:', err)
      }
    })
  }, [currentUser, selectedUid, messages])

  const sortedUsers = [...users].sort((a, b) => {
    const aTime = chatMeta[a.uid]?.lastMessageAt
    const bTime = chatMeta[b.uid]?.lastMessageAt
    if (aTime && bTime) return bTime.getTime() - aTime.getTime()
    if (aTime) return -1
    if (bTime) return 1
    return 0
  })

  const matchedIndices = searchQuery.trim()
    ? messages
        .map((m, i) => (messageMatches(m, searchQuery) ? i : -1))
        .filter((i) => i >= 0)
    : []
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
  }, [searchQuery, matchCount])

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

  function selectUser(uid: string) {
    setSelectedUid(uid)
    setShowChatPanel(true)
  }

  async function runGlobalSearch() {
    const q = globalSearchQuery.trim()
    if (!q) {
      setShowGlobalSearchResults(false)
      setGlobalSearchResults([])
      return
    }
    setGlobalSearchLoading(true)
    setShowGlobalSearchResults(true)
    try {
      const qRef = query(
        collectionGroup(db, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(500),
      )
      const snap = await getDocs(qRef)
      const userMap = Object.fromEntries(users.map((u) => [u.uid, { fullName: u.fullName, memberNumber: u.memberNumber }]))
      const matches: Array<Message & { chatId: string }> = []
      snap.docs.forEach((d) => {
        const chatId = d.ref.parent.parent?.id
        if (!chatId) return
        const data = d.data()
        const msg: Message & { chatId: string } = {
          id: d.id,
          chatId,
          senderId: data.senderId as string,
          text: (data.text as string) ?? '',
          createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
          readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
          attachmentUrl: data.attachmentUrl as string | undefined,
          attachmentType: data.attachmentType as AttachmentType | undefined,
          attachmentName: data.attachmentName as string | undefined,
        }
        if (messageMatches(msg, q)) matches.push(msg)
      })
      const byChat = new Map<string, Array<Message & { chatId: string }>>()
      matches.forEach((m) => {
        const arr = byChat.get(m.chatId) ?? []
        arr.push(m)
        byChat.set(m.chatId, arr)
      })
      const results = Array.from(byChat.entries()).map(([chatId, msgs]) => {
        const u = userMap[chatId] as { fullName: string; memberNumber: number | null } | undefined
        return {
          chatId,
          fullName: u?.fullName ?? '不明',
          memberNumber: u?.memberNumber ?? null,
          messages: msgs.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
        }
      })
      setGlobalSearchResults(results)
    } catch (err) {
      console.error('全チャット検索エラー:', err)
      setGlobalSearchResults([])
    } finally {
      setGlobalSearchLoading(false)
    }
  }

  function clearGlobalSearch() {
    setGlobalSearchQuery('')
    setGlobalSearchResults([])
    setShowGlobalSearchResults(false)
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

  /** 全員 or 選択メンバーに一斉送信 */
  async function handleBroadcastSend() {
    const trimmed = broadcastText.trim()
    if (!trimmed || !currentUser || broadcastSending) return

    const targets = sendTargetUids
      ? users.filter((u) => sendTargetUids.includes(u.uid))
      : users.filter((u) => u.role !== 'admin' && u.uid !== currentUser.uid)

    if (targets.length === 0) {
      alert('送信対象の会員がいません')
      return
    }

    setBroadcastSending(true)
    setBroadcastProgress({ current: 0, total: targets.length })

    try {
      const ts = serverTimestamp()
      for (let i = 0; i < targets.length; i++) {
        const uid = targets[i].uid
        await addDoc(collection(db, 'chats', uid, 'messages'), {
          senderId: currentUser.uid,
          text: trimmed,
          createdAt: ts,
        })
        await setDoc(
          doc(db, 'chats', uid),
          { lastMessage: trimmed.slice(0, 50), lastMessageAt: ts },
          { merge: true },
        )
        setBroadcastProgress({ current: i + 1, total: targets.length })
      }
      setBroadcastText('')
      setShowBroadcastModal(false)
      setSendTargetUids(null)
    } catch (err) {
      console.error('一斉送信エラー:', err)
      alert(`送信に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBroadcastSending(false)
      setBroadcastProgress(null)
      setSendTargetUids(null)
    }
  }

  function openBroadcastModal(targetUids: string[] | null = null) {
    setSendTargetUids(targetUids)
    setBroadcastText('')
    setShowBroadcastModal(true)
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
          onSendToSelected={(uids) => openBroadcastModal(uids)}
        />
      ) : adminTab === 'chat' ? (
        <div className="flex-1 flex overflow-hidden">
        {/* ── 左パネル：顧客リスト / 全チャット検索 ── */}
        <div className={`w-full md:w-80 md:flex-shrink-0 border-r border-[#e5e5ea] flex flex-col bg-white ${showChatPanel ? 'hidden md:flex' : 'flex'}`}>
          {/* 全チャット検索バー・一斉送信 */}
          <div className="px-4 py-3 border-b border-[#e5e5ea] space-y-2">
            <button
              type="button"
              onClick={() => openBroadcastModal(null)}
              className="w-full py-2.5 bg-[#007AFF] text-white text-xs font-semibold rounded-lg hover:bg-[#0051D5] transition flex items-center justify-center gap-2"
            >
              📢 全員に一斉送信
            </button>
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runGlobalSearch()}
                placeholder="商品名で全チャット検索（例: クリスマスケーキ）"
                className="flex-1 bg-[#f5f5f7] border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] text-xs focus:outline-none focus:border-[#007AFF] transition"
                aria-label="全チャット検索"
              />
              <button
                type="button"
                onClick={runGlobalSearch}
                disabled={globalSearchLoading || !globalSearchQuery.trim()}
                className="px-3 py-2 bg-[#007AFF] text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-[#0051D5] transition"
              >
                {globalSearchLoading ? '検索中' : '検索'}
              </button>
            </div>
            {showGlobalSearchResults && (
              <button
                type="button"
                onClick={clearGlobalSearch}
                className="text-[#007AFF] text-[10px] hover:underline"
              >
                ← 顧客一覧に戻る
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {showGlobalSearchResults ? (
              globalSearchLoading ? (
                <p className="text-[#86868b] text-sm text-center py-10">検索中...</p>
              ) : globalSearchResults.length === 0 ? (
                <p className="text-[#86868b] text-sm text-center py-10">
                  {globalSearchQuery.trim() ? '該当するメッセージがありません' : 'キーワードを入力して検索'}
                </p>
              ) : (
                <div className="divide-y divide-[#e5e5ea]">
                  {globalSearchResults.map(({ chatId, fullName, memberNumber, messages: msgs }) => {
                    const isSelected = selectedUid === chatId
                    return (
                    <button
                      key={chatId}
                      onClick={() => {
                        setSelectedUid(chatId)
                        setShowChatPanel(true)
                        setSearchQuery(globalSearchQuery.trim())
                      }}
                      className={`w-full text-left px-4 py-3 transition flex items-center gap-3 ${
                        isSelected
                          ? 'bg-[#007AFF]/10 border-l-4 border-l-[#007AFF]'
                          : 'hover:bg-[#f5f5f7]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#007AFF] flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{fullName.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#1d1d1f] text-sm font-medium truncate">
                            {memberNumber != null && (
                              <span className="text-[#86868b] font-mono text-[10px] mr-1.5">
                                #{String(memberNumber).padStart(5, '0')}
                              </span>
                            )}
                            {fullName}
                          </p>
                          <p className="text-[#86868b] text-[11px] truncate mt-0.5">
                            {msgs[0]?.text?.slice(0, 40) ?? msgs[0]?.attachmentName ?? '（添付）'}
                            {msgs.length > 1 && ` 他${msgs.length - 1}件`}
                          </p>
                        </div>
                      </div>
                    </button>
                    )
                  })}
                </div>
              )
            ) : sortedUsers.length === 0 ? (
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
                              {user.memberNumber != null && (
                                <span className="text-[#86868b] font-mono text-[10px] mr-1.5">
                                  #{String(user.memberNumber).padStart(5, '0')}
                                </span>
                              )}
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
                  <p className="text-[#1d1d1f] text-sm font-medium">
                    {selectedUser.memberNumber != null && (
                      <span className="text-[#86868b] font-mono text-[10px] mr-1.5">
                        #{String(selectedUser.memberNumber).padStart(5, '0')}
                      </span>
                    )}
                    {selectedUser.fullName}
                  </p>
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

              {/* メッセージ検索（商品名など） */}
              <div className="px-4 py-2 bg-white border-b border-[#e5e5ea]">
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
                  {searchQuery.trim() && matchCount === 0 && messages.length > 0 && (
                    <span className="text-[#86868b] text-[10px] flex-shrink-0">該当なし</span>
                  )}
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
                    // 返信があれば既読とみなす（未読のまま返信は不自然なため）
                    const hasReplyAfter = isOwn && selectedUid && msg.createdAt && messages.some(
                      (m) => m.senderId === selectedUid && m.createdAt && m.createdAt > msg.createdAt!,
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
                            </div>
                            <span className={`text-[10px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                              {formatMessageTime(msg.createdAt)}
                              {isOwn && (
                                <span className="ml-1 text-[9px] opacity-80">
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

      {/* 全員に一斉送信モーダル */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="px-4 py-3 border-b border-[#e5e5ea] flex items-center justify-between">
              <h3 className="text-[#1d1d1f] font-semibold text-base">
                {sendTargetUids ? `選択したメンバーに送信（${sendTargetUids.length}名）` : '全員に一斉送信'}
              </h3>
              <button
                type="button"
                onClick={() => !broadcastSending && (setShowBroadcastModal(false), setSendTargetUids(null))}
                disabled={broadcastSending}
                className="w-8 h-8 flex items-center justify-center text-[#86868b] hover:text-[#1d1d1f] disabled:opacity-50"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <p className="text-[#86868b] text-sm">
                {sendTargetUids
                  ? `選択した${sendTargetUids.length}名の会員に同じメッセージを送信します。`
                  : `管理者以外の全アクティブ会員に同じメッセージを送信します。（${users.filter((u) => u.role !== 'admin' && u.uid !== currentUser?.uid).length}名）`}
              </p>
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="送信するメッセージを入力..."
                rows={5}
                disabled={broadcastSending}
                className="w-full bg-[#f5f5f7] border border-[#e5e5ea] rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#007AFF] resize-none disabled:opacity-60"
              />
              {broadcastProgress && (
                <p className="text-[#007AFF] text-sm">
                  送信中... {broadcastProgress.current} / {broadcastProgress.total}
                </p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-[#e5e5ea]">
              <button
                type="button"
                onClick={handleBroadcastSend}
                disabled={!broadcastText.trim() || broadcastSending}
                className="w-full py-3 bg-[#007AFF] text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-[#0051D5] transition"
              >
                {broadcastSending ? '送信中...' : '送信する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
