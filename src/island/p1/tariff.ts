/**
 * 段 TRADE1a：となり町の問屋から素材を取り寄せる（関税・境の拠点）。DOM なし：model.ts・orders.ts・screens.ts・mapviz.ts・deleg.ts・自動プレイ・テストが使う。
 * - 取り寄せ先：同じ階層で上下左右の隣（world.ts の adjacent）のうち、出店済み（写し）と開放済み（まだ出店していない町。ghostTown）。関所を開けるまで（land が無い）は無い。
 * - 値段：相手の町の値段（会社のスキルの値引きまで ＋ 相手の特産なら 20% 引き。この町の仕入れの契約は入れない）× できごとの倍率。関税はその値段 × 率。
 * - 関税の率：出店済み 12%・未出店 18%。パネル（通関の手続き・保税の置き場・関所の優先レーン）と境の拠点で下げ、下限 2%（未出店は 8%）。数字は data.ts の TRADE。
 * - 納期：支度の 1 日 ＋（隣の問屋 → 境界：歩く。優先レーンで ×0.8）＋（境界 → 工房：歩く／境の拠点があれば境界 → 拠点 → 工房をトラック（depotLink））。
 * - 調達係（自動の買い付け）は、手で選んだ仕入れ先（Proc.from）だけを続ける。Rare からは物流の部長が「隣町で買うと月 −N G」を提案（deleg.ts）。
 * docs/ISLAND_PHASE1.md「となり町の取り寄せ」。
 */
import { t } from '../../i18n';
import { CHEAP_RATE, MATS, TRADE, TRANSPORT, type Mat } from './data';
import { sectorDef, sectorState } from './company';
import { evMul } from './events';
import { DAYS, depotLink, doorOf, fullUse, groundOf, has, matBase, myDepots, myWorkshop, pathLen, procQty, roadLines, roadPath, unitPrice, type P1State, type PBuilding } from './model';
import { ghostTown, gridDelta, sectorAtGrid, snapOf } from './world';
import { propsOpen } from './stage';
import { headOf } from './deleg';

// ---------------------------------------------------------------- となり町

export interface Neighbor {
  id: string;
  name: string;
  /** 出店済み（関税 12%）か、まだ出店していない（18%） */
  opened: boolean;
  /** grid のずれ（いまの町から） */
  delta: [number, number];
}

/** 取り寄せられるとなり町（関所を開けてから。同じ階層の上下左右・出店済みか開放済み） */
export function tradeNeighbors(s: P1State): Neighbor[] {
  const land = s.land;
  if (!land) return [];
  const cur = sectorDef(land.cur);
  const out: Neighbor[] = [];
  for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
    const id = sectorAtGrid(cur.tier, cur.grid[0] + d[0], cur.grid[1] + d[1])?.id;
    if (!id) continue;
    const st = sectorState(land, id);
    if (st !== 'mine' && st !== 'open') continue;
    out.push({ id, name: sectorDef(id).name, opened: st === 'mine', delta: d });
  }
  return out;
}
/** そのセクタが、いまの町から取り寄せられるとなり町か */
export const neighborOf = (s: P1State, id: string): Neighbor | null => tradeNeighbors(s).find((x) => x.id === id) ?? null;

/** そのセクタの特産か（相手の町の 20% 引き） */
export const cheapAt = (id: string, m: Mat) => !!sectorDef(id).profile.cheap?.includes(m);
/** となり町でその素材を買えるか：会社で開いたルート、または相手の町で最初から開いているルート（特産でルートが開いている町） */
export function routeAt(s: Pick<P1State, 'routes'>, m: Mat, id: string): boolean {
  if (s.routes.includes(m)) return true;
  if (m !== 'cloth' && m !== 'paper' && m !== 'gem') return true;
  const p = sectorDef(id).profile;
  return !!p.routesOpen || !!p.routes?.includes(m);
}
/** いまの町から、そのとなり町のその素材を取り寄せられるか */
export const canImport = (s: P1State, m: Mat, id: string) => !!neighborOf(s, id) && routeAt(s, m, id);

