/**
 * 法務（段 H2：Epic の町 ②。docs/ISLAND_PHASE1.md「Epic の町 ②：法務と M&A」・docs/SUCCESSOR_ROADMAP.md 4-8）。
 * DOM なし（model.ts の step・endMonth・main.ts・legalui.ts・自動プレイ・テストが使う）。数字は data.ts の LEGAL の 1 か所。テストは tests/island-p1-legal.test.ts。
 *
 * - M&A（他社の買収）：打診 → 調査（デューデリジェンス）→ 値段の交渉（3 段の提示と受ける見込み）＋ 契約の条項 → 成立（次の月の締めで店が自社に）。
 *   町は止まらずに動き続ける（それぞれ数日〜数週）。その町の 1 位の会社は売らない。撤退した会社・買収済みの会社は対象外。買えるのは町の他社の半分まで。
 *   町ごとの記録（打診中の話・買った会社・引き継いだ商売）は商圏（s.area.ma）に持つ（セクタの写しと一緒に動く）。
 * - 仕入れの契約：卸問屋と期間（3・6・12 か月）を決めて、Epic の町の素材が安くなる。途中でやめると違約金（上限あり）を卸問屋が訴える。
 * - 特許：Epic の町で、自社の Rare・Epic の復刻品を特許にできる（出願料・審査）。特許の間は Epic の町の他社が追随しない。貸すと使用料が入る。
 * - 争い：訴えは実際に起きたこと（契約をやめた・調べずに買った店の訴えの種・特許で真似を止めた・特許を侵した）からだけ。数か月の勝負・和解できる。
 *   負けても失うのはお金だけ（上限あり・資金が TAX.keep を切らない。残りは月ごとに）。段 H3 の裏工作の発覚からの訴えは fileSuit で受ける。
 * Common・Uncommon・Rare の町には何も出ない（legalHere が偽）。
 */
import { t } from '../../i18n';
import { LEGAL, P1B, PRODUCT, TAX, TIERS, rivalDef, rivalsOf } from './data';
import { book } from './company';
import { deptLevel } from './dept';
import { gradeOf } from './mkt';
import { headOf, leaderOf } from './deleg';
import { areaShares, areaTick, has, isVacant, lvMul, placeSpread, rivalBase, rng, spend, syncShop, type P1State, type PBuilding, type Report, type RivalState } from './model';

/**
 * 段 H2 の手を止める（自動プレイの比べ「M&A なし」「特許なし」だけ。ふつうのゲームでは使わない）
 */
export const LEGAL_OFF = { ma: false, patent: false };

// ---------------------------------------------------------------- セーブの中身

export type OfferLevel = 'low' | 'mid' | 'high';
export interface Clauses {
  /** 支払いの分割 */
  split?: boolean;
  /** 従業員の引き継ぎ（店員ごと引き継ぐ） */
  staff?: boolean;
  /** 競業避止（相手のオーナーがこの町で新しい店を出さない） */
  noCompete?: boolean;
}
/** M&A の話 1 つ（打診 → 調査 → 交渉 → 成立） */
export interface Deal {
  id: number;
  rid: string;
  /** offer：打診の返事待ち／talk：話を聞いてくれる（調査・交渉へ）／dd：調査中／nego：提示の返事待ち／signed：成立（次の月の締めで店が移る） */
  stage: 'offer' | 'talk' | 'dd' | 'nego' | 'signed';
  /** いまの段が終わる日 */
  until: number;
  day0: number;
  /** 調査をした（本当の数字・隠れた借金が見える） */
  dd?: boolean;
  /** 見えた項目（調査の結果） */
  seen?: { debt: boolean; seed: boolean; top: boolean };
  /** 隠れた借金と訴えの種（町を作ったときの種と相手で決まる。G） */
  debt: number;
  seed: number;
  /** 出している提示（返事待ち）・断られた提示と、次に同じか安い提示ができる日 */
  offer?: { level: OfferLevel; clauses: Clauses; price: number; chance: number; ok: boolean };
  refused?: { level: OfferLevel; until: number };
  /** 成立：払った額（分割なら 1 回目）・合わせた値段 */
  price?: number;
  clauses?: Clauses;
}
/** 町ごとの M&A の記録（s.area.ma） */
export interface TownMA {
  deals: Deal[];
  /** 買った会社（会社・成立した報告の月・店の数・値段・引き継いだ商売の月の売上・競業避止） */
  bought: { rid: string; month: number; day: number; stores: number; price: number; base: number; noCompete: boolean }[];
  /** 引き継いだ商売（店ごと：その店で続く、相手のエクステ以外の売上の月の額と利益率） */
  biz: { uid: number; rid: string; base: number; margin: number }[];
  /** 今月の引き継いだ商売の売上と原価（月の締めで報告へ） */
  month: number;
  cost: number;
  /** 競業避止の無い買収：元のオーナーが戻ってくる月（このセクタの報告の月） */
  returns: { rid: string; month: number; base: number }[];
}
/** 仕入れの契約 */
export interface Supply {
  months: number;
  start: number;
  end: number;
  cut: number;
  clauses: { noPenalty?: boolean; excl?: boolean };
}
/** 特許 1 つ（会社のもの。効くのは Epic の町） */
export interface Patent {
  key: string;
  filed: number;
  /** 審査が終わって特許になった日（審査中は null）・切れる日 */
  grant: number | null;
  until: number;
  /** 使用料で貸している（他社の追随を許し、使用料が入る） */
  license: boolean;
  /** この特許で真似を止めた数・無効の訴えを受けた */
  stopped: number;
  sued?: boolean;
}
export type SuitKind = 'supply' | 'ma' | 'invalid' | 'infringe' | 'scheme';
/** 訴え 1 つ（side：def＝訴えられた・plain＝こちらから訴えた） */
export interface Suit {
  id: number;
  kind: SuitKind;
  side: 'def' | 'plain';
  /** 相手（他社の id か、'wholesale'＝卸問屋・'partner'＝買った会社の取引先） */
  by: string;
  key?: string;
  claim: number;
  day: number;
  months: number;
  left: number;
  /** 証拠（調査をした・特許がある） */
  evidence: boolean;
  status: 'open' | 'won' | 'lost' | 'settled';
  /** 払った額（＋）・受け取った額（−ではなく got） */
  paid?: number;
  got?: number;
}
export interface LegalMonth {
  closed: { rid: string; stores: number; price: number; debt: number }[];
  back: string[];
  granted: string[];
  expired: string[];
  stopped: number;
  royalty: number;
  newSuits: number;
  won: number;
  lost: number;
  settled: number;
  paid: number;
  got: number;
  saved: number;
}
export interface LegalState {
  seq: number;
  supply: Supply | null;
  patents: Patent[];
  suits: Suit[];
  /** 分割の支払いの残り（月の締めごと）・払いきれていないお金（資金が TAX.keep を切らないぶん、月ごとに） */
  pay: { amt: number; left: number; what: string }[];
  owed: number;
  /** 契約・特許・M&A・裁判で上がる法務の理解度（LEGAL.xp.max まで） */
  xp: number;
  month: LegalMonth;
  /** これまで（自動プレイ・報告） */
  tot: { ma: number; maG: number; acqRev: number; patents: number; stopped: number; royalty: number; suits: number; won: number; lost: number; settled: number; contracts: number; saved: number; penalty: number };
}
export const newLegalMonth = (): LegalMonth => ({ closed: [], back: [], granted: [], expired: [], stopped: 0, royalty: 0, newSuits: 0, won: 0, lost: 0, settled: 0, paid: 0, got: 0, saved: 0 });
export const newLegal = (): LegalState => ({ seq: 0, supply: null, patents: [], suits: [], pay: [], owed: 0, xp: 0, month: newLegalMonth(), tot: { ma: 0, maG: 0, acqRev: 0, patents: 0, stopped: 0, royalty: 0, suits: 0, won: 0, lost: 0, settled: 0, contracts: 0, saved: 0, penalty: 0 } });
export const legalOf = (s: P1State): LegalState => (s.legal ??= newLegal());
export const newTownMA = (): TownMA => ({ deals: [], bought: [], biz: [], month: 0, cost: 0, returns: [] });
export const townMA = (s: P1State): TownMA | null => (s.area ? (s.area.ma ??= newTownMA()) : null);

