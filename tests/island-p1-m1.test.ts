/**
 * 段 M1：宣伝のはしご（会社の規模に釣り合う広告の段）。
 * 既存の 3 つ（段 1〜3）は前のまま・上の段の解禁の条件・効く範囲（町／ランド／全店）・重ね掛けの逓減・期間の終わりのブランド力・
 * 自動プレイ（通常・最短）の候補が段 1〜3 のまま。
 */
import { describe, expect, it } from 'vitest';
import { ADS, AD_TIER, BRAND_CAP } from '../src/island/p1/data';
import { moveTo, recOf } from '../src/island/p1/land';
import { adGain, adRemoteGain, sellMoves } from '../src/island/p1/moves';
import { forecast } from '../src/island/p1/mkt';
import { adBoost, adBoostAt, adBoostFor, adBoostRaw, adLock, adOpen, adPick, allowedDirs, assign, build, companyRevenue, deserializeP1, myShops, newP1, openGate, runAd, serializeP1, setShelf, startCraft, step, townsWithShops, type P1State } from '../src/island/p1/model';

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
function setup(s: P1State) {
  const [a, b, d] = lot(s, 'workshop');
  build(s, 'workshop', a, b, d);
  for (let k = 0; k < 4; k++) step(s);
  const [x, y, e] = lot(s, 'general_store');
  const shop = build(s, 'general_store', x, y, e);
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10003, 'craft', 0);
  assign(s, 10001, 'transport');
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  expect(startCraft(s, 0, 'Sensu:C')).toBeNull();
  return shop.uid;
}
/** お店を n 軒に（建てて完成まで進める） */
function shopsTo(s: P1State, n: number) {
  while (myShops(s).length < n) {
    const [x, y, e] = lot(s, 'general_store');
    const b = build(s, 'general_store', x, y, e);
    if (typeof b === 'string') throw new Error(b);
    for (let k = 0; k < 6; k++) step(s);
  }
}
const run = (s: P1State, days: number) => {
  for (let k = 0; k < days; k++) step(s);
};
const clone = (s: P1State) => deserializeP1(serializeP1(s))!;
const UPPER = ['signage', 'vision', 'local_tv', 'billboard', 'nat_tv'];
const withUpper = <T>(on: boolean, f: () => T): T => {
  const was = AD_TIER.auto.upper;
  AD_TIER.auto.upper = on;
  try {
    return f();
  } finally {
    AD_TIER.auto.upper = was;
  }
};

describe('段 M1：既存の 3 つはそのまま・重ね掛けの逓減', () => {
  it('段 1〜3 の値段・日数・効き目は前のまま。上の段は 5 つ（値段は約 3 桁の幅）', () => {
    const by = Object.fromEntries(ADS.map((a) => [a.id, a]));
    expect([by.flyer.cost, by.flyer.days, by.flyer.boost]).toEqual([1500, 10, 0.15]);
    expect([by.poster.cost, by.poster.days, by.poster.boost]).toEqual([5000, 30, 0.2]);
    expect([by.event.cost, by.event.days, by.event.boost]).toEqual([4000, 5, 0.5]);
    for (const id of ['flyer', 'poster', 'event']) expect(by[id].need).toBeUndefined();
    expect(ADS.map((a) => a.id)).toEqual(['flyer', 'poster', 'event', ...UPPER]);
    expect(by.nat_tv.cost / by.flyer.cost).toBeGreaterThan(500);
    for (const id of UPPER) expect(by[id].need).toBeTruthy();
  });

  it('段 1〜3 だけの組み合わせは、前と同じ足し算（最大 +85%・上限と同じ）。店ごとの評価（adBoostFor）も同じ数字', () => {
    const s = newP1(5);
    const shop = setup(s);
    s.money = 1e6;
    expect(runAd(s, 'flyer')).toBeNull();
    expect(adBoostRaw(s)).toBeCloseTo(0.15, 6);
    const per = adBoost(s) / 0.15;
    expect(runAd(s, 'poster')).toBeNull();
    expect(adBoostRaw(s)).toBeCloseTo(0.35, 6);
    expect(adBoost(s)).toBeCloseTo(0.35 * per, 6);
    expect(runAd(s, 'event')).toBeNull();
    expect(adBoostRaw(s)).toBeCloseTo(0.85, 6);
    expect(AD_TIER.cap).toBe(0.85);
    expect(adBoost(s)).toBeCloseTo(0.85 * per, 6);
    const b = s.buildings.find((x) => x.uid === shop)!;
    expect(adBoostFor(s, b)).toBeCloseTo(adBoost(s), 9);
  });

  it('上の段は大きい順に 100%・50%・25%…。段 1〜3 の足し算に乗り、合計は +85% まで', () => {
    const s = newP1(5);
    setup(s);
    s.ads = { signage: 30, vision: 14 };
    expect(adBoostRaw(s)).toBeCloseTo(0.25 + 0.15 * 0.5, 6);
    s.ads = { signage: 30, vision: 14, nat_tv: 30 };
    s.adFrom = { nat_tv: 'c1' };
    expect(adBoostRaw(s)).toBeCloseTo(0.4 + 0.25 * 0.5 + 0.15 * 0.25, 6);
    s.ads.flyer = 10;
    expect(adBoostRaw(s)).toBeCloseTo(0.15 + 0.4 + 0.125 + 0.0375, 6);
    s.ads.event = 5;
    s.ads.poster = 30;
    expect(adBoostRaw(s)).toBe(AD_TIER.cap);
  });
});

