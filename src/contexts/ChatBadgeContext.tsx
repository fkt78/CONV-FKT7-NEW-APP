import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { collection, query, where, getCountFromServer } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './AuthContext'
import { useVisibilityPolling } from '../hooks/useVisibilityPolling'

interface ChatBadgeValue {
  unreadMessageCount: number
  couponCount: number
  setUnreadCount: (unread: number) => void
}

const ChatBadgeContext = createContext<ChatBadgeValue>({
  unreadMessageCount: 0,
  couponCount: 0,
  setUnreadCount: () => {},
})

export function ChatBadgeProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth()
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [couponCount, setCouponCount] = useState(0)

  const setUnreadCount = useCallback((unread: number) => {
    setUnreadMessageCount(unread)
  }, [])

  /**
   * バッジ用クーポン枚数は getCountFromServer() で取得する（1リクエスト=1読み取り）。
   * 画面表示中のみ 120 秒ポーリング。非表示時は停止して Firestore 読み取りを削減。
   */
  useEffect(() => {
    if (!currentUser) setCouponCount(0)
  }, [currentUser])

  const fetchCouponCount = useCallback(async () => {
    if (!currentUser) return
    try {
      const now = new Date()
      const qNoExpiry = query(
        collection(db, 'users', currentUser.uid, 'coupons'),
        where('status', '==', 'unused'),
        where('expiresAt', '==', null),
      )
      const qWithExpiry = query(
        collection(db, 'users', currentUser.uid, 'coupons'),
        where('status', '==', 'unused'),
        where('expiresAt', '>', now),
      )
      const [snapNoExpiry, snapWithExpiry] = await Promise.all([
        getCountFromServer(qNoExpiry),
        getCountFromServer(qWithExpiry),
      ])
      setCouponCount(snapNoExpiry.data().count + snapWithExpiry.data().count)
    } catch (err) {
      console.error('[ChatBadgeContext] coupon count fetch error:', err)
    }
  }, [currentUser])

  useVisibilityPolling(fetchCouponCount, 120_000, !!currentUser, [currentUser?.uid])

  return (
    <ChatBadgeContext.Provider value={{ unreadMessageCount, couponCount, setUnreadCount }}>
      {children}
    </ChatBadgeContext.Provider>
  )
}

export function useChatBadge() {
  return useContext(ChatBadgeContext)
}
