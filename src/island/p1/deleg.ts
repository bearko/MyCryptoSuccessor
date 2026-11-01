/**
 * 任せ方の 4 段（ロードマップ段 D。DOM なし：model.ts の step・main.ts・delegui.ts・自動プレイ・テストが使う）。
 * チームリーダー（業務を 1 つ任せる。理解度 3）・事業部長（部門を丸ごと任せる。理解度 8）と部長の提案のカード・セクター長（いまのセクタのマネージャーと復興の委任）・昇進。
 * 仕様は docs/ISLAND_PHASE1.md「任せ方」、数字は data.ts の DELEG（1 か所）。
 *
 * 役目は Staff に持つ（task 'lead'・target 'L:業務' ／ 'H:部門'）。ほかの仕事には就かない（役目の枠を 1 つ使う）。外すと task は null（手に戻る）。
 * セクター長は、いまのマネージャー（task 'manager'）の呼び名。数字（runSector・reviveMonth）は変えない。
 */
import { isEn, t } from '../../i18n';
import { heroById } from '../../game/catalog';
import { DEF } from '../defs';
import { ADS, DELEG, DEPT, DEPTS, DEPT_DUTIES, DUTIES, DUTY, HERO_GROWTH, INVEST, P1B, PASSIVES, SKILL, TIERS, UNCOMMON, DIG_BALANCE, aptitude, deptApt, deptOf, relicSells, sku, skuParts, techSkill, type DeptId, type DutyId, type Mat, type Sku, type Task } from './data';
import { deptLevel, menuDepts } from './dept';
import {
  DAYS,
  LOT,
  adCost,
  allowedDirs,
  applyPermit,
  aptOf,
  areaShares,
  assign,
  batchOf,
  bestSkillMove,
  build,
  canBuild,
  craftCheck,
  craftDays,
  fullUse,
  has,
  hasRoute,
  hire,
  investCost,
  invest,
  knownOf,
  layoutOf,
  leadDays,
  leadDig,
  matPrice,
  nextLevelCost,
  learn,
  levelLock,
  levelUp,
  lvOf,
  myShops,
  myWorkshop,
  order,
  permitFee,
  poolFree,
  priceOf,
  procLeft,
  procMats,
  productsOf,
  recipeOf,
  relicMinCraft,
  rng,
  runAd,
  sellEstimate,
  sellNow,
  sellWhatIf,
  setRest,
  setShelf,
  shelfCount,
  skillLock,
  stageCaps,
  staffOf,
  takeVacant,
  tierOk,
  unitCost,
  vacantErr,
  wageOf,
  whatIf,
  wholesaler,
  bottleneck,
  type P1State,
  type Report,
  type Staff,
  type Stage,
  type StageIf,
} from './model';
import { siteCandidates } from './trade';
import type { SectorRec } from './company';

// ---------------------------------------------------------------- 役目

const LKEY = (d: DutyId) => `L:${d}`;
const HKEY = (d: DeptId) => `H:${d}`;
/** ヒーローの役目（リーダー・部長・セクター長）。無ければ null */
export type Role = { kind: 'leader'; dept: DeptId; duty: DutyId } | { kind: 'head'; dept: DeptId } | { kind: 'sector'; sector: string };
export function roleOf(st: Pick<Staff, 'task' | 'target'>): Role | null {
  if (st.task === 'manager' && typeof st.target === 'string') return { kind: 'sector', sector: st.target };
  if (st.task !== 'lead' || typeof st.target !== 'string') return null;
  const [k, id] = st.target.split(':');
  if (k === 'L' && DUTY[id as DutyId]) return { kind: 'leader', dept: DUTY[id as DutyId].dept, duty: id as DutyId };
  if (k === 'H' && DEPT[id as DeptId]) return { kind: 'head', dept: id as DeptId };
  return null;
}
export const leaderOf = (s: Pick<P1State, 'staff'>, d: DutyId) => s.staff.find((x) => x.task === 'lead' && x.target === LKEY(d)) ?? null;
export const headOf = (s: Pick<P1State, 'staff'>, d: DeptId) => s.staff.find((x) => x.task === 'lead' && x.target === HKEY(d)) ?? null;
/** 事業部長のいる部門 */
export const headDepts = (s: Pick<P1State, 'staff'>): DeptId[] => DEPTS.map((d) => d.id).filter((d) => headOf(s, d));
/** 任せた業務（リーダーか部長が回している） */
export const delegatedDuties = (s: Pick<P1State, 'staff'>): DutyId[] => DUTIES.map((d) => d.id).filter((d) => !!runnerOf(s, d));

/**
 * 出来（0〜1。手でやると 1）：部門に向く能力値・Lv・その部門のパッシブで決まる。7〜9 割から始まり、Lv とパッシブで上がる（cap まで）
 */
export function quality(st: Pick<Staff, 'stats' | 'level' | 'passives'>, d: DeptId): number {
  const Q = DELEG.q;
  const a = Math.max(0, Math.min(1, (deptApt(st.stats, d) - Q.aptLo) / (Q.aptHi - Q.aptLo)));
  const lv = Math.min(Q.lvMax, Q.lv * Math.max(0, (st.level ?? 1) - 1));
  const pas = (st.passives ?? []).filter((p) => PASSIVES[p.k].dept === d).reduce((x, p) => x + Q.passive * (1 + HERO_GROWTH.passiveStep * Math.max(0, p.tier - 1)), 0);
  return Math.min(Q.cap, Q.lo + (Q.hi - Q.lo) * a + lv + pas);
}
/** 出来の内訳（任命の画面：能力値・Lv・パッシブのぶん） */
export function qualityParts(st: Pick<Staff, 'stats' | 'level' | 'passives'>, d: DeptId): { base: number; lv: number; passive: number; total: number } {
  const Q = DELEG.q;
  const a = Math.max(0, Math.min(1, (deptApt(st.stats, d) - Q.aptLo) / (Q.aptHi - Q.aptLo)));
  const lv = Math.min(Q.lvMax, Q.lv * Math.max(0, (st.level ?? 1) - 1));
  const total = quality(st, d);
  return { base: Q.lo + (Q.hi - Q.lo) * a, lv, passive: Math.max(0, total - (Q.lo + (Q.hi - Q.lo) * a) - lv), total };
}
/** 業務を回している人と出来：リーダー（部長の下なら出来 +underHead）→ いなければ部長 */
export function runnerOf(s: Pick<P1State, 'staff'>, d: DutyId): { st: Staff; q: number; by: 'leader' | 'head' } | null {
  const dept = DUTY[d].dept;
  const L = leaderOf(s, d);
  const H = headOf(s, dept);
  if (L) return { st: L, q: Math.min(DELEG.q.cap, quality(L, dept) + (H ? DELEG.q.underHead : 0)), by: 'leader' };
  if (H) return { st: H, q: quality(H, dept), by: 'head' };
  return null;
}
/** 部長の補正（部門の効き目に掛ける ±。部長がいなければ 0） */
export function headFx(s: Pick<P1State, 'staff'> | undefined, d: DeptId): number {
  if (!s?.staff) return 0;
  const H = headOf(s, d);
  return H ? (quality(H, d) - 0.85) * DELEG.headFx : 0;
}
/** 見直す間隔（日）：出来が低いほど間があく */
export function everyOf(q: number): number {
  const E = DELEG.every;
  const f = Math.max(0, Math.min(1, (q - DELEG.q.lo) / (DELEG.q.cap - DELEG.q.lo)));
  return Math.max(E.fast, Math.round(E.slow - (E.slow - E.fast) * f));
}

