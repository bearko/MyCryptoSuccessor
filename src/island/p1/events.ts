/**
 * 突発のできごと（段 UI4。DOM なし：card.ts・model.ts・main.ts・自動プレイ・テストが使う）。
 * マインちゃんの報告・関わるヒーロー（店員・職人・調達係）・町の長が、良いできごとと困りごとを UI1 のカードで持ってくる（2〜3 択）。
 * 良いできごとと困りごとは交互（半々）。どれも選び方で損を避けられる（見込みで、どれか 1 つは損 0 以上）。
 * 効き目は、いまある数字に一時的な倍率をかける形だけ（evMul：来店と需要・値段・素材の値段・運ぶ日数・作る速さ）と、
 * その場のお金・ブランド力・研究ポイント・士気・在庫からの大口の注文。新しい仕組みは増やさない。
 * 出る時：この町の 2 か月目の締めから（1 か月目＝チュートリアルは出さない）、ランクに関係なく 2〜3 か月に 1 回（EVENT.gap）。
 * 同じ種類は続けない。乱数はセーブの種（s.seed）と締めの回数で決まる（自動プレイのシードで再現できる。ほかの乱数は使わない）。
 * 仕様は docs/ISLAND_PHASE1.md「突発のできごと」。数字は data.ts の EVENT。
 */
import { t } from '../../i18n';
import { EVENT, MATS, PRODUCT, SECTOR_CHIEF, skuParts, type Mat, type Sku, type Tier } from './data';
import { book, brandAdd } from './company';
import { moraleAdd } from './hr';
import { fullUse, matPrice, myShops, priceOf, rng, spend, staffOf, type P1State } from './model';

// ---------------------------------------------------------------- 型

/** 倍率の種類：来店と需要（自社の店のお客さん）・値段・素材の値段・運ぶ日数（大きいほど遅い）・作る速さ */
export type EvFxKind = 'demand' | 'price' | 'mat' | 'haul' | 'craft';
export interface EvFx {
  k: EvFxKind;
  /** 商品（demand・price）・素材（mat）。無ければ全部 */
  key?: string;
  mul: number;
  days: number;
}
/** できごとの種類（良い 10・困りごと 10） */
export type EvKind =
  | 'heat'
  | 'festival'
  | 'tourists'
  | 'trend'
  | 'wholesale'
  | 'idea'
  | 'traveler'
  | 'celebrity'
  | 'bigorder'
  | 'sponsor'
  | 'rain'
  | 'matrise'
  | 'breakdown'
  | 'rumor'
  | 'rivalsale'
  | 'scout'
  | 'complaint'
  | 'defect'
  | 'roadwork'
  | 'tired';
export const GOOD_KINDS: EvKind[] = ['heat', 'festival', 'tourists', 'trend', 'wholesale', 'idea', 'traveler', 'celebrity', 'bigorder', 'sponsor'];
export const BAD_KINDS: EvKind[] = ['rain', 'matrise', 'breakdown', 'rumor', 'rivalsale', 'scout', 'complaint', 'defect', 'roadwork', 'tired'];
export const EV_KINDS: EvKind[] = [...GOOD_KINDS, ...BAD_KINDS];
export const isGood = (k: EvKind) => GOOD_KINDS.includes(k);

/** 選択肢（データだけ。文は EV_TEXT から見せるときに作る） */
export interface EvOpt {
  id: string;
  /** その場の費用（G） */
  cost: number;
  fx: EvFx[];
  /** その場で入るお金（謝礼など） */
  money?: number;
  brand?: number;
  rp?: number;
  /** 士気（全員）・その人だけの士気 */
  morale?: number;
  moraleHero?: number;
  /** 大口の注文：工房の在庫から n 個を、1 個 yen で渡す */
  order?: { sku: Sku; n: number; yen: number };
  /** 様子を見る系（自動プレイの最短が選ぶ、いちばん軽い手） */
  light?: boolean;
  /** 見込み（G。費用込み。ブランド力・研究ポイント・士気は EVENT.val で G に直す） */
  ev: number;
}
/** できごと 1 つ（カードの ev に入れる） */
export interface EvData {
  kind: EvKind;
  good: boolean;
  /** 話し手：マインちゃん・ヒーロー（店員・職人・調達係・スカウトされた本人）・町の長 */
  who: 'mine' | 'hero' | 'chief';
  hero?: number;
  /** 商品・素材・個数（文と効き目） */
  key?: string;
  mat?: Mat;
  n?: number;
  opts: EvOpt[];
}
/** いま効いている倍率 */
export interface ActiveFx extends Omit<EvFx, 'days'> {
  until: number;
  sector: string;
  ev: EvKind;
}
export interface EvLog {
  kind: EvKind;
  key?: string;
  mat?: Mat;
  n?: number;
  opt: string;
  day: number;
  sector: string;
}
export interface EventStat {
  /** ランクごとの数・種類ごとの数と選んだ手・良い／困りごとの数・選んだ手の見込みの合計 */
  tier: Partial<Record<Tier, number>>;
  kind: Partial<Record<EvKind, { n: number; opt: Record<string, number> }>>;
  good: number;
  bad: number;
  ev: number;
}
export interface EventState {
  /** 次のできごとを出す、この会社の締めの回数（CardState.mk）。null はまだ決めていない */
  next: number | null;
  last: EvKind | null;
  lastGood: boolean | null;
  fx: ActiveFx[];
  /** まだ月次報告に出していない、選んだできごと */
  pend: EvLog[];
  /** いまの町の月の、できごとの売上の上乗せ（下げ）。月次報告の「できごと」の行（渡したら 0） */
  yen?: number;
  stat: EventStat;
}
export const newEventStat = (): EventStat => ({ tier: {}, kind: {}, good: 0, bad: 0, ev: 0 });
export const newEvents = (): EventState => ({ next: null, last: null, lastGood: null, fx: [], pend: [], stat: newEventStat() });
export const eventsOf = (s: P1State): EventState => (s.events ??= newEvents());

