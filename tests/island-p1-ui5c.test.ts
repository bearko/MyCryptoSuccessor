/**
 * 段 UI5c：在庫の売りさばき（お店の方針）・使い切りの製造・いまの素材で作れるおすすめ・作る物の絞り込み・ランクアップの動線・倉庫の提案。
 * 仕様は docs/ISLAND_PHASE1.md「在庫の売りさばき（段 UI5c）」。
 */
import { describe, expect, it } from 'vitest';
import { CARD, CLEAR, PRODUCTS, SKILL, sku, type Sku } from '../src/island/p1/data';
import {
  batchOf,
  clearCut,
  clearSkus,
  craftCheck,
  deserializeP1,
  goodsSales,
  madeSkus,
  myShops,
  poolCap,
  poolRate,
  priceAt,
  priceOf,
  serializeP1,
  setClear,
  steadySkus,
  step,
  syncShelves,
  useUp,
  type P1State,
} from '../src/island/p1/model';
import { afterOf, applyPlan, manualPlan, planCost, planOf, planRows, planTitle } from '../src/island/p1/plan';
import { cardsMonth, cardsOf, chooseCard, enqueue, planOfChoice, stockDraft } from '../src/island/p1/card';
/** 倉庫の提案を受け箱へ（月の締めと同じ enqueue） */
const stockDraftEnqueue = (s: P1State) => {
  const d = stockDraft(s);
  if (d) enqueue(s, d);
};
import { clearInfo, fromStock, rankUp, rankable, sellFilter, sellNo, spareMats } from '../src/island/p1/stock';
import { ordersOf } from '../src/island/p1/orders';
import { actOk, execute } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

/** タオックスの 2 か月目以降（お店と工房がある）の写し */
let save: string | null = null;
function base(): P1State {
  if (!save)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 2 && myShops(s).length && s.slots.some((x) => x.sku && x.worker != null)) save = serializeP1(s);
      },
    });
  const s = deserializeP1(save!)!;
  s.tut = 99;
  s.money = 80000;
  return s;
}
/** 倉庫を空ける（素材・運ぶ前の商品・注文） */
const empty = (s: P1State) => {
  for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
  for (const x of Object.keys(s.stock)) s.stock[x as Sku] = 0;
  s.orders = [];
  s.buyTrip = null;
};
/** いま作っていない基礎の商品（技の要らない Common） */
const notMade = (s: P1State): Sku => {
  const made = madeSkus(s);
  return PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
    .map((p) => sku(p.key, 'C'))
    .find((x) => !made.includes(x))!;
};

