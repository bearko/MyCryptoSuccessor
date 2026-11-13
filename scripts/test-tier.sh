#!/usr/bin/env bash
# テストを「軽い」「重い」に分けて回す（重いテストの一覧は tests/heavy.txt）。
#   scripts/test-tier.sh light <i>/<n>          軽いテストを n 台に分けた i 台目
#   scripts/test-tier.sh heavy <i>/<n> [基点]    重いテストを n 台に分けた i 台目。
#                                               基点（コミット）を渡すと、そこから変わったファイルに関係するものだけ
set -euo pipefail
mode="$1"; shard="$2"; base="${3:-}"
mapfile -t HEAVY < <(grep -v '^\s*#' tests/heavy.txt | sed '/^\s*$/d')
case "$mode" in
  light)
    args=()
    for f in "${HEAVY[@]}"; do args+=(--exclude "$f"); done
    npx vitest run --shard="$shard" "${args[@]}"
    ;;
  heavy)
    if [ -n "$base" ]; then
      echo "基点 $base から変わったファイルに関係する重いテストだけ回す"
      npx vitest run --shard="$shard" --changed "$base" --passWithNoTests "${HEAVY[@]}"
    else
      npx vitest run --shard="$shard" --passWithNoTests "${HEAVY[@]}"
    fi
    ;;
  *) echo "mode は light か heavy"; exit 2 ;;
esac
