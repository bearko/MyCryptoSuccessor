/**
 * ヒーローの育成（段 E1。docs/ISLAND_PHASE1.md「ヒーローの育成」）：Lv・経験値・レアリティの昇格・パッシブスキル。
 * 画面に依存しない純粋な計算（model.ts から使う。テストは tests/island-p1-hero-growth.test.ts）。数字は data.ts の HERO_GROWTH の 1 か所。
 *
 * 能力値の持ち方：Staff.stats はいつも「いまの能力値」（仕事の計算はこれまでどおり st.stats を読む）。
 * そのうち Lv で上がったぶんを Staff.lvGain に覚えておき、stats − lvGain が「Lv1 のときの能力値」（雇ったときの値に OJT・バイト・復興の伸びを足したもの）。
 * Lv・昇格が変わったら syncGrowth で lvGain を計算し直す（Lv1・昇格なしなら lvGain は 0 で、いまのゲームの能力値と同じ）。
 */
import { heroById } from '../../game/catalog';
import { aptitude, capLv, FACTION_PASSIVE, HERO_GROWTH, HERO_RARITIES, PASSIVES, type HeroRarity, type PassiveKind, type PromoItem, type Stats, type Task } from './data';
import type { Staff } from './model';

const G = HERO_GROWTH;
type Key3 = 'phy' | 'int' | 'agi';
const K3: Key3[] = ['phy', 'int', 'agi'];

interface HeroRow {
  rarity?: string | null;
  category?: string;
  faction?: string;
  passive?: string;
  passiveEn?: string;
  stats?: Stats | null;
  initial?: Stats | null;
}
const row = (id: number) => heroById.get(id) as unknown as HeroRow | undefined;

/** MCH のレアリティ → 育成のレアリティ（novice は Novice。レプリカは同じ段のオリジナルにそろえる） */
const RAR_OF: Record<string, HeroRarity> = { Common: 'C', Uncommon: 'U', Rare: 'R', Epic: 'E', Legendary: 'L', RepC: 'U', RepB: 'R', RepA: 'E', RepS: 'L' };
export function heroRarityOf(id: number): HeroRarity {
  const h = row(id);
  if (!h || h.category === 'novice' || !h.rarity) return 'N';
  return RAR_OF[h.rarity] ?? 'C';
}
export const rarIdx = (r: HeroRarity) => HERO_RARITIES.indexOf(r);
/** 1 つ上のレアリティ（LL の上は無い） */
export const nextRarity = (r: HeroRarity): HeroRarity | null => HERO_RARITIES[rarIdx(r) + 1] ?? null;

// ---------------------------------------------------------------- 経験値の曲線

/** Lv L に届くまでの経験値の合計 */
export const xpTotal = (L: number) => Math.round(G.curve.k * Math.pow(Math.max(0, L - 1), G.curve.p));
/** Lv L → L+1 に要る経験値 */
export const xpNeed = (L: number) => xpTotal(L + 1) - xpTotal(L);
/** 経験値の合計から Lv（上限 cap まで） */
export function levelForXp(total: number, cap: number): number {
  let L = 1;
  while (L < cap && xpTotal(L + 1) <= total) L++;
  return L;
}

// ---------------------------------------------------------------- 能力値

