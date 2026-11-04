/**
 * カスタマーサポートと炎上（段 G。docs/ISLAND_PHASE1.md「カスタマーサポート」「炎上」・docs/SUCCESSOR_ROADMAP.md 4-9・4-7）。
 * DOM なし。数字は data.ts の CS・FLAME の 1 か所。テストは tests/island-p1-cs-mkt.test.ts。
 *
 * - 問い合わせは Uncommon 以上の町だけ（Common の町・タオックスのチュートリアルには来ない）。先月の実際の数字（品切れの日・お店が閉まっていた日・値段の高さ）から、
 *   月の締めに届く。返事を手で選ぶ（謝る・返金・代わりの品）。中身に合う返事で顧客満足度が大きく上がり、期限が切れると下がる。
 * - 顧客満足度（0〜100。会社のもの）は、Uncommon 以上の町の来店（リピーター）とブランド力に小さく効く。初めは CS.start（古いセーブも）。
 * - 炎上：品切れの続き・問い合わせの放っておきが 1 か月目は「炎上のおそれ」の予告、手を打たずに 2 か月続くと炎上。来店とブランド力が一時的に下がり、数か月で戻る。
 * - 返金・お詫びの告知・火消しの費用は、宣伝と同じ販促の費用（帳簿の ads）。経費なので、もともと課税の対象の利益から引かれる（節税の差し引きには足さない＝二重に引かない）。
 */
import { t } from '../../i18n';
import { CS, FLAME, PRODUCT, REPLY_FIT, skuParts, skuPrice, type InqKind, type ReplyKind, type Sku } from './data';
import { brandAdd } from './company';
import { priceMul } from './acct';
import { headFx } from './deleg';
import { polFx } from './policy';
import { lessonFx } from './lesson';
import { moraleAdd } from './hr';
import { has, myShops, priceAt, spend, staffOf, type P1State, type Report } from './model';

/**
 * 段 G を止める（自動プレイ・テストで「段 G の前」と比べるためだけ。ふつうのゲームでは使わない）：問い合わせ・満足度の効き目・炎上・企業の格の効き目が無い
 */
export const CS_OFF = { on: false };

/** 問い合わせ 1 件 */
export interface Inquiry {
  id: number;
  kind: InqKind;
  /** どの商品の話か（品切れ・値段。閉まっていたは null） */
  key: string | null;
  /** 届いた日 */
  day: number;
}
/** 今月の記録（月次報告） */
export interface CsMonth {
  got: number;
  answered: number;
  good: number;
  expired: number;
  auto: number;
  refund: number;
}
/** 炎上のおそれ（予告）：原因・出た日・手を打った（お詫びの告知） */
export interface FlameWarn {
  cause: 'out' | 'ignore';
  day: number;
  done?: boolean;
}
/** 炎上中：熱さ（1 → 0）・原因・起きた日・下げたブランド力と戻したぶん・次に火消しできる日 */
export interface Flame {
  heat: number;
  cause: 'out' | 'ignore';
  day: number;
  lost: number;
  back: number;
  cool?: number;
}
export interface CsState {
  /** 顧客満足度（0〜100） */
  sat: number;
  inbox: Inquiry[];
  next: number;
  /** 今月の品切れの日・お店が閉まっていた日（月の締めで問い合わせにする） */
  out: number;
  closed: number;
  /** FAQ・サポートセンターの端数（次の月へ持ち越す） */
  carry: number;
  autoCarry: number;
  month: CsMonth;
  warn: FlameWarn | null;
  flame: Flame | null;
  /** これまでの炎上・予告の回数・期限切れの数（会社ぜんたい。自動プレイ・リーダーの報告） */
  flames: number;
  warns: number;
  expTotal: number;
  /** 広報（mkt.ts）：最後に良いニュースを出した日・出せる良いニュース */
  prDay?: number;
  news: { kind: import('./data').PrKind; label: string; day: number }[];
}
export const newCsMonth = (): CsMonth => ({ got: 0, answered: 0, good: 0, expired: 0, auto: 0, refund: 0 });
export const newCs = (): CsState => ({ sat: CS.start, inbox: [], next: 1, out: 0, closed: 0, carry: 0, autoCarry: 0, month: newCsMonth(), warn: null, flame: null, flames: 0, warns: 0, expTotal: 0, news: [] });
export const csOf = (s: P1State): CsState => (s.cs ??= newCs());

