# 【Cursor 作業指示書】バナー削除分のコミット整理 → プッシュ → 本番デプロイ

対象リポジトリ: `CONV-FKT7-NEW-APP`（VIP Store PWA）
前提: 指示書 `docs/cursor-remove-anchorless-banners.md` の削除作業は **コミット `a487f07` で完了済み**
作成日: 2026-08-25

---

## 0. 現在の状態（確認済み）

```
ブランチ : main（origin/main より 1 コミット ahead）
最新     : a487f07 chore(banner): アンカーなしバナー7枚と未使用アセットを削除
リモート : https://github.com/fkt78/CONV-FKT7-NEW-APP.git
現バージョン : version.json = 1.0.251
未追跡   : .claude/  ,  docs/cursor-remove-anchorless-banners.md
```

このタスクのゴール:
**未追跡ファイルを整理 → push → 本番デプロイ → バージョン採番コミットを push**

---

## 1. 事前チェック（デプロイ前に必ず）

```bash
# 作業ツリーに未コミットの変更が無いか（未追跡2件以外は空であること）
git status -s

# ビルドが通るか（.env が必要。VITE_ 変数が読めないと Firebase 初期化に失敗する）
ls -la .env && npm run build

# Firebase CLI にログイン済みか / プロジェクトが正しいか
firebase login:list
firebase projects:list | grep conv-fkt7-new-app
```

> ⚠️ `npm run lint` は **失敗しますが、それが正常です**。
> エラーは `functions/src/index.ts` `AudioPlayer.tsx` `CouponWallet.tsx` `NewsManager.tsx`
> `OmikujiSetManager.tsx` `VipNews.tsx` `ChatBadgeContext.tsx` `webVitals.ts` の
> **既存の指摘（react-hooks / react-refresh 系）** で、今回のバナー削除とは無関係。
> **このタスクで lint エラーを直そうとしないこと。** 別タスクとして切り出す。

---

## 2. Step 1: 未追跡ファイルの整理

### 2-1. `.claude/` を `.gitignore` に追加

`.gitignore` の「# エディタ」セクションに1行追加する。

```diff
 # エディタ
 .vscode/*
 !.vscode/extensions.json
 .idea
+.claude/
 .DS_Store
```

### 2-2. 指示書ドキュメントをコミット

`docs/cursor-remove-anchorless-banners.md` は作業記録として **リポジトリに残す**。

```bash
git add .gitignore docs/cursor-remove-anchorless-banners.md
git commit -m "docs(banner): バナー削除作業の指示書を追加、.claude/ を gitignore に追加"
```

### 2-3. 確認

```bash
git status -s        # → 空（何も表示されない）であること
git log --oneline -2 # → docs コミット と a487f07 が並ぶ
```

---

## 3. Step 2: プッシュ

```bash
git push origin main
```

- 認証エラーが出た場合は、`gh auth status` またはクレデンシャルヘルパーを確認する。
- push できたら GitHub 上で `a487f07` が反映されていることを確認。

> ⚠️ `.github/workflows/` は空なので CI は走らない。**push 自体はデプロイを起こさない。**

---

## 4. Step 3: デプロイ前の目視確認（必須）

```bash
npm run dev
```

ブラウザでホーム画面のバナーカルーセルを確認:

- [ ] ドットインジケーターが **12個**
- [ ] 1枚目 = FKT Mall、2枚目 = 伊賀エリア3店舗 求人（固定）
- [ ] 一周スワイプして、削除した7枚（セカイVPN / ABEMA / スマホプリペイド / 格安SIM / コミュファ光 / 楽天市場 / お名前.com）が **一度も出ない**
- [ ] 画像が欠けている（グレー背景）スライドが無い
- [ ] 言語切替 日本語 / English / Tiếng Việt で、`banner.xxx.title` のような **キーの生表示が出ない**
- [ ] DevTools Console / Network に **404 が出ていない**

**ここで異常があればデプロイせず中止して報告すること。**

---

## 5. Step 4: 本番デプロイ

```bash
npm run deploy
```

このコマンドが実行する内容（`package.json`）:

```
npm run version:bump    # version.json 1.0.251 → 1.0.252
  && npm run build      # tsc -b && vite build
  && firebase deploy --project conv-fkt7-new-app
```

`firebase deploy`（ターゲット指定なし）は **以下すべてをデプロイする**:

| 対象 | 内容 |
|---|---|
| hosting:pwa | `dist/` → `conv-fkt7-new-app` |
| hosting:job | `job-site/` → `conv-fkt7-new-app-job` |
| functions | `functions/`（predeploy で `npm run build` が走る） |
| firestore | `firestore.rules` + `firestore.indexes.json` |
| storage | `storage.rules` |

> ⚠️ **作業ツリーがクリーンであることが前提**（Step 2-3 で確認済み）。
> ルールやインデックスにローカルの未コミット変更があると、それも一緒に本番へ出てしまう。

### デプロイ結果の確認

```bash
cat version.json     # → { "version": "1.0.252" }
```

- Firebase CLI の出力に `Deploy complete!` と Hosting URL が出ることを確認
- 本番 URL を開き、**Step 4 と同じ目視チェックをもう一度実施**
  （PWA なので Service Worker のキャッシュが残る場合あり。**スーパーリロード or シークレットウィンドウ**で確認する）
- アプリ内のバージョン表示（`VersionBadge`）が **1.0.252** になっていること

---

## 6. Step 5: バージョン採番コミット → プッシュ

`npm run deploy` が `version.json` を書き換えるので、リポジトリの慣例どおりコミットする。

```bash
git add version.json
git commit -m "chore: デプロイに伴うバージョン 1.0.252"
git push origin main
```

> 既存履歴の慣例に合わせること（例: `9033086 chore: デプロイに伴うバージョン 1.0.251`）。
> バージョン番号は `cat version.json` の **実際の値** を使う。1.0.252 と決め打ちしない。

---

## 7. 最終確認

```bash
git status -s              # → 空
git log --oneline -4       # → version bump / docs / a487f07 が並ぶ
git status -sb | head -1   # → ## main...origin/main（ahead / behind なし）
```

- [ ] GitHub の `main` に3コミットとも反映されている
- [ ] 本番 PWA でバナーが12枚、削除7枚が出ない
- [ ] 求人サイト（`conv-fkt7-new-app-job`）が壊れていない
- [ ] 管理画面ログイン・チャット・クーポンなど主要機能が動く（デプロイ範囲が広いため軽く回帰確認）

---

## 8. やってはいけないこと

- **Step 4 の目視確認を飛ばしてデプロイする**
- `npm run lint` のエラーをこのタスクで修正する（**既存の別問題。無関係**）
- `version.json` を手で編集する（`npm run deploy` が自動採番する）
- `firebase deploy --only hosting` などに勝手に絞る／逆に別プロジェクトへ向ける
- `.env` をコミットする（`.gitignore` 済み。**絶対にコミットしない**）
- `git push --force` を使う
- 目視確認で異常が出たのに「たぶん大丈夫」で進める

---

## 9. 完了報告に含めてほしいこと

- push した3コミットのハッシュ
- デプロイ後の実バージョン番号
- 本番での目視確認結果（ドット数・削除7枚が出ないこと・404の有無）
- 想定外の警告やエラーがあればその全文
