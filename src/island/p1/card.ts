/**
 * 提案・報告のカード（段 UI1。DOM なし：model.ts の step・cardui.ts・main.ts・自動プレイ・テストが使う）。
 * 話し手（ヒーロー・お客さん・マインちゃん）・肩書き・いま感じている課題（60 字まで）・2〜3 択。時間を止めて出す数は控えめ（CARD.cap）で、
 * あふれたものは受け箱（経営企画 → 部長の提案）に入るだけ。
 *
 * 出どころ：
 * - ヒーローからの提案：店員（販売が詰まり）・工房の職人（製造が詰まり）・調達係（調達が詰まり）・待機中のヒーロー（持ち場・宣伝・発掘）・事業部長（いまの部長の提案）
 * - いまある「選ばせる知らせ」：問い合わせ（CS）・炎上の予告・辞めたい・経理の助言（決算の前）・他社の巻き返し／反撃
 * 選択肢の効き目・値段・期限はいまの手のまま（deleg.ts の execute・cs.ts の reply・hr.ts の talk ほか）。
 * 仕様は docs/ISLAND_PHASE1.md「提案・報告のカード」「ヒーローの個性」。数字は data.ts の CARD。
 */
import { t } from '../../i18n';
import { ADS, CARD, CLEAR, DELEG, DEPT, INVEST, skuParts, MATS, MORALE, P1B, PAY, PRODUCT, SELF_RUN, SKILL, TAX, type DeptId, type InqKind, type ReplyKind, type Sku, type Task } from './data';
import {
  actOk,
  actName,
  approve,
  candidates,
  errMul,
  findLot,
  headOf,
  heroNm,
  hold,
  newDeleg,
  quality,
  reject,
  reserveOf,
  rndOf,
  runnerOf,
  unitMargin,
  type PropAct,
  type PropUnit,
  type Proposal,
} from './deleg';
import { madeSkus, adCost, bonus, bonusCost, bottleneck, buyCap, donate, donateLock, has, hasRoute, investCost as investCostOf, skillLock, myShops, nextDonateCost, partMax, raise, raiseStep, recipeOf, sellInfo, stageCaps, staffOf, whatIf, wageOf, type P1State, type Report, type Stage, type StageIf, type Staff, type StallWhy } from './model';
import { adGain, goodsName, partMonthly, sellMoves, shopMonthly, stockMsg, stockPlan, type SellMove } from './moves';
import { apologize, bestReply, csOn, noticeCost, refundCost, reply, replyGain, replyLock, swapItem } from './cs';
import { quitLeft, talk, talkGain } from './hr';
import { afterOf, applyPlan, planOf, type Plan, type PlanRes } from './plan';
import { clearInfo, clearUnits, fromStock, storeFull } from './stock';
import { dedRate, quarterNow, taxOn, taxPlan } from './acct';
import { heroSay, quipOf, say, sayLen, type QuipCat } from './persona';
import { DEF } from '../defs';
import { applyEvent, eventDue, evIcon, evSay, evTitle, isGood, optIcon, optName, optSub, recOpt, EV_TEXT, type EvData } from './events';
import { applyDiplo, diploCompany, dipOptText, dipOpts, dipRec, dipSay, dipTitle, landDef, relOf, type DipData } from './diplo';

// ---------------------------------------------------------------- 型

/** 出どころ（統計・受けた割合の数え） */
export type CardSrc = 'clerk' | 'crafter' | 'buyer' | 'idle' | 'head' | 'cs' | 'flame' | 'quit' | 'tax' | 'rally' | 'hr' | 'event' | 'diplo' | 'stall' | 'stock';
/** ヒーローからの提案（★3 で「任せる」を選べる出どころ） */
export const PROPOSAL_SRC: CardSrc[] = ['clerk', 'crafter', 'buyer', 'idle', 'head', 'stall', 'stock'];
export const CARD_SRCS: CardSrc[] = ['clerk', 'crafter', 'buyer', 'idle', 'head', 'cs', 'flame', 'quit', 'tax', 'rally', 'hr', 'event', 'diplo', 'stall', 'stock'];

/** 選ぶと打つ手 */
export type CardAct =
  | { k: 'do'; a: PropAct }
  | { k: 'skip' }
  | { k: 'approve' | 'reject' | 'hold'; pid: number }
  | { k: 'reply'; q: number; r: ReplyKind }
  | { k: 'apologize' }
  | { k: 'talk' | 'raise' | 'bonus'; hero: number }
  | { k: 'donate' }
  | { k: 'open'; to: 'tax' | 'ads' }
  /** 段 UI4：できごとの i 番目の選択肢・外交の i 番目の選択肢 */
  | { k: 'ev'; i: number }
  | { k: 'dip'; i: number };
export interface Choice {
  act: CardAct;
  /** 見込み（ヒーローの読み。誤差つき）：G＝毎月の費用を引いた利益（G／月）・ad＝宣伝の期間の利益・finds＝出土品の数 ほか */
  est?: number;
  unit?: PropUnit | 'sat' | 'tax' | 'morale';
  /** 販売・流れの増え方（個／月。誤差つき） */
  units?: number;
  /** 1 回の費用（G）・研究ポイント・毎月の費用 */
  cost: number;
  rp?: number;
  monthly?: number;
  /** おすすめ（金色） */
  rec?: boolean;
  /** 販売の手の種類（文の言い分け） */
  kind?: SellMove['kind'] | 'whatif' | 'assign' | 'permit' | 'ad';
  /** 入れ替えで外す商品・段 */
  replace?: Sku | null;
  stage?: Stage;
}
/** カードの課題（セリフは見せるときに作る：言葉を切り替えても同じ数字で） */
export type Issue =
  | { k: 'sell'; share: number; pile: number }
  | { k: 'craft'; n: number }
  | { k: 'buy'; n: number }
  /** 段 UI5a：③ 物流が課題あり（月次報告の担当者からの提案） */
  | { k: 'haul'; n: number }
  | { k: 'idle'; what: 'assign' | 'ad' | 'permit'; stage?: Stage }
  | { k: 'hire'; stage: Stage; n: number }
  | { k: 'head' }
  | { k: 'cs'; kind: InqKind; key: string | null; n: number }
  | { k: 'flame'; cause: 'out' | 'ignore' }
  | { k: 'rally'; by: string; sale: boolean; months: number }
  | { k: 'quit'; days: number }
  | { k: 'tax'; q: number; need: number; save: number }
  | { k: 'event' }
  | { k: 'diplo' }
  /** 段 UI5a：流れが止まっている（いちばん上流の止まっている段と理由）・店長が休む日に店を回す人がいない */
  | { k: 'stall'; stage: Stage; why: StallWhy }
  | { k: 'staff'; uid: number; off: number }
  /** 段 UI5c：倉庫が埋まりそう（埋まり方 %・素材・運ぶ前の商品・在庫品の数） */
  | { k: 'store'; pct: number; mats: number; goods: number; items: number };
export interface Card {
  id: number;
  src: CardSrc;
  /** 種類（同じ種類は CARD.kindGap か月あける・任せる単位） */
  kind: string;
  /** 話し手（ヒーロー。無ければマインちゃん） */
  hero: number | null;
  /** 読みの確かさ（出来）と、どの部門の出来か */
  q: number;
  dept: DeptId | null;
  /** 肩書き：お店（店員）・作業台（職人） */
  uid?: number;
  /** 出した締めの回数（CardState.mk）・セクタ・日 */
  mk: number;
  sector: string;
  day: number;
  issue: Issue;
  choices: Choice[];
  /** 時間を止めて出す（上限の中）・もう出した */
  pop: boolean;
  seen?: boolean;
  /** 部長の提案の id・問い合わせの id */
  pid?: number;
  ref?: number;
  /** 任せた提案で、資金が足りずに実行できなかった */
  held?: 'money' | 'rp';
  /** 段 UI4：突発のできごと・外交の話（選ぶまでの中身） */
  ev?: EvData;
  dip?: DipData;
}
/** 任せた提案を実行した記録（トースト・月次報告） */
export interface AutoRec {
  hero: number;
  src: CardSrc;
  act: PropAct;
  est: number;
  units?: number;
  day: number;
}
export interface CardStat {
  /** ランクごと：出た数・時間を止めて出した数・上限で受け箱に回った数・任せて実行した数・その締めの回数 */
  made: Record<string, number>;
  pop: Record<string, number>;
  boxed: Record<string, number>;
  auto: Record<string, number>;
  months: Record<string, number>;
  /** 出どころごと：出た数・受けた（いまの手を打った）数 */
  src: Partial<Record<CardSrc, { made: number; taken: number }>>;
}
export interface CardState {
  seq: number;
  inbox: Card[];
  /** 任せた（ヒーロー:種類） */
  trust: string[];
  /** 月の締めの回数（同じ種類の間をあける・提案が古くなる） */
  mk: number;
  /** いまの締めのあとに時間を止めて出した数・出した話し手 */
  popN: number;
  heroes: number[];
  /** 種類ごとに、最後に時間を止めて出した締めの回数 */
  last: Record<string, number>;
  /** 任せた提案を実行した記録（まだトーストにしていないもの） */
  auto: AutoRec[];
  /** 経理の助言を出した四半期 */
  taxQ?: number;
  stat: CardStat;
}
/** 月次報告の「提案と報告」 */
export interface CardReport {
  made: number;
  pop: number;
  boxed: number;
  auto: AutoRec[];
}

const newStat = (): CardStat => ({ made: {}, pop: {}, boxed: {}, auto: {}, months: {}, src: {} });
export const newCards = (): CardState => ({ seq: 0, inbox: [], trust: [], mk: 0, popN: 0, heroes: [], last: {}, auto: [], stat: newStat() });
export const cardsOf = (s: P1State): CardState => (s.cards ??= newCards());
const tierOf = (s: P1State) => s.tier ?? 'C';
const here = (s: P1State) => s.sector ?? 'c1';
/** チュートリアル（タオックスの 1 か月目）の途中 */
export const inTutorial = (s: Pick<P1State, 'tut'>) => typeof s.tut === 'number' && s.tut < 99;

// ---------------------------------------------------------------- 読みの確かさ（★）

/** ★1〜3：出来（0.70〜0.97）と Lv。★3 で「任せる（自分で実行して報告）」を選べる */
export function starOf(q: number, lv: number): 1 | 2 | 3 {
  const S = CARD.star;
  if (q >= S.three.q && lv >= S.three.lv) return 3;
  if (q >= S.two.q || lv >= S.two.lv) return 2;
  return 1;
}
export const cardStar = (s: P1State, c: Card): 1 | 2 | 3 | null => {
  const st = c.hero != null ? staffOf(s, c.hero) : null;
  if (!st || !PROPOSAL_SRC.includes(c.src)) return null;
  return starOf(c.q, st.level ?? 1);
};
/** 任せられるか（★3 のヒーローの提案） */
export const canTrust = (s: P1State, c: Card) => cardStar(s, c) === 3 && c.choices.some((x) => x.rec && x.act.k === 'do' || x.rec && x.act.k === 'approve');
export const trustKey = (hero: number, kind: string) => `${hero}:${kind}`;
export const trusted = (s: P1State, c: Pick<Card, 'hero' | 'kind'>) => c.hero != null && (s.cards?.trust ?? []).includes(trustKey(c.hero, c.kind));

// ---------------------------------------------------------------- 話し手

const isFree = (x: Staff) => x.task == null && !x.resting;
/** 店員（そのお店。いなければ売り場のあるどこかのお店の店員） */
function clerkOf(s: P1State, uid?: number): { hero: number; uid: number } | null {
  if (uid != null && s.shops[uid]?.staff != null) return { hero: s.shops[uid].staff!, uid };
  for (const b of myShops(s)) if (s.shops[b.uid]?.staff != null) return { hero: s.shops[b.uid].staff!, uid: b.uid };
  return null;
}
/** その部門の担当（部長 → その部門の業務のリーダー） */
function deptHand(s: P1State, d: DeptId, duty?: Parameters<typeof runnerOf>[1]): number | null {
  const H = headOf(s, d);
  if (H) return H.hero;
  if (duty) {
    const r = runnerOf(s, duty);
    if (r) return r.st.hero;
  }
  return null;
}
/** 話し手の出来（読みの確かさ） */
const qOf = (s: P1State, hero: number | null, d: DeptId | null) => {
  const st = hero != null ? staffOf(s, hero) : null;
  return st && d ? quality(st, d) : DELEG.q.lo;
};

