// 段 I2（docs/SUCCESSOR_ROADMAP.md「段 I2 の実装」）：経営会議と社内監査。
// 議題（話し手・予実・計画・必要予算・その他の要求）・推奨・決める（承認・増減・目標・一括）・士気の目標の 1 項目「目標の重さ」・労力と施策の数の押し上げ・
// 期末の結果・社内監査（経理部長の ★ で見抜く）・RP の否認・自動プレイは推奨・止めたとき（BOARD_OFF）・セーブの版（25 → 26）・セリフ 60 字
import { beforeAll, describe, expect, it } from 'vitest';
import { BOARD, BUDGET, MANAGER, type DeptId } from '../src/island/p1/data';
import {
  BOARD_FINISH_HOOKS,
  BOARD_OFF,
  askLine,
  isYearOpening,
  yearOfBoard,
  auditorOf,
  boardAgenda,
  boardAuto,
  boardDue,
  boardFinish,
  boardOf,
  boardQuarter,
  budgetOpts,
  decide,
  goalMorale,
  laborPush,
  otherLine,
  perHeadOf,
  planLine,
  reportLine,
  sectorHeads,
  sectorPush,
  type BoardItem,
} from '../src/island/p1/board';
import { amountOf, budgetDepts, budgetTry, deptBudget, laborCap, setBudget } from '../src/island/p1/budget';
import { headOf, setHead, type Proposal } from '../src/island/p1/deleg';
import { moraleParts } from '../src/island/p1/hr';
import { deserializeP1, newP1, serializeP1, type P1State } from '../src/island/p1/model';
import { runOnce } from '../scripts/island/sim';
import { TALK_MAX, talkLen } from '../src/island/p1/mine';
import { loadVoice } from '../src/island/p1/voice';

/** 通常の自動プレイで、Rare の町に着いて 2 回目の締めのあとの写し（部長が予算で動いている） */
let rare = '';
/** 同じ通しの終わりの経営会議の数え（自動プレイは全部「推奨」） */
let stat: ReturnType<typeof boardOf>['stat'] | null = null;
beforeAll(async () => {
  await loadVoice();
  const r = runOnce('normal', 1, {
    onMonth: (s, _sector, m) => {
      if (!rare && s.tier === 'R' && m >= 2) rare = serializeP1(s);
    },
  });
  stat = r.v32 ?? null;
}, 900_000);
const load = () => deserializeP1(rare)!;
/** 議題を作る（四半期の締めと同じ）。部長を 2 人以上にそろえる */
function withAgenda(): P1State {
  const s = load();
  const free = s.staff.filter((x) => x.task == null && !x.heads?.length);
  for (const d of budgetDepts(s)) {
    if (headOf(s, d)) continue;
    const st = free.shift();
    if (st) setHead(s, d, st.hero);
  }
  const m = Math.round(s.day / 30);
  boardQuarter(s, Math.floor(m / 3), m);
  return s;
}
const deptItem = (s: P1State, d?: DeptId) => boardOf(s).agenda!.items.find((x) => x.kind === 'dept' && (!d || x.dept === d))!;

