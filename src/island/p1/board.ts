/**
 * 段 I2：経営会議と社内監査（DOM なし：model.ts の step・budget.ts・hr.ts・boardui.ts・自動プレイ・テストが使う）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 I2 の実装」、数字は data.ts の BOARD（1 か所）。
 *
 * - 会社の四半期の締め（経理の決算とそろえる。model.ts の closeCompanyMonth の quarter）に、予算で任せる（段 I1）が開いていて、
 *   部長のいる部門かセクター長がいれば、会議の議題（agenda）を作る。画面（boardui.ts）は、時間を止めて会議を開く。
 * - 話し手は、部長のいる部門（DEPTS の順）→ セクター長（ほかの町）。1 人ずつ「予実の報告 → 来期の計画 → 必要予算（＋その他の要求）」。
 * - プレイヤーは 1 人ずつ 3 つを選ぶ（計画：承認／目標 +10%／+20%・予算：承認／増額 +20%／減額 −20%・その他：承認／否認）。どの選択肢にも「推奨」がある。
 *   一括承認・飛ばす・次の四半期まで開かなかったときは、全員「推奨」で決める（boardAuto）。自動プレイも「推奨」。
 * - 決めたことは、予算は段 I1 の setBudget（同じ関数）、ヒーローの追加は setHead、目標の上乗せは「目標」（goals）に残し、
 *   労力（laborCap）・月の施策の数（perHeadOf）・セクター長の売上の倍率（sectorPush）と、士気の目標の 1 項目「目標の重さ」（goalMorale。hr.ts）に効く。
 * - 期末（次の四半期の締め）に、目標に届いたか（実績）を部門ごとに返す（last）。次の会議の「予実の報告」と、締めのトースト。
 * - 報告の盛り：部長の出来（★・適性）が低いほど、報告（実績・計画・予算の要求）を盛る（盛り ＝ (1 − 出来) × BOARD.pad × (0.4〜1)。
 *   部長の提案の見込みの誤差 Proposal.err と同じ考え）。社内監査（経理部長）がいると、経理部長の ★ で決まる下限より大きい盛りを
 *   「監査の指摘」として会議の画面に出し、推奨も監査の数字で決める（盛った予算の要求は推奨しない）。
 */
import { t } from '../../i18n';
import { BOARD, BUDGET, DEPT, MANAGER, type DeptId } from './data';
import { amountOf, budgetDepts, budgetOpen, deptBudget, headStar, lvName, nextMoves, nextUp, setBudget, valG, type BudgetLv } from './budget';
import { headOf, heroNm, pickBest, pickList, quality, rndOf, setHead } from './deleg';
import { deptLevel } from './dept';
import { managerApt, managerRate, sectorDef } from './company';
import { fitSector } from './voice';
import { heroLine } from './headtalk';
import { DAYS, growthOn, staffOf, type P1State, type Staff } from './model';
import { presFinish } from './policy';

// ---------------------------------------------------------------- 型

