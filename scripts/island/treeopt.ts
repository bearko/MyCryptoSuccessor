/**
 * スキルツリーの並びを探す（段 ST1：上から下へ流れる形。DOM なし）。レーン（部門の列・物流の束）ごとに、段の中の並びを
 * はじめの並びを混ぜて何度も並べ直し（treelayout.ts の orderLane：重心法 → 隣どうしの入れ替え）、
 * 線どうしの交わり（並びの数え方）がいちばん少ない並びのうち、線がパネルの下を通らないものを選ぶ。
 * 結果は src/island/p1/treeorder.ts（tests/island-p1-treeorder.test.ts の ISLAND_TREE_OPT=1 が書く）。乱数は固定の種。
 */
import { EDGES, LANES, POS, buildLane, crossings, edgePoly, laneCross, layoutTree, mulberry, orderLane, polyHits, rowKey, type LaneBuild } from '../../src/island/p1/treelayout';

/** いまの配置で、線がほかのパネルの下を通る数（レーン g の線だけ。g が無ければ全部） */
export function hitsOf(g?: string): number {
  let n = 0;
  for (const e of EDGES) {
    if (g && e.g !== g) continue;
    const pts = edgePoly(e.pts, 24);
    for (const [id, p] of POS) if (id !== e.from && id !== e.to && polyHits(pts, id, p)) n++;
  }
  return n;
}
const tableOf = (L: LaneBuild) => Object.fromEntries(L.rows.map((r) => [rowKey(L.g.key, r), [...r.items]]));

/**
 * 並びを探す：レーンごとに tries 回（はじめの並びを混ぜて）並べ直し、交わりの少ない順に keep 個を、配置して線がパネルの下を通る数で比べる。
 * 返すのは、段の並びの表（rowKey → 並び）と、全体の交わり・パネルの下を通る数
 */
export function optimize(opts: { seed?: number; tries?: number; keep?: number } = {}) {
  const rnd = mulberry(opts.seed ?? 1);
  const tries = opts.tries ?? 300;
  const keep = opts.keep ?? 6;
  layoutTree({});
  const table: Record<string, string[]> = {};
  for (const L0 of [...LANES]) {
    const cands: { cross: number; t: Record<string, string[]> }[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < tries; i++) {
      const L = buildLane(L0.g);
      const cross = orderLane(L, i ? rnd : undefined);
      const t = tableOf(L);
      const key = JSON.stringify(t);
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({ cross, t });
    }
    cands.sort((a, b) => a.cross - b.cross);
    let best: { cross: number; hit: number; t: Record<string, string[]> } | null = null;
    for (const c of cands.slice(0, keep)) {
      layoutTree({ ...table, ...c.t });
      const hit = hitsOf(L0.g.key);
      if (!best || c.cross * 10 + hit < best.cross * 10 + best.hit) best = { cross: c.cross, hit, t: c.t };
    }
    Object.assign(table, best!.t);
  }
  layoutTree(table);
  const cross = LANES.reduce((a, L) => a + laneCross(L), 0);
  return { table, cross, curve: crossings().length, hits: hitsOf() };
}
