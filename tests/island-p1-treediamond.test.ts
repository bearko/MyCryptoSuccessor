/**
 * スキルツリーのパネル（ひし形・アイコンだけ）の配置と線（docs/ISLAND_PHASE1.md「スキルツリー」の「パネルの形・間隔・線」）。
 */
import { describe, expect, it } from 'vitest';
import { SKILL, type Tier } from '../src/island/p1/data';
import { BEND_MAX, BOUNDS, EDGES, EDGE_CLEAR, GAP, HUBPOS, PANEL, POS, RING_OUT, STEP, UNIT, bendSize, curveAt, curveNear, curvePart, edgeBends, edgeEnd, rimDist } from '../src/island/p1/treelayout';

describe('スキルツリー：ひし形のパネルの大きさと間隔', () => {
  it('パネルはひし形の外接の幅 UNIT の 0.6〜0.7（64px）。段の間・パネルの間は、ひし形のすき間が 0.8〜1 枚分', () => {
    expect(PANEL).toBeGreaterThanOrEqual(0.6);
    expect(PANEL).toBeLessThanOrEqual(0.7);
    expect(Math.round(PANEL * UNIT)).toBe(64);
    for (const d of [GAP, STEP]) {
      expect((d - PANEL) / PANEL).toBeGreaterThanOrEqual(0.8);
      expect((d - PANEL) / PANEL).toBeLessThanOrEqual(1);
    }
  });

  it('どのひし形も、ほかのひし形と重ならない（すき間はいちばん近い 2 枚でもひし形の幅の 0.6 枚分以上）。枝の根もとの札とも重ならない', () => {
    const ps = [...POS.entries()];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        // 同じ向きのひし形（|x| + |y| ≤ PANEL / 2）どうしは、中心の L1 の距離が PANEL を超えれば重ならない
        const l1 = Math.abs(ps[i][1].x - ps[j][1].x) + Math.abs(ps[i][1].y - ps[j][1].y);
        expect(l1 - PANEL, `${ps[i][0]}–${ps[j][0]}`).toBeGreaterThan(PANEL * 0.6);
      }
    for (const [, p] of HUBPOS) for (const [id, q] of ps) expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeGreaterThan(0.9);
  });

  it('全体が広がりすぎない（いちばん外の段の半径 21 UNIT まで。PC の「全体」で 1 画面に収まる）', () => {
    expect(RING_OUT.L).toBeLessThanOrEqual(21);
    expect(Math.max(-BOUNDS.x0, BOUNDS.x1, -BOUNDS.y0, BOUNDS.y1)).toBeLessThanOrEqual(21);
    // PC 1280×800 の木の高さ（約 650px）で、拡大率の下限 0.15 より大きく全体が入る
    expect(650 / (2 * (RING_OUT.L + 0.9) * UNIT)).toBeGreaterThan(0.15);
  });
});

