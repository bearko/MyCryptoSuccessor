/**
 * 段 UI5c：在庫の売りさばき・いまの素材で作れるおすすめ・作る物の絞り込み・ランクアップの動線（DOM なし：heroui.ts・screens.ts・tile.ts・card.ts・テストが使う）。
 * - fromStock：手持ちの素材で作れる商品（作れる数・この町で売れる見込み・余った素材をどれだけ使うか・おすすめ順）
 * - sellNo：この町で売れない商品の理由（作る物の一覧の絞り込み「今のセクタで売れるもの」）
 * - rankUp：Common → Uncommon のランクアップ（いまの仕組み：魔法の釜のパネル・商品開発のお金と日数・製造の適性）に要るものと、できない理由
 * - clearInfo：倉庫の埋まり方と、売りさばく品（在庫品）の数・見込み
 * 段 UI5d：
 * - storeFix：倉庫が埋まりそうな月の「倉庫を強化する（推奨）」の手（強化・建てる・もう 1 棟・物流拠点）
 * - oneShelf：棚が 1 段のお店で売りさばきを選んだときの 3 択（主力を外す・主力を残す・棚を拡張する）の材料
 * 効き目・値段はいまの手のまま（model.ts の useUp・setClear・develop・sellEstimate）。仕様は docs/ISLAND_PHASE1.md「在庫の売りさばき（段 UI5c）」。
 */
import { t } from '../../i18n';
import { CLEAR, DEV, INVEST, isRelic, MATS, P1B, PRODUCT, PRODUCTS, SKILL, STORE, UNCOMMON, isResearch, rpCost, sku, skuParts, skuPrice, techSkill, type Mat, type Sku } from './data';
import { findLot } from './deleg';
import type { Plan, Step } from './plan';
import {
  allowedDirs,
  depotInfo,
  investCost,
  invLv,
  myDepots,
  myShops,
  myWarehouses,
  shelfCount,
  aptOf,
  batchOf,
  clearSkus,
  craftCheck,
  devCost,
  fullUse,
  goodsSales,
  has,
  lotsHave,
  openRelics,
  poolCap,
  poolRate,
  poolUsed,
  priceOf,
  recipeOf,
  relicSku,
  sellEstimate,
  staffOf,
  stockAll,
  tierOk,
  unsellableHere,
  type P1State,
  type PBuilding,
} from './model';

// ---------------------------------------------------------------- 作る物の候補

/** 作業台で作れる候補（Common・開発したアンコモン・開いた復刻品）。技・開発がまだのものも入る（理由はカードに） */
export function makeCands(s: P1State): Sku[] {
  const ps = PRODUCTS.filter((p) => tierOk(p, s.tier ?? 'C'));
  const out: Sku[] = ps.map((p) => sku(p.key, 'C'));
  out.push(...ps.filter((p) => s.dev.includes(p.key)).map((p) => sku(p.key, 'U')));
  out.push(...openRelics(s).map((p) => relicSku(p.key)));
  return out;
}

/** 作る物の一覧の絞り込み「今のセクタで売れるもの」：売れない理由（売れるなら null） */
export function sellNo(s: P1State, x: Sku): string | null {
  const [k] = skuParts(x);
  if (unsellableHere(s, k)) return t('この町では売れない（別のランクの町で売れる復刻品）', 'Won’t sell in this town (a revival for another rank)');
  if ((s.demand[k] ?? 0) <= 0) return t('この町には需要がない', 'No demand in this town');
  return null;
}
/** 絞り込み（on：売れるものだけ） */
export const sellFilter = (s: P1State, xs: Sku[], on: boolean) => (on ? xs.filter((x) => !sellNo(s, x)) : xs);

// ---------------------------------------------------------------- いまの素材で作れる

