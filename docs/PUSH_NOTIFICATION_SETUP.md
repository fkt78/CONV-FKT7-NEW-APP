# プッシュ通知のセットアップ手順

## 1. Firebase Console での設定

### VAPID キーの取得

1. [Firebase Console](https://console.firebase.google.com/) でプロジェクトを開く
2. **プロジェクトの設定**（歯車アイコン）→ **Cloud Messaging** タブ
3. **Web プッシュ証明書** セクションで **キーペアを生成**
4. 表示された公開キーをコピー

### FCM Registration API の有効化（SDK 6.7.0+）

1. [Google Cloud Console](https://console.cloud.google.com/) で同じプロジェクトを選択
2. **API とサービス** → **ライブラリ**
3. 「FCM Registration API」を検索して有効化

## 2. 環境変数の設定

`.env` に以下を追加：

```
VITE_FIREBASE_VAPID_KEY=ここにコピーした公開キーを貼り付け
```

## 3. Cloud Functions のデプロイ

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

※ Cloud Functions は **Blaze プラン**（従量課金）が必要です。

## 4. 動作確認

1. アプリにログイン
2. ホーム画面の 🔔 アイコンから **通知設定** を開く
3. **プッシュ通知** をオンにして **通知を許可する** をタップ
4. 管理者がチャットでメッセージを送信 → 通知が届くことを確認
