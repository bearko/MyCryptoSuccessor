/**
 * 段 UIX3k：経営企画の画面（スキルツリー・企業ランキング・設備投資・決算書・税・職場・予算）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：スキルツリー」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxk.x) return uxk.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、k-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Ctx } from '../../p1/screens';

export interface UxkScreens {
  /** スキルツリー（lift：選んだパネルを、くわしい板の上へ持ち上げて開く。市場データ・助言から） */
  tree?: (ctx: Ctx, o: { lift: boolean }) => void;
  /** 企業ランキング（tab：はじめに開くタブ） */
  ranking?: (ctx: Ctx, tab: 'area' | 'land' | 'world') => void;
  /** 設備投資（建物ごとの設備を買う） */
  invest?: (ctx: Ctx) => void;
  /** 決算書（四半期の P/L・B/S） */
  books?: (ctx: Ctx) => void;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxkSlots as uxk } from '../hooks';
