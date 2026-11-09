/**
 * 段 TRADE1b：隣町の工房の商品を、境の拠点へ輸入する。DOM なし：model.ts・tile.ts・main.ts・自動プレイ・テストが使う。
 * - 輸入できる町：境の拠点（境界から TRADE.edge マス以内の物流拠点。tariff.ts の borderDepot）を持っている町だけ。
 *   相手は、その拠点が接するとなり町のうち出店済み（写しがある）で、工房（廃墟でない）があり、離れた月の出来高（SectorRec.base.units）がある町。
 * - 品：相手の工房が作っている商品（写しの作業台）。となり町 1 つにつき TRADE.feed.max 品まで。手で選んだものだけ続く（勝手に足さない・入れ替えない）。
 * - 量：相手の町の離れた月の出来高の TRADE.feed.share（30%）まで。毎週（TRADE.feed.every 日）トラックが着き、1 回に受け取れる数は
 *   境の拠点の置き場所（roomOf：150 ＋ 保管棚 75／段。同じ向きの境の拠点が 2 つあれば合計）と、町の置き場所の空きまで。
 * - 仕入れ値：相手の町の素材代（相手の特産なら 20% 引き）＋ 作業（その商品の値段 × TRADE.feed.labor）。相手の利益は入れない。帳簿は素材（mats）。
 * - 関税：その商品の値段 × 8%（TRADE.feed.goods）。素材と同じパネル・境の拠点・下限で下げる。帳簿は TRADE1a の duty。
 * - 相手の町への影響：会社の月の締めで、出した商品の値段の合計 ÷ 相手の離れた月の売上 の割合だけ、相手の runSector の売上を減らす（向こうで売るはずだった品）。
 * - 止まるとき：相手の工房が廃墟（ランクアップの災害）・手放した・境の拠点が無い・相手の町に戻った（いまの町ではない）。直せば戻る（選んだ品は残る）。
 * - Rare から：物流の部長が「〇〇を輸入に足すと この町の売上 月 +N G」（空きがあれば足す・いっぱいなら入れ替え）を、拠点の吹き出しの中に顔と「承認」で出す。
 * docs/ISLAND_PHASE1.md「商品の輸入」。
 */
import { CHEAP_RATE, PRODUCT, SALES1, TRADE, skuParts, skuPrice, type Mat, type Sku } from './data';
import { RUIN, sectorDef, sectorProfile, type SectorRec } from './company';
import { DAYS, batchOf, doorOf, groundOf, matBase, myDepots, poolFree, recipeOf, roadLines, roadPath, roomOf, sellEstimate, spend, type P1State, type PBuilding } from './model';
import { borderDepot, cheapAt, dutyCut, edgeOf, tradeNeighbors, type Neighbor } from './tariff';
import { gridDelta, snapOf } from './world';
import { propsOpen } from './stage';
import { headOf } from './deleg';

/** 輸入の 1 品（相手の町の記録 SectorRec.feed に入る）。to：輸入している町・sku：商品・sent：会社の月の締めまでに出した数・rep：町の月の報告までの数と関税・share：先月の締めで減らした割合 */
export interface FeedEntry {
  to: string;
  sku: Sku;
  sent?: number;
  rep?: { n: number; duty: number };
  share?: number;
}

/** 輸入の札の中身（1 品） */
export interface FeedItem {
  from: string;
  sku: Sku;
  key: string;
  /** 相手の町の離れた月の出来高（その商品の月の数） */
  month: number;
  /** 1 週に届く数（30% の上限と、境の拠点の置き場所の小さいほう） */
  week: number;
  /** 30% の上限だけで見た 1 週の数（置き場所で頭打ちかを見せる） */
  weekShare: number;
  /** 1 個の仕入れ値（相手の素材代 ＋ 作業）・関税・合計 */
  buy: number;
  duty: number;
  unit: number;
  /** この町の需要の倍率（SectorProfile.demand。無ければ 1）・gap（まだ誰も売っていない） */
  demand: number;
  gap: boolean;
  /** いま選んでいる */
  on: boolean;
}

// ---------------------------------------------------------------- 相手の町

/** 写しの工房（自社。廃墟は除く） */
const snapWorkshop = (bs: PBuilding[] | undefined) => (bs ?? []).find((b) => b.id === 'workshop' && b.owner === 'me') ?? null;
/** 写しの工房が廃墟か（ランクアップの災害） */
export const workshopRuined = (s: P1State, id: string) => !!(snapOf(s, id)?.buildings ?? []).find((b) => b.id === 'workshop' && b.owner === RUIN) && !snapWorkshop(snapOf(s, id)?.buildings);
/** 相手の町の離れた月の出来高（商品ごとの月の数）。runSector の要約の元（SectorRec.base.units）。無ければ空 */
export const unitsOf = (rec: SectorRec | undefined): Partial<Record<string, number>> => rec?.base?.units ?? {};

