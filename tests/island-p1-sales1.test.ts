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
  deserializeP1,
  newP1,
  poolCap,
  poolUsed,
  priceOf,
  sellNow,
  serializeP1,
  setShelf,
  startCraft,
  step,
  unitCost,
  type P1State,
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
/** 段 SALES1 の前（main 0de43d3）の、1 店・1 棚（センス）の月の売上（G）と個数。シード 1・2・3 */
const BEFORE = { 1: { yen: 5835, units: 6.484 }, 2: { yen: 4935, units: 5.484 }, 3: { yen: 5062, units: 5.624 } } as const;

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