describe('お店の方針「在庫を優先して売りさばく」', () => {
  it('方針がオフ（初期値）なら、棚・値段・売れ方はいままでどおり', () => {
    const s = base();
    const a = deserializeP1(serializeP1(s))!;
    syncShelves(a);
    for (const b of myShops(s)) expect(s.shops[b.uid].clear).toBeUndefined();
    const x = notMade(s);
    for (const b of myShops(s)) expect(clearCut(s, s.shops[b.uid], x)).toBe(0);
    expect(goodsSales(a)).toEqual(goodsSales(deserializeP1(serializeP1(a))!));
  });

  it('在庫品（作っていない商品の在庫）を、作っている商品より先に棚へ並べる', () => {
    const s = base();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    const x = notMade(s);
    s.stock[x] = 20;
    // 棚 1 段：オフなら作っている商品、オンなら在庫品
    sh.shelves = [sh.shelves.find((y) => !!y) ?? madeSkus(s)[0]];
    syncShelves(s);
    expect(sh.shelves).not.toContain(x);
    expect(clearSkus(s)).toContain(x);
    setClear(s, b.uid, 1);
    expect(sh.shelves[0]).toBe(x);
    // やめると作っている商品に戻る
    setClear(s, b.uid, null);
    expect(sh.shelves).not.toContain(x);
  });

  it('値引きは在庫品だけ（作っている商品は値段そのまま）。1 個あたりの売上は上乗せしない', () => {
    const s = base();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    const x = notMade(s);
    s.stock[x] = 40;
    const made = steadySkus(s)[0];
    setClear(s, b.uid, 0);
    expect(sh.shelves).toContain(x);
    const p0 = priceAt(s, x, sh);
    const m0 = priceAt(s, made, sh);
    const u0 = goodsSales(s)[x]?.units ?? 0;
    for (let k = 1; k < CLEAR.cuts.length; k++) {
      setClear(s, b.uid, k);
      expect(Math.abs(priceAt(s, x, sh) - p0 * (1 - CLEAR.cuts[k]))).toBeLessThanOrEqual(1);
      expect(priceAt(s, x, sh)).toBeLessThan(p0);
      expect(priceAt(s, made, sh)).toBe(m0);
      const u = goodsSales(s)[x]?.units ?? 0;
      // 売れる数は増えても (1 + c) 倍まで。売上（数 × 値段）は値引きなしより増えない
      expect(u).toBeGreaterThanOrEqual(u0 - 1e-9);
      expect(u).toBeLessThanOrEqual(u0 * (1 + CLEAR.cuts[k]) + 1e-6);
      expect(u * priceAt(s, x, sh)).toBeLessThanOrEqual(u0 * p0 + 1e-6);
    }
  });

  it('チュートリアル（タオックスの 1 か月目）のあいだは効かない', () => {
    const s = base();
    const b = myShops(s)[0];
    s.shops[b.uid].clear = 2;
    s.tut = 5;
    expect(clearCut(s, s.shops[b.uid], notMade(s))).toBe(0);
  });

  it('店長への指示に「在庫を優先して売りさばく」（倉庫の埋まり方と在庫品の数）。倉庫が埋まりそうなら金色', () => {
    const s = base();
    const b = myShops(s)[0];
    const x = notMade(s);
    empty(s);
    s.stock[x] = 12;
    const box = ordersOf(s, s.buildings.find((y) => y.uid === b.uid)!)!;
    const o = box.orders.find((y) => y.k === 'clear')!;
    expect(o.label).toBe('在庫を優先して売りさばく');
    expect(o.sub).toContain('オフ');
    expect(o.sub).toContain('在庫品 12 個');
    expect(o.rec).toBeFalsy();
    s.mats.wood = (s.mats.wood ?? 0) + poolCap(s);
    const box2 = ordersOf(s, s.buildings.find((y) => y.uid === b.uid)!)!;
    expect(box2.orders.find((y) => y.k === 'clear')!.rec).toBe(true);
  });

  it('提案書：As-Is ／ To-Be に売り方と倉庫の行。承認で全部のお店がオンに', () => {
    const s = base();
    const x = notMade(s);
    s.stock[x] = 30;
    const plan = planOf(s, [{ k: 'clear', uid: -1, cut: 1 }]);
    expect(plan.steps.filter((y) => y.k === 'clear').length).toBe(myShops(s).length);
    expect(planTitle(s, plan)).toContain('在庫を優先して売りさばく（1 割引）');
    const { rows } = planRows(s, plan, afterOf(s, plan));
    const sell = rows.find((r) => r.label.startsWith('売り方'))!;
    expect(sell.asIs.text).toBe('作っている商品から並べる');
    expect(sell.toBe.text).toContain('在庫品を先に');
    expect(rows.find((r) => r.label === '倉庫')!.asIs.text).toContain('在庫品 30 個');
    expect(planCost(s, plan).money).toBe(0);
    expect(applyPlan(s, plan).ok).toBe(true);
    for (const b of myShops(s)) expect(s.shops[b.uid].clear).toBe(1);
    expect(actOk(s, { k: 'clear', uid: -1, cut: 1 })).toBe(false);
  });
});

