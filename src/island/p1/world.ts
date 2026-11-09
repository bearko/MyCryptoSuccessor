/**
 * つながった地図（同じランクのセクタが隣どうしに並ぶ）の決まりごと。描かない・DOM を触らない（テストできる）。
 * - 階層：ランクごとに別。Common の階層には Common のセクタだけ（data.ts の SectorDef.grid）。
 * - 隣：同じ階層で grid が上下左右に 1 違い（斜めは隣ではない）。
 * - シームレスな移動：画面の中心が隣の出店済みセクタに 1.5 マス以上入ったら switchSector。
 * docs/ISLAND_PHASE1.md「つながった地図」。
 */
import { t } from '../../i18n';
import { P1B, SECTORS, TIERS, aptitude, type SectorDef, type Sku, type Tier } from './data';
import { TIER_NAME, sectorDef, sectorState, type SectorState } from './company';
import { crowned, hasBusiness, lastRank, letterLocked, moveTo, townSeed, type MoveErr } from './land';
import { rankUpTier } from './reset';
import { clearWaiting, newP1, staffOf, type P1State, type PBuilding, type Report, type ShopState } from './model';
import { activeFeeds } from './feed';

// ---------------------------------------------------------------- 階層と隣

/** そのランクの階層のセクタ（雲・準備中も含む） */
export const layerOf = (tier: Tier): SectorDef[] => SECTORS.filter((x) => x.tier === tier);
/** そのランクの地図の広さ（同じ階層は同じ n） */
export const sizeOf = (tier: Tier) => TIERS[tier].n;
/** 同じ階層で grid が上下左右に 1 違い */
export function adjacent(a: string, b: string): boolean {
  const A = sectorDef(a);
  const B = sectorDef(b);
  if (A.id !== a || B.id !== b || A.tier !== B.tier) return false;
  return Math.abs(A.grid[0] - B.grid[0]) + Math.abs(A.grid[1] - B.grid[1]) === 1;
}
export const neighborsOf = (id: string): SectorDef[] => SECTORS.filter((x) => adjacent(id, x.id));
/** 同じ階層の grid の位置のセクタ */
export const sectorAtGrid = (tier: Tier, gx: number, gy: number) => SECTORS.find((x) => x.tier === tier && x.grid[0] === gx && x.grid[1] === gy) ?? null;

/** いまのセクタ cur から見た、セクタ id の grid のずれ。別の階層なら null */
export function gridDelta(cur: string, id: string): [number, number] | null {
  const A = sectorDef(cur);
  const B = sectorDef(id);
  if (A.tier !== B.tier || B.id !== id) return null;
  return [B.grid[0] - A.grid[0], B.grid[1] - A.grid[1]];
}

/**
 * カメラの付け直し：grid が (dgx, dgy) ずれたセクタへ移ったら、ワールド座標からこれだけ引く（見た目が変わらない）。
 * マスのずれは (dgx × n, dgy × n)。等角の変換は x = (i − j) × 100・y = (i + j) × 55。
 */
export const camShift = (dgx: number, dgy: number, n: number) => ({ x: (dgx - dgy) * n * 100, y: (dgx + dgy) * n * 55 });

/** ワールド座標 → マス（小数） */
export const tileOf = (x: number, y: number) => ({ u: (x / 100 + y / 55) / 2, v: (y / 55 - x / 100) / 2 });

/**
 * 画面の中心（ワールド座標）が入った、隣の出店済みセクタ。境界から margin マス以上入っていなければ null（ちらつかないように）。
 */
export function enteredSector(s: P1State, x: number, y: number, margin = 1.5): string | null {
  const land = s.land;
  if (!land) return null;
  const n = s.n;
  const { u, v } = tileOf(x, y);
  const dx = Math.floor((u + 0.5) / n);
  const dy = Math.floor((v + 0.5) / n);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  // 境界から入った深さ
  const lu = u - dx * n;
  const lv = v - dy * n;
  const depth = dx === 1 ? lu + 0.5 : dx === -1 ? n - 0.5 - lu : dy === 1 ? lv + 0.5 : n - 0.5 - lv;
  if (depth < margin) return null;
  const cur = sectorDef(land.cur);
  const to = sectorAtGrid(cur.tier, cur.grid[0] + dx, cur.grid[1] + dy);
  if (!to || sectorState(land, to.id) !== 'mine') return null;
  return to.id;
}

