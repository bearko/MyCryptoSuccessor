/**
 * 段 UIX2s：新しい画面（工房の札・月次報告）を、差し込み口へ入れる（入のときだけ p1/uxs.ts が動的に読む）。
 * 切のときは、このファイルも、ここから読む画面と CSS も読まない。
 */
import type { UxsDeps } from '../../p1/uxs';
import { installB } from './b-boot';
import { installC } from './c-boot';
import { installD } from './d-boot';
import { installK } from './k-boot';
import { installH } from './h-boot';
import { installR } from './r-boot';
import { installT } from './t-boot';
import { openDigSummaryUx, openMonthReportUx } from './report';
import { setDeps } from './s-deps';
import { uxs, uxsBoot } from './s-slots';
import { installW } from './w-boot';
// 段 UIX4a：段の絵の表を全部登録しておく（土台の部品の ico が、どの段の絵の名前でも描けるように。どれも上の束がもう読んでいるので、束の分かれ方は変わらない）
import './micons';
import './s-icons';
import './w-icons';
import './b-icons';
import './k-icons';
import './h-icons';
import { openWorkshopUx } from './workshop';

/** 本体の関数の束を受け取って、差し込み口へ入れる */
export function install(d: UxsDeps) {
  setDeps(d);
  uxs.workshop = openWorkshopUx;
  uxs.report = openMonthReportUx;
  uxs.digSummary = openDigSummaryUx;
  installW(d.w);
  installC(d.uxc);
  installB(d.b);
  installK(d.k);
  installD(d.d);
  installH(d.h);
  installR(d.r);
  installT(d.t);
}
// 読めたら、入れ方を差し込み口の横に置く（入口が先に読んだとき、本体が起動のその場で入れる）
uxsBoot.install = install;
