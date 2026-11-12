/**
 * 段 UIX3k：経営企画の新しい画面（スキルツリー・企業ランキング・設備投資・決算書・税・職場・予算。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、切のときの読み込みが変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { getExtension } from '../../game/catalog';
import { assetUrl } from '../../render/images';
import { FX_PAL, fxAtEl } from '../fx/layer';
import { t } from '../../i18n';
import { DEF } from '../defs';
import { TIER_NAME } from './company';
import { monHead, monLab, rankHist } from './dash';
import { DEPT, DEPTS, DIG_BALANCE, GOAL, INVESTS, LAND_COMPANIES, MARKET, P1B, SKILL, SKILLS, TIERS, WORLD_COMPANIES, deptOf, digRpLv, isResearch, maxLv, r2Panel, rpCost, shownOf, shownText } from './data';
import { deptLevel, deptLockText, deptOpen } from './dept';
import { goalFloor, goalMonths, goalNext, goalPath, goalable, setGoal } from './goal';
import { pickHero } from './heroui';
import { tipPanels } from './mapmarks';
import {
  LEARNABLE,
  affordableSkills,
  areaRanking,
  bestSkillMove,
  carriedRp,
  condsOf,
  digBranchOpen,
  donate,
  donateLock,
  donations,
  edgeMul,
  has,
  hqOpen,
  infAt,
  invLv,
  invest,
  investCost,
  learn,
  levelLock,
  levelUp,
  lvOf,
  missingFront,
  monthRevenue,
  nextDonateCost,
  nextLevelCost,
  nextLevelRp,
  openHQ,
  openRing,
  ringOpen,
  ringsDue,
  rivalAreaMul,
  rivalBase,
  saleBonus,
  skillLock,
  skillTier,
  trainDays,
  trainees,
  trainingOf,
  type P1State,
} from './model';
import { shopInvestOrder } from './orders';
import { STUDY_KINDS, studyLock } from './r2';
import { rpStackEl, studyEl } from './r2ui';
import { after, mineTip, open, rivalName } from './screens';
import { treeKit } from './tree';
import { BANDS, BAND_TIERS, BOUNDS, DEPT_LAYOUT, EDGES, GATES, GROUP_STAGE, HEAD_Y, HUBPOS, JUNCTIONS, KNOTPOS, POS, STEP, UNIT, deptAtX, deptCenter, halfOf, shapeOf } from './treelayout';
import { heroIcon, heroName, matIcon, money, plain, rich, skuIcon } from './ui';

// ---------------------------------------------------------------- 企業ランキング
/** 順位の 1 行（名前・月の売上・わが社か・添える札：反撃中／セール中。label は今の画面の札の字・short は行に出す短い字） */
export interface RankRowView {
  name: string;
  sales: number;
  me: boolean;
  tag?: { label: string; short: string };
}
/**
 * 企業ランキングに出す中身（今の画面 p1/screens.ts の openRanking と同じ数字・同じ決まり）。
 * エリア：直近の月次報告の順位（まだ無ければ、今月のここまでの売上で並べる）・次の順位までの差／2 位との差・反撃とセール・自社の順位の推移。
 * ランド・世界：決まった会社の並びに、自社を入れる（世界は見込みの順位）
 */
export function rankingView(s: P1State) {
  const last = s.reports[s.reports.length - 1];
  const prev = s.reports[s.reports.length - 2];
  const mine = last?.revenue ?? monthRevenue(s);
  const rallying = (s.rally ?? 0) > 0;
  const selling = s.comeback && s.comeback.left > 0 ? s.comeback : null;
  const tagOf = (name: string, me: boolean): RankRowView['tag'] => {
    if (me) return undefined;
    if (selling && name === rivalName(selling.rid)) return { label: t(`セール中（あと ${selling.left} か月）`, `On sale (${selling.left} mo)`), short: t('セール中', 'On sale') };
    if (rallying) return { label: t(`反撃中（あと ${s.rally} か月）`, `Fighting back (${s.rally} mo)`), short: t('反撃中', 'Fighting back') };
    return undefined;
  };
  const areaRows = last ? last.area : areaRanking(s, mine, Object.fromEntries(s.rivals.map((r) => [r.id, rivalBase(s, r)])));
  const area: RankRowView[] = areaRows.map((r) => ({ name: r.name, sales: Math.round(r.sales), me: r.me, tag: tagOf(r.name, r.me) }));
  const me = area.findIndex((x) => x.me);
  const gap = me > 0 ? { kind: 'next' as const, n: me, amount: Math.max(0, area[me - 1].sales - area[me].sales), top: area[me - 1].sales } : me === 0 && area.length > 1 ? { kind: 'lead' as const, n: 2, amount: Math.max(0, area[0].sales - area[1].sales), top: area[0].sales } : null;
  const land: RankRowView[] = [...LAND_COMPANIES.map(([n, v]) => ({ name: n, sales: v, me: false })), { name: '', sales: mine, me: true }].sort((a, b) => b.sales - a.sales);
  const est = Math.max(9, Math.round(4000 / Math.max(1, Math.log10(Math.max(10, mine)))));
  return {
    mine,
    /** 直近の報告の月（まだ無ければ 0）：順位が動いたときの札のめくりを、月ごとに 1 回だけにする */
    month: last?.month ?? 0,
    /** 月次報告の順位（まだ無ければ null：今月のここまでの見込み） */
    rank: last ? last.rank : null,
    prevRank: prev ? prev.rank : null,
    area,
    me,
    gap,
    /** 他社の反撃（あなたが 1 位を取ったので、他社が宣伝を始めた） */
    rally: rallying ? { left: s.rally ?? 0, mul: MARKET.rally } : null,
    /** 他社の巻き返しのセール（Rare の町 ②：売上に足さず、その会社の店の引きが上がる） */
    sale: selling ? { left: selling.left, name: rivalName(selling.rid), pull: s.area ? rivalAreaMul(s, selling.rid) / edgeMul(s) : null, bonus: s.area ? 0 : saleBonus(s, selling.rid) } : null,
    hist: rankHist(s.reports).map((x, k) => ({ ...x, label: monLab(x.month, k === 0), head: monHead(x.month) })),
    land,
    world: WORLD_COMPANIES.map(([n, v], k) => ({ n: k + 1, name: n, sales: v })),
    worldMe: est * 37,
  };
}
export type RankingView = ReturnType<typeof rankingView>;

