/**
 * 建物を押したときの「担当のヒーローへの指示」（段 UI3。DOM なし：tile.ts・テストが使う）。
 * 工房・お店・卸問屋を押すと、担当のヒーロー（職人・店長・調達係）の顔・名前・肩書きと、よく使う指示 2〜4 個を出す。
 * 指示には見込み（+N 個／月 など）を小さく添える。見込みの計算はいまの手のまま（sellNow・whatIf・adGain・supplyFor）。効き目・値段は変えない。
 * 押したあとの手はいまの関数（deleg.ts の execute・screens.ts の chooseMake・invest・order）。
 * 仕様は docs/ISLAND_PHASE1.md「画面の並び（UI3）」の「建物の吹き出しの指示」。
 */
import { t } from '../../i18n';
import { ADS, INVEST, MATS, P1B, PRODUCTS, SELF_RUN, SHOP, sku, skuParts, techSkill, type Mat, type Sku, unitsX } from './data';
import { madeSkus, partMax, recipeOf, adCost, adPick, bottleneck, stageCaps, type Stage, craftCheck, fullUse, has, hasRoute, investCost, invLv, leadDays, matPrice, myWorkshop, openRelics, procCap, procMats, relicSku, sellNow, tierOk, unsellableHere, whatIf, LOT, type P1State, type PBuilding } from './model';
import { adGain, supplyFor } from './moves';
import { toneOf, type Tone } from './persona';
import { inTutorial } from './card';
import { clearInfo, cutName, storeFull } from './stock';
import { DEF } from '../defs';
import { propsOpen } from './stage';
import { applyPlan, planCost, type Plan, type PlanRes } from './plan';


/** チュートリアル（タオックスの 1 か月目）のあいだ：指示の箱は出さない */
export const inTut = (s: Pick<P1State, 'tut'>) => inTutorial(s);

// ---------------------------------------------------------------- 作れる商品

/**
 * 作れる商品（Common と、開発したアンコモン）。技がまだの商品は、うしろに（カードに「技：○○が要る」）。
 * 最初のチュートリアルのあいだは、技が要る商品を出さない（基礎の 5 つだけ）。このセクタのランクで出ない商品も出さない
 */
export function craftable(s: P1State, tut = false): Sku[] {
  const ready = (key: string) => !PRODUCTS.find((p) => p.key === key)?.tech || has(s, techSkill(PRODUCTS.find((p) => p.key === key)!.tech!));
  const list = PRODUCTS.filter((p) => (!tut || !p.tech) && tierOk(p, s.tier ?? 'C'));
  const out: Sku[] = list.filter((p) => ready(p.key)).map((p) => sku(p.key, 'C'));
  out.push(...list.filter((p) => s.dev.includes(p.key) && ready(p.key)).map((p) => sku(p.key, 'U')));
  out.push(...list.filter((p) => !ready(p.key)).map((p) => sku(p.key, 'C')));
  if (!tut) out.push(...openRelics(s).map((p) => relicSku(p.key)));
  return out;
}

// ---------------------------------------------------------------- お店の見込み

const withShelves = (s: P1State, uid: number, shelves: (Sku | null)[], b?: PBuilding): P1State => ({
  ...s,
  shops: { ...s.shops, [uid]: { ...s.shops[uid], shelves } },
  ...(b ? { buildings: s.buildings.map((x) => (x.uid === uid ? b : x)) } : {}),
});
const shopB = (s: P1State, uid: number) => s.buildings.find((x) => x.uid === uid && x.owner === 'me');

