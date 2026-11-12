/**
 * 段 UIX3k：経営企画の新しい画面（スキルツリー・企業ランキング・設備投資・決算書 ほか）を、差し込み口へ入れる（s-boot.ts の install から呼ぶ）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxkDeps } from '../../p1/uxk';
import { setK } from './k-deps';
import { uxk } from './k-slots';
import { openBooksUx } from './books';
import { openInvestUx } from './invest';
import { openRankingUx } from './ranking';
import { openSkillsUx } from './tree';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function installK(d: UxkDeps) {
  setK(d);
  uxk.tree = openSkillsUx;
  uxk.ranking = openRankingUx;
  uxk.invest = openInvestUx;
  uxk.books = openBooksUx;
}
