/**
 * マーケを深める（段 G。docs/ISLAND_PHASE1.md「マーケ（市場調査・広報・企業の格）」・docs/SUCCESSOR_ROADMAP.md 4-7）。
 * DOM なし。数字は data.ts の PR・GRADE の 1 か所。テストは tests/island-p1-cs-mkt.test.ts。
 *
 * - 市場の見通し：いまの需要の伸び（MARKET_GROWTH）・他社の追随の数え（alone）・他社の巻き返しと反撃の残りから、1〜3 か月先を見せる（新しい乱数は足さない）。
 *   見通せる月数は市場調査の部署・需要の読みのパネルで上がる。宣伝の打ち時（いちばん効く宣伝の見込み・セールや反撃の残り・認知の低い商品）も出す。
 * - 広報：実際に起きた良いニュース（町の制覇・研究成果の発表・新商品・新しいお店）を発表するとブランド力が上がる（PR.cool 日に 1 回）。Uncommon の町に出店してから。
 *   炎上の火消しも広報（cs.ts の putOut）。
 * - 企業の格：ブランド力から決まる段（無名 → 地元の店 → 地域の有名店 → 全国ブランド → 世界ブランド）。Rare の町の店の引きと、雇える候補の数に小さく効く。
 *   カリスマ度（雇えるレアリティ。ブランド力のいちばん高かった値を数える）とは別の軸で、カリスマ度には足さない（二重に数えない）。
 */
import { t } from '../../i18n';
import { ADS, AWARE_GOODS, ENTRY_AFTER, GRADE, GRADE_NAME, MARKET, MARKET_GROWTH, PR, PRODUCT, rivalDef, type PrKind } from './data';
import { brandAdd } from './company';
import { topTier } from './acct';
import { CS_OFF, csOf } from './cs';
import { adGain } from './deleg';
import { has, lvMul, market, monopolyLeft, myShops, rivalTune, sellersOf, spend, type P1State } from './model';

// ---------------------------------------------------------------- 企業の格

/** 格を決めるブランド力（コーポレートアイデンティティで +GRADE.ci、Lv で ×1.25） */
export const gradeBrand = (s: Pick<P1State, 'brand' | 'skills' | 'skillLv'>) => Math.round((s.brand ?? 0) * (1 + GRADE.ci * lvMul(s, 'mk_ci')));
/** 企業の格（0〜4） */
export function gradeOf(s: Pick<P1State, 'brand' | 'skills' | 'skillLv'>): number {
  const v = gradeBrand(s);
  let k = 0;
  GRADE.at.forEach((x, i) => {
    if (v >= x) k = i;
  });
  return k;
}
export const gradeName = (k: number) => GRADE_NAME()[Math.max(0, Math.min(GRADE.at.length - 1, k))];
/** 次の段まで（ブランド力。いちばん上なら null） */
export function gradeNext(s: Pick<P1State, 'brand' | 'skills' | 'skillLv'>): { k: number; name: string; need: number } | null {
  const k = gradeOf(s) + 1;
  if (k >= GRADE.at.length) return null;
  const mul = 1 + GRADE.ci * lvMul(s, 'mk_ci');
  return { k, name: gradeName(k), need: Math.max(1, Math.ceil(GRADE.at[k] / mul) - (s.brand ?? 0)) };
}
/** Rare の町の自社の店の引きの倍率（格の段ごとに +GRADE.area） */
export const gradeArea = (s: P1State) => (CS_OFF.on ? 1 : 1 + GRADE.area * gradeOf(s));
/** 雇える候補の数の上乗せ（格の段ごと） */
export const gradeHire = (s: P1State) => (CS_OFF.on ? 0 : GRADE.hire[gradeOf(s)] ?? 0);

// ---------------------------------------------------------------- 広報