/** 法務の遊びがある町か（Epic 以上の町。Common・Uncommon・Rare の町には出ない） */
export const legalHere = (s: Pick<P1State, 'tier'>) => s.tier === 'E' || s.tier === 'L';
/** 法務の理解度（パネル ＋ 契約・特許・M&A・裁判の経験） */
export const legalLv = (s: P1State) => deptLevel(s, 'legal');
/** 経験の理解度を足す（LEGAL.xp.max まで） */
const gainXp = (s: P1State, n: number) => {
  const L = legalOf(s);
  L.xp = Math.min(LEGAL.xp.max, L.xp + n);
};
/** 通せる条項の数（はじめ base・法務の理解度 at で +1・契約の雛形で +1） */
export const clauseSlots = (s: P1State) => LEGAL.clauses.base + (legalLv(s) >= LEGAL.clauses.at ? 1 : 0) + (has(s, 'lg_template') ? LEGAL.clauses.template : 0);
/** 払う（資金が TAX.keep を切らないぶんだけ。残りは払いきれていないお金として月ごとに） */
function payOut(s: P1State, amt: number, kind: 'legal' | 'ma' = 'legal'): number {
  const L = legalOf(s);
  const now = Math.max(0, Math.min(amt, Math.floor(s.money - TAX.keep)));
  s.money -= now;
  book(s, kind === 'ma' ? 'ma' : 'legal', kind === 'ma' ? now : -now);
  L.owed += amt - now;
  return now;
}
/** 受け取る（使用料・賠償金） */
function receive(s: P1State, amt: number) {
  s.money += amt;
  book(s, 'legal', amt);
}
const hashOf = (x: string) => [...x].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 1000003, 7);

// ---------------------------------------------------------------- M&A