/** お店 uid に x を並べたときの販売の増え方（個／月）：空き棚があればそこに、無ければ棚を 1 段増やして（設備投資の値段）。並べられなければ null */
export function shelfGain(s: P1State, uid: number, x: Sku): { units: number; cost: number; add: boolean } | null {
  const sh = s.shops[uid];
  const b = shopB(s, uid);
  if (!sh || !b) return null;
  const base = sellNow(s).units;
  const idx = sh.shelves.indexOf(null);
  if (idx >= 0) {
    const shelves = [...sh.shelves];
    shelves[idx] = x;
    return { units: sellNow(withShelves(s, uid, shelves)).units - base, cost: 0, add: false };
  }
  const cost = investCost(b, 'shelves');
  if (cost == null) return null;
  const nb: PBuilding = { ...b, inv: { ...b.inv, shelves: invLv(b, 'shelves') + 1 } };
  return { units: sellNow(withShelves(s, uid, [...sh.shelves, x], nb)).units - base, cost, add: true };
}
export interface ShelfPick {
  x: Sku;
  units: number;
  cost: number;
  add: boolean;
  /** 作業台を 1 台その商品に替える（作っていない商品）。ok が false なら作り手がいない */
  make?: number;
  /** 切り替えで止まる商品（ほかの台でも作っていない・たまっていない商品の台を替えるとき。プレイヤーの指示なので選べる） */
  stops?: Sku;
  ok: boolean;
}
/**
 * 作り手の候補（プレイヤーの指示のとき）：UI1 の supplyFor（ほかの台でも作っている・たまっている台だけ）で見つからなければ、
 * その商品を作れる職人の台を替える（いまの商品は止まる。カードに「○○は止まる」と出す）
 */
function makerFor(s: P1State, x: Sku): { ok: boolean; make?: number; stops?: Sku } {
  const sup = supplyFor(s, x);
  if (sup.ok) return sup;
  const canMat = Object.entries(recipeOf(x)).every(([m, q]) => hasRoute(s, m as Mat) || (s.mats[m as Mat] ?? 0) >= (q ?? 0) * 3);
  if (!canMat) return { ok: false };
  let best: { k: number; v: number } | null = null;
  s.slots.forEach((sl, k) => {
    if (sl.worker == null) return;
    const e = craftCheck(s, x, sl.worker);
    if (e && e !== 'mats' && e !== 'full') return;
    const v = sl.sku ? (s.stock[sl.sku] ?? 0) : 1e6;
    if (!best || v > best.v) best = { k, v };
  });
  if (!best) return { ok: false };
  const k = (best as { k: number }).k;
  const cur = s.slots[k].sku;
  return { ok: true, make: k, ...(cur && cur !== x ? { stops: cur } : {}) };
}
/** お店 uid に新しく並べられる商品（まだそのお店に無い・この町で売れる・技がある）を、増え方の大きい順に */
export function shelfPicks(s: P1State, uid: number): ShelfPick[] {
  const sh = s.shops[uid];
  if (!sh) return [];
  const on = new Set(sh.shelves.filter((y): y is Sku => !!y).map((y) => skuParts(y)[0]));
  const out: ShelfPick[] = [];
  // 同じ商品のアンコモンとコモンは、1 つだけ：いま作業台で作っているほう（棚に並べても作り手がいる）→ アンコモン（開発していれば）→ コモン。
  // 以前は craftable の並びの先頭（いつもコモン）を選んでいたので、アンコモンを作っている町で「並べたのに作り手がいない棚」になった
  const makes = (x: Sku) => s.slots.some((sl) => sl.sku === x) || Object.values(s.deleg?.pend ?? {}).includes(x);
  const all = craftable(s);
  const seen = new Set<string>();
  for (const x0 of all) {
    const key = skuParts(x0)[0];
    if (seen.has(key)) continue;
    const vars = all.filter((y) => skuParts(y)[0] === key);
    const pref = [...vars].sort((a, b) => Number(makes(b)) - Number(makes(a)) || Number(skuParts(b)[1] === 'U') - Number(skuParts(a)[1] === 'U'));
    const x = pref.find((y) => makerFor(s, y).ok) ?? pref[0];
    seen.add(key);
    if (on.has(key) || unsellableHere(s, key) || craftCheck(s, x, null) === 'tech') continue;
    const g = shelfGain(s, uid, x);
    if (!g) continue;
    const sup = makerFor(s, x);
    out.push({ x, ...g, ok: sup.ok, ...(sup.make != null ? { make: sup.make } : {}), ...(sup.stops ? { stops: sup.stops } : {}) });
  }
  // 作り手のいる商品が先（ほかの商品を止めずに作れるものを先に）・見込みの大きい順
  const rank = (p: ShelfPick) => (p.ok ? (p.stops ? 1 : 2) : 0);
  return out.sort((a, b) => rank(b) - rank(a) || b.units - a.units);
}
/** 品を入れ替える棚：いちばん売れていない棚（外したときの減り方がいちばん小さい） */
export function weakShelf(s: P1State, uid: number): number {
  const sh = s.shops[uid];
  if (!sh || !sh.shelves.length) return 0;
  const base = sellNow(s).units;
  let best = 0;
  let loss = Infinity;
  sh.shelves.forEach((y, k) => {
    if (!y) {
      if (loss > -1) {
        best = k;
        loss = -1;
      }
      return;
    }
    const shelves = [...sh.shelves];
    shelves[k] = null;
    const l = base - sellNow(withShelves(s, uid, shelves)).units;
    if (l < loss) {
      loss = l;
      best = k;
    }
  });
  return best;
}
/** 品の入れ替えの見込み：いちばん売れていない棚 k を x に替えたときの増え方 */
export function swapGain(s: P1State, uid: number, k: number, x: Sku): number {
  const sh = s.shops[uid];
  if (!sh) return 0;
  const shelves = [...sh.shelves];
  shelves[k] = x;
  return sellNow(withShelves(s, uid, shelves)).units - sellNow(s).units;
}

