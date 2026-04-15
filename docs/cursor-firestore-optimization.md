# Firestore 読み書き最適化 — Cursor 作業指示書

## 背景・目的

Firebase コンソールで Firestore の読み取りが **13万件/日**、書き込みが **24万件/日** 発生しており、無料枠を大幅に超過して課金が発生している。アプリの機能は一切変えず、以下の3点を修正することで通信量を大幅に削減する。

---

## 改善① — `Home.tsx` のメッセージクエリに `limit(50)` を追加

### 問題

`src/pages/Home.tsx` の83〜112行目で、チャットメッセージを**全件リアルタイム購読**している。メッセージが500件あれば毎回500件取得し、誰かがメッセージを1件送るたびに500件を再チェックする。

### 修正内容

**ファイル: `src/pages/Home.tsx`**

**Step 1** — `import` に `limit` を追加する（6〜18行目付近）

```ts
// 変更前
import {
  collection,
  query,
  orderBy,
  where,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'

// 変更後（limit を追加）
import {
  collection,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
```

**Step 2** — メッセージクエリに `limit(50)` を追加する（83〜112行目）

```ts
// 変更前
useEffect(() => {
  if (!currentUser) return
  const q = query(
    collection(db, 'chats', currentUser.uid, 'messages'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    ...
  )
}, [currentUser])

// 変更後
useEffect(() => {
  if (!currentUser) return
  const q = query(
    collection(db, 'chats', currentUser.uid, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(50),       // ← この1行を追加
  )
  return onSnapshot(
    q,
    ...
  )
}, [currentUser])
```

### 注意事項

- `limit(50)` は `orderBy('createdAt', 'asc')` の**後**に置くこと。
- 既存の検索機能（`searchQuery` / `matchedIndices`）はそのままでよい。取得済みの50件に対してフィルタリングするだけなので動作は変わらない。
- ページネーション（「さらに読み込む」ボタン）は今回は追加しない。

---

## 改善② — `AppBadge.tsx` の重複リスナーを削除する

### 問題

`src/components/AppBadge.tsx` が、`Home.tsx` と**全く同じ** Firestore コレクションを独立してリアルタイム購読している。

- `AppBadge.tsx:33-44` → `chats/{uid}/messages` を全件購読
- `AppBadge.tsx:46-62` → `users/{uid}/coupons` (unused) を全件購読

`Home.tsx` も全く同じデータを購読しているため、同じ情報を**2倍のコストで読んでいる**。

### 修正方針

新しい Context（`ChatBadgeContext`）を作成し、`Home.tsx` が持っている「未読メッセージ数」と「有効クーポン数」をそこに書き込む。`AppBadge.tsx` はその値を読むだけにして、独自の Firestore リスナーを完全に削除する。

**Firestore への新規接続は一切作らない。** `Home.tsx` がすでに持っている計算済みの数値をContextで共有するだけ。

### 修正内容

**Step 1** — 新規ファイル `src/contexts/ChatBadgeContext.tsx` を作成する

```tsx
import { createContext, useContext, useState, type ReactNode } from 'react'

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

  const setChatBadge = (unread: number, coupons: number) => {
    setUnreadMessageCount(unread)
    setCouponCount(coupons)
  }

  return (
    <ChatBadgeContext.Provider value={{ unreadMessageCount, couponCount, setChatBadge }}>
      {children}
    </ChatBadgeContext.Provider>
  )
}

export function useChatBadge() {
  return useContext(ChatBadgeContext)
}
```

**Step 2** — `src/App.tsx` に `ChatBadgeProvider` を追加する

```tsx
// 追加するimport
import { ChatBadgeProvider } from './contexts/ChatBadgeContext'

// 変更前（43〜45行目付近）
<AuthProvider>
  <AppBadge />
  <NotificationRegistration />

// 変更後
<AuthProvider>
  <ChatBadgeProvider>
    <AppBadge />
    <NotificationRegistration />
    {/* ...残りのRoutesもChatBadgeProviderの内側に入れる */}
  </ChatBadgeProvider>
```

`<ChatBadgeProvider>` は `<AuthProvider>` の**内側**、かつ `<AppBadge />` と `<Routes>` の両方を**包む**位置に置くこと。

**Step 3** — `src/pages/Home.tsx` で `setChatBadge` を呼び出す

`Home.tsx` はすでに `unreadMessageCount`（143〜146行目）と `couponCount`（64行目の state）を持っている。これらが変わるたびに Context へ書き込む `useEffect` を追加する。

```tsx
// Home.tsx に追加するimport
import { useChatBadge } from '../contexts/ChatBadgeContext'

// Home() 関数の内部、既存のstateやhookの宣言の直後に追加
const { setChatBadge } = useChatBadge()

// unreadMessageCount または couponCount が変わるたびにContextへ反映
useEffect(() => {
  setChatBadge(unreadMessageCount, couponCount)
}, [unreadMessageCount, couponCount, setChatBadge])
```

この `useEffect` は既存のどの `useEffect` とも干渉しない。末尾に追加すればよい。

**Step 4** — `src/components/AppBadge.tsx` を書き換える

AppBadge 全体を以下のように置き換える。Firestore へのアクセスを完全に削除し、Contextから値を読むだけにする。

