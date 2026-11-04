// 段 UI7a（docs/ISLAND_PHASE1.md「段 UI7a」）：任命の候補の選び方。灰色は役（部長・リーダー・セクター長）で分ける・
// 持ち場の仕事（製造・調達・バイト）の人は灰色にしない・ほかの役の人は初めは隠す（チェックボックスで出す）・おすすめは選べる人から・
// 部長に任命しても持ち場の仕事は残る
import { describe, expect, it } from 'vitest';
import { DELEG, DEPT_SKILLS, type DeptId } from '../src/island/p1/data';
import { deptLevel } from '../src/island/p1/dept';
import { headOf, leaderOf, otherRole, othersCount, pickBest, pickList, quality, roleOf, setHead, setLeader, type PickRole } from '../src/island/p1/deleg';
import { pickNote } from '../src/island/p1/delegui';
import { newP1, staffOf, type P1State, type Staff } from '../src/island/p1/model';

function setLevel(s: P1State, d: DeptId, n: number) {
  const ids = DEPT_SKILLS[d].filter((k) => !k.donate && !k.inf).map((k) => k.id);
  s.skills = [...s.skills.filter((id) => !ids.includes(id)), ...ids.slice(0, n)];
  for (const id of ids.slice(0, n)) delete s.skillLv[id];
  expect(deptLevel(s, d)).toBe(n);
}
/** 8 人の会社：0〜2 は持ち場の仕事（製造・調達・バイト）、3 は物流部長、4 は物流のリーダー（発注）、5 はセクター長、6 は待機中、7 は物流のリーダー（品出し） */
function company() {
  const s = newP1(1);
  const base = s.staff[0];
  s.staff = Array.from({ length: 8 }, (_, i) => ({ ...structuredClone(base), hero: 10001 + i }) as Staff);
  for (const d of ['logistics', 'hr', 'marketing'] as DeptId[]) setLevel(s, d, DELEG.headAt);
  const [a, b, c, h, l, m, , l2] = s.staff;
  a.task = 'craft';
  a.target = 0;
  b.task = 'buy';
  c.task = 'side';
  c.target = 'r1';
  expect(setHead(s, 'logistics', h.hero)).toBeNull();
  expect(setLeader(s, 'order', l.hero)).toBeNull();
  m.task = 'manager';
  m.target = 'x1';
  l2.task = 'lead';
  l2.target = 'L:shelf';
  return { s, a, b, c, h, l, m, free: s.staff[6], l2 };
}
const heroes = (xs: { st: Staff }[]) => xs.map((x) => x.st.hero).sort();

