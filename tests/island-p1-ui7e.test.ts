// 段 UI7e（docs/ISLAND_PHASE1.md「使い切りの手の見積もり（段 UI7e）」）：
// 「いまの素材で作る」は作り終えるまでの日数だけその品を作る・作った品が売れる分・倉庫があふれて止まっていた調達が戻る分を見積もりに入れる。
// ヒーローの要約の一言の向き（勧める）と推奨（見送る）を食い違わせない
import { describe, expect, it } from 'vitest';
import { ADS, POLICIES, PRODUCTS, SKILL, sku, type Sku } from '../src/island/p1/data';
import { batchOf, deserializeP1, lotsHave, madeSkus, myShops, poolCap, serializeP1, step, type P1State } from '../src/island/p1/model';
import { applyPlan, baseOf, planOf, type Plan } from '../src/island/p1/plan';
import { actNoun, briefOf, type Brief } from '../src/island/p1/brief';
import { longLine, projLines } from '../src/island/p1/slides';
import { enqueue, newCards, sayOf, shownRec, stockDraft, storeAct, type Card } from '../src/island/p1/card';
import { jammed } from '../src/island/p1/proj';
import { setPolicy } from '../src/island/p1/policy';
import { EVENT_OFF } from '../src/island/p1/events';
import type { PropAct } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

let save: string | null = null;
/** 最初の町（自動プレイの 2 か月目。お店があり、作業台が動いている） */
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
/** 作っていない商品の素材で倉庫を埋めた町（作り続ける商品の素材は 0：倉庫があふれて入荷が止まる） */
function fullOfMats(): { s: P1State; x: Sku } {
  const s0 = town();
  for (const m of Object.keys(s0.mats)) s0.mats[m as keyof typeof s0.mats] = 0;
  for (const x of Object.keys(s0.stock)) s0.stock[x as Sku] = 0;
  s0.orders = [];
  s0.buyTrip = null;
  const made = madeSkus(s0);
  // 作り続ける商品が 1 ロットも作れない素材（作り続ける商品の素材と重ならないもの）で埋める
  for (const x of PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C').map((p) => sku(p.key, 'C'))) {
    if (made.includes(x)) continue;
    const s = structuredClone(s0);
    const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
    const per = Object.values(r).reduce<number>((a, q) => a + (q ?? 0), 0);
    for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = Math.ceil(((q ?? 0) / per) * poolCap(s));
    if (jammed(baseOf(s))) return { s, x };
  }
  throw new Error('no product to fill with');
}
const metric = (B: Brief, k: 'short' | 'long') => B.vals.list.find((m) => m.key === k)!;
/** 自動で days 日進めたときの資金の増え */
function gain(s: P1State, p: Plan | null, days: number): number {
  const c = structuredClone(s);
  if (p) applyPlan(c, p);
  const m0 = c.money;
  for (let k = 0; k < days; k++) step(c);
  return c.money - m0;
}