// ---------------------------------------------------------------- 関税

/** パネルで下がる関税（ポイント。0.03 なら 3 ポイント） */
export const dutyCut = (s: Pick<P1State, 'skills'>) => (has(s, 'customs') ? TRADE.cut.customs : 0) + (has(s, 'bonded') ? TRADE.cut.bonded : 0) + (has(s, 'lane') ? TRADE.cut.lane : 0);
/** 関税の率（opened：出店済みの隣か・border：境の拠点があるか）。下限は floor（未出店は floor ＋ 差） */
export function dutyRateOf(s: Pick<P1State, 'skills'>, opened: boolean, border: boolean): number {
  const extra = opened ? 0 : TRADE.unopened - TRADE.base;
  const v = TRADE.base + extra - dutyCut(s) - (border ? TRADE.border : 0);
  return Math.round(Math.max(TRADE.floor + extra, v) * 1000) / 1000;
}
/** いまの町からそのとなり町への関税の率 */
export function dutyRate(s: P1State, id: string): number {
  const nb = neighborOf(s, id);
  return dutyRateOf(s, nb?.opened ?? false, !!borderDepot(s, id));
}
/** 「関税 12% → 9%」（基準 → いま。下がっていなければ「関税 12%」） */
export function dutyText(s: P1State, id: string): string {
  const nb = neighborOf(s, id);
  const base = Math.round((nb?.opened === false ? TRADE.unopened : TRADE.base) * 100);
  const now = Math.round(dutyRate(s, id) * 1000) / 10;
  return now < base ? t(`関税 ${base}% → ${now}%`, `Duty ${base}% → ${now}%`) : t(`関税 ${base}%`, `Duty ${base}%`);
}

// ---------------------------------------------------------------- 境の拠点

/** マス (i, j) の、grid のずれ d の向きの境界からの距離（マス。0 が境界のマス） */
export function edgeOf(n: number, i: number, j: number, d: [number, number]): number {
  if (d[0] === 1) return n - 1 - i;
  if (d[0] === -1) return i;
  if (d[1] === 1) return n - 1 - j;
  return j;
}
/** 物流拠点のマスのうち、その向きの境界にいちばん近いマスの距離（入口の前のマスで測る） */
const depotEdge = (s: P1State, b: Pick<PBuilding, 'id' | 'i' | 'j' | 'dir'>, d: [number, number]) => {
  const [i, j] = doorOf(b as PBuilding);
  return Math.min(edgeOf(s.n, b.i, b.j, d), edgeOf(s.n, i, j, d));
};
/** そのとなり町の向きの「境の拠点」（境界から TRADE.edge マス以内の自社の物流拠点。いちばん境界に近いもの） */
export function borderDepot(s: P1State, id: string, depots = myDepots(s)): PBuilding | null {
  const nb = neighborOf(s, id);
  if (!nb) return null;
  let best: PBuilding | null = null;
  let bd = Infinity;
  for (const b of depots) {
    const e = depotEdge(s, b, nb.delta);
    if (e <= TRADE.edge && e < bd) {
      best = b;
      bd = e;
    }
  }
  return best;
}
/** 置く前の下見：ここに物流拠点を置いたら境の拠点になるとなり町（無ければ空） */
export function borderAt(s: P1State, i: number, j: number, dir: PBuilding['dir']): Neighbor[] {
  const fake = { id: 'logistics', i, j, dir };
  return tradeNeighbors(s).filter((nb) => depotEdge(s, fake, nb.delta) <= TRADE.edge);
}

// ---------------------------------------------------------------- 値段