/**
 * お店の設備投資の見込み（販売の増え方、個／月）。棚を増やすは「いちばん効く新しい商品を並べたとき」（同じ商品をもう 1 段は ±0）。
 * 看板・陳列の什器・裏の倉庫・控室は、その段を 1 つ上げた写しで sellNow を計算し直す
 */
export function investGain(s: P1State, b: PBuilding, id: string): number {
  if (investCost(b, id) == null) return 0;
  if (id === 'shelves') {
    const top = shelfPicks(s, b.uid).find((p) => p.add && p.ok) ?? shelfPicks(s, b.uid).find((p) => p.add);
    return Math.max(0, top?.units ?? 0);
  }
  const nb: PBuilding = { ...b, inv: { ...b.inv, [id]: invLv(b, id) + 1 } };
  const after = sellNow({ ...s, buildings: s.buildings.map((x) => (x.uid === b.uid ? nb : x)) }).units;
  return Math.max(0, after - sellNow(s).units);
}
/** お店の設備投資の並び：いま効く順（見込みの大きい順）。効かないもの（+0.5 個未満）はうしろ（画面では薄く） */
export function shopInvestOrder(s: P1State, b: PBuilding): { id: string; units: number; weak: boolean }[] {
  const ids = Object.values(INVEST)
    .filter((x) => x.kind === 'shop')
    .map((x) => x.id);
  const xs = ids.map((id, k) => ({ id, k, units: investGain(s, b, id) }));
  return xs
    .map((x) => ({ ...x, weak: x.units < unitsX(0.5) }))
    .sort((a, b2) => Number(a.weak) - Number(b2.weak) || b2.units - a.units || a.k - b2.k)
    .map(({ id, units, weak }) => ({ id, units, weak }));
}

// ---------------------------------------------------------------- 工房・調達の見込み

/** 作る物を変える作業台：作業台が 1 つならそれ。2 つ以上なら、作っている物がほかの台と重なっている・いちばんたまっている台 */
export function benchToChange(s: P1State): number {
  if (s.slots.length <= 1) return 0;
  const made = (x: Sku | null) => (x ? s.slots.filter((y) => y.sku === x).length : 0);
  let best = 0;
  let score = -Infinity;
  s.slots.forEach((sl, k) => {
    if (sl.worker == null) return;
    const v = !sl.sku ? 1e6 : made(sl.sku) > 1 ? 1e5 : s.stock[sl.sku] ?? 0;
    if (v > score) {
      score = v;
      best = k;
    }
  });
  return best;
}
/** 作業台を足す見込み（② 製造の流れの増え方、個／月。台に人を置いた写し：whatIf） */
export function benchGain(s: P1State): { units: number; cost: number } | null {
  const ws = myWorkshop(s);
  const cost = ws ? investCost(ws, 'bench') : null;
  if (!ws || cost == null) return null;
  const w = whatIf(s, 'craft').find((x) => x.move.kind === 'invest' && x.move.id === 'bench');
  return { units: w?.units ?? 0, cost };
}
/** いちばん先に切れる素材（作っている物の素材のうち、ひと月に使う量に比べて在庫がいちばん少ないもの） */
export function lowMat(s: P1State): Mat | null {
  const use = fullUse(s);
  const xs = procMats(s)
    .map((x) => x.m)
    .filter((m) => hasRoute(s, m));
  if (!xs.length) return null;
  const left = (m: Mat) => (s.mats[m] ?? 0) + (s.orders ?? []).filter((o) => o.m === m).reduce((a, o) => a + o.qty, 0);
  return xs.sort((a, b) => left(a) / Math.max(1, use[a] ?? 1) - left(b) / Math.max(1, use[b] ?? 1))[0];
}