describe('いまの素材で作る：見積もりが実際の動きに近い', () => {
  it('素材で埋まった倉庫：このままでは入荷が止まり、承認後は戻る。短期の符号は、自動で 1 か月進めたときの実際の差と合う。長期はプラス', () => {
    EVENT_OFF.on = true;
    try {
      const { s } = fullOfMats();
      expect(jammed(baseOf(s))).toBe(true);
      const d = stockDraft(s)!;
      const ch = d.choices.find((c) => c.act.k === 'do' && c.act.a.k === 'useup')!;
      expect(ch).toBeTruthy();
      const plan = planOf(s, [(ch.act as { a: PropAct }).a], { hero: d.hero, q: 0.9, dept: 'logistics' });
      const B = briefOf(s, plan);
      const S = metric(B, 'short');
      const L = metric(B, 'long');
      const M = B.vals.months!;
      expect(M.jam0).toBe(true);
      expect(M.jam1).toBe(false);
      expect(M.room).toBeGreaterThan(0);
      // 作業台は作り終えるまでの日数だけ（長ければ 2 か月目にかかる）。その日数ぶんで、作る数がそろう
      expect(M.use!.days).toBeGreaterThan(0);
      // 作った品の売れる数は、作った数を超えない。売上は数 × 値段
      const sold = M.use!.sold.reduce((a, n) => a + n, 0);
      expect(sold).toBeLessThanOrEqual(M.use!.units + 1e-6);
      expect(M.use!.yen).toBeCloseTo(sold * M.use!.price, 3);
      // 短期の符号：自動で 1 か月（30 日）進めたときの資金の差
      const real = gain(s, plan, 30) - gain(s, null, 30);
      if (Math.abs(real) > 500 && Math.abs(S.d) > 500) expect(Math.sign(S.d)).toBe(Math.sign(real));
      // 長期：倉庫が空いて調達と製造が戻るので、プラス（実際に 6 か月進めても承認したほうが多い）
      expect(L.d).toBeGreaterThan(0);
      expect(gain(s, plan, 180) - gain(s, null, 180)).toBeGreaterThan(0);
      // 推奨は承認・要約の一言は勧める
      expect(B.rec).toBe('ok');
      expect(B.pitch).not.toContain('見送');
      // スライド：折れ線の最後は長期の指標・説明の行（作る品・倉庫）
      const line = longLine(B);
      expect(line.now[line.now.length - 1]).toBeCloseTo(L.now, 3);
      expect(line.after[line.after.length - 1]).toBeCloseTo(L.after, 3);
      const lines = projLines(B, (y) => y, (u) => `${u}`);
      expect(lines.some((x) => x.startsWith('🧪'))).toBe(true);
      expect(lines.some((x) => x.includes('As-Is'))).toBe(true);
    } finally {
      EVENT_OFF.on = false;
    }
  });
  it('倉庫の強化（建てる）も、倉庫があふれた町では調達が戻る分を見込む（長期がプラス）', () => {
    const { s } = fullOfMats();
    const d = stockDraft(s)!;
    const fix = d.choices.find((c) => c.act.k === 'do' && storeAct(c.act.a))!;
    expect(fix).toBeTruthy();
    const B = briefOf(s, planOf(s, [(fix.act as { a: PropAct }).a], { hero: d.hero, q: 0.9, dept: 'logistics' }));
    expect(B.vals.months?.jam0).toBe(true);
    expect(B.vals.months?.jam1).toBe(false);
    expect(metric(B, 'long').d).toBeGreaterThan(0);
  });
  it('倉庫があふれていない町の使い切りの手：作り終えるまでの日数だけ数え、2 か月目からは元の商品', () => {
    const s = town();
    expect(jammed(baseOf(s))).toBe(false);
    const k = s.slots.findIndex((y) => y.worker != null);
    const made = madeSkus(s);
    const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
      .map((p) => sku(p.key, 'C'))
      .find((y) => !made.includes(y))!;
    const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
    for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = (s.mats[m as keyof typeof s.mats] ?? 0) + (q ?? 0) * 2;
    const [key, rar] = x.split(':') as [string, 'C'];
    const B = briefOf(s, planOf(s, [{ k: 'useup', slot: k, key, rar }], { hero: null, q: 0.9, dept: 'logistics' }));
    const M = B.vals.months!;
    expect(M.jam0).toBe(false);
    expect(M.use!.lots).toBe(lotsHave(s, x));
    expect(M.use!.units).toBe(lotsHave(s, x) * batchOf(x, s));
    // 作業台が埋まるのは来月の一部だけ（1 か月まるごとではない）
    expect(M.use!.days).toBeLessThan(30);
    // 長期 ＝ 月ごとの合計
    const L = metric(B, 'long');
    expect(L.after).toBeCloseTo(M.after.reduce((a, v) => a + v, 0), 3);
    expect(L.now).toBeCloseTo(M.now.reduce((a, v) => a + v, 0), 3);
  });
});

