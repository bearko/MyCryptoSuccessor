/**
 * Uncommon の同業他社の強さと巻き返し（発掘 v2 の 8 段目。docs/ISLAND_PHASE1.md「同業他社」の「Uncommon の他社」）。
 * Common の他社の数字は変えない・Uncommon の他社は Common より強い・巻き返し（セール）の始まりと終わり・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { ENTRY_AFTER, MARKET_GROWTH, RIVAL, RIVAL_GROWTH, RIVALS, TIERS, UNCOMMON_RIVAL, rivalsOf, SECTORS } from '../src/island/p1/data';
import { deserializeP1, endMonth, facilityStatus, newP1, rivalBase, rivalBase0, rivalMonthGuess, rivalTune, saleBonus, serializeP1, type P1State } from '../src/island/p1/model';
import { priceMul } from '../src/island/p1/acct';

/** その月の自社の売上を決めて締める（他社の商品の売上は 0。エクステ以外の売上だけ） */
function close(s: P1State, mine: number) {
  s.monthSales = { Sensu: mine };
  s.rivalSales = Object.fromEntries(s.rivals.map((r) => [r.id, 0]));
  return endMonth(s);
}
const top2 = (s: P1State) =>
  s.rivals
    .map((r) => rivalBase(s, r))
    .sort((a, b) => b - a)
    .slice(0, 2);

describe('Common の他社の数字は変えない', () => {
  it('伸び・頭打ち・追随・市場の伸びの数字はそのまま', () => {
    expect(RIVAL_GROWTH).toBe(0.012);
    expect(ENTRY_AFTER).toBe(4);
    expect(MARKET_GROWTH).toBe(0.015);
    expect(RIVAL).toEqual({ pullCap: 1.3, weakShare: 0.15, weakMonths: 3 });
    expect(TIERS.C.rival).toBe(1);
    expect(TIERS.U.rival).toBe(2.2);
  });

  it('タオックス・Common のセクタの他社は、定義 × セクタの rivalMul のまま（Uncommon の倍率は掛からない）', () => {
    const s = newP1(1);
    s.rivals.forEach((r, k) => {
      expect(r.base).toBe(RIVALS[k].base);
      expect(r.sells).toEqual(RIVALS[k].sells);
    });
    for (const d of SECTORS.filter((x) => x.tier === 'C' && x.profile.rivals)) {
      const c = newP1(2, 'C', d.id);
      c.rivals.forEach((r, k) => expect(r.base).toBeCloseTo(rivalsOf(d.id)[k].base * (d.profile.rivalMul ?? 1)));
    }
    expect(rivalTune(s)).toBeNull();
  });

  it('Common の他社のエクステ以外の売上は、毎月 MARKET_GROWTH で伸びる（いままでどおり）', () => {
    const s = newP1(3);
    const b0 = s.rivals.map((r) => r.base);
    close(s, 0);
    s.rivals.forEach((r, k) => expect(r.base).toBeCloseTo(b0[k] * (1 + MARKET_GROWTH)));
  });
});