describe('段 M1：解禁の条件', () => {
  it('駅のサイネージは同じ町に店 2 軒・大型ビジョンは 3 軒。満たさないと runAd は locked', () => {
    const s = newP1(6);
    setup(s);
    s.money = 1e7;
    expect(myShops(s)).toHaveLength(1);
    expect(adLock(s, 'signage')).toContain('2');
    expect(runAd(s, 'signage')).toBe('locked');
    expect(adOpen(s, 'flyer')).toBe(true);
    shopsTo(s, 2);
    expect(adLock(s, 'signage')).toBeNull();
    expect(adLock(s, 'vision')).toContain('3');
    expect(runAd(s, 'signage')).toBeNull();
    expect(s.ads.signage).toBe(30);
    expect(s.monthCost.ads).toBe(15000);
    shopsTo(s, 3);
    expect(adLock(s, 'vision')).toBeNull();
  });

  it('地域のテレビは月商 500 万・全国 CM は 3,000 万・ビルボードは複数の町か月商 1,000 万（会社の月商＝いまの町 ＋ 任せている町）', () => {
    const s = newP1(7);
    setup(s);
    s.money = 1e8;
    expect(adLock(s, 'local_tv')).toBeTruthy();
    expect(adLock(s, 'billboard')).toContain('または');
    s.reports.push({ ...s.reports[0], revenue: 5_000_000 } as never);
    expect(companyRevenue(s)).toBe(5_000_000);
    expect(adLock(s, 'local_tv')).toBeNull();
    expect(adLock(s, 'billboard')).toBeTruthy();
    expect(adLock(s, 'nat_tv')).toBeTruthy();
    s.reports[s.reports.length - 1].revenue = 10_000_000;
    expect(adLock(s, 'billboard')).toBeNull();
    s.reports[s.reports.length - 1].revenue = 30_000_000;
    expect(adLock(s, 'nat_tv')).toBeNull();
    expect(runAd(s, 'nat_tv')).toBeNull();
    expect(s.adFrom?.nat_tv).toBe('c1');
  });

  it('ビルボードは、お店のある町が 2 つでも解禁（任せている町の売上も月商に入る）', () => {
    const s = newP1(8);
    setup(s);
    s.money = 1e6;
    run(s, 40);
    s.money = 1e7;
    openGate(s);
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    setup(s);
    expect(townsWithShops(s)).toBe(2);
    expect(adLock(s, 'billboard')).toBeNull();
    const rec = recOf(s, 'c1');
    run(s, 30);
    expect(rec.log.length).toBe(1);
    expect(companyRevenue(s)).toBeGreaterThanOrEqual(rec.log[0].rev);
  });
});