// ---------------------------------------------------------------- セクタの入れ替え（シームレスな移動）

/** 離れるときの担当の仕事（moveTo が外す。マネージャーの候補の 2 番手） */
const LOCAL = ['craft', 'transport', 'shop', 'buy', 'intel'];

/** マネージャーの自動指名：適性のいちばん高い待機中のヒーロー（いなければ、離れると外れる仕事の人） */
export function pickManager(s: P1State): number | null {
  const by = (xs: P1State['staff']) => [...xs].sort((a, b) => aptitude(b.stats, 'manager') - aptitude(a.stats, 'manager'))[0]?.hero ?? null;
  // 段 UI5b：役職（事業部長）のある人はセクター長に回さない（兼任しない）。いなければ前のまま
  const free = s.staff.filter((x) => !x.heads?.length);
  return by(free.filter((x) => x.task == null)) ?? by(free.filter((x) => x.task && LOCAL.includes(x.task))) ?? by(s.staff.filter((x) => x.task == null)) ?? by(s.staff.filter((x) => x.task && LOCAL.includes(x.task)));
}

export interface SwitchResult {
  err: MoveErr | 'not-mine' | null;
  /** 出るセクタのマネージャー（建物が無ければ null） */
  manager: number | null;
  /** 入るセクタのマネージャーを、そのまま出るセクタへ回した */
  handed: boolean;
  /** 自動で指名した */
  auto: boolean;
  /** 入るセクタのマネージャーが、交代せずに本社の仕事に戻った（出るセクタに建物が無いとき） */
  back: number | null;
  /** grid のずれ（カメラの付け直し用） */
  delta: [number, number];
}

/**
 * 出店済みの隣のセクタへ移る（引き出しを出さない）。状態の入れ替えは moveTo（SECTOR_KEYS の写し）。
 * マネージャーの交代：入るセクタのマネージャーを、出るセクタのマネージャーに回す（出るセクタに建物があるとき）。
 * 入るセクタにマネージャーがいなければ、適性のいちばん高い待機中のヒーローを指名。誰もいなければ移らない（err 'manager'）。
 */
export function switchSector(s: P1State, to: string): SwitchResult {
  const land = s.land;
  const delta: [number, number] = land ? (gridDelta(land.cur, to) ?? [0, 0]) : [0, 0];
  let back: number | null = null;
  const out = (err: SwitchResult['err'], manager: number | null = null, handed = false, auto = false): SwitchResult => ({ err, manager, handed, auto, back: err ? null : back, delta });
  if (!land) return out('no-land');
  const st = sectorState(land, to);
  if (st === 'here') return out('here');
  if (st !== 'mine') return out('not-mine');
  const rec = land.recs[to];
  let incoming = rec?.manager ?? null;
  const inc = incoming != null ? staffOf(s, incoming) : undefined;
  if (!inc || inc.task !== 'manager' || inc.target !== to) incoming = null;
  const business = hasBusiness(s);
  let manager: number | null = null;
  let handed = false;
  let auto = false;
  if (business) {
    if (incoming != null) {
      manager = incoming;
      handed = true;
    } else {
      manager = pickManager(s);
      auto = manager != null;
      if (manager == null) return out('manager');
    }
  }
  // 入るセクタのマネージャーは、いったん本社へ（交代なら、このあと moveTo で出るセクタのマネージャーに）
  if (incoming != null && inc && rec) {
    inc.task = null;
    inc.target = null;
    rec.manager = null;
    if (!handed) back = incoming;
  }
  const e = moveTo(s, to, manager);
  if (e) {
    if (incoming != null && inc && rec) {
      inc.task = 'manager';
      inc.target = to;
      rec.manager = incoming;
    }
    return out(e);
  }
  return out(null, manager, handed, auto);
}

// ---------------------------------------------------------------- まだ出店していないセクタの町（先に見せる）