describe('Uncommon の他社は Common より強い', () => {
  it('エクステ以外の売上 ＝ 定義 × ランクの倍率 × rivalMul × UNCOMMON_RIVAL.base × 町の倍率（売り場の強さはランクの倍率のまま）', () => {
    for (const d of SECTORS.filter((x) => x.tier === 'U')) {
      const s = newP1(4, 'U', d.id);
      expect(rivalTune(s)).toBe(UNCOMMON_RIVAL);
      s.rivals.forEach((r, k) => {
        const def = rivalsOf(d.id)[k];
        expect(r.base).toBeCloseTo(def.base * TIERS.U.rival * (d.profile.rivalMul ?? 1) * UNCOMMON_RIVAL.base * (UNCOMMON_RIVAL.town[d.id] ?? 1));
        expect(r.base).toBeCloseTo(rivalBase0(def, 'U', d.id));
        expect(r.base).toBeGreaterThan(def.base * TIERS.U.rival * (d.profile.rivalMul ?? 1));
        for (const [key, v] of Object.entries(def.sells)) expect(r.sells[key]).toBeCloseTo((v ?? 0) * TIERS.U.rival);
      });
    }
  });

  it('町に入ったときの目標（1 位の他社の月の売上の見込み）も大きくなる', () => {
    const s = newP1(5, 'U', 'u1');
    const weak = newP1(5, 'U', 'u1');
    for (const r of weak.rivals) r.base = rivalsOf('u1').find((x) => x.id === r.id)!.base * TIERS.U.rival;
    const top = Math.max(...Object.values(rivalMonthGuess(s)));
    const before = Math.max(...Object.values(rivalMonthGuess(weak)));
    expect(top).toBeGreaterThan(before * 1.2);
  });

  it('エクステ以外の売上は growth で baseCap 倍まで伸びて止まる（目標が逃げ続けない）', () => {
    const s = newP1(6, 'U', 'u1');
    const cap = s.rivals.map((r) => rivalBase0(rivalsOf('u1').find((x) => x.id === r.id)!, 'U', 'u1') * UNCOMMON_RIVAL.baseCap);
    for (let k = 0; k < 60; k++) close(s, 0);
    s.rivals.forEach((r, k) => expect(r.base).toBeCloseTo(cap[k]));
    close(s, 0);
    s.rivals.forEach((r, k) => expect(r.base).toBeCloseTo(cap[k]));
  });

  it('自社のヒット商品への追随は UNCOMMON_RIVAL.entryAfter か月（Common の ENTRY_AFTER より早い）', () => {
    expect(UNCOMMON_RIVAL.entryAfter).toBeLessThan(ENTRY_AFTER);
    const s = newP1(7, 'U', 'u1');
    // 誰も売っていない商品を、自社だけが売り続ける
    const key = 'Goblet';
    for (const r of s.rivals) delete r.sells[key];
    for (let k = 0; k < UNCOMMON_RIVAL.entryAfter - 1; k++) {
      s.monthSales = { [key]: 1000 };
      endMonth(s);
    }
    expect(s.rivals.some((r) => (r.sells[key] ?? 0) > 0)).toBe(false);
    s.monthSales = { [key]: 1000 };
    const rep = endMonth(s);
    expect(s.rivals.some((r) => (r.sells[key] ?? 0) > 0)).toBe(true);
    expect(rep.news.some((n) => n.includes('|'))).toBe(true);
  });
});

