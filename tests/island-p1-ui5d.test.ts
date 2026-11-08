/**
 * 段 UI5d：倉庫を大事にする提案（倉庫を強化する（推奨））・倉庫の強化（1 棟を段で）・物流拠点の保管・棚が 1 段のお店の 3 択・推奨の札。
 * 仕様は docs/ISLAND_PHASE1.md「倉庫の強化と物流拠点の保管・棚が 1 段のお店の 3 択（段 UI5d）」。
 */
import { describe, expect, it } from 'vitest';
import { CARD, CLEAR, INVEST, P1B, PRODUCTS, STORE, sku, type Sku, unitsX } from '../src/island/p1/data';
import {
  build,
  deserializeP1,
  gainSkill,
  invest,
  investCost,
  invLv,
  madeSkus,
  myShops,
  myWarehouses,
  poolCap,
  poolParts,
  poolRate,
  roomOf,
  serializeP1,
  shelfCount,
  step,
  syncShelves,
  type P1State,
  type PBuilding,
} from '../src/island/p1/model';
import { applyPlan, manualPlan, planCost, planRows, planTitle } from '../src/island/p1/plan';
import { choiceText, enqueue, planOfChoice, sayLength, sayOf, shownRec, stockDraft, storeAct, type Card } from '../src/island/p1/card';
import { gatePlan, growBlock, oneShelf, shelfGate, storeFix } from '../src/island/p1/stock';
import { findLot, newDeleg, type Proposal } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';
import raw from '../src/generated/catalog.json';
const heroes = (raw as unknown as { heroes: { id: number }[] }).heroes;

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
/** 倉庫を空ける */
const empty = (s: P1State) => {
  for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
  for (const x of Object.keys(s.stock)) s.stock[x as Sku] = 0;
  s.orders = [];
  s.buyTrip = null;
};
/** 置き場所を rate まで（木材で）埋める */
const fill = (s: P1State, rate = 0.9) => {
  empty(s);
  s.mats.wood = Math.ceil(poolCap(s) * rate);
};
/** いま作っていない基礎の商品 */
const notMade = (s: P1State): Sku => {
  const made = madeSkus(s);
  return PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
    .map((p) => sku(p.key, 'C'))
    .find((x) => !made.includes(x))!;
};
/** すぐ建てる（工事の日数を飛ばす） */
const buildNow = (s: P1State, id: string): PBuilding => {
  const lot = findLot(s, id)!;
  const b = build(s, id, ...lot);
  if (typeof b === 'string') throw new Error(`${id}: ${b}`);
  b.left = 0;
  return b;
};
/** 自社のお店（棚 1 段のよろず屋） */
const shop1 = (s: P1State) => myShops(s).find((b) => shelfCount(s, b) === 1)!;