/** 比べの計測（できごとなし）とテストで止める */
export const EVENT_OFF = { on: false };

// ---------------------------------------------------------------- 倍率（model.ts の計算が使う）

/** いまの町で効いている倍率の積（無ければ 1。自社の店・この町の数字だけ） */
export function evMul(s: Pick<P1State, 'events' | 'day' | 'sector'>, k: EvFxKind, key?: string): number {
  const fx = s.events?.fx;
  if (!fx || !fx.length) return 1;
  let m = 1;
  const here = s.sector ?? 'c1';
  for (const f of fx) if (f.k === k && f.until > s.day && f.sector === here && (!f.key || f.key === key)) m *= f.mul;
  return m;
}
/** 来店・需要・値段の倍率の効き目：その日の売上の上乗せ（下げ）をお金に（会社の帳簿の売上。町の順位には入れない） */
export function evSales(s: P1State, v: number) {
  if (!v) return;
  s.money += v;
  book(s, 'sales', v);
  const E = eventsOf(s);
  E.yen = (E.yen ?? 0) + v;
}
/** いま効いている倍率（上の帯の札・月次報告）。古いものは片づける */
export function activeFx(s: P1State): ActiveFx[] {
  const E = s.events;
  if (!E) return [];
  E.fx = E.fx.filter((f) => f.until > s.day);
  return E.fx.filter((f) => f.sector === (s.sector ?? 'c1'));
}

// ---------------------------------------------------------------- 見込み

const lastRep = (s: P1State) => s.reports[s.reports.length - 1];
/** 月の売上（いまの町の先月） */
export const monthRev = (s: P1State) => Math.max(0, lastRep(s)?.revenue ?? 0);
/** 金額の元（月の売上 × p。売上が 1 万 G 以上なら 100 G 単位、それより下は 10 G 単位・最低 10 G） */
const amt = (s: P1State, p: number) => {
  const v = monthRev(s) * p;
  const u = monthRev(s) >= 10000 ? 100 : 10;
  return Math.max(10, Math.floor(v / u) * u);
};
/** 素材の月の代金（その素材だけ・全部） */
function matCost(s: P1State, m?: Mat): number {
  const all = Math.max(0, lastRep(s)?.costs.materials ?? 0);
  if (!m) return all;
  const use = fullUse(s);
  const v = (use[m] ?? 0) * matPrice(s, m);
  return Math.min(all, v);
}
/** 倍率 1 つの見込み（G） */
export function fxEv(s: P1State, f: EvFx): number {
  const C = EVENT.conv;
  const M = monthRev(s);
  const part = f.days / 30;
  const base = f.key && (f.k === 'demand' || f.k === 'price') ? Math.max(0, lastRep(s)?.bySeries[f.key] ?? 0) : M;
  switch (f.k) {
    case 'demand':
      return base * (f.mul - 1) * part * C.demand;
    case 'price':
      return base * (f.mul - 1) * part * C.price;
    case 'mat':
      return -matCost(s, f.key as Mat | undefined) * (f.mul - 1) * part;
    case 'haul':
      return -M * (f.mul - 1) * part * C.haul;
    case 'craft':
      return M * (f.mul - 1) * part * C.craft;
  }
}
/** 選択肢の見込み（G） */
export function optEv(s: P1State, o: Omit<EvOpt, 'ev'>): number {
  const M = monthRev(s);
  const V = EVENT.val;
  let v = -o.cost + (o.money ?? 0);
  for (const f of o.fx) v += fxEv(s, f);
  v += (o.brand ?? 0) * V.brand * M;
  v += (o.rp ?? 0) * V.rp * M * (EVENT.rp.C / EVENT.rp[s.tier ?? 'C']);
  v += (o.morale ?? 0) * V.morale * M;
  v += (o.moraleHero ?? 0) * V.morale * 0.3 * M;
  if (o.order) v += o.order.n * (o.order.yen - priceOf(s, o.order.sku));
  return Math.round(v);
}

// ---------------------------------------------------------------- できごとを作る

type Who = { who: EvData['who']; hero?: number };
const shelved = (s: P1State): string[] => [...new Set(myShops(s).flatMap((b) => (s.shops[b.uid]?.shelves ?? []).filter((x): x is Sku => !!x).map((x) => skuParts(x)[0])))];
const clerk = (s: P1State): number | null => myShops(s).map((b) => s.shops[b.uid]?.staff).find((x) => x != null) ?? null;
const crafter = (s: P1State): number | null => s.slots.find((x) => x.worker != null && staffOf(s, x.worker!)?.task === 'craft')?.worker ?? null;
const buyer = (s: P1State): number | null => s.staff.find((x) => x.task === 'buy')?.hero ?? null;

