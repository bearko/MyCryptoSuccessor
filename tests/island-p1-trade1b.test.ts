// 段 TRADE1b：隣町の工房の商品を、境の拠点へ輸入する。docs/ISLAND_PHASE1.md「商品の輸入」
import { describe, expect, it } from 'vitest';
import { RUIN, emptyLedger, pl, runSector, type SectorRec } from '../src/island/p1/company';
import { SKILL, TRADE, skuPrice } from '../src/island/p1/data';
import { moveTo } from '../src/island/p1/land';
import { allowedDirs, assign, build, canBuild, closeCompanyMonth, deserializeP1, invest, newP1, oneWay, openGate, poolFree, roomOf, serializeP1, setShelf, startCraft, step, type P1State } from '../src/island/p1/model';
import { activeFeeds, approveFeed, dockRoom, feedBlock, feedCut, feedDay, feedGain, feedItems, feedNeighbors, feedPrice, feedReady, feedSuggest, goodsRate, goodsRateOf, stoppedFeeds, toggleFeed, weekShare } from '../src/island/p1/feed';
import { borderDepot } from '../src/island/p1/tariff';

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
/** タオックス（c1）：工房・お店でランタンを作って売り、ひと月締めてから、ユーホタウン（c2）へ出店（c1 はマネージャーに任せる） */
function twoTowns(): P1State {
  const s = newP1(1);
  s.money = 1e6;
  s.tut = 99;
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  run(s, 6);
  expect(openGate(s)).toBe(true);
  s.money = 1e6;
  const [x, y, e] = lot(s, 'general_store');
  const sh = build(s, 'general_store', x, y, e);
  if (typeof sh === 'string') throw new Error(sh);
  run(s, 5);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', sh.uid);
  setShelf(s, sh.uid, 0, 'Lantern:C');
  expect(startCraft(s, 0, 'Lantern:C')).toBeNull();
  for (let k = 0; k < 45 && !s.reports.length; k++) {
    s.money = 1e6;
    step(s);
  }
  expect(s.reports.length).toBeGreaterThan(0);
  // 離れた月の出来高（ランタンの売れた数）
  s.reports[s.reports.length - 1].units = { Lantern: 900 };
  s.reports[s.reports.length - 1].revenue = Math.max(1, s.reports[s.reports.length - 1].revenue);
  s.money = 1e6;
  s.skills.push('hub');
  expect(moveTo(s, 'c2', 10003)).toBeNull();
  s.money = 1e6;
  return s;
}
/** c2 の西の境界（c1 の向き）から 3 マス以内に物流拠点を建てる */
function borderHub(s: P1State) {
  const [i, j, d] = lot(s, 'logistics', (i) => i <= 1);
  const b = build(s, 'logistics', i, j, d);
  if (typeof b === 'string') throw new Error(b);
  b.left = 0;
  return b;
}

describe('輸入できる条件', () => {
  it('境の拠点・出店済み・工房があるときだけ（拠点を置く前は depot）', () => {
    const s = twoTowns();
    expect(s.land!.cur).toBe('c2');
    expect(s.land!.recs.c1.base?.units?.Lantern).toBe(900);
    // c1 は出店済み。境の拠点がまだ
    expect(feedBlock(s, 'c1')).toBe('depot');
    expect(feedReady(s).map((x) => x.id)).toEqual(['c1']);
    // c3 は c2 の隣ではない（斜め）
    expect(feedBlock(s, 'c3')).toBe('nb');
    // 工房を建てる前でも、物流拠点とお店は建てられる（新しい町の最初の一手）
    expect(canBuild(s, 'logistics')).toBeNull();
    expect(canBuild(s, 'general_store')).toBeNull();
    expect(canBuild(s, 'warehouse')).toBe('locked');
    borderHub(s);
    expect(feedBlock(s, 'c1')).toBeNull();
    expect(feedNeighbors(s).map((x) => x.id)).toEqual(['c1']);
    const it0 = feedItems(s, 'c1');
    expect(it0.map((x) => x.sku)).toEqual(['Lantern:C']);
  });

  it('境界から遠い拠点は境の拠点ではない', () => {
    const s = twoTowns();
    const [i, j, d] = lot(s, 'logistics', (i) => i >= 8);
    const b = build(s, 'logistics', i, j, d);
    if (typeof b === 'string') throw new Error(b);
    b.left = 0;
    expect(borderDepot(s, 'c1')).toBeNull();
    expect(feedBlock(s, 'c1')).toBe('depot');
  });

  it('未出店のとなり町（工房が無い）からは輸入できない', () => {
    const s = twoTowns();
    s.land!.mine = s.land!.mine.filter((x) => x !== 'c1');
    expect(['unopened', 'nb']).toContain(feedBlock(s, 'c1'));
  });
});

