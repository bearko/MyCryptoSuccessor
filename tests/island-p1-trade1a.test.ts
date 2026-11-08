// 段 TRADE1a：となり町の問屋から素材を取り寄せる（関税・境の拠点）。docs/ISLAND_PHASE1.md「となり町の取り寄せ」
import { describe, expect, it } from 'vitest';
import { SKILL, TRADE } from '../src/island/p1/data';
import { pl, emptyLedger } from '../src/island/p1/company';
import { costParts } from '../src/island/p1/dash';
import { allowedDirs, assign, build, poolCap, poolFree, deserializeP1, newP1, openGate, orderFrom, serializeP1, setShelf, startCraft, step, unitPrice, type P1State } from '../src/island/p1/model';
import { borderAt, borderDepot, cheapAt, crossRoute, dutyRate, dutyRateOf, headSuggest, importLead, importPrice, setSource, sourceCands, sourceOf, tradeNeighbors } from '../src/island/p1/tariff';

function lot(s: P1State, id: string, ok: (i: number, j: number) => boolean = () => true): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && ok(i, j)) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};
/** タオックス（c1）で工房を建てて関所を開けた町（となり町はユーホタウン c2・リデル・ヒルズ c3） */
function town(): P1State {
  const s = newP1(1);
  s.money = 1e6;
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  run(s, 6);
  expect(openGate(s)).toBe(true);
  s.money = 1e6;
  return s;
}
/** 工房・お店・職人・調達係がいて、ランタン（鉄 2・ガラス 3）を作っている町 */
function shop(): P1State {
  const s = town();
  const [x, y, e] = lot(s, 'general_store');
  const b = build(s, 'general_store', x, y, e);
  if (typeof b === 'string') throw new Error(b);
  run(s, 5);
  assign(s, 10003, 'craft', 0);
  // 調達係（荷運びは置かない：この町の調べものには要らない）
  assign(s, 10001, 'buy');
  assign(s, 10002, 'shop', b.uid);
  setShelf(s, b.uid, 0, 'Lantern:C');
  expect(startCraft(s, 0, 'Lantern:C')).toBeNull();
  s.money = 1e6;
  return s;
}

describe('となり町', () => {
  it('c1 の隣は c2（東）と c3（南）。関所を開けるまでは取り寄せられない', () => {
    const s = newP1(1);
    expect(tradeNeighbors(s)).toEqual([]);
    const t = town();
    const nbs = tradeNeighbors(t);
    expect(nbs.map((x) => x.id).sort()).toEqual(['c2', 'c3']);
    expect(nbs.every((x) => !x.opened)).toBe(true);
    expect(nbs.find((x) => x.id === 'c2')!.delta).toEqual([1, 0]);
    expect(nbs.find((x) => x.id === 'c3')!.delta).toEqual([0, 1]);
  });
});

describe('関税の率', () => {
  it('出店済み 12%・未出店 18%。パネル −3・−3・−2、境の拠点 −2。下限 2%（未出店は 8%：いつも未出店のほうが高い）', () => {
    const s = { skills: [] as string[] };
    expect(dutyRateOf(s, true, false)).toBe(0.12);
    expect(dutyRateOf(s, false, false)).toBe(0.18);
    s.skills.push('customs');
    expect(dutyRateOf(s, true, false)).toBe(0.09);
    s.skills.push('bonded');
    expect(dutyRateOf(s, true, false)).toBe(0.06);
    s.skills.push('lane');
    expect(dutyRateOf(s, true, false)).toBe(0.04);
    expect(dutyRateOf(s, true, true)).toBe(TRADE.floor);
    expect(dutyRateOf(s, false, true)).toBe(0.08);
    for (const sk of [[], ['customs'], ['customs', 'bonded'], ['customs', 'bonded', 'lane']])
      for (const b of [false, true]) expect(dutyRateOf({ skills: sk }, false, b)).toBeGreaterThan(dutyRateOf({ skills: sk }, true, b));
  });

  it('出店したら 12% に下がる', () => {
    const s = town();
    expect(dutyRate(s, 'c2')).toBe(0.18);
    s.land!.mine.push('c2');
    expect(dutyRate(s, 'c2')).toBe(0.12);
  });

  it('パネル 3 枚は物流の枝（通関の手続き＝物流拠点のあと・保税の置き場＝Uncommon・関所の優先レーン＝Rare）', () => {
    expect(SKILL.customs.branch).toBe('logi');
    expect(SKILL.customs.requires).toContain('hub');
    expect(SKILL.bonded.tier).toBe('U');
    expect(SKILL.lane.tier).toBe('R');
    // 研究ポイントは近くのパネルと同じ
    expect(SKILL.customs.rp).toBe(SKILL.hub.rp);
    expect(SKILL.bonded.rp).toBe(SKILL.crossdock.rp);
    expect(SKILL.lane.rp).toBe(SKILL.fleet.rp);
  });
});