/** 問い合わせ・炎上がある町か（Uncommon 以上の町） */
export const csOn = (s: Pick<P1State, 'tier'>) => !CS_OFF.on && (s.tier ?? 'C') !== 'C';
/** 顧客満足度 */
export const satOf = (s: P1State) => Math.round(s.cs?.sat ?? CS.start);
/** 返事の期限（日。返品の決まりで長く） */
export const expireDays = (s: P1State) => (has(s, 'cs_policy') ? CS.policyDays : CS.expire);
/** 問い合わせの期限まで（日） */
export const daysLeft = (s: P1State, q: Inquiry) => Math.max(0, q.day + expireDays(s) - s.day);
/** サポートセンターが自動で受ける割合 */
export const centerRate = (s: P1State) => (has(s, 'cs_center') ? Math.min(0.9, CS.center.base + CS.center.perLv * (Math.max(1, s.skillLv?.cs_center ?? 1) - 1)) : 0);
/** 合う返事の満足度の倍率（満足度の調査・カスタマーサポートの部長） */
/** 段 K：× 経営方針（カスタマーサクセス）の「返事で上がる顧客満足度 +%」 */
export const careMul = (s: P1State) => (1 + (has(s, 'cs_survey') ? CS.care : 0)) * (1 + headFx(s, 'support')) * (1 + polFx(s, 'sat'));

/**
 * 顧客満足度の来店（リピーター）の倍率。Uncommon 以上の町だけ（Common の町は 1）。はじめの CS.start で 1、
 * 上は 100 で ×(1 + up)、下は 0 で ×(1 − down)。満足度の調査で効く分 ×survey
 */
export function repeatMul(s: P1State): number {
  if (!csOn(s)) return 1;
  const v = satOf(s) - CS.start;
  const k = has(s, 'cs_survey') ? CS.survey : 1;
  return 1 + k * (v >= 0 ? (v / (100 - CS.start)) * CS.up : (v / CS.start) * CS.down);
}
/** 炎上の来店の倍率（熱さ 1 で ×(1 − hit)） */
export const flameMul = (s: P1State) => (csOn(s) && s.cs?.flame ? 1 - FLAME.hit * s.cs.flame.heat : 1);
/** 自社のお店に来るお客さんの倍率（満足度 × 炎上。model.ts の capture） */
export const visitMul = (s: P1State) => repeatMul(s) * flameMul(s);

/** 満足度を足す（0〜100）。段 S1：顧客の教えで、下がるときはゆるく（lesson.ts） */
export function satAdd(s: P1State, d: number) {
  const C = csOf(s);
  if (d < 0) d *= 1 - lessonFx(s, 'sat');
  C.sat = Math.max(0, Math.min(100, C.sat + d));
}

// ---------------------------------------------------------------- 1 日（model.ts の step から）

/** お店の主力商品（1 番目の棚） */
const main = (sh: { shelves: (Sku | null)[] }) => sh.shelves[0] ?? null;
/** 1 日：品切れの日・閉まっていた日を数え、期限の切れた問い合わせを消す（満足度が下がる）。返り値は今日期限が切れた数 */
export function csDay(s: P1State): number {
  if (!csOn(s) || s.open === null || s.holdSales) return 0;
  const C = csOf(s);
  let out = false;
  let closed = false;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh || !sh.shelves.some((x) => !!x)) continue;
    const st = sh.staff != null ? staffOf(s, sh.staff) : null;
    const open = (!!st && !st.resting) || sh.part > 0;
    if (!open) closed = true;
    // 品切れ：主力商品（1 番目の棚）が、棚にもお店の裏にも無い（SCM の「主力商品が品切れ」と同じ）
    else if (main(sh) && (sh.shelf[main(sh)!] ?? 0) <= 0 && (sh.storage[main(sh)!] ?? 0) <= 0) out = true;
  }
  if (out) C.out++;
  if (closed) C.closed++;
  let n = 0;
  const left = C.inbox.filter((q) => {
    if (daysLeft(s, q) > 0) return true;
    n++;
    return false;
  });
  if (n) {
    C.inbox = left;
    satAdd(s, CS.ignore * n);
    C.month.expired += n;
    C.expTotal += n;
  }
  return n;
}

