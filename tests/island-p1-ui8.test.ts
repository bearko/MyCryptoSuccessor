// 段 UI8（docs/ISLAND_UX_CHARTER.md「2-8. 段 UI8 の棚卸し」）：数字の報告をグラフに。グラフに渡す数（dash.ts）が報告・帳簿の数とそろうこと、
// 資金のろうそく足の記録（月のいちばん高い・安い）が月の締めで報告に残り、古い報告（記録なし）でも描けること
import { describe, expect, it } from 'vitest';
import { budgetHeat, bsParts, costParts, heatStep, monLab, monthFall, moneyCandles, moraleHist, plFall, quarterTrend, rankHist, rankRows, salesParts, satHist, shopBubbles, steps } from '../src/island/p1/dash';
import { deserializeP1, myShops, serializeP1, step, type P1State, type Report } from '../src/island/p1/model';
import { emptyLedger, pl, type Books } from '../src/island/p1/company';
import { EVENT_OFF } from '../src/island/p1/events';
import { runOnce } from '../scripts/island/sim';

const rep = (o: Partial<Report>): Report => ({ month: 1, revenue: 0, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 1, news: [], ...o });

let save: string | null = null;
/** 最初の町（通常の自動プレイ）の 4 か月目のセーブ */
function town(): P1State {
  if (!save)
    runOnce('normal', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 4 && myShops(s).length) save = serializeP1(s);
      },
    });
  return deserializeP1(save!)!;
}

describe('ウォーターフォール（差し引き）', () => {
  it('月次報告：売上 → 費用 → 利益。最後の利益は報告の利益と同じ', () => {
    const r = rep({ revenue: 10000, costs: { materials: 3000, wages: 2000, part: 500, upkeep: 800, build: 4000, ads: 0 }, profit: -300 });
    const xs = monthFall(r);
    expect(xs[0]).toMatchObject({ kind: 'start', to: 10000 });
    expect(xs.at(-1)).toMatchObject({ kind: 'total', to: -300 });
    // 費用は大きい順・0 の科目は出さない
    expect(xs.slice(1, -1).map((x) => x.key)).toEqual(['build', 'materials', 'wages', 'upkeep', 'part']);
    expect(xs.slice(1, -1).every((x) => x.kind === 'down')).toBe(true);
  });
  it('決算書の P/L：当期の利益は pl() と同じ・途中の合計は売上総利益と営業利益', () => {
    const l = { ...emptyLedger(), sales: 50000, mats: 12000, wages: 9000, part: 1000, upkeep: 3000, ads: 2000, build: 8000, side: 500, tax: 1500 };
    const xs = plFall(l);
    const p = pl(l);
    expect(xs.find((x) => x.key === 'gross')!.to).toBe(p.gross);
    expect(xs.find((x) => x.key === 'op')!.to).toBe(p.op);
    expect(xs.at(-1)!.to).toBe(p.net);
  });
  it('steps：増減の棒は前の合計から始まる', () => {
    const xs = steps([
      { key: 'a', name: 'a', v: 100 },
      { key: 'b', name: 'b', v: -30 },
      { key: 'c', name: 'c', v: 10 },
      { key: 't', name: 't', v: 0, total: true },
    ]);
    expect(xs.map((x) => [x.from, x.to])).toEqual([
      [0, 100],
      [100, 70],
      [70, 80],
      [0, 80],
    ]);
  });
});

describe('割合（ドーナツ・100% の積み上げ）', () => {
  it('費用の内訳は合計が費用の合計・科目ごとに色と模様が決まっている（月が変わっても同じ見た目）', () => {
    const a = costParts({ materials: 100, wages: 300, part: 0, upkeep: 50, build: 0, ads: 10 });
    expect(a.reduce((s, x) => s + x.v, 0)).toBe(460);
    const b = costParts({ materials: 900, wages: 1, part: 0, upkeep: 0, build: 0, ads: 0 });
    expect(a.find((x) => x.key === 'materials')!.col).toBe(b.find((x) => x.key === 'materials')!.col);
    expect(a.find((x) => x.key === 'materials')!.pat).toBe(b.find((x) => x.key === 'materials')!.pat);
  });
  it('商品ごとの売上：大きい順に 4 つ・残りは「その他」にまとめ、合計は売上と同じ', () => {
    const by = { a: 50, b: 40, c: 30, d: 20, e: 10, f: 5 };
    const xs = salesParts(by);
    expect(xs.length).toBe(5);
    expect(xs.at(-1)!.key).toBe('other');
    expect(xs.reduce((s, x) => s + x.v, 0)).toBe(155);
  });
  it('B/S の資産：0 の項目は出さない', () => {
    expect(bsParts({ cash: 100, stock: 0, buildings: 50, invest: 0 }).map((x) => x.key)).toEqual(['cash', 'buildings']);
  });
});

