/**
 * 段 UIX2s：新しい画面（工房の札・月次報告）を、差し込み口へ入れる（入のときだけ p1/uxs.ts が動的に読む）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxsDeps } from '../../p1/uxs';
import { openDigSummaryUx, openMonthReportUx } from './report';
import { setDeps } from './s-deps';
import { uxs } from './s-slots';
import { openWorkshopUx } from './workshop';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function install(d: UxsDeps) {
  setDeps(d);
  uxs.workshop = openWorkshopUx;
  uxs.report = openMonthReportUx;
  uxs.digSummary = openDigSummaryUx;
}