/** 相手の町が、いま輸入の相手になれるか（出店済みのとなり町・写しに工房・出来高がある）。なれなければ理由 */
export function feedBlock(s: P1State, id: string): 'nb' | 'unopened' | 'workshop' | 'ruin' | 'units' | 'depot' | null {
  const nb = tradeNeighbors(s).find((x) => x.id === id);
  if (!nb) return 'nb';
  if (!nb.opened) return 'unopened';
  const snap = snapOf(s, id);
  if (!snap) return 'unopened';
  if (!snapWorkshop(snap.buildings)) return workshopRuined(s, id) ? 'ruin' : 'workshop';
  const u = unitsOf(s.land?.recs[id]);
  if (!Object.values(u).some((n) => (n ?? 0) > 0)) return 'units';
  if (!borderDepot(s, id)) return 'depot';
  return null;
}
/** 輸入できる相手の町（境の拠点がある出店済みのとなり町で、工房があるもの） */
export const feedNeighbors = (s: P1State): Neighbor[] => tradeNeighbors(s).filter((nb) => !feedBlock(s, nb.id));
/** 境の拠点さえ置けば輸入できる相手の町（下見・最初の一手の案内） */
export const feedReady = (s: P1State): Neighbor[] => tradeNeighbors(s).filter((nb) => {
  const e = feedBlock(s, nb.id);
  return !e || e === 'depot';
});

/** その向きの境の拠点（境界から TRADE.edge マス以内）すべて */
export function borderDepots(s: P1State, id: string): PBuilding[] {
  const nb = tradeNeighbors(s).find((x) => x.id === id);
  if (!nb) return [];
  return myDepots(s).filter((b) => {
    const [i, j] = doorOf(b);
    return Math.min(edgeOf(s.n, b.i, b.j, nb.delta), edgeOf(s.n, i, j, nb.delta)) <= TRADE.edge;
  });
}

// ---------------------------------------------------------------- 値段

/** 商品の関税の率（opened：出店済みの隣か・border：境の拠点があるか）。素材と同じ下げ方で、元は TRADE.feed.goods */
export function goodsRateOf(s: Pick<P1State, 'skills'>, opened: boolean, border: boolean): number {
  const extra = opened ? 0 : TRADE.unopened - TRADE.base;
  const v = TRADE.feed.goods + extra - dutyCut(s) - (border ? TRADE.border : 0);
  return Math.round(Math.max(TRADE.floor + extra, v) * 1000) / 1000;
}
/** いまの町からそのとなり町の商品の関税の率 */
export function goodsRate(s: P1State, id: string): number {
  const nb = tradeNeighbors(s).find((x) => x.id === id);
  return goodsRateOf(s, nb?.opened ?? false, !!borderDepot(s, id));
}
/**
 * 1 個の仕入れ値：相手の町の素材代（会社のスキルの値引きまで ＋ 相手の特産なら 20% 引き）÷ 1 ロットの数 ＋ 作業（値段 × labor）。
 * 関税：その商品の値段 × 率。相手の利益は入れない（任せている町の売上は、出したぶんだけ減る）
 */
export function feedPrice(s: P1State, id: string, x: Sku): { buy: number; duty: number; unit: number; rate: number } {
  const mats = Object.entries(recipeOf(x)).reduce((a, [m, q]) => a + Math.round(matBase(s, m as Mat) * (cheapAt(id, m as Mat) ? CHEAP_RATE : 1)) * (q ?? 0), 0) / batchOf(x, s);
  const buy = Math.max(1, Math.round(mats + skuPrice(x) * TRADE.feed.labor));
  const rate = goodsRate(s, id);
  const duty = Math.round(skuPrice(x) * rate);
  return { buy, duty, unit: buy + duty, rate };
}

// ---------------------------------------------------------------- 品と量

