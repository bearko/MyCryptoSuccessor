/**
 * 段 MAP1：街づくりの見える化（文字より色・形・動き）。地図に重ねる線と塗りの **データ** だけ（DOM・canvas なし）。
 * - 流れの線（調達 → 工房・工房／物流拠点 → 各店）：`routeLines`
 * - お店の集客エリア（自店＝赤・他店＝青）：`areaCells`
 * - 空き地の見込み客のヒートマップ（お店）・工房からの日数の塗り（倉庫・物流拠点）：`shopHeat`・`daysHeat`
 * - PC の吹き出しの置き場所（建物の左か右）：`popPlace`
 * - ランド（つながった地図）の段階ズーム：`landZoomSteps`
 * ゲームの数字・判断は何も変えない（model.ts の同じ式を読むだけ）。描くのは render.ts、切り替えは main.ts。
 */
import { MARKET, P1B, skuParts, type Sku } from './data';
import { allowedDirs, depotLink, doorOf, isVacant, legDays, myDepots, myShops, myWorkshop, oneWay, pathLen, roadPath, sources, walkDays, wholesaler, type P1State, type PBuilding } from './model';
import type { Dir } from '../sim';
import { crossRoute } from './tariff';

/** 色の意味（docs/ISLAND_UX_CHARTER.md「色の意味」）。CSS のトークンと同じ値 */
export const MAPVIZ_COLOR = {
  /** 調達（問屋 → 工房）：橙の点線 */
  supply: '#f39a3c',
  /** 輸送（工房／拠点 → 店）：青の点線 */
  haul: '#7cc6f2',
  /** 自店の商圏：赤 */
  mine: '#f0565a',
  /** 他店の商圏：青 */
  rival: '#4f8fe6',
  /** 見込み客のヒートマップ（少ない → 多い。5 段の暖色。既存のトークンから） */
  heat: ['#5a3a2a', '#9a5a2a', '#d9822b', '#f2b544', '#ffe08a'],
  /** 工房からの日数（近い → 遠い。5 段の寒色） */
  days: ['#bfe8ff', '#7cc6f2', '#4f8fe6', '#2f5fae', '#1f3a6e'],
} as const;

/** 自店の商圏の広さ（家の数の範囲。shopArea と同じ MARKET.d0）・他店は × 1.5 */
export const AREA_D0 = MARKET.d0;
export const AREA_RIVAL = MARKET.d0 * 1.5;

// ---------------------------------------------------------------- 1. 流れの線

export interface RouteLine {
  /** supply＝調達（問屋 → 工房）／trunk＝工房 → 物流拠点の定期便／haul＝工房・拠点 → お店 */
  kind: 'supply' | 'trunk' | 'haul';
  /** 道路のマスの列（入口の前 → 入口の前。つながっていなければ両端だけ） */
  cells: [number, number][];
  /** 片道の日数（haul：oneWay と同じ。supply：歩く日数。trunk：定期便） */
  days: number;
  /** haul：お店の uid */
  shop?: number;
  /** いま荷が動いている（点線が流れる） */
  moving: boolean;
  /** 段 TRADE1a：となり町からの取り寄せ（取り寄せ先のセクタ。線は境界をこえて隣の問屋まで伸びる） */
  cross?: string;
}

const dist = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const pathOf = (s: P1State, a: [number, number], b: [number, number]): [number, number][] => roadPath(s, a, b) ?? (dist(a, b) ? [a, b] : [a]);

let routeMemo: { key: string; lines: RouteLine[] } | null = null;
/** 線の形（建物・道路・スキルが変わったときだけ作り直す。moving は毎回見る） */
export function routeKey(s: P1State): string {
  return `${s.seed}:${s.sector ?? ''}:${s.buildings.length}:${s.nextUid}:${s.skills.length}:${s.day}:${(s.orders ?? []).filter((o) => o.from).map((o) => o.from).join(',')}`;
}
/** 流れの線（工房が無ければ空） */
export function routeLines(s: P1State): RouteLine[] {
  const key = routeKey(s);
  if (routeMemo?.key !== key) routeMemo = { key, lines: buildRoutes(s) };
  const walk = walkDays(s);
  for (const l of routeMemo.lines) {
    if (l.cross) l.moving = (s.orders ?? []).some((o) => o.from === l.cross);
    else if (l.kind === 'supply') l.moving = !!s.buyTrip || (s.orders ?? []).some((o) => !o.from && o.left <= walk);
    else if (l.kind === 'haul') l.moving = s.trips.some((t) => t.to === l.shop);
    else l.moving = s.trips.some((t) => t.from != null && t.from !== myWorkshop(s)?.uid);
  }
  return routeMemo.lines;
}
function buildRoutes(s: P1State): RouteLine[] {
  const ws = myWorkshop(s);
  if (!ws) return [];
  const out: RouteLine[] = [];
  const wh = wholesaler(s);
  if (wh) out.push({ kind: 'supply', cells: pathOf(s, doorOf(wh), doorOf(ws)), days: walkDays(s), moving: false });
  // 段 TRADE1a：取り寄せ中のとなり町ごとに、隣の問屋 → 境界 → 工房（か境の拠点）の橙の点線
  for (const id of new Set((s.orders ?? []).map((o) => o.from).filter((x): x is string => !!x))) {
    const r = crossRoute(s, id);
    if (r) out.push({ kind: 'supply', cells: r.cells, days: 0, moving: true, cross: id });
  }
  const depots = myDepots(s);
  const trunks = new Set<number>();
  for (const shop of myShops(s)) {
    const way = oneWay(s, shop, ws, depots);
    const from = way.from ?? ws;
    if (from.uid !== ws.uid && !trunks.has(from.uid)) {
      trunks.add(from.uid);
      out.push({ kind: 'trunk', cells: pathOf(s, doorOf(ws), doorOf(from)), days: legDays(s, pathLen(s, ws, from)) * depotLink(s), moving: false });
    }
    out.push({ kind: 'haul', cells: pathOf(s, doorOf(from), doorOf(shop)), days: way.days, shop: shop.uid, moving: false });
  }
  return out;
}

