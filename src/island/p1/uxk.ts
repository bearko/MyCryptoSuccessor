/**
 * 段 UIX3k：経営企画の新しい画面（スキルツリー・企業ランキング・設備投資・決算書・税・職場・予算。src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、起動で読むファイルと CSS の当たる順が変わる）。
 * 本体の側（このファイル。p1/main.ts と同じ束）から、使う関数だけを渡す。
 */
import { getExtension } from '../../game/catalog';
import { assetUrl } from '../../render/images';
import { FX_PAL, fxAtEl } from '../fx/layer';
import { t } from '../../i18n';
import { DEF } from '../defs';
import { CAPITAL, TIER_NAME, emptyLedger, pl, quarters, sumLedger, type Balance, type Ledger } from './company';
import { acctAdvice, acctOf, costRank, dedCap, dedRate, quarterNow, taxLine, taxPlan, taxRate, topTier } from './acct';
import { budgetHeat, bsParts, heatStep, monHead, monLab, plFall, quarterTrend, rankHist, taxFall } from './dash';
import { ACCT_MASTERY, BUDGET, CROSS_ACCT_GA, DEPT, DEPTS, DIG_BALANCE, FATIGUE, GA_MASTERY, GOAL, INVESTS, LAND_COMPANIES, MARKET, P1B, SKILL, SKILLS, TAX, TIERS, TRADE, WORLD_COMPANIES, deptOf, digRpLv, isResearch, maxLv, r2Panel, rpCost, shownOf, shownText } from './data';
import { BUDGET_LVS, amountFor, amountOf, askText, budgetDepts, budgetOpen, budgetRetry, costNeed, crewWageMonth, deptBudget, effParts, headStar, laborCap, laborNeed, lvName, nextMoves, nextUp, setBudget, setBudgets, setCrewCap } from './budget';
import { actName, approve, headOf, heroNm, ifsOf, resultText, setHead } from './deleg';
import { done as delegDone, pickHead } from './delegui';
import { approveFeed, borderDepots, feedBlock, feedItems, feedNext, feedPicks, feedSuggest, goodsRate, toggleFeed, townName } from './feed';
import { envItems, fatigueAvg, fatigueBand, fatigueLoad, fatigueMorale, fatigueMul, fatigueOf, gaOn } from './ga';
import { openGrowth } from './growthui';
import { moraleOf } from './hr';
import { tradeNeighbors } from './tariff';
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
  setRest,
  missingFront,
  monthRevenue,
  nextDonateCost,
  nextLevelCost,
  nextLevelRp,
  openHQ,
  openRing,
  ringOpen,
  ringsDue,
  balance,
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
import { heroIcon, heroName, matIcon, money, plain, rich, skuIcon, skuName } from './ui';

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

// ---------------------------------------------------------------- 決算書
/** 決算書の 1 行（名前・金額・行の種類：見出し・内訳・小計・合計）。今の画面（p1/landui.ts の plTable・bsTable）と同じ並び・同じ条件 */
export interface BookRow {
  k: string;
  v: number;
  cls: 'is-head' | 'is-sub' | 'is-sum' | 'is-total';
}
/** P/L の行（今の plTable と同じ） */
export function plRows(l: Ledger): BookRow[] {
  const p = pl(l);
  const r: BookRow[] = [];
  const add = (k: string, v: number, cls: BookRow['cls']) => r.push({ k, v: v || 0, cls });
  add(t('売上高', 'Sales'), p.sales, 'is-head');
  add(t('売上原価（素材）', 'Cost of goods (materials)'), -p.cogs, 'is-sub');
  add(t('売上総利益', 'Gross profit'), p.gross, 'is-sum');
  add(t('販売費・一般管理費', 'SG&A'), -p.sga, 'is-head');
  add(t('　給料', '  Wages'), -l.wages, 'is-sub');
  add(t('　アルバイト', '  Part-timers'), -l.part, 'is-sub');
  add(t('　維持費', '  Upkeep'), -l.upkeep, 'is-sub');
  add(t('　宣伝', '  Advertising'), -l.ads, 'is-sub');
  add(t('営業利益', 'Operating profit'), p.op, 'is-sum');
  add(t('営業外の収入', 'Other income'), p.nonop, 'is-head');
  add(t('　他店でバイト', '  Part-time work'), l.side, 'is-sub');
  add(t('　依頼の報酬', '  Request rewards'), l.other, 'is-sub');
  add(t('　他セクタからの利益', '  From managed sectors'), l.managed, 'is-sub');
  if (l.museum) add(t('　展示館の入館料', '  Museum admissions'), l.museum, 'is-sub');
  add(t('投資・特別な支出', 'Investment & special'), -p.special, 'is-head');
  add(t('　建物・スキル・設備', '  Buildings, skills, upgrades'), -l.build, 'is-sub');
  add(t('　通行料・出店許可申請', '  Tolls & permits'), -l.fees, 'is-sub');
  if (l.levy) add(t('　特別損失：復興の徴収', '  Special loss: recovery levy'), -l.levy, 'is-sub');
  if (l.grant) add(t('　特別利益：復興の支度金', '  Special gain: recovery grant'), l.grant, 'is-sub');
  if (p.tax) add(t('法人税', 'Corporate tax'), -p.tax, 'is-head');
  add(t('当期の利益', 'Net profit'), p.net, 'is-total');
  return r;
}
/** B/S の行（今の bsTable と同じ） */
export function bsRows(b: Balance): BookRow[] {
  const assets = b.cash + b.stock + b.buildings + b.invest;
  return [
    { k: t('資産', 'Assets'), v: assets, cls: 'is-head' },
    { k: t('　現金', '  Cash'), v: b.cash, cls: 'is-sub' },
    { k: t('　在庫（素材・商品）', '  Inventory'), v: b.stock, cls: 'is-sub' },
    { k: t('　建物', '  Buildings'), v: b.buildings, cls: 'is-sub' },
    { k: t('　他セクタへの投資', '  Invested in sectors'), v: b.invest, cls: 'is-sub' },
    { k: t('負債（借入金）', 'Liabilities (loans)'), v: 0, cls: 'is-head' },
    { k: t('純資産', 'Equity'), v: assets, cls: 'is-head' },
    { k: t('　資本金', '  Capital'), v: CAPITAL, cls: 'is-sub' },
    { k: t('　利益剰余金', '  Retained earnings'), v: assets - CAPITAL, cls: 'is-sub' },
  ].map((x) => ({ ...x, v: x.v || 0 })) as BookRow[];
}
/**
 * 決算書に出す中身（今の画面 p1/landui.ts の openBooks と同じ計算）：四半期の一覧（締めた四半期 ＋ いまの四半期の途中）・選んだ四半期の P/L・B/S・
 * P/L の差し引き・資産の中身・四半期ごとの推移・コストの大きい順・法人税の行・経理からの助言（前の四半期と比べる）
 */