// ---------------------------------------------------------------- 月の締め（model.ts の endMonth から）

/** 自社の値段が町の相場（もとの単価 × 物価）より何割高いか（並べている商品の平均） */
export function pricePremium(s: P1State): number {
  const xs: number[] = [];
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    for (const x of sh?.shelves ?? []) if (x) xs.push(priceAt(s, x, sh) / Math.max(1, skuPrice(x) * priceMul(s)) - 1);
  }
  return xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : 0;
}
/** 品切れの話の商品（お店の主力商品。いま品切れのものを先に） */
function outKey(s: P1State): string | null {
  let any: string | null = null;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    const x = sh ? main(sh) : null;
    if (!x) continue;
    any ??= skuParts(x)[0];
    if ((sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0) return skuParts(x)[0];
  }
  return any;
}
/** 値段の話の商品（相場よりいちばん高いもの） */
function priceKey(s: P1State): string | null {
  let best: [number, string] | null = null;
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    for (const x of sh?.shelves ?? []) {
      if (!x) continue;
      const v = priceAt(s, x, sh) / Math.max(1, skuPrice(x) * priceMul(s));
      if (!best || v > best[0]) best = [v, skuParts(x)[0]];
    }
  }
  return best?.[1] ?? null;
}
/** 先月の数字から作る問い合わせ（FAQ の前）。並びは品切れ・値段・閉まっていたを交互に */
export function inquiriesFor(s: P1State, out: number, closed: number): Inquiry[] {
  const C = csOf(s);
  const prem = pricePremium(s);
  const nOut = Math.min(CS.outMax, Math.floor(out / CS.outPer));
  const nPrice = prem >= CS.priceAt2 ? 2 : prem >= CS.priceAt ? 1 : 0;
  const nClosed = Math.min(CS.closedMax, Math.floor(closed / CS.closedPer));
  const ko = outKey(s);
  const kp = priceKey(s);
  const list: Inquiry[] = [];
  for (let k = 0; k < Math.max(nOut, nPrice, nClosed); k++) {
    if (k < nOut) list.push({ id: 0, kind: 'out', key: ko, day: s.day });
    if (k < nPrice) list.push({ id: 0, kind: 'price', key: kp, day: s.day });
    if (k < nClosed) list.push({ id: 0, kind: 'closed', key: null, day: s.day });
  }
  // FAQ：届く数 −faq（端数は次の月へ）
  if (has(s, 'cs_faq') && list.length) {
    const want = list.length * (1 - CS.faq) + C.carry;
    const keep = Math.floor(want);
    C.carry = want - keep;
    list.length = Math.min(list.length, keep);
  }
  for (const q of list) q.id = C.next++;
  return list;
}

/** 月の締めのカスタマーサポートの報告（月次報告の「🎧 お客さんの声」） */
export interface CsReport {
  got: number;
  answered: number;
  good: number;
  expired: number;
  auto: number;
  /** 締めの時点の満足度・先月の締めの満足度 */
  sat: number;
  prev: number;
  /** 先月の品切れの日・閉まっていた日 */
  out: number;
  closed: number;
  /** 受け箱に残っている数 */
  open: number;
  /** 炎上のおそれ（予告。この締めで出た／続いている） */
  warn?: 'out' | 'ignore';
  /** 炎上（この締めで起きた・続いている熱さ） */
  ignited?: 'out' | 'ignore';
  heat?: number;
}

