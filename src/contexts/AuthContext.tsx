/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { type User, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, type DocumentSnapshot } from 'firebase/firestore'
import { auth, authPersistenceReady, db } from '../lib/firebase'

export type UserStatus = 'active' | 'blacklisted' | null
export type UserRole = 'admin' | null

export interface UserData {
  fullName: string
  email: string
  attribute: string
  birthMonth: string
  totalSavedAmount?: number
  memberNumber?: number | null
}

interface AuthContextValue {
  currentUser: User | null
  userStatus: UserStatus
  userRole: UserRole
  userData: UserData | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  userStatus: null,
  userRole: null,
  userData: null,
  loading: true,
})

/** Firestore の role が文字列・表記ゆれでも admin とみなす */
function normalizeRole(role: unknown): UserRole {
  if (role === 'admin') return 'admin'
  if (typeof role === 'string' && role.trim().toLowerCase() === 'admin') return 'admin'
  return null
}

function applyUserDoc(
  snap: DocumentSnapshot,
  setStatus: (s: UserStatus) => void,
  setRole: (r: UserRole) => void,
  setData: (d: UserData | null) => void,
) {
  if (snap.exists()) {
    const data = snap.data()
    setStatus((data.status as UserStatus) ?? null)
    setRole(normalizeRole(data.role))
    setData({
      fullName: (data.fullName as string) ?? '',
      email: (data.email as string) ?? '',
      attribute: (data.attribute as string) ?? '',
      birthMonth: (data.birthMonth as string) ?? '',
      totalSavedAmount: data.totalSavedAmount as number | undefined,
      memberNumber: (data.memberNumber as number | null) ?? null,
    })
  } else {
    setStatus(null)
    setRole(null)
    setData(null)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userStatus, setUserStatus] = useState<UserStatus>(null)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [userData, setUserData] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let unsubAuth: (() => void) | undefined
    let userPollTimer: ReturnType<typeof setInterval> | undefined
    let cancelled = false
    let activeUid: string | null = null

    const fetchUserDoc = () => {
      const uid = activeUid
      if (!uid) return
      void getDoc(doc(db, 'users', uid))
        .then((snap) => {
          if (cancelled || auth.currentUser?.uid !== uid) return
          applyUserDoc(snap, setUserStatus, setUserRole, setUserData)
          setLoading(false)
        })
        .catch((err) => {
          console.error('[AuthContext] users getDoc 失敗', err)
          if (cancelled || auth.currentUser?.uid !== uid) return
          setLoading(false)
        })
    }
    const startPolling = () => {
      if (userPollTimer || !activeUid) return
      // onSnapshot の代わりに 5 分ポーリング。画面非表示時はタイマーを止める。
      userPollTimer = setInterval(fetchUserDoc, 300_000)
    }
    const stopPolling = () => {
      if (userPollTimer) {
        clearInterval(userPollTimer)
        userPollTimer = undefined
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (activeUid) {
          // 復帰時は最新を即時取得
          fetchUserDoc()
          startPolling()
        }
      } else {
        stopPolling()
      }
    }

    void authPersistenceReady.then(() => {
      if (cancelled) return
      unsubAuth = onAuthStateChanged(auth, (user) => {
        stopPolling()
        setCurrentUser(user)

        if (!user) {
          activeUid = null
          setUserStatus(null)
          setUserRole(null)
          setUserData(null)
          setLoading(false)
          try { sessionStorage.removeItem('vip-coupon-wallet-cache') } catch { /* ignore */ }
          return
        }

        setLoading(true)
        activeUid = user.uid
        fetchUserDoc()
        if (document.visibilityState === 'visible') startPolling()
      })
    })

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      cancelled = true
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubAuth?.()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ currentUser, userStatus, userRole, userData, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
