# 【Cursor 作業指示書】アンカーなしバナー7枚と未使用アセットの完全削除

対象リポジトリ: `CONV-FKT7-NEW-APP`（VIP Store PWA）
作成日: 2026-08-25

---

## 0. 背景・目的

`AffiliateBannerCarousel` のバナーのうち、リンク先が **アンカー（`#...`）なしのページトップ** に飛ぶだけの7枚がある。
タップしても該当商材の位置までスクロールされず、導線として機能していないため **アプリから完全に削除** する。
あわせて、コードから参照されていない **未使用の画像3点と i18n キー2件** も削除する。

**方針: コメントアウトではなく完全削除。**（復活が必要になったら git 履歴から戻す）

---

## 1. 削除対象

### 1-A. バナー7枚（アンカーなし）

| id | 表示名 | 現在のリンク先 | 画像 |
|---|---|---|---|
| `vpn` | セカイVPN | `https://fkt-office.com/life-support.html` | `public/banners/vpn-bg.webp` |
| `abema` | ABEMAプレミアム | `https://fkt-office.com/life-support.html` | `public/banners/abema-bg.webp` |
| `prepaid` | スマホプリペイド | `https://fkt-office.com/life-support.html` | `public/banners/prepaid-bg.webp` |
| `sim` | 格安SIM（エキサイト） | `https://fkt-office.com/life-support.html` | `public/banners/sim-bg.webp` |
| `commufa` | コミュファ光 | `https://fkt-office.com/service-guide.html` | `public/banners/commufa-bg.webp` |
| `rakuten` | 楽天市場 | `https://fkt-office.com/service-guide.html` | `public/banners/rakuten-bg.webp` |
| `onamae` | お名前.com | `https://fkt-office.com/service-guide.html` | `public/banners/onamae-bg.webp` |

### 1-B. 未使用アセット3点（コードから参照なし）

| ファイル | 備考 |
|---|---|
| `public/banners/kojo-kyujin-navi.webp` | 「工場求人ナビ」。i18n キー `banner.kojoKyujinNavi` だけ残っている孤児 |
| `public/banners/shop-job-github-pages.svg` | i18n キー `banner.shopJobGithubPages` だけ残っている孤児 |
| `public/banners/vpn-banner.webp` | `vpn-bg.webp` と同一サイズ（45,204 bytes）の重複ファイル |

---

## 2. 作業手順

### Step 1: `src/components/AffiliateBannerCarousel.tsx`

`CORE_BANNER_SLIDES` 配列から、以下7つのオブジェクトブロックを **配列要素ごと削除** する。

削除する `id`:
```
'vpn', 'abema', 'prepaid', 'sim', 'commufa', 'rakuten', 'onamae'
```

- 各要素は `{ id: ..., bgImage: ..., bgPosition: ..., i18nKey: ..., badgeColor: ..., href: ..., labelJa: ... }` の7行構成。前後のカンマを残さないよう注意。
- 10行目付近の JSDoc コメント `/** i18n キープレフィックス（例: banner.vpn） */` は、例として `banner.vpn` を参照している。**`（例: banner.agoda）` に書き換える**（削除済みキーを例示したままにしない）。
- `CORE_BANNER_SLIDES` の要素数は **17 → 10** になる。
- `FKT_MALL_SLIDE`、および `useMemo` 内で動的生成している `fukita-recruit` スライドは **変更しない**。
- カルーセルのロジック（`shuffleBannerSlides` / `goTo` / スワイプ処理 / ドットインジケーター）は **一切変更しない**。ドットの数は `slides.length` 由来なので自動的に 19 → 12 になる。

### Step 2: i18n（3言語）

以下3ファイルすべてから、`banner` オブジェクト直下の **9キー** を削除する。

対象ファイル:
- `src/locales/ja/common.json`
- `src/locales/en/common.json`
- `src/locales/vi/common.json`

削除するキー（各キーは `badge` / `title` / `subtitle` / `cta` を持つオブジェクト）:
```
vpn
abema
prepaid
sim
commufa
rakuten
onamae
shopJobGithubPages   ← 1-B の孤児キー
kojoKyujinNavi       ← 1-B の孤児キー
```

- 3ファイルとも `banner` 直下のキー数は **21 → 12** になる。
- JSON の構文（末尾カンマ）を壊さないこと。削除後に `python3 -m json.tool` などでパース確認する。
- 残す12キーは Step 4 のチェックリスト参照。

### Step 3: 画像ファイルの削除（計10ファイル）

```
public/banners/vpn-bg.webp
public/banners/abema-bg.webp
public/banners/prepaid-bg.webp
public/banners/sim-bg.webp
public/banners/commufa-bg.webp
public/banners/rakuten-bg.webp
public/banners/onamae-bg.webp
public/banners/kojo-kyujin-navi.webp
public/banners/shop-job-github-pages.svg
public/banners/vpn-banner.webp
```

`public/banners/` は削除後 **12ファイル** になる。

> ⚠️ `dist/` `dev-dist/` 配下にも同名のビルド生成物が存在する場合があるが、**手で消さない**。次回 `npm run build` で再生成される。

---

## 3. 削除後に残るバナー（12枚）

この12枚が最終形。**これ以外が残っていたら間違い。**

### 固定枠（表示順を固定・シャッフル対象外）

| 順 | id | 表示名 | リンク先 |
|---|---|---|---|
| 1 | `fkt-mall` | FKT Mall（会員登録） | `https://fkt-mall.web.app/lp/member.html` |
| 2 | `fukita-recruit` | 伊賀エリア3店舗 求人 | `getJobRecruitmentSiteUrl()`（既定 `https://conv-fkt7-new-app-job.web.app/`） |