describe('置き場所の計算（倉庫の強化・物流拠点）', () => {
  it('倉庫は +200、強化は 1 段 +100（3 段まで）。物流拠点は +150、保管棚は 1 段 +75（2 段まで）', () => {
    const s = base();
    s.money = 1e6;
    const p0 = poolCap(s);
    const w = buildNow(s, 'warehouse');
    expect(roomOf(w)).toBe(STORE.warehouse);
    expect(poolCap(s)).toBe(p0 + 200);
    for (let k = 1; k <= 3; k++) {
      expect(invest(s, w.uid, 'rack')).toBeNull();
      expect(roomOf(w)).toBe(200 + 100 * k);
    }
    expect(invest(s, w.uid, 'rack')).toBe('max');
    expect(poolCap(s)).toBe(p0 + 500);
    gainSkill(s, 'hub');
    const d = buildNow(s, 'logistics');
    expect(roomOf(d)).toBe(STORE.depot);
    expect(poolCap(s)).toBe(p0 + 650);
    expect(invest(s, d.uid, 'rack')).toBe('locked');
    expect(invest(s, w.uid, 'dock')).toBe('locked');
    expect(invest(s, d.uid, 'dock')).toBeNull();
    expect(invest(s, d.uid, 'dock')).toBeNull();
    expect(invest(s, d.uid, 'dock')).toBe('max');
    expect(roomOf(d)).toBe(150 + 150);
    // 内訳（表示用）：工房・倉庫・拠点の合計が poolCap
    const q = poolParts(s);
    expect(q.warehouse).toBe(500);
    expect(q.depot).toBe(300);
    expect(q.base + q.warehouse + q.depot).toBe(poolCap(s));
    // 物流拠点は倉庫より少し小さい
    expect(STORE.depot).toBeLessThan(STORE.warehouse);
    expect(STORE.depot).toBeGreaterThanOrEqual(STORE.warehouse * 0.6);
    // 工事中の倉庫・拠点は数えない
    const w2 = build(s, 'warehouse', ...findLot(s, 'warehouse')!) as PBuilding;
    expect(w2.left).toBeGreaterThan(0);
    expect(poolCap(s)).toBe(p0 + 800);
  });

  it('強化の 1 個あたりの値段は建てるのと同じくらい（維持費のぶん少し得）', () => {
    const per = P1B.warehouse.cost / STORE.warehouse;
    INVEST.rack.cost.forEach((c) => {
      expect(c / STORE.rack).toBeGreaterThanOrEqual(per);
      expect(c / STORE.rack).toBeLessThanOrEqual(per * 1.5);
    });
    // 3 段（+300）ぶん：建てる（1.5 棟ぶん）より高いが、3 か月の維持費を足すと強化のほうが安い
    const all = INVEST.rack.cost.reduce((a, c) => a + c, 0);
    const room = STORE.rack * INVEST.rack.cost.length;
    const bld = (room / STORE.warehouse) * P1B.warehouse.cost;
    expect(all).toBeGreaterThanOrEqual(bld);
    expect(all).toBeLessThan(bld + (room / STORE.warehouse) * P1B.warehouse.upkeep * 3);
    // 拠点の保管棚も同じ考え方
    INVEST.dock.cost.forEach((c) => expect(c / STORE.dock).toBeLessThanOrEqual(per * 1.5));
  });

  it('セーブの読み直しで強化の段・拠点の保管棚が残る（版は上げない：建物の inv に入る）', () => {
    const s = base();
    s.money = 1e6;
    const w = buildNow(s, 'warehouse');
    invest(s, w.uid, 'rack');
    invest(s, w.uid, 'rack');
    gainSkill(s, 'hub');
    const d = buildNow(s, 'logistics');
    invest(s, d.uid, 'dock');
    const t2 = deserializeP1(serializeP1(s))!;
    expect(invLv(t2.buildings.find((x) => x.uid === w.uid), 'rack')).toBe(2);
    expect(invLv(t2.buildings.find((x) => x.uid === d.uid), 'dock')).toBe(1);
    expect(poolCap(t2)).toBe(poolCap(s));
    // 以前のセーブの「倉庫の高い棚」1 段（6,000 G で買った +100）は、そのまま強化の 1 段目
    const old = JSON.parse(serializeP1(s));
    const ow = old.buildings.find((x: PBuilding) => x.uid === w.uid);
    ow.inv = { rack: 1 };
    const t3 = deserializeP1(JSON.stringify(old))!;
    expect(roomOf(t3.buildings.find((x) => x.uid === w.uid)!)).toBe(300);
    expect(investCost(t3.buildings.find((x) => x.uid === w.uid)!, 'rack')).toBe(INVEST.rack.cost[1]);
  });
});

