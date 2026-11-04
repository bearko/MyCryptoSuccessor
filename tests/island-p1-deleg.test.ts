// 任せ方の 4 段（段 D。docs/ISLAND_PHASE1.md「任せ方」）：理解度 3 でチームリーダー・8 で事業部長・出来は能力値と Lv（とパッシブ）で変わる・
// 外すと手に戻る・部長の提案は実際に取れる手から・承認で実行・お金が足りないと保留・セクター長の条件と古いセーブ
import { describe, expect, it } from 'vitest';
import { DELEG, DEPT_SKILLS, HERO_GROWTH, SKILL, isResearch, type DeptId } from '../src/island/p1/data';
import { deptLevel } from '../src/island/p1/dept';
import {
  approve,
  delegDay,
  delegMonth,
  everyOf,
  headFx,
  headOf,
  hold,
  leaderOf,
  lineupFor,
  quality,
  reject,
  roleOf,
  runnerOf,
  sectorApprove,
  sectorHeadOk,
  setHead,
  setLeader,
  type Proposal,
} from '../src/island/p1/deleg';
import { deserializeP1, investCost, levelLock, myShops, newP1, serializeP1, setShelf, skillLock, staffOf, step, type P1State, type Report } from '../src/island/p1/model';
import { runOnce } from '../scripts/island/sim';

/** その部門の理解度を n にする（お金パネルを Lv1 ずつ取る） */
function setLevel(s: P1State, d: DeptId, n: number) {
  const ids = DEPT_SKILLS[d].filter((k) => !k.donate && !k.inf).map((k) => k.id);
  s.skills = [...s.skills.filter((id) => !ids.includes(id)), ...ids.slice(0, n)];
  for (const id of ids.slice(0, n)) delete s.skillLv[id];
  expect(deptLevel(s, d)).toBe(n);
}
/** タオックスを数か月遊んだところ（自動プレイの最短の方針の写し） */
let mid: string | null = null;
function midGame(): P1State {
  if (!mid)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!mid && m >= 4 && myShops(s).length) mid = serializeP1(s);
      },
    });
  return deserializeP1(mid!)!;
}
const fakeReport = (s: P1State): Report => ({ ...(s.reports[s.reports.length - 1] ?? ({} as Report)), month: (s.reports[s.reports.length - 1]?.month ?? 0) + 1 });