const nameOf = (rid: string) => rivalDef(rid)?.name ?? rid;
/** 相手の会社の店（いまの町） */
export const storesOf = (s: P1State, rid: string) => s.buildings.filter((b) => b.owner === rid);
/** 先月の相手の売上（公開。まだ締めが無ければ、いまの見込み） */
export function rivalSales(s: P1State, r: RivalState): number {
  const last = s.rivalLast?.[r.id]?.total;
  if (last != null && last > 0) return last;
  return rivalBase(s, r) + (s.rivalSales?.[r.id] ?? 0);
}
/** その町の 1 位の会社（他社。自社が 1 位なら null）。先月の締めの順位（まだ無ければ、いちばん大きい他社） */
export function topRival(s: P1State): string | null {
  const live = s.rivals.filter((r) => !r.gone);
  const rep = s.reports[s.reports.length - 1];
  if (rep?.area.length) {
    const top = rep.area[0];
    if (top.me) return null;
    return live.find((r) => nameOf(r.id) === top.name)?.id ?? null;
  }
  return [...live].sort((a, b) => rivalSales(s, b) - rivalSales(s, a))[0]?.id ?? null;
}
/** 相手の取り分の伸び（いまの取り分 ÷ 開店のときの取り分。商圏の無い町は 1） */
export function shareRatio(s: P1State, rid: string): number {
  const xs = s.area?.stores.filter((x) => x.rid === rid) ?? [];
  const s0 = xs.reduce((a, x) => a + x.share0, 0);
  return s0 > 0 ? xs.reduce((a, x) => a + x.share, 0) / s0 : 1;
}
/** 値段の目安の月数（月の売上の 6〜10 か月。伸び（取り分の伸び）と利益率で。赤字や伸びの悪い会社は安い） */
export function maMonths(s: P1State, rid: string): number {
  const [lo, hi] = LEGAL.ma.months;
  const g = Math.max(0, Math.min(1, (shareRatio(s, rid) - 0.6) / 0.8));
  const m = Math.max(0, Math.min(1, (rivalDef(rid)?.margin ?? 0.1) / 0.2));
  return lo + (hi - lo) * (0.6 * g + 0.4 * m);
}
/** 値段の目安（G。1 万 G 単位） */
export function guidePrice(s: P1State, rid: string): number {
  const r = s.rivals.find((x) => x.id === rid);
  if (!r) return 0;
  return Math.max(10000, Math.round((rivalSales(s, r) * maMonths(s, rid)) / 10000) * 10000);
}
export type MaLock = 'off' | 'top' | 'gone' | 'bought' | 'limit' | 'busy' | 'none';
/** 打診できない理由（null ならできる） */
export function maLock(s: P1State, rid: string): MaLock | null {
  if (!legalHere(s) || !s.area || LEGAL_OFF.ma) return 'off';
  const r = s.rivals.find((x) => x.id === rid);
  const M = townMA(s)!;
  if (!r) return 'none';
  if (M.bought.some((x) => x.rid === rid) && r.gone) return 'bought';
  if (r.gone || !storesOf(s, rid).length) return 'gone';
  if (topRival(s) === rid) return 'top';
  if (M.bought.filter((x) => !s.rivals.find((y) => y.id === x.rid && !y.gone)).length >= maMax(s)) return 'limit';
  if (M.deals.length) return 'busy';
  return null;
}
/** 町で買える会社の数（町の他社の maxShare まで） */
export const maMax = (s: P1State) => Math.floor(rivalsOf(s.sector ?? 'c1').length * LEGAL.ma.maxShare);
export const MA_LOCK_TEXT: Record<MaLock, () => string> = {
  off: () => t('M&A は Epic の町だけ', 'M&A is only in Epic towns'),
  top: () => t('1 位は売らない（町の 1 位の会社は売り手にならない）', 'The #1 company won’t sell'),
  gone: () => t('町から撤退した会社（店が無い）', 'This company has left town'),
  bought: () => t('買収済み', 'Already acquired'),
  limit: () => t(`この町で買えるのは他社の半分まで（${LEGAL.ma.maxShare * 4} 社）`, `You can buy at most half the rivals in a town`),
  busy: () => t('ほかの会社と話を進めている（1 社ずつ）', 'Already in talks with another company (one at a time)'),
  none: () => t('相手が見つからない', 'No such company'),
};
/** 打診する（相手を選ぶ）。返事は LEGAL.ma.replyDays 日後 */
export function startDeal(s: P1State, rid: string): Deal | MaLock {
  const lock = maLock(s, rid);
  if (lock) return lock;
  const M = townMA(s)!;
  const L = legalOf(s);
  const r = rng((s.seed >>> 0) * 7 + hashOf(rid) + hashOf(s.sector ?? ''));
  const g = guidePrice(s, rid);
  const [d0, d1] = LEGAL.ma.debt;
  const [e0, e1] = LEGAL.ma.seed;
  const debt = r() < LEGAL.ma.debtP ? Math.round((g * (d0 + (d1 - d0) * r())) / 1000) * 1000 : 0;
  const seed = r() < LEGAL.ma.seedP ? Math.round((g * (e0 + (e1 - e0) * r())) / 1000) * 1000 : 0;
  const d: Deal = { id: ++L.seq, rid, stage: 'offer', until: s.day + LEGAL.ma.replyDays, day0: s.day, debt, seed };
  M.deals.push(d);
  return d;
}
export const dealOf = (s: P1State, id?: number) => (s.area?.ma?.deals ?? []).find((x) => id == null || x.id === id) ?? null;
/** 調査料（目安の値段の ddFee。ddMin から） */
export const ddFee = (s: P1State, rid: string) => Math.max(LEGAL.ma.ddMin, Math.round((guidePrice(s, rid) * LEGAL.ma.ddFee) / 1000) * 1000);
/** 調査の日数（調査の目利きで短い） */
export const ddDays = (s: P1State) => Math.max(1, Math.round(LEGAL.ma.ddDays * (has(s, 'lg_dd') ? 1 - LEGAL.ma.ddFast : 1)));
/** 調査で見える項目（月の売上・利益・店の数・隠れた借金はいつも。売れ筋は法務の理解度 3 から。訴えの種は調査の目利き） */
export const ddSees = (s: P1State) => ({ debt: true, top: legalLv(s) >= 3, seed: has(s, 'lg_dd') });
/** 調査（デューデリジェンス）を始める */
export function startDD(s: P1State, id: number): 'money' | 'stage' | null {
  const d = dealOf(s, id);
  if (!d || d.stage !== 'talk' || d.dd) return 'stage';
  const fee = ddFee(s, d.rid);
  if (s.money < fee) return 'money';
  s.money -= fee;
  book(s, 'legal', -fee);
  d.stage = 'dd';
  d.until = s.day + ddDays(s);
  return null;
}
/** 相手の本当の数字（調査の結果。見えない項目は null） */
export function ddFacts(s: P1State, d: Deal) {
  const r = s.rivals.find((x) => x.id === d.rid);
  const sales = r ? rivalSales(s, r) : 0;
  const margin = rivalDef(d.rid)?.margin ?? 0.1;
  const by = Object.entries(s.rivalLast?.[d.rid]?.by ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const seen = d.seen ?? { debt: false, seed: false, top: false };
  return {
    sales: Math.round(sales),
    profit: Math.round(sales * margin),
    margin,
    stores: storesOf(s, d.rid).length,
    ratio: shareRatio(s, d.rid),
    top: seen.top ? by.slice(0, 2).map(([k]) => k) : null,
    debt: seen.debt ? d.debt : null,
    seed: seen.seed ? d.seed : null,
  };
}
/** 提示の値段 */
export const offerPrice = (s: P1State, rid: string, level: OfferLevel) => Math.round((guidePrice(s, rid) * LEGAL.ma.offer[level]) / 10000) * 10000;
/** 条項の数 */
export const clauseCount = (c: Clauses) => (c.split ? 1 : 0) + (c.staff ? 1 : 0) + (c.noCompete ? 1 : 0);
/** 受ける見込み（0〜1）：提示の段 ＋ 企業の格・法務の理解度・M&A 部門・相手の状態（弱っている・2 位）・条項 */
export function offerChance(s: P1State, rid: string, level: OfferLevel, c: Clauses = {}): number {
  const M = LEGAL.ma;
  let v = M.chance[level];
  v += M.grade * gradeOf(s);
  v += Math.min(M.legalMax, M.legalLv * legalLv(s));
  v += M.panel * lvMul(s, 'e_ops_1');
  if (shareRatio(s, rid) < 0.8) v += M.weak;
  const rep = s.reports[s.reports.length - 1];
  if (rep && rep.area[1] && !rep.area[1].me && rep.area[1].name === nameOf(rid)) v += M.second;
  v += M.clause * ((c.split ? 1 : 0) + (c.noCompete ? 1 : 0)) + (c.staff ? M.staff : 0);
  return Math.max(0.05, Math.min(M.cap, v));
}
export type OfferErr = 'stage' | 'wait' | 'clauses' | 'money';
/** 提示できるか（同じか安い提示は、断られてから wait 日） */
export function offerLock(s: P1State, d: Deal, level: OfferLevel, c: Clauses = {}): OfferErr | null {
  if (d.stage !== 'talk') return 'stage';
  const order: OfferLevel[] = ['low', 'mid', 'high'];
  if (d.refused && s.day < d.refused.until && order.indexOf(level) <= order.indexOf(d.refused.level)) return 'wait';
  if (clauseCount(c) > clauseSlots(s)) return 'clauses';
  if (s.money < firstPay(s, d.rid, level, c)) return 'money';
  return null;
}
/** 合わせた値段（分割は +extra） */
export const totalPrice = (s: P1State, rid: string, level: OfferLevel, c: Clauses = {}) => Math.round(offerPrice(s, rid, level) * (c.split ? 1 + LEGAL.ma.split.extra : 1));
/** 成立のときに払う額（分割なら 1 回目） */
export const firstPay = (s: P1State, rid: string, level: OfferLevel, c: Clauses = {}) => Math.round(totalPrice(s, rid, level, c) / (c.split ? LEGAL.ma.split.months : 1));
/** 提示する（返事は negoDays 日後。受けるかどうかは、いまの見込みで決まる＝同じセーブなら同じ） */
export function sendOffer(s: P1State, id: number, level: OfferLevel, c: Clauses = {}): OfferErr | null {
  const d = dealOf(s, id);
  if (!d) return 'stage';
  const e = offerLock(s, d, level, c);
  if (e) return e;
  const chance = offerChance(s, d.rid, level, c);
  const ok = rng((s.seed >>> 0) + s.day * 131 + hashOf(d.rid) + ['low', 'mid', 'high'].indexOf(level) * 7)() < chance;
  d.offer = { level, clauses: { ...c }, price: totalPrice(s, d.rid, level, c), chance, ok };
  d.stage = 'nego';
  d.until = s.day + LEGAL.ma.negoDays;
  return null;
}
/** 話を取り下げる（成立の前だけ。払った調査料は戻らない） */
export function cancelDeal(s: P1State, id: number): boolean {
  const M = s.area?.ma;
  const d = dealOf(s, id);
  if (!M || !d || d.stage === 'signed') return false;
  M.deals = M.deals.filter((x) => x !== d);
  return true;
}
/** 1 日：話の段を進める（打診の返事・調査の終わり・提示の返事）。返り値はお知らせ（main.ts のトースト） */
function dealDay(s: P1State): { rid: string; what: 'talk' | 'dd' | 'yes' | 'no' }[] {
  const M = s.area?.ma;
  const out: { rid: string; what: 'talk' | 'dd' | 'yes' | 'no' }[] = [];
  if (!M) return out;
  for (const d of [...M.deals]) {
    if (d.stage === 'signed' || s.day < d.until) continue;
    if (!s.rivals.find((x) => x.id === d.rid && !x.gone)) {
      M.deals = M.deals.filter((x) => x !== d);
      continue;
    }
    if (d.stage === 'offer') {
      d.stage = 'talk';
      out.push({ rid: d.rid, what: 'talk' });
    } else if (d.stage === 'dd') {
      d.stage = 'talk';
      d.dd = true;
      d.seen = ddSees(s);
      out.push({ rid: d.rid, what: 'dd' });
    } else if (d.stage === 'nego' && d.offer) {
      if (d.offer.ok) {
        // 成立：払う（分割なら 1 回目。残りは月の締めごとに）。店が移るのは次の月の締め
        const c = d.offer.clauses;
        const first = Math.round(d.offer.price / (c.split ? LEGAL.ma.split.months : 1));
        payOut(s, first, 'ma');
        if (c.split) legalOf(s).pay.push({ amt: Math.round((d.offer.price - first) / (LEGAL.ma.split.months - 1)), left: LEGAL.ma.split.months - 1, what: nameOf(d.rid) });
        d.stage = 'signed';
        d.price = d.offer.price;
        d.clauses = { ...c };
        out.push({ rid: d.rid, what: 'yes' });
      } else {
        d.stage = 'talk';
        d.refused = { level: d.offer.level, until: s.day + LEGAL.ma.wait };
        out.push({ rid: d.rid, what: 'no' });
      }
      delete d.offer;
    }
  }
  return out;
}
/** 引き継ぐ商売の割合（従業員の引き継ぎ・工芸の工房の買収） */
export const keepRate = (s: P1State, staff: boolean) => (staff ? LEGAL.ma.keep.yes : LEGAL.ma.keep.no) + (has(s, 'e_tech_2') ? LEGAL.ma.tech : 0);
/**
 * 月の締めの前（model.ts の endMonth の、順位を決める前）：成立した買収の店が自社の店になる（建物・棚・売れ筋。在庫は少し）。
 * 相手は町から消え（ランキング・追随・巻き返しに出ない。空き店舗の入れ替わりにも入らない）、相手のエクステ以外の売上は引き継いだ商売になる。
 * 調べなかった隠れた借金は、ここで差し引く。見つけなかった訴えの種は、取引先からの訴えになる
 */
export function maClose(s: P1State, month: number): LegalMonth['closed'] {
  const M = s.area?.ma;
  const out: LegalMonth['closed'] = [];
  if (!M || !s.area) return out;
  for (const d of M.deals.filter((x) => x.stage === 'signed')) {
    const r = s.rivals.find((x) => x.id === d.rid);
    M.deals = M.deals.filter((x) => x !== d);
    if (!r) continue;
    const c = d.clauses ?? {};
    const keep = keepRate(s, !!c.staff);
    const base = rivalBase(s, r);
    const margin = rivalDef(r.id)?.margin ?? 0.1;
    const xs = s.area.stores.filter((x) => x.rid === r.id);
    const s0 = xs.reduce((a, x) => a + x.share0, 0) || 1;
    const goods = Object.entries(r.sells)
      .filter(([, w]) => (w ?? 0) > 0)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k]) => k)
      .filter((k) => PRODUCT[k]);
    const stores = storesOf(s, r.id);
    for (const b of stores) {
      const share = xs.find((x) => x.uid === b.uid)?.share0 ?? s0 / Math.max(1, stores.length);
      takeStore(s, b, goods, !!c.staff);
      M.biz.push({ uid: b.uid, rid: r.id, base: Math.round(((base * share) / s0) * keep), margin });
    }
    s.area.stores = s.area.stores.filter((x) => x.rid !== r.id);
    delete s.area.sum0[r.id];
    r.gone = true;
    r.sells = {};
    if (s.comeback?.rid === r.id) s.comeback.left = 0;
    const total = Math.round(base * keep);
    M.bought.push({ rid: r.id, month, day: s.day, stores: stores.length, price: d.price ?? 0, base: total, noCompete: !!c.noCompete });
    if (!c.noCompete) M.returns.push({ rid: r.id, month: month + LEGAL.ma.returnAfter, base: r.base * LEGAL.ma.returnBase });
    // 調べなかった隠れた借金は、ここで差し引く（調べて見つけた借金は売り手が払う）
    const debt = d.dd ? 0 : d.debt;
    if (debt > 0) payOut(s, debt, 'ma');
    // 見つけなかった訴えの種 → 買った会社の取引先からの訴え（調査の目利きで見つけていれば、売り手が片づける）
    if (d.seed > 0 && !d.seen?.seed) fileSuit(s, { kind: 'ma', side: 'def', by: 'partner', claim: d.seed, evidence: !!d.dd, key: r.id });
    const L = legalOf(s);
    L.tot.ma++;
    L.tot.maG += (d.price ?? 0) + debt;
    gainXp(s, 2);
    out.push({ rid: r.id, stores: stores.length, price: d.price ?? 0, debt });
  }
  if (out.length) areaTick(s);
  return out;
}
/** 他社の店を自社の店にする（建物はお店に。棚は相手の売れ筋・在庫は少し。店員ごと引き継げばすぐ開く＝アルバイト 1 人） */
function takeStore(s: P1State, b: PBuilding, goods: string[], staff: boolean) {
  b.id = P1B[b.id]?.kind === 'shop' ? b.id : 'general_store';
  b.owner = 'me';
  b.left = staff ? 0 : LEGAL.ma.noStaffDays;
  delete b.inv;
  delete s.shops[b.uid];
  syncShop(s, b);
  const sh = s.shops[b.uid];
  sh.aw = staff ? 1 : 0.6;
  sh.part = staff ? 1 : 0;
  goods.slice(0, sh.shelves.length).forEach((k, n) => {
    const x = `${k}:C` as const;
    sh.shelves[n] = x;
    sh.shelf[x] = LEGAL.ma.stock;
  });
}
/** 1 日：引き継いだ商売の売上（買った店が自社の店で開いているあいだ） */
function bizDay(s: P1State) {
  const M = s.area?.ma;
  if (!M?.biz.length || s.holdSales) return;
  const L = legalOf(s);
  for (const x of M.biz) {
    const b = s.buildings.find((y) => y.uid === x.uid);
    if (!b || b.owner !== 'me' || b.left > 0 || P1B[b.id]?.kind !== 'shop') continue;
    const rev = x.base / 30;
    const cost = rev * (1 - x.margin);
    s.money += rev - cost;
    book(s, 'sales', rev);
    spend(s, 'materials', cost);
    M.month += rev;
    M.cost += cost;
    L.tot.acqRev += rev;
  }
}
/** いまの町の引き継いだ商売の月の売上（見込み） */
export const bizMonthly = (s: P1State) => (s.area?.ma?.biz ?? []).filter((x) => s.buildings.some((b) => b.uid === x.uid && b.owner === 'me')).reduce((a, x) => a + x.base, 0);
/** 競業避止の無い買収：元のオーナーが新しい店を 1 軒出して町に戻ってくる（空き店舗か空き地。買ったときの売上の returnBase） */
function maReturns(s: P1State, month: number): string[] {
  const M = s.area?.ma;
  const out: string[] = [];
  if (!M || !s.area) return out;
  for (const x of [...M.returns]) {
    if (month < x.month) continue;
    const r = s.rivals.find((y) => y.id === x.rid);
    if (!r || !r.gone) {
      M.returns = M.returns.filter((y) => y !== x);
      continue;
    }
    const def = rivalDef(r.id);
    const vac = s.buildings.find((b) => isVacant(b));
    let b: PBuilding | undefined;
    const rnd = rng((s.seed >>> 0) + s.day * 17 + hashOf(r.id));
    if (vac) {
      vac.owner = r.id;
      s.area.vacant = s.area.vacant.filter((v) => v.uid !== vac.uid);
      b = vac;
    } else if (placeSpread(s, def?.store ?? 'general_store', rnd, r.id) || placeSpread(s, 'general_store', rnd, r.id)) b = s.buildings[s.buildings.length - 1];
    // 置ける場所が無ければ、次の月の締めにまた探す
    if (!b) continue;
    M.returns = M.returns.filter((y) => y !== x);
    r.gone = false;
    r.base = x.base;
    r.sells = Object.fromEntries(Object.entries(def?.sells ?? {}).map(([k, v]) => [k, (v ?? 0) * TIERS[s.tier ?? 'E'].rival]));
    delete r.follow;
    delete r.pull0;
    const now = areaShares(s).stores;
    s.area.stores.push({ uid: b.uid, rid: r.id, share0: Math.max(1e-4, now[b.uid] ?? 0), share: now[b.uid] ?? 0, weak: 0, main: false });
    s.area.sum0[r.id] = Math.max(1e-4, now[b.uid] ?? 0);
    out.push(r.id);
  }
  if (out.length) areaTick(s);
  return out;
}
/** 空き店舗の入れ替わり（model.ts の refillBy）に入れない会社：この町で買った会社（戻ってくるまで） */
export const boughtHere = (s: Pick<P1State, 'area'>, rid: string) => !!s.area?.ma?.bought.some((x) => x.rid === rid);

