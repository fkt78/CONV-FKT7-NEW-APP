/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { type User, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore'
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
    let unsubUser: (() => void) | undefined
    let cancelled = false

    void authPersistenceReady.then(() => {
      if (cancelled) return
      unsubAuth = onAuthStateChanged(auth, (user) => {
        unsubUser?.()
        unsubUser = undefined
        setCurrentUser(user)

        if (!user) {
          setUserStatus(null)
          setUserRole(null)
          setUserData(null)
          setLoading(false)
          // ログアウト時にクーポンキャッシュをクリア
          try { sessionStorage.removeItem('vip-coupon-wallet-cache') } catch { /* ignore */ }
          return
        }

        setLoading(true)
        const uid = user.uid

        // 即時 getDoc（以前の挙動）。onSnapshot だけだと初回が遅い／失敗する環境があり、管理者メニューが出ないことがある
        void getDoc(doc(db, 'users', uid))
          .then((snap) => {
            if (auth.currentUser?.uid !== uid) return
            applyUserDoc(snap, setUserStatus, setUserRole, setUserData)
            setLoading(false)
          })
          .catch((err) => {
            console.error('[AuthContext] users getDoc 失敗', err)
            if (auth.currentUser?.uid !== uid) return
            setUserStatus(null)
            setUserRole(null)
            setUserData(null)
            setLoading(false)
          })

        unsubUser = onSnapshot(
          doc(db, 'users', uid),
          (snap) => {
            if (auth.currentUser?.uid !== uid) return
            applyUserDoc(snap, setUserStatus, setUserRole, setUserData)
            setLoading(false)
          },
          (err) => {
            // 購読だけ失敗した場合、getDoc で既に admin が入っていることがある。ロールを消さない
            console.error('[AuthContext] users 購読エラー（ロールは維持）', err)
            setLoading(false)
          },
        )
      })
    })

    return () => {
      cancelled = true
      unsubUser?.()
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