/** 計画・予算・その他の選んだ番号（計画：0 承認・1 +10%・2 +20%／予算：0 承認・1 増額・2 減額／その他：0 承認・1 否認） */
export interface BoardPick {
  plan: 0 | 1 | 2;
  budget: 0 | 1 | 2;
  other: 0 | 1;
}
/** その他の要求：rp＝研究パネルに RP を使いたい（否認すると、この四半期は RP の施策を打たない）・hero＝部長のいない部門にヒーローを部長として置きたい */
export type BoardOther = { k: 'rp'; id: string; rp: number; nm: string } | { k: 'hero'; dept: DeptId; hero: number; lvl: number };
/** 期末の結果（目標に届いたか）。got・target は本当の数字、claimed・targetRep は部長の報告（盛りつき） */
export interface BoardResult {
  key: string;
  hero: number;
  q: number;
  raise: number;
  target: number;
  targetRep: number;
  got: number;
  claimed: number;
  ok: boolean;
  okRep: boolean;
}
export interface BoardItem {
  key: string;
  kind: 'dept' | 'sector';
  dept?: DeptId;
  sector?: string;
  hero: number;
  star: 1 | 2 | 3;
  /** 予実：前の四半期の予算の合計・使った額・施策の数と名前（セクター長は利益・投資・本社へ） */
  was: { amt: number; used: number; acts: number; names: string[] } | { profit: number; invest: number; toHQ: number };
  /** 前の四半期の目標の結果（初めての会議は null） */
  prev: BoardResult | null;
  /** 来期の計画：次の施策・見込み（本当の f と、報告の rep） */
  plan: { moves: string[]; f: number; rep: number };
  /** 必要予算：up＝増額の要求（この四半期に頼みが 2 か月以上）。cur＝いまの額（セクター長は投資の割合）。amt・lv＝要求 */
  ask: { up: boolean; cur: number; amt: number; lv: BudgetLv };
  other: BoardOther | null;
  /** 盛り（本当の値。画面には監査の指摘としてだけ出す） */
  pads: { report: number; plan: number; ask: number };
  /** 監査の指摘（監査が無ければ null）：盛った報告・甘い計画・盛った予算の要求 */
  audit: { report: boolean; plan: boolean; ask: boolean } | null;
  rec: BoardPick;
  pick: BoardPick;
  done: boolean;
}
export interface BoardAgenda {
  /** 次の四半期の番号（会社の月 ÷ 3 ＋ 1）・作った日・会社の月（締めた月） */
  q: number;
  day: number;
  m: number;
  items: BoardItem[];
  /** 社内監査：経理部長と ★（いなければ null） */
  auditor: { hero: number; star: 1 | 2 | 3 } | null;
}
/** 四半期の目標（決めたときに作り、次の四半期の締めで結果にする） */
export interface BoardGoal {
  key: string;
  hero: number;
  q: number;
  f: number;
  rep: number;
  raise: number;
  /** 予算の増減の割合（士気の目標の重さに効く） */
  up: number;
  /** 期末の報告の盛り */
  pad: number;
  /** 決めた会社の月（セクター長の実績は、この月のあとの 3 か月の利益） */
  m: number;
}
export interface BoardStat {
  /** 開いた会議の数（1 人ずつ決めた・一括承認・飛ばした・開かずに推奨で決めた＝自動） */
  held: number;
  one: number;
  bulk: number;
  skip: number;
  auto: number;
  /** 話し手の数・推奨と違う選択の数・選んだ番号の数え（計画・予算・その他） */
  items: number;
  changed: number;
  plan: number[];
  budget: number[];
  other: number[];
  /** 期末の結果：届いた・届かなかった（本当の数字） */
  met: number;
  missed: number;
  /** 監査の指摘の数 */
  flags: number;
}
export interface BoardState {
  agenda: BoardAgenda | null;
  goals: Record<string, BoardGoal>;
  /** 直近の四半期の結果（次の会議の予実の報告） */
  last: BoardResult[];
  stat: BoardStat;
}
/** 四半期の締めの結果（main.ts のトースト） */
export interface BoardClose {
  q: number;
  met: number;
  missed: number;
  /** 新しい会議を作ったか（話し手の数） */
  open: number;
}

// ---------------------------------------------------------------- 開く・止める

/** 段 I2 を止める（計測の比べ・テスト）。止めると会議を作らず、目標も効かない（段 I2 の前と同じ） */
export const BOARD_OFF = { on: false };
const newStat = (): BoardStat => ({ held: 0, one: 0, bulk: 0, skip: 0, auto: 0, items: 0, changed: 0, plan: [0, 0, 0], budget: [0, 0, 0], other: [0, 0], met: 0, missed: 0, flags: 0 });
export const boardOf = (s: P1State): BoardState => (s.board ??= { agenda: null, goals: {}, last: [], stat: newStat() });
/** 会議が開くのを待っているか（画面が開く） */
export const boardDue = (s: P1State) => !BOARD_OFF.on && !!s.board?.agenda && s.board.agenda.items.some((x) => !x.done);
export const deptKey = (d: DeptId) => `d:${d}`;
/**
 * 年初の回（段 K の「経営方針発表会」を兼ねる回）：会社の年の最初の四半期の会議（四半期の番号 1・5・9…。会社の月は最初から 30 日ごと、1 年は 4 四半期）
 */
export const isYearOpening = (a: Pick<BoardAgenda, 'q'>) => (a.q - 1) % 4 === 0;
/** 会社の何年目の会議か（1 始まり） */
export const yearOfBoard = (a: Pick<BoardAgenda, 'q'>) => Math.floor((a.q - 1) / 4) + 1;
/**
 * 段 K へのつなぎ口（DOM なし）：会議を閉じる前（1 人ずつ・一括承認・飛ばす・開かずに＝自動プレイ のどれでも、残りを推奨で決める前）に呼ぶ。
 * 年初の回に方針が決まっていなければ、標準の方針で決める、などに使う（いまは空）
 */
export const BOARD_FINISH_HOOKS: ((s: P1State, a: BoardAgenda, how: 'one' | 'bulk' | 'skip' | 'auto') => void)[] = [];
export const sectorKey = (id: string) => `s:${id}`;

// ---------------------------------------------------------------- 目標の押し上げ（budget.ts・model.ts・hr.ts から）