describe('議題と推奨', () => {
  it('四半期の締めで、部長のいる部門ごとに「予実 → 計画 → 必要予算」の議題ができ、どの選択肢にも推奨がある（推奨を選んだ状態から）', () => {
    const s = withAgenda();
    expect(boardDue(s)).toBe(true);
    const A = boardOf(s).agenda!;
    const heads = budgetDepts(s).filter((d) => headOf(s, d));
    expect(A.items.filter((x) => x.kind === 'dept').map((x) => x.dept)).toEqual(heads);
    for (const it of A.items) {
      expect(it.pick).toEqual(it.rec);
      expect(it.rec.plan).toBe(0);
      expect(it.plan.rep).toBeGreaterThanOrEqual(it.plan.f);
      expect(it.ask.cur).toBe(it.kind === 'dept' ? amountOf(s, it.dept!) : it.ask.cur);
      if (!it.ask.up) expect(it.rec.budget).toBe(0);
    }
  });
  it('セリフは 60 字まで（予実・計画・必要予算・その他）', () => {
    const s = withAgenda();
    for (const it of boardOf(s).agenda!.items) for (const x of [reportLine(it), planLine(it), askLine(it), otherLine(it)]) if (x) expect(talkLen(x), x).toBeLessThanOrEqual(TALK_MAX);
  });
  it('増額の要求：前の目標に届いた部長は承認を推奨、届いていない・初めての会議は据え置き（減額の選択肢がいまの額）を推奨', () => {
    const s = withAgenda();
    const d = deptItem(s).dept!;
    const m = Math.round(s.day / 30);
    deptBudget(s, d).qask = 2;
    const A = boardOf(s);
    A.last = [{ key: `d:${d}`, hero: headOf(s, d)!.hero, q: 1, raise: 0, target: 100, targetRep: 100, got: 200, claimed: 200, ok: true, okRep: true }];
    A.agenda = boardAgenda(s, 9, m);
    const it = deptItem(s, d);
    expect(it.ask.up).toBe(true);
    expect(it.ask.amt).toBeGreaterThan(it.ask.cur);
    expect(it.rec.budget).toBe(0);
    A.last = [];
    A.agenda = boardAgenda(s, 9, m);
    const it2 = deptItem(s, d);
    expect(it2.rec.budget).toBe(2);
    expect(budgetOpts(it2)[2]).toBe(it2.ask.cur);
  });
});