/**
 * 月の締め（いまの町）：先月の数字から問い合わせを作る（サポートセンターが一部を受ける）・満足度がはじめの値へ少し戻る・満足度のブランド力・
 * 炎上の予告と炎上・炎上の熱さが下がる。Uncommon 以上の町だけ（Common の町では炎上の熱さが下がるだけ）
 */
export function csMonth(s: P1State, r: Report) {
  const C = csOf(s);
  const prev = Math.round(r.cs?.prev ?? lastSat(s));
  // 炎上中：熱さが下がる（ブランド力は熱さに合わせて戻る）
  if (C.flame) cool(s, 1 / FLAME.months);
  if (!csOn(s)) {
    C.out = 0;
    C.closed = 0;
    C.month = newCsMonth();
    return;
  }
  const out = C.out;
  const closed = C.closed;
  const fresh = inquiriesFor(s, out, closed);
  C.month.got += fresh.length;
  // サポートセンター：届いた問い合わせの一部を自動で受ける（出来 CS.center.q）
  const rate = centerRate(s);
  if (rate > 0 && fresh.length) {
    const want = fresh.length * rate + C.autoCarry;
    const n = Math.min(fresh.length, Math.floor(want));
    C.autoCarry = want - n;
    fresh.splice(0, n);
    satAdd(s, CS.good * CS.center.q * careMul(s) * n);
    C.month.auto += n;
  }
  // 受け箱（入りきらないぶんは、放っておいたのと同じ）
  C.inbox.push(...fresh);
  if (C.inbox.length > CS.inboxMax) {
    const over = C.inbox.length - CS.inboxMax;
    C.inbox.splice(0, over);
    satAdd(s, CS.ignore * over);
    C.month.expired += over;
    C.expTotal += over;
  }
  // はじめの値へ少し戻る
  satAdd(s, (CS.start - C.sat) * CS.drift);
  // 満足度のブランド力
  if (C.sat >= CS.brandHi) brandAdd(s, 1, t('顧客満足度が高い', 'High customer satisfaction'));
  else if (C.sat <= CS.brandLo) brandAdd(s, -1, t('顧客満足度が低い', 'Low customer satisfaction'));
  // 炎上の予告と炎上
  const cause: 'out' | 'ignore' | null = out >= FLAME.outDays ? 'out' : C.month.expired >= FLAME.ignored ? 'ignore' : null;
  let ignited: 'out' | 'ignore' | undefined;
  if (!C.flame) {
    if (C.warn && !C.warn.done && cause) {
      ignited = cause;
      ignite(s, cause);
      C.warn = null;
    } else if (cause) {
      C.warn = { cause, day: s.day };
      C.warns++;
    } else C.warn = null;
  } else C.warn = null;
  r.cs = {
    got: C.month.got,
    answered: C.month.answered,
    good: C.month.good,
    expired: C.month.expired,
    auto: C.month.auto,
    sat: Math.round(C.sat),
    prev,
    out,
    closed,
    open: C.inbox.length,
    ...(C.warn ? { warn: C.warn.cause } : {}),
    ...(ignited ? { ignited } : {}),
    ...(C.flame ? { heat: Math.round(C.flame.heat * 100) / 100 } : {}),
  };
  C.out = 0;
  C.closed = 0;
  C.month = newCsMonth();
}
/** 先月の締めの満足度（報告から。無ければいま） */
function lastSat(s: P1State): number {
  for (let k = s.reports.length - 1; k >= 0; k--) if (s.reports[k].cs) return s.reports[k].cs!.sat;
  return s.cs?.sat ?? CS.start;
}

