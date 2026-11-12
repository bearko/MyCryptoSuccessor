/**
 * 段 UIX3w：世界の場面の新しい画面（町の制覇・ランドマップと進出・発掘。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { assetUrl } from '../../render/images';
import { TIER_NAME, sectorDef, sectorState, tierLabel } from './company';
import { sectorBars } from './dash';
import { DIG_SITES, RIVAL_TUNE, SECTORS, TIERS, grantOf } from './data';
import { clearCondText } from './digmeet';
import { crowned, hasBusiness, lastRank, letterLockOf, letterLocked } from './land';
import { ROADS, TIER_NOTE, managerBox, needText, openLand, reviveBox, reviveLine, sectorIcon, startMove, stateText } from './landui';
import { DONATE_LINE } from './mine';
import { clearGoal, clearWaiting } from './model';
import { antiquesHeld, rankUpTier, reviveView } from './reset';
import { after, open } from './screens';
import { heroIcon, heroName, money } from './ui';

export const uxwDeps = {
  assetUrl,
  heroIcon,
  heroName,
  money,
  // ランドマップ・進出
  TIER_NAME,
  sectorDef,
  sectorState,
  tierLabel,
  sectorBars,
  DIG_SITES,
  RIVAL_TUNE,
  SECTORS,
  TIERS,
  grantOf,
  clearCondText,
  crowned,
  hasBusiness,
  lastRank,
  letterLockOf,
  letterLocked,
  ROADS,
  TIER_NOTE,
  managerBox,
  needText,
  openLand,
  reviveBox,
  reviveLine,
  sectorIcon,
  startMove,
  stateText,
  DONATE_LINE,
  clearGoal,
  clearWaiting,
  antiquesHeld,
  rankUpTier,
  reviveView,
  after,
  open,
};
export type UxwDeps = typeof uxwDeps;
