/**
 * 段 UIX2s：新しい画面（工房の札・月次報告）の差し込み口（docs/ISLAND_UIX.md「画面：工房」「画面：月次報告」）。
 * 切のときは何も入っていない（呼ぶ側は `if (uxs.x) return uxs.x(...)` と書く：今の画面がそのまま開く）。
 * 入のときだけ、s-boot.ts（動的に読む）が中身を入れる。型だけを読むので、このファイルは切のときも数行ぶんしか増えない。
 */
import type { Sku } from '../../p1/data';
import type { DigSummary } from '../../p1/digmeet';
import type { Report } from '../../p1/model';
import type { DigSummaryHooks, ReportHooks } from '../../p1/report';
import type { Ctx } from '../../p1/screens';

/** 工房の画面の開き方（p1/screens.ts の openWorkshop と同じ） */
export interface WsOpt {
  invest?: boolean;
  make?: Sku;
  from?: string;
}
export interface UxScreens {
  /** 工房の札 */
  workshop?: (ctx: Ctx, o: WsOpt) => void;
  /** 月次報告（again：発表を済ませた報告の開き直し） */
  report?: (ctx: Ctx, r: Report, hooks: ReportHooks, then: (() => void) | undefined, again: boolean) => void;
  /** 発掘作業のまとめ報告 */
  digSummary?: (ctx: Ctx, sum: DigSummary, hooks: DigSummaryHooks, then?: () => void) => void;
}
export const uxs: UxScreens = {};
