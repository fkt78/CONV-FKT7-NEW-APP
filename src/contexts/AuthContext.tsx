/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { type User, onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, authPersistenceReady, db } from '../lib/firebase'

export type UserStatus = 'active' | 'blacklisted' | null
export type UserRole = 'admin' | null

interface AuthContextValue {
  currentUser: User | null
  userStatus: UserStatus
  userRole: UserRole
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  userStatus: null,
  userRole: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userStatus, setUserStatus] = useState<UserStatus>(null)
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let latestUid: string | null = null
    let unsubscribe: (() => void) | undefined
    let cancelled = false

    void authPersistenceReady.then(() => {
      if (cancelled) return
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        const uid = user?.uid ?? null
        latestUid = uid
        setCurrentUser(user)

        if (user) {
          try {
            const snap = await getDoc(doc(db, 'users', user.uid))
            if (latestUid !== uid) return
            if (snap.exists()) {
              const data = snap.data()
              setUserStatus(data.status as UserStatus)
              setUserRole(data.role === 'admin' ? 'admin' : null)
            } else {
              setUserStatus(null)
              setUserRole(null)
            }
          } catch (err) {
            if (latestUid !== uid) return
            console.error('[AuthContext] ユーザー情報取得失敗', err)
            setUserStatus(null)
            setUserRole(null)
          }
        } else {
          setUserStatus(null)
          setUserRole(null)
        }

        setLoading(false)
      })
    })

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ currentUser, userStatus, userRole, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