/** リーダーを置けるまでの理解度の残り（置けるなら 0）。部門がメニューに無ければ null */
export function leaderLeft(s: P1State, d: DeptId): number | null {
  if (!menuDepts(s).includes(d)) return null;
  return Math.max(0, DELEG.leaderAt - deptLevel(s, d));
}
export function headLeft(s: P1State, d: DeptId): number | null {
  if (!menuDepts(s).includes(d)) return null;
  return Math.max(0, DELEG.headAt - deptLevel(s, d));
}
export type DelegErr = 'closed' | 'locked' | 'no-staff' | 'away' | 'training';
/** 任命できるか（ヒーロー）：ほかのセクタのセクター長・修行中は不可 */
function pickErr(st: Staff | null): DelegErr | null {
  if (!st) return 'no-staff';
  if (st.task === 'manager') return 'away';
  if (st.task === 'train') return 'training';
  return null;
}
function clearRole(s: P1State, st: Staff) {
  releaseCover(s, st.hero);
  st.task = null;
  st.target = null;
}
/** 役目を外す（手に戻す）。その人は待機中に */
export function dismiss(s: P1State, hero: number): boolean {
  const st = staffOf(s, hero);
  if (!st || st.task !== 'lead') return false;
  clearRole(s, st);
  return true;
}
/** チームリーダーを置く（hero が null なら外す＝手に戻す）。いまの仕事・役目からは外れる（部長から下げることもできる） */
export function setLeader(s: P1State, d: DutyId, hero: number | null): DelegErr | null {
  const cur = leaderOf(s, d);
  if (hero == null) {
    if (cur) clearRole(s, cur);
    return null;
  }
  const left = leaderLeft(s, DUTY[d].dept);
  if (left == null) return 'closed';
  if (left > 0) return 'locked';
  const st = staffOf(s, hero);
  const e = pickErr(st);
  if (e) return e;
  if (cur && cur.hero !== hero) clearRole(s, cur);
  releaseCover(s, hero);
  if (st!.task !== 'lead') assign(s, hero, null);
  st!.task = 'lead';
  st!.target = LKEY(d);
  return null;
}
/** 事業部長を置く（昇進：その部門や別の部門のリーダーからでもよい）。hero が null なら外す */
export function setHead(s: P1State, d: DeptId, hero: number | null): DelegErr | null {
  const cur = headOf(s, d);
  if (hero == null) {
    if (cur) clearRole(s, cur);
    return null;
  }
  const left = headLeft(s, d);
  if (left == null) return 'closed';
  if (left > 0) return 'locked';
  const st = staffOf(s, hero);
  const e = pickErr(st);
  if (e) return e;
  if (cur && cur.hero !== hero) clearRole(s, cur);
  releaseCover(s, hero);
  if (st!.task !== 'lead') assign(s, hero, null);
  st!.task = 'lead';
  st!.target = HKEY(d);
  return null;
}
/** 役目の経験値（1 日）：部長 > リーダー（セクター長＝マネージャーは会社の月の締めで 30 日 × 20） */
export const roleXp = (st: Pick<Staff, 'task' | 'target'>) => {
  const r = roleOf(st);
  return r?.kind === 'head' ? HERO_GROWTH.xp.head : r?.kind === 'leader' ? HERO_GROWTH.xp.leader : 0;
};

// ---------------------------------------------------------------- セーブの中身

export interface DutyStat {
  /** 手を打った数（注文・入れ替え・配置など） */
  acts: number;
  /** 出来の悪さが出た数（素材切れの日・入れ替え待ちの日など。業務ごと） */
  miss: number;
  /** 業務ごとの数（発注した素材の数・作るものの見込みの割合 % など） */
  n: number;
  hero?: number;
  q?: number;
  by?: 'leader' | 'head';
}
/** 部長の提案で打つ手（いまのゲームで実際に取れる手） */
export type PropAct =
  | { k: 'invest'; id: string; uid: number }
  | { k: 'skill'; id: string }
  | { k: 'level'; id: string }
  | { k: 'build'; id: string; i: number; j: number; dir: 'rd' | 'ld' | 'lu' | 'ru' }
  | { k: 'hire'; hero: number; task: Task; target: number | string | null }
  | { k: 'permit'; site: number }
  | { k: 'ad'; id: string }
  | { k: 'vacant'; uid: number };
/** 見込みの単位：G（月の粗利）・ad（宣伝の期間の粗利 − 費用）・finds（出土品の数）・share（商圏の取り分 %） */
export type PropUnit = 'G' | 'ad' | 'finds' | 'share';
export interface Proposal {
  id: number;
  dept: DeptId;
  hero: number;
  /** 出した月（このセクタの報告の月）・出したセクタ（ほかのセクタへ移ったら、その町の提案は消える） */
  month: number;
  sector?: string;
  act: PropAct;
  /** 見込み（部長の読み。誤差つき）と、誤差の幅（±割合） */
  est: number;
  err: number;
  unit: PropUnit;
  /** 段の流れの見込み（個／月。物流・人事・システム・経営企画） */
  units?: number;
  stage?: Stage;
  cost: number;
  rp?: number;
  /** 'held'：保留（自分で押した・資金不足） */
  status: 'new' | 'held';
  /** 資金不足・研究ポイント不足で保留になった */
  note?: 'money' | 'rp';
  /** 荒れ地の提案：いちばん奥の石板の層・出土品の数・お題 */
  dig?: { tablet: number | null; finds: number; topic: boolean };
}
/** 承認して実行した提案（翌月の報告で「提案の結果」） */
export interface PropDone {
  p: Proposal;
  /** 実行した月・はかる数（承認したときの値） */
  month: number;
  before: number;
}
export interface DelegState {
  /** 業務ごとの、次に見直す日 */
  next: Partial<Record<DutyId, number>>;
  /** 今月の記録（業務ごと。月の締めで報告へ移して空に） */
  stat: Partial<Record<DutyId, DutyStat>>;
  inbox: Proposal[];
  done: PropDone[];
  seq: number;
  /** 交代（休ませる）：代わりに入った人・休んでいる元の人・持ち場 */
  cover: { hero: number; for: number; task: 'craft' | 'shop'; target: number }[];
  /** 作るものの選択：いまのロットが終わったら替える（作業台の番号 → 商品） */
  pend: Record<number, Sku>;
  /** 宣伝：切れてからの日数（出し直したら消す） */
  adWait: Partial<Record<string, number>>;
  /** 採掘の端数 */
  carry: number;
  /** 今月届いた提案の数 */
  newProps: number;
}
export const newDeleg = (): DelegState => ({ next: {}, stat: {}, inbox: [], done: [], seq: 0, cover: [], pend: {}, adWait: {}, carry: 0, newProps: 0 });
const D = (s: P1State) => (s.deleg ??= newDeleg());

/** 月次報告の「担当の報告」 */
export interface DelegReport {
  duties: { id: DutyId; hero: number; by: 'leader' | 'head'; q: number; acts: number; miss: number; n: number }[];
  heads: { dept: DeptId; hero: number; q: number }[];
  /** 今月届いた提案・受け箱で待っている提案 */
  props: number;
  waiting: number;
  /** 先月承認した提案の結果 */
  results: { dept: DeptId; hero: number; act: PropAct; unit: PropUnit; est: number; units?: number; real: number }[];
}

// ---------------------------------------------------------------- 1 日の業務（model.ts の step から）

/** 手元に残すお金（ひと月の給料・維持費。リーダーがお金を使う手の下限） */
export function reserveOf(s: P1State): number {
  return s.staff.reduce((a, x) => a + x.wage, 0) + s.buildings.filter((b) => b.owner === 'me').reduce((a, b) => a + (P1B[b.id]?.upkeep ?? 0), 0) + 3000;
}
const strHash = (x: string) => [...x].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1000003, 7);
const rndOf = (s: P1State, salt: number) => rng(s.seed + s.day * 7919 + salt * 104729);
/** ±(1 − 出来) × k の誤差の倍率 */
const errMul = (r: () => number, q: number, k: number) => 1 + (r() * 2 - 1) * (1 - q) * k;

