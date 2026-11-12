/**
 * 段 UIX3b：事業の新しい画面（調達・お店の札・サプライチェーン・BOM・販売管理・在庫・商圏と関税・問い合わせ・宣伝・市場調査）の差し込み口
 * （docs/ISLAND_UIX.md「画面：調達」ほか）。切のときは何も入っていない（呼ぶ側は `if (uxb.x) return uxb.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、b-boot.ts（s-boot.ts の install から呼ぶ）が中身を入れる。型だけを読むので、切のときも増えるのは数行ぶん。
 */
import type { CsHooks } from '../../p1/csui';
import type { Ctx } from '../../p1/screens';

export interface UxbScreens {
  /** 調達 */
  buy?: (ctx: Ctx) => void;
  /** お店の札 */
  shop?: (ctx: Ctx, uid: number) => void;
  /** サプライチェーン（breakdown：④ 販売の内訳を開いた状態で） */
  supply?: (ctx: Ctx, opt: { breakdown?: boolean }) => void;
  /** 素材 → 商品（BOM）・販売管理・宣伝広報 */
  bom?: (ctx: Ctx) => void;
  sales?: (ctx: Ctx) => void;
  ads?: (ctx: Ctx) => void;
  /** 市場調査（市場データ） */
  data?: (ctx: Ctx) => void;
  /** 問い合わせ・顧客満足度・市場の見通し・広報と企業の格 */
  inbox?: (ctx: Ctx, hooks: CsHooks) => void;
  sat?: (ctx: Ctx, hooks: CsHooks) => void;
  forecast?: (ctx: Ctx, hooks: { skills?: () => void; ads?: () => void }) => void;
  pr?: (ctx: Ctx, hooks: CsHooks) => void;
}
// 入れ物は uix/hooks.ts に置く（理由はそこに）。ここは型と、同じ物の名前だけ
export { uxbSlots as uxb } from '../hooks';