export interface StockPick {
  x: Sku;
  /** 手持ちの素材で作れる数（個）・ロット */
  units: number;
  lots: number;
  /** この町で月に売れる見込み（個。自社のお店に並べたときの取り合いの計算 sellEstimate） */
  sell: number;
  /** 使う素材のうち、余っている素材（いま作り続けている商品のひと月ぶんを超える分）の数と割合 */
  spare: number;
  spareRate: number;
  /** 売れる見込みの売上（作れる数と、2 か月で売れる数の小さいほう × 値段） */
  yen: number;
  /** 売れない理由（売れるなら null） */
  no: string | null;
  /** おすすめ（いちばん上） */
  rec?: boolean;
}
/** 余っている素材（手元の素材のうち、いま作っている商品のひと月ぶんを超える分） */
export function spareMats(s: P1State): Partial<Record<Mat, number>> {
  const use = fullUse(s);
  const out: Partial<Record<Mat, number>> = {};
  for (const [m, n] of Object.entries(s.mats) as [Mat, number][]) {
    const v = Math.max(0, Math.floor((n ?? 0) - (use[m] ?? 0)));
    if (v > 0) out[m] = v;
  }
  return out;
}
/** 作れない理由が「素材・置き場所」以外にあるか（技・開発・職人の適性・レシピ） */
const blocked = (e: string | null) => !!e && e !== 'mats' && e !== 'full';

/**
 * いまの素材で作れる商品（作業台の職人 worker で作れるもの）。おすすめ順：
 * 売れるものが先、そのなかで「売れる見込みの売上 ×（余った素材を使う割合で 0.5〜1 倍）」の大きい順。いちばん上に rec
 */
export function fromStock(s: P1State, worker: number | null, filter = true): StockPick[] {
  const spare = spareMats(s);
  const out: StockPick[] = [];
  for (const x of makeCands(s)) {
    const lots = lotsHave(s, x);
    if (lots <= 0 || blocked(craftCheck(s, x, worker))) continue;
    const no = sellNo(s, x);
    if (filter && no) continue;
    const [k, r] = skuParts(x);
    const units = lots * batchOf(x, s);
    const sell = no ? 0 : sellEstimate(s, k, r);
    let use = 0;
    let sp = 0;
    for (const [m, q] of Object.entries(recipeOf(x)) as [Mat, number][]) {
      const need = (q ?? 0) * lots;
      use += need;
      sp += Math.min(need, spare[m] ?? 0);
    }
    const yen = Math.round(Math.min(units, sell * 2) * priceOf(s, x));
    out.push({ x, units, lots, sell, spare: sp, spareRate: use > 0 ? sp / use : 0, yen, no });
  }
  const score = (p: StockPick) => p.yen * (0.5 + 0.5 * p.spareRate);
  out.sort((a, b) => Number(!!a.no) - Number(!!b.no) || score(b) - score(a) || b.units - a.units);
  if (out[0] && !out[0].no && out[0].yen > 0) out[0].rec = true;
  return out;
}

// ---------------------------------------------------------------- ランクアップ（Common → Uncommon）

export interface RankNeed {
  label: string;
  ok: boolean;
  /** いまの値（「所持 1,200 G」「作業台 1：E 45」） */
  now?: string;
}
export interface RankUp {
  key: string;
  from: Sku;
  to: Sku;
  /** 'dev'：開発すれば作れる・'make'：開発済み（アンコモンを作る）・'busy'：ほかの商品を開発中 */
  stage: 'dev' | 'make' | 'busy';
  needs: RankNeed[];
  /** できない理由（1 行。できるなら null） */
  why: string | null;
  /** いちばん先にやること（魔法の釜のパネル・開発・アンコモンを作る） */
  next: 'pot' | 'dev' | 'make' | 'wait' | 'money' | 'skill';
  cost: number;
  days: number;
}
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
/**
 * その商品のランクアップ（いまの仕組み：スキルツリーの「魔法の釜」→ 商品開発（お金・日数・1 つずつ）→ 製造の適性 UNCOMMON.minCraft 以上の職人で作る）。
 * 復刻品・アンコモン・チュートリアルのあいだは null
 */
