# Firestore 読み書き最適化（改善⑥⑦）— Cursor 作業指示書

## 前提

- 改善⑥は `src/pages/AdminDashboard.tsx` の修正。
- 改善⑦は `functions/src/index.ts` の修正。
- **改善④の指示書（cursor-firestore-optimization-4-5.md）が先に適用済みであること**を前提とする。改善④によって `AdminDashboard.tsx` の 135〜147行目はすでに絞り込みクエリに変わっているはず。

---

## 改善⑥ — 一斉送信中はチャットリスナーを一時停止する

### 問題

管理画面から会員全員（例: 100名）に一斉送信すると:
1. 100名分のチャットドキュメント（`chats/{uid}`）が更新される
2. 改善④で設置したチャットリスナーが、この100件の変化を1件ずつ検知して100回発火する
3. 結果: 1回の一斉送信 → 100回の Firestore 読み取りが連鎖する

一斉送信中はリスナーを停止し、送信完了後に1回だけ再接続すれば、この連鎖を防げる。

### 修正内容

**ファイル: `src/pages/AdminDashboard.tsx`**

---

**Step 1** — ファイル上部にヘルパー関数を追加する

`import` ブロックの直後、`export default function AdminDashboard()` の**前**に、以下の2つのヘルパー関数を追加する。

```ts
// チャット一覧クエリを生成（改善④と同じ条件）
function buildChatMetaQuery() {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return query(
    collection(db, 'chats'),
    where('lastMessageAt', '>=', thirtyDaysAgo),
    orderBy('lastMessageAt', 'desc'),
    limit(100),
  )
}

// スナップショットから chatMeta オブジェクトを組み立てる
import type { QuerySnapshot, DocumentData } from 'firebase/firestore'
function parseChatMetaSnap(snap: QuerySnapshot<DocumentData>): Record<string, ChatMeta> {
  const meta: Record<string, ChatMeta> = {}
  snap.docs.forEach((d) => {
    meta[d.id] = {
      lastMessage: (d.data().lastMessage as string) ?? '',
      lastMessageAt: (d.data().lastMessageAt as Timestamp | null)?.toDate() ?? null,
      unreadFromCustomer: (d.data().unreadFromCustomer as boolean) ?? false,
    }
  })
  return meta
}
```

> **注意**: `QuerySnapshot` と `DocumentData` が既に import されている場合は追加不要。されていない場合は `firebase/firestore` の import 行に追記する。

---

**Step 2** — ref を1つ追加する

コンポーネント内の ref 宣言が並んでいるブロック（`messagesEndRef` や `inputRef` など、110〜114行目付近）に、以下を追加する。

```ts
const chatMetaUnsubRef = useRef<(() => void) | null>(null)
```

---

**Step 3** — チャット一覧リスナーの useEffect を書き換える

改善④で修正済みの useEffect（`collection(db, 'chats')` を購読している箇所）を、以下のように書き換える。`chatMetaUnsubRef` にアンサブスクライブ関数を保存するようにする。

```ts
// 変更前（改善④適用後の状態）
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

// 変更後
useEffect(() => {
  const unsub = onSnapshot(buildChatMetaQuery(), (snap) => {
    setChatMeta(parseChatMetaSnap(snap))
  })
  chatMetaUnsubRef.current = unsub
  return () => {
    unsub()
    chatMetaUnsubRef.current = null
  }
}, [])
```

---

**Step 4** — `handleBroadcastSend()` にリスナーの停止・再開を追加する

`handleBroadcastSend()` 関数（`setBroadcastSending(true)` の前後）を以下のように修正する。