const goalOf = (s: Pick<P1State, 'board'>, key: string) => (BOARD_OFF.on ? undefined : s.board?.goals[key]);
/** 目標の上乗せ（0・0.1・0.2） */
export const raiseOf = (s: Pick<P1State, 'board'>, key: string) => goalOf(s, key)?.raise ?? 0;
/** 労力の倍率（目標を上げた部門は従業員の負荷が上がる＝同じ人数で多く働く） */
export const laborPush = (s: Pick<P1State, 'board'>, d: DeptId) => 1 + raiseOf(s, deptKey(d)) * BOARD.push.labor;
/** 月に打つ施策の数（目標を BOARD.push.move 以上に上げた部門は +1） */
export const perHeadOf = (s: Pick<P1State, 'board'>, d: DeptId) => BUDGET.perHead + (raiseOf(s, deptKey(d)) >= BOARD.push.move - 1e-9 ? 1 : 0);
/** セクター長の売上の倍率に足す分（目標の上乗せ × BOARD.push.sector） */
export const sectorPush = (s: Pick<P1State, 'board'>, id: string) => raiseOf(s, sectorKey(id)) * BOARD.push.sector;
/**
 * 士気の目標の 1 項目「目標の重さ」（hr.ts の moraleParts の goal。ほかの所では数えない）：そのヒーローが話し手の目標ごとに、
 * 上乗せ 10% で −per10（予算も同じだけ上げれば × eased）・予算を削られた 10% で −cut・目標はそのままで予算が増えた 10% で +up（upMax まで）
 */
export function goalMorale(s: Pick<P1State, 'board'>, hero: number): number {
  if (BOARD_OFF.on || !s.board) return 0;
  const M = BOARD.morale;
  let v = 0;
  for (const g of Object.values(s.board.goals)) {
    if (g.hero !== hero) continue;
    const r10 = g.raise * 10;
    const u10 = g.up * 10;
    if (g.raise > 0) v -= M.per10 * r10 * (g.up >= g.raise - 1e-9 ? M.eased : 1);
    else if (g.up > 0) v += Math.min(M.upMax, M.up * u10);
    if (g.up < 0) v -= M.cut * -u10;
  }
  return Math.round(v * 10) / 10;
}

// ---------------------------------------------------------------- 議題を作る

const rd1000 = (v: number) => Math.round(v / BUDGET.round) * BUDGET.round;
/** ★（出来と Lv。budget.ts の starOfHead・card.ts の starOf と同じ決まり） */
const starOf = (q: number, lv: number): 1 | 2 | 3 => (q >= 0.87 && lv >= 20 ? 3 : q >= 0.8 || lv >= 10 ? 2 : 1);
/** セクター長の出来（0.5〜0.95）：セクター長の売上の倍率（適性を入れたもの）から */
export function sectorQ(st: Staff): number {
  const rate = managerRate(managerApt(st.stats)) + fitSector(st.hero);
  return Math.max(0.5, Math.min(0.95, 0.5 + (rate - MANAGER.min) * 0.5));
}
/** 盛り（0 以上）：(1 − 出来) × pad × (0.4〜1) */
const padOf = (q: number, r: number) => Math.round(Math.max(0, (1 - q) * BOARD.pad * (0.4 + 0.6 * r)) * 1000) / 1000;
/** セクター長のいる町（いま経営している町を除く） */
export function sectorHeads(s: P1State): { id: string; st: Staff }[] {
  const out: { id: string; st: Staff }[] = [];
  if (!s.land) return out;
  for (const id of s.land.mine) {
    if (id === s.land.cur) continue;
    const rec = s.land.recs[id];
    if (!rec?.base || rec.manager == null || rec.revive) continue;
    const st = staffOf(s, rec.manager);
    if (st && st.task === 'manager' && st.target === id) out.push({ id, st });
  }
  return out;
}
/** 社内監査（経理部長。経理が開いていて部長がいるとき） */
export function auditorOf(s: P1State): { hero: number; star: 1 | 2 | 3 } | null {
  if (!budgetDepts(s).includes('accounting')) return null;
  const H = headOf(s, 'accounting');
  return H ? { hero: H.hero, star: headStar(s, 'accounting') ?? 1 } : null;
}
/** 監査が見抜ける盛りの下限（経理部長の ★） */
export const auditSee = (star: 1 | 2 | 3) => BOARD.audit.see[star];

/**
 * 部長のいない部門に置けるヒーロー（段 UI7a の任命の候補 pickList・おすすめ pickBest：ほかの役に就いていない・休憩中でない、いちばん出来の高い人。
 * 持ち場の仕事とは兼ねる）。理解度のいちばん高い部門、同じなら出来の高い組み合わせ
 */
function heroAsk(s: P1State): BoardOther | null {
  let best: { dept: DeptId; hero: number; q: number; lvl: number } | null = null;
  for (const d of budgetDepts(s)) {
    if (headOf(s, d)) continue;
    const list = pickList(s, { kind: 'head', dept: d }, null, false);
    const hero = pickBest(list);
    if (hero == null) continue;
    const q = list.find((x) => x.st.hero === hero)!.q;
    const lvl = deptLevel(s, d);
    if (!best || lvl > best.lvl || (lvl === best.lvl && q > best.q)) best = { dept: d, hero, q, lvl };
  }
  return best ? { k: 'hero', dept: best.dept, hero: best.hero, lvl: best.lvl } : null;
}