// ---------------------------------------------------------------- 2. 集客エリア

export interface AreaCells {
  /** 自店の商圏：マス（j * n + i）→ 重なっている自店の数（2 以上＝取り合い） */
  mine: Map<number, number>;
  /** 他店の商圏：マス → 重なっている他店の数 */
  rival: Map<number, number>;
}
/** 菱形（マンハッタン距離 d 以内）のマス */
export function diamondCells(s: P1State, i: number, j: number, d: number): number[] {
  const out: number[] = [];
  const r = Math.floor(d);
  for (let y = j - r; y <= j + r; y++) for (let x = i - r; x <= i + r; x++) if (x >= 0 && y >= 0 && x < s.n && y < s.n && Math.abs(x - i) + Math.abs(y - j) <= d) out.push(y * s.n + x);
  return out;
}
/**
 * 自店（owner 'me' のお店。工事中も）と他店（他社の建物。空き店舗は除く）の商圏。
 * only：その店だけ（店を押したとき）。ghost：置いている店（既存の自店と重なるところが濃くなる）。
 * 他店は shopArea と同じく「同じ商品を売る他社」に限らず全部（置く前に色で分かるように。文は出さない）
 */
export function areaCells(s: P1State, opts: { only?: number | null; ghost?: { i: number; j: number } | null; rivals?: boolean } = {}): AreaCells {
  const mine = new Map<number, number>();
  const rival = new Map<number, number>();
  const add = (m: Map<number, number>, ks: number[]) => ks.forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
  for (const b of s.buildings) {
    if (b.owner === 'me' && P1B[b.id]?.kind === 'shop' && (opts.only == null || b.uid === opts.only)) add(mine, diamondCells(s, b.i, b.j, AREA_D0));
    else if (opts.rivals !== false && s.rivals.some((r) => r.id === b.owner) && !isVacant(b)) add(rival, diamondCells(s, b.i, b.j, AREA_RIVAL));
  }
  if (opts.ghost) add(mine, diamondCells(s, opts.ghost.i, opts.ghost.j, AREA_D0));
  return { mine, rival };
}

// ---------------------------------------------------------------- 3. 空き地のヒートマップ

export interface HeatCell {
  k: number;
  /** 見込み客（家の数から、自店との被りと競合を引いた概算） */
  est: number;
  /** 近くの家 */
  homes: number;
  /** 自店との被り（家の数。自店の商圏にも入っている家） */
  overlap: number;
  /** 近くの競合（同じ商品を売る他社） */
  rivals: number;
}
export interface Heat {
  cells: Map<number, HeatCell>;
  /** 5 段（0〜4）：est の小さい → 大きい。等間隔 */
  band: (est: number) => number;
  min: number;
  max: number;
}
/** いま作っている商品（無ければおすすめ）。siteInfo と同じ */
function madeKeys(s: P1State): string[] {
  return [...new Set(s.slots.map((x) => x.sku).filter((x): x is Sku => !!x).map((x) => skuParts(x)[0]))];
}
/**
 * ここにお店を建てたときの見込み客（1 マス）。shopArea の homes と同じ範囲（MARKET.d0）。
 * est ＝ Σ 家の人数 ÷ (1 + その家を商圏に入れている自店の数 + 近くの競合の数)：自店と被る家・競合がいる分だけ減らす概算（表示だけ。siteInfo の数字は変えない）
 */