export function rankUp(s: P1State, x: Sku, worker: number | null): RankUp | null {
  const [k, r] = skuParts(x);
  const p = PRODUCT[k];
  if (!p || r !== 'C' || isRelic(k) || !p.ext.U || !p.recipe.U) return null;
  if (typeof s.tut === 'number' && s.tut < 99) return null;
  const to = sku(k, 'U');
  const pot = has(s, 'pot');
  const dev = s.dev.includes(k);
  const cost = devCost(k);
  const st = worker != null ? staffOf(s, worker) : null;
  const apt = st ? Math.round(aptOf(s, st, 'craft')) : 0;
  const best = Math.round(Math.max(0, ...s.staff.map((y) => aptOf(s, y, 'craft'))));
  const techOk = !p.tech || has(s, techSkill(p.tech));
  const kp = SKILL.pot;
  const potCost = kp ? (isResearch(kp) ? `${rpCost(kp)} RP` : g(kp.cost ?? 0)) : '';
  const needs: RankNeed[] = [];
  needs.push({ label: t(`パネル「${kp?.name ?? 'pot'}」（スキルツリー・${potCost}）`, `Panel “${kp?.name ?? 'pot'}” (skill tree, ${potCost})`), ok: pot, now: pot ? t('取得済み', 'Taken') : t('まだ', 'Not yet') });
  if (!techOk && p.tech) needs.push({ label: t(`技：${SKILL[techSkill(p.tech)]?.name ?? p.tech}`, `Skill: ${SKILL[techSkill(p.tech)]?.name ?? p.tech}`), ok: false, now: t('まだ', 'Not yet') });
  if (!dev) {
    needs.push({ label: t(`商品開発 ${g(cost)}`, `Development ${g(cost)}`), ok: s.money >= cost, now: t(`所持 ${g(s.money)}`, `Have ${g(s.money)}`) });
    needs.push({ label: t(`開発の日数 ${DEV.days} 日（1 つずつ）`, `${DEV.days} days (one at a time)`), ok: !s.lab, now: s.lab ? t(`${PRODUCT[s.lab.key]?.name ?? s.lab.key}を開発中（あと ${s.lab.left} 日）`, `Developing ${PRODUCT[s.lab.key]?.name ?? s.lab.key} (${s.lab.left} d)`) : t('空いている', 'Free') });
  }
  needs.push({ label: t(`職人の製造の適性 ${UNCOMMON.minCraft} 以上`, `Crafter aptitude ${UNCOMMON.minCraft}+`), ok: (st ? apt : best) >= UNCOMMON.minCraft, now: st ? t(`この作業台の職人 ${apt}`, `This bench ${apt}`) : t(`いちばん高い人 ${best}`, `Best ${best}`) });
  const mats = Object.entries(p.recipe.U) as [Mat, number][];
  const matOk = mats.every(([m, q]) => (s.mats[m] ?? 0) >= q);
  const lot = mats.map(([m, q]) => `${MATS[m].name}×${q}`).join(t('・', ', '));
  needs.push({ label: t(`素材（1 ロット）：${lot}`, `Materials (1 lot): ${lot}`), ok: matOk, now: mats.map(([m]) => `${MATS[m].name} ${s.mats[m] ?? 0}`).join(t('・', ', ')) });
  let next: RankUp['next'];
  let why: string | null = null;
  if (!pot) {
    next = 'pot';
    why = t(`スキルツリーの「${kp?.name ?? 'pot'}」が要る（${potCost}）`, `Needs “${kp?.name ?? 'pot'}” in the skill tree (${potCost})`);
  } else if (!dev && s.lab) {
    next = 'wait';
    why = t(`いま${PRODUCT[s.lab.key]?.name ?? s.lab.key}を開発中（あと ${s.lab.left} 日）`, `Already developing ${PRODUCT[s.lab.key]?.name ?? s.lab.key} (${s.lab.left} d)`);
  } else if (!dev && s.money < cost) {
    next = 'money';
    why = t(`開発の資金があと ${g(cost - s.money)} 足りない`, `${g(cost - s.money)} short for development`);
  } else if (!dev) next = 'dev';
  else if ((st ? apt : best) < UNCOMMON.minCraft) {
    next = 'skill';
    const who = st ? t(`この作業台 ${apt}`, `this bench ${apt}`) : t(`いちばん高い人 ${best}`, `best ${best}`);
    why = t(`製造の適性 ${UNCOMMON.minCraft} 以上の職人が要る（${who}）`, `Needs a crafter with aptitude ${UNCOMMON.minCraft}+ (${who})`);
  } else next = 'make';
  if (!techOk && !why) why = t('技がまだ（スキルツリー）', 'Skill not learned yet (skill tree)');
  return { key: k, from: x, to, stage: dev ? 'make' : s.lab ? 'busy' : 'dev', needs, why, next, cost: dev ? 0 : cost, days: dev ? 0 : DEV.days };
}
/** 一覧のカードに「⬆ ランクアップ」の印を出すか（技が要る商品は技を取ってから） */
export const rankable = (s: P1State, x: Sku) => {
  const r = rankUp(s, x, null);
  if (!r) return false;
  const p = PRODUCT[r.key];
  return !p.tech || has(s, techSkill(p.tech));
};
/** アンコモンの値段 */
export const upPrice = (x: Sku) => skuPrice(sku(skuParts(x)[0], 'U'));