describe('決める（承認・増減・目標・一括）', () => {
  it('承認（据え置き）は予算の段をそのまま・増額は +20%・減額は −20%（数字の予算。段 I1 の setBudget）', () => {
    const s = withAgenda();
    const its = boardOf(s).agenda!.items.filter((x) => x.kind === 'dept' && !x.ask.up);
    const [a, b, c] = its;
    expect(c).toBeTruthy();
    const lvA = deptBudget(s, a.dept!).lv;
    decide(s, a, { plan: 0, budget: 0, other: 0 });
    expect(deptBudget(s, a.dept!).lv).toBe(lvA);
    const curB = b.ask.cur;
    decide(s, b, { plan: 0, budget: 1, other: 0 });
    expect(deptBudget(s, b.dept!).lv).toBe('X');
    expect(amountOf(s, b.dept!)).toBe(Math.round((curB * 1.2) / BUDGET.round) * BUDGET.round);
    const curC = c.ask.cur;
    decide(s, c, { plan: 0, budget: 2, other: 0 });
    expect(amountOf(s, c.dept!)).toBe(Math.round((curC * 0.8) / BUDGET.round) * BUDGET.round);
    expect(boardOf(s).goals[b.key].up).toBeCloseTo(0.2, 1);
    expect(boardOf(s).goals[c.key].up).toBeCloseTo(-0.2, 1);
  });
  it('見込みが 0 の計画は上げられない（目標の上乗せは 0 のまま）', () => {
    const s = withAgenda();
    const it = deptItem(s);
    it.plan.f = 0;
    decide(s, it, { plan: 2, budget: 0, other: 0 });
    expect(boardOf(s).goals[it.key].raise).toBe(0);
    expect(laborPush(s, it.dept!)).toBe(1);
  });
  it('目標 +20%：労力 ×1.2・月の施策 +1・士気の目標に「目標の重さ」−10（予算も上げれば −4）。期末に届かなければ士気 −3', () => {
    const s = withAgenda();
    const it = deptItem(s);
    // 見込みのある計画（見込み 0 の計画は上げられない）
    it.plan.f = Math.max(it.plan.f, 10_000);
    const d = it.dept!;
    const cap0 = laborCap(s, d);
    const H = headOf(s, d)!;
    const m0 = moraleParts(s, H).total;
    decide(s, it, { plan: 2, budget: 0, other: 0 });
    expect(laborPush(s, d)).toBeCloseTo(1.2);
    expect(laborCap(s, d)).toBe(Math.round(cap0 * 1.2));
    expect(perHeadOf(s, d)).toBe(BUDGET.perHead + 1);
    expect(goalMorale(s, H.hero)).toBe(-BOARD.morale.per10 * 2);
    expect(moraleParts(s, H).goal).toBe(-10);
    expect(moraleParts(s, H).total).toBeCloseTo(Math.max(0, m0 - 10), 5);
    // 予算も同じだけ上げた：重さは × eased
    boardOf(s).goals[it.key].up = 0.2;
    expect(goalMorale(s, H.hero)).toBe(-4);
    // 予算だけ上げた：+（upMax まで）・予算を削った：−cut × 10% ごと
    boardOf(s).goals[it.key] = { ...boardOf(s).goals[it.key], raise: 0, up: 0.2 };
    expect(goalMorale(s, H.hero)).toBe(4);
    boardOf(s).goals[it.key] = { ...boardOf(s).goals[it.key], raise: 0, up: -0.2 };
    expect(goalMorale(s, H.hero)).toBe(-6);
    // 期末：目標 +20% に届かない（実績 0）→ 士気 −3、結果は「届かなかった」
    boardOf(s).goals[it.key] = { ...boardOf(s).goals[it.key], raise: 0.2, up: 0, f: 10_000, rep: 12_000 };
    boardFinish(s, 'one');
    deptBudget(s, d).qv = 0;
    const before = H.morale ?? 70;
    const m = Math.round(s.day / 30);
    const c = boardQuarter(s, Math.floor(m / 3) + 1, m + 3)!;
    expect(c.missed).toBeGreaterThanOrEqual(1);
    const r = boardOf(s).last.find((x) => x.key === it.key)!;
    expect(r.ok).toBe(false);
    expect(r.target).toBe(12_000);
    expect(H.morale).toBeCloseTo(Math.max(0, before + BOARD.morale.miss), 5);
    // 締めたら目標の重さは消える
    expect(goalMorale(s, H.hero)).toBe(0);
  });
  it('期末の実績は、予算の中で実行した施策の本当の見込み（G に直した値）。報告は盛りつき', () => {
    const s = withAgenda();
    boardFinish(s, 'one');
    const it = Object.values(boardOf(s).goals)[0];
    const d = it.key.slice(2) as DeptId;
    deptBudget(s, d).qv = it.f * 2 + 1;
    const m = Math.round(s.day / 30);
    boardQuarter(s, 99, m + 3);
    const r = boardOf(s).last.find((x) => x.key === it.key)!;
    expect(r.ok).toBe(true);
    expect(r.got).toBe(Math.round(it.f * 2 + 1));
    expect(r.claimed).toBe(Math.round(r.got * (1 + it.pad)));
  });
  it('一括承認：残り全員を推奨で決めて会議を閉じる（1 タップ）', () => {
    const s = withAgenda();
    const n = boardOf(s).agenda!.items.length;
    decide(s, boardOf(s).agenda!.items[0], { plan: 1, budget: 0, other: 0 });
    const items = boardFinish(s, 'bulk');
    expect(items.every((x) => x.done)).toBe(true);
    expect(items.slice(1).every((x) => JSON.stringify(x.pick) === JSON.stringify(x.rec))).toBe(true);
    expect(boardOf(s).agenda).toBeNull();
    expect(boardOf(s).stat.bulk).toBe(1);
    expect(boardOf(s).stat.items).toBe(n);
    expect(boardOf(s).stat.changed).toBe(1);
    expect(Object.keys(boardOf(s).goals)).toHaveLength(n);
  });
  it('開かないまま次の四半期の締めが来たら、推奨で決めてから新しい会議（自動）', () => {
    const s = withAgenda();
    const m = Math.round(s.day / 30);
    boardQuarter(s, Math.floor(m / 3) + 1, m + 3);
    expect(boardOf(s).stat.auto).toBe(1);
    expect(boardOf(s).agenda).not.toBeNull();
  });
});