/** 広報ができる会社か（Uncommon の町に出店したことがある） */
export const prOn = (s: Pick<P1State, 'tier' | 'land'>) => !CS_OFF.on && topTier(s) !== 'C';
/** 良いニュースを足す（実際に起きたとき。model.ts から） */
export function prNews(s: P1State, kind: PrKind, label: string) {
  if (!prOn(s)) return;
  const C = csOf(s);
  C.news = [{ kind, label, day: s.day }, ...C.news.filter((x) => s.day - x.day < PR.keep)].slice(0, PR.max);
}
/** 出せる良いニュース（古くなっていないもの・新しい順） */
export const newsOf = (s: P1State) => (s.cs?.news ?? []).filter((x) => s.day - x.day < PR.keep);
/** 1 つのニュースで上がるブランド力（プレスリリースで上乗せ） */
export const prGain = (s: P1State, kind: PrKind) => Math.round(PR.gain[kind] * (1 + PR.press * lvMul(s, 'mk_press')));
export const prCost = (s: P1State) => PR.cost[s.tier ?? 'C'] || PR.cost.U;
/** 次に発表できる日まで（日。0 ならいま） */
export const prWait = (s: P1State) => Math.max(0, (s.cs?.prDay ?? -1e9) + PR.cool - s.day);
export function prLock(s: P1State): 'off' | 'none' | 'cool' | 'money' | null {
  if (!prOn(s)) return 'off';
  if (!newsOf(s).length) return 'none';
  if (prWait(s) > 0) return 'cool';
  if (s.money < prCost(s)) return 'money';
  return null;
}
/** 良いニュースを発表する（n 番目。ブランド力が上がる）。返り値は上がったブランド力か、できない理由 */
export function publish(s: P1State, n = 0): number | 'off' | 'none' | 'cool' | 'money' {
  const lock = prLock(s);
  if (lock) return lock;
  const list = newsOf(s);
  const x = list[n] ?? list[0];
  const cost = prCost(s);
  s.money -= cost;
  spend(s, 'ads', cost);
  const C = csOf(s);
  C.prDay = s.day;
  C.news = C.news.filter((y) => y !== x);
  const g = prGain(s, x.kind);
  brandAdd(s, g, t(`広報：${x.label}`, `PR: ${x.label}`));
  return g;
}
export const PR_KIND_NAME: Record<PrKind, () => string> = {
  clear: () => t('町の制覇', 'Town conquered'),
  present: () => t('研究成果の発表', 'Findings presented'),
  product: () => t('新商品', 'New product'),
  shop: () => t('新しいお店', 'New shop'),
};

// ---------------------------------------------------------------- 市場の見通し