// ---------------------------------------------------------------- 倉庫と在庫品

export interface ClearInfo {
  /** 倉庫の埋まり方（0〜1）・置いている数・置ける数・素材・運ぶ前の商品 */
  rate: number;
  used: number;
  cap: number;
  mats: number;
  goods: number;
  /** 売りさばく品（在庫品）と、その数（自社にある全部） */
  items: { x: Sku; n: number }[];
  total: number;
  /** 余っている素材の数 */
  spare: number;
}
export function clearInfo(s: P1State): ClearInfo {
  const items = clearSkus(s).map((x) => ({ x, n: stockAll(s, x) }));
  const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
  return {
    rate: poolRate(s),
    used: poolUsed(s),
    cap: poolCap(s),
    mats: sum(s.mats),
    goods: sum(s.stock),
    items,
    total: items.reduce((a, y) => a + y.n, 0),
    spare: sum(spareMats(s)),
  };
}
/** 倉庫が埋まりそう（CLEAR.warn を超えた） */
export const storeFull = (s: P1State) => poolRate(s) >= CLEAR.warn;
/** 値引きの段の名前（0：値引きなし） */
/**
 * 売りさばきの見込み：在庫品がひと月に売れていく数（売り場の取り合いの計算 goodsSales。持っている数まで）。
 * 製造・調達が止まっていても在庫品は売れるので、4 段の流れ（flowOf）では頭打ちにしない
 */
export function clearUnits(s: P1State, items = clearSkus(s)): number {
  const gs = goodsSales(s);
  return items.reduce((a, x) => a + Math.min(gs[x]?.units ?? 0, stockAll(s, x)), 0);
}
export const cutName = (k: number) => {
  const c = CLEAR.cuts[k] ?? 0;
  return c > 0 ? t(`${Math.round(c * 10)} 割引`, `${Math.round(c * 100)}% off`) : t('値引きなし', 'No discount');
};

// ---------------------------------------------------------------- 段 UI5d：倉庫を強化する（推奨）

/**
 * 倉庫が埋まりそうな月の「倉庫を強化する」の手。いちばん安く置き場所が増える手を 1 つ：
 * - rack：倉庫の強化（段のいちばん低い倉庫の次の段）
 * - dock：物流拠点の保管棚（倉庫を強化しきっていて、拠点があるとき）
 * - build：倉庫を建てる（倉庫が無い：more false／強化しきった：more true）・物流拠点を建てる（パネル「物流拠点」があり、拠点がまだ無いとき）
 * 建てている途中の倉庫・拠点があれば null（できあがるのを待つ）。建てる場所が無ければ null
 */
