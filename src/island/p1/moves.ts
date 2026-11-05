/**
 * 販売の手（段 UI1。DOM なし）：SCM の打ち手ごとの見込み（model.ts の sellWhatIf）と、スキルツリーにしか書いていない販売の手
 * （VMD・ゴールデンゾーン・名物店主）・いちばん効く宣伝を、**毎月の費用を引いた利益の見込み**（粗利 − 毎月の費用）の大きい順に並べる。
 * 店員の提案（card.ts）・物流部長の提案（deleg.ts）・SCM の「④ 販売の内訳」の大きいボタン（scm.ts）・月次報告の「担当者からの提案」（report.ts。段 UI5a で「いちばん効く手」から言い換え）が同じ順を使う。
 * 見込みの計算はいまの手のまま（sellNow を状態の写しに当てる）。効き目・値段は変えない。
 */
import { t } from '../../i18n';
import { DEF } from '../defs';
import { ADS, INVEST, P1B, PRODUCT, SHOP, SKILL, isResearch, rpCost, sku, skuParts, type Rar, type Sku } from './data';
import { DAYS, adBoostAt, adCost, adPick, adWide, allowedDirs, batchOf, canBuild, craftCheck, has, hasRoute, investCost, myShops, recipeOf, sellNow, sellWhatIf, skillLock, type P1State, type WhatIf, type WhatIfKind } from './model';
import type { Mat } from './data';

/** 販売の手で打つもの（deleg.ts の PropAct の一部と同じ形。execute がそのまま打つ） */
export type SellAct =
  | { k: 'stock'; uid: number; key: string; rar: Rar; idx: number; add: boolean; make?: number }
  | { k: 'build'; id: string; i: number; j: number; dir: 'rd' | 'ld' | 'lu' | 'ru' }
  | { k: 'skill'; id: string }
  | { k: 'invest'; id: string; uid: number }
  | { k: 'part'; uid: number }
  | { k: 'famous'; uid: number }
  | { k: 'ad'; id: string };
export type SellMoveKind = Exclude<WhatIfKind, 'known'> | 'vmd' | 'golden' | 'famous' | 'ad';
export interface SellMove {
  kind: SellMoveKind;
  /** 打つ手（無ければ画面へ案内するだけ） */
  act: SellAct | null;
  /** 販売の数字の増え方（個／月） */
  units: number;
  /** 粗利の増え方（G／月。宣伝は期間の粗利 − 費用） */
  gross: number;
  /** 毎月かかる費用（維持費・アルバイト代） */
  monthly: number;
  /** 毎月の費用を引いた利益の見込み（G／月。並べる順） */
  net: number;
  /** 1 回の費用（G）・研究ポイント */
  cost: number;
  rp?: number;
  /** 並べる商品・お店・建てる区画 */
  key?: string;
  uid?: number;
  at?: [number, number];
  /** もとの打ち手（SCM の画面の名前・行き先） */
  w?: WhatIf;
  /** 入れ替えで外す商品 */
  replace?: Sku | null;
}

/** 売上のうち粗利の割合（先月の報告。無ければ 0.8） */
export function grossRate(s: P1State): number {
  const last = s.reports[s.reports.length - 1];
  return last && last.revenue > 0 ? Math.max(0.3, 1 - (last.costs.materials ?? 0) / last.revenue) : 0.8;
}
/** 宣伝の見込み：宣伝のある日の売上の伸び（粗利）× 日数 − 費用（G）。段 M1：ランド・全店の宣伝は、任せている町の売上の伸び（粗利）も足す */
export function adGain(s: P1State, id: string): number {
  const ad = ADS.find((a) => a.id === id);
  if (!ad || !myShops(s).length) return 0;
  const base = sellNow(s).yen;
  const on = sellNow({ ...s, ads: { ...s.ads, [id]: ad.days } }).yen;
  return Math.round((on - base) * (ad.days / DAYS) * grossRate(s) + adRemoteGain(s, id) - adCost(s, id));
}
/** 段 M1：ランド・全店の宣伝が、任せている町の売上（マネージャーの売上の倍率）に足すぶんの粗利（期間ぶん。費用は引かない） */
export function adRemoteGain(s: P1State, id: string): number {
  const ad = ADS.find((a) => a.id === id);
  if (!ad || !adWide(ad) || !s.land) return 0;
  const here = s.sector ?? 'c1';
  const on: P1State = { ...s, ads: { ...s.ads, [id]: ad.days }, adFrom: { ...s.adFrom, [id]: here } };
  let g = 0;
  for (const rid of s.land.mine) {
    if (rid === here) continue;
    const b = s.land.recs[rid]?.base;
    if (!b) continue;
    const d = adBoostAt(on, rid) - adBoostAt(s, rid);
    if (d <= 0) continue;
    g += b.rev * d * (1 - Math.min(0.7, Math.max(0, b.matRate))) * (ad.days / DAYS);
  }
  return Math.round(g);
}
/** 2 軒目のお店の毎月の費用：維持費 ＋ アルバイト 1 人（店員は月給がかかるので、別に置く） */
export const shopMonthly = (id = 'general_store') => (P1B[id]?.upkeep ?? 0) + SHOP.partTimeWage * DAYS;
/** アルバイト 1 人の毎月の費用 */
export const partMonthly = () => SHOP.partTimeWage * DAYS;

