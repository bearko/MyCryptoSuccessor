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
  budgetOptText,
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
import { budgetWhy } from '../src/island/p1/board';
import { AREA_MEMO, sellWhatIf } from '../src/island/p1/model';
import { LEVER_FAST, coLive, forecastHint, causeChips, causeCore, leverCore, noLeverCore, ofSlack, pickLever, styleOfHero, type Cause, type Lever } from '../src/island/p1/boardplan';
import { heroLine } from '../src/island/p1/headtalk';
import { has, lvOf } from '../src/island/p1/model';
import { parseStyle, styleTags } from '../src/island/p1/voice';
import fitJson from '../src/island/p1/heroes/fit.json';
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
    // 段 I2b：予算が足りずに止まった記録（qwhy の over）があると、余力しだいで承認を推奨するので、ここでは記録を外す
    deptBudget(s, d).qwhy = undefined;
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
  it('予算の選択肢の名前と額は同じ比べで読める（いまの額 → 決めたあと）。増額の要求を見送るのは「据え置き」で、減額の % は出さない', () => {
    const s = withAgenda();
    const it = deptItem(s);
    const pctOf = (k: number) => Math.round(((budgetOpts(it)[k] - it.ask.cur) / it.ask.cur) * 100);
    // 増額の要求（いま 20,000 G → 要求 46,000 G）
    it.ask = { up: true, cur: 20000, amt: 46000, lv: 'X' };
    const up = [0, 1, 2].map((k) => budgetOptText(it, k));
    expect(up[0].name).toBe(`承認：+${pctOf(0)}%（要求どおり）`);
    expect(up[0].val).toBe('月 20,000 → 46,000 G');
    expect(up[1].name).toBe(`増額 +${pctOf(1)}%`);
    expect(up[1].val).toBe(`月 20,000 → ${budgetOpts(it)[1].toLocaleString('en-US')} G`);
    expect(up[2].name).toBe('据え置き（要求を見送る）');
    expect(up[2].val).toBe('月 20,000 G のまま');
    for (const x of up) expect(x.name).not.toMatch(/減額/);
    // 据え置きの要求（いま 20,000 G）：承認＝据え置き・増額 +20%・減額 −20%
    it.ask = { up: false, cur: 20000, amt: 20000, lv: 'M' };
    const keep = [0, 1, 2].map((k) => budgetOptText(it, k));
    expect(keep.map((x) => x.name)).toEqual(['承認：据え置き', '増額 +20%', '減額 −20%']);
    expect(keep.map((x) => x.val)).toEqual(['月 20,000 G のまま', '月 20,000 → 24,000 G', '月 20,000 → 16,000 G']);
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
    // 写しの前に会議が開いていることがある（自動プレイの通しの進み方しだい）：数えは差で見る
    const st0 = JSON.parse(JSON.stringify(boardOf(s).stat));
    decide(s, boardOf(s).agenda!.items[0], { plan: 1, budget: 0, other: 0 });
    const items = boardFinish(s, 'bulk');
    expect(items.every((x) => x.done)).toBe(true);
    expect(items.slice(1).every((x) => JSON.stringify(x.pick) === JSON.stringify(x.rec))).toBe(true);
    expect(boardOf(s).agenda).toBeNull();
    expect(boardOf(s).stat.bulk - st0.bulk).toBe(1);
    expect(boardOf(s).stat.items - st0.items).toBe(n);
    expect(boardOf(s).stat.changed - st0.changed).toBe(1);
    expect(Object.keys(boardOf(s).goals)).toHaveLength(n);
  });
  it('開かないまま次の四半期の締めが来たら、推奨で決めてから新しい会議（自動）', () => {
    const s = withAgenda();
    const m = Math.round(s.day / 30);
    const auto0 = boardOf(s).stat.auto;
    boardQuarter(s, Math.floor(m / 3) + 1, m + 3);
    expect(boardOf(s).stat.auto - auto0).toBe(1);
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

describe('段 UI7c の setPolicy を年初の回から呼べる（段 K の置き場所の確かめ）', () => {
  it('BOARD_FINISH_HOOKS で年初の回だけ setPolicy を呼ぶと、会議を閉じたときに方針が決まる（ほかの回は変えない）', async () => {
    const { setPolicy, policyOf } = await import('../src/island/p1/policy');
    const s = withAgenda();
    const f = (x: P1State, a: { q: number }) => {
      if (isYearOpening(a)) setPolicy(x, 'growth');
    };
    BOARD_FINISH_HOOKS.push(f);
    try {
      boardOf(s).agenda!.q = 2;
      boardAuto(s);
      expect(policyOf(s)).toBe('balance');
      const m = Math.round(s.day / 30);
      boardQuarter(s, 4, m);
      expect(isYearOpening(boardOf(s).agenda!)).toBe(true);
      boardAuto(s);
      expect(policyOf(s)).toBe('growth');
    } finally {
      BOARD_FINISH_HOOKS.splice(BOARD_FINISH_HOOKS.indexOf(f), 1);
    }
  });
});

describe('セーブ（版 26）', () => {
  it('版 25 のセーブは 26 へ（会議・目標は空から）。26 はそのまま（議題・目標が残る）', () => {
    const s = withAgenda();
    const o = JSON.parse(serializeP1(s));
    o.v = 25;
    delete o.board;
    const x = deserializeP1(JSON.stringify(o))!;
    expect(x.v).toBe(28);
    expect(x.board).toBeUndefined();
    const back = deserializeP1(serializeP1(s))!;
    expect(back.v).toBe(28);
    expect(back.board).toEqual(s.board);
    expect(newP1(1).v).toBe(28);
  });
});

describe('段 I2b：判断できる報告（何もできなかった原因・来期の打ち手・会社の余力・人物の好み）', () => {
  /** 部長をそろえ、prep で四半期の記録を書いてから議題を作る */
  const make = (prep: (s: P1State) => void) => {
    const s = load();
    const free = s.staff.filter((x) => x.task == null && !x.heads?.length);
    for (const d of budgetDepts(s)) {
      if (headOf(s, d)) continue;
      const st = free.shift();
      if (st) setHead(s, d, st.hero);
    }
    prep(s);
    const m = Math.round(s.day / 30);
    boardOf(s).agenda = null;
    boardQuarter(s, Math.floor(m / 3), m);
    return s;
  };
  const q0 = { done: 0, over: 0, labor: 0, cash: 0, none: 0 };
  const heads = (s: P1State) => budgetDepts(s).filter((d) => headOf(s, d));

  it('四半期の記録：部長の施策の結果を月ごとに数え（qwhy）、四半期の締めで 0 から', () => {
    const s = load();
    const xs = Object.values(s.budget?.depts ?? {}).filter((B) => B?.qwhy);
    expect(xs.length).toBeGreaterThan(0);
    for (const B of xs) {
      const q = B!.qwhy!;
      expect(q.done + q.over + q.labor + q.cash + q.none).toBeGreaterThan(0);
    }
    const t2 = withAgenda();
    for (const B of Object.values(t2.budget?.depts ?? {})) expect(B?.qwhy).toBeUndefined();
  });

  it('予算が足りない：原因と数字（止まった手・予算の残り・要る予算）。止まった手を打てる額を要求し、余力の内なら前の目標を待たずに承認を推奨', () => {
    let d: DeptId = 'logistics';
    const s = make((x) => {
      d = heads(x)[0];
      Object.assign(deptBudget(x, d), { qamt: 60000, qused: 9000, qn: 0, qwhy: { ...q0, over: 3, cost: 26000, room: 17000, need: amountOf(x, d) + 9000, nm: 'テストの手', val: 42000 } });
    });
    const it = deptItem(s, d);
    expect(it.why?.k).toBe('budget');
    expect(it.lever?.k).toBe('budget');
    expect(it.ask.up).toBe(true);
    expect(it.ask.amt).toBeGreaterThanOrEqual(amountOf(s, d) + 9000);
    const A = boardOf(s).agenda!;
    expect(A.co).toBeTruthy();
    if (!it.audit?.ask && A.co!.slack > 0 && it.ask.amt - it.ask.cur <= A.co!.slack * BOARD.lever.slackUp) expect(it.rec.budget).toBe(0);
    if (it.audit?.ask) expect(it.rec.budget).toBe(2);
    expect(causeChips(it.why!).join(' ')).toMatch(/26,000 G/);
    expect(reportLine(it)).toMatch(/テストの手/);
    expect(budgetWhy(it, A.co)).toMatch(/余力/);
  });

  it('人手が足りない：従業員の上限の打ち手。承認で上限が上がる', () => {
    let d: DeptId = 'logistics';
    const s = make((x) => {
      d = heads(x)[0];
      Object.assign(deptBudget(x, d), { qamt: 60000, qused: 0, qn: 0, qwhy: { ...q0, labor: 3, lab: 25, cap: deptBudget(x, d).cap } });
    });
    const it = deptItem(s, d);
    expect(it.why?.k).toBe('labor');
    expect(it.lever?.k).toBe('crew');
    const cap0 = deptBudget(s, d).cap;
    decide(s, it, { ...it.rec, lever: 0 });
    expect(deptBudget(s, d).cap).toBe(Math.min(BUDGET.crew.capMax, cap0 + Math.ceil(25 / BUDGET.crew.labor)));
  });

  it('会社の資金を守った：原因は資金、計画は受け身でない（いつ・何を打つか）', () => {
    let d: DeptId = 'logistics';
    const s = make((x) => {
      d = heads(x)[0];
      Object.assign(deptBudget(x, d), { qamt: 60000, qused: 0, qn: 0, qwhy: { ...q0, cash: 3 } });
    });
    const it = deptItem(s, d);
    expect(it.why?.k).toBe('cash');
    expect(planLine(it)).not.toMatch(/来期は守りです/);
    // 次の施策があればそれを軸に、無ければ「資金が取り置きを上回る月に打つ」
    if (it.plan.moves.length) expect(planLine(it)).toContain(it.plan.moves[0]);
    else expect(planLine(it)).toMatch(/取り置き/);
    expect(forecastHint(it.lever, it.why)).toMatch(/取り置き/);
  });

  it('打てる手が無い：宣伝を全部流しているマーケは「手はもう打ってある」。ほかは、いまの詰まりに効くパネル（開放不足）か「必要が無い」。打ち手のパネルは承認で開く', () => {
    const s = make((x) => {
      for (const a of ['flyer', 'poster', 'event']) x.ads[a] = 10;
      for (const d of heads(x)) Object.assign(deptBudget(x, d), { qamt: 60000, qused: 0, qn: 0, qwhy: { ...q0, none: 3 } });
    });
    const A = boardOf(s).agenda!;
    const mk = A.items.find((x) => x.dept === 'marketing');
    if (mk) expect(mk.why?.k).toBe('busy');
    for (const it of A.items.filter((x) => x.kind === 'dept')) {
      expect(it.why).toBeTruthy();
      expect(['busy', 'lock', 'need', 'town']).toContain(it.why!.k);
      expect(planLine(it)).not.toMatch(/来期は守りです/);
      if (it.why!.k === 'lock') expect(it.lever?.k).toBe('panel');
    }
    const it = A.items.find((x) => x.lever?.k === 'panel');
    expect(it).toBeTruthy();
    const L = it!.lever as Extract<Lever, { k: 'panel' }>;
    expect(L.units).toBeGreaterThanOrEqual(BOARD.lever.minUnits);
    expect(L.val).toBeGreaterThan(0);
    s.money = 1e9;
    s.rp = 1e6;
    const last = L.ids[L.ids.length - 1];
    const lv0 = lvOf(s, last);
    decide(s, it!, { ...it!.rec, lever: 0 });
    expect(lvOf(s, last)).toBe(L.lv ? lv0 + 1 : 1);
    for (const id of L.ids) expect(has(s, id)).toBe(true);
  });

  it('会社の余力：月の利益（帳簿の直近 3 か月）＋ 部門が使った額 − 全部門の予算。決めた増額で余力が減る（coLive）', () => {
    const s = withAgenda();
    const A = boardOf(s).agenda!;
    const co = A.co!;
    expect(co.slack).toBe(co.earn - co.caps);
    const it = A.items.find((x) => x.kind === 'dept')!;
    const before = coLive(s, co);
    decide(s, it, { ...it.rec, budget: 1 });
    const after = coLive(s, co);
    expect(after.caps - before.caps).toBe(amountOf(s, it.dept!) - it.ask.cur);
    expect(after.slack).toBe(co.earn - after.caps);
    expect(ofSlack(1, 100)).toBe('余力の 1 割未満');
    expect(ofSlack(20, 100)).toBe('余力の 2 割');
  });

  it('人物の好み：高杉晋作は攻め・速さ・新しい手。好みで選ぶ打ち手が変わる（どれも効き目のある手）', () => {
    const tk = styleOfHero(2021);
    expect(tk).toMatchObject({ atk: 1, spd: 1, odd: 1 });
    expect(styleTags(tk).slice(0, 3)).toEqual(['攻め', '速さ', '新しい手']);
    // 調査の 193 体すべてに好みがある（4 字）
    expect(Object.keys((fitJson as { st: Record<string, string> }).st)).toHaveLength(193);
    const big = { k: 'panel' as const, ids: ['zz_pre', 'zz_big'], lv: false, nm: '大きな手', pre: ['前提'], stage: 'sell' as const, now: true, units: 10, val: 10000, cost: 50000, rp: 0 };
    const quick = { k: 'panel' as const, ids: ['zz_quick'], lv: false, nm: '素早い手', pre: [], stage: 'sell' as const, now: true, units: 7, val: 7000, cost: 1000, rp: 0 };
    expect(pickLever([big, quick], tk, 'marketing')?.nm).toBe('素早い手');
    expect(pickLever([big, quick], parseStyle('A---'), 'marketing')?.nm).toBe('大きな手');
    // 言い回しも好みで変わる
    expect(leverCore(quick, tk)).not.toBe(leverCore(quick, parseStyle('DS--')));
  });

  it('セリフは 60 字まで（原因・打ち手・必要予算。長い名前でも、好みのどの組み合わせでも）', () => {
    const long = 'とても長い名前のパネル（長い名前）';
    const causes: Cause[] = [
      { k: 'budget', cost: 1_234_000, room: 987_000, need: 2_345_000, nm: long, val: 1 },
      { k: 'labor', lab: 120, cap: 20 },
      { k: 'cash', reserve: 1_234_567 },
      { k: 'lock', nm: long, pre: [long], stage: 'craft', units: 123.4 },
      { k: 'busy', n: 3, of: 3 },
      { k: 'need', stage: 'sell' },
      { k: 'town', why: 'dig' },
    ];
    const levers: Lever[] = [
      { k: 'panel', ids: ['a', 'b'], lv: false, nm: long, pre: [long], stage: 'haul', now: false, units: 123.4, val: 1, cost: 1, rp: 1 },
      { k: 'panel', ids: ['b'], lv: true, nm: long, pre: [], stage: 'sell', now: true, units: 1.5, val: 1, cost: 1, rp: 1 },
      { k: 'crew', cap: 20, add: 5, lab: 120, wage: 1 },
      { k: 'budget', amt: 9_999_000, nm: long, val: 1_234_567 },
    ];
    const styles = ['AFKN', 'DSO-', 'A---', '-F--', '--K-', '---N', '----'].map(parseStyle);
    for (const hero of [2021, 5001, 1001, 10001]) {
      for (const c of causes) for (const a of [0, 5]) expect(talkLen(heroLine(hero, causeCore(c, a, 1_234_567))), causeCore(c, a, 1)).toBeLessThanOrEqual(TALK_MAX);
      for (const L of levers) for (const st of styles) expect(talkLen(heroLine(hero, leverCore(L, st))), leverCore(L, st)).toBeLessThanOrEqual(TALK_MAX);
      for (const c of [...causes, null]) expect(talkLen(heroLine(hero, noLeverCore(c)))).toBeLessThanOrEqual(TALK_MAX);
    }
    const s = make((x) => {
      for (const d of heads(x)) Object.assign(deptBudget(x, d), { qamt: 60000, qused: 0, qn: 0, qwhy: { ...q0, none: 3 } });
    });
    for (const it of boardOf(s).agenda!.items) for (const x of [reportLine(it), planLine(it), askLine(it)]) expect(talkLen(x), x).toBeLessThanOrEqual(TALK_MAX);
  });
});

describe('段 I2b：議題を作る速さ（答えは変えない）', () => {
  it('店ごとの取り分の覚え（AREA_MEMO）と打ち手の近道（LEVER_FAST）を止めても、議題・販売の見込みはまったく同じ', () => {
    const s = load();
    const free = s.staff.filter((x) => x.task == null && !x.heads?.length);
    for (const d of budgetDepts(s)) {
      if (headOf(s, d)) continue;
      const st = free.shift();
      if (st) setHead(s, d, st.hero);
    }
    // 打てる手が無かった四半期（パネルの打ち手をはかる）
    for (const d of budgetDepts(s)) if (headOf(s, d)) deptBudget(s, d).qwhy = { done: 0, over: 0, labor: 0, cash: 0, none: 3 };
    const m = Math.round(s.day / 30);
    const q = Math.floor(m / 3);
    const fast = JSON.stringify({ a: boardAgenda(s, q, m), w: sellWhatIf(s) });
    AREA_MEMO.on = false;
    LEVER_FAST.on = false;
    try {
      const t0 = performance.now();
      const slow = JSON.stringify({ a: boardAgenda(s, q, m), w: sellWhatIf(s) });
      const t1 = performance.now();
      expect(slow).toBe(fast);
      AREA_MEMO.on = true;
      LEVER_FAST.on = true;
      boardAgenda(s, q, m);
      console.log(`議題を作る時間：覚え・近道なし ${Math.round(t1 - t0)} ms → あり ${Math.round(performance.now() - t1)} ms`);
    } finally {
      AREA_MEMO.on = true;
      LEVER_FAST.on = true;
    }
  });
});
