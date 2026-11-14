/**
 * SCM「販売管理」：自社のお店を一覧（カード 1 行ずつ）で見比べ、その場で店員・棚・アルバイトを変える。
 * 上に一括の操作（全店の主力商品・空き棚を埋める・店員のいないお店に待機中のヒーロー）。
 * 一覧のデータ（salesRows）と一括の操作は純粋な関数にして、vitest で確かめる。
 * docs/ISLAND_PHASE1.md「販売管理」。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { aptitude, SALES1_UI, type Sku } from './data';
import { DAYS, assign, myShops, partMax, setShelf, shopArea, shopEstimates, shopSplit, staffOf, type P1State, type PBuilding, type Staff } from './model';
import { type Ctx } from './screens';
import { uxb } from '../uix/screens/b-slots';

/** 詰まりの札：商品未定・品切れ・休業中（売り場に人がいない）・店員なし（アルバイトだけ） */
export type SalesTag = 'unset' | 'out' | 'closed' | 'noclerk';
export const SALES_TAG: Record<SalesTag, string> = {
  unset: t('商品未定', 'No product'),
  out: t('品切れ', 'Sold out'),
  closed: t('休業中', 'Closed'),
  noclerk: t('店員なし', 'No clerk'),
};

export interface SalesRow {
  b: PBuilding;
  uid: number;
  /** お店の名前（建物名） */
  name: string;
  /** 商圏の家の数 */
  homes: number;
  staff: Staff | null;
  /** 店員の販売の適性 */
  apt: number;
  part: number;
  partMax: number;
  shelves: (Sku | null)[];
  /** 今月の売上 */
  rev: number;
  /** 売れる見込み／月（個） */
  est: number;
  /** 認知度（0〜1） */
  aw: number;
  tags: SalesTag[];
}
export type SalesSort = 'rev' | 'est' | 'aw';
export const SALES_SORT: Record<SalesSort, string> = { rev: t('売上順', 'By sales'), est: t('見込み順', 'By forecast'), aw: t('認知順', 'By awareness') };

/** お店ごとの詰まりの札 */
export function salesTags(s: P1State, uid: number): SalesTag[] {
  const sh = s.shops[uid];
  if (!sh) return [];
  const tags: SalesTag[] = [];
  const set = sh.shelves.filter((x): x is Sku => !!x);
  if (!set.length) tags.push('unset');
  else if (set.some((x) => (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0)) tags.push('out');
  if (sh.staff == null && sh.part === 0) tags.push('closed');
  else if (sh.staff == null) tags.push('noclerk');
  return tags;
}

/** 販売管理の一覧（純粋関数）。sort：売上順／見込み順／認知順（同じなら商圏の家の多い順） */
export function salesRows(s: P1State, sort: SalesSort = 'rev'): SalesRow[] {
  const est = shopEstimates(s);
  const rows = myShops(s)
    .filter((b) => !!s.shops[b.uid])
    .map((b): SalesRow => {
      const sh = s.shops[b.uid];
      const st = sh.staff != null ? staffOf(s, sh.staff) : null;
      return {
        b,
        uid: b.uid,
        name: DEF[b.id].name,
        homes: shopArea(s, b).homes,
        staff: st,
        apt: st ? Math.round(aptitude(st.stats, 'shop')) : 0,
        part: sh.part,
        partMax: partMax(s, b.uid),
        shelves: [...sh.shelves],
        rev: sh.rev,
        est: est[b.uid] ?? 0,
        aw: sh.aw ?? 1,
        tags: salesTags(s, b.uid),
      };
    });
  const key = (r: SalesRow) => (sort === 'rev' ? r.rev : sort === 'est' ? r.est : r.aw);
  return rows.sort((a, b) => key(b) - key(a) || b.homes - a.homes || a.uid - b.uid);
}

// ---------------------------------------------------------------- 段 SALES1：お店ごとの 1 日の数（売れた・自店に取られた・逃した）

export interface ShopBar {
  uid: number;
  name: string;
  /** 1 日あたり：売れた数（今月。5 日に満たなければ先月・無ければ見込み）・自社のほかのお店に取られた数（見込みの割合 × 売れた数）・棚が空で逃した数 */
  sold: number;
  lost: number;
  miss: number;
  /** 取り合いの割合（取られた ÷（売れた ＋ 取られた））と、印を付けるか（SALES1_UI.hot 以上） */
  share: number;
  hot: boolean;
  /** 数の出どころ：今月・先月・見込み */
  src: 'now' | 'last' | 'est';
}
/** 段 SALES1：販売管理の縦の積み上げ棒（純粋関数。棚に何か並べているお店だけ・左から建てた順） */
export function shopBars(s: P1State): ShopBar[] {
  const split = shopSplit(s);
  const out: ShopBar[] = [];
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh || !sh.shelves.some((x) => x)) continue;
    const v = split[b.uid] ?? { sold: 0, alone: 0, lost: 0 };
    const cur = sh.mu && sh.mu.days >= SALES1_UI.minDays ? sh.mu : null;
    const use = cur ?? (sh.muLast && sh.muLast.days > 0 ? sh.muLast : null);
    const sold = use ? use.sold / use.days : v.sold / DAYS;
    const miss = use ? use.miss / use.days : 0;
    const k = v.sold > 0 ? v.lost / v.sold : 0;
    const lost = sold * k;
    const share = sold + lost > 0 ? lost / (sold + lost) : 0;
    out.push({ uid: b.uid, name: DEF[b.id].name, sold, lost, miss, share, hot: share >= SALES1_UI.hot, src: cur ? 'now' : use ? 'last' : 'est' });
  }
  // 同じ建物のお店が 2 軒以上なら、建てた順に番号を付けて見分ける（よろず屋 1・よろず屋 2）
  const count: Record<string, number> = {};
  for (const x of out) count[x.name] = (count[x.name] ?? 0) + 1;
  const seen: Record<string, number> = {};
  for (const x of out) if (count[x.name] > 1) x.name = `${x.name} ${(seen[x.name] = (seen[x.name] ?? 0) + 1)}`;
  return out;
}

