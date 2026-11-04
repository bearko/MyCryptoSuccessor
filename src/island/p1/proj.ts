/**
 * 段 UI7e：倉庫があふれた町と、使い切りの手（いまの素材で作る）の月ごとの見込み（DOM なし：brief.ts が使う。表示だけ・自動プレイには効かない）。
 * いまのモデル（model.ts）の動きに合わせて、POLICY.months か月を 1 か月ずつ数える：
 * - 倉庫があふれて素材の入荷が止まる（jammed）：置き場所の空き（poolFree）が、作業台の商品の 1 ロットに足りない素材より少なく、
 *   手元の素材でも 1 ロット作れない。調達係は置き場所の空きぶんしか買えない（model.ts の buy・order）ので、調達も製造も止まり、
 *   お店は在庫だけを売る（在庫が切れたら、その品は売れない）
 * - 使い切りの手：作業台は、作り終えるまでの日数（ロット数 × 1 ロットの日数 ÷ 職人の速さ・稼働率）だけその品を作り、残りの日は元の商品。
 *   作った品は、売り場の取り合いの計算（goodsSales）で売れていく（作っているあいだは作っている商品として棚に、作り終えたら在庫品として空いた棚か売りさばきの棚に）
 * - お金：作り続ける商品は作った数 × 1 個の材料費（素材を買い足す）。在庫（売れ残り・発掘の品・手持ちの素材で作った品）を売る分は材料費 0（もう払ってある）
 * 仕様は docs/ISLAND_PHASE1.md「使い切りの手の見積もり（段 UI7e）」。
 */
import { POLICY, type Mat, type Sku } from './data';
import { DAYS, batchOf, craftDays, lotsHave, poolCap, poolUsed, recipeOf, speed, stageCaps, staffOf, steadySkus, stockAll, syncShelves, unitCost, uptime, myShops, type P1State } from './model';
import { flowOf, type FlowNow, type Plan, type Step } from './plan';
import { poolNow, storeFc } from './storefc';

// ---------------------------------------------------------------- 倉庫があふれて入荷が止まる

/** 作業台が作り続ける商品（担当のいる台。使い切りの製造をしている台は戻る商品） */
function benchSkus(st: P1State): Sku[] {
  const out: Sku[] = [];
  const pend = (st.deleg?.pend ?? {}) as Record<number, Sku>;
  st.slots.forEach((sl, k) => {
    if (sl.worker == null) return;
    const x = pend[k] && sl.back === undefined ? pend[k] : sl.back === undefined ? sl.sku : sl.back;
    if (x && !out.includes(x)) out.push(x);
  });
  return out;
}
/** 1 ロットに足りない素材の数（手元の素材と比べて） */
export function lotShort(st: P1State, x: Sku): number {
  return (Object.entries(recipeOf(x)) as [Mat, number][]).reduce((a, [m, q]) => a + Math.max(0, (q ?? 0) - (st.mats[m] ?? 0)), 0);
}
/**
 * 倉庫があふれて素材の入荷が止まっているか：作り続ける商品のどれも、手元の素材で 1 ロット作れず、足りない素材を置く空きも無い
 * （調達係は置き場所の空きぶんしか買えない）。作業台に担当がいなければ false（倉庫のせいでは止まっていない）
 */
export function jammed(st: P1State): boolean {
  const xs = benchSkus(st);
  if (!xs.length) return false;
  const free = poolCap(st) - poolUsed(st);
  return xs.every((x) => lotsHave(st, x) < 1 && lotShort(st, x) > free);
}

// ---------------------------------------------------------------- 月ごとの見込み

