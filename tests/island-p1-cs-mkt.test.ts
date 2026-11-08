/**
 * 段 G（docs/ISLAND_PHASE1.md「カスタマーサポート」「マーケ（市場調査・広報・企業の格）」「炎上」。数字は data.ts の CS・FLAME・PR・GRADE、計算は cs.ts・mkt.ts）：
 * 問い合わせが実際の数字から出る・合う返事で満足度が上がり放っておくと下がる・満足度が来店に効く・企業の格のしきい値・
 * 炎上の予告（手を打つと起きない・放っておくと起きて戻る）・Common に問い合わせと炎上が無い・広報・市場の見通し・リーダーの返事・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { POL_PANELS, CS, CS_SKILLS, DEPT_SKILLS, FLAME, GRADE, MARKET_GROWTH, MKT_SKILLS, PR, rpCost } from '../src/island/p1/data';
import { CS_OFF, apologize, centerRate, csDay, csMonth, csOf, csOn, daysLeft, inquiriesFor, putOut, repeatMul, reply, satOf, visitMul } from '../src/island/p1/cs';
import { forecast, gradeHire, gradeOf, horizon, newsOf, prGain, prLock, publish } from '../src/island/p1/mkt';
import { deptLevel, menuDepts } from '../src/island/p1/dept';
import { runnerOf, setLeader } from '../src/island/p1/deleg';
import { allowedDirs, assign, build, capture, deserializeP1, gainSkill, hireSlots, newP1, rivalOffers, serializeP1, setLevel, setShelf, step, type P1State, type Report } from '../src/island/p1/model';
/** 段 K の経営方針のパネル（POL_SKILLS）は別に数える（tests/island-p1-stagek.test.ts） */
const noPol = <T extends { id: string }>(xs: T[]) => xs.filter((k) => !POL_PANELS.includes(k.id));

