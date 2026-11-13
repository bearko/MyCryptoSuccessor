/**
 * 段 UIX3h：人と管理の新しい画面（職人・採用・ヒーロー・育成・人事と給与・法務・トロフィー・図鑑 ほか。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { DEF } from '../defs';
import { RARITY_COLOR, RARITY_JA } from '../../game/catalog';
import { DIG_BALANCE } from './data';
import { exhibit, exhibitable, extName, extRank, extRarity, museumKnown, museumMarks, museumOpen, museumSlots, museumValue, relicValue, researchOf } from './model';
import { extIcon } from './digui';
import { stars } from './digview';
import { museumHist } from './dash';
import { TROPHIES, globalId } from './trophy';
import { trophyBook } from './trophyui';
import { refreshSheet } from './screens';
import { assetUrl } from '../../render/images';
import { HERO_GROWTH, HERO_RARITIES, LESSON, PASSIVES, PROMO_ITEM, PROMO_ITEMS } from './data';
import { atCap, capOf, heroRarityOf, nextPassive, passiveName, passiveValue, promoItemOf, promoLock, xpNeed } from './hero';
import { promote } from './model';
import { releaseHero } from './heroui';
import { FIT_KEYS, GRADE_COLOR, bestFits, fitLine, fitName, gradeOf, lineOf, whyOf } from './voice';
import { DUOS, condName, duoDex, duoFoundN, duosOfHero, fxText, kindName } from './duo';
import { LESSON_COLOR, LESSON_TYPES, fxLine, lessonCounts, lessonDex, lessonLive, lessonText, lessonTypeName } from './lesson';
import { CHARISMA, HERO_RARITY, HIRE_RARITIES, MORALE, PAY, SALARY, TASKS, aptitude } from './data';
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
  // ---- ヒーローの人事票・育成・昇格（今の p1/growthui.ts・p2ui.ts・heroui.ts と同じ関数）
  assetUrl,
  HERO_GROWTH,
  HERO_RARITIES,
  PASSIVES,
  PROMO_ITEM,
  PROMO_ITEMS,
  atCap,
  capOf,
  nextPassive,
  passiveName,
  passiveValue,
  promoItemOf,
  promoLock,
  xpNeed,
  promote,
  releaseHero,
  FIT_KEYS,
  GRADE_COLOR,
  bestFits,
  fitLine,
  fitName,
  gradeOf,
  lineOf,
  whyOf,
  DUOS,
  condName,
  duoDex,
  duoFoundN,
  duosOfHero,
  fxText,
  kindName,
  // ---- 教え（今の p1/lessonui.ts と同じ関数）
  LESSON,
  LESSON_COLOR,
  LESSON_TYPES,
  fxLine,
  lessonCounts,
  lessonDex,
  lessonLive,
  lessonText,
  lessonTypeName,
  // ---- トロフィー・展示館（今の p1/trophyui.ts・museumui.ts と同じ関数）
  TROPHIES,
  globalId,
  trophyBook,
  RARITY_COLOR,
  RARITY_JA,
  DIG_BALANCE,
  exhibit,
  exhibitable,
  extName,
  extRank,
  extRarity,
  museumKnown,
  museumMarks,
  museumOpen,
  museumSlots,
  museumValue,
  relicValue,
  researchOf,
  extIcon,
  stars,
  museumHist,
  refreshSheet,
  after,
  mineTip,
  open,
  heroIcon,
  heroName,
  money,
  pickHero,
};
export type UxhDeps = typeof uxhDeps;
