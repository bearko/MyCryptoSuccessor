// 段 I1（docs/SUCCESSOR_ROADMAP.md「段 I1 の実装」）：Rare からの「予算で任せる」。
// 開く時期・部長を置ける部門・予算の段と数字・従業員の給料と労力・予算の効き（★・適性）・部長が予算の中で施策を実行する・予算と人手が足りないときの頼みとカード・
// セーブの版（23・24 → 25）・止めたとき（BUDGET_OFF）は段 I1 の前と同じ・画面の数
import { beforeAll, describe, expect, it } from 'vitest';
import { BUDGET, DEPTS, DEPT_SKILLS, SKILL, isResearch, type DeptId } from '../src/island/p1/data';
import {
  BUDGET_OFF,
  amountFor,
  amountOf,
  budgetClose,
  budgetDay,
  budgetDepts,
  budgetLine,
  budgetOpen,
  budgetTry,
  costNeed,
  crewWageMonth,
  deptBudget,
  effOf,
  handOf,
  headStar,
  laborCap,
  laborNeed,
  nextMoves,
  nextUp,
  restOf,
  setBudget,
  setBudgets,
  setCrewCap,
} from '../src/island/p1/budget';
import { headLeft, headOf, newDeleg, quality, setHead, type Proposal } from '../src/island/p1/deleg';
import { cardInbox, cardsMonth, choiceText, chooseCard, sayLength, sayOf, type Card } from '../src/island/p1/card';
import { CARD } from '../src/island/p1/data';
import { deserializeP1, newP1, serializeP1, skillLock, step, type P1State } from '../src/island/p1/model';
import { orgChart } from '../src/island/p1/org';
import { subCount, subDefs } from '../src/island/p1/menus';
import { menuDepts } from '../src/island/p1/dept';
import { runOnce } from '../scripts/island/sim';
import { BUDGET_TALK, TALK_MAX, deptTalkNext, freeUi, talkLen } from '../src/island/p1/mine';

/** 通常の自動プレイで、Rare の町に着いて 2 回目の締めのあとの写し（部長が予算で動いている） */
let rare = '';
beforeAll(() => {
  try {
    runOnce('normal', 1, {
      onMonth: (s, _sector, m) => {
        if (s.tier === 'R' && m >= 2) {
          rare = serializeP1(s);
          throw new Error('stop');
        }
      },
    });
  } catch (e) {
    if ((e as Error).message !== 'stop') throw e;
  }
}, 600_000);
const load = () => deserializeP1(rare)!;
/** いま取れる物流のお金のパネル（お金だけが要る） */
function panelFor(s: P1State): string {
  const k = DEPT_SKILLS.logistics.find((x) => !s.skills.includes(x.id) && x.cost > 0 && !isResearch(x) && skillLock(s, x) == null);
  if (!k) throw new Error('no panel');
  return k.id;
}

