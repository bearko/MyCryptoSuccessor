# プロジェクトのメモ（Claude 用）

- **ユーザーへの返答・報告・質問は、必ず日本語で書く**（途中の報告・最終の報告・まとめ・選択式の質問を含む。英語で書かない）。サブエージェントへの指示に「報告は日本語で」と書き、受け取った報告もユーザーには日本語で伝える。
- アイランド（`src/island/`）で、PixelLab で作るべき絵を仮の絵（コードで描いたもの・ほかの絵の流用）で入れたときや、絵の無いものを足したときは、必ず `docs/ISLAND_ART_TODO.md` に追記する（何を・どこで使っていて・いまの状態・PixelLab への指示）。機能が落ち着いたらまとめて生成する。
- このリポジトリは独立したゲーム「My Crypto Successor」（もとは My Crypto Workshop の試作モード「アイランド」）。サイトを開くと `index.html` → `src/island/main.ts` でアイランドが始まる。公開は https://successor.bearko.games（Cloudflare Workers の静的配信）。本番のブランチは `main`。
- ゲームの全体像は `docs/SUCCESSOR_VISION.md`、ロードマップと各機能の設計は `docs/SUCCESSOR_ROADMAP.md`。新しい機能はこの方向に沿って作る。
- チェック：`npx tsc --noEmit`・`npm test`・`npm run i18n:check`・`npm run build`・`npm run pixel:lint`・`npm run island:audit`（反映されない投資が 0）・`npm run island:sim`（1 台だと 1 時間ほど。`docs/ISLAND_BALANCE.md` を書き直す）。
- 全部のテストは CI（GitHub Actions の `CI`。テストを 4 台に分けて同時に回す。public なので無料）に任せる。手元（作業環境は CPU 2 つ）では、触ったファイルに関係するテストだけ回す：`npx vitest run --changed origin/main` または `npx vitest related <ファイル>`。型・英訳・絵・ビルドの確認は軽いので手元で回してよい。
- main は `ci-ok`（CI のまとめ）と Denylist の `check` が通らないとマージできない設定になっている。PR の確認は `scripts/pr-wait.sh <番号>` の 1 回で待つ（全部終わるまで待って結果を 1 行ずつ出す。何度も見に行かない）。落ちたら `gh run view <run id> --log-failed` で失敗した所のログだけを読む。クラウドの作業環境では GitHub の GraphQL が使えないので、`gh pr checks`・`gh pr merge --auto` ではなく REST（`gh api`）を使う。
- 計測は GitHub Actions の `Sim`（`.github/workflows/sim.yml`）で 16 台に分けて回せる：ブランチを `git push origin HEAD:sim-run/<名前>` で push → 10〜15 分で `sim-out/<名前>` に `docs/ISLAND_BALANCE.md` を書き直したコミットが届く（`git fetch origin sim-out/<名前> && git show FETCH_HEAD:docs/ISLAND_BALANCE.md > docs/ISLAND_BALANCE.md`）。手元で重い計測を並べて回さない（CPU は 2 つ）。