/** 月の見込み（brief.ts の Month と同じ数え方の部分） */
export interface PMonth {
  sales: number;
  units: number;
  goods: { x: Sku; units: number; unit: number }[];
  /** 材料費（作り続ける商品を作った数 × 1 個の材料費。在庫を売る分は 0） */
  mats: number;
  monthly: number;
  cost: number;
  profit: number;
  /** 作り続ける商品のうち、在庫が切れて売れなかった数（入荷が止まっているとき） */
  miss: number;
  /** 作り続ける商品の売れる見込み（売り場の段で頭打ち） */
  want: number;
}
/** 1 か月ぶんの材料：売れ方（売り場の段で頭打ち）・作り続ける商品・入荷が止まっているか・作れる数（調達・製造・輸送の細いところ）・毎月の費用 */
interface Phase {
  flow: FlowNow;
  steady: Set<Sku>;
  jam: boolean;
  prod: number;
  monthly: number;
}
/** 作れる数（月）：調達・製造・輸送の細いところ（止まっている段があれば 0） */
export function prodOf(st: P1State): number {
  const c = stageCaps(st, true);
  if (c.buy.stopped || c.craft.stopped || c.haul.stopped) return 0;
  return Math.min(c.buy.perMonth, c.craft.perMonth, c.haul.perMonth);
}
/** 2 つの売れ方を f : 1 − f で混ぜる（商品ごと） */
function mixFlow(a: FlowNow, b: FlowNow, f: number): FlowNow {
  if (f >= 1) return a;
  if (f <= 0) return b;
  const xs = new Set<Sku>([...a.goods.map((g) => g.x), ...b.goods.map((g) => g.x)]);
  const one = (fl: FlowNow, x: Sku) => fl.goods.find((g) => g.x === x) ?? { x, units: 0, perDay: 0 };
  const goods = [...xs].map((x) => ({ x, units: one(a, x).units * f + one(b, x).units * (1 - f), perDay: one(a, x).perDay * f + one(b, x).perDay * (1 - f) }));
  const mix = (p: number, q: number) => p * f + q * (1 - f);
  return { units: mix(a.units, b.units), sales: mix(a.sales, b.sales), cost: mix(a.cost, b.cost), profit: mix(a.profit, b.profit), goods, caps: a.caps };
}
/**
 * 来月の売れ方（宣伝はいま効いている日数で日割り。brief.ts の monthOf と同じ混ぜ方）。売り場の段だけで頭打ち（作れる数は Phase.prod で別に数える）
 */
export function flowMonth(st: P1State): FlowNow {
  const on = flowOf(st, 0, true);
  const adDays = Math.min(DAYS, Math.max(0, ...Object.values(st.ads).map((v) => v ?? 0)));
  if (!(adDays > 0 && adDays < DAYS)) return on;
  const off = flowOf({ ...st, ads: Object.fromEntries(Object.keys(st.ads).map((x) => [x, 0])) }, 0, true);
  return mixFlow(on, off, adDays / DAYS);
}
const phaseOf = (st: P1State, flow: FlowNow, monthly: number): Phase => {
  const jam = jammed(st);
  return { flow, steady: new Set(steadySkus(st)), jam, prod: jam ? 0 : prodOf(st), monthly };
};
/**
 * 段 UI7f：倉庫があふれる日（full：いまから何日目。null ならあふれない）を過ぎた月は、作る数が月の増え（cut）だけ減る（倉庫がもう増えられない所まで）。
 * m か月目のうち、あふれる前の日の割合で混ぜる
 */
function fullPhase(ph: Phase, m: number, full: number | null, cut: number): Phase {
  if (full == null || ph.jam) return ph;
  const f = Math.max(0, Math.min(1, (full - m * DAYS) / DAYS));
  if (f >= 1) return ph;
  return { ...ph, prod: ph.prod * f + Math.max(0, ph.prod - cut) * (1 - f) };
}
/**
 * 段 UI7f：倉庫があふれる日と、あふれたあとに減る作る数（月）。増え方はいまの町（s）の記録と流れのまま、置ける数と中身は st（承認後）から
 */
function fullOf(s: P1State, st: P1State = s): { days: number | null; cut: number } {
  const n = poolNow(st);
  const f = storeFc(s, { cap: n.cap, mats: n.mats, goods: n.goods });
  return { days: f.days, cut: f.cut };
}

/**
 * 1 か月：作り続ける商品は、作れる数（prod）まで作って売り、足りない分は在庫から。ほかの品（在庫品・使い切りに作った品）は在庫から。
 * 入荷が止まっていれば（jam）作り続ける商品も在庫から。inv は月をまたいで減らす。add：この月に在庫に入る品（使い切りに作った品）
 */
function runMonth(st: P1State, ph: Phase, inv: Map<Sku, number>, add: Partial<Record<Sku, number>> = {}): PMonth {
  for (const [x, n] of Object.entries(add) as [Sku, number][]) inv.set(x, (inv.get(x) ?? stockAll(st, x)) + n);
  const have = (x: Sku) => {
    if (!inv.has(x)) inv.set(x, stockAll(st, x));
    return inv.get(x)!;
  };
  const steadyD = ph.flow.goods.reduce((a, g) => a + (ph.steady.has(g.x) ? g.units : 0), 0);
  const kp = ph.jam || steadyD <= 0 ? 0 : Math.min(1, ph.prod / steadyD);
  let sales = 0;
  let units = 0;
  let mats = 0;
  let miss = 0;
  const goods: PMonth['goods'] = [];
  for (const g of ph.flow.goods) {
    if (g.units <= 1e-9) continue;
    const price = (g.perDay * DAYS) / g.units;
    const made = ph.steady.has(g.x) ? g.units * kp : 0;
    const fromInv = Math.min(g.units - made, have(g.x));
    inv.set(g.x, have(g.x) - fromInv);
    const n = made + fromInv;
    if (ph.steady.has(g.x)) miss += g.units - n;
    const unit = made > 0 ? unitCost(st, g.x) : 0;
    sales += n * price;
    units += n;
    mats += made * unit;
    goods.push({ x: g.x, units: n, unit: n > 0 ? (made * unit) / n : 0 });
  }
  return { sales, units, goods, mats, monthly: ph.monthly, cost: mats + ph.monthly, profit: sales - mats - ph.monthly, miss, want: steadyD };
}