// ---------------------------------------------------------------- 候補（月の締め）

export type Draft = Omit<Card, 'id' | 'mk' | 'sector' | 'day' | 'pop'> & { pri: number; /** 上限に関係なく時間を止めて出す（できごと・初めての使者） */ force?: boolean };

/** whatIf の手（設備投資・倉庫・パネル・レベル・人を置く）→ 選択肢。見込みは本当の値（あとで読みの誤差） */
function fromWhatIf(s: P1State, w: StageIf, margin: number, me: number | null): Choice | null {
  const m = w.move;
  const real = Math.round(w.units * margin);
  const base = { est: real, unit: 'G' as const, units: w.units, kind: 'whatif' as const, stage: w.stage };
  if (m.kind === 'invest') return { ...base, act: { k: 'do', a: { k: 'invest', id: m.id, uid: m.uid } }, cost: m.cost };
  if (m.kind === 'skill') return { ...base, act: { k: 'do', a: { k: 'skill', id: m.id } }, cost: m.cost, rp: m.rp };
  if (m.kind === 'level') return { ...base, act: { k: 'do', a: { k: 'level', id: m.id } }, cost: m.cost };
  if (m.kind === 'build') {
    const lot = findLot(s, m.id);
    if (lot) return { ...base, act: { k: 'do', a: { k: 'build', id: m.id, i: lot[0], j: lot[1], dir: lot[2] } }, cost: m.cost };
  }
  if (m.kind === 'person' && m.replace == null) {
    if (m.hire) return { ...base, est: Math.round(real - m.cost), act: { k: 'do', a: { k: 'hire', hero: m.hero, task: m.task, target: m.target } }, cost: 0, monthly: m.cost };
    if (m.hero !== me) return { ...base, act: { k: 'do', a: { k: 'assign', hero: m.hero, task: m.task, target: m.target } }, cost: 0, kind: 'assign' };
    return { ...base, act: { k: 'do', a: { k: 'assign', hero: m.hero, task: m.task, target: m.target } }, cost: 0, kind: 'assign' };
  }
  return null;
}
/** 販売の手 → 選択肢 */
function fromSell(m: SellMove): Choice | null {
  if (!m.act) return null;
  if (m.act.k === 'ad') return { act: { k: 'do', a: { k: 'ad', id: m.act.id } }, est: m.net, unit: 'ad', units: m.units, cost: m.cost, kind: 'ad' };
  return { act: { k: 'do', a: m.act as PropAct }, est: m.net, unit: 'G', units: m.units, cost: m.cost, rp: m.rp, monthly: m.monthly || undefined, kind: m.kind, replace: m.replace, stage: 'sell' };
}
/** 読みの誤差を付けて、見込みの大きい順に n 個（見込みがプラスのものだけ） */
function pick(s: P1State, xs: Choice[], q: number, salt: number, n = CARD.choices - 1): Choice[] {
  const rnd = rndOf(s, salt);
  return xs
    .map((c) => {
      const k = errMul(rnd, q, DELEG.prop.err);
      return { ...c, est: c.est != null ? Math.round(c.est * k) : undefined, units: c.units != null ? Math.round(c.units * k * 10) / 10 : undefined };
    })
    .filter((c) => (c.est ?? 0) > 0)
    .sort((a, b) => (b.est ?? 0) - (a.est ?? 0))
    .slice(0, n);
}
/** おすすめ：払えるもののうち見込みのいちばん大きいもの（無ければ見込みのいちばん大きいもの） */
function markRec(s: P1State, xs: Choice[]): Choice[] {
  const doable = xs.filter((c) => c.act.k !== 'skip' && (c.est ?? 0) > 0);
  const ok = doable.filter((c) => c.cost <= s.money && (c.rp ?? 0) <= (s.rp ?? 0));
  const best = (ok.length ? ok : doable).sort((a, b) => (b.est ?? 0) - (a.est ?? 0))[0];
  return xs.map((c) => ({ ...c, rec: c === best || (!best && c.act.k === 'skip') }));
}
const SKIP: Choice = { act: { k: 'skip' }, cost: 0 };

/** ヒーローからの提案（持ち場・待機中）：詰まりの段で、その持ち場のヒーローが 1 枚 */
function heroDrafts(s: P1State): Draft[] {
  const out: Draft[] = [];
  if (!myShops(s).length) return out;
  const caps = stageCaps(s);
  const bn = bottleneck(caps);
  const margin = unitMargin(s);
  // 店員：販売が詰まり（販売の手を、毎月の費用を引いた利益の見込みの順に）
  if (bn === 'sell') {
    const ms = sellMoves(s);
    const top = ms.find((m) => m.net > 0 && m.act);
    const who = clerkOf(s, top?.uid);
    if (who) {
      const q = qOf(s, who.hero, 'logistics');
      const ch = pick(s, ms.map(fromSell).filter((x): x is Choice => !!x), q, who.hero + 11);
      if (ch.length) {
        const info = sellInfo(s);
        const pile = Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0);
        out.push({ src: 'clerk', kind: 'sell', hero: who.hero, uid: who.uid, q, dept: 'logistics', issue: { k: 'sell', share: info.share, pile }, choices: markRec(s, [...ch, SKIP]), pri: 80 });
      }
    }
  }
  // 工房の職人：製造が詰まり（作業台・人・パネル）
  if (bn === 'craft') {
    const sl = s.slots.find((x) => x.worker != null && staffOf(s, x.worker!)?.task === 'craft');
    if (sl?.worker != null) {
      const q = qOf(s, sl.worker, 'logistics');
      const ch = pick(s, whatIf(s, 'craft').map((w) => fromWhatIf(s, w, margin, sl.worker)).filter((x): x is Choice => !!x), q, sl.worker + 13);
      if (ch.length) out.push({ src: 'crafter', kind: 'craft', hero: sl.worker, q, dept: 'logistics', issue: { k: 'craft', n: Math.round(caps.craft.perMonth) }, choices: markRec(s, [...ch, SKIP]), pri: 45 });
    }
  }
  // 調達係：調達が詰まり
  if (bn === 'buy') {
    const b = s.staff.find((x) => x.task === 'buy');
    if (b) {
      const q = qOf(s, b.hero, 'logistics');
      const ch = pick(s, whatIf(s, 'buy').map((w) => fromWhatIf(s, w, margin, b.hero)).filter((x): x is Choice => !!x), q, b.hero + 17);
      if (ch.length) out.push({ src: 'buyer', kind: 'buy', hero: b.hero, q, dept: 'logistics', issue: { k: 'buy', n: Math.round(caps.buy.perMonth) }, choices: markRec(s, [...ch, SKIP]), pri: 45 });
    }
  }
  // 待機中のヒーロー：詰まりの段の持ち場に自分を・宣伝（マーケ）・発掘許可（R&D）
  const idle = s.staff.filter(isFree);
  if (idle.length) {
    const ifs = bn === 'sell' ? [] : whatIf(s, bn);
    const self = ifs.find((w) => w.move.kind === 'person' && !w.move.hire && w.move.replace == null && idle.some((x) => x.hero === (w.move as { hero: number }).hero));
    const me = self ? (self.move as { hero: number }).hero : idle[0].hero;
    const xs: (Choice & { what: 'assign' | 'ad' | 'permit'; dept: DeptId })[] = [];
    if (self) {
      const c = fromWhatIf(s, self, margin, me);
      if (c) xs.push({ ...c, what: 'assign', dept: 'hr' });
    }
    const ad = candidates(s, 'marketing', () => [])[0];
    if (ad && ad.act.k === 'ad') xs.push({ act: { k: 'do', a: ad.act }, est: ad.real, unit: 'ad', cost: ad.cost, kind: 'ad', what: 'ad', dept: 'marketing' });
    const dig = candidates(s, 'rnd', () => []).sort((a, b) => b.real - a.real)[0];
    if (dig) xs.push({ act: { k: 'do', a: dig.act }, est: dig.real, unit: 'finds', cost: dig.cost, kind: 'permit', what: 'permit', dept: 'rnd' });
    // 単位の違う手は、G に寄せて比べる（出土品 1 個 ≒ 1,500 G。部長の提案の並べ方と同じ）
    const val = (c: Choice) => (c.unit === 'finds' ? (c.est ?? 0) * 1500 : c.est ?? 0);
    const top = [...xs].sort((a, b) => val(b) - val(a))[0];
    if (top && val(top) > 0) {
      const q = qOf(s, me, top.dept);
      const ch = pick(s, xs, q, me + 19).filter((c) => val(c) > 0);
      if (ch.length) out.push({ src: 'idle', kind: 'idle', hero: me, q, dept: top.dept, issue: { k: 'idle', what: top.what, stage: bn }, choices: markRec(s, [...ch, SKIP]), pri: 30 });
    }
  }
  return out;
}

/**
 * 撮影・確かめ用（main.ts の islandDebug）：持ち場のヒーローの提案を、いまの詰まりの段に関係なく作る（話し手を替えられる）。
 * 見込みはいまの計算のまま。手が無ければ null
 */
export function demoDraft(s: P1State, src: 'clerk' | 'crafter' | 'buyer' | 'idle', hero?: number): Draft | null {
  const caps = stageCaps(s);
  const margin = unitMargin(s);
  const who = hero ?? (src === 'clerk' ? clerkOf(s)?.hero : src === 'crafter' ? s.slots.find((x) => x.worker != null)?.worker : src === 'buyer' ? s.staff.find((x) => x.task === 'buy')?.hero : s.staff.find(isFree)?.hero ?? s.staff[0]?.hero) ?? null;
  if (who == null) return null;
  const q = qOf(s, who, 'logistics');
  if (src === 'clerk') {
    const ch = pick(s, sellMoves(s).map(fromSell).filter((x): x is Choice => !!x), q, who + 11);
    const info = sellInfo(s);
    const pile = Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0);
    return ch.length ? { src, kind: 'sell', hero: who, uid: clerkOf(s)?.uid, q, dept: 'logistics', issue: { k: 'sell', share: info.share, pile }, choices: markRec(s, [...ch, SKIP]), pri: 80 } : null;
  }
  if (src === 'crafter' || src === 'buyer') {
    const stage = src === 'crafter' ? 'craft' : 'buy';
    const ch = pick(s, whatIf(s, stage).map((w) => fromWhatIf(s, w, margin, who)).filter((x): x is Choice => !!x), q, who + 13);
    return ch.length ? { src, kind: stage, hero: who, q, dept: 'logistics', issue: { k: stage, n: Math.round(caps[stage].perMonth) }, choices: markRec(s, [...ch, SKIP]), pri: 45 } : null;
  }
  const xs: Choice[] = [];
  const ad = candidates(s, 'marketing', () => [])[0];
  if (ad && ad.act.k === 'ad') xs.push({ act: { k: 'do', a: ad.act }, est: ad.real, unit: 'ad', cost: ad.cost, kind: 'ad' });
  const dig = candidates(s, 'rnd', () => []).sort((a, b) => b.real - a.real)[0];
  if (dig) xs.push({ act: { k: 'do', a: dig.act }, est: dig.real, unit: 'finds', cost: dig.cost, kind: 'permit' });
  const ch = pick(s, xs, qOf(s, who, 'rnd'), who + 19);
  return ch.length ? { src: 'idle', kind: 'idle', hero: who, q: qOf(s, who, 'rnd'), dept: 'rnd', issue: { k: 'idle', what: ch[0].kind === 'ad' ? 'ad' : 'permit' }, choices: markRec(s, [...ch, SKIP]), pri: 30 } : null;
}

// ---------------------------------------------------------------- 段 UI5a：流れが止まった月・お店の自走