/** 種類ごとに、出せるか・話し手・選択肢（r：この締めの乱数） */
function build(s: P1State, kind: EvKind, r: () => number): Omit<EvData, 'good'> | null {
  const T = s.tier ?? 'C';
  const B = EVENT.brand[T];
  const R = EVENT.rp[T];
  const rep = lastRep(s);
  const sales = (k: string) => rep?.bySeries[k] ?? 0;
  const goods = shelved(s).filter((k) => sales(k) > 0);
  const pickKey = () => (goods.length ? goods[Math.floor(r() * goods.length)] : null);
  const o = (id: string, x: Partial<Omit<EvOpt, 'id' | 'ev'>>): EvOpt => {
    const b: Omit<EvOpt, 'ev'> = { id, cost: 0, fx: [], ...x };
    return { ...b, ev: optEv(s, b) };
  };
  const D = (mul: number, days: number, key?: string): EvFx => ({ k: 'demand', mul, days, ...(key ? { key } : {}) });
  const P = (mul: number, days: number, key?: string): EvFx => ({ k: 'price', mul, days, ...(key ? { key } : {}) });
  const mine: Who = { who: 'mine' };
  const chief: Who | null = SECTOR_CHIEF[s.sector ?? 'c1'] != null ? { who: 'chief', hero: SECTOR_CHIEF[s.sector ?? 'c1'] } : mine;
  const heroOr = (h: number | null): Who => (h != null ? { who: 'hero', hero: h } : mine);
  switch (kind) {
    case 'heat': {
      const key = pickKey();
      if (!key) return null;
      return { kind, ...mine, key, opts: [o('stock', { cost: amt(s, 0.02), fx: [D(1.5, 14, key)] }), o('raise', { fx: [P(1.15, 14, key), D(1.2, 14, key)] }), o('watch', { fx: [D(1.2, 14, key)], light: true })] };
    }
    case 'festival':
      return { kind, ...chief!, opts: [o('stall', { cost: amt(s, 0.03), fx: [D(1.3, 7)], brand: B }), o('ad', { cost: amt(s, 0.02), brand: 2 * B }), o('watch', { fx: [D(1.1, 7)], light: true })] };
    case 'tourists': {
      const h = clerk(s);
      return { kind, ...heroOr(h), opts: [o('call', { fx: [D(1.3, 5)], morale: -2 }), o('price', { fx: [P(1.1, 5), D(1.15, 5)] }), o('watch', { fx: [D(1.15, 5)], light: true })] };
    }
    case 'trend': {
      const key = pickKey();
      if (!key) return null;
      return { kind, ...mine, key, opts: [o('corner', { cost: amt(s, 0.01), fx: [D(1.6, 21, key)] }), o('watch', { fx: [D(1.25, 21, key)], light: true })] };
    }
    case 'wholesale':
      if (matCost(s) <= 0) return null;
      return { kind, ...heroOr(buyer(s)), opts: [o('bulk', { fx: [{ k: 'mat', mul: 0.75, days: 14 }] }), o('deal', { fx: [{ k: 'mat', mul: 0.85, days: 28 }] }), o('watch', { fx: [{ k: 'mat', mul: 0.9, days: 7 }], light: true })] };
    case 'idea': {
      const h = crafter(s);
      if (h == null) return null;
      return { kind, who: 'hero', hero: h, opts: [o('note', { rp: R, fx: [{ k: 'craft', mul: 0.9, days: 7 }] }), o('apply', { fx: [{ k: 'craft', mul: 1.2, days: 14 }] }), o('keep', { rp: Math.round(R / 3), light: true })] };
    }
    case 'traveler':
      if (!s.slots.some((x) => x.worker != null)) return null;
      return { kind, ...mine, opts: [o('help', { cost: amt(s, 0.015), fx: [{ k: 'craft', mul: 1.25, days: 14 }] }), o('learn', { cost: amt(s, 0.01), rp: Math.round(R / 2) }), o('no', { light: true })] };
    case 'celebrity': {
      const h = clerk(s);
      return { kind, ...heroOr(h), opts: [o('photo', { brand: 2 * B, fx: [D(1.15, 14)] }), o('quiet', { brand: Math.max(1, Math.round(B / 2)), light: true })] };
    }
    case 'bigorder': {
      const units = (k: string) => Math.max(0, Math.round((rep?.bySeries[k] ?? 0) / Math.max(1, PRODUCT[k]?.price ?? 1)));
      const cands = (Object.entries(s.stock) as [Sku, number][])
        .filter(([x, n]) => (n ?? 0) >= EVENT.order.min && goods.includes(skuParts(x)[0]))
        .map(([x, n]) => ({ x, n: Math.min(n ?? 0, Math.max(EVENT.order.min, Math.round(units(skuParts(x)[0]) * EVENT.order.share))) }));
      if (!cands.length) return null;
      const c = cands[Math.floor(r() * cands.length)];
      const yen = Math.round(priceOf(s, c.x) * (1 + EVENT.order.premium));
      const half = Math.max(1, Math.floor(c.n / 2));
      return { kind, ...heroOr(clerk(s)), key: c.x, n: c.n, opts: [o('all', { order: { sku: c.x, n: c.n, yen } }), o('half', { order: { sku: c.x, n: half, yen } }), o('no', { light: true })] };
    }
    case 'sponsor':
      return { kind, ...chief!, opts: [o('sponsor', { cost: amt(s, 0.03), brand: 2 * B }), o('name', { cost: amt(s, 0.01), brand: B }), o('no', { light: true })] };
    case 'rain':
      if (!myShops(s).length) return null;
      return { kind, ...mine, opts: [o('repair', { cost: amt(s, 0.015), fx: [D(1.08, 14)], brand: Math.max(1, Math.round(B / 2)) }), o('detour', { fx: [{ k: 'haul', mul: 1.2, days: 10 }] }), o('wait', { fx: [{ k: 'haul', mul: 1.6, days: 10 }], light: true })] };
    case 'matrise': {
      const use = fullUse(s);
      const m = (Object.keys(use) as Mat[]).sort((a, b) => (use[b] ?? 0) * matPrice(s, b) - (use[a] ?? 0) * matPrice(s, a))[0];
      if (!m || matCost(s, m) <= 0) return null;
      const F = (mul: number, days: number): EvFx => ({ k: 'mat', key: m, mul, days });
      return { kind, ...heroOr(buyer(s)), mat: m, opts: [o('regular', { fx: [F(0.95, 14)] }), o('other', { fx: [F(1.1, 21)] }), o('bear', { fx: [F(1.35, 21)], light: true })] };
    }
    case 'breakdown': {
      const h = crafter(s);
      if (h == null) return null;
      const C = (mul: number, days: number): EvFx => ({ k: 'craft', mul, days });
      return { kind, who: 'hero', hero: h, opts: [o('fix', { cost: amt(s, 0.01), fx: [C(1.1, 14)] }), o('self', { fx: [C(0.8, 5)] }), o('limp', { fx: [C(0.7, 10)], light: true })] };
    }
    case 'rumor':
      return { kind, ...mine, opts: [o('explain', { cost: amt(s, 0.005), fx: [D(1.05, 7)], brand: B }), o('gift', { fx: [P(0.92, 7), D(1.08, 7)] }), o('watch', { fx: [D(0.85, 10)], brand: -B, light: true })] };
    case 'rivalsale': {
      const h = clerk(s);
      return { kind, ...heroOr(h), opts: [o('match', { fx: [P(0.95, 10), D(1.15, 10)] }), o('pop', { cost: amt(s, 0.01), fx: [D(1.05, 10)] }), o('watch', { fx: [D(0.88, 10)], light: true })] };
    }
    case 'scout': {
      const st = [...s.staff].filter((x) => x.task && x.task !== 'manager' && x.task !== 'lead' && x.task !== 'train').sort((a, b) => (b.level ?? 1) - (a.level ?? 1))[0];
      if (!st) return null;
      const lend: EvFx = st.task === 'craft' ? { k: 'craft', mul: 0.85, days: 7 } : D(0.95, 7);
      return { kind, who: 'hero', hero: st.hero, opts: [o('talk', { moraleHero: 6 }), o('lend', { money: amt(s, 0.01), fx: [lend] }), o('ignore', { moraleHero: -15, light: true })] };
    }
    case 'complaint':
      if (!s.slots.some((x) => x.worker != null)) return null;
      return { kind, ...chief!, opts: [o('apologize', { cost: amt(s, 0.005), brand: B, fx: [D(1.03, 14)] }), o('hours', { fx: [{ k: 'craft', mul: 0.9, days: 7 }] }), o('ignore', { brand: -2 * B, light: true })] };
    case 'defect': {
      const h = crafter(s);
      const key = pickKey();
      if (h == null || !key) return null;
      return { kind, who: 'hero', hero: h, key, opts: [o('check', { fx: [P(1.05, 14, key)], brand: Math.max(1, Math.round(B / 2)) }), o('discount', { fx: [P(0.85, 14, key)] }), o('ship', { fx: [D(0.85, 14, key)], brand: -B, light: true })] };
    }
    case 'roadwork': {
      const h = clerk(s);
      return { kind, ...heroOr(h), opts: [o('sign', { cost: amt(s, 0.008), fx: [D(1.05, 14)] }), o('sale', { fx: [P(0.9, 14), D(1.05, 14)] }), o('watch', { fx: [D(0.88, 14)], light: true })] };
    }
    case 'tired':
      if (s.staff.length < 2) return null;
      return { kind, ...mine, opts: [o('treat', { cost: amt(s, 0.005), morale: 10 }), o('rotate', { fx: [{ k: 'craft', mul: 0.9, days: 5 }], morale: 5 }), o('push', { morale: -8, light: true })] };
  }
}

