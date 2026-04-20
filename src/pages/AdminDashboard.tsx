import { useState, useEffect, useRef, useMemo, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  query,
  orderBy,
  limit,
  limitToLast,
  startAfter,
  onSnapshot,
  getDocs,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  serverTimestamp,
  type Timestamp,
  type DocumentSnapshot,
  type Query,
  type QueryConstraint,
  type QuerySnapshot,
  type DocumentData,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { formatTime, formatTimeCompact, isSameDay, formatDateDivider } from '../lib/formatTime'
import { messageMatches, highlightMatch, isSafeUrl, withTimeout } from '../lib/chatUtils'
import { useAuth } from '../contexts/AuthContext'
import { uploadChatAttachment, validateFile, type AttachmentType } from '../lib/chatAttachment'
import CouponManager from '../components/CouponManager'
import OmikujiSetManager from '../components/OmikujiSetManager'
import NewsManager from '../components/NewsManager'
import RoadmapManager from '../components/RoadmapManager'
import UserManager from '../components/UserManager'
import MessageTemplateManager, { type MessageTemplate } from '../components/MessageTemplateManager'
import AnalyticsManager from '../components/AnalyticsManager'

type AdminTab = 'chat' | 'coupon' | 'omikuji' | 'news' | 'users' | 'roadmap' | 'templates' | 'analytics'

interface UserRecord {
  uid: string
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  yellowCards: number
  totalSavedAmount: number
  memberNumber: number | null
  role?: string
}

interface ChatMeta {
  lastMessage: string
  lastMessageAt: Date | null
  unreadFromCustomer?: boolean
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

const ATTRIBUTE_LABELS: Record<string, string> = {
  male: '男性',
  female: '女性',
  student: '学生',
  other: 'その他',
}

function buildChatMetaQuery() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return query(
    collection(db, 'chats'),
    where('lastMessageAt', '>=', thirtyDaysAgo),
    orderBy('lastMessageAt', 'desc'),
    limit(100),
  )
}

function parseChatMetaSnap(snap: QuerySnapshot<DocumentData>): Record<string, ChatMeta> {
  const meta: Record<string, ChatMeta> = {}
  snap.docs.forEach((d) => {
    meta[d.id] = {
      lastMessage: (d.data().lastMessage as string) ?? '',
      lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
      unreadFromCustomer: (d.data().unreadFromCustomer as boolean) ?? false,
    }
  })
  return meta
}

export default function AdminDashboard() {
  const { t } = useTranslation()
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
  const [globalSearchDays, setGlobalSearchDays] = useState<number>(90)
  const [showGlobalSearchResults, setShowGlobalSearchResults] = useState(false)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcastSending, setBroadcastSending] = useState(false)
  const [broadcastProgress, setBroadcastProgress] = useState<{ current: number; total: number } | null>(null)
  const [sendTargetUids, setSendTargetUids] = useState<string[] | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([])
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersRefreshKey, setUsersRefreshKey] = useState(0)
  const [templatesLoaded, setTemplatesLoaded] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const messagesForChatRef = useRef<string | null>(null)
  const chatMetaUnsubRef = useRef<(() => void) | null>(null)
  const prevAdminTabRef = useRef<AdminTab>('chat')

  useEffect(() => {
    let cancelled = false
    setUsersLoading(true)
    const q = query(collection(db, 'users'), where('status', '==', 'active'))
    getDocs(q)
      .then((snap) => {
        if (cancelled) return
        setUsers(
          snap.docs.map((d) => ({
            uid: d.id,
            fullName: d.data().fullName as string,
            email: d.data().email as string,
            attribute: d.data().attribute as string,
            birthMonth: d.data().birthMonth as string,
            yellowCards: (d.data().yellowCards as number) ?? 0,
            totalSavedAmount: (d.data().totalSavedAmount as number) ?? 0,
            memberNumber: (d.data().memberNumber as number) ?? null,
            role: d.data().role as string | undefined,
          })),
        )
        setUsersLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('users フェッチエラー:', err)
        setUsersLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [usersRefreshKey])

  useEffect(() => {
    const unsub = onSnapshot(buildChatMetaQuery(), (snap) => {
      setChatMeta(parseChatMetaSnap(snap))
    })
    chatMetaUnsubRef.current = unsub
    return () => {
      unsub()
      chatMetaUnsubRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!showTemplatePicker || templatesLoaded) return
    let cancelled = false
    getDocs(query(collection(db, 'messageTemplates'), orderBy('createdAt', 'desc')))
      .then((snap) => {
        if (cancelled) return
        setMessageTemplates(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              content: (data.content as string) ?? '',
              createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            }
          }),
        )
        setTemplatesLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        console.error('messageTemplates フェッチエラー:', err)
      })
    return () => {
      cancelled = true
    }
  }, [showTemplatePicker, templatesLoaded])

  useEffect(() => {
    if (prevAdminTabRef.current === 'templates' && adminTab !== 'templates') {
      setTemplatesLoaded(false)
    }
    prevAdminTabRef.current = adminTab
  }, [adminTab])

  useEffect(() => {
    if (!selectedUid) return
    setMessages([])
    setSearchQuery('')
    messagesForChatRef.current = null
    // limitToLast(100) で最新100件を昇順取得。全件取得より初回表示が大幅に速くなる。
    const q = query(
      collection(db, 'chats', selectedUid, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(100),
    )
    return onSnapshot(
      q,
      (snap) => {
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
      },
      (err) => console.error('[admin messages onSnapshot]', err),
    )
  }, [selectedUid])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (adminTab !== 'chat') setSending(false)
  }, [adminTab])

  useEffect(() => {
    setSending(false)
  }, [selectedUid])

  // 受信メッセージを既読にする（顧客からのメッセージ）
  useEffect(() => {
    if (!currentUser || !selectedUid || messages.length === 0) return
    if (messagesForChatRef.current !== selectedUid) return
    const toMark = messages.filter(
      (m) => m.senderId === selectedUid && !m.readAt,
    )
    if (toMark.length === 0) return
    Promise.all([
      ...toMark.map((m) =>
        updateDoc(doc(db, 'chats', selectedUid, 'messages', m.id), {
          readAt: serverTimestamp(),
          readBy: currentUser.uid,
        }),
      ),
      setDoc(doc(db, 'chats', selectedUid), { unreadFromCustomer: false }, { merge: true }),
    ]).catch((err) => {
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
      const BATCH_SIZE = 300
      const MAX_MESSAGES = 300
      const userMap = Object.fromEntries(users.map((u) => [u.uid, { fullName: u.fullName, memberNumber: u.memberNumber }]))
      const matches: Array<Message & { chatId: string }> = []
      let lastDoc: DocumentSnapshot | null = null
      let totalFetched = 0

      const filterDate =
        globalSearchDays > 0 ? new Date(Date.now() - globalSearchDays * 24 * 60 * 60 * 1000) : null

      while (totalFetched < MAX_MESSAGES) {
        const baseConstraints: QueryConstraint[] = filterDate
          ? [
              where('createdAt', '>=', filterDate),
              orderBy('createdAt', 'desc'),
              limit(BATCH_SIZE),
            ]
          : [orderBy('createdAt', 'desc'), limit(BATCH_SIZE)]

        const qRef: Query = lastDoc
          ? query(collectionGroup(db, 'messages'), ...baseConstraints, startAfter(lastDoc))
          : query(collectionGroup(db, 'messages'), ...baseConstraints)

        const snap = await getDocs(qRef)
        if (snap.empty) break

        snap.docs.forEach((d: DocumentSnapshot) => {
          const chatId = d.ref.parent.parent?.id
          if (!chatId) return
          const data = d.data() ?? {}
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

        lastDoc = snap.docs[snap.docs.length - 1] ?? null
        totalFetched += snap.docs.length
        if (snap.docs.length < BATCH_SIZE) break
      }

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

  async function handleYellowCard(delta: number) {
    if (!selectedUser) return
    const next = Math.max(0, selectedUser.yellowCards + delta)
    const label = delta > 0 ? 'イエローカードを付与' : 'イエローカードを取消'
    if (!confirm(`${selectedUser.fullName}さんに${label}しますか？（${selectedUser.yellowCards}枚→${next}枚）${next >= 3 ? '\n⚠️ 3枚到達のためブラックリストに入ります' : ''}`)) return
    const update: Record<string, unknown> = { yellowCards: next }
    if (next >= 3 && selectedUser.role !== 'admin') update.status = 'blacklisted'
    if (next < 3) update.status = 'active'
    await updateDoc(doc(db, 'users', selectedUser.uid), update)
  }

  async function handleRedCard() {
    if (!selectedUser) return
    if (!confirm(`${selectedUser.fullName}さんにレッドカードを出しますか？\n即座にブラックリストに入ります。`)) return
    await updateDoc(doc(db, 'users', selectedUser.uid), { status: 'blacklisted', yellowCards: 3 })
  }

  const CHAT_TIMEOUT_MSG =
    '通信がタイムアウトしました。しばらくしてから再度お試しください。'

  function syncChatText(e: FormEvent<HTMLTextAreaElement>) {
    setText(e.currentTarget.value)
  }

  async function handleSend() {
    const trimmed = text.trim()
    if ((!trimmed && !selectedFile) || !selectedUid || !currentUser || sending) return

    setFileError(null)
    setOpenMenuId(null)
    // 入力欄を即クリア（送信前に消すことで「消えない」問題を解消）
    setText('')
    setSending(true)
    let attachmentUrl: string | undefined
    let attachmentType: AttachmentType | undefined
    let attachmentName: string | undefined

    const UPLOAD_MS = 120_000

    try {
      await currentUser.getIdToken()

      if (selectedFile) {
        const result = await withTimeout(
          uploadChatAttachment(selectedUid, selectedFile),
          UPLOAD_MS,
          CHAT_TIMEOUT_MSG,
        )
        attachmentUrl = result.url
        attachmentType = result.type
        attachmentName = result.name
        setSelectedFile(null)
      }

      addDoc(collection(db, 'chats', selectedUid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: serverTimestamp(),
        ...(attachmentUrl && { attachmentUrl, attachmentType, attachmentName }),
      })
        .then(() => {
          setTimeout(() => inputRef.current?.focus(), 0)
        })
        .catch((err: unknown) => {
          console.error('[admin handleSend] addDoc failed:', err)
          setText(trimmed)
          const code = (err as { code?: string }).code ?? ''
          const isAuthError = code.startsWith('auth/')
          setFileError(
            isAuthError
              ? t('home.chatSessionExpired')
              : err instanceof Error
                ? err.message
                : 'メッセージの送信に失敗しました',
          )
        })
        .finally(() => setSending(false))
    } catch (err) {
      console.error('[admin handleSend]', err)
      setText(trimmed)
      const code = (err as { code?: string }).code ?? ''
      const isAuthError = code.startsWith('auth/')
      setFileError(
        isAuthError
          ? t('home.chatSessionExpired')
          : err instanceof Error
            ? err.message
            : 'アップロードに失敗しました',
      )
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      // Enter単体は改行のため何もしない
    }
  }

  const chatId = selectedUid ?? ''
  const canEditMessage = () => true

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

  function insertTemplate(template: MessageTemplate) {
    setText((prev) => (prev ? `${prev}\n${template.content}` : template.content))
    setShowTemplatePicker(false)
    inputRef.current?.focus()
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

    chatMetaUnsubRef.current?.()
    chatMetaUnsubRef.current = null

    setBroadcastSending(true)
    setBroadcastProgress({ current: 0, total: targets.length })

    try {
      const ts = serverTimestamp()
      const BATCH_SIZE = 15
      for (let i = 0; i < targets.length; i += BATCH_SIZE) {
        const chunk = targets.slice(i, i + BATCH_SIZE)
        await Promise.all(
          chunk.map((t) =>
            addDoc(collection(db, 'chats', t.uid, 'messages'), {
              senderId: currentUser.uid,
              text: trimmed,
              createdAt: ts,
            }),
          ),
        )
        setBroadcastProgress({ current: Math.min(i + BATCH_SIZE, targets.length), total: targets.length })
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
      setUsersRefreshKey((k) => k + 1)
      const unsub = onSnapshot(buildChatMetaQuery(), (snap) => {
        setChatMeta(parseChatMetaSnap(snap))
      })
      chatMetaUnsubRef.current = unsub
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
    <div className="h-dvh bg-[#f5f5f7] flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea] shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#0095B6] text-xl">♛</span>
          <div>
            <span className="text-[#1d1d1f] font-semibold text-sm tracking-wide">Admin Dashboard</span>
            <span className="text-[#86868b] text-[10px] ml-2">店長</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-[#0095B6] text-xs hover:text-[#007A96] transition"
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
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          💬 チャット
        </button>
        <button
          onClick={() => setAdminTab('coupon')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'coupon'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          🎫 クーポン管理
        </button>
        <button
          onClick={() => setAdminTab('omikuji')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'omikuji'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          🎰 おみくじ
        </button>
        <button
          onClick={() => setAdminTab('news')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'news'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📢 お知らせ管理
        </button>
        <button
          onClick={() => setAdminTab('users')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'users'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          👥 ユーザー管理
        </button>
        <button
          onClick={() => setAdminTab('roadmap')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'roadmap'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📋 実装予定
        </button>
        <button
          onClick={() => setAdminTab('templates')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'templates'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📝 テンプレート
        </button>
        <button
          onClick={() => setAdminTab('analytics')}
          className={`flex-1 py-2.5 text-xs font-semibold tracking-wide transition ${
            adminTab === 'analytics'
              ? 'text-[#0095B6] border-b-2 border-[#0095B6]'
              : 'text-[#86868b] hover:text-[#1d1d1f]'
          }`}
        >
          📊 分析
        </button>
      </div>

      {/* メインエリア */}
      {adminTab === 'analytics' ? (
        <AnalyticsManager />
      ) : adminTab === 'templates' ? (
        <MessageTemplateManager />
      ) : adminTab === 'roadmap' ? (
        <RoadmapManager />
      ) : adminTab === 'coupon' ? (
        <CouponManager />
      ) : adminTab === 'omikuji' ? (
        <OmikujiSetManager />
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
              className="w-full py-2.5 bg-[#0095B6] text-white text-xs font-semibold rounded-lg hover:bg-[#007A96] transition flex items-center justify-center gap-2"
            >
              📢 全員に一斉送信
            </button>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setUsersRefreshKey((k) => k + 1)}
                disabled={usersLoading}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#e5e5ea] bg-white text-[#86868b] text-[11px] hover:bg-[#f5f5f7] disabled:opacity-50 transition"
                aria-label="顧客リスト更新"
              >
                {usersLoading ? (
                  <span className="w-3 h-3 border border-[#e5e5ea] border-t-[#0095B6] rounded-full animate-spin" />
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 12a9 9 0 0 1-15 6.7L3 16" />
                    <polyline points="21 8 21 3 16 3" /><polyline points="3 16 3 21 8 21" />
                  </svg>
                )}
                <span>更新</span>
              </button>
              <select
                value={globalSearchDays}
                onChange={(e) => setGlobalSearchDays(Number(e.target.value))}
                className="text-xs border border-[#e5e5ea] rounded px-2 py-1 bg-white text-[#1d1d1f]"
              >
                <option value={30}>30日以内</option>
                <option value={90}>90日以内</option>
                <option value={180}>180日以内</option>
                <option value={0}>全期間</option>
              </select>
              <input
                type="search"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runGlobalSearch()}
                placeholder="商品名で全チャット検索（例: クリスマスケーキ）"
                className="flex-1 min-w-[120px] bg-[#f5f5f7] border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] text-xs focus:outline-none focus:border-[#0095B6] transition"
                aria-label="全チャット検索"
              />
              <button
                type="button"
                onClick={runGlobalSearch}
                disabled={globalSearchLoading || !globalSearchQuery.trim()}
                className="px-3 py-2 bg-[#0095B6] text-white text-xs font-medium rounded-lg disabled:opacity-40 hover:bg-[#007A96] transition"
              >
                {globalSearchLoading ? '検索中' : '検索'}
              </button>
            </div>
            {showGlobalSearchResults && (
              <button
                type="button"
                onClick={clearGlobalSearch}
                className="text-[#0095B6] text-[10px] hover:underline"
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
                          ? 'bg-[#0095B6]/10 border-l-4 border-l-[#0095B6]'
                          : 'hover:bg-[#f5f5f7]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#0095B6] flex items-center justify-center flex-shrink-0">
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
                const hasUnread = !!meta?.unreadFromCustomer
                const yc = user.yellowCards ?? 0
                // 枚数でアバター色を変化：0→通常青／1→黄／2以上→橙（警戒）
                const avatarBg = yc >= 2 ? '#f97316' : yc === 1 ? '#eab308' : '#0095B6'

                return (
                  <button
                    key={user.uid}
                    onClick={() => selectUser(user.uid)}
                    className={`w-full text-left px-4 py-3.5 border-b border-[#e5e5ea] transition flex items-center gap-3 ${
                      isSelected
                        ? 'bg-[#0095B6]/10 border-l-4 border-l-[#0095B6]'
                        : 'hover:bg-[#f5f5f7]'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center transition-colors"
                        style={{ backgroundColor: avatarBg }}
                      >
                        <span className="text-white font-bold text-sm">
                          {user.fullName.charAt(0)}
                        </span>
                      </div>
                      {hasUnread && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" title="未読メッセージあり" />
                      )}
                      {/* イエローカード枚数バッジ（アバター右上） */}
                      {yc > 0 && (
                        <div
                          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-amber-400 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm"
                          title={`イエローカード ${yc}枚`}
                        >
                          {yc}
                        </div>
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
                            {formatTimeCompact(meta.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-[#86868b] text-xs truncate mt-0.5">
                        {meta?.lastMessage
                          ? meta.lastMessage
                          : `${ATTRIBUTE_LABELS[user.attribute] ?? user.attribute} · ${user.birthMonth}`}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {user.totalSavedAmount > 0 && (
                          <span className="text-[9px] text-[#0095B6]">
                            👑 累計 ¥{user.totalSavedAmount.toLocaleString()}
                          </span>
                        )}
                        {yc > 0 && (
                          <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
                            {'🟨'.repeat(Math.min(yc, 3))}&nbsp;×{yc}
                          </span>
                        )}
                      </div>
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
                  className="md:hidden text-[#0095B6] hover:text-[#007A96] transition mr-1"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>

                <div className="w-9 h-9 rounded-full bg-[#0095B6] flex items-center justify-center flex-shrink-0">
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
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold">
                      🟨 ×{selectedUser.yellowCards}
                    </span>
                    <div className="flex gap-0.5">
                      <button type="button" onClick={() => handleYellowCard(1)} title="イエローカード付与" className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 hover:bg-amber-200 transition">+🟨</button>
                      {selectedUser.yellowCards > 0 && (
                        <button type="button" onClick={() => handleYellowCard(-1)} title="イエローカード取消" className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition">-1</button>
                      )}
                      <button type="button" onClick={() => handleRedCard()} title="レッドカード（即ブラックリスト）" className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 hover:bg-red-200 transition">🟥</button>
                    </div>
                    {selectedUser.totalSavedAmount > 0 && (
                      <span className="text-[9px] bg-[#0095B6]/10 text-[#0095B6] px-1.5 py-0.5 rounded-full font-bold">
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
                    className="flex-1 bg-[#f5f5f7] border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#0095B6] transition"
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
                        className="w-7 h-7 rounded flex items-center justify-center text-[#0095B6] hover:bg-[#0095B6]/10 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={handleSearchNext}
                        aria-label="次の検索結果"
                        className="w-7 h-7 rounded flex items-center justify-center text-[#0095B6] hover:bg-[#0095B6]/10 transition"
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
                            <div className="w-7 h-7 rounded-full bg-[#0095B6] flex items-center justify-center flex-shrink-0">
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
                            <div className="flex items-end gap-1">
                            <div
                              className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                                isOwn
                                  ? 'bg-[#0095B6] text-white rounded-br-sm'
                                  : 'bg-white text-[#1d1d1f] rounded-bl-sm shadow-sm border border-[#e5e5ea]'
                              }`}
                            >
                              {editingMessageId === msg.id ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className={`w-full min-h-[50px] bg-transparent border-none outline-none resize-none text-inherit ${
                                      isOwn ? 'placeholder-white/70' : 'placeholder-[#86868b]'
                                    }`}
                                    placeholder="メッセージを入力..."
                                    autoFocus
                                    rows={2}
                                    name="vip-admin-chat-edit-body"
                                    autoComplete="off"
                                    data-form-type="other"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className={`text-xs px-2 py-1 rounded ${
                                        isOwn ? 'bg-white/20 hover:bg-white/30' : 'bg-[#e5e5ea] hover:bg-[#d1d1d6]'
                                      }`}
                                    >
                                      キャンセル
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleSaveEdit}
                                      disabled={!editingText.trim()}
                                      className={`text-xs px-2 py-1 rounded ${
                                        isOwn ? 'bg-white/30 hover:bg-white/40' : 'bg-[#0095B6] text-white hover:bg-[#007A96]'
                                      } disabled:opacity-50`}
                                    >
                                      保存
                                    </button>
                                  </div>
                                </div>
                              ) : (
                              <>
                              {msg.attachmentUrl && isSafeUrl(msg.attachmentUrl) && (
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
                                      className={`text-xs underline ${isOwn ? 'text-white/90' : 'text-[#0095B6]'}`}
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
                                <span className="whitespace-pre-wrap">
                                  {searchQuery.trim()
                                    ? highlightMatch(msg.text, searchQuery)
                                    : msg.text}
                                </span>
                              )}
                              </>
                              )}
                            </div>
                            {canEditMessage() && editingMessageId !== msg.id && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setOpenMenuId(openMenuId === msg.id ? null : msg.id)}
                                  aria-label="メッセージの操作"
                                  className={`p-1 rounded hover:bg-black/10 ${
                                    isOwn ? 'text-white/80 hover:text-white' : 'text-[#86868b] hover:text-[#1d1d1f]'
                                  }`}
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
                                        className="w-full text-left px-3 py-2 text-xs text-[#1d1d1f] hover:bg-[#f5f5f7]"
                                      >
                                        編集
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(msg)}
                                        className="w-full text-left px-3 py-2 text-xs text-[#FF3B30] hover:bg-[#f5f5f7]"
                                      >
                                        削除
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            </div>
                            <span className={`text-[10px] text-[#86868b] mt-0.5 ${isOwn ? 'mr-1' : 'ml-1'}`}>
                              {formatTime(msg.createdAt)}
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

              {/* relative z-20: ⋮メニューの fixed オーバーレイ(z-10)より上に置き、タップを塞がせない */}
              <div className="px-4 py-3 bg-white border-t border-[#e5e5ea] relative z-20">
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
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(!showTemplatePicker)}
                      aria-label="テンプレートを挿入"
                      title="テンプレート"
                      className="w-10 h-10 flex items-center justify-center text-[#86868b] hover:text-[#0095B6] transition flex-shrink-0"
                    >
                      📝
                    </button>
                    {showTemplatePicker && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          aria-hidden
                          onClick={() => setShowTemplatePicker(false)}
                        />
                        <div className="absolute left-0 bottom-full mb-1 w-64 max-h-60 overflow-y-auto bg-white rounded-xl shadow-lg border border-[#e5e5ea] z-20 py-1">
                          {messageTemplates.length === 0 ? (
                            <p className="px-3 py-4 text-[#86868b] text-xs text-center">
                              テンプレートがありません
                              <br />
                              <span className="text-[#0095B6]">テンプレート</span>タブで作成してください
                            </p>
                          ) : (
                            messageTemplates.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => insertTemplate(t)}
                                className="w-full text-left px-3 py-2.5 hover:bg-[#f5f5f7] text-sm block"
                              >
                                <span className="text-[#1d1d1f] line-clamp-2 whitespace-pre-wrap">
                                  {t.content}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="ファイルを添付"
                    className="w-10 h-10 flex items-center justify-center text-[#86868b] hover:text-[#0095B6] transition flex-shrink-0"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <textarea
                    ref={inputRef}
                    id="vip-admin-chat-composer"
                    value={text}
                    onChange={syncChatText}
                    onCompositionEnd={(e) => setText(e.currentTarget.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => { setOpenMenuId(null); setShowTemplatePicker(false) }}
                    placeholder={`${selectedUser.fullName}さんに返信...（Enterで改行、Shift+Enterで送信）`}
                    rows={1}
                    name="vip-admin-chat-composer-body"
                    autoComplete="off"
                    enterKeyHint="enter"
                    inputMode="text"
                    data-form-type="other"
                    className="flex-1 min-h-[40px] max-h-28 min-w-0 bg-[#f5f5f7] border border-[#e5e5ea] rounded-2xl px-4 py-2.5 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#0095B6] transition resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={(!text.trim() && !selectedFile) || sending}
                    aria-busy={sending}
                    className="w-10 h-10 bg-[#0095B6] rounded-full flex items-center justify-center text-white disabled:opacity-30 transition hover:bg-[#007A96]"
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
              <span className="text-5xl text-[#0095B6]/30 mb-4">♛</span>
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
              {messageTemplates.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {messageTemplates.slice(0, 5).map((t) => {
                    const preview = t.content.trim().split('\n')[0]?.slice(0, 20) ?? ''
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setBroadcastText((prev) => (prev ? `${prev}\n${t.content}` : t.content))}
                        className="px-2 py-1 rounded-lg bg-[#f5f5f7] text-[#0095B6] text-xs hover:bg-[#e5e5ea] transition truncate max-w-[180px]"
                        title={t.content}
                      >
                        📝 {preview}{preview.length >= 20 ? '...' : ''}
                      </button>
                    )
                  })}
                </div>
              )}
              <textarea
                value={broadcastText}
                onChange={(e) => setBroadcastText(e.target.value)}
                placeholder="送信するメッセージを入力..."
                rows={5}
                disabled={broadcastSending}
                name="vip-admin-broadcast-body"
                autoComplete="off"
                data-form-type="other"
                className="w-full bg-[#f5f5f7] border border-[#e5e5ea] rounded-xl px-4 py-3 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#0095B6] resize-none disabled:opacity-60"
              />
              {broadcastProgress && (
                <p className="text-[#0095B6] text-sm">
                  送信中... {broadcastProgress.current} / {broadcastProgress.total}
                </p>
              )}
            </div>
            <div className="px-4 py-3 border-t border-[#e5e5ea]">
              <button
                type="button"
                onClick={handleBroadcastSend}
                disabled={!broadcastText.trim() || broadcastSending}
                className="w-full py-3 bg-[#0095B6] text-white font-semibold rounded-xl disabled:opacity-50 hover:bg-[#007A96] transition"
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