describe('その他の要求', () => {
  it('RP の使用を否認した部門は、この四半期は RP の施策を打たない（次の候補へ）。四半期の締めで戻る', () => {
    const s = withAgenda();
    const d = deptItem(s).dept!;
    const B = deptBudget(s, d);
    B.noRp = true;
    setBudget(s, d, 'X', 9_000_000);
    s.money = 1e8;
    s.rp = 1e6;
    const p: Proposal = { id: 999, dept: d, hero: headOf(s, d)!.hero, month: 1, act: { k: 'skill', id: 'x' }, est: 1000, err: 0.1, unit: 'G', cost: 1000, rp: 10, status: 'new' };
    expect(budgetTry(s, p)).toBe('skip');
    const m = Math.round(s.day / 30);
    boardQuarter(s, 50, m);
    expect(deptBudget(s, d).noRp).toBeUndefined();
  });
  it('部長のいない部門へのヒーローの追加：承認で setHead（推奨は部門の理解度 8 から）', () => {
    const s = load();
    // 部長のいない部門を 1 つ残し、待機中のヒーローを 1 人作る
    const empty = budgetDepts(s).find((d) => !headOf(s, d))!;
    expect(empty).toBeTruthy();
    const st = s.staff.find((x) => !x.heads?.length && x.task !== 'manager')!;
    st.task = null;
    st.target = null;
    st.resting = false;
    const m = Math.round(s.day / 30);
    boardQuarter(s, Math.floor(m / 3), m);
    const it = boardOf(s).agenda?.items.find((x) => x.other?.k === 'hero');
    expect(it).toBeTruthy();
    const o = it!.other as Extract<BoardItem['other'], { k: 'hero' }>;
    expect(it!.rec.other).toBe(o.lvl >= BOARD.heroAt ? 0 : 1);
    decide(s, it!, { plan: 0, budget: 0, other: 0 });
    expect(headOf(s, o.dept)?.hero).toBe(o.hero);
  });
});

describe('社内監査', () => {
  it('経理部長がいれば監査がある。★ の下限より大きい盛りは指摘（盛った報告・甘い計画）。監査があれば推奨も監査の数字で', () => {
    const s = withAgenda();
    const au = auditorOf(s);
    if (!budgetDepts(s).includes('accounting')) return;
    expect(au?.hero).toBe(headOf(s, 'accounting')?.hero ?? undefined);
    const A = boardOf(s).agenda!;
    for (const it of A.items) {
      if (!au || it.hero === au.hero) {
        expect(it.audit).toBeNull();
        continue;
      }
      const see = BOARD.audit.see[au.star];
      expect(it.audit!.plan).toBe(it.plan.f > 0 && it.pads.plan >= see);
    }
  });
  it('盛りは出来が低いほど大きい（(1 − 出来) × pad × 0.4〜1）', () => {
    const s = withAgenda();
    for (const it of boardOf(s).agenda!.items) {
      expect(it.pads.plan).toBeGreaterThanOrEqual(0);
      expect(it.pads.plan).toBeLessThanOrEqual(BOARD.pad * 0.6 + 1e-9);
    }
  });
});

