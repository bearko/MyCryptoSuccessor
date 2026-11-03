/**
 * スキルツリーのつながりの見直し（段 UI5b。DOM なし）：線どうしの交わりを 0 にするため、
 * 1. 枝（束）をまたぐ「先に要る」を、同じ束の中のパネルにまとめ直す（効き目・値段は変えない。つながりだけ）
 * 2. 同じ組（treelayout.ts の POOLS）の中でパネルの並びを入れ替える
 * を焼きなましで同時に選ぶ。もとのつながりからの変更は少ないほど良い（変えるたびに費用）。
 * 結果は src/island/p1/treelinks.ts（つながり）と src/island/p1/treeorder.ts（並び）。tests/island-p1-treeorder.test.ts（ISLAND_TREE_LINKS=1）が書く。
 * 乱数は固定の種なので、同じ入力なら同じ結果になる。
 */
import { BEND_MAX, EDGE_CLEAR, GROUPS, HUBPOS, PANEL, POOLS, POS, curvePoly, edgeBend, halfOf, hubClear, linfSeg, polyInBox, polyNear, rootOf, shapeById, type Bend, type HubBox, type Pool } from '../../src/island/p1/treelayout';
import { REQUIRES_ORIG, SKILL, type Tier } from '../../src/island/p1/data';

type P = { x: number; y: number };
const TIERS: Tier[] = ['C', 'U', 'R', 'E', 'L'];
const tierIx = (id: string) => TIERS.indexOf(SKILL[id].tier ?? 'C');

export interface LinkWeights {
  x: number;
  hit: number;
  hub: number;
  inward: number;
  len: number;
}
export const LW: LinkWeights = { x: 1, hit: 0.6, hub: 0.6, inward: 0.6, len: 0.004 };

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
function l1Seg(p: P, q0: P, q1: P) {
  const dx = q1.x - q0.x;
  const dy = q1.y - q0.y;
  let best = Math.min(Math.abs(q0.x - p.x) + Math.abs(q0.y - p.y), Math.abs(q1.x - p.x) + Math.abs(q1.y - p.y));
  for (const t of [dx ? (p.x - q0.x) / dx : -1, dy ? (p.y - q0.y) / dy : -1]) if (t > 0 && t < 1) best = Math.min(best, Math.abs(q0.x + dx * t - p.x) + Math.abs(q0.y + dy * t - p.y));
  return best;
}
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
const rOf = (id: string) => halfOf(id) + EDGE_CLEAR + 0.02;
const near = (id: string, p: P, a: P, b: P) => (shapeById(id) === 'square' ? linfSeg(p, a, b) : l1Seg(p, a, b)) < rOf(id);

/** つながりの候補（1 つのパネルの「先に要る」の選び方）と、その費用（もとのままは 0） */
interface Choice {
  req: string[];
  cost: number;
}
export interface LinkResult {
  order: Record<string, string[]>;
  links: Record<string, string[]>;
  crossings: number;
  hits: number;
  hubHits: number;
  changed: number;
  cost: number;
}

/** パネルの束（POOLS の key の頭。物流は logistics:shop など） */
const groupKeyOf = new Map<string, string>();
for (const g of GROUPS) for (const k of g.skills) groupKeyOf.set(k.id, g.key);

/**
 * 候補：
 * - もとの「先に要る」がどれも同じ束なら、それ（費用 0）。2 つ要るものは、片方だけ（費用 0.5）も
 * - 同じ束の、同じか内側のランクのパネル（大きめの研究パネル・寄付・封印は除く）。もとの先に要るもののランクに近いほど安い
 * - 根もと（もとに先に要るものが無いときは費用 0。あったときは「ゆるめる」ので 0.7）
 * レベルが要るもの（reqLv）・技（anyOf）は変えない
 */
