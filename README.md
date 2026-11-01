# My Crypto Successor

My Crypto Heroes の世界のランド「はじまりの国 Lime」で、工房と店を営み、荒れ地を発掘して町を復興させる経営シミュレーションです。
ブラウザで遊べて、進み具合はこのブラウザに自動で保存されます。

**プレイ:** https://successor.bearko.games

## ゲームの概要

最初の目標（フェーズ 1「新天地で実績を上げろ」）は、同じランドセクタで物販をしている同業他社 4 社を月の売上で抜いてエリア 1 位になり、2 か月続けて守る（制覇）ことです。

- **工房と店**：素材を調達 → 工房でヒーローの職人がクラフト → 工房の倉庫からお店へ運搬 → 棚に陳列 → お客さんが購入、というサプライチェーンを一通り回します。商品は MCH のエクステンション 17 シリーズ。建物は道路に面した空き地に、入口を道路へ向けて建てます
- **従業員**：MCH のヒーローを雇い、HP・PHY・INT・AGI の適性を見てクラフト・運搬・販売に配置します
- **スキルツリー**：本社から 9 本の枝（調達・技・製造・物流・発掘・システム・販売・経営・人材）がのびる研究パネル。効き目はすべて数字で、詰まっている所に合わせて選びます。内側が Common、外周が Uncommon から上のパネルです
- **発掘**：国から発掘許可をもらって荒れ地を掘ると、栄えていた頃の Lime の遺物（エクステンション）が出ます。研究ポイント・研究ノート・復刻品（新商品）・研究成果の発表、掘りきった荒れ地の復興とダンジョン、遺物の展示館
- **ランドセクタへの進出**：関所を開けてとなりのセクタへ。Common の 2 つの町で発表すると Uncommon の調査依頼状がもらえ、Common → Uncommon とランクが上がります
- **災害と復興**：ランクアップのときの災害で町が被災します。手で直すか、ヒーローに任せて復興させます
- マインちゃんの会話つきチュートリアル、日本語 / English、オフラインで遊べる PWA（ホーム画面に追加）

ゲームの仕様は [docs/ISLAND_PHASE1.md](docs/ISLAND_PHASE1.md)、変更履歴は [CHANGELOG.md](CHANGELOG.md) にあります。

## 開発

素材は [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) を Git サブモジュールとして参照しています。

```bash
git clone https://github.com/bearko/MyCryptoSuccessor.git
cd MyCryptoSuccessor
git submodule update --init
npm ci
npm run dev      # http://localhost:5173
```

素材 DB を別の場所に置いている場合は `MCH_ASSETS_DIR=/path/to/mycryptoheroes npm run dev` で指定できます。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | 開発サーバー（起動前に素材を同期） |
| `npm run build` | 型チェック＋本番ビルド（`dist/`） |
| `npm run preview` | ビルドした `dist/` を手元で開く |
| `npm test` | テスト（Vitest） |
| `npm run typecheck` | 型チェックだけ |
| `npm run i18n:check` | 英訳のない日本語の文字列を検出（画面の文字は `t(ja, en)`） |
| `npm run island:audit` | 投資の効き目の監査（`docs/ISLAND_AUDIT.md` を書き直す） |
| `npm run island:sim` | 自動プレイで進み方を計測（`docs/ISLAND_BALANCE.md` を書き直す。数分かかる） |
| `npm run pixel:lint` | スクリプトで描くドット絵の自動検査（`docs/pixel-rules.md`） |
| `npm run sync-assets` | 素材の同期だけを実行 |

URL に `?test=2` を付けて開くと、メニューの「システム → テスト」（資金の追加・1 か月進めるなど）が出ます。

### 素材の取り込み

`scripts/sync-assets.mjs` が素材 DB から、ゲームで使うものだけを書き出します（いずれも Git 管理外）。

- `src/generated/catalog.json` — エクステンションの全シリーズとヒーローのカタログ（日本語名と英語名）、BGM
- `public/mch-atlas/*.png` — 64px のドット絵（エクステンション・ヒーロー）をまとめたスプライトシート。`#ext-0/37` のようにシート名とセル番号で参照します
- `public/mch/**` — それ以外の画像・音声（マインちゃんの立ち絵、工房の背景、アイコン、ランドセクタの絵、BGM/SE）
- `public/icons/icon-{192,512}.png` — ホーム画面用のアイコン（GUM コインを拡大）

アイランドの建物・地面・演出の絵は `public/island/`（PixelLab で生成したもの・`scripts/island/` のスクリプトで描いたもの）にあります。
まだ仮の絵のものは [docs/ISLAND_ART_TODO.md](docs/ISLAND_ART_TODO.md) にまとめています。

### ディレクトリ構成

```
src/
  island/      ゲーム本体（main.ts が入口。p1/ がフェーズ 1、free.ts は自由建築の試作）
  game/        カタログの型付け（catalog.ts・content.json）と数の書式（format.ts）
  render/      カタログの絵の読み込み（images.ts）
  ui/          DOM の小さな共通部品（dom.ts）
  i18n.ts      言語（日本語 / English）と t(ja, en)
  audio.ts     BGM
scripts/       素材の同期・PWA の Service Worker の雛形・各チェック・アイランドの絵と音を作るスクリプト
tests/         Vitest
docs/          ゲームの仕様と設計メモ
```

### 公開（Cloudflare Workers）

本番は **https://successor.bearko.games** で、Cloudflare Workers の静的アセットとして配信します（`wrangler.jsonc`）。

- 本番のブランチは `main`。Workers Builds が `npm run build` で `dist/` を作り、`npx wrangler deploy` で公開します。ほかのブランチはプレビューとしてビルドされます
- キャッシュの指定は `public/_headers`。`dist/sw.js`（Service Worker）がオフライン用のキャッシュを担当します
- リンクを投稿したときのサムネイル（OGP・X のカード）は `public/og-image.jpg`（1200×630）。画像の URL は Workers Builds では `https://successor.bearko.games/` が入ります。ほかのドメインで配信するときは、環境変数 `SITE_URL=https://<ドメイン>` を設定してビルドしてください
- PR では GitHub Actions（`.github/workflows/ci.yml`）が `npm test`・`npm run pixel:lint`・`npm run typecheck`・`npm run i18n:check`・`npm run build` を回します

## 素材とクレジット

- ヒーロー、エクステンション、背景、アイコン、ランドセクタの絵、BGM/SE: My Crypto Heroes（© MCH Co.,Ltd.）。
  [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) に整理されたものを使用しています。
- マインちゃん ドット絵：こじもこ。

ソースコードと文書は [MIT License](LICENSE) です。マイクリの素材（画像・音声）とマインちゃんのドット絵は対象外です。

本作は非公式の二次創作です。マイクリ画像の利用は [MCH デザインガイドライン](https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc) に従い、
非営利の範囲に限ります。営利目的での利用（有償販売など）は事前に MCH Co.,Ltd. への連絡が必要です。
