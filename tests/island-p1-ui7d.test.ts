/**
 * 段 UI7d：スライド型の提案書（slides.ts・brief.ts の承認事項の分け方・stock.ts の倉庫の提案の選び方）。
 * スライドの枚数の決め方・承認事項が手ごとに分かれること・倉庫が素材で埋まっているときに売りさばきを出さないこと・
 * グラフの数字が提案書の中身（Brief）の数字と一致すること。仕様は docs/ISLAND_PHASE1.md「スライド型の提案書（段 UI7d）」。
 */
import { describe, expect, it } from 'vitest';
import { CLEAR, POLICY, PRODUCTS, sku, type Sku } from '../src/island/p1/data';
import { deserializeP1, madeSkus, myShops, poolCap, poolRate, poolUsed, serializeP1, syncShelves, type P1State } from '../src/island/p1/model';
import { afterOf, baseOf, planOf, planRows } from '../src/island/p1/plan';
import { askGroups, briefOf, pitchOf } from '../src/island/p1/brief';
import { budgetBar, fallOf, kpisOf, longLine, metersOf, profitBars, roomKpi, slideKinds, smallBrief, srcOfPlan, stageMap, topRisks } from '../src/island/p1/slides';
import { clearFrees, clearInfo, gatePlan, shelfGate } from '../src/island/p1/stock';
import { stockDraft } from '../src/island/p1/card';
import type { PropAct } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

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
const empty = (s: P1State) => {
  for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
  for (const x of Object.keys(s.stock)) s.stock[x as Sku] = 0;
  s.orders = [];
  s.buyTrip = null;
};
const notMade = (s: P1State): Sku => {
  const made = madeSkus(s);
  return PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
    .map((p) => sku(p.key, 'C'))
    .find((x) => !made.includes(x))!;
};
/** 写真と同じ：売りさばき（全部のお店）→ 棚 1 段のお店の 3 択で「棚を拡張する」 */
function photoPlan(s: P1State) {
  const x = notMade(s);
  // 在庫品（作っていない品）をお店の裏に。お店は棚 1 段
  const b0 = myShops(s)[0];
  s.shops[b0.uid].storage[x] = 12;
  for (const b of myShops(s)) {
    b.inv = { ...(b.inv ?? {}), shelves: 0 };
    s.shops[b.uid].shelves = [s.shops[b.uid].shelves.find((y) => !!y) ?? madeSkus(s)[0]];
  }
  syncShelves(s);
  const p0 = planOf(s, [{ k: 'clear', uid: -1, cut: CLEAR.def }], { hero: null, q: 0.9, dept: 'logistics' });
  const gate = shelfGate(s, p0);
  return { p0, gate, plan: gatePlan(p0, gate, 'grow')! };
}