/** 炎上が起きる：来店とブランド力が下がる・全員の士気が少し下がる */
function ignite(s: P1State, cause: 'out' | 'ignore') {
  const C = csOf(s);
  const before = s.brand ?? 0;
  brandAdd(s, -FLAME.brand, cause === 'out' ? t('炎上（品切れが続いた）', 'Backlash (repeated sell-outs)') : t('炎上（問い合わせを放っておいた）', 'Backlash (ignored inquiries)'));
  const lost = before - (s.brand ?? 0);
  C.flame = { heat: 1, cause, day: s.day, lost, back: 0 };
  C.flames++;
  for (const st of s.staff) moraleAdd(s, st, -FLAME.morale);
}
/** 炎上の熱さを下げる（下がったぶん、ブランド力が戻る）。熱さ 0 で終わり */
export function cool(s: P1State, d: number) {
  const F = s.cs?.flame;
  if (!F || d <= 0) return;
  F.heat = Math.max(0, F.heat - d);
  const want = Math.round(F.lost * (1 - F.heat));
  if (want > F.back) {
    brandAdd(s, want - F.back, t('炎上がおさまってきた', 'The backlash is dying down'));
    F.back = want;
  }
  if (F.heat <= 0.001) s.cs!.flame = null;
}

// ---------------------------------------------------------------- 返事（手で選ぶ・リーダー）

/** 返金の額（並べている商品の平均の単価 × CS.refundUnits。返品の決まりで −policyCut） */
export function refundCost(s: P1State): number {
  const xs: number[] = [];
  for (const b of myShops(s)) for (const x of s.shops[b.uid]?.shelves ?? []) if (x) xs.push(priceAt(s, x, s.shops[b.uid]));
  const unit = xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : CS.refundMin;
  return Math.round(Math.max(CS.refundMin, unit * CS.refundUnits) * (has(s, 'cs_policy') ? 1 - CS.policyCut : 1));
}
/** 代わりの品に出す商品（工房・お店の裏の在庫のうち、いちばん安いもの。CS.swapUnits 個あるもの） */
export function swapItem(s: P1State): Sku | null {
  const have = new Map<Sku, number>();
  for (const [x, n] of Object.entries(s.stock) as [Sku, number][]) have.set(x, (have.get(x) ?? 0) + (n ?? 0));
  for (const b of myShops(s)) for (const [x, n] of Object.entries(s.shops[b.uid]?.storage ?? {}) as [Sku, number][]) have.set(x, (have.get(x) ?? 0) + (n ?? 0));
  let best: Sku | null = null;
  for (const [x, n] of have) if (n >= CS.swapUnits && PRODUCT[skuParts(x)[0]] && (!best || skuPrice(x) < skuPrice(best))) best = x;
  return best;
}
/** その返事ができない理由（お金が足りない・在庫が無い） */
export function replyLock(s: P1State, r: ReplyKind): 'money' | 'stock' | null {
  if (r === 'refund' && s.money < refundCost(s)) return 'money';
  if (r === 'swap' && !swapItem(s)) return 'stock';
  return null;
}
/** 合う返事か */
export const fits = (q: Pick<Inquiry, 'kind'>, r: ReplyKind) => REPLY_FIT[q.kind] === r;
/** 返事で上がる満足度の見込み */
export const replyGain = (s: P1State, q: Pick<Inquiry, 'kind'>, r: ReplyKind) => (fits(q, r) ? CS.good * careMul(s) : CS.ok);

/** 問い合わせに返事をする（受け箱から消える）。合う返事なら満足度が大きく上がり、炎上中なら熱さも下がる */
export function reply(s: P1State, id: number, r: ReplyKind): 'none' | 'money' | 'stock' | null {
  const C = csOf(s);
  const q = C.inbox.find((x) => x.id === id);
  if (!q) return 'none';
  const lock = replyLock(s, r);
  if (lock) return lock;
  if (r === 'refund') {
    const cost = refundCost(s);
    s.money -= cost;
    spend(s, 'ads', cost);
    C.month.refund += cost;
  } else if (r === 'swap') takeUnits(s, swapItem(s)!, CS.swapUnits);
  C.inbox = C.inbox.filter((x) => x.id !== id);
  satAdd(s, replyGain(s, q, r));
  C.month.answered++;
  if (fits(q, r)) {
    C.month.good++;
    if (C.flame) cool(s, FLAME.reply);
  }
  return null;
}
/** 在庫から n 個（工房 → お店の裏の順） */
function takeUnits(s: P1State, x: Sku, n: number) {
  let left = n;
  const a = Math.min(left, s.stock[x] ?? 0);
  s.stock[x] = (s.stock[x] ?? 0) - a;
  left -= a;
  for (const b of myShops(s)) {
    if (left <= 0) break;
    const sh = s.shops[b.uid];
    const k = Math.min(left, sh?.storage[x] ?? 0);
    if (!k) continue;
    sh.storage[x] = (sh.storage[x] ?? 0) - k;
    left -= k;
  }
}
/** 合う返事（できなければ謝る）。リーダー・自動プレイ */
export function bestReply(s: P1State, q: Inquiry): ReplyKind {
  const r = REPLY_FIT[q.kind];
  return replyLock(s, r) ? 'sorry' : r;
}