function lot(s: P1State, id: string): [number, number, 'rd' | 'ld' | 'ru' | 'lu'] {
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
/** Uncommon の町（ウメコタウン）に工房とお店を建て、店員を置いて、センスを並べる。資金たっぷり */
function uShop(seed = 1, tier: 'U' | 'C' = 'U'): { s: P1State; uid: number } {
  const s = tier === 'U' ? newP1(seed, 'U', 'u1') : newP1(seed, 'C', 'c2');
  s.tut = 99;
  s.money = 1e7;
  build(s, 'workshop', ...lot(s, 'workshop'));
  for (let k = 0; k < 4; k++) step(s);
  const shop = build(s, 'general_store', ...lot(s, 'general_store'));
  if (typeof shop === 'string') throw new Error(shop);
  for (let k = 0; k < 5; k++) step(s);
  assign(s, 10002, 'shop', shop.uid);
  setShelf(s, shop.uid, 0, 'Sensu:C');
  return { s, uid: shop.uid };
}
/** 月の締めの報告の器（csMonth に渡す） */
const rep = () => ({ month: 1 }) as Report;

describe('問い合わせ（実際の数字から）', () => {
  it('先月の品切れの日・閉まっていた日・値段の高さから問い合わせが出る（品切れ 4 日 → 2 件）', () => {
    const { s } = uShop();
    const q = inquiriesFor(s, 4, 0);
    expect(q.map((x) => x.kind)).toEqual(['out', 'out']);
    expect(q[0].key).toBe('Sensu');
    expect(inquiriesFor(s, 1, 0)).toHaveLength(0);
    // 上限：品切れ 3 件・閉まっていた 2 件
    const many = inquiriesFor(s, 30, 30);
    expect(many.filter((x) => x.kind === 'out')).toHaveLength(CS.outMax);
    expect(many.filter((x) => x.kind === 'closed')).toHaveLength(CS.closedMax);
    // 値段：相場より 12% 以上高いと 1 件（プレミアム価格 +15%）
    expect(inquiriesFor(s, 0, 0)).toHaveLength(0);
    gainSkill(s, 'b_premium');
    expect(inquiriesFor(s, 0, 0).map((x) => x.kind)).toEqual(['price']);
  });

  it('品切れの日は、お店の主力商品が棚にもお店の裏にも無い日だけ数える。店員もアルバイトもいない日は「閉まっていた」', () => {
    const { s, uid } = uShop();
    const C = csOf(s);
    const sh = s.shops[uid];
    sh.shelf['Sensu:C'] = 0;
    sh.storage['Sensu:C'] = 5;
    csDay(s);
    expect(C.out).toBe(0);
    sh.storage['Sensu:C'] = 0;
    csDay(s);
    csDay(s);
    expect(C.out).toBe(2);
    assign(s, 10002, null);
    sh.part = 0;
    csDay(s);
    expect([C.out, C.closed]).toEqual([2, 1]);
  });

  it('月の締めで受け箱に入り、月次報告に出る（FAQ で −30%・サポートセンターが一部を受ける）', () => {
    const { s } = uShop();
    const C = csOf(s);
    C.out = 6;
    const r = rep();
    csMonth(s, r);
    expect(C.inbox).toHaveLength(3);
    expect(r.cs).toMatchObject({ got: 3, out: 6, open: 3 });
    // FAQ：5 件ぶん → 3 件（端数は次の月へ）
    gainSkill(s, 'cs_center');
    gainSkill(s, 'cs_faq');
    expect(centerRate(s)).toBeCloseTo(CS.center.base, 6);
    setLevel(s, 'cs_center', 5);
    expect(centerRate(s)).toBeCloseTo(0.7, 6);
    C.inbox = [];
    C.out = 6;
    C.closed = 6;
    const r2 = rep();
    csMonth(s, r2);
    expect(r2.cs!.got).toBe(Math.floor(5 * (1 - CS.faq)));
    // サポートセンター（Lv5 は 70%）が受けたぶんは受け箱に入らない（3 件 × 70% → 2 件）
    expect(r2.cs!.auto).toBe(2);
    expect(C.inbox).toHaveLength(r2.cs!.got - r2.cs!.auto);
  });
});

describe('返事と顧客満足度', () => {
  it('はじめは 60。合う返事で大きく上がり（+6）、合わない返事は少し（+1）。返金はお金・代わりの品は在庫を使う', () => {
    const { s } = uShop();
    expect(satOf(s)).toBe(CS.start);
    const C = csOf(s);
    C.inbox = inquiriesFor(s, 4, 3);
    const [a, b, c] = C.inbox;
    expect([a.kind, b.kind, c.kind]).toEqual(['out', 'closed', 'out']);
    // 品切れに「代わりの品」：在庫が無ければ選べない
    expect(reply(s, a.id, 'swap')).toBe('stock');
    s.stock['Sensu:C'] = CS.swapUnits + 8;
    expect(reply(s, a.id, 'swap')).toBeNull();
    expect(s.stock['Sensu:C']).toBe(8);
    expect(satOf(s)).toBe(CS.start + CS.good);
    // 閉まっていたに「謝る」（合う）・品切れに「返金」（合わない）
    expect(reply(s, b.id, 'sorry')).toBeNull();
    const m0 = s.money;
    expect(reply(s, c.id, 'refund')).toBeNull();
    expect(s.money).toBeLessThan(m0);
    expect(satOf(s)).toBe(CS.start + CS.good * 2 + CS.ok);
    expect(C.month).toMatchObject({ answered: 3, good: 2 });
    expect(C.inbox).toHaveLength(0);
  });

  it('放っておくと期限（14 日）で消えて満足度が下がる。返品の決まりで 21 日', () => {
    const { s } = uShop();
    const C = csOf(s);
    C.inbox = inquiriesFor(s, 4, 0);
    expect(daysLeft(s, C.inbox[0])).toBe(CS.expire);
    s.day += CS.expire - 1;
    expect(csDay(s)).toBe(0);
    s.day += 1;
    expect(csDay(s)).toBe(2);
    expect(satOf(s)).toBe(CS.start + CS.ignore * 2);
    expect(C.month.expired).toBe(2);
    gainSkill(s, 'cs_policy');
    C.inbox = inquiriesFor(s, 2, 0);
    s.day += CS.expire;
    expect(csDay(s)).toBe(0);
    s.day += CS.policyDays - CS.expire;
    expect(csDay(s)).toBe(1);
  });

  it('満足度が来店に効く（Uncommon 以上の町。100 で +6%・0 で −4%・満足度の調査で ×1.5）。自社のお店に来るお客さんが増える', () => {
    const { s, uid } = uShop();
    const C = csOf(s);
    expect(repeatMul(s)).toBe(1);
    C.sat = 100;
    expect(repeatMul(s)).toBeCloseTo(1 + CS.up, 6);
    C.sat = 0;
    expect(repeatMul(s)).toBeCloseTo(1 - CS.down, 6);
    C.sat = 80;
    const mid = repeatMul(s);
    gainSkill(s, 'cs_survey');
    expect(repeatMul(s) - 1).toBeCloseTo((mid - 1) * CS.survey, 6);
    // 自社のお店に来るお客さん（capture）
    const b = s.buildings.find((x) => x.uid === uid)!;
    const offers = [{ i: b.i, j: b.j, w: 1, g: 'me' }, ...rivalOffers(s, 'Sensu')];
    C.sat = CS.start;
    const base = capture(s, 'Sensu', offers)[0];
    C.sat = 100;
    expect(capture(s, 'Sensu', offers)[0]).toBeGreaterThan(base * 1.05);
  });

  it('チームリーダー（問い合わせの返事）が、出来の確率で合う返事をする', () => {
    const { s } = uShop();
    s.stock['Sensu:C'] = 50;
    const C = csOf(s);
    // 理解度 3（サポートセンター Lv3）からチームリーダーを置ける
    gainSkill(s, 'cs_center');
    setLevel(s, 'cs_center', 3);
    expect(setLeader(s, 'reply', 10001)).toBeNull();
    expect(runnerOf(s, 'reply')).toBeTruthy();
    C.inbox = inquiriesFor(s, 6, 6);
    const n = C.inbox.length;
    for (let k = 0; k < 10 && C.inbox.length; k++) step(s);
    expect(C.inbox).toHaveLength(0);
    expect(C.month.answered).toBe(n);
    expect(C.month.good).toBeGreaterThan(0);
  });
});

describe('炎上', () => {
  it('予告（炎上のおそれ）→ お詫びの告知で手を打つと、続いても起きない', () => {
    const { s } = uShop();
    const C = csOf(s);
    C.out = FLAME.outDays;
    const r1 = rep();
    csMonth(s, r1);
    expect(r1.cs!.warn).toBe('out');
    expect(C.warn?.cause).toBe('out');
    expect(apologize(s)).toBeNull();
    expect(C.warn?.done).toBe(true);
    C.out = FLAME.outDays;
    const r2 = rep();
    csMonth(s, r2);
    expect(C.flame).toBeNull();
    expect(r2.cs!.ignited).toBeUndefined();
    // 中身を直した（品切れが減った）月は、予告が消える
    C.out = 0;
    csMonth(s, rep());
    expect(C.warn).toBeNull();
  });

  it('放っておくと起きる（来店 −6%・ブランド力 −12・士気 −3）。熱さは 3 か月で下がり、ブランド力も戻る。火消し・合う返事で早くおさまる', () => {
    const { s } = uShop();
    const C = csOf(s);
    s.brand = 200;
    const morale0 = s.staff[0].morale ?? 70;
    for (let k = 0; k < 2; k++) {
      C.inbox = [];
      C.month.expired = FLAME.ignored;
      csMonth(s, rep());
    }
    expect(C.flame?.cause).toBe('ignore');
    expect(s.brand).toBe(200 - FLAME.brand);
    expect(visitMul(s)).toBeCloseTo(1 - FLAME.hit, 6);
    expect(s.staff[0].morale).toBe(morale0 - FLAME.morale);
    expect(C.flames).toBe(1);
    // 火消し：熱さ −40%（15 日に 1 回）
    expect(putOut(s)).toBeNull();
    expect(C.flame!.heat).toBeCloseTo(1 - FLAME.put, 6);
    expect(putOut(s)).toBe('cool');
    // 合う返事 1 件で熱さ −5%
    C.inbox = inquiriesFor(s, 0, 3);
    reply(s, C.inbox[0].id, 'sorry');
    expect(C.flame!.heat).toBeCloseTo(1 - FLAME.put - FLAME.reply, 6);
    // 月の締めごとに 1/3 ずつ下がって、おさまる。ブランド力は戻る
    for (let k = 0; k < 3; k++) csMonth(s, rep());
    expect(C.flame).toBeNull();
    expect(s.brand).toBe(200);
    expect(visitMul(s)).toBe(repeatMul(s));
  });
});

describe('Common の町（問い合わせ・炎上が無い）', () => {
  it('Common の町では数えない・届かない・炎上しない・来店も変わらない。タオックスのチュートリアルも同じ', () => {
    for (const { s, uid } of [uShop(1, 'C')]) {
      expect(csOn(s)).toBe(false);
      const sh = s.shops[uid];
      sh.shelf['Sensu:C'] = 0;
      sh.storage['Sensu:C'] = 0;
      for (let k = 0; k < 10; k++) csDay(s);
      expect(csOf(s).out).toBe(0);
      csOf(s).sat = 0;
      expect(repeatMul(s)).toBe(1);
      const r = rep();
      csOf(s).month.expired = 9;
      csMonth(s, r);
      csMonth(s, rep());
      expect(r.cs).toBeUndefined();
      expect(csOf(s).flame).toBeNull();
      expect(csOf(s).warn).toBeNull();
    }
    const tut = newP1(1);
    for (let k = 0; k < 40; k++) step(tut);
    expect(tut.cs?.inbox.length ?? 0).toBe(0);
    expect(tut.reports.every((r) => !r.cs)).toBe(true);
  });

  it('カスタマーサポートの部門は Uncommon で開く（Common のメニューには出ない）。パネル 4 枚は Uncommon の外周・研究とお金の両方', () => {
    expect(menuDepts(newP1(1))).not.toContain('support');
    expect(menuDepts(newP1(1, 'U', 'u1'))).toContain('support');
    expect(noPol(DEPT_SKILLS.support).map((k) => k.id)).toEqual(CS_SKILLS.map((k) => k.id));
    expect(CS_SKILLS.some((k) => k.cat === 'money') && CS_SKILLS.some((k) => k.cat === 'research')).toBe(true);
    for (const k of [...CS_SKILLS, ...MKT_SKILLS]) {
      expect(k.tier, k.id).toBe('U');
      if (k.cat === 'research') expect(rpCost(k), k.id).toBeGreaterThanOrEqual(60);
    }
    // 理解度：サポートセンター Lv3 で 3（チームリーダー）
    const s = newP1(1, 'U', 'u1');
    gainSkill(s, 'cs_center');
    setLevel(s, 'cs_center', 3);
    expect(deptLevel(s, 'support')).toBe(3);
  });
});

describe('企業の格', () => {
  it('ブランド力のしきい値で段が決まる（無名 → 地元の店 → 地域の有名店 → 全国ブランド → 世界ブランド）。CI で数えるブランド力が上がる', () => {
    const s = newP1(1, 'U', 'u1');
    const at = (b: number) => ((s.brand = b), gradeOf(s));
    // 段 H1（v23）：世界ブランドは 800 → 1,000（Epic の町に出店してから届く）
    expect(GRADE.at).toEqual([0, 100, 250, 450, 1000]);
    expect([at(0), at(99), at(100), at(249), at(250), at(449), at(450), at(999), at(1000), at(1200)]).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    s.brand = 230;
    expect(gradeOf(s)).toBe(1);
    gainSkill(s, 'mk_ci');
    expect(gradeOf(s)).toBe(2);
  });

  it('雇える候補の数が増える（地域の有名店で +1・世界ブランドで +2）。カリスマ度には足さない', () => {
    const s = newP1(1, 'U', 'u1');
    s.brand = 0;
    const n0 = hireSlots(s);
    s.brand = 250;
    expect(gradeHire(s)).toBe(1);
    expect(hireSlots(s)).toBe(n0 + 1);
    s.brand = 1000;
    expect(hireSlots(s)).toBe(n0 + 2);
    CS_OFF.on = true;
    try {
      expect(hireSlots(s)).toBe(n0);
    } finally {
      CS_OFF.on = false;
    }
  });
});

describe('広報と市場の見通し', () => {
  it('実際に起きた良いニュースだけを発表できる（Uncommon から・30 日に 1 回）。プレスリリースで上乗せ', () => {
    const { s } = uShop();
    expect(prLock(s)).toBe('none');
    // 新しいお店を開いたニュース（工事が終わった日に入る）
    const shop = build(s, 'general_store', ...lot(s, 'general_store'));
    if (typeof shop === 'string') throw new Error(shop);
    for (let k = 0; k < 5; k++) step(s);
    expect(newsOf(s).map((x) => x.kind)).toContain('shop');
    const b0 = s.brand ?? 0;
    const g = publish(s);
    expect(g).toBe(PR.gain.shop);
    expect(s.brand).toBe(b0 + PR.gain.shop);
    expect(prGain(s, 'clear')).toBe(PR.gain.clear);
    gainSkill(s, 'mk_press');
    expect(prGain(s, 'clear')).toBe(Math.round(PR.gain.clear * (1 + PR.press)));
    csOf(s).news.push({ kind: 'clear', label: 'test', day: s.day });
    expect(prLock(s)).toBe('cool');
    s.day += PR.cool;
    expect(prLock(s)).toBeNull();
    // Common だけの会社は広報なし
    expect(prLock(newP1(1))).toBe('off');
  });

  it('市場の見通しは、いまの需要の伸びから 1〜3 か月先（パネルで延びる）。新しい乱数は使わない', () => {
    const { s } = uShop();
    expect(horizon(s)).toBe(1);
    const f = forecast(s);
    const row = f.rows.find((r) => r.key === 'Sensu')!;
    expect(row.demand).toHaveLength(2);
    expect(row.demand[1]).toBe(Math.round((s.demand.Sensu ?? 0) * (1 + MARKET_GROWTH)));
    expect(f.rivals).toEqual([]);
    gainSkill(s, 'mk_research');
    gainSkill(s, 'mk_forecast');
    const g = forecast(s);
    expect(g.h).toBe(3);
    expect(g.rows.find((r) => r.key === 'Sensu')!.demand).toHaveLength(4);
    expect(g.rivals.length).toBeGreaterThan(0);
    // 同じ状態からは同じ見通し
    expect(JSON.stringify(forecast(s))).toBe(JSON.stringify(g));
    expect(g.hints.length).toBeGreaterThan(0);
  });
});

describe('セーブ（版 17）', () => {
  it('満足度・受け箱・炎上のおそれ・良いニュースはセーブに残る', () => {
    const { s } = uShop();
    const C = csOf(s);
    C.sat = 77;
    C.inbox = inquiriesFor(s, 4, 0);
    C.warn = { cause: 'out', day: s.day };
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(28);
    expect(satOf(back)).toBe(77);
    expect(back.cs!.inbox).toHaveLength(2);
    expect(back.cs!.warn?.cause).toBe('out');
  });

  it('古いセーブ（版 16）：満足度は 60・受け箱は空・炎上のおそれ無し。企業の格はブランド力から', () => {
    const s = newP1(3, 'U', 'u1');
    s.brand = 300;
    const o = JSON.parse(serializeP1(s));
    o.v = 16;
    delete o.cs;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(satOf(back)).toBe(CS.start);
    expect(csOf(back).inbox).toEqual([]);
    expect(csOf(back).warn).toBeNull();
    expect(gradeOf(back)).toBe(2);
  });
});