export function booksView(s: P1State, sel: number | null) {
  const books = s.books;
  const qs = books ? quarters(books) : [];
  const now = quarterNow(s);
  const curQ = now.q;
  const inQ = now.inQ - 1;
  const curL = sumLedger([...(books?.months.filter((x) => Math.ceil(Math.max(1, x.m) / 3) === curQ).map((x) => x.l) ?? []), books?.cur ?? emptyLedger()]);
  const list = [...qs.filter((q) => q.done && q.q !== curQ).map((q) => ({ q: q.q, l: q.l, bs: q.bs, label: t(`第 ${q.q} 四半期`, `Q${q.q}`), done: true })), { q: curQ, l: curL, bs: balance(s) as Balance, label: t(`第 ${curQ} 四半期（途中）`, `Q${curQ} (in progress)`), done: false }];
  const q = sel != null && list.some((x) => x.q === sel) ? sel : list[list.length - 1].q;
  const idx = list.findIndex((x) => x.q === q);
  const cur = list[idx];
  const p = pl(cur.l);
  const bs = cur.bs ?? (balance(s) as Balance);
  const prev = idx > 0 ? list[idx - 1] : null;
  const prevL = prev && prev.q === cur.q - 1 ? prev.l : null;
  return {
    q,
    /** 選べる四半期（今の画面と同じく、うしろの 8 つ） */
    chips: list.slice(-8).map((x) => ({ q: x.q, label: x.label, done: x.done })),
    label: cur.label,
    done: cur.done,
    inQ,
    p,
    fall: plFall(cur.l),
    parts: bsParts(bs),
    pl: plRows(cur.l),
    bs: bsRows(bs),
    trend: quarterTrend(books),
    costs: costRank(s, cur.l).slice(0, 7),
    tax: taxLine(s, cur.l, cur.q),
    advice: acctAdvice(s, cur.l, prevL),
  };
}
export type BooksView = ReturnType<typeof booksView>;

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
  setRest,
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
  // ---- 決算書
  booksView,
  // ---- 税と節税・疲れと職場の環境（今の画面 p1/acctui.ts の openTax・openGa と同じ関数）
  acctOf,
  taxPlan,
  taxRate,
  topTier,
  dedCap,
  dedRate,
  quarterNow,
  taxFall,
  TAX,
  ACCT_MASTERY,
  CROSS_ACCT_GA,
  GA_MASTERY,
  FATIGUE,
  envItems,
  fatigueAvg,
  fatigueBand,
  fatigueLoad,
  fatigueMorale,
  fatigueMul,
  fatigueOf,
  gaOn,
  moraleOf,
  // ---- 予算と部門（今の画面 p1/budgetui.ts の openBudget と同じ関数）
  BUDGET,
  BUDGET_LVS,
  amountFor,
  amountOf,
  askText,
  budgetDepts,
  budgetOpen,
  budgetRetry,
  costNeed,
  crewWageMonth,
  deptBudget,
  effParts,
  headStar,
  laborCap,
  laborNeed,
  lvName,
  nextMoves,
  nextUp,
  setBudget,
  setBudgets,
  setCrewCap,
  actName,
  approve,
  headOf,
  heroNm,
  ifsOf,
  resultText,
  setHead,
  delegDone,
  pickHead,
  openGrowth,
  budgetHeat,
  heatStep,
  // ---- 物流拠点の「輸入」（今の p1/feedui.ts の feedBox と同じ関数）
  TRADE,
  approveFeed,
  borderDepots,
  feedBlock,
  feedItems,
  feedNext,
  feedPicks,
  feedSuggest,
  goodsRate,
  toggleFeed,
  townName,
  tradeNeighbors,
  skuName,
};
export type UxkDeps = typeof uxkDeps;