/** そのパネルをいま取れるか（資金・研究ポイントだけが足りないものも） */
const canTake = (s: P1State, id: string) => {
  const k = SKILL[id];
  if (!k || has(s, id)) return false;
  const e = skillLock(s, k);
  return e === null || e === 'money' || e === 'rp';
};
/** パネルの値段（お金・研究ポイント） */
const priceOfSkill = (id: string): { cost: number; rp?: number } => {
  const k = SKILL[id];
  return isResearch(k) ? { cost: 0, rp: rpCost(k) } : { cost: k.cost };
};
/** 商品の key → いまの町で並べる品（Uncommon からの町で開発済みならアンコモン） */
const rarOf = (s: P1State, key: string): Rar => ((s.tier ?? 'C') !== 'C' && s.dev.includes(key) ? 'U' : 'C');

/**
 * 棚に並べる商品の作り手：もう作っている（または在庫が 2 ロット以上ある）なら ok。作っていなければ、作業台を 1 台その商品に替える
 * （職人が作れて素材のルートがあり、替える台の商品は別の台でも作っているか、工房に 3 ロット以上たまっているもの）。
 * 作り手がいないまま並べると棚が空のまま満足度が下がるので、そのときは打てる手にしない
 */
export function supplyFor(s: P1State, x: Sku): { ok: boolean; make?: number } {
  const key = skuParts(x)[0];
  const made = (k: string) => s.slots.filter((sl) => sl.sku && skuParts(sl.sku)[0] === k).length + Object.values(s.deleg?.pend ?? {}).filter((y) => skuParts(y)[0] === k).length;
  if (made(key) > 0) return { ok: true };
  const have = (s.stock[x] ?? 0) + Object.values(s.shops).reduce((a, sh) => a + (sh.storage[x] ?? 0), 0);
  if (have >= batchOf(x, s) * 2) return { ok: true };
  const canMat = Object.entries(recipeOf(x)).every(([m, q]) => hasRoute(s, m as Mat) || (s.mats[m as Mat] ?? 0) >= (q ?? 0) * 3);
  if (!canMat) return { ok: false };
  let best: { k: number; score: number } | null = null;
  s.slots.forEach((sl, k) => {
    if (sl.worker == null) return;
    const e = craftCheck(s, x, sl.worker);
    if (e && e !== 'mats' && e !== 'full') return;
    const cur = sl.sku;
    const spare = !cur ? 100 : made(skuParts(cur)[0]) > 1 ? 50 : (s.stock[cur] ?? 0) >= batchOf(cur, s) * 3 ? (s.stock[cur] ?? 0) : -1;
    if (spare < 0) return;
    if (!best || spare > best.score) best = { k, score: spare };
  });
  return best ? { ok: true, make: (best as { k: number }).k } : { ok: false };
}

/**
 * 販売の手（毎月の費用を引いた利益の見込みの大きい順）。純粋関数（s は書き換えない）。
 * お店が無い・売り場に人がいないときは空
 */