// ---------------------------------------------------------------- 仕入れの契約

/** 仕入れの契約の素材の値引き（Epic の町だけ。契約のあいだ） */
export function supplyCut(s: Pick<P1State, 'tier' | 'legal' | 'day'>): number {
  const c = s.legal?.supply;
  if (!c || !legalHere(s) || s.day >= c.end) return 0;
  return c.cut;
}
/** 期間と条項の値引き */
export const cutOf = (months: number, excl?: boolean) => (LEGAL.supply.cut[months] ?? 0) + (excl ? LEGAL.supply.excl : 0);
export type SupplyErr = 'off' | 'active' | 'clauses' | 'term';
export function supplyLock(s: P1State, months: number, c: Supply['clauses'] = {}): SupplyErr | null {
  if (!legalHere(s)) return 'off';
  if (!LEGAL.supply.terms.includes(months)) return 'term';
  if (s.legal?.supply && s.day < s.legal.supply.end) return 'active';
  if ((c.noPenalty ? 1 : 0) + (c.excl ? 1 : 0) > clauseSlots(s)) return 'clauses';
  return null;
}
/** 仕入れの契約を結ぶ */
export function signSupply(s: P1State, months: number, c: Supply['clauses'] = {}): SupplyErr | null {
  const e = supplyLock(s, months, c);
  if (e) return e;
  const L = legalOf(s);
  L.supply = { months, start: s.day, end: s.day + months * 30, cut: cutOf(months, c.excl), clauses: { ...c } };
  L.tot.contracts++;
  gainXp(s, 1);
  return null;
}
/** 途中でやめたときの違約金（違約金なしの条項なら 0。残りの月 × 先月の素材の費用 × penalty。上限 cap） */
export function supplyPenalty(s: P1State): number {
  const c = s.legal?.supply;
  if (!c || s.day >= c.end || c.clauses.noPenalty) return 0;
  const left = Math.ceil((c.end - s.day) / 30);
  const mats = s.reports[s.reports.length - 1]?.costs.materials ?? 0;
  return Math.min(LEGAL.supply.cap, Math.round((left * mats * LEGAL.supply.penalty * (c.clauses.excl ? LEGAL.supply.exclPen : 1)) / 1000) * 1000);
}
/** 途中でやめる：違約金を卸問屋が訴える（違約金なしの条項なら訴えは無い）。返り値は訴えの額 */
export function cancelSupply(s: P1State): number | null {
  const L = legalOf(s);
  if (!L.supply || s.day >= L.supply.end) return null;
  const pen = supplyPenalty(s);
  L.supply = null;
  if (pen > 0) {
    L.tot.penalty += pen;
    fileSuit(s, { kind: 'supply', side: 'def', by: 'wholesale', claim: pen, evidence: false });
  }
  return pen;
}