describe('倉庫を強化する（推奨）の手（storeFix）', () => {
  it('倉庫が無い → 建てる・ある → 強化（段のいちばん低い倉庫）・強化しきった → もう 1 棟・拠点があれば拠点の保管棚・パネルがあれば物流拠点', () => {
    const s = base();
    s.money = 1e6;
    expect(myWarehouses(s)).toHaveLength(0);
    const f0 = storeFix(s)!;
    expect(f0.k).toBe('build');
    expect(f0.k === 'build' && f0.id === 'warehouse' && !f0.more).toBe(true);
    // 工事中は待つ
    const w = build(s, 'warehouse', ...findLot(s, 'warehouse')!) as PBuilding;
    expect(storeFix(s)).toBeNull();
    w.left = 0;
    const f1 = storeFix(s)!;
    expect(f1).toMatchObject({ k: 'rack', uid: w.uid, lv: 1, max: 3, cost: INVEST.rack.cost[0], room: 100 });
    invest(s, w.uid, 'rack');
    expect(storeFix(s)).toMatchObject({ k: 'rack', lv: 2, cost: INVEST.rack.cost[1] });
    invest(s, w.uid, 'rack');
    invest(s, w.uid, 'rack');
    const f2 = storeFix(s)!;
    expect(f2.k === 'build' && f2.id === 'warehouse' && f2.more).toBe(true);
    // 物流拠点のパネルがあって、拠点がまだ無い → 物流拠点を建てる（置き場所にもなる）
    gainSkill(s, 'hub');
    const f3 = storeFix(s)!;
    expect(f3.k === 'build' && f3.id === 'logistics').toBe(true);
    expect(f3.room).toBe(STORE.depot);
    const d = buildNow(s, 'logistics');
    expect(storeFix(s)).toMatchObject({ k: 'dock', uid: d.uid, lv: 1, room: STORE.dock });
  });
});

