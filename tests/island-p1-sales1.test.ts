/**
 * 段 SALES1：販売のテコ入れ（エクステの単価を下げ、1 日に売れる数を増やす・自社どうしの取り合いを減らす）。
 * docs/ISLAND_PHASE1.md「売れ方（単価・個数・取り合い）」・docs/ISLAND_BALANCE.md の v47。
 * 「前」の数字は main 0de43d3（段 SALES1 の前）で、同じ手順で測ったもの。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRODUCTS, SALES1, MATS, UNCOMMON, basePrice, sku, skuPrice, unitsX, type Mat, type Sku } from '../src/island/p1/data';
import {
  allowedDirs,
  assign,
  build,
  canPlaceAt,
  cannibalRate,
  deserializeP1,
  myShops,
  newP1,
  poolCap,
  poolUsed,
  priceOf,
  salesPotential,
  sellNow,
  serializeP1,
  setShelf,
  shopSplit,
  startCraft,
  step,
  unitCost,
  type P1State,
  type PBuilding,
  type ShopState,
} from '../src/island/p1/model';

const PROBE = !!process.env.SALES1_PROBE;

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ds = allowedDirs(s, id, i, j);
      if (ds.length && !canPlaceAt(s, id, i, j, ds[0])) return [i, j, ds[0]];
    }
  throw new Error('no lot');
}
/** 工房とよろず屋を建て、センスを 1 棚に並べて 29 日目まで回す（tests/island-p1-sell.test.ts と同じ手順） */
function running(seed = 1): { s: P1State; uid: number } {
  const s = newP1(seed);
  build(s, 'workshop', ...lot(s, 'workshop'));
  for (let k = 0; k < 4; k++) step(s);
  const shop = build(s, 'general_store', ...lot(s, 'general_store'));
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  startCraft(s, 0, 'Sensu:C');
  for (let k = 0; k < 20; k++) step(s);
  return { s, uid: shop.uid };
}
/** 地図に直接お店を足す（売り場は from と同じ体制・認知度） */
function addShop(s: P1State, i: number, j: number, from: number): PBuilding {
  const uid = s.nextUid++;
  const b: PBuilding = { uid, id: 'general_store', i, j, dir: 'rd', left: 0, owner: 'me' };
  const f = s.shops[from];
  s.buildings.push(b);
  s.shops[uid] = { ...f, uid, shelves: [...f.shelves], storage: {}, shelf: {}, carry: {} } as ShopState;
  return b;
}
const clone = (s: P1State) => JSON.parse(serializeP1(s)) as P1State;
/** 段 SALES1 の前（main 0de43d3）の、1 店・1 棚（センス）の月の売上（G）と個数。シード 1・2・3 */
const BEFORE = { 1: { yen: 5835, units: 6.484 }, 2: { yen: 4935, units: 5.484 }, 3: { yen: 5062, units: 5.624 } } as const;
/** 段 SALES1 の前の、2 軒（2 軒目は 1 軒目から 2 マス・4 マス）の取り合いの割合。どれも 0.35 より大きい */
const BEFORE_TWO = 0.35;

describe('段 SALES1：単価を下げ、数を増やす', () => {
  it('1 店・1 棚の月の売上（G）は前とだいたい同じ（±15%）・個数は SALES1.units 倍ほどに増える', () => {
    for (const seed of [1, 2, 3] as const) {
      const { s } = running(seed);
      const now = sellNow(s);
      expect(now.yen / BEFORE[seed].yen, `seed ${seed}`).toBeGreaterThan(0.85);
      expect(now.yen / BEFORE[seed].yen, `seed ${seed}`).toBeLessThan(1.15);
      expect(now.units / BEFORE[seed].units, `seed ${seed}`).toBeGreaterThan(SALES1.units * 0.85);
    }
  });

  it('値段 × 個数 ＝ 1（price × units）。値段は 1 G 単位で、前の値段 × price', () => {
    expect(SALES1.price * SALES1.units).toBeCloseTo(1, 9);
    for (const p of PRODUCTS) {
      expect(Number.isInteger(p.price), p.key).toBe(true);
      expect(p.price, p.key).toBe(Math.round(basePrice(p) * SALES1.price));
    }
  });

  it('粗利の率は前と同じ（素材の量は 1 ロットのまま・1 ロットの数が units 倍）', () => {
    const s = newP1(1);
    for (const p of PRODUCTS.filter((x) => !x.relic)) {
      for (const r of ['C', 'U'] as const) {
        const x = sku(p.key, r) as Sku;
        const mats = Object.entries(p.recipe[r]).reduce((a, [m, q]) => a + MATS[m as Mat].price * (q ?? 0), 0);
        const batch0 = r === 'U' ? Math.ceil(p.batch / SALES1.units / 2) : p.batch / SALES1.units;
        const price0 = basePrice(p) * (r === 'U' ? UNCOMMON.price : 1);
        const before = 1 - mats / batch0 / price0;
        const after = 1 - unitCost(s, x) / priceOf(s, x);
        expect(Math.abs(after - before), x).toBeLessThan(0.02);
        expect(skuPrice(x), x).toBeGreaterThan(0);
      }
    }
  });

  it('工房の物置・倉庫では、商品は SALES1.units 個で 1 枠（素材は 1 個で 1 枠）', () => {
    const s = newP1(1);
    s.mats = {};
    s.stock = {};
    const u0 = poolUsed(s);
    s.stock['Sensu:C'] = SALES1.units;
    expect(poolUsed(s)).toBe(u0 + 1);
    s.stock['Sensu:C'] = SALES1.units + 1;
    expect(poolUsed(s)).toBe(u0 + 2);
    expect(poolCap(s)).toBeGreaterThan(0);
  });
});

