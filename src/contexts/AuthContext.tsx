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

    void authPersistenceReady.then(() => {
      if (cancelled) return
      unsubAuth = onAuthStateChanged(auth, (user) => {
        if (userPollTimer) { clearInterval(userPollTimer); userPollTimer = undefined }
        setCurrentUser(user)

        if (!user) {
          setUserStatus(null)
          setUserRole(null)
          setUserData(null)
          setLoading(false)
          try { sessionStorage.removeItem('vip-coupon-wallet-cache') } catch { /* ignore */ }
          return
        }

        setLoading(true)
        const uid = user.uid

        // 初回即時取得（ロール判定を遅延させないため getDoc を優先）
        const fetchUserDoc = () => {
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

        fetchUserDoc()
        // onSnapshot の代わりに 5 分ポーリング。ロール・ステータスは頻繁に変わらないため
        // 5 分間隔で十分。onSnapshot は users/{uid} の更新（黄色カード等）のたびに
        // 全ユーザー分の読み取りが発生し、Firestore コストが増大するため廃止。
        userPollTimer = setInterval(fetchUserDoc, 300_000)
      })
    })

    return () => {
      cancelled = true
      if (userPollTimer) clearInterval(userPollTimer)
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
