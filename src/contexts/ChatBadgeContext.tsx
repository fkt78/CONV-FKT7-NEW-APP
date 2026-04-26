import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { collection, query, where, getDocs, type Timestamp } from 'firebase/firestore'
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
   * バッジ用クーポン枚数は onSnapshot（常時購読）ではなく 60 秒ポーリングで取得。
   * 全ログインユーザーが常時購読すると、クーポン配信のたびに全員分の読み取りが発生し
   * Firestore 読み取りコストが線形に増大するため。
   * クーポンバッジは数秒の遅延があっても体験上問題ない。
   */
  useEffect(() => {
    if (!currentUser) {
      setCouponCount(0)
      return
    }
    let cancelled = false
    const q = query(
      collection(db, 'users', currentUser.uid, 'coupons'),
      where('status', '==', 'unused'),
    )
    const fetchCount = async () => {
      try {
        const snap = await getDocs(q)
        if (cancelled) return
        const now = Date.now()
        const validCount = snap.docs.filter((d) => {
          const exp = d.data().expiresAt as Timestamp | null | undefined
          if (!exp) return true
          const expMs = exp.toDate?.()?.getTime?.()
          if (typeof expMs !== 'number' || Number.isNaN(expMs)) return true
          return now <= expMs
        }).length
        setCouponCount(validCount)
      } catch (err) {
        if (cancelled) return
        console.error('[ChatBadgeContext] coupon count fetch error:', err)
      }
    }
    void fetchCount()
    const timer = setInterval(fetchCount, 60_000)
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