describe('資金のろうそく足', () => {
  it('月の締めで、はじめ・終わり・その月のいちばん高い・安いが報告に残る（高い ≥ はじめ・終わり ≥ 安い）。セーブを通っても残る', () => {
    EVENT_OFF.on = true;
    try {
      const s = deserializeP1(serializeP1(town()))!;
      const n0 = s.reports.length;
      let hi = -Infinity;
      let lo = Infinity;
      const start = Math.round(s.money);
      while (s.reports.length === n0) {
        hi = Math.max(hi, Math.round(s.money));
        lo = Math.min(lo, Math.round(s.money));
        step(s);
      }
      const m = s.reports[s.reports.length - 1].money!;
      expect(m.hi).toBeDefined();
      expect(m.lo).toBeDefined();
      expect(m.hi!).toBeGreaterThanOrEqual(Math.max(m.start, m.end));
      expect(m.lo!).toBeLessThanOrEqual(Math.min(m.start, m.end));
      // 日ごとの終わりの値で見ている（ずれは月の締めの日の出入りだけ）
      expect(m.hi!).toBeGreaterThanOrEqual(Math.min(hi, start));
      const back = deserializeP1(serializeP1(s))!;
      expect(back.reports.at(-1)!.money).toEqual(m);
      const cs = moneyCandles(back.reports);
      expect(cs.at(-1)).toMatchObject({ o: m.start, c: m.end, h: m.hi, l: m.lo, est: false });
    } finally {
      EVENT_OFF.on = false;
    }
  });
  it('古い報告（高い・安いの記録なし）は、はじめと終わりの範囲だけ（est）', () => {
    const cs = moneyCandles([rep({ money: { start: 500, end: 300 } }), rep({ month: 2 })]);
    expect(cs).toEqual([{ month: 1, o: 500, c: 300, h: 500, l: 300, est: true }]);
  });
});

describe('順位・推移・ヒートマップ・バブル', () => {
  it('順位の横棒は順位の順のまま・自社の印。順位の推移は報告の数だけ', () => {
    const area = [
      { name: 'A', sales: 300, me: false },
      { name: 'B', sales: 200, me: true },
    ];
    expect(rankRows(area).map((x) => x.me)).toEqual([false, true]);
    expect(rankHist([rep({ rank: 3, area: area as Report['area'] }), rep({ month: 2, rank: 2 })]).map((x) => x.rank)).toEqual([3, 2]);
  });
  it('士気・満足度の推移は記録のある月だけ', () => {
    const rs = [rep({ hr: { avg: 60, want: 0, wantNew: [], stay: [], quit: [], charisma: 0, ch: 0 } }), rep({ month: 2 }), rep({ month: 3, hr: { avg: 72, want: 0, wantNew: [], stay: [], quit: [], charisma: 0, ch: 0 } })];
    expect(moraleHist(rs).map((x) => x.v)).toEqual([60, 72]);
    expect(satHist(rs)).toEqual([]);
  });
  it('部門 × 月のヒートマップ：使った ÷ 予算（%）・記録の無い部門の月は null・濃さの段', () => {
    const rs = [
      rep({ month: 5, budget: { depts: [{ dept: 'hr', hero: 1, amt: 1000, used: 500, acts: 1, cost: 0, crew: 0 }] } }),
      rep({ month: 6, budget: { depts: [{ dept: 'hr', hero: 1, amt: 1000, used: 1200, acts: 2, cost: 0, crew: 0 }, { dept: 'marketing', hero: 2, amt: 2000, used: 0, acts: 0, cost: 0, crew: 0 }] } }),
    ];
    const hm = budgetHeat(rs);
    expect(hm.rows.map((r) => r.key)).toEqual(['hr', 'marketing']);
    expect(hm.cells[0].map((c) => c?.pct)).toEqual([50, 120]);
    expect(hm.cells[1][0]).toBeNull();
    expect([0, 10, 60, 100, 120].map(heatStep)).toEqual([0, 1, 2, 3, 4]);
  });
  it('お店のバブル：先月の結果があれば先月（利益率は素材代とアルバイト代を引いた割合）', () => {
    const shops = { 1: { last: { rev: 1000, cost: 250 }, rev: 10, cost: 0 }, 2: { last: null, rev: 0, cost: 0 } } as unknown as P1State['shops'];
    const bs = shopBubbles(
      [
        { uid: 1, name: 'x', homes: 12 },
        { uid: 2, name: 'y', homes: 3 },
      ],
      shops,
    );
    expect(bs).toEqual([{ key: '1', name: 'x', x: 1000, y: 75, r: 12, last: true }]);
  });
  it('四半期の推移：締めた四半期と途中の四半期・当期の利益は pl() と同じ', () => {
    const l = { ...emptyLedger(), sales: 100, mats: 30 };
    const b: Books = { cur: emptyLedger(), months: [1, 2, 3, 4].map((m) => ({ m, l, bs: { cash: 0, stock: 0, buildings: 0, invest: 0 } })) };
    const q = quarterTrend(b);
    expect(q.map((x) => [x.q, x.sales, x.net, x.done])).toEqual([
      [1, 300, 210, true],
      [2, 100, 70, false],
    ]);
  });
  it('横軸の名前：1 年目は月だけ・2 年目からの 1 月と最初の目盛りに年', () => {
    expect(monLab(3)).toMatch(/3/);
    expect(monLab(13)).toMatch(/2/);
    expect(monLab(14, true)).toMatch(/2.*2/);
  });
});
