/**
 * 段 ST1：スキルツリーを上から下へ流れる形に・複数条件・「ここまで研究を進める」・R2（研究パネルの Lv と RP の入り口）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 ST1 の実装」・docs/ISLAND_PHASE1.md「スキルツリー」。
 */
import { describe, expect, it } from 'vitest';
import { SKILL, SKILLS, ST1_MULTI, type Tier } from '../src/island/p1/data';
import { condsOf, has, learn, newP1, prereqLock, skillLock, type P1State } from '../src/island/p1/model';
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
