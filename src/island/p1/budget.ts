/**
 * 段 I1：Rare からの「予算で任せる」（DOM なし：model.ts の step・deleg.ts の delegMonth・card.ts・budgetui.ts・orgui.ts・自動プレイ・テストが使う）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 I1 の実装」、数字は data.ts の BUDGET（1 か所）。
 *
 * - 会社が Rare の町に出店すると開く（budgetOpen）：理解度に関係なく、開いている全部門（経営企画＝社長を除く）に部長を置ける（deleg.ts の headLeft）。
 * - 部門ごとに月の予算（段：小・中・大 か 数字）。予算は「部長が使ってよい上限」で、お金を取り分けない（余りは会社に戻る＝使わなければ減らない）。
 *   1 か月は町の月の締めから次の締めまで（締めで「先月」へ移して 0 から）。
 * - 部長は月の締めで、その部門の施策（いまの部長の提案の候補＝いまのゲームで取れる手）を見込みの大きい順に、予算と労力の中で BUDGET.perHead 件まで実行する
 *   （budgetTry。承認と同じ approve → applyPlan）。予算・労力が足りない施策は、いままでどおり部長の提案として受け箱へ（社長が承認すれば打てる）。
 * - 施策ごとに「費用（G）」と「労力（人日）」。労力は部長自身の手（★ で増える）と、部門の従業員（人数の数字。1 人 BUDGET.crew.labor 人日／月）で払う。
 *   足りなければ部長が上限（プレイヤーが決める）まで雇う。給料は毎日（お店の従業員と同じ形）、その部門の予算から。労力が余る月が続くと 1 人減らす。
 * - ★ が高い・史実の適性が高い部長ほど「予算の効き」が大きい（同じ施策を安く・少ない労力で）：費用 ÷ 効き・労力 ÷ 効き。
 * - 予算の使い切り・予算を超える施策・労力不足・成果なし（打てない月が続く）の月は、部長から頼み（ask）。card.ts が「予算を増やしてください」
 *   「人を雇わせてください」のカードにする（月 1 枚まで）。
 * - 予算の決め方は関数（setBudget・setBudgets・setCrewCap）に分けてある：段 I2 の経営会議から同じ関数で決める。
 */
import { t } from '../../i18n';
import { BUDGET, DEPT, DEPTS, SHOP, type DeptId, type Tier } from './data';
import { book, topTierOf, type LedgerKey } from './company';
import { menuDepts } from './dept';
import { actName, actOk, approve, candidates, headOf, ifsOf, newDeleg, quality, reserveOf, type PropAct, type PropUnit, type Proposal } from './deleg';
import { DAYS, type P1State, type Report } from './model';
import { gradeOf, P2_OFF } from './voice';

// ---------------------------------------------------------------- 型

