# チャット送信バグ修正 — Cursor 作業指示書

## 問題の概要

チャットの**受信はできるが送信したメッセージが画面に表示されない**バグが発生している。

## 原因

Firestore の最適化として `orderBy('createdAt', 'desc') + limit(50) + .reverse()` に変更したことで、メッセージ送信直後に以下の問題が起きている。

1. `addDoc` でメッセージを送信すると、Firestore はサーバー確認前に一瞬だけローカル状態で `onSnapshot` を発火する（楽観的ローカル書き込み）
2. この瞬間、`createdAt` フィールドは「サーバー確認待ち」のため **`null`** として返る（Firestore のデフォルト動作）
3. クエリが `orderBy('createdAt', 'desc')` なので `null` は全メッセージの**後ろ**に並ぶ
4. `limit(50)` があるため、50件以上メッセージがある場合に**その送信メッセージがトップ50に入らず画面に表示されない**

管理者からの受信メッセージはサーバー確認済みのタイムスタンプで届くため正常に表示される。これが「受信は見えるが送信は見えない」という現象の原因。

## 修正内容

**修正ファイル: `src/pages/Home.tsx` のみ（1ファイルだけ）**

---

### Step 1 — import を修正する（6〜20行目付近）

`limit` を `limitToLast` に変更する。

```ts
// 変更前
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
  writeBatch,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'

// 変更後（limit → limitToLast に変更）
import {
  collection,
  query,
  orderBy,
  where,
  limitToLast,
  onSnapshot,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore'
```

---

### Step 2 — メッセージクエリの useEffect を修正する（87〜117行目）

```ts
// 変更前
useEffect(() => {
  if (!currentUser) return
  // 直近50件のみ購読（読み取り削減）。asc+limit は最古50件になるため desc+limit 後に昇順表示へ並べ替え
  const q = query(
    collection(db, 'chats', currentUser.uid, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(50),
  )
  return onSnapshot(
    q,
    (snap) => {
      const mapped = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          senderId: data.senderId as string,
          text: (data.text as string) ?? '',
          createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
          readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
          attachmentUrl: data.attachmentUrl as string | undefined,
          attachmentType: data.attachmentType as AttachmentType | undefined,
          attachmentName: data.attachmentName as string | undefined,
        }
      })
      setMessages([...mapped].reverse())
    },
    (err) => {
      console.error('[messages onSnapshot]', err)
    },
  )
}, [currentUser])

// 変更後
useEffect(() => {
  if (!currentUser) return
  // limitToLast(50) で最新50件を昇順取得。desc+reverse より正確で送信直後も正しく表示される。
  // serverTimestamps: 'estimate' で送信直後の pending timestamp を現在時刻の推定値として扱い、
  // 送信メッセージがリストから消える問題を防ぐ。
  const q = query(
    collection(db, 'chats', currentUser.uid, 'messages'),
    orderBy('createdAt', 'asc'),
    limitToLast(50),
  )
  return onSnapshot(
    q,
    (snap) => {
      setMessages(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' })
          return {
            id: d.id,
            senderId: data.senderId as string,
            text: (data.text as string) ?? '',
            createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
            readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
            attachmentUrl: data.attachmentUrl as string | undefined,
            attachmentType: data.attachmentType as AttachmentType | undefined,
            attachmentName: data.attachmentName as string | undefined,
          }
        }),
      )
    },
    (err) => {
      console.error('[messages onSnapshot]', err)
    },
  )
}, [currentUser])
```

---

## 変更点のまとめ

| 変更箇所 | 変更前 | 変更後 | 理由 |
|---|---|---|---|
| import | `limit` | `limitToLast` | クエリ変更に合わせる |
| クエリ順序 | `orderBy('createdAt', 'desc')` | `orderBy('createdAt', 'asc')` | 昇順で取得することで reverse 不要になる |
| 件数制限 | `limit(50)` | `limitToLast(50)` | 末尾（最新）から50件を昇順で取得 |
| データ取得 | `d.data()` | `d.data({ serverTimestamps: 'estimate' })` | 送信直後の pending timestamp を null ではなく現在時刻の推定値として扱う |
| reverse | `setMessages([...mapped].reverse())` | 削除（不要） | asc で取得するので並べ替え不要 |

---

## 変更してはいけない箇所

- `handleSend` 関数は変更しない
- `writeBatch` による既読マーク処理は変更しない
- `setChatBadge` の呼び出しは変更しない
- `AppBadge.tsx`・`ChatBadgeContext.tsx`・`App.tsx` は変更しない

---

## 作業完了後の確認事項

1. `npm run build` でビルドエラーがないこと
2. ローカル（`npm run dev`）で以下を確認すること
   - チャット画面でメッセージを送信したとき、送信したメッセージが**即座に**画面下部に表示されること
   - 管理者からのメッセージ（受信）も引き続き正常に表示されること
   - チャット画面を開いたとき、過去50件のメッセージが時系列順（古い順）に表示されること
