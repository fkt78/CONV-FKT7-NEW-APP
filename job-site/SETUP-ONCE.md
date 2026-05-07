# 求人サイト（Firebase Hosting）初回セットアップ手順

このドキュメントは **一度だけ** 行う作業です。終われば、あとは `npm run deploy:job-site` で求人ページを更新できます。

---

## 前提

- Firebase プロジェクト **`conv-fkt7-new-app`** を利用している（`.firebaserc` の `default` と一致）。
- パソコンに [Firebase CLI](https://firebase.google.com/docs/cli) が入り、`firebase login` 済み。
- 作業は **リポジトリのルート**（`package.json` がある階層）で行います。
- **`firebase use` が別プロジェクトを指していても問題ありません。** `npm run deploy:job-site` は **求人用プロジェクト `conv-fkt7-new-app`** に固定してデプロイします（`.firebaserc` の `targets` と一致させてあります）。

---

## トラブル: `Deploy target job not configured for project …`（別のプロジェクトと表示される）

`firebase use` のデフォルトが **`.firebaserc` の `targets` と違うプロジェクト**を指していると、引数なしの `firebase deploy` だけだと **そのプロジェクト向け**にデプロイしようとして、そちらには `job` ターゲットが無くエラーになります。

**対処:** プロジェクトルートで `npm run deploy:job-site` を使う（スクリプトが **`--project conv-fkt7-new-app`** を付けます）。手動で叩く場合は次のとおりです。

```bash
firebase deploy --only hosting:job --project conv-fkt7-new-app
```

---

## 手順 1：Firebase Console で Hosting 用の「2つ目のサイト」を作る

1. ブラウザで [Firebase Console](https://console.firebase.google.com/) を開く。
2. プロジェクト **conv-fkt7-new-app** を選択する。
3. 左メニューから **ビルド** → **Hosting** を開く。
4. **サイトを追加**（または「別のサイトを追加」）を選ぶ。
5. **サイト ID** に次を入力する：`conv-fkt7-new-app-job`  
   - **別の ID にした場合**は、後の **手順 4** で `.firebaserc` の `job` のサイト ID を同じ名前に直す。
6. サイト作成を完了する。

---

## 手順 2：CLI で「ターゲット」とサイト ID を紐づける

リポジトリのルートでターミナルを開き、次を **順に**実行する。

### 2-1. メイン PWA 用（デフォルトサイト）

```bash
firebase target:apply hosting pwa conv-fkt7-new-app --project conv-fkt7-new-app
```

- すでに紐づいているなどでエラーになる場合は、そのメッセージを読み **スキップしてよい** ことが多いです。

### 2-2. 求人サイト用（今回追加したサイト）

```bash
firebase target:apply hosting job conv-fkt7-new-app-job --project conv-fkt7-new-app
```

- **手順 1** でサイト ID を変えたときは、`conv-fkt7-new-app-job` の部分を **実際のサイト ID** に置き換える。

---

## 手順 3：求人サイトだけデプロイして動作確認する

```bash
npm run deploy:job-site
```

- 成功したら、Firebase Console の Hosting で **サイト `conv-fkt7-new-app-job`** の URL を確認する。
- ブラウザで開いて表示を確認する。  
  **例:** `https://conv-fkt7-new-app-job.web.app` または `https://conv-fkt7-new-app-job.firebaseapp.com`

---

## 手順 4：（サイト ID を変えた場合だけ）`.firebaserc` を合わせる

手順 1 で **`conv-fkt7-new-app-job` 以外**のサイト ID にした場合：

1. リポジトリ直下の `.firebaserc` を開く。
2. `targets` → `conv-fkt7-new-app` → `hosting` → `job` の配列にある文字列を、**Console で付けたサイト ID**に変更する。
3. 保存する。

---

## 手順 5：アプリのバナーから求人ページへ飛ばす

1. プロジェクト直下に **`.env`**（または本番のビルド環境）を用意する。
2. 次のように **実際の求人サイトの URL** を設定する（末尾 `/` はあってもなくても可）。

   ```env
   VITE_JOB_RECRUITMENT_SITE_URL=https://conv-fkt7-new-app-job.web.app/
   ```

3. PWA をビルドし直して、いつもどおりホスティングへデプロイする。

   ```bash
   npm run deploy
   ```

   （プロジェクトの `deploy` スクリプトがビルド＋Firebase デプロイを行う想定です。）

4. アプリのホームでバナーに「店舗求人」スライドが出て、タップで求人ページが開くことを確認する。

---

## 完了後の運用メモ

| やりたいこと           | コマンド・操作 |
|------------------------|----------------|
| 求人ページだけ更新     | `npm run deploy:job-site` |
| PWA も含めて全部更新   | `npm run deploy`（従来どおり） |
| 文言・デザイン変更     | `job-site/index.html` / `job-site/styles.css` を編集後、上記デプロイ |

---

## うまくいかないとき

- **`hosting:job` が見つからない**  
  → 手順 2 の `firebase target:apply hosting job ...` をもう一度確認する。
- **404 やアクセスできない**  
  → 手順 3 のデプロイが成功しているか、Console の該当サイトの URL が正しいか確認する。
- **バナーに求人が出ない**  
  → `VITE_JOB_RECRUITMENT_SITE_URL` が **ビルド時** に読み込まれているか（`.env` の有無・本番の環境変数）を確認する。