/** 1 日の業務：任せた業務を、見直しの日に回す（採掘・交代の戻しは毎日）。採掘で打ったマスを返す（地図の演出用） */
export function delegDay(s: P1State): ReturnType<typeof leadDigHits> {
  const any = s.staff.some((x) => x.task === 'lead');
  if (!any && !s.deleg?.cover.length) return [];
  const st = D(s);
  let hits: ReturnType<typeof leadDigHits> = [];
  // 作るものの選択：ロットが終わった作業台を替える
  for (const [k, x] of Object.entries(st.pend)) {
    const sl = s.slots[Number(k)];
    if (!sl) {
      delete st.pend[Number(k)];
      continue;
    }
    if (sl.running) continue;
    sl.sku = x;
    sl.repeat = true;
    sl.left = 0;
    sl.progress = 0;
    delete st.pend[Number(k)];
  }
  for (const d of DUTIES) {
    const r = runnerOf(s, d.id);
    if (!r) continue;
    const rec = (st.stat[d.id] ??= { acts: 0, miss: 0, n: 0 });
    rec.hero = r.st.hero;
    rec.q = r.q;
    rec.by = r.by;
    missOf(s, d.id, rec);
    if (d.id === 'dig') {
      hits = leadDigHits(s, r);
      rec.n += hits.length;
      continue;
    }
    if ((st.next[d.id] ?? 0) > s.day) continue;
    st.next[d.id] = s.day + everyOf(r.q);
    const rnd = rndOf(s, d.id.length * 31 + d.id.charCodeAt(0));
    RUN[d.id](s, r, rec, rnd);
  }
  backFromRest(s);
  return hits;
}

/** 出来の悪さの数（毎日） */
function missOf(s: P1State, d: DutyId, rec: DutyStat) {
  switch (d) {
    case 'order': {
      // 素材切れ：職人がいて作るものも決まっているのに、素材が無くて始められない作業台がある日
      // （できた商品が工房にたまっていて、調達を控えているあいだは数えない）
      if (s.slots.some((sl) => !sl.running && sl.sku && sl.worker != null && !staffOf(s, sl.worker)?.resting && !piled(s, sl.sku) && craftCheck(s, sl.sku, sl.worker) === 'mats')) rec.miss++;
      return;
    }
    case 'shelf': {
      // 入れ替え待ち：作っている商品が並んでいないお店に、作らなくなって在庫も無い商品の棚（か空の棚）がある日
      const made = madeSkus(s);
      if (!made.length) return;
      for (const b of myShops(s)) {
        const sh = s.shops[b.uid];
        if (!sh) continue;
        const missing = made.some((y) => !sh.shelves.includes(y) && leftOf(s, y) > 0);
        const dead = sh.shelves.some((x) => x == null || (!made.includes(x) && leftOf(s, x) <= 0));
        if (missing && dead) {
          rec.miss++;
          return;
        }
      }
      return;
    }
    case 'swap':
      if (vacancies(s).length) rec.miss++;
      return;
    case 'rest':
      if (uncovered(s).length) rec.miss++;
      return;
    case 'ads':
      for (const id of Object.keys(st0(s).adWait)) st0(s).adWait[id] = (st0(s).adWait[id] ?? 0) + 1;
      for (const a of ADS) if (s.ads[a.id] != null && (s.ads[a.id] ?? 0) <= 0 && st0(s).adWait[a.id] == null) st0(s).adWait[a.id] = 0;
      return;
    case 'vacant':
      if (s.area?.vacant.length) rec.miss++;
      return;
    default:
      return;
  }
}
const st0 = (s: P1State) => D(s);

type Runner = { st: Staff; q: number; by: 'leader' | 'head' };
const RUN: Record<DutyId, (s: P1State, r: Runner, rec: DutyStat, rnd: () => number) => void> = {
  order: doOrder,
  craft: doCraft,
  shelf: doShelf,
  swap: doSwap,
  rest: doRest,
  dig: () => undefined,
  ads: doAds,
  vacant: doVacant,
};

/** 作業台で作っている（作る予定の）商品 */
const madeSkus = (s: P1State): Sku[] => [...new Set([...s.slots.map((sl) => sl.sku), ...Object.values(s.deleg?.pend ?? {})].filter((x): x is Sku => !!x))];
/** その商品の残り（工房・お店の裏と棚・運んでいる途中） */
const leftOf = (s: P1State, z: Sku) => (s.stock[z] ?? 0) + Object.values(s.shops).reduce((a, q) => a + (q.storage[z] ?? 0) + (q.shelf[z] ?? 0), 0) + s.trips.reduce((a, t) => a + (t.cargo[z] ?? 0), 0);

/** できた商品が工房にたまっている（運ぶ・売るのが追いつくまで、素材を足さない。ロット 3 つぶん以上） */
const piled = (s: P1State, x: Sku) => (s.stock[x] ?? 0) >= batchOf(x, s) * 3;
/** 物流：素材の発注 */
function doOrder(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  // 品目：作業台の作るものに合わせる（指定した品目のうち作っていないもの・使わない追加の素材を外す）
  const made = new Set(s.slots.map((sl) => sl.sku).filter((x): x is Sku => !!x));
  if (s.proc.items.length && s.proc.items.some((x) => !made.has(x))) {
    s.proc.items = [];
    rec.acts++;
  }
  const used = new Set(procMats(s).filter((o) => o.from === 'item').map((o) => o.m));
  if (s.proc.extra.some((m) => !used.has(m))) {
    s.proc.extra = s.proc.extra.filter((m) => used.has(m));
    rec.acts++;
  }
  if (!myWorkshop(s) || !wholesaler(s)) return;
  // 注文：調達係が歩いていられない（いない・休んでいる）あいだに素材が切れそうなら、問屋にロットで頼む
  const full = fullUse(s, true);
  const buyer = s.staff.find((x) => x.task === 'buy');
  const lead = leadDays(s);
  const horizon = lead + everyOf(r.q) + DELEG.order.ahead;
  let budget = s.money - reserveOf(s);
  // できた商品がたまっている商品の素材は、注文しない（作りすぎて素材代をむだにしない）
  const busy = new Set(s.slots.filter((sl) => sl.sku && !piled(s, sl.sku)).flatMap((sl) => Object.keys(recipeOf(sl.sku!))));
  for (const { m } of procMats(s)) {
    const daily = (full[m] ?? 0) / DAYS;
    if (daily <= 0 || !busy.has(m)) continue;
    // 調達係が働いていれば、注文が届くまでに切れるときだけ（調達係の買い付けを優先。帰りの荷物は、注文より先に着くものだけ数える）
    const active = !!buyer && !buyer.resting;
    const trip = s.buyTrip && (!active || s.buyTrip.left <= lead) ? (s.buyTrip.cargo[m] ?? 0) : 0;
    const incoming = (s.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0) + trip;
    const have = (s.mats[m] ?? 0) + incoming;
    const need = active ? daily * (lead + 1) : daily * horizon;
    if (have >= need) continue;
    const want = daily * DELEG.order.days * errMul(rnd, r.q, DELEG.order.err);
    let lots = Math.max(1, Math.round(want / LOT));
    const price = matPrice(s, m as Mat) * LOT;
    lots = Math.min(lots, Math.floor(procLeft(s) / LOT), Math.floor(poolFree(s) / LOT), Math.floor(budget / Math.max(1, price)));
    if (lots <= 0) continue;
    if (order(s, m as Mat, lots) == null) {
      rec.acts++;
      rec.n += lots * LOT;
      budget -= lots * price;
    }
  }
}

/** その作業台の職人で作れるか（素材・置き場所は数えない） */
function canMake(s: P1State, x: Sku, worker: number | null): boolean {
  const e = craftCheck(s, x, worker);
  return e == null || e === 'mats' || e === 'full';
}
/**
 * 作るものの候補（売れる見込み × 粗利。作業台 1 つの月の量で頭打ち）。出来が低いほど見込みの誤差が大きい。
 * 返り値：作業台ごとの商品と、選んだ品ぞろえの本当の点 ÷ いちばん良い品ぞろえの点（見込みの割合）
 */