// ---------------------------------------------------------------- 担当と指示

export type OrderKind = 'shelf' | 'swap' | 'ad' | 'clerk' | 'make' | 'bench' | 'crafter' | 'order' | 'buyopen' | 'buyer' | 'main' | 'tidy' | 'field' | 'staff' | 'clear';
export interface Order {
  k: OrderKind;
  label: string;
  /** 見込み・費用（小さく） */
  sub: string;
  /** 押せない（理由は sub） */
  off?: boolean;
  /** 見込み（個／月。テスト・並び） */
  units?: number;
  cost?: number;
  /** いちばん効く指示（金色） */
  rec?: boolean;
  /** 作業台・素材 */
  slot?: number;
  m?: Mat;
  /** 段 UI5a：棚を整える（設備投資の id） */
  inv?: string;
}
export type OrderPlace = 'shop' | 'workshop' | 'wholesale';
export interface OrderBox {
  place: OrderPlace;
  /** 担当のヒーロー（いなければ null：「担当を置く」だけ） */
  hero: number | null;
  role: { icon: string; text: string };
  /** 担当のひと言（口調の型。30 字まで） */
  greet: string;
  /** いまの様子（数字の 1 行） */
  status: string;
  orders: Order[];
}

const fmt = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const pm = (u: number) => t(`+${Math.max(0, Math.round(u * 10) / 10)} 個／月`, `+${Math.max(0, Math.round(u * 10) / 10)}/mo`);
const SEP = () => t('・', ' · ');
const STAGE_NM: Record<Stage, () => string> = { buy: () => t('① 調達', '① Buy'), craft: () => t('② 製造', '② Craft'), haul: () => t('③ 物流', '③ Haul'), sell: () => t('④ 販売', '④ Sell') };

/** 担当のひと言（口調の型ごと。30 字まで） */
const GREET: Record<Tone, () => string> = {
  scholar: () => t('データは揃っています。ご指示を。', 'The data is ready. Your orders?'),
  warrior: () => t('命令を待っておる！', 'Awaiting your command!'),
  leader: () => t('次の一手を決めよう。', 'Let us choose the next move.'),
  polite: () => t('何なりとお申し付けください。', 'How may I help, chief?'),
  cheer: () => t('次は何する？', 'What’s next?'),
  merchant: () => t('稼ぎどころ、ありますよ！', 'There’s money to be made!'),
  easy: () => t('なにするー？', 'What should we do?'),
  quiet: () => t('…指示を。', '…Orders?'),
};
/** 指示を受けたひと言の言い出し（口調の型ごと） */
const ACK: Record<Tone, () => string> = {
  scholar: () => t('了解です。', 'Understood. '),
  warrior: () => t('承知！', 'At once! '),
  leader: () => t('よし、', 'Right — '),
  polite: () => t('かしこまりました。', 'Certainly. '),
  cheer: () => t('まかせて！', 'On it! '),
  merchant: () => t('毎度！', 'Deal! '),
  easy: () => t('はーい、', 'Okay~ '),
  quiet: () => t('…了解。', '…Roger. '),
};
export const ACK_MAX = 30;
/** 担当のひと言 */
export const greetOf = (hero: number) => GREET[toneOf(hero)]();
/** 指示を受けたひと言（「承知！鋏に切り替えます」。30 字を超えたら言い出しを落とし、それでも超えたら切る） */
export function ackOf(hero: number, core: string): string {
  const full = ACK[toneOf(hero)]() + core;
  if (full.length <= ACK_MAX) return full;
  return core.length <= ACK_MAX ? core : `${core.slice(0, ACK_MAX - 1)}…`;
}

const shopName = (s: P1State, uid: number) => {
  const b = shopB(s, uid);
  return b && P1B[b.id] ? DEF[b.id]?.name ?? '' : t('お店', 'shop');
};
const nameOfSku = (x: Sku) => PRODUCTS.find((p) => p.key === skuParts(x)[0])?.name ?? x;

