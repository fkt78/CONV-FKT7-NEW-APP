import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ChatBadgeValue {
  unreadMessageCount: number
  couponCount: number
  setChatBadge: (unread: number, coupons: number) => void
}

const ChatBadgeContext = createContext<ChatBadgeValue>({
  unreadMessageCount: 0,
  couponCount: 0,
  setChatBadge: () => {},
})

export function ChatBadgeProvider({ children }: { children: ReactNode }) {
  const [unreadMessageCount, setUnreadMessageCount] = useState(0)
  const [couponCount, setCouponCount] = useState(0)

  const setChatBadge = useCallback((unread: number, coupons: number) => {
    setUnreadMessageCount(unread)
    setCouponCount(coupons)
  }, [])

  return (
    <ChatBadgeContext.Provider value={{ unreadMessageCount, couponCount, setChatBadge }}>
      {children}
    </ChatBadgeContext.Provider>
  )
}

export function useChatBadge() {
  return useContext(ChatBadgeContext)
}
