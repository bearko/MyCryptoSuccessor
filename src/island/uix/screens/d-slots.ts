/**
 * 段 UIX3d：決める場面（提案のカード・提案書・経営会議・方針・部長との対話・任せる）の新しい画面の差し込み口（docs/ISLAND_UIX.md「画面：提案のカード」ほか）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxd.x) return uxd.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、d-boot.ts（s-boot.ts から呼ぶ。動的に読む）が中身を入れる。型だけを読むので、切のときも数行ぶんしか増えない。
 */
import type { Ctx } from '../../p1/screens';
import type { P1State } from '../../p1/model';
import type { Card, ChooseRes } from '../../p1/card';

export interface UxdScreens {
  /** 提案・報告のカードの中身（器は今の窓 .isl-modal.isl-cardm。close・quiet は今の画面と同じ閉じ方） */
  cardPanel?: (ctx: Ctx, c: Card, o: { close: (res: ChooseRes | null, label: string) => void; quiet: () => void }) => HTMLElement;
  /** 受け箱の上の「ヒーローからの提案・報告」と「任せている提案」 */
  inbox?: (ctx: Ctx) => HTMLElement;
  /** 今月取り下げた提案（無ければ null） */
  gone?: (s: P1State) => HTMLElement | null;
  /** 会社の課題（優先の順） */
  issues?: (s: P1State) => HTMLElement;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxdSlots as uxd } from '../hooks';