describe('チームリーダー（理解度 3）・事業部長（理解度 8）', () => {
  it('理解度 3 でリーダーを置ける（2 では置けない）。置いた人は役目の枠を使い、ほかの仕事には就かない', () => {
    const s = newP1(1);
    const hero = s.staff[0].hero;
    setLevel(s, 'logistics', 2);
    expect(setLeader(s, 'order', hero)).toBe('locked');
    setLevel(s, 'logistics', DELEG.leaderAt);
    expect(setLeader(s, 'order', hero)).toBeNull();
    const st = staffOf(s, hero)!;
    expect(st.task).toBe('lead');
    expect(roleOf(st)).toEqual({ kind: 'leader', dept: 'logistics', duty: 'order' });
    expect(leaderOf(s, 'order')?.hero).toBe(hero);
    // 別の業務のリーダーにすると、前の業務は手に戻る（1 人 1 つ）
    expect(setLeader(s, 'shelf', hero)).toBeNull();
    expect(leaderOf(s, 'order')).toBeNull();
    expect(leaderOf(s, 'shelf')?.hero).toBe(hero);
  });

  it('理解度 8 で部長を置ける（7 では置けない）。部長は部門の業務をまとめて回し、リーダーがいれば部長の下で出来が上がる。リーダーから部長へ昇進できる', () => {
    const s = newP1(1);
    const [a, b] = s.staff.map((x) => x.hero);
    setLevel(s, 'logistics', 7);
    expect(setHead(s, 'logistics', a)).toBe('locked');
    setLevel(s, 'logistics', DELEG.headAt);
    expect(setLeader(s, 'craft', a)).toBeNull();
    // 昇進：リーダーをそのまま部長に（リーダーの業務は部長がまとめて）
    expect(setHead(s, 'logistics', a)).toBeNull();
    expect(roleOf(staffOf(s, a)!)).toEqual({ kind: 'head', dept: 'logistics' });
    expect(leaderOf(s, 'craft')).toBeNull();
    for (const d of ['order', 'craft', 'shelf'] as const) expect(runnerOf(s, d)?.by).toBe('head');
    // 部長の下にリーダー：出来 +underHead
    expect(setLeader(s, 'order', b)).toBeNull();
    const r = runnerOf(s, 'order')!;
    expect(r.by).toBe('leader');
    expect(r.q).toBeCloseTo(Math.min(DELEG.q.cap, quality(staffOf(s, b)!, 'logistics') + DELEG.q.underHead), 6);
  });

  it('出来は部門に向く能力値と Lv（とその部門のパッシブ）で変わる。手より少し悪い 7〜9 割から始まり、上限は手より下', () => {
    const base = { stats: { hp: 100, phy: 30, int: 30, agi: 30 }, level: 1, passives: [] as { k: 'haul'; tier: number }[] };
    const q0 = quality(base, 'logistics');
    expect(q0).toBeGreaterThanOrEqual(DELEG.q.lo);
    expect(q0).toBeLessThanOrEqual(DELEG.q.hi);
    // 物流は AGI：AGI が高いほど上がる（INT は効かない）
    expect(quality({ ...base, stats: { ...base.stats, agi: 60 } }, 'logistics')).toBeGreaterThan(q0);
    expect(quality({ ...base, stats: { ...base.stats, int: 60 } }, 'logistics')).toBeCloseTo(q0, 6);
    // R&D は INT
    expect(quality({ ...base, stats: { ...base.stats, int: 60 } }, 'rnd')).toBeGreaterThan(quality(base, 'rnd'));
    // Lv が上がるほど・その部門のパッシブがあるほど上がる
    expect(quality({ ...base, level: 30 }, 'logistics')).toBeGreaterThan(q0);
    expect(quality({ ...base, passives: [{ k: 'haul', tier: 1 }] }, 'logistics')).toBeGreaterThan(q0);
    // 上限（手を超えるのは奥義＝後の段）
    expect(quality({ stats: { hp: 100, phy: 100, int: 100, agi: 100 }, level: 100, passives: [{ k: 'haul', tier: 6 }, { k: 'craft', tier: 6 }] as never }, 'logistics')).toBe(DELEG.q.cap);
    expect(DELEG.q.cap).toBeLessThan(1);
    // 出来が低いほど見直しの間があく（出来の悪さが「入れ替え待ちの日」などに出る）
    expect(everyOf(DELEG.q.lo)).toBeGreaterThan(everyOf(DELEG.q.cap));
    // 最初の 3 人（見習い）は 7 割台
    for (const st of newP1(1).staff) expect(quality(st, 'logistics')).toBeLessThan(0.8);
  });

  it('作るものの選択：出来が低いほど見込みの割合が下がりやすい（同じ状態で、出来 0.7 の平均 ≦ 出来 0.97 の平均）', () => {
    const s = midGame();
    // いま作っている商品を続けるひいき（×1.1）を外して、読みの誤差だけを比べる
    for (const sl of s.slots) sl.sku = null;
    let lo = 0;
    let hi = 0;
    for (let k = 0; k < 24; k++) {
      s.day += 30;
      lo += lineupFor(s, 0.7, Math.random).ratio;
      hi += lineupFor(s, 0.97, Math.random).ratio;
    }
    expect(lo).toBeLessThanOrEqual(hi + 1e-9);
    expect(hi / 24).toBeGreaterThan(0.95);
  });

  it('品出しのリーダー：作っている商品を棚に並べる。外すと手に戻り、棚は勝手に替わらない', () => {
    const s = midGame();
    setLevel(s, 'logistics', DELEG.leaderAt);
    const shop = myShops(s)[0];
    const made = s.slots.map((x) => x.sku).find((x) => x)!;
    expect(made).toBeTruthy();
    const free = s.staff.find((x) => x.task == null) ?? s.staff[s.staff.length - 1];
    // 棚を空にする → リーダーが作っている商品を並べる
    for (let k = 0; k < s.shops[shop.uid].shelves.length; k++) setShelf(s, shop.uid, k, null);
    expect(setLeader(s, 'shelf', free.hero)).toBeNull();
    delegDay(s);
    expect(s.shops[shop.uid].shelves).toContain(made);
    // 外す：手に戻る（その人は待機中・棚はもう替わらない）
    expect(setLeader(s, 'shelf', null)).toBeNull();
    expect(staffOf(s, free.hero)!.task).toBeNull();
    for (let k = 0; k < s.shops[shop.uid].shelves.length; k++) setShelf(s, shop.uid, k, null);
    for (let k = 0; k < 10; k++) delegDay(s);
    expect(s.shops[shop.uid].shelves.every((x) => x == null)).toBe(true);
  });

  it('役目の経験値：リーダー 1 日 13・部長 16（× ランク。上の役目ほど多い）。マネージャー（セクター長）は 20 のまま', () => {
    expect(HERO_GROWTH.xp.leader).toBeLessThan(HERO_GROWTH.xp.head);
    expect(HERO_GROWTH.xp.head).toBeLessThan(HERO_GROWTH.xp.day.manager);
    const s = midGame();
    setLevel(s, 'hr', DELEG.headAt);
    const st = s.staff.find((x) => x.task == null) ?? s.staff[s.staff.length - 1];
    expect(setHead(s, 'hr', st.hero)).toBeNull();
    const xp0 = st.xp ?? 0;
    const lv0 = st.level ?? 1;
    step(s);
    const after = staffOf(s, st.hero)!;
    expect((after.level ?? 1) > lv0 || (after.xp ?? 0) > xp0).toBe(true);
    // 人事部長の補正（± 能力しだい）
    expect(Math.abs(headFx(s, 'hr'))).toBeLessThan(0.05);
  });
});