export function lineupFor(s: P1State, q: number, rnd: () => number): { plan: (Sku | null)[]; ratio: number } {
  const benches = s.slots.length;
  if (!benches) return { plan: [], ratio: 1 };
  const shops = myShops(s);
  const kinds = Math.max(1, Math.min(benches, Math.max(1, ...shops.map((b) => shelfCount(s, b)))));
  const tier = s.tier ?? 'C';
  const crew = s.staff.filter((x) => x.task !== 'manager' && x.task !== 'lead');
  const nU = crew.filter((x) => aptOf(s, x, 'craft') >= UNCOMMON.minCraft).length;
  const nR = crew.filter((x) => aptOf(s, x, 'craft') >= DIG_BALANCE.relic.rare.minCraft).length;
  const cands: { x: Sku; key: string; score: number; noisy: number }[] = [];
  const monthIdx = Math.floor(s.day / DAYS);
  void rnd;
  for (const p of productsOf(s)) {
    if (p.tech && !has(s, techSkill(p.tech))) continue;
    if (!tierOk(p, tier) || !relicSells(p, tier)) continue;
    for (const rr of p.relic ? [p.relic.rank] : (['C', 'U'] as const)) {
      const x = sku(p.key, rr);
      if (!Object.keys(recipeOf(x)).every((m) => hasRoute(s, m as Mat))) continue;
      if (rr === 'U' && (p.relic ? nU === 0 : !has(s, 'pot') || !s.dev.includes(p.key) || nU === 0)) continue;
      if (p.relic?.rare && nR === 0) continue;
      if (p.relic && !s.recipes?.[p.key]) continue;
      // 見込み：知られていない新商品は、知られたときの売れ方で（市場データのおすすめと同じ見方。並べれば認知は育つ）
      const est = Math.max(rr === 'U' ? 4 : 1, sellEstimate(s, p.key, rr) / Math.max(0.25, knownOf(s, p.key)));
      const pull = rr === 'U' ? UNCOMMON.pull : TIERS[tier].commonPull;
      const perBench = ((DAYS * 0.85) / craftDays(s, x)) * batchOf(x, s);
      const score = Math.min(est * pull, perBench) * (priceOf(s, x) - unitCost(s, x));
      // 読み違いは商品ごと・月ごとに同じ（毎日読み直して品ぞろえが揺れないように）。いま作っている商品は、少し良い候補では替えない
      const keep = s.slots.some((sl) => sl.sku === x) ? 1.1 : 1;
      cands.push({ x, key: p.key, score, noisy: score * keep * errMul(rng(s.seed + monthIdx * 131 + strHash(x)), q, DELEG.craftErr) });
    }
  }
  const pick = (by: 'score' | 'noisy') => {
    const out: Sku[] = [];
    let usedU = 0;
    for (const o of [...cands].sort((a, b) => b[by] - a[by] || a.x.localeCompare(b.x))) {
      if (out.length >= kinds) break;
      if (out.some((y) => skuParts(y)[0] === o.key)) continue;
      if (skuParts(o.x)[1] !== 'C') {
        if (usedU >= nU) continue;
        usedU++;
      }
      out.push(o.x);
    }
    return out;
  };
  const best = pick('score');
  const mine = pick('noisy');
  const sum = (xs: Sku[]) => xs.reduce((a, x) => a + (cands.find((c) => c.x === x)?.score ?? 0), 0);
  const ratio = sum(best) > 0 ? Math.min(1, sum(mine) / sum(best)) : 1;
  // 作業台ごと：並べる種類を順に（アンコモン・復刻品は作れる職人の台だけ。職人が作れなければ、見込みのいちばん良い基礎の商品）。
  // 職人のいない台は、そのまま（作るものを決めておけば、配置換えで向いている人が入る）
  const bestC = [...cands].filter((c) => skuParts(c.x)[1] === 'C').sort((a, b) => b.noisy - a.noisy)[0]?.x ?? null;
  const plan: (Sku | null)[] = [];
  for (let k = 0; k < benches; k++) {
    const w = s.slots[k].worker;
    const seq = mine.length ? [...mine.slice(k % mine.length), ...mine.slice(0, k % mine.length)] : [];
    plan.push(w == null ? (seq[0] ?? bestC) : (seq.find((x) => canMake(s, x, w)) ?? (bestC && canMake(s, bestC, w) ? bestC : null)));
  }
  return { plan, ratio };
}
/** 物流：作るものの選択 */
function doCraft(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  const { plan, ratio } = lineupFor(s, r.q, rnd);
  rec.n = Math.round(ratio * 100);
  const st = D(s);
  s.slots.forEach((sl, k) => {
    const x = plan[k];
    if (!x || sl.sku === x) {
      if (x && sl.sku === x && !sl.repeat) {
        sl.repeat = true;
        sl.left = 0;
      }
      delete st.pend[k];
      return;
    }
    rec.acts++;
    if (sl.running) {
      // いまのロットが終わったら替える
      st.pend[k] = x;
      return;
    }
    sl.sku = x;
    sl.repeat = true;
    sl.left = 0;
    sl.progress = 0;
  });
}

/** 物流：品出し（棚の入れ替え。作っている商品を並べ、作らなくなった商品は売り切ってから入れ替える） */
function doShelf(s: P1State, _r: Runner, rec: DutyStat) {
  const made = madeSkus(s);
  if (!made.length) return;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    const plan = [...sh.shelves];
    const missing = made.filter((y) => !plan.includes(y));
    plan.forEach((x, k) => {
      const dup = x != null && plan.indexOf(x) !== k;
      if (x && made.includes(x) && !dup) return;
      // 古い商品が残っているうちは、新しい商品ができるまで売り切る
      const i = missing.findIndex((y) => x == null || dup || (leftOf(s, y) > 0 && leftOf(s, x) <= 0));
      if (i < 0) return;
      const y = missing.splice(i, 1)[0];
      if (setShelf(s, b.uid, k, y)) {
        plan[k] = y;
        rec.acts++;
      }
    });
  }
}

/** 空いた持ち場（作るもののある作業台・店員のいないお店・運搬係・調達係）。詰まりの段から */
type Post = { task: 'craft' | 'shop' | 'transport' | 'buy'; target: number | null; min: number };
function vacancies(s: P1State): Post[] {
  const out: Post[] = [];
  s.slots.forEach((sl, k) => {
    if (sl.sku && sl.worker == null) out.push({ task: 'craft', target: k, min: skuParts(sl.sku)[1] !== 'C' ? relicMinCraft(skuParts(sl.sku)[0]) : 0 });
  });
  for (const b of myShops(s)) if (s.shops[b.uid] && s.shops[b.uid].staff == null && s.shops[b.uid].shelves.some((x) => x)) out.push({ task: 'shop', target: b.uid, min: 0 });
  if (myShops(s).length && !s.staff.some((x) => x.task === 'transport')) out.push({ task: 'transport', target: null, min: 0 });
  if (procMats(s).length && !s.staff.some((x) => x.task === 'buy') && (has(s, 'hire') || s.staff.length > 3)) out.push({ task: 'buy', target: null, min: 0 });
  return out;
}
const STAGE_TASK: Record<Stage, Post['task']> = { buy: 'buy', craft: 'craft', haul: 'transport', sell: 'shop' };
/** 人事：配置換え */
function doSwap(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  const posts = vacancies(s);
  // 詰まりの段：運搬が詰まりで、運搬係が 3 人より少なければ、もう 1 人
  const jam = myShops(s).length ? bottleneck(stageCaps(s)) : null;
  if (jam === 'haul' && s.staff.filter((x) => x.task === 'transport').length < 3) posts.push({ task: 'transport', target: null, min: 0 });
  if (!posts.length) return;
  if (jam) posts.sort((a, b) => Number(b.task === STAGE_TASK[jam]) - Number(a.task === STAGE_TASK[jam]));
  const covering = new Set(D(s).cover.map((c) => c.hero));
  for (const p of posts) {
    const idle = s.staff.filter((x) => x.task == null && !covering.has(x.hero) && aptOf(s, x, p.task) >= p.min).sort((a, b) => Number(a.resting) - Number(b.resting) || aptOf(s, b, p.task) - aptOf(s, a, p.task));
    if (!idle.length) continue;
    // 出来が低いと、いちばん向いている人を見落とすことがある
    const who = idle.length > 1 && rnd() > r.q ? idle[1] : idle[0];
    if (assign(s, who.hero, p.task, p.target) == null) rec.acts++;
  }
}