describe('承認事項は手ごとに 1 行（写真の ① に 3 つの手が詰まっていた不具合）', () => {
  it('売りさばきに束ねた「棚を 1 段増やす」は、お店ごとに別の行。費用・寄与の合計は提案の全部と一致する', () => {
    const s = town();
    const { gate, plan } = photoPlan(s);
    expect(gate.length).toBeGreaterThan(0);
    // gatePlan は steps と of の並びをそろえる
    expect(plan.of?.length).toBe(plan.steps.length);
    const B = briefOf(s, plan);
    expect(B.asks.map((a) => a.kind)).toEqual(['clear', ...gate.map(() => 'shelf')]);
    expect(B.asks.map((a) => a.n)).toEqual(B.asks.map((_, k) => k));
    for (const a of B.asks.filter((x) => x.kind === 'shelf')) {
      expect(a.what).toMatch(/^設備：.+の棚を 1 段増やす$/);
      expect(a.money).toBeGreaterThan(0);
    }
    expect(B.asks[0].what).not.toMatch(/棚/);
    expect(B.asks.reduce((a, x) => a + x.money, 0)).toBe(B.cost.money);
    // 手ごとの寄与（行を順に足した増え方）の合計は、提案の月の利益の差
    expect(B.parts).toHaveLength(B.asks.length);
    expect(B.parts.reduce((a, x) => a + x.dProfit, 0)).toBeCloseTo(B.dProfit, 6);
    // 要約の一言は棚の拡張も言う
    expect(B.pitch).toContain('棚の拡張と在庫の売りさばき');
    // 1 つの手（束ねていない）は 1 行
    const one = briefOf(s, planOf(s, [{ k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'marketing' }));
    expect(one.asks).toHaveLength(1);
    expect(one.parts).toHaveLength(0);
  });
  it('askGroups：売りさばき以外の手（棚の増設と新商品）は棚を分けない', () => {
    const s = town();
    const b = myShops(s)[0];
    const add: PropAct = { k: 'stock', uid: b.uid, key: notMade(s).split(':')[0], rar: 'C', idx: s.shops[b.uid].shelves.length, add: true };
    const p = planOf(s, [add], { hero: null, q: 0.9, dept: 'logistics' });
    expect(askGroups(p)).toHaveLength(1);
    expect(pitchOf(null, [{ k: 'clear', uid: -1, cut: 1 }], 'logistics', null, true)).toContain('棚の拡張と在庫の売りさばき');
  });
});

describe('倉庫の提案の選び方（素材で埋まっているとき）', () => {
  it('倉庫が素材でいっぱい（商品 0）なら「在庫を売りさばく」を出さない。いまの素材で作る・倉庫の強化を出す', () => {
    const s = town();
    empty(s);
    // 売りさばく品はお店の裏にだけある（倉庫は空けない）
    s.shops[myShops(s)[0].uid].storage[notMade(s)] = 12;
    s.mats.wood = Math.ceil(poolCap(s) * 0.6);
    s.mats.iron = Math.ceil(poolCap(s) * 0.3);
    s.mats.clay = Math.ceil(poolCap(s) * 0.15);
    expect(poolRate(s)).toBeGreaterThanOrEqual(1);
    const info = clearInfo(s);
    expect(info.total).toBeGreaterThan(0);
    expect(info.pooled).toBe(0);
    expect(clearFrees(info)).toBe(false);
    const d = stockDraft(s)!;
    const kinds = d.choices.map((c) => (c.act.k === 'do' ? c.act.a.k : c.act.k));
    expect(kinds).not.toContain('clear');
    expect(kinds.some((k) => k === 'useup' || k === 'build' || k === 'invest')).toBe(true);
    // 倉庫の手が無いときのセリフは「いまの素材で作って減らそう」
    if (d.issue.k === 'store' && !d.issue.fix && kinds.includes('useup')) expect(d.issue.next).toBe('useup');
  });
  it('倉庫に在庫品が 1 割以上あれば、売りさばきを出す（売りさばくと倉庫が空く）', () => {
    const s = town();
    empty(s);
    const x = notMade(s);
    s.mats.wood = Math.ceil(poolCap(s) * 0.7);
    s.stock[x] = Math.ceil(poolCap(s) * 0.2);
    const info = clearInfo(s);
    expect(info.pooled).toBe(s.stock[x]);
    expect(info.pooled / poolUsed(s)).toBeGreaterThanOrEqual(0.1);
    expect(clearFrees(info)).toBe(true);
    const d = stockDraft(s)!;
    expect(d.choices.some((c) => c.act.k === 'do' && c.act.a.k === 'clear')).toBe(true);
  });
});

describe('スライドの枚数', () => {
  const b = (n: number, money = 0, rp = 0, monthly = 0) => ({ asks: Array.from({ length: n }, () => ({})) as never, cost: { money, rp, monthly, days: 0, items: [] } });
  it('費用の無い 1 つの手は サマリー・付録 の 2 枚', () => {
    expect(smallBrief(b(1))).toBe(true);
    expect(slideKinds(b(1))).toEqual(['sum', 'more']);
    expect(slideKinds(b(0))).toEqual(['sum', 'more']);
  });
  it('段 UI9：費用のある手は型の 7 枚（サマリー・課題の定義・打ち手・効果と費用・リスクと対策・実行計画・付録）', () => {
    const all = ['sum', 'issue', 'move', 'effect', 'risk', 'plan', 'more'];
    expect(slideKinds(b(1, 2000))).toEqual(all);
    expect(slideKinds(b(1, 0, 30))).toEqual(all);
    expect(slideKinds(b(1, 0, 0, 500))).toEqual(all);
    expect(slideKinds(b(2))).toEqual(all);
    expect(slideKinds(b(3, 6000))).toEqual(all);
  });
});

describe('グラフの数字は提案書の中身（Brief）と一致する', () => {
  it('結論のタイル・来月の利益の棒・寄与のウォーターフォール・12 か月の折れ線', () => {
    const s = town();
    const { plan } = photoPlan(s);
    const B = briefOf(s, plan);
    const S = B.vals.list.find((m) => m.key === 'short')!;
    const L = B.vals.list.find((m) => m.key === 'long')!;
    const k = kpisOf(B);
    expect(k.find((x) => x.key === 'short')?.v).toBe(S.d);
    expect(k.find((x) => x.key === 'long')?.v).toBe(L.d);
    expect(k.find((x) => x.key === 'setup')?.v).toBe(B.cost.money);
    // 段 UI9：短期・長期・導入・投資回収期間・効果が出るまで（＋お金以外の指標）
    expect(k.map((x) => x.key).slice(0, 5)).toEqual(['short', 'long', 'setup', 'payback', 'lead']);
    expect(k.length).toBeLessThanOrEqual(6);
    // 来月の利益の棒 ＝ 短期の指標（このまま・承認後）
    expect(profitBars(B)).toEqual({ now: S.now, after: S.after });
    // 段 UI9：ウォーターフォール：As-Is の利益 → 手ごとの行（Brief.parts）→ 導入 → To-Be の短期利益（＝ As-Is ＋ 短期の差）。各行の from は前の行の to
    const f = fallOf(B);
    expect(f[0].kind).toBe('start');
    expect(f[0].v).toBeCloseTo(B.now.profit, 6);
    const asks = f.filter((x) => x.kind === 'ask');
    expect(asks.map((x) => x.v)).toEqual(B.parts.map((x) => x.dProfit));
    expect(f.find((x) => x.kind === 'setup')?.v).toBe(-B.cost.money);
    const total = f[f.length - 1];
    expect(total.kind).toBe('total');
    expect(total.v).toBeCloseTo(B.now.profit + S.d, 6);
    expect(total.v).toBeCloseTo(S.after, 4);
    for (let i = 2; i < f.length - 1; i++) expect(f[i].from).toBeCloseTo(f[i - 1].to, 6);
    // 折れ線：月数の点・1 か月目は来月の利益（承認後は導入を引く）・最後は長期の指標
    const ln = longLine(B);
    expect(ln.now).toHaveLength(POLICY.months);
    expect(ln.after).toHaveLength(POLICY.months);
    expect(ln.now[0]).toBeCloseTo(B.now.profit, 6);
    expect(ln.after[0]).toBeCloseTo(B.after.profit - B.cost.money, 6);
    expect(ln.now[POLICY.months - 1]).toBeCloseTo(L.now, 4);
    expect(ln.after[POLICY.months - 1]).toBeCloseTo(L.after, 4);
  });
  it('手が 1 つなら寄与は 月の利益の差 → 導入 → 合計。メーターはお金以外の指標と同じ数', () => {
    const s = town();
    const B = briefOf(s, planOf(s, [{ k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'marketing' }));
    const f = fallOf(B);
    expect(f[1].v).toBeCloseTo(B.dProfit, 6);
    expect(f[f.length - 1].v).toBeCloseTo(B.now.profit + B.vals.list.find((m) => m.key === 'short')!.d, 6);
    const ms = metersOf(B);
    expect(ms.map((m) => m.key)).toEqual(B.vals.list.filter((m) => m.key !== 'short' && m.key !== 'long').map((m) => m.key));
    for (const m of ms) expect(m.d).toBeCloseTo(m.after - m.now, 6);
  });
  it('影響の地図・リスクの強さ・予算のメーター・置き場所のタイル', () => {
    const s = town();
    const { plan } = photoPlan(s);
    const base = baseOf(s);
    const aft = afterOf(s, plan);
    const B = briefOf(s, plan, {}, base, aft);
    const { touched } = planRows(base, plan, aft);
    expect(touched).toContain('sell');
    const m = stageMap(B, touched, 'sell', 'sell');
    expect(m.stages.filter((x) => x.on).map((x) => x.id)).toEqual(touched);
    expect(m.depts[0]).toMatchObject({ id: 'logistics', own: true, n: B.asks.length });
    // リスクは強い順に 4 つまで。資金が足りる 1 行は出さない（資金のメーターで見せる）
    const top = topRisks([
      { text: 'a', lv: 1, kind: 'read' },
      { text: 'b', lv: 3, kind: 'cash' },
      { text: 'c', lv: 2, kind: 'flow' },
      { text: 'd', lv: 1, kind: 'cash' },
      { text: 'e', lv: 2, kind: 'stock' },
      { text: 'f', lv: 1, kind: 'ops' },
    ]);
    expect(top.map((x) => x.text)).toEqual(['b', 'c', 'e', 'a']);
    expect(B.rk.map((x) => x.text)).toEqual(B.risks);
    // 予算：使った＋この提案＋超える＋残り ＝ 月の予算（超えなければ）
    const bb = budgetBar({ budget: { dept: 'logistics', amt: 20000, used: 8000, rest: 12000, need: 6000, inside: true } })!;
    expect(bb.used + bb.mine + bb.left).toBe(20000);
    expect(bb.over).toBe(0);
    const ov = budgetBar({ budget: { dept: 'logistics', amt: 20000, used: 18000, rest: 2000, need: 6000, inside: false } })!;
    expect(ov).toMatchObject({ mine: 2000, over: 4000, left: 0 });
    expect(budgetBar({ budget: null })).toBeNull();
    // 置き場所のタイル（お金が動かない倉庫の手の 4 枚目）
    expect(roomKpi(250, 280, 380)).toMatchObject({ key: 'room', v: 100 });
    expect(roomKpi(250, 280, 280)).toBeNull();
    const k = kpisOf({ ...B, dProfit: 0, vals: { ...B.vals, list: B.vals.list.filter((x) => x.key === 'short' || x.key === 'long') } }, roomKpi(250, 280, 380));
    expect(k[5].key).toBe('room');
  });
  it('出どころ：倉庫の手 → 倉庫・売りさばき／いまの素材で作る → 在庫・ほか → 担当者', () => {
    const s = town();
    const p = (acts: PropAct[]) => planOf(s, acts, { hero: null });
    expect(srcOfPlan(p([{ k: 'invest', id: 'rack', uid: 1 }]))).toBe('store');
    expect(srcOfPlan(p([{ k: 'clear', uid: -1, cut: 1 }]))).toBe('stock');
    expect(srcOfPlan(p([{ k: 'ad', id: 'flyer' }]))).toBe('staff');
  });
});