// ---------------------------------------------------------------- 特許

/** 特許にできる復刻品（Rare・Epic の復刻品のレシピが開いている） */
export const patentable = (s: P1State) => Object.keys(s.recipes ?? {}).filter((k) => PRODUCT[k]?.relic && (PRODUCT[k].relic!.rare || PRODUCT[k].relic!.epic));
export const patentOf = (s: Pick<P1State, 'legal'>, key: string) => s.legal?.patents.find((p) => p.key === key) ?? null;
/** 特許の期間（日。特許の事務所で長く） */
export const patentDays = (s: P1State) => Math.round((LEGAL.patent.months + LEGAL.patent.office * lvMul(s, 'lg_patent')) * 30);
/** 審査の日数（特許の事務所で −25%） */
export const examDays = (s: P1State) => Math.max(1, Math.round(LEGAL.patent.examDays * (has(s, 'lg_patent') ? 0.75 : 1)));
/** 特許が効いている（Epic の町・審査が終わって・期限の前） */
export function patentActive(s: Pick<P1State, 'tier' | 'legal' | 'day'>, key: string): boolean {
  const p = s.legal?.patents.find((x) => x.key === key);
  return !!p && p.grant != null && s.day < p.until && legalHere(s) && !LEGAL_OFF.patent;
}
/** 他社の追随を止める（特許が効いていて、貸していない） */
export const patentBlocks = (s: Pick<P1State, 'tier' | 'legal' | 'day'>, key: string) => patentActive(s, key) && !s.legal!.patents.find((x) => x.key === key)!.license;
/** 特許の残りの月（市場の見通しの「真似されない」） */
export const patentLeft = (s: P1State, key: string) => {
  const p = patentOf(s, key);
  return p && p.grant != null ? Math.max(0, Math.ceil((p.until - s.day) / 30)) : 0;
};
export type PatentErr = 'off' | 'none' | 'have' | 'money';
export function patentLock(s: P1State, key: string): PatentErr | null {
  if (!legalHere(s) || LEGAL_OFF.patent) return 'off';
  if (!patentable(s).includes(key)) return 'none';
  const p = patentOf(s, key);
  if (p && (p.grant == null || s.day < p.until)) return 'have';
  if (s.money < (p ? LEGAL.patent.renew : LEGAL.patent.fee)) return 'money';
  return null;
}
/** 出願する（切れた特許は更新＝更新料で、審査なしですぐ） */
export function filePatent(s: P1State, key: string): PatentErr | null {
  const e = patentLock(s, key);
  if (e) return e;
  const L = legalOf(s);
  const old = patentOf(s, key);
  if (old) {
    s.money -= LEGAL.patent.renew;
    book(s, 'legal', -LEGAL.patent.renew);
    old.grant = s.day;
    old.until = s.day + patentDays(s);
    old.stopped = 0;
    old.sued = false;
    return null;
  }
  s.money -= LEGAL.patent.fee;
  book(s, 'legal', -LEGAL.patent.fee);
  L.patents.push({ key, filed: s.day, grant: null, until: s.day + examDays(s), license: false, stopped: 0 });
  return null;
}
/** 使用料で貸す／貸すのをやめる */
export function setLicense(s: P1State, key: string, on: boolean): boolean {
  const p = patentOf(s, key);
  if (!p) return false;
  p.license = on;
  return true;
}
/** 特許を侵している他社（特許が効いていて、貸していないのに、その商品を売っている） */
export const infringers = (s: P1State, key: string) => (patentBlocks(s, key) ? s.rivals.filter((r) => !r.gone && (r.sells[key] ?? 0) > 0).map((r) => r.id) : []);
/**
 * 月の締め（model.ts の endMonth の他社の追随）：特許で他社の真似を止めた。止めた他社は sueP の確率で「無効の訴え」（1 つの特許に 1 回）
 */