/**
 * お店の店長への指示（段 UI5a：販売は「どうやって売るか」だけ。何を売るかは製造が決め、棚は自動でついてくる）：
 * 主力を決める・棚を整える（設備投資のいちばん効くもの）・宣伝を頼む・需要の読み（現場からの提言）・従業員（店長が休む日も開ける）。
 * 店長がいなければ「担当を置く」が先頭。どれも押すと担当者からの提案書（「主力」「宣伝」は画面）
 */
function shopBox(s: P1State, uid: number): OrderBox {
  const sh = s.shops[uid];
  const nm = shopName(s, uid);
  const hero = sh?.staff ?? null;
  const role = { icon: '🏪', text: t(`${nm}の店長`, `${nm} manager`) };
  const status = sh ? t(`今月の売上 ${fmt(sh.rev)}${sh.last ? `${SEP()}先月 ${fmt(sh.last.rev)}` : ''}`, `This month ${fmt(sh.rev)}${sh.last ? `${SEP()}last ${fmt(sh.last.rev)}` : ''}`) : '';
  const orders: Order[] = [];
  if (hero == null) orders.push({ k: 'clerk', label: t('担当を置く', 'Assign a manager'), sub: (sh?.part ?? 0) > 0 ? t('いまは従業員だけ', 'Staff only now') : t('売り場に人がいません', 'Nobody on the floor'), rec: true });
  if (sh) {
    // 主力を決める（並んでいる・作っている商品から）
    const cands = mainCands(s, uid);
    const main = sh.shelves[0];
    orders.push({ k: 'main', label: t('主力を決める', 'Pick the main item'), sub: main ? t(`いま：${nameOfSku(main)}${cands.length < 2 ? `${SEP()}並ぶ商品は 1 つだけ` : ''}`, `Now: ${nameOfSku(main)}${cands.length < 2 ? `${SEP()}only one item` : ''}`) : t('まだ並んでいない', 'Nothing on the shelves yet'), off: cands.length < 2 && !!main });
    // 棚を整える：お店の設備投資のいちばん効くもの（棚の増設は、作って並べる商品とセット）
    const b = shopB(s, uid);
    const top = b ? shopInvestOrder(s, b).find((x) => !x.weak) : undefined;
    const cost = b && top ? investCost(b, top.id) : null;
    orders.push(
      top && cost != null
        ? { k: 'tidy', label: t('棚を整える', 'Improve the shelves'), sub: [INVEST[top.id]?.name ?? top.id, pm(top.units), fmt(cost)].join(SEP()), units: top.units, cost, inv: top.id }
        : { k: 'tidy', label: t('棚を整える', 'Improve the shelves'), sub: t('いま効く設備投資がない', 'No upgrade helps now'), off: true },
    );
    // 宣伝を頼む：いちばん見込みの大きい宣伝（この町で元が取れるか）
    const run = ADS.find((a) => (s.ads[a.id] ?? 0) > 0);
    const ad = ADS.filter((a) => adPick(s, a))
      .map((a) => ({ a, g: adGain(s, a.id) }))
      .sort((x, y) => y.g - x.g)[0];
    orders.push({
      k: 'ad',
      label: t('宣伝を頼む', 'Ask for an ad'),
      sub: run ? t(`${run.name} 実施中（あと ${s.ads[run.id]} 日）`, `${run.name} running (${s.ads[run.id]} d)`) : ad ? (ad.g > 0 ? t(`${ad.a.name}${SEP()}見込み +${fmt(ad.g)}`, `${ad.a.name}${SEP()}+${fmt(ad.g)} expected`) : t(`この町では元が取れない（${ad.a.name} −${fmt(-ad.g)}）`, `Won’t pay off here (${ad.a.name} −${fmt(-ad.g)})`)) : '',
      cost: ad ? adCost(s, ad.a.id) : undefined,
    });
    // 需要の読み（現場からの提言）：お客さんの声と需要から「○○の需要がありそう」。承認すると製造への提案書（作る物の切り替え・素材まで）
    const f = fieldPick(s, uid);
    // 段 L0：Rare より前は提案書を挟まない（押すとそのまま並べる）
    const fieldNm = propsOpen(s) ? t('需要の読み（提言を見る）', 'Read demand (see the pitch)') : t('需要の読み（すぐ並べる）', 'Read demand (stock it now)');
    orders.push(f ? { k: 'field', label: fieldNm, sub: [t(`${nameOfSku(f.x)}の需要がありそう`, `${nameOfSku(f.x)} looks wanted`), pm(f.units)].join(SEP()), units: f.units, cost: f.cost } : { k: 'field', label: fieldNm, sub: t('いま勧められる商品がない', 'No item to pitch now'), off: true });
    // 段 UI5c：在庫を優先して売りさばく（売れ残り・発掘で出た品・使い切りに作った品を先に棚へ。値引きの段を選ぶ）
    const ci = clearInfo(s);
    const pct = Math.round(ci.rate * 100);
    orders.push({
      k: 'clear',
      label: t('在庫を優先して売りさばく', 'Clear stock first'),
      sub: [sh.clear != null ? t(`オン（${cutName(sh.clear)}）`, `On (${cutName(sh.clear)})`) : t('オフ', 'Off'), t(`倉庫 ${pct}%`, `storage ${pct}%`), t(`在庫品 ${ci.total} 個`, `${ci.total} stock items`)].join(SEP()),
      ...(sh.clear == null && storeFull(s) && ci.total > 0 ? { rec: true } : {}),
    });
    // 従業員（店長が休む日も、2 人いれば従業員で開ける）
    const want = Math.max(sh.part + 1, SELF_RUN.min);
    const can = want <= partMax(s, uid) || (b != null && investCost(b, 'staffroom') != null);
    orders.push({ k: 'staff', label: t('従業員を増やす', 'Add staff'), sub: [t(`いま ${sh.part} 人`, `${sh.part} now`), sh.part >= SELF_RUN.min ? t('休む日も従業員で営業', 'open on days off') : t('休む日は閉まる', 'closes on days off'), t(`毎月 +${fmt((want - sh.part) * SHOP.partTimeWage * 30)}`, `+${fmt((want - sh.part) * SHOP.partTimeWage * 30)}/mo`)].join(SEP()), off: !can });
  }
  // いちばん効く指示（金色）：見込みのいちばん大きいもの
  const best = orders.filter((o) => !o.off && (o.units ?? 0) > unitsX(0.5)).sort((a, b) => (b.units ?? 0) - (a.units ?? 0))[0];
  if (best && hero != null) best.rec = true;
  return { place: 'shop', hero, role, greet: hero != null ? greetOf(hero) : t('店長がいません。', 'No manager here.'), status, orders };
}
/** 主力にできる商品（そのお店に並んでいる商品と、工房で作っている商品） */
export function mainCands(s: P1State, uid: number): Sku[] {
  const sh = s.shops[uid];
  if (!sh) return [];
  return [...new Set([...sh.shelves.filter((x): x is Sku => !!x), ...madeSkus(s)])].filter((x) => !unsellableHere(s, skuParts(x)[0]));
}
/** 現場からの提言：そのお店に並べると、いちばん売れそうな新しい商品（作り手のいるもの。空き棚が無ければ棚の増設とセット） */
export function fieldPick(s: P1State, uid: number): ShelfPick | null {
  return shelfPicks(s, uid).find((p) => p.ok && p.units > unitsX(0.5)) ?? null;
}