// ---------------------------------------------------------------- 炎上の予告に手を打つ・火消し

/** お詫びの告知の費用（危機管理の手引きで −50%） */
export const noticeCost = (s: P1State) => Math.round(FLAME.notice[s.tier ?? 'C'] * (has(s, 'mk_crisis') ? 0.5 : 1));
/** 炎上のおそれに手を打つ（お詫びの告知）：その予告からは炎上しない */
export function apologize(s: P1State): 'none' | 'money' | null {
  const W = s.cs?.warn;
  if (!W || W.done) return 'none';
  const cost = noticeCost(s);
  if (s.money < cost) return 'money';
  s.money -= cost;
  spend(s, 'ads', cost);
  W.done = true;
  return null;
}
/** 火消しの費用・熱さの下げ幅（危機管理の手引きで ×1.5） */
export const putCost = (s: P1State) => FLAME.putCost[s.tier ?? 'C'];
export const putPower = (s: P1State) => FLAME.put * (has(s, 'mk_crisis') ? FLAME.crisis : 1);
export function putLock(s: P1State): 'none' | 'cool' | 'money' | null {
  const F = s.cs?.flame;
  if (!F) return 'none';
  if ((F.cool ?? 0) > s.day) return 'cool';
  if (s.money < putCost(s)) return 'money';
  return null;
}
/** 広報の火消し：炎上の熱さを下げる（putCool 日に 1 回） */
export function putOut(s: P1State): 'none' | 'cool' | 'money' | null {
  const lock = putLock(s);
  if (lock) return lock;
  const cost = putCost(s);
  s.money -= cost;
  spend(s, 'ads', cost);
  s.cs!.flame!.cool = s.day + FLAME.putCool;
  cool(s, putPower(s));
  return null;
}

/** ほかの町へ移る（land.ts の moveTo）：前の町の問い合わせ・予告・今月の数えは消える（炎上の熱さは会社のものなので残る） */
export function csMove(s: P1State) {
  const C = s.cs;
  if (!C) return;
  C.inbox = [];
  C.warn = null;
  C.out = 0;
  C.closed = 0;
}

/** 問い合わせの文（受け箱のカード） */
export function inquiryText(q: Inquiry): string {
  const name = q.key ? PRODUCT[q.key]?.name ?? q.key : '';
  switch (q.kind) {
    case 'out':
      return name ? t(`「『${name}』を買いに行ったら売り切れでした。いつ入りますか？」`, `“I came for ${name} but it was sold out. When will it be back?”`) : t('「買いに行ったら売り切れでした。」', '“It was sold out when I came.”');
    case 'price':
      return name ? t(`「『${name}』、ほかのお店より高くないですか？」`, `“Isn’t ${name} pricier than elsewhere?”`) : t('「ほかのお店より高くないですか？」', '“Aren’t you pricier than other shops?”');
    case 'closed':
      return t('「行ったらお店が閉まっていました。」', '“I went and the shop was closed.”');
  }
}
export const KIND_NAME: Record<InqKind, () => string> = {
  out: () => t('品切れ', 'Sold out'),
  price: () => t('値段', 'Price'),
  closed: () => t('閉まっていた', 'Closed'),
};
export const REPLY_NAME: Record<ReplyKind, () => string> = {
  sorry: () => t('謝る', 'Apologize'),
  refund: () => t('返金', 'Refund'),
  swap: () => t('代わりの品', 'Substitute'),
};
