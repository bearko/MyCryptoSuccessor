/**
 * 段 UIX3a：共通の器と 1 か月目に通る画面（会話・選ぶ引き出し・窓・ミッション・設定 ほか。src/island/uix/screens/ の talk・picker…）へ渡す、
 * 本体の関数の束。p1/uxs.ts の uxsDeps に 1 行で入れて渡す（新しい画面の束は、本体のモジュールを自分では読まない：uxs.ts の説明のとおり）。
 */
import { assetUrl } from '../../render/images';
import { TASKS, aptitude } from './data';
import { crestEl } from './diploui';
import { TASK_NAME, aptShow, canRelease, extCard, jobLabel, lotsFromStock, makeView, pickHooks, pickKind, pickable, profitPerDay, rankOf, releaseHero, swapOn } from './heroui';
import { craftCheck, releaseForSwap, restDaysLeft, staffOf, swapStops } from './model';
import { gradeChip } from './p2ui';
import { fromStock, rankUp, rankable, sellFilter, sellNo, upPrice } from './stock';
import { heroIcon, heroName, money, skuIcon, skuName } from './ui';
import { TASK_FIT } from './voice';

export const uxcDeps = {
  assetUrl,
  TASKS,
  aptitude,
  crestEl,
  TASK_NAME,
  aptShow,
  canRelease,
  extCard,
  jobLabel,
  lotsFromStock,
  makeView,
  pickHooks,
  pickKind,
  pickable,
  profitPerDay,
  rankOf,
  releaseHero,
  swapOn,
  craftCheck,
  releaseForSwap,
  restDaysLeft,
  staffOf,
  swapStops,
  gradeChip,
  fromStock,
  rankUp,
  rankable,
  sellFilter,
  sellNo,
  upPrice,
  heroIcon,
  heroName,
  money,
  skuIcon,
  skuName,
  TASK_FIT,
};
export type UxcDeps = typeof uxcDeps;