export function patentStopped(s: P1State, key: string, rid: string | null) {
  const p = patentOf(s, key);
  if (!p) return;
  p.stopped++;
  const L = legalOf(s);
  L.month.stopped++;
  L.tot.stopped++;
  if (p.sued || !rid) return;
  p.sued = true;
  if (rng((s.seed >>> 0) + s.day * 29 + hashOf(key + rid))() >= LEGAL.patent.sueP) return;
  const mine = s.monthSales[key] ?? s.reports[s.reports.length - 1]?.bySeries[key] ?? 0;
  fileSuit(s, { kind: 'invalid', side: 'def', by: rid, key, claim: Math.max(20000, Math.round((mine * 0.25 * LEGAL.patent.claim) / 1000) * 1000), evidence: true });
}
/** 1 日：審査が終わった特許 */
function patentDay(s: P1State): string[] {
  const out: string[] = [];
  for (const p of s.legal?.patents ?? []) {
    if (p.grant != null || s.day < p.until) continue;
    p.grant = s.day;
    p.until = s.day + patentDays(s);
    out.push(p.key);
    legalOf(s).tot.patents++;
    gainXp(s, 1);
  }
  return out;
}
/** 月の締め：使用料（貸している特許・その月に他社がその商品を売った額 × royalty）と、切れた特許 */
function patentMonth(s: P1State, m: LegalMonth) {
  for (const p of s.legal?.patents ?? []) {
    if (p.grant == null) continue;
    if (s.day >= p.until) {
      if (!m.expired.includes(p.key) && s.day - p.until < 30) m.expired.push(p.key);
      continue;
    }
    if (!p.license || !legalHere(s)) continue;
    const sold = s.rivals.reduce((a, r) => a + (s.rivalLast?.[r.id]?.by[p.key] ?? 0), 0);
    const roy = Math.round(sold * LEGAL.patent.royalty);
    if (roy > 0) {
      receive(s, roy);
      m.royalty += roy;
      legalOf(s).tot.royalty += roy;
    }
  }
}