describe('段 M1：効く範囲（町／ランド／全店）と町を移っても続くこと', () => {
  it('町の宣伝はその町だけ。ランドの宣伝は同じランク（Common ランド）の町に、全店の宣伝はどの町にも（任せている町は半分）', () => {
    const s = newP1(9);
    setup(s);
    s.ads = { signage: 30 };
    expect(adBoostRaw(s, 'c1')).toBeCloseTo(0.15, 6);
    expect(adBoostRaw(s, 'c2')).toBe(0);
    expect(adBoostAt(s, 'c2')).toBe(0);
    s.ads = { local_tv: 30 };
    s.adFrom = { local_tv: 'c1' };
    expect(adBoostRaw(s, 'c2')).toBeCloseTo(0.2, 6);
    expect(adBoostRaw(s, 'u1')).toBe(0);
    expect(adBoostAt(s, 'c2')).toBeCloseTo(adBoost(s) * AD_TIER.remote, 6);
    s.ads = { billboard: 14 };
    s.adFrom = { billboard: 'c1' };
    expect(adBoostRaw(s, 'u1')).toBeCloseTo(0.3, 6);
    expect(adBoostAt(s, 'u1')).toBeGreaterThan(0);
  });

  it('ランド・全店の宣伝は町を移っても続き、町の宣伝はその町の写しに残る', () => {
    const s = newP1(10);
    setup(s);
    s.money = 1e6;
    run(s, 40);
    s.money = 1e8;
    s.reports[s.reports.length - 1].revenue = 10_000_000;
    expect(runAd(s, 'billboard')).toBeNull();
    s.ads.flyer = 10;
    openGate(s);
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    expect(s.ads.billboard).toBe(14);
    expect(s.ads.flyer).toBeUndefined();
    const snap = recOf(s, 'c1').snap as { ads: Record<string, number> };
    expect(snap.ads.flyer).toBe(10);
    expect(snap.ads.billboard).toBeUndefined();
    // 日ごとに減る（会社のもの）
    step(s);
    expect(s.ads.billboard).toBe(13);
    expect(moveTo(s, 'c1', null)).toBeNull();
    expect(s.ads.billboard).toBe(13);
    expect(s.ads.flyer).toBe(10);
  });

  it('全店の宣伝は、任せている町の売上の倍率にも足す（出していない通しより売上が大きい）', () => {
    const s = newP1(11);
    setup(s);
    s.money = 1e6;
    run(s, 40);
    s.money = 1e8;
    openGate(s);
    expect(moveTo(s, 'c2', 10003)).toBeNull();
    const off = clone(s);
    s.ads.billboard = 60;
    s.adFrom = { billboard: 'c2' };
    const g = adRemoteGain(s, 'billboard');
    expect(g).toBe(0); // もう出ている（差が無い）
    const s2 = clone(off);
    expect(adRemoteGain(s2, 'billboard')).toBeGreaterThan(0);
    expect(adRemoteGain(s2, 'flyer')).toBe(0);
    run(s, 30);
    run(off, 30);
    const on = recOf(s, 'c1').log[0].rev;
    const base = recOf(off, 'c1').log[0].rev;
    expect(on).toBeGreaterThan(base);
    expect(on / base).toBeLessThan(1.5);
  });
});

describe('段 M1：ブランド力・自動の判断', () => {
  it('知名度のある宣伝は、期間の終わりに 1 回だけブランド力に足す（上限まで）', () => {
    const s = newP1(12);
    setup(s);
    s.money = 1e6;
    s.ads = { vision: 2 };
    const b0 = s.brand ?? 0;
    step(s);
    expect(s.brand).toBe(b0);
    step(s);
    expect(s.brand).toBe(b0 + 5);
    expect(s.brandLog![0].why).toContain('大型ビジョン');
    step(s);
    expect(s.brand).toBe(b0 + 5);
    // 全国 CM は上限（BRAND_CAP）を超えない
    s.brand = BRAND_CAP.C - 10;
    s.ads = { nat_tv: 1 };
    step(s);
    expect(s.brand).toBe(BRAND_CAP.C);
  });

  it('自動の判断（通常・最短）では上の段を候補に出さない。ゲーム（auto.upper）では解禁した段が候補に入る', () => {
    const s = newP1(13);
    setup(s);
    s.money = 1e7;
    shopsTo(s, 3);
    run(s, 30);
    const sig = ADS.find((a) => a.id === 'signage')!;
    expect(adOpen(s, 'signage')).toBe(true);
    withUpper(false, () => {
      expect(adPick(s, sig)).toBe(false);
      const ids = sellMoves(s).filter((m) => m.kind === 'ad').map((m) => m.key);
      for (const id of ids) expect(UPPER).not.toContain(id);
      const f = forecast(s);
      if (f.bestAd) expect(UPPER).not.toContain(f.bestAd.id);
    });
    withUpper(true, () => {
      expect(adPick(s, sig)).toBe(true);
      expect(adPick(s, ADS.find((a) => a.id === 'nat_tv')!)).toBe(false);
    });
    expect(typeof adGain(s, 'signage')).toBe('number');
  });
});