/** 部門の議題 1 つ */
function deptItem(s: P1State, d: DeptId, auditor: BoardAgenda['auditor'], q: number): BoardItem | null {
  const H = headOf(s, d);
  if (!H) return null;
  const B = deptBudget(s, d);
  const qq = quality(H, d);
  const star = headStar(s, d) ?? 1;
  const rnd = rndOf(s, 9001 + d.length * 31 + d.charCodeAt(0) * 7 + q * 13);
  const pads = { report: padOf(qq, rnd()), plan: padOf(qq, rnd()), ask: padOf(qq, rnd()) };
  const key = deptKey(d);
  const prev = boardOf(s).last.find((x) => x.key === key) ?? null;
  // 来期の計画：いまの見込みの大きい施策（月 perHead 件）× 3 か月 × share
  const ms = nextMoves(s, d, BUDGET.perHead);
  const f = Math.round(ms.reduce((a, m) => a + valG(s, m.unit, m.real), 0) * BOARD.months * BOARD.share);
  const plan = { moves: ms.map((m) => m.nm), f, rep: Math.round(f * (1 + pads.plan)) };
  // 必要予算：この四半期に頼みが 2 か月以上なら 1 段上（盛りつき）、ほかは据え置き
  const cur = amountOf(s, d);
  const up = (B.qask ?? 0) >= 2;
  let ask: BoardItem['ask'] = { up: false, cur, amt: cur, lv: B.lv };
  if (up) {
    const nu = nextUp(s, d);
    const amt = Math.min(BUDGET.max, rd1000(nu.to * (1 + pads.ask)));
    ask = amt > cur ? { up: true, cur, amt, lv: amt === nu.to ? nu.lv : 'X' } : ask;
  }
  // その他の要求：RP を使う施策（見込みの大きい 3 件の中）
  const rpMove = nextMoves(s, d, 3).find((m) => (m.rp ?? 0) > 0 && m.act.k === 'skill');
  const other: BoardOther | null = rpMove && rpMove.act.k === 'skill' ? { k: 'rp', id: rpMove.act.id, rp: rpMove.rp ?? 0, nm: rpMove.nm } : null;
  // 予実：この四半期の記録（はじめての四半期・版 25 のセーブで記録が無ければ、先月の記録）
  const was = B.qamt
    ? { amt: Math.round(B.qamt), used: Math.round(B.qused ?? 0), acts: B.qn ?? 0, names: [...(B.qnm ?? [])] }
    : { amt: Math.round(B.last?.amt ?? amountOf(s, d)), used: Math.round(B.last?.used ?? 0), acts: B.last?.acts.length ?? 0, names: (B.last?.acts ?? []).map((x) => x.nm).slice(-4) };
  const audit = auditor && auditor.hero !== H.hero ? auditFor(auditor.star, prev, pads, ask.up, f) : null;
  return { key, kind: 'dept', dept: d, hero: H.hero, star, was, prev, plan, ask, other, pads, audit, rec: { plan: 0, budget: 0, other: 0 }, pick: { plan: 0, budget: 0, other: 0 }, done: false };
}
/** 監査の指摘（前の四半期の報告の盛り・甘い計画・盛った予算の要求） */
function auditFor(star: 1 | 2 | 3, prev: BoardResult | null, pads: BoardItem['pads'], up: boolean, f: number): NonNullable<BoardItem['audit']> {
  const see = auditSee(star);
  const repPad = prev && prev.got > 0 ? prev.claimed / prev.got - 1 : 0;
  return { report: !!prev && repPad >= see, plan: f > 0 && pads.plan >= see, ask: up && pads.ask >= see };
}
/** セクター長の議題 1 つ */
function sectorItem(s: P1State, id: string, st: Staff, auditor: BoardAgenda['auditor'], q: number, m: number): BoardItem {
  const rec = s.land!.recs[id];
  const qq = sectorQ(st);
  const star = starOf(qq, st.level ?? 1);
  const rnd = rndOf(s, 7001 + id.charCodeAt(1) * 17 + id.length * 3 + q * 13);
  const pads = { report: padOf(qq, rnd()), plan: padOf(qq, rnd()), ask: padOf(qq, rnd()) };
  const key = sectorKey(id);
  const prev = boardOf(s).last.find((x) => x.key === key) ?? null;
  const logs = rec.log.filter((x) => x.m > m - 3 && x.m <= m);
  const was = { profit: logs.reduce((a, x) => a + x.profit, 0), invest: logs.reduce((a, x) => a + x.invest, 0), toHQ: logs.reduce((a, x) => a + x.toHQ, 0) };
  // 来期の計画：前の四半期の利益（無ければ、離れたときの売上からの見込み）
  const b = rec.base!;
  const guess = (b.rev * managerRate(managerApt(st.stats)) * (1 - b.matRate) - b.fixed) * BOARD.months;
  const f = Math.max(0, Math.round(logs.length ? (was.profit * BOARD.months) / logs.length : guess));
  const plan = { moves: [] as string[], f, rep: Math.round(f * (1 + pads.plan)) };
  const ask = { up: false, cur: rec.invest, amt: rec.invest, lv: 'X' as BudgetLv };
  const audit = auditor && auditor.hero !== st.hero ? auditFor(auditor.star, prev, pads, false, f) : null;
  return { key, kind: 'sector', sector: id, hero: st.hero, star, was, prev, plan, ask, other: null, pads, audit, rec: { plan: 0, budget: 0, other: 0 }, pick: { plan: 0, budget: 0, other: 0 }, done: false };
}
/** 推奨（経営企画の見立て）：計画は承認・据え置きの予算は承認・増額の要求は「前の目標に届いた（監査があれば監査の数字で）・監査の指摘なし」なら承認、ほかは据え置き。
 * その他：RP は承認・ヒーローは部門の理解度が BOARD.heroAt 以上なら承認 */