```ts
// 変更前（554〜604行目付近）
async function handleBroadcastSend() {
  const trimmed = broadcastText.trim()
  if (!trimmed || !currentUser || broadcastSending) return

  const targets = sendTargetUids
    ? users.filter((u) => sendTargetUids.includes(u.uid))
    : users.filter((u) => u.role !== 'admin' && u.uid !== currentUser.uid)

  if (targets.length === 0) {
    alert('送信対象の会員がいません')
    return
  }

  setBroadcastSending(true)
  setBroadcastProgress({ current: 0, total: targets.length })

  try {
    const ts = serverTimestamp()
    const BATCH_SIZE = 15
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE)
      await Promise.all(
        chunk.map(async (t) => {
          const uid = t.uid
          await addDoc(collection(db, 'chats', uid, 'messages'), {
            senderId: currentUser.uid,
            text: trimmed,
            createdAt: ts,
          })
          await setDoc(
            doc(db, 'chats', uid),
            { lastMessage: trimmed.slice(0, 50), lastMessageAt: ts },
            { merge: true },
          )
        }),
      )
      setBroadcastProgress({ current: Math.min(i + BATCH_SIZE, targets.length), total: targets.length })
    }
    setBroadcastText('')
    setShowBroadcastModal(false)
    setSendTargetUids(null)
  } catch (err) {
    console.error('一斉送信エラー:', err)
    alert(`送信に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    setBroadcastSending(false)
    setBroadcastProgress(null)
    setSendTargetUids(null)
  }
}