/** 相手の町の工房が作っている商品（写しの作業台。商品ごとに 1 つ。復刻品は売れるランク・独占の決まりがあるので輸入しない） */
export function feedSkus(s: P1State, id: string): Sku[] {
  const slots = ((s.land?.recs[id]?.snap as { slots?: { sku: Sku | null }[] } | undefined)?.slots ?? []).map((x) => x.sku).filter((x): x is Sku => !!x);
  const out: Sku[] = [];
  for (const x of slots) {
    const p = PRODUCT[skuParts(x)[0]];
    if (p && !p.relic && !out.some((y) => skuParts(y)[0] === skuParts(x)[0])) out.push(x);
  }
  return out;
}
/** その商品の相手の町の月の数（出来高） */
export const feedMonth = (s: P1State, id: string, x: Sku) => Math.round(unitsOf(s.land?.recs[id])[skuParts(x)[0]] ?? 0);
/** 1 週に届けられる数（30% の上限） */
export const weekShare = (s: P1State, id: string, x: Sku) => Math.floor((feedMonth(s, id, x) * TRADE.feed.share * TRADE.feed.every) / DAYS);
/** その向きの境の拠点が 1 回に受け取れる数（置き場所の合計） */
export const dockRoom = (s: P1State, id: string) => borderDepots(s, id).reduce((a, b) => a + roomOf(b), 0);

/** 選んでいる品（相手の町の記録。いまの町へのもの） */
export function feedPicks(s: P1State, id: string): FeedEntry[] {
  const cur = s.land?.cur;
  return ((s.land?.recs[id]?.feed ?? []) as FeedEntry[]).filter((e) => e.to === cur);
}
/** いま輸入している品（止まっていない相手の町だけ） */
export function activeFeeds(s: P1State): { from: string; e: FeedEntry }[] {
  const out: { from: string; e: FeedEntry }[] = [];
  for (const nb of feedNeighbors(s)) {
    const skus = feedSkus(s, nb.id);
    for (const e of feedPicks(s, nb.id)) if (skus.includes(e.sku)) out.push({ from: nb.id, e });
  }
  return out;
}
/** 選んでいるが止まっている品（相手の工房が廃墟・手放した・拠点が無い）。地図と吹き出しで「止まっている」と出す */
export function stoppedFeeds(s: P1State): { from: string; sku: Sku; why: NonNullable<ReturnType<typeof feedBlock>> }[] {
  const land = s.land;
  if (!land) return [];
  const out: { from: string; sku: Sku; why: NonNullable<ReturnType<typeof feedBlock>> }[] = [];
  for (const nb of tradeNeighbors(s)) {
    const why = feedBlock(s, nb.id);
    if (!why) continue;
    for (const e of feedPicks(s, nb.id)) out.push({ from: nb.id, sku: e.sku, why });
  }
  return out;
}

/** 1 週の数（選んだ品ごとに 30% の上限。合計を境の拠点の置き場所で頭打ちにし、割合で分ける） */
export function weekPlan(s: P1State, id: string, skus: Sku[]): Map<Sku, number> {
  const want = skus.map((x) => [x, weekShare(s, id, x)] as const);
  const all = want.reduce((a, [, n]) => a + n, 0);
  const room = dockRoom(s, id);
  const k = all > room && all > 0 ? room / all : 1;
  return new Map(want.map(([x, n]) => [x, Math.floor(n * k)]));
}

/** 輸入の札（相手の町の工房の商品ごと） */
export function feedItems(s: P1State, id: string): FeedItem[] {
  if (feedBlock(s, id)) return [];
  const picks = feedPicks(s, id).map((e) => e.sku);
  const prof = sectorProfile(s);
  const skus = feedSkus(s, id).filter((x) => feedMonth(s, id, x) > 0);
  return skus.map((x) => {
    const key = skuParts(x)[0];
    const on = picks.includes(x);
    // 置き場所の頭打ちは、選んでいる品と合わせて（選んでいなければ足したとき）
    const plan = weekPlan(s, id, on ? picks : [...picks, x].slice(-TRADE.feed.max));
    const p = feedPrice(s, id, x);
    return { from: id, sku: x, key, month: feedMonth(s, id, x), week: plan.get(x) ?? 0, weekShare: weekShare(s, id, x), buy: p.buy, duty: p.duty, unit: p.unit, demand: prof.demand?.[key] ?? 1, gap: !!prof.gap?.includes(key), on };
  });
}

/**
 * 品を選ぶ・外す（手。Common・Uncommon はこれだけ）。となり町 1 つにつき TRADE.feed.max 品まで。
 * 'full'：もういっぱい・'block'：輸入できない（境の拠点が無いなど）・null：できた
 */