describe('量', () => {
  it('相手の町の出来高の 30% まで（1 週は 7/30）。拠点の置き場所で頭打ち、保管棚で増える', () => {
    const s = twoTowns();
    const hub = borderHub(s);
    expect(weekShare(s, 'c1', 'Lantern:C')).toBe(Math.floor((900 * TRADE.feed.share * TRADE.feed.every) / 30));
    // 63 個 < 拠点 150 個：30% が効く
    expect(feedItems(s, 'c1')[0].week).toBe(63);
    // 出来高を大きくすると、拠点の置き場所 150 で頭打ち
    s.land!.recs.c1.base!.units = { Lantern: 5000 };
    expect(weekShare(s, 'c1', 'Lantern:C')).toBe(350);
    expect(dockRoom(s, 'c1')).toBe(roomOf(hub));
    expect(feedItems(s, 'c1')[0].week).toBe(150);
    // 保管棚 1 段で +75
    expect(invest(s, hub.uid, 'dock')).toBeNull();
    expect(feedItems(s, 'c1')[0].week).toBe(225);
  });
});

describe('関税と仕入れ値', () => {
  it('商品は値段 × 8%。パネル −3・−3・−2、境の拠点 −2、下限 2%。未出店は高い', () => {
    const z = { skills: [] as string[] };
    expect(goodsRateOf(z, true, false)).toBe(0.08);
    expect(goodsRateOf(z, true, true)).toBe(0.06);
    z.skills.push('customs');
    expect(goodsRateOf(z, true, true)).toBe(0.03);
    z.skills.push('bonded');
    expect(goodsRateOf(z, true, true)).toBe(TRADE.floor);
    expect(goodsRateOf(z, true, false)).toBe(TRADE.floor);
    for (const sk of [[], ['customs'], ['customs', 'bonded', 'lane']]) for (const b of [false, true]) expect(goodsRateOf({ skills: sk }, false, b)).toBeGreaterThan(goodsRateOf({ skills: sk }, true, b));
    // パネルは TRADE1a の 3 枚のまま（新しいパネルは無い）
    expect(SKILL.customs && SKILL.bonded && SKILL.lane).toBeTruthy();
  });

  it('仕入れ値は相手の素材代 ＋ 作業（値段の 10%）。関税は値段 × 率（境の拠点で 6%）', () => {
    const s = twoTowns();
    borderHub(s);
    expect(goodsRate(s, 'c1')).toBe(0.06);
    const p = feedPrice(s, 'c1', 'Lantern:C');
    expect(p.duty).toBe(Math.round(skuPrice('Lantern:C') * 0.06));
    expect(p.buy).toBeLessThan(skuPrice('Lantern:C'));
    expect(p.buy).toBeGreaterThan(Math.round(skuPrice('Lantern:C') * TRADE.feed.labor) - 1);
  });
});