/** 使い切りの手の中身：どの台で何を何個・作り終えるまでの日数・使う素材の数 */
export interface UseUp {
  slot: number;
  x: Sku;
  units: number;
  lots: number;
  days: number;
  mats: number;
}
export function useUpOf(s: P1State, p: Pick<Plan, 'steps'>): UseUp | null {
  const st = p.steps.find((y): y is Extract<Step, { k: 'useup' }> => y.k === 'useup');
  if (!st) return null;
  const sl = s.slots[st.slot];
  const w = sl?.worker != null ? staffOf(s, sl.worker) : null;
  const lots = lotsHave(s, st.x);
  if (!sl || !w || lots <= 0) return null;
  const v = Math.max(1e-6, speed(w, 'craft', s) * uptime(s, w));
  // いま動いているロット（別の商品）があれば、それが終わってから
  const wait = sl.running && sl.sku && sl.sku !== st.x ? Math.max(0, craftDays(s, sl.sku) - (sl.progress ?? 0)) / v : 0;
  const days = wait + (lots * craftDays(s, st.x)) / v;
  const mats = Object.values(recipeOf(st.x)).reduce<number>((a, q) => a + (q ?? 0), 0) * lots;
  return { slot: st.slot, x: st.x, units: lots * batchOf(st.x, s), lots, days, mats };
}

/** 月ごとの見込み（このまま・承認後）と、説明の材料 */
export interface Proj {
  /** 月ごとの利益（導入の費用は含まない） */
  now: number[];
  after: number[];
  /** 1 か月目（来月） */
  now1: PMonth;
  after1: PMonth;
  /** 倉庫があふれて入荷が止まるか（このまま・承認後の 2 か月目から） */
  jam0: boolean;
  jam1: boolean;
  /** このままで、作り続ける商品の在庫が売り切れる月（入荷が止まっているとき・あふれたあと。12 か月もてば null） */
  out0: number | null;
  /**
   * 段 UI7f：このペースで倉庫があふれる日（いまから何日目。このまま・承認後。あふれない・もう止まっていれば null）と、
   * あふれたあとに作る数が月にいくつ減るか（cut）
   */
  full0: number | null;
  full1: number | null;
  cut: number;
  /** 承認後に空く置き場所（個。素材を使う・置き場所が増える） */
  room: number;
  /** 使い切りの手：作る品・数・日数と、作った品が売れていく月ごとの数・売上・並ぶお店 */
  use?: UseUp & { sold: number[]; yen: number; price: number; shops: number[] };
}

/** 長期の 2 か月目からの状態（宣伝は切れる・士気・満足度・ブランドは落ち着く先に）。brief.ts の settleOf を渡す */
export type Settle = (st: P1State) => P1State;

/** このまま側（同じ base で何度も使う） */
type BaseRun = { months: PMonth[]; jam: boolean; out: number | null; full: number | null; cut: number };
const baseMemo = new WeakMap<P1State, BaseRun>();
function baseRun(base: P1State, settle: Settle): BaseRun {
  const hit = baseMemo.get(base);
  if (hit) return hit;
  const M = POLICY.months;
  const p1 = phaseOf(base, flowMonth(base), 0);
  const sb = settle(base);
  const p2 = phaseOf(base, flowOf(sb, 0, true), 0);
  // 段 UI7f：このペースで倉庫があふれる日（もう入荷が止まっていれば数えない）
  const F = p1.jam ? { days: null, cut: 0 } : fullOf(base);
  const inv = new Map<Sku, number>();
  const months: PMonth[] = [];
  let out: number | null = null;
  for (let m = 0; m < M; m++) {
    const mo = runMonth(base, fullPhase(m ? p2 : p1, m, F.days, F.cut), inv);
    months.push(mo);
    // 作り続ける商品の半分より多くが、在庫切れで売れなくなった月
    if ((p1.jam || F.days != null) && out == null && mo.want > 0 && mo.miss > mo.want / 2) out = m + 1;
  }
  const r = { months, jam: p1.jam, out, full: F.days, cut: F.cut };
  baseMemo.set(base, r);
  return r;
}

/**
 * 月ごとの見込み。s：いまの状態・base：このまま（baseOf）・after：承認後（afterOf）・rest：使い切りの手を外した承認後（無ければ base）・monthly：増える毎月の費用
 */