### ランダム枠 `CORE_BANNER_SLIDES`（10枚・毎回シャッフル）

| id | 表示名 | リンク先 |
|---|---|---|
| `local-ad-recruit` | 地元広告（募集） | `https://fkt-office.com/advertise.html` |
| `ka-nabell` | カーナベル（KA-NABELL） | `https://fkt-office.com/service-guide.html#ka-nabell` |
| `biglobe-wimax` | BIGLOBE WiMAX +5G（日本向け） | `https://fkt-office.com/service-guide.html#biglobe-wimax` |
| `biglobe-wimax-vn` | BIGLOBE WiMAX（外国人向け） | `https://fkt-office.com/life-support.html#biglobe-wimax` |
| `goen-mobile` | ごえんモバイル | `https://fkt-office.com/life-support.html#goen-mobile` |
| `furnished-share-house` | 家具家電付きシェアハウス | `https://fkt-office.com/life-support.html#furnished-share-house` |
| `dtisim` | DTI SIM | `https://fkt-office.com/life-support.html#dtisim` |
| `daiwan-telecom` | ダイワンテレコム | `https://fkt-office.com/life-support.html#daiwan-telecom` |
| `agoda` | agoda（ホテル予約） | `https://fkt-office.com/life-support.html#agoda` |
| `nexus-card` | Nexus Card | `https://fkt-office.com/life-support.html#nexus-card` |

> 補足: `local-ad-recruit` はアンカーなしだが、リンク先が `advertise.html`（広告募集の専用ページ）で単独ページとして完結しているため **削除対象外**。

### 残る i18n キー（`banner` 直下・3言語共通で12キー）

```
localAdRecruit, fukitaRecruit, furnishedShareHouse, dtisim, goenMobile,
biglobeWimax, biglobeWimaxVn, daiwanTelecom, kaNabell, agoda,
nexusCard, fktMall
```

### 残る画像（`public/banners/` に12ファイル）

```
fkt-mall.jpg              fukita-recruit.jpg
local-ad-recruit.webp     ka-nabell.webp
biglobe-wimax-jp.webp     biglobe-wimax-vn.webp
goen-mobile.webp          furnished-share-house.webp
dtisim.webp               daiwan-telecom.webp
agoda.webp                nexus-card.webp
```

---

## 4. 検証（必ず実行）

```bash
# 1) 削除対象IDがコードから消えているか（ヒット0件が正解）
grep -rnE "'(vpn|abema|prepaid|sim|commufa|rakuten|onamae)'" src/components/AffiliateBannerCarousel.tsx

# 2) 削除した i18n キーの残骸がないか（ヒット0件が正解）
grep -rnE '"(vpn|abema|prepaid|sim|commufa|rakuten|onamae|shopJobGithubPages|kojoKyujinNavi)"' src/locales/

# 3) 削除した画像への参照が残っていないか（ヒット0件が正解）
grep -rnE "(vpn-bg|vpn-banner|abema-bg|prepaid-bg|sim-bg|commufa-bg|rakuten-bg|onamae-bg|kojo-kyujin-navi|shop-job-github-pages)" src/ public/ index.html

# 4) 画像が12ファイルか
ls public/banners | wc -l    # → 12

# 5) JSON が壊れていないか（3言語すべて。エラーなしが正解）
for l in ja en vi; do python3 -m json.tool "src/locales/$l/common.json" > /dev/null && echo "$l OK"; done

# 6) banner キーが3言語とも12個か
for l in ja en vi; do python3 -c "import json;print('$l', len(json.load(open('src/locales/$l/common.json'))['banner']))"; done

# 7) 型チェック・Lint・ビルド
npm run lint
npm run build
```

### 目視確認

`npm run dev` で起動し、ホーム画面のバナーカルーセルで:

- [ ] ドットインジケーターが **12個** になっている
- [ ] 1枚目が FKT Mall、2枚目が 伊賀エリア3店舗 求人（固定）
- [ ] 3枚目以降をスワイプで一周し、削除した7枚が **一度も出てこない**
- [ ] 画像が欠け（グレー背景・alt表示）になっているスライドがない
- [ ] 言語切替（日本語 / English / Tiếng Việt）で全12枚のテキストが正しく表示され、`banner.xxx.title` のような **キーの生表示が出ない**
- [ ] ブラウザの DevTools Console / Network に **404（画像取得失敗）が出ていない**

---

## 5. コミット

このリポジトリのコミットメッセージ規約（`fix(admin): ...` 形式）に合わせる。

```
chore(banner): アンカーなしバナー7枚と未使用アセットを削除

- リンク先がページトップにしか飛ばない7枚（セカイVPN/ABEMA/スマホプリペイド/
  格安SIM/コミュファ光/楽天市場/お名前.com）を導線不全のため削除
- 未使用画像3点（kojo-kyujin-navi.webp / shop-job-github-pages.svg /
  vpn-banner.webp）と孤児 i18n キー2件を削除
- バナー 19枚 → 12枚、i18n banner キー 21 → 12（ja/en/vi）
```

> デプロイは `npm run deploy`（バージョン自動採番 → build → firebase deploy）。
> **このタスクでは deploy まで実行せず、コミットまでで止めて報告すること。**

---

## 6. やってはいけないこと

- コメントアウトで残す（**完全削除が要件**）
- `local-ad-recruit` を「アンカーなしだから」と削除する（**対象外**）
- `FKT_MALL_SLIDE` / `fukita-recruit` の固定表示ロジックを変更する
- カルーセルのアニメーション・スワイプ・自動再生の秒数などを「ついでに」調整する
- `dist/` `dev-dist/` 内のファイルを手動で削除・編集する
- 残す10枚のリンク先 URL を書き換える