describe('毎週の到着と帳簿', () => {
  it('選んだ品が 7 日ごとに運ぶ前の商品に入り、仕入れ値は素材・関税は duty（二重に数えない）', () => {
    const s = twoTowns();
    borderHub(s);
    expect(toggleFeed(s, 'c1', 'Lantern:C')).toBeNull();
    expect(activeFeeds(s).length).toBe(1);
    const p = feedPrice(s, 'c1', 'Lantern:C');
    const m0 = s.money;
    const mats0 = s.books!.cur.mats;
    const duty0 = s.books!.cur.duty ?? 0;
    s.day = Math.ceil(s.day / TRADE.feed.every) * TRADE.feed.every;
    const got = feedDay(s);
    expect(got).toEqual([{ from: 'c1', sku: 'Lantern:C', n: 63, duty: 63 * p.duty, depot: borderDepot(s, 'c1')!.uid }]);
    expect(s.stock['Lantern:C']).toBe(63);
    expect(m0 - s.money).toBe(63 * p.unit);
    expect(s.books!.cur.mats - mats0).toBe(63 * p.buy);
    expect((s.books!.cur.duty ?? 0) - duty0).toBe(63 * p.duty);
    // 損益：売上原価 ＝ 素材 ＋ 関税（払った額と同じ）
    const l = { ...emptyLedger(), mats: 63 * p.buy, duty: 63 * p.duty };
    expect(pl(l).cogs).toBe(63 * p.unit);
    // 7 日ごとでない日は着かない
    s.day += 1;
    expect(feedDay(s)).toEqual([]);
  });

  it('step で着いて、工房が無くても物流拠点からお店へ荷車で運ぶ', () => {
    const s = twoTowns();
    const hub = borderHub(s);
    const [x, y, e] = lot(s, 'general_store', (i) => i <= 7);
    const sh = build(s, 'general_store', x, y, e);
    if (typeof sh === 'string') throw new Error(sh);
    run(s, 6);
    expect(s.shops[sh.uid]).toBeTruthy();
    assign(s, 10001, 'transport');
    assign(s, 10002, 'shop', sh.uid);
    expect(toggleFeed(s, 'c1', 'Lantern:C')).toBeNull();
    expect(oneWay(s, sh).from?.uid).toBe(hub.uid);
    let arrived = 0;
    for (let k = 0; k < 16; k++) {
      s.money = 1e6;
      const r = step(s);
      arrived += (r.feeds ?? []).reduce((a, f) => a + f.n, 0);
    }
    expect(arrived).toBeGreaterThan(0);
    const shop = s.shops[sh.uid];
    expect((shop.storage['Lantern:C'] ?? 0) + (shop.shelf['Lantern:C'] ?? 0) + s.trips.reduce((a, t) => a + (t.cargo['Lantern:C'] ?? 0), 0)).toBeGreaterThan(0);
  });

  it('置き場所の空きで頭打ち', () => {
    const s = twoTowns();
    borderHub(s);
    toggleFeed(s, 'c1', 'Lantern:C');
    s.mats.wood = 1e5;
    expect(poolFree(s)).toBe(0);
    s.day = Math.ceil(s.day / TRADE.feed.every) * TRADE.feed.every;
    expect(feedDay(s)).toEqual([]);
  });
});

describe('相手の町への影響', () => {
  it('出した値段の合計 ÷ 相手の売上 の割合だけ、runSector の売上が減る', () => {
    const rnd = () => 0.5;
    const rec: SectorRec = { id: 'c1', invest: 0, capital: 0, log: [], base: { rev: 100000, matRate: 0.4, fixed: 10000, units: { Lantern: 900 } } };
    const a = runSector({ ...rec, log: [] }, null, 1, rnd);
    rec.feed = [{ to: 'c2', sku: 'Lantern:C', sent: Math.round(30000 / skuPrice('Lantern:C')) }];
    const cut = feedCut(rec);
    expect(cut).toBeCloseTo((rec.feed[0].share ?? 0), 3);
    expect(cut).toBeGreaterThan(0.29);
    expect(cut).toBeLessThan(0.31);
    expect(rec.feed[0].sent).toBeUndefined();
    const b = runSector({ ...rec, log: [] }, null, 1, rnd, { feed: cut });
    expect(b.rev).toBe(Math.round(a.rev * (1 - cut)));
    // 輸入していなければ前のまま
    expect(runSector({ ...rec, log: [] }, null, 1, rnd, { feed: 0 }).rev).toBe(a.rev);
  });

  it('会社の月の締めで、輸入した町（c1）の売上が減る', () => {
    const s = twoTowns();
    borderHub(s);
    toggleFeed(s, 'c1', 'Lantern:C');
    const rec = s.land!.recs.c1;
    (rec.feed![0] as { sent?: number }).sent = 300;
    closeCompanyMonth(s);
    expect(rec.feed![0].share).toBeCloseTo((300 * skuPrice('Lantern:C')) / rec.base!.rev, 3);
  });
});