/** 撮影・テスト用：種類を決めてできごとを作る（出せなければ null） */
export function makeEvent(s: P1State, kind: EvKind, salt = 0): EvData | null {
  const r = rng(s.seed * 7 + (s.cards?.mk ?? 0) * 131 + salt * 977 + 0xe7);
  const d = build(s, kind, r);
  return d ? { ...d, good: isGood(kind) } : null;
}

/** この締めにできごとを出すか（出すなら作る）。EVENT.first より前・チュートリアル・お店が無い町・売上 0 の月は出さない */
/**
 * 1 位を争っている（まだ制覇していない町で、この月の締めが 2 位以内か、1 位が続いているか、他社の巻き返しのさなか）。
 * このあいだはできごと（と外交の新しい使者・提案）を控える：1 位の取り合いの勝ち負けをできごとで変えない（できごとで遊ぶ時間を延ばさない。v26 の計測）。
 */
export function contestingTop(s: P1State): boolean {
  if (s.cleared) return false;
  const last = s.reports[s.reports.length - 1];
  return (last?.rank ?? 99) <= EVENT.calmRank || (s.topStreak ?? 0) > 0 || (s.comeback?.left ?? 0) > 0;
}

export function eventDue(s: P1State, mk: number): EvData | null {
  if (EVENT_OFF.on) return null;
  // 1 か月目（チュートリアル）は出さない：この町の締めが EVENT.first 回目から（チュートリアルは 1 か月目だけ。出すのも nextPop がチュートリアルのあいだ止める）
  if (s.reports.length < EVENT.first || monthRev(s) <= 0 || !myShops(s).length) return null;
  const E = eventsOf(s);
  const r = rng(s.seed * 7 + mk * 131 + 0xe7);
  if (E.next == null) E.next = mk + Math.floor(r() * (EVENT.gap[1] - EVENT.gap[0] + 1));
  if (mk < E.next) return null;
  // 1 位を争っている月は控える（予定の月は動かさず、争いが落ち着いた締めで出す）
  if (contestingTop(s)) return null;
  // 良いできごとと困りごとを交互に（はじめはどちらか）。同じ種類は続けない
  const good = E.lastGood == null ? r() < 0.5 : !E.lastGood;
  const pool = (good ? GOOD_KINDS : BAD_KINDS).filter((k) => k !== E.last);
  // 並びを乱数で混ぜて、出せる種類の 1 つ目
  const order = pool.map((k) => ({ k, v: r() })).sort((a, b) => a.v - b.v);
  for (const { k } of order) {
    const d = build(s, k, r);
    if (!d) continue;
    E.next = mk + EVENT.gap[0] + Math.floor(r() * (EVENT.gap[1] - EVENT.gap[0] + 1));
    E.last = k;
    E.lastGood = good;
    return { ...d, good };
  }
  // 出せる種類が無い：次の締めでもう一度
  return null;
}