function recOf(it: BoardItem, audited: boolean): BoardPick {
  const proven = !!it.prev && (audited ? it.prev.ok : it.prev.okRep);
  const budget: BoardPick['budget'] = !it.ask.up ? 0 : proven && !it.audit?.ask ? 0 : 2;
  const other: BoardPick['other'] = it.other?.k === 'hero' ? (it.other.lvl >= BOARD.heroAt ? 0 : 1) : 0;
  return { plan: 0, budget, other };
}

/** 会議の議題を作る（四半期の締め。部長のいる部門・セクター長がいなければ null） */
export function boardAgenda(s: P1State, q: number, m: number): BoardAgenda | null {
  if (BOARD_OFF.on || !budgetOpen(s)) return null;
  const auditor = auditorOf(s);
  const items: BoardItem[] = [];
  for (const d of budgetDepts(s)) {
    const it = deptItem(s, d, auditor, q);
    if (it) items.push(it);
  }
  for (const x of sectorHeads(s)) items.push(sectorItem(s, x.id, x.st, auditor, q, m));
  if (!items.length) return null;
  // ヒーローの追加の要求は 1 つ：人事部長（いなければ、その他の要求の無い最初の部長）が持ってくる
  const ha = heroAsk(s);
  if (ha) {
    const host = items.find((x) => x.dept === 'hr') ?? items.find((x) => x.kind === 'dept' && !x.other);
    if (host && !(host.dept === 'hr' && host.other)) host.other = ha;
  }
  for (const it of items) {
    it.rec = recOf(it, !!it.audit);
    it.pick = { ...it.rec };
  }
  return { q, day: s.day, m, items, auditor };
}

// ---------------------------------------------------------------- 選択肢（画面と決める処理が同じ数字を使う）

/** 予算の 3 つの選択肢（承認・増額・減額）の額（セクター長は投資の割合） */
export function budgetOpts(it: BoardItem): number[] {
  if (it.kind === 'sector') {
    const cs = MANAGER.choices;
    const i = Math.max(0, cs.findIndex((x) => Math.abs(x - it.ask.cur) < 1e-9));
    return [it.ask.cur, cs[Math.min(cs.length - 1, i + 1)], cs[Math.max(0, i - 1)]];
  }
  return [it.ask.amt, rd1000(it.ask.amt * (1 + BOARD.budget)), it.ask.up ? it.ask.cur : rd1000(it.ask.amt * (1 - BOARD.budget))];
}
/** 予算の増減の割合（いまの額から） */
export function upOf(it: BoardItem, pick: BoardPick['budget']): number {
  const v = budgetOpts(it)[pick];
  if (it.kind === 'sector') return Math.round((v - it.ask.cur) * 100) / 100 > 0 ? BOARD.budget : v < it.ask.cur - 1e-9 ? -BOARD.budget : 0;
  return it.ask.cur > 0 ? Math.round(((v - it.ask.cur) / it.ask.cur) * 100) / 100 : v > 0 ? 1 : 0;
}

// ---------------------------------------------------------------- 決める

