# 分析・レポート機能 実装提案

## 概要

クーポン利用率・チャット数・エンゲージメントを分析できる「分析・レポート」機能の実装方針です。

---

## 1. 現状のデータ構造（利用可能なデータ）

| データ | パス | 主なフィールド |
|--------|------|----------------|
| 会員 | `users/{uid}` | fullName, email, attribute, birthMonth, totalSavedAmount, memberNumber, status, **createdAt** |
| 保有クーポン | `users/{uid}/coupons/{couponId}` | status (unused/used), **distributedAt**, **usedAt**, expiresAt |
| チャット | `chats/{chatId}` | chatId = 会員uid |
| メッセージ | `chats/{chatId}/messages/{messageId}` | senderId, text, **createdAt**, readAt |
| クーポンテンプレート | `coupons/{couponId}` | title, discountAmount, active など |

---

## 2. 表示したい指標

### 2.1 クーポン分析
| 指標 | 説明 | 算出方法 |
|------|------|----------|
| 配布数 | 期間内に配布されたクーポン数 | `users/*/coupons` の distributedAt で集計 |
| 使用数 | 期間内に使用されたクーポン数 | status=used かつ usedAt で集計 |
| 利用率 | 使用数 ÷ 配布数 × 100% | 上記から計算 |
| テンプレート別 | クーポン種別ごとの利用率 | templateId または title でグルーピング |

### 2.2 チャット分析
| 指標 | 説明 | 算出方法 |
|------|------|----------|
| 総メッセージ数 | 期間内の全メッセージ数 | collectionGroup('messages') で集計 |
| 会員送信数 | 会員が送ったメッセージ数 | senderId === chatId の件数 |
| 管理者返信数 | 管理者が送ったメッセージ数 | senderId !== chatId の件数 |
| アクティブチャット数 | 1件以上メッセージがある会員数 | ユニーク chatId 数 |
| 平均応答時間 | 会員メッセージ→管理者返信の時間 | readAt やメッセージ時刻から算出（将来） |

### 2.3 エンゲージメント
| 指標 | 説明 | 算出方法 |
|------|------|----------|
| アクティブ会員数 | 期間内にチャット or クーポン利用した会員 | 両方のアクティビティをマージ |
| 新規登録数 | 期間内の新規会員 | users.createdAt で集計 |
| 累計会員数 | アクティブ会員の総数 | users where status=active |
| 節約額合計 | クーポン使用による節約総額 | users.totalSavedAmount の合計 |

---

## 3. 実装アプローチ（3案）

### 案A: クライアント集計（推奨・初期実装）

**方式**: 管理者が「分析」タブを開いたときに、Firestore から必要なデータを取得し、ブラウザで集計

**メリット**
- 実装が簡単
- 新規の Cloud Function や Firestore ルール変更が最小限
- 期間指定（7日/30日/全期間）を柔軟に切り替え可能

**デメリット**
- 会員数・メッセージ数が増えると読み取り数が増え、初回表示が遅くなる可能性
- ドキュメント数に応じて課金が増える

**必要な変更**
1. `firestore.rules` に `collectionGroup('coupons')` の管理者読み取りルールを追加
2. 新規コンポーネント `AnalyticsManager` を作成
3. AdminDashboard に「分析」タブを追加

**データ取得の目安**
- 会員数 500人 × 平均クーポン5件 = 2,500 docs（coupons）
- メッセージ総数 10,000件程度までなら collectionGroup で取得可能
- 期間フィルタ（createdAt, distributedAt, usedAt）で件数を絞る

---

### 案B: Cloud Function で定期集計

**方式**: 日次で Cloud Function が集計し、`analytics/daily/{date}` のようなドキュメントに保存

**メリット**
- ダッシュボード表示が高速
- 読み取りコストを集計時のみに抑えられる

**デメリット**
- Cloud Function の実装・デプロイが必要
- リアルタイムではなく「前日まで」のデータになる

---

### 案C: ハイブリッド（将来拡張）

**方式**: 案A で初期実装し、会員数・メッセージ数が増えてきたら案B に移行

---

## 4. 推奨: 案A の画面構成イメージ

```
[分析・レポート] タブ
├── 期間選択: [7日間] [30日間] [全期間]
├── サマリーカード（4枚）
│   ├── クーポン利用率: 45% (配布120 / 使用54)
│   ├── チャット数: 342件 (会員180 / 管理者162)
│   ├── アクティブ会員: 89人
│   └── 新規登録: 12人
├── クーポン詳細
│   └── テンプレート別の配布数・使用数・利用率（テーブル）
├── チャット詳細
│   └── 日別メッセージ数（簡易グラフ or テーブル）
└── エンゲージメント
    └── 会員属性別のアクティブ数（任意）
```

---

## 5. 技術的な前提・制約

### Firestore ルール追加（案A に必要）

```javascript
// クーポン集計用：管理者が全ユーザーの coupons サブコレクションを読める
match /{path=**}/coupons/{couponId} {
  allow read: if request.auth != null && isAdmin();
}
```

※ 既存の `users/{uid}/coupons` ルールと競合しないよう、より広いパスでマッチさせる

### collectionGroup インデックス

- `messages`: 既に `createdAt` で COLLECTION_GROUP インデックスあり
- `coupons`: `distributedAt`, `usedAt`, `status` での複合クエリ用にインデックスが必要になる可能性あり（クエリ実行時にエラーが出たら追加）

---

## 6. 実装ステップ（案A）

1. **firestore.rules** に coupons の collectionGroup 読み取りルールを追加
2. **firestore.indexes.json** に必要に応じてインデックスを追加
3. **AnalyticsManager** コンポーネントを作成
   - 期間選択 UI
   - クーポン集計（collectionGroup + クライアント集計）
   - チャット集計（既存の collectionGroup を活用）
   - 会員数集計（users コレクション）
4. **AdminDashboard** に「分析」タブを追加
5. 必要に応じて CSV エクスポート機能を追加（データエクスポートと連携）

---

## 7. まとめ

| 項目 | 推奨 |
|------|------|
| 初期実装 | 案A（クライアント集計） |
| 画面 | サマリー + クーポン詳細 + チャット詳細 |
| 期間 | 7日 / 30日 / 全期間の切り替え |
| 将来 | データ量増加時に案B（Cloud Function 集計）へ移行 |

この方針で実装を進めることをお勧めします。実装を開始する場合は、上記ステップに沿って進めます。