function choicesOf(id: string): Choice[] {
  const k = SKILL[id];
  const orig = REQUIRES_ORIG[id] ?? [];
  const g = groupKeyOf.get(id);
  const same = orig.filter((r) => groupKeyOf.get(r) === g);
  // 変えないもの：レベルが要るもの（reqLv）・技を n 個（anyOf）・技（修行するパネル）・チュートリアルで開く「人材の募集」
  if (k.reqLv || k.anyOf || k.train || id === 'hire') return [{ req: orig, cost: 0 }];
  // 発掘の枝は発掘の流れ（追加申請 → ランタン → 深い層の許可 → 研究の目利き）と結びついているので変えない。
  // ただし根もとから伸びる「ツルハシの鍛え直し」の線は「発掘の追加申請」の線の束を横切るので、追加申請の先にしてよい（1 枚だけ）
  if (k.branch === 'dig') return id === 'dig_power' ? [{ req: orig, cost: 0 }, { req: ['dig_ext'], cost: 1 }] : [{ req: orig, cost: 0 }];
  const out: Choice[] = [];
  const seen = new Set<string>();
  const add = (req: string[], cost: number) => {
    const key = [...req].sort().join('+');
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ req, cost });
  };
  if (same.length === orig.length) add(orig, 0);
  if (orig.length > 1) for (const r of same) add([r], 0.5);
  if (!orig.length) add([], 0);
  const ti = tierIx(id);
  const origT = orig.length ? Math.max(...orig.map(tierIx)) : -1;
  for (const q of GROUPS.find((x) => x.key === g)?.skills ?? []) {
    if (q.id === id || q.big || q.donate || q.sealed || q.soon || q.inf) continue;
    const tq = tierIx(q.id);
    if (tq > ti) continue;
    // ランクのずれ：もとの先に要るもののランクから（無ければ自分のランク − 1）
    const ref = origT >= 0 ? origT : Math.max(0, ti - 1);
    // もとが根もと（先に要るものが無い）のパネルに先に要るものを足す（きびしくする）のは重く。Common の根もとはさらに重く（始めの手が減る）
    // 根もとのパネルに先に要るものを足す（きびしくする）のはしない
    if (!orig.length) continue;
    const tighten = 0;
    // 同じ束の中の先に要るものを別のパネルに替える（枝をまたぐものを替えるより重く）
    const swapIn = same.length && !same.includes(q.id) ? 0.3 : 0;
    add([q.id], 0.3 + 0.2 * Math.abs(tq - ref) + swapIn + tighten);
  }
  if (orig.length) add([], 0.7 + 0.1 * orig.length);
  return out;
}