/** 1 人分を決める（選んだ番号。決めたら done）。予算は段 I1 の setBudget、ヒーローは setHead、目標は goals に */
export function decide(s: P1State, it: BoardItem, pick: BoardPick = it.pick): void {
  if (it.done) return;
  const B = boardOf(s);
  const A = B.agenda;
  it.pick = { ...pick };
  it.done = true;
  const st = B.stat;
  st.items++;
  if (pick.plan !== it.rec.plan || pick.budget !== it.rec.budget || (it.other && pick.other !== it.rec.other)) st.changed++;
  st.plan[pick.plan]++;
  st.budget[pick.budget]++;
  if (it.other) st.other[pick.other]++;
  if (it.audit && (it.audit.report || it.audit.plan || it.audit.ask)) st.flags++;
  // 見込みが 0 の計画は上げられない（押せない選択肢。自動・テストから来ても 0）
  const raise = canRaise(it) ? BOARD.plan[pick.plan] : 0;
  const up = upOf(it, pick.budget);
  if (it.kind === 'dept' && it.dept) {
    const d = it.dept;
    const v = budgetOpts(it)[pick.budget];
    if (pick.budget === 0) {
      if (it.ask.up) setBudget(s, d, it.ask.lv, it.ask.amt);
    } else if (!(pick.budget === 2 && it.ask.up)) setBudget(s, d, 'X', v);
    const DB = deptBudget(s, d);
    if (it.other?.k === 'rp') DB.noRp = pick.other === 1 ? true : undefined;
    else DB.noRp = undefined;
  } else if (it.sector && s.land?.recs[it.sector]) {
    s.land.recs[it.sector].invest = budgetOpts(it)[pick.budget];
  }
  if (it.other?.k === 'hero' && pick.other === 0) setHead(s, it.other.dept, it.other.hero);
  B.goals[it.key] = { key: it.key, hero: it.hero, q: A?.q ?? 0, f: it.plan.f, rep: it.plan.rep, raise, up, pad: it.pads.report, m: A?.m ?? Math.round(s.day / DAYS) };
}
/** 会議を終える（残りは推奨で決める）。how：one＝1 人ずつ・bulk＝一括承認・skip＝飛ばした・auto＝開かずに（自動プレイ・次の四半期まで開かなかった） */
export function boardFinish(s: P1State, how: 'one' | 'bulk' | 'skip' | 'auto'): BoardItem[] {
  const B = boardOf(s);
  const A = B.agenda;
  if (!A) return [];
  // 段 K：経営方針発表会の回なら、方針を決める（選んでいなければ推奨＝自動プレイの標準。policy.ts の presFinish）
  presFinish(s, A);
  for (const f of BOARD_FINISH_HOOKS) f(s, A, how);
  for (const it of A.items) if (!it.done) decide(s, it, it.rec);
  B.stat.held++;
  B.stat[how]++;
  B.agenda = null;
  return A.items;
}
/** 自動プレイ：会議は全部「推奨」で決める */
export const boardAuto = (s: P1State) => (boardDue(s) ? boardFinish(s, 'auto') : []);

// ---------------------------------------------------------------- 四半期の締め（model.ts の step）

/**
 * 四半期の締め（会社の月の締めで quarter のとき）：開かなかった会議は推奨で決め、前の四半期の目標の結果を出し（上げた目標は士気に）、
 * 新しい会議の議題を作る。m：締めた会社の月
 */
export function boardQuarter(s: P1State, q: number, m: number): BoardClose | null {
  if (BOARD_OFF.on) return null;
  if (!s.board && !budgetOpen(s)) return null;
  const B = boardOf(s);
  if (B.agenda) boardFinish(s, 'auto');
  // 前の四半期の目標の結果
  const res: BoardResult[] = [];
  for (const g of Object.values(B.goals)) {
    let got = 0;
    if (g.key.startsWith('d:')) got = s.budget?.depts[g.key.slice(2) as DeptId]?.qv ?? 0;
    else {
      const rec = s.land?.recs[g.key.slice(2)];
      got = (rec?.log ?? []).filter((x) => x.m > g.m && x.m <= g.m + BOARD.months).reduce((a, x) => a + x.profit, 0);
    }
    got = Math.round(got);
    const target = Math.round(g.f * (1 + g.raise));
    const targetRep = Math.round(g.rep * (1 + g.raise));
    const claimed = Math.round(got * (1 + g.pad));
    const ok = got >= target;
    res.push({ key: g.key, hero: g.hero, q: g.q, raise: g.raise, target, targetRep, got, claimed, ok, okRep: claimed >= targetRep });
    if (ok) B.stat.met++;
    else B.stat.missed++;
    // 上げた目標：届けば士気 +・届かなければ −（その場で。チュートリアルのあいだは動かない）
    const st = staffOf(s, g.hero);
    if (st && g.raise > 0 && growthOn(s)) st.morale = Math.max(0, Math.min(100, (st.morale ?? 70) + (ok ? BOARD.morale.hit : BOARD.morale.miss)));
  }
  B.last = res;
  B.goals = {};
  // 新しい会議の議題（この四半期の記録・結果から）を作ってから、四半期の記録を 0 から
  B.agenda = boardAgenda(s, q + 1, m);
  for (const DB of Object.values(s.budget?.depts ?? {})) {
    if (!DB) continue;
    DB.qv = 0;
    DB.qn = 0;
    DB.qamt = 0;
    DB.qused = 0;
    DB.qask = 0;
    DB.qnm = [];
    DB.noRp = undefined;
  }
  const met = res.filter((x) => x.ok).length;
  if (!res.length && !B.agenda) return null;
  return { q, met, missed: res.length - met, open: B.agenda?.items.length ?? 0 };
}