// ---------------------------------------------------------------- 争い

/**
 * 訴えを起こす・受ける（実際に起きたことからだけ呼ぶ。段 H3 の裏工作の発覚からの訴えもここで受ける：kind 'scheme'）。
 * こちらから訴えるときは file の費用
 */
export function fileSuit(s: P1State, o: { kind: SuitKind; side: 'def' | 'plain'; by: string; claim: number; evidence: boolean; key?: string }): Suit {
  const L = legalOf(s);
  if (o.side === 'plain') {
    s.money -= LEGAL.suit.file;
    book(s, 'legal', -LEGAL.suit.file);
  }
  const x: Suit = { id: ++L.seq, kind: o.kind, side: o.side, by: o.by, key: o.key, claim: Math.round(o.claim), day: s.day, months: LEGAL.suit.months, left: LEGAL.suit.months, evidence: o.evidence, status: 'open' };
  L.suits.push(x);
  L.month.newSuits++;
  L.tot.suits++;
  return x;
}
/** 特許を侵した他社を訴える（勝つとその商品を売るのをやめ、賠償金が入る） */
export function sueInfringer(s: P1State, key: string, rid: string): 'none' | 'money' | 'have' | null {
  if (!infringers(s, key).includes(rid)) return 'none';
  if (s.legal?.suits.some((x) => x.status === 'open' && x.kind === 'infringe' && x.by === rid && x.key === key)) return 'have';
  if (s.money < LEGAL.suit.file) return 'money';
  const theirs = s.rivalLast?.[rid]?.by[key] ?? 0;
  fileSuit(s, { kind: 'infringe', side: 'plain', by: rid, key, claim: Math.max(10000, Math.round((theirs * LEGAL.suit.dmg) / 1000) * 1000), evidence: true });
  return null;
}
/** 担当のヒーローの INT（法務の部長か、契約と特許の見直しのリーダー） */
function counselInt(s: P1State): number | null {
  const st = headOf(s, 'legal') ?? leaderOf(s, 'renew');
  return st ? st.stats.int : null;
}
/** 勝ちの見込みの内訳 */
export function suitParts(s: P1State, x: Pick<Suit, 'side' | 'evidence'>) {
  const S = LEGAL.suit;
  const int = counselInt(s);
  return {
    base: x.side === 'def' ? S.base.def : S.base.plain,
    lv: Math.min(S.legalMax, S.legalLv * legalLv(s)),
    counsel: S.counsel * lvMul(s, 'lg_counsel'),
    evidence: x.evidence ? S.evidence : 0,
    grade: S.grade * gradeOf(s),
    hero: int != null ? Math.max(0, (int - S.int[0]) * S.int[1]) : 0,
  };
}
/** 勝ちの見込み（0〜1） */
export function suitChance(s: P1State, x: Pick<Suit, 'side' | 'evidence'>): number {
  const p = suitParts(s, x);
  return Math.max(LEGAL.suit.floor, Math.min(LEGAL.suit.cap, p.base + p.lv + p.counsel + p.evidence + p.grade + p.hero));
}
/** 和解の額（訴えられた側は払う・訴えた側は受け取る） */
export const settleAmt = (x: Suit) => Math.round((x.claim * LEGAL.suit.settle) / 1000) * 1000;
/** 和解する（すぐ終わる） */
export function settle(s: P1State, id: number): boolean {
  const L = legalOf(s);
  const x = L.suits.find((y) => y.id === id && y.status === 'open');
  if (!x) return false;
  const v = settleAmt(x);
  if (x.side === 'def') x.paid = payOut(s, Math.min(v, LEGAL.suit.maxPay));
  else {
    receive(s, v);
    x.got = v;
    stopInfringe(s, x);
  }
  x.status = 'settled';
  L.month.settled++;
  L.tot.settled++;
  gainXp(s, 1);
  return true;
}
function stopInfringe(s: P1State, x: Suit) {
  if (x.kind !== 'infringe' || !x.key) return;
  const r = s.rivals.find((y) => y.id === x.by);
  if (!r) return;
  delete r.sells[x.key];
  if (r.follow) delete r.follow[x.key];
  if (r.pull0) delete r.pull0[x.key];
  if (!r.quit?.includes(x.key)) (r.quit ??= []).push(x.key);
}
/** 月の締め：裁判を 1 か月進める。終わったら判決（勝ちの見込みで。同じセーブなら同じ）。負けても払うのは maxPay まで */
function suitMonth(s: P1State, m: LegalMonth) {
  const L = legalOf(s);
  for (const x of L.suits) {
    if (x.status !== 'open' || x.day >= s.day) continue;
    x.left--;
    if (x.left > 0) continue;
    const win = rng((s.seed >>> 0) + x.id * 977 + x.day)() < suitChance(s, x);
    x.status = win ? 'won' : 'lost';
    if (win) {
      m.won++;
      L.tot.won++;
      if (x.side === 'plain') {
        receive(s, x.claim);
        x.got = x.claim;
        m.got += x.claim;
        stopInfringe(s, x);
      }
    } else {
      m.lost++;
      L.tot.lost++;
      if (x.side === 'def') {
        x.paid = payOut(s, Math.min(x.claim, LEGAL.suit.maxPay));
        m.paid += x.paid;
      }
    }
    gainXp(s, 1);
  }
}
export const openSuits = (s: Pick<P1State, 'legal'>) => (s.legal?.suits ?? []).filter((x) => x.status === 'open');
export const SUIT_NAME: Record<SuitKind, () => string> = {
  supply: () => t('卸問屋からの違約金の訴え', 'Wholesaler’s penalty suit'),
  ma: () => t('買った会社の取引先からの訴え', 'Suit from an acquired company’s partner'),
  invalid: () => t('特許の無効の訴え', 'Patent invalidity suit'),
  infringe: () => t('特許の侵害の訴え（こちらから）', 'Patent infringement suit (yours)'),
  scheme: () => t('裏工作の訴え', 'Suit over a covert scheme'),
};
export const byName = (by: string) => (by === 'wholesale' ? t('卸問屋', 'Wholesaler') : by === 'partner' ? t('取引先', 'Trade partner') : nameOf(by));