/** 工房の職人への指示：作る物を変える・作業台を足す・空いた作業台に職人を置く */
function workshopBox(s: P1State): OrderBox {
  const k = benchToChange(s);
  const sl = s.slots[k];
  const hero = sl?.worker ?? s.slots.find((x) => x.worker != null)?.worker ?? null;
  const role = { icon: '🔨', text: t('工房の職人', 'Workshop crafter') };
  const status = t(`今月 ${s.ws.made} 個作った${SEP()}作業台 ${s.slots.length}`, `${s.ws.made} made this month${SEP()}${s.slots.length} benches`);
  const orders: Order[] = [];
  const free = s.slots.findIndex((x) => x.worker == null);
  if (hero == null) orders.push({ k: 'crafter', label: t('担当を置く', 'Assign a crafter'), sub: t('作業台 1 に職人がいません', 'No crafter at bench 1'), slot: Math.max(0, free), rec: true });
  if (sl)
    orders.push({
      k: 'make',
      label: t('作る物を変える', 'Change what we make'),
      sub: sl.sku ? t(`作業台 ${k + 1}：いまは${nameOfSku(sl.sku)}`, `Bench ${k + 1}: now ${nameOfSku(sl.sku)}`) : t(`作業台 ${k + 1}：まだ決まっていない`, `Bench ${k + 1}: nothing yet`),
      slot: k,
      off: sl.worker == null,
    });
  const bg = benchGain(s);
  // 詰まりが製造でなければ、作業台を足しても売上は増えない（見込みは製造の流れの増え方）
  const bn = myWorkshop(s) ? bottleneck(stageCaps(s)) : 'craft';
  const jam = bn !== 'craft' ? [t(`いまの詰まりは${STAGE_NM[bn]()}`, `the jam is ${STAGE_NM[bn]()}`)] : [];
  orders.push(bg ? { k: 'bench', label: t('作業台を足す', 'Add a workbench'), sub: [t(`製造 ${pm(bg.units)}`, `Craft ${pm(bg.units)}`), fmt(bg.cost), ...jam].join(SEP()), units: bn === 'craft' ? bg.units : 0, cost: bg.cost } : { k: 'bench', label: t('作業台を足す', 'Add a workbench'), sub: t('作業台は最大', 'Benches maxed'), off: true });
  if (hero != null && free >= 0) orders.push({ k: 'crafter', label: t('職人を置く', 'Assign a crafter'), sub: t(`作業台 ${free + 1} が空いている`, `Bench ${free + 1} is free`), slot: free });
  return { place: 'workshop', hero, role, greet: hero != null ? greetOf(hero) : t('職人がいません。', 'No crafter yet.'), status, orders };
}