// ---------------------------------------------------------------- 選ぶ

/** おすすめ（払えるもののうち見込みのいちばん大きいもの）・いちばん得な手・軽い手（様子を見る） */
export function recOpt(s: P1State, d: EvData): number {
  let best = -1;
  d.opts.forEach((o, k) => {
    if (o.cost > s.money) return;
    if (best < 0 || o.ev > d.opts[best].ev) best = k;
  });
  return best < 0 ? d.opts.findIndex((o) => o.light) : best;
}
export const lightOpt = (d: EvData) => Math.max(0, d.opts.findIndex((o) => o.light));

/** 選んだ手を打つ（費用・効き目・お金・ブランド力・研究ポイント・士気・大口の注文）。打てなければ理由 */
export function applyEvent(s: P1State, d: EvData, k: number): string | null {
  const o = d.opts[k];
  if (!o) return 'none';
  if (o.cost > s.money) return 'money';
  if (o.order) {
    const have = s.stock[o.order.sku] ?? 0;
    if (have < o.order.n) return 'stock';
  }
  const E = eventsOf(s);
  if (o.cost > 0) {
    s.money -= o.cost;
    spend(s, 'ads', o.cost, 'other');
  }
  if (o.money) {
    s.money += o.money;
    book(s, 'other', -o.money);
  }
  for (const f of o.fx) E.fx.push({ k: f.k, ...(f.key ? { key: f.key } : {}), mul: f.mul, until: s.day + f.days, sector: s.sector ?? 'c1', ev: d.kind });
  if (o.brand) brandAdd(s, o.brand, t(`できごと：${evTitle(d)}`, `Event: ${evTitle(d)}`));
  if (o.rp) s.rp = (s.rp ?? 0) + o.rp;
  if (o.morale) for (const st of s.staff) moraleAdd(s, st, o.morale);
  if (o.moraleHero && d.who === 'hero' && d.hero != null) {
    const st = staffOf(s, d.hero);
    if (st) moraleAdd(s, st, o.moraleHero);
  }
  if (o.order) {
    const key = skuParts(o.order.sku)[0];
    const yen = o.order.n * o.order.yen;
    s.stock[o.order.sku] = (s.stock[o.order.sku] ?? 0) - o.order.n;
    s.money += yen;
    s.monthSales[key] = (s.monthSales[key] ?? 0) + yen;
    s.monthUnits[key] = (s.monthUnits[key] ?? 0) + o.order.n;
    book(s, 'sales', yen);
  }
  // 数え（月次報告・自動プレイの表）
  E.pend.push({ kind: d.kind, ...(d.key ? { key: d.key } : {}), ...(d.mat ? { mat: d.mat } : {}), ...(d.n ? { n: d.n } : {}), opt: o.id, day: s.day, sector: s.sector ?? 'c1' });
  const st = E.stat;
  const T = s.tier ?? 'C';
  st.tier[T] = (st.tier[T] ?? 0) + 1;
  const kk = (st.kind[d.kind] ??= { n: 0, opt: {} });
  kk.n++;
  kk.opt[o.id] = (kk.opt[o.id] ?? 0) + 1;
  if (d.good) st.good++;
  else st.bad++;
  st.ev += o.ev;
  return null;
}
/** 月次報告の「できごと」：この月の売上の上乗せ（下げ）。渡したら 0 */
export function takeEvYen(s: P1State): number {
  const E = s.events;
  if (!E?.yen) return 0;
  const v = Math.round(E.yen);
  E.yen = 0;
  return v;
}
/** 月次報告の「できごと」：前の報告から選んだできごと（いまの町）と、いま効いている倍率。渡したら空に */
export function takeEventLog(s: P1State): EvLog[] {
  const E = s.events;
  if (!E?.pend.length) return [];
  const xs = E.pend.filter((x) => x.sector === (s.sector ?? 'c1'));
  E.pend = [];
  return xs;
}

// ---------------------------------------------------------------- 文