// ---------------------------------------------------------------- 画面・セリフの文

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 話し手の名前の肩書き（「物流部長」「ウメコタウンのセクター長」） */
export function roleOf(it: BoardItem): string {
  if (it.dept) return t(`${DEPT[it.dept].name}部長`, `Head of ${DEPT[it.dept].name}`);
  return t(`${sectorDef(it.sector!).name}のセクター長`, `Sector head, ${sectorDef(it.sector!).name}`);
}
/** 話し手の看板（部門のアイコン・名前） */
export const itemTitle = (it: BoardItem) => (it.dept ? `${DEPT[it.dept].icon} ${DEPT[it.dept].name}` : `🏙 ${sectorDef(it.sector!).name}`);
/** 予実の報告のひと言（部長の口ぶり。60 字まで） */
export function reportLine(it: BoardItem): string {
  const p = it.prev;
  if (p) {
    const core = p.okRep
      ? t(`結論から。前期は目標 ${g(p.targetRep)} に対し ${g(p.claimed)}、達成です`, `bottom line: ${g(p.claimed)} against a ${g(p.targetRep)} target. Achieved`)
      : t(`結論から。前期は目標 ${g(p.targetRep)} に対し ${g(p.claimed)}、未達です`, `bottom line: ${g(p.claimed)} against a ${g(p.targetRep)} target. Short`);
    return heroLine(it.hero, core);
  }
  if ('acts' in it.was) return heroLine(it.hero, it.was.acts ? t(`実績です。施策 ${it.was.acts} 件を予算 ${g(it.was.used)} で打ちました`, `results: ${it.was.acts} moves done for ${g(it.was.used)}`) : t('実績です。予算に合う手が無く、施策は見送りました', 'results: nothing fit the budget, so we held off'));
  return heroLine(it.hero, t(`実績です。利益 ${g(it.was.profit)}、本社へ ${g(it.was.toHQ)} 送りました`, `results: profit ${g(it.was.profit)}, ${g(it.was.toHQ)} sent to HQ`));
}
/** 来期の計画のひと言 */
export function planLine(it: BoardItem): string {
  if (it.kind === 'sector') return heroLine(it.hero, t(`来期は利益 ${g(it.plan.rep)} を取りにいきます`, `next quarter I’ll go for ${g(it.plan.rep)} profit`));
  if (!it.plan.moves.length) return heroLine(it.hero, t('来期は守りです。打てる手が出たら、すぐ動きます', 'next quarter we hold; I’ll move the moment a play opens'));
  const nm = it.plan.moves[0];
  return heroLine(it.hero, t(`来期は「${nm}」を軸に、成果 ${g(it.plan.rep)} を取りにいきます`, `next quarter: “${nm}” first, going for ${g(it.plan.rep)}`));
}
/** 必要予算のひと言 */
export function askLine(it: BoardItem): string {
  if (it.kind === 'sector') return heroLine(it.hero, t(`投資の割合は ${pct(it.ask.cur)} のまま回せます`, `I can run it at ${pct(it.ask.cur)} reinvestment`));
  if (it.ask.up) return heroLine(it.hero, t(`月 ${g(it.ask.amt)} あれば、止まっている施策を動かせます`, `with ${g(it.ask.amt)} / mo I can unblock the stalled moves`));
  return heroLine(it.hero, t(`予算は月 ${g(it.ask.cur)}（${lvName(it.ask.lv)}）のまま回せます`, `I can run it on ${g(it.ask.cur)} / mo (${lvName(it.ask.lv)})`));
}
/** その他の要求のひと言 */
export function otherLine(it: BoardItem): string | null {
  const o = it.other;
  if (!o) return null;
  if (o.k === 'rp') return heroLine(it.hero, t(`もう 1 件。研究「${o.nm}」に ${o.rp} RP の決裁を`, `one more: approve ${o.rp} RP for “${o.nm}”`));
  return heroLine(it.hero, t(`もう 1 件。空席の${DEPT[o.dept].name}部長に${heroNm(o.hero)}を推します`, `one more: I nominate ${heroNm(o.hero)} to head ${DEPT[o.dept].name}`));
}
/** 目標を上げられるか（来期の見込みが 0 なら、上乗せの選択肢は押せない） */
export const canRaise = (it: BoardItem) => it.plan.f > 0;
/** 計画の選択肢の名前 */
export const planOptText = (k: number) => (k === 0 ? t('承認', 'Approve') : t(`目標 +${Math.round(BOARD.plan[k] * 100)}%`, `Target +${Math.round(BOARD.plan[k] * 100)}%`));
/**
 * 予算の選択肢の名前（額つき）。名前の % と、額の「いま → 決めたあと」は同じ比べ（いまの額から）で書く（読み手が混乱しないように）：
 * - 承認：要求どおり（増額の要求なら「承認：+N%（要求どおり）」、ほかは「承認：据え置き」）
 * - 増額：いまの額から +N%（増額の要求のときは、要求 +20% を、いまの額からの % で）
 * - 減額：いまの額から −20%。増額の要求のときは「据え置き（要求を見送る）」＝いまの額のまま
 * 額は「月 20,000 → 24,000 G」（変わらなければ「月 20,000 G のまま」）。セクター長は投資の割合
 */
