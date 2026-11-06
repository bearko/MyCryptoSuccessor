// 段 L0：0 → 1 はプレイヤー（ユーザーの声 2026-11-06）。チームリーダーは Uncommon から・事業部長と提案は Rare から。
// 序盤は地図の印（困りごとのアイコン）で「いま何をすればいいか」を見せる。docs/ISLAND_PHASE1.md「提案は Rare から（段 L0）」
import { describe, expect, it } from 'vitest';
import { DELEG, DEPT_SKILLS, L0, type DeptId } from '../src/island/p1/data';
import { deptLevel, deptNews } from '../src/island/p1/dept';
import { bandText, delegDay, headLeft, headOf, leaderLeft, leaderOf, setHead, setLeader } from '../src/island/p1/deleg';
import { deserializeP1, newP1, serializeP1, staffOf, type P1State } from '../src/island/p1/model';
import { headsOpen, heroStage, leadersOpen, propsOpen } from '../src/island/p1/stage';
import { orgChart } from '../src/island/p1/org';
import { talkMode, headTalkDue } from '../src/island/p1/headtalk';
import { openTier } from './l0util';

/** その部門の理解度を n にする（お金パネルを Lv1 ずつ取る） */
function setLevel(s: P1State, d: DeptId, n: number) {
  const ids = DEPT_SKILLS[d].filter((k) => !k.donate && !k.inf).map((k) => k.id);
  s.skills = [...s.skills.filter((id) => !ids.includes(id)), ...ids.slice(0, n)];
  for (const id of ids.slice(0, n)) delete s.skillLv[id];
  expect(deptLevel(s, d)).toBe(n);
}
/** 会社が出店したことのある最高ランクを r にする（いまの町は Common のまま、ランドに r の町を足す） */
const atTier = (s: P1State, r: 'C' | 'U' | 'R' | 'E') => openTier(s, r);

describe('heroStage（判定の 1 か所）', () => {
  it('会社が出店したことのある最高ランクで C・U・R（Epic 以上は R）', () => {
    const s = newP1(1);
    expect(heroStage(s)).toBe('C');
    expect(leadersOpen(s)).toBe(false);
    expect(headsOpen(s)).toBe(false);
    expect(propsOpen(s)).toBe(false);
    atTier(s, 'U');
    expect(heroStage(s)).toBe('U');
    expect(leadersOpen(s)).toBe(true);
    expect(headsOpen(s)).toBe(false);
    atTier(s, 'R');
    expect(heroStage(s)).toBe('R');
    expect(headsOpen(s) && propsOpen(s)).toBe(true);
    const e = atTier(newP1(1), 'E');
    expect(heroStage(e)).toBe('R');
    // データは data.ts の L0 の 1 か所
    expect(L0).toMatchObject({ leaderFrom: 'U', headFrom: 'R', propFrom: 'R' });
  });
});

describe('部長・リーダー（1）', () => {
  it('Common・Uncommon では理解度 8 でも事業部長を置けない（🔒 Rare）。Rare からは今どおり（理解度に関係なく 0）', () => {
    const s = newP1(1);
    const hero = s.staff[0].hero;
    setLevel(s, 'logistics', DELEG.headAt);
    expect(headLeft(s, 'logistics')).toBe('R');
    expect(setHead(s, 'logistics', hero)).toBe('locked');
    atTier(s, 'U');
    expect(headLeft(s, 'logistics')).toBe('R');
    expect(setHead(s, 'logistics', hero)).toBe('locked');
    expect(bandText(s, 'strategy').long).toContain('Rare');
    atTier(s, 'R');
    setLevel(s, 'logistics', 0);
    expect(headLeft(s, 'logistics')).toBe(0);
    expect(setHead(s, 'logistics', hero)).toBeNull();
    expect(headOf(s, 'logistics')?.hero).toBe(hero);
  });

  it('チームリーダーは Uncommon から理解度 3 で置ける。Common では理解度 3 でも置けない（🔒 Uncommon）', () => {
    const s = newP1(1);
    const hero = s.staff[0].hero;
    setLevel(s, 'logistics', DELEG.leaderAt);
    expect(leaderLeft(s, 'logistics')).toBe('U');
    expect(setLeader(s, 'order', hero)).toBe('locked');
    expect(bandText(s, 'logistics').long).toContain('Uncommon');
    atTier(s, 'U');
    expect(leaderLeft(s, 'logistics')).toBe(0);
    setLevel(s, 'logistics', DELEG.leaderAt - 1);
    expect(setLeader(s, 'order', hero)).toBe('locked');
    setLevel(s, 'logistics', DELEG.leaderAt);
    expect(setLeader(s, 'order', hero)).toBeNull();
    expect(leaderOf(s, 'order')?.hero).toBe(hero);
  });

  it('組織図の空席：Common のリーダーは「🔒 Uncommon」、部長は「🔒 Rare」', () => {
    const s = newP1(1);
    setLevel(s, 'logistics', DELEG.headAt);
    const o = orgChart(s);
    const lg = o.depts.find((d) => d.dept === 'logistics')!;
    expect(lg.head.open).toBe(false);
    expect(lg.head.lock?.rank).toBe('R');
    expect(lg.leaders.every((x) => !x.open && x.lock?.rank === 'U')).toBe(true);
    atTier(s, 'U');
    const lg2 = orgChart(s).depts.find((d) => d.dept === 'logistics')!;
    expect(lg2.leaders.every((x) => x.open)).toBe(true);
    expect(lg2.head.lock?.rank).toBe('R');
  });

  it('Rare より前は、部長との会話・初めての部長の一言も出ない（理解度 8 でも）', () => {
    const s = newP1(1);
    s.tut = 99;
    setLevel(s, 'hr', DELEG.headAt);
    expect(talkMode(s, 'hr')).toBeNull();
    expect(headTalkDue(s)).toBeNull();
    atTier(s, 'R');
    expect(talkMode(s, 'hr')).toBe('mine');
    expect(headTalkDue(s)).toBe('hr');
  });

  it('理解度の節目のお知らせ：Common の 3 は「Uncommon の町を開くと置ける」・ランクの町を開くとお知らせ', () => {
    const s = newP1(1);
    deptNews(s);
    setLevel(s, 'logistics', DELEG.leaderAt);
    const a = deptNews(s);
    expect(a.some((x) => x.includes('Uncommon'))).toBe(true);
    atTier(s, 'U');
    const b = deptNews(s);
    expect(b.some((x) => x.includes('Uncommon') && x.includes('チームリーダー'))).toBe(true);
    expect(deptNews(s).length).toBe(0);
  });

  it('古いセーブ：Common で既に置いてある部長・リーダーは外さない（読み込んでも残り、業務を回す）。新しくは置けない', () => {
    const s = newP1(1);
    const [a, b] = s.staff.map((x) => x.hero);
    // 段 L0 の前のセーブの形（Common の町で部長とリーダー）
    staffOf(s, a)!.heads = ['hr'];
    staffOf(s, b)!.task = 'lead';
    staffOf(s, b)!.target = 'L:rest';
    const t = deserializeP1(serializeP1(s))!;
    expect(headOf(t, 'hr')?.hero).toBe(a);
    expect(leaderOf(t, 'rest')?.hero).toBe(b);
    t.tut = 99;
    expect(talkMode(t, 'hr')).toBe('head');
    expect(() => delegDay(t)).not.toThrow();
    // 外したら Rare まで置き直せない
    expect(setHead(t, 'hr', null)).toBeNull();
    expect(setHead(t, 'hr', a)).toBe('locked');
  });
});