/** となり町の素材 1 個の値段（相手の町の値段・関税・合計。できごとの倍率込み＝払う額） */
export function importPrice(s: P1State, m: Mat, id: string): { base: number; duty: number; unit: number; rate: number } {
  const base = Math.round(Math.round(matBase(s, m) * (cheapAt(id, m) ? CHEAP_RATE : 1)) * evMul(s, 'mat', m));
  const rate = dutyRate(s, id);
  const duty = Math.round(base * rate);
  return { base, duty, unit: base + duty, rate };
}
/** その素材を、いちばん安く買えるとなり町（関税込み。無ければ null） */
export function bestImport(s: P1State, m: Mat): { id: string; base: number; duty: number; unit: number; rate: number } | null {
  let best: { id: string; base: number; duty: number; unit: number; rate: number } | null = null;
  for (const nb of tradeNeighbors(s)) {
    if (!routeAt(s, m, nb.id)) continue;
    const p = importPrice(s, m, nb.id);
    if (!best || p.unit < best.unit) best = { id: nb.id, ...p };
  }
  return best;
}
/** 関税込みでここより安いとなり町（無ければ null） */
export function cheaperImport(s: P1State, m: Mat): { id: string; base: number; duty: number; unit: number; rate: number } | null {
  const b = bestImport(s, m);
  return b && b.unit < unitPrice(s, m) ? b : null;
}

// ---------------------------------------------------------------- 道のりと納期

type Cell = [number, number];
/** 隣の町の道路だけの形（groundOf と同じ。建物は道をふさがない） */
const flat = (n: number) => ({ n, ground: groundOf(n) }) as unknown as P1State;
/** そのとなり町の卸問屋（写しか、まだ出店していない町） */
export function neighborWholesaler(s: P1State, id: string): PBuilding | null {
  const snap = snapOf(s, id);
  const bs = snap?.buildings ?? (neighborOf(s, id) ? ghostTown(s, id).buildings : []);
  return bs.find((b) => b.id === 'wholesale') ?? null;
}

export interface CrossRoute {
  /** 道のり（いまの町の座標。隣の問屋の入口の前 → 境界 → 届け先の入口の前） */
  cells: Cell[];
  /** 境界をこえる所（cells の番号：いまの町の最初のマス） */
  at: number;
  /** 境界の外を歩くマス数・境界から届け先までのマス数（境の拠点があれば拠点まで）・拠点から工房まで */
  outside: number;
  inside: number;
  trunk: number;
  /** 境の拠点（あれば） */
  depot: PBuilding | null;
}
const routeMemo = new Map<string, CrossRoute | null>();
/** 隣の問屋から、この町の工房（か境の拠点）までの道のり。工房・隣の問屋が無ければ null */
export function crossRoute(s: P1State, id: string): CrossRoute | null {
  const nb = neighborOf(s, id);
  const ws = myWorkshop(s);
  const wh = nb ? neighborWholesaler(s, id) : null;
  if (!nb || !ws || !wh) return null;
  const depot = borderDepot(s, id);
  const key = `${s.seed}:${s.sector ?? ''}:${id}:${ws.uid}:${depot?.uid ?? ''}:${wh.i},${wh.j}:${s.ground.length}:${s.n}`;
  if (routeMemo.has(key)) return routeMemo.get(key)!;
  const n = s.n;
  const g = gridDelta(s.land!.cur, id) ?? nb.delta;
  const dst = depot ?? ws;
  const wd = doorOf(wh);
  let best: CrossRoute | null = null;
  for (const r of roadLines(n)) {
    // 境界の両側のマス（いまの町の座標・隣の町の座標）
    const here: Cell = g[0] === 1 ? [n - 1, r] : g[0] === -1 ? [0, r] : g[1] === 1 ? [r, n - 1] : [r, 0];
    const there: Cell = g[0] === 1 ? [0, r] : g[0] === -1 ? [n - 1, r] : g[1] === 1 ? [r, 0] : [r, n - 1];
    const out = roadPath(flat(n), wd, there);
    const inn = roadPath(s, here, doorOf(dst));
    if (!out || !inn) continue;
    const cells: Cell[] = [...out.map(([i, j]) => [i + g[0] * n, j + g[1] * n] as Cell), ...inn];
    const c: CrossRoute = { cells, at: out.length, outside: out.length, inside: inn.length - 1, trunk: depot ? pathLen(s, depot, ws) : 0, depot };
    if (!best || c.outside + c.inside < best.outside + best.inside) best = c;
  }
  routeMemo.set(key, best);
  return best;
}
/** 取り寄せの納期（日）：支度の 1 日 ＋ 境界の外を歩く（優先レーンで ×0.8）＋ 境界から工房（境の拠点があれば拠点から先はトラック） */
export function importLead(s: P1State, id: string): number {
  const r = crossRoute(s, id);
  const out = (r?.outside ?? 12) * (has(s, 'lane') ? TRADE.lane : 1);
  const inn = r ? (r.depot ? (r.inside + r.trunk) * depotLink(s) : r.inside) : 8;
  return 1 + Math.max(1, Math.ceil((out + inn) / TRANSPORT.walkPerDay));
}