/** 待機中の人（持ち場に回せる。適性の高い順） */
const freeFor = (s: P1State, task: Task) => s.staff.filter(isFree).sort((a, b) => aptitudeOf(b, task) - aptitudeOf(a, task));
const aptitudeOf = (st: Staff, task: Task) => (task === 'buy' ? st.stats.agi + st.stats.int : task === 'transport' ? st.stats.phy + st.stats.agi : task === 'shop' ? st.stats.int + st.stats.agi : st.stats.agi + st.stats.int);
/** そのパネルを取れるか（資金・研究ポイントだけが足りないものも） */
const takeable = (s: P1State, id: string) => {
  const k = SKILL[id];
  if (!k || has(s, id)) return false;
  const e = skillLock(s, k);
  return e == null || e === 'money' || e === 'rp';
};
/** 雇える候補のうち、その仕事にいちばん向いている人 */
function hireFor(s: P1State, _task: Task): number | null {
  if (!has(s, 'hire') || !s.hirePool.length) return null;
  return [...s.hirePool].sort((a, b) => wageOf(a) - wageOf(b))[0] ?? null;
}
/**
 * 流れが止まっている（締めの報告の stall）：いちばん上流の止まっている段の担当（いなければマインちゃん）から「○○が止まっています」。
 * 選択肢は理由に合わせて（交代を置く・交代要員のパネル・素材を問屋に注文・倉庫・運ぶ人・店員）。宣伝は勧めない
 */
export function stallDraft(s: P1State, r: Report): Draft | null {
  const st = r.stall;
  if (!st || !myShops(s).length) return null;
  const xs: Choice[] = [];
  const assignTo = (task: Task, target: number | string | null = null) => {
    const h = freeFor(s, task)[0];
    if (h) xs.push({ act: { k: 'do', a: { k: 'assign', hero: h.hero, task, target } }, cost: 0, kind: 'assign', stage: st.stage, est: 1 });
    else {
      const hh = hireFor(s, task);
      if (hh != null) xs.push({ act: { k: 'do', a: { k: 'hire', hero: hh, task, target } }, cost: 0, monthly: wageOf(hh), kind: 'assign', stage: st.stage, est: 1 });
    }
  };
  // 作業台が待っている素材を、問屋に 1〜2 ロット注文（調達係が休む・いないあいだの穴埋め）
  const orderMats = () => {
    const need = new Set(s.slots.filter((sl) => sl.sku && sl.worker != null).flatMap((sl) => Object.keys(recipeOf(sl.sku!)) as (keyof typeof MATS)[]));
    const m = [...need].find((x) => hasRoute(s, x) && (s.mats[x] ?? 0) < 10);
    if (m) xs.push({ act: { k: 'do', a: { k: 'order', m, lots: 2 } }, cost: 0, kind: 'whatif', stage: 'buy', est: 1 });
  };
  if (st.stage === 'buy') {
    if (st.why === 'none') assignTo('buy');
    else if (st.why === 'rest') {
      if (has(s, 'relief') && s.staff.filter((x) => x.task === 'buy').length < buyCap(s)) assignTo('buy');
      else if (takeable(s, 'relief')) xs.push({ act: { k: 'do', a: { k: 'skill', id: 'relief' } }, cost: 0, rp: SKILL.relief.rp, kind: 'whatif', stage: 'buy', est: 1 });
      orderMats();
    } else if (st.why === 'full' || st.why === 'backlog') {
      const lot = findLot(s, 'warehouse');
      if (lot) xs.push({ act: { k: 'do', a: { k: 'build', id: 'warehouse', i: lot[0], j: lot[1], dir: lot[2] } }, cost: P1B.warehouse.cost, kind: 'whatif', stage: 'buy', est: 1 });
    } else if (st.why === 'cap' || st.why === 'route') {
      const w = whatIf(s, 'buy').find((x) => x.move.kind === 'skill' || x.move.kind === 'level');
      const c = w ? fromWhatIf(s, w, unitMargin(s), null) : null;
      if (c) xs.push({ ...c, est: Math.max(1, c.est ?? 1) });
    }
    if (st.why === 'none' || st.why === 'money') orderMats();
  } else if (st.stage === 'haul') {
    assignTo('transport');
    // 荷車・設備（③ 物流のいちばん効く手）
    const w = whatIf(s, 'haul').find((x) => x.ok && x.move.kind !== 'person');
    const c = w ? fromWhatIf(s, w, unitMargin(s), null) : null;
    if (c) xs.push({ ...c, est: Math.max(1, c.est ?? 1) });
  }
  else if (st.stage === 'sell') {
    const b = myShops(s).find((x) => s.shops[x.uid] && s.shops[x.uid].staff == null && s.shops[x.uid].part === 0);
    if (b) assignTo('shop', b.uid);
  } else if (st.stage === 'craft' && st.why === 'noworker') {
    const k = s.slots.findIndex((sl) => sl.sku && sl.worker == null);
    if (k >= 0) assignTo('craft', k);
  }
  const who = st.stage === 'buy' ? s.staff.find((x) => x.task === 'buy')?.hero ?? null : st.stage === 'haul' ? s.staff.find((x) => x.task === 'transport')?.hero ?? null : st.stage === 'sell' ? null : s.slots.find((x) => x.worker != null)?.worker ?? null;
  // 休んでいる本人ではなく、ほかの人（いなければマインちゃん）が知らせる
  const speaker = who != null && st.hero !== who ? who : null;
  const xs2 = xs.slice(0, CARD.choices - 1);
  return { src: 'stall', kind: `stall:${st.stage}`, hero: speaker, q: qOf(s, speaker, 'logistics'), dept: 'logistics', issue: { k: 'stall', stage: st.stage, why: st.why }, choices: markRec(s, [...xs2, SKIP]), pri: 95, force: true };
}
/**
 * お店の自走：先月、店長が休んだ日に店を回す人（従業員 2 人）がいなかったお店。店長から「休む日に店を回す人がいません。2 人雇いませんか？」
 * （控室が要るなら提案書が先に増設する）
 */
export function staffDraft(s: P1State): Draft | null {
  for (const b of myShops(s)) {
    const sh = s.shops[b.uid];
    if (!sh || sh.staff == null || (sh.offLast ?? 0) < 2 || sh.part >= SELF_RUN.min) continue;
    const hero = sh.staff;
    const n = SELF_RUN.min;
    const a = { k: 'staff' as const, uid: b.uid, n };
    const ok = n <= partMax(s, b.uid) || investCost0(s, b.uid) != null;
    if (!ok) continue;
    const ch: Choice = { act: { k: 'do', a }, cost: n > partMax(s, b.uid) ? investCost0(s, b.uid) ?? 0 : 0, monthly: (n - sh.part) * SHOP_WAGE(), kind: 'part', stage: 'sell', est: 1 };
    return { src: 'clerk', kind: 'staff', hero, uid: b.uid, q: qOf(s, hero, 'logistics'), dept: 'logistics', issue: { k: 'staff', uid: b.uid, off: sh.offLast ?? 0 }, choices: markRec(s, [ch, SKIP]), pri: 60 };
  }
  return null;
}
/**
 * 段 UI5c：倉庫（工房の物置と倉庫）が CLEAR.warn を超えた月の締め：店長（いなければ運搬係）から
 * 「倉庫が埋まりそうです。在庫を優先して売りさばきましょう」「いまある素材で○○が作れます」。どちらも提案書（承認で一気に）
 */
export function stockDraft(s: P1State): Draft | null {
  if (inTutorial(s) || !myShops(s).length || !storeFull(s)) return null;
  const info = clearInfo(s);
  const xs: Choice[] = [];
  // 在庫を優先して売りさばく（全部のお店・値引きは CLEAR.def の段）。見込み：在庫品がひと月に売れていく数
  if (info.total > 0 && myShops(s).some((b) => s.shops[b.uid] && s.shops[b.uid].clear == null)) {
    const a: PropAct = { k: 'clear', uid: -1, cut: CLEAR.def };
    const u = clearUnits(afterOf(s, planOf(s, [a])), info.items.map((y) => y.x));
    if (u > 0.5) xs.push({ act: { k: 'do', a }, cost: 0, kind: 'whatif', stage: 'sell', est: Math.round(u), units: u });
  }
  // いまある素材で作れる（余った素材を使うもの。使い切りに作って、もとの商品に戻る）
  const slot = s.slots.findIndex((sl) => sl.worker != null && sl.back === undefined);
  if (slot >= 0) {
    // いま作り続けている商品は除いて、おすすめ順のいちばん上（余った素材を使うもの）
    const steady = madeSkus(s);
    const p = fromStock(s, s.slots[slot].worker).find((y) => y.spare > 0 && y.yen > 0 && !steady.includes(y.x));
    if (p) {
      const [key, rar] = skuParts(p.x);
      xs.push({ act: { k: 'do', a: { k: 'useup', slot, key, rar } }, cost: 0, kind: 'whatif', stage: 'craft', est: p.units, units: p.units });
    }
  }
  if (!xs.length) return null;
  const cl = clerkOf(s);
  const hero = cl?.hero ?? s.staff.find((x) => x.task === 'transport')?.hero ?? null;
  return { src: 'stock', kind: 'stock', hero, ...(cl ? { uid: cl.uid } : {}), q: qOf(s, hero, 'logistics'), dept: 'logistics', issue: { k: 'store', pct: Math.round(info.rate * 100), mats: info.mats, goods: info.goods, items: info.total }, choices: markRec(s, [...xs, SKIP]), pri: 0 };
}
const SHOP_WAGE = () => partMonthly();
const investCost0 = (s: P1State, uid: number) => {
  const b = s.buildings.find((x) => x.uid === uid && x.owner === 'me');
  return b ? investCostOf(b, 'staffroom') : null;
};

/** 部長の提案（今月届いたもの）→ 承認・却下・保留のカード */
function headDrafts(s: P1State, r: Report): Draft[] {
  const out: Draft[] = [];
  for (const p of s.deleg?.inbox ?? []) {
    if (p.month !== r.month || p.status !== 'new' || p.src) continue;
    out.push({
      src: 'head',
      kind: `head:${p.dept}`,
      hero: p.hero,
      q: qOf(s, p.hero, p.dept),
      dept: p.dept,
      pid: p.id,
      issue: { k: 'head' },
      choices: [
        { act: { k: 'approve', pid: p.id }, est: p.est, unit: p.unit, units: p.units, cost: p.cost, rp: p.rp, rec: p.est > 0, stage: p.stage },
        { act: { k: 'reject', pid: p.id }, cost: 0 },
        { act: { k: 'hold', pid: p.id }, cost: 0 },
      ],
      pri: 50,
    });
  }
  return out;
}

/**
 * 人手が足りないとき（空いた持ち場・担当のいない段）に、雇える候補がいれば「人を雇いませんか？」（人事の担当。いなければマインちゃん）。
 * いまの whatIf の「雇う」の手（見込みは毎月の給料を引いたもの）をそのまま使う。詰まりの段を先に、無ければほかの段
 */
function hrDrafts(s: P1State): Draft[] {
  if (!has(s, 'hire') || !s.hirePool.length || !myShops(s).length) return [];
  const bn = bottleneck(stageCaps(s));
  const margin = unitMargin(s);
  const hand = deptHand(s, 'hr');
  const stages = (['buy', 'craft', 'haul'] as Stage[]).sort((a, b) => Number(b === bn) - Number(a === bn));
  for (const st of stages) {
    const ifs = whatIf(s, st).filter((w) => w.move.kind === 'person' && w.move.hire && w.move.replace == null && w.units > 0.5);
    const ch = ifs.map((w) => fromWhatIf(s, w, margin, hand)).filter((x): x is Choice => !!x && (x.est ?? 0) > 0);
    if (!ch.length) continue;
    const q = qOf(s, hand, 'hr');
    const xs = [...ch].sort((a, b) => (b.est ?? 0) - (a.est ?? 0)).slice(0, CARD.choices - 1);
    return [{ src: 'hr', kind: 'hire', hero: hand, q, dept: 'hr', issue: { k: 'hire', stage: st, n: s.hirePool.length }, choices: markRec(s, [...xs, SKIP]), pri: 42 }];
  }
  return [];
}