// 変更後
async function handleBroadcastSend() {
  const trimmed = broadcastText.trim()
  if (!trimmed || !currentUser || broadcastSending) return

  const targets = sendTargetUids
    ? users.filter((u) => sendTargetUids.includes(u.uid))
    : users.filter((u) => u.role !== 'admin' && u.uid !== currentUser.uid)

  if (targets.length === 0) {
    alert('送信対象の会員がいません')
    return
  }

  // 一斉送信中はリスナーを停止（送信のたびに大量のonSnapshotが発火するのを防ぐ）
  chatMetaUnsubRef.current?.()
  chatMetaUnsubRef.current = null

  setBroadcastSending(true)
  setBroadcastProgress({ current: 0, total: targets.length })

  try {
    const ts = serverTimestamp()
    const BATCH_SIZE = 15
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const chunk = targets.slice(i, i + BATCH_SIZE)
      await Promise.all(
        chunk.map(async (t) => {
          const uid = t.uid
          await addDoc(collection(db, 'chats', uid, 'messages'), {
            senderId: currentUser.uid,
            text: trimmed,
            createdAt: ts,
          })
          await setDoc(
            doc(db, 'chats', uid),
            { lastMessage: trimmed.slice(0, 50), lastMessageAt: ts },
            { merge: true },
          )
        }),
      )
      setBroadcastProgress({ current: Math.min(i + BATCH_SIZE, targets.length), total: targets.length })
    }
    setBroadcastText('')
    setShowBroadcastModal(false)
    setSendTargetUids(null)
  } catch (err) {
    console.error('一斉送信エラー:', err)
    alert(`送信に失敗しました: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    setBroadcastSending(false)
    setBroadcastProgress(null)
    setSendTargetUids(null)
    // 送信完了後にリスナーを1回だけ再開（最新状態を1回だけ取得）
    const unsub = onSnapshot(buildChatMetaQuery(), (snap) => {
      setChatMeta(parseChatMetaSnap(snap))
    })
    chatMetaUnsubRef.current = unsub
  }
}
```

### 注意事項

- 送信中にエラーが発生した場合も `finally` でリスナーが再開されるため、エラー後もチャット一覧が正常に更新される。
- リスナーが停止している間（送信処理中）は画面のチャット一覧が更新されないが、プログレスバーが表示されているため管理者には視覚的に伝わっている。
- Step 1 で追加したヘルパー関数は `AdminDashboard` コンポーネントの外側に置くこと（コンポーネント内に置くと毎レンダーで再定義されるため）。

---

## 改善⑦ — Cloud Functions のクーポン配布を2重実行から守る

### 問題

`functions/src/index.ts` の `runCouponDistribution()` 関数（990〜1210行目）は毎朝7時に自動実行されるが:

1. **誤って2回実行された場合**: 全アクティブユーザー（例: 1,000名）を再び全件読み込み、既存クーポンの有無を確認する大量の読み込みが再発生する
2. **管理者がテスト実行を連打した場合**: 同様に毎回ユーザー全件読み込みが走る
3. **毎回のユーザー全件スキャン**: 既に本日分のクーポンを受け取ったユーザーも含めて、全員分の存在チェック（`batchGetExistingUserCouponUids`）が走る

### 修正内容

**ファイル: `functions/src/index.ts`**

---

**Step 1** — スケジュール実行の2重実行防止ガードを追加する

`runCouponDistribution()` 関数の先頭（990〜993行目）に、本日の配信が完了済みかどうかを確認するチェックを追加する。

```ts
// 変更前（990〜993行目付近）
async function runCouponDistribution(
  options?: CouponDistributionOptions | null,
): Promise<{ distributedCount: number; distributedOmikuji: number; weather: WeatherData | null }> {
    const onlyIds = options?.onlyCouponIds?.length ? [...new Set(options.onlyCouponIds)] : null

    const settingsSnap = await db.collection('settings').doc('coupon').get()
    // ... 以降続く

// 変更後
async function runCouponDistribution(
  options?: CouponDistributionOptions | null,
): Promise<{ distributedCount: number; distributedOmikuji: number; weather: WeatherData | null }> {
    const onlyIds = options?.onlyCouponIds?.length ? [...new Set(options.onlyCouponIds)] : null

    // ===== 2重実行防止ガード（スケジュール実行かつ全テンプレ対象のときのみ適用） =====
    // onlyIds が指定されている場合はテスト実行なのでガードをスキップする
    const distributionStatusRef = db.collection('settings').doc('distributionStatus')
    if (!onlyIds) {
      const statusSnap = await distributionStatusRef.get()
      const lastRunDate = statusSnap.data()?.lastScheduledRunDate as string | undefined
      // today の計算はこの後の処理でも行うが、ここでは先行して計算する
      const nowForCheck = new Date()
      const jstForCheck = new Date(nowForCheck.getTime() + 9 * 60 * 60 * 1000)
      const todayForCheck = `${jstForCheck.getUTCFullYear()}-${String(jstForCheck.getUTCMonth() + 1).padStart(2, '0')}-${String(jstForCheck.getUTCDate()).padStart(2, '0')}`
      if (lastRunDate === todayForCheck) {
        console.log(`[couponDistribution] 本日(${todayForCheck})の配信はすでに完了済み。2重実行を防止してスキップします。`)
        return { distributedCount: 0, distributedOmikuji: 0, weather: null }
      }
    }
    // ===== ガードここまで =====

    const settingsSnap = await db.collection('settings').doc('coupon').get()
    // ... 以降は変更なし
```

---

**Step 2** — 配信完了後にステータスを記録する

`runCouponDistribution()` の末尾付近（1189〜1209行目）、`await commitWriteBatchIfAny()` の後に、完了ステータスの書き込みを追加する。

```ts
// 変更前（1189〜1209行目付近）
    await commitWriteBatchIfAny()

    let distributedOmikuji = 0
    if (!onlyIds) {
      distributedOmikuji = await runOmikujiDistribution({
        logCountByUid,
        today,
        dailyLimit,
        userDocs: uSnap.docs as QueryDocumentSnapshot[],
      })
    }

    console.log(
      '[couponDistribution] 完了:',
      distributedCount,
      '件配信。おみくじ:',
      distributedOmikuji,
      '件。weather=',
      weather === null ? 'null(API失敗時は天気条件付きは未実施)' : JSON.stringify(weather),
    )
    return { distributedCount, distributedOmikuji, weather }
}

// 変更後
    await commitWriteBatchIfAny()

    let distributedOmikuji = 0
    if (!onlyIds) {
      distributedOmikuji = await runOmikujiDistribution({
        logCountByUid,
        today,
        dailyLimit,
        userDocs: uSnap.docs as QueryDocumentSnapshot[],
      })
    }

    // スケジュール実行（全テンプレ対象）の場合のみ完了ステータスを記録
    if (!onlyIds) {
      await distributionStatusRef.set({
        lastScheduledRunDate: today,
        completedAt: Timestamp.now(),
      }, { merge: true })
      console.log(`[couponDistribution] 完了ステータスを記録: lastScheduledRunDate=${today}`)
    }

    console.log(
      '[couponDistribution] 完了:',
      distributedCount,
      '件配信。おみくじ:',
      distributedOmikuji,
      '件。weather=',
      weather === null ? 'null(API失敗時は天気条件付きは未実施)' : JSON.stringify(weather),
    )
    return { distributedCount, distributedOmikuji, weather }
}
```

---

**Step 3** — 既に日次上限に達しているユーザーを batchGetExistingUserCouponUids の対象から除外する

`batchGetExistingUserCouponUids` は「今日このクーポンを既に持っているユーザー」を調べるための読み込みだが、日次上限（`dailyLimit`）に達しているユーザーはどうせスキップされる。そのため、上限未満のユーザーだけを存在チェックの対象にすることで、`getAll` の読み取り量を削減できる。

この変更は **誕生月クーポン** と **通常クーポン** の2箇所に同じ修正が必要。

**誕生月クーポン側（1084〜1085行目付近）**:

```ts
// 変更前
        const couponDocId = `${coupon.id}_${today}`
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, eligibleUids)

// 変更後
        const couponDocId = `${coupon.id}_${today}`
        // 日次上限に達していないユーザーだけを対象に存在チェック（上限済みはどうせスキップ）
        const exempt = isDailyLimitExempt(coupon)
        const uidsToCheck = exempt
          ? eligibleUids
          : eligibleUids.filter((uid) => (logCountByUid.get(uid) ?? 0) < dailyLimit)
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, uidsToCheck)
```

**通常クーポン側（1151〜1152行目付近）**:

```ts
// 変更前
        const couponDocId = `${coupon.id}_${today}`
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, eligibleUids)

// 変更後
        const couponDocId = `${coupon.id}_${today}`
        // 日次上限に達していないユーザーだけを対象に存在チェック（上限済みはどうせスキップ）
        const exempt = isDailyLimitExempt(coupon)
        const uidsToCheck = exempt
          ? eligibleUids
          : eligibleUids.filter((uid) => (logCountByUid.get(uid) ?? 0) < dailyLimit)
        const existingUids = await batchGetExistingUserCouponUids(couponDocId, uidsToCheck)
```

> **注意**: この変更後、`existingUids` には「日次上限に達していて存在チェックをスキップしたユーザー」は含まれない。ただしそれらのユーザーはすぐ後の `if (!exempt) { const count = logCountByUid.get(uid) ?? 0; if (count >= dailyLimit) continue }` でスキップされるため、動作上の問題はない。

---

### 注意事項（改善⑦全体）

- **Step 1 の `distributionStatusRef` 変数はスコープに注意**: `runCouponDistribution` 関数の中で宣言しているため、Step 2 でも同じ変数を参照できる（関数内で `const distributionStatusRef = db.collection('settings').doc('distributionStatus')` と定義しているので、Step 2 の `distributionStatusRef.set(...)` はそれを参照する）。
- **テスト実行（`testCouponDistribution`）への影響なし**: `onlyIds` が存在する場合はガードをスキップするため、管理画面からのテスト配信は引き続き正常に動作する。
- **途中で失敗した場合の安全性**: Step 1 のガードは「完了ステータスが記録されている場合のみスキップ」という設計。Step 2 の `distributionStatusRef.set(...)` は全配信ループが正常に完了した後に実行されるため、途中でタイムアウト・エラーが起きた場合はステータスが書き込まれず、翌朝の再実行時に正常に再試行される。
- **デプロイ方法**: `functions/src/index.ts` を変更後、`npm run deploy` または `firebase deploy --only functions` で Cloud Functions をデプロイすること。フロントエンドとは別にデプロイが必要。

---

## 作業完了後の確認事項

### 改善⑥の確認

1. `npm run build` でビルドエラーがないこと
2. ローカル（`npm run dev`）で管理画面を開き、一斉送信モーダルから少数（2〜3名）のメンバーにテスト送信する
3. 送信中（プログレスバー表示中）はチャット一覧が更新されないこと（リスナー停止中）
4. 送信完了後にチャット一覧が更新されること（リスナー再開後）

### 改善⑦の確認

1. `functions/src/index.ts` の TypeScript コンパイルエラーがないこと（`cd functions && npm run build` で確認）
2. Firebase コンソール → Firestore で `settings/distributionStatus` ドキュメントが存在しないことを確認（初回実行後に自動作成される）
3. 管理画面からテスト配信を実行し、正常にクーポンが配布されること（`onlyIds` によるガードバイパスが機能していること）
4. 同じテスト配信を連続2回実行し、2回目はログに「2重実行を防止してスキップします」と出ないこと（テスト実行はガード対象外のため、2回とも実行されるのが正しい）

---

## 修正ファイル一覧

| ファイル | 変更種別 |
|---|---|
| `src/pages/AdminDashboard.tsx` | 修正（チャットリスナーの停止・再開 / ヘルパー関数追加） |
| `functions/src/index.ts` | 修正（2重実行防止ガード / 完了ステータス記録 / existenceチェック最適化） |
