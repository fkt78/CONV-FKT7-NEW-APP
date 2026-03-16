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
import { auth, db } from '../lib/firebase'

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)

      if (user) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid))
          if (snap.exists()) {
            const data = snap.data()
            setUserStatus(data.status as UserStatus)
            setUserRole(data.role === 'admin' ? 'admin' : null)
          } else {
            setUserStatus(null)
            setUserRole(null)
          }
        } catch (err) {
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

    return unsubscribe
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