export function sellMoves(s: P1State): SellMove[] {
  const shops = myShops(s);
  if (!shops.length) return [];
  const ws = sellWhatIf(s);
  if (!ws.length) return [];
  const gr = grossRate(s);
  const base = sellNow(s);
  const out: SellMove[] = [];
  const push = (m: Omit<SellMove, 'net'>) => out.push({ ...m, net: Math.round(m.gross - m.monthly) });
  for (const w of ws) {
    const gross = Math.round(w.yen * gr);
    switch (w.kind) {
      case 'goods': {
        const sh = w.uid != null ? s.shops[w.uid] : undefined;
        if (!sh || !w.key) break;
        const idx = w.replace ? sh.shelves.indexOf(w.replace) : sh.shelves.findIndex((y) => !y);
        if (idx < 0) break;
        const sup = supplyFor(s, sku(w.key, rarOf(s, w.key)));
        push({ kind: 'goods', act: sup.ok ? { k: 'stock', uid: w.uid!, key: w.key, rar: rarOf(s, w.key), idx, add: false, ...(sup.make != null ? { make: sup.make } : {}) } : null, units: w.units, gross, monthly: 0, cost: 0, key: w.key, uid: w.uid, w, replace: w.replace ?? null });
        break;
      }
      case 'shelf':
        if (w.uid == null || !w.key) break;
        const sup = supplyFor(s, sku(w.key, rarOf(s, w.key)));
        push({ kind: 'shelf', act: sup.ok ? { k: 'stock', uid: w.uid, key: w.key, rar: rarOf(s, w.key), idx: -1, add: true, ...(sup.make != null ? { make: sup.make } : {}) } : null, units: w.units, gross, monthly: 0, cost: w.cost ?? 0, key: w.key, uid: w.uid, w });
        break;
      case 'shop': {
        const id = 'general_store';
        const at = w.at;
        const dir = at ? allowedDirs(s, id, at[0], at[1])[0] : undefined;
        const ok = canBuild(s, id);
        push({ kind: 'shop', act: at && dir && (ok === null || ok === 'money') ? { k: 'build', id, i: at[0], j: at[1], dir } : null, units: w.units, gross, monthly: shopMonthly(id), cost: P1B[id].cost, at, w });
        break;
      }
      case 'pull': {
        // 売り場の強さ +15%：接客の研修（取れるとき）。取ってあれば、いちばん強いお店の看板（設備投資）は別の手なので、ここは画面へ
        const host = canTake(s, 'host');
        push({ kind: 'pull', act: host ? { k: 'skill', id: 'host' } : null, units: w.units, gross, monthly: 0, ...(host ? priceOfSkill('host') : { cost: 0 }), w });
        break;
      }
      case 'part':
        if (w.uid == null) break;
        push({ kind: 'part', act: { k: 'part', uid: w.uid }, units: w.units, gross, monthly: partMonthly(), cost: 0, uid: w.uid, w });
        break;
      case 'fixtures': {
        const b = w.uid != null ? s.buildings.find((x) => x.uid === w.uid) : undefined;
        const cost = b ? investCost(b, 'fixtures') : null;
        if (w.uid == null || cost == null) break;
        push({ kind: 'fixtures', act: { k: 'invest', id: 'fixtures', uid: w.uid }, units: w.units, gross, monthly: 0, cost, uid: w.uid, w });
        break;
      }
      default:
        // known（認知を 100% に）は宣伝の手（下の ad）で見込む
        break;
    }
  }
  // スキルツリーにしか書いていない販売の手：VMD（棚 2 つ以上のお店）・ゴールデンゾーン（1 番目の棚）・名物店主（1 軒）
  const served = shops.filter((b) => s.shops[b.uid]?.shelves.some((x) => x) && (s.shops[b.uid].staff != null || s.shops[b.uid].part > 0));
  if (served.length) {
    for (const id of ['vmd', 'golden'] as const) {
      if (!canTake(s, id)) continue;
      const after = sellNow({ ...s, skills: [...s.skills, id] });
      const units = after.units - base.units;
      if (units <= 0.05) continue;
      push({ kind: id, act: { k: 'skill', id }, units, gross: Math.round((after.yen - base.yen) * gr), monthly: 0, ...priceOfSkill(id) });
    }
    // 名物店主：取っていなければ取って、いちばん売れるお店に。取ってあって選んでいなければ選ぶだけ
    if (canTake(s, 'd_shop') || (has(s, 'd_shop') && s.dustShop == null)) {
      let best: { uid: number; units: number; yen: number } | null = null;
      for (const b of served) {
        const after = sellNow({ ...s, skills: has(s, 'd_shop') ? s.skills : [...s.skills, 'd_shop'], dustShop: b.uid });
        if (!best || after.units > best.units) best = { uid: b.uid, units: after.units, yen: after.yen };
      }
      if (best && best.units - base.units > 0.05)
        push({ kind: 'famous', act: { k: 'famous', uid: best.uid }, units: best.units - base.units, gross: Math.round((best.yen - base.yen) * gr), monthly: 0, uid: best.uid, ...(has(s, 'd_shop') ? { cost: 0 } : priceOfSkill('d_shop')) });
    }
  }
  // 宣伝：いま出ていないもののうち、見込み（期間の粗利 − 費用）がいちばん大きいもの
  const ad = ADS.filter((a) => adPick(s, a))
    .map((a) => ({ a, g: adGain(s, a.id) }))
    .sort((x, y) => y.g - x.g)[0];
  if (ad) {
    const on = sellNow({ ...s, ads: { ...s.ads, [ad.a.id]: ad.a.days } });
    out.push({ kind: 'ad', act: { k: 'ad', id: ad.a.id }, units: on.units - base.units, gross: ad.g + adCost(s, ad.a.id), monthly: 0, net: ad.g, cost: adCost(s, ad.a.id), key: ad.a.id });
  }
  return out.sort((a, b) => b.net - a.net || b.units - a.units);
}
/** いちばん見込みの大きい販売の手（毎月の費用を引いた利益がプラスで、打てるもの。無ければ打てるものの先頭） */
export function bestSell(s: P1State, list = sellMoves(s)): SellMove | null {
  return list.find((m) => m.net > 0 && m.units > 0.5) ?? null;
}
/** 品の名前（商品の key か Sku） */
export const goodsName = (key: string) => PRODUCT[skuParts(key as Sku)[0]]?.name ?? PRODUCT[key]?.name ?? key;
/** 並べる品（key と rar から Sku） */
export const skuOfAct = (a: { key: string; rar: Rar }) => sku(a.key, a.rar);
/** 棚の設備投資の名前 */
export const shelfName = () => INVEST.shelves?.name ?? 'shelves';