export function toggleFeed(s: P1State, id: string, x: Sku): 'full' | 'block' | null {
  const land = s.land;
  if (!land) return 'block';
  const rec = land.recs[id];
  if (!rec) return 'block';
  const cur = land.cur;
  const list = (rec.feed ?? []) as FeedEntry[];
  const at = list.findIndex((e) => e.to === cur && e.sku === x);
  if (at >= 0) {
    rec.feed = list.filter((_, k) => k !== at);
    if (!rec.feed.length) delete rec.feed;
    return null;
  }
  if (feedBlock(s, id)) return 'block';
  if (!feedSkus(s, id).includes(x)) return 'block';
  if (list.filter((e) => e.to === cur).length >= TRADE.feed.max) return 'full';
  // ほかの町への輸入の記録（その町にいないあいだは止まっている）は残す
  rec.feed = [...list, { to: cur, sku: x }];
  return null;
}

// ---------------------------------------------------------------- 毎週の到着

export interface FeedArrival {
  from: string;
  sku: Sku;
  n: number;
  duty: number;
  /** 着いた境の拠点 */
  depot: number;
}
/**
 * 毎週の到着（step から。TRADE.feed.every 日ごと）：選んだ品を、30% の上限・境の拠点の置き場所・町の置き場所の空き・資金の中で受け取り、
 * 運ぶ前の商品（s.stock）に入れる。そこからお店へは、いまの荷車（oneWay の境の拠点から）。
 * 仕入れ値は素材（帳簿の mats）、関税は duty
 */
export function feedDay(s: P1State): FeedArrival[] {
  if (!s.land || s.day % TRADE.feed.every !== 0) return [];
  const act = activeFeeds(s);
  if (!act.length) return [];
  const out: FeedArrival[] = [];
  // 町の置き場所の空き（商品は SALES1.units 個で 1 枠：poolFree は枠）
  let room = poolFree(s) * SALES1.units;
  for (const id of [...new Set(act.map((a) => a.from))]) {
    const es = act.filter((a) => a.from === id).map((a) => a.e);
    const plan = weekPlan(s, id, es.map((e) => e.sku));
    const depot = borderDepot(s, id);
    for (const e of es) {
      const p = feedPrice(s, id, e.sku);
      const n = Math.max(0, Math.min(plan.get(e.sku) ?? 0, Math.floor(room), Math.floor(s.money / Math.max(1, p.unit))));
      if (n <= 0) continue;
      room -= n;
      s.money -= n * p.unit;
      spend(s, 'materials', n * p.buy);
      if (p.duty > 0) spend(s, 'duty', n * p.duty);
      s.stock[e.sku] = (s.stock[e.sku] ?? 0) + n;
      e.sent = (e.sent ?? 0) + n;
      e.rep = { n: (e.rep?.n ?? 0) + n, duty: (e.rep?.duty ?? 0) + n * p.duty };
      out.push({ from: id, sku: e.sku, n, duty: n * p.duty, depot: depot?.uid ?? -1 });
    }
  }
  return out;
}
/** 次のトラックが着くまでの日数（0 なら今日） */
export const feedNext = (s: Pick<P1State, 'day'>) => (TRADE.feed.every - (s.day % TRADE.feed.every)) % TRADE.feed.every;

/** 町の月の報告の「📦 輸入」：前の報告からの数と関税（読んだら 0 に戻す） */
export function feedReport(s: P1State): { from: string; sku: Sku; n: number; duty: number }[] {
  const land = s.land;
  if (!land) return [];
  const out: { from: string; sku: Sku; n: number; duty: number }[] = [];
  for (const [id, rec] of Object.entries(land.recs)) {
    for (const e of (rec.feed ?? []) as FeedEntry[]) {
      if (e.to !== land.cur || !e.rep) continue;
      if (e.rep.n > 0) out.push({ from: id, sku: e.sku, n: e.rep.n, duty: e.rep.duty });
      delete e.rep;
    }
  }
  return out;
}

/**
 * 会社の月の締め：相手の町の売上を減らす割合（出した商品の値段の合計 ÷ 相手の離れた月の売上。0〜0.9）。出した数は 0 に戻す。
 * 割合は記録（FeedEntry.share）に残す（地図の札・テスト）
 */
export function feedCut(rec: SectorRec): number {
  const es = (rec.feed ?? []) as FeedEntry[];
  if (!es.length || !rec.base || rec.base.rev <= 0) return 0;
  let v = 0;
  for (const e of es) {
    const x = (e.sent ?? 0) * skuPrice(e.sku);
    e.share = Math.round((x / rec.base.rev) * 1000) / 1000;
    v += x;
    delete e.sent;
  }
  return Math.min(0.9, v / rec.base.rev);
}

// ---------------------------------------------------------------- この町で売れる見込みと、部長の提案