describe('段 SALES1：自社どうしの取り合いを減らす', () => {
  const twoShops = (seed: number, d: number) => {
    const { s, uid } = running(seed);
    const b = myShops(s)[0];
    addShop(s, Math.min(s.n - 1, b.i + d), b.j, uid);
    return s;
  };

  it('2 軒の取り合いの割合は前（0.35 より大きい）から 0.25 以下に', () => {
    for (const seed of [1, 2, 3])
      for (const d of [2, 4]) {
        const s = twoShops(seed, d);
        const r = cannibalRate(s);
        expect(r, `seed ${seed} d ${d}`).toBeLessThanOrEqual(0.25);
        expect(r, `seed ${seed} d ${d}`).toBeLessThan(BEFORE_TWO);
        expect(r, `seed ${seed} d ${d}`).toBeGreaterThan(0.05);
      }
  });

  it('お店ごとの内訳：売れる数 ＋ 自社に取られた数 ＝ 1 軒だけなら売れた数。1 軒なら取られた数は 0', () => {
    const { s, uid } = running(1);
    const one = shopSplit(s)[uid];
    expect(one.lost).toBe(0);
    expect(one.sold).toBeCloseTo(one.alone, 9);
    const t = twoShops(1, 3);
    for (const v of Object.values(shopSplit(t))) {
      expect(v.sold + v.lost).toBeCloseTo(v.alone, 9);
      expect(v.lost).toBeGreaterThan(0);
    }
  });

  it('お店を足すたびに売上が伸びる（3 軒目・4 軒目も伸びが 0 にならない）', () => {
    const { s, uid } = running(2);
    const b = myShops(s)[0];
    let prev = salesPotential(s);
    const spots: [number, number][] = [
      [b.i + 2, b.j],
      [b.i, b.j + 2],
      [b.i + 2, b.j + 2],
    ];
    for (const [i, j] of spots) {
      addShop(s, Math.min(s.n - 1, i), Math.min(s.n - 1, j), uid);
      const now = salesPotential(s);
      expect(now - prev).toBeGreaterThan(prev * 0.05);
      prev = now;
    }
  });

  it('自社のお店が 1 軒なら、足し合わせ・通りがかりは効かない（前の売れ方とまったく同じ）', () => {
    const { s } = running(3);
    const a = sellNow(s);
    const keep = { ...SALES1 };
    try {
      SALES1.overlap = 0;
      SALES1.walk = 0;
      const b = sellNow(s);
      expect(b.units).toBeCloseTo(a.units, 9);
      expect(b.yen).toBeCloseTo(a.yen, 9);
    } finally {
      Object.assign(SALES1, keep);
    }
  });

  it('ドミナント出店の効き目は残る：取り合いがさらに減り、売れる数が増える', () => {
    const s = twoShops(1, 2);
    const r0 = cannibalRate(s);
    const u0 = salesPotential(s);
    const d = clone(s);
    d.skills.push('sa_dominant');
    expect(cannibalRate(d)).toBeLessThan(r0 - 0.02);
    expect(salesPotential(d)).toBeGreaterThan(u0 * 1.02);
  });
});

describe('段 SALES1：古いセーブ', () => {
  it('段 SALES1 の前のセーブ（main 0de43d3 で書き出したもの）が読めて、そのまま回せる（版は前のまま）', () => {
    const json = readFileSync(new URL('./fixtures/save-before-sales1.json', import.meta.url), 'utf8');
    const v0 = (JSON.parse(json) as { v: number }).v;
    const s = deserializeP1(json)!;
    expect(s).toBeTruthy();
    expect(s.v).toBe(v0);
    const m0 = s.money;
    for (let k = 0; k < 40; k++) step(s);
    expect(Number.isInteger(poolUsed(s))).toBe(true);
    expect(s.money).not.toBe(m0);
    const sold = Object.values(s.shops).reduce((a, sh) => a + sh.rev, 0) + s.reports.reduce((a, r) => a + r.revenue, 0);
    expect(sold).toBeGreaterThan(0);
    expect(deserializeP1(serializeP1(s))).toBeTruthy();
    expect(unitsX(1)).toBe(SALES1.units);
  });
});

describe('段 SALES1：下調べ', () => {
  it.runIf(PROBE)(
    '下調べ：通常の自動プレイのランクごとの売れ方',
    async () => {
      const { salesProbe, probeTable } = await import('../scripts/island/salesprobe');
      const p = salesProbe((process.env.SALES1_POLICY as 'normal' | 'rta' | 'full') ?? 'normal', Number(process.env.SALES1_SEED ?? 1));
      console.log(probeTable(p));
      expect(p.tiers.length).toBeGreaterThan(0);
    },
    3_600_000,
  );
});