/** 休んでいて、代わりもいない持ち場（作るもののある作業台・アルバイトのいないお店） */
function uncovered(s: P1State): { task: 'craft' | 'shop'; target: number; hero: number }[] {
  const out: { task: 'craft' | 'shop'; target: number; hero: number }[] = [];
  s.slots.forEach((sl, k) => {
    const w = sl.worker != null ? staffOf(s, sl.worker) : null;
    if (sl.sku && w?.resting) out.push({ task: 'craft', target: k, hero: w.hero });
  });
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    const w = sh?.staff != null ? staffOf(s, sh.staff) : null;
    if (w?.resting && sh.part === 0) out.push({ task: 'shop', target: b.uid, hero: w.hero });
  }
  return out;
}
/** 人事：休ませる（交代） */
function doRest(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  const st = D(s);
  const covering = new Set(st.cover.map((c) => c.hero));
  for (const u of uncovered(s)) {
    const min = u.task === 'craft' && s.slots[u.target]?.sku && skuParts(s.slots[u.target].sku!)[1] !== 'C' ? relicMinCraft(skuParts(s.slots[u.target].sku!)[0]) : 0;
    const idle = s.staff.filter((x) => x.task == null && !x.resting && !covering.has(x.hero) && aptOf(s, x, u.task) >= min).sort((a, b) => aptOf(s, b, u.task) - aptOf(s, a, u.task));
    if (!idle.length) continue;
    const who = idle.length > 1 && rnd() > r.q ? idle[1] : idle[0];
    if (assign(s, who.hero, u.task, u.target) != null) continue;
    st.cover.push({ hero: who.hero, for: u.hero, task: u.task, target: u.target });
    covering.add(who.hero);
    rec.acts++;
  }
  // 待機中で疲れている人（スタミナが仕事に戻る目安より少ない）は休ませる（休むと 2 倍の速さで戻る）
  for (const x of s.staff) {
    if (x.task != null || x.resting || covering.has(x.hero)) continue;
    if (x.stamina < x.stats.hp * 0.6) {
      setRest(s, x.hero, true);
      rec.n++;
    }
  }
}
/** 交代の戻し（毎日）：元の人が休みから戻ったら持ち場を返す。元の人がほかの仕事に就いた・代わりの人が外れたら、記録だけ消す */
function backFromRest(s: P1State) {
  const st = s.deleg;
  if (!st?.cover.length) return;
  st.cover = st.cover.filter((c) => {
    const orig = staffOf(s, c.for);
    const cov = staffOf(s, c.hero);
    if (!orig || !cov || orig.task != null || cov.task !== c.task || cov.target !== c.target) return false;
    if (orig.resting) return true;
    assign(s, orig.hero, c.task, c.target);
    return false;
  });
}
/** 交代の記録から外す（その人に別の役目を付けたとき） */
function releaseCover(s: P1State, hero: number) {
  if (!s.deleg) return;
  s.deleg.cover = s.deleg.cover.filter((c) => c.hero !== hero && c.for !== hero);
}

/** R&D：荒れ地の採掘（毎日。発掘作業をしていない日に、許可のある荒れ地を少しずつ。お題のマスは手で掘る） */
function leadDigHits(s: P1State, r: Runner) {
  if (!s.dig || s.digRun) return [];
  return leadDig(s, r.st, DELEG.dig.rate * r.q);
}

/** 宣伝の見込み：宣伝のある日の売上の伸び（粗利）× 日数 − 費用（G） */
export function adGain(s: P1State, id: string): number {
  const ad = ADS.find((a) => a.id === id);
  if (!ad || !myShops(s).length) return 0;
  const base = sellNow(s).yen;
  const on = sellNow({ ...s, ads: { ...s.ads, [id]: ad.days } }).yen;
  return Math.round((on - base) * (ad.days / DAYS) * grossRate(s) - adCost(s, id));
}
/** マーケ：宣伝の出し直し */
function doAds(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  if (!myShops(s).length) return;
  const st = D(s);
  for (const a of ADS) {
    const left = s.ads[a.id];
    if (left == null || left > 0) continue;
    const g = adGain(s, a.id) * errMul(rnd, r.q, DELEG.adErr);
    if (g <= 0) {
      // 効かないと読んだ：出し直さない（切れたままの日には数えない）
      delete st.adWait[a.id];
      continue;
    }
    if (s.money < adCost(s, a.id) + reserveOf(s)) continue;
    if (runAd(s, a.id) == null) {
      rec.acts++;
      rec.miss += st.adWait[a.id] ?? 0;
      delete st.adWait[a.id];
    }
  }
}

/** 営業：空き店舗に入る */
function doVacant(s: P1State, r: Runner, rec: DutyStat, rnd: () => number) {
  if (!s.area?.vacant.length) return;
  const c = siteCandidates(s, 12).find((x) => x.vacant != null && x.gain * errMul(rnd, r.q, 1) >= 0.01);
  if (!c || c.vacant == null || s.money < c.cost + reserveOf(s) || vacantErr(s, c.vacant)) return;
  const b = takeVacant(s, c.vacant);
  if (typeof b !== 'string') rec.acts++;
}

// ---------------------------------------------------------------- 部長の提案のカード（月の締め）

/** 1 個あたりの粗利（先月の売上 ÷ 売れた数 − 素材代）。無ければ並べている商品の値段 − 素材代 */
export function unitMargin(s: P1State): number {
  const last = s.reports[s.reports.length - 1];
  const sold = last?.flow?.sold ?? 0;
  if (last && sold > 0) return Math.max(100, (last.revenue - (last.costs.materials ?? 0)) / sold);
  const xs = myShops(s).flatMap((b) => s.shops[b.uid]?.shelves ?? []).filter((x): x is Sku => !!x);
  if (!xs.length) return 600;
  return Math.max(100, xs.reduce((a, x) => a + priceOf(s, x) - unitCost(s, x), 0) / xs.length);
}
/** 売上のうち粗利の割合（先月の報告。無ければ 0.8） */
export function grossRate(s: P1State): number {
  const last = s.reports[s.reports.length - 1];
  return last && last.revenue > 0 ? Math.max(0.3, 1 - (last.costs.materials ?? 0) / last.revenue) : 0.8;
}
type Cand = { act: PropAct; real: number; unit: PropUnit; cost: number; rp?: number; units?: number; stage?: Stage; dig?: Proposal['dig'] };
/** whatIf の手 → 提案の手（設備投資・倉庫・パネル・レベル・雇う） */
function fromIf(s: P1State, w: StageIf, margin: number, keep: (dept: DeptId | null, kind: string) => boolean): Cand | null {
  const m = w.move;
  const real = w.units * margin;
  if (m.kind === 'invest' && keep(null, 'invest')) return { act: { k: 'invest', id: m.id, uid: m.uid }, real, unit: 'G', cost: m.cost, units: w.units, stage: w.stage };
  if (m.kind === 'skill' && keep(deptOf(SKILL[m.id]), 'skill')) return { act: { k: 'skill', id: m.id }, real, unit: 'G', cost: m.cost, rp: m.rp, units: w.units, stage: w.stage };
  if (m.kind === 'level' && keep(deptOf(SKILL[m.id]), 'level')) return { act: { k: 'level', id: m.id }, real, unit: 'G', cost: m.cost, units: w.units, stage: w.stage };
  if (m.kind === 'build' && keep(null, 'build')) {
    const lot = findLot(s, m.id);
    if (lot) return { act: { k: 'build', id: m.id, i: lot[0], j: lot[1], dir: lot[2] }, real, unit: 'G', cost: m.cost, units: w.units, stage: w.stage };
  }
  if (m.kind === 'person' && m.hire && keep(null, 'hire')) return { act: { k: 'hire', hero: m.hero, task: m.task, target: m.target }, real: real - wageOf(m.hero), unit: 'G', cost: 0, units: w.units, stage: w.stage };
  return null;
}
/** 建てる場所（工房から近い順に、道路に面した空き地） */
function findLot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null {
  const ws = myWorkshop(s);
  let best: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
  let dist = Infinity;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const dirs = allowedDirs(s, id, i, j);
      if (!dirs.length) continue;
      const d = ws ? Math.abs(ws.i - i) + Math.abs(ws.j - j) : 0;
      if (d < dist) {
        dist = d;
        best = [i, j, dirs[0]];
      }
    }
  return best;
}
/** 部門ごとの候補（いまのゲームで実際に取れる手。見込みは本当の値） */
function candidates(s: P1State, d: DeptId, ifs: () => StageIf[]): Cand[] {
  const margin = unitMargin(s);
  const out: Cand[] = [];
  const add = (c: Cand | null) => c && c.real > 0 && out.push(c);
  switch (d) {
    case 'logistics': {
      for (const w of ifs()) add(fromIf(s, w, margin, (dept, kind) => (kind === 'invest' || kind === 'build' ? true : dept === 'logistics')));
      // 販売が詰まり：棚を増やす・陳列の什器（設備投資）
      for (const w of myShops(s).length ? sellWhatIf(s) : []) {
        if ((w.kind === 'shelf' || w.kind === 'fixtures') && w.uid != null && w.yen > 0) {
          const id = w.kind === 'shelf' ? 'shelves' : 'fixtures';
          const b = s.buildings.find((x) => x.uid === w.uid);
          const cost = b ? investCost(b, id) : null;
          if (cost != null) add({ act: { k: 'invest', id, uid: w.uid }, real: w.yen * grossRate(s), unit: 'G', cost, units: w.units, stage: 'sell' });
        }
      }
      break;
    }
    case 'hr':
      for (const w of ifs()) add(fromIf(s, w, margin, (dept, kind) => kind === 'hire' || ((kind === 'skill' || kind === 'level') && dept === 'hr')));
      break;
    case 'systems':
      for (const w of ifs()) add(fromIf(s, w, margin, (dept, kind) => (kind === 'skill' || kind === 'level') && dept === 'systems'));
      break;
    case 'strategy': {
      const b = bestSkillMove(s);
      if (b && b.units > 0) add({ act: b.kind === 'skill' ? { k: 'skill', id: b.id } : { k: 'level', id: b.id }, real: b.units * margin, unit: 'G', cost: b.kind === 'skill' ? SKILL[b.id].cost : nextLevelCost(s, SKILL[b.id]), units: b.units, stage: myShops(s).length ? bottleneck(stageCaps(s)) : undefined });
      break;
    }
    case 'marketing':
      for (const a of ADS) {
        if ((s.ads[a.id] ?? 0) > 0) continue;
        const g = adGain(s, a.id);
        add({ act: { k: 'ad', id: a.id }, real: g, unit: 'ad', cost: adCost(s, a.id) });
      }
      break;
    case 'rnd': {
      if (!s.dig) break;
      s.dig.sites.forEach((x, k) => {
        if (x.permit || x.done) return;
        const L = layoutOf(s, k);
        if (!L) return;
        const finds = L.finds.filter((f) => f.item.kind !== 'mat');
        const tabs = L.finds.filter((f) => f.item.kind === 'tablet').map((f) => f.layer);
        const topic = L.topic != null && !s.dig!.topics.includes(L.topic);
        if (!finds.length) return;
        add({ act: { k: 'permit', site: k }, real: finds.length + (topic ? 3 : 0), unit: 'finds', cost: permitFee(s), dig: { tablet: tabs.length ? Math.max(...tabs) + 1 : null, finds: finds.length, topic } });
      });
      break;
    }
    case 'sales': {
      const c = siteCandidates(s, 3)[0];
      if (c && c.gain > 0.005) add(c.vacant != null ? { act: { k: 'vacant', uid: c.vacant }, real: c.gain * 100, unit: 'share', cost: c.cost } : { act: { k: 'build', id: 'general_store', i: c.i, j: c.j, dir: c.dir }, real: c.gain * 100, unit: 'share', cost: c.cost });
      break;
    }
    default:
      break;
  }
  return out;
}
const actKey = (a: PropAct) => JSON.stringify(a);

