/**
 * 段 F（docs/ISLAND_PHASE1.md「経理」「総務」。数字は data.ts の TAX・FATIGUE、計算は acct.ts・ga.ts）：
 * Common に税が無い・Uncommon から四半期ごと・節税の差し引き（上限）・単価の整え（節税なしで時間が変わらない目安）・
 * 助言の文が実際の数字から出る・疲れと職場の環境・古いセーブ。
 */
import { describe, expect, it } from 'vitest';
import { ACCT_MONEY, ACCT_SKILLS, DEPT_SKILLS, P1B, FATIGUE, GA_MONEY, GA_SKILLS, PRODUCT, SKILL, TAX, rpCost, sku } from '../src/island/p1/data';
import { emptyLedger, pl, quarters } from '../src/island/p1/company';
import { ACCT_OFF, acctAdvice, acctReset, closeQuarter, costRank, taxLine, dedCap, dedRate, monthBase, priceMul, quarterNow, taxHint, taxOn, taxPlan, taxRate, topTier } from '../src/island/p1/acct';
import { envItems, fatigueLoad, fatigueMorale, fatigueMul, fatigueOf, gaOn } from '../src/island/p1/ga';
import { moraleParts } from '../src/island/p1/hr';
import { deptLevel, menuDepts } from '../src/island/p1/dept';
import { build, closeCompanyMonth, deserializeP1, donate, gainSkill, invest, learn, setLevel, myWorkshop, newP1, priceOf, rivalBase, serializeP1, speed, type P1State } from '../src/island/p1/model';
import { runOnce, totalSec, withoutAcct } from '../scripts/island/sim';

/** Uncommon の町（ウメコタウン）。資金たっぷり */
function uTown(seed = 1): P1State {
  const s = newP1(seed, 'U', 'u1');
  s.tut = 99;
  s.money = 1e8;
  return s;
}
/** 会社の月を 1 つ締める（今月の帳簿に売上と費用を入れてから） */
function closeMonth(s: P1State, sales: number, cost = 0) {
  s.books!.cur.sales += sales;
  s.books!.cur.mats += cost;
  s.day = (Math.floor(s.day / 30) + 1) * 30;
  return closeCompanyMonth(s);
}