const towns = new Map<string, P1State>();
/** 未出店のセクタの町（moveTo の新規と同じ種。結果は覚えておく） */
export function ghostTown(s: P1State, id: string): P1State {
  const seed = townSeed(s, id);
  const key = `${seed}:${id}`;
  let g = towns.get(key);
  if (!g) {
    g = newP1(seed, sectorDef(id).tier, id);
    towns.set(key, g);
  }
  return g;
}

/** 出店済みのセクタ（いまのセクタではない）の写し */
export interface SectorSnap {
  n: number;
  seed: number;
  buildings: PBuilding[];
  shops: Record<number, ShopState>;
  reports: Report[];
}
export const snapOf = (s: P1State, id: string): SectorSnap | null => (s.land?.recs[id]?.snap as SectorSnap | undefined) ?? null;

// ---------------------------------------------------------------- 縮小したときの札

export interface SectorBadge {
  id: string;
  name: string;
  tier: Tier;
  /** grid のずれ（いまのセクタから） */
  delta: [number, number];
  state: SectorState;
  /** 最新の売上順位（月の締めが無ければ null） */
  rank: number | null;
  crown: boolean;
  /** 1 位を 2 か月続けたのに研究成果の発表がまだ（いまのセクタだけ。「👑 発表待ち」）。発掘 v2 の 5 段目 */
  wait?: boolean;
  /** 主力商品（お店の棚の 1 番目の商品。多い順に最大 3 つ） */
  items: Sku[];
  /** エリアマネージャー（いまのセクタは null） */
  manager: number | null;
  /** 先月の売上（あれば） */
  lastRev: number | null;
  fee: number;
  /** まだ行けないときの条件 */
  need: string | null;
  /** 段 TRADE1b：輸入中の品（いまの町は届いている品・相手の町はいまの町へ出している品）。無ければ無い */
  feeds?: Sku[];
}