describe('倉庫の提案のカード（UI5c の 8 割を作り直す）', () => {
  it('いちばん上に「倉庫を建てる／強化する」（推奨）、続けて売りさばく・いまの素材で作る・このまま', () => {
    const s = base();
    const x = notMade(s);
    fill(s, 0.85);
    s.stock[x] = unitsX(10);
    expect(poolRate(s)).toBeGreaterThanOrEqual(CLEAR.warn);
    const d = stockDraft(s)!;
    const kinds = d.choices.map((c) => (c.act.k === 'do' ? c.act.a.k : c.act.k));
    expect(kinds[0]).toBe('build');
    expect(kinds).toContain('clear');
    expect(kinds[kinds.length - 1]).toBe('skip');
    expect(d.choices[0].rec).toBe(true);
    expect(d.choices.filter((c) => c.rec)).toHaveLength(1);
    expect(d.choices[0].room).toBe(STORE.warehouse);
    expect(d.issue).toMatchObject({ k: 'store', fix: 'build' });
    const c: Card = { ...d, id: 1, mk: 0, sector: 'c1', day: 0, pop: false } as Card;
    expect(choiceText(s, c, d.choices[0]).label).toBe('倉庫を建てよう');
    expect(choiceText(s, c, d.choices[0]).sub).toMatch(/置き場所 \+200/);
    // 段 UI7e：セリフの結びは画面の推奨（shownRec）に合わせる（倉庫の手が推奨なら「倉庫を建てよう」、見合わなければ「このまま」）
    const r1 = c.choices[shownRec(s, c)].act;
    expect(sayOf(s, c)).toMatch(r1.k === 'do' && storeAct(r1.a) ? /倉庫を建てよう/ : /このまま/);
    // 倉庫があれば「倉庫を強化しよう（1/3 段目）」
    const w = buildNow(s, 'warehouse');
    fill(s, 0.9);
    s.stock[x] = unitsX(10);
    const d2 = stockDraft(s)!;
    const a = d2.choices[0].act;
    expect(a.k === 'do' && a.a.k === 'invest' && a.a.id === 'rack' && a.a.uid === w.uid).toBe(true);
    const c2: Card = { ...d2, id: 2, mk: 0, sector: 'c1', day: 0, pop: false } as Card;
    expect(choiceText(s, c2, d2.choices[0]).label).toBe('倉庫を強化しよう（1/3 段目）');
    expect(choiceText(s, c2, d2.choices[0]).sub).toMatch(/維持費なし/);
    const r2 = c2.choices[shownRec(s, c2)].act;
    expect(sayOf(s, c2)).toMatch(r2.k === 'do' && storeAct(r2.a) ? /倉庫を強化しよう/ : /このまま/);
  });

  it('お金が足りないときは推奨をほかの手へ（倉庫の手は残す）。在庫品が無くても倉庫の手だけで出す', () => {
    const s = base();
    const x = notMade(s);
    fill(s, 0.9);
    s.stock[x] = unitsX(10);
    s.money = 100;
    const d = stockDraft(s)!;
    expect(d.choices[0].act.k === 'do' && storeAct(d.choices[0].act.a)).toBe(true);
    expect(d.choices[0].rec).toBeFalsy();
    expect(d.choices.filter((c) => c.rec)).toHaveLength(1);
    // 在庫品・余った素材の手が無くても、倉庫の手と「このまま」で出す
    const t2 = base();
    fill(t2, 0.9);
    t2.mats.wood = 0;
    t2.mats.clay = Math.ceil(poolCap(t2) * 0.9);
    const d2 = stockDraft(t2);
    expect(d2).toBeTruthy();
    expect(d2!.choices[0].rec).toBe(true);
  });

  it('セリフは CARD.sayMax 字まで（推奨の手ごと・全員の口調）', () => {
    const s = base();
    let n = 0;
    for (const fix of ['rack', 'dock', 'build', 'more', 'hub', undefined] as const)
      for (const h of heroes.slice(0, 120)) {
        const c = { id: 1, src: 'stock', kind: 'stock', hero: h.id, q: 0.8, dept: 'logistics', mk: 0, sector: 'c1', day: 0, issue: { k: 'store', pct: 100, mats: 1234, goods: 123, items: 12, ...(fix ? { fix } : {}) }, choices: [], pop: false } as Card;
        expect(sayLength(s, c), sayOf(s, c)).toBeLessThanOrEqual(CARD.sayMax);
        n++;
      }
    expect(n).toBe(720);
  });

  it('倉庫の手の提案書：As-Is／To-Be に「置き場所」の行・費用。売りさばきと束ねない。承認で強化', () => {
    const s = base();
    const x = notMade(s);
    const w = buildNow(s, 'warehouse');
    fill(s, 0.8);
    // 段 UI7d：売りさばきは、倉庫の在庫品が埋まりの 1 割以上のときだけ出る（素材で埋まっているなら出さない）
    s.stock[x] = unitsX(Math.ceil(poolCap(s) * 0.15));
    const d = stockDraft(s)!;
    const c = enqueue(s, d)!;
    const plan = planOfChoice(s, c, 0)!;
    expect(plan.steps.every((y) => y.k === 'act')).toBe(true);
    expect(planTitle(s, plan)).toBe('倉庫を強化する（1/3 段目）');
    const rows = planRows(s, plan).rows;
    const room = rows.find((r) => r.label === '置き場所')!;
    expect(room).toBeTruthy();
    expect(room.asIs.text).toMatch(new RegExp(`^${poolCap(s)} 個`));
    expect(room.toBe.text).toMatch(new RegExp(`^${poolCap(s) + 100} 個（\\+100）`));
    expect(planCost(s, plan).money).toBe(INVEST.rack.cost[0]);
    // 売りさばきを選んだ提案書には、倉庫の手を入れない（費用のかかる手を黙って足さない）
    const k = c.choices.findIndex((y) => y.act.k === 'do' && y.act.a.k === 'clear');
    const p2 = planOfChoice(s, c, k)!;
    expect(p2.acts.some(storeAct)).toBe(false);
    expect(applyPlan(s, plan).ok).toBe(true);
    expect(invLv(w, 'rack')).toBe(1);
  });

  it('建てる手の提案書：毎月の維持費と工期・置き場所 +200。承認で建て始める', () => {
    const s = base();
    fill(s, 0.9);
    s.stock[notMade(s)] = unitsX(10);
    const c = enqueue(s, stockDraft(s)!)!;
    const plan = planOfChoice(s, c, 0)!;
    const cost = planCost(s, plan);
    expect(cost.money).toBe(P1B.warehouse.cost);
    expect(cost.monthly).toBe(P1B.warehouse.upkeep);
    expect(planRows(s, plan).rows.find((r) => r.label === '置き場所')!.toBe.text).toMatch(/（\+200）/);
    expect(applyPlan(s, plan).ok).toBe(true);
    expect(s.buildings.some((b) => b.owner === 'me' && b.id === 'warehouse')).toBe(true);
  });
});