export function projOf(s: P1State, p: Pick<Plan, 'steps'>, base: P1State, after: P1State, rest: P1State, monthly: number, settle: Settle): Proj {
  const M = POLICY.months;
  const B = baseRun(base, settle);
  const u = useUpOf(s, p);
  const inv = new Map<Sku, number>();
  const months: PMonth[] = [];
  let use: Proj['use'];
  let jam1: boolean;
  let room = poolCap(after) - poolCap(base);
  let F1: { days: number | null; cut: number };
  if (!u) {
    const p1 = phaseOf(after, flowMonth(after), monthly);
    const p2 = phaseOf(after, flowOf(settle(after), 0, true), monthly);
    jam1 = p1.jam;
    F1 = jam1 ? { days: null, cut: 0 } : fullOf(s, after);
    for (let m = 0; m < M; m++) months.push(runMonth(after, fullPhase(m ? p2 : p1, m, F1.days, F1.cut), inv));
  } else {
    room += u.mats;
    // 作り終えたあと：素材を使った分だけ倉庫が空き、作った品は在庫品としてお店へ（空いた棚か、売りさばきの棚に並ぶ）
    const last = structuredClone(rest);
    for (const [m, q] of Object.entries(recipeOf(u.x)) as [Mat, number][]) last.mats[m] = Math.max(0, (last.mats[m] ?? 0) - (q ?? 0) * u.lots);
    const shop = myShops(last).find((b) => last.shops[b.uid]);
    if (shop) last.shops[shop.uid].storage[u.x] = (last.shops[shop.uid].storage[u.x] ?? 0) + u.units;
    syncShelves(last, true);
    // 作っているあいだ：この台は元の商品を作らない（ほかの台の作れる数で）
    const busy = structuredClone(last);
    if (busy.slots[u.slot]) busy.slots[u.slot].worker = null;
    const jamL = jammed(last);
    jam1 = jamL;
    F1 = jamL ? { days: null, cut: 0 } : fullOf(s, last);
    const prodL = jamL ? 0 : prodOf(last);
    const prodB = jamL ? 0 : prodOf(busy);
    const steady = new Set(steadySkus(last));
    steady.delete(u.x);
    const fA1 = flowMonth(after);
    const fA2 = flowOf(settle(after), 0, true);
    const fL1 = flowMonth(last);
    const fL2 = flowOf(settle(last), 0, true);
    const sold: number[] = [];
    inv.set(u.x, 0);
    for (let m = 0; m < M; m++) {
      // この月のうち、作業台がこの品を作っている日の割合と、この月にできる数
      const f = Math.max(0, Math.min(1, (u.days - m * DAYS) / DAYS));
      const made = u.days > 0 ? (u.units * f * DAYS) / u.days : 0;
      const flow = mixFlow(m ? fA2 : fA1, m ? fL2 : fL1, f);
      const ph = fullPhase({ flow, steady, jam: jamL, prod: prodB * f + prodL * (1 - f), monthly }, m, F1.days, F1.cut);
      const x0 = inv.get(u.x) ?? 0;
      const mo = runMonth(last, ph, inv, { [u.x]: made });
      sold.push(Math.max(0, x0 + made - (inv.get(u.x) ?? 0)));
      months.push(mo);
    }
    const price = (() => {
      const g = fA1.goods.find((y) => y.x === u.x) ?? fL1.goods.find((y) => y.x === u.x);
      return g && g.units > 0 ? (g.perDay * DAYS) / g.units : 0;
    })();
    // 並ぶお店：作っているあいだ（作っている商品として）と、作り終えたあと（在庫品として）
    const later = sold.slice(1).some((n) => n > 0.05);
    const shops = myShops(last)
      .filter((b) => (sold[0] > 0.05 && after.shops[b.uid]?.shelves.includes(u.x)) || (later && last.shops[b.uid]?.shelves.includes(u.x)))
      .map((b) => b.uid);
    use = { ...u, sold, yen: sold.reduce((a, n) => a + n, 0) * price, price, shops };
  }
  return {
    now: B.months.map((x) => x.profit),
    after: months.map((x) => x.profit),
    now1: B.months[0],
    after1: months[0],
    jam0: B.jam,
    jam1,
    out0: B.out,
    full0: B.full,
    full1: F1.days,
    cut: B.cut,
    room,
    ...(use ? { use } : {}),
  };
}

/** 段 UI7f：このペースで、見込みの月（POLICY.months か月）のうちに倉庫があふれる */
export function fullSoon(st: P1State): boolean {
  const d = storeFc(st).days;
  return d != null && d < POLICY.months * DAYS;
}
/** 月ごとの見込みで数えるか：倉庫があふれて入荷が止まっている町・このペースで倉庫があふれる町か、使い切りの手を含む提案 */
export const projNeeded = (base: P1State, p: Pick<Plan, 'steps'>) => p.steps.some((y) => y.k === 'useup') || jammed(base) || fullSoon(base);