interface EvText {
  icon: string;
  title: () => string;
  /** 話し手のセリフ（マインちゃんは言い切り、ヒーローと町の長は口調の型が付く言い切りの形）。{k} 商品・{m} 素材・{n} 個数 */
  say: () => string;
  /** マインちゃんだけが話す（言い切りのセリフ）。無ければ、話し手の口調の型（ヒーロー・町の長）か、マインちゃんの「〜よ！」を付ける */
  full?: boolean;
  opts: Record<string, { icon: string; label: () => string }>;
}
/** できごとの文（60 字まで。[[ ]] で色） */
export const EV_TEXT: Record<EvKind, EvText> = {
  heat: {
    full: true,
    icon: '☀',
    title: () => t('猛暑で、{k}が飛ぶように売れる！', 'A heatwave — {k} is flying off the shelves!'),
    say: () => t('暑さで[[{k}]]を求めるお客さんが急に増えたよ。どう売る？', 'The heat has customers hunting for [[{k}]]. How do we sell it?'),
    opts: { stock: { icon: '🧊', label: () => t('たくさん並べて売り切る', 'Stack it high and sell out') }, raise: { icon: '💹', label: () => t('少し値上げして売る', 'Raise the price a little') }, watch: { icon: '👀', label: () => t('いつもどおり売る', 'Sell as usual') } },
  },
  festival: {
    icon: '🏮',
    title: () => t('町のお祭り', 'The town festival'),
    say: () => t('今週は町のお祭りで、[[人出]]がぐっと増える', 'it is festival week, and [[crowds]] are coming'),
    opts: { stall: { icon: '🏮', label: () => t('屋台を出す', 'Set up a stall') }, ad: { icon: '📣', label: () => t('お祭りで宣伝する', 'Advertise at the festival') }, watch: { icon: '👀', label: () => t('いつもどおり', 'Business as usual') } },
  },
  tourists: {
    icon: '🧳',
    title: () => t('観光客の団体', 'A tour group'),
    say: () => t('急に[[観光客の団体]]が来て、店の前があふれている', 'a [[tour group]] just showed up and the shop is packed'),
    opts: { call: { icon: '🙋', label: () => t('呼び込みをする', 'Call them in') }, price: { icon: '💹', label: () => t('観光客向けの値段にする', 'Tourist pricing') }, watch: { icon: '👀', label: () => t('いつもどおり', 'Business as usual') } },
  },
  trend: {
    full: true,
    icon: '🔥',
    title: () => t('{k}が流行りはじめた！', '{k} is trending!'),
    say: () => t('いま町で[[{k}]]が流行りはじめてるよ！ 乗っかる？', '[[{k}]] is suddenly trending in town! Ride the wave?'),
    opts: { corner: { icon: '🔥', label: () => t('店の前に特設コーナー', 'A special corner up front') }, watch: { icon: '👀', label: () => t('様子を見る', 'Wait and see') } },
  },
  wholesale: {
    icon: '🏷',
    title: () => t('卸問屋の大安売り', 'Wholesaler clearance'),
    say: () => t('卸問屋が[[素材の大安売り]]をしている。どう仕入れるか', 'the wholesaler is running a [[materials clearance]] — how do we buy'),
    opts: { bulk: { icon: '📦', label: () => t('まとめて仕入れる', 'Buy in bulk') }, deal: { icon: '🧾', label: () => t('長い取引の約束をする', 'Sign a longer deal') }, watch: { icon: '👀', label: () => t('いつもどおり', 'Business as usual') } },
  },
  idea: {
    icon: '💡',
    title: () => t('ひらめき', 'A flash of insight'),
    say: () => t('作業中に[[新しい手順]]をひらめいた。どう使うか', 'I had an idea for a [[new method]] at the bench — how shall we use it'),
    opts: { note: { icon: '📒', label: () => t('研究ノートにまとめる', 'Write it up for research') }, apply: { icon: '🔨', label: () => t('すぐ作業に活かす', 'Use it at the bench now') }, keep: { icon: '💭', label: () => t('覚えておく', 'Keep it in mind') } },
  },
  traveler: {
    full: true,
    icon: '🎒',
    title: () => t('腕自慢の旅人', 'A skilled traveler'),
    say: () => t('[[腕自慢の旅人]]が「しばらく工房で働かせて」って来てるよ！', 'A [[skilled traveler]] asks to work at the workshop for a while!'),
    opts: { help: { icon: '🤝', label: () => t('2 週間手伝ってもらう', 'Two weeks of help') }, learn: { icon: '📚', label: () => t('技を教わる', 'Learn their craft') }, no: { icon: '🙇', label: () => t('今回は断る', 'Not this time') } },
  },
  celebrity: {
    icon: '🌟',
    title: () => t('有名人の来店', 'A celebrity visit'),
    say: () => t('お忍びで[[有名人]]が来店している', 'a [[celebrity]] has slipped into the shop'),
    opts: { photo: { icon: '📸', label: () => t('写真を飾って宣伝する', 'Frame the photo and promote it') }, quiet: { icon: '🤫', label: () => t('そっと見守る', 'Let them shop in peace') } },
  },
  bigorder: {
    icon: '📦',
    title: () => t('大口の注文', 'A big order'),
    say: () => t('お客さんが[[{k}を {n} 個]]まとめて欲しがっている', 'a customer wants [[{n} × {k}]] in one order'),
    opts: { all: { icon: '📦', label: () => t('全部受ける', 'Take the whole order') }, half: { icon: '✂', label: () => t('半分だけ受ける', 'Take half') }, no: { icon: '🙇', label: () => t('断る', 'Decline') } },
  },
  sponsor: {
    icon: '🎗',
    title: () => t('町の行事への協賛', 'Sponsoring a town event'),
    say: () => t('今度の町の行事に、[[協賛]]してくれる店を探している', 'we are looking for shops to [[sponsor]] the next town event'),
    opts: { sponsor: { icon: '🎗', label: () => t('協賛する', 'Sponsor it') }, name: { icon: '📛', label: () => t('名前だけ出す', 'Just lend our name') }, no: { icon: '🙇', label: () => t('今回は見送る', 'Pass this time') } },
  },
  rain: {
    full: true,
    icon: '☔',
    title: () => t('大雨で、橋が流された！', 'Heavy rain washed out a bridge!'),
    say: () => t('お店への道が[[ 10 日]]止まりそう。荷車が遅れちゃう…どうする？', 'The road to the shops may close for [[10 days]]. Carts will be late… what now?'),
    opts: { repair: { icon: '🛠', label: () => t('修理に寄付する', 'Donate to the repairs') }, detour: { icon: '🚚', label: () => t('遠回りの道で運ぶ', 'Take the long way round') }, wait: { icon: '📦', label: () => t('在庫でしのぐ', 'Get by on stock') } },
  },
  matrise: {
    icon: '📈',
    title: () => t('{m}の値上がり', '{m} prices are rising'),
    say: () => t('[[{m}]]の値段が、3 週間ほど上がるらしい', '[[{m}]] will cost more for about three weeks'),
    opts: { regular: { icon: '🤝', label: () => t('なじみの問屋に頼む', 'Ask our regular supplier') }, other: { icon: '🔁', label: () => t('別の問屋から仕入れる', 'Buy from another supplier') }, bear: { icon: '😣', label: () => t('我慢して買う', 'Pay up') } },
  },
  breakdown: {
    icon: '🔧',
    title: () => t('作業台の故障', 'A bench broke down'),
    say: () => t('作業台の[[歯車が欠けて]]、このままでは作業が遅れる', 'a [[gear on the bench cracked]] and work will slow down'),
    opts: { fix: { icon: '🔧', label: () => t('すぐ修理を呼ぶ（ついでに点検）', 'Call a mechanic (with a tune-up)') }, self: { icon: '🩹', label: () => t('自分たちで直す', 'Fix it ourselves') }, limp: { icon: '😣', label: () => t('だましだまし使う', 'Limp along') } },
  },
  rumor: {
    full: true,
    icon: '🗞',
    title: () => t('悪いうわさ', 'A bad rumor'),
    say: () => t('町で[[根も葉もないうわさ]]が流れてるみたい…お客さんが減るかも', 'A [[baseless rumor]] is going around town… we may lose customers'),
    opts: { explain: { icon: '📰', label: () => t('すぐ説明を出す', 'Put out a statement') }, gift: { icon: '🎁', label: () => t('お詫びのおまけを付ける', 'Add a goodwill freebie') }, watch: { icon: '👀', label: () => t('様子を見る', 'Wait and see') } },
  },
  rivalsale: {
    icon: '🏷',
    title: () => t('よその店の大安売り', 'A rival’s big sale'),
    say: () => t('よその店が[[大安売り]]を始めて、お客さんが流れている', 'a rival started a [[big sale]] and customers are drifting away'),
    opts: { match: { icon: '🏷', label: () => t('こちらも少し値下げ', 'Trim our prices a little') }, pop: { icon: '⭐', label: () => t('品質を伝える POP を作る', 'Make signs about quality') }, watch: { icon: '👀', label: () => t('様子を見る', 'Wait and see') } },
  },
  scout: {
    icon: '📨',
    title: () => t('よその店からのスカウト', 'A rival is poaching'),
    say: () => t('よその店から[[うちに来ないか]]と誘われている', 'another shop has asked me to [[come work for them]]'),
    opts: { talk: { icon: '☕', label: () => t('面談して引き留める', 'Talk them into staying') }, lend: { icon: '🎁', label: () => t('1 週間だけ応援に出す（謝礼）', 'Lend them for a week (for a fee)') }, ignore: { icon: '😶', label: () => t('何もしない', 'Do nothing') } },
  },
  complaint: {
    icon: '📢',
    title: () => t('近所からの苦情', 'A complaint from the neighbors'),
    say: () => t('工房の[[音がうるさい]]と、近所から苦情が来ている', 'the neighbors say the workshop is [[too noisy]]'),
    opts: { apologize: { icon: '🙇', label: () => t('菓子折りを持って謝る', 'Apologize with a gift') }, hours: { icon: '🕘', label: () => t('作業の時間を短くする', 'Shorten work hours') }, ignore: { icon: '😶', label: () => t('気にしない', 'Ignore it') } },
  },
  defect: {
    icon: '🔍',
    title: () => t('{k}に小さな傷', 'Scratches on {k}'),
    say: () => t('作った[[{k}]]に、小さな傷が見つかった', 'we found small [[scratches on {k}]]'),
    opts: { check: { icon: '🔍', label: () => t('全部点検して直す', 'Inspect and fix them all') }, discount: { icon: '💴', label: () => t('値引きして売る', 'Sell at a discount') }, ship: { icon: '😶', label: () => t('そのまま売る', 'Sell them as is') } },
  },
  roadwork: {
    icon: '🚧',
    title: () => t('店の前の道路工事', 'Roadwork out front'),
    say: () => t('店の前で[[道路工事]]が始まって、お客さんが通りにくい', '[[roadwork]] out front is keeping customers away'),
    opts: { sign: { icon: '🪧', label: () => t('迂回の看板とチラシ', 'Detour signs and flyers') }, sale: { icon: '🏷', label: () => t('工事中セール', 'A roadwork sale') }, watch: { icon: '👀', label: () => t('様子を見る', 'Wait and see') } },
  },
  tired: {
    full: true,
    icon: '🥵',
    title: () => t('みんなお疲れ気味', 'Everyone is worn out'),
    say: () => t('このところ忙しくて、みんな[[お疲れ気味]]みたい…', 'It has been busy lately, and everyone looks [[worn out]]…'),
    opts: { treat: { icon: '🍉', label: () => t('差し入れをする', 'Bring treats') }, rotate: { icon: '🛌', label: () => t('交代で休ませる', 'Rotate rest days') }, push: { icon: '💪', label: () => t('がんばってもらう', 'Ask them to push on') } },
  },
};