```tsx
import { useEffect } from 'react'
import { useChatBadge } from '../contexts/ChatBadgeContext'
import { useAuth } from '../contexts/AuthContext'

/** PWAアプリアイコンに未読件数バッジを表示（iPhoneホーム画面・ドックなど） */
export default function AppBadge() {
  const { currentUser, userRole } = useAuth()
  const { unreadMessageCount, couponCount } = useChatBadge()

  useEffect(() => {
    if (!currentUser || userRole === 'admin') return
    const nav = navigator as Navigator & { setAppBadge?(n: number): Promise<void>; clearAppBadge?(): Promise<void> }
    if (typeof nav.setAppBadge !== 'function') return

    const total = unreadMessageCount + couponCount
    if (total > 0) {
      nav.setAppBadge?.(Math.min(total, 99))
    } else {
      nav.clearAppBadge?.()
    }
  }, [currentUser, userRole, unreadMessageCount, couponCount])

  // アンマウント時にバッジをクリア
  useEffect(() => {
    return () => {
      const nav = navigator as Navigator & { clearAppBadge?(): Promise<void> }
      nav.clearAppBadge?.()
    }
  }, [])

  return null
}
```

### 注意事項

- `AppBadge.tsx` から `firebase/firestore` の import を**完全に削除**すること。
- `Home.tsx` にいる間はバッジ値が更新され続ける。管理者ページ（AdminDashboard）では `userRole === 'admin'` チェックにより何もしない（現行と同じ）。
- `Home.tsx` 以外のページ（クーポン画面など）へ移動してもバッジの値はContextに残るため、数値は正しく表示され続ける。

---

## 改善③ — 未読マークの更新を `writeBatch` でまとめる

### 問題

`src/pages/Home.tsx` の148〜167行目で、未読メッセージを既読にする処理が**1件ずつ** `updateDoc` を呼んでいる。未読が10件あれば10回、50件あれば50回 Firestore に書き込む。

### 修正内容

**ファイル: `src/pages/Home.tsx`**

**Step 1** — `import` に `writeBatch` を追加する

```ts
// 変更前
import {
  collection,
  query,
  orderBy,
  where,
  limit,       // ← 改善①で追加済み
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'

// 変更後（writeBatch を追加）
import {
  collection,
  query,
  orderBy,
  where,
  limit,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,    // ← この1行を追加
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
```

**Step 2** — 既読マーク処理を `writeBatch` に置き換える（148〜167行目）

```ts
// 変更前
useEffect(() => {
  if (!currentUser || messages.length === 0 || homeTab !== 'chat') return
  const toMark = messages.filter(
    (m) => m.senderId !== currentUser.uid && !m.readAt,
  )
  if (toMark.length === 0) return
  Promise.all(
    toMark.map((m) =>
      updateDoc(doc(db, 'chats', currentUser.uid, 'messages', m.id), {
        readAt: serverTimestamp(),
        readBy: currentUser.uid,
      }),
    ),
  ).catch((err) => {
    if ((err as { code?: string })?.code !== 'not-found') {
      console.error('既読更新エラー:', err)
    }
  })
}, [currentUser, messages, homeTab])

// 変更後
useEffect(() => {
  if (!currentUser || messages.length === 0 || homeTab !== 'chat') return
  const toMark = messages.filter(
    (m) => m.senderId !== currentUser.uid && !m.readAt,
  )
  if (toMark.length === 0) return

  // writeBatch で全件まとめて1回の書き込みにする
  const batch = writeBatch(db)
  toMark.forEach((m) => {
    batch.update(doc(db, 'chats', currentUser.uid, 'messages', m.id), {
      readAt: serverTimestamp(),
      readBy: currentUser.uid,
    })
  })
  batch.commit().catch((err) => {
    if ((err as { code?: string })?.code !== 'not-found') {
      console.error('既読更新エラー:', err)
    }
  })
}, [currentUser, messages, homeTab])
```

### 注意事項

- `writeBatch` は1回の `commit()` で最大500件まとめて処理できる。通常の未読件数（数件〜数十件）は問題なく動作する。
- `updateDoc` の呼び出しが0回→1回になるため、書き込みコストが大幅に削減される（例: 20件未読 → 書き込み20回→1回）。
- エラーハンドリングのロジック（`not-found` の無視）は元のコードと同じ。

---

## 作業完了後の確認事項

1. `npm run build` でTypeScriptのビルドエラーがないこと
2. ローカル（`npm run dev`）で以下の動作を確認すること
   - チャット画面を開いてメッセージが50件以内で表示されること
   - メッセージを受信したときにアプリアイコンのバッジ数字が更新されること
   - チャット画面を開いたときに未読メッセージが既読になること（既読マーク `✓` が付くなどの確認）
3. `src/components/AppBadge.tsx` から `firebase/firestore` のimportが残っていないことを確認すること

---

## 修正ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `src/pages/Home.tsx` | 修正（limit追加 / setChatBadge追加 / writeBatch置換） |
| `src/components/AppBadge.tsx` | 全面書き換え（Firestoreリスナー削除） |
| `src/contexts/ChatBadgeContext.tsx` | 新規作成 |
| `src/App.tsx` | 修正（ChatBadgeProvider追加） |