/** 予算の段：小・中・大・数字（amt） */
export type BudgetLv = 'S' | 'M' | 'L' | 'X';
export const BUDGET_LVS: BudgetLv[] = ['S', 'M', 'L', 'X'];
/** 部長が予算の中で実行した施策（今月・先月） */
export interface BudgetAct {
  act: PropAct;
  /** 実行したときの名前（画面・報告） */
  nm: string;
  /** 払った額（予算の効きを入れたあと）・使った労力（人日）・見込み */
  cost: number;
  labor: number;
  est: number;
  unit: PropUnit;
  /** 部長の提案の id（翌月の「提案の結果」と結ぶ） */
  pid: number;
}
/** 部長からの頼み：over＝施策が予算の残りを超えた・spent＝予算を使い切った・labor＝人手（従業員の上限）が足りない・idle＝成果なし（打てない月が続く） */
export interface BudgetAsk {
  why: 'over' | 'spent' | 'labor' | 'idle';
  /** 打てなかった施策（受け箱の提案の id）・その費用・足りない労力（人日） */
  pid?: number;
  act?: PropAct;
  cost?: number;
  need?: number;
  est?: number;
}
export interface DeptBudget {
  lv: BudgetLv;
  /** 数字で決めた額（lv が 'X'） */
  amt?: number;
  /** 従業員の数・上限（プレイヤーが決める） */
  crew: number;
  cap: number;
  /** 今月使った額（施策 ＋ 従業員の給料）・使った労力（人日）・実行した施策 */
  used: number;
  labor: number;
  acts: BudgetAct[];
  /** 先月の記録（締めで移す） */
  last?: { amt: number; used: number; labor: number; laborCap: number; acts: BudgetAct[]; crew: number };
  /** 労力が 1 人ぶん以上余った月の続き（BUDGET.crew.idle で 1 人減らす）・施策を打てなかった月の続き（成果なし） */
  idle?: number;
  dry?: number;
  /** 今月の締めで出た頼み（次の締めで消える） */
  ask?: BudgetAsk | null;
}
export interface BudgetStat {
  /** 予算の中で実行した施策の数・額・予算の効きで浮いた額・雇った人・減らした人・頼みの数 */
  acts: number;
  spent: number;
  saved: number;
  hired: number;
  fired: number;
  wages: number;
  asks: Partial<Record<BudgetAsk['why'], number>>;
}
export interface BudgetState {
  depts: Partial<Record<DeptId, DeptBudget>>;
  stat: BudgetStat;
}
/** 月次報告の 1 行（budget.ts の budgetReport） */
export interface BudgetReport {
  depts: { dept: DeptId; hero: number | null; amt: number; used: number; acts: number; cost: number; crew: number; ask?: BudgetAsk['why'] }[];
}

// ---------------------------------------------------------------- 開く・止める

/** 段 I1 を止める（計測の「I1 なし」・テスト）。止めると段 I1 の前と同じ通し */
export const BUDGET_OFF = { on: false };
const ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
/** 予算で任せられるか（会社が BUDGET.from の町に出店したことがある） */
export const budgetOpen = (s: Pick<P1State, 'tier' | 'land'>) => !BUDGET_OFF.on && ORDER.indexOf(topTierOf(s)) >= ORDER.indexOf(BUDGET.from);
/** 予算を渡す部門（開いている部門のうち、社長の経営企画を除く） */
export const budgetDepts = (s: P1State): DeptId[] => menuDepts(s).filter((d) => d !== 'strategy');
const newStat = (): BudgetStat => ({ acts: 0, spent: 0, saved: 0, hired: 0, fired: 0, wages: 0, asks: {} });
export const budgetOf = (s: P1State): BudgetState => (s.budget ??= { depts: {}, stat: newStat() });
/** 部門の予算（無ければ「中」・従業員 0 人・上限 BUDGET.crew.cap で作る） */
export function deptBudget(s: P1State, d: DeptId): DeptBudget {
  const B = budgetOf(s);
  return (B.depts[d] ??= { lv: 'M', crew: 0, cap: BUDGET.crew.cap, used: 0, labor: 0, acts: [] });
}

// ---------------------------------------------------------------- 額・労力・効き

/** 予算の段の元：いまの町の先月の売上 */
export const budgetBase = (s: P1State) => s.reports[s.reports.length - 1]?.revenue ?? 0;
/**
 * 段の額（部門ごと）：先月の売上 × 割合。売上が小さい月（着いたばかりの町）は、会社の格の下限を「中」にして、小・大は同じ比で
 * （中 × 小の割合 ÷ 中の割合 など。段どうしが同じ額にならない）。丸める
 */