describe('となり町の値段', () => {
  it('相手の特産は 20% 引き（ユーホタウンのガラス・リデル・ヒルズの鉄）。そうでなければここと同じ値段 ＋ 関税', () => {
    const s = town();
    expect(cheapAt('c2', 'glass')).toBe(true);
    expect(cheapAt('c3', 'iron')).toBe(true);
    const g = importPrice(s, 'glass', 'c2');
    expect(g.base).toBe(Math.round(unitPrice(s, 'glass') * 0.8));
    expect(g.duty).toBe(Math.round(g.base * 0.18));
    expect(g.unit).toBe(g.base + g.duty);
    // 特産でなければ、関税のぶんだけ高い
    const w = importPrice(s, 'wood', 'c2');
    expect(w.base).toBe(unitPrice(s, 'wood'));
    expect(w.unit).toBeGreaterThan(unitPrice(s, 'wood'));
    // 関税をいちばん下げても、相手の町で買うより安くはならない（0.8 × 1.02）
    s.skills.push('customs', 'bonded', 'lane');
    s.land!.mine.push('c2');
    expect(importPrice(s, 'glass', 'c2').unit).toBeGreaterThan(importPrice(s, 'glass', 'c2').base);
  });
});

describe('帳簿と損益', () => {
  it('取り寄せると、素材は相手の値段・関税は帳簿の duty（売上原価）。月次報告に関税の行', () => {
    const s = town();
    const before = { ...s.books!.cur };
    const p = importPrice(s, 'glass', 'c2');
    const money = s.money;
    expect(orderFrom(s, 'glass', 1, 'c2')).toBeNull();
    expect(money - s.money).toBe((p.base + p.duty) * 10);
    expect(s.books!.cur.mats - before.mats).toBe(p.base * 10);
    expect((s.books!.cur.duty ?? 0) - (before.duty ?? 0)).toBe(p.duty * 10);
    expect(s.monthCost.duty).toBe(p.duty * 10);
    const o = s.orders!.find((x) => x.from === 'c2')!;
    expect(o.duty).toBe(p.duty * 10);
    expect(o.left).toBe(importLead(s, 'c2'));
    const l = { ...emptyLedger(), sales: 100000, mats: 20000, duty: 3000 };
    expect(pl(l).cogs).toBe(23000);
    expect(pl(l).gross).toBe(77000);
    expect(costParts({ materials: 1, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0, duty: 58 }).some((x) => x.key === 'duty' && x.v === 58)).toBe(true);
  });

  it('納期に届いて素材の在庫になる', () => {
    const s = town();
    const had = s.mats.glass ?? 0;
    orderFrom(s, 'glass', 1, 'c2');
    const days = importLead(s, 'c2');
    let got = false;
    for (let k = 0; k < days; k++) {
      const r = step(s);
      if (r.orders?.some((o) => o.from === 'c2')) got = true;
    }
    expect(got).toBe(true);
    expect((s.mats.glass ?? 0) - had).toBeGreaterThanOrEqual(10);
  });
});

describe('納期と境の拠点', () => {
  it('隣の問屋 → 境界 → 工房。境界から 3 マス以内の物流拠点（境の拠点）があると、届け先は拠点・関税 −2 ポイント', () => {
    const s = town();
    const r = crossRoute(s, 'c2')!;
    expect(r).not.toBeNull();
    // 境界をこえる所は、いまの町の東のふち（i = n − 1）
    expect(r.cells[r.at][0]).toBe(s.n - 1);
    expect(r.cells[0][0]).toBeGreaterThanOrEqual(s.n);
    const lead0 = importLead(s, 'c2');
    expect(lead0).toBeGreaterThan(2);
    expect(borderDepot(s, 'c2')).toBeNull();
    s.skills.push('hub');
    const [i, j, d] = lot(s, 'logistics', (x) => x >= s.n - 1 - TRADE.edge);
    expect(borderAt(s, i, j, d).map((x) => x.id)).toContain('c2');
    const b = build(s, 'logistics', i, j, d);
    if (typeof b === 'string') throw new Error(b);
    run(s, 8);
    expect(borderDepot(s, 'c2')?.uid).toBe(b.uid);
    expect(dutyRate(s, 'c2')).toBe(0.16);
    expect(crossRoute(s, 'c2')!.depot?.uid).toBe(b.uid);
    expect(importLead(s, 'c2')).toBeLessThanOrEqual(lead0);
    // 関所の優先レーン：境界の外を歩く日数 −20%
    const r2 = crossRoute(s, 'c2')!;
    s.skills.push('lane');
    expect(importLead(s, 'c2')).toBeLessThanOrEqual(1 + Math.max(1, Math.ceil((r2.outside * 0.8 + (r2.inside + r2.trunk) * 0.3) / 8)));
  });
});

