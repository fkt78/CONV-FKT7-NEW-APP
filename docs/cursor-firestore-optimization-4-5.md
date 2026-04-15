# Firestore 読み書き最適化（改善④⑤）— Cursor 作業指示書

## 背景・目的

管理画面（`AdminDashboard.tsx`）で発生している Firestore の過剰読み取りを削減する。アプリの機能は変えず、クエリの絞り込みと件数上限の追加だけで対応する。

**修正対象ファイル:** `src/pages/AdminDashboard.tsx` のみ（1ファイルだけ）

---

## 改善④ — 管理画面のチャット一覧リスナーを「直近30日分」に絞り込む

### 問題

`AdminDashboard.tsx` の 135〜147行目に以下のコードがある。

```ts
useEffect(() => {
  return onSnapshot(collection(db, 'chats'), (snap) => {
    const meta: Record<string, ChatMeta> = {}
    snap.docs.forEach((d) => {
      meta[d.id] = {
        lastMessage: (d.data().lastMessage as string) ?? '',
        lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
        unreadFromCustomer: (d.data().unreadFromCustomer as boolean) ?? false,
      }
    })
    setChatMeta(meta)
  })
}, [])
```

`collection(db, 'chats')` に**何のフィルターもかけずに**全件をリアルタイム購読している。ユーザーが1,000人いれば1,000件のチャット情報を常時監視し続け、誰かがメッセージを送るたびに1,000件を全部再チェックする。

### 修正内容

「直近30日以内にメッセージがあったチャットだけ」に絞り込み、さらに最大100件に制限する。

`where`・`orderBy`・`limit` は既にファイル上部の import に含まれているので、**import の変更は不要**。

```ts
// 変更前（135〜147行目）
useEffect(() => {
  return onSnapshot(collection(db, 'chats'), (snap) => {
    const meta: Record<string, ChatMeta> = {}
    snap.docs.forEach((d) => {
      meta[d.id] = {
        lastMessage: (d.data().lastMessage as string) ?? '',
        lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
        unreadFromCustomer: (d.data().unreadFromCustomer as boolean) ?? false,
      }
    })
    setChatMeta(meta)
  })
}, [])

// 変更後
useEffect(() => {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const q = query(
    collection(db, 'chats'),
    where('lastMessageAt', '>=', thirtyDaysAgo),
    orderBy('lastMessageAt', 'desc'),
    limit(100),
  )
  return onSnapshot(q, (snap) => {
    const meta: Record<string, ChatMeta> = {}
    snap.docs.forEach((d) => {
      meta[d.id] = {
        lastMessage: (d.data().lastMessage as string) ?? '',
        lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
        unreadFromCustomer: (d.data().unreadFromCustomer as boolean) ?? false,
      }
    })
    setChatMeta(meta)
  })
}, [])
```

### 注意事項

- `where('lastMessageAt', '>=', thirtyDaysAgo)` と `orderBy('lastMessageAt', 'desc')` は**同じフィールド**に対する操作なので、Firestore の複合インデックスは不要。追加のインデックス設定作業はない。
- 30日以上メッセージのないユーザーのチャットはリストから消えるが、実務上は問題ない（対応が必要な会話は必ず直近にある）。もし古いチャットを見たい場合は、「ユーザー管理」タブからそのユーザーを選んでチャットを開く動線がすでにある。
- `limit(100)` を超えるユーザーがいる場合でも、100名分が常に表示される。実用上は十分な件数。
- 236〜243行目のクライアントサイドのソート（`sortedUsers`）はそのまま残してよい。

---

## 改善⑤ — グローバル検索を「件数上限 + 期間フィルター」で効率化する

### 問題

`AdminDashboard.tsx` の 299〜377行目にある `runGlobalSearch()` 関数が以下の問題を抱えている。

```ts
const BATCH_SIZE = 500
const MAX_MESSAGES = 2500
```

- 1回の検索で**最大2,500件**のメッセージを Firestore から読み込む
- 全期間・全ユーザーのメッセージが対象で、日付による絞り込みがない
- 検索のたびに最大2,500回の Firestore 読み取りが発生する

### 修正内容

**Step 1** — 期間フィルターの state を追加する

ファイル上部の `useState` が並んでいるブロック（`globalSearchLoading` などの近く）に以下を追加する。

```ts
const [globalSearchDays, setGlobalSearchDays] = useState<number>(90)
```