/** 能力値ごとの伸びの個性：MCH の Lv1 → 最大 Lv の伸び方の比（3 つの平均を 1 に。lo〜hi） */
const weightCache = new Map<number, Record<Key3, number>>();
export function growthWeights(id: number): Record<Key3, number> {
  const hit = weightCache.get(id);
  if (hit) return hit;
  const h = row(id);
  const r = K3.map((k) => (h?.initial && h.stats && h.initial[k] > 0 ? h.stats[k] / h.initial[k] : 1));
  const avg = r.reduce((a, b) => a + b, 0) / 3 || 1;
  const w = Object.fromEntries(K3.map((k, n) => [k, Math.min(G.mul.hi, Math.max(G.mul.lo, r[n] / avg))])) as Record<Key3, number>;
  weightCache.set(id, w);
  return w;
}
/** Lv とレアリティで掛ける倍率（能力値ごとの個性の前。Lv1・昇格なしで 1） */
export function levelMul(level: number, base: HeroRarity, promos: number): number {
  const cap0 = capLv(base);
  const L = Math.max(1, level);
  let m = 1 + G.mul.atCap * (Math.min(L, cap0) - 1) / Math.max(1, cap0 - 1);
  // もとの上限より先：Legendary の上限（100）までは緩やかに、Limited Legendary（101〜120）は少し大きく
  const capL = capLv('L');
  if (L > cap0) m += G.mul.beyond * (Math.min(L, capL) - Math.max(cap0, Math.min(L, cap0)));
  if (L > capL) m += G.mul.limited * (L - Math.max(capL, cap0));
  return m + G.mul.promo * promos;
}
/** Lv1 のときの能力値（いまの能力値 − Lv で上がったぶん） */
export function baseStats(st: Pick<Staff, 'stats' | 'lvGain'>): Stats {
  const g = st.lvGain;
  return g ? { hp: st.stats.hp, phy: st.stats.phy - (g.phy ?? 0), int: st.stats.int - (g.int ?? 0), agi: st.stats.agi - (g.agi ?? 0) } : { ...st.stats };
}
/** 昇格の回数（もとのレアリティから何段上がったか） */
export const promosOf = (st: Pick<Staff, 'rarity' | 'baseRarity'>) => Math.max(0, rarIdx(st.rarity ?? 'C') - rarIdx(st.baseRarity ?? st.rarity ?? 'C'));
/** Lv・昇格から能力値をそろえ直す（Lv で上がったぶんを計算し直す）。上がった数を返す */
export function syncGrowth(st: Staff): Partial<Record<Key3, number>> {
  const pre = baseStats(st);
  const old = st.lvGain ?? {};
  const m = levelMul(st.level ?? 1, st.baseRarity ?? 'C', promosOf(st)) - 1;
  const w = growthWeights(st.hero);
  const gain = Object.fromEntries(K3.map((k) => [k, Math.max(0, Math.round(pre[k] * m * w[k]))])) as Record<Key3, number>;
  const diff: Partial<Record<Key3, number>> = {};
  for (const k of K3) if (gain[k] !== (old[k] ?? 0)) diff[k] = gain[k] - (old[k] ?? 0);
  st.stats = { hp: st.stats.hp, phy: pre.phy + gain.phy, int: pre.int + gain.int, agi: pre.agi + gain.agi };
  st.lvGain = K3.some((k) => gain[k] > 0) ? gain : undefined;
  return diff;
}

// ---------------------------------------------------------------- パッシブスキル

/** 文字列の小さなハッシュ（ヒーローごとに毎回同じ並び） */
const hash = (s: string) => {
  let x = 2166136261;
  for (let k = 0; k < s.length; k++) x = Math.imul(x ^ s.charCodeAt(k), 16777619) >>> 0;
  return x;
};
/** いちばん向いている仕事 → パッシブ */
const TASK_PASSIVE: Partial<Record<Task, PassiveKind>> = { craft: 'craft', transport: 'haul', buy: 'haul', shop: 'sell', explore: 'scout', intel: 'scout', dig: 'dig' };
const order = new Map<number, PassiveKind[]>();
/**
 * ヒーローのパッシブの並び（Lv の節目ごとに 1 つずつ開く。6 つ）：
 * 1 つ目は MCH の固有のパッシブ（名前）で、いちばん向いている仕事に効く。2 つ目は陣営（玄武＝R&D・朱雀＝マーケ・青龍＝製造・白虎＝運搬・黄竜＝経営企画）。
 * 残りはヒーローの id とパッシブの名前から決まる順（毎回同じ）
 */
export function passiveOrder(id: number): PassiveKind[] {
  const hit = order.get(id);
  if (hit) return hit;
  const h = row(id);
  const st = h?.stats ?? { hp: 150, phy: 50, int: 50, agi: 50 };
  const tasks = Object.keys(TASK_PASSIVE) as Task[];
  const best = tasks.reduce((a, k) => (aptitude(st, k) > aptitude(st, a) ? k : a), tasks[0]);
  const out: PassiveKind[] = [TASK_PASSIVE[best]!];
  const f = FACTION_PASSIVE[h?.faction ?? ''];
  if (f && !out.includes(f)) out.push(f);
  const rest = (Object.keys(PASSIVES) as PassiveKind[]).filter((k) => !out.includes(k)).sort((a, b) => hash(`${id}:${h?.passive ?? ''}:${a}`) - hash(`${id}:${h?.passive ?? ''}:${b}`));
  out.push(...rest);
  const six = out.slice(0, G.passiveAt.length);
  order.set(id, six);
  return six;
}
/** パッシブの名前：1 つ目は MCH の固有のパッシブの名前、ほかは種類の名前 */
export function passiveName(id: number, slot: number, kind: PassiveKind, en: boolean): string {
  const h = row(id);
  if (slot === 0 && h?.passive) return en ? h.passiveEn || h.passive : h.passive;
  return PASSIVES[kind].name;
}
/** 段 tier の効き目（割合） */
export const passiveValue = (kind: PassiveKind, tier: number) => PASSIVES[kind].v * (1 + G.passiveStep * Math.max(0, tier - 1));
/** そのヒーローの、種類 kind のパッシブの効き目の合計（割合） */
export function passiveSum(st: Pick<Staff, 'passives'>, kind: PassiveKind): number {
  let v = 0;
  for (const p of st.passives ?? []) if (p.k === kind) v += passiveValue(p.k, p.tier);
  return v;
}
/** その仕事の速さに効くパッシブの倍率 */
export function passiveMul(st: Pick<Staff, 'passives'>, task: Task): number {
  let v = 0;
  for (const p of st.passives ?? []) if (PASSIVES[p.k].tasks?.includes(task)) v += passiveValue(p.k, p.tier);
  return 1 + v;
}
/** Lv の節目に届いたパッシブを開く（開いた数）。段はいまの昇格の回数 + 1 */
export function unlockPassives(st: Staff): PassiveKind[] {
  const seq = passiveOrder(st.hero);
  const have = (st.passives ??= []);
  const out: PassiveKind[] = [];
  G.passiveAt.forEach((at, k) => {
    if ((st.level ?? 1) >= at && have.length === k) {
      have.push({ k: seq[k], tier: 1 + promosOf(st) });
      out.push(seq[k]);
    }
  });
  return out;
}
/** 次に開くパッシブ（節目の Lv と種類）。全部開いていれば null */
export function nextPassive(st: Staff): { at: number; k: PassiveKind; slot: number } | null {
  const n = st.passives?.length ?? 0;
  if (n >= G.passiveAt.length) return null;
  return { at: G.passiveAt[n], k: passiveOrder(st.hero)[n], slot: n };
}

