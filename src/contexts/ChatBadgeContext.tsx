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
   * バッジ用クーポン枚数は getCountFromServer() で取得する。
   * getDocs で全件取得すると「クーポン枚数 × ユーザー数 × ポーリング回数」の読み取りが発生するが、
   * getCountFromServer() はドキュメント数に関わらず常に 1 読み取りで済む。
   * 期限切れフィルタをサーバー側で行うため expiresAt > now の where 条件も追加。
   */
  useEffect(() => {
    if (!currentUser) {
      setCouponCount(0)
      return
    }
    let cancelled = false
    const now = new Date()
    // 有効期限なし（expiresAt が null）のものと、期限内のものを合算するため 2 クエリ
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
    const fetchCount = async () => {
      try {
        const [snapNoExpiry, snapWithExpiry] = await Promise.all([
          getCountFromServer(qNoExpiry),
          getCountFromServer(qWithExpiry),
        ])
        if (cancelled) return
        setCouponCount(snapNoExpiry.data().count + snapWithExpiry.data().count)
      } catch (err) {
        if (cancelled) return
        console.error('[ChatBadgeContext] coupon count fetch error:', err)
      }
    }
    void fetchCount()
    const timer = setInterval(fetchCount, 120_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [currentUser])

  return (
    <ChatBadgeContext.Provider value={{ unreadMessageCount, couponCount, setUnreadCount }}>
      {children}
    </ChatBadgeContext.Provider>
  )
}

export function useChatBadge() {
  return useContext(ChatBadgeContext)
}