export function budgetOptText(it: BoardItem, k: number): { name: string; val: string } {
  const v = budgetOpts(it)[k];
  const cur = it.ask.cur;
  if (it.kind === 'sector') {
    const val = Math.abs(v - cur) < 1e-9 ? t(`投資 ${pct(cur)} のまま`, `Reinvest ${pct(cur)} (unchanged)`) : t(`投資 ${pct(cur)} → ${pct(v)}`, `Reinvest ${pct(cur)} → ${pct(v)}`);
    if (k === 0) return { name: t('承認：据え置き', 'Approve: keep'), val };
    return { name: k === 1 ? t('増額', 'Raise') : t('減額', 'Cut'), val };
  }
  const same = Math.abs(v - cur) < 0.5;
  const val = same ? t(`月 ${g(cur)} のまま`, `${g(cur)} / mo (unchanged)`) : t(`月 ${g(cur).replace(' G', '')} → ${g(v)}`, `${g(cur).replace(' G', '')} → ${g(v)} / mo`);
  const d = cur > 0 ? Math.round(((v - cur) / cur) * 100) : 0;
  const sd = d > 0 ? `+${d}%` : d < 0 ? `−${-d}%` : '±0%';
  if (k === 0) return { name: it.ask.up && !same ? t(`承認：${sd}（要求どおり）`, `Approve: ${sd} (as asked)`) : t('承認：据え置き', 'Approve: keep'), val };
  if (k === 1) return { name: t(`増額 ${sd}`, `Raise ${sd}`), val };
  if (it.ask.up) return { name: t('据え置き（要求を見送る）', 'Keep (decline the ask)'), val };
  return { name: t(`減額 ${sd}`, `Cut ${sd}`), val };
}
/** 選んだ目標の上乗せで、士気の目標がどれだけ動くか（画面の見込み） */
export function moraleHint(it: BoardItem, pick: BoardPick): number {
  return goalMorale({ board: { agenda: null, goals: { x: { key: 'x', hero: it.hero, q: 0, f: 0, rep: 0, raise: BOARD.plan[pick.plan], up: upOf(it, pick.budget), pad: 0, m: 0 } }, last: [], stat: newStat() } }, it.hero);
}
/** 監査の指摘の文（画面。指摘が無ければ空） */
export function auditLines(it: BoardItem): string[] {
  const a = it.audit;
  if (!a) return [];
  const out: string[] = [];
  if (a.report && it.prev) out.push(t(`盛った報告：前期の実績は報告 ${g(it.prev.claimed)} → 監査 ${g(it.prev.got)}（${it.prev.ok ? '目標には届いている' : '目標に届いていない'}）`, `Inflated report: last quarter ${g(it.prev.claimed)} reported → ${g(it.prev.got)} audited (${it.prev.ok ? 'target met' : 'target missed'})`));
  if (a.plan) out.push(t(`甘い計画：来期の見込み ${g(it.plan.rep)} → 監査 ${g(it.plan.f)}（+${pct(it.pads.plan)} 盛っている）`, `Rosy plan: ${g(it.plan.rep)} projected → ${g(it.plan.f)} audited (+${pct(it.pads.plan)})`));
  if (a.ask) out.push(t(`盛った要求：必要な予算は月 ${g(it.ask.amt / (1 + it.pads.ask))} ほど（+${pct(it.pads.ask)}）`, `Padded request: about ${g(it.ask.amt / (1 + it.pads.ask))} / mo is needed (+${pct(it.pads.ask)})`));
  return out;
}
/** 結果のまとめの数（画面）：承認・変えた・却下や減額 */
export function boardSummary(items: BoardItem[]): { ok: number; raised: number; cut: number; denied: number; up: number } {
  let ok = 0;
  let raised = 0;
  let cut = 0;
  let denied = 0;
  let up = 0;
  for (const it of items) {
    if (it.pick.plan === 0 && it.pick.budget === 0 && (!it.other || it.pick.other === 0)) ok++;
    if (it.pick.plan > 0) raised++;
    if (it.pick.budget === 1) up++;
    if (it.pick.budget === 2) cut++;
    if (it.other && it.pick.other === 1) denied++;
  }
  return { ok, raised, cut, denied, up };
}
/** 締めのトースト（main.ts） */
export function closeText(c: BoardClose): string | null {
  if (!c.met && !c.missed) return c.open ? t(`🏛 第 ${c.q + 1} 四半期の経営会議を開きます（${c.open} 人）`, `🏛 Q${c.q + 1} board meeting (${c.open} speakers)`) : null;
  return t(`📊 第 ${c.q} 四半期の目標：届いた ${c.met}・届かなかった ${c.missed}`, `📊 Q${c.q} targets: ${c.met} met, ${c.missed} missed`);
}