// ---------------------------------------------------------------- 一括の操作（純粋な操作。s を書き換えて、変えた数を返す）

/** 全店の主力商品（1 番目の棚）を x にする。替えたお店の数を返す（外した商品の棚の残りは裏へ：setShelf） */
export function setMainAll(s: P1State, x: Sku): number {
  let n = 0;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh || sh.shelves[0] === x) continue;
    if (setShelf(s, b.uid, 0, x)) n++;
  }
  return n;
}

/** 空き棚を全部 x で埋める。埋めた棚の数を返す */
export function fillEmptyShelves(s: P1State, x: Sku): number {
  let n = 0;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh) continue;
    sh.shelves.forEach((y, k) => {
      if (y) return;
      if (setShelf(s, b.uid, k, x)) n++;
    });
  }
  return n;
}

/** 空き棚の数 */
export const emptyShelfCount = (s: P1State) => myShops(s).reduce((a, b) => a + (s.shops[b.uid]?.shelves.filter((x) => !x).length ?? 0), 0);

/** 待機中（仕事なし・休憩中でない）のヒーロー */
export const freeHeroes = (s: P1State) => s.staff.filter((x) => x.task == null && !x.resting);

/**
 * 店員のいないお店に、いちばん向いている待機中のヒーローを置く。
 * 商圏の家の多いお店から順に、販売の適性が高い人を置く。置いた組を返す
 */
export function staffEmptyShops(s: P1State): { uid: number; hero: number }[] {
  const free = freeHeroes(s).sort((a, b) => aptitude(b.stats, 'shop') - aptitude(a.stats, 'shop'));
  const shops = myShops(s)
    .filter((b) => s.shops[b.uid] && s.shops[b.uid].staff == null)
    .sort((a, b) => shopArea(s, b).homes - shopArea(s, a).homes);
  const out: { uid: number; hero: number }[] = [];
  for (const b of shops) {
    const st = free.shift();
    if (!st) break;
    if (assign(s, st.hero, 'shop', b.uid) == null) out.push({ uid: b.uid, hero: st.hero });
  }
  return out;
}

export function openSales(ctx: Ctx) {
  // 段 UIX3b：新しい画面（uix/screens/biz.ts）
  return uxb.sales!(ctx);
}
