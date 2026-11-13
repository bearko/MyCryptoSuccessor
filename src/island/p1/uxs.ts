/**
 * 段 UIX2s：新しい画面（方向 C「管制卓」の工房の札・月次報告。src/island/uix/screens/）へ渡す、本体の関数の束。
 * 新しい画面の束（入のときだけ読む）は、本体のモジュールを自分では読まない：読むと、本番のビルドで本体の束の分かれ方（JS と CSS）が変わり、
 * 切のときの読み込みが今と変わってしまう。そこで、本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 * 切のときは、束ねるだけで何も読みに行かない（loadUxs を呼ばない）。
 */
import { heroFacesRight } from '../../game/catalog';
import { assetUrl } from '../../render/images';
import { DEF } from '../defs';
import { reportProposal, stallSay } from './card';
import { shortN } from './chartkit';
import { sectorDef } from './company';
import { csReportText } from './csui';
import { costParts, monHead, monLab, moneyCandles, monthFall, salesParts, ymOfMonth } from './dash';
import { FACTORY, INVESTS, MATS, TOP_STREAK, aptitude, sku } from './data';
import { delegReportText } from './delegui';
import { clearCondText, digMet, digReportLine, digReportText, presentReady, rebuildText, reviveReportText } from './digmeet';
import { dipReportText } from './diplo';
import { eventReportText } from './events';
import { benchAfter, upWhy } from './factoryui';
import { aptShow, extCard, lotsFromStock, pickExt, pickHero, profitPerDay, rankOf } from './heroui';
import { hrReportText } from './hrui';
import { legalReportText } from './legalui';
import { ZERO_LINE } from './mine';
import {
  assign,
  batchOf,
  benchCount,
  bName,
  cashGap,
  craftCheck,
  craftDays,
  facLv,
  has,
  invest,
  investCost,
  invLv,
  jamOf,
  myShops,
  poolCap,
  poolUsed,
  recipeOf,
  recommend,
  setAutoCraft,
  setCraftPlan,
  shelvesAuto,
  speed,
  staffOf,
  upCheck,
  upSpots,
  whatIf,
  wsAny,
} from './model';
import { bestSell } from './moves';
import { applyPlan, manualPlan } from './plan';
import { FLOW_NAME, STAGE_BRANCH, STAGE_HINT, STAGE_HINT_SHORT, STAGE_NAME, levelUpText, reportJam, reportTitle } from './report';
import { moveUp, sellBigUp } from './scm';
import { CRAFT_ERR, chooseMake, closeSheet, craftErr, craftable, mineTip, open } from './screens';
import { propsOpen } from './stage';
import { pickMake } from './stockui';
import { dutyText, tradeNeighbors } from './tariff';
import { fmt, heroIcon, heroName, matIcon, money, signed, skuIcon, skuName } from './ui';
import { uxbDeps } from './uxb';
import { uxwDeps } from './uxw';
import { uxcDeps } from './uxc';
import { uxkDeps } from './uxk';
import { uxhDeps } from './uxh';
import { uxsBoot } from '../uix/screens/s-slots';

export const uxsDeps = {
  heroFacesRight,
  assetUrl,
  DEF,
  reportProposal,
  stallSay,
  shortN,
  sectorDef,
  csReportText,
  costParts,
  monHead,
  monLab,
  moneyCandles,
  monthFall,
  salesParts,
  ymOfMonth,
  FACTORY,
  INVESTS,
  MATS,
  TOP_STREAK,
  aptitude,
  sku,
  delegReportText,
  clearCondText,
  digMet,
  digReportLine,
  digReportText,
  presentReady,
  rebuildText,
  reviveReportText,
  dipReportText,
  eventReportText,
  benchAfter,
  upWhy,
  aptShow,
  extCard,
  lotsFromStock,
  pickExt,
  pickHero,
  profitPerDay,
  rankOf,
  hrReportText,
  legalReportText,
  ZERO_LINE,
  assign,
  batchOf,
  benchCount,
  bName,
  cashGap,
  craftCheck,
  craftDays,
  facLv,
  has,
  invest,
  investCost,
  invLv,
  jamOf,
  myShops,
  poolCap,
  poolUsed,
  recipeOf,
  recommend,
  setAutoCraft,
  setCraftPlan,
  shelvesAuto,
  speed,
  staffOf,
  upCheck,
  upSpots,
  whatIf,
  wsAny,
  bestSell,
  applyPlan,
  manualPlan,
  FLOW_NAME,
  STAGE_BRANCH,
  STAGE_HINT,
  STAGE_HINT_SHORT,
  STAGE_NAME,
  levelUpText,
  reportJam,
  reportTitle,
  moveUp,
  sellBigUp,
  CRAFT_ERR,
  chooseMake,
  closeSheet,
  craftErr,
  craftable,
  mineTip,
  open,
  propsOpen,
  pickMake,
  dutyText,
  tradeNeighbors,
  fmt,
  heroIcon,
  heroName,
  matIcon,
  money,
  signed,
  skuIcon,
  skuName,
  // 段 UIX3w：世界の場面（町の制覇・ランドマップ・発掘）の束
  w: uxwDeps,
  uxc: uxcDeps,
  // 段 UIX3b：事業の画面（調達・お店・サプライチェーン ほか）の束
  b: uxbDeps,
  // 段 UIX3k：経営企画の画面（スキルツリー・企業ランキング・設備投資・決算書 ほか）の束
  k: uxkDeps,
  // 段 UIX3h：人と管理の画面（職人・採用・ヒーロー・人事・法務・トロフィー・図鑑 ほか）の束
  h: uxhDeps,
};
export type UxsDeps = typeof uxsDeps;

/** 入のときだけ呼ぶ（p1/main.ts）：新しい画面の束を読み、本体の関数を渡して差し込み口（uxs）へ入れる */
export const loadUxs = () => import('../uix/screens/s-boot').then((m) => m.install(uxsDeps));
/**
 * 段 UIX3a：束がもう届いていれば（入のとき、入口 src/island/main.ts が本体より先に読む）、その場で差し込み口へ入れる。
 * 本体の起動のすぐあと（最初の描き直し）に出る会話から、新しい画面で出すため。届いていなければ何もしない（loadUxs があとから入れる）
 */
export const bootUxs = () => uxsBoot.install?.(uxsDeps);