const fill = (x: string, d: Pick<EvData, 'key' | 'mat' | 'n'>) =>
  x
    .replace(/\{k\}/g, d.key ? (PRODUCT[skuParts(d.key as Sku)[0]]?.name ?? d.key) : '')
    .replace(/\{m\}/g, d.mat ? MATS[d.mat].name : '')
    .replace(/\{n\}/g, String(d.n ?? 0));
export const evTitle = (d: Pick<EvData, 'kind' | 'key' | 'mat' | 'n'>) => fill(EV_TEXT[d.kind].title(), d);
export const evSay = (d: Pick<EvData, 'kind' | 'key' | 'mat' | 'n'>) => fill(EV_TEXT[d.kind].say(), d);
export const evIcon = (k: EvKind) => EV_TEXT[k].icon;
export const optName = (k: EvKind, id: string) => EV_TEXT[k].opts[id]?.label() ?? id;
export const optIcon = (k: EvKind, id: string) => EV_TEXT[k].opts[id]?.icon ?? '▶';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sgn = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
/** 倍率 1 つの短い文（「来店 ×1.3（7 日）」） */
export function fxText(f: Pick<EvFx, 'k' | 'key' | 'mul'> & { days?: number }): string {
  const nm = f.key ? (f.k === 'mat' ? MATS[f.key as Mat]?.name ?? f.key : PRODUCT[f.key]?.name ?? f.key) : '';
  const what =
    f.k === 'demand'
      ? f.key
        ? t(`${nm}の需要`, `${nm} demand`)
        : t('来店', 'Visitors')
      : f.k === 'price'
        ? f.key
          ? t(`${nm}の値段`, `${nm} price`)
          : t('値段', 'Prices')
        : f.k === 'mat'
          ? f.key
            ? t(`${nm}の値段`, `${nm} cost`)
            : t('素材の値段', 'Material costs')
          : f.k === 'haul'
            ? t('運ぶ日数', 'Haul time')
            : t('作る速さ', 'Craft speed');
  const days = f.days != null ? t(`（${f.days} 日）`, ` (${f.days}d)`) : '';
  return `${what} ×${Math.round(f.mul * 100) / 100}${days}`;
}
/** 選択肢の 2 行目（費用・効き目・見込み。「・」で区切る） */
export function optSub(d: EvData, o: EvOpt): string {
  const xs: string[] = [];
  if (o.cost > 0) xs.push(g(o.cost));
  if (o.money) xs.push(t(`謝礼 +${g(o.money)}`, `Fee +${g(o.money)}`));
  if (o.order) xs.push(t(`在庫 ${o.order.n} 個を 1 個 ${g(o.order.yen)} で`, `${o.order.n} from stock at ${g(o.order.yen)}`));
  for (const f of o.fx) xs.push(fxText(f));
  if (o.brand) xs.push(t(`ブランド力 ${sgn(o.brand)}`, `Brand ${sgn(o.brand)}`));
  if (o.rp) xs.push(t(`研究 +${o.rp} RP`, `+${o.rp} RP`));
  if (o.morale) xs.push(t(`士気 ${sgn(o.morale)}`, `Morale ${sgn(o.morale)}`));
  if (o.moraleHero) xs.push(t(`本人の士気 ${sgn(o.moraleHero)}`, `Their morale ${sgn(o.moraleHero)}`));
  if (!xs.length) xs.push(t('何も起きない', 'Nothing happens'));
  xs.push(t(`見込み ${sgn(o.ev)} G`, `Est. ${sgn(o.ev)} G`));
  void d;
  return xs.join(t('・', ' · '));
}
/** 月次報告の 1 行（長い・短い） */
export function eventReportText(xs: EvLog[], fx: ActiveFx[], yen = 0): [string, string] | null {
  if (!xs.length && !fx.length && !yen) return null;
  const names = xs.map((x) => `${evIcon(x.kind)} ${evTitle(x)}→${optName(x.kind, x.opt)}`);
  const on = fx.length ? t(`効いている：${fx.map((f) => fxText(f)).join('・')}`, `Active: ${fx.map((f) => fxText(f)).join(', ')}`) : '';
  const money = yen ? t(`売上の上乗せ ${sgn(yen)} G`, `Sales effect ${sgn(yen)} G`) : '';
  const long = [names.join(t('／', ' / ')), money, on].filter(Boolean).join(t('。', '. '));
  const short = xs.length ? t(`${xs.length} 件（${names[0]}）`, `${xs.length} (${names[0]})`) : on;
  return [long, short];
}