/**
 * 月の締め（いまのセクタ）：先月の提案の結果をはかり、部長ごとに提案を 1 枚（見込みの読みは出来しだいの誤差つき）、
 * 届いた中から見込みの大きい順に DELEG.prop.perMonth 枚まで受け箱へ。担当の報告を r.deleg に書き、今月の記録を空にする
 */
export function delegMonth(s: P1State, r: Report) {
  const heads = headDepts(s);
  if (!heads.length && !s.deleg) return;
  const st = D(s);
  const P = DELEG.prop;
  // ほかのセクタで出た提案・承認した提案（その町の建物・荒れ地の手）は、移ったら消える（結果もはかれない）
  const here = s.sector ?? 'c1';
  st.inbox = st.inbox.filter((p) => (p.sector ?? here) === here);
  st.done = st.done.filter((x) => (x.p.sector ?? here) === here);
  // 先月の提案の結果
  const results: DelegReport['results'] = [];
  st.done = st.done.filter((x) => {
    if (x.month >= r.month) return true;
    const real = measure(s, x.p, r) - x.before;
    results.push({ dept: x.p.dept, hero: x.p.hero, act: x.p.act, unit: x.p.unit, est: x.p.est, units: x.p.units, real });
    return false;
  });
  // 保留は expire か月で消える。受け箱は keep 枚まで
  st.inbox = st.inbox.filter((p) => r.month - p.month < P.expire && stillOk(s, p));
  // 部長ごとの提案（毎月、どの部長も 1 枚ずつ考え、見込みの大きい順に perMonth 枚）
  let cache: StageIf[] | null = null;
  const ifs = () => (cache ??= myShops(s).length ? (() => { const bn = bottleneck(stageCaps(s)); return bn === 'sell' ? [] : whatIf(s, bn); })() : []);
  const fresh: Proposal[] = [];
  for (const d of heads) {
    const H = headOf(s, d)!;
    const q = quality(H, d);
    const rnd = rndOf(s, d.length * 13 + d.charCodeAt(0) * 7 + r.month);
    const cs = candidates(s, d, ifs)
      .filter((c) => !st.inbox.some((p) => actKey(p.act) === actKey(c.act)))
      .map((c) => ({ c, est: c.real * errMul(rnd, q, P.err) }))
      .filter((x) => x.est > 0)
      .sort((a, b) => b.est - a.est);
    const top = cs[0];
    if (!top) continue;
    fresh.push({
      id: ++st.seq,
      dept: d,
      hero: H.hero,
      month: r.month,
      sector: here,
      act: top.c.act,
      est: top.c.unit === 'finds' ? Math.max(1, Math.round(top.est)) : top.c.unit === 'share' ? Math.round(top.est * 10) / 10 : Math.round(top.est),
      err: Math.round((1 - q) * P.err * 100) / 100,
      unit: top.c.unit,
      units: top.c.units != null ? Math.max(1, Math.round(top.c.units * (top.est / Math.max(1e-9, top.c.real)))) : undefined,
      stage: top.c.stage,
      cost: top.c.cost,
      rp: top.c.rp,
      status: 'new',
      dig: top.c.dig,
    });
  }
  const order = (p: Proposal) => (p.unit === 'G' ? p.est * 3 : p.unit === 'ad' ? p.est : p.unit === 'share' ? p.est * 2000 : p.est * 1500);
  fresh.sort((a, b) => order(b) - order(a));
  const add = fresh.slice(0, P.perMonth);
  st.inbox.push(...add);
  while (st.inbox.length > P.keep) st.inbox.shift();
  st.newProps = add.length;
  // 担当の報告
  const duties: DelegReport['duties'] = [];
  for (const d of DUTIES) {
    const x = st.stat[d.id];
    if (!x || x.hero == null) continue;
    duties.push({ id: d.id, hero: x.hero, by: x.by ?? 'leader', q: x.q ?? 0, acts: x.acts, miss: x.miss, n: x.n });
  }
  r.deleg = { duties, heads: heads.map((d) => ({ dept: d, hero: headOf(s, d)!.hero, q: quality(headOf(s, d)!, d) })), props: add.length, waiting: st.inbox.length, results };
  if (!duties.length && !heads.length && !results.length) delete r.deleg;
  st.stat = {};
}
/** その提案がまだ打てる手か */
function stillOk(s: P1State, p: Proposal): boolean {
  const a = p.act;
  switch (a.k) {
    case 'invest': {
      const b = s.buildings.find((x) => x.uid === a.uid && x.owner === 'me');
      return !!b && investCost(b, a.id) != null;
    }
    case 'skill': {
      const e = skillLock(s, SKILL[a.id]);
      return e == null || e === 'money' || e === 'rp';
    }
    case 'level': {
      const e = levelLock(s, SKILL[a.id]);
      return e == null || e === 'money' || e === 'rp';
    }
    case 'build':
      return allowedDirs(s, a.id, a.i, a.j).includes(a.dir) && (canBuild(s, a.id) == null || canBuild(s, a.id) === 'money');
    case 'hire':
      return has(s, 'hire') && s.hirePool.includes(a.hero);
    case 'permit':
      return !!s.dig && !s.dig.sites[a.site]?.permit;
    case 'ad':
      return (s.ads[a.id] ?? 0) <= 0;
    case 'vacant': {
      const e = vacantErr(s, a.uid);
      return e == null || e === 'money';
    }
  }
}
/** はかる数（結果の比べ）：G＝段の流れの数（個／月）・ad＝今月の売上・finds＝研究ノートの数・share＝取り分（%） */
function measure(s: P1State, p: Proposal, r?: Report): number {
  switch (p.unit) {
    case 'G': {
      const c = stageCaps(s, true);
      return Math.min(...(['buy', 'craft', 'haul', 'sell'] as Stage[]).map((k) => (c[k].stopped ? 0 : c[k].perMonth)));
    }
    case 'ad':
      return r ? r.revenue : s.reports[s.reports.length - 1]?.revenue ?? 0;
    case 'finds':
      return Object.values(s.research).reduce((a, v) => a + (v ?? 0), 0);
    case 'share':
      return s.area ? areaShares(s).me * 100 : 0;
  }
}
export type ApproveErr = 'money' | 'rp' | 'gone' | 'none';
/** 承認：実行する。お金（研究ポイント）が足りなければ保留（資金不足）のまま。打てなくなった手は受け箱から消す */
export function approve(s: P1State, id: number): ApproveErr | null {
  const st = D(s);
  const p = st.inbox.find((x) => x.id === id);
  if (!p) return 'none';
  if ((p.sector ?? s.sector ?? 'c1') !== (s.sector ?? 'c1') || !stillOk(s, p)) {
    st.inbox = st.inbox.filter((x) => x !== p);
    return 'gone';
  }
  const before = measure(s, p);
  const e = execute(s, p.act);
  if (e === 'money' || e === 'rp') {
    p.status = 'held';
    p.note = e;
    return e;
  }
  st.inbox = st.inbox.filter((x) => x !== p);
  if (e) return 'gone';
  const month = s.reports.length ? s.reports[s.reports.length - 1].month : 0;
  st.done.push({ p, month, before: p.unit === 'ad' ? (s.reports[s.reports.length - 1]?.revenue ?? 0) : before });
  return null;
}
export function reject(s: P1State, id: number): boolean {
  const st = D(s);
  const n = st.inbox.length;
  st.inbox = st.inbox.filter((x) => x.id !== id);
  return st.inbox.length < n;
}
export function hold(s: P1State, id: number): boolean {
  const p = D(s).inbox.find((x) => x.id === id);
  if (!p) return false;
  p.status = 'held';
  return true;
}
/** 手を打つ（いまのゲームの関数をそのまま使う）。'money'・'rp'：足りない */
function execute(s: P1State, a: PropAct): 'money' | 'rp' | string | null {
  switch (a.k) {
    case 'invest':
      return invest(s, a.uid, a.id);
    case 'skill': {
      const e = learn(s, a.id);
      return e === 'money' || e === 'rp' ? e : e;
    }
    case 'level': {
      const e = levelUp(s, a.id);
      return e === 'money' || e === 'rp' ? e : e;
    }
    case 'build': {
      const b = build(s, a.id, a.i, a.j, a.dir);
      return typeof b === 'string' ? b : null;
    }
    case 'hire': {
      const e = hire(s, a.hero);
      if (e) return e;
      assign(s, a.hero, a.task, a.target);
      return null;
    }
    case 'permit': {
      const r = applyPermit(s, a.site);
      return typeof r === 'string' ? r : null;
    }
    case 'ad':
      return runAd(s, a.id);
    case 'vacant': {
      const b = takeVacant(s, a.uid);
      return typeof b === 'string' ? b : null;
    }
  }
}
/** 自動で承認する（セクター長の任せきり・自動プレイ）：見込みがプラスのものを、お金があるだけ */
export function approveAll(s: P1State, keep = 0): number {
  let n = 0;
  for (const p of [...(s.deleg?.inbox ?? [])]) {
    if (p.est <= 0) continue;
    if (p.cost > 0 && s.money - p.cost < keep) {
      p.status = 'held';
      p.note = 'money';
      continue;
    }
    if (approve(s, p.id) == null) n++;
  }
  return n;
}

