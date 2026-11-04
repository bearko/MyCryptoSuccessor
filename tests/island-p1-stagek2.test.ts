// 段 K2（docs/ISLAND_PHASE1.md「経営方針（段 K）」の段 K2 の項・docs/SUCCESSOR_ROADMAP.md「段 K2」）：
// 全社方針の枠はランクアップの特別なパネル（無償）で開く・方針の効き目の基本の値 ×1.5・使い切りの手（いまの素材で作る）の 12 か月の長期は 2 か月目から「このまま」と同じ
import { describe, expect, it } from 'vitest';
import { POL, POLICY, POLICY_OF, PRODUCTS, SKILL, sku, type Sku } from '../src/island/p1/data';
import { SLOT_TALK, claimSlot, corpOf, polOf, setCorp, slotGrants, slotLocked, slotNews, slotNextTier, slotPending, slotsOf } from '../src/island/p1/policy';
import { deserializeP1, madeSkus, myShops, newP1, poolCap, serializeP1, type P1State } from '../src/island/p1/model';
import { TALK_MAX, deptTalkNext, freeUi, talkLen } from '../src/island/p1/mine';
import { hasOneShot, lastingPlan, planOf, type Plan } from '../src/island/p1/plan';
import { briefOf } from '../src/island/p1/brief';
import { longLine } from '../src/island/p1/slides';
import { stockDraft } from '../src/island/p1/card';
import type { PropAct } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

/** チュートリアルのあとの Common の町（1 か月目の締めのあと） */
function fresh(): P1State {
  const s = newP1(1);
  s.tut = 99;
  s.reports.push({ month: 1 } as never);
  return s;
}