export function shopHeatAt(s: P1State, i: number, j: number, ignore?: number): Omit<HeatCell, 'k'> {
  const keys = madeKeys(s);
  const shops = myShops(s).filter((b) => b.uid !== ignore);
  const rivals = s.rivals.filter((r) => {
    const rb = s.buildings.find((x) => x.owner === r.id);
    return rb && dist([rb.i, rb.j], [i, j]) <= AREA_RIVAL && keys.some((k) => (r.sells[k] ?? 0) > 0);
  }).length;
  let homes = 0;
  let overlap = 0;
  let est = 0;
  for (const h of sources(s).list) {
    if (dist([h.i, h.j], [i, j]) > AREA_D0) continue;
    homes++;
    const shared = shops.filter((b) => dist([b.i, b.j], [h.i, h.j]) <= AREA_D0).length;
    if (shared) overlap++;
    est += h.pop / (1 + shared + rivals);
  }
  return { est, homes, overlap, rivals };
}
/** 置けるマスすべての見込み客（置くモードに入ったとき 1 回。マス数 × 家の数で軽い） */
export function shopHeat(s: P1State, id: string, ignore?: number): Heat {
  const cells = new Map<number, HeatCell>();
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      if (!allowedDirs(s, id, i, j, ignore).length) continue;
      cells.set(j * s.n + i, { k: j * s.n + i, ...shopHeatAt(s, i, j, ignore) });
    }
  return bands(cells);
}
/** 倉庫・工房・物流拠点を置くとき：工房からの片道の日数（近い → 遠い） */
export function daysHeat(s: P1State, id: string, ignore?: number): Heat {
  const cells = new Map<number, HeatCell>();
  const ws = myWorkshop(s);
  const dir: Dir = 'rd';
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const ok = allowedDirs(s, id, i, j, ignore);
      if (!ok.length) continue;
      const fake: PBuilding = { uid: -1, id, i, j, dir: ok[0] ?? dir, left: 0, owner: 'me' };
      const days = ws && ws.uid !== ignore ? legDays(s, pathLen(s, ws, fake)) : 0;
      cells.set(j * s.n + i, { k: j * s.n + i, est: days, homes: 0, overlap: 0, rivals: 0 });
    }
  return bands(cells);
}
function bands(cells: Map<number, HeatCell>): Heat {
  let min = Infinity;
  let max = -Infinity;
  for (const c of cells.values()) {
    min = Math.min(min, c.est);
    max = Math.max(max, c.est);
  }
  if (!cells.size) min = max = 0;
  const band = (est: number) => (max - min < 1e-9 ? 2 : Math.max(0, Math.min(4, Math.floor(((est - min) / (max - min)) * 5))));
  return { cells, band, min, max };
}

// ---------------------------------------------------------------- 4. PC の吹き出しの置き場所

export interface PopPlace {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  /** below＝マスの下（いままで）／left・right＝建物の左か右（PC で下にはみ出すとき） */
  side: 'below' | 'left' | 'right';
  /** しっぽの位置（below：左からの px／left・right：上からの px） */
  tail: number;
}
/**
 * 吹き出しの置き場所。sx, sy：マスの画面の位置。need：中身の高さ（測れないときは 0）。
 * PC（pc）で下に need が入らなければ、建物の左か右（画面の中央より左の建物なら右に、右なら左に）に出し、縦は画面に収める。スマホはいままでどおり下
 */
export function popPlace(o: { sx: number; sy: number; zoom: number; W: number; H: number; right: number; bottom: number; need: number; pc: boolean; bw?: number; top0?: number }): PopPlace {
  const w = Math.min(400, o.right - 16);
  const below = o.sy + 40 * o.zoom + 12;
  const roomBelow = o.bottom - below;
  if (!o.pc || o.need <= roomBelow || o.need <= 0) {
    const left = Math.max(8, Math.min(o.right - w - 8, o.sx - w / 2));
    return { left, top: below, width: w, maxHeight: Math.max(140, roomBelow), side: 'below', tail: Math.max(16, Math.min(w - 16, o.sx - left)) };
  }
  const side: 'left' | 'right' = o.sx < o.right / 2 ? 'right' : 'left';
  const gap = (o.bw ?? 110) * o.zoom + 16;
  const left = side === 'right' ? Math.min(o.right - w - 8, o.sx + gap) : Math.max(8, o.sx - gap - w);
  const top0 = (o.top0 ?? 0) + 8;
  const maxH = Math.max(140, o.bottom - top0 - 8);
  const h = Math.min(o.need, maxH);
  const top = Math.max(top0, Math.min(o.bottom - 8 - h, o.sy - h / 2));
  return { left, top, width: w, maxHeight: maxH, side, tail: Math.max(16, Math.min(h - 16, o.sy - top)) };
}

// ---------------------------------------------------------------- 5. ランドの段階ズーム

/** つながった地図（関所のあと）：いちばん縮小（lo）から 0.25 までを 5 段に（等比）。町の地図の段（0.25・0.5・1・2）はそのまま */
export function landZoomSteps(lo: number, town: number[] = [0.25, 0.5, 1, 2]): number[] {
  const top = town[0];
  if (lo >= top) return [...new Set([lo, ...town])].sort((a, b) => a - b);
  const r = Math.pow(top / lo, 1 / 5);
  const out = [lo];
  for (let k = 1; k < 5; k++) out.push(Math.round(lo * Math.pow(r, k) * 1000) / 1000);
  return [...new Set([...out, ...town])].sort((a, b) => a - b);
}