describe('止まるとき', () => {
  it('相手の工房が廃墟なら止まり、直すと戻る（選んだ品は残る）', () => {
    const s = twoTowns();
    borderHub(s);
    toggleFeed(s, 'c1', 'Lantern:C');
    const ws = (s.land!.recs.c1.snap!.buildings as { id: string; owner: string }[]).find((b) => b.id === 'workshop')!;
    ws.owner = RUIN;
    expect(feedBlock(s, 'c1')).toBe('ruin');
    expect(activeFeeds(s)).toEqual([]);
    expect(stoppedFeeds(s).map((x) => x.why)).toEqual(['ruin']);
    s.day = Math.ceil(s.day / TRADE.feed.every) * TRADE.feed.every;
    expect(feedDay(s)).toEqual([]);
    ws.owner = 'me';
    expect(activeFeeds(s).length).toBe(1);
    expect(feedDay(s).length).toBe(1);
  });

  it('相手の工房を手放したら止まる', () => {
    const s = twoTowns();
    borderHub(s);
    toggleFeed(s, 'c1', 'Lantern:C');
    const snap = s.land!.recs.c1.snap!;
    snap.buildings = (snap.buildings as { id: string }[]).filter((b) => b.id !== 'workshop');
    expect(feedBlock(s, 'c1')).toBe('workshop');
    expect(activeFeeds(s)).toEqual([]);
  });
});

describe('手と任せ', () => {
  it('Common：品は手で選んだものだけ。勝手に足さない（ひと月回しても選んだ品は増えない）', () => {
    const s = twoTowns();
    borderHub(s);
    expect(activeFeeds(s)).toEqual([]);
    run(s, 35);
    expect(activeFeeds(s)).toEqual([]);
    expect(s.land!.recs.c1.feed).toBeUndefined();
    // 部長の提案は Rare から（Common には出ない）
    expect(feedSuggest(s, 'c1')).toBeNull();
  });

  it('となり町 1 つにつき 2 品まで。もう一度押すと外す', () => {
    const s = twoTowns();
    borderHub(s);
    expect(toggleFeed(s, 'c1', 'Lantern:C')).toBeNull();
    expect(feedItems(s, 'c1')[0].on).toBe(true);
    expect(toggleFeed(s, 'c1', 'Lantern:C')).toBeNull();
    expect(feedItems(s, 'c1')[0].on).toBe(false);
    expect(s.land!.recs.c1.feed).toBeUndefined();
  });

  it('部長の提案を承認すると品が入る（入れ替えなら外してから）', () => {
    const s = twoTowns();
    borderHub(s);
    expect(approveFeed(s, { from: 'c1', sku: 'Lantern:C' })).toBe(true);
    expect(activeFeeds(s).map((x) => x.e.sku)).toEqual(['Lantern:C']);
    expect(feedGain(s, { sku: 'Lantern:C', week: 63 })).toBeGreaterThanOrEqual(0);
  });
});

describe('古いセーブ', () => {
  it('feed・units が無い記録でも動く（出来高が無い町は輸入の相手にならない）', () => {
    const s = twoTowns();
    borderHub(s);
    delete s.land!.recs.c1.base!.units;
    expect(feedBlock(s, 'c1')).toBe('units');
    expect(feedItems(s, 'c1')).toEqual([]);
    const t = deserializeP1(serializeP1(s));
    expect(t).toBeTruthy();
    run(t!, 8);
    expect(closeCompanyMonth(t!).managed.length).toBeGreaterThan(0);
  });
});
