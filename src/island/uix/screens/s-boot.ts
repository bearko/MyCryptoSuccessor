/**
 * 段 UIX2s：新しい画面（工房の札・月次報告）を、差し込み口へ入れる（入のときだけ p1/screens.ts が動的に読む）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import { uxs } from './s-slots';
import { openWorkshopUx } from './workshop';

uxs.workshop = openWorkshopUx;
