import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
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

  useEffect(() => {
    if (!currentUser) {
      setCouponCount(0)
      return
    }
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

  return (
    <ChatBadgeContext.Provider value={{ unreadMessageCount, couponCount, setUnreadCount }}>
      {children}
    </ChatBadgeContext.Provider>
  )
}

export function useChatBadge() {
  return useContext(ChatBadgeContext)
}