export function amountFor(s: P1State, lv: Exclude<BudgetLv, 'X'>): number {
  const mid = Math.max(BUDGET.floor[topTierOf(s)], budgetBase(s) * BUDGET.rate.M);
  const v = (mid * BUDGET.rate[lv]) / BUDGET.rate.M;
  return Math.round(v / BUDGET.round) * BUDGET.round;
}
/** 部門の今月の予算（G／月） */
export function amountOf(s: P1State, d: DeptId): number {
  const B = deptBudget(s, d);
  return B.lv === 'X' ? Math.max(0, Math.min(BUDGET.max, B.amt ?? 0)) : amountFor(s, B.lv);
}
/** 従業員 1 人の月の給料 */
export const crewWageMonth = () => BUDGET.crew.wage * DAYS;
/** 今月の締めまでの残りの日（給料のこれからのぶん） */
export function daysLeft(s: P1State): number {
  if (s.open == null) return DAYS;
  const k = (s.day - s.open) % DAYS;
  return Math.max(0, DAYS - k);
}
/** 部長の読みの確かさ ★（出来と Lv。card.ts の starOf と同じ決まり） */
function starOfHead(q: number, lv: number): 1 | 2 | 3 {
  if (q >= 0.87 && lv >= 20) return 3;
  if (q >= 0.8 || lv >= 10) return 2;
  return 1;
}
/** 部長の ★（部長がいなければ null） */
export function headStar(s: P1State, d: DeptId): 1 | 2 | 3 | null {
  const H = headOf(s, d);
  return H ? starOfHead(quality(H, d), H.level ?? 1) : null;
}
/** 予算の効き：1 ＋ ★ のぶん ＋ 史実の適性のぶん（部長がいなければ 1） */
export function effOf(s: P1State, d: DeptId): number {
  const H = headOf(s, d);
  if (!H) return 1;
  const star = starOfHead(quality(H, d), H.level ?? 1);
  const g = P2_OFF.fit ? null : gradeOf(H.hero, d);
  return 1 + BUDGET.eff.star * (star - 1) + (g ? BUDGET.eff.fit[g] : 0);
}
/** 予算の効きの内訳（画面：★ のぶん・適性のぶん） */
export function effParts(s: P1State, d: DeptId): { star: number; fit: number; grade: string | null; total: number } {
  const H = headOf(s, d);
  if (!H) return { star: 0, fit: 0, grade: null, total: 1 };
  const star = starOfHead(quality(H, d), H.level ?? 1);
  const g = P2_OFF.fit ? null : gradeOf(H.hero, d);
  return { star: BUDGET.eff.star * (star - 1), fit: g ? BUDGET.eff.fit[g] : 0, grade: g, total: effOf(s, d) };
}
/** 部長自身の手（人日／月） */
export function handOf(s: P1State, d: DeptId): number {
  const star = headStar(s, d);
  return star == null ? 0 : BUDGET.hand.base + BUDGET.hand.star * (star - 1);
}
/** 部門の月の労力（人日）：部長の手 ＋ 従業員 */
export const laborCap = (s: P1State, d: DeptId) => handOf(s, d) + deptBudget(s, d).crew * BUDGET.crew.labor;
/** 施策の労力（人日。効きを入れる前） */
export const laborOf = (a: Pick<PropAct, 'k'>) => BUDGET.labor[a.k] ?? BUDGET.laborDef;
/** その部長が払う労力（効きで減る。1 人日から） */
export const laborNeed = (s: P1State, d: DeptId, a: Pick<PropAct, 'k'>) => Math.max(1, Math.ceil(laborOf(a) / effOf(s, d)));
/** その部長が払う費用（効きで減る） */
export const costNeed = (s: P1State, d: DeptId, cost: number) => Math.round(cost / effOf(s, d));
/** 今月の残りの予算（使った額と、これから払う従業員の給料を引いたもの） */
export function restOf(s: P1State, d: DeptId): number {
  const B = deptBudget(s, d);
  return Math.max(0, amountOf(s, d) - B.used - B.crew * BUDGET.crew.wage * daysLeft(s));
}
/** 部長が施策にお金を使ったあとも会社に残すお金（ひと月の給料・維持費・お店と部門の従業員・少し） */
export function headReserve(s: P1State): number {
  const part = Object.values(s.shops).reduce((a, sh) => a + (sh?.part ?? 0), 0) * SHOP.partTimeWage * DAYS;
  const crew = Object.values(s.budget?.depts ?? {}).reduce((a, B) => a + (B?.crew ?? 0), 0) * crewWageMonth();
  return reserveOf(s) + part + crew + 3000;
}

// ---------------------------------------------------------------- 決める（段 I2 の経営会議も同じ関数で）

