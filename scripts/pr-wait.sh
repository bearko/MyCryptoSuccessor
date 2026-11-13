#!/usr/bin/env bash
# PR の確認（CI・Denylist・Workers Builds）が全部終わるまで待ち、結果を 1 行ずつ出す。
# 使い方：scripts/pr-wait.sh <PR 番号> [最長の秒数=1200]
# 終わったときの終了コード：全部が通れば 0、落ちたものがあれば 1、時間切れは 2。
# （この作業環境では GitHub の GraphQL が使えないので、gh pr checks の代わりに REST で見る）
set -u
PR="$1"; LIMIT="${2:-1200}"
REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo bearko/MyCryptoSuccessor)"
SHA="$(gh api "repos/$REPO/pulls/$PR" --jq .head.sha)"
start=$(date +%s)
sleep 10
while :; do
  runs="$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" --jq '.check_runs[] | [.name, .status, (.conclusion // "-")] | @tsv')"
  pending="$(printf '%s\n' "$runs" | awk -F'\t' '$2!="completed"' | wc -l)"
  if [ -n "$runs" ] && [ "$pending" -eq 0 ]; then break; fi
  if [ $(( $(date +%s) - start )) -ge "$LIMIT" ]; then echo "時間切れ（まだ終わっていない：$pending 件）"; printf '%s\n' "$runs"; exit 2; fi
  sleep 20
done
printf '%s\n' "$runs" | awk -F'\t' '{print $3 "\t" $1}'
printf '%s\n' "$runs" | awk -F'\t' '$3!="success" && $3!="skipped" && $3!="neutral"{bad=1} END{exit bad}'
