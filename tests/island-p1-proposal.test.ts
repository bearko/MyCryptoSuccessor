/**
 * 段 UI5a：担当者からの提案書（plan.ts）・製造と販売の連動（syncShelves）・調達の交代要員・課題ありの見立て（stallOf）・お店の自走。
 * 仕様は /tmp の仕様書 ui5_proposal.md の UI5a の部分・docs/ISLAND_PHASE1.md「担当者からの提案書（段 UI5a）」ほか。
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CARD, SELF_RUN, SKILL, type Sku } from '../src/island/p1/data';
import {
  buyCap,
  deserializeP1,
  endMonth,
  facilityStatus,
  myShops,
  postFree,
  serializeP1,
  setMain,
  stallOf,
  step,
  syncShelves,
  sellNow,
  type P1State,
} from '../src/island/p1/model';
import { afterOf, applyPlan, manualPlan, planBlock, planCost, planEffect, planOf, planRows, stepsOf } from '../src/island/p1/plan';
import { approveCard, capOf, cardInbox, cardsMonth, newCards, planOfChoice, sizeOf, stallDraft, staffDraft } from '../src/island/p1/card';
import { shelfPicks } from '../src/island/p1/orders';
import { quality } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

/** タオックスの「④ 販売が課題あり」の月（自動プレイの最短の方針の写し） */
let save: string | null = null;
function sellJam(): P1State {
  if (!save)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 2 && myShops(s).length && s.reports[s.reports.length - 1]?.bottleneck === 'sell') save = serializeP1(s);
      },
    });
  const s = deserializeP1(save!)!;
  s.tut = 99;
  s.money = 80000;
  return s;
}
/** 棚を 1 段増やして、作っていない商品を作って並べる手 */
function shelfAct(s: P1State) {
  const b = myShops(s)[0];
  const p = shelfPicks(s, b.uid).find((x) => x.ok && x.add && x.make != null)!;
  expect(p).toBeTruthy();
  const [key, rar] = p.x.split(':');
  const make = p.make!;
  return { b, p: { ...p, make }, act: { k: 'stock' as const, uid: b.uid, key, rar: rar as 'C', idx: -1, add: true, make } };
}