/** 部門の予算を決める（段・数字）。数字は 0〜BUDGET.max に丸める */
export function setBudget(s: P1State, d: DeptId, lv: BudgetLv, amt?: number): void {
  const B = deptBudget(s, d);
  B.lv = lv;
  if (lv === 'X') B.amt = Math.max(0, Math.min(BUDGET.max, Math.round((amt ?? amountOf(s, d)) / BUDGET.round) * BUDGET.round));
  else delete B.amt;
}
/** まとめて決める（予算の画面の「全部門を」・段 I2 の経営会議の承認） */
export function setBudgets(s: P1State, plan: Partial<Record<DeptId, { lv: BudgetLv; amt?: number }>>): void {
  for (const [d, x] of Object.entries(plan) as [DeptId, { lv: BudgetLv; amt?: number }][]) if (x) setBudget(s, d, x.lv, x.amt);
}
/** 従業員の上限を決める（0〜BUDGET.crew.capMax）。いまの人数が上限を超えていれば、その場で上限まで減らす */
export function setCrewCap(s: P1State, d: DeptId, cap: number): void {
  const B = deptBudget(s, d);
  B.cap = Math.max(0, Math.min(BUDGET.crew.capMax, Math.round(cap)));
  if (B.crew > B.cap) {
    budgetOf(s).stat.fired += B.crew - B.cap;
    B.crew = B.cap;
  }
}
/**
 * 1 段上の予算（頼みのカード・予算の画面の頼みの行）：小 → 中 → 大 → 数字（いまの 1.5 倍）。頼みの施策の費用（cost）があれば、
 * 今月それを打てる額（使った額 ＋ これからの給料 ＋ 費用）に届く、いちばん小さい段（届かなければその額の数字）
 */
export function nextUp(s: P1State, d: DeptId, cost = 0): { lv: BudgetLv; amt?: number; to: number } {
  const B = deptBudget(s, d);
  const cur = amountOf(s, d);
  const need = cost > 0 ? B.used + B.crew * BUDGET.crew.wage * daysLeft(s) + cost : 0;
  const ups: { lv: BudgetLv; to: number }[] = [];
  if (B.lv === 'S') ups.push({ lv: 'M', to: amountFor(s, 'M') });
  if (B.lv === 'S' || B.lv === 'M') ups.push({ lv: 'L', to: amountFor(s, 'L') });
  const hit = ups.find((x) => x.to > cur && x.to >= need);
  if (hit) return hit;
  const to = Math.min(BUDGET.max, Math.ceil(Math.max(cur * 1.5, need) / BUDGET.round) * BUDGET.round);
  return { lv: 'X', amt: to, to };
}

// ---------------------------------------------------------------- 1 日・月の締め

/** 1 日：部門の従業員の給料（毎日。その部門の予算から。お店の従業員と同じ形） */
export function budgetDay(s: P1State): void {
  if (!s.budget || !budgetOpen(s)) return;
  for (const [, B] of Object.entries(s.budget.depts) as [DeptId, DeptBudget][]) {
    if (!B?.crew) continue;
    const pay = B.crew * BUDGET.crew.wage;
    s.money -= pay;
    s.monthCost.wages = (s.monthCost.wages ?? 0) + pay;
    book(s, 'wages', pay);
    B.used += pay;
    s.budget.stat.wages += pay;
  }
}
/** 月の締め（町の月の締めの、部長の施策の前）：今月の記録を「先月」へ移して 0 から。労力が余る月が続けば 1 人減らす。成果なしの月を数える */
export function budgetClose(s: P1State): void {
  if (!s.budget || !budgetOpen(s)) return;
  for (const d of DEPTS.map((x) => x.id)) {
    const B = s.budget.depts[d];
    if (!B) continue;
    const cap = laborCap(s, d);
    B.last = { amt: amountOf(s, d), used: Math.round(B.used), labor: B.labor, laborCap: cap, acts: B.acts, crew: B.crew };
    const head = !!headOf(s, d);
    // 労力が 1 人ぶん以上余った月が続く → 1 人減らす（部長が予算の中で判断）
    if (B.crew > 0 && cap - B.labor >= BUDGET.crew.labor) B.idle = (B.idle ?? 0) + 1;
    else B.idle = 0;
    if (B.crew > 0 && (B.idle ?? 0) >= BUDGET.crew.idle) {
      B.crew--;
      B.idle = 0;
      s.budget.stat.fired++;
    }
    // 成果なし：部長がいて、施策を 1 つも打てなかった月の続き
    B.dry = head && !B.acts.length ? (B.dry ?? 0) + 1 : 0;
    B.used = 0;
    B.labor = 0;
    B.acts = [];
    B.ask = null;
  }
}

