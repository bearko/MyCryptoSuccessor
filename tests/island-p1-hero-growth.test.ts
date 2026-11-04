/**
 * 段 E1：ヒーローの育成（docs/ISLAND_PHASE1.md「ヒーローの育成」・ロードマップ 4-12）。
 * Lv1 の能力値はいまと同じ・レアリティごとの上限 Lv・経験値で Lv が上がる・昇格の条件（上限 Lv とアイテム）・
 * Limited Legendary はもとが Legendary だけ・Novice が Legendary まで行ける・パッシブの節目・災害でアイテムとヒーローの Lv が残る・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { HERO_GROWTH, PASSIVES, START_STAFF, aptitude, capLv, type PromoItem } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import {
  addXp,
  baseStats,
  growthWeights,
  heroRarityOf,
  initGrowth,
  levelMul,
  passiveMul,
  passiveOrder,
  passiveSum,
  promoLock,
  promoteStaff,
  xpNeed,
  xpTotal,
} from '../src/island/p1/hero';
import { allowedDirs, build, claim, deserializeP1, gainItem, heroStats, newP1, openGate, promote, serializeP1, speed, step, type P1State, type PBuilding, type Staff } from '../src/island/p1/model';

const NOVICE = 10001;
const COMMON = 1001;
const UNCOMMON = 2001;
const LEGEND = 5001;

function staff(hero: number): Staff {
  const stats = heroStats(hero);
  const st: Staff = { hero, stats, stamina: stats.hp, task: null, target: null, resting: false, wage: 0, explore: 0 };
  initGrowth(st);
  return st;
}
const lvTo = (st: Staff, L: number) => {
  while ((st.level ?? 1) < L && addXp(st, xpNeed(st.level ?? 1)));
};
function lot(s: P1State, id: string, skip = 0): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && n++ >= skip) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
function put(s: P1State, id: string, skip = 0): PBuilding {
  const b = build(s, id, ...lot(s, id, skip));
  if (typeof b === 'string') throw new Error(b);
  b.left = 1;
  step(s);
  return b;
}

describe('1. Lv1 の能力値はいまのゲームと同じ', () => {
  it('はじめの 3 人：Lv1・経験値 0・Novice・能力値は heroStats のまま（上乗せなし）', () => {
    const s = newP1(3);
    for (const st of s.staff) {
      expect(st.level).toBe(1);
      expect(st.xp).toBe(0);
      expect(st.rarity).toBe('N');
      expect(st.baseRarity).toBe('N');
      expect(st.passives).toEqual([]);
      expect(st.lvGain).toBeUndefined();
      expect(st.stats).toEqual(heroStats(st.hero));
    }
    expect(s.staff.map((x) => x.hero)).toEqual(START_STAFF);
  });
  it('倍率は Lv1 で 1、もとのレアリティの上限で ×1.35、Limited Legendary の Lv120 で ×1.8 前後（緩やか）', () => {
    expect(levelMul(1, 'C', 0)).toBe(1);
    expect(levelMul(60, 'C', 0)).toBeCloseTo(1 + HERO_GROWTH.mul.atCap, 5);
    expect(levelMul(40, 'N', 0)).toBeCloseTo(1 + HERO_GROWTH.mul.atCap, 5);
    expect(levelMul(100, 'L', 0)).toBeCloseTo(1 + HERO_GROWTH.mul.atCap, 5);
    const ll = levelMul(120, 'L', 1);
    expect(ll).toBeGreaterThan(1.7);
    expect(ll).toBeLessThan(1.9);
    // Novice が Legendary の Lv100 まで育っても、生まれつきの Legendary の Lv120 を超えない
    expect(levelMul(100, 'N', 5)).toBeLessThan(ll);
    // 1 Lv ごとの上がり方は小さい（Common の 1 Lv で 1% 未満）
    expect(levelMul(2, 'C', 0) - 1).toBeLessThan(0.01);
  });
  it('伸びの個性：MCH の Lv1 → 最大 Lv の伸び方で、能力値ごとに重みが違う（3 つの平均は 1 前後）', () => {
    const w = growthWeights(NOVICE);
    expect(w.phy).toBeGreaterThan(w.int);
    expect((w.phy + w.int + w.agi) / 3).toBeCloseTo(1, 1);
  });
});

describe('2. レアリティと上限 Lv', () => {
  it('Novice 40・Common 60・Uncommon 70・Rare 80・Epic 90・Legendary 100・Limited Legendary 120', () => {
    expect([capLv('N'), capLv('C'), capLv('U'), capLv('R'), capLv('E'), capLv('L'), capLv('LL')]).toEqual([40, 60, 70, 80, 90, 100, 120]);
    expect(heroRarityOf(NOVICE)).toBe('N');
    expect(heroRarityOf(COMMON)).toBe('C');
    expect(heroRarityOf(UNCOMMON)).toBe('U');
    expect(heroRarityOf(LEGEND)).toBe('L');
  });
});

describe('3. 経験値とレベル', () => {
  it('経験値で Lv が上がり、能力値が上がる（Lv1 の値は stats − lvGain で残る）。上限 Lv で止まり、経験値は持ち越さない', () => {
    const st = staff(COMMON);
    const lv1 = { ...st.stats };
    const up = addXp(st, xpTotal(12))!;
    expect(up.from).toBe(1);
    expect(st.level).toBe(12);
    expect(st.stats.phy + st.stats.int + st.stats.agi).toBeGreaterThan(lv1.phy + lv1.int + lv1.agi);
    expect(baseStats(st)).toEqual(lv1);
    // 上限 Lv（Common 60）で止まる
    addXp(st, 1e9);
    expect(st.level).toBe(60);
    expect(st.xp).toBe(0);
    expect(addXp(st, 1e6)).toBeNull();
    expect(st.level).toBe(60);
  });
  it('チュートリアル（タオックスの 1 か月目）は経験値が入らない。月の締めのあとは働いた日に入る', () => {
    const s = newP1(5);
    s.tut = 99;
    s.money = 1e6;
    put(s, 'workshop');
    put(s, 'general_store', 3);
    const st = s.staff[0];
    // 他店でバイト（毎日働く）
    st.task = 'side';
    st.target = s.rivals[0].id;
    for (let d = 0; d < 20; d++) step(s);
    expect(st.xp).toBe(0);
    expect(st.level).toBe(1);
    // 最初の月の締めのあと（報告がある）
    s.reports.push({ ...(s.reports[0] ?? {}), month: 1 } as never);
    const x0 = st.xp ?? 0;
    st.resting = false;
    st.stamina = st.stats.hp;
    let got = false;
    for (let d = 0; d < 5; d++) {
      step(s);
      if ((st.xp ?? 0) > x0 || (st.level ?? 1) > 1) got = true;
    }
    expect(got).toBe(true);
  });
  it('曲線：上の Lv ほど 1 Lv に要る経験値が多い', () => {
    expect(xpNeed(30)).toBeGreaterThan(xpNeed(10));
    expect(xpTotal(1)).toBe(0);
  });
});

describe('4. 昇格（強化アイテム）', () => {
  it('上限 Lv に届いていないと昇格できない・アイテムが無いと昇格できない・あれば 1 段上がってアイテムを 1 つ使う', () => {
    const st = staff(NOVICE);
    const items: Partial<Record<PromoItem, number>> = { C: 1 };
    expect(promoLock(st, items)).toBe('cap');
    lvTo(st, 40);
    expect(st.level).toBe(40);
    expect(promoLock(st, {})).toBe('item');
    const before = st.stats.phy + st.stats.int + st.stats.agi;
    const r = promoteStaff(st, items);
    expect(r).toMatchObject({ from: 'N', to: 'C' });
    expect(items.C).toBe(0);
    expect(st.rarity).toBe('C');
    expect(st.baseRarity).toBe('N');
    // その場の上乗せ（+5% ぶん）
    expect(st.stats.phy + st.stats.int + st.stats.agi).toBeGreaterThan(before);
    // 上限 Lv が上がって、続けて育てられる
    expect(addXp(st, xpNeed(40))?.to).toBe(41);
  });
  it('Novice でも Legendary まで行ける。Limited Legendary はもとから Legendary のヒーローだけ', () => {
    const st = staff(NOVICE);
    const items: Partial<Record<PromoItem, number>> = { C: 1, U: 1, R: 1, E: 1, L: 1, LL: 1 };
    for (const to of ['C', 'U', 'R', 'E', 'L'] as const) {
      lvTo(st, capLv(st.rarity!));
      const r = promoteStaff(st, items);
      expect(r).toMatchObject({ to });
    }
    expect(st.rarity).toBe('L');
    lvTo(st, 100);
    expect(promoLock(st, items)).toBe('born');
    // 生まれつきの Legendary
    const lg = staff(LEGEND);
    lvTo(lg, 100);
    expect(promoteStaff(lg, items)).toMatchObject({ from: 'L', to: 'LL' });
    lvTo(lg, 120);
    expect(lg.level).toBe(120);
    expect(promoLock(lg, items)).toBe('top');
  });
  it('会社の強化アイテム：依頼の報酬でもらえる・promote で使う', () => {
    const s = newP1(2);
    // チュートリアル（タオックスの 1 か月目）のあいだはもらえない
    s.missions.first_sale = 'done';
    expect(claim(s, 'first_sale')).toBeNull();
    expect(s.heroItems?.C ?? 0).toBe(0);
    s.reports.push({ month: 1 } as never);
    s.missions.first_sale = 'done';
    expect(claim(s, 'first_sale')).toBeNull();
    expect(s.heroItems?.C).toBe(1);
    const st = s.staff[0];
    lvTo(st, 40);
    expect(typeof promote(s, st.hero)).toBe('object');
    expect(s.heroItems?.C).toBe(0);
  });
});

describe('5. パッシブスキル', () => {
  it('Lv の節目（10・30・50・70・90・110）で 1 つずつ開く。並びはヒーローごとに毎回同じ', () => {
    expect(HERO_GROWTH.passiveAt).toEqual([10, 30, 50, 70, 90, 110]);
    const st = staff(COMMON);
    lvTo(st, 9);
    expect(st.passives).toHaveLength(0);
    lvTo(st, 10);
    expect(st.passives).toHaveLength(1);
    lvTo(st, 30);
    expect(st.passives).toHaveLength(2);
    expect(st.passives!.map((p) => p.k)).toEqual(passiveOrder(COMMON).slice(0, 2));
    expect(passiveOrder(COMMON)).toEqual(passiveOrder(COMMON));
    expect(new Set(passiveOrder(COMMON)).size).toBe(6);
    // 1 つ目はいちばん向いている仕事に効く
    const first = passiveOrder(NOVICE)[0];
    expect(['craft', 'haul', 'sell', 'scout', 'dig']).toContain(first);
  });
  it('効き目は小さめ（+4〜6%）で、昇格で段が上がると強くなる。仕事の速さに効く', () => {
    for (const p of Object.values(PASSIVES)) {
      expect(p.v).toBeGreaterThanOrEqual(0.03);
      expect(p.v).toBeLessThanOrEqual(0.08);
    }
    const st = staff(NOVICE);
    lvTo(st, 10);
    const k = st.passives![0].k;
    const v1 = passiveSum(st, k);
    expect(v1).toBeCloseTo(PASSIVES[k].v, 5);
    promoteStaff(st, {}); // アイテムが無い・上限でない：何も変わらない
    expect(passiveSum(st, k)).toBeCloseTo(v1, 5);
    lvTo(st, 40);
    promoteStaff(st, { C: 1 });
    expect(st.passives![0].tier).toBe(2);
    expect(passiveSum(st, k)).toBeGreaterThan(v1);
    // 速さ：運搬のパッシブなら運搬の速さに効く
    const task = PASSIVES[k].tasks?.[0];
    if (task) expect(passiveMul(st, task)).toBeGreaterThan(1);
    if (task) expect(speed(st, task)).toBeGreaterThan(speed({ ...st, passives: [] }, task));
  });
});

describe('6. 災害でもアイテムとヒーローの Lv が残る', () => {
  it('Uncommon への初進出（ランクアップの災害）：所持金は徴収されるが、強化アイテム・Lv・経験値・レアリティ・パッシブは残る', () => {
    const s = newP1(9);
    s.tut = 99;
    s.money = 1e7;
    s.flags.digMeet = 'done';
    s.flags.hq = true;
    openGate(s);
    put(s, 'workshop');
    put(s, 'general_store', 3);
    s.cleared = true;
    s.presented = ['c1', 'c2'];
    s.letters = ['U'];
    gainItem(s, 'C', 2);
    gainItem(s, 'U', 1);
    const st = s.staff[1];
    lvTo(st, 33);
    const keep = JSON.stringify({ lv: st.level, xp: st.xp, r: st.rarity, p: st.passives, stats: st.stats });
    expect(moveTo(s, 'u1', 10001)).toBeNull();
    expect(s.resets).toHaveLength(1);
    expect(s.heroItems).toMatchObject({ C: 2, U: 1 });
    const after = s.staff.find((x) => x.hero === st.hero)!;
    expect(JSON.stringify({ lv: after.level, xp: after.xp, r: after.rarity, p: after.passives, stats: after.stats })).toBe(keep);
  });
});

describe('7. セーブ（版 12）', () => {
  it('古いセーブ（版 11）：雇用中のヒーローは会社の月数から無理のない Lv（上限 − 1 まで）・経験値 0・強化アイテム 0', () => {
    const s = newP1(4);
    s.books!.months = Array.from({ length: 20 }, (_, m) => ({ m, l: s.books!.cur, bs: { cash: 0, stock: 0, buildings: 0, invest: 0 } }));
    const old = JSON.parse(serializeP1(s));
    old.v = 11;
    for (const x of old.staff) {
      delete x.level;
      delete x.xp;
      delete x.rarity;
      delete x.baseRarity;
      delete x.passives;
      delete x.lvGain;
    }
    delete old.heroItems;
    const b = deserializeP1(JSON.stringify(old))!;
    expect(b.v).toBe(26);
    expect(b.heroItems).toEqual({});
    for (const x of b.staff) {
      expect(x.level).toBeGreaterThan(1);
      expect(x.level).toBeLessThan(capLv(x.rarity!));
      expect(x.xp).toBe(0);
      expect(x.rarity).toBe('N');
      // Lv で上がったぶんが足されている（Lv1 の値はそのまま）
      expect(baseStats(x)).toEqual(heroStats(x.hero));
    }
    // 20 か月なら Lv は 20 台まで（上げすぎない）
    expect(Math.max(...b.staff.map((x) => x.level!))).toBeLessThan(30);
  });
  it('版 12 のセーブはそのまま読み書きできる', () => {
    const s = newP1(6);
    gainItem(s, 'R', 3);
    lvTo(s.staff[2], 15);
    const b = deserializeP1(serializeP1(s))!;
    expect(b.heroItems?.R).toBe(3);
    expect(b.staff[2].level).toBe(15);
    expect(b.staff[2].stats).toEqual(s.staff[2].stats);
    expect(aptitude(b.staff[2].stats, 'craft')).toBe(aptitude(s.staff[2].stats, 'craft'));
  });
});