describe('スキルツリー：つながりの線', () => {
  it('線は先に要るパネル（無ければ枝の根もと）から。両端のパネルはある', () => {
    expect(EDGES.length).toBeGreaterThan(300);
    for (const e of EDGES) {
      expect(SKILL[e.to], e.to).toBeTruthy();
      if (e.from) expect(POS.has(e.from), e.from).toBe(true);
      expect(edgeEnd(e.from, e.g)).toBeTruthy();
    }
    for (const k of Object.values(SKILL)) if (k.requires?.length && !k.sealed) for (const r of k.requires) expect(EDGES.some((e) => e.from === r && e.to === k.id), `${r} → ${k.id}`).toBe(true);
  });

  it('ひし形の縁で切る：横・縦はひし形の幅の半分、斜め 45° はその 1/√2', () => {
    expect(rimDist(1, 0)).toBeCloseTo(PANEL / 2);
    expect(rimDist(0, -1)).toBeCloseTo(PANEL / 2);
    expect(rimDist(Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(PANEL / 2 / Math.SQRT2);
  });

  it('ほかのパネルを横切る線はゆるい弧にする（まっすぐな線から 1.6 まで）。左右で膨らみの違う弧は、左右対称の弧で避けられない少しの線だけ', () => {
    const bends = edgeBends();
    let straightHits = 0;
    let curved = 0;
    let two = 0;
    for (const e of EDGES) {
      const a = edgeEnd(e.from, e.g);
      const b = edgeEnd(e.to, e.g);
      const others = [...POS].filter(([id]) => id !== e.from && id !== e.to);
      if (others.some(([, p]) => curveNear(a, b, 0, p, PANEL / 2 + EDGE_CLEAR))) straightHits++;
      const m = bends.get(e) ?? 0;
      if (m) curved++;
      expect(bendSize(m), `${e.from} → ${e.to}`).toBeLessThanOrEqual(BEND_MAX + 1e-9);
      if (typeof m === 'number') continue;
      two++;
      expect(m.h1, `${e.from} → ${e.to}`).not.toBe(m.h2);
      // 弧は線の向きに進むだけ（根もとから先へ、線の上で折り返さない）
      const along = (t: number) => {
        const q = curveAt(a, b, m, t);
        return (q.x - a.x) * (b.x - a.x) + (q.y - a.y) * (b.y - a.y);
      };
      for (let i = 1; i <= 20; i++) expect(along(i / 20)).toBeGreaterThan(along((i - 1) / 20));
    }
    expect(straightHits).toBeGreaterThan(0);
    expect(curved).toBeGreaterThanOrEqual(straightHits);
    // 左右で膨らみの違う弧は少しだけ（ほとんどの線はまっすぐか左右対称の弧）
    expect(two).toBeLessThan(EDGES.length * 0.05);
  });

  it('縁で切った線（弧の一部）は、もとの弧の上にある', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 6, y: 1 };
    for (const m of [0.8, { h1: -0.6, h2: 1.4 }]) {
      const [p0, c1, c2, p3] = curvePart(a, b, m, 0.1, 0.85);
      for (const s of [0, 0.3, 0.5, 1]) {
        const u = 1 - s;
        const q = { x: u * u * u * p0.x + 3 * u * u * s * c1.x + 3 * u * s * s * c2.x + s * s * s * p3.x, y: u * u * u * p0.y + 3 * u * u * s * c1.y + 3 * u * s * s * c2.y + s * s * s * p3.y };
        const want = curveAt(a, b, m, 0.1 + 0.75 * s);
        expect(q.x).toBeCloseTo(want.x);
        expect(q.y).toBeCloseTo(want.y);
      }
    }
    // 左右対称の弧 m は、いちばん膨らむ所（真ん中）で線から m
    expect(curveAt({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.5, 0.5).y).toBeCloseTo(0.5);
  });
});

/** 点 p と線分 q0–q1 の L1 の距離（ひし形 |x| + |y| ≤ r と線分が交わるのは、これが r 未満のとき）。L1 の距離は線分の上で凸の折れ線なので、端と折れ目だけ調べる */
function l1ToSeg(p: { x: number; y: number }, q0: { x: number; y: number }, q1: { x: number; y: number }) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  const ts = [0, 1];
  if (dx) ts.push((p.x - q0.x) / dx);
  if (dy) ts.push((p.y - q0.y) / dy);
  let best = Infinity;
  for (const t of ts) {
    if (t < 0 || t > 1) continue;
    best = Math.min(best, Math.abs(q0.x + dx * t - p.x) + Math.abs(q0.y + dy * t - p.y));
  }
  return best;
}
/**
 * つながりの線が、つないでいる 2 枚以外のパネルのひし形（外接の幅 PANEL に、まわり EDGE_CLEAR＝0.06 の余白）を横切る線を数える。
 * 線（弧）を細かい折れ線（120 区間）にして、各区間とひし形が交わるかを調べる（点で調べるのと違い、区間の間の角も見落とさない）。
 * tiers：線の先（子）のランク。外周を開いた状態で見える線（閉じた外周の線はごく薄い点線）
 */
function crossingEdges(tiers: Tier[]) {
  const bends = edgeBends();
  const r = PANEL / 2 + EDGE_CLEAR;
  const out: string[] = [];
  for (const e of EDGES) {
    if (!tiers.includes(SKILL[e.to].tier ?? 'C')) continue;
    const a = edgeEnd(e.from, e.g);
    const b = edgeEnd(e.to, e.g);
    const m = bends.get(e) ?? 0;
    const pts = Array.from({ length: 121 }, (_, i) => curveAt(a, b, m, i / 120));
    const hit = [...POS].filter(([id, p]) => id !== e.from && id !== e.to && pts.some((q, i) => i > 0 && l1ToSeg(p, pts[i - 1], q) < r)).map(([id]) => id);
    if (hit.length) out.push(`${e.from ?? '(根もと)'} → ${e.to}（${hit.join('・')}）`);
  }
  return out;
}

describe('スキルツリー：線がほかのパネルを横切らない', () => {
  it('Common・Uncommon・Rare の外周を開いた状態でも、閉じた外周（Epic・Legendary）の薄い線も、ほかのパネルのひし形を横切る線は 0 本', () => {
    const C: Tier[] = ['C'];
    const U: Tier[] = [...C, 'U'];
    const R: Tier[] = [...U, 'R'];
    const all: Tier[] = [...R, 'E', 'L'];
    const n = { C: crossingEdges(C), U: crossingEdges(U), R: crossingEdges(R), all: crossingEdges(all) };
    expect(n, JSON.stringify(n, null, 1)).toEqual({ C: [], U: [], R: [], all: [] });
  });

  it('数える関数：パネルの真ん中を通る線は横切る・ひし形の角の外をかすめる線は横切らない', () => {
    const p = { x: 0, y: 0 };
    expect(l1ToSeg(p, { x: -1, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0);
    // ひし形の角（右上の辺の外）を斜めに通る線：点で数えると見落としやすい所
    expect(l1ToSeg(p, { x: -1, y: 1.2 }, { x: 1.2, y: -1 })).toBeCloseTo(0.2);
    expect(l1ToSeg(p, { x: 2, y: 2 }, { x: 3, y: 1 })).toBeCloseTo(4);
  });
});