describe('棚が 1 段のお店で売りさばきを選んだとき（3 択）', () => {
  /** 棚 1 段のお店に、在庫品（いま作っていない商品）を置く */
  const prep = () => {
    const s = base();
    const b = shop1(s);
    const x = notMade(s);
    s.stock[x] = unitsX(12);
    return { s, b, x, main: s.shops[b.uid].shelves[0]! };
  };

  it('棚が 1 段で主力があるお店だけ 3 択（2 段以上・方針がもうオン・在庫品が無いときは出さない）', () => {
    const { s, b } = prep();
    const plan = manualPlan([{ k: 'clear', uid: b.uid, cut: 1 }]);
    const g = shelfGate(s, plan);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ uid: b.uid, cost: INVEST.shelves.cost[0], short: 0 });
    // オフにする手は 3 択にしない
    expect(shelfGate(s, manualPlan([{ k: 'clear', uid: b.uid, cut: null }]))).toHaveLength(0);
    // 棚を増やす手が入っていれば出さない
    expect(shelfGate(s, manualPlan([{ k: 'shelf', uid: b.uid }, { k: 'clear', uid: b.uid, cut: 1 }]))).toHaveLength(0);
    // 2 段なら出さない
    const t2 = deserializeP1(serializeP1(s))!;
    t2.money = 1e6;
    invest(t2, b.uid, 'shelves');
    expect(shelfGate(t2, plan)).toHaveLength(0);
    // 在庫品が無ければ出さない
    const t3 = deserializeP1(serializeP1(s))!;
    for (const x of Object.keys(t3.stock)) if (!madeSkus(t3).includes(x as Sku)) t3.stock[x as Sku] = 0;
    for (const sh of Object.values(t3.shops)) for (const x of Object.keys(sh.storage)) if (!madeSkus(t3).includes(x as Sku)) sh.storage[x as Sku] = 0;
    expect(oneShelf(t3, [b.uid])).toHaveLength(0);
  });

  it('主力を外す：在庫品が棚に（主力が外れる）／主力を残す：何もしない（null）', () => {
    const { s, b, x, main } = prep();
    const plan = manualPlan([{ k: 'clear', uid: b.uid, cut: 1 }]);
    const g = shelfGate(s, plan);
    expect(gatePlan(plan, g, 'keep')).toBeNull();
    const drop = gatePlan(plan, g, 'drop')!;
    expect(drop).toBe(plan);
    expect(applyPlan(s, drop).ok).toBe(true);
    expect(s.shops[b.uid].shelves).toEqual([x]);
    expect(s.shops[b.uid].shelves).not.toContain(main);
  });

  it('棚を拡張する（推奨）：拡張と方針のオンを 1 回で。主力は棚 0 に残り、在庫品は 2 段目に（両方売れる）', () => {
    const { s, b, x, main } = prep();
    const plan = manualPlan([{ k: 'clear', uid: b.uid, cut: 1 }]);
    const g = shelfGate(s, plan);
    const grow = gatePlan(plan, g, 'grow')!;
    expect(grow.steps.map((y) => y.k)).toEqual(['shelf', 'clear']);
    expect(planCost(s, grow).money).toBe(INVEST.shelves.cost[0]);
    const m0 = s.money;
    expect(applyPlan(s, grow).ok).toBe(true);
    expect(s.money).toBe(m0 - INVEST.shelves.cost[0]);
    expect(s.shops[b.uid].clear).toBe(1);
    expect(s.shops[b.uid].shelves).toEqual([main, x]);
    // 日が進んでも主力は外れない
    for (let k = 0; k < 5; k++) step(s);
    syncShelves(s);
    expect(s.shops[b.uid].shelves[0]).toBe(main);
  });

  it('お金が足りないときは拡張を押せない（理由を 1 行）。もう増やせないときも', () => {
    const { s, b } = prep();
    const plan = manualPlan([{ k: 'clear', uid: b.uid, cut: 1 }]);
    s.money = 1000;
    const g = shelfGate(s, plan);
    expect(g[0].short).toBe(INVEST.shelves.cost[0] - 1000);
    expect(growBlock(g, s.money)).toBe(`資金があと 2,000 G 足りません（棚の拡張 ${INVEST.shelves.cost[0].toLocaleString('en-US')} G）`);
    expect(growBlock(g, 1e6)).toBeNull();
    expect(growBlock([{ ...g[0], cost: null }], 1e6)).toBe('棚はもう増やせません');
  });

  it('倉庫の提案の「売りさばき」（全部のお店）も、棚が 1 段のお店は 3 択の対象', () => {
    const { s, b } = prep();
    fill(s, 0.9);
    s.stock[notMade(s)] = unitsX(12);
    const c = enqueue(s, stockDraft(s)!)!;
    const k = c.choices.findIndex((y) => y.act.k === 'do' && y.act.a.k === 'clear');
    const plan = planOfChoice(s, c, k)!;
    const g = shelfGate(s, plan);
    expect(g.map((y) => y.uid)).toContain(b.uid);
    const grow = gatePlan(plan, g, 'grow')!;
    expect(grow.steps.filter((y) => y.k === 'shelf')).toHaveLength(g.length);
  });
});