// ---------------------------------------------------------------- セクター長（いまのマネージャーと復興の委任のまとめ直し）

/** セクター長を新しく任命できるか（会社に事業部長が DELEG.sector.need 部門以上）。ready が false のあいだは表示だけ（準備中） */
export function sectorHeadOk(s: Pick<P1State, 'staff'>): { ok: boolean; heads: number; need: number; ready: boolean } {
  const heads = headDepts(s).length;
  const need = DELEG.sector.need;
  return { ok: !DELEG.sector.ready || heads >= need, heads, need, ready: DELEG.sector.ready };
}
/**
 * セクター長の任せきり（会社の月の締め。company.ts の runSector のあと）：会社に部長がいれば、そのセクタでも部長たちが提案を出し、
 * セクター長が自分で承認する（月に DELEG.sector.max 件まで）。1 件ごとに本社へ回す利益の DELEG.sector.invest をそのセクタへ投資する
 * （投資 1 G で月の売上が MANAGER.roi 伸びる、いまの投資の仕組み）。返り値：承認した数と投資
 */
export function sectorApprove(s: Pick<P1State, 'staff'>, rec: SectorRec, r: { toHQ: number; invest: number }): { n: number; invest: number } | null {
  const n = Math.min(DELEG.sector.max, headDepts(s).length);
  if (!n || r.toHQ <= 0) return null;
  const extra = Math.round(r.toHQ * DELEG.sector.invest * n);
  if (extra <= 0) return null;
  r.toHQ -= extra;
  r.invest += extra;
  rec.capital += extra;
  const last = rec.log[rec.log.length - 1];
  if (last) {
    last.toHQ = r.toHQ;
    last.invest = r.invest;
  }
  rec.heads = { n, invest: extra };
  return { n, invest: extra };
}

// ---------------------------------------------------------------- 文（画面・報告）