export type StoreFix =
  | { k: 'rack' | 'dock'; uid: number; lv: number; max: number; cost: number; room: number }
  | { k: 'build'; id: 'warehouse' | 'logistics'; lot: [number, number, 'rd' | 'ld' | 'lu' | 'ru']; cost: number; room: number; monthly: number; days: number; more: boolean };
export function storeFix(s: P1State): StoreFix | null {
  if (s.buildings.some((b) => b.owner === 'me' && b.left > 0 && (P1B[b.id]?.kind === 'warehouse' || P1B[b.id]?.kind === 'depot'))) return null;
  const up = (bs: PBuilding[], id: 'rack' | 'dock'): StoreFix | null => {
    const b = bs.filter((x) => investCost(x, id) != null).sort((p, q) => invLv(p, id) - invLv(q, id) || p.uid - q.uid)[0];
    if (!b) return null;
    return { k: id, uid: b.uid, lv: invLv(b, id) + 1, max: INVEST[id].cost.length, cost: investCost(b, id)!, room: id === 'rack' ? STORE.rack : STORE.dock };
  };
  const whs = myWarehouses(s);
  const r = up(whs, 'rack') ?? up(myDepots(s), 'dock');
  if (r) return r;
  // 物流拠点（パネルがあって、まだ拠点が無い・倉庫は強化しきっている）：遠いお店への便がいちばん縮む場所
  if (whs.length && has(s, 'hub') && !myDepots(s).length) {
    const lot = depotLot(s);
    if (lot) return { k: 'build', id: 'logistics', lot, cost: P1B.logistics.cost, room: STORE.depot, monthly: P1B.logistics.upkeep, days: P1B.logistics.days, more: false };
  }
  const lot = findLot(s, 'warehouse');
  if (!lot) return null;
  return { k: 'build', id: 'warehouse', lot, cost: P1B.warehouse.cost, room: STORE.warehouse, monthly: P1B.warehouse.upkeep, days: P1B.warehouse.days, more: whs.length > 0 };
}
/** 物流拠点を建てる場所：自社のお店への片道の日数がいちばん縮むところ（同じなら工房に近いところ）。建てられなければ null */
export function depotLot(s: P1State): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null {
  let best: [number, number, 'rd' | 'ld' | 'lu' | 'ru'] | null = null;
  let gain = -1;
  // 全部のマスを調べると重いので、お店のまわり（4 マス以内）だけ
  const near = new Set<number>();
  for (const b of myShops(s))
    for (let dj = -4; dj <= 4; dj++)
      for (let di = -4; di <= 4; di++) {
        const i = b.i + di;
        const j = b.j + dj;
        if (i >= 0 && j >= 0 && i < s.n && j < s.n) near.add(j * s.n + i);
      }
  for (const k of near) {
    const i = k % s.n;
    const j = Math.floor(k / s.n);
    const dirs = allowedDirs(s, 'logistics', i, j);
    if (!dirs.length) continue;
    const g = depotInfo(s, i, j, dirs[0]).reduce((a, x) => a + Math.max(0, x.before - x.after), 0);
    if (g > gain + 1e-6) {
      gain = g;
      best = [i, j, dirs[0]];
    }
  }
  return best ?? findLot(s, 'logistics');
}
/** その手の名前（「倉庫を強化する（2/3 段目）」など） */
export function fixName(f: StoreFix): string {
  if (f.k === 'rack') return t(`倉庫を強化する（${f.lv}/${f.max} 段目）`, `Upgrade the warehouse (level ${f.lv}/${f.max})`);
  if (f.k !== 'build') return t(`物流拠点の保管を強化する（${f.lv}/${f.max} 段目）`, `Upgrade hub storage (level ${f.lv}/${f.max})`);
  if (f.id === 'logistics') return t('物流拠点を建てる（倉庫の代わりにも）', 'Build a hub (it stores goods too)');
  return f.more ? t('倉庫をもう 1 棟建てる', 'Build one more warehouse') : t('倉庫を建てる', 'Build a warehouse');
}
/** 倉庫と物流拠点の数（1 つも無ければ 0） */
export const storeCount = (s: P1State) => myWarehouses(s).length + myDepots(s).length;