describe('セクター長', () => {
  it('ほかの町のセクター長も話し手になる。予算は投資の割合（承認・1 段上・1 段下）、目標の上乗せは売上の倍率に', () => {
    const s = withAgenda();
    const id = s.land!.mine.find((x) => x !== s.land!.cur && s.land!.recs[x]);
    if (!id) return;
    const rec = s.land!.recs[id];
    const st = s.staff.find((x) => !x.heads?.length && x.task !== 'manager')!;
    st.task = 'manager';
    st.target = id;
    rec.manager = st.hero;
    rec.revive = undefined;
    rec.base ??= { rev: 200_000, matRate: 0.4, fixed: 20_000 };
    rec.invest = MANAGER.choices[1];
    expect(sectorHeads(s).some((x) => x.id === id)).toBe(true);
    const m = Math.round(s.day / 30);
    boardOf(s).agenda = null;
    boardQuarter(s, Math.floor(m / 3), m);
    const it = boardOf(s).agenda!.items.find((x) => x.sector === id)!;
    expect(it.kind).toBe('sector');
    expect(budgetOpts(it)).toEqual([MANAGER.choices[1], MANAGER.choices[2], MANAGER.choices[0]]);
    it.plan.f = Math.max(it.plan.f, 10_000);
    decide(s, it, { plan: 2, budget: 1, other: 0 });
    expect(rec.invest).toBe(MANAGER.choices[2]);
    expect(sectorPush(s, id)).toBeCloseTo(0.2 * BOARD.push.sector);
  });
});

describe('自動プレイと止めたとき', () => {
  it('自動プレイは会議を全部「推奨」で決める（目標の上乗せ 0・推奨と違う選択 0）', () => {
    expect(stat).not.toBeNull();
    expect(stat!.held).toBeGreaterThan(0);
    expect(stat!.auto).toBe(stat!.held);
    expect(stat!.changed).toBe(0);
    expect(stat!.plan[1] + stat!.plan[2]).toBe(0);
    const s = withAgenda();
    const items = boardAuto(s);
    expect(items.every((x) => JSON.stringify(x.pick) === JSON.stringify(x.rec))).toBe(true);
  });
  it('止めると（BOARD_OFF）会議を作らず、目標も効かない（段 I2 の前と同じ）', () => {
    const s = withAgenda();
    const it = deptItem(s);
    decide(s, it, { plan: 2, budget: 0, other: 0 });
    BOARD_OFF.on = true;
    try {
      expect(laborPush(s, it.dept!)).toBe(1);
      expect(perHeadOf(s, it.dept!)).toBe(BUDGET.perHead);
      expect(goalMorale(s, it.hero)).toBe(0);
      expect(boardDue(s)).toBe(false);
      expect(boardQuarter(s, 70, 210)).toBeNull();
    } finally {
      BOARD_OFF.on = false;
    }
  });
  it('Common の町（予算で任せるの前）では会議を作らない', () => {
    const s = newP1(2);
    expect(boardQuarter(s, 1, 3)).toBeNull();
    expect(s.board).toBeUndefined();
  });
});

describe('段 K へのつなぎ口', () => {
  it('年初の回は四半期 1・5・9…（会社の年の最初の四半期）。何年目か', () => {
    expect([1, 2, 4, 5, 9, 12].map((q) => isYearOpening({ q }))).toEqual([true, false, false, true, true, false]);
    expect([1, 4, 5, 9].map((q) => yearOfBoard({ q }))).toEqual([1, 1, 2, 3]);
  });
  it('会議を閉じる前のフック：どの閉じ方でも、推奨で決める前に 1 回呼ばれる', () => {
    const s = withAgenda();
    const seen: string[] = [];
    const f = (_s: P1State, a: { items: BoardItem[] }, how: string) => seen.push(`${how}:${a.items.filter((x) => x.done).length}`);
    BOARD_FINISH_HOOKS.push(f);
    try {
      boardAuto(s);
    } finally {
      BOARD_FINISH_HOOKS.splice(BOARD_FINISH_HOOKS.indexOf(f), 1);
    }
    expect(seen).toEqual(['auto:0']);
  });
});

describe('セーブ（版 26）', () => {
  it('版 25 のセーブは 26 へ（会議・目標は空から）。26 はそのまま（議題・目標が残る）', () => {
    const s = withAgenda();
    const o = JSON.parse(serializeP1(s));
    o.v = 25;
    delete o.board;
    const x = deserializeP1(JSON.stringify(o))!;
    expect(x.v).toBe(26);
    expect(x.board).toBeUndefined();
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(26);
    expect(back.board).toEqual(s.board);
    expect(newP1(1).v).toBe(26);
  });
});