**Step 2** — `runGlobalSearch()` 関数を修正する（299〜377行目）

```ts
// 変更前
async function runGlobalSearch() {
  const q = globalSearchQuery.trim()
  if (!q) {
    setShowGlobalSearchResults(false)
    setGlobalSearchResults([])
    return
  }
  setGlobalSearchLoading(true)
  setShowGlobalSearchResults(true)
  try {
    const BATCH_SIZE = 500
    const MAX_MESSAGES = 2500
    const userMap = Object.fromEntries(users.map((u) => [u.uid, { fullName: u.fullName, memberNumber: u.memberNumber }]))
    const matches: Array<Message & { chatId: string }> = []
    let lastDoc: DocumentSnapshot | null = null
    let totalFetched = 0

    while (totalFetched < MAX_MESSAGES) {
      const qRef: Query = lastDoc
        ? query(
            collectionGroup(db, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(BATCH_SIZE),
            startAfter(lastDoc),
          )
        : query(
            collectionGroup(db, 'messages'),
            orderBy('createdAt', 'desc'),
            limit(BATCH_SIZE),
          )
      const snap = await getDocs(qRef)
      if (snap.empty) break

      snap.docs.forEach((d: DocumentSnapshot) => {
        const chatId = d.ref.parent.parent?.id
        if (!chatId) return
        const data = d.data() ?? {}
        const msg: Message & { chatId: string } = {
          id: d.id,
          chatId,
          senderId: data.senderId as string,
          text: (data.text as string) ?? '',
          createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
          readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
          attachmentUrl: data.attachmentUrl as string | undefined,
          attachmentType: data.attachmentType as AttachmentType | undefined,
          attachmentName: data.attachmentName as string | undefined,
        }
        if (messageMatches(msg, q)) matches.push(msg)
      })

      lastDoc = snap.docs[snap.docs.length - 1] ?? null
      totalFetched += snap.docs.length
      if (snap.docs.length < BATCH_SIZE) break
    }

    const byChat = new Map<string, Array<Message & { chatId: string }>>()
    matches.forEach((m) => {
      const arr = byChat.get(m.chatId) ?? []
      arr.push(m)
      byChat.set(m.chatId, arr)
    })
    const results = Array.from(byChat.entries()).map(([chatId, msgs]) => {
      const u = userMap[chatId] as { fullName: string; memberNumber: number | null } | undefined
      return {
        chatId,
        fullName: u?.fullName ?? '不明',
        memberNumber: u?.memberNumber ?? null,
        messages: msgs.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
      }
    })
    setGlobalSearchResults(results)
  } catch (err) {
    console.error('全チャット検索エラー:', err)
    setGlobalSearchResults([])
  } finally {
    setGlobalSearchLoading(false)
  }
}

// 変更後
async function runGlobalSearch() {
  const q = globalSearchQuery.trim()
  if (!q) {
    setShowGlobalSearchResults(false)
    setGlobalSearchResults([])
    return
  }
  setGlobalSearchLoading(true)
  setShowGlobalSearchResults(true)
  try {
    const BATCH_SIZE = 300     // 500 → 300 に削減
    const MAX_MESSAGES = 300   // 2500 → 300 に削減
    const userMap = Object.fromEntries(users.map((u) => [u.uid, { fullName: u.fullName, memberNumber: u.memberNumber }]))
    const matches: Array<Message & { chatId: string }> = []
    let lastDoc: DocumentSnapshot | null = null
    let totalFetched = 0

    // 期間フィルターの日付を計算（0 = 全期間 = フィルターなし）
    const filterDate = globalSearchDays > 0
      ? new Date(Date.now() - globalSearchDays * 24 * 60 * 60 * 1000)
      : null

    while (totalFetched < MAX_MESSAGES) {
      // フィルターあり・なしでクエリを分岐
      const baseConstraints = filterDate
        ? [
            orderBy('createdAt', 'desc'),
            where('createdAt', '>=', filterDate),
            limit(BATCH_SIZE),
          ]
        : [
            orderBy('createdAt', 'desc'),
            limit(BATCH_SIZE),
          ]
      const qRef: Query = lastDoc
        ? query(collectionGroup(db, 'messages'), ...baseConstraints, startAfter(lastDoc))
        : query(collectionGroup(db, 'messages'), ...baseConstraints)

      const snap = await getDocs(qRef)
      if (snap.empty) break

      snap.docs.forEach((d: DocumentSnapshot) => {
        const chatId = d.ref.parent.parent?.id
        if (!chatId) return
        const data = d.data() ?? {}
        const msg: Message & { chatId: string } = {
          id: d.id,
          chatId,
          senderId: data.senderId as string,
          text: (data.text as string) ?? '',
          createdAt: (data.createdAt as Timestamp | null)?.toDate() ?? null,
          readAt: (data.readAt as Timestamp | null)?.toDate() ?? null,
          attachmentUrl: data.attachmentUrl as string | undefined,
          attachmentType: data.attachmentType as AttachmentType | undefined,
          attachmentName: data.attachmentName as string | undefined,
        }
        if (messageMatches(msg, q)) matches.push(msg)
      })

      lastDoc = snap.docs[snap.docs.length - 1] ?? null
      totalFetched += snap.docs.length
      if (snap.docs.length < BATCH_SIZE) break
    }

    const byChat = new Map<string, Array<Message & { chatId: string }>>()
    matches.forEach((m) => {
      const arr = byChat.get(m.chatId) ?? []
      arr.push(m)
      byChat.set(m.chatId, arr)
    })
    const results = Array.from(byChat.entries()).map(([chatId, msgs]) => {
      const u = userMap[chatId] as { fullName: string; memberNumber: number | null } | undefined
      return {
        chatId,
        fullName: u?.fullName ?? '不明',
        memberNumber: u?.memberNumber ?? null,
        messages: msgs.sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)),
      }
    })
    setGlobalSearchResults(results)
  } catch (err) {
    console.error('全チャット検索エラー:', err)
    setGlobalSearchResults([])
  } finally {
    setGlobalSearchLoading(false)
  }
}
```

