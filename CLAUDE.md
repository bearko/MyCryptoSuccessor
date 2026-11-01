# プロジェクトのメモ（Claude 用）

- アイランド（`src/island/`）で、PixelLab で作るべき絵を仮の絵（コードで描いたもの・ほかの絵の流用）で入れたときや、絵の無いものを足したときは、必ず `docs/ISLAND_ART_TODO.md` に追記する（何を・どこで使っていて・いまの状態・PixelLab への指示）。機能が落ち着いたらまとめて生成する。
- このリポジトリは独立したゲーム「My Crypto Successor」（もとは My Crypto Workshop の試作モード「アイランド」）。サイトを開くと `index.html` → `src/island/main.ts` でアイランドが始まる。公開は https://successor.bearko.games（Cloudflare Workers の静的配信）。本番のブランチは `main`。
- ゲームの全体像は `docs/SUCCESSOR_VISION.md`、ロードマップと各機能の設計は `docs/SUCCESSOR_ROADMAP.md`。新しい機能はこの方向に沿って作る。
- チェック：`npx tsc --noEmit`・`npm test`・`npm run i18n:check`・`npm run build`・`npm run pixel:lint`・`npm run island:audit`（反映されない投資が 0）・`npm run island:sim`（数分かかる。`docs/ISLAND_BALANCE.md` を書き直す）。