describe('調達係（0 → 1 はプレイヤー）', () => {
  it('Common：関税込みで隣が安くても、調達係は勝手に切り替えない（手で選んだら、そこから取り寄せ続ける）', () => {
    const s = shop();
    expect(importPrice(s, 'glass', 'c2').unit).toBeLessThan(unitPrice(s, 'glass'));
    run(s, 20);
    expect(s.proc.from).toBeUndefined();
    expect((s.orders ?? []).some((o) => o.from)).toBe(false);
    setSource(s, 'glass', 'c2');
    expect(sourceOf(s, 'glass')).toBe('c2');
    expect(s.staff.some((x) => x.task === 'buy')).toBe(true);
    s.mats.glass = 0;
    const seen: string[] = [];
    for (let k = 0; k < 8; k++) {
      step(s);
      for (const o of s.orders ?? []) if (o.from) seen.push(`${o.m}:${o.from}`);
    }
    expect(seen).toContain('glass:c2');
    // 鉄はこの町のまま
    expect(seen.some((x) => x.startsWith('iron:'))).toBe(false);
    setSource(s, 'glass', null);
    expect(s.proc.from).toBeUndefined();
  });

  it('物流の部長の提案（Rare から）：隣町で買うと月 −N G の候補。Common では出さない（0 → 1 はプレイヤー）。承認で仕入れ先が替わる', () => {
    const s = shop();
    run(s, 3);
    const c = sourceCands(s, ['glass', 'iron', 'wood']).find((x) => x.m === 'glass');
    expect(c).toBeTruthy();
    expect(c!.from).toBe('c2');
    expect(c!.save).toBeGreaterThan(0);
    // 木材はとなり町のほうが高い（関税のぶん）ので候補にならない
    expect(sourceCands(s, ['wood'])).toEqual([]);
    // Common の町（提案は Rare から）：部長の提案は出ない
    expect(headSuggest(s, ['glass'])).toEqual([]);
    setSource(s, 'glass', c!.from);
    expect(sourceOf(s, 'glass')).toBe('c2');
    expect(sourceCands(s, ['glass'])).toEqual([]);
  });
});

describe('置き場所', () => {
  it('取り寄せ（納期が長いぶん量が多い）は、置き場所の空きを 1 日の量の割合までしか取らない（ほかの素材が買えなくならない）', () => {
    const s = shop();
    setSource(s, 'glass', 'c2');
    s.mats = { glass: 0, iron: 0 };
    s.orders = [];
    // 物置の空きを 40 にする（使わない素材で埋める）
    s.mats.paper = poolCap(s) - 40 - (poolCap(s) - poolFree(s) - (s.mats.glass ?? 0));
    const free0 = poolFree(s);
    expect(free0).toBeGreaterThan(0);
    expect(free0).toBeLessThanOrEqual(40);
    step(s);
    const glass = (s.orders ?? []).filter((o) => o.from === 'c2' && o.m === 'glass').reduce((a, o) => a + o.qty, 0);
    expect(glass).toBeGreaterThan(0);
    // ランタンは鉄 2・ガラス 3：ガラスは空きの 6 割まで
    expect(glass).toBeLessThanOrEqual(Math.ceil(free0 * 0.6));
    // 鉄（この町の卸問屋）のぶんの空きが残る
    expect(free0 - glass).toBeGreaterThan(0);
  });
});

describe('古いセーブ', () => {
  it('注文の from・duty、調達の from、帳簿の duty が無くても読めて動く', () => {
    const s = shop();
    orderFrom(s, 'glass', 1, 'c2');
    const raw = JSON.parse(serializeP1(s));
    const strip = (x: Record<string, unknown>) => {
      delete x.from;
      delete x.duty;
      delete x.save;
    };
    const st = raw.state ?? raw;
    for (const o of st.orders ?? []) strip(o);
    delete st.proc?.from;
    if (st.books?.cur) delete st.books.cur.duty;
    if (st.monthCost) delete st.monthCost.duty;
    const t = deserializeP1(JSON.stringify(raw));
    expect(t).not.toBeNull();
    expect(sourceOf(t!, 'glass')).toBeNull();
    run(t!, 35);
    expect(t!.reports.length).toBeGreaterThan(0);
    expect(Number.isFinite(pl(t!.books!.months[t!.books!.months.length - 1]?.l ?? emptyLedger()).net)).toBe(true);
  });
});