export function optimizeLinks(opt: { seed?: number; iters?: number; t0?: number; t1?: number; start?: { order?: Record<string, string[]>; links?: Record<string, string[]> }; w?: LinkWeights; change?: number } = {}): LinkResult {
  const w = opt.w ?? LW;
  const cw = opt.change ?? 1;
  const rnd = mulberry(opt.seed ?? 1);
  const pools: Pool[] = POOLS;
  const order: Record<string, string[]> = {};
  for (const p of pools) {
    const s = opt.start?.order?.[p.key];
    order[p.key] = s && s.length === p.ids.length && p.ids.every((x) => s.includes(x)) ? [...s] : [...p.ids];
  }
  const pos = new Map<string, P>(POS);
  pools.forEach((p) => order[p.key].forEach((id, i) => pos.set(id, p.slots[i])));
  // 線は束ごと：パネルの id → 候補・いまの選択
  const ids = [...groupKeyOf.keys()];
  const choices = new Map<string, Choice[]>();
  const cur = new Map<string, number>();
  for (const id of ids) {
    const cs = choicesOf(id);
    choices.set(id, cs);
    const st = opt.start?.links?.[id];
    const at = st ? cs.findIndex((c) => [...c.req].sort().join('+') === [...st].sort().join('+')) : -1;
    cur.set(id, at >= 0 ? at : 0);
  }
  /** 線（子の id ＋ 何本目）。根もとからの線は from = null */
  type E = { from: string | null; to: string; g: string };
  const edgesOf = (id: string): E[] => {
    const c = choices.get(id)![cur.get(id)!];
    const g = groupKeyOf.get(id)!;
    return c.req.length ? c.req.map((r) => ({ from: r, to: id, g })) : [{ from: null, to: id, g }];
  };
  const endA = (e: E): P => (e.from ? pos.get(e.from)! : rootOf(e.g));
  const endB = (e: E): P => pos.get(e.to)!;
  const share = (a: E, b: E) => (a.from == null ? b.from == null && a.g === b.g : a.from === b.from) || a.to === b.to || a.from === b.to || a.to === b.from;
  const hubs = [...HUBPOS].map(([d, p]) => ({ d, ...p, ...hubClear(d) }));
  const ownHub = (e: E) => (e.from == null ? e.g.split(':')[0] : null);
  /** いまの線の一覧（毎回作り直すと遅いので、子ごとに持つ） */
  const byChild = new Map<string, E[]>();
  for (const id of ids) byChild.set(id, edgesOf(id));
  /** 親 → 子（親が動くと線が動く） */
  const kids = () => {
    const m = new Map<string, Set<string>>();
    for (const [c, es] of byChild) for (const e of es) if (e.from) (m.get(e.from) ?? m.set(e.from, new Set()).get(e.from)!).add(c);
    return m;
  };
  let kidMap = kids();
  const allEdges = () => [...byChild.values()].flat();
  /** 線 e の費用（ほかの線との交わり＋パネルの下・札の下・内向き・長さ）。skip：数えない線（重複を避ける） */
  const edgeCost = (e: E, others: E[], skip: Set<E>) => {
    const a = endA(e);
    const b = endB(e);
    let x = 0;
    const minx = Math.min(a.x, b.x);
    const maxx = Math.max(a.x, b.x);
    const miny = Math.min(a.y, b.y);
    const maxy = Math.max(a.y, b.y);
    for (const f of others) {
      if (f === e || skip.has(f) || share(e, f)) continue;
      const c = endA(f);
      const d = endB(f);
      if (maxx < Math.min(c.x, d.x) || Math.max(c.x, d.x) < minx || maxy < Math.min(c.y, d.y) || Math.max(c.y, d.y) < miny) continue;
      if (segX(a, b, c, d)) x++;
    }
    let hit = 0;
    for (const [id, p] of pos) {
      if (id === e.from || id === e.to) continue;
      if (p.x < minx - 0.5 || p.x > maxx + 0.5 || p.y < miny - 0.5 || p.y > maxy + 0.5) continue;
      if (near(id, p, a, b)) hit++;
    }
    let hub = 0;
    const own = ownHub(e);
    for (const h of hubs) if (h.d !== own && segBox(a, b, h, h)) hub++;
    const inward = Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) - 0.05 ? 1 : 0;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    return { x, hit, hub, v: w.x * x + w.hit * hit + w.hub * hub + w.inward * inward + w.len * len };
  };
  /** 線がパネルの下を通る（動いたパネルの側から） */
  const nodeHits = (id: string, edges: E[], skip: Set<E>) => {
    const p = pos.get(id)!;
    let n = 0;
    for (const e of edges) {
      if (skip.has(e) || e.from === id || e.to === id) continue;
      const a = endA(e);
      const b = endB(e);
      if (p.x < Math.min(a.x, b.x) - 0.5 || p.x > Math.max(a.x, b.x) + 0.5 || p.y < Math.min(a.y, b.y) - 0.5 || p.y > Math.max(a.y, b.y) + 0.5) continue;
      if (near(id, p, a, b)) n++;
    }
    return n;
  };
  /** 動いたパネル（moved）と、選び直した子（kidsChanged）に関わる費用 */
  const local = (moved: string[], touched: string[]) => {
    const set = new Set<E>();
    for (const id of touched) for (const e of byChild.get(id) ?? []) set.add(e);
    for (const id of moved) {
      for (const e of byChild.get(id) ?? []) set.add(e);
      for (const c of kidMap.get(id) ?? []) for (const e of byChild.get(c) ?? []) set.add(e);
    }
    const all = allEdges();
    let v = 0;
    const done = new Set<E>();
    for (const e of set) {
      v += edgeCost(e, all, done).v;
      done.add(e);
    }
    for (const id of moved) v += w.hit * nodeHits(id, all, set);
    for (const id of touched) v += cw * choices.get(id)![cur.get(id)!].cost;
    return v;
  };
  const total = () => {
    const all = allEdges();
    let x = 0;
    let hit = 0;
    let hub = 0;
    let v = 0;
    const done = new Set<E>();
    for (const e of all) {
      const c = edgeCost(e, all, done);
      done.add(e);
      x += c.x;
      hit += c.hit;
      hub += c.hub;
      v += c.v;
    }
    let changed = 0;
    for (const id of ids) {
      const c = choices.get(id)![cur.get(id)!];
      v += cw * c.cost;
      if (c.cost > 0) changed++;
    }
    return { x, hit, hub, v, changed };
  };
  /** 親をたどって自分に戻らないか（輪にしない） */
  const ancestorOf = (a: string, b: string): boolean => {
    // a が b の先祖か
    const stack = [b];
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (x === a) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      const c = choices.get(x);
      if (c) for (const r of c[cur.get(x)!].req) stack.push(r);
    }
    return false;
  };
  const poolOf = new Map<string, number>();
  pools.forEach((p, pi) => p.ids.forEach((id) => poolOf.set(id, pi)));
  const swap = (pi: number, i: number, j: number) => {
    const p = pools[pi];
    const o = order[p.key];
    [o[i], o[j]] = [o[j], o[i]];
    pos.set(o[i], p.slots[i]);
    pos.set(o[j], p.slots[j]);
  };
  const movable = pools.map((p, pi) => ({ pi, n: p.ids.length })).filter((x) => x.n >= 2);
  const wt = movable.reduce((a, x) => a + x.n, 0);
  const multi = ids.filter((id) => choices.get(id)!.length > 1);
  const iters = opt.iters ?? 200000;
  const t0 = opt.t0 ?? 1.2;
  const t1 = opt.t1 ?? 0.02;
  let best = total();
  let bestState = { order: JSON.parse(JSON.stringify(order)) as Record<string, string[]>, cur: new Map(cur) };
  let curV = best.v;
  for (let it = 0; it < iters; it++) {
    const T = t0 * Math.pow(t1 / t0, it / iters);
    if (rnd() < 0.5 || !multi.length) {
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
      const a = o[i];
      const b = o[j];
      const before = local([a, b], []);
      swap(m.pi, i, j);
      const after = local([a, b], []);
      const d = after - before;
      if (d <= 0 || rnd() < Math.exp(-d / T)) curV += d;
      else swap(m.pi, i, j);
    } else {
      const id = multi[Math.floor(rnd() * multi.length)];
      const cs = choices.get(id)!;
      const was = cur.get(id)!;
      let nx = Math.floor(rnd() * (cs.length - 1));
      if (nx >= was) nx++;
      if (cs[nx].req.some((r) => ancestorOf(id, r))) continue;
      const before = local([], [id]);
      cur.set(id, nx);
      byChild.set(id, edgesOf(id));
      kidMap = kids();
      const after = local([], [id]);
      const d = after - before;
      if (d <= 0 || rnd() < Math.exp(-d / T)) curV += d;
      else {
        cur.set(id, was);
        byChild.set(id, edgesOf(id));
        kidMap = kids();
      }
    }
    if (curV < best.v - 1e-9 && (it % 50 === 0 || T < 0.1)) {
      const tt = total();
      curV = tt.v;
      if (tt.v < best.v - 1e-9) {
        best = tt;
        bestState = { order: JSON.parse(JSON.stringify(order)), cur: new Map(cur) };
      }
    }
  }
  // 最良に戻す
  for (const [k, v] of Object.entries(bestState.order)) order[k] = v;
  pools.forEach((p) => order[p.key].forEach((id, i) => pos.set(id, p.slots[i])));
  for (const [k, v] of bestState.cur) cur.set(k, v);
  for (const id of ids) byChild.set(id, edgesOf(id));
  kidMap = kids();
  const fin = total();
  const links: Record<string, string[]> = {};
  for (const id of ids) {
    const c = choices.get(id)![cur.get(id)!];
    const orig = REQUIRES_ORIG[id] ?? [];
    if ([...c.req].sort().join('+') !== [...orig].sort().join('+')) links[id] = c.req;
  }
  return { order, links, crossings: fin.x, hits: fin.hit, hubHits: fin.hub, changed: fin.changed, cost: fin.v };
}