/** 棚に並べる手を打つ前の写し（打ったあと、何がどう変わったかを言うため） */
export interface StockPlan {
  shop: string;
  /** 並べる棚の番号（1 から。棚を増やすときは増えたあとの番号） */
  shelf: number;
  add: boolean;
  /** 作業台を替えるとき：台の番号（1 から）・いま作っているロットが終わってから替わる・前の商品 */
  bench?: number;
  later?: boolean;
  prev?: string | null;
}
export function stockPlan(s: P1State, a: Extract<SellAct, { k: 'stock' }>): StockPlan | null {
  const sh = s.shops[a.uid];
  const b = s.buildings.find((x) => x.uid === a.uid);
  if (!sh || !b) return null;
  const sl = a.make != null ? s.slots[a.make] : undefined;
  const x = sku(a.key, a.rar);
  return {
    shop: DEF[b.id]?.name ?? t('お店', 'shop'),
    shelf: a.add ? sh.shelves.length + 1 : a.idx + 1,
    add: a.add,
    ...(sl && sl.sku !== x ? { bench: (a.make ?? 0) + 1, later: !!sl.running, prev: sl.sku ? goodsName(sl.sku) : null } : {}),
  };
}
/** 棚に並べたあとの知らせ（トースト）：棚が増えた・どの棚にどの商品を並べた・作業台がどう替わるか */
export function stockMsg(p: StockPlan, key: string): string {
  const nm = goodsName(key);
  // 段 UI5a：何を売るかは製造が決める。棚は作っている商品に自動でそろう（できしだい並ぶ）
  const shelf = p.add
    ? t(`${p.shop}の棚を 1 段増やしました（${p.shelf} 段目に「${nm}」が並びます）`, `Added a shelf to ${p.shop} (${nm} goes on shelf ${p.shelf})`)
    : t(`${p.shop}の棚 ${p.shelf} 段目に「${nm}」が並びます`, `${nm} goes on shelf ${p.shelf} of ${p.shop}`);
  if (p.bench == null) return shelf;
  const bench = p.later
    ? t(`作業台 ${p.bench} は、いまのロットが終わったら「${nm}」に切り替わります`, `Bench ${p.bench} switches to ${nm} after the current lot`)
    : t(`作業台 ${p.bench} を「${nm}」に切り替えました`, `Switched bench ${p.bench} to ${nm}`);
  return `${shelf} / ${bench}`;
}
