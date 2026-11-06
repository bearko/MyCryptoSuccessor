/**
 * スキルツリーのパネル（ひし形・四角。アイコンだけ）の配置と線（docs/ISLAND_PHASE1.md「スキルツリー」の「パネルの形・間隔・線」）。
 * 段 ST1：上から下へ流れる形に直した（放射状のときの意図：大きさと間隔・重ならない・広がりすぎない・線は先に要るパネルから・線がほかのパネルや札の下を通らない）。
 */
import { describe, expect, it } from 'vitest';
import { SKILL, type Tier } from '../src/island/p1/data';
import { BANDS, BOUNDS, EDGES, EDGE_CLEAR, GAP, HUBPOS, HUB_BOX, PANEL, POS, STEP, UNIT, edgeEnd, edgePath, edgePoly, linfSeg, l1Seg, polyHits, polyInBox, segCtrl } from '../src/island/p1/treelayout';

describe('スキルツリー：パネルの大きさと間隔', () => {
  it('パネルは菱形の外接の幅 UNIT の 0.6〜0.7（64px）。段の間・パネルの間は、パネルのすき間が 0.8〜1 枚分', () => {
    expect(PANEL).toBeGreaterThanOrEqual(0.6);
    expect(PANEL).toBeLessThanOrEqual(0.7);
    expect(Math.round(PANEL * UNIT)).toBe(64);
    for (const d of [GAP, STEP]) {
      expect((d - PANEL) / PANEL).toBeGreaterThanOrEqual(0.8);
      expect((d - PANEL) / PANEL).toBeLessThanOrEqual(1);
    }
  });

  it('どのパネルも、ほかのパネルと重ならない（すき間はいちばん近い 2 枚でもパネルの幅の 0.6 枚分以上）。部門の見出しとも重ならない', () => {
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const l1 = Math.abs(ps[i][1].x - ps[j][1].x) + Math.abs(ps[i][1].y - ps[j][1].y);
        expect(l1 - PANEL, `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(PANEL * 0.6);
      }
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.abs(p.y - q.y), id).toBeGreaterThan(HUB_BOX.h / 2 + PANEL / 2);
  });

  it('全体が広がりすぎない：横 84・縦 36 UNIT まで（PC の「全体」で、パネルが 10px 以上・見出しの棒で進み具合が分かる）', () => {
    expect(BOUNDS.x1 - BOUNDS.x0).toBeLessThanOrEqual(84);
    expect(BOUNDS.y1 - BOUNDS.y0).toBeLessThanOrEqual(36);
    // PC 1280 の幅で、全体が入る大きさのパネルの幅
    expect((1264 / ((BOUNDS.x1 - BOUNDS.x0 + 1) * UNIT)) * PANEL * UNIT).toBeGreaterThan(10);
  });
});

describe('スキルツリー：つながりの線', () => {
  it('線は先に要るパネル（無ければ列の根もとか帯の入口）から。両端のパネルはある', () => {
    expect(EDGES.length).toBeGreaterThan(300);
    for (const e of EDGES) {
      expect(SKILL[e.to], e.to).toBeTruthy();
      if (e.from) expect(POS.has(e.from), e.from).toBe(true);
      expect(edgeEnd(e.from, e.g)).toBeTruthy();
      // 線の最後の点は子のパネル
      expect(e.pts[e.pts.length - 1]).toEqual(POS.get(e.to));
      if (e.from) expect(e.pts[0]).toEqual(POS.get(e.from));
    }
    for (const k of Object.values(SKILL)) if (k.requires?.length && !k.sealed) for (const r of k.requires) expect(EDGES.some((e) => e.from === r && e.to === k.id && e.kind === 'all'), `${r} → ${k.id}`).toBe(true);
    for (const k of Object.values(SKILL)) for (const r of k.anyOf?.ids ?? []) if (!k.requires?.includes(r)) expect(EDGES.some((e) => e.from === r && e.to === k.id && e.kind === 'any'), `${r} ⇢ ${k.id}`).toBe(true);
  });

  it('線の形：端で縦向き（上のパネルから真下へ出て、下のパネルへ真上から入る）。描く道は M で始まり、曲げる区間は C', () => {
    const { c1, c2 } = segCtrl({ x: 0, y: 0 }, { x: 3, y: 2 });
    expect(c1.x).toBe(0);
    expect(c2.x).toBe(3);
    expect(c1.y).toBeGreaterThan(0);
    expect(c2.y).toBeLessThan(2);
    const d = edgePath([{ x: 0, y: 0 }, { x: 3, y: 2 }], (p) => ({ x: p.x * 10, y: p.y * 10 }), 0.3, 0.3);
    expect(d.startsWith('M0.0 3.0C')).toBe(true);
    expect(edgePath([{ x: 1, y: 0 }, { x: 1, y: 2 }], (p) => p)).toContain('L');
  });
});

/** 線（子の帯を tiers に限る）のうち、つないでいる 2 枚以外のパネルの形（余白つき）を横切る線 */
function crossingEdges(tiers: Tier[]) {
  const out: string[] = [];
  for (const e of EDGES) {
    if (!tiers.includes(SKILL[e.to].tier ?? 'C')) continue;
    const pts = edgePoly(e.pts, 40);
    const hit = [...POS].filter(([id, p]) => id !== e.from && id !== e.to && polyHits(pts, id, p, EDGE_CLEAR)).map(([id]) => id);
    if (hit.length) out.push(`${e.from ?? '(根もと)'} → ${e.to}（${hit.join('・')}）`);
  }
  return out;
}

describe('スキルツリー：線がほかのパネルを横切らない', () => {
  it('Common・Uncommon・Rare の帯を開いた状態でも、閉じた帯（Epic・Legendary）の薄い線も、ほかのパネルを横切る線は 0 本', () => {
    const C: Tier[] = ['C'];
    const U: Tier[] = [...C, 'U'];
    const R: Tier[] = [...U, 'R'];
    const all: Tier[] = [...R, 'E', 'L'];
    const n = { C: crossingEdges(C), U: crossingEdges(U), R: crossingEdges(R), all: crossingEdges(all) };
    expect(n, JSON.stringify(n, null, 1)).toEqual({ C: [], U: [], R: [], all: [] });
  });

  it('線は、部門の見出しの下を通らない（本社 → 見出しの線は別）・帯の境の札の高さ（境の横線）では線は下へ進んでいる', () => {
    const out: string[] = [];
    for (const e of EDGES) {
      const pts = edgePoly(e.pts, 40);
      const hit = [...HUBPOS].filter(([d, p]) => !(e.from == null && !e.gate && d === e.br) && polyInBox(pts.slice(1), p, HUB_BOX));
      if (hit.length) out.push(`${e.from ?? '(根もと)'} → ${e.to}（${hit.map(([d]) => d).join('・')}）`);
    }
    expect(out).toEqual([]);
    expect(polyInBox([{ x: -1, y: 0 }, { x: 1, y: 0 }], { x: 0, y: 0 }, { w: 0.4, h: 0.2 })).toBe(true);
    expect(polyInBox([{ x: -1, y: 0.3 }, { x: 1, y: 0.3 }], { x: 0, y: 0 }, { w: 0.4, h: 0.2 })).toBe(false);
    for (const tier of ['U', 'R', 'E', 'L'] as Tier[]) expect(BANDS[tier].line).toBeGreaterThan(BANDS[(['C', 'U', 'R', 'E'] as Tier[])[['U', 'R', 'E', 'L'].indexOf(tier)]].bottom);
  });

  it('数える関数：パネルの真ん中を通る線は横切る・菱形の角の外をかすめる線は横切らない（四角は L∞）', () => {
    const p = { x: 0, y: 0 };
    expect(l1Seg(p, { x: -1, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    expect(l1Seg(p, { x: -1, y: 1.2 }, { x: 1.2, y: -1 })).toBeCloseTo(0.2);
    expect(l1Seg(p, { x: 2, y: 2 }, { x: 3, y: 1 })).toBeCloseTo(4);
    expect(linfSeg(p, { x: -1, y: 0.5 }, { x: 1, y: 0.5 })).toBeCloseTo(0.5);
  });
});