/** 見通せる月数（1・市場調査の部署で 2・需要の読みで 3） */
export const horizon = (s: P1State) => 1 + (has(s, 'mk_research') ? 1 : 0) + (has(s, 'mk_forecast') ? 1 : 0);
export interface ForeRow {
  key: string;
  name: string;
  /** いまと 1〜h か月先の需要（個／月） */
  demand: number[];
  sellers: number;
  /** 自社の棚に並べている */
  mine: boolean;
  /** 他社が真似してくるまでの月数の予報（需要の読み。自社が売っていて、まだ飽和していない商品だけ） */
  copyIn: number | null;
  /** その商品が売れ筋（いちばん売れている商品）の他社の名前（市場調査の部署） */
  topOf: string[];
  /** 認知（並べている新しい商品） */
  known: number;
}
export interface Forecast {
  h: number;
  rows: ForeRow[];
  /** 他社の売れ筋（市場調査の部署）：会社の名前・いちばん売れている商品・先月の売上 */
  rivals: { name: string; key: string | null; sales: number }[];
  /** 宣伝の打ち時（短い文） */
  hints: { kind: 'sale' | 'rally' | 'known' | 'copy' | 'ad' | 'calm'; text: string; ad?: string }[];
  /** いちばん効く宣伝と見込み（G） */
  bestAd: { id: string; gain: number } | null;
}
/** 他社が真似してくるまでの月数（いまの追随の数えから。真似されない・飽和は null） */
export function copyIn(s: P1State, key: string): number | null {
  const n = sellersOf(s, key);
  if (n >= MARKET.satAt) return null;
  const after = rivalTune(s)?.entryAfter ?? ENTRY_AFTER;
  const sold = (s.alone[key] ?? 0) > 0 || myShops(s).some((b) => s.shops[b.uid]?.shelves.some((x) => x && x.startsWith(`${key}:`)));
  if (!sold) return null;
  let m = Math.max(1, after - (s.alone[key] ?? 0));
  if (PRODUCT[key]?.relic) m = Math.max(m, monopolyLeft(s, key));
  return m;
}
/** 市場の見通し（市場調査の画面・自動プレイの 100%） */
export function forecast(s: P1State): Forecast {
  const h = horizon(s);
  const deep = has(s, 'mk_research');
  const read = has(s, 'mk_forecast');
  const tops: Record<string, string[]> = {};
  const rivals: Forecast['rivals'] = [];
  if (deep)
    for (const r of s.rivals) {
      if (r.gone) continue;
      const by = s.rivalLast?.[r.id]?.by ?? {};
      const best = Object.entries(by).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      const name = rivalDef(r.id)?.name ?? r.id;
      rivals.push({ name, key: best?.[0] ?? null, sales: Math.round(s.rivalLast?.[r.id]?.total ?? 0) });
      if (best) (tops[best[0]] ??= []).push(name);
    }
  const rows: ForeRow[] = market(s).map((m) => ({
    key: m.p.key,
    name: m.p.name,
    demand: Array.from({ length: h + 1 }, (_, k) => Math.round(m.demand * (1 + MARKET_GROWTH) ** k)),
    sellers: m.sellers,
    mine: m.mine,
    copyIn: read && m.mine ? copyIn(s, m.p.key) : null,
    topOf: tops[m.p.key] ?? [],
    known: m.known,
  }));
  rows.sort((a, b) => Number(b.mine) - Number(a.mine) || b.demand[0] - a.demand[0]);
  // 宣伝の打ち時
  const hints: Forecast['hints'] = [];
  let bestAd: Forecast['bestAd'] = null;
  if (myShops(s).length)
    for (const a of ADS) {
      if ((s.ads[a.id] ?? 0) > 0) continue;
      const g = adGain(s, a.id);
      if (!bestAd || g > bestAd.gain) bestAd = { id: a.id, gain: g };
    }
  const adName = (id: string) => ADS.find((a) => a.id === id)?.name ?? id;
  const cb = s.comeback;
  if (cb && cb.left > 0) hints.push({ kind: 'sale', text: t(`${rivalDef(cb.rid)?.name ?? ''}のセールがあと ${cb.left} か月。宣伝で売り場を強くして取り返す打ち時`, `${rivalDef(cb.rid)?.name ?? ''}’s sale runs ${cb.left} more month(s). A good time to advertise and win customers back`), ad: bestAd?.id });
  if ((s.rally ?? 0) > 0) hints.push({ kind: 'rally', text: t(`他社の反撃（宣伝）があと ${s.rally} か月。宣伝で 1 位を守る打ち時`, `Rivals’ counter-ads run ${s.rally} more month(s). Advertise to defend #1`), ad: bestAd?.id });
  const low = rows.filter((r) => r.mine && r.known < AWARE_GOODS.low).sort((a, b) => a.known - b.known)[0];
  if (low) hints.push({ kind: 'known', text: t(`『${low.name}』の認知 ${Math.round(low.known * 100)}%。宣伝のある日は認知が早く育つ`, `${low.name} awareness ${Math.round(low.known * 100)}%. Ads grow awareness faster`), ad: bestAd?.id });
  const soon = rows.filter((r) => r.copyIn != null && r.copyIn <= 1)[0];
  if (soon) hints.push({ kind: 'copy', text: t(`『${soon.name}』は来月、他社が真似してきそう。独り占めのうちに売り切ろう`, `${soon.name} will likely be copied next month. Sell hard while you have it alone`) });
  if (bestAd && bestAd.gain > 0) hints.push({ kind: 'ad', text: t(`いちばん効く宣伝：${adName(bestAd.id)}（見込み +${Math.round(bestAd.gain).toLocaleString()} G）`, `Best ad now: ${adName(bestAd.id)} (est. +${Math.round(bestAd.gain).toLocaleString()} G)`), ad: bestAd.id });
  if (!hints.length) hints.push({ kind: 'calm', text: t('いまは宣伝の打ち時ではない（見込みより費用が大きい）', 'Not a good time to advertise (cost beats the expected lift)') });
  return { h, rows, rivals, hints, bestAd };
}