export const heroNm = (id: number) => {
  const x = heroById.get(id);
  return x ? (isEn ? x.nameEn : x.name) : `#${id}`;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 役目の札の文（「リーダー・発注」「物流部長」「セクター長」） */
export function roleText(r: Role): string {
  if (r.kind === 'leader') return t(`リーダー・${DUTY[r.duty].name}`, `Leader · ${DUTY[r.duty].name}`);
  if (r.kind === 'head') return t(`${DEPT[r.dept].name}部長`, `${DEPT[r.dept].name} head`);
  return t('セクター長', 'Sector head');
}
const STAGE_JA: Record<Stage, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };
/** 提案の手の名前 */
export function actName(s: P1State, a: PropAct): string {
  switch (a.k) {
    case 'invest': {
      const b = s.buildings.find((x) => x.uid === a.uid);
      const lv = b ? (b.inv?.[a.id] ?? 0) + 1 : 1;
      return t(`${INVEST[a.id]?.name ?? a.id}（${b ? nameOf(b.id) : ''}・${lv} 段目）`, `${INVEST[a.id]?.name ?? a.id} (${b ? nameOf(b.id) : ''}, step ${lv})`);
    }
    case 'skill':
      return t(`パネル「${SKILL[a.id]?.name ?? a.id}」を取る`, `Take the ${SKILL[a.id]?.name ?? a.id} panel`);
    case 'level':
      return t(`パネル「${SKILL[a.id]?.name ?? a.id}」を Lv ${lvOf(s, a.id) + 1} に`, `Raise ${SKILL[a.id]?.name ?? a.id} to Lv ${lvOf(s, a.id) + 1}`);
    case 'build':
      return a.id === 'warehouse' ? t('倉庫を建てる', 'Build a warehouse') : t(`${nameOf(a.id)}を出店する`, `Open a ${nameOf(a.id)}`);
    case 'hire':
      return t(`${heroNm(a.hero)}を雇う`, `Hire ${heroNm(a.hero)}`);
    case 'permit':
      return t(`荒れ地 ${a.site + 1} の発掘許可を取る`, `Get a permit for wasteland ${a.site + 1}`);
    case 'ad':
      return t(`「${ADS.find((x) => x.id === a.id)?.name ?? a.id}」を出す`, `Run ${ADS.find((x) => x.id === a.id)?.name ?? a.id}`);
    case 'vacant':
      return t('空き店舗に入る', 'Move into the vacant store');
  }
}
const nameOf = (id: string) => DEF[id]?.name ?? id;
/** 提案の理由と見込み（カードの本文） */
export function propWhy(_s: P1State, p: Proposal): string {
  const by = DEPT[p.dept].name;
  switch (p.unit) {
    case 'G':
      return p.stage
        ? t(`${by}部長：${STAGE_JA[p.stage]}の流れが 1 か月に +${p.units ?? 0} 個ほど太くなります`, `${by} head: ${STAGE_JA[p.stage]} gets about +${p.units ?? 0} per month`)
        : t(`${by}部長：流れが太くなります`, `${by} head: the flow widens`);
    case 'ad':
      return t(`${by}部長：いまの売り場なら、宣伝の期間で費用より多く売れます`, `${by} head: with the shops as they are, the ad pays for itself`);
    case 'finds':
      return p.dig?.tablet
        ? t(`${by}部長：この荒れ地は ${p.dig.tablet} 層目に石板があります（出土品 ${p.dig.finds} 個${p.dig.topic ? '・お題も' : ''}）`, `${by} head: there is a tablet in layer ${p.dig.tablet} here (${p.dig.finds} finds${p.dig.topic ? ', and a target' : ''})`)
        : t(`${by}部長：この荒れ地には出土品が ${p.dig?.finds ?? 0} 個ほど眠っています${p.dig?.topic ? '（お題も）' : ''}`, `${by} head: about ${p.dig?.finds ?? 0} finds sleep here${p.dig?.topic ? ' (and a target)' : ''}`);
    case 'share':
      return t(`${by}部長：ここに出すと、町のお客さんの取り分が +${p.est.toFixed(1)}% ほど伸びます`, `${by} head: opening here grows your share by about +${p.est.toFixed(1)}%`);
  }
}
/** 見込みの文（「見込み：月 +3,200 G（誤差 ±12%）」） */
export function propEst(p: Proposal): string {
  const g = (v: number) => Math.round(v).toLocaleString('en-US');
  const err = t(`誤差 ±${Math.round(p.err * 100)}%`, `±${Math.round(p.err * 100)}%`);
  switch (p.unit) {
    case 'G':
      return t(`見込み：月 +${g(p.est)} G（${err}）`, `Expected: +${g(p.est)} G / mo (${err})`);
    case 'ad':
      return t(`見込み：期間で +${g(p.est)} G（費用を引いて。${err}）`, `Expected: +${g(p.est)} G over the run, net (${err})`);
    case 'finds':
      return t(`見込み：出土品 ${g(p.est)} 個ぶん（${err}）`, `Expected: ${g(p.est)} finds (${err})`);
    case 'share':
      return t(`見込み：取り分 +${p.est.toFixed(1)}%（${err}）`, `Expected: share +${p.est.toFixed(1)}% (${err})`);
  }
}
/** 提案の結果の文（翌月の報告） */
export function resultText(s: P1State, x: DelegReport['results'][number]): string {
  const name = actName(s, x.act);
  const g = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  switch (x.unit) {
    case 'G':
      return t(`${name}：流れ ${g(x.real)} 個／月（見込み +${x.units ?? 0}）`, `${name}: flow ${g(x.real)} / mo (expected +${x.units ?? 0})`);
    case 'ad':
      return t(`${name}：売上 ${g(x.real)} G（先月から）`, `${name}: sales ${g(x.real)} G vs last month`);
    case 'finds':
      return t(`${name}：研究ノート ${g(x.real)} 個`, `${name}: notebook ${g(x.real)}`);
    case 'share':
      return t(`${name}：取り分 ${x.real >= 0 ? '+' : '−'}${Math.abs(x.real).toFixed(1)}%（見込み +${x.est.toFixed(1)}%）`, `${name}: share ${x.real >= 0 ? '+' : '−'}${Math.abs(x.real).toFixed(1)}% (expected +${x.est.toFixed(1)}%)`);
  }
}
/** 業務の今月の出来の文（「素材切れ 2 日・注文 5 回」） */
export function dutyLine(d: DelegReport['duties'][number]): string {
  switch (d.id) {
    case 'order':
      return t(`注文 ${d.acts} 回・素材切れ ${d.miss} 日`, `${d.acts} orders, out of materials ${d.miss} d`);
    case 'craft':
      return t(`見直し ${d.acts} 回・見込みの ${d.n || 100}%`, `${d.acts} changes, ${d.n || 100}% of best plan`);
    case 'shelf':
      return t(`入れ替え ${d.acts} 回・入れ替え待ち ${d.miss} 日`, `${d.acts} swaps, ${d.miss} d waiting`);
    case 'swap':
      return t(`配置 ${d.acts} 回・空き ${d.miss} 日`, `${d.acts} moves, ${d.miss} d vacant`);
    case 'rest':
      return t(`交代 ${d.acts} 回・止まった ${d.miss} 日`, `${d.acts} covers, ${d.miss} d stopped`);
    case 'dig':
      return t(`${d.n} マス掘った`, `${d.n} cells dug`);
    case 'ads':
      return t(`出し直し ${d.acts} 回・切れていた ${d.miss} 日`, `${d.acts} renewals, lapsed ${d.miss} d`);
    case 'vacant':
      return t(`入った ${d.acts} 軒・空いたまま ${d.miss} 日`, `${d.acts} taken, ${d.miss} d left empty`);
  }
}
export const qText = (q: number) => t(`出来 ${pct(q)}`, `Quality ${pct(q)}`);
/** 部門の帯の「担当」の短い文 */
export function bandText(s: P1State, d: DeptId): { long: string; short: string; on: boolean } {
  const H = headOf(s, d);
  const duties = DEPT_DUTIES[d];
  if (H) {
    const n = (s.deleg?.inbox ?? []).filter((p) => p.dept === d && (p.sector ?? s.sector ?? 'c1') === (s.sector ?? 'c1')).length;
    return { long: t(`部長におまかせ中（${heroNm(H.hero)}）・今月の提案 ${n}`, `Run by the head (${heroNm(H.hero)}) · proposals ${n}`), short: t(`部長におまかせ・提案 ${n}`, `Head · ${n} prop.`), on: true };
  }
  // リーダーに任せる業務の無い部門（経営企画・システム）：事業部長だけ
  if (!duties.length) {
    const hl = headLeft(s, d) ?? 0;
    return hl > 0
      ? { long: t(`事業部長：理解度 ${DELEG.headAt} から（あと ${hl}）`, `Division head: at understanding ${DELEG.headAt} (${hl} to go)`), short: t(`担当：あと ${hl}`, `Lead: ${hl} to go`), on: false }
      : { long: t('担当：事業部長を置けます', 'Lead: you can place a head'), short: t('担当：部長', 'Lead: head'), on: true };
  }
  const left = leaderLeft(s, d) ?? 0;
  if (left > 0) return { long: t(`チームリーダー：理解度 ${DELEG.leaderAt} から（あと ${left}）`, `Team leader: at understanding ${DELEG.leaderAt} (${left} to go)`), short: t(`担当：あと ${left}`, `Lead: ${left} to go`), on: false };
  const n = duties.filter((x) => leaderOf(s, x)).length;
  return { long: t(`担当：チームリーダー ${n} / ${duties.length}`, `Lead: team leaders ${n} / ${duties.length}`), short: t(`担当 ${n}/${duties.length}`, `Lead ${n}/${duties.length}`), on: true };
}
/** 任命の候補（出来の高い順）：ほかのセクタのセクター長・修行中は除く */
export function candidatesFor(s: P1State, dept: DeptId): { st: Staff; q: number }[] {
  return s.staff
    .filter((x) => x.task !== 'manager' && x.task !== 'train')
    .map((st) => ({ st, q: quality(st, dept) }))
    .sort((a, b) => b.q - a.q || aptitude(b.st.stats, 'lead') - aptitude(a.st.stats, 'lead'));
}