describe('部長の提案のカード', () => {
  /** 物流・人事・マーケ・R&D・経営企画の部長を置いて、月の締めの提案を作る */
  function withHeads(): P1State {
    const s = midGame();
    const ids = s.staff.map((x) => x.hero);
    const depts: DeptId[] = ['logistics', 'marketing', 'strategy', 'rnd'];
    depts.forEach((d, k) => {
      setLevel(s, d, Math.max(DELEG.headAt, deptLevel(s, d)));
      expect(setHead(s, d, ids[ids.length - 1 - k])).toBeNull();
    });
    return s;
  }
  it('提案は、いまのゲームで実際に取れる手から選ばれる（月に 1〜2 枚・見込みと誤差つき）', () => {
    const s = withHeads();
    s.money = 1e6;
    const r = fakeReport(s);
    delegMonth(s, r);
    const inbox = s.deleg!.inbox;
    expect(inbox.length).toBeGreaterThan(0);
    expect(inbox.length).toBeLessThanOrEqual(DELEG.prop.perMonth);
    for (const p of inbox) {
      expect(p.est).toBeGreaterThan(0);
      expect(p.err).toBeGreaterThan(0);
      expect(headOf(s, p.dept)?.hero).toBe(p.hero);
      const a = p.act;
      if (a.k === 'skill') expect([null, 'money', 'rp']).toContain(skillLock(s, SKILL[a.id]));
      if (a.k === 'level') expect([null, 'money', 'rp']).toContain(levelLock(s, SKILL[a.id]));
      if (a.k === 'invest') expect(investCost(s.buildings.find((b) => b.uid === a.uid)!, a.id)).not.toBeNull();
      if (a.k === 'hire') expect(s.hirePool).toContain(a.hero);
      if (a.k === 'permit') expect(s.dig!.sites[a.site].permit).toBeFalsy();
      if (a.k === 'ad') expect(s.ads[a.id] ?? 0).toBeLessThanOrEqual(0);
    }
    expect(r.deleg?.props).toBe(inbox.length);
  });

  it('承認すると実行する（お金・研究ポイントが減る、パネルが取れる など）。却下は消える。結果は翌月の報告に', () => {
    const s = withHeads();
    s.money = 1e6;
    s.rp = 1e5;
    delegMonth(s, fakeReport(s));
    const p = s.deleg!.inbox[0];
    const m0 = s.money;
    expect(approve(s, p.id)).toBeNull();
    expect(s.deleg!.inbox.some((x) => x.id === p.id)).toBe(false);
    if (p.act.k === 'skill') expect(s.skills).toContain(p.act.id);
    if (p.cost > 0 && p.act.k !== 'hire') expect(s.money).toBeLessThan(m0);
    expect(s.deleg!.done.map((x) => x.p.id)).toContain(p.id);
    // 翌月の締め：提案の結果
    const r2 = fakeReport(s);
    r2.month += 1;
    delegMonth(s, r2);
    expect(r2.deleg?.results.length).toBeGreaterThan(0);
    // 却下
    const q = s.deleg!.inbox[0];
    if (q) {
      expect(reject(s, q.id)).toBe(true);
      expect(s.deleg!.inbox.some((x) => x.id === q.id)).toBe(false);
    }
  });

  it('お金が足りないと「資金不足」で保留（受け箱に残る）。自分で保留にもできる', () => {
    const s = withHeads();
    s.money = 1e6;
    delegMonth(s, fakeReport(s));
    const p = s.deleg!.inbox.find((x) => x.cost > 0 && x.act.k !== 'hire' && !x.rp) as Proposal | undefined;
    expect(p).toBeTruthy();
    s.money = 0;
    expect(approve(s, p!.id)).toBe('money');
    const held = s.deleg!.inbox.find((x) => x.id === p!.id)!;
    expect(held.status).toBe('held');
    expect(held.note).toBe('money');
    // お金ができたら承認できる
    s.money = 1e6;
    expect(approve(s, p!.id)).toBeNull();
    // 自分で保留
    delegMonth(s, { ...fakeReport(s), month: fakeReport(s).month + 1 });
    const q = s.deleg!.inbox[0];
    if (q) {
      expect(hold(s, q.id)).toBe(true);
      expect(s.deleg!.inbox.find((x) => x.id === q.id)!.status).toBe('held');
    }
  });
});