/** 帳簿と今月の費用の写し（予算の効きで、払った額を割り引く・割り増す） */
function snap(s: P1State) {
  return { money: s.money, cur: { ...(s.books?.cur ?? {}) } as Record<string, number>, cost: { ...s.monthCost } as Record<string, number> };
}
/** 払った額に f を掛ける（帳簿・今月の費用・お金を同じ割合で）。払った額（掛けたあと）を返す */
function scaleSpent(s: P1State, before: ReturnType<typeof snap>, f: number): { spent: number; saved: number } {
  const spent = before.money - s.money;
  if (spent <= 0 || f === 1) return { spent: Math.max(0, spent), saved: 0 };
  const back = Math.round(spent * (1 - f));
  if (!back) return { spent, saved: 0 };
  // 帳簿の科目ごとの増えを、同じ割合で戻す（科目の割り振りはそのまま）
  const cur = s.books?.cur as unknown as Record<string, number> | undefined;
  if (cur) {
    const ks = Object.keys(cur).filter((k) => (cur[k] ?? 0) - (before.cur[k] ?? 0) > 0 && k !== 'sales');
    const tot = ks.reduce((a, k) => a + cur[k] - (before.cur[k] ?? 0), 0);
    if (tot > 0) for (const k of ks) book(s, k as LedgerKey, -Math.round((back * (cur[k] - (before.cur[k] ?? 0))) / tot));
  }
  const mc = s.monthCost as unknown as Record<string, number>;
  const cks = Object.keys(mc).filter((k) => (mc[k] ?? 0) - (before.cost[k] ?? 0) > 0);
  const ctot = cks.reduce((a, k) => a + mc[k] - (before.cost[k] ?? 0), 0);
  if (ctot > 0) for (const k of cks) mc[k] -= Math.round((back * (mc[k] - (before.cost[k] ?? 0))) / ctot);
  s.money += back;
  return { spent: spent - back, saved: back };
}

export type TryRes = 'done' | 'over' | 'labor' | 'cash' | 'skip';
/**
 * 部長が予算の中で施策を実行する（deleg.ts の delegMonth から。月の締め）。予算・労力が足りなければ頼み（ask）を残して実行しない（提案は受け箱へ）。
 * 会社のお金が足りない（給料・維持費を残せない）・打てない手は 'cash'・'skip'（頼みは出さない）
 */