/** Rare の町（まっさらな区画・先月の売上 1,000,000 G） */
function town(): P1State {
  const s = newP1(7, 'R', 'r1');
  s.tut = 99;
  s.open = 0;
  s.day = 60;
  s.money = 5e6;
  s.reports.push({ month: 2, revenue: 1_000_000, bySeries: {}, costs: { materials: 0, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 3, news: [] });
  return s;
}

describe('開く時期と部長を置ける部門', () => {
  it('Common・Uncommon は開かない（理解度 8 のまま）。会社が Rare に出店すると開き、理解度に関係なく部長を置ける（経営企画は社長）', () => {
    const c = newP1(1);
    expect(budgetOpen(c)).toBe(false);
    expect(headLeft(c, 'hr')).toBeGreaterThan(0);
    const s = town();
    expect(budgetOpen(s)).toBe(true);
    for (const d of budgetDepts(s)) expect(headLeft(s, d)).toBe(0);
    expect(budgetDepts(s)).not.toContain('strategy');
    expect(setHead(s, 'hr', s.staff[0].hero)).toBeNull();
    expect(headOf(s, 'hr')?.hero).toBe(s.staff[0].hero);
  });
  it('止めると（BUDGET_OFF）段 I1 の前と同じ：開かない・部長は理解度 8 から', () => {
    const s = town();
    BUDGET_OFF.on = true;
    try {
      expect(budgetOpen(s)).toBe(false);
      expect(headLeft(s, 'hr')).toBeGreaterThan(0);
    } finally {
      BUDGET_OFF.on = false;
    }
  });
});

describe('予算の段と数字', () => {
  it('段は先月の売上 × 小 2%・中 5%・大 10%（下限あり・1,000 G に丸める）。はじめは「中」', () => {
    const s = town();
    expect(amountFor(s, 'S')).toBe(20_000);
    expect(amountFor(s, 'M')).toBe(50_000);
    expect(amountFor(s, 'L')).toBe(100_000);
    expect(deptBudget(s, 'logistics').lv).toBe('M');
    expect(amountOf(s, 'logistics')).toBe(50_000);
    // 売上の小さい月は、下限を「中」にして小・大は同じ比で（段どうしが同じ額にならない）
    s.reports[s.reports.length - 1].revenue = 10_000;
    expect(amountFor(s, 'M')).toBe(BUDGET.floor.R);
    expect(amountFor(s, 'S')).toBe(8_000);
    expect(amountFor(s, 'L')).toBe(40_000);
  });
  it('数字でも決められる（0〜上限・丸め）。まとめて決める関数（段 I2 の経営会議も使う）', () => {
    const s = town();
    setBudget(s, 'marketing', 'X', 123_456);
    expect(amountOf(s, 'marketing')).toBe(123_000);
    setBudget(s, 'marketing', 'X', -5);
    expect(amountOf(s, 'marketing')).toBe(0);
    setBudgets(s, { hr: { lv: 'L' }, rnd: { lv: 'S' } });
    expect(amountOf(s, 'hr')).toBe(100_000);
    expect(amountOf(s, 'rnd')).toBe(20_000);
    // 1 段上：小 → 中 → 大 → 数字（1.5 倍）
    expect(nextUp(s, 'rnd')).toEqual({ lv: 'M', to: 50_000 });
    expect(nextUp(s, 'hr')).toEqual({ lv: 'X', amt: 150_000, to: 150_000 });
    // 頼みの施策の費用に届く段：小の部門で 80,000 G の施策 → 大（100,000 G）
    expect(nextUp(s, 'rnd', 80_000)).toEqual({ lv: 'L', to: 100_000 });
    expect(nextUp(s, 'rnd', 300_000)).toEqual({ lv: 'X', amt: 300_000, to: 300_000 });
  });
});

describe('従業員・労力・予算の効き', () => {
  it('従業員の給料は毎日（その部門の予算から・人件費として帳簿へ）。上限を下げると、その場で減らす', () => {
    const s = town();
    setHead(s, 'hr', s.staff[0].hero);
    const B = deptBudget(s, 'hr');
    B.crew = 2;
    const m0 = s.money;
    budgetDay(s);
    expect(m0 - s.money).toBe(2 * BUDGET.crew.wage);
    expect(B.used).toBe(2 * BUDGET.crew.wage);
    expect(s.monthCost.wages).toBe(2 * BUDGET.crew.wage);
    expect(crewWageMonth()).toBe(BUDGET.crew.wage * 30);
    setCrewCap(s, 'hr', 1);
    expect(B.crew).toBe(1);
    expect(B.cap).toBe(1);
    setCrewCap(s, 'hr', 999);
    expect(B.cap).toBe(BUDGET.crew.capMax);
  });
  it('労力＝部長の手（★ で増える）＋ 従業員 × 20 人日。★・適性が高いほど効きが大きい（費用・労力が小さい）', () => {
    const s = town();
    const st = s.staff[0];
    setHead(s, 'logistics', st.hero);
    const star = headStar(s, 'logistics')!;
    expect(handOf(s, 'logistics')).toBe(BUDGET.hand.base + BUDGET.hand.star * (star - 1));
    deptBudget(s, 'logistics').crew = 2;
    expect(laborCap(s, 'logistics')).toBe(handOf(s, 'logistics') + 2 * BUDGET.crew.labor);
    const e1 = effOf(s, 'logistics');
    // Lv と能力値を上げて ★3 に
    st.level = 40;
    st.stats = { ...st.stats, agi: 100, int: 100, phy: 100 };
    expect(quality(st, 'logistics')).toBeGreaterThanOrEqual(CARD.star.three.q);
    expect(headStar(s, 'logistics')).toBe(3);
    const e3 = effOf(s, 'logistics');
    expect(e3).toBeGreaterThan(e1);
    expect(costNeed(s, 'logistics', 100_000)).toBeLessThan(100_000);
    expect(laborNeed(s, 'logistics', { k: 'build' })).toBeLessThanOrEqual(BUDGET.labor.build);
    expect(handOf(s, 'logistics')).toBe(BUDGET.hand.base + 2 * BUDGET.hand.star);
  });
});

describe('部長が予算の中で施策を実行する（通常の自動プレイの写し）', () => {
  it('Rare の町では、部長のいる部門が予算の中で施策を実行している（費用と労力の記録・報告の 1 行）', () => {
    const s = load();
    expect(s.v).toBe(27);
    expect(budgetOpen(s)).toBe(true);
    expect(s.budget!.stat.acts).toBeGreaterThan(0);
    const heads = budgetDepts(s).filter((d) => headOf(s, d));
    expect(heads.length).toBeGreaterThan(0);
    const acted = heads.flatMap((d) => [...(deptBudget(s, d).last?.acts ?? []), ...deptBudget(s, d).acts]);
    expect(acted.length).toBeGreaterThan(0);
    for (const x of acted) {
      expect(x.cost).toBeGreaterThanOrEqual(0);
      expect(x.labor).toBeGreaterThanOrEqual(1);
    }
    // 予算を超えて使っていない（施策と、これから払う給料）
    for (const d of heads) expect(deptBudget(s, d).last?.used ?? 0).toBeLessThanOrEqual((deptBudget(s, d).last?.amt ?? amountOf(s, d)) + BUDGET.crew.wage * 30 * BUDGET.crew.capMax);
    const r = s.reports[s.reports.length - 1];
    expect(r.budget?.depts.length).toBeGreaterThan(0);
    expect(budgetLine(r)?.[0]).toMatch(/予算で任せた|budgeted/);
  });
  it('次に打ちたい施策は、費用（G）と労力（人日）と「予算の中／予算オーバー／人手不足」を出す', () => {
    const s = load();
    // 自動プレイは打てる施策をほぼ打ち切っているので、空でもよい（形だけ確かめる）
    const d = budgetDepts(s).find((x) => headOf(s, x))!;
    for (const m of nextMoves(s, d)) {
      expect(m.cost).toBeGreaterThanOrEqual(0);
      expect(m.labor).toBeGreaterThanOrEqual(1);
      expect(['ok', 'over', 'labor', 'hire']).toContain(m.fit);
    }
  });
  it('予算 0 では実行せず「予算を増やしてください」の頼み → カード（月 1 枚）。予算を上げると、その施策を実行する', () => {
    const s = load();
    const d: DeptId = 'logistics';
    expect(headOf(s, d)).toBeTruthy();
    setBudget(s, d, 'X', 0);
    const sk = panelFor(s);
    const D = (s.deleg ??= newDeleg());
    const p: Proposal = { id: ++D.seq, dept: d, hero: headOf(s, d)!.hero, month: s.reports[s.reports.length - 1].month, sector: s.sector, act: { k: 'skill', id: sk }, est: 5000, err: 0.1, unit: 'G', cost: SKILL[sk].cost, status: 'new' };
    expect(budgetTry(s, p)).toBe('over');
    D.inbox.push(p);
    expect(deptBudget(s, d).ask?.why).toMatch(/over|spent|idle/);
    // カード：部長からの頼み（予算を上げる・今回だけ承認・このまま）
    s.cards!.mk++;
    const before = cardInbox(s).length;
    cardsMonth(s, s.reports[s.reports.length - 1]);
    const c = cardInbox(s).find((x: Card) => x.src === 'budget')!;
    expect(c).toBeTruthy();
    expect(cardInbox(s).length).toBeGreaterThan(before - 1);
    expect(c.choices.map((x) => x.act.k)).toEqual(expect.arrayContaining(['budget', 'skip']));
    expect(sayLength(s, c)).toBeLessThanOrEqual(CARD.sayMax);
    for (const ch of c.choices) expect(choiceText(s, c, ch).label.length).toBeGreaterThan(0);
    expect(sayOf(s, c)).toBeTruthy();
    // 予算を上げる → その場で施策を実行
    setBudget(s, d, 'X', 0);
    const k = c.choices.findIndex((x) => x.act.k === 'budget');
    (c.choices[k].act as { lv: string; amt?: number }).lv = 'X';
    (c.choices[k].act as { lv: string; amt?: number }).amt = 9_000_000;
    const m0 = s.money;
    const res = chooseCard(s, c.id, k);
    expect(res.ok).toBe(true);
    expect(amountOf(s, d)).toBe(9_000_000);
    expect(deptBudget(s, d).acts.some((x) => x.pid === p.id) || s.money < m0).toBe(true);
  });
  it('人手が足りないとき（上限 0）は「人を雇わせてください」。上限の中なら部長が雇って実行する', () => {
    const s = load();
    const d: DeptId = 'logistics';
    setBudget(s, d, 'X', 9_000_000);
    setCrewCap(s, d, 0);
    const B = deptBudget(s, d);
    B.labor = laborCap(s, d); // 部長の手を使い切った
    const sk = panelFor(s);
    const D = (s.deleg ??= newDeleg());
    const mk = (): Proposal => ({ id: ++D.seq, dept: d, hero: headOf(s, d)!.hero, month: 1, sector: s.sector, act: { k: 'skill', id: sk }, est: 1000, err: 0.1, unit: 'G', cost: SKILL[sk].cost, status: 'new' });
    expect(budgetTry(s, mk())).toBe('labor');
    expect(B.ask?.why).toBe('labor');
    B.ask = null;
    setCrewCap(s, d, 5);
    const crew0 = B.crew;
    const r = budgetTry(s, mk());
    expect(r).toBe('done');
    expect(B.crew).toBeGreaterThan(crew0);
    expect(B.acts.some((x) => x.labor >= 1)).toBe(true);
  });
  it('月の締め：今月を「先月」へ移して 0 から。労力の余る月が続くと 1 人減らす', () => {
    const s = load();
    const d = budgetDepts(s).find((x) => headOf(s, x))!;
    const B = deptBudget(s, d);
    B.crew = 2;
    B.labor = 0;
    B.used = 1234;
    budgetClose(s);
    expect(B.last?.used).toBe(1234);
    expect(B.used).toBe(0);
    budgetClose(s);
    expect(B.crew).toBe(1);
  });
});

describe('マインちゃんの紹介', () => {
  it('Rare に届いて営業の紹介のあと 1 回「予算で任せる」。セリフは 60 字まで', () => {
    for (const x of BUDGET_TALK()) expect(talkLen(x)).toBeLessThanOrEqual(TALK_MAX);
    const s = load();
    s.flags.talkDay = -1;
    s.flags.footTalk = true;
    s.flags.salesTalk = true;
    s.flags.acctTalk = true;
    s.flags.csTalk = true;
    s.flags.budgetTalk = false;
    s.tut = 99;
    const ui = freeUi();
    expect(deptTalkNext(s, ui, { intro: false, reset: false })).toBe('budget');
    s.flags.budgetTalk = true;
    expect(deptTalkNext(s, ui, { intro: false, reset: false })).not.toBe('budget');
  });
});

describe('組織図・画面の数・セーブ', () => {
  it('組織図：Rare からは部門ごとの従業員と予算（使った／月）', () => {
    const s = load();
    const o = orgChart(s);
    const withHead = o.depts.find((x) => x.head.hero != null && !x.byCeo)!;
    expect(withHead.nums?.amt).toBe(amountOf(s, withHead.dept));
    expect(o.depts.find((x) => x.byCeo)?.nums).toBeUndefined();
    expect(orgChart(newP1(1)).depts.every((x) => !x.nums)).toBe(true);
  });
  it('予算の画面（経営企画 → 予算）は Rare（営業が開く）から。Common の画面の数は変えない', () => {
    const COMMON: DeptId[] = ['logistics', 'strategy', 'hr', 'rnd', 'marketing', 'systems'];
    expect(subDefs('strategy', COMMON).some((x) => x.key === 'budget')).toBe(false);
    expect(subDefs('strategy', DEPTS.map((d) => d.id)).some((x) => x.key === 'budget')).toBe(true);
    expect(subCount(COMMON)).toBe(21);
    expect(subCount(DEPTS.map((d) => d.id))).toBe(30);
    const s = load();
    expect(menuDepts(s)).toContain('sales');
  });
  it('セーブの版：23・24 のセーブは 25 を通って 26 へ（予算は空から＝はじめて使うときに「中」。段 I2 で 26）。26 はそのまま', () => {
    const s = newP1(3);
    for (const v of [23, 24] as const) {
      const o = JSON.parse(serializeP1(s));
      o.v = v;
      delete o.budget;
      const x = deserializeP1(JSON.stringify(o))!;
      expect(x.v).toBe(27);
      expect(x.budget).toBeUndefined();
    }
    const y = load();
    const back = deserializeP1(serializeP1(y))!;
    expect(back.v).toBe(27);
    expect(back.budget).toEqual(y.budget);
  });
  it('日を進めても壊れない（Rare の写しで 40 日）', () => {
    const s = load();
    const m = s.reports.length;
    for (let i = 0; i < 40; i++) step(s);
    expect(s.reports.length).toBeGreaterThan(m);
    for (const d of budgetDepts(s)) expect(restOf(s, d)).toBeGreaterThanOrEqual(0);
  });
});