describe('セクター長（マネージャーと復興の委任のまとめ直し）', () => {
  it('新しく任命する条件は「事業部長 3 部門以上」（いまは表示だけ＝準備中：条件なしで任命できる）', () => {
    const s = newP1(1);
    const ok = sectorHeadOk(s);
    expect(ok.need).toBe(3);
    expect(ok.heads).toBe(0);
    expect(ok.ready).toBe(false);
    expect(ok.ok).toBe(true);
  });

  it('部長がいると、セクター長が提案を自分で承認して、そのセクタへ投資する（本社へ回す利益の 1 割 × 件数）', () => {
    const s = newP1(1);
    const rec = { id: 'c1', invest: 0.3, capital: 0, log: [{ m: 1, rev: 10000, profit: 5000, invest: 1500, toHQ: 3500 }] };
    const r = { toHQ: 3500, invest: 1500 };
    expect(sectorApprove(s, rec, r)).toBeNull();
    setLevel(s, 'logistics', DELEG.headAt);
    expect(setHead(s, 'logistics', s.staff[0].hero)).toBeNull();
    const x = sectorApprove(s, rec, r)!;
    expect(x.n).toBe(1);
    expect(x.invest).toBe(Math.round(3500 * DELEG.sector.invest));
    expect(r.toHQ).toBe(3500 - x.invest);
    expect(rec.capital).toBe(x.invest);
  });

  it('古いセーブ（版 13）：役目なしで読める。ほかのセクタのマネージャーは、そのままセクター長として続く', () => {
    const s = newP1(3);
    const st = s.staff[0];
    st.task = 'manager';
    st.target = 'c2';
    const o = JSON.parse(serializeP1(s));
    o.v = 13;
    delete o.deleg;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(back.deleg).toBeUndefined();
    expect(roleOf(staffOf(back, st.hero)!)).toEqual({ kind: 'sector', sector: 'c2' });
    expect(back.staff.filter((x) => x.task === 'lead')).toEqual([]);
    // 役目のあるセーブも保存し直してそのまま
    setLevel(back, 'logistics', DELEG.leaderAt);
    expect(setLeader(back, 'order', back.staff[1].hero)).toBeNull();
    const again = deserializeP1(serializeP1(back))!;
    expect(leaderOf(again, 'order')?.hero).toBe(back.staff[1].hero);
  });

  it('チュートリアル（タオックスの 1 か月目）：役目が無ければ、任せ方の記録も作らない（体験を変えない）', () => {
    const s = newP1(1);
    for (let k = 0; k < 20; k++) step(s);
    expect(s.deleg).toBeUndefined();
    expect(isResearch).toBeTruthy();
  });
});
