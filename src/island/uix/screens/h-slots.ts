/**
 * 段 UIX3h：人と管理の画面（職人・採用・ヒーロー・育成・人事と給与・法務・トロフィー・図鑑 ほか）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：職人と採用」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxh.x) return uxh.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、h-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Ctx } from '../../p1/screens';

export interface UxhScreens {
  /** ヒーローの配置（職人・運搬係・店員の持ち場と、待機中の名簿） */
  staff?: (ctx: Ctx) => void;
  /** 人材登用（charisma: false＝まとめた画面の前の部分。カリスマの札は出さない） */
  hire?: (ctx: Ctx, o: { charisma?: boolean }) => void;
  /** 経営者（カリスマ度のくわしい札） */
  charisma?: (ctx: Ctx) => void;
  /** 給与・労務 */
  payroll?: (ctx: Ctx) => void;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxhSlots as uxh } from '../hooks';
