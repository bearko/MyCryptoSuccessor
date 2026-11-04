// 段 UI8b（docs/ISLAND_UX_CHARTER.md「2-8」）：推移の線（ブランド力・商圏の取り分・SCM の流れ・展示館・セクター長）と税の見込みのウォーターフォール。
// 記録（月の締めのブランド力）が残ること、記録の無い以前の月はさかのぼって数えること
import { describe, expect, it } from 'vitest';
import { brandHist, flowHist, museumHist, sectorHist, shareHist, taxFall } from '../src/island/p1/dash';
import { deserializeP1, myShops, serializeP1, step, type P1State, type Report } from '../src/island/p1/model';
import { EVENT_OFF } from '../src/island/p1/events';
import { runOnce } from '../scripts/island/sim';

const rep = (o: Partial<Report>): Report => ({ month: 1, revenue: 0, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 1, news: [], ...o });

let save: string | null = null;
function town(): P1State {
  if (!save)
    runOnce('normal', 2, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 3 && myShops(s).length) save = serializeP1(s);
      },
    });
  return deserializeP1(save!)!;
}

describe('ブランド力の推移', () => {
  it('月の締めでブランド力が報告に残り（brandEnd）、セーブを通っても残る', () => {
    EVENT_OFF.on = true;
    try {
      const s = town();
      const n0 = s.reports.length;
      while (s.reports.length === n0) step(s);
      const r = s.reports.at(-1)!;
      expect(r.brandEnd).toBe(s.brand ?? 0);
      const back = deserializeP1(serializeP1(s))!;
      const bh = brandHist(back.reports, back.brandStart ?? back.brand ?? 0);
      expect(bh.at(-1)).toMatchObject({ v: s.brand ?? 0, est: false });
    } finally {
      EVENT_OFF.on = false;
    }
  });
  it('記録の無い以前の月は、すぐ後の月から月の増えを引いてさかのぼる（est）', () => {
    const rs = [rep({ month: 1, brand: 5 }), rep({ month: 2, brand: 10 }), rep({ month: 3, brand: 3, brandEnd: 40 })];
    expect(brandHist(rs, 40)).toEqual([
      { month: 1, v: 27, est: true },
      { month: 2, v: 37, est: true },
      { month: 3, v: 40, est: false },
    ]);
  });
});

describe('ほかの推移と税の見込み', () => {
  it('商圏の取り分は %・記録のある月だけ', () => {
    expect(shareHist([rep({ trade: { share: 0.123, prev: null, quit: [], refill: [], gone: [] } }), rep({ month: 2 })])).toEqual([{ month: 1, v: 12.3 }]);
  });
  it('SCM の流れ・展示館・セクター長は記録のまま', () => {
    expect(flowHist([rep({ flow: { bought: 1, made: 2, hauled: 3, sold: 4 } })])).toEqual([{ month: 1, bought: 1, made: 2, hauled: 3, sold: 4 }]);
    expect(museumHist([rep({ museum: { visitors: 10, income: 99.6, value: 3 } })])).toEqual([{ month: 1, visitors: 10, income: 100 }]);
    const log = Array.from({ length: 15 }, (_, k) => ({ m: k + 1, rev: k, profit: k, invest: 0, toHQ: 0 }));
    expect(sectorHist({ log }).map((x) => x.m)).toEqual(log.slice(-12).map((x) => x.m));
  });
  it('税の見込み：課税される額＝利益 − 差し引き、残る＝課税される額 − 税', () => {
    const xs = taxFall({ base: 1000, ded: 200, tax: 160 });
    expect(xs.find((x) => x.key === 'taxable')!.to).toBe(800);
    expect(xs.at(-1)!.to).toBe(640);
  });
});