// ---------------------------------------------------------------- 設備投資
/**
 * 設備投資に出す中身（今の画面 p1/screens.ts の openInvest・investList と同じ並び・同じ数字）。
 * 自社の建物（屋台の類は除く）ごとに、その種類の設備：段・値段（最大なら null）・お店は「いま効く順」と見込み（チュートリアルのあいだは並べ替えない）
 */
export function investView(s: P1State, tut: boolean) {
  return s.buildings
    .filter((b) => b.owner === 'me' && P1B[b.id]?.kind !== 'food')
    .map((b) => {
      const kind = P1B[b.id]?.kind;
      const gains = kind === 'shop' && b.left <= 0 && s.shops[b.uid] && !tut ? shopInvestOrder(s, b) : null;
      const list = INVESTS.filter((v) => v.kind === kind);
      if (gains) list.sort((p, q) => gains.findIndex((g) => g.id === p.id) - gains.findIndex((g) => g.id === q.id));
      return {
        uid: b.uid,
        id: b.id,
        kind,
        name: DEF[b.id].name,
        /** 工事の残りの日数（0 なら使える） */
        left: b.left,
        items: list.map((x) => {
          const cost = investCost(b, x.id);
          const gi = gains?.find((g) => g.id === x.id);
          return { id: x.id, name: x.name, note: x.note, lv: invLv(b, x.id), max: x.cost.length, cost, gain: gi && cost != null ? { weak: gi.weak, units: Math.round(gi.units * 10) / 10 } : null };
        }),
      };
    });
}
export type InvestView = ReturnType<typeof investView>;

export const uxkDeps = {
  assetUrl,
  getExtension,
  heroIcon,
  heroName,
  matIcon,
  money,
  plain,
  rich,
  skuIcon,
  after,
  mineTip,
  open,
  FX_PAL,
  fxAtEl,
  // ---- スキルツリー
  tree: treeKit,
  TIER_NAME,
  DEPT,
  DEPTS,
  DIG_BALANCE,
  GOAL,
  SKILL,
  SKILLS,
  TIERS,
  deptOf,
  digRpLv,
  isResearch,
  maxLv,
  r2Panel,
  rpCost,
  shownOf,
  shownText,
  deptLevel,
  deptLockText,
  deptOpen,
  goalFloor,
  goalMonths,
  goalNext,
  goalPath,
  goalable,
  setGoal,
  pickHero,
  tipPanels,
  LEARNABLE,
  affordableSkills,
  bestSkillMove,
  carriedRp,
  condsOf,
  digBranchOpen,
  donate,
  donateLock,
  donations,
  has,
  hqOpen,
  infAt,
  learn,
  levelLock,
  levelUp,
  lvOf,
  missingFront,
  nextDonateCost,
  nextLevelCost,
  nextLevelRp,
  openHQ,
  openRing,
  ringOpen,
  ringsDue,
  skillLock,
  skillTier,
  trainDays,
  trainees,
  trainingOf,
  STUDY_KINDS,
  studyLock,
  rpStackEl,
  studyEl,
  BANDS,
  BAND_TIERS,
  BOUNDS,
  DEPT_LAYOUT,
  EDGES,
  GATES,
  GROUP_STAGE,
  HEAD_Y,
  HUBPOS,
  JUNCTIONS,
  KNOTPOS,
  POS,
  STEP,
  UNIT,
  deptAtX,
  deptCenter,
  halfOf,
  shapeOf,
  // ---- 企業ランキング
  rankingView,
  // ---- 設備投資
  investView,
  invest,
};
export type UxkDeps = typeof uxkDeps;
