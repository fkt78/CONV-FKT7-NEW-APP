import { useEffect } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

/** PWAアプリアイコンに未読件数バッジを表示（iPhoneホーム画面・ドックなど） */
export default function AppBadge() {
  const { currentUser, userRole } = useAuth()

  useEffect(() => {
    if (!currentUser || userRole === 'admin') return
    const nav = navigator as Navigator & { setAppBadge?(n: number): Promise<void>; clearAppBadge?(): Promise<void> }
    if (typeof nav.setAppBadge !== 'function') return

    let unreadMessages = 0
    let validCoupons = 0

    const updateBadge = () => {
      const total = unreadMessages + validCoupons
      if (total > 0) {
        nav.setAppBadge?.(Math.min(total, 99))
      } else {
        nav.clearAppBadge?.()
      }
    }

    const unsubMessages = onSnapshot(
      query(
        collection(db, 'chats', currentUser.uid, 'messages'),
        orderBy('createdAt', 'asc'),
      ),
      (snap) => {
        unreadMessages = snap.docs.filter(
          (d) => d.data().senderId !== currentUser.uid && !d.data().readAt,
        ).length
        updateBadge()
      },
    )

    const unsubCoupons = onSnapshot(
      query(
        collection(db, 'users', currentUser.uid, 'coupons'),
        where('status', '==', 'unused'),
      ),
      (snap) => {
        const now = Date.now()
        validCoupons = snap.docs.filter((d) => {
          const exp = d.data().expiresAt
          if (!exp) return true
          const expMs = exp.toDate?.()?.getTime?.()
          if (typeof expMs !== 'number' || Number.isNaN(expMs)) return true
          return now <= expMs
        }).length
        updateBadge()
      },
    )

    return () => {
      unsubMessages()
      unsubCoupons()
      nav.clearAppBadge?.()
    }
  }, [currentUser, userRole])

  return null
}
