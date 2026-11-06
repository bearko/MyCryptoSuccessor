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
import { isEn, t } from '../../i18n';
import { meetHero, propErrK, readErr } from './lesson';
import { ADS, CARD, CLEAR, DELEG, DEPT, INVEST, skuParts, MATS, MORALE, P1B, PAY, POLICY, PRODUCT, SELF_RUN, SKILL, TAX, aptitude, deptOf, type DeptId, type InqKind, type ReplyKind, type Sku, type Task } from './data';
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
import { DAYS, invLv, myWarehouses, poolCap, poolUsed, madeSkus, adCost, adPick, bonus, bonusCost, bottleneck, buyCap, donate, donateLock, has, hasRoute, heroStats, investCost as investCostOf, signFee, skillLock, myShops, nextDonateCost, partMax, raise, raiseStep, recipeOf, sellInfo, stageCaps, staffOf, whatIf, wageOf, type P1State, type Report, type Stage, type StageIf, type Staff, type StallWhy } from './model';
import { flowGain, isFlowKey, issuesOf, limitWord, type CoIssue, type IssueKey, type IssueLv } from './issues';
import { adGain, goodsName, partMonthly, sellMoves, shopMonthly, stockMsg, stockPlan, type SellMove } from './moves';
import { apologize, bestReply, csOn, noticeCost, refundCost, reply, replyGain, replyLock, swapItem } from './cs';
import { quitLeft, talk, talkGain } from './hr';
import { afterOf, applyPlan, baseOf, planBlock, planCost, planOf, stepsOf, type Plan, type PlanRes } from './plan';
import { actNoun, actTheme, judgeOf, monthOf, valueOfPlan, type NoKind } from './brief';
import { jammed, prodOf, useUpOf } from './proj';
import { holdMonth, poolNow, storeFc, whenFull } from './storefc';
import { corpOf, tiltOf } from './policy';
import { clearFrees, clearInfo, clearUnits, fromStock, storeFix, storeFull, type StoreFix } from './stock';
import { dedRate, quarterNow, taxOn, taxPlan } from './acct';
import { heroSay, quipOf, say, sayLen, type QuipCat } from './persona';
import { DEF } from '../defs';
import { applyEvent, eventDue, evIcon, evSay, evTitle, isGood, optIcon, optName, optSub, recOpt, EV_TEXT, type EvData } from './events';
import { applyDiplo, diploCompany, dipOptText, dipOpts, dipRec, dipSay, dipTitle, landDef, relOf, type DipData } from './diplo';
import { applyDuo, duoDraft, duoDue, duoHead, duoOptSub, duoOptText, duoSay, type DuoData } from './duo';
import { voiceQuip, voiceSay } from './voice';
import { numsOf, speakCore, type Spoken, type SummaryCore } from './summary';
import { budgetOpen, budgetRetry, laborNeed, budgetDepts, deptBudget, nextUp, setBudget, setCrewCap, amountOf, crewWageMonth, lvName, type BudgetAsk, type BudgetLv } from './budget';
import { propsOpen } from './stage';
import { noteMarks } from './mapmarks';
import { BUDGET } from './data';

// ---------------------------------------------------------------- 型

/** 出どころ（統計・受けた割合の数え） */
export type CardSrc = 'clerk' | 'crafter' | 'buyer' | 'idle' | 'head' | 'cs' | 'flame' | 'quit' | 'tax' | 'rally' | 'hr' | 'event' | 'diplo' | 'stall' | 'duo' | 'stock' | 'budget';
/** ヒーローからの提案（★3 で「任せる」を選べる出どころ。段 UI9：人事の担当（hr）もふるい分け・推奨の付け直し・失効の対象） */
export const PROPOSAL_SRC: CardSrc[] = ['clerk', 'crafter', 'buyer', 'idle', 'head', 'stall', 'stock', 'hr'];
export const CARD_SRCS: CardSrc[] = ['clerk', 'crafter', 'buyer', 'idle', 'head', 'cs', 'flame', 'quit', 'tax', 'rally', 'hr', 'event', 'diplo', 'stall', 'duo', 'stock', 'budget'];

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
  | { k: 'dip'; i: number }
  /** 段 P2：ヒーローの組み合わせの i 番目の選択肢 */
  | { k: 'duo'; i: number }
  /** 段 I1：部長からの頼み：部門の予算を上げる・従業員の上限を上げる（budget.ts の setBudget・setCrewCap） */
  | { k: 'budget'; dept: DeptId; lv: BudgetLv; amt?: number }
  | { k: 'crew'; dept: DeptId; cap: number };
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
  /** おすすめ（金色・「推奨」の札） */
  rec?: boolean;
  /** 段 UI5d：置き場所が増える数（倉庫の強化・建てる） */
  room?: number;
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
  | { k: 'duo' }
  /**
   * 段 UI5c：倉庫が埋まりそう（埋まり方 %・素材・運ぶ前の商品・在庫品の数）。
   * 段 UI5d：fix＝推奨の倉庫の手（rack：倉庫の強化・dock：拠点の保管・build：倉庫を建てる・more：もう 1 棟・hub：物流拠点を建てる。無ければ売りさばき）
   */
  | { k: 'store'; pct: number; mats: number; goods: number; items: number; fix?: StoreFixKind; next?: 'useup' | 'clear' }
  /** 段 I1：部長からの頼み（予算を増やしてください・人を雇わせてください） */
  | { k: 'budget'; ask: BudgetAsk };