describe('段 UI7a：部長を選ぶ', () => {
  const want: PickRole = { kind: 'head', dept: 'marketing' };
  it('持ち場の仕事の人は灰色にしない。ほかの部長・リーダー・セクター長は初めは隠す', () => {
    const { s, a, b, c, free } = company();
    const list = pickList(s, want, null, false);
    expect(heroes(list)).toEqual([a, b, c, free].map((x) => x.hero).sort());
    expect(list.every((x) => !x.grey)).toBe(true);
    expect(othersCount(s, want, null)).toBe(4);
  });
  it('チェックボックスをオンにすると、ほかの役の人も出して灰色にする', () => {
    const { s, h, l, m, l2 } = company();
    const list = pickList(s, want, null, true);
    expect(list.length).toBe(8);
    expect(heroes(list.filter((x) => x.grey))).toEqual([h, l, m, l2].map((x) => x.hero).sort());
  });
  it('同じ部門のリーダーは昇進なので灰色にしない。いまの部長は灰色にしない。固有の能力で兼任できるヒーローは灰色にしない', () => {
    const { s, h, l } = company();
    // 物流部長を選ぶ：物流のリーダー（発注）は昇進・いまの物流部長はいまの人
    const lg = pickList(s, { kind: 'head', dept: 'logistics' }, h.hero, false);
    expect(lg.find((x) => x.st.hero === l.hero)?.grey).toBe(false);
    expect(lg.find((x) => x.st.hero === h.hero)?.grey).toBe(false);
    // 兼任できるヒーロー（multiRole 2）は、ほかの部門の部長でも選べる
    expect(otherRole({ ...h, hero: 5005 }, want)).toBe(false);
    expect(otherRole(h, want)).toBe(true);
  });
  it('おすすめは出している中の選べる人（灰色・休憩中でない）から', () => {
    const { s, a, b, c, free, h } = company();
    // 部長の出来をいちばん高くしても、灰色ならおすすめにならない
    h.stats = { ...h.stats, int: 99, agi: 99, phy: 99 };
    h.level = 60;
    const on = pickList(s, want, null, true);
    expect(on[0].st.hero).toBe(h.hero);
    expect(pickBest(on)).not.toBe(h.hero);
    const best = pickBest(pickList(s, want, null, false))!;
    expect([a, b, c, free].map((x) => x.hero)).toContain(best);
    // 休憩中はおすすめにしない
    staffOf(s, best)!.resting = true;
    expect(pickBest(pickList(s, want, null, false))).not.toBe(best);
  });
  it('部長に任命しても、持ち場の仕事（製造・調達・バイト）は残る。出来は前と同じ', () => {
    const { s, a, b, c } = company();
    for (const [st, d] of [
      [a, 'marketing'],
      [b, 'hr'],
    ] as [Staff, DeptId][]) {
      const before = { task: st.task, target: st.target };
      const q = quality(st, d);
      expect(setHead(s, d, st.hero)).toBeNull();
      const now = staffOf(s, st.hero)!;
      expect({ task: now.task, target: now.target }).toEqual(before);
      expect(headOf(s, d)?.hero).toBe(st.hero);
      expect(roleOf(now)).toEqual({ kind: 'head', dept: d });
      expect(quality(now, d)).toBeCloseTo(q, 9);
    }
    // バイトの人も、部長にしてもバイトのまま
    expect(setHead(s, 'marketing', c.hero)).toBeNull();
    expect(staffOf(s, c.hero)!.task).toBe('side');
    expect(staffOf(s, a.hero)!.heads).toBeUndefined();
    expect(staffOf(s, a.hero)!.task).toBe('craft');
  });
});

describe('段 UI7a：チームリーダーを選ぶ', () => {
  const want: PickRole = { kind: 'leader', duty: 'craft' };
  it('持ち場の仕事の人は灰色にしない。部長・セクター長・ほかの業務のリーダーは初めは隠し、オンで灰色', () => {
    const { s, a, b, c, free, h, l, m, l2 } = company();
    expect(heroes(pickList(s, want, null, false))).toEqual([a, b, c, free].map((x) => x.hero).sort());
    const on = pickList(s, want, null, true);
    expect(heroes(on.filter((x) => x.grey))).toEqual([h, l, m, l2].map((x) => x.hero).sort());
    // いまのリーダー（発注）は、その業務を選ぶときは灰色にしない
    expect(pickList(s, { kind: 'leader', duty: 'order' }, l.hero, false).find((x) => x.st.hero === l.hero)?.grey).toBe(false);
  });
  it('リーダーはいまの決まりのまま：選ぶと持ち場の仕事から外れて専念する（説明の文もそう言う）', () => {
    const { s, b } = company();
    expect(setLeader(s, 'craft', b.hero)).toBeNull();
    expect(staffOf(s, b.hero)!.task).toBe('lead');
    expect(leaderOf(s, 'craft')?.hero).toBe(b.hero);
  });
});

describe('段 UI7a：説明の文は役ごと', () => {
  it('部長は「持ち場の仕事はそのまま」、リーダーは「その仕事から外れて」', () => {
    const head = pickNote('marketing', { kind: 'head', dept: 'marketing' });
    const lead = pickNote('logistics', { kind: 'leader', duty: 'craft' });
    expect(head).toContain('そのまま');
    expect(head).not.toContain('外れます');
    expect(lead).toContain('外れて');
    expect(head).not.toBe(lead);
  });
});
