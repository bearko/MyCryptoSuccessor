/**
 * スキルツリーの並びの最適化（DOM なし）：つながりの線（まっすぐな線）が、ほかの線と交わらない・ほかのパネルや部門の札の下を通らないように、
 * 同じ組（treelayout.ts の POOLS）の中でパネルの並びを入れ替える（焼きなまし）。結果は src/island/p1/treeorder.ts（tests/island-p1-treeorder.test.ts が書く）。
 * 乱数は固定の種なので、同じ入力なら同じ並びになる。
 */
import { EDGES, HUBPOS, EDGE_CLEAR, POOLS, POS, edgeEnd, halfOf, hubClear, linfSeg, shapeById, type Pool, type TreeEdge } from '../../src/island/p1/treelayout';
import { DEPTS, SKILL } from '../../src/island/p1/data';

type P = { x: number; y: number };
export interface Weights {
  /** 線どうしの交わり */
  x: number;
  /** 線がパネルの下を通る */
  hit: number;
  /** 線が部門の札の下を通る */
  hub: number;
  /** 子が親より内側（線が内向き） */
  inward: number;
  /** 線の長さ（きれいに寄せる） */
  len: number;
}
export const W: Weights = { x: 1, hit: 0.4, hub: 0.5, inward: 0.5, len: 0.004 };
/** 線とパネルの近さの判定：四角（研究）は L∞・菱形（お金）は L1。余白つきの半径 */
const rOf = (id: string) => halfOf(id) + EDGE_CLEAR + 0.02;
const near = (id: string, p: P, a: P, b: P) => (shapeById(id) === 'square' ? linfSeg(p, a, b) : l1Seg(p, a, b)) < rOf(id);
const R_HIT = 0.4;

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const orient = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const segX = (a: P, b: P, c: P, d: P) => {
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12;
};
/** 点 p と線分 q0–q1 の L1 の距離 */
function l1Seg(p: P, q0: P, q1: P) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  let best = Math.min(Math.abs(q0.x - p.x) + Math.abs(q0.y - p.y), Math.abs(q1.x - p.x) + Math.abs(q1.y - p.y));
  for (const t of [dx ? (p.x - q0.x) / dx : -1, dy ? (p.y - q0.y) / dy : -1]) if (t > 0 && t < 1) best = Math.min(best, Math.abs(q0.x + dx * t - p.x) + Math.abs(q0.y + dy * t - p.y));
  return best;
}
/** 線分 a–b が、中心 c・大きさ box の長方形を通るか */
function segBox(a: P, b: P, c: P, box: { w: number; h: number }) {
  const x0 = c.x - box.w / 2;
  const x1 = c.x + box.w / 2;
  const y0 = c.y - box.h / 2;
  const y1 = c.y + box.h / 2;
  let lo = 0;
  let hi = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [q, d] of [
    [-dx, a.x - x0],
    [dx, x1 - a.x],
    [-dy, a.y - y0],
    [dy, y1 - a.y],
  ] as [number, number][]) {
    if (q === 0) {
      if (d < 0) return false;
      continue;
    }
    const t = d / q;
    if (q < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  return lo <= hi;
}

/** 根もと（札）から直に伸びる外周（C 以外）のパネル */
const E_ROOT_OUTER = () => EDGES.filter((e) => e.from == null && (SKILL[e.to].tier ?? 'C') !== 'C').map((e) => e.to);
export interface Result {
  order: Record<string, string[]>;
  cost: number;
  crossings: number;
  hits: number;
  hubHits: number;
}

/** 最適化する。pools の並びを入れ替えた結果と、その数 */
export function optimize(opt: { seed?: number; iters?: number; t0?: number; t1?: number; start?: Record<string, string[]>; w?: Weights; debug?: (xs: string[]) => void } = {}): Result {
  const w = opt.w ?? W;
  const rnd = mulberry(opt.seed ?? 1);
  const pools: Pool[] = POOLS;
  const order: Record<string, string[]> = {};
  // 始めの並び：パネルが足された・減った組は、前の並びに残っているものをその順に、足したものを後ろに（段 K）
  for (const p of pools) {
    const st = (opt.start?.[p.key] ?? []).filter((id) => p.ids.includes(id));
    order[p.key] = [...st, ...p.ids.filter((id) => !st.includes(id))];
  }
  // 位置（id → 場所）：組の外のパネル（大きめの研究パネルなど）はいまの位置のまま
  // 根もと（札）から直に伸びる外周のパネルは動かさない（根もとから外周まで、内側の段のパネルのあいだを通る道が空いている場所に置いてある）
  const pinned = new Set(E_ROOT_OUTER());
  for (const p of pools) {
    const o = order[p.key];
    p.ids.forEach((id, i) => {
      if (!pinned.has(id) || o[i] === id) return;
      const j = o.indexOf(id);
      [o[i], o[j]] = [o[j], o[i]];
    });
  }
  const pos = new Map<string, P>(POS);
  const slotOf = new Map<string, { pool: number; i: number }>();
  pools.forEach((p, pi) => order[p.key].forEach((id, i) => (pos.set(id, p.slots[i]), slotOf.set(id, { pool: pi, i }))));
  const E = EDGES;
  const grpRoot = (e: TreeEdge) => edgeEnd(null, e.g);
  const endA = (e: TreeEdge): P => (e.from ? pos.get(e.from)! : grpRoot(e));
  const endB = (e: TreeEdge): P => pos.get(e.to)!;
  /** 共有する端（同じ根もとの線・同じパネルでつながる線）か */
  const share = (a: TreeEdge, b: TreeEdge) => (a.from == null ? b.from == null && a.g === b.g : a.from === b.from) || a.to === b.to || a.from === b.to || a.to === b.from;
  const edgesOf = new Map<string, number[]>();
  E.forEach((e, k) => {
    for (const id of [e.from, e.to]) if (id) (edgesOf.get(id) ?? edgesOf.set(id, []).get(id)!).push(k);
  });
  const ids = [...pos.keys()];
  const hubs = [...HUBPOS].map(([d, p]) => ({ d, ...p, ...hubClear(d) }));
  const ownHub = (e: TreeEdge) => (e.from == null ? DEPTS.find((d) => d.id === (e.g.split(':')[0] as never))?.id ?? null : null);
  const isDust = new Set(ids.filter((id) => !slotOf.has(id)));
  void isDust;

  const edgeNodeHits = (k: number) => {
    const e = E[k];
    const a = endA(e);
    const b = endB(e);
    const minx = Math.min(a.x, b.x) - R_HIT;
    const maxx = Math.max(a.x, b.x) + R_HIT;
    const miny = Math.min(a.y, b.y) - R_HIT;
    const maxy = Math.max(a.y, b.y) + R_HIT;
    let n = 0;
    for (const id of ids) {
      if (id === e.from || id === e.to) continue;
      const p = pos.get(id)!;
      if (p.x < minx || p.x > maxx || p.y < miny || p.y > maxy) continue;
      if (near(id, p, a, b)) n++;
    }
    return n;
  };
  const edgeHubHits = (k: number) => {
    const e = E[k];
    const a = endA(e);
    const b = endB(e);
    const own = ownHub(e);
    let n = 0;
    for (const h of hubs) if (h.d !== own && segBox(a, b, h, h)) n++;
    return n;
  };
  const nodeEdgeHits = (id: string, skip: Set<number>) => {
    const p = pos.get(id)!;
    let n = 0;
    for (let k = 0; k < E.length; k++) {
      if (skip.has(k)) continue;
      const e = E[k];
      if (e.from === id || e.to === id) continue;
      const a = endA(e);
      const b = endB(e);
      if (p.x < Math.min(a.x, b.x) - R_HIT || p.x > Math.max(a.x, b.x) + R_HIT || p.y < Math.min(a.y, b.y) - R_HIT || p.y > Math.max(a.y, b.y) + R_HIT) continue;
      if (near(id, p, a, b)) n++;
    }
    return n;
  };
  const edgeCross = (k: number, skipBelow = -1, only?: Set<number>) => {
    const a = endA(E[k]);
    const b = endB(E[k]);
    let n = 0;
    for (let j = 0; j < E.length; j++) {
      if (j === k || (only && only.has(j) && j < k)) continue;
      if (j <= skipBelow) continue;
      if (share(E[k], E[j])) continue;
      const c = endA(E[j]);
      const d = endB(E[j]);
      if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x) || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
      if (segX(a, b, c, d)) n++;
    }
    return n;
  };
  const edgeOwn = (k: number) => {
    const e = E[k];
    const a = endA(e);
    const b = endB(e);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const inward = Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) - 0.05 ? 1 : 0;
    return w.len * len + w.inward * inward + w.hub * edgeHubHits(k) + w.hit * edgeNodeHits(k);
  };
  /** 動かす 2 つのパネルにつながる線が関わる分の費用 */
  const touch = (a: string, b: string) => {
    const A = new Set<number>([...(edgesOf.get(a) ?? []), ...(edgesOf.get(b) ?? [])]);
    let c = 0;
    for (const k of A) c += w.x * edgeCross(k, -1, A) + edgeOwn(k);
    for (const id of [a, b]) c += w.hit * nodeEdgeHits(id, A);
    return c;
  };
  const total = () => {
    let x = 0;
    let hit = 0;
    let hub = 0;
    for (let k = 0; k < E.length; k++) {
      x += edgeCross(k, k);
      hit += edgeNodeHits(k);
      hub += edgeHubHits(k);
    }
    return { x, hit, hub };
  };
  const swap = (pi: number, i: number, j: number) => {
    const p = pools[pi];
    const o = order[p.key];
    const ia = o[i];
    const ib = o[j];
    o[i] = ib;
    o[j] = ia;
    pos.set(ib, p.slots[i]);
    pos.set(ia, p.slots[j]);
    slotOf.set(ib, { pool: pi, i });
    slotOf.set(ia, { pool: pi, i: j });
  };
  const movable = pools.map((p, pi) => ({ pi, n: p.ids.length })).filter((x) => x.n >= 2);
  const wt = movable.reduce((a, x) => a + x.n, 0);
  const iters = opt.iters ?? 150000;
  const t0 = opt.t0 ?? 1.2;
  const t1 = opt.t1 ?? 0.02;
  let cur = total();
  void cur;
  let bestOrder: Record<string, string[]> = JSON.parse(JSON.stringify(order));
  let bestScore = Infinity;
  const score = () => {
    const t = total();
    return t.x * w.x + t.hit * w.hit + t.hub * w.hub;
  };
  bestScore = score();
  let curScore = bestScore;
  for (let it = 0; it < iters; it++) {
    const T = t0 * Math.pow(t1 / t0, it / iters);
    let r = rnd() * wt;
    let m = movable[0];
    for (const x of movable) {
      r -= x.n;
      if (r <= 0) {
        m = x;
        break;
      }
    }
    const i = Math.floor(rnd() * m.n);
    let j = Math.floor(rnd() * (m.n - 1));
    if (j >= i) j++;
    const o = order[pools[m.pi].key];
    if (pinned.has(o[i]) || pinned.has(o[j])) continue;
    const before = touch(o[i], o[j]);
    swap(m.pi, i, j);
    const after = touch(o[i], o[j]);
    const d = after - before;
    if (d <= 0 || rnd() < Math.exp(-d / T)) {
      curScore += d;
      if (it % 2000 === 0 || curScore < bestScore - 1e-9) {
        // 近似の費用が下がったときだけ、本当の数で確かめて残す
        if (curScore < bestScore - 1e-9) {
          const sc = score();
          if (sc < bestScore) {
            bestScore = sc;
            bestOrder = JSON.parse(JSON.stringify(order));
          }
          curScore = curScore;
        }
      }
    } else swap(m.pi, i, j);
  }
  // 最良の並びに戻して数える
  for (const [pi, p] of pools.entries()) bestOrder[p.key].forEach((id, i) => (pos.set(id, p.slots[i]), slotOf.set(id, { pool: pi, i })));
  Object.assign(order, bestOrder);
  const t = total();
  if (opt.debug) {
    const out: string[] = [];
    for (let k = 0; k < E.length; k++) {
      const x = edgeCross(k, k);
      const h = edgeNodeHits(k);
      if (x || h) out.push(`${E[k].from ?? '(' + E[k].g + ')'}>${E[k].to} [${SKILL[E[k].to].tier ?? 'C'}] x${x} hit${h}`);
    }
    opt.debug(out);
  }
  return { order: bestOrder, cost: t.x * w.x + t.hit * w.hit + t.hub * w.hub, crossings: t.x, hits: t.hit, hubHits: t.hub };
}
void SKILL;