export function budgetTry(s: P1State, p: Proposal): TryRes {
  if (!budgetOpen(s) || p.src || p.est <= 0) return 'skip';
  const d = p.dept;
  if (d === 'strategy' || !headOf(s, d)) return 'skip';
  const B = deptBudget(s, d);
  const BS = budgetOf(s);
  const eff = effOf(s, d);
  const cost = costNeed(s, d, p.cost);
  const rest = restOf(s, d);
  const amt = amountOf(s, d);
  const ask = (a: BudgetAsk) => {
    // 頼みは 1 部門 1 つ（いちばん見込みの大きい施策のもの＝最初に止まったもの）
    if (!B.ask) {
      B.ask = { ...a, act: p.act, est: p.est };
      BS.stat.asks[a.why] = (BS.stat.asks[a.why] ?? 0) + 1;
    }
  };
  if (cost > rest) {
    ask({ why: (B.dry ?? 0) >= BUDGET.ask.idle ? 'idle' : amt > 0 && B.used >= amt * BUDGET.ask.spent ? 'spent' : 'over', pid: p.id, cost });
    return 'over';
  }
  if (s.money - cost < headReserve(s) || (p.rp ?? 0) > (s.rp ?? 0)) return 'cash';
  // 労力：足りなければ上限まで雇う（これからの給料も予算の残りから）
  const need = laborNeed(s, d, p.act);
  const free = laborCap(s, d) - B.labor;
  let hires = 0;
  if (need > free) {
    hires = Math.ceil((need - free) / BUDGET.crew.labor);
    const wageAdd = hires * BUDGET.crew.wage * daysLeft(s);
    if (B.crew + hires > B.cap) {
      ask({ why: 'labor', pid: p.id, need: need - free, cost });
      return 'labor';
    }
    if (cost + wageAdd > rest) {
      ask({ why: (B.dry ?? 0) >= BUDGET.ask.idle ? 'idle' : 'over', pid: p.id, cost: cost + wageAdd });
      return 'over';
    }
  }
  // 実行（承認と同じ：一緒に変わるもの全部を一気に）
  const D = (s.deleg ??= newDeleg());
  if (!D.inbox.includes(p)) D.inbox.push(p);
  const before = snap(s);
  const e = approve(s, p.id);
  if (e != null) {
    D.inbox = D.inbox.filter((x) => x !== p);
    return e === 'money' || e === 'rp' ? 'cash' : 'skip';
  }
  if (hires) {
    B.crew += hires;
    BS.stat.hired += hires;
  }
  const r = scaleSpent(s, before, 1 / eff);
  B.used += r.spent;
  B.labor += need;
  B.acts.push({ act: p.act, nm: actName(s, p.act), cost: r.spent, labor: need, est: p.est, unit: p.unit, pid: p.id });
  BS.stat.acts++;
  BS.stat.spent += r.spent;
  BS.stat.saved += r.saved;
  return 'done';
}
/** 頼みを聞いたあと（予算を上げた・上限を上げた）：その部門の受け箱の提案（頼みの施策）を、もう一度予算の中で打てるか試す */
export function budgetRetry(s: P1State, d: DeptId): TryRes {
  const B = deptBudget(s, d);
  const p = B.ask?.pid != null ? s.deleg?.inbox.find((x) => x.id === B.ask!.pid) : undefined;
  if (!p) return 'skip';
  B.ask = null;
  const r = budgetTry(s, p);
  return r;
}

/** 次に打ちたい施策（予算の画面）：部長の候補を見込みの大きい順に n 件。費用・労力（効きを入れたあと）と、いまの予算で打てるか */
export interface NextMove {
  act: PropAct;
  nm: string;
  cost: number;
  labor: number;
  real: number;
  unit: PropUnit;
  rp?: number;
  /** ok＝予算と労力の中・over＝予算の残りを超える・labor＝従業員の上限で労力が足りない・hire＝従業員を雇えば打てる */
  fit: 'ok' | 'over' | 'labor' | 'hire';
}
export function nextMoves(s: P1State, d: DeptId, n = 2, ifs = ifsOf(s)): NextMove[] {
  if (d === 'strategy' || !headOf(s, d)) return [];
  const B = deptBudget(s, d);
  const rest = restOf(s, d);
  const free = laborCap(s, d) - B.labor;
  return candidates(s, d, ifs)
    .filter((c) => c.real > 0 && actOk(s, c.act) && !(s.deleg?.inbox ?? []).some((p) => JSON.stringify(p.act) === JSON.stringify(c.act)))
    .sort((a, b) => b.real - a.real)
    .slice(0, n)
    .map((c) => {
      const cost = costNeed(s, d, c.cost);
      const labor = laborNeed(s, d, c.act);
      const hires = labor > free ? Math.ceil((labor - free) / BUDGET.crew.labor) : 0;
      const wage = hires * BUDGET.crew.wage * daysLeft(s);
      const fit: NextMove['fit'] = cost > rest ? 'over' : hires && B.crew + hires > B.cap ? 'labor' : hires && cost + wage > rest ? 'over' : hires ? 'hire' : 'ok';
      return { act: c.act, nm: actName(s, c.act), cost, labor, real: c.real, unit: c.unit, rp: c.rp, fit };
    });
}

