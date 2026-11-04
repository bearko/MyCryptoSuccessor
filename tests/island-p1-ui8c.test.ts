// 段 UI8c（docs/ISLAND_UX_CHARTER.md「2-8」）：カリスマ度の積み上げのメーターと推移・セクタの比べの横棒・他社の売れ筋の横棒
import { describe, expect, it } from 'vitest';
import { charismaHist, charismaSegs, rivalBars, sectorBars } from '../src/island/p1/dash';
import type { Report } from '../src/island/p1/model';

const rep = (o: Partial<Report>): Report => ({ month: 1, revenue: 0, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 1, news: [], ...o });

describe('カリスマ度', () => {
  it('積み上げの切れは出どころの数のまま・0 は出さない・合計はカリスマ度（テストの分を除く）と同じ', () => {
    const xs = charismaSegs({ clear: 20, present: 0, brand: 7, panel: 5, extra: 0 });
    expect(xs.map((x) => [x.key, x.v])).toEqual([
      ['clear', 20],
      ['brand', 7],
      ['panel', 5],
    ]);
    // 出どころごとに模様が違う（色だけに頼らない）
    expect(new Set(xs.map((x) => x.pat)).size).toBe(3);
  });
  it('推移は人事の記録のある月だけ（Report.hr.ch）', () => {
    const hr = (ch: number) => ({ avg: 60, want: 0, wantNew: [], stay: [], quit: [], charisma: 0, ch });
    expect(charismaHist([rep({ hr: hr(10) }), rep({ month: 2 }), rep({ month: 3, hr: hr(25) })])).toEqual([
      { month: 1, v: 10 },
      { month: 3, v: 25 },
    ]);
  });
});

describe('セクタの比べ・他社の売れ筋', () => {
  it('いまの町は最後の報告、ほかの町はセクター長の記録の最後。大きい順・セクター長のいない町と記録の無い町に印', () => {
    const recs = {
      a: { manager: 7, log: [{ m: 1, rev: 100, profit: 0, invest: 0, toHQ: 0 }, { m: 2, rev: 300, profit: 0, invest: 0, toHQ: 0 }] },
      b: { manager: null, log: [] },
    };
    const xs = sectorBars({ id: 'c', rev: 200 }, recs, ['a', 'b', 'c'], (id) => id.toUpperCase());
    expect(xs.map((x) => [x.id, x.v, x.me, x.head, x.none])).toEqual([
      ['a', 300, false, true, false],
      ['c', 200, true, true, false],
      ['b', 0, false, false, true],
    ]);
  });
  it('他社の売れ筋に自社を並べる（同じ単位：先月の売上）', () => {
    const xs = rivalBars([{ name: 'X', key: 'k', sales: 50 }, { name: 'Y', key: null, sales: 500 }], 120, (k) => `p-${k}`);
    expect(xs.map((x) => [x.v, x.me, x.item])).toEqual([
      [500, false, '—'],
      [120, true, ''],
      [50, false, 'p-k'],
    ]);
  });
});