function mainItems(buildings: PBuilding[], shops: Record<number, ShopState> | undefined): Sku[] {
  const count = new Map<Sku, number>();
  for (const b of buildings) {
    if (b.owner !== 'me' || P1B[b.id]?.kind !== 'shop') continue;
    const x = shops?.[b.uid]?.shelves?.[0];
    if (x) count.set(x, (count.get(x) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1]).slice(0, 3).map((x) => x[0]);
}

/** 開放の条件（Rare など） */
export function needLine(s: P1State, d: SectorDef): string | null {
  if (d.cloud) return t('雲に覆われている', 'Under clouds');
  if (!d.need) return d.soon ? t('準備中', 'Coming soon') : null;
  const have = (s.land?.mine ?? []).filter((x) => sectorDef(x).tier === d.need!.tier).length;
  return t(`${TIER_NAME[d.need.tier]} を ${d.need.n} つ開拓で開放（いま ${have}/${d.need.n}）`, `Open ${d.need.n} ${TIER_NAME[d.need.tier]} sectors to unlock (now ${have}/${d.need.n})`);
}

/** いまの階層の全セクタの状況（縮小したときの札） */
export function sectorBadges(s: P1State): SectorBadge[] {
  const land = s.land;
  if (!land) return [];
  const cur = sectorDef(land.cur);
  // 段 TRADE1b：輸入中の品（相手の町ごと）
  const act = activeFeeds(s);
  const fin = [...new Set(act.map((a) => a.e.sku as Sku))];
  const fout = (id: string) => [...new Set(act.filter((a) => a.from === id).map((a) => a.e.sku as Sku))];
  return layerOf(cur.tier).map((d) => {
    const state = sectorState(land, d.id);
    const delta = gridDelta(cur.id, d.id) ?? [0, 0];
    const base = { id: d.id, name: d.name, tier: d.tier, delta, state, fee: d.fee, rank: null, crown: false, items: [], manager: null, lastRev: null, need: null };
    if (state === 'here') {
      const last = s.reports[s.reports.length - 1];
      return { ...base, rank: last?.rank ?? null, crown: !!s.cleared, wait: clearWaiting(s), items: mainItems(s.buildings, s.shops), lastRev: last ? last.revenue : null, ...(fin.length ? { feeds: fin } : {}) };
    }
    if (state === 'mine') {
      const rec = land.recs[d.id];
      const snap = snapOf(s, d.id);
      const m = rec?.manager != null ? staffOf(s, rec.manager) : undefined;
      const log = rec?.log[rec.log.length - 1];
      const rep = snap?.reports?.[snap.reports.length - 1];
      return { ...base, rank: lastRank(s, d.id), crown: crowned(s, d.id), items: snap ? mainItems(snap.buildings, snap.shops) : [], manager: m && m.task === 'manager' ? m.hero : null, lastRev: log ? log.rev : rep ? rep.revenue : null, ...(fout(d.id).length ? { feeds: fout(d.id) } : {}) };
    }
    if (state === 'open') return base;
    return { ...base, need: needLine(s, d) };
  });
}

// ---------------------------------------------------------------- 段 UI4（追加の要望）：境界の近くの町の名前と、進出のポップアップ

/** 境界の名前を出す近さ（マス）：画面の中心が、隣のセクタの名前の場所（その町側の外周 3 マスの真ん中）からこれだけ以内（向きに沿って） */
export const EDGE_NEAR = 6;
/** 画面の中心のマス（カメラの位置から。main.ts の screenOf の逆） */
export const camCell = (camX: number, camY: number): [number, number] => [(camX / 100 + camY / 55) / 2, (camY / 55 - camX / 100) / 2];
/**
 * 画面の中心 center が、隣の町（向き dx・dy、名前の場所 at）の境界に近いか：向きに沿った距離が EDGE_NEAR 以内で、横は町の幅の半分 ＋ 2 マスまで。
 * 近づいたら雲の上に町の名前を出し、離れたら消す
 */
export function edgeNear(n: number, center: [number, number], dir: { dx: number; dy: number }, at: [number, number]): boolean {
  const along = dir.dx !== 0 ? Math.abs(center[0] - at[0]) : Math.abs(center[1] - at[1]);
  const across = dir.dx !== 0 ? Math.abs(center[1] - at[1]) : Math.abs(center[0] - at[0]);
  return along <= EDGE_NEAR && across <= n / 2 + 2;
}
/** 町の名前を押したポップアップの「進出する」で何をするか（go：出店済みへ移動・move：入国料を払って進出・rankup：ランクアップの確認・letter：調査依頼状が要る・short：資金不足・locked：まだ行けない） */
export type AdvanceKind = 'go' | 'move' | 'rankup' | 'letter' | 'short' | 'locked';
export function advanceOf(s: P1State, id: string): { k: AdvanceKind; fee: number; short: number } {
  const d = sectorDef(id);
  const st = s.land ? sectorState(s.land, id) : 'cloud';
  if (st === 'mine') return { k: 'go', fee: 0, short: 0 };
  if (st !== 'open') return { k: 'locked', fee: d.fee, short: 0 };
  if (letterLocked(s, id)) return { k: 'letter', fee: d.fee, short: 0 };
  if (rankUpTier(s, id)) return { k: 'rankup', fee: 0, short: 0 };
  const short = Math.max(0, d.fee - s.money);
  return { k: short > 0 ? 'short' : 'move', fee: d.fee, short };
}
/** ポップアップの中身：他社の数・需要の多い商品（gap の商品と需要の倍率の大きい順に 3 つ） */
export function sectorFacts(id: string): { rivals: number; hot: string[] } {
  const p = sectorDef(id).profile;
  const hot = [...new Set([...(p.gap ?? []), ...Object.entries(p.demand ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([k]) => k)])].slice(0, 3);
  return { rivals: p.rivals?.length ?? 0, hot };
}
/** ポップアップの「進出する」：いまの進出の関数を呼ぶ（go：移動・move：startMove（入国料と確認・移動の演出はいまのまま）・rankup：ランクアップの確認）。押せないときは false */
export function advanceGo(k: AdvanceKind, f: { go: () => void; move: () => void; rankup: () => void }): boolean {
  if (k === 'go') f.go();
  else if (k === 'move') f.move();
  else if (k === 'rankup') f.rankup();
  else return false;
  return true;
}
