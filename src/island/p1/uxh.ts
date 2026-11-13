/**
 * 段 UIX3h：人と管理の新しい画面（職人・採用・ヒーロー・育成・人事と給与・法務・トロフィー・図鑑 ほか。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { DEF } from '../defs';
import { CHARISMA, HERO_RARITY, HIRE_RARITIES, MORALE, PAY, SALARY, TASKS, aptitude } from './data';
import { heroRarityOf } from './hero';
import { capAt, charismaLine, charismaOf, charismaParts, cutPay, hireCap, hireEmptyLines, marketPay, marketStep, moraleAvg, moraleBand, moraleMul, moraleOf, payOf, payStep, payroll, quitLeft, stepWage, talk, wantsToQuit } from './hr';
import { RANKS, TASK_NAME, aptShow, jobLabel, rankOf } from './heroui';
import { MAX_HAULERS, assign, bonus, bonusCost, has, heroStats, hire, myShops, raise, setRest, signFee, staffOf, wageMul, wageOf } from './model';
import { rolesCard } from './delegui';
import { BAND_NAME, charismaNeeds, gapText, openPayroll, partsText, rarityHow } from './hrui';
import { charismaHist, charismaSegs, delta, monLab, moraleHist } from './dash';
import { openGrowth } from './growthui';
import { after, mineTip, open } from './screens';
import { heroIcon, heroName, money } from './ui';
import { pickHero } from './heroui';

export const uxhDeps = {
  DEF,
  HERO_RARITY,
  MAX_HAULERS,
  TASKS,
  aptitude,
  heroRarityOf,
  hireEmptyLines,
  RANKS,
  TASK_NAME,
  aptShow,
  jobLabel,
  rankOf,
  assign,
  has,
  heroStats,
  hire,
  myShops,
  signFee,
  staffOf,
  wageOf,
  rolesCard,
  charismaNeeds,
  // ---- 人事（カリスマ度・給与と労務。今の p1/hrui.ts と同じ関数）
  CHARISMA,
  HIRE_RARITIES,
  MORALE,
  PAY,
  SALARY,
  capAt,
  charismaLine,
  charismaOf,
  charismaParts,
  cutPay,
  hireCap,
  marketPay,
  marketStep,
  moraleAvg,
  moraleBand,
  moraleMul,
  moraleOf,
  payOf,
  payStep,
  payroll,
  quitLeft,
  stepWage,
  talk,
  wantsToQuit,
  bonus,
  bonusCost,
  raise,
  setRest,
  wageMul,
  BAND_NAME,
  gapText,
  partsText,
  rarityHow,
  charismaHist,
  charismaSegs,
  delta,
  monLab,
  moraleHist,
  openPayroll,
  openGrowth,
  after,
  mineTip,
  open,
  heroIcon,
  heroName,
  money,
  pickHero,
};
export type UxhDeps = typeof uxhDeps;
