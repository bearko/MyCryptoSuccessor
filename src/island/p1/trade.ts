/**
 * 営業の部門（段 C）：商圏の取り合いの見せ方の数字（DOM なし。tradeui.ts・render.ts・自動プレイ・テストが使う）。
 * 計算の芯（店ごとの取り分・撤退・空き店舗）は model.ts の「商圏の取り合い」。docs/ISLAND_PHASE1.md「商圏の取り合い（Rare）」「営業の部門」。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { RARE_AREA, rivalDef, P1B, SALES_SKILLS } from './data';
import { allowedDirs, areaShares, has, isVacant, myShops, myShare, myStorePull, newStorePull, reachR, rivalStorePull, rivalStores, roadMul, storeRisk, vacantCost, type AreaStore, type P1State, type PBuilding } from './model';
import type { Dir } from '../sim';

/** 支店の名前（1 軒目は本店。ほかは駅・公園の近くか、町の方角で） */
export function branchName(s: P1State, b: PBuilding, first: boolean): string {
  if (first) return t('本店', 'Main store');
  const near = (id: string) => {
    const x = s.buildings.find((y) => y.owner === 'town' && y.id === id);
    return x ? Math.abs(x.i - b.i) + Math.abs(x.j - b.j) : 99;
  };
  if (near('station') <= 4) return t('駅前店', 'Station store');
  if (near('park') <= 4) return t('公園通り店', 'Park Ave store');
  const h = s.n / 2;
  const ns = b.j < h ? t('北', 'North') : t('南', 'South');
  const ew = b.i < h ? t('西', 'West') : t('東', 'East');
  return Math.abs(b.j - h) > Math.abs(b.i - h) ? t(`${ns}町店`, `${ns} store`) : t(`${ew}町店`, `${ew} store`);
}
/** 他社の店の名前「緑門商会 駅前店」（その会社の店のうち uid のいちばん小さい店が本店） */
export function storeName(s: P1State, uid: number, rid?: string): string {
  const b = s.buildings.find((x) => x.uid === uid);
  const id = rid ?? b?.owner ?? '';
  const company = rivalDef(id)?.name ?? id;
  if (!b) return company;
  const mine = s.buildings.filter((x) => x.owner === id).map((x) => x.uid);
  const was = s.area?.stores.filter((x) => x.rid === id).map((x) => x.uid) ?? [];
  const all = [...new Set([...mine, ...was, uid])].sort((x, y) => x - y);
  const nameOf = (u: number) => {
    const x = s.buildings.find((y) => y.uid === u);
    return x ? branchName(s, x, u === all[0]) : '';
  };
  const base = nameOf(uid);
  // 同じ会社に同じ支店名が 2 軒以上あれば「南町店 2」
  const same = all.filter((u) => nameOf(u) === base);
  const k = same.indexOf(uid);
  const label = same.length > 1 && k > 0 ? `${base} ${k + 1}` : base;
  return `${company} ${label}`;
}

/** 他社の店の一覧の 1 行（営業の画面） */
export interface StoreRow {
  uid: number;
  rid: string;
  name: string;
  /** いまの取り分（町のお客さんのうち。0〜1）・開店のとき・いま ÷ 開店のとき */
  share: number;
  share0: number;
  ratio: number;
  /** 撤退の危険（0〜1）・取り分が半分を切った月の続き */
  risk: number;
  weak: number;
  below: boolean;
}
/** 他社の店の一覧（撤退の危険の大きい順 → 取り分の小さい順） */
export function storeRows(s: P1State): StoreRow[] {
  const a = s.area;
  if (!a) return [];
  return a.stores
    .map((x: AreaStore): StoreRow => {
      const r = storeRisk(x);
      return { uid: x.uid, rid: x.rid, name: storeName(s, x.uid, x.rid), share: x.share, share0: x.share0, ratio: r.ratio, risk: r.risk, weak: x.weak, below: r.below };
    })
    .sort((p, q) => q.risk - p.risk || p.ratio - q.ratio);
}

/** 会社ごとの取り分（自社 'me' と他社。円グラフ・一覧の上の帯） */
export function companyShares(s: P1State): { id: string; name: string; share: number; stores: number }[] {
  const a = s.area;
  if (!a) return [];
  const out = [{ id: 'me', name: t('あなたの会社', 'Your company'), share: myShare(s), stores: myShops(s).length }];
  for (const r of s.rivals) {
    if (r.gone) continue;
    const st = a.stores.filter((x) => x.rid === r.id);
    out.push({ id: r.id, name: rivalDef(r.id)?.name ?? r.id, share: st.reduce((v, x) => v + x.share, 0), stores: st.length });
  }
  return out;
}

