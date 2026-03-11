import { useAuth } from '../contexts/AuthContext'
import { useNotificationRegistration } from '../hooks/useNotificationRegistration'

/** ログイン中ユーザーのFCMトークン登録をバックグラウンドで実行（画面には何も表示しない） */
export default function NotificationRegistration() {
  const { currentUser } = useAuth()
  useNotificationRegistration(currentUser?.uid ?? null)
  return null
}