describe('使い切りの製造（いまの素材で作れるだけ作って戻る）', () => {
  it('作れる数だけ作り、作り終えたらもとの商品の自動製造に戻る。その間も戻る商品は棚から外れない', () => {
    const s = base();
    const k = s.slots.findIndex((x) => x.sku && x.worker != null);
    const a = s.slots[k].sku!;
    const x = notMade(s);
    for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
    s.orders = [];
    s.buyTrip = null;
    const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
    for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = (q ?? 0) * 2;
    s.slots[k].running = false;
    const n = useUp(s, k, x);
    expect(n).toBe(2 * batchOf(x, s));
    expect(s.slots[k].sku).toBe(x);
    expect(s.slots[k].back).toBe(a);
    expect(madeSkus(s)).toContain(a);
    expect(steadySkus(s)).toContain(a);
    expect(steadySkus(s)).not.toContain(x);
    let back = false;
    for (let d = 0; d < 40 && !back; d++) {
      // 調達で同じ素材が入ってこないように
      s.orders = [];
      s.buyTrip = null;
      step(s);
      back = s.slots[k].sku === a && s.slots[k].back === undefined;
    }
    expect(back).toBe(true);
    expect(s.slots[k].repeat).toBe(true);
  });

  it('倉庫がいっぱいでも、置いている数が増えない使い切りの製造は始められる（ふつうの製造は今までどおり止まる）', () => {
    const s = base();
    const k = s.slots.findIndex((x) => x.worker != null);
    const x = sku('Scissors', 'C'); // 鉄 5 → 4 個（置いている数が 1 減る）
    s.slots[k].running = false;
    s.mats.iron = poolCap(s) * 2;
    expect(craftCheck(s, x, s.slots[k].worker)).toBe('full');
    expect(craftCheck(s, x, s.slots[k].worker, true)).toBeNull();
    // 鉄 2・ガラス 3 → 4 個（増えない）／粘土 6・ガラス 1 → 3 個（減る）は作れる。増える商品は作れない
    expect(useUp(s, k, x)).toBeGreaterThan(0);
    expect(s.slots[k].running).toBe(true);
  });

  it('いまの素材で作れる：作れる数・この町で売れる見込み・おすすめ（いちばん上）。売れないものは絞り込みで外れる', () => {
    const s = base();
    s.mats.wood = 200;
    s.mats.iron = 60;
    const xs = fromStock(s, s.slots[0].worker);
    expect(xs.length).toBeGreaterThan(0);
    for (const p of xs) {
      expect(p.units).toBeGreaterThan(0);
      expect(p.no).toBeNull();
    }
    expect(xs[0].rec).toBe(true);
    expect(xs.filter((p) => p.rec).length).toBe(1);
    expect(spareMats(s).wood).toBeGreaterThan(0);
    // 余った木材を使う商品が上に来る
    expect(xs[0].spare).toBeGreaterThan(0);
  });

  it('今のセクタで売れるもの：需要の無い商品・この町で売れない復刻品は理由を 1 行で', () => {
    const s = base();
    const x = sku('Sensu', 'C');
    expect(sellNo(s, x)).toBeNull();
    s.demand.Sensu = 0;
    expect(sellNo(s, x)).toBe('この町には需要がない');
    expect(sellFilter(s, [x, sku('Lantern', 'C')], true)).toEqual([sku('Lantern', 'C')]);
    expect(sellFilter(s, [x, sku('Lantern', 'C')], false).length).toBe(2);
  });
});

describe('ランクアップ（Common → Uncommon）の動線', () => {
  it('いまの仕組みどおり：魔法の釜 → 商品開発（お金・日数・1 つずつ）→ 製造の適性の職人で作る。できない理由は 1 行で', () => {
    const s = base();
    const x = sku('Sensu', 'C');
    s.skills = s.skills.filter((k) => k !== 'pot');
    s.dev = [];
    s.lab = null;
    const r0 = rankUp(s, x, s.slots[0].worker)!;
    expect(r0.next).toBe('pot');
    expect(r0.why).toContain(SKILL.pot.name);
    expect(rankable(s, x)).toBe(true);
    s.skills.push('pot');
    s.money = 100000;
    const r1 = rankUp(s, x, s.slots[0].worker)!;
    expect(r1.next).toBe('dev');
    expect(r1.why).toBeNull();
    expect(r1.cost).toBeGreaterThan(0);
    s.money = 0;
    expect(rankUp(s, x, null)!.next).toBe('money');
    s.money = 100000;
    s.lab = { key: 'Lantern', left: 4 };
    expect(rankUp(s, x, null)!.next).toBe('wait');
    s.lab = null;
    s.dev.push('Sensu');
    const st = s.staff.find((y) => y.hero === s.slots[0].worker)!;
    st.stats = { ...st.stats, agi: 99, int: 99, phy: 99 };
    expect(rankUp(s, x, st.hero)!.next).toBe('make');
    st.stats = { ...st.stats, agi: 1, int: 1, phy: 1 };
    expect(rankUp(s, x, st.hero)!.next).toBe('skill');
    // アンコモン・復刻品は無し
    expect(rankUp(s, sku('Sensu', 'U'), null)).toBeNull();
    // 技が要る商品は技を取ってから印を出す
    expect(rankable(s, sku('Knife', 'C'))).toBe(s.skills.includes('t_metal'));
  });
});