/** いまある「選ばせる知らせ」：問い合わせ・炎上の予告・他社の巻き返し／反撃 */
function noticeDrafts(s: P1State, r: Report): Draft[] {
  const out: Draft[] = [];
  const C = s.cards;
  // 問い合わせ（いちばん古いもの 1 件。残りは問い合わせの画面で）
  const cs = s.cs;
  if (csOn(s) && cs?.inbox.length) {
    const q = cs.inbox[0];
    if (!C?.inbox.some((c) => c.src === 'cs' && c.ref === q.id)) {
      const hand = deptHand(s, 'support', 'reply');
      const who = hand ?? clerkOf(s)?.hero ?? null;
      const order: ReplyKind[] = ['swap', 'refund', 'sorry'];
      const best = bestReply(s, q);
      out.push({
        src: 'cs',
        kind: 'cs',
        hero: who,
        q: qOf(s, who, 'support'),
        dept: 'support',
        uid: hand == null ? clerkOf(s)?.uid : undefined,
        ref: q.id,
        issue: { k: 'cs', kind: q.kind, key: q.key, n: cs.inbox.length },
        choices: order.map((k) => ({ act: { k: 'reply', q: q.id, r: k }, est: Math.round(replyGain(s, q, k)), unit: 'sat' as const, cost: k === 'refund' ? refundCost(s) : 0, rec: k === best })),
        pri: 70,
      });
    }
  }
  // 炎上の予告（お詫びの告知・様子を見る）
  if (csOn(s) && cs?.warn && !cs.warn.done && !C?.inbox.some((c) => c.src === 'flame')) {
    const who = deptHand(s, 'marketing', 'ads') ?? deptHand(s, 'support', 'reply') ?? clerkOf(s)?.hero ?? null;
    out.push({
      src: 'flame',
      kind: 'flame',
      hero: who,
      q: qOf(s, who, 'marketing'),
      dept: 'marketing',
      issue: { k: 'flame', cause: cs.warn.cause },
      choices: [
        { act: { k: 'apologize' }, cost: noticeCost(s), rec: true },
        { act: { k: 'skip' }, cost: 0 },
      ],
      pri: 90,
    });
  }
  // 他社の巻き返し（セール）・反撃（宣伝）：マーケの担当が「宣伝で返しますか？」
  const ev = r.comeback ? { by: r.comeback.by, sale: true, months: r.comeback.months } : r.rally ? { by: r.rally.by, sale: false, months: r.rally.months } : null;
  if (ev && myShops(s).length) {
    const who = deptHand(s, 'marketing', 'ads') ?? s.staff.find(isFree)?.hero ?? clerkOf(s)?.hero ?? null;
    const ads = ADS.filter((a) => (s.ads[a.id] ?? 0) <= 0).map((a) => ({ a, g: adGain(s, a.id) })).sort((x, y) => y.g - x.g);
    const top = ads[0];
    if (top) {
      const ch: Choice[] = [{ act: { k: 'do', a: { k: 'ad', id: top.a.id } }, est: top.g, unit: 'ad', cost: adCost(s, top.a.id), kind: 'ad', rec: top.g > 0 }, { act: { k: 'skip' }, cost: 0, rec: top.g <= 0 }];
      out.push({ src: 'rally', kind: 'rally', hero: who, q: qOf(s, who, 'marketing'), dept: 'marketing', issue: { k: 'rally', ...ev }, choices: ch, pri: 65 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 受け箱へ（上限・同じ話し手・同じ種類の間・任せた提案）

/** 時間を止めて出せるか（今月の上限・同じ話し手は 1 回・同じ種類は CARD.kindGap か月あける） */
/**
 * 段 UI5a：時間を止めて出す上限（町のランク ＋ 会社に読みの確かさ ★3 の担当がいれば CARD.capStar）。
 * ゲームが進むほど（ランクが上がり、担当が育つほど）担当者から受ける提案が増える
 */
export function capOf(s: P1State): number {
  const three = s.staff.some((st) => st.task != null && st.task !== 'train' && starOf(quality(st, 'logistics'), st.level ?? 1) === 3);
  return CARD.cap[tierOf(s)] + (three ? CARD.capStar : 0);
}
/** 提案書 1 枚で変える打ち手の数の上限（町のランク × 話し手の ★） */
export function sizeOf(s: P1State, c: Pick<Card, 'hero' | 'q'>): number {
  const st = c.hero != null ? staffOf(s, c.hero) : null;
  const star = st ? starOf(c.q, st.level ?? 1) : 1;
  return Math.max(1, Math.min(CARD.size[tierOf(s)], star));
}
function admit(s: P1State, d: Pick<Card, 'hero' | 'kind'>): boolean {
  const C = cardsOf(s);
  const cap = capOf(s);
  if (C.popN >= cap) return false;
  if (d.hero != null && C.heroes.includes(d.hero)) return false;
  const last = C.last[d.kind];
  if (last != null && C.mk - last < CARD.kindGap) return false;
  return true;
}
const bump = (o: Record<string, number>, k: string, n = 1) => (o[k] = (o[k] ?? 0) + n);
function srcStat(s: P1State, src: CardSrc) {
  const st = cardsOf(s).stat;
  return (st.src[src] ??= { made: 0, taken: 0 });
}
/** 下書きをカードにして受け箱へ（任せた提案は実行して記録）。出したカード */
export function enqueue(s: P1State, d: Draft, rep?: CardReport): Card | null {
  const C = cardsOf(s);
  const T = tierOf(s);
  const { pri: _p, force, ...rest } = d;
  // 任せた提案：おすすめの手を、手元に残すお金を残せるなら実行して報告（承認と同じ守り）
  if (d.hero != null && PROPOSAL_SRC.includes(d.src) && trusted(s, d)) {
    const rec = d.choices.find((c) => c.rec && (c.act.k === 'do' || c.act.k === 'approve'));
    if (rec && (rec.est ?? 0) > 0) {
      const room = s.money - reserveOf(s);
      if (rec.cost <= room && (rec.rp ?? 0) <= (s.rp ?? 0)) {
        const card: Card = { ...rest, id: ++C.seq, mk: C.mk, sector: here(s), day: s.day, pop: false };
        C.inbox.push(card);
        const res = chooseCard(s, card.id, card.choices.indexOf(rec));
        if (res.ok) {
          const a = rec.act.k === 'do' ? rec.act.a : s.deleg?.done.find((x) => x.p.id === (rec.act as { pid: number }).pid)?.p.act;
          const log: AutoRec = { hero: d.hero, src: d.src, act: a ?? { k: 'skill', id: '' }, est: rec.est ?? 0, units: rec.units, day: s.day };
          C.auto.push(log);
          rep?.auto.push(log);
          bump(C.stat.auto, T);
          srcStat(s, d.src).made++;
          bump(C.stat.made, T);
          return null;
        }
        C.inbox = C.inbox.filter((x) => x.id !== card.id);
      }
      // 資金・研究ポイントが足りない：実行せず、受け箱に「資金不足」で残す（時間は止めない）
      (rest as Card).held = 'money';
    }
  }
  // 同じ出どころ・種類の古い提案は差し替える
  C.inbox = C.inbox.filter((c) => !(c.src === d.src && c.kind === d.kind && c.src !== 'cs' && c.src !== 'head' && c.src !== 'quit'));
  const pop = !(rest as Card).held && (force ? true : d.src === 'diplo' ? C.popN < capOf(s) : admit(s, d));
  const card: Card = { ...rest, id: ++C.seq, mk: C.mk, sector: here(s), day: s.day, pop };
  if (pop) {
    C.popN++;
    if (d.hero != null) C.heroes.push(d.hero);
    C.last[d.kind] = C.mk;
    bump(C.stat.pop, T);
    if (rep) rep.pop++;
  } else {
    bump(C.stat.boxed, T);
    if (rep) rep.boxed++;
  }
  bump(C.stat.made, T);
  srcStat(s, d.src).made++;
  if (rep) rep.made++;
  C.inbox.push(card);
  // 段 UI5c：倉庫の提案（src 'stock'）は数えない・押し出さない（ほかのカードの残り方を変えない）
  const kept = () => C.inbox.filter((c) => c.src !== 'stock');
  while (kept().length > CARD.keep) {
    // 古いものから（まだ出していない時間を止めるカードは残す）
    const xs = kept();
    const k = xs.findIndex((c) => !c.pop || c.seen);
    const c0 = xs[k >= 0 ? k : 0];
    C.inbox.splice(C.inbox.indexOf(c0), 1);
    sweep(s, c0);
  }
  return card;
}
/** 受け箱から消すときの数え（部長の提案が承認されていたら「受けた」） */
function sweep(s: P1State, c: Card) {
  if (c.src === 'head' && c.pid != null && s.deleg?.okIds?.includes(c.pid)) srcStat(s, 'head').taken++;
}

/**
 * 月の締め（いまのセクタ。model.ts の step で delegMonth のあと）：古い・打てなくなったカードを片づけ、ヒーローからの提案・部長の提案・
 * 問い合わせ・炎上の予告・他社の巻き返しをカードにする。r.cards に「提案と報告」（任せて実行したもの）
 */
export function cardsMonth(s: P1State, r: Report) {
  const C = cardsOf(s);
  C.mk++;
  C.popN = 0;
  C.heroes = [];
  bump(C.stat.months, tierOf(s));
  C.inbox = C.inbox.filter((c) => {
    const live = cardLive(s, c) && !(PROPOSAL_SRC.includes(c.src) && c.src !== 'head' && C.mk - c.mk >= CARD.expire);
    if (!live) sweep(s, c);
    return live;
  });
  const rep: CardReport = { made: 0, pop: 0, boxed: 0, auto: [] };
  // 段 UI4：突発のできごと（2〜3 か月に 1 回）。上限の枠を先に 1 つ使う（いつも時間を止めて出す）
  const ev = eventDue(s, C.mk);
  if (ev) enqueue(s, eventDraft(s, ev), rep);
  // 段 UI5a：流れが止まった月は、ほかの提案より先に「○○が止まっています」（いちばん上流の止まっている段）。お店の自走の提案（従業員）
  const stall = stallDraft(s, r);
  const staff = stall ? null : staffDraft(s);
  const drafts = [...(stall ? [stall] : []), ...(staff ? [staff] : []), ...noticeDrafts(s, r), ...(stall ? heroDrafts(s).filter((d) => d.src !== 'clerk' || d.kind !== 'sell') : heroDrafts(s)), ...hrDrafts(s), ...headDrafts(s, r)].sort((a, b) => b.pri - a.pri);
  for (const d of drafts) enqueue(s, d, rep);
  // 段 UI5c：倉庫が埋まりそうな月（ほかの提案のあと。受け箱の枚数に数えないので、ほかのカードを押し出さない）
  const st = stockDraft(s);
  if (st) enqueue(s, st, rep);
  if (rep.made || rep.auto.length) r.cards = rep;
}

/** 1 日（model.ts の step）：辞めたいの予告（本人が話し手） */
export function cardsDay(s: P1State, want: number[]) {
  for (const hero of want) {
    const st = staffOf(s, hero);
    if (!st || st.quit == null) continue;
    if (cardsOf(s).inbox.some((c) => c.src === 'quit' && c.hero === hero)) continue;
    const ch: Choice[] = [
      { act: { k: 'talk', hero }, est: talkGain(s), unit: 'morale', cost: 0, rec: !st.talked },
      { act: { k: 'raise', hero }, est: MORALE.ev.raise, unit: 'morale', cost: 0, monthly: raiseStep(hero), rec: !!st.talked && (st.lv ?? 0) < PAY.raiseMax },
      { act: { k: 'skip' }, cost: 0 },
    ];
    if (st.talked && (st.lv ?? 0) >= PAY.raiseMax) ch[1] = { act: { k: 'bonus', hero }, est: MORALE.ev.bonus, unit: 'morale', cost: bonusCost(st), rec: true };
    enqueue(s, { src: 'quit', kind: 'quit', hero, q: DELEG.q.lo, dept: null, issue: { k: 'quit', days: quitLeft(s, st) ?? 0 }, choices: ch, pri: 100 });
  }
}

/** できごと → カード（話し手：マインちゃん・ヒーロー・町の長。おすすめは払えるもののうち見込みのいちばん大きい手） */
export function eventDraft(s: P1State, d: EvData): Draft {
  const rec = recOpt(s, d);
  return {
    src: 'event',
    kind: `ev:${d.kind}`,
    hero: d.who === 'mine' ? null : d.hero ?? null,
    q: DELEG.q.lo,
    dept: null,
    issue: { k: 'event' },
    ev: d,
    choices: d.opts.map((o, i) => ({ act: { k: 'ev', i }, est: o.ev, cost: o.cost, rec: i === rec })),
    pri: 95,
    force: true,
  };
}
/** 外交の話 → カード（話し手：使者。初めての使者は上限に関係なく出す） */
export function diploDraft(s: P1State, d: DipData): Draft {
  const rec = dipRec(s, d);
  return {
    src: 'diplo',
    kind: `dip:${d.land}:${d.kind}`,
    hero: null,
    q: DELEG.q.lo,
    dept: null,
    issue: { k: 'diplo' },
    dip: d,
    choices: dipOpts(s, d).map((o, i) => ({ act: { k: 'dip', i }, est: o.ev, cost: o.cost, rec: i === rec })),
    pri: 85,
    force: d.kind === 'meet',
  };
}

/** 会社の月の締め（model.ts の step で closeCompanyMonth のあと）：決算の 1 か月前の経理の助言（あと ○○ G の投資で税が △△ G 減る）・外交（段 UI4） */
export function cardsCompany(s: P1State) {
  const C = cardsOf(s);
  const dp = diploCompany(s);
  if (dp) enqueue(s, diploDraft(s, dp));
  const { inQ, q } = quarterNow(s);
  if (!taxOn(s) || inQ !== 3 - TAX.hint + 1 || C.taxQ === q) return;
  C.taxQ = q;
  const p = taxPlan(s);
  if (p.base <= 0 || p.room <= 0) return;
  const who = deptHand(s, 'accounting') ?? [...s.staff].filter((x) => x.task !== 'manager').sort((a, b) => b.stats.int - a.stats.int)[0]?.hero ?? null;
  const ch: Choice[] = [];
  if (donateLock(s) == null) {
    const cost = nextDonateCost(s);
    const save = Math.round(Math.min(p.room, cost * dedRate(s, 'rnd')) * p.rate);
    ch.push({ act: { k: 'donate' }, est: save, unit: 'tax', cost, rec: true });
  }
  ch.push({ act: { k: 'open', to: 'tax' }, est: p.save, unit: 'tax', cost: 0, rec: !ch.length });
  ch.push({ act: { k: 'skip' }, cost: 0 });
  enqueue(s, { src: 'tax', kind: 'tax', hero: who, q: qOf(s, who, 'accounting'), dept: 'accounting', issue: { k: 'tax', q, need: p.needCapex, save: p.save }, choices: ch, pri: 60 });
}

// ---------------------------------------------------------------- 受け箱

/** まだ選べるカードか（ほかの画面で済ませた・打てなくなった・ほかの町へ移った） */
export function cardLive(s: P1State, c: Card): boolean {
  // 外交の話は会社のもの（どの町にいても選べる）
  if (c.src === 'diplo') return !!c.dip;
  if (c.sector !== here(s)) return false;
  switch (c.src) {
    case 'event':
      return !!c.ev;
    case 'head':
      return !!s.deleg?.inbox.some((p) => p.id === c.pid);
    case 'cs':
      return !!s.cs?.inbox.some((q) => q.id === c.ref);
    case 'flame':
      return !!s.cs?.warn && !s.cs.warn.done;
    case 'quit': {
      const st = c.hero != null ? staffOf(s, c.hero) : null;
      return !!st && st.quit != null;
    }
    case 'tax':
      return c.issue.k === 'tax' && quarterNow(s).q === c.issue.q && taxPlan(s).room > 0;
    case 'rally':
      return cardsOf(s).mk - c.mk < 1;
    default:
      return c.choices.some((x) => x.act.k === 'do' && actOk(s, x.act.a));
  }
}
/** 受け箱（いまのセクタ・まだ選べるもの） */
export const cardInbox = (s: P1State) => (s.cards?.inbox ?? []).filter((c) => cardLive(s, c));

/** 次に時間を止めて出すカード（チュートリアルの途中・1 か月目の月末ポーズのあいだは出さない） */
export function nextPop(s: P1State): Card | null {
  if (inTutorial(s)) return null;
  if (s.reports.length <= 1 && s.monthPause) return null;
  return (s.cards?.inbox ?? []).find((c) => c.pop && !c.seen && cardLive(s, c)) ?? null;
}
/** まだ出していない、時間を止めて出すカードの数 */
export const popLeft = (s: P1State) => (s.cards?.inbox ?? []).filter((c) => c.pop && !c.seen && cardLive(s, c)).length;
export function markSeen(s: P1State, id: number) {
  const c = s.cards?.inbox.find((x) => x.id === id);
  if (c) c.seen = true;
}

export interface ChooseRes {
  ok: boolean;
  err?: 'money' | 'rp' | 'stock' | 'gone' | 'none' | 'cool' | 'max' | string;
  /** 画面を開く（税と節税・宣伝） */
  open?: 'tax' | 'ads';
  /** 打った手で何が変わったか（トースト。棚・作業台） */
  did?: string;
}
const proposalUnit = (a: PropAct): PropUnit => (a.k === 'ad' ? 'ad' : a.k === 'permit' ? 'finds' : 'G');

/** 選ぶ：その手を打つ（いまの関数のまま）。足りないときはカードを残す（ok: false）。打てなくなった手はカードを消す */
export function chooseCard(s: P1State, id: number, k: number): ChooseRes {
  const C = cardsOf(s);
  const c = C.inbox.find((x) => x.id === id);
  const ch = c?.choices[k];
  if (!c || !ch) return { ok: false, err: 'none' };
  const drop = () => (C.inbox = C.inbox.filter((x) => x.id !== id));
  if (!cardLive(s, c)) {
    drop();
    return { ok: false, err: 'gone' };
  }
  const a = ch.act;
  const done = (e: string | null | undefined, taken = true): ChooseRes => {
    if (e === 'money' || e === 'rp' || e === 'stock' || e === 'cool') return { ok: false, err: e };
    drop();
    if (e) return { ok: false, err: 'gone' };
    if (taken) srcStat(s, c.src).taken++;
    return { ok: true };
  };
  switch (a.k) {
    case 'do': {
      // ヒーローの提案は部長の提案と同じ受け箱（deleg.ts）を通して承認する：翌月の報告で「提案の結果」をはかる
      const D = (s.deleg ??= newDeleg());
      const month = s.reports.length ? s.reports[s.reports.length - 1].month : 0;
      const p: Proposal = {
        id: ++D.seq,
        dept: c.dept ?? 'logistics',
        hero: c.hero ?? 0,
        src: c.src === 'clerk' || c.src === 'crafter' || c.src === 'buyer' || c.src === 'idle' ? c.src : undefined,
        month,
        sector: here(s),
        act: a.a,
        est: ch.est ?? 0,
        err: Math.round((1 - c.q) * DELEG.prop.err * 100) / 100,
        unit: proposalUnit(a.a),
        units: ch.units != null ? Math.max(1, Math.round(ch.units)) : undefined,
        stage: ch.stage,
        cost: ch.cost,
        rp: ch.rp,
        status: 'new',
      };
      D.inbox.push(p);
      // 棚に並べる手：打つ前の棚と作業台を覚えておいて、打ったあとに「何が変わったか」を知らせる
      const plan = a.a.k === 'stock' ? stockPlan(s, a.a) : null;
      const e = approve(s, p.id);
      D.inbox = D.inbox.filter((x) => x.id !== p.id);
      const r = done(e);
      if (r.ok && plan && a.a.k === 'stock') r.did = stockMsg(plan, a.a.key);
      return r;
    }
    case 'skip':
      return done(null, false);
    case 'approve':
      return done(approve(s, a.pid));
    case 'reject':
      reject(s, a.pid);
      return done(null, false);
    case 'hold':
      hold(s, a.pid);
      // 保留：カードは片づける（提案は受け箱に残る）
      drop();
      return { ok: true };
    case 'reply':
      return done(reply(s, a.q, a.r));
    case 'apologize':
      return done(apologize(s));
    case 'talk':
      return done(talk(s, a.hero));
    case 'raise':
      return done(raise(s, a.hero));
    case 'bonus':
      return done(bonus(s, a.hero));
    case 'donate': {
      const r = donate(s);
      return done(typeof r === 'string' ? r : null);
    }
    case 'open':
      drop();
      return { ok: true, open: a.to };
    case 'ev':
      return done(c.ev ? applyEvent(s, c.ev, a.i) : 'none');
    case 'dip':
      return done(c.dip ? applyDiplo(s, c.dip, a.i) : 'none');
  }
}
// ---------------------------------------------------------------- 段 UI5a：担当者からの提案書（plan.ts）

/** 2 つの手がぶつかるか（同じ種類・同じお店の棚・同じ人） */
const clash = (a: PropAct, b: PropAct) => a.k === b.k || ('uid' in a && 'uid' in b && a.uid === b.uid && (a.k === 'stock' || b.k === 'stock')) || ('hero' in a && 'hero' in b && a.hero === b.hero);
/**
 * カードの選択肢 k の提案書。選んだ手に、同じ担当のほかの改善案（見込みがプラスで、ぶつからないもの）を sizeOf（町のランク × ★）まで足す。
 * 手の無い選択肢（このまま・返事・面談など）は null
 */
export function planOfChoice(s: P1State, c: Card, k: number): Plan | null {
  const ch = c.choices[k];
  if (!ch) return null;
  const acts: PropAct[] = [];
  if (ch.act.k === 'do') acts.push(ch.act.a);
  else if (ch.act.k === 'approve') {
    const pid = ch.act.pid;
    const p = s.deleg?.inbox.find((x) => x.id === pid);
    if (p) acts.push(p.act);
  }
  if (!acts.length) return null;
  const n = sizeOf(s, c);
  for (const x of [...c.choices].sort((a, b) => (b.est ?? 0) - (a.est ?? 0))) {
    if (acts.length >= n) break;
    if (x === ch || x.act.k !== 'do' || (x.est ?? 0) <= 0) continue;
    const a = x.act.a;
    if (!actOk(s, a) || acts.some((y) => clash(y, a))) continue;
    acts.push(a);
  }
  return planOf(s, acts, { hero: c.hero, q: c.q, dept: c.dept });
}
/** その段の担当（店員・職人・調達係・運搬係）。いなければ null（マインちゃん） */
export function stageHand(s: P1State, stage: Stage): number | null {
  if (stage === 'sell') return clerkOf(s)?.hero ?? null;
  if (stage === 'craft') return s.slots.find((x) => x.worker != null)?.worker ?? null;
  if (stage === 'buy') return s.staff.find((x) => x.task === 'buy' && !x.resting)?.hero ?? s.staff.find((x) => x.task === 'buy')?.hero ?? null;
  return s.staff.find((x) => x.task === 'transport')?.hero ?? null;
}
/**
 * 月次報告の KPI ③「担当者からの提案」の提案書：流れが止まっていれば（r.stall）その段の手、そうでなければ課題ありの段のいちばんの打ち手
 * （④ 販売は moves.ts の bestSell、ほかは whatIf）。話し手はその段の担当。打てる手が無ければ null
 */
export function reportProposal(s: P1State, r: Report): { plan: Plan; say: string; role: string } | null {
  const mk = (d: Draft) => {
    const k = d.choices.findIndex((x) => x.rec && x.act.k === 'do');
    const ch = d.choices[k >= 0 ? k : d.choices.findIndex((x) => x.act.k === 'do')];
    if (!ch || ch.act.k !== 'do') return null;
    const card = { ...d, id: -1, mk: cardsOf(s).mk, sector: here(s), day: s.day, pop: false } as Card;
    return { plan: planOfChoice(s, card, card.choices.indexOf(ch))!, say: sayOf(s, card), role: roleOfCard(s, card).text };
  };
  if (r.stall) {
    const d = stallDraft(s, r);
    return d ? mk(d) : null;
  }
  const bn = r.bottleneck ?? bottleneck(stageCaps(s));
  if (bn === 'sell') {
    const who = clerkOf(s);
    const q = qOf(s, who?.hero ?? null, 'logistics');
    const ch = sellMoves(s).map(fromSell).filter((x): x is Choice => !!x && (x.est ?? 0) > 0).sort((a, b) => (b.est ?? 0) - (a.est ?? 0)).slice(0, CARD.choices - 1);
    if (!ch.length) return null;
    const info = sellInfo(s);
    const pile = Object.values(s.stock).reduce<number>((a, n) => a + (n ?? 0), 0);
    return mk({ src: 'clerk', kind: 'sell', hero: who?.hero ?? null, uid: who?.uid, q, dept: 'logistics', issue: { k: 'sell', share: info.share, pile }, choices: markRec(s, [...ch, SKIP]), pri: 80 });
  }
  const hand = stageHand(s, bn);
  const q = qOf(s, hand, 'logistics');
  const ch = whatIf(s, bn)
    .filter((w) => w.ok)
    .map((w) => fromWhatIf(s, w, unitMargin(s), hand))
    .filter((x): x is Choice => !!x)
    .slice(0, CARD.choices - 1);
  if (!ch.length) return null;
  const caps = stageCaps(s);
  const issue: Issue = bn === 'craft' ? { k: 'craft', n: Math.round(caps.craft.perMonth) } : bn === 'buy' ? { k: 'buy', n: Math.round(caps.buy.perMonth) } : { k: 'haul', n: Math.round(caps.haul.perMonth) };
  return mk({ src: bn === 'craft' ? 'crafter' : bn === 'buy' ? 'buyer' : 'idle', kind: bn, hero: hand, q, dept: 'logistics', issue, choices: markRec(s, [...ch, SKIP]), pri: 45 });
}

/** 提案書の承認（カード・受け箱から）：applyPlan で一気に実行し、カードを片づける。払えなければカードを残す */
export function approveCard(s: P1State, id: number, plan: Plan): PlanRes {
  const C = cardsOf(s);
  const c = C.inbox.find((x) => x.id === id);
  if (c && !cardLive(s, c)) {
    C.inbox = C.inbox.filter((x) => x.id !== id);
    return { ok: false, err: 'gone', did: [] };
  }
  const r = applyPlan(s, plan);
  if (!r.ok && (r.err === 'money' || r.err === 'rp')) return r;
  if (c) {
    // 部長の提案を承認した：部長の受け箱からも消す
    for (const ch of c.choices) if (ch.act.k === 'approve' && s.deleg) s.deleg.inbox = s.deleg.inbox.filter((p) => p.id !== (ch.act as { pid: number }).pid);
    C.inbox = C.inbox.filter((x) => x.id !== id);
    if (r.ok) srcStat(s, c.src).taken++;
  }
  return r;
}

/** 任せる（★3）：おすすめの手を打ち、次からその種類はカードを出さずに実行して報告する */
export function trustCard(s: P1State, id: number): ChooseRes {
  const C = cardsOf(s);
  const c = C.inbox.find((x) => x.id === id);
  if (!c || c.hero == null || !canTrust(s, c)) return { ok: false, err: 'none' };
  const k = c.choices.findIndex((x) => x.rec);
  const res = chooseCard(s, id, k);
  if (res.ok || res.err === 'money' || res.err === 'rp') {
    const key = trustKey(c.hero, c.kind);
    if (!C.trust.includes(key)) C.trust.push(key);
  }
  return res;
}
/** 任せたのを戻す（受け箱から） */
export function untrust(s: P1State, key: string) {
  const C = cardsOf(s);
  C.trust = C.trust.filter((x) => x !== key);
}
/** 任せた提案の記録を受け取る（トーストにする。受け取ったら空に） */
export function takeAuto(s: P1State): AutoRec[] {
  const C = s.cards;
  if (!C?.auto.length) return [];
  const xs = C.auto;
  C.auto = [];
  return xs;
}

/** 自動プレイが受ける手 */
export const SIM_CARD_TAKE = new Set<string>(['shelf', 'invest', 'part', 'famous', 'permit']);
const SIM_TAKE = (a: PropAct) => SIM_CARD_TAKE.has(a.k === 'stock' ? (a.add ? 'shelf' : 'goods') : a.k);
/** 自動プレイ（通常の方針）：ヒーローからの提案のおすすめを、部長の提案と同じ条件（見込みがプラス・払ったあとも keep が残る）で受ける */
export function simTake(s: P1State, keep: number): number {
  let n = 0;
  for (const c of [...cardInbox(s)]) {
    if (!['clerk', 'crafter', 'buyer', 'idle'].includes(c.src)) continue;
    // 通常の方針が自分で決めている手（出店・棚の品ぞろえの入れ替え・パネルの順・人の配置）は、方針の判断のまま（受けない）。
    // 受けるのは「棚を増やして並べる・設備・アルバイト・名物店主・発掘許可」。宣伝は通常の方針が打たない手なので受けない（v25 の計測：受けると Uncommon が +43%）
    const k = c.choices.findIndex((x) => x.rec && x.act.k === 'do' && SIM_TAKE(x.act.a) && (x.est ?? 0) > 0);
    if (k < 0) continue;
    const ch = c.choices[k];
    if (s.money - ch.cost < keep || (ch.rp ?? 0) > (s.rp ?? 0)) continue;
    if (chooseCard(s, c.id, k).ok) n++;
  }
  return n;
}

// ---------------------------------------------------------------- 文（画面）

/** 区切り（「 ・ 」） */
const SEP = () => t('・', ' · ');
const FREE = () => t('費用なし', 'Free');
const EXPECT = () => t('見込み', 'Expected');
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sgn = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const STAGE_NM: Record<Stage, () => string> = { buy: () => t('① 調達', '① Buy'), craft: () => t('② 製造', '② Craft'), haul: () => t('③ 物流', '③ Haul'), sell: () => t('④ 販売', '④ Sell') };
const TASK_NM: Partial<Record<Task, () => string>> = { craft: () => t('工房', 'the workshop'), transport: () => t('運搬', 'hauling'), buy: () => t('調達', 'buying'), shop: () => t('お店', 'the shop') };

/** 課題の文（言い切りの形。persona.ts の say が型の言い回しを付ける） */
function core(s: P1State, c: Card): string {
  const i = c.issue;
  switch (i.k) {
    case 'sell': {
      const wari = Math.max(1, Math.round(i.share * 10));
      const pct = Math.round(i.share * 100);
      return i.pile >= 10
        ? t(`[[お客さんの ${wari} 割]]しか来ず、在庫が工房に[[ ${i.pile} 個]]たまっている`, `only [[${pct}% of customers]] come in, and [[${i.pile}]] items pile up in the workshop`)
        : t(`この売り場には[[お客さんの ${wari} 割]]しか来ない`, `only [[${pct}% of customers]] come to our shops`);
    }
    case 'craft':
      return t(`作業台が手いっぱいで、月[[ ${i.n} 個]]しか作れない`, `the benches are maxed out at [[${i.n}]] a month`);
    case 'buy':
      return t(`素材が足りず、月[[ ${i.n} 個]]ぶんしか集まらない`, `materials only cover [[${i.n}]] a month`);
    case 'haul':
      return t(`運ぶのが追いつかず、月[[ ${i.n} 個]]しか運べない`, `hauling can only move [[${i.n}]] a month`);
    case 'idle':
      return i.what === 'assign'
        ? t(`手が空いている。[[${STAGE_NM[i.stage ?? 'craft']()}]]なら手伝える`, `my hands are free. I can help with [[${STAGE_NM[i.stage ?? 'craft']()}]]`)
        : i.what === 'ad'
          ? t('手が空いている。[[宣伝]]なら売上を伸ばせる', 'my hands are free. An [[ad]] would lift sales')
          : t('手が空いている。[[荒れ地]]を掘りに行ける', 'my hands are free. I could dig the [[wasteland]]');
    case 'hire':
      return t(`[[${STAGE_NM[i.stage]()}]]の担当がいなくて、手が足りない。雇える[[候補が ${i.n} 人]]来ている`, `nobody covers [[${STAGE_NM[i.stage]()}]]. [[${i.n} candidates]] are ready to hire`);
    case 'head': {
      const p = s.deleg?.inbox.find((x) => x.id === c.pid);
      if (!p) return t('打てる手がある', 'there is a move to make');
      switch (p.unit) {
        case 'G':
          return p.stage ? t(`[[${STAGE_NM[p.stage]()}]]の流れが月[[ +${p.units ?? 0} 個]]ほど太くなる`, `[[${STAGE_NM[p.stage]()}]] would gain about [[+${p.units ?? 0}]] a month`) : t('流れが太くなる', 'the flow would widen');
        case 'ad':
          return t('いまの売り場なら、[[宣伝]]が元を取れる', 'with the shops as they are, an [[ad]] pays off');
        case 'finds':
          return p.dig?.tablet ? t(`この荒れ地の[[ ${p.dig.tablet} 層目]]に石板が眠っている`, `a tablet lies in layer [[${p.dig.tablet}]] here`) : t(`この荒れ地に出土品が[[ ${p.dig?.finds ?? 0} 個]]ほど眠っている`, `about [[${p.dig?.finds ?? 0}]] finds sleep here`);
        case 'share':
          return t(`ここに出すと、取り分が[[ +${p.est.toFixed(1)}%]]ほど伸びる`, `opening here grows our share by [[+${p.est.toFixed(1)}%]]`);
        case 'legal':
          return p.act.k === 'ma' ? t('この会社は[[安く買える]]', 'this company is [[cheap to buy]]') : t('この復刻品は[[もうすぐ真似される]]', 'this revival is [[about to be copied]]');
      }
      return '';
    }
    case 'cs': {
      const name = i.key ? PRODUCT[i.key]?.name ?? i.key : '';
      const what = i.kind === 'out' ? t(`${name}が品切れだった`, `${name} was sold out`) : i.kind === 'price' ? t(`${name}が高い`, `${name} costs too much`) : t('お店が閉まっていた', 'the shop was closed');
      return t(`お客さんから「${what}」と[[声が届いている]]`, `a customer says ${what} — [[we got a complaint]]`);
    }
    case 'flame':
      return i.cause === 'out' ? t('品切れが続いて、[[炎上しそうな気配]]がある', 'sell-outs keep happening — [[a backlash is brewing]]') : t('問い合わせを放っておいて、[[炎上しそうな気配]]がある', 'we ignored inquiries — [[a backlash is brewing]]');
    case 'rally':
      return i.sale ? t(`[[${i.by}]]がセールで巻き返してきている`, `[[${i.by}]] is fighting back with a sale`) : t(`[[${i.by}]]が宣伝で反撃してきている`, `[[${i.by}]] is striking back with ads`);
    case 'quit':
      return t(`もう、ここを辞めようと思っている…あと[[ ${i.days} 日]]で`, `I am thinking of quitting… in [[${i.days} days]]`);
    case 'tax':
      return t(`あと[[ ${g(i.need)}]] 投資すると、税が[[ ${g(i.save)}]] 減る`, `investing [[${g(i.need)}]] more cuts tax by [[${g(i.save)}]]`);
    case 'event':
      return c.ev ? evSay(c.ev) : '';
    case 'diplo':
      return c.dip ? dipSay(c.dip) : '';
    case 'stall':
      return stallSay(i.stage, i.why);
    case 'store':
      return i.pct >= 100
        ? t(`倉庫が[[いっぱい]]（素材 ${i.mats}・商品 ${i.goods}）。在庫を優先して売りさばこう`, `storage is [[full]] (${i.mats} materials, ${i.goods} goods). Let’s clear stock first`)
        : t(`倉庫が[[ ${i.pct}%]]まで埋まっている（素材 ${i.mats}・商品 ${i.goods}）。在庫を優先して売りさばこう`, `storage is [[${i.pct}%]] full (${i.mats} materials, ${i.goods} goods). Let’s clear stock first`);
    case 'staff':
      return t(`先月は[[ ${i.off} 日]]、店長が休む日に店を回す人がいなかった。[[従業員 ${SELF_RUN.min} 人]]いれば開けておける`, `[[${i.off} days]] last month, nobody kept the shop open when the manager rested. With [[${SELF_RUN.min} staff]] it stays open`);
  }
}
/** 段 UI5a：流れが止まっている理由の文（カードのセリフ・月次報告の「課題あり」） */
export function stallSay(stage: Stage, why: StallWhy): string {
  const nm = STAGE_NM[stage]();
  switch (why) {
    case 'none':
      return stage === 'buy' ? t(`[[${nm}]]が止まっている。調達係がいない`, `[[${nm}]] has stopped: no buyer`) : stage === 'haul' ? t(`[[${nm}]]が止まっている。運ぶ人がいない`, `[[${nm}]] has stopped: no hauler`) : t(`[[${nm}]]が止まっている。担当がいない`, `[[${nm}]] has stopped: nobody on it`);
    case 'rest':
      return t(`[[${nm}]]が止まっている。担当が[[休んでいて]]、代わりがいない`, `[[${nm}]] has stopped: the one in charge is [[resting]] with no relief`);
    case 'full':
      return t(`[[${nm}]]が止まっている。工房の[[置き場所がいっぱい]]で素材を買えない`, `[[${nm}]] has stopped: the workshop is [[full]], so no materials come in`);
    case 'money':
      return t(`[[${nm}]]が止まっている。[[お金が足りず]]素材を買えない`, `[[${nm}]] has stopped: [[not enough money]] for materials`);
    case 'cap':
      return t(`[[${nm}]]が止まっている。今月の[[調達の上限]]に届いた`, `[[${nm}]] has stopped: this month’s [[buying limit]] is hit`);
    case 'route':
      return t(`[[${nm}]]が止まっている。素材の[[ルートが無い]]`, `[[${nm}]] has stopped: [[no route]] for a material`);
    case 'backlog':
      return t(`[[${nm}]]が止まっている。できた品が[[運ばれずにたまっている]]`, `[[${nm}]] has stopped: goods [[pile up unhauled]]`);
    case 'nomake':
      return t(`[[${nm}]]が止まっている。[[作るもの]]が決まっていない`, `[[${nm}]] has stopped: [[nothing to make]]`);
    case 'noworker':
      return t(`[[${nm}]]が止まっている。作業台に[[職人がいない]]`, `[[${nm}]] has stopped: [[no crafter]] at the bench`);
    case 'noclerk':
      return t(`[[${nm}]]が止まっている。売り場に[[人がいない]]`, `[[${nm}]] has stopped: [[nobody]] on the shop floor`);
    case 'empty':
      return t(`[[${nm}]]が止まっている。棚に[[並べる品がない]]`, `[[${nm}]] has stopped: [[nothing]] on the shelves`);
  }
}
/** カードのセリフ（話し手の口調の型で。CARD.sayMax 字まで） */
export function sayOf(s: P1State, c: Card): string {
  const x = core(s, c);
  // 段 UI4：使者は自分の言葉（言い出し・語尾は付けない）。できごとは、マインちゃんだけの話はそのまま、ヒーロー・町の長は口調の型、マインちゃんの報告は「〜よ！」
  if (c.src === 'diplo') return x;
  if (c.src === 'event' && c.ev) {
    if (EV_TEXT[c.ev.kind].full) return x;
    if (c.hero == null) return x + t('よ！', '!');
    return heroSay(c.hero, x);
  }
  // 辞めたい：本人の言葉なので、言い出し・語尾は付けない（型の味は上のウィットの一言で）
  if (c.issue.k === 'quit') return `${x}${t('。', '.')}`;
  if (c.hero == null) return say('polite', x);
  return heroSay(c.hero, x);
}

/** ウィットの一言（話し手の口調の型と属性から。課題の種類・月で回す）。ヒーローでない話し手は無し */
export const quipOfCard = (c: Card): string | null => (c.hero != null && c.src !== 'event' && c.src !== 'diplo' ? quipOf(c.hero, (c.issue.k === 'hire' ? 'idle' : c.issue.k === 'stall' ? (c.issue.stage === 'sell' ? 'sell' : c.issue.stage === 'craft' ? 'craft' : 'buy') : c.issue.k === 'staff' || c.issue.k === 'store' ? 'sell' : c.issue.k === 'haul' ? 'buy' : c.issue.k) as QuipCat, c.mk + c.id) : null);

/** 肩書き（部門の色・アイコン・文） */
export function roleOfCard(s: P1State, c: Card): { icon: string; text: string; color: string } {
  const d = c.dept ? DEPT[c.dept] : DEPT.logistics;
  const shop = c.uid != null ? s.buildings.find((b) => b.uid === c.uid) : undefined;
  const shopNm = shop ? (P1B[shop.id] ? nameOfB(shop.id) : '') : t('お店', 'shop');
  switch (c.src) {
    case 'clerk':
      return { icon: '🏪', text: t(`${shopNm}の店員`, `${shopNm} clerk`), color: DEPT.logistics.color };
    case 'crafter':
      return { icon: '🔨', text: t('工房の職人', 'Workshop crafter'), color: DEPT.logistics.color };
    case 'buyer':
      return { icon: '📦', text: t('調達係', 'Buyer'), color: DEPT.logistics.color };
    case 'idle':
      return { icon: '☕', text: t('手の空いたヒーロー', 'Free hero'), color: d.color };
    case 'head':
      return { icon: d.icon, text: t(`${d.name}部長`, `${d.name} head`), color: d.color };
    case 'cs':
      return c.uid != null ? { icon: '🏪', text: t(`${shopNm}の店員`, `${shopNm} clerk`), color: DEPT.support.color } : { icon: '🎧', text: t('カスタマーサポートの担当', 'Support lead'), color: DEPT.support.color };
    case 'flame':
    case 'rally':
      return { icon: '📣', text: t('マーケの担当', 'Marketing lead'), color: DEPT.marketing.color };
    case 'tax':
      return { icon: '🧾', text: t('経理の担当', 'Accounting lead'), color: DEPT.accounting.color };
    case 'quit':
      return { icon: '😣', text: t('辞めたい', 'Wants to quit'), color: DEPT.hr.color };
    case 'hr':
      return { icon: DEPT.hr.icon, text: c.hero != null ? t('人事の担当', 'HR lead') : t('人事の見立て', 'HR view'), color: DEPT.hr.color };
    case 'event': {
      const color = c.ev && !isGood(c.ev.kind) ? '#c4521b' : '#4a78c4';
      if (!c.ev || c.ev.who === 'mine') return { icon: '📣', text: t('マインちゃんの報告', 'Mine-chan reports'), color };
      if (c.ev.who === 'chief') return { icon: '🏘', text: t('町の長', 'Town elder'), color };
      const st = c.hero != null ? staffOf(s, c.hero) : null;
      const sh = st?.task === 'shop' ? s.buildings.find((b) => b.uid === st.target) : undefined;
      const txt = st?.task === 'shop' ? t(`${sh ? nameOfB(sh.id) : t('お店', 'shop')}の店員`, `${sh ? nameOfB(sh.id) : 'Shop'} clerk`) : st?.task === 'craft' ? t('工房の職人', 'Workshop crafter') : st?.task === 'buy' ? t('調達係', 'Buyer') : t('ヒーロー', 'Hero');
      return { icon: st?.task === 'shop' ? '🏪' : st?.task === 'craft' ? '🔨' : st?.task === 'buy' ? '📦' : '☕', text: txt, color };
    }
    case 'diplo': {
      const L = landDef(c.dip?.land ?? 'ruby');
      return { icon: '🌐', text: t(`${L.name}の使者`, `Envoy of ${L.name}`), color: L.color };
    }
    case 'stock': {
      const st = c.hero != null ? staffOf(s, c.hero) : null;
      if (st?.task === 'shop') return { icon: '📦', text: t(`${shopNm}の店長`, `${shopNm} manager`), color: DEPT.logistics.color };
      return { icon: '📦', text: c.hero != null ? t('運搬係', 'Hauler') : t('マインちゃんの報告', 'Mine-chan reports'), color: DEPT.logistics.color };
    }
    case 'stall': {
      if (c.hero == null) return { icon: '⚠', text: t('マインちゃんの報告', 'Mine-chan reports'), color: '#c4521b' };
      const st = staffOf(s, c.hero);
      const txt = st?.task === 'buy' ? t('調達係', 'Buyer') : st?.task === 'transport' ? t('運搬係', 'Hauler') : st?.task === 'craft' ? t('工房の職人', 'Workshop crafter') : t('担当者', 'Staff');
      return { icon: '⚠', text: txt, color: '#c4521b' };
    }
  }
}
/** 段 UI4：できごと・外交のカードの見出し（名前の行・小さい一行） */
export function eventHead(s: P1State, c: Card): { title: string; tag: string } | null {
  if (c.src === 'event' && c.ev) return { title: `${evIcon(c.ev.kind)} ${evTitle(c.ev)}`, tag: isGood(c.ev.kind) ? t('できごと（良い知らせ）', 'Event (good news)') : t('できごと（困りごと）', 'Event (trouble)') };
  if (c.src === 'diplo' && c.dip) {
    const rel = relOf(s, c.dip.land);
    return { title: dipTitle(c.dip), tag: t(`${landDef(c.dip.land).envoy}・仲 ${Math.round(rel)} / 100`, `${landDef(c.dip.land).envoy} · Relations ${Math.round(rel)} / 100`) };
  }
  return null;
}
const nameOfB = (id: string) => DEF[id]?.name ?? id;

/** 選択肢の文（1 行目：何をするか・2 行目：費用と見込み） */
export function choiceText(s: P1State, c: Card, ch: Choice): { icon: string; label: string; sub: string } {
  const a = ch.act;
  const est = ch.est ?? 0;
  const unitsTxt = ch.units != null ? t(`+${Math.round(ch.units)} 個／月`, `+${Math.round(ch.units)} / mo`) : '';
  const costTxt = ch.rp ? t(`研究 ${ch.rp} RP`, `${ch.rp} RP`) : ch.cost > 0 ? g(ch.cost) : t('費用なし', 'Free');
  switch (a.k) {
    case 'do': {
      const p = a.a;
      const net = ch.unit === 'G' ? t(`・${sgn(est)} G／月`, ` · ${sgn(est)} G/mo`) : '';
      switch (p.k) {
        case 'stock': {
          const nm = goodsName(p.key);
          // 段 UI5a：何を売るかは製造が決める（作業台を切り替えると、棚は自動でついてくる）
          if (p.add) return { icon: '👍', label: t(`棚をもう 1 段、${nm}も作って並べよう`, `One more shelf, and make and sell ${nm} too`), sub: `${costTxt}${SEP()}${unitsTxt}${net}` };
          if (ch.replace) return { icon: '🔁', label: t(`${goodsName(ch.replace)}の代わりに${nm}を作ろう`, `Make ${nm} instead of ${goodsName(ch.replace)}`), sub: `${costTxt}${SEP()}${unitsTxt}${net}` };
          return { icon: '🧺', label: t(`${nm}も作って、空いた棚に並べよう`, `Make ${nm} for the free shelf`), sub: `${costTxt}${SEP()}${unitsTxt}${net}` };
        }
        case 'build':
          if (p.id === 'general_store')
            return {
              icon: '🏠',
              label: myShops(s).length >= 2 ? t('次のお店を建てよう（食い合いあり）', 'Build another shop (shares customers)') : t('2 軒目を建てよう（食い合いあり）', 'Build a 2nd shop (shares customers)'),
              sub: t(`${g(ch.cost)}・毎月 ${g(ch.monthly ?? shopMonthly())}・${unitsTxt}・差し引き ${sgn(est)} G／月`, `${g(ch.cost)} · ${g(ch.monthly ?? shopMonthly())}/mo · ${unitsTxt} · net ${sgn(est)} G/mo`),
            };
          return { icon: '🏗', label: actName(s, p), sub: [costTxt, unitsTxt].filter(Boolean).join(SEP()) + net };
        case 'skill':
          return { icon: p.id === 'host' ? '🙇' : '✨', label: t(`「${SKILL[p.id]?.name ?? p.id}」を取ろう`, `Take ${SKILL[p.id]?.name ?? p.id}`), sub: `${costTxt}${SEP()}${unitsTxt}${net}` };
        case 'level':
          return { icon: '⬆', label: actName(s, p), sub: `${g(ch.cost)}${SEP()}${unitsTxt}${net}` };
        case 'famous':
          return { icon: '⭐', label: t('売れるお店に名物店主を置こう', 'Put a celebrity shopkeeper in the best shop'), sub: `${costTxt}${SEP()}${unitsTxt}${net}` };
        case 'part':
          return { icon: '🙋', label: t('アルバイトをもう 1 人', 'One more part-timer'), sub: t(`毎月 ${g(ch.monthly ?? partMonthly())}・${unitsTxt}・差し引き ${sgn(est)} G／月`, `${g(ch.monthly ?? partMonthly())}/mo · ${unitsTxt} · net ${sgn(est)} G/mo`) };
        case 'invest':
          return { icon: '🔧', label: t(`設備投資：${INVEST[p.id]?.name ?? p.id}`, `Invest: ${INVEST[p.id]?.name ?? p.id}`), sub: `${g(ch.cost)}${SEP()}${unitsTxt}${net}` };
        case 'ad':
          return { icon: '📣', label: t(`「${ADS.find((x) => x.id === p.id)?.name ?? p.id}」を出そう`, `Run ${ADS.find((x) => x.id === p.id)?.name ?? p.id}`), sub: t(`${g(ch.cost)}・期間で ${sgn(est)} G（費用込み）`, `${g(ch.cost)} · ${sgn(est)} G over the run, net`) };
        case 'assign':
          return { icon: '🙋', label: p.hero === c.hero ? t(`わたしを${TASK_NM[p.task]?.() ?? ''}に回して`, `Put me on ${TASK_NM[p.task]?.() ?? ''}`) : t(`${heroNm(p.hero)}を${TASK_NM[p.task]?.() ?? ''}に`, `Put ${heroNm(p.hero)} on ${TASK_NM[p.task]?.() ?? ''}`), sub: [FREE(), unitsTxt].filter(Boolean).join(SEP()) + net };
        case 'hire':
          return { icon: '🤝', label: t(`${heroNm(p.hero)}を雇おう`, `Hire ${heroNm(p.hero)}`), sub: t(`月給 ${g(ch.monthly ?? 0)}・${unitsTxt}・差し引き ${sgn(est)} G／月`, `${g(ch.monthly ?? 0)}/mo · ${unitsTxt} · net ${sgn(est)} G/mo`) };
        case 'permit':
          return { icon: '⛏', label: actName(s, p), sub: t(`${costTxt} ・ 出土品 ${Math.round(est)} 個ぶん`, `${costTxt} · ${Math.round(est)} finds`) };
        case 'staff':
          return { icon: '🧑‍🤝‍🧑', label: t(`従業員を ${p.n} 人にしよう`, `Have ${p.n} staff`), sub: [t(`毎月 ${g(ch.monthly ?? 0)}`, `${g(ch.monthly ?? 0)}/mo`), ...(ch.cost > 0 ? [t(`控室の増設 ${g(ch.cost)}`, `staff room ${g(ch.cost)}`)] : []), t('休む日も開く', 'open on rest days')].join(SEP()) };
        case 'clear':
          return { icon: '🏷', label: t('在庫を優先して売りさばきましょう', 'Let’s clear our stock first'), sub: [p.cut != null && CLEAR.cuts[p.cut] ? t(`在庫品だけ ${Math.round(CLEAR.cuts[p.cut] * 10)} 割引`, `${Math.round(CLEAR.cuts[p.cut] * 100)}% off stock items`) : t('値引きなし', 'No discount'), t(`在庫品 月 ${Math.round(ch.units ?? 0)} 個ほど`, `~${Math.round(ch.units ?? 0)} stock items/mo`)].join(SEP()) };
        case 'useup':
          return { icon: '🧪', label: t(`いまある素材で${goodsName(p.key)}${p.rar === 'U' ? '（アンコモン）' : ''}が作れます`, `We can make ${goodsName(p.key)}${p.rar === 'U' ? ' (Uncommon)' : ''} from what we have`), sub: [FREE(), t(`${Math.round(ch.units ?? 0)} 個（作業台 ${p.slot + 1}・作り終えたら戻る）`, `${Math.round(ch.units ?? 0)} (bench ${p.slot + 1}, then back)`)].join(SEP()) };
        case 'order':
          return { icon: '📦', label: t(`${MATS[p.m].name}を ${p.lots * 10} 個、問屋に注文しよう`, `Order ${p.lots * 10} ${MATS[p.m].name}`), sub: t('届けば作業台がまた動く（調達係が休むあいだの穴埋め）', 'Gets the benches moving again') };
        default:
          return { icon: '▶', label: actName(s, p), sub: `${costTxt}${unitsTxt ? ` ・ ${unitsTxt}` : ''}` };
      }
    }
    case 'skip':
      return c.src === 'quit'
        ? { icon: '…', label: t('何もしない', 'Do nothing'), sub: t('このままだと辞めてしまう', 'They will leave') }
        : c.src === 'flame'
          ? { icon: '👀', label: t('様子を見る', 'Wait and see'), sub: t('今月も続くと炎上', 'Another month and it blows up') }
          : c.src === 'rally'
            ? { icon: '⏸', label: t('宣伝では返さない', 'Don’t answer with ads'), sub: t('棚・新商品で引き離す', 'Pull ahead with shelves and goods') }
            : { icon: '⏸', label: t('いまはこのままで', 'Not now'), sub: t('来月また考える', 'Think again next month') };
    case 'approve': {
      const p = s.deleg?.inbox.find((x) => x.id === a.pid);
      const cost = ch.rp ? t(`研究 ${ch.rp} RP`, `${ch.rp} RP`) : ch.cost > 0 ? g(ch.cost) : t('費用なし', 'Free');
      const est2 = p ? (p.unit === 'G' ? t(`月 ${sgn(p.est)} G`, `${sgn(p.est)} G/mo`) : p.unit === 'ad' ? t(`期間で ${sgn(p.est)} G`, `${sgn(p.est)} G over the run`) : p.unit === 'finds' ? t(`出土品 ${p.est} 個`, `${p.est} finds`) : p.unit === 'share' ? t(`取り分 +${p.est.toFixed(1)}%`, `share +${p.est.toFixed(1)}%`) : t(`月の売上 ${sgn(p.est)} G`, `${sgn(p.est)} G/mo sales`)) : '';
      return { icon: '✔', label: t(`承認：${p ? actName(s, p.act) : ''}`, `Approve: ${p ? actName(s, p.act) : ''}`), sub: `${cost}${SEP()}${EXPECT()} ${est2}` };
    }
    case 'reject':
      return { icon: '✖', label: t('却下', 'Reject'), sub: t('この手はやめておく', 'Not this move') };
    case 'hold':
      return { icon: '⏸', label: t('保留', 'Hold'), sub: t(`受け箱に残す（${DELEG.prop.expire} か月で消える）`, `Keep in the inbox (${DELEG.prop.expire} months)`) };
    case 'reply': {
      const nm = a.r === 'swap' ? t('代わりの品を渡す', 'Give a substitute') : a.r === 'refund' ? t('返金する', 'Refund') : t('謝る', 'Apologize');
      const lock = replyLock(s, a.r);
      const item = a.r === 'swap' ? swapItem(s) : null;
      const what = a.r === 'refund' ? g(ch.cost) : a.r === 'swap' ? (item ? t(`在庫の${goodsName(item)} 2 個`, `2 × ${goodsName(item)} from stock`) : t('在庫なし', 'no stock')) : t('費用なし', 'free');
      const sub = t(`満足度 +${Math.round(est)} ・ ${what}${lock === 'money' ? '（資金不足）' : ''}`, `Satisfaction +${Math.round(est)} · ${what}${lock === 'money' ? ' (short of funds)' : ''}`);
      return { icon: a.r === 'swap' ? '🎁' : a.r === 'refund' ? '💴' : '🙇', label: nm, sub };
    }
    case 'apologize':
      return { icon: '🙇', label: t('お詫びの告知を出す', 'Post an apology'), sub: t(`${g(ch.cost)} ・ この予告からは炎上しない`, `${g(ch.cost)} · this warning won’t blow up`) };
    case 'talk':
      return { icon: '☕', label: t('面談する', 'Have a talk'), sub: t(`士気 +${Math.round(est)}（予告 1 回に 1 度）`, `Morale +${Math.round(est)} (once per notice)`) };
    case 'raise':
      return { icon: '💰', label: t('昇給する', 'Give a raise'), sub: t(`月給 +${g(ch.monthly ?? 0)} ・ 士気 +${Math.round(est)}`, `+${g(ch.monthly ?? 0)}/mo · morale +${Math.round(est)}`) };
    case 'bonus':
      return { icon: '🎉', label: t('賞与を出す', 'Pay a bonus'), sub: t(`${g(ch.cost)} ・ 士気 +${Math.round(est)}`, `${g(ch.cost)} · morale +${Math.round(est)}`) };
    case 'donate':
      return { icon: '🔬', label: t('研究に寄付する', 'Donate to research'), sub: t(`${g(ch.cost)} ・ 税 −${g(est)}・研究ポイントも入る`, `${g(ch.cost)} · tax −${g(est)}, plus RP`) };
    case 'ev': {
      const o = c.ev?.opts[a.i];
      if (!c.ev || !o) return { icon: '▶', label: '', sub: '' };
      return { icon: optIcon(c.ev.kind, o.id), label: optName(c.ev.kind, o.id), sub: optSub(c.ev, o) };
    }
    case 'dip': {
      const o = c.dip ? dipOpts(s, c.dip)[a.i] : undefined;
      if (!c.dip || !o) return { icon: '▶', label: '', sub: '' };
      return dipOptText(s, c.dip, o);
    }
    case 'open':
      return a.to === 'tax' ? { icon: '🧾', label: t('税と節税を開く', 'Open tax'), sub: t(`設備に投資すると税 −${g(est)} まで`, `Investing can cut up to ${g(est)}`) } : { icon: '📣', label: t('宣伝を開く', 'Open ads'), sub: '' };
  }
}
/** 下の一行の「任せる」の文 */
export const trustText = () => ({ icon: '🤝', label: t('任せる（次から自分で実行）', 'Trust them (act, then report)'), sub: t('★3 だけ ・ 受け箱からいつでも戻せる', '★3 only · undo any time from the inbox') });

/** 任せた提案の報告の文（トースト・月次報告） */
export function autoText(s: P1State, x: AutoRec): string {
  const name = actName(s, x.act);
  const est = x.units != null ? t(`（見込み +${Math.round(x.units)} 個／月）`, ` (expected +${Math.round(x.units)} / mo)`) : '';
  return t(`🤝 ${heroNm(x.hero)}が「${name}」を実行しました${est}`, `🤝 ${heroNm(x.hero)} carried out: ${name}${est}`);
}
/** 任せた種類の名前（受け箱の「任せている提案」） */
export function trustName(key: string): string {
  const [hero, kind] = key.split(':');
  const what = kind === 'sell' ? t('販売の提案', 'sales moves') : kind === 'craft' ? t('製造の提案', 'crafting moves') : kind === 'buy' ? t('調達の提案', 'buying moves') : kind === 'idle' ? t('手が空いたときの提案', 'free-time moves') : kind === 'head' ? t('部長の提案', 'head proposals') : t(`${DEPT[(key.split(':')[2] ?? 'logistics') as DeptId]?.name ?? ''}部長の提案`, `${DEPT[(key.split(':')[2] ?? 'logistics') as DeptId]?.name ?? ''} head proposals`);
  return t(`${heroNm(Number(hero))}：${what}`, `${heroNm(Number(hero))}: ${what}`);
}

/** テスト：カードのセリフの字数 */
export const sayLength = (s: P1State, c: Card) => sayLen(sayOf(s, c));