describe('提案書（plan.ts）：As-Is ／ To-Be・期待効果・導入コスト・一気に変更', () => {
  it('As-Is は実際のいまの状態、To-Be は承認したあとの実際の状態と一致する（棚の段・作業台・商品）', () => {
    const s = sellJam();
    const { b, p, act } = shelfAct(s);
    const plan = planOf(s, [act], { hero: s.shops[b.uid].staff, q: 0.8, dept: 'logistics' });
    const aft = afterOf(s, plan);
    const { rows } = planRows(s, plan, aft);
    const shelf = rows.find((r) => r.kind === 'shelf')!;
    expect(shelf.asIs.shelves).toEqual(s.shops[b.uid].shelves);
    expect(shelf.asIs.text).toContain(`${s.shops[b.uid].shelves.length}`);
    expect(shelf.toBe.plus).toBe(true);
    const craft = rows.find((r) => r.kind === 'craft')!;
    expect(craft.asIs.text).toContain(`作業台 ${p.make + 1}`);
    expect(craft.toBe.text).toContain(p.x.startsWith('Scissors') ? '鋏' : '');
    const goods = rows.find((r) => r.kind === 'goods')!;
    expect(goods.toBe.goods!.some((g) => g.x === p.x && g.plus)).toBe(true);
    // 実際に承認したあと（作った商品ができたものとして棚をそろえる）と、To-Be が同じ
    const real = deserializeP1(serializeP1(s))!;
    expect(applyPlan(real, plan).ok).toBe(true);
    for (const [k, x] of Object.entries(real.deleg?.pend ?? {})) real.slots[Number(k)].sku = x;
    syncShelves(real, true);
    expect(real.shops[b.uid].shelves).toEqual(aft.shops[b.uid].shelves);
    expect(real.slots.map((x) => [x.sku, x.worker])).toEqual(aft.slots.map((x) => [x.sku, x.worker]));
    expect(shelf.toBe.shelves).toEqual(aft.shops[b.uid].shelves);
  });
  it('承認すると、提案に入っている変更が全部走る（棚の増設・作業台の切り替え・素材の注文）。導入コストのとおりにお金が減る', () => {
    const s = sellJam();
    const { b, p, act } = shelfAct(s);
    const plan = planOf(s, [act]);
    const cost = planCost(s, plan);
    expect(cost.items.some((x) => x.label.includes('棚の増設'))).toBe(true);
    const n0 = s.shops[b.uid].shelves.length;
    const o0 = (s.orders ?? []).length;
    const m0 = s.money;
    const r = applyPlan(s, plan);
    expect(r.ok).toBe(true);
    expect(r.did.length).toBeGreaterThanOrEqual(2);
    expect(s.shops[b.uid].shelves.length).toBe(n0 + 1);
    expect(s.slots[p.make].sku === p.x || s.deleg?.pend[p.make] === p.x).toBe(true);
    const orders = plan.steps.filter((x) => x.k === 'order').length;
    expect((s.orders ?? []).length).toBe(o0 + orders);
    expect(m0 - s.money).toBe(cost.money);
  });
  it('払えないときは承認できない（理由を赤で）。applyPlan も何もしない', () => {
    const s = sellJam();
    const { act } = shelfAct(s);
    const plan = planOf(s, [act]);
    s.money = 10;
    expect(planBlock(s, plan).some((x) => x.includes('資金不足'))).toBe(true);
    const before = serializeP1(s);
    const r = applyPlan(s, plan);
    expect(r).toMatchObject({ ok: false, err: 'money' });
    expect(serializeP1(s)).toBe(before);
  });
  it('期待効果：売上・コスト・利益の今 → 後（月あたり）。誤差は読みの確かさから', () => {
    const s = sellJam();
    const { act } = shelfAct(s);
    const e = planEffect(s, planOf(s, [act], { hero: null, q: 0.8 }));
    expect(e.after.sales).toBeGreaterThan(e.now.sales);
    expect(e.err).toBeCloseTo(0.2 * 1, 5);
    expect(e.now.profit).toBeCloseTo(e.now.sales - e.now.cost, 5);
  });
  it('カードの選択肢から開く提案書と、承認（approveCard）でカードが片づく', () => {
    const s = sellJam();
    s.cards = newCards();
    s.money = 5_000_000;
    cardsMonth(s, { ...s.reports[s.reports.length - 1], month: 99 });
    const c = cardInbox(s).find((x) => x.src === 'clerk' && x.kind === 'sell');
    if (!c) return;
    const k = c.choices.findIndex((x) => x.rec && x.act.k === 'do');
    const plan = planOfChoice(s, c, k)!;
    expect(plan.acts.length).toBeLessThanOrEqual(sizeOf(s, c));
    const r = approveCard(s, c.id, plan);
    expect(r.ok).toBe(true);
    expect(cardInbox(s).some((x) => x.id === c.id)).toBe(false);
  });
  it('手で選んだ変更（主力）も同じ applyPlan で実行する', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    const other = sh.shelves.find((x, k) => k > 0 && x) ?? s.slots.map((x) => x.sku).find((x) => x && x !== sh.shelves[0]);
    if (!other) return;
    expect(applyPlan(s, manualPlan([{ k: 'main', uid: b.uid, x: other }])).ok).toBe(true);
    expect(sh.shelves[0]).toBe(other);
    expect(sh.main).toBe(other);
  });
  it('「効く手」「この手を打つ」の文が画面に残っていない。月次報告と上の帯は「課題あり」', () => {
    const dir = 'src/island/p1';
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
      const code = readFileSync(join(dir, f), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code, f).not.toMatch(/t\([`'][^`']*効く手/);
      expect(code, f).not.toMatch(/この手を打つ/);
    }
    const report = readFileSync('src/island/p1/report.ts', 'utf8');
    expect(report).toContain("t('課題あり', 'Issue')");
    expect(report).toContain('担当者からの提案');
    expect(report).not.toMatch(/t\(`\[\[\$\{STAGE_NAME\[bn\]\}\]\]が詰まり/);
    const main = readFileSync('src/island/p1/main.ts', 'utf8');
    expect(main).toContain("h('small', '', t('課題あり', 'Issue'))");
  });
});

describe('製造と販売の連動（何を売るかは製造が決める）', () => {
  it('作る物を替えると、棚も自動で入れ替わる（前の商品は在庫を売り切るまで空いた棚に）。作っていない・在庫の無い商品は棚に残らない', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    const a = s.slots[0].sku!;
    const x = shelfPicks(s, b.uid).find((y) => y.ok)!.x;
    // 作っていない・どこにも在庫の無い商品を手で棚に置いても、次の日にはそろう
    const ghost = (['Goblet:C', 'Lantern:C', 'Ribbon:C', 'Scissors:C'] as Sku[]).find((y) => !s.slots.some((sl) => sl.sku === y) && !(s.stock[y] ?? 0) && !sh.shelves.includes(y))!;
    sh.shelves[0] = ghost;
    delete sh.shelf[ghost];
    delete sh.storage[ghost];
    syncShelves(s);
    expect(sh.shelves).not.toContain(ghost);
    // 作業台 1 を x に替えて、x ができた（工房に在庫）
    s.slots[0].sku = x;
    s.stock[x] = 10;
    syncShelves(s);
    expect(sh.shelves).toContain(x);
    // a の在庫が残っていて空いた棚があれば、売り切るまで残る
    const madeN = new Set(s.slots.map((y) => y.sku).filter(Boolean)).size;
    if (!s.slots.some((y) => y.sku === a) && madeN < sh.shelves.length && (sh.shelf[a] ?? 0) + (sh.storage[a] ?? 0) + (s.stock[a] ?? 0) > 0) expect(sh.shelves).toContain(a);
  });
  it('主力を決める：並んでいる商品を 1 番目の棚に（syncShelves でも保たれる）', () => {
    const s = sellJam();
    const b = myShops(s)[0];
    const sh = s.shops[b.uid];
    s.stock['Scissors:C'] = 10;
    s.slots[0].sku = 'Scissors:C';
    syncShelves(s);
    expect(setMain(s, b.uid, 'Scissors:C')).toBe(true);
    expect(sh.shelves[0]).toBe('Scissors:C');
    for (let k = 0; k < 3; k++) step(s);
    expect(sh.shelves[0]).toBe('Scissors:C');
  });
  it('チュートリアル（1 か月目）のあいだは棚を自動でそろえない（手で決める手順を変えない）', () => {
    const s = sellJam();
    s.tut = 9;
    const b = myShops(s)[0];
    s.shops[b.uid].shelves[0] = 'Goblet:C';
    expect(syncShelves(s)).toBe(0);
    expect(s.shops[b.uid].shelves[0]).toBe('Goblet:C');
  });
  it('セーブ：版 22。版 21 のセーブで製造と棚がずれていたら、読み込みで棚を製造に合わせる', () => {
    const s = sellJam();
    expect(s.v).toBe(23);
    const b = myShops(s)[0];
    const o = JSON.parse(serializeP1(s));
    o.v = 21;
    o.shops[b.uid].shelves[0] = 'Goblet:C';
    delete o.shops[b.uid].shelf['Goblet:C'];
    delete o.shops[b.uid].storage['Goblet:C'];
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(23);
    if (!back.slots.some((x) => x.sku === 'Goblet:C')) expect(back.shops[b.uid].shelves).not.toContain('Goblet:C');
  });
});

describe('A. 調達の交代要員（1 人がスタミナ切れでも調達が止まらない）', () => {
  it('パネル「調達の交代要員」で調達係の定員が 2 人。1 人目が休むと 2 人目が買い付けに出る', () => {
    const s = sellJam();
    expect(SKILL.relief).toBeTruthy();
    expect(buyCap(s)).toBe(1);
    const buyer = s.staff.find((x) => x.task === 'buy') ?? s.staff[0];
    buyer.task = 'buy';
    const other = s.staff.find((x) => x.hero !== buyer.hero && x.task !== 'buy')!;
    expect(postFree(s, other.hero, 'buy', null)).toBe(false);
    s.skills.push('relief');
    expect(buyCap(s)).toBe(2);
    expect(postFree(s, other.hero, 'buy', null)).toBe(true);
    other.task = 'buy';
    other.target = null;
    other.resting = false;
    other.stamina = other.stats.hp;
    buyer.resting = true;
    buyer.stamina = 0;
    s.buyTrip = null;
    s.money = 1e6;
    for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
    let went = false;
    for (let d = 0; d < 6 && !went; d++) {
      step(s);
      if ((s.buyTrip as { hero: number } | null)?.hero === other.hero) went = true;
    }
    expect(went).toBe(true);
  });
});

describe('B. 課題ありの見立て（流れが止まったとき）', () => {
  it('調達係が休んで素材が切れ、全段が止まった月は ① 調達（休み）を課題ありにし、宣伝を勧めない。止まった月に担当からカード', () => {
    const s = sellJam();
    const buyer = s.staff.find((x) => x.task === 'buy') ?? s.staff.find((x) => x.task == null) ?? s.staff[0];
    if (buyer.task !== 'buy') {
      buyer.task = 'buy';
      buyer.target = null;
    }
    for (const st of s.staff) if (st.task === 'buy') {
      st.resting = true;
      st.stamina = 0;
    }
    for (const m of Object.keys(s.mats)) s.mats[m as keyof typeof s.mats] = 0;
    s.orders = [];
    s.buyTrip = null;
    for (const sl of s.slots) sl.running = false;
    const st = stallOf(s)!;
    expect(st).toMatchObject({ stage: 'buy', why: 'rest' });
    const r = { ...s.reports[s.reports.length - 1], month: 99, flow: { bought: 0, made: 0, hauled: 0, sold: 0 }, stall: st };
    const d = stallDraft(s, r)!;
    expect(d.issue).toMatchObject({ k: 'stall', stage: 'buy', why: 'rest' });
    expect(d.choices.some((c) => c.act.k === 'do' && c.act.a.k === 'ad')).toBe(false);
    expect(d.choices.some((c) => c.act.k === 'do' && ((c.act.a.k === 'skill' && c.act.a.id === 'relief') || c.act.a.k === 'order' || c.act.a.k === 'assign'))).toBe(true);
    expect(d.force).toBe(true);
  });
  it('締めの報告：作った数も売れた数も 0 の月だけ stall を入れる（月末に一瞬止まっているだけの月は入れない）', () => {
    const s = sellJam();
    for (let k = 0; k < 40 && s.reports.length < 4; k++) step(s);
    const r = s.reports[s.reports.length - 1];
    if (r.flow && r.flow.made + r.flow.sold > 0) expect(r.stall).toBeUndefined();
    void endMonth;
  });
});

describe('お店の自走（店長が休む日も従業員で開く）', () => {
  it('従業員 2 人なら、店長が休んでいる日も売り場が開き、売る力は人数に応じて（店長がいる日より弱い）。地図の吹き出しは「従業員で営業」', () => {
    const s = sellJam();
    const b = myShops(s).find((x) => s.shops[x.uid].staff != null)!;
    const sh = s.shops[b.uid];
    const st = s.staff.find((x) => x.hero === sh.staff!)!;
    const on = sellNow(s).units;
    st.resting = true;
    sh.part = 1;
    const one = sellNow(s).units;
    sh.part = SELF_RUN.min;
    const two = sellNow(s).units;
    expect(two).toBeGreaterThanOrEqual(one);
    expect(facilityStatus(s, b)).toMatchObject({ stop: 'selfRun' });
    void on;
  });
  it('先月、店長が休む日に店を回す人がいなかったお店には、店長から「従業員 2 人いれば開けておける」の提案', () => {
    const s = sellJam();
    const b = myShops(s).find((x) => s.shops[x.uid].staff != null)!;
    const sh = s.shops[b.uid];
    sh.part = 0;
    sh.offLast = 4;
    const d = staffDraft(s)!;
    expect(d.kind).toBe('staff');
    expect(d.hero).toBe(sh.staff);
    const ch = d.choices.find((c) => c.act.k === 'do')!;
    expect(ch.act).toMatchObject({ k: 'do', a: { k: 'staff', uid: b.uid, n: SELF_RUN.min } });
    // 承認すると（控室が要れば増設して）従業員が 2 人に
    s.money = 1e6;
    if (ch.act.k !== 'do') throw new Error('act');
    const plan = planOf(s, [ch.act.a]);
    expect(applyPlan(s, plan).ok).toBe(true);
    expect(sh.part).toBe(SELF_RUN.min);
    expect(stepsOf(s, { k: 'staff', uid: b.uid, n: 3 }).steps.length).toBeGreaterThanOrEqual(1);
  });
});

describe('設計の考え方：ゲームが進むほど、担当者から受ける提案の割合が増える', () => {
  it('時間を止めて出す上限は町のランク ＋ ★3 の担当がいれば +1。提案書 1 枚で変える打ち手の数は ランク × ★', () => {
    const s = sellJam();
    for (const st of s.staff) {
      st.level = 1;
      st.stats = { ...st.stats, int: 10, agi: 10, phy: 10 };
    }
    expect(capOf(s)).toBe(CARD.cap.C);
    const st = s.staff.find((x) => x.task != null)!;
    st.level = 40;
    st.stats = { ...st.stats, int: 100, agi: 100, phy: 100 };
    expect(quality(st, 'logistics')).toBeGreaterThanOrEqual(CARD.star.three.q);
    expect(capOf(s)).toBe(CARD.cap.C + CARD.capStar);
    expect(sizeOf(s, { hero: st.hero, q: 0.95 })).toBe(CARD.size.C);
    s.tier = 'R';
    expect(sizeOf(s, { hero: st.hero, q: 0.95 })).toBe(3);
    expect(sizeOf(s, { hero: st.hero, q: 0.7 })).toBe(2);
    expect(sizeOf(s, { hero: null, q: 0.7 })).toBe(1);
  });
});
