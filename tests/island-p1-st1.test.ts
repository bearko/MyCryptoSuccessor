/**
 * 段 ST1：スキルツリーを上から下へ流れる形に・複数条件・「ここまで研究を進める」・R2（研究パネルの Lv と RP の入り口）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 ST1 の実装」・docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { describe, expect, it } from 'vitest';
import { GOAL, R2, R2_SET, SKILL, SKILLS, ST1_MULTI, isResearch, maxLv, r2Panel, r2Rp, rpCost, type Tier } from '../src/island/p1/data';
import { setBudget } from '../src/island/p1/budget';
import { museumRp, r2Month, retestRp, runStudy, studyByHead, studyCost, studyLock, studyRp } from '../src/island/p1/r2';
import { openTier } from './l0util';
import { headReserve } from '../src/island/p1/budget';
import { goalFloor, goalMonths, goalPath, goalSeen, goalStep, setGoal } from '../src/island/p1/goal';
import { condsOf, deserializeP1, fxSum, has, learn, levelLock, levelUp, lvMul, museumValue, newP1, nextLevelCost, nextLevelRp, prereqLock, serializeP1, setLevel, skillLock, step, type P1State } from '../src/island/p1/model';
import { BANDS, BAND_TIERS, EDGES, LANES, POS, crossings, edgePoly, groupOf, laneCross } from '../src/island/p1/treelayout';
import { CROSS_NOW } from './st1util';

const rich = (seed = 3): P1State => {
  const s = newP1(seed);
  s.money = 5_000_000;
  s.rp = 100_000;
  s.flags.hq = true;
  return s;
};
const tierOf = (id: string): Tier => SKILL[id].tier ?? 'C';

describe('ST1 ①：配置は上から下', () => {
  it('どの線も下向き（通る点の y が増えていく。曲線の上でも戻らない）', () => {
    expect(EDGES.length).toBeGreaterThan(300);
    for (const e of EDGES) {
      for (let i = 1; i < e.pts.length; i++) expect(e.pts[i].y, `${e.from} → ${e.to}`).toBeGreaterThan(e.pts[i - 1].y);
      const poly = edgePoly(e.pts, 20);
      for (let i = 1; i < poly.length; i++) expect(poly[i].y, `${e.from} → ${e.to}`).toBeGreaterThanOrEqual(poly[i - 1].y - 1e-9);
    }
  });
  it('帯の順：Common → Uncommon → Rare → Epic → Legendary。パネルは自分のランクの帯の中', () => {
    expect(BAND_TIERS).toEqual(['C', 'U', 'R', 'E', 'L']);
    for (let i = 1; i < BAND_TIERS.length; i++) {
      const a = BANDS[BAND_TIERS[i - 1]];
      const b = BANDS[BAND_TIERS[i]];
      expect(b.line).toBeGreaterThan(a.bottom);
      expect(b.y).toBeGreaterThan(b.line);
    }
    for (const k of SKILLS) {
      const B = BANDS[tierOf(k.id)];
      const p = POS.get(k.id)!;
      expect(p.y, k.id).toBeGreaterThanOrEqual(B.y - 1e-9);
      expect(p.y, k.id).toBeLessThanOrEqual(B.bottom + 1e-9);
    }
  });
  it('帯の中は前提の深さの順（同じ帯の先に要るパネルより下）', () => {
    for (const k of SKILLS)
      for (const r of [...(k.requires ?? []), ...(k.anyOf?.ids ?? [])]) if (groupOf(r) === groupOf(k.id)) expect(POS.get(k.id)!.y, `${r} → ${k.id}`).toBeGreaterThan(POS.get(r)!.y);
  });
  it(`交わりの上限 ${CROSS_NOW}（描く曲線・並びの数え方の両方）`, () => {
    expect(crossings().length).toBeLessThanOrEqual(CROSS_NOW);
    expect(LANES.reduce((a, L) => a + laneCross(L), 0)).toBeLessThanOrEqual(CROSS_NOW);
  });
});

describe('ST1 ②：複数条件（判定は condsOf の 1 か所）', () => {
  it('全部要る（requires）は全部・n 個要る（anyOf）は n 個そろうと取れる。理解度・ブランド力・エンブレム・帯も同じ所で見る', () => {
    const s = rich();
    // 全部要る：物流拠点＝定期便と配送ルートの最適化の両方（段 ST1 で足した複数条件）
    expect(ST1_MULTI.hub).toEqual(['route_opt']);
    expect(SKILL.hub.requires).toEqual(expect.arrayContaining(['timetable', 'route_opt']));
    for (const id of ['loading', 'shortcut', 'timetable']) learn(s, id);
    expect(skillLock(s, SKILL.hub)).toBe('requires');
    const cs = condsOf(s, SKILL.hub).filter((c) => c.kind === 'req');
    expect(cs.map((c) => [c.kind === 'req' && c.id, c.ok])).toEqual([
      ['timetable', true],
      ['route_opt', false],
    ]);
    expect(learn(s, 'route_opt')).toBeNull();
    expect(prereqLock(s, SKILL.hub)).toBeNull();
    expect(learn(s, 'hub')).toBeNull();
    // n 個要る：名工の技（7 つの技のうち 3 つ）
    const m = SKILL.t_master;
    expect(m.anyOf?.n).toBe(3);
    const any = () => condsOf(s, m).find((c) => c.kind === 'any')!;
    expect(any().ok).toBe(false);
    s.skills.push('t_wood', 't_paper');
    expect(any()).toMatchObject({ got: 2, n: 3, ok: false });
    expect(prereqLock(s, m)).toBe('requires');
    s.skills.push('t_metal');
    expect(any()).toMatchObject({ got: 3, ok: true });
    // 帯（ランク）・ブランド力・エンブレム
    const sign = SKILL.b_sign;
    expect(prereqLock(s, sign)).toBe('ring');
    s.flags.rings = ['U'];
    s.skills.push(...(sign.requires ?? []));
    s.brand = 0;
    expect(prereqLock(s, sign)).toBe('brand');
    s.brand = 999;
    s.emblem = 0;
    expect(prereqLock(s, sign)).toBe('emblem');
    s.emblem = 9;
    expect(prereqLock(s, sign)).toBeNull();
  });
  it('足した複数条件は同じ束の中・値段（RP・G）は前のまま（つながりの前に値段を決める）', () => {
    for (const [id, add] of Object.entries(ST1_MULTI)) for (const r of add) expect(groupOf(r), `${r} → ${id}`).toBe(groupOf(id));
    expect([SKILL.hub.cost, SKILL.stock3.cost, SKILL.hr_career.cost]).toEqual([5000, 15000, 4500]);
    expect(has(newP1(1), 'hub')).toBe(false);
  });
  it('線も条件で見分ける：全部要る＝all・n 個要る＝any', () => {
    expect(EDGES.filter((e) => e.to === 'hub').map((e) => e.kind)).toEqual(['all', 'all']);
    expect(EDGES.filter((e) => e.to === 't_master' && e.kind === 'any').length).toBeGreaterThanOrEqual(6);
  });
});

describe('ST1 ③：ここまで研究を進める（goal.ts）', () => {
  it('道の順：まだ取っていない前提をすべて・前提の順・同じ深さなら安い順。目標は最後', () => {
    const s = rich();
    const path = goalPath(s, 'hub');
    expect(path[path.length - 1]).toBe('hub');
    expect(new Set(path)).toEqual(new Set(['loading', 'shortcut', 'timetable', 'route_opt', 'hub']));
    for (const [i, id] of path.entries()) for (const r of SKILL[id].requires ?? []) expect(path.indexOf(r), `${r} → ${id}`).toBeLessThan(i);
    // 同じ深さ（近道の地図・定期便の時刻表）は安い順
    const key = (id: string) => (isResearch(SKILL[id]) ? rpCost(SKILL[id]) * GOAL.rpG : SKILL[id].cost);
    expect(key(path[1])).toBeLessThanOrEqual(key(path[2]));
    // 取ったものは道に入らない
    learn(s, 'loading');
    expect(goalPath(s, 'hub')).not.toContain('loading');
    // n 個要る：足りない数だけ、安いほうから
    const m = goalPath(rich(), 't_master');
    expect(m.filter((id) => SKILL.t_master.anyOf!.ids.includes(id))).toHaveLength(3);
  });
  it('自動の支払い：RP とお金の両方で払えて、払ったあとの資金が下限以上なら道の順に取る。下限を割るなら待つ', () => {
    const s = rich();
    s.rp = 0;
    expect(setGoal(s, 'hub')).toBe(true);
    const floor = goalFloor(s);
    expect(floor).toBeGreaterThan(0);
    // RP が無い：研究パネルは待つ
    let r = goalStep(s);
    expect(r.got).toEqual([]);
    expect(r.wait?.why).toBe('rp');
    s.rp = 100_000;
    // お金のパネルは、払ったあとの資金が下限を割るなら待つ
    const path = goalPath(s, 'hub');
    const firstMoney = path.find((id) => !isResearch(SKILL[id]));
    r = goalStep(s);
    if (firstMoney) {
      expect(has(s, firstMoney) || r.wait?.why === 'floor' || !r.wait).toBe(true);
    }
    s.money = 5_000_000;
    r = goalStep(s);
    expect(has(s, 'hub')).toBe(true);
    expect(s.flags.goal).toBeUndefined();
    // 下限のテスト：お金のパネル 1 枚の道（資金がちょうど下限 ＋ 値段 − 1）
    const t = rich();
    const k = SKILLS.find((x) => !isResearch(x) && !x.requires?.length && !x.tier && !x.big && x.cost > 0 && !x.train && !x.donate && x.branch !== 'dig')!;
    expect(setGoal(t, k.id)).toBe(true);
    t.money = goalFloor(t) + k.cost - 1;
    expect(goalStep(t).wait).toEqual({ id: k.id, why: 'floor' });
    expect(has(t, k.id)).toBe(false);
    t.money += 1;
    const r2 = goalStep(t);
    expect(r2.got).toEqual([k.id]);
    expect(r2.reached).toBe(k.id);
    expect(t.money).toBeGreaterThanOrEqual(goalFloor(t));
    // 下限の月数を変える（0.5・1・2・3）
    t.flags.goalMonths = 3;
    expect(goalFloor(t)).toBe(Math.round(headReserve(t) * 3));
  });
  it('お金で買えない条件（ブランド力・エンブレム・帯）で止まるときは、その条件を出して待つ', () => {
    const s = rich();
    s.flags.rings = ['U'];
    s.brand = 0;
    s.emblem = 9;
    expect(setGoal(s, 'b_sign')).toBe(true);
    let r = goalStep(s);
    // 手前のパネルは取り、ブランド力で止まる
    for (const req of SKILL.b_sign.requires ?? []) expect(has(s, req), req).toBe(true);
    expect(r.wait).toEqual({ id: 'b_sign', why: 'brand' });
    expect(has(s, 'b_sign')).toBe(false);
    s.brand = 999;
    s.emblem = 0;
    r = goalStep(s);
    expect(r.wait).toEqual({ id: 'b_sign', why: 'emblem' });
    s.emblem = 9;
    r = goalStep(s);
    expect(r.reached).toBe('b_sign');
    // 帯が閉じている：待つ
    const u = rich();
    setGoal(u, 'b_sign');
    expect(goalStep(u).wait?.why).toBe('ring');
  });
  it('解放の通知：自動で取ったパネルは goalGot に積む（経営企画のタブの数字）。見たら消す', () => {
    const s = rich();
    setGoal(s, 'hub');
    const r = goalStep(s);
    expect(r.got.length).toBeGreaterThan(0);
    expect(s.flags.goalGot).toEqual(r.got);
    goalSeen(s);
    expect(s.flags.goalGot).toBeUndefined();
  });
  it('目標はセーブに残る。古いセーブ（目標の項目なし）も読める', () => {
    const s = rich();
    setGoal(s, 'hub');
    s.flags.goalMonths = 2;
    const back = deserializeP1(serializeP1(s))!;
    expect(back.flags.goal).toBe('hub');
    expect(back.flags.goalMonths).toBe(2);
    expect(back.v).toBe(s.v);
    const old = JSON.parse(serializeP1(newP1(4)));
    delete old.flags.goal;
    delete old.flags.goalMonths;
    delete old.flags.goalGot;
    const o = deserializeP1(JSON.stringify(old))!;
    expect(o.flags.goal).toBeUndefined();
    expect(goalStep(o)).toEqual({ got: [], reached: null, wait: null });
    expect(goalMonths(o)).toBe(1);
  });
  it('目標は 1 つ：別のパネルを選ぶと置き換わる。取ったパネル・寄付は目標にできない', () => {
    const s = rich();
    setGoal(s, 'hub');
    setGoal(s, 'stock3');
    expect(s.flags.goal).toBe('stock3');
    learn(s, 'host');
    expect(setGoal(s, 'host')).toBe(false);
    expect(setGoal(s, 'dig_donate')).toBe(false);
    expect(s.flags.goal).toBe('stock3');
  });
});

describe('ST1 ④：R2 研究パネルの Lv と RP の入り口', () => {
  it('+N% 型の研究パネルだけ Lv 1〜5。解放型・大きめ・発掘の枝・無限・寄付・お金のパネルはそのまま', () => {
    expect(R2_SET.size).toBeGreaterThan(150);
    for (const id of R2_SET) {
      const k = SKILL[id];
      expect(isResearch(k), id).toBe(true);
      expect(maxLv(k), id).toBe(5);
      expect(k.big || k.inf || k.donate || k.branch === 'dig' || k.train, id).toBeFalsy();
    }
    for (const id of ['shop2', 'pot', 'hub', 'route_cloth', 'auto_order', 'd_shop', 'dig_ext', 'u_dig_speed_inf', 'dig_donate', 'host', 'hire']) expect(r2Panel(SKILL[id]), id).toBe(false);
    expect(maxLv(SKILL.shop2)).toBe(1);
    expect(maxLv(SKILL.host)).toBe(5);
    expect(SKILL.host.cat).toBe('money');
  });
  it('1 段ごとに同じ効き（Lv n で Lv1 の n 倍）・RP は 1.0／1.5／2.2／3.2／4.5 倍・お金は要らない', () => {
    const s = rich();
    const k = SKILLS.find((x) => r2Panel(x) && x.fx?.[0]?.kind === 'pull' && (x.tier ?? 'C') !== 'C')!;
    const kind = k.fx![0].kind;
    s.flags.rings = ['U', 'R', 'E', 'L'];
    s.skills.push(k.id);
    const base = fxSum(s, kind);
    expect(base).toBeCloseTo(k.fx![0].v);
    expect(R2.mult).toEqual([1, 1.5, 2.2, 3.2, 4.5]);
    let rp = 0;
    for (let lv = 2; lv <= 5; lv++) {
      const need = r2Rp(k, lv);
      expect(need, `Lv${lv}`).toBe(Math.round(rpCost(k) * R2.mult[lv - 1]));
      expect(nextLevelRp(s, k)).toBe(need);
      expect(nextLevelCost(s, k)).toBe(0);
      const m0 = s.money;
      const rp0 = s.rp;
      expect(levelUp(s, k.id)).toBeNull();
      expect(s.money).toBe(m0);
      expect(rp0 - s.rp).toBe(need);
      rp += need;
      expect(fxSum(s, kind)).toBeCloseTo(k.fx![0].v * lv);
      expect(lvMul(s, k.id)).toBe(lv);
    }
    expect(rp + rpCost(k)).toBe([1, 1.5, 2.2, 3.2, 4.5].reduce((a, m) => a + Math.round(rpCost(k) * m), 0));
    expect(levelLock(s, k)).toBe('max');
    // RP が足りなければ上げられない
    const t2 = rich();
    t2.flags.rings = ['U', 'R', 'E', 'L'];
    t2.skills.push(k.id);
    t2.rp = r2Rp(k, 2) - 1;
    expect(levelLock(t2, k)).toBe('rp');
    // 個別の効き目のパネル（品出しの名人）も Lv で比例
    const d = rich();
    d.skills.push('display');
    expect(lvMul(d, 'display')).toBe(1);
    setLevel(d, 'display', 3);
    expect(lvMul(d, 'display')).toBe(3);
    // お金のパネルは前のまま（Lv5 で 2 倍）
    d.skills.push('host');
    setLevel(d, 'host', 5);
    expect(lvMul(d, 'host')).toBe(2);
  });
  it('入り口 ①：研究の施策（整理・文献）はお金を払って RP。月に 1 回ずつ。Rare より前は手で・Rare で R&D 部長がいれば部長が予算で', () => {
    const s = rich();
    s.flags.digMeet = 'done';
    const rp0 = s.rp;
    const m0 = s.money;
    expect(studyLock(s, 'sort')).toBeNull();
    const r = runStudy(s, 'sort');
    expect(r).toEqual({ cost: studyCost(s, 'sort'), rp: studyRp(s, 'sort') });
    expect(s.money).toBe(m0 - studyCost(s, 'sort'));
    expect(s.rp).toBe(rp0 + studyRp(s, 'sort'));
    expect(s.rpSrc?.study).toBe(studyRp(s, 'sort'));
    expect(runStudy(s, 'sort')).toBe('done');
    expect(runStudy(s, 'lit')).not.toBe('done');
    // 次の月はまた行える
    s.day += 30;
    expect(studyLock(s, 'sort')).toBeNull();
    // 発掘と出会う前は出さない
    const u = rich();
    delete u.flags.digMeet;
    expect(studyLock(u, 'sort')).toBe('hidden');
    // お金が足りない
    const p = rich();
    p.flags.digMeet = 'done';
    p.money = 0;
    expect(studyLock(p, 'lit')).toBe('money');
    // Rare：R&D 部長がいれば部長が予算で（手では行えない）
    const h = openTier(rich(), 'R');
    h.flags.digMeet = 'done';
    const st = h.staff[0];
    st.heads = ['rnd'];
    expect(studyByHead(h)).toBe(true);
    expect(studyLock(h, 'sort')).toBe('head');
    setBudget(h, 'rnd', 'X', 1_000_000);
    const rpH = h.rp;
    const out = r2Month(h);
    expect(out.study).toEqual(['sort', 'lit']);
    expect(h.rp).toBeGreaterThanOrEqual(rpH + studyRp(h, 'sort') + studyRp(h, 'lit'));
    // 倍率：Rare は Common の 6.25 倍
    expect(studyRp(h, 'sort')).toBe(Math.round(R2.study.sort.rp * R2.scale.R));
  });
  it('入り口 ②：追試（研究発表を済ませた町ごとに月 1 回）・③ 展示館（展示の価値 × 倍率）。月の報告に入り口ごとの RP', () => {
    const s = rich();
    s.presented = ['c1', 'c2'];
    expect(retestRp(s)).toBe(R2.retest.C * 2);
    s.presented.push('u1');
    expect(retestRp(s)).toBe(R2.retest.C * 2 + R2.retest.U);
    // 展示館：館が開いていなければ 0
    expect(museumRp(s)).toBe(0);
    s.museum = { at: { sector: 'zz', uid: 1 }, items: [], lv: 0, marks: 0 };
    s.research = { 1011: 3, 1056: 1 };
    s.museum.items = [1011, 1056];
    expect(museumRp(s)).toBe(Math.round(museumValue(s) * R2.museum));
    expect(museumRp(s)).toBeGreaterThan(0);
    const rp0 = s.rp;
    const r = r2Month(s);
    expect(r.retest).toBe(retestRp(s));
    expect(r.museum).toBe(museumRp(s));
    expect(s.rp).toBe(rp0 + r.retest + r.museum);
    expect(s.rpSrc).toMatchObject({ retest: r.retest, museum: r.museum });
  });
  it('月の締めで、入り口ごとの RP を月の報告に移す（研究ノートの棒）', () => {
    const s = rich();
    s.presented = ['c1'];
    s.open = 0;
    s.day = 29;
    const r = step(s);
    expect(r.report?.rpSrc?.retest).toBe(R2.retest.C);
    expect(s.rpSrc).toEqual({});
  });
});