// ---------------------------------------------------------------- 経験値とレベルアップ・昇格

/** ヒーローの育成の欄をそろえる（新しく雇ったとき・古いセーブ） */
export function initGrowth(st: Staff, level = 1) {
  st.baseRarity ??= heroRarityOf(st.hero);
  st.rarity ??= st.baseRarity;
  st.level ??= Math.min(level, capLv(st.rarity));
  st.xp ??= 0;
  st.passives ??= [];
  unlockPassives(st);
  syncGrowth(st);
}
export const capOf = (st: Pick<Staff, 'rarity'>) => capLv(st.rarity ?? 'C');
/** 上限 Lv に届いている */
export const atCap = (st: Staff) => (st.level ?? 1) >= capOf(st);

export interface LevelUp {
  hero: number;
  from: number;
  to: number;
  /** 上がった能力値 */
  gain: Partial<Record<Key3, number>>;
  /** 開いたパッシブ */
  passives: PassiveKind[];
  /** 上限 Lv に届いた（昇格できる） */
  cap?: boolean;
}
/**
 * 経験値を入れる（上限 Lv に届いていたら入らない＝持ち越さない）。Lv が上がったら能力値・パッシブをそろえる
 */
export function addXp(st: Staff, amount: number): LevelUp | null {
  if (!(amount > 0)) return null;
  const cap = capOf(st);
  const from = st.level ?? 1;
  if (from >= cap) return null;
  st.xp = (st.xp ?? 0) + amount;
  let L = from;
  while (L < cap && st.xp >= xpNeed(L)) {
    st.xp -= xpNeed(L);
    L++;
  }
  if (L >= cap) st.xp = 0;
  if (L === from) return null;
  st.level = L;
  const gain = syncGrowth(st);
  const passives = unlockPassives(st);
  return { hero: st.hero, from, to: L, gain, passives, ...(L >= cap ? { cap: true } : {}) };
}

export type PromoErr = 'cap' | 'top' | 'born' | 'item';
/** 昇格に使うアイテム（いまのレアリティの 1 つ上）。上が無ければ null */
export const promoItemOf = (st: Pick<Staff, 'rarity'>): PromoItem | null => nextRarity(st.rarity ?? 'C') as PromoItem | null;
/**
 * 昇格できるか：上限 Lv に届いている・上がある・Limited Legendary はもとから Legendary だけ・アイテムがある
 */
export function promoLock(st: Staff, items: Partial<Record<PromoItem, number>> | undefined): PromoErr | null {
  const next = nextRarity(st.rarity ?? 'C');
  if (!next) return 'top';
  if (next === 'LL' && st.baseRarity !== 'L') return 'born';
  if (!atCap(st)) return 'cap';
  if (!((items?.[next as PromoItem] ?? 0) > 0)) return 'item';
  return null;
}
/** 昇格する（アイテムを 1 つ使う）。レアリティが 1 段上がり、開いたパッシブの段が 1 つ上がり、能力値にその場の上乗せ */
export function promoteStaff(st: Staff, items: Partial<Record<PromoItem, number>>): { from: HeroRarity; to: HeroRarity; gain: Partial<Record<Key3, number>> } | PromoErr {
  const e = promoLock(st, items);
  if (e) return e;
  const from = st.rarity ?? 'C';
  const to = nextRarity(from)!;
  items[to as PromoItem] = (items[to as PromoItem] ?? 0) - 1;
  st.rarity = to;
  for (const p of st.passives ?? []) p.tier++;
  const gain = syncGrowth(st);
  return { from, to, gain };
}