describe('部長からの頼み（段 I1）の額の書き分け', () => {
  it('セリフは予算から払う額（割り引き後）と、直接の承認の額（定価）を書き分ける。選択肢の承認は「直接の承認 定価（予算の外）」', () => {
    const s = base();
    const D = (s.deleg ??= newDeleg());
    const p = { id: 9999, dept: 'logistics', hero: s.staff[0].hero, month: 0, act: { k: 'skill', id: 'hire' }, est: 1000, err: 0.1, unit: 'G', cost: 60000, status: 'new' } as unknown as Proposal;
    D.inbox.push(p);
    let n = 0;
    for (const h of heroes.slice(0, 120)) {
      const c = { id: 1, src: 'budget', kind: 'budget:logistics', hero: h.id, q: 0.8, dept: 'logistics', mk: 0, sector: 'c1', day: 0, issue: { k: 'budget', ask: { why: 'over', pid: 9999, cost: 57692 } }, choices: [], pop: false } as unknown as Card;
      const say = sayOf(s, c);
      expect(say).toMatch(/予算から\[\[ 57,692 G\]\]要る（直接の承認なら 60,000 G）/);
      expect(sayLength(s, c), say).toBeLessThanOrEqual(CARD.sayMax);
      if (n === 0) expect(choiceText(s, c, { act: { k: 'approve', pid: 9999 }, cost: 60000 }).sub).toMatch(/^直接の承認 60,000 G（予算の外）/);
      n++;
    }
    expect(n).toBe(120);
  });
});

describe('推奨の札（決まり）', () => {
  it('提案のカード（倉庫・UI1 の手）は推奨がちょうど 1 つ', () => {
    const s = base();
    fill(s, 0.9);
    s.stock[notMade(s)] = unitsX(10);
    expect(stockDraft(s)!.choices.filter((c) => c.rec)).toHaveLength(1);
  });

  it('recTag・recLine：推奨なら 1 行目の頭に「推奨」の札、そうでなければ文だけ', async () => {
    // DOM の無いテスト環境なので、要る分だけの document を置く
    class El {
      className = '';
      textContent = '';
      children: unknown[] = [];
      attrs: Record<string, string> = {};
      constructor(public tagName: string) {}
      append(...xs: unknown[]) {
        this.children.push(...xs);
      }
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      }
    }
    const g = globalThis as unknown as { document?: unknown };
    const prev = g.document;
    g.document = { createElement: (t: string) => new El(t), createTextNode: (t: string) => ({ textContent: t }) };
    try {
      const { recLine, recTag } = await import('../src/island/p1/ui');
      const tag = recTag() as unknown as El;
      expect(tag.className).toBe('isl-rec-tag');
      expect(tag.textContent).toBe('推奨');
      const on = recLine('棚を拡張する', true) as unknown as El;
      expect((on.children[0] as El).className).toBe('isl-rec-tag');
      expect((on.children[1] as { textContent: string }).textContent).toBe('棚を拡張する');
      const off = recLine('このまま', false) as unknown as El;
      expect(off.children).toHaveLength(1);
    } finally {
      g.document = prev;
    }
  });
});