/** 月次報告の 1 行の中身（部長のいる、予算で任せた部門） */
export function budgetReport(s: P1State, r: Report): void {
  if (!s.budget || !budgetOpen(s)) return;
  const depts: BudgetReport['depts'] = [];
  for (const d of budgetDepts(s)) {
    const B = s.budget.depts[d];
    const H = headOf(s, d);
    if (!B || !H) continue;
    depts.push({ dept: d, hero: H.hero, amt: B.last?.amt ?? amountOf(s, d), used: B.last?.used ?? 0, acts: B.acts.length, cost: B.acts.reduce((a, x) => a + x.cost, 0), crew: B.crew, ...(B.ask ? { ask: B.ask.why } : {}) });
  }
  if (depts.length) r.budget = { depts };
}

// ---------------------------------------------------------------- 画面・報告の文

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
export const lvName = (lv: BudgetLv) => ({ S: t('小', 'S'), M: t('中', 'M'), L: t('大', 'L'), X: t('数字', 'Set') })[lv];
/** 頼みの一言（予算の画面・会話。60 字まで） */
export function askText(s: P1State, d: DeptId, a: BudgetAsk): string {
  const B = deptBudget(s, d);
  switch (a.why) {
    case 'over':
      return t(`次の施策に予算から ${g(a.cost ?? 0)} 要るが、今月の予算の残りは ${g(restOf(s, d))}。予算を増やしてほしい`, `The next move needs ${g(a.cost ?? 0)} from the budget, but only ${g(restOf(s, d))} is left. Please raise the budget`);
    case 'spent':
      return t(`今月の予算 ${g(amountOf(s, d))} を使い切った。打てる手がまだある`, `This month’s ${g(amountOf(s, d))} is spent, and there is more to do`);
    case 'labor':
      return t(`人手が ${a.need ?? 0} 人日足りない。従業員の上限 ${B.cap} 人では回らない`, `Short by ${a.need ?? 0} person-days. A cap of ${B.cap} staff isn’t enough`);
    case 'idle':
      return t(`${B.dry ?? 0} か月、予算の中で打てる手が無く、成果が出ていない`, `For ${B.dry ?? 0} months the budget hasn’t covered a single move`);
  }
}
/** 月次報告の「担当の報告」に足す 1 行（予算で任せた部門・施策・従業員） */
export function budgetLine(r: { budget?: BudgetReport }): [string, string] | null {
  const b = r.budget;
  if (!b?.depts.length) return null;
  const acts = b.depts.reduce((a, x) => a + x.acts, 0);
  const cost = b.depts.reduce((a, x) => a + x.cost, 0);
  const crew = b.depts.reduce((a, x) => a + x.crew, 0);
  const asks = b.depts.filter((x) => x.ask).length;
  return [
    t(`💰 予算で任せた ${b.depts.length} 部門：施策 ${acts} 件（${g(cost)}）・従業員 ${crew} 人${asks ? `・部長からの頼み ${asks}` : ''}`, `💰 ${b.depts.length} budgeted depts: ${acts} moves (${g(cost)}) · ${crew} staff${asks ? ` · ${asks} requests` : ''}`),
    t(`予算 ${acts} 件`, `${acts} budget moves`),
  ];
}
/** 部門の名前（画面） */
export const deptNm = (d: DeptId) => DEPT[d].name;
/** 部長の名前（無ければ null） */
export const headHero = (s: P1State, d: DeptId) => headOf(s, d)?.hero ?? null;
/** 部長がいて予算で回している部門の数 */
export const budgetHeads = (s: P1State) => (budgetOpen(s) ? budgetDepts(s).filter((d) => !!headOf(s, d)).length : 0);
/** 部門の従業員の合計（組織図・見出し） */
export const crewTotal = (s: P1State) => Object.values(s.budget?.depts ?? {}).reduce((a, B) => a + (B?.crew ?? 0), 0);
/** 給料（部門の従業員の月の合計） */
export const crewWages = (s: P1State) => crewTotal(s) * crewWageMonth();