describe('全社方針の枠：ランクアップの特別なパネル（無償）', () => {
  it('Common のあいだは 1 枠。U・R・E・L に初めて進出するたびに「枠 +1」が 1 枚受け取れる。受け取るまで枠は増えない。5 まで', () => {
    const s = fresh();
    expect(slotsOf(s)).toBe(1);
    expect(slotPending(s)).toBe(0);
    expect(slotNextTier(s)).toBeNull();
    expect(claimSlot(s)).toBeNull();
    // まだ取れない枠は、進出するランクを条件に
    expect(slotLocked(s)).toEqual([
      { n: 2, tier: 'U' },
      { n: 3, tier: 'R' },
      { n: 4, tier: 'E' },
      { n: 5, tier: 'L' },
    ]);
    s.tier = 'U';
    expect(slotGrants(s)).toEqual(['U']);
    expect(slotPending(s)).toBe(1);
    expect(slotNextTier(s)).toBe('U');
    expect(slotsOf(s)).toBe(1);
    const money = s.money;
    const rp = s.rp;
    expect(claimSlot(s)).toBe(2);
    // 無償（お金も RP も 0）
    expect(s.money).toBe(money);
    expect(s.rp).toBe(rp);
    expect(slotPending(s)).toBe(0);
    expect(claimSlot(s)).toBeNull();
    // 2 つ上がってから受け取っても、1 枚ずつ
    s.tier = 'E';
    expect(slotPending(s)).toBe(2);
    expect(slotNextTier(s)).toBe('R');
    expect(claimSlot(s)).toBe(3);
    expect(slotNextTier(s)).toBe('E');
    expect(claimSlot(s)).toBe(4);
    expect(slotLocked(s)).toEqual([{ n: 5, tier: 'L' }]);
    // Legendary の進出で 5 枠目（定義だけ。いまの地図では Legendary の町は雲の下）
    s.tier = 'L';
    expect(claimSlot(s)).toBe(5);
    expect(slotsOf(s)).toBe(POL.max);
    expect(slotPending(s)).toBe(0);
    expect(slotLocked(s)).toEqual([]);
    setCorp(s, ['profit', 'growth', 'brand', 'people', 'customer', 'research'], true);
    expect(corpOf(s).length).toBe(5);
  });
  it('進出は出店したセクタのランクでも数える（いまいる町が下のランクでも）', () => {
    const s = fresh();
    s.land = { mine: ['c1', 'u1'], cur: 'c1', recs: {} } as never;
    expect(slotGrants(s)).toEqual(['U']);
  });
  it('段 K の旧パネル「全社方針の枠」は、版 28 で枠を残してパネルを外す（減らさない）', () => {
    const s = fresh();
    s.tier = 'U';
    s.skills.push('pol_slots');
    s.skillLv = { ...(s.skillLv ?? {}), pol_slots: 3 };
    const o = JSON.parse(serializeP1(s));
    o.v = 27;
    const x = deserializeP1(JSON.stringify(o))!;
    expect(x.v).toBe(28);
    expect(x.skills).not.toContain('pol_slots');
    expect(x.skillLv?.pol_slots).toBeUndefined();
    expect(SKILL.pol_slots).toBeUndefined();
    // Lv3 → 4 枠のまま。U の「枠 +1」は旧パネルの枠に含まれる
    expect(slotsOf(x)).toBe(4);
    expect(slotPending(x)).toBe(0);
    // 旧パネルの枠を超えたぶんから受け取れる
    x.tier = 'E';
    expect(slotPending(x)).toBe(0);
    x.tier = 'L';
    expect(slotPending(x)).toBe(1);
    expect(claimSlot(x)).toBe(5);
    // 旧パネル Lv1 で Rare にいる：2 枠のまま、R の「枠 +1」が受け取れる（新しい道と同じ 3 枠になる）
    const t = fresh();
    t.tier = 'R';
    t.skills.push('pol_slots');
    const o2 = JSON.parse(serializeP1(t));
    o2.v = 27;
    const y = deserializeP1(JSON.stringify(o2))!;
    expect(slotsOf(y)).toBe(2);
    expect(slotPending(y)).toBe(1);
    expect(claimSlot(y)).toBe(3);
    // 受け取った数はセーブに残る
    expect(slotsOf(deserializeP1(serializeP1(y))!)).toBe(3);
  });
  it('マインちゃん：初めて受け取れるようになったときに 1 回（60 字まで）。2 枚目からはトースト（知らせるのは 1 回ずつ）', () => {
    const s = fresh();
    Object.assign(s.flags, { footTalk: true, legalTalk: true, salesTalk: true, budgetTalk: true, acctTalk: true, csTalk: true, polKnowTalk: true });
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBeNull();
    s.tier = 'U';
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: false })).toBe('polSlot');
    // 災害の演出・到着の案内のあいだは待つ
    expect(deptTalkNext(s, { ...freeUi(), disaster: true }, { intro: false, reset: false })).toBeNull();
    expect(deptTalkNext(s, freeUi(), { intro: false, reset: true })).toBeNull();
    for (const x of SLOT_TALK(2)) expect(talkLen(x)).toBeLessThanOrEqual(TALK_MAX);
    expect(SLOT_TALK(2)[0]).toContain('全社方針をもう 1 つ掲げられます');
    s.flags.polSlotTalk = true;
    expect(slotNews(s)).toBe(true);
    expect(slotNews(s)).toBe(false);
    claimSlot(s);
    s.tier = 'R';
    expect(slotNews(s)).toBe(true);
    expect(slotNews(s)).toBe(false);
    claimSlot(s);
    expect(slotNews(s)).toBe(false);
    expect(polOf(s).slots).toBe(2);
  });
});

describe('方針の効き目の基本の値は段 K の 1.5 倍', () => {
  it('表の基本の値（式の部門・部長の倍率はそのまま）', () => {
    const base: Record<string, number[]> = {
      balance: [0.02],
      profit: [0.03],
      growth: [0.02],
      brand: [1],
      people: [2],
      customer: [0.015],
      research: [0.06],
      ambidex: [0.01, 0.03],
      teal: [2],
      oneOnOne: [1.5],
      custSuccess: [0.15],
      insideSales: [0.04],
      compliance: [1],
    };
    for (const [id, vs] of Object.entries(base)) expect(POLICY_OF[id].fx.map((f) => f.v), id).toEqual(vs.map((v) => +(v * 1.5).toFixed(6)));
    expect(POL.lv).toBe(0.02);
    expect(POL.head).toBe(0.35);
  });
});