describe('他社の巻き返し（Uncommon のセール）', () => {
  it('1 位の月の締めで 2 位の会社がセールを始め、翌月からその会社の売上が伸びる。月ごとに弱まって戻る', () => {
    const s = newP1(8, 'U', 'u1');
    const [a, b] = top2(s);
    const mine = a * 1.5;
    const rep = close(s, mine);
    expect(rep.rank).toBe(1);
    const second = rep.area.find((x) => !x.me)!;
    expect(rep.comeback?.by).toBe(second.name);
    expect(rep.comeback?.months).toBe(UNCOMMON_RIVAL.sale.months);
    expect(s.comeback?.left).toBe(UNCOMMON_RIVAL.sale.months);
    const rid = s.comeback!.rid;
    // 足す売上：自社の売上 × target − その会社の売上（少なくとも min）
    expect(s.comeback!.bonus).toBe(Math.round(Math.max(second.sales * UNCOMMON_RIVAL.sale.min, mine * UNCOMMON_RIVAL.sale.target - second.sales)));
    expect(second.sales).toBeCloseTo(a > b ? a : b, -1);
    // 翌月：いちばん強い（自社の売上 × target くらい）
    const r = s.rivals.find((x) => x.id === rid)!;
    // 段 F：Uncommon の町は単価が高い（他社の売上も priceMul。セールの足し分には掛けない）
    expect(rivalBase(s, r)).toBeCloseTo(r.base * priceMul(s) + s.comeback!.bonus);
    expect(rivalBase(s, r) + 1).toBeGreaterThan(mine * UNCOMMON_RIVAL.sale.target - 1);
    // ほかの会社は伸びない
    for (const x of s.rivals.filter((y) => y.id !== rid)) expect(saleBonus(s, x.id)).toBe(0);
    // 地図のその会社の店に「セール中！」
    const store = s.buildings.find((x) => x.owner === rid)!;
    expect(facilityStatus(s, store)).toEqual({ level: 'error', stop: 'sale' });
    // 月ごとに弱まる（自社の売上が同じなら、足す売上は残りの月に比例して小さくなる）
    const bonus = [saleBonus(s, rid)];
    for (let k = 1; k < UNCOMMON_RIVAL.sale.months; k++) {
      // セールの会社に抜かれる（1 位でない月は新しいセールは始まらない）
      const rp = close(s, mine);
      expect(rp.rank).toBeGreaterThan(1);
      expect(rp.comeback).toBeUndefined();
      bonus.push(saleBonus(s, rid));
    }
    for (let k = 1; k < bonus.length; k++) expect(bonus[k]).toBeLessThan(bonus[k - 1]);
    // 終わり：売上はもとに戻る（この月は 1 位でない）
    close(s, 0);
    expect(saleBonus(s, rid)).toBe(0);
    expect(facilityStatus(s, store)).toBeNull();
    expect(s.comeback?.left ?? 0).toBe(0);
    // 休み（cool）のあとに 1 位を取り返すと、まだセールをしていないほかの会社が始める
    for (let k = 0; k < UNCOMMON_RIVAL.sale.cool; k++) close(s, 0);
    const again = close(s, mine * 3);
    expect(again.rank).toBe(1);
    expect(again.comeback).toBeTruthy();
    expect(again.comeback!.rid).not.toBe(rid);
    expect(s.comeback!.used).toEqual([rid, again.comeback!.rid]);
    // 1 つの町で max 社まで。そのあとは 1 位を取り返しても始まらない
    expect(UNCOMMON_RIVAL.sale.max).toBe(2);
    for (let k = 0; k < UNCOMMON_RIVAL.sale.months + UNCOMMON_RIVAL.sale.cool; k++) close(s, 0);
    expect(close(s, mine * 10).comeback).toBeUndefined();
  });

  it('セールの会社は、毎月の締めで自社の売上を見て追いかけてくる（自社が伸びれば、足す売上も増える）', () => {
    const s = newP1(15, 'U', 'u1');
    const mine = top2(s)[0] * 1.2;
    close(s, mine);
    const rid = s.comeback!.rid;
    const b0 = s.comeback!.bonus;
    close(s, mine * 2);
    expect(s.comeback!.bonus).toBeGreaterThan(b0);
    expect(saleBonus(s, rid)).toBeCloseTo((s.comeback!.bonus * (UNCOMMON_RIVAL.sale.months - 1)) / UNCOMMON_RIVAL.sale.months);
  });

  it('ポイントカードがあると巻き返しは弱い（自社の売上 × target が 1 に近づく）', () => {
    const a = newP1(16, 'U', 'u1');
    const b = newP1(16, 'U', 'u1');
    b.skills.push('point');
    const mine = top2(a)[0] * 1.5;
    close(a, mine);
    close(b, mine);
    expect(b.comeback!.bonus).toBeLessThan(a.comeback!.bonus);
  });

  it('1 位でない月・Common のセクタでは始まらない', () => {
    const u = newP1(9, 'U', 'u1');
    expect(close(u, 0).comeback).toBeUndefined();
    expect(u.comeback ?? null).toBeNull();
    const c = newP1(9);
    const rep = close(c, 1e7);
    expect(rep.rank).toBe(1);
    expect(rep.comeback).toBeUndefined();
    expect(c.comeback ?? null).toBeNull();
  });

  it('制覇した月とそのあとは始まらない', () => {
    const s = newP1(10, 'U', 'u1');
    s.cleared = true;
    expect(close(s, 1e8).comeback).toBeUndefined();
  });

  it('セールで 1 位を取られることがある（巻き返し）。セールが弱まれば取り返せる', () => {
    const s = newP1(11, 'U', 'u1');
    const [a] = top2(s);
    const mine = a * 1.1;
    expect(close(s, mine).rank).toBe(1);
    expect(s.topStreak).toBe(1);
    // 売上が変わらなければ、翌月はセールの会社に抜かれる
    expect(close(s, mine).rank).toBeGreaterThan(1);
    expect(s.topStreak).toBe(0);
    // 自社の売上を伸ばせば取り返せる
    expect(close(s, mine * 1.4).rank).toBe(1);
  });
});

describe('セーブ（版 9）', () => {
  it('新しいゲームは版 9・巻き返しなし', () => {
    const s = newP1(12, 'U', 'u1');
    expect(s.v).toBe(21);
    expect(s.comeback).toBeNull();
  });

  it('巻き返しの途中のセーブはそのまま戻る', () => {
    const s = newP1(13, 'U', 'u1');
    close(s, top2(s)[0] * 2);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.comeback).toEqual(s.comeback);
  });

  it('版 8 の古いセーブ（巻き返しが無い）は、セールなし（0）で読めて版 9 になる', () => {
    const s = newP1(14, 'U', 'u1');
    const o = JSON.parse(serializeP1(s));
    o.v = 8;
    delete o.comeback;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(21);
    expect(back.comeback).toBeNull();
    expect(back.rivals.every((r) => saleBonus(back, r.id) === 0)).toBe(true);
  });
});