/** その品を輸入したとき、この町の売上が月にどれだけ増えるか（月に届く数と、この町で売れる見込みの小さいほう × 値段） */
export function feedGain(s: P1State, it: Pick<FeedItem, 'sku' | 'week'>): number {
  const [key, r] = skuParts(it.sku);
  const month = (it.week * DAYS) / TRADE.feed.every;
  const last = s.reports[s.reports.length - 1]?.units?.[key] ?? 0;
  const sell = Math.max(0, sellEstimate(s, key, r) - last);
  return Math.round(Math.min(month, sell) * skuPrice(it.sku));
}

export interface FeedSuggest {
  hero: number;
  from: string;
  sku: Sku;
  gain: number;
  /** 入れ替えるときに外す品（いっぱいのとき） */
  out?: Sku;
}
/**
 * Rare から：物流の部長の提案（部長がいるときだけ。Common・Uncommon はプレイヤーが手で選ぶ：0 → 1 はプレイヤー）。
 * 空きがあれば「〇〇を輸入に足すと この町の売上 月 +N G」、いっぱいなら、いまの品よりこの町で TRADE.feed.swap 倍以上売れる品への入れ替え
 */
export function feedSuggest(s: P1State, id: string): FeedSuggest | null {
  if (!propsOpen(s)) return null;
  const hd = headOf(s, 'logistics');
  if (!hd) return null;
  const items = feedItems(s, id).map((it) => ({ it, gain: feedGain(s, it) }));
  const off = items.filter((x) => !x.it.on && x.gain > 0).sort((a, b) => b.gain - a.gain)[0];
  if (!off) return null;
  const on = items.filter((x) => x.it.on);
  if (on.length < TRADE.feed.max) return { hero: hd.hero, from: id, sku: off.it.sku, gain: off.gain };
  const worst = on.sort((a, b) => a.gain - b.gain)[0];
  if (off.gain < worst.gain * TRADE.feed.swap) return null;
  return { hero: hd.hero, from: id, sku: off.it.sku, gain: off.gain - worst.gain, out: worst.it.sku };
}
/** 部長の提案を承認（入れ替えなら外してから足す） */
export function approveFeed(s: P1State, sg: Pick<FeedSuggest, 'from' | 'sku' | 'out'>): boolean {
  if (sg.out && feedPicks(s, sg.from).some((e) => e.sku === sg.out)) toggleFeed(s, sg.from, sg.out);
  if (feedPicks(s, sg.from).some((e) => e.sku === sg.sku)) return true;
  return toggleFeed(s, sg.from, sg.sku) === null;
}

// ---------------------------------------------------------------- 道のり（地図の太い青の線とトラック）

type Cell = [number, number];
const flat = (n: number) => ({ n, ground: groundOf(n) }) as unknown as P1State;
const memo = new Map<string, { cells: Cell[]; at: number } | null>();
/** 相手の町の工房 → 境界 → 境の拠点の道のり（いまの町の座標。相手の町の側は grid のずれ × n を足す）。無ければ null */
export function feedRoute(s: P1State, id: string): { cells: Cell[]; at: number } | null {
  const snap = snapOf(s, id);
  const ws = snapWorkshop(snap?.buildings);
  const depot = borderDepot(s, id);
  const g = s.land ? gridDelta(s.land.cur, id) : null;
  if (!ws || !depot || !g) return null;
  const n = s.n;
  const key = `${s.seed}:${s.sector ?? ''}:${id}:${ws.i},${ws.j}:${depot.uid}:${n}`;
  if (memo.has(key)) return memo.get(key)!;
  let best: { cells: Cell[]; at: number } | null = null;
  for (const r of roadLines(n)) {
    const here: Cell = g[0] === 1 ? [n - 1, r] : g[0] === -1 ? [0, r] : g[1] === 1 ? [r, n - 1] : [r, 0];
    const there: Cell = g[0] === 1 ? [0, r] : g[0] === -1 ? [n - 1, r] : g[1] === 1 ? [r, 0] : [r, n - 1];
    const out = roadPath(flat(n), doorOf(ws), there);
    const inn = roadPath(s, here, doorOf(depot));
    if (!out || !inn) continue;
    const cells: Cell[] = [...out.map(([i, j]) => [i + g[0] * n, j + g[1] * n] as Cell), ...inn];
    if (!best || cells.length < best.cells.length) best = { cells, at: out.length };
  }
  memo.set(key, best);
  return best;
}

/** 町の名前（表示用） */
export const townName = (id: string) => sectorDef(id).name;