/** 段 UI5d：倉庫の提案の推奨の手の種類 */
export type StoreFixKind = 'rack' | 'dock' | 'build' | 'more' | 'hub';
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
  /** 段 P2：ヒーローの組み合わせ */
  duo?: DuoData;
  /** 段 UI7g：この提案が解く課題（issues.ts。推奨の手の課題）と、その優先（1 から） */
  iss?: { key: IssueKey; pri: number; lv?: IssueLv };
  /** 段 UI9：作ったときの会社の課題の一覧（提案書は同じ課題で判断する。無くてよい項目：古いセーブは開いたときの一覧） */
  issues?: CoIssue[];
  /** 段 UI7h：知らせ（推奨の札なし・「わかった」で閉じる）。流れが止まったのに、推奨が承認になる直す手が無い月 */
  note?: true;
  /**
   * 段 UX1（C-1）：提案書を初めて開いた日の KPI（短期・長期の差）。提案書を開き直しても数字が変わらないように、
   * この数字を主に出し、いま計算し直した数字は小さく添える（無くてよい項目：古いセーブは次に開いたとき）
   */
  snap?: { day: number; short: number; long: number };
}
/** 段 UI7h：取り下げの理由（資金が減った・方針を替えた・課題がほかの手で解けた・見込みが下がった） */
export type GoneWhy = 'money' | 'policy' | 'solved' | 'loss';
/** 段 UI7h：受け箱で古くなって取り下げた提案（理由の一行。いまの月・いまの町のものを受け箱の上に出す） */
export interface Gone {
  mk: number;
  sector: string;
  day: number;
  hero: number | null;
  /** 取り下げた手の名前（actName） */
  name: string;
  why: GoneWhy;
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
  /** 段 UI7h：取り下げた提案（新しい順に GONE_KEEP 件まで。無くてよい項目） */
  gone?: Gone[];
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
export const canTrust = (s: P1State, c: Card) => propsOpen(s) && cardStar(s, c) === 3 && c.choices.some((x) => x.rec && x.act.k === 'do' || x.rec && x.act.k === 'approve');
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
    // 段 UI7g：契約金（1 回）を費用に。毎月の月給は monthly
    if (m.hire) return { ...base, est: Math.round(real - m.cost), act: { k: 'do', a: { k: 'hire', hero: m.hero, task: m.task, target: m.target } }, cost: signFee(s, m.hero), monthly: m.cost };
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
      const k = errMul(rnd, q, propErrK(s));
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
      if (hh != null) xs.push({ act: { k: 'do', a: { k: 'hire', hero: hh, task, target } }, cost: signFee(s, hh), monthly: wageOf(hh), kind: 'assign', stage: st.stage, est: 1 });
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
 * 段 UI5c・UI5d：倉庫（工房の物置・倉庫・物流拠点）が CLEAR.warn を超えた月の締め：店長（いなければ運搬係）から。
 * 倉庫そのものが大事（置き場所が尽きると調達も製造も止まる）なので、いちばん上に「倉庫を強化する」（推奨。storeFix：
 * 強化・倉庫が無ければ建てる・強化しきっていればもう 1 棟か物流拠点）、続けて「在庫を優先して売りさばきましょう」
 * 「いまある素材で○○が作れます」「いまはこのままで」。どれも提案書（承認で一気に）
 */
export function stockDraft(s: P1State): Draft | null {
  if (inTutorial(s) || !myShops(s).length || !storeFull(s)) return null;
  const info = clearInfo(s);
  const xs: Choice[] = [];
  // 倉庫を強化する（推奨）
  const fix = storeFix(s);
  if (fix) xs.push({ act: { k: 'do', a: fixAct(fix) }, cost: fix.cost, ...(fix.k === 'build' ? { monthly: fix.monthly } : {}), kind: 'whatif', stage: 'buy', est: fix.room, room: fix.room });
  // 在庫を優先して売りさばく（全部のお店・値引きは CLEAR.def の段）。見込み：在庫品がひと月に売れていく数。
  // 段 UI7d：倉庫を埋めているのが素材なら出さない（売りさばいても倉庫は空かない。clearFrees）
  if (info.total > 0 && clearFrees(info) && myShops(s).some((b) => s.shops[b.uid] && s.shops[b.uid].clear == null)) {
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
  // 推奨：倉庫の手（払えるとき）。払えなければ、ほかの手のうち見込みのいちばん大きいもの
  const all = [...xs, SKIP];
  const choices = fix && fix.cost <= s.money ? all.map((c, k) => ({ ...c, rec: k === 0 })) : markRec(s, fix ? all.map((c, k) => (k === 0 ? { ...c, est: 0 } : c)) : all).map((c, k) => (fix && k === 0 ? { ...c, est: fix.room } : c));
  // 段 UI7d：倉庫の手が無いときのセリフの結び（いまの素材で作る・売りさばく）
  const next = fix ? undefined : xs.some((c) => c.act.k === 'do' && c.act.a.k === 'useup') ? ('useup' as const) : xs.some((c) => c.act.k === 'do' && c.act.a.k === 'clear') ? ('clear' as const) : undefined;
  return { src: 'stock', kind: 'stock', hero, ...(cl ? { uid: cl.uid } : {}), q: qOf(s, hero, 'logistics'), dept: 'logistics', issue: { k: 'store', pct: Math.round(info.rate * 100), mats: info.mats, goods: info.goods, items: info.total, ...(fix ? { fix: fixKind(fix) } : {}), ...(next ? { next } : {}) }, choices, pri: 0 };
}
/** 段 UI5d：倉庫の手 → 提案の手（建てる・設備投資） */
export const fixAct = (f: StoreFix): PropAct => (f.k === 'build' ? { k: 'build', id: f.id, i: f.lot[0], j: f.lot[1], dir: f.lot[2] } : { k: 'invest', id: f.k, uid: f.uid });
const fixKind = (f: StoreFix): StoreFixKind => (f.k === 'build' ? (f.id === 'logistics' ? 'hub' : f.more ? 'more' : 'build') : f.k);
/** 段 UI5d：置き場所を増やす手（倉庫・物流拠点を建てる・倉庫と拠点の強化）。提案書でほかの手と束ねない */
export const storeAct = (a: PropAct) => (a.k === 'build' && (a.id === 'warehouse' || a.id === 'logistics')) || (a.k === 'invest' && (a.id === 'rack' || a.id === 'dock'));
/** 段 UI5d：倉庫の手の 1 行目（「倉庫を強化しよう（2/3 段目）」「倉庫をもう 1 棟建てよう」） */
export function storeLabel(s: P1State, a: PropAct): string {
  if (a.k === 'invest') {
    const b = s.buildings.find((x) => x.uid === a.uid);
    const lv = invLv(b, a.id) + 1;
    const max = INVEST[a.id]?.cost.length ?? lv;
    return a.id === 'dock' ? t(`物流拠点の保管を強化しよう（${lv}/${max} 段目）`, `Upgrade hub storage (level ${lv}/${max})`) : t(`倉庫を強化しよう（${lv}/${max} 段目）`, `Upgrade the warehouse (level ${lv}/${max})`);
  }
  if (a.k === 'build' && a.id === 'logistics') return t('物流拠点を建てよう（置き場所にもなる）', 'Build a hub (it stores goods too)');
  return myWarehouses(s).length ? t('倉庫をもう 1 棟建てよう', 'Build one more warehouse') : t('倉庫を建てよう', 'Build a warehouse');
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
 * 段 I1：部長からの頼み（予算で任せた部門。月の締めの budgetTry が残した ask）。月に 1 枚まで（人手 → 予算を超えた → 使い切り → 成果なしの順・見込みの大きい順）。
 * 選択肢：予算を 1 段上げる・従業員の上限を +2・今回の施策だけ承認（受け箱にあれば）・このまま。いつも上限の外（受け箱）に入るよう、優先はいちばん低い
 */
function budgetDrafts(s: P1State): Draft[] {
  if (!budgetOpen(s) || !s.budget) return [];
  const rank = { labor: 3, over: 2, spent: 1, idle: 0 } as const;
  const xs = budgetDepts(s)
    .map((d) => ({ d, a: s.budget!.depts[d]?.ask ?? null, H: headOf(s, d) }))
    .filter((x): x is { d: DeptId; a: BudgetAsk; H: Staff } => !!x.a && !!x.H)
    .sort((a, b) => rank[b.a.why] - rank[a.a.why] || (b.a.est ?? 0) - (a.a.est ?? 0));
  const x = xs[0];
  if (!x) return [];
  const B = deptBudget(s, x.d);
  const ch: Choice[] = [];
  if (x.a.why === 'labor') ch.push({ act: { k: 'crew', dept: x.d, cap: Math.min(BUDGET.crew.capMax, B.cap + 2) }, cost: 0, monthly: 2 * crewWageMonth(), rec: true });
  else {
    const up = nextUp(s, x.d, x.a.cost ?? 0);
    ch.push({ act: { k: 'budget', dept: x.d, lv: up.lv, ...(up.amt != null ? { amt: up.amt } : {}) }, cost: 0, monthly: up.to - amountOf(s, x.d), rec: true });
  }
  const p = x.a.pid != null ? s.deleg?.inbox.find((q) => q.id === x.a.pid) : undefined;
  if (p) ch.push({ act: { k: 'approve', pid: p.id }, est: p.est, unit: p.unit, units: p.units, cost: p.cost, rp: p.rp, stage: p.stage });
  ch.push(SKIP);
  return [{ src: 'budget', kind: `budget:${x.d}`, hero: x.H.hero, q: qOf(s, x.H.hero, x.d), dept: x.d, issue: { k: 'budget', ask: x.a }, choices: ch, pri: 30 }];
}

/**
 * 人事の担当の提案（段 UI7g で作り直した）：会社の課題の一覧（issues.ts）のボトルネックの段に効く「人の手」だけを持ってくる。
 * - 販売がボトルネック：店員のいないお店に店員を置く（待機中の人・雇う）・いちばん品出しの遅い店員を、もっと得意な人に替える・
 *   お店の従業員（アルバイト）を増やす（物流部に依頼）
 * - 調達・製造・輸送がボトルネック：その段に人を置く（whatIf の「人を置く」の手。待機中の人・雇う）
 * どの手も提案書と同じ見積もり（brief.ts の judgeOf）で、ボトルネックの課題を解き、推奨が承認になるものだけ。見込み（est）は月の利益の差
 * （月給を引いたもの）。前はボトルネックでない段の「人を雇う」も、その段だけの増え方で見込んでいた（販売が詰まりなのに製造の人を雇う提案）
 */
function hrDrafts(s: P1State, iss?: CoIssue[]): Draft[] {
  if (!myShops(s).length) return [];
  const I = iss ?? issuesOf(s);
  const top = I.find((x) => isFlowKey(x.key));
  if (!top) return [];
  const bn = top.key as Stage;
  const hand = deptHand(s, 'hr');
  const q = qOf(s, hand, 'hr');
  const xs: Choice[] = bn === 'sell' ? hrSell(s) : hrStage(s, bn);
  if (!xs.length) return [];
  const base = baseOf(s);
  const ok: Choice[] = [];
  for (const c of xs) {
    if (c.act.k !== 'do') continue;
    const j = judgeOf(s, planOf(s, [c.act.a], { hero: hand, q, dept: 'hr' }), I, base);
    if (j.rec !== 'ok' || j.issue?.key !== bn) continue;
    ok.push({ ...c, est: Math.round(j.dProfit) });
  }
  if (!ok.length) return [];
  const pick2 = [...ok].sort((a, b) => (b.est ?? 0) - (a.est ?? 0)).slice(0, CARD.choices - 1);
  return [{ src: 'hr', kind: 'hire', hero: hand, q, dept: 'hr', issue: { k: 'hire', stage: bn, n: s.hirePool.length }, choices: markRec(s, [...pick2, SKIP]), pri: 42, iss: { key: bn, pri: top.pri, ...(top.lv ? { lv: top.lv } : {}) }, issues: I }];
}
/** 雇える候補のうち、その仕事にいちばん向いている人（雇えなければ null） */
const poolBest = (s: P1State, task: Task): number | null => (has(s, 'hire') && s.hirePool.length ? [...s.hirePool].sort((a, b) => aptitude(heroStats(b), task) - aptitude(heroStats(a), task))[0] : null);
/** 販売がボトルネックのときの人事の手（店員を置く・替える・従業員を増やす） */
function hrSell(s: P1State): Choice[] {
  const out: Choice[] = [];
  const idle = freeFor(s, 'shop');
  const pb = poolBest(s, 'shop');
  // 待機中の人を回す（配置換え）。雇える候補のほうが向いていれば、雇う手も並べる
  const put = (task: Task, target: number, aptMin = -1) => {
    const i = idle.find((x) => aptitude(x.stats, task) > aptMin);
    if (i) out.push({ act: { k: 'do', a: { k: 'assign', hero: i.hero, task, target } }, cost: 0, kind: 'assign', stage: 'sell', est: 1 });
    const best = Math.max(aptMin, i ? aptitude(i.stats, task) : -1);
    if (pb != null && aptitude(heroStats(pb), task) > best) out.push({ act: { k: 'do', a: { k: 'hire', hero: pb, task, target } }, cost: signFee(s, pb), monthly: wageOf(pb), kind: 'assign', stage: 'sell', est: 1 });
  };
  const shops = myShops(s).filter((b) => s.shops[b.uid]?.shelves.some((x) => x));
  // 店員のいないお店
  const empty = shops.find((b) => s.shops[b.uid].staff == null);
  if (empty) put('shop', empty.uid);
  // いちばん品出しの遅い店員を、もっと得意な人に
  const weak = shops
    .map((b) => ({ uid: b.uid, st: s.shops[b.uid].staff != null ? staffOf(s, s.shops[b.uid].staff!) : undefined }))
    .filter((x): x is { uid: number; st: Staff } => !!x.st)
    .sort((a, b) => aptitude(a.st.stats, 'shop') - aptitude(b.st.stats, 'shop'))[0];
  if (weak) put('shop', weak.uid, aptitude(weak.st.stats, 'shop'));
  // お店の従業員（アルバイト）を増やす
  const part = sellMoves(s).find((m) => m.kind === 'part' && m.act && m.units > 0.5);
  const c = part ? fromSell(part) : null;
  if (c) out.push(c);
  return out;
}
/** 調達・製造・輸送がボトルネックのときの人事の手（その段に人を置く：待機中の人・雇う） */
function hrStage(s: P1State, bn: Stage): Choice[] {
  const margin = unitMargin(s);
  const caps = stageCaps(s, true);
  return whatIf(s, bn)
    .filter((w) => w.move.kind === 'person' && w.move.replace == null)
    .map((w) => fromWhatIf(s, { ...w, units: flowGain(s, bn, w.units, caps) }, margin, null))
    .filter((x): x is Choice => !!x && (x.units ?? 0) > 0.05);
}

/**
 * 段 UI6：人事部長の「採用の状況」の話題（会話の中の提案）。月の締めの「人を雇いませんか？」と同じ下書き（hrDrafts）を、
 * 受け箱に入れない仮のカード（id −1）にする。k はおすすめの「雇う」の選択肢。雇える手が無ければ null
 */
export function hireOffer(s: P1State): { card: Card; k: number } | null {
  const d = hrDrafts(s)[0];
  if (!d) return null;
  const card = { ...d, id: -1, mk: cardsOf(s).mk, sector: here(s), day: s.day, pop: false } as Card;
  const rec = card.choices.findIndex((x) => x.rec && x.act.k === 'do');
  const k = rec >= 0 ? rec : card.choices.findIndex((x) => x.act.k === 'do');
  return k >= 0 ? { card, k } : null;
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
    const ads = ADS.filter((a) => adPick(s, a)).map((a) => ({ a, g: adGain(s, a.id) })).sort((x, y) => y.g - x.g);
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
/**
 * 提案書 1 枚で変える打ち手の数の上限（町のランク）。段 UI9（ユーザーの声 2026-11-05）：提案の構成は話し手の ★ で変えない
 * （★ で差が出るのは読みの誤差の幅だけ）。前は ランク × ★ だった
 */
export function sizeOf(s: P1State, _c: Pick<Card, 'hero' | 'q'>): number {
  return Math.max(1, CARD.size[tierOf(s)]);
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
  // 段 L0：承認を求める提案（ヒーロー・部長・人事・知らせ・倉庫）は Rare から。それより前は地図の印（mapmarks.ts）で困りごとを見せる。
  // できごと・組み合わせの会話・辞めたいの予告（本人の話）は今どおり
  if (!propsOpen(s)) {
    // 地図の印の数え（💡 の元）
    noteMarks(s);
    const dd0 = duoDue(s, C.popN, inTutorial(s));
    if (dd0) enqueue(s, duoDraft(s, dd0), rep);
    if (rep.made || rep.auto.length) r.cards = rep;
    return;
  }
  // 段 UI5a：流れが止まった月は、ほかの提案より先に「○○が止まっています」（いちばん上流の止まっている段）。お店の自走の提案（従業員）
  const stall = stallDraft(s, r);
  // 段 P2：ヒーローの組み合わせ（条件が初めてそろった締め。上限の残りがあるときだけ・1 つまで。流れが止まった月は次の締めへ）
  const dd = stall ? null : duoDue(s, C.popN, inTutorial(s));
  if (dd) enqueue(s, duoDraft(s, dd), rep);
  const staff = stall ? null : staffDraft(s);
  // 段 UI7g：会社の課題の一覧（月に 1 回）。ヒーロー・部長の提案は、課題を解き推奨が承認になる手だけ（gateDraft）
  const iss = issuesOf(s);
  const raw = [...(stall ? [stall] : []), ...(staff ? [staff] : []), ...noticeDrafts(s, r), ...(stall ? heroDrafts(s).filter((d) => d.src !== 'clerk' || d.kind !== 'sell') : heroDrafts(s)), ...hrDrafts(s, iss), ...headDrafts(s, r), ...budgetDrafts(s)];
  const gb = { base: null as P1State | null };
  const drafts = raw.map((d) => gateDraft(s, d, iss, gb)).filter((d): d is Draft => !!d);
  // 段 K：その年の経営方針の推す種類の提案は出やすく（優先 × (1 + POL.tilt)。policy.ts の tiltOf）
  const pri = new Map(drafts.map((d) => [d, d.pri * draftTilt(s, d)]));
  drafts.sort((a, b) => pri.get(b)! - pri.get(a)!);
  for (const d of drafts) enqueue(s, d, rep);
  // 段 UI5c：倉庫が埋まりそうな月（ほかの提案のあと。受け箱の枚数に数えないので、ほかのカードを押し出さない）
  // 段 UI7h：推奨が承認になる手だけ（gateDraft。置き換えられなければ出さない）
  const st0 = stockDraft(s);
  const st = st0 ? gateDraft(s, st0, iss, gb) : null;
  if (st) enqueue(s, st, rep);
  if (rep.made || rep.auto.length) r.cards = rep;
}

/**
 * 段 UI7g：提案のふるい分け（ヒーロー・部長の提案のカード）。手のある選択肢を、提案書と同じ判断（brief.ts の judgeOf）で見て、
 * 課題を解き推奨が承認になる手だけを残す。残らなければカードにしない（見送りが推奨の提案書は出さない）。
 * 段 UI7h：倉庫の提案（stock）と流れが止まったお知らせ（stall）も同じふるい分けに。
 * - 倉庫：残らなければ、いまの素材で作るほかの品（stockAlt）を探す。それも無ければカードを出さない（倉庫の状況は課題の一覧と画面に残る）。
 *   推奨は、残った倉庫の手（払えて承認になる）を先に、無ければ見込みの大きい手
 * - 流れの止まり：残らなければ、提案ではなく知らせ（stallNote：推奨の札なし・「わかった」で閉じる）
 * 対象外：チュートリアルのあいだ・人事（hrDrafts で判断済み）・自分で実行して報告する任せた提案（trusted）
 */
export function gateDraft(s: P1State, d: Draft, iss: CoIssue[], gb: { base: P1State | null } = { base: null }): Draft | null {
  if (inTutorial(s) || d.note || trusted(s, d)) return d;
  const judge = (a: PropAct) => {
    gb.base ??= baseOf(s);
    return judgeOf(s, planOf(s, [a], { hero: d.hero, q: d.q, dept: d.dept }), iss, gb.base);
  };
  // 段 UI9：部長からの頼み（予算）の「今回の施策だけ承認」も同じふるい分け（承認になる手でなければ、その選択肢を外す）
  if (d.src === 'budget') {
    const choices = d.choices.filter((c) => {
      if (c.act.k !== 'approve') return true;
      const a = s.deleg?.inbox.find((p) => p.id === (c.act as { pid: number }).pid)?.act;
      if (!a || !actOk(s, a)) return false;
      const j = judge(a);
      return j.rec === 'ok' && !!j.issue;
    });
    return { ...d, choices, issues: iss };
  }
  if (!PROPOSAL_SRC.includes(d.src)) return d;
  let keep: Choice[] = [];
  let best: { pri: number; key: IssueKey; lv?: IssueLv } | null = null;
  for (const c of d.choices) {
    const a = c.act.k === 'do' ? c.act.a : c.act.k === 'approve' ? s.deleg?.inbox.find((p) => p.id === (c.act as { pid: number }).pid)?.act : undefined;
    if (!a) {
      keep.push(c);
      continue;
    }
    if (!actOk(s, a)) continue;
    const j = judge(a);
    if (j.rec !== 'ok' || !j.issue) continue;
    keep.push(c);
    if (!best || j.issue.pri < best.pri) best = { pri: j.issue.pri, key: j.issue.key, ...(j.issue.lv ? { lv: j.issue.lv } : {}) };
  }
  const acts = (xs: Choice[]) => xs.some((c) => c.act.k === 'do' || c.act.k === 'approve');
  // 段 UI7h：倉庫の手がどれも見合わない月は、いまの素材で作るほかの品に置き換える
  if (d.src === 'stock' && !acts(keep)) {
    const alt = stockAlt(s, d, judge);
    if (alt) {
      keep = [alt.c, ...keep];
      best = { pri: alt.issue.pri, key: alt.issue.key, ...(alt.issue.lv ? { lv: alt.issue.lv } : {}) };
    }
  }
  if (!acts(keep)) return d.src === 'stall' ? stallNote(d) : null;
  // 部長の提案（承認・却下・保留）は、推奨の札はそのまま。ヒーローの提案は残った手で推奨を付け直す
  let choices: Choice[];
  if (d.src === 'head') choices = keep;
  else if (d.src === 'stock') {
    // 倉庫の提案：残った倉庫の手（払えて、推奨が承認）を先に推す（段 UI5d の決まり）。無ければ見込みの大きい手
    const fx = keep.find((c) => c.act.k === 'do' && storeAct(c.act.a));
    choices = fx ? keep.map((c) => ({ ...c, rec: c === fx })) : markRec(s, keep.map((c) => ({ ...c, rec: false })));
  } else choices = markRec(s, keep.map((c) => ({ ...c, rec: false })));
  let issue = d.issue;
  // 倉庫の手が外れたら、セリフの結び（倉庫の手の種類）も外す
  if (issue.k === 'store' && !choices.some((c) => c.act.k === 'do' && storeAct(c.act.a))) {
    const { fix: _f, next: _n, ...rest } = issue;
    const next = choices.some((c) => c.act.k === 'do' && c.act.a.k === 'useup') ? ('useup' as const) : choices.some((c) => c.act.k === 'do' && c.act.a.k === 'clear') ? ('clear' as const) : undefined;
    issue = { ...rest, ...(next ? { next } : {}) };
  }
  return { ...d, issue, choices, ...(best ? { iss: best } : {}), issues: iss };
}
/** 段 UI7h：流れが止まったお知らせ（直す手が無い・どれも推奨が承認にならない月）：推奨の札なし・「わかった」で閉じる */
function stallNote(d: Draft): Draft {
  return { ...d, choices: [{ ...SKIP, rec: false }], note: true };
}
/**
 * 段 UI7h：倉庫の提案の置き換え（倉庫の強化・売りさばき・いちばん上の使い切りが、どれも推奨が承認にならない月）。
 * いまの素材で作れるほかの品（作業台ごと・おすすめ順に STOCK_ALT 件まで。いま作り続けている品は除く）のうち、推奨が承認になる最初の手。新しい手は作らない
 */
const STOCK_ALT = 4;
function stockAlt(s: P1State, d: Draft, judge: (a: PropAct) => ReturnType<typeof judgeOf>): { c: Choice; issue: CoIssue } | null {
  const steady = madeSkus(s);
  const had = new Set(d.choices.map((c) => (c.act.k === 'do' ? JSON.stringify(c.act.a) : '')));
  let n = 0;
  for (let slot = 0; slot < s.slots.length; slot++) {
    const sl = s.slots[slot];
    if (sl.worker == null || sl.back !== undefined) continue;
    for (const p of fromStock(s, sl.worker)) {
      if (n >= STOCK_ALT) return null;
      if (!(p.spare > 0 && p.yen > 0) || steady.includes(p.x)) continue;
      const [key, rar] = skuParts(p.x);
      const a: PropAct = { k: 'useup', slot, key, rar };
      if (had.has(JSON.stringify(a)) || !actOk(s, a)) continue;
      n++;
      const j = judge(a);
      if (j.rec === 'ok' && j.issue) return { c: { act: { k: 'do', a }, cost: 0, kind: 'whatif', stage: 'craft', est: p.units, units: p.units }, issue: j.issue };
    }
  }
  return null;
}
/** 段 UI7h：倉庫の提案のカード（月の締めと同じふるい分けのあと）。出さない月は null */
export function stockCard(s: P1State): Draft | null {
  const d = stockDraft(s);
  return d ? gateDraft(s, d, issuesOf(s), { base: null }) : null;
}

/** 段 K：提案のカードの、経営方針の推す種類の重み（手のある 1 つ目の選択肢の種類。提案のカードだけ） */
function draftTilt(s: P1State, d: Draft): number {
  if (!PROPOSAL_SRC.includes(d.src)) return 1;
  for (const c of d.choices) {
    const a = c.act.k === 'do' ? c.act.a : c.act.k === 'approve' ? s.deleg?.inbox.find((p) => p.id === (c.act as { pid: number }).pid)?.act : undefined;
    if (a) return tiltOf(s, actTheme(a), d.dept);
  }
  return 1;
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
  // 段 L0：経理の助言（寄付の承認を求める）も Rare から（決算の 1 か月前のお知らせ taxHint はテロップに今どおり）
  if (!propsOpen(s)) return;
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
  // 段 P2：ヒーローの組み合わせも会社のもの
  if (c.src === 'duo') return !!c.duo;
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
    // 段 UI7h：流れが止まった知らせ（手の無いもの）は、その月のあいだだけ
    case 'stall':
      return c.note ? cardsOf(s).mk - c.mk < 1 : c.choices.some((x) => x.act.k === 'do' && actOk(s, x.act.a));
    // 段 I1：部長からの頼みは、その月のあいだだけ（部長がいる・予算で任せている）
    case 'budget':
      return cardsOf(s).mk - c.mk < 1 && budgetOpen(s) && !!c.dept && !!headOf(s, c.dept);
    default:
      return c.choices.some((x) => x.act.k === 'do' && actOk(s, x.act.a));
  }
}
/** 受け箱（いまのセクタ・まだ選べるもの） */
export const cardInbox = (s: P1State) => (s.cards?.inbox ?? []).filter((c) => cardLive(s, c));

// ---------------------------------------------------------------- 段 UI7h：古くなった提案の取り下げ

/** 取り下げの記録を残す数 */
const GONE_KEEP = 6;
/** 見送りの理由の種類（brief.ts の recOf）→ 取り下げの理由 */
const goneOf = (no: NoKind | undefined): GoneWhy => (no === 'money' ? 'money' : no === 'policy' ? 'policy' : no === 'loss' ? 'loss' : 'solved');
/** 取り下げを判断するカード（ヒーロー・部長・人事の提案。知らせ・任せた提案の資金待ちは除かない） */
const staleSrc = (c: Card) => PROPOSAL_SRC.includes(c.src) && !c.note;
/** 段 UI9：カードを作ったときの課題の一覧（提案書と取り下げの判断は、同じ課題で。古いセーブは開いたときの一覧） */
export const issuesOfCard = (s: P1State, c: Pick<Card, 'issues'>, cur?: CoIssue[]): CoIssue[] => c.issues ?? cur ?? issuesOf(s);
/** カードの手（選択肢の番号と手。部長の提案はその手）。推奨の手を先に */
function cardActs(s: P1State, c: Card): PropAct[] {
  const xs = c.choices.map((x, k) => ({ x, k })).sort((a, b) => Number(!!b.x.rec) - Number(!!a.x.rec) || a.k - b.k);
  const out: PropAct[] = [];
  for (const { x } of xs) {
    const a = x.act.k === 'do' ? x.act.a : x.act.k === 'approve' ? s.deleg?.inbox.find((p) => p.id === (x.act as { pid: number }).pid)?.act : undefined;
    if (a && actOk(s, a)) out.push(a);
  }
  return out;
}
/**
 * 段 UI7h：受け箱のカードを、開いたときに同じ判断（brief.ts の judgeOf）でもう一度見る。どの手も推奨が承認にならなければ、取り下げの理由
 * （推奨の手の見送りの理由）。承認になる手があれば null。チュートリアルのあいだ・提案でないカード・知らせは null
 */
export function staleWhy(s: P1State, c: Card, iss: CoIssue[] = issuesOf(s), base: P1State | null = null): { why: GoneWhy; act: PropAct } | null {
  if (inTutorial(s) || !staleSrc(c)) return null;
  const acts = cardActs(s, c);
  if (!acts.length) return null;
  // 段 UI9：作ったときの課題が、いまの一覧から消えていれば「課題がほかの手で解けた」
  if (c.iss && c.issues && !iss.some((x) => x.key === c.iss!.key)) return { why: 'solved', act: acts[0] };
  const I = issuesOfCard(s, c, iss);
  let first: { why: GoneWhy; act: PropAct } | null = null;
  for (const a of acts) {
    base ??= baseOf(s);
    const j = judgeOf(s, planOf(s, [a], { hero: c.hero, q: c.q, dept: c.dept }), I, base);
    if (j.rec === 'ok') return null;
    first ??= { why: goneOf(j.no), act: a };
  }
  return first;
}
/** 取り下げの記録（新しい順） */
function logGone(s: P1State, g: Omit<Gone, 'mk' | 'sector' | 'day'>): Gone {
  const C = cardsOf(s);
  const rec: Gone = { ...g, mk: C.mk, sector: here(s), day: s.day };
  C.gone = [rec, ...(C.gone ?? [])].slice(0, GONE_KEEP);
  return rec;
}
/** カードを取り下げる（受け箱から外す。部長の提案のカードなら、部長の受け箱からも外す） */
function dropCard(s: P1State, c: Card, w: { why: GoneWhy; act: PropAct }): Gone {
  const C = cardsOf(s);
  C.inbox = C.inbox.filter((x) => x.id !== c.id);
  for (const ch of c.choices) if (ch.act.k === 'approve' && s.deleg) s.deleg.inbox = s.deleg.inbox.filter((p) => p.id !== (ch.act as { pid: number }).pid);
  return logGone(s, { hero: c.hero, name: actName(s, w.act), why: w.why });
}
/** 段 UI7h：開く前の 1 枚の見直し（時間を止めて出すカード・受け箱から開くカード）。取り下げたら、その記録 */
export function staleCard(s: P1State, c: Card): Gone | null {
  const w = staleWhy(s, c);
  return w ? dropCard(s, c, w) : null;
}
/**
 * 段 UI9：提案書を開いたとき（proposalui.ts）、推奨が承認でなくなっていたカードを見せずに取り下げる（受け箱から外し、理由の一行）。
 * 受け箱に無いカード（部長との会話の仮のカード・月次報告の提案）は記録だけ。チュートリアルのあいだは null
 */
export function withdrawCard(s: P1State, id: number, act: PropAct, no: NoKind | undefined): Gone | null {
  if (inTutorial(s)) return null;
  const c = (s.cards?.inbox ?? []).find((x) => x.id === id);
  if (c) return dropCard(s, c, { why: goneOf(no), act });
  return logGone(s, { hero: null, name: actName(s, act), why: goneOf(no) });
}
/** いま見直した状態（同じ日・同じ資金・同じ方針・同じ受け箱なら、もう一度は見ない） */
const staleSeen = new WeakMap<P1State, string>();
const staleKeyOf = (s: P1State, sec: string) =>
  [s.day, Math.round(s.money), s.rp ?? 0, sec, corpOf(s).join(','), (s.cards?.inbox ?? []).map((c) => c.id).join(','), (s.deleg?.inbox ?? []).filter((p) => !p.src && (p.sector ?? sec) === sec).map((p) => `${p.id}${p.status}`).join(',')].join('|');
/**
 * 段 UI7h：受け箱（経営企画 → 部長の提案・部長との会話の確認事項）を開いたときの見直し：ヒーロー・部長の提案のカードと、
 * 部長の提案の一覧（いまの町の、カードになっていないもの）のうち、推奨が承認にならなくなったものを取り下げる（理由の一行を残す）。
 * 自動プレイは画面を開かないので変わらない。チュートリアルのあいだは何もしない。取り下げたものの記録
 */
export function withdrawStale(s: P1State): Gone[] {
  if (inTutorial(s)) return [];
  const sec = here(s);
  const props = (s.deleg?.inbox ?? []).filter((p) => !p.src && (p.sector ?? sec) === sec);
  if (staleSeen.get(s) === staleKeyOf(s, sec)) return [];
  const out: Gone[] = [];
  const iss = issuesOf(s);
  let base: P1State | null = null;
  for (const c of cardInbox(s)) {
    if (!staleSrc(c)) continue;
    base ??= baseOf(s);
    const w = staleWhy(s, c, iss, base);
    if (w) out.push(dropCard(s, c, w));
  }
  // 部長の提案の一覧：カードになっているものは上で見た
  const carded = new Set(cardInbox(s).flatMap((c) => c.choices.map((x) => (x.act.k === 'approve' ? x.act.pid : -1))));
  for (const p of props) {
    if (carded.has(p.id) || !s.deleg?.inbox.includes(p) || !actOk(s, p.act)) continue;
    base ??= baseOf(s);
    const j = judgeOf(s, planOf(s, [p.act], { hero: p.hero, q: qOf(s, p.hero, p.dept), dept: p.dept }), iss, base);
    if (j.rec === 'ok') continue;
    s.deleg.inbox = s.deleg.inbox.filter((x) => x.id !== p.id);
    out.push(logGone(s, { hero: p.hero, name: actName(s, p.act), why: goneOf(j.no) }));
  }
  staleSeen.set(s, staleKeyOf(s, sec));
  return out;
}
/** 取り下げの理由の文 */
export const goneWhyText = (w: GoneWhy): string =>
  w === 'money' ? t('資金が減った', 'funds went down') : w === 'policy' ? t('方針を替えた', 'the policy changed') : w === 'loss' ? t('見込みが下がった', 'the outlook got worse') : t('課題がほかの手で解けた', 'the issue was solved another way');
/** 取り下げの一行（「状況が変わったので、○○は取り下げました（理由：資金が減った）」） */
export const goneLine = (g: Pick<Gone, 'name' | 'why'>): string => {
  // 手の名前に「」が入っていれば（「チラシ配り」を出す）二重にしない
  const nm = g.name.includes('「') ? g.name : t(`「${g.name}」`, `“${g.name}”`);
  return t(`状況が変わったので、${nm}は取り下げました（理由：${goneWhyText(g.why)}）`, `Things changed, so ${nm} was withdrawn (${goneWhyText(g.why)})`);
};
/** いまの月・いまの町で取り下げたもの（受け箱の上に出す） */
export const goneNow = (s: P1State): Gone[] => (s.cards?.gone ?? []).filter((g) => g.mk === cardsOf(s).mk && g.sector === here(s));

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
  // 段 S1：話し手のヒーローとかかわった（教えの回数。同じ日は 1 回）
  meetHero(s, c.hero);
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
        err: readErr(s, c.q),
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
    case 'duo':
      return done(c.duo ? applyDuo(s, c.duo, a.i) : 'none');
    // 段 I1：予算を上げる・従業員の上限を上げる。すぐに、頼みの施策をもう一度予算の中で打てるか試す（打てたらトーストで知らせる）
    case 'budget':
    case 'crew': {
      if (a.k === 'budget') setBudget(s, a.dept, a.lv, a.amt);
      else setCrewCap(s, a.dept, a.cap);
      const ask = deptBudget(s, a.dept).ask;
      const r = done(null);
      if (ask?.act && budgetRetry(s, a.dept) === 'done') r.did = t(`${heroNm(c.hero ?? 0)}が予算の中で実行：${actName(s, ask.act)}`, `${heroNm(c.hero ?? 0)} did it within budget: ${actName(s, ask.act)}`);
      return r;
    }
  }
}
// ---------------------------------------------------------------- 段 UI5a：担当者からの提案書（plan.ts）

/** 2 つの手がぶつかるか（同じ種類・同じお店の棚・同じ人） */
const clash = (a: PropAct, b: PropAct) => a.k === b.k || ('uid' in a && 'uid' in b && a.uid === b.uid && (a.k === 'stock' || b.k === 'stock')) || ('hero' in a && 'hero' in b && a.hero === b.hero);
/**
 * 段 UI7c：画面に出す推奨（「推奨」の札・金色）の選択肢の番号。ヒーロー・部長の提案のカード（PROPOSAL_SRC）は、手のある選択肢を提案書と同じ判断
 * （段 UI7g：brief.ts の judgeOf。課題を解き、推奨が承認になる手）で選び、いちばん優先の高い課題を解く手のうち、社長の経営方針の価値のいちばん大きいものに付ける。
 * どれも承認にならなければ「このまま」（無ければ却下）に付ける。ほかのカード（頼み・問い合わせ・できごと など）と、チュートリアルのあいだは、もとの推奨（c.choices の rec）のまま。
 * 「任せる（★3）」の自動の手・自動プレイは、もとの推奨（お金の見込み）のまま（ユーザーの判断 2026-11-04）。無ければ −1
 */
export function shownRec(s: P1State, c: Card): number {
  const orig = c.choices.findIndex((x) => x.rec);
  if (!PROPOSAL_SRC.includes(c.src) || inTutorial(s)) return orig;
  const xs = c.choices.map((x, k) => ({ x, k })).filter(({ x }) => x.act.k === 'do' || x.act.k === 'approve');
  if (!xs.length) return orig;
  const base = baseOf(s);
  // 段 UI7g：推奨が承認になる手（課題を解く・方針と反しない・払える）のうち、方針の価値のいちばん大きいもの（同じ課題に効く手どうしの選び分け）
  const iss = issuesOf(s);
  let best = -1;
  let bv = -Infinity;
  for (const { x, k } of xs) {
    const a = x.act.k === 'do' ? x.act.a : x.act.k === 'approve' ? s.deleg?.inbox.find((p) => p.id === (x.act as { pid: number }).pid)?.act : undefined;
    if (!a || !actOk(s, a)) continue;
    if ((x.cost ?? 0) > s.money || (x.rp ?? 0) > (s.rp ?? 0)) continue;
    const j = judgeOf(s, planOf(s, [a], { hero: c.hero, q: c.q, dept: c.dept }), iss, base);
    if (j.rec !== 'ok') continue;
    // 同じ課題なら方針の価値で。優先の高い課題を解く手を先に
    const v = j.value - (j.issue?.pri ?? 9) * 1e9;
    if (v > bv) {
      bv = v;
      best = k;
    }
  }
  if (best >= 0) return best;
  const no = c.choices.findIndex((x) => x.act.k === 'skip');
  if (no >= 0) return no;
  const rj = c.choices.findIndex((x) => x.act.k === 'reject');
  return rj >= 0 ? rj : orig;
}
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
  const who = { hero: c.hero, q: c.q, dept: c.dept };
  // 段 UI7c：束ねるのは、社長の経営方針の価値が増えるときだけ（brief.ts の valueOfPlan。このまま側は 1 回だけ計算する）
  let base: P1State | null = null;
  let cur: number | null = null;
  // 段 UI9：束ねた提案も、提案書と同じ判断（judgeOf：資金・方針・課題・損）で推奨が承認のままのときだけ（束ねたせいで見送りにしない）
  const iss = inTutorial(s) ? null : c.issues ?? issuesOf(s);
  for (const x of [...c.choices].sort((a, b) => (b.est ?? 0) - (a.est ?? 0))) {
    if (acts.length >= n) break;
    if (x === ch || x.act.k !== 'do' || (x.est ?? 0) <= 0) continue;
    const a = x.act.a;
    if (!actOk(s, a) || acts.some((y) => clash(y, a))) continue;
    // 段 UI5d：倉庫の提案の「倉庫を強化する」は、ほかの手（売りさばき・使い切り）と束ねない（費用のかかる手を黙って足さない）
    if (c.src === 'stock' && (storeAct(a) || storeAct(acts[0]))) continue;
    // 段 UI7h：束ねて払えなくなる手は足さない（推奨が承認の手を、束ねたせいで「資金が足りない」の提案書にしない）
    const wide = planOf(s, [...acts, a], who);
    if (planBlock(s, wide).length) continue;
    base ??= baseOf(s);
    cur ??= valueOfPlan(s, planOf(s, acts, who), base);
    const next = iss ? judgeOf(s, wide, iss, base) : null;
    const nv = next ? next.value : valueOfPlan(s, wide, base);
    if (nv <= cur || (next && next.rec !== 'ok')) continue;
    acts.push(a);
    cur = nv;
  }
  return planOf(s, acts, who);
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
export function reportProposal(s: P1State, r: Report): { plan: Plan; say: string; role: string; speech?: Speech } | null {
  // 段 L0：担当者からの提案（KPI ③）は Rare から
  if (!propsOpen(s)) return null;
  const mk = (d0: Draft) => {
    // 段 UI7g：課題を解き推奨が承認になる手だけ（月のカードと同じふるい分け）
    const d = gateDraft(s, d0, issuesOf(s), { base: null });
    if (!d) return null;
    const k = d.choices.findIndex((x) => x.rec && x.act.k === 'do');
    const ch = d.choices[k >= 0 ? k : d.choices.findIndex((x) => x.act.k === 'do')];
    if (!ch || ch.act.k !== 'do') return null;
    const card = { ...d, id: -1, mk: cardsOf(s).mk, sector: here(s), day: s.day, pop: false } as Card;
    const kk = card.choices.indexOf(ch);
    return { plan: planOfChoice(s, card, kk)!, say: sayOf(s, card, kk), role: roleOfCard(s, card).text, speech: speechOf(s, card, kk) ?? undefined };
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

/**
 * 段 L0：自動プレイ（通常の方針）の Rare より前。提案のカードは出ないので、地図の印（同じ下書きの元）を見て、
 * simTake と同じ手（棚を増やして並べる・設備・アルバイト・名物店主・発掘許可）を同じ条件で自分で打つ（提案書は挟まない。行動の数に入る）
 */
export function simMarkTake(s: P1State, keep: number): number {
  if (propsOpen(s) || !myShops(s).length) return 0;
  const iss = issuesOf(s);
  const gb = { base: null as P1State | null };
  let n = 0;
  for (const d0 of heroDrafts(s)) {
    const d = gateDraft(s, d0, iss, gb);
    if (!d) continue;
    const ch = d.choices.find((x) => x.rec && x.act.k === 'do' && SIM_TAKE(x.act.a) && (x.est ?? 0) > 0);
    if (!ch || ch.act.k !== 'do') continue;
    if (s.money - ch.cost < keep || (ch.rp ?? 0) > (s.rp ?? 0)) continue;
    if (applyPlan(s, planOf(s, [ch.act.a], { hero: d.hero, q: d.q, dept: d.dept })).ok) n++;
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
function core(s: P1State, c: Card, pick?: number): string {
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
      // 段 UI7g：ボトルネックの段の人の手（販売なら店員・従業員）。課題の定義から言う（古い受け箱のカードで、もうボトルネックでない段なら前の言い方）
      if (i.stage !== bottleneck(stageCaps(s))) return t(`[[${STAGE_NM[i.stage]()}]]の担当がいなくて、手が足りない。雇える[[候補が ${i.n} 人]]来ている`, `nobody covers [[${STAGE_NM[i.stage]()}]]. [[${i.n} candidates]] are ready to hire`);
      // 段 UI9：課題の定義（制約の種類・放置したときの影響）から言う。候補の人数は課題ではないので言わない
      const L = c.issues?.find((x) => x.key === i.stage);
      const lossTxt = L ? t(`[[${L.loss}]]。`, `[[${L.loss}]]. `) : '';
      return i.stage === 'sell'
        ? t(`ボトルネックは[[${STAGE_NM[i.stage]()}]]（制約：人員）。${lossTxt}お店の人員を増やせば処理量が伸びる`, `[[${STAGE_NM[i.stage]()}]] is the bottleneck (constraint: staffing). ${lossTxt}More shop staff lifts throughput`)
        : t(`ボトルネックは[[${STAGE_NM[i.stage]()}]]（制約：人員）。${lossTxt}ここに人員を置けば処理量が伸びる`, `[[${STAGE_NM[i.stage]()}]] is the bottleneck (constraint: staffing). ${lossTxt}Staffing it lifts throughput`);
    case 'head': {
      const p = s.deleg?.inbox.find((x) => x.id === c.pid);
      if (!p) return t('打てる手がある', 'there is a move to make');
      switch (p.unit) {
        case 'G':
          return p.stage ? t(`[[${STAGE_NM[p.stage]()}]]の処理量が月[[ +${p.units ?? 0} 個]]増える見込み`, `[[${STAGE_NM[p.stage]()}]] throughput up about [[+${p.units ?? 0}]] a month`) : t('処理量が増える見込み', 'throughput would rise');
        case 'ad':
          return t(`いまの売り場なら、[[宣伝]]の期待効果（期間で +${Math.round(p.est).toLocaleString('en-US')} G）が費用を上回る`, `with the shops as they are, the [[ad]]’s expected effect (+${Math.round(p.est).toLocaleString('en-US')} G over the run) beats its cost`);
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
    case 'duo':
      return c.duo ? duoSay(c.duo) : '';
    case 'stall':
      return stallSay(i.stage, i.why);
    case 'budget':
      return budgetSay(s, c.dept ?? 'logistics', i.ask);
    case 'store': {
      // 段 UI5d：倉庫そのものが大事（置き場所が尽きると、調達も製造も止まる）。推奨の手を言う
      const head = i.pct >= 100 ? t(`倉庫が[[いっぱい]]（素材 ${i.mats}・商品 ${i.goods}）`, `storage is [[full]] (${i.mats} materials, ${i.goods} goods)`) : t(`倉庫が[[ ${i.pct}%]]（素材 ${i.mats}・商品 ${i.goods}）`, `storage is [[${i.pct}%]] full (${i.mats} materials, ${i.goods} goods)`);
      const tail = i.fix === 'rack' ? t('倉庫を強化しよう', 'let’s upgrade the warehouse') : i.fix === 'dock' ? t('拠点の保管を強化しよう', 'let’s upgrade hub storage') : i.fix === 'build' ? t('倉庫を建てよう', 'let’s build a warehouse') : i.fix === 'more' ? t('倉庫をもう 1 棟建てよう', 'let’s build one more warehouse') : i.fix === 'hub' ? t('物流拠点を建てよう', 'let’s build a hub') : null;
      // 段 UI7e：結びは画面の推奨（shownRec：経営方針の価値がいちばん大きい手）に合わせる（言うことと推奨を食い違わせない）。
      // 段 UI7f：提案書の「いま」の一言は、その提案書の手（pick：選んだ選択肢）に合わせる
      const ch = c.choices[pick ?? shownRec(s, c)];
      const rk = ch?.act;
      const ra = rk?.k === 'do' ? rk.a : null;
      // 段 UI7f：カードのグラフ（月末の倉庫の中身と、同じペースの予想）を指して、あふれる先を言う
      const F = jammed(s) || i.pct >= 100 ? null : storeFc(s);
      const pct = t(`倉庫が[[ ${i.pct}%]]`, `storage is [[${i.pct}%]] full`);
      const when = F?.days != null ? whenFull(F.days) : '';
      const stop = F && (F.ramp != null || F.cut >= prodOf(s) - 0.5) ? t('調達も製造も止まる', 'buying and crafting stop') : t('作る数が減る', 'output drops');
      // その手のあと、あふれる月（承認後の置き場所・中身で同じペース）：「9 月まで持つ」「12 か月はあふれない」
      const hold = (() => {
        if (!F?.days || !ra) return '';
        const n = poolNow(s);
        const u = ra.k === 'useup' ? useUpOf(s, planOf(s, [ra])) : null;
        const F1 = storeFc(s, { cap: n.cap + (storeAct(ra) ? ch.room ?? 0 : 0), mats: n.mats - Math.min(n.mats, u?.mats ?? 0), goods: n.goods });
        return F1.days == null || F1.days >= POLICY.months * 30 ? t(`[[ ${POLICY.months} か月はあふれない]]`, `[[no overflow for ${POLICY.months} months]]`) : t(`[[${holdMonth(s, F1.days)}持つ]]`, `[[it lasts ${holdMonth(s, F1.days)}]]`);
      })();
      const fit = (...xs: string[]) => xs.find((x) => sayLen(x) <= CARD.sayMax - 10) ?? xs[xs.length - 1];
      if (ra?.k === 'useup')
        return F?.days
          ? fit(
              t(`${pct}。グラフのとおり、このペースだと[[${when}]]あふれる。[[いまの素材で作れば]]${hold}`, `${pct}. As the chart shows, it fills [[${when}]]. [[Crafting from stock]]: ${hold}`),
              t(`${pct}。このペースだと[[${when}]]あふれる。[[いまの素材で作れば]]${hold}`, `${pct}. It fills [[${when}]]. [[Crafting from stock]]: ${hold}`),
              t(`${pct}。[[${when}]]あふれる。[[いまの素材で作って]]減らそう`, `${pct}. Fills [[${when}]]. Let’s [[craft from what we have]]`),
            )
          : t(`${head}。[[いまの素材で作って]]減らそう`, `${head}. Let’s [[craft from what we have]]`);
      if (ra?.k === 'clear') return t(`${head}。在庫を優先して売りさばこう`, `${head}. Let’s clear stock first`);
      if (!ra || !storeAct(ra) || !tail) {
        if (jammed(s)) return t(`${head}。どの手も見合わないので、[[いまはこのまま]]`, `${head}. No move pays off — [[keep as is for now]]`);
        if (F && F.days == null && F.src !== 'none') return t(`${pct}。グラフのとおり、このペースなら[[ ${POLICY.months} か月はあふれない]]。いまはこのまま様子を見よう`, `${pct}. As the chart shows, at this pace it [[won’t fill for ${POLICY.months} months]] — let’s keep as is`);
        if (F?.days) return t(`${pct}。このペースだと[[${when}]]あふれるが、損は倉庫の費用より小さい。いまはこのまま`, `${pct}. It fills [[${when}]], but the loss is smaller than the cost — keep as is for now`);
        return t(`${head}。まだ[[調達も製造も回る]]ので、いまはこのまま様子を見よう`, `${head}. [[Buying and crafting still run]], so let’s keep as is for now`);
      }
      // 倉庫の手：「倉庫を強化すれば 9 月まで持つ」
      const by = i.fix === 'rack' ? t('倉庫を強化すれば', 'Upgrading the warehouse') : i.fix === 'dock' ? t('拠点の保管を強化すれば', 'Upgrading hub storage') : i.fix === 'hub' ? t('物流拠点を建てれば', 'Building a hub') : t('倉庫を建てれば', 'Building a warehouse');
      if (F?.days)
        return fit(
          t(`${pct}。グラフのとおり、このペースだと[[${when}]]あふれて${stop}。${by}${hold}`, `${pct}. As the chart shows, it fills [[${when}]] and ${stop}. ${by}: ${hold}`),
          t(`${pct}。このペースだと[[${when}]]あふれて${stop}。${by}${hold}`, `${pct}. It fills [[${when}]] and ${stop}. ${by}: ${hold}`),
          t(`${pct}。このペースだと[[${when}]]あふれる。${by}${hold}`, `${pct}. It fills [[${when}]]. ${by}: ${hold}`),
        );
      return t(`${head}。満杯だと[[調達も製造も止まる]]。${tail}`, `${head}. When it’s full, [[buying and crafting stop]]. ${tail[0].toUpperCase()}${tail.slice(1)}`);
    }
    case 'staff':
      return t(`先月は[[ ${i.off} 日]]、店長が休む日に店を回す人がいなかった。[[従業員 ${SELF_RUN.min} 人]]いれば開けておける`, `[[${i.off} days]] last month, nobody kept the shop open when the manager rested. With [[${SELF_RUN.min} staff]] it stays open`);
  }
}
/** 段 I1：部長からの頼みのセリフ（[[ ]] で数字を強く。60 字まで） */
function budgetSay(s: P1State, d: DeptId, a: BudgetAsk): string {
  const B = deptBudget(s, d);
  switch (a.why) {
    case 'over': {
      // 段 UI5d：予算から払う額（予算の効きで割り引いた額。従業員の給料を含む）と、あなたが直接承認したときの額を書き分ける
      const raw = a.pid != null ? s.deleg?.inbox.find((q) => q.id === a.pid)?.cost ?? 0 : 0;
      const alt = raw > 0 && raw !== (a.cost ?? 0) ? t(`（直接の承認なら ${g(raw)}）`, ` (${g(raw)} if you approve it yourself)`) : '';
      return t(`次の施策に予算から[[ ${g(a.cost ?? 0)}]]要る${alt}。予算を増やしてほしい`, `the next move needs [[${g(a.cost ?? 0)}]] from the budget${alt} — please raise it`);
    }
    case 'spent':
      return t(`今月の予算[[ ${g(amountOf(s, d))}]]を使い切った。打てる手がまだある`, `this month’s [[${g(amountOf(s, d))}]] is spent, with more to do`);
    case 'labor':
      return t(`人手が[[ ${a.need ?? 0} 人日]]足りない。人を雇わせてほしい`, `we are [[${a.need ?? 0} person-days]] short — let me hire`);
    case 'idle':
      return t(`[[${B.dry ?? 0} か月]]、予算の中で打てる手が無く成果が出ていない`, `for [[${B.dry ?? 0} months]] the budget covered no move at all`);
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
/** カードのセリフ。pick：提案書を開いた選択肢（倉庫の提案は、その手に合わせた一言。無ければ画面の推奨の手） */
export function sayOf(s: P1State, c: Card, pick?: number): string {
  const x = core(s, c, pick);
  // 段 UI4：使者は自分の言葉（言い出し・語尾は付けない）。できごとは、マインちゃんだけの話はそのまま、ヒーロー・町の長は口調の型、マインちゃんの報告は「〜よ！」
  if (c.src === 'diplo' || c.src === 'duo') return x;
  if (c.src === 'event' && c.ev) {
    if (EV_TEXT[c.ev.kind].full) return x;
    if (c.hero == null) return x + t('よ！', '!');
    return voiceSay(c.hero, x) ?? heroSay(c.hero, x);
  }
  // 辞めたい：本人の言葉なので、言い出し・語尾は付けない（型の味は上のウィットの一言で）
  if (c.issue.k === 'quit') return `${x}${t('。', '.')}`;
  if (c.hero == null) return say('polite', x);
  // 段 P2：史実の調査のあるヒーローは、社長の呼び方で（voice.ts。無ければ口調の型）
  return voiceSay(c.hero, x) ?? heroSay(c.hero, x);
}

// ---------------------------------------------------------------- 段 UI9b：3 段のセリフ（現状 → 原因 → 対応）

/**
 * 段 UI9b：提案のカードと提案書のサマリー文のセリフ。どのパターン・どの部門でも同じ骨組み（意味の層：summary.ts の SummaryCore）：
 * 現状（何が起きているか・根拠の数字）→ 原因（なぜか）→ 対応（だから何を承認してほしいか）。数字と要点の語は [[ ]]（画面で色が変わる）。
 * ヒーローの個性は語り口（型・語尾・一人称・呼びかけ・口ぐせ：summary.ts の声の層）にだけ出す
 */
export type Speech = Spoken;
/** 数字（「月 −12,000 G」「18 日後」「57 個」「10%」）を [[ ]] で囲む */
export const emNums = (x: string) => x.replace(/((?:月 )?[+−-]?\d[\d,.]*(?: ?(?:G|RP|日後|日|個|%|か月|人))?)/g, '[[$1]]');
const STAGE_PLAIN: Record<Stage, () => string> = { buy: () => t('調達', 'buying'), craft: () => t('製造', 'crafting'), haul: () => t('輸送', 'hauling'), sell: () => t('販売', 'selling') };
/** カードの課題（作ったときの一覧から） */
const coIssueOf = (c: Pick<Card, 'iss' | 'issues'>): CoIssue | undefined => (c.iss ? c.issues?.find((x) => x.key === c.iss!.key) : undefined);
/** 放置したときの 1 行（数字に色・文の形）。無ければ空 */
const lossOf = (c: Pick<Card, 'iss' | 'issues'>) => {
  const L = coIssueOf(c);
  return L ? lossSentence(L) : '';
};
/** 段 UI9b：放置したときの文（必ず述語のある文。「放置すると月 −4,337 G の損失です。」「32 日後にはあふれ、月 −12,494 G の損失になります。」） */
export function lossSentence(L: Pick<CoIssue, 'key' | 'impact' | 'days' | 'grow'>): string {
  const v = `[[ −${g(L.impact)}]]`;
  if (L.grow) return t(`伸ばせば月[[ +${g(L.impact)}]]の余地があります。`, ` Up to [[+${g(L.impact)}]]/mo of upside.`);
  if (L.days == null) return t(`放置すると月${v}の損失です。`, ` Left alone, that is ${v}/mo.`);
  if (L.days < 1) return t(`すでに起きていて、月${v}の損失です。`, ` It is already happening: ${v}/mo.`);
  const d = `[[ ${Math.round(L.days)} 日後]]`; // i18n-ja
  if (L.key === 'store') return t(`${d}にはあふれ、月${v}の損失になります。`, ` Storage fills in ${d}, costing ${v}/mo.`);
  if (L.key === 'cash') return t(`${d}には資金が尽き、月${v}の損失です。`, ` Funds run out in ${d}; ${v}/mo.`);
  if (L.key === 'morale') return t(`${d}には人が辞め、月${v}の損失になります。`, ` Someone quits in ${d}, costing ${v}/mo.`);
  return t(`${d}には月${v}の損失になります。`, ` In ${d} that becomes ${v}/mo.`);
}
/** 選択肢の手（do の手・部長の提案の手）。無ければ null */
function actOfChoice(s: P1State, ch: Choice | undefined): PropAct | null {
  if (!ch) return null;
  if (ch.act.k === 'do') return ch.act.a;
  if (ch.act.k === 'approve') return s.deleg?.inbox.find((p) => p.id === (ch.act as { pid: number }).pid)?.act ?? null;
  return null;
}
/** 承認してほしいこと（手・費用・効果の名詞句。どのパターンも同じ形） */
/**
 * 段 UI9b：選択肢の短期利益（来月の利益の差 − 導入費用）。セリフ・提案書の KPI・カードの 2 行目で同じ 1 つの数字を使う。
 * 手の無い選択肢（見送り・保留）は null
 */
export function choiceShort(s: P1State, c: Card, k: number): number | null {
  const ch = c.choices[k];
  const act = ch ? actOfChoice(s, ch) : null;
  if (!ch || !act) return null;
  const plan = planOfChoice(s, c, k) ?? planOf(s, [act], { hero: c.hero, q: c.q, dept: c.dept });
  const j = judgeOf(s, plan, c.issues ?? issuesOf(s));
  return j.dProfit - planCost(s, plan).money;
}

function askCore(s: P1State, c: Card, k: number): SummaryCore['ask'] | null {
  const ch = c.choices[k];
  const a = ch.act;
  if (a.k === 'budget') {
    const nm = a.lv === 'X' ? g(a.amt ?? 0) : t(`「${lvName(a.lv)}」`, `“${lvName(a.lv)}”`);
    return { move: t(`${DEPT[a.dept].name}部の予算を${nm}に上げること`, `raising the ${DEPT[a.dept].name} budget to ${nm}`), cost: '', effect: t('次の施策の実行。余りは会社に戻るので無駄はない', 'the next move running; leftovers come back') };
  }
  if (a.k === 'crew') return { move: t(`従業員の上限を[[ ${a.cap} 人]]にすること`, `a staff cap of [[${a.cap}]]`), cost: t(`1 人 月[[ ${g(crewWageMonth())}]]`, `[[${g(crewWageMonth())}]]/mo each`), effect: t('止まっていた施策の再開', 'the stalled moves restarting') };
  const act = actOfChoice(s, ch);
  if (!act) return null;
  const move = actNoun(act);
  const p = a.k === 'approve' ? s.deleg?.inbox.find((x) => x.id === a.pid) : undefined;
  const est = p ? p.est : (ch.est ?? 0);
  const unit = p ? p.unit : ch.unit;
  // 段 UI9b：セリフの数字は提案書の KPI と同じ定義（短期利益 ＝ 来月の利益の差 − 導入費用。提案書と同じ束ねた手・同じ課題で judgeOf）
  const plan = planOfChoice(s, c, k) ?? planOf(s, [act], { hero: c.hero, q: c.q, dept: c.dept });
  const iss = c.issues ?? issuesOf(s);
  const j = judgeOf(s, plan, iss);
  const cost = planCost(s, plan);
  const short = j.dProfit - cost.money;
  const money = cost.money;
  const monthly = cost.monthly;
  const costTxt = cost.rp > 0 && money <= 0 ? t(`研究ポイント[[ ${cost.rp} RP]]`, `[[${cost.rp} RP]]`) : money > 0 ? (act.k === 'hire' ? t(`契約金[[ ${g(money)}]]と月給[[ ${g(monthly)}]]`, `[[${g(money)}]] to sign plus [[${g(monthly)}]]/mo`) : monthly > 0 ? t(`初期投資[[ ${g(money)}]]と毎月[[ ${g(monthly)}]]`, `[[${g(money)}]] up front and [[${g(monthly)}]]/mo`) : t(`初期投資[[ ${g(money)}]]`, `[[${g(money)}]] up front`)) : monthly > 0 ? t(`毎月[[ ${g(monthly)}]]`, `[[${g(monthly)}]]/mo`) : '';
  // 来月の利益（導入費用を引いた差 ＝ 短期利益）。宣伝は効き目の日数を添える
  const ad = act.k === 'ad' ? ADS.find((x) => x.id === act.id) : undefined;
  const gainTxt = money > 0 ? t(`来月の利益[[ ${sgn(short)} G]]（導入費用込み）`, `next month’s profit [[${sgn(short)} G]] net of setup`) : t(`来月から月の利益[[ ${sgn(short)} G]]`, `[[${sgn(short)} G]]/mo from next month`);
  const effect = (() => {
    switch (unit) {
      case 'ad':
        return ad ? t(`来月の利益[[ ${sgn(short)} G]]（${ad.days} 日の宣伝・費用込み）`, `next month’s profit [[${sgn(short)} G]] (${ad.days}-day ad, net of cost)`) : gainTxt;
      case 'finds':
        return t(`出土品[[ ${Math.round(est)} 個]]ぶん`, `[[${Math.round(est)}]] finds`);
      case 'share':
        return t(`取り分[[ +${est.toFixed(1)}%]]`, `share [[+${est.toFixed(1)}%]]`);
      case 'legal':
        return t('真似される前の権利の確保', 'securing our rights before copies appear');
      default:
        if (ch.room) return t(`置き場所[[ +${ch.room} 個]]`, `storage [[+${ch.room}]]`);
        if (act.k === 'useup' || act.k === 'clear') return t(`倉庫を空けつつ、来月の利益[[ ${sgn(short)} G]]`, `freed storage and next month’s profit [[${sgn(short)} G]]`);
        if (act.k === 'order') return t('作業台の再稼働', 'the benches restarting');
        if (act.k === 'staff') return t('店長が休む日の営業', 'the shop open on rest days');
        return Math.abs(short) >= 0.5 ? gainTxt : t('流れの回復', 'a recovered flow');
    }
  })();
  // 効果が大きい（月の利益の増加が As-Is の 10% 超）：攻めの決まり文句を使ってよい
  const now = monthOf(s, 0).profit;
  const big = j.dProfit > Math.max(1, Math.abs(now)) * 0.1;
  return { move, cost: costTxt, effect, big };
}
/** 原因の言葉（販売の手の種類から） */
function sellCause(c: Card, act: PropAct | null): string {
  const L = coIssueOf(c);
  switch (act?.k) {
    case 'ad':
      return t('販路の集客力不足', 'too little customer pull');
    case 'stock':
      return t('品ぞろえの不足', 'a thin product lineup');
    case 'part':
    case 'staff':
    case 'assign':
    case 'hire':
      return t('売り場の人手不足', 'too few hands on the shop floor');
    case 'famous':
    case 'invest':
    case 'skill':
    case 'level':
      return t('店頭の魅力不足', 'too little pull at the storefront');
    case 'build':
    case 'vacant':
      return t('売り場の数の不足', 'too few shops');
    default:
      return L?.limit === 'people' ? t('売り場の人手不足', 'too few hands on the shop floor') : t('販路の集客力不足', 'too little customer pull');
  }
}
/**
 * 意味の層（summary.ts の SummaryCore）をカードから組む（丁寧語の言い切り。語り口は speechOf が付ける）。
 * 知らせ・提案でないカードは null
 */
export function coreOfCard(s: P1State, c: Card, pick?: number): SummaryCore | null {
  const i = c.issue;
  const ch = c.choices[pick ?? shownRec(s, c)];
  const act = actOfChoice(s, ch);
  if (!ch || (ch.act.k === 'skip' && i.k !== 'store')) return null;
  const ask = ch.act.k === 'skip' ? null : askCore(s, c, pick ?? shownRec(s, c));
  const L = coIssueOf(c);
  const limit = L?.limit;
  const person = act?.k === 'hire' || act?.k === 'assign';
  const bn = (k: Stage) => t(`[[${STAGE_PLAIN[k]()}]]がボトルネックになっています。`, `[[${STAGE_PLAIN[k]()}]] is the bottleneck.`);
  const loss = lossOf(c);
  const mk = (what: string, evidence: string, cause: string, ask2 = ask): SummaryCore | null => (ask2 ? { now: { what, evidence, num: numsOf(`${what}${evidence}`) }, cause: { what: cause }, ask: ask2 } : null);
  switch (i.k) {
    case 'sell': {
      const pct = Math.round(i.share * 100);
      const why = sellCause(c, act);
      const ev = i.pile >= 10 ? t(`来店はお客様全体の[[ ${pct}%]]にとどまり、工房には[[ ${i.pile} 個]]の在庫が滞留しています。${loss}`, `Only [[${pct}%]] of customers come in, and [[${i.pile}]] items sit in the workshop.${loss}`) : t(`来店はお客様全体の[[ ${pct}%]]にとどまっています。${loss}`, `Only [[${pct}%]] of customers come in.${loss}`);
      const cause = i.pile >= 10 ? t(`製造や輸送ではなく、[[${why}]]が原因と考えます。`, `Not crafting or hauling: the cause is [[${why}]].`) : t(`製造と輸送は追いついており、[[${why}]]が原因と考えます。`, `Crafting and hauling keep up; the cause is [[${why}]].`);
      return mk(bn('sell'), ev, cause);
    }
    case 'craft': {
      const ev = t(`作業台で作れるのは月[[ ${i.n} 個]]までです。${loss}`, `The benches make at most [[${i.n}]] a month.${loss}`);
      const cause = person || limit === 'people' ? t('作業台はあるのに[[職人の人員]]が足りないことが原因です。', 'The cause is [[too few crafters]] for the benches we have.') : t('職人の手は足りており、[[作業台と設備の数]]が上限になっていることが原因です。', 'The cause is [[the number of benches and equipment]] at its limit.');
      return mk(bn('craft'), ev, cause);
    }
    case 'buy': {
      const ev = t(`集まる素材は月[[ ${i.n} 個]]ぶんです。${loss}`, `Materials cover only [[${i.n}]] a month.${loss}`);
      const cause = limit === 'room' ? t('倉庫が埋まっていて[[置き場所]]が無いことが原因です。', 'The cause is [[no storage space]]: the warehouse is full.') : person ? t('[[調達係の人員]]が足りないことが原因です。', 'The cause is [[too few buyers]].') : t('調達係の能力とパネルで決まる[[調達の処理能力]]が上限になっていることが原因です。', 'The cause is [[buying capacity]], set by buyer skill and panels, at its limit.');
      return mk(bn('buy'), ev, cause);
    }
    case 'haul': {
      const ev = t(`運べるのは月[[ ${i.n} 個]]までです。${loss}`, `We can haul only [[${i.n}]] a month.${loss}`);
      const cause = person || limit === 'people' ? t('[[運ぶ人員]]が足りないことが原因です。', 'The cause is [[too few haulers]].') : t('[[荷車と設備]]の処理量が上限になっていることが原因です。', 'The cause is [[carts and equipment]] at their limit.');
      return mk(bn('haul'), ev, cause);
    }
    case 'idle': {
      const st = i.stage ?? bottleneck(stageCaps(s));
      const ev = t(`わたしは[[待機中]]で手が空いています。${loss}`, `I am [[idle]] with free hands.${loss}`);
      const cause = i.what === 'assign' ? t(`[[${STAGE_PLAIN[st]()}]]に人員を足せば処理量が伸びるのに、空いた手が活きていないことが原因です。`, `Adding people to [[${STAGE_PLAIN[st]()}]] would lift throughput, yet my hands go unused.`) : i.what === 'ad' ? t('売り場には集客の余地があり、手の空いた人員を[[宣伝]]に回せると考えます。', 'The shops have room to draw more customers, and I can run an [[ad]].') : t('荒れ地には出土品が眠っており、手の空いた人員を[[発掘]]に回せると考えます。', 'Finds sleep in the wasteland, and I can [[dig]].');
      return mk(bn(st), ev, cause);
    }
    case 'hire': {
      const cause = t(`${STAGE_PLAIN[i.stage]()}の担当が足りず、処理量が[[人員]]で頭打ちになっていることが原因です。`, `The cause is [[staffing]]: too few people on ${STAGE_PLAIN[i.stage]()} cap the throughput.`);
      return mk(bn(i.stage), loss, cause);
    }
    case 'head': {
      const p = s.deleg?.inbox.find((x) => x.id === c.pid);
      const what = L ? t(`[[${issueNm(L.key)}]]が課題になっています。`, `The issue is [[${issueNm(L.key)}]].`) : t('打てる手があります。', 'There is a move to make.');
      // 根拠：流れの課題は処理量と制約の 1 文（一覧の note は画面の表の書き方なので、そのまま文に入れない）
      const ev = L ? (isFlowKey(L.key) ? t(`いまの処理量は月[[ ${Math.round(L.now)} 個]]です。${loss}`, `Throughput is [[${Math.round(L.now)}]]/mo.${loss}`) : L.key === 'store' ? t(`倉庫は[[ ${Math.round(L.now)}%]]まで埋まっています。${loss}`, `Storage is [[${Math.round(L.now)}%]] full.${loss}`) : t(`${emNums(L.note)}。${loss}`, `${emNums(L.note)}.${loss}`)) : '';
      const cause = p?.unit === 'ad' ? t('売り場の集客に余地があり、[[宣伝の期待効果]]が費用を上回ると考えます。', 'The shops can draw more customers, and the [[expected ad effect]] beats its cost.') : p?.unit === 'finds' ? t(`この荒れ地に出土品が[[ ${p.dig?.finds ?? 0} 個]]ほど眠っていると考えます。`, `About [[${p.dig?.finds ?? 0}]] finds sleep in this wasteland.`) : p?.unit === 'share' ? t('この場所の需要に対して売り場が足りないことが原因です。', 'The cause is too few shops for the demand here.') : p?.unit === 'legal' ? t('権利を押さえていないため、[[真似される]]おそれがあることが原因です。', 'The cause is unsecured rights: copies could appear.') : L?.limit ? t(`処理量が[[${limitWord(L.limit)}]]で頭打ちになっていることが原因です。`, `The cause is throughput capped by [[${limitWord(L.limit)}]].`) : t('伸ばせる処理量がまだ残っていると考えます。', 'There is throughput left to gain.');
      return mk(what, ev, cause);
    }
    case 'stall': {
      const nm = STAGE_PLAIN[i.stage]();
      return mk(t(`[[${nm}]]が止まっています。`, `[[${nm}]] has stopped.`), loss, stallCause(i.why));
    }
    case 'store': {
      const F = jammed(s) || i.pct >= 100 ? null : storeFc(s);
      const pm = F && F.src !== 'none' ? Math.round(F.perDay * DAYS) : 0;
      const what = i.pct >= 100 ? t('倉庫が[[いっぱい]]になっています。', 'Storage is [[full]].') : t(`倉庫が[[ ${i.pct}%]]まで埋まっています。`, `Storage is [[${i.pct}%]] full.`);
      const when = F?.days != null ? t(`このペースだと[[${whenFull(F.days)}]]あふれます。`, ` At this pace it fills [[${whenFull(F.days)}]].`) : '';
      const ev = `${when}${loss}` || t(`素材[[ ${i.mats} 個]]・商品[[ ${i.goods} 個]]です。`, `[[${i.mats}]] materials and [[${i.goods}]] goods.`);
      const cause = pm > 0 ? t(`倉庫の中身が月に[[ +${pm} 個]]増えており、調達が売れる数を上回っていることが原因です。`, `Storage grows by [[+${pm}]]/mo: buying outpaces sales.`) : t('調達が売れる数を上回っていることが原因です。', 'Buying outpaces sales.');
      const ask2 = ask ?? { move: t('いまはこのまま様子を見ること', 'keeping as is for now'), cost: '', effect: t('来月の報告での見直し', 'a review in next month’s report') };
      return mk(what, ev, cause, ask2);
    }
    case 'staff': {
      const ev = t(`先月は[[ ${i.off} 日]]、店長が休む日にお店を回す人がいませんでした。`, `Last month, on [[${i.off} days]] nobody ran the shop when the manager rested.`);
      const cause = t(`従業員が[[ ${SELF_RUN.min} 人]]未満だと、休む日にお店を開けられないことが原因です。`, `With fewer than [[${SELF_RUN.min}]] staff the shop can’t open on rest days.`);
      return mk(t('お店の自走ができていません。', 'The shop can’t run on its own.'), ev, cause);
    }
    case 'budget': {
      const a = i.ask;
      const d = c.dept ?? 'logistics';
      const B = deptBudget(s, d);
      const what = a.why === 'over' ? t('次の施策が予算に収まっていません。', 'The next move does not fit the budget.') : a.why === 'spent' ? t('今月の予算を使い切っています。', 'This month’s budget is spent.') : a.why === 'labor' ? t('人手が足りず、施策を打てていません。', 'We are short of hands, so moves wait.') : t('予算の中で打てる手が無くなっています。', 'The budget covers no move.');
      const ev = a.why === 'over' ? t(`次の施策に予算から[[ ${g(a.cost ?? 0)}]]が要ります。`, `The next move needs [[${g(a.cost ?? 0)}]] from the budget.`) : a.why === 'spent' ? t(`今月の予算は[[ ${g(amountOf(s, d))}]]です。`, `This month’s budget is [[${g(amountOf(s, d))}]].`) : a.why === 'labor' ? t(`足りない人手は[[ ${a.need ?? 0} 人日]]です。`, `We are [[${a.need ?? 0} person-days]] short.`) : t(`[[${B.dry ?? 0} か月]]、成果が出ていません。`, `For [[${B.dry ?? 0} months]] nothing could run.`);
      const cause = a.why === 'labor' ? t('従業員の上限が低く、[[労力]]が施策に追いつかないことが原因です。', 'The cause is a low staff cap: [[labor]] can’t keep up with the moves.') : t('打てる手の費用に対して[[予算の枠]]が小さいことが原因です。', 'The cause is a [[budget cap]] too small for the moves available.');
      return mk(what, ev, cause);
    }
    default:
      return null;
  }
}
const issueNm = (k: IssueKey) => {
  switch (k) {
    case 'buy':
      return t('調達のボトルネック', 'the buying bottleneck');
    case 'craft':
      return t('製造のボトルネック', 'the crafting bottleneck');
    case 'haul':
      return t('輸送のボトルネック', 'the hauling bottleneck');
    case 'sell':
      return t('販売のボトルネック', 'the selling bottleneck');
    case 'store':
      return t('倉庫の容量不足', 'storage capacity');
    case 'cash':
      return t('資金繰り', 'cash flow');
    case 'profit':
      return t('収益性', 'profitability');
    case 'morale':
      return t('士気', 'morale');
    case 'sat':
      return t('顧客満足度', 'customer satisfaction');
    case 'brand':
      return t('ブランド力', 'the brand');
    case 'rp':
      return t('研究', 'research');
  }
};
/** 流れが止まった理由（原因の文） */
function stallCause(why: StallWhy): string {
  switch (why) {
    case 'none':
      return t('担当が[[いない]]ことが原因です。', 'The cause is [[nobody]] on it.');
    case 'rest':
      return t('担当が[[休んでいて]]、代わりがいないことが原因です。', 'The cause is the one in charge [[resting]] with no relief.');
    case 'full':
      return t('工房の[[置き場所がいっぱい]]で素材を買えないことが原因です。', 'The cause is a [[full workshop]]: no materials can come in.');
    case 'money':
      return t('[[お金が足りず]]素材を買えないことが原因です。', 'The cause is [[not enough money]] for materials.');
    case 'cap':
      return t('今月の[[調達の上限]]に届いたことが原因です。', 'The cause is this month’s [[buying limit]].');
    case 'route':
      return t('素材の[[ルートが無い]]ことが原因です。', 'The cause is [[no route]] for a material.');
    case 'backlog':
      return t('できた品が[[運ばれずにたまっている]]ことが原因です。', 'The cause is goods [[piling up unhauled]].');
    case 'nomake':
      return t('[[作るもの]]が決まっていないことが原因です。', 'The cause is [[nothing chosen]] to make.');
    case 'noworker':
      return t('作業台に[[職人がいない]]ことが原因です。', 'The cause is [[no crafter]] at the bench.');
    case 'noclerk':
      return t('売り場に[[人がいない]]ことが原因です。', 'The cause is [[nobody]] on the shop floor.');
    case 'empty':
      return t('棚に[[並べる品がない]]ことが原因です。', 'The cause is [[nothing]] on the shelves.');
  }
}
/**
 * 段 UI9b：3 段のセリフ（語り口つき：summary.ts の speakCore）。pick：提案書を開いた選択肢（無ければ画面の推奨の手）。
 * 提案でないカード（問い合わせ・できごと・知らせ など）は null（sayOf の一言のまま）。口ぐせは月（mk）と id で回す
 */
export function speechOf(s: P1State, c: Card, pick?: number): Speech | null {
  if (c.note || !(PROPOSAL_SRC.includes(c.src) || c.src === 'budget')) return null;
  const core = coreOfCard(s, c, pick);
  if (!core) return null;
  return speakCore(core, c.hero, c.mk * 7 + c.id);
}
/** 3 段を 1 つの文章に（カードの吹き出し・受け箱の行） */
export const speechText = (sp: Speech) => [sp.now, sp.cause, sp.ask].filter(Boolean).join(isEn ? ' ' : '');
/** テスト・撮影：意味の層（数字と手の名前の確かめ用） */
export const coreOf = coreOfCard;
/** テスト：3 段のセリフの字数（[[ ]] を除く） */
export const speechLength = (sp: Speech) => sayLen(speechText(sp));

/**
 * 段 UI9b：カードの選択肢の 1 行目（「宣伝：駅のポスター」のように 部門・種類：手の名前）。手の無い選択肢は choiceText の 1 行目のまま
 */
export function moveLine(s: P1State, c: Card, ch: Choice): { dept: DeptId | null; cat: string; name: string } {
  const a = actOfChoice(s, ch);
  if (!a) return { dept: null, cat: '', name: choiceText(s, c, ch).label };
  const cat = (() => {
    switch (a.k) {
      case 'ad':
        return t('宣伝', 'Ad');
      case 'stock':
        return t('商品', 'Goods');
      case 'part':
      case 'staff':
        return t('従業員', 'Staff');
      case 'skill':
      case 'level':
        return t('パネル', 'Panel');
      case 'invest':
        return t('設備', 'Equipment');
      case 'build':
      case 'vacant':
        return t('建物', 'Building');
      case 'hire':
      case 'assign':
        return t('人', 'People');
      case 'clear':
      case 'useup':
        return t('在庫', 'Stock');
      case 'order':
        return t('調達', 'Buying');
      case 'permit':
        return t('発掘', 'Digging');
      case 'patent':
      case 'ma':
        return t('法務', 'Legal');
      case 'famous':
        return t('お店', 'Shop');
    }
  })();
  const name = a.k === 'ad' ? `${ADS.find((x) => x.id === a.id)?.name ?? a.id}${ADS.find((x) => x.id === a.id)?.days ? t(` ${ADS.find((x) => x.id === a.id)!.days} 日`, ` ${ADS.find((x) => x.id === a.id)!.days} d`) : ''}` : c.src === 'stock' && storeAct(a) ? storeLabel(s, a) : actName(s, a);
  return { dept: actDeptOf(a), cat, name };
}
/** その手を受け持つ部門（brief.ts の actDept と同じ決め方。宣伝 → マーケ・人 → 人事・パネル → パネルの部門・発掘 → R&D・法務 → 法務・ほかは物流） */
function actDeptOf(a: PropAct): DeptId {
  switch (a.k) {
    case 'ad':
      return 'marketing';
    case 'skill':
    case 'level':
      return SKILL[a.id] ? deptOf(SKILL[a.id]) : 'logistics';
    case 'hire':
    case 'assign':
      return 'hr';
    case 'permit':
      return 'rnd';
    case 'patent':
    case 'ma':
      return 'legal';
    default:
      return 'logistics';
  }
}
/**
 * 段 UI9b：「今後の判断を委任」（カードのチェックボックス）：承認したあと、同じ種類の手は次からこの担当に任せる（既存の任せる（trust）の仕組み。
 * ★3 の担当の提案だけ：canTrust）。すでに任せていれば何もしない。任せたなら true
 */
export function trustOn(s: P1State, c: Card): boolean {
  if (c.hero == null || !canTrust(s, c)) return false;
  const C = cardsOf(s);
  const key = trustKey(c.hero, c.kind);
  if (!C.trust.includes(key)) C.trust.push(key);
  return true;
}

/** ウィットの一言（話し手の口調の型と属性から。課題の種類・月で回す）。ヒーローでない話し手は無し */
/** 段 P2：史実の調査のあるヒーローは、その人の提案のセリフ・口ぐせ（辞めたいは疲れたときのセリフ）を回す（voice.ts） */
export const quipOfCard = (c: Card): string | null => {
  if (c.hero == null || c.src === 'event' || c.src === 'diplo' || c.src === 'duo') return null;
  const cat = (c.issue.k === 'hire' ? 'idle' : c.issue.k === 'stall' ? (c.issue.stage === 'sell' ? 'sell' : c.issue.stage === 'craft' ? 'craft' : 'buy') : c.issue.k === 'staff' || c.issue.k === 'store' ? 'sell' : c.issue.k === 'haul' ? 'buy' : c.issue.k === 'budget' ? 'head' : c.issue.k) as QuipCat;
  return voiceQuip(c.hero, cat, c.mk + c.id) ?? quipOf(c.hero, cat, c.mk + c.id);
};

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
    case 'budget':
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
    case 'duo':
      return { icon: '✨', text: t('ヒーローの組み合わせ', 'Hero pairing'), color: '#b07cd8' };
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
  if (c.src === 'duo' && c.duo) return duoHead(c.duo);
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
      // 段 UI5d：倉庫の提案の「倉庫を強化する」（置き場所 +N・埋まり方の今 → 後・維持費）
      if (c.src === 'stock' && storeAct(p) && ch.room) {
        const used = poolUsed(s);
        const cap = poolCap(s);
        const pc = (v: number) => `${Math.round((used / Math.max(1, v)) * 100)}%`;
        const keep = ch.monthly ? t(`毎月 ${g(ch.monthly)}`, `${g(ch.monthly)}/mo`) : t('維持費なし', 'no upkeep');
        return { icon: p.k === 'build' ? '🏗' : '🏬', label: storeLabel(s, p), sub: [g(ch.cost), t(`置き場所 +${ch.room}（${pc(cap)} → ${pc(cap + ch.room)}）`, `+${ch.room} storage (${pc(cap)} → ${pc(cap + ch.room)})`), keep].join(SEP()) };
      }
      switch (p.k) {
        case 'stock': {
          const nm = goodsName(p.key);
          // 段 UI5a：何を売るかは製造が決める（作業台を切り替えると、棚は自動でついてくる）
          // 段 UX1（C-7）：既存の作業台を替えて作るなら、作らなくなる商品を 2 行目にも短く
          if (p.add) {
            const dr = stepsOf(s, p).drop;
            return { icon: '👍', label: t(`棚をもう 1 段、${nm}も作って並べよう`, `One more shelf, and make and sell ${nm} too`), sub: `${costTxt}${SEP()}${unitsTxt}${net}${dr ? `${SEP()}${t(`${goodsName(dr)}は作らなくなる`, `${goodsName(dr)} stops`)}` : ''}` };
          }
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
        case 'hire': {
          // 段 UI7g：契約金（1 回）と月給。どの持ち場に就くか
          const job = TASK_NM[p.task]?.() ?? '';
          const fee = ch.cost > 0 ? t(`契約金 ${g(ch.cost)}・`, `signing ${g(ch.cost)} · `) : '';
          const ut = unitsTxt ? t(`・${unitsTxt}`, ` · ${unitsTxt}`) : '';
          return { icon: '🤝', label: job ? t(`${heroNm(p.hero)}を雇って${job}に`, `Hire ${heroNm(p.hero)} for ${job}`) : t(`${heroNm(p.hero)}を雇おう`, `Hire ${heroNm(p.hero)}`), sub: t(`${fee}月給 ${g(ch.monthly ?? 0)}${ut}・差し引き ${sgn(est)} G／月`, `${fee}${g(ch.monthly ?? 0)}/mo${ut} · net ${sgn(est)} G/mo`) };
        }
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
      // 段 UI7h：知らせ（推奨の札なし）は「わかった」で閉じる
      if (c.note) return { icon: '👌', label: t('わかった', 'Got it'), sub: t('知らせを閉じる', 'Close this notice') };
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
      // 段 I1：予算で任せている部門の施策は、労力（人日）も
      const lab = p && budgetOpen(s) && headOf(s, p.dept) ? `${SEP()}${t(`労力 ${laborNeed(s, p.dept, p.act)} 人日`, `${laborNeed(s, p.dept, p.act)} p-days`)}` : '';
      // 段 UI5d：部長からの頼みのカードでは、予算の外（会社のお金）で払う額だと分かるように
      const cost2 = c.src === 'budget' && ch.cost > 0 && !ch.rp ? t(`直接の承認 ${g(ch.cost)}（予算の外）`, `${g(ch.cost)} direct (outside the budget)`) : cost;
      return { icon: '✔', label: t(`承認：${p ? actName(s, p.act) : ''}`, `Approve: ${p ? actName(s, p.act) : ''}`), sub: `${cost2}${SEP()}${EXPECT()} ${est2}${lab}` };
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
    case 'duo': {
      const o = c.duo?.opts[a.i];
      if (!c.duo || !o) return { icon: '▶', label: '', sub: '' };
      return { ...duoOptText(c.duo, o), sub: duoOptSub(c.duo, o) };
    }
    case 'budget': {
      const nm = a.lv === 'X' ? g(a.amt ?? 0) : t(`「${lvName(a.lv)}」`, `“${lvName(a.lv)}”`);
      const to = a.lv === 'X' ? (a.amt ?? 0) : amountOf(s, a.dept) + (ch.monthly ?? 0);
      return { icon: '💰', label: t(`予算を${nm}に上げる`, `Raise the budget to ${nm}`), sub: t(`月 ${g(amountOf(s, a.dept))} → ${g(to)}・余りは会社に戻る`, `${g(amountOf(s, a.dept))} → ${g(to)} a month · leftovers come back`) };
    }
    case 'crew':
      return { icon: '🧑‍💼', label: t(`従業員の上限を ${a.cap} 人に`, `Staff cap to ${a.cap}`), sub: t(`1 人 月 ${g(crewWageMonth())}（予算から）・労力 +${BUDGET.crew.labor} 人日`, `${g(crewWageMonth())}/mo each (from the budget) · +${BUDGET.crew.labor} person-days`) };
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
