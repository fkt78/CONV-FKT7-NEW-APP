import { useState, useEffect, useRef, useMemo, useCallback, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, Link } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import {
  collection,
  query,
  orderBy,
  limitToLast,
  endBefore,
  getDocs,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { isSameDay } from '../lib/formatTime'
import { messageMatches, withTimeout } from '../lib/chatUtils'
import { useAuth } from '../contexts/AuthContext'
import { useChatBadge } from '../contexts/ChatBadgeContext'
import { uploadChatAttachment, validateFile, FILE_ERROR_TOO_LARGE, FILE_ERROR_TYPE, type AttachmentType } from '../lib/chatAttachment'
import CouponWallet from '../components/CouponWallet'
import VipNews from '../components/VipNews'
import VoiceCreditsPopup from '../components/VoiceCreditsPopup'
import LanguageSwitcher from '../components/LanguageSwitcher'
import AffiliateBannerCarousel from '../components/AffiliateBannerCarousel'
import HomeSkeleton from '../components/HomeSkeleton'
import LazyMount from '../components/LazyMount'
import ChatMessageRow, { type ChatMessage } from '../components/ChatMessageRow'

type HomeTab = 'home' | 'chat' | 'coupon'

/** 自分送信メッセージの後に相手メッセージが存在する ID（O(N) で算出。旧 some ネストは O(N²)） */
function computeHasReplyAfterIds(messages: ChatMessage[], ownUid: string | undefined): Set<string> {
  const result = new Set<string>()
  if (!ownUid || messages.length === 0) return result
  let bestOtherTime: number | null = null
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    const isOwn = msg.senderId === ownUid
    if (isOwn && msg.createdAt && bestOtherTime !== null && bestOtherTime > msg.createdAt.getTime()) {
      result.add(msg.id)
    }
    if (!isOwn && msg.createdAt) {
      const ts = msg.createdAt.getTime()
      bestOtherTime = bestOtherTime === null ? ts : Math.max(bestOtherTime, ts)
    }
  }
  return result
}

