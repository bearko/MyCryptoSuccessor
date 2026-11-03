/**
 * スキルツリーの並び（treelayout.ts の POOLS・treeorder.ts の TREE_ORDER）：つながりの線が交わらない。
 * ISLAND_TREE_OPT=1 で回すと、scripts/island/treeopt.ts で並びを探して src/island/p1/treeorder.ts を書き直す（スキルを足したあとに）。
 * ISLAND_TREE_LINKS=1 で回すと、scripts/island/treelinks.ts でつながり（枝をまたぐ「先に要る」を同じ束にまとめ直す）と並びを一緒に探し、
 * 描く弧で数えて仕上げて、src/island/p1/treelinks.ts と treeorder.ts を書き直す（段 UI5b。交わりを 0 に）。
 * ふだんは、いまの並びの線の交わりを数える（四角＝研究・菱形＝お金の大きさ、日本語・英語の札の大きさ）。
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { optimize } from '../scripts/island/treeopt';
import { optimizeLinks, polishLinks } from '../scripts/island/treelinks';
import { EDGES, EDGE_CLEAR, POS, SQ_SIDE, PANEL, edgeBends, edgeEnd, curveAt, halfOf, hubsAround, linfSeg, polyInBox, shapeById } from '../src/island/p1/treelayout';
import { SKILL, SKILLS, isResearch } from '../src/island/p1/data';
import { TREE_ORDER } from '../src/island/p1/treeorder';

/** いまの線どうしの交わりの数（四角＝研究・菱形＝お金の大きさ。端を共有する線は数えない）。段 UI5b でつながりを見直して 0 */
const CROSS_NOW = 0;
type P = { x: number; y: number };
const orient = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const segX = (a: P, b: P, c: P, d: P) => {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
};
/** 線どうしの交わり（いま描く弧どうし。端を共有する線は数えない）。組の一覧つき */
export function crossings(): string[] {
  const bends = edgeBends();
  const polys = EDGES.map((e) => {
    const a = edgeEnd(e.from, e.g);
    const b = edgeEnd(e.to, e.g);
    const m = bends.get(e) ?? 0;
    return { e, pts: Array.from({ length: 61 }, (_, i) => curveAt(a, b, m, i / 60)) };
  });
  const out: string[] = [];
  for (let i = 0; i < polys.length; i++)
    for (let j = i + 1; j < polys.length; j++) {
      const A = polys[i];
      const B = polys[j];
      if ((A.e.from == null ? B.e.from == null && A.e.g === B.e.g : A.e.from === B.e.from) || A.e.to === B.e.to || A.e.from === B.e.to || A.e.to === B.e.from) continue;
      let hit = false;
      for (let a = 1; a < A.pts.length && !hit; a++) for (let b = 1; b < B.pts.length; b++) if (segX(A.pts[a - 1], A.pts[a], B.pts[b - 1], B.pts[b])) hit = true;
      if (hit) out.push(`${A.e.from ?? '(根もと)'}→${A.e.to} × ${B.e.from ?? '(根もと)'}→${B.e.to}`);
    }
  return out;
}

describe.runIf(!!process.env.ISLAND_TREE_OPT)('並びを探す（ISLAND_TREE_OPT=1）', () => {
  it('焼きなましで並びを探し、treeorder.ts に書く', () => {
    let best: ReturnType<typeof optimize> | null = null;
    // ISLAND_TREE_START=1：いまの並び（TREE_ORDER）から、低い温度で直す（パネルの下を通る線を 0 にする重みで）
    const fix = !!process.env.ISLAND_TREE_START;
    for (const seed of fix ? [1] : [1, 2, 3]) {
      const r = optimize({ seed, iters: Number(process.env.ISLAND_TREE_ITERS ?? 300000), start: best?.order ?? (fix ? TREE_ORDER : undefined), ...(fix ? { t0: 0.35, t1: 0.02, w: { x: 1, hit: 20, hub: 20, inward: 0.5, len: 0.004 } } : {}) });
      process.stderr.write(`OPT seed ${seed}: crossings ${r.crossings} hits ${r.hits} hub ${r.hubHits} cost ${r.cost}\n`);
      if (!best || r.cost < best.cost) best = r;
    }
    const o = best!.order;
    const body = Object.entries(o)
      .map(([k, v]) => `  '${k}': [${v.map((x) => `'${x}'`).join(', ')}],`)
      .join('\n');
    writeFileSync(
      'src/island/p1/treeorder.ts',
      `/**\n * スキルツリーの並びの入れ替え（組の key → パネルの id の並び。treelayout.ts の POOLS）。\n * つながりの線が交わらないように選んだもの。tests/island-p1-treeorder.test.ts（ISLAND_TREE_OPT=1）が書く。手で直さない。\n */\nexport const TREE_ORDER: Record<string, string[]> = {\n${body}\n};\n`,
    );
    expect(true).toBe(true);
  }, 3_600_000);
});

