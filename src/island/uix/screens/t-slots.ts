/**
 * 段 UIX5t：部長との対話の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：部長との対話」）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxt.headTalk) return uxt.headTalk(...)` と書く：今の画面がそのまま描かれる）。
 * 入のときだけ、t-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { HtCall } from '../../p1/headtalkui';

export interface UxtScreens {
  /** 部長との対話（器は今の札 open() のまま。描くたびに呼ぶ：中身と押した先は c で渡す） */
  headTalk?: (body: HTMLElement, c: HtCall) => void;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxtSlots as uxt } from '../hooks';
