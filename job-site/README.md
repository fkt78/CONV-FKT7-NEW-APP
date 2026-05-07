# 求人 LP（Firebase Hosting）

`job-site/` は PWA の `dist` とは別の **Firebase Hosting サイト**として公開します（プライベート GitHub のままで可）。

**初回セットアップの順番付き手順は [SETUP-ONCE.md](./SETUP-ONCE.md) を参照してください。**

## 初回だけ（Firebase 側）

1. [Firebase Console](https://console.firebase.google.com/) → プロジェクト **conv-fkt7-new-app** → **Hosting**。
2. **サイトを追加** で新規サイトを作成し、**サイト ID** を **`conv-fkt7-new-app-job`** にする（別名にした場合は `.firebaserc` の `job` ターゲットと揃える）。

または CLI（プロジェクトルート）:

```bash
firebase hosting:sites:create conv-fkt7-new-app-job --project conv-fkt7-new-app
firebase target:apply hosting job conv-fkt7-new-app-job --project conv-fkt7-new-app
```

既にデフォルトサイト用に次が未実行なら（マルチサイト化直後）:

```bash
firebase target:apply hosting pwa conv-fkt7-new-app --project conv-fkt7-new-app
```

## デプロイ

リポジトリルートで（`firebase use` が別プロジェクトでも可）:

```bash
npm run deploy:job-site
```

PWA だけ／全部は従来どおり:

```bash
npm run deploy              # hosting 両方 + functions 等（既存スクリプト）
npm run build && npx firebase deploy --only hosting:pwa --project conv-fkt7-new-app
```

## 公開 URL

デプロイ後、Hosting 画面に表示される URL の例:

- `https://conv-fkt7-new-app-job.web.app`
- `https://conv-fkt7-new-app-job.firebaseapp.com`

アプリのバナー用: **`VITE_JOB_RECRUITMENT_SITE_URL`** に上記のいずれか（末尾 `/` あっても可）を設定して PWA をビルドする。

## カスタマイズ

- 文言・構造: `index.html`
- 見た目: `styles.css`
- 連絡先: `mailto:` やフォーム URL を実値に置き換える