describe.runIf(!!process.env.ISLAND_TREE_LINKS)('つながりと並びを探す（ISLAND_TREE_LINKS=1）', () => {
  it('まっすぐな線で探す → 描く弧で仕上げる → treelinks.ts と treeorder.ts に書く', () => {
    const a = optimizeLinks({ seed: 5, iters: 250000, start: { order: TREE_ORDER }, w: { x: 10, hit: 0.15, hub: 0.5, inward: 0.2, len: 0.004 }, change: 1, t0: 0.6, t1: 0.01 });
    // 仕上げは 3 回：替えるつながりの費用を上げながら（交わり・パネルの下を 0 にしたまま、替えたつながりを戻していく）
    const it = Number(process.env.ISLAND_TREE_ITERS ?? 30000);
    let r = polishLinks({ seed: 7, iters: it, start: { order: a.order, links: a.links }, cw: 1, t0: 0.8, t1: 0.02 });
    r = polishLinks({ seed: 11, iters: it, start: { order: r.order, links: r.links }, cw: 4, t0: 0.3, t1: 0.01 });
    r = polishLinks({ seed: 13, iters: it, start: { order: r.order, links: r.links }, cw: 8, t0: 0.3, t1: 0.01 });
    process.stderr.write(`LINKS: crossings ${r.curve.x} hits ${r.curve.hit} hub ${r.curve.hub} changed ${r.changed}\n`);
    const body = Object.entries(r.order)
      .map(([k, v]) => `  '${k}': [${v.map((x) => `'${x}'`).join(', ')}],`)
      .join('\n');
    writeFileSync('src/island/p1/treeorder.ts', `/**\n * スキルツリーの並びの入れ替え（組の key → パネルの id の並び。treelayout.ts の POOLS）。\n * つながりの線が交わらないように選んだもの。tests/island-p1-treeorder.test.ts（ISLAND_TREE_OPT=1・ISLAND_TREE_LINKS=1）が書く。手で直さない。\n */\nexport const TREE_ORDER: Record<string, string[]> = {\n${body}\n};\n`);
    const lb = SKILLS.filter((k) => r.links[k.id])
      .map((k) => `  ${k.id}: [${r.links[k.id].map((x) => `'${x}'`).join(', ')}],`)
      .join('\n');
    writeFileSync('src/island/p1/treelinks.ts', `/**\n * スキルツリーのつながりの見直し（段 UI5b）：パネルの id → 新しい「先に要る」（[] は根もとから）。\n * 線どうしの交わりを 0 にするため、枝をまたぐ「先に要る」を同じ束の中にまとめ直したもの（効き目・値段は変えない。値段は見直しの前のつながりで決める）。\n * tests/island-p1-treeorder.test.ts（ISLAND_TREE_LINKS=1）が scripts/island/treelinks.ts で探して書く。手で直さない。\n */\nexport const TREE_LINKS: Record<string, string[]> = {\n${lb}\n};\n`);
    expect(r.curve.x).toBe(0);
  }, 3_600_000);
});

describe('スキルツリーの並び：線が交わらない', () => {
  it('つながりの線どうしの交わりが 0（もとの並びは 298 か所 → 並べ直して 64 か所 → 段 UI5b でつながりを見直して 0：docs/ISLAND_PHASE1.md「並び（線が交わらない）」）', () => {
    const x = crossings();
    expect(x.length, x.slice(0, 30).join('\n')).toBeLessThanOrEqual(CROSS_NOW);
  });
  it('線は、ほかのパネル（四角は四角・菱形は菱形の大きさ）の下を通らない', () => {
    const bends = edgeBends();
    const out: string[] = [];
    for (const e of EDGES) {
      const a = edgeEnd(e.from, e.g);
      const b = edgeEnd(e.to, e.g);
      const m = bends.get(e) ?? 0;
      const pts = Array.from({ length: 121 }, (_, i) => curveAt(a, b, m, i / 120));
      const hit = [...POS].filter(([id, p]) => {
        if (id === e.from || id === e.to) return false;
        const r = halfOf(id) + EDGE_CLEAR;
        return pts.some((q, i) => i > 0 && (shapeById(id) === 'square' ? linfSeg(p, pts[i - 1], q) : l1(p, pts[i - 1], q)) < r);
      });
      if (hit.length) out.push(`${e.from ?? '(根もと)'}→${e.to}（${hit.map(([id]) => id).join('・')}）`);
      const hubs = hubsAround(e).filter((p) => polyInBox(pts, p, p));
      if (hubs.length) out.push(`${e.from ?? '(根もと)'}→${e.to}（札 ${hubs.map((p) => p.d).join('・')}）`);
    }
    if (process.env.ISLAND_TREE_DUMP) require('node:fs').writeFileSync('/tmp/claude-0/-home-claude/16d1fa58-8443-558d-b2e3-9ac73987a953/scratchpad/hits.json', JSON.stringify(out));
    expect(out, out.slice(0, 20).join('\n')).toEqual([]);
  });
  it('どのパネルも、払うものと形が合っている：研究ポイント（RP）は四角・お金は菱形（形の大きさもそれぞれ）', () => {
    expect(SKILLS.length).toBeGreaterThan(300);
    for (const k of SKILLS) expect(shapeById(k.id), k.id).toBe(isResearch(k) ? 'square' : 'diamond');
    // 無限の強化パネルは RP・研究への寄付はお金
    expect(shapeById('u_dig_speed_inf')).toBe('square');
    expect(shapeById('dig_donate')).toBe('diamond');
    expect(halfOf('dig_donate')).toBeCloseTo(PANEL / 2);
    expect(halfOf('hire')).toBeCloseTo(SQ_SIDE / 2);
    expect(SKILL.hire.cat).toBe('research');
  });
});
/** 点 p と線分 q0–q1 の L1 の距離（菱形） */
function l1(p: P, q0: P, q1: P) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  let best = Math.min(Math.abs(q0.x - p.x) + Math.abs(q0.y - p.y), Math.abs(q1.x - p.x) + Math.abs(q1.y - p.y));
  for (const t of [dx ? (p.x - q0.x) / dx : -1, dy ? (p.y - q0.y) / dy : -1]) if (t > 0 && t < 1) best = Math.min(best, Math.abs(q0.x + dx * t - p.x) + Math.abs(q0.y + dy * t - p.y));
  return best;
}