// ---------------------------------------------------------------- 曲げた線で数える仕上げ（テストと同じ数え方）

/**
 * 仕上げ：描く線（パネルを避けて曲げた弧。treelayout の edgeBend）で、線どうしの交わり・線がパネルや札の下を通る数を数えながら、
 * 並びとつながりを少しずつ直す（低い温度の焼きなまし）。tests/island-p1-treeorder.test.ts の crossings と同じ数え方
 */
export function polishLinks(opt: { seed?: number; iters?: number; t0?: number; t1?: number; start: { order: Record<string, string[]>; links: Record<string, string[]> }; cw?: number; w?: { x: number; hit: number; hub: number; inward?: number } }): LinkResult & { curve: { x: number; hit: number; hub: number } } {
  const w = opt.w ?? { x: 10, hit: 10, hub: 10, inward: 3 };
  const cw = opt.cw ?? 1;
  const rnd = mulberry(opt.seed ?? 7);
  const pools: Pool[] = POOLS;
  const order: Record<string, string[]> = {};
  for (const p of pools) {
    const s = opt.start.order[p.key];
    order[p.key] = s && s.length === p.ids.length && p.ids.every((x) => s.includes(x)) ? [...s] : [...p.ids];
  }
  const pos = new Map<string, P>(POS);
  pools.forEach((p) => order[p.key].forEach((id, i) => pos.set(id, p.slots[i])));
  const ids = [...groupKeyOf.keys()];
  const choices = new Map<string, Choice[]>();
  const cur = new Map<string, number>();
  for (const id of ids) {
    const cs = choicesOf(id);
    choices.set(id, cs);
    const st = opt.start.links[id] ?? REQUIRES_ORIG[id] ?? [];
    const at = cs.findIndex((c) => [...c.req].sort().join('+') === [...st].sort().join('+'));
    cur.set(id, at >= 0 ? at : 0);
  }
  type E = { from: string | null; to: string; g: string };
  type G = { bend: Bend; pts: P[]; x0: number; x1: number; y0: number; y1: number };
  const edgesOf = (id: string): E[] => {
    const c = choices.get(id)![cur.get(id)!];
    const g = groupKeyOf.get(id)!;
    return c.req.length ? c.req.map((r) => ({ from: r, to: id, g })) : [{ from: null, to: id, g }];
  };
  const byChild = new Map<string, E[]>();
  for (const id of ids) byChild.set(id, edgesOf(id));
  let all: E[] = [...byChild.values()].flat();
  const endA = (e: E): P => (e.from ? pos.get(e.from)! : rootOf(e.g));
  const endB = (e: E): P => pos.get(e.to)!;
  const share = (a: E, b: E) => (a.from == null ? b.from == null && a.g === b.g : a.from === b.from) || a.to === b.to || a.from === b.to || a.to === b.from;
  const hubBoxes = [...HUBPOS].map(([d, p]) => ({ d, ...p, ...hubClear(d) }));
  const hubsFor = (e: E): HubBox[] => {
    const own = e.from == null ? (GROUPS.find((g) => g.key === e.g)?.dept ?? null) : null;
    return hubBoxes.filter((h) => h.d !== own);
  };
  const geo = new Map<E, G>();
  const calc = (e: E): G => {
    const a = endA(e);
    const b = endB(e);
    const bend = edgeBend(a, b, (id) => id === e.from || id === e.to, hubsFor(e), pos);
    const pts = curvePoly(a, b, bend);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const q of pts) {
      x0 = Math.min(x0, q.x);
      x1 = Math.max(x1, q.x);
      y0 = Math.min(y0, q.y);
      y1 = Math.max(y1, q.y);
    }
    return { bend, pts, x0, x1, y0, y1 };
  };
  for (const e of all) geo.set(e, calc(e));
  const RAD = (id: string) => halfOf(id) + EDGE_CLEAR + 0.005;
  const own = (e: E) => {
    const g = geo.get(e)!;
    let hit = 0;
    for (const [id, p] of pos) {
      if (id === e.from || id === e.to) continue;
      const r = RAD(id);
      if (p.x < g.x0 - r || p.x > g.x1 + r || p.y < g.y0 - r || p.y > g.y1 + r) continue;
      if (polyNear(g.pts, p, r, shapeById(id) === 'square')) hit++;
    }
    let hub = 0;
    for (const hb of hubsFor(e)) if (hb.x + hb.w / 2 >= g.x0 && hb.x - hb.w / 2 <= g.x1 && hb.y + hb.h / 2 >= g.y0 && hb.y - hb.h / 2 <= g.y1 && polyInBox(g.pts, hb, hb)) hub++;
    // 子が親より内側（線が内向き）：つながりを見直した線だけ数える（もとからある線はそのまま）
    const a = endA(e);
    const b = endB(e);
    const inward = e.from && choices.get(e.to)![cur.get(e.to)!].cost > 0 && Math.hypot(b.x, b.y) < Math.hypot(a.x, a.y) - 0.05 ? 1 : 0;
    return { hit, hub, inward };
  };
  /** テストと同じ判定（端の積が 0 より小さいとき。ほぼ触れているだけの線も数える） */
  const segX0 = (a: P, b: P, c: P, d: P) => orient(c, d, a) * orient(c, d, b) < 0 && orient(a, b, c) * orient(a, b, d) < 0;
  const crosses = (e: E, f: E) => {
    if (share(e, f)) return false;
    const A = geo.get(e)!;
    const B = geo.get(f)!;
    if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) return false;
    for (let i = 1; i < A.pts.length; i++) {
      const a0 = A.pts[i - 1];
      const a1 = A.pts[i];
      const mx0 = Math.min(a0.x, a1.x);
      const mx1 = Math.max(a0.x, a1.x);
      const my0 = Math.min(a0.y, a1.y);
      const my1 = Math.max(a0.y, a1.y);
      if (mx1 < B.x0 || B.x1 < mx0 || my1 < B.y0 || B.y1 < my0) continue;
      for (let j = 1; j < B.pts.length; j++) {
        const b0 = B.pts[j - 1];
        const b1 = B.pts[j];
        if (Math.max(b0.x, b1.x) < mx0 || mx1 < Math.min(b0.x, b1.x) || Math.max(b0.y, b1.y) < my0 || my1 < Math.min(b0.y, b1.y)) continue;
        if (segX0(a0, a1, b0, b1)) return true;
      }
    }
    return false;
  };
  /** 線の組 D の費用（D の中の組は 1 回だけ） */
  const setCost = (D: E[]) => {
    const inD = new Set(D);
    let v = 0;
    D.forEach((e, k) => {
      const o = own(e);
      v += w.hit * o.hit + w.hub * o.hub + (w.inward ?? 0) * o.inward;
      for (const f of all) {
        if (f === e) continue;
        if (inD.has(f) && D.indexOf(f) < k) continue;
        if (crosses(e, f)) v += w.x;
      }
    });
    return v;
  };
  const changeCost = () => {
    let v = 0;
    for (const id of ids) v += cw * choices.get(id)![cur.get(id)!].cost;
    return v;
  };
  const totals = () => {
    let x = 0;
    let hit = 0;
    let hub = 0;
    for (let k = 0; k < all.length; k++) {
      const o = own(all[k]);
      hit += o.hit;
      hub += o.hub;
      for (let j = k + 1; j < all.length; j++) if (crosses(all[k], all[j])) x++;
    }
    return { x, hit, hub };
  };
  const PAD = BEND_MAX + PANEL + 0.1;
  /** 動いたパネル（前の位置 olds・新しい位置 news）で曲げ方が変わりうる線 */
  const dirtyFor = (moved: string[], olds: P[], news: P[]) => {
    const D = new Set<E>();
    for (const e of all) {
      if (moved.includes(e.to) || (e.from && moved.includes(e.from))) {
        D.add(e);
        continue;
      }
      const g = geo.get(e)!;
      if (news.some((p) => p.x > g.x0 - 0.6 && p.x < g.x1 + 0.6 && p.y > g.y0 - 0.6 && p.y < g.y1 + 0.6)) D.add(e);
      else if (g.bend !== 0 && olds.some((p) => p.x > g.x0 - PAD && p.x < g.x1 + PAD && p.y > g.y0 - PAD && p.y < g.y1 + PAD)) D.add(e);
    }
    return [...D];
  };
  const ancestorOf = (a: string, b: string): boolean => {
    const stack = [b];
    const seen = new Set<string>();
    while (stack.length) {
      const x = stack.pop()!;
      if (x === a) return true;
      if (seen.has(x)) continue;
      seen.add(x);
      const c = choices.get(x);
      if (c) for (const r of c[cur.get(x)!].req) stack.push(r);
    }
    return false;
  };
  const movable = pools.map((p, pi) => ({ pi, n: p.ids.length })).filter((x) => x.n >= 2);
  const wt = movable.reduce((a, x) => a + x.n, 0);
  const multi = ids.filter((id) => choices.get(id)!.length > 1);
  const iters = opt.iters ?? 20000;
  const t0 = opt.t0 ?? 0.5;
  const t1 = opt.t1 ?? 0.05;
  // 曲げ方の写しを全部作り直す（動かした所から遠い線の曲げ方が変わることがあるので、ときどきと最後に）
  const resync = () => {
    for (const e of all) geo.set(e, calc(e));
  };
  for (let it = 0; it < iters; it++) {
    const T = t0 * Math.pow(t1 / t0, it / iters);
    if (it % 2000 === 1999) resync();
    if (rnd() < 0.5 || !multi.length) {
      let r = rnd() * wt;
      let m = movable[0];
      for (const x of movable) {
        r -= x.n;
        if (r <= 0) {
          m = x;
          break;
        }
      }
      const p = pools[m.pi];
      const i = Math.floor(rnd() * m.n);
      let j = Math.floor(rnd() * (m.n - 1));
      if (j >= i) j++;
      const o = order[p.key];
      const a = o[i];
      const b = o[j];
      const D = dirtyFor([a, b], [p.slots[i], p.slots[j]], [p.slots[i], p.slots[j]]);
      const before = setCost(D);
      const saved = D.map((e) => geo.get(e)!);
      [o[i], o[j]] = [o[j], o[i]];
      pos.set(o[i], p.slots[i]);
      pos.set(o[j], p.slots[j]);
      for (const e of D) geo.set(e, calc(e));
      const d = setCost(D) - before;
      if (!(d <= 0 || rnd() < Math.exp(-d / T))) {
        [o[i], o[j]] = [o[j], o[i]];
        pos.set(o[i], p.slots[i]);
        pos.set(o[j], p.slots[j]);
        D.forEach((e, k) => geo.set(e, saved[k]));
      }
    } else {
      const id = multi[Math.floor(rnd() * multi.length)];
      const cs = choices.get(id)!;
      const was = cur.get(id)!;
      let nx = Math.floor(rnd() * (cs.length - 1));
      if (nx >= was) nx++;
      if (cs[nx].req.some((r) => ancestorOf(id, r))) continue;
      const oldE = byChild.get(id)!;
      const before = setCost(oldE) + cw * cs[was].cost;
      cur.set(id, nx);
      const newE = edgesOf(id);
      byChild.set(id, newE);
      all = [...byChild.values()].flat();
      for (const e of newE) geo.set(e, calc(e));
      const d = setCost(newE) + cw * cs[nx].cost - before;
      if (!(d <= 0 || rnd() < Math.exp(-d / T))) {
        cur.set(id, was);
        byChild.set(id, oldE);
        all = [...byChild.values()].flat();
        for (const e of newE) geo.delete(e);
      } else for (const e of oldE) geo.delete(e);
    }
  }
  resync();
  const fin = totals();
  const links: Record<string, string[]> = {};
  let changed = 0;
  for (const id of ids) {
    const c = choices.get(id)![cur.get(id)!];
    const orig = REQUIRES_ORIG[id] ?? [];
    if ([...c.req].sort().join('+') !== [...orig].sort().join('+')) {
      links[id] = c.req;
      changed++;
    }
  }
  return { order, links, crossings: fin.x, hits: fin.hit, hubHits: fin.hub, changed, cost: fin.x * w.x + fin.hit * w.hit + fin.hub * w.hub + changeCost(), curve: fin };
}
