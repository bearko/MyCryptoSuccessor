/**
 * 段 UIX4r：残りの画面（セクター長の箱・復興の箱・ミッションの一覧 ほか。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、起動で読むファイルと CSS の当たる順が変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを名前で渡す（`import * as` で束ねない）。
 * 建築の札・設定は main.ts の中の関数を使うので、呼ぶときに中身（BuildView・SettingsView）を渡す。
 */
import { DEF } from '../defs';
import { MANAGER, MISSIONS, RESET, aptitude, fundsOf, rewardText } from './data';
import { RUIN, delegateCostOf, managerRate, revivePerMonth, sectorDef } from './company';
import { sectorHist } from './dash';
import { sectorHeadOk } from './deleg';
import { recOf } from './land';
import { openDelegate, openLand } from './landui';
import { MISSION_MAX, accept, activeMissions, claim, missionProgress, offeredMissions, setSectorHead, staffOf } from './model';
import { delegate, delegateLock, fundShort, reviveView } from './reset';
import { after, open } from './screens';
import { pickHero } from './heroui';
import { heroIcon, heroName, money } from './ui';

export const uxrDeps = {
  DEF,
  // セクター長・復興
  MANAGER,
  RESET,
  aptitude,
  fundsOf,
  RUIN,
  delegateCostOf,
  managerRate,
  revivePerMonth,
  sectorDef,
  sectorHist,
  sectorHeadOk,
  recOf,
  openDelegate,
  openLand,
  setSectorHead,
  staffOf,
  delegate,
  delegateLock,
  fundShort,
  reviveView,
  pickHero,
  // ミッション
  MISSIONS,
  MISSION_MAX,
  rewardText,
  accept,
  activeMissions,
  claim,
  missionProgress,
  offeredMissions,
  // 共通
  after,
  open,
  heroIcon,
  heroName,
  money,
};
export type UxrDeps = typeof uxrDeps;