describe('税（四半期ごと・Uncommon から）', () => {
  it('Common の町とタオックスのチュートリアルには税が無い（税率 0・単価の倍率 1・税の記録なし）', () => {
    for (const s of [newP1(1), newP1(2, 'C', 'c3')]) {
      expect(topTier(s)).toBe('C');
      expect(taxOn(s)).toBe(false);
      expect(taxRate(s)).toBe(0);
      expect(priceMul(s)).toBe(1);
      for (let k = 0; k < 3; k++) {
        const c = closeMonth(s, 500000, 100000);
        expect(c.tax).toBeUndefined();
      }
      expect(s.acct!.paid).toBe(0);
      expect(s.books!.months.every((x) => !x.l.tax)).toBe(true);
    }
  });

  it('Uncommon の会社は、会社の月 3 つ（四半期）の締めに、利益 × 税率を払う。途中の月は払わない。決算書の P/L に法人税の行', () => {
    const s = uTown();
    expect(taxRate(s)).toBe(TAX.rate.U);
    const m0 = s.money;
    const a = closeMonth(s, 300000, 100000);
    const b = closeMonth(s, 300000, 100000);
    expect([a.quarter, a.tax, b.quarter, b.tax]).toEqual([null, undefined, null, undefined]);
    expect(s.money).toBe(m0);
    const c = closeMonth(s, 300000, 100000);
    expect(c.quarter).toBe(1);
    // 利益 3 か月 × 200,000（節税の支出なし）× 20%
    expect(c.tax).toMatchObject({ q: 1, rate: 0.2, base: 600000, ded: 0, taxable: 600000, tax: 120000, paid: 120000, saved: 0 });
    expect(s.money).toBe(m0 - 120000);
    expect(s.books!.months[2].l.tax).toBe(120000);
    const q1 = quarters(s.books!).find((x) => x.q === 1)!;
    expect(q1.done).toBe(true);
    expect(pl(q1.l).tax).toBe(120000);
    expect(pl(q1.l).net).toBe(600000 - 120000);
    // 次の四半期は 0 から
    expect(s.acct!.cur.base).toBe(0);
    // 税率は会社の格：Rare 25%・Epic 30%
    const r = newP1(1, 'R', 'r1');
    expect(taxRate(r)).toBe(TAX.rate.R);
    expect([TAX.rate.U, TAX.rate.R, TAX.rate.E]).toEqual([0.2, 0.25, 0.3]);
  });

  it('Common の町の利益は課税しない（Uncommon の会社でも、いまの町が Common の月は 0）。赤字の四半期は 0（繰越の損失のパネルで次へ）', () => {
    const l = emptyLedger();
    l.sales = 100000;
    expect(monthBase({ tier: 'C' }, l)).toBe(0);
    expect(monthBase({ tier: 'U' }, l)).toBe(100000);
    // ほかの Uncommon の町（セクター長）から回った利益は課税の対象
    expect(monthBase({ tier: 'C' }, l, 5000)).toBe(5000);
    // 赤字 → 次の黒字（パネルなし／あり）
    const run = (carry: boolean) => {
      const x = uTown();
      if (carry) gainSkill(x, 'ac_carry');
      x.acct = { cur: { base: -200000, capex: 0, rnd: 0, env: 0, months: 3 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
      const a = closeQuarter(x, 1, emptyLedger())!;
      x.acct.cur = { base: 300000, capex: 0, rnd: 0, env: 0, months: 3 };
      const b = closeQuarter(x, 2, emptyLedger())!;
      return [a.tax, b.tax, b.carry];
    };
    expect(run(false)).toEqual([0, 60000, 0]);
    expect(run(true)).toEqual([0, 20000, 200000]);
  });

  it('資金が足りないときは、資金が TAX.keep（30,000 G）を切らないだけ払い、残りは次の四半期に', () => {
    const s = uTown();
    s.money = 80000;
    s.acct = { cur: { base: 500000, capex: 0, rnd: 0, env: 0, months: 3 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
    const a = closeQuarter(s, 1, emptyLedger())!;
    expect([a.tax, a.paid, s.money, s.acct.owed]).toEqual([100000, 50000, TAX.keep, 50000]);
    s.money = 1e6;
    s.acct.cur = { base: 0, capex: 0, rnd: 0, env: 0, months: 3 };
    const b = closeQuarter(s, 2, emptyLedger())!;
    expect([b.paid, s.acct.owed]).toEqual([50000, 0]);
  });

  it('ランクアップの災害（所持金の全額の徴収）：その四半期のここまでの税と、払いきれていない税は帳消し。徴収と支度金は課税の対象に入れない', () => {
    const s = uTown();
    s.acct = { cur: { base: 4000000, capex: 10000, rnd: 0, env: 0, months: 2 }, hist: [], paid: 9, saved: 1, carry: [], owed: 70000 };
    s.books!.cur.sales = 300000;
    acctReset(s);
    // 災害の前のこの月の利益（300,000）は、月の締めで引く
    expect(s.acct.cur).toEqual({ base: 0, capex: 0, rnd: 0, env: 0, months: 2, skip: 300000 });
    expect([s.acct.owed, s.acct.paid, s.acct.saved]).toEqual([0, 9, 1]);
    const l = emptyLedger();
    Object.assign(l, { sales: 100000, levy: 5000000, grant: 60000 });
    expect(monthBase({ tier: 'R' }, l)).toBe(100000);
  });
});

describe('節税（税の計算の前に差し引く）', () => {
  it('設備投資 30%・研究開発 50%・総務の環境 50% を差し引く。上限は利益の 50%（税理士の顧問で 60%）。減らした税を記録する', () => {
    const s = uTown();
    expect([dedRate(s, 'capex'), dedRate(s, 'rnd'), dedRate(s, 'env'), dedCap(s)]).toEqual([0.3, 0.5, 0.5, 0.5]);
    s.acct = { cur: { base: 1000000, capex: 400000, rnd: 100000, env: 40000, months: 3 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
    const r = closeQuarter(s, 1, emptyLedger())!;
    // 120,000 + 50,000 + 20,000 = 190,000 を差し引く
    expect([r.ded, r.taxable, r.tax, r.saved]).toEqual([190000, 810000, 162000, 38000]);
    // 上限：利益の 50% まで
    s.acct.cur = { base: 1000000, capex: 5000000, rnd: 0, env: 0, months: 3 };
    const c = closeQuarter(s, 2, emptyLedger())!;
    expect([c.cap, c.ded, c.tax, c.saved]).toEqual([500000, 500000, 100000, 100000]);
    gainSkill(s, 'ac_advisor');
    expect(dedCap(s)).toBeCloseTo(0.6, 6);
    gainSkill(s, 'ac_rnd');
    expect(dedRate(s, 'rnd')).toBe(TAX.rnd);
    gainSkill(s, 'ac_deprec');
    expect(dedRate(s, 'capex')).toBeCloseTo(0.36, 6);
    setLevel(s, 'ac_deprec', 2);
    expect(dedRate(s, 'capex')).toBeCloseTo(0.3 + 0.06 * 1.25, 6);
    expect(s.acct.saved).toBe(138000);
  });

  it('建てる・設備・お金パネル・寄付・発掘許可・商品開発の支出が、区分ごとに四半期の記録に入る（総務のパネルと職人の休憩所は総務の環境）', () => {
    const s = uTown();
    s.acct = undefined;
    const ws = myWorkshop(s) ?? (() => {
      for (let j = 0; j < s.n; j++)
        for (let i = 0; i < s.n; i++)
          for (const d of ['rd', 'ld', 'lu', 'ru'] as const) {
            const b = build(s, 'workshop', i, j, d);
            if (typeof b !== 'string') return b;
          }
      throw new Error('no lot');
    })();
    ws.left = 0;
    expect(invest(s, ws.uid, 'tools')).toBeNull();
    expect(invest(s, ws.uid, 'breakroom')).toBeNull();
    // お金パネル：総務（社員食堂）は総務の環境、ほか（治具）は設備投資。研究パネル（RP）は G を払わないので入らない
    s.flags.rings = ['U'];
    gainSkill(s, 'welfare');
    expect(learn(s, 'ga_canteen')).toBeNull();
    expect(learn(s, 'jig')).toBeNull();
    const q = s.acct!.cur;
    expect(q.env).toBe(SKILL.ga_canteen.cost + 2500);
    expect(q.capex).toBe(3000 + SKILL.jig.cost + (P1B.workshop.cost ?? 0));
    // 研究への寄付（開いていれば）：研究開発
    const before = q.rnd;
    s.cleared = true;
    const d = donate(s);
    if (typeof d !== 'string') expect(s.acct!.cur.rnd).toBe(before + d.cost);
  });

  it('「この四半期にあと ○○ G 投資すると、税が △△ G 減る」：上限までの残りを、設備投資と研究開発の G で。決算の 1 か月前に 1 回知らせる', () => {
    const s = uTown();
    s.day = 30;
    s.acct = { cur: { base: 800000, capex: 100000, rnd: 0, env: 0, months: 1 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
    const p = taxPlan(s);
    expect(p.base).toBe(800000);
    expect(p.cap).toBe(400000);
    expect(p.room).toBe(400000 - 30000);
    expect(p.needCapex).toBe(Math.round(370000 / 0.3));
    expect(p.needRnd).toBe(740000);
    expect(p.save).toBe(74000);
    // 四半期の 2 か月目（会社の月 2）：まだ知らせない。3 か月目に入った締めのあと（会社の月 3）に 1 回
    s.day = 31;
    expect(quarterNow(s)).toMatchObject({ m: 2, inQ: 2, q: 1 });
    expect(taxHint(s)).toBeNull();
    s.day = 60;
    expect(quarterNow(s).inQ).toBe(3);
    const hint = taxHint(s)!;
    expect(hint).toContain('1,233,333 G');
    expect(hint).toContain('74,000 G');
    expect(taxHint(s)).toBeNull();
  });
});

describe('単価の整え（税のぶん売上の側も）', () => {
  it('Uncommon からの町は単価が高い（自社の値段・他社の売上とも ×TAX.price）。Common はそのまま', () => {
    const x = sku('Sensu', 'U');
    const u = uTown();
    const c = newP1(1);
    expect(priceOf(u, x)).toBe(Math.round(PRODUCT.Sensu.price * 2.5 * TAX.price.U));
    expect(priceOf(c, x)).toBe(Math.round(PRODUCT.Sensu.price * 2.5));
    expect(rivalBase(u, u.rivals[0])).toBeCloseTo(u.rivals[0].base * TAX.price.U, 6);
    expect(TAX.price.U).toBeGreaterThan(1);
    expect(TAX.price.R).toBeGreaterThan(TAX.price.U);
    // 段 F を止めると、単価・税・疲れは段 F の前と同じ
    ACCT_OFF.on = true;
    try {
      expect(priceOf(u, x)).toBe(Math.round(PRODUCT.Sensu.price * 2.5));
      expect(taxRate(u)).toBe(0);
      expect(gaOn(u)).toBe(false);
    } finally {
      ACCT_OFF.on = false;
    }
  });

  it(
    '節税を気にしない最短の方針で、合計の時間が段 F の前と ±5% の中（3 シードの平均）。税は払っている',
    () => {
      const on = [1, 2, 3].map((seed) => runOnce('rta', seed));
      const off = [1, 2, 3].map((seed) => withoutAcct(() => runOnce('rta', seed)));
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const a = mean(on.map(totalSec));
      const b = mean(off.map(totalSec));
      expect(on.every((r) => r.done)).toBe(true);
      expect(Math.abs(a / b - 1)).toBeLessThan(0.05);
      expect(Math.min(...on.map((r) => r.v20.paid))).toBeGreaterThan(0);
      expect(off.every((r) => r.v20.paid === 0)).toBe(true);
    },
    300_000,
  );
});

describe('見える化（コストの大きい順・経理からの助言）', () => {
  it('コストの大きい順は、帳簿の数字の大きい順（維持費は建物の種類ごとに分ける）。助言はいちばん重いコストの割合・前の四半期からの増え・節税の文', () => {
    const s = uTown();
    const l = emptyLedger();
    Object.assign(l, { sales: 1000000, mats: 300000, wages: 120000, upkeep: 180000, ads: 10000, part: 5000 });
    const rank = costRank(s, l);
    expect(rank.map((r) => r.v)).toEqual([...rank.map((r) => r.v)].sort((a, b) => b - a));
    expect(rank[0]).toMatchObject({ key: 'mats', v: 300000, share: 0.3 });
    expect(rank.filter((r) => r.key.startsWith('up') || r.key === 'upkeep').reduce((a, r) => a + r.v, 0)).toBeCloseTo(180000, -1);
    const prev = emptyLedger();
    Object.assign(prev, { sales: 950000, mats: 290000, wages: 100000, upkeep: 180000, ads: 10000, part: 5000 });
    const adv = acctAdvice(s, l, prev);
    expect(adv.length).toBeGreaterThanOrEqual(2);
    expect(adv.length).toBeLessThanOrEqual(3);
    expect(adv[0]).toContain('30%');
    // 給料 100,000 → 120,000 は +20%（売上は +5%）
    expect(adv[1]).toContain('20%');
    expect(adv[1]).toContain('+5%');
    // 節税の文（このいまの四半期の見込みから）
    s.acct = { cur: { base: 900000, capex: 0, rnd: 0, env: 0, months: 2 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
    expect(acctAdvice(s, l, prev)[2]).toContain(`${(1500000).toLocaleString('en-US')} G`);
    // Common の会社：Uncommon から税がかかる
    expect(acctAdvice(newP1(1), l, null).join(' ')).toContain('20%');
  });

  it('法人税はコストの並びに入れず（売上と比べない）、別の行で「課税される利益の ○%」。助言も法人税を売上と比べない', () => {
    const s = uTown();
    const l = emptyLedger();
    // ほかの町から回った利益のぶんも入って、法人税がいまの町の売上の 27% になる四半期
    Object.assign(l, { sales: 1000000, mats: 200000, wages: 120000, upkeep: 100000, ads: 10000, part: 5000, tax: 270000 });
    const rank = costRank(s, l);
    expect(rank.some((r) => r.key === 'tax')).toBe(false);
    expect(rank[0].key).toBe('mats');
    expect(acctAdvice(s, l, null)[0]).toContain('20%');
    expect(acctAdvice(s, l, null).join(' ')).not.toContain('法人税');
    // 締めた四半期：記録の税率と課税される利益
    s.acct = { cur: { base: 0, capex: 0, rnd: 0, env: 0, months: 0 }, hist: [{ q: 4, rate: 0.2, tier: 'U', base: 1500000, carry: 0, capex: 0, rnd: 0, env: 0, ded: 150000, cap: 750000, taxable: 1350000, tax: 270000, saved: 30000, paid: 270000 }], paid: 270000, saved: 30000, carry: [], owed: 0 };
    expect(taxLine(s, l, 4)).toEqual({ v: 270000, rate: 0.2, taxable: 1350000 });
    // 途中の四半期：いまの税率
    expect(taxLine(s, l, 5)).toEqual({ v: 270000, rate: taxRate(s), taxable: null });
    expect(taxLine(s, emptyLedger(), 4)).toBeNull();
  });
});

describe('疲れと職場の環境（総務）', () => {
  it('疲れ ＝ 1 − スタミナ ÷ HP。Uncommon から、60% を超えると働きの速さと士気の目標が下がる（Common は効かない）。ストレスチェックで半分', () => {
    const u = uTown();
    const c = newP1(1);
    const st = u.staff[0];
    st.stamina = st.stats.hp;
    expect(fatigueOf(st)).toBe(0);
    const v0 = speed(st, 'craft', u);
    st.stamina = st.stats.hp * (1 - FATIGUE.to);
    expect(fatigueOf(st)).toBeCloseTo(FATIGUE.to, 6);
    expect(fatigueLoad(u, st)).toBeCloseTo(1, 6);
    expect(fatigueMul(u, st)).toBeCloseTo(1 - FATIGUE.work, 6);
    expect(speed(st, 'craft', u) / v0).toBeCloseTo(1 - FATIGUE.work, 6);
    expect(fatigueMorale(u, st)).toBeCloseTo(-FATIGUE.morale, 6);
    expect(moraleParts(u, st).tired).toBeCloseTo(-FATIGUE.morale, 6);
    // 60% ちょうどまでは響かない
    st.stamina = st.stats.hp * (1 - FATIGUE.from);
    expect(fatigueMul(u, st)).toBeCloseTo(1, 6);
    // Common は効かない（Uncommon に出店するまで）
    const cs = c.staff[0];
    cs.stamina = cs.stats.hp * 0.1;
    expect([gaOn(c), fatigueMul(c, cs), moraleParts(c, cs).tired]).toEqual([false, 1, -0]);
    // ストレスチェック
    st.stamina = st.stats.hp * (1 - FATIGUE.to);
    gainSkill(u, 'ga_check');
    expect(fatigueMul(u, st)).toBeCloseTo(1 - FATIGUE.work * FATIGUE.check, 6);
  });

  it('職場の環境：総務のパネルは 12 枚（いまの 9 枚＋段 F の 3 枚）。取った枚数が士気の目標の「職場の環境」に入り、社員食堂・仮眠室はスタミナの戻りと減りに効く', () => {
    expect(DEPT_SKILLS.general).toHaveLength(12);
    expect(GA_SKILLS.map((k) => [k.id, k.cat, k.tier])).toEqual([
      ['ga_canteen', 'money', 'U'],
      ['ga_nap', 'money', 'U'],
      ['ga_check', 'research', 'U'],
    ]);
    const s = uTown();
    const st = s.staff[0];
    const env0 = moraleParts(s, st).env;
    gainSkill(s, 'ga_canteen');
    expect(moraleParts(s, st).env).toBe(env0 + 2);
    const items = envItems(s);
    expect(items.find((x) => x.id === 'ga_canteen')!.on).toBe(true);
    expect(items.some((x) => x.id === '@breakroom')).toBe(true);
    expect(deptLevel(s, 'general')).toBe(1);
  });

  it('経理のパネル 6 枚（研究 3・お金 3）・総務のお金パネル 2 枚は Uncommon の外周。研究パネルの RP は決め打ち（ほかの値段を動かさない）。メニューは Uncommon から', () => {
    expect(ACCT_SKILLS).toHaveLength(6);
    expect(ACCT_SKILLS.filter((k) => k.cat === 'research').map((k) => k.id)).toEqual(['ac_advisor', 'ac_rnd', 'ac_carry']);
    expect(ACCT_MONEY).toEqual(['ac_deprec', 'ac_cost', 'ac_upkeep']);
    expect(GA_MONEY).toEqual(['ga_canteen', 'ga_nap']);
    for (const k of [...ACCT_SKILLS, ...GA_SKILLS]) {
      expect(k.tier, k.id).toBe('U');
      expect(k.note.length, k.id).toBeGreaterThan(5);
    }
    expect([rpCost(SKILL.ac_advisor), rpCost(SKILL.ac_rnd), rpCost(SKILL.ac_carry), rpCost(SKILL.ga_check)]).toEqual([90, 140, 170, 120]);
    expect(menuDepts(newP1(1))).not.toContain('accounting');
    expect(menuDepts(uTown())).toEqual(expect.arrayContaining(['accounting', 'general']));
  });
});

describe('セーブ（版 16）', () => {
  it('新しいゲームは版 16。税の記録はセーブに残る', () => {
    const s = uTown();
    expect(s.v).toBe(19);
    closeMonth(s, 300000);
    closeMonth(s, 300000);
    closeMonth(s, 300000);
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(19);
    expect(back.acct!.paid).toBe(s.acct!.paid);
    expect(back.acct!.hist).toHaveLength(1);
  });

  it('古いセーブ（版 15）：税の記録は 0 から。四半期は次の区切り（会社の月が 3 の倍数）から', () => {
    const s = uTown();
    s.day = 120;
    const o = JSON.parse(serializeP1(s));
    o.v = 15;
    delete o.acct;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(19);
    expect(back.acct).toBeUndefined();
    // 会社の月 5（day 150）：途中の月。6（day 180）：四半期の締め
    const a = closeMonth(back, 300000);
    expect([a.m, a.tax]).toEqual([5, undefined]);
    const b = closeMonth(back, 300000);
    expect(b.m).toBe(6);
    expect(b.tax).toMatchObject({ q: 2, base: 600000, tax: 120000 });
  });
});