/** 卸問屋（調達係）への指示：いちばん先に切れる素材を 1 ロット注文・調達を開く。調達係がいなければ「担当を置く」 */
function wholesaleBox(s: P1State): OrderBox {
  const st = s.staff.find((x) => x.task === 'buy') ?? null;
  const hero = st?.hero ?? null;
  const role = { icon: '📦', text: t('調達係', 'Buyer') };
  const status = t(`今月 ${s.proc.bought} / ${procCap(s)} 個${SEP()}納期 ${leadDays(s)} 日`, `${s.proc.bought} / ${procCap(s)} this month${SEP()}${leadDays(s)}-day lead`);
  const orders: Order[] = [];
  if (hero == null) orders.push({ k: 'buyer', label: t('担当を置く', 'Assign a buyer'), sub: t('自動の買い付けが止まっている', 'Automatic buying is off'), rec: true });
  const m = lowMat(s);
  if (m) orders.push({ k: 'order', label: t('素材を注文する', 'Order materials'), sub: [t(`${MATS[m].name} ${LOT} 個`, `${LOT} ${MATS[m].name}`), fmt(matPrice(s, m) * LOT), t(`${leadDays(s)} 日で届く`, `in ${leadDays(s)} d`)].join(SEP()), m, cost: matPrice(s, m) * LOT, rec: hero != null });
  orders.push({ k: 'buyopen', label: t('調達を開く', 'Open buying'), sub: t('月の量・作りたい物', 'Monthly amounts, targets') });
  return { place: 'wholesale', hero, role, greet: hero != null ? greetOf(hero) : t('調達係がいません。', 'No buyer yet.'), status, orders };
}

/** 建物の指示の箱（自社の工房・お店・卸問屋）。それ以外は null */
export function ordersOf(s: P1State, b: PBuilding): OrderBox | null {
  if (b.left > 0) return null;
  if (b.owner === 'me' && P1B[b.id]?.kind === 'shop' && s.shops[b.uid]) return shopBox(s, b.uid);
  if (b.owner === 'me' && b.id === 'workshop') return workshopBox(s);
  if (b.owner === 'town' && b.id === 'wholesale' && myWorkshop(s)) return wholesaleBox(s);
  return null;
}
/** 指示の見込み（テスト用の短い形）：店長の棚の指示の増え方 */
export const shelfOrderUnits = (s: P1State, uid: number) => shopBox(s, uid).orders.find((o) => o.k === 'shelf')?.units ?? 0;

/**
 * 段 L0：Rare より前は、吹き出しの指示（棚を整える・需要の読み・従業員を増やす）を提案書を挟まず直接行う（お金の確認は残す）。
 * Rare からは null（提案書を開く）。払えなければ { ok: false, err: 'money', need }
 */
export function directOrder(s: P1State, plan: Plan): (PlanRes & { need: number }) | null {
  if (propsOpen(s)) return null;
  const need = planCost(s, plan).money;
  return { ...applyPlan(s, plan), need };
}