// ---------------------------------------------------------------- 段 UI5d：棚が 1 段のお店の売りさばき（3 択）

export interface OneShelf {
  uid: number;
  /** いまの主力商品（棚 0 番）。棚が空なら null */
  main: Sku | null;
  /** 棚の拡張（設備投資「棚を増やす」の次の段）の値段。もう増やせなければ null */
  cost: number | null;
  /** 足りないお金（0：足りる） */
  short: number;
}
/**
 * 売りさばき（在庫品を先に並べる）を選んだお店のうち、棚が 1 段で、主力商品が棚から外れてしまうお店。
 * 方針がもうオンのお店・在庫品が無いときは入れない
 */
export function oneShelf(s: P1State, uids: number[]): OneShelf[] {
  if (!clearSkus(s).length) return [];
  const out: OneShelf[] = [];
  let need = 0;
  for (const uid of uids) {
    const b = s.buildings.find((x) => x.uid === uid && x.owner === 'me');
    const sh = s.shops[uid];
    if (!b || !sh || sh.clear != null || shelfCount(s, b) > 1) continue;
    const main = sh.shelves[0] ?? null;
    if (!main) continue;
    const cost = investCost(b, 'shelves');
    need += cost ?? 0;
    out.push({ uid, main, cost, short: 0 });
  }
  for (const x of out) x.short = Math.max(0, need - s.money);
  return out;
}

/** 3 択の答え：drop＝主力を外して在庫品だけ・keep＝主力を残して売りさばかない・grow＝棚を拡張して両方（推奨） */
export type ShelfPick = 'drop' | 'keep' | 'grow';
/** その提案（変更の中身）で売りさばきをオンにするお店のうち、棚が 1 段のお店（3 択を出すお店） */
export function shelfGate(s: P1State, p: Plan): OneShelf[] {
  const uids = p.steps.filter((x): x is Extract<Step, { k: 'clear' }> => x.k === 'clear' && x.cut != null).map((x) => x.uid);
  const grown = new Set(p.steps.filter((x): x is Extract<Step, { k: 'shelf' }> => x.k === 'shelf').map((x) => x.uid));
  return oneShelf(s, uids.filter((u) => !grown.has(u)));
}
/**
 * 3 択の答えで提案を作り直す。drop：そのまま／keep：そのお店の売りさばきを外す（何も残らなければ null）／
 * grow：そのお店の売りさばきの前に「棚を 1 段増やす」（拡張と方針のオンを 1 回で）
 */
export function gatePlan(p: Plan, gate: OneShelf[], pick: ShelfPick): Plan | null {
  if (pick === 'drop' || !gate.length) return p;
  const uids = new Set(gate.map((x) => x.uid));
  const steps: Step[] = [];
  for (const st of p.steps) {
    const hit = st.k === 'clear' && uids.has(st.uid);
    if (hit && pick === 'keep') continue;
    if (hit && pick === 'grow') steps.push({ k: 'shelf', uid: st.uid });
    steps.push(st);
  }
  if (!steps.length) return null;
  const acts = pick === 'keep' && steps.every((x) => x.k !== 'clear') ? p.acts.filter((a) => a.k !== 'clear') : p.acts;
  return { ...p, acts, steps };
}
/** 3 択の「棚を拡張する」を押せないとき（もう増やせない・お金が足りない）の 1 行。押せるなら null */
export function growBlock(gate: OneShelf[], money: number): string | null {
  if (gate.some((x) => x.cost == null)) return t('棚はもう増やせません', 'No more shelves can be added');
  const need = gate.reduce((a, x) => a + (x.cost ?? 0), 0);
  if (money < need) return t(`資金があと ${g(need - money)} 足りません（棚の拡張 ${g(need)}）`, `${g(need - money)} short (extra shelf ${g(need)})`);
  return null;
}
