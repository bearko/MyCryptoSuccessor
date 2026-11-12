/**
 * 段 UIX3b：事業の新しい画面（調達・お店・サプライチェーン・BOM・販売管理・在庫・商圏・関税・問い合わせ・宣伝・市場調査。src/island/uix/screens/）へ渡す、
 * 本体の関数の束。p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。p1/uxs.ts の uxsDeps に 1 行で入れて渡す。
 */
import { assetUrl } from '../../render/images';
import { sectorDef } from './company';
import { MATS, MAT_KEYS, PROC, aptitude, procNeed } from './data';
import { evMul } from './events';
import { aptShow, pickHero, rankOf } from './heroui';
import {
  LOT,
  assign,
  fullUse,
  hasRoute,
  isCheap,
  leadDays,
  myWarehouses,
  order,
  orderFrom,
  poolCap,
  poolFree,
  poolUsed,
  procBonus,
  procCap,
  procItems,
  procLeft,
  procMats,
  procQty,
  scoutMul,
  setProcQty,
  staffOf,
  toggleProcExtra,
  toggleProcItem,
  unitPrice,
  utilRate,
  walkDays,
} from './model';
import { craftable } from './orders';
import { after, mineTip, open } from './screens';
import { canImport, cheapAt, dutyText, headSuggest, importLead, importPrice, setSource, sourceOf, tradeNeighbors } from './tariff';
import { fmt, heroIcon, heroName, matIcon, money, skuIcon, skuName } from './ui';

export const uxbDeps = {
  assetUrl,
  sectorDef,
  MATS,
  MAT_KEYS,
  PROC,
  procNeed,
  aptitude,
  evMul,
  aptShow,
  pickHero,
  rankOf,
  LOT,
  assign,
  fullUse,
  hasRoute,
  isCheap,
  leadDays,
  myWarehouses,
  order,
  orderFrom,
  poolCap,
  poolFree,
  poolUsed,
  procBonus,
  procCap,
  procItems,
  procLeft,
  procMats,
  procQty,
  scoutMul,
  setProcQty,
  staffOf,
  toggleProcExtra,
  toggleProcItem,
  unitPrice,
  utilRate,
  walkDays,
  craftable,
  after,
  mineTip,
  open,
  canImport,
  cheapAt,
  dutyText,
  headSuggest,
  importLead,
  importPrice,
  setSource,
  sourceOf,
  tradeNeighbors,
  fmt,
  heroIcon,
  heroName,
  matIcon,
  money,
  skuIcon,
  skuName,
};
export type UxbDeps = typeof uxbDeps;
