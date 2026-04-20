import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'

/** 管理者の無操作タイムアウト閾値（24時間） */
const ADMIN_IDLE_TIMEOUT_MS = 24 * 60 * 60 * 1000

/** 操作時刻の更新スロットル間隔（30秒） */
const THROTTLE_MS = 30 * 1000

/** localStorage キー */
export const ADMIN_IDLE_STORAGE_KEY = 'admin-last-activity'

/**
 * 管理者（role === 'admin'）のみ有効なアイドルタイムアウトフック。
 * 最終操作から 24時間経過すると自動ログアウトし /login へ遷移する。
 * 一般ユーザーには何もしない。
 */
export function useAdminIdleTimeout() {
  const { userRole } = useAuth()
  const navigate = useNavigate()
  const timedOutRef = useRef(false)

  useEffect(() => {
    // 管理者以外: 万が一残留しているキーを削除して終了
    if (userRole !== 'admin') {
      localStorage.removeItem(ADMIN_IDLE_STORAGE_KEY)
      return
    }

    timedOutRef.current = false

    // 初回マウント時に最終操作時刻を記録（未設定なら現在時刻）
    if (!localStorage.getItem(ADMIN_IDLE_STORAGE_KEY)) {
      localStorage.setItem(ADMIN_IDLE_STORAGE_KEY, String(Date.now()))
    }

    const performLogout = () => {
      if (timedOutRef.current) return
      timedOutRef.current = true
      localStorage.removeItem(ADMIN_IDLE_STORAGE_KEY)
      void signOut(auth).then(() => {
        navigate('/login')
        alert('長時間操作がなかったため自動ログアウトしました。')
      })
    }

    const checkTimeout = (): boolean => {
      const last = Number(localStorage.getItem(ADMIN_IDLE_STORAGE_KEY) ?? '0')
      if (last > 0 && Date.now() - last > ADMIN_IDLE_TIMEOUT_MS) {
        performLogout()
        return true
      }
      return false
    }

    // マウント直後にチェック（タブを長時間閉じていた場合の検知）
    if (checkTimeout()) return

    // 操作イベントで最終操作時刻を更新（30秒スロットル）
    let lastUpdate = Date.now()
    const updateActivity = () => {
      const now = Date.now()
      if (now - lastUpdate < THROTTLE_MS) return
      lastUpdate = now
      localStorage.setItem(ADMIN_IDLE_STORAGE_KEY, String(now))
    }

    // visibilitychange でタブが前面に来たタイミングでもチェック
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (!checkTimeout()) updateActivity()
      }
    }

    // 別タブでの操作更新を受信して自タブの throttle を同期
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_IDLE_STORAGE_KEY && e.newValue) {
        lastUpdate = Number(e.newValue)
      }
    }

    const activityEvents = ['click', 'keydown', 'touchstart'] as const
    activityEvents.forEach((ev) => window.addEventListener(ev, updateActivity, { passive: true }))
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('storage', handleStorage)

    // 1分ごとに定期チェック
    const interval = setInterval(() => {
      checkTimeout()
    }, 60_000)

    return () => {
      activityEvents.forEach((ev) => window.removeEventListener(ev, updateActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('storage', handleStorage)
      clearInterval(interval)
    }
  }, [userRole, navigate])
}