describe('倉庫が埋まりそうな月の提案（店長から）', () => {
  it('倉庫が 8 割を超えたら「在庫を優先して売りさばきましょう」「いまある素材で○○が作れます」。下なら出さない', () => {
    const s = base();
    const x = notMade(s);
    empty(s);
    s.stock[x] = 20;
    expect(stockDraft(s)).toBeNull();
    s.mats.wood = Math.ceil(poolCap(s) * 0.5);
    s.mats.iron = Math.ceil(poolCap(s) * 0.2);
    s.mats.clay = Math.ceil(poolCap(s) * 0.1);
    s.mats.glass = Math.ceil(poolCap(s) * 0.1);
    expect(poolRate(s)).toBeGreaterThanOrEqual(CLEAR.warn);
    const d = stockDraft(s)!;
    expect(d.src).toBe('stock');
    expect(d.issue.k).toBe('store');
    const kinds = d.choices.map((c) => (c.act.k === 'do' ? c.act.a.k : c.act.k));
    expect(kinds).toContain('clear');
    expect(kinds).toContain('useup');
    expect(kinds[kinds.length - 1]).toBe('skip');
    expect(d.hero).toBe(s.shops[myShops(s)[0].uid].staff);
    s.tut = 5;
    expect(stockDraft(s)).toBeNull();
  });

  it('月の締めに受け箱へ。選ぶと提案書（売りさばき ＋ 使い切りの製造）、承認で一気に変わる。ほかのカードを押し出さない', () => {
    const s = base();
    s.stock[notMade(s)] = 20;
    s.mats.wood = (s.mats.wood ?? 0) + Math.ceil(poolCap(s) * 0.9);
    const C = cardsOf(s);
    C.inbox = [];
    cardsMonth(s, s.reports[s.reports.length - 1]);
    const c = C.inbox.find((y) => y.src === 'stock')!;
    expect(c).toBeTruthy();
    const k = c.choices.findIndex((y) => y.act.k === 'do' && y.act.a.k === 'clear');
    const plan = planOfChoice(s, c, k)!;
    expect(plan.steps.some((y) => y.k === 'clear')).toBe(true);
    const r = applyPlan(s, plan);
    expect(r.ok).toBe(true);
    for (const b of myShops(s)) expect(s.shops[b.uid].clear).toBe(CLEAR.def);
    // 受け箱が CARD.keep 枚でも出す。受け箱の枚数に数えないので、ほかのカードは押し出されない
    const t2 = base();
    t2.stock[notMade(t2)] = 20;
    t2.mats.wood = (t2.mats.wood ?? 0) + Math.ceil(poolCap(t2) * 0.9);
    const C2 = cardsOf(t2);
    const ids = Array.from({ length: CARD.keep }, (_, i) => 1000 + i);
    C2.inbox = ids.map((id, i) => ({ ...c, src: 'clerk' as const, kind: `x${i}`, id, mk: C2.mk, pop: true, seen: false }));
    const before = C2.inbox.map((y) => y.id);
    stockDraftEnqueue(t2);
    expect(C2.inbox.some((y) => y.src === 'stock')).toBe(true);
    for (const id of before) expect(C2.inbox.some((y) => y.id === id)).toBe(true);
    void chooseCard;
  });

  it('使い切りの手（execute）とセーブの読み直し（方針・戻る商品が残る）', () => {
    const s = base();
    const x = notMade(s);
    const r = PRODUCTS.find((p) => p.key === x.split(':')[0])!.recipe.C;
    for (const [m, q] of Object.entries(r)) s.mats[m as keyof typeof s.mats] = (q ?? 0) * 3;
    const k = s.slots.findIndex((y) => y.worker != null);
    const [key, rar] = x.split(':') as [string, 'C'];
    expect(actOk(s, { k: 'useup', slot: k, key, rar })).toBe(true);
    expect(execute(s, { k: 'useup', slot: k, key, rar })).toBeNull();
    setClear(s, myShops(s)[0].uid, 2);
    const t2 = deserializeP1(serializeP1(s))!;
    expect(t2.shops[myShops(s)[0].uid].clear).toBe(2);
    expect(t2.slots[k].back).toBe(s.slots[k].back);
    expect(clearInfo(t2).rate).toBeCloseTo(poolRate(s), 6);
    void priceOf;
    void manualPlan;
  });
});