// ---------------------------------------------------------------- 使い切りの手の長期

/** タオックスの 2 か月目以降（お店と工房がある）の写し */
let save: string | null = null;
function town(): P1State {
  if (!save)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 2 && myShops(s).length && s.slots.some((x) => x.sku && x.worker != null)) save = serializeP1(s);
      },
    });
  const s = deserializeP1(save!)!;
  s.tut = 99;
  s.money = 500_000;
  for (const k of Object.keys(s.ads)) s.ads[k] = 0;
  return s;
}

describe('使い切りの手（いまの素材で作る）の 12 か月の長期', () => {
  it('素材で埋まった倉庫の提案：「いまの素材で作る」の長期は大きなマイナスにならない（段 UI7e：作業台は作り終えるまでの日数だけ・倉庫が空く分も）。折れ線の最後は長期の指標', () => {
    const s = town();
    for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
    for (const x of Object.keys(s.stock)) s.stock[x as Sku] = 0;
    s.orders = [];
    s.buyTrip = null;
    // 作っていない商品の素材で倉庫を埋める
    const made = madeSkus(s);
    const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
      .map((p) => sku(p.key, 'C'))
      .find((y) => !made.includes(y))!;
    const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
    const per = Object.values(r).reduce<number>((a, q) => a + (q ?? 0), 0);
    for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = Math.ceil(((q ?? 0) / per) * poolCap(s));
    const d = stockDraft(s)!;
    expect(d).toBeTruthy();
    const ch = d.choices.find((c) => c.act.k === 'do' && c.act.a.k === 'useup');
    expect(ch).toBeTruthy();
    const act = (ch!.act as { a: PropAct }).a;
    const plan = planOf(s, [act], { hero: d.hero, q: 0.9, dept: 'logistics' });
    expect(hasOneShot(plan)).toBe(true);
    expect(lastingPlan(plan)).toBeNull();
    const B = briefOf(s, plan);
    const S = B.vals.list.find((m) => m.key === 'short')!;
    const L = B.vals.list.find((m) => m.key === 'long')!;
    expect(B.vals.shot).toBe(true);
    // 段 UI7e：月ごとの見込み。作業台は作り終えるまでの日数だけ、その品を作る（そのあとは元の商品）。倉庫があふれて止まっていた調達が戻る分も入る
    expect(B.vals.months?.use?.days).toBeGreaterThan(0);
    expect(L.d).toBeGreaterThan(-Math.max(1, Math.abs(S.d)) * 2);
    expect(L.why).toContain('1 回きり');
    // スライド ④ の折れ線：最初の点は短期、最後の点は長期の指標
    const line = longLine(B);
    expect(line.now[0]).toBeCloseTo(S.now, 3);
    expect(line.after[0]).toBeCloseTo(S.after, 3);
    expect(line.now[POLICY.months - 1]).toBeCloseTo(L.now, 3);
    expect(line.after[POLICY.months - 1]).toBeCloseTo(L.after, 3);
  });
  it('使い切りの手とほかの手を束ねた提案は、使い切りの手だけを外して 2 か月目から数える', () => {
    const s = town();
    const k = s.slots.findIndex((y) => y.worker != null);
    const x = madeSkus(s)[0];
    const [key, rar] = x.split(':') as [string, 'C'];
    const p: Plan = planOf(s, [{ k: 'useup', slot: k, key, rar }, { k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'logistics' });
    expect(hasOneShot(p)).toBe(true);
    const rest = lastingPlan(p)!;
    expect(rest.steps.some((y) => y.k === 'useup')).toBe(false);
    expect(rest.steps.length).toBe(p.steps.length - 1);
    expect(rest.of?.length).toBe(rest.steps.length);
    // 使い切りの手の無い提案は、そのまま
    const q = planOf(s, [{ k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'marketing' });
    expect(hasOneShot(q)).toBe(false);
    expect(briefOf(s, q).vals.shot).toBeUndefined();
  });
});
