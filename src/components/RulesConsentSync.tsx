import { useEffect, useRef } from 'react'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  HOUSE_RULES_VERSION,
  RULES_ACCEPTED_EVENT,
  getAcceptedRulesVersion,
} from './HouseRulesAgreement'

const SYNCED_KEY = 'fkt7_rules_synced'

/**
 * ハウスルールへの同意（版と日時）を、ログイン中ユーザーの users ドキュメントに記録する。
 * 画面には何も表示しない。
 *
 * 起動時に加えて、同意ボタンが押された直後（RULES_ACCEPTED_EVENT）にも実行することで、
 * すでにログイン中の利用者が同意した場合もその場で記録されるようにしている。
 */
export default function RulesConsentSync() {
  const { currentUser } = useAuth()
  const runningRef = useRef(false)
  const uid = currentUser?.uid ?? null

  useEffect(() => {
    if (!uid) return

    const sync = () => {
      if (getAcceptedRulesVersion() !== HOUSE_RULES_VERSION) return

      let synced: string | null = null
      try {
        synced = localStorage.getItem(SYNCED_KEY)
      } catch {
        return
      }
      if (synced === `${uid}:${HOUSE_RULES_VERSION}`) return
      if (runningRef.current) return
      runningRef.current = true

      updateDoc(doc(db, 'users', uid), {
        rulesAcceptedVersion: HOUSE_RULES_VERSION,
        rulesAcceptedAt: serverTimestamp(),
      })
        .then(() => {
          try {
            localStorage.setItem(SYNCED_KEY, `${uid}:${HOUSE_RULES_VERSION}`)
          } catch {
            /* 保存できなくても記録自体は成功しているので無視 */
          }
        })
        .catch(() => {
          /* 記録の失敗はアプリの動作に影響させない（次回起動時に再試行される） */
        })
        .finally(() => {
          runningRef.current = false
        })
    }

    sync()
    window.addEventListener(RULES_ACCEPTED_EVENT, sync)
    return () => {
      window.removeEventListener(RULES_ACCEPTED_EVENT, sync)
    }
  }, [uid])

  return null
}