export default function Home() {
  const { t } = useTranslation()
  const { currentUser, userRole, userData, loading: authLoading } = useAuth()
  const { couponCount, setUnreadCount } = useChatBadge()
  const navigate = useNavigate()

  const [homeTab, setHomeTab] = useState<HomeTab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([])
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [canLoadMore, setCanLoadMore] = useState(false)
  const [text, setText] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResultIndex, setSearchResultIndex] = useState(0)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const messageRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const editingTextRef = useRef('')
  const initialLoadCheckedRef = useRef(false)

  const MSG_LIMIT = 30

  useEffect(() => {
    editingTextRef.current = editingText
  }, [editingText])

  useEffect(() => {
    if (!currentUser) return
    initialLoadCheckedRef.current = false
    setOlderMessages([])
    setCanLoadMore(false)
    // limitToLast(30) で最新30件を昇順取得。desc+reverse より送信直後も正しく表示される。
    // serverTimestamps: 'estimate' で送信直後の pending timestamp を推定値として扱う。
    const q = query(
      collection(db, 'chats', currentUser.uid, 'messages'),
      orderBy('createdAt', 'asc'),
      limitToLast(MSG_LIMIT),
    )
    return onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' })
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
        if (!initialLoadCheckedRef.current) {
          initialLoadCheckedRef.current = true
          setCanLoadMore(snap.docs.length >= MSG_LIMIT)
        }
      },
      (err) => {
        console.error('[messages onSnapshot]', err)
      },
    )
  }, [currentUser])

  const displayMessages = useMemo(
    () => [...olderMessages, ...messages],
    [olderMessages, messages],
  )

  const hasReplyAfterIds = useMemo(
    () => computeHasReplyAfterIds(displayMessages, currentUser?.uid),
    [displayMessages, currentUser?.uid],
  )

  const setMessageNodeRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) messageRefsMap.current.set(id, el)
    else messageRefsMap.current.delete(id)
  }, [])

  const onMenuButtonClick = useCallback((id: string) => {
    setOpenMenuId((curr) => (curr === id ? null : id))
  }, [])

  const onCloseMenuOverlay = useCallback(() => setOpenMenuId(null), [])

  const onEditingTextChange = useCallback((v: string) => setEditingText(v), [])

  const loadOlderMessages = useCallback(async () => {
    if (!currentUser || loadingOlder) return
    const oldest = displayMessages[0]
    if (!oldest?.createdAt) return
    setLoadingOlder(true)
    try {
      const q = query(
        collection(db, 'chats', currentUser.uid, 'messages'),
        orderBy('createdAt', 'asc'),
        endBefore(oldest.createdAt),
        limitToLast(MSG_LIMIT),
      )
      const snap = await getDocs(q)
      const fetched: ChatMessage[] = snap.docs.map((d) => {
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
      })
      setOlderMessages((prev) => [...fetched, ...prev])
      setCanLoadMore(snap.docs.length >= MSG_LIMIT)
    } catch (err) {
      console.error('[loadOlderMessages]', err)
    } finally {
      setLoadingOlder(false)
    }
  }, [currentUser, loadingOlder, displayMessages, MSG_LIMIT])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /** チャット以外のタブへ移動したとき送信ロックを解除（通信ハングで sending が残る対策） */
  useEffect(() => {
    if (homeTab !== 'chat') setSending(false)
  }, [homeTab])

  // 未読メッセージ数（店長からの受信で未読のもの）
  const unreadMessageCount = messages.filter(
    (m) => currentUser && m.senderId !== currentUser.uid && !m.readAt,
  ).length

  useEffect(() => {
    setUnreadCount(unreadMessageCount)
  }, [unreadMessageCount, setUnreadCount])

  // 受信メッセージを既読にする（チャットタブを表示しているときのみ）
  useEffect(() => {
    if (!currentUser || messages.length === 0 || homeTab !== 'chat') return
    const toMark = messages.filter(
      (m) => m.senderId !== currentUser.uid && !m.readAt,
    )
    if (toMark.length === 0) return
    const batch = writeBatch(db)
    toMark.forEach((m) => {
      batch.update(doc(db, 'chats', currentUser.uid, 'messages', m.id), {
        readAt: serverTimestamp(),
        readBy: currentUser.uid,
      })
    })
    batch.commit().catch((err) => {
      if ((err as { code?: string })?.code !== 'not-found') {
        console.error('既読更新エラー:', err)
      }
    })
  }, [currentUser, messages, homeTab])

  const matchedIndices = useMemo(
    () =>
      searchQuery.trim()
        ? displayMessages
            .map((m, i) => (messageMatches(m, searchQuery) ? i : -1))
            .filter((i) => i >= 0)
        : [],
    [searchQuery, displayMessages],
  )
  const matchCount = matchedIndices.length
  const currentMatchIndex = Math.min(searchResultIndex, Math.max(0, matchCount - 1))

  useEffect(() => {
    setSearchResultIndex(0)
  }, [searchQuery])

  useEffect(() => {
    if (searchQuery.trim() && matchCount > 0) {
      const msg = displayMessages[matchedIndices[0]]
      if (msg) {
        const timer = setTimeout(() => {
          messageRefsMap.current.get(msg.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 100)
        return () => clearTimeout(timer)
      }
    }
  }, [searchQuery, matchCount, matchedIndices, displayMessages])

  const scrollToMatch = useCallback((index: number) => {
    const idx = matchedIndices[index]
    const msg = displayMessages[idx]
    if (!msg) return
    messageRefsMap.current.get(msg.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [matchedIndices, displayMessages])

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
      setFileError(
        err === FILE_ERROR_TOO_LARGE
          ? t('home.fileTooLarge')
          : err === FILE_ERROR_TYPE
            ? t('home.fileTypeNotSupported')
            : err,
      )
      return
    }
    setSelectedFile(file)
    e.target.value = ''
  }

  function syncChatText(e: FormEvent<HTMLTextAreaElement>) {
    setText(e.currentTarget.value)
  }

  async function handleSend() {
    const trimmed = text.trim()
    if ((!trimmed && !selectedFile) || !currentUser || sending) return

    setFileError(null)
    setOpenMenuId(null)
    // 入力欄を即クリア（送信前に消すことで「消えない」問題を解消）
    setText('')
    setSending(true)
    let attachmentUrl: string | undefined
    let attachmentType: AttachmentType | undefined
    let attachmentName: string | undefined

    const UPLOAD_MS = 120_000
    const timeoutMsg = t('home.chatNetworkTimedOut')

    try {
      await currentUser.getIdToken()

      if (selectedFile) {
        const result = await withTimeout(
          uploadChatAttachment(currentUser.uid, selectedFile),
          UPLOAD_MS,
          timeoutMsg,
        )
        attachmentUrl = result.url
        attachmentType = result.type
        attachmentName = result.name
        setSelectedFile(null)
      }

      addDoc(collection(db, 'chats', currentUser.uid, 'messages'), {
        senderId: currentUser.uid,
        text: trimmed,
        createdAt: serverTimestamp(),
        ...(attachmentUrl && { attachmentUrl, attachmentType, attachmentName }),
      })
        .then(() => {
          setTimeout(() => inputRef.current?.focus(), 0)
        })
        .catch((err: unknown) => {
          console.error('[handleSend] addDoc failed:', err)
          setText(trimmed)
          const code = (err as { code?: string }).code ?? ''
          const isAuthError = code.startsWith('auth/')
          setFileError(
            isAuthError
              ? t('home.chatSessionExpired')
              : err instanceof Error
                ? err.message
                : t('home.uploadFailed'),
          )
        })
        .finally(() => setSending(false))
    } catch (err) {
      console.error('[handleSend]', err)
      setText(trimmed)
      const code = (err as { code?: string }).code ?? ''
      const isAuthError = code.startsWith('auth/')
      setFileError(
        isAuthError
          ? t('home.chatSessionExpired')
          : err instanceof Error
            ? err.message
            : t('home.uploadFailed'),
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

  const chatId = currentUser?.uid ?? ''
  const canEditMessage = useCallback(
    (msg: ChatMessage) => msg.senderId === currentUser?.uid,
    [currentUser?.uid],
  )

  const handleEditMessage = useCallback((msg: ChatMessage) => {
    setEditingMessageId(msg.id)
    setEditingText(msg.text ?? '')
    setOpenMenuId(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingMessageId || !chatId) return
    const trimmed = editingTextRef.current.trim()
    try {
      await updateDoc(doc(db, 'chats', chatId, 'messages', editingMessageId), {
        text: trimmed,
        editedAt: serverTimestamp(),
      })
      setEditingMessageId(null)
      setEditingText('')
    } catch (err) {
      setFileError(err instanceof Error ? err.message : t('home.editFailed'))
    }
  }, [editingMessageId, chatId, t])

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null)
    setEditingText('')
  }, [])

  const handleDeleteMessage = useCallback(
    async (msg: ChatMessage) => {
      if (!chatId || !window.confirm(t('home.deleteConfirm'))) return
      setOpenMenuId(null)
      try {
        await deleteDoc(doc(db, 'chats', chatId, 'messages', msg.id))
      } catch (err) {
        setFileError(err instanceof Error ? err.message : t('home.deleteFailed'))
      }
    },
    [chatId, t],
  )

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
  }

  const displayName = userData?.fullName ?? currentUser?.displayName ?? t('home.defaultMemberName')

  const attributeLabel = useCallback((attr: string): string => {
    const keys = ['male', 'female', 'student', 'other'] as const
    if (keys.includes(attr as (typeof keys)[number])) {
      return t(`home.attributeLabels.${attr}`)
    }
    return attr
  }, [t])

  if (authLoading) return <HomeSkeleton />

  return (
    <div className="h-dvh bg-[#f5f5f7] flex flex-col max-w-lg mx-auto">
      {/* ── ヘッダー（Apple風：白背景・控えめなシャドウ） ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e5e5ea] flex-shrink-0 safe-area-top min-h-[44px] shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[#0095B6] text-xl" aria-hidden>♛</span>
          <span className="text-[#1d1d1f] font-semibold text-[17px] tracking-wide">{t('home.vipStore')}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <LanguageSwitcher className="flex-shrink-0" />
          <button
            onClick={() => navigate('/settings/notifications')}
            title={t('home.notificationSettings')}
            aria-label={t('home.ariaNotificationSettings')}
            className="touch-target flex items-center justify-center text-[#86868b] text-[17px] hover:text-[#0095B6] transition -m-2 p-2 rounded-xl"
          >
            🔔
          </button>
          <button
            onClick={() => navigate('/install-guide')}
            title={t('home.addToHome')}
            aria-label={t('home.ariaAddToHome')}
            className="touch-target flex items-center justify-center text-[#86868b] text-[17px] hover:text-[#0095B6] transition -m-2 p-2 rounded-xl"
          >
            📱
          </button>
          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              aria-label={t('home.ariaAdmin')}
              className="touch-target flex-shrink-0 whitespace-nowrap flex items-center justify-center text-[#0095B6] text-[15px] font-medium hover:text-[#007A96] transition px-3 py-2 rounded-xl"
            >
              {t('home.adminSettings')}
            </button>
          )}
          <button
            onClick={handleLogout}
            aria-label={t('home.ariaLogout')}
            className="touch-target flex items-center justify-center text-[#86868b] text-[15px] hover:text-[#1d1d1f] transition px-3 py-2 rounded-xl"
          >
            {t('home.logout')}
          </button>
        </div>
      </header>

      {/* ── タブ切り替え（先に配置してモバイルで見やすく） ── */}
      <div className="flex mx-4 mt-2 rounded-2xl bg-white p-1.5 flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-[#e5e5ea]">
        <button
          onClick={() => setHomeTab('home')}
          aria-label={t('home.ariaHome')}
          aria-pressed={homeTab === 'home'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition ${
            homeTab === 'home'
              ? 'bg-[#0095B6] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          {t('home.tabHome')}
        </button>
        <button
          onClick={() => setHomeTab('chat')}
          aria-label={
            unreadMessageCount > 0
              ? t('home.ariaChatUnread', { count: unreadMessageCount })
              : t('home.ariaChat')
          }
          aria-pressed={homeTab === 'chat'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition relative ${
            homeTab === 'chat'
              ? 'bg-[#0095B6] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          {t('home.tabChat')}
          {unreadMessageCount > 0 && homeTab !== 'chat' && (
            <span className="absolute top-1.5 right-3 min-w-[20px] h-5 px-1.5 bg-[#FF3B30] text-white text-[12px] font-semibold rounded-full flex items-center justify-center">
              {unreadMessageCount > 99 ? '99+' : unreadMessageCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setHomeTab('coupon')}
          aria-label={
            couponCount > 0
              ? t('home.ariaCouponCount', { count: couponCount })
              : t('home.ariaCoupon')
          }
          aria-pressed={homeTab === 'coupon'}
          className={`flex-1 min-h-[44px] rounded-xl text-[15px] font-medium tracking-wide transition relative ${
            homeTab === 'coupon'
              ? 'bg-[#0095B6] text-white shadow-sm'
              : 'text-[#86868b] hover:text-[#1d1d1f] hover:bg-[#f5f5f7]'
          }`}
        >
          {t('home.tabCoupon')}
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
          {userRole === 'admin' && (
            <div className="mx-4 mb-3 rounded-2xl border border-[#0095B6]/35 bg-gradient-to-r from-[#0095B6]/8 to-[#5BC8D7]/10 overflow-hidden flex-shrink-0 shadow-sm">
              <button
                type="button"
                onClick={() => navigate('/admin')}
                aria-label={t('home.ariaAdmin')}
                className="w-full py-3.5 px-4 text-left text-[15px] font-semibold text-[#0095B6] flex items-center gap-2 hover:bg-[#0095B6]/10 transition active:scale-[0.99]"
              >
                <span aria-hidden>👑</span>
                {t('home.adminDashboardEntry')}
              </button>
            </div>
          )}
          <div className="mx-4 mt-4 rounded-2xl bg-white border border-[#e5e5ea] overflow-hidden flex-shrink-0 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0095B6] to-[#5BC8D7] flex items-center justify-center flex-shrink-0 shadow-sm">
              <span className="text-white font-semibold text-xl">
                {displayName.charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#1d1d1f] font-semibold text-[17px] truncate">
                {t('home.memberGreeting', { name: displayName })}
              </p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[13px] bg-[#0095B6]/10 text-[#0095B6] px-3 py-1 rounded-full font-medium">
                  VIP
                </span>
                {userData?.memberNumber != null && (
                  <span className="text-[13px] bg-[#f5f5f7] text-[#86868b] px-3 py-1 rounded-full font-mono">
                    {t('home.memberNumber', { num: String(userData.memberNumber).padStart(5, '0') })}
                  </span>
                )}
                {userData?.attribute && (
                  <span className="text-[13px] bg-[#f5f5f7] text-[#86868b] px-3 py-1 rounded-full">
                    {attributeLabel(userData.attribute)}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* 累計お得額 */}
          {(userData?.totalSavedAmount ?? 0) > 0 && (
            <div className="px-4 pb-4 pt-0">
              <div className="flex items-center gap-2 bg-[#f5f5f7] rounded-xl px-4 py-2.5">
                <span className="text-[#0095B6] text-sm">👑</span>
                <span className="text-[#86868b] text-[13px]">{t('home.totalSavedLabel')}</span>
                <span className="text-[#0095B6] font-bold text-[15px] ml-auto">
                  ¥{(userData?.totalSavedAmount ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          )}
          {/* アフィリエイトバナー：カード最下部に組み込み */}
          <AffiliateBannerCarousel inCard />
        </div>
          <div className="mx-4 mt-4">
            <VipNews />
          </div>
          <div className="h-4" />
        </div>
      ) : homeTab === 'coupon' ? (
        <div className="flex-1 flex flex-col min-h-0 mt-2 overflow-hidden">
          <div className="flex-shrink-0">
            <LazyMount
              rootMargin="300px"
              fallback={<div className="mx-4 mt-0 h-[118px] rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]" />}
            >
              <AffiliateBannerCarousel />
            </LazyMount>
          </div>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden mt-2">
            <CouponWallet />
          </div>
        </div>
      ) : (
        <>
          {/* ── チャットタブ上部バナー ── */}
          <div className="flex-shrink-0">
            <LazyMount
              rootMargin="300px"
              fallback={<div className="mx-4 mt-4 h-[118px] rounded-2xl bg-[#f5f5f7] border border-[#e5e5ea]" />}
            >
              <AffiliateBannerCarousel />
            </LazyMount>
          </div>
          {/* ── メッセージ検索 ── */}
          {displayMessages.length > 0 && (
            <div className="px-4 py-2 bg-white border-b border-[#e5e5ea] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[#86868b] text-xs flex-shrink-0" aria-hidden>🔍</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('home.searchPlaceholder')}
                  className="flex-1 bg-[#f5f5f7] border border-[#e5e5ea] rounded-lg px-3 py-2 text-[#1d1d1f] placeholder-[#86868b] text-sm focus:outline-none focus:border-[#0095B6] transition"
                  aria-label={t('home.searchAria')}
                />
                {matchCount > 0 && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[#86868b] text-[10px]">
                      {currentMatchIndex + 1}/{matchCount}
                    </span>
                    <button
                      type="button"
                      onClick={handleSearchPrev}
                      aria-label={t('home.searchPrev')}
                      className="w-7 h-7 rounded flex items-center justify-center text-[#0095B6] hover:bg-[#0095B6]/10 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleSearchNext}
                      aria-label={t('home.searchNext')}
                      className="w-7 h-7 rounded flex items-center justify-center text-[#0095B6] hover:bg-[#0095B6]/10 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                )}
                {searchQuery.trim() && matchCount === 0 && (
                  <span className="text-[#86868b] text-[10px] flex-shrink-0">{t('home.noSearchResults')}</span>
                )}
              </div>
            </div>
          )}

          {/* ── メッセージ一覧 ── */}
          <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-3 min-h-0 mt-2">
            {canLoadMore && (
              <div className="flex justify-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={loadOlderMessages}
                  disabled={loadingOlder}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#e5e5ea] bg-white text-[#0095B6] text-[12px] font-medium hover:bg-[#f5f5f7] disabled:opacity-50 transition shadow-sm"
                >
                  {loadingOlder ? (
                    <span className="w-3.5 h-3.5 border-2 border-[#e5e5ea] border-t-[#0095B6] rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15" /></svg>
                  )}
                  {loadingOlder ? '読み込み中...' : '過去のメッセージを見る'}
                </button>
              </div>
            )}
            {displayMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-[#0095B6]/10 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-[#0095B6]/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <p className="text-[#86868b] text-[15px]">{t('home.emptyChatTitle')}</p>
                <p className="text-[#86868b]/70 text-[13px] mt-1">{t('home.emptyChatHint')}</p>
              </div>
            ) : (
              displayMessages.map((msg, i) => {
                const isOwn = msg.senderId === currentUser?.uid
                const prevMsg = displayMessages[i - 1] ?? null
                const showDivider = !isSameDay(msg.createdAt, prevMsg?.createdAt ?? null)
                const hasReplyAfter = hasReplyAfterIds.has(msg.id)
                const isRead = Boolean(msg.readAt || hasReplyAfter)

                return (
                  <ChatMessageRow
                    key={msg.id}
                    msg={msg}
                    showDivider={showDivider}
                    isOwn={isOwn}
                    isRead={isRead}
                    searchQuery={searchQuery}
                    isEditing={editingMessageId === msg.id}
                    editingText={editingText}
                    menuOpen={openMenuId === msg.id}
                    canEdit={canEditMessage(msg)}
                    setMessageNodeRef={setMessageNodeRef}
                    onEditingTextChange={onEditingTextChange}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onMenuButtonClick={onMenuButtonClick}
                    onCloseMenuOverlay={onCloseMenuOverlay}
                    onEdit={handleEditMessage}
                    onDelete={handleDeleteMessage}
                  />
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── メッセージ入力バー（Apple風：白背景・青アクセント） ── */}
          {/* relative z-20: ⋮メニューの fixed オーバーレイ(z-10)より上に置き、タップを塞がせない */}
          <div className="px-4 py-3 bg-white border-t border-[#e5e5ea] flex-shrink-0 safe-area-bottom relative z-20">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
              onChange={handleFileChange}
              className="hidden"
              aria-label={t('home.attachFileAria')}
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
                  {t('home.delete')}
                </button>
              </div>
            )}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label={t('home.attachFileAria')}
                className="touch-target w-11 h-11 flex items-center justify-center text-[#86868b] hover:text-[#0095B6] transition flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                id="vip-store-chat-composer"
                value={text}
                onChange={syncChatText}
                onCompositionEnd={(e) => setText(e.currentTarget.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => setOpenMenuId(null)}
                placeholder={t('home.messageInputPlaceholder')}
                aria-label={t('home.messageInputAria')}
                rows={1}
                name="vip-chat-composer-body"
                autoComplete="off"
                enterKeyHint="enter"
                inputMode="text"
                data-form-type="other"
                className="flex-1 min-h-[44px] max-h-32 min-w-0 bg-[#f5f5f7] border border-[#e5e5ea] rounded-2xl px-5 py-3 text-[17px] text-[#1d1d1f] placeholder-[#86868b] focus:outline-none focus:border-[#0095B6] focus:ring-2 focus:ring-[#0095B6]/20 transition resize-none"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={(!text.trim() && !selectedFile) || sending}
                aria-label={t('home.sendAria')}
                aria-busy={sending}
                className="touch-target w-11 h-11 bg-[#0095B6] rounded-full flex items-center justify-center text-white disabled:opacity-30 transition hover:bg-[#007A96] active:scale-95 flex-shrink-0 shadow-sm"
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

      {/* ── フッター（横スクロール1行固定・言語に関わらず高さ一定） ── */}
      <footer className="flex-shrink-0 border-t border-[#e5e5ea] bg-white safe-area-bottom">
        <div
          className="flex items-center overflow-x-auto text-[11px] px-2 py-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {userRole === 'admin' && (
            <>
              <Link
                to="/admin"
                className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#0095B6] font-semibold hover:text-[#007A96] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]"
              >
                {t('footer.adminDashboard')}
              </Link>
              <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>
                |
              </span>
            </>
          )}
          <button
            onClick={() => setCreditsOpen(true)}
            aria-label={t('footer.credits')}
            className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]"
          >
            {t('footer.credits')}
          </button>
          <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>|</span>
          <Link to="/privacy" className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]">
            {t('footer.privacy')}
          </Link>
          <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>|</span>
          <Link to="/terms" className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]">
            {t('footer.terms')}
          </Link>
          <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>|</span>
          <Link to="/advertising" className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]">
            {t('footer.advertising')}
          </Link>
          <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>|</span>
          <Link to="/tokushoho" className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]">
            {t('footer.tokushoho')}
          </Link>
          <span className="flex-shrink-0 text-[#d1d1d6] mx-0.5" aria-hidden>|</span>
          <Link to="/licenses" className="flex-shrink-0 flex items-center h-9 px-2.5 text-[#86868b] hover:text-[#0095B6] transition whitespace-nowrap rounded-lg active:bg-[#f5f5f7]">
            {t('footer.licenses')}
          </Link>
        </div>
      </footer>

      <VoiceCreditsPopup open={creditsOpen} onClose={() => setCreditsOpen(false)} />
    </div>
  )
}