// ---------------------------------------------------------------- 仕入れ先（調達係）

/** その素材の調達係の仕入れ先（手で選んだとなり町。選んでいない・もう取り寄せられないなら null） */
export function sourceOf(s: P1State, m: Mat): string | null {
  const id = s.proc.from?.[s.sector ?? 'c1']?.[m];
  return id && canImport(s, m, id) ? id : null;
}
/** 仕入れ先を選ぶ（null でこの町の卸問屋に戻す） */
export function setSource(s: P1State, m: Mat, id: string | null) {
  const sec = s.sector ?? 'c1';
  const cur = { ...(s.proc.from?.[sec] ?? {}) };
  if (id) cur[m] = id;
  else delete cur[m];
  s.proc.from = { ...(s.proc.from ?? {}) };
  if (Object.keys(cur).length) s.proc.from[sec] = cur;
  else delete s.proc.from[sec];
  if (!Object.keys(s.proc.from).length) delete s.proc.from;
}
/** 月の量で、となり町で買うと月にいくら浮くか（関税込み。ここより高ければ 0 以下） */
export function monthSave(s: P1State, m: Mat, id: string): number {
  const q = Math.max(procQty(s, m), fullUse(s, true)[m] ?? 0);
  return Math.round((unitPrice(s, m) - importPrice(s, m, id).unit) * q);
}
/** 仕入れ先をとなり町にする候補（まだ選んでいない・関税込みで安い・月の量で浮く額。大きい順） */
export function sourceCands(s: P1State, mats: Mat[]): { m: Mat; from: string; save: number }[] {
  const out: { m: Mat; from: string; save: number }[] = [];
  for (const m of mats) {
    if (sourceOf(s, m)) continue;
    const b = cheaperImport(s, m);
    if (!b) continue;
    const save = monthSave(s, m, b.id);
    if (save > 0) out.push({ m, from: b.id, save });
  }
  return out.sort((a, b) => b.save - a.save);
}
/**
 * Rare から：物流の部長の提案「〇〇は隣町で買うと月 −N G」（部長がいるときだけ。Common・Uncommon はプレイヤーが手で選ぶ：0 → 1 はプレイヤー）。
 * 調達の画面と卸問屋の吹き出しに、部長の顔と「承認」で出す。提案書・カードの見積もり（brief.ts）は素材の値段の差を測らないので、そちらには入れない
 */
export function headSuggest(s: P1State, mats: Mat[]): { hero: number; m: Mat; from: string; save: number }[] {
  if (!propsOpen(s)) return [];
  const hd = headOf(s, 'logistics');
  if (!hd) return [];
  return sourceCands(s, mats).map((c) => ({ hero: hd.hero, ...c }));
}
/** 月の量の素材代（ここで買ったとき）。提案の見込みの分母 */
export const monthMat = (s: P1State, m: Mat) => Math.round(unitPrice(s, m) * Math.max(procQty(s, m), fullUse(s, true)[m] ?? 0));
/** 1 日の素材の量（手の注文の見込み。月の量 ÷ 30） */
export const dailyOf = (s: P1State, m: Mat) => Math.max(procQty(s, m), fullUse(s, true)[m] ?? 0) / DAYS;
/** 素材の名前 */
export const matNm = (m: Mat) => MATS[m].name;