// ---------------------------------------------------------------- 1 日・月の締め（model.ts から）

export interface LegalDay {
  deals: ReturnType<typeof dealDay>;
  granted: string[];
}
/** 1 日：M&A の話・特許の審査・引き継いだ商売の売上 */
export function legalDay(s: P1State): LegalDay | null {
  if (!s.legal && !s.area?.ma) return null;
  const deals = legalHere(s) ? dealDay(s) : [];
  const granted = patentDay(s);
  bizDay(s);
  return deals.length || granted.length ? { deals, granted } : null;
}
/** 月の報告の法務の行 */
export interface LegalReport {
  closed: LegalMonth['closed'];
  back: string[];
  acq: number;
  granted: string[];
  expired: string[];
  stopped: number;
  royalty: number;
  newSuits: number;
  won: number;
  lost: number;
  settled: number;
  open: number;
  paid: number;
  got: number;
  saved: number;
}
/**
 * 月の締め（model.ts の endMonth。順位を決めたあと）：元のオーナーの戻り・分割の支払い・払いきれていないお金・使用料・切れた特許・裁判の進み・報告
 */
export function legalMonth(s: P1State, r: Report, closed: LegalMonth['closed']) {
  if (!s.legal && !s.area?.ma) return;
  const L = legalOf(s);
  const m = L.month;
  m.closed.push(...closed);
  m.back.push(...maReturns(s, r.month));
  // 分割の支払い
  for (const p of [...L.pay]) {
    payOut(s, p.amt, 'ma');
    p.left--;
    if (p.left <= 0) L.pay = L.pay.filter((x) => x !== p);
  }
  // 払いきれていないお金（資金が TAX.keep を切らないぶんだけ）
  if (L.owed > 0) {
    const o = L.owed;
    L.owed = 0;
    payOut(s, o);
  }
  patentMonth(s, m);
  suitMonth(s, m);
  // 仕入れの契約で安くなったぶん（この町の今月の素材の費用から）
  const cut = supplyCut(s);
  if (cut > 0) {
    const sv = Math.round((r.costs.materials - (s.area?.ma?.cost ?? 0)) * (cut / (1 - cut)));
    m.saved += sv;
    L.tot.saved += sv;
  }
  const M = s.area?.ma;
  const acq = Math.round(M?.month ?? 0);
  if (M) {
    M.month = 0;
    M.cost = 0;
  }
  const any = m.closed.length || m.back.length || acq || m.granted.length || m.expired.length || m.stopped || m.royalty || m.newSuits || m.won || m.lost || m.settled || openSuits(s).length || m.saved;
  if (any) r.legal = { closed: m.closed, back: m.back, acq, granted: m.granted, expired: m.expired, stopped: m.stopped, royalty: m.royalty, newSuits: m.newSuits, won: m.won, lost: m.lost, settled: m.settled, open: openSuits(s).length, paid: m.paid, got: m.got, saved: m.saved };
  L.month = newLegalMonth();
}
/** 今月の引き継いだ商売の売上（model.ts の endMonth・monthRevenue） */
export const acqMonth = (s: Pick<P1State, 'area'>) => s.area?.ma?.month ?? 0;
/** 特許の審査が終わった（報告に載せる） */
export function noteGranted(s: P1State, keys: string[]) {
  if (keys.length) legalOf(s).month.granted.push(...keys);
}

/** 部門の理解度の経験の分（dept.ts の deptLevel） */
export const legalXp = (s: Partial<Pick<P1State, 'legal'>>) => s.legal?.xp ?? 0;
/** 引き継いだ商売のある、いまの町の店か */
export const isAcquired = (s: P1State, uid: number) => !!s.area?.ma?.biz.some((x) => x.uid === uid);