/** 出店の候補地 1 つ：場所（空き店舗なら uid）・この店の取り分の見込み・自社の取り分の増え（自社の店どうしの取り合いを引いた） */
export interface Candidate {
  i: number;
  j: number;
  dir: Dir;
  vacant: number | null;
  /** この店の取り分の見込み */
  own: number;
  /** 自社の取り分の合計の増え */
  gain: number;
  cost: number;
}
/**
 * 出店の候補地（上位 n）：空き地（道路に面した、よろず屋の置ける所）と空き店舗のうち、新しい店で自社の取り分の合計がいちばん増える所。
 * 近すぎる候補は 1 つにまとめる（2 マス以内）
 */
export function siteCandidates(s: P1State, n = 3, kind = 'general_store'): Candidate[] {
  if (!s.area) return [];
  const w = newStorePull(s);
  const base = areaShares(s).me;
  const all: Candidate[] = [];
  for (const b of s.buildings)
    if (isVacant(b)) {
      const sh = areaShares(s, [{ i: b.i, j: b.j, w }]);
      all.push({ i: b.i, j: b.j, dir: b.dir, vacant: b.uid, own: sh.extra[0], gain: sh.me - base, cost: vacantCost(s, kind) });
    }
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const dirs = allowedDirs(s, kind, i, j);
      if (!dirs.length) continue;
      const sh = areaShares(s, [{ i, j, w }]);
      all.push({ i, j, dir: dirs[0], vacant: null, own: sh.extra[0], gain: sh.me - base, cost: P1B[kind]?.cost ?? 0 });
    }
  // 空き店舗は工期が短く安いので、同じくらいなら先に
  all.sort((p, q) => q.gain + (q.vacant != null ? 0.004 : 0) - (p.gain + (p.vacant != null ? 0.004 : 0)));
  const out: Candidate[] = [];
  for (const c of all) {
    if (out.some((x) => Math.abs(x.i - c.i) + Math.abs(x.j - c.j) <= 2)) continue;
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** 立地調査（研究パネル）を取っていれば、候補地と下見に取り分の予測（％）を出す */
export const surveyed = (s: P1State) => has(s, 'sa_survey');

/**
 * 地図の商圏の塗り分け：マスごとに、そのマスに住むお客さんがいちばん行きやすい会社（'me' か他社の id）と、その会社の取り分（0〜1）。
 * 道路と空き地も塗る（町の広がりが見えるように）。地図の外は null
 */
export function areaPaint(s: P1State): ({ g: string; v: number } | null)[] {
  const out: ({ g: string; v: number } | null)[] = new Array(s.n * s.n).fill(null);
  if (!s.area) return out;
  const offers = [
    ...myShops(s).map((b) => ({ i: b.i, j: b.j, w: myStorePull(s, b), g: 'me' })),
    ...rivalStores(s).map((b) => ({ i: b.i, j: b.j, w: rivalStorePull(s, b.owner, b.uid), g: b.owner })),
  ].filter((o) => o.w > 0);
  const road = roadMul(s);
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const best: Record<string, number> = {};
      let sum = 0.3;
      for (const o of offers) {
        const d = Math.abs(o.i - i) + Math.abs(o.j - j);
        const v = o.w * reachR(o.g === 'me' ? d / road : d);
        best[o.g] = Math.max(best[o.g] ?? 0, v);
      }
      for (const v of Object.values(best)) sum += v;
      const top = Object.entries(best).sort((p, q) => q[1] - p[1])[0];
      if (top) out[j * s.n + i] = { g: top[0], v: top[1] / sum };
    }
  return out;
}

/** 会社ごとの色（自社は水色。他社は 4 色。地図の塗り分け・営業の画面の帯で同じ） */
export const AREA_COLORS = ['#f0565a', '#f2b544', '#b49bff', '#ff7fae'];
export const ME_COLOR = '#3fd6c4';
export function companyColor(s: P1State, g: string): string {
  if (g === 'me') return ME_COLOR;
  const k = s.rivals.findIndex((r) => r.id === g);
  return AREA_COLORS[(k < 0 ? 0 : k) % AREA_COLORS.length];
}

/** 営業のパネル（スキルツリーの営業の枝。営業の画面の下の近道） */
export const salesPanels = () => SALES_SKILLS;
/** 撤退の決まりの一文（営業の画面・ヘルプ） */
export const quitRule = () =>
  t(`取り分が開店のときの ${Math.round(RARE_AREA.quitAt * 100)}% を下回る月が ${RARE_AREA.quitMonths} か月続くと、その店は撤退して空き店舗になる（${RARE_AREA.refill} か月放っておくと、別の他社が入る）`, `A store below ${Math.round(RARE_AREA.quitAt * 100)}% of its opening share for ${RARE_AREA.quitMonths} months closes and leaves a vacant store (another rival moves in after ${RARE_AREA.refill} months)`);
/** 空き店舗の札の文 */
export const vacantLabel = () => t('空き店舗', 'Vacant');
/** 自社の店の名前（建物名） */
export const myStoreName = (b: PBuilding) => DEF[b.id]?.name ?? b.id;