**Step 3** — グローバル検索の UI に期間選択プルダウンを追加する

JSX の中でグローバル検索の入力欄（`globalSearchQuery` を使っている `<input>`）と検索ボタンが並んでいる箇所を探し、その近く（入力欄の直前か直後）に以下の `<select>` を追加する。

```tsx
<select
  value={globalSearchDays}
  onChange={(e) => setGlobalSearchDays(Number(e.target.value))}
  className="text-xs border border-[#e5e5ea] rounded px-2 py-1 bg-white text-[#1d1d1f]"
>
  <option value={30}>30日以内</option>
  <option value={90}>90日以内</option>
  <option value={180}>180日以内</option>
  <option value={0}>全期間</option>
</select>
```

### 注意事項

- `where('createdAt', '>=', filterDate)` と `orderBy('createdAt', 'desc')` は同じフィールド `createdAt` への操作なので、複合インデックスは不要。`firestore.indexes.json` にすでに `createdAt` の COLLECTION_GROUP インデックスが存在しており、そのまま動作する。
- BATCH_SIZE と MAX_MESSAGES を同じ `300` にしているため、ループは最大1回で完了する。これで1回の検索あたりの最大読み取りが **2,500件 → 300件**（8分の1）になる。
- `全期間`（`globalSearchDays = 0`）を選んだ場合は日付フィルターなしで実行されるが、MAX_MESSAGES=300 の上限は常に適用される。
- TypeScript の型エラーが出る場合は、`baseConstraints` の型を明示する：
  ```ts
  import type { QueryConstraint } from 'firebase/firestore'
  const baseConstraints: QueryConstraint[] = filterDate ? [...] : [...]
  ```

---

## 作業完了後の確認事項

1. `npm run build` でビルドエラーがないこと
2. ローカル（`npm run dev`）で以下を確認すること
   - 管理画面のチャットタブを開いたとき、直近30日以内のユーザーのチャット一覧が表示されること
   - グローバル検索欄の近くに「30日以内 / 90日以内 / 180日以内 / 全期間」のプルダウンが表示されること
   - プルダウンを変えて検索したとき、期間に応じた結果が返ること
   - 管理者が会員にメッセージを送ったとき、チャット一覧が正常に更新されること

---

## 修正ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `src/pages/AdminDashboard.tsx` | 修正（チャットリスナー絞り込み / グローバル検索の件数・期間制限 / UIにプルダウン追加） |

**変更は `AdminDashboard.tsx` の1ファイルのみ。** 新規ファイルの作成・他ファイルへの変更は不要。