describe('要約の一言の向きと推奨をそろえる（シゴデキの原則）', () => {
  /** 一言の向き：見送る（「見送」・ほかの手を推す「より、」）か、勧めるか */
  const says = (p: string): 'ok' | 'skip' => (p.includes('見送') || p.includes('より、') || p.includes('やめとこう') || p.includes('割に合いません') ? 'skip' : 'ok');
  it('すべての提案の種類・すべての経営方針で、要約の一言の向きと推奨が食い違う提案書が 0', () => {
    const s0 = town();
    const shop = myShops(s0)[0].uid;
    const k = s0.slots.findIndex((y) => y.worker != null);
    const x = madeSkus(s0)[0];
    const [key, rar] = x.split(':') as [string, 'C'];
    const acts: PropAct[] = [
      ...ADS.map((a) => ({ k: 'ad' as const, id: a.id })),
      ...Object.keys(SKILL)
        .filter((id) => !s0.skills.includes(id))
        .slice(0, 24)
        .map((id) => ({ k: 'skill' as const, id })),
      { k: 'part', uid: shop },
      { k: 'staff', uid: shop, n: 2 },
      { k: 'clear', uid: -1, cut: 1 },
      { k: 'useup', slot: k, key, rar },
      { k: 'invest', id: 'shelves', uid: shop },
    ];
    let n = 0;
    let skip = 0;
    for (const pol of POLICIES.map((p) => p.id)) {
      const s = structuredClone(s0);
      setPolicy(s, pol);
      for (const hero of [null, s.staff[0]?.hero ?? null])
        for (const a of acts) {
          const B = briefOf(s, planOf(s, [a], { hero, q: 0.9, dept: null }));
          n++;
          if (B.rec === 'skip') skip++;
          expect({ a: a.k, pol, pitch: B.pitch, dir: says(B.pitch) }).toEqual({ a: a.k, pol, pitch: B.pitch, dir: B.rec });
        }
    }
    expect(n).toBeGreaterThan(100);
    // 見送るの提案書も、ちゃんと試している
    expect(skip).toBeGreaterThan(0);
  });
  it('倉庫の提案：見送るの手を開くと、同じカードの推奨の手を推す。カードのセリフの結びも推奨の手', () => {
    for (const fill of [true, false]) {
      const s = fill ? fullOfMats().s : town();
      if (!fill) {
        // 倉庫が 9 割（あふれてはいない）：倉庫の手は見合わない
        const made = madeSkus(s);
        const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
          .map((p) => sku(p.key, 'C'))
          .find((y) => !made.includes(y))!;
        const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
        const per = Object.values(r).reduce<number>((a, q) => a + (q ?? 0), 0);
        const room = poolCap(s) * 0.92 - Object.values(s.mats).reduce<number>((a, v) => a + (v ?? 0), 0) - Object.values(s.stock).reduce<number>((a, v) => a + (v ?? 0), 0);
        for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = (s.mats[m as keyof typeof s.mats] ?? 0) + Math.max(0, Math.floor(((q ?? 0) / per) * room));
      }
      s.cards = newCards();
      const d = stockDraft(s);
      if (!d) continue;
      const c = enqueue(s, d) as Card;
      const best = c.choices[shownRec(s, c)];
      const say = sayOf(s, c);
      if (best.act.k === 'do' && storeAct(best.act.a)) expect(say).toMatch(/倉庫|拠点/);
      else if (best.act.k === 'do' && best.act.a.k === 'useup') expect(say).toContain('いまの素材で作って');
      else if (best.act.k === 'skip') expect(say).toContain('このまま');
      for (const ch of c.choices) {
        if (ch.act.k !== 'do') continue;
        const B = briefOf(s, planOf(s, [ch.act.a], { hero: c.hero, q: c.q, dept: c.dept }), { card: c.id });
        expect(says(B.pitch)).toBe(B.rec);
        // 見送るの手で、カードにほかの推奨の手があれば、それを推す
        if (B.rec === 'skip' && best !== ch && best.act.k === 'do') expect(B.pitch).toContain(actNoun(best.act.a));
      }
    }
  });
});
