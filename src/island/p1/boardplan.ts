/**
 * 段 I2b：経営会議の部長の報告を「判断できる・シゴデキ・人物らしい」ものに（DOM なし：board.ts・boardui.ts・テストが使う）。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 I2b」・docs/ISLAND_PHASE1.md の経営会議の節。数字は data.ts の BOARD.lever。
 *
 * - 会社の余力（coSlack）：会社の月の資金の出入り（直近 3 か月の帳簿の平均）に、部門が予算から使った額を足した「月の稼ぎ」と、全部門の月の予算の合計を並べる。
 *   余力 ＝ 稼ぎ − 予算の合計（全部門が予算を使い切っても資金が減らない上限まで、あと月いくら）。予算は「使ってよい上限」で、使わなかった分は会社の資金に残る（繰り越さない）。
 * - 何もできなかった原因（Cause）：四半期の月ごとの部長の施策の結果（budget.ts の qwhy。deleg.ts の delegMonth が数える）から決める。
 *   予算が足りない・人手が足りない・会社の資金を守った・打てる手が無い（開放不足）・手はもう打ってある・手を打つ必要が無かった・この町では打てない。作り話にしない。
 * - 来期の打ち手（Lever）：原因に対する具体的な手。予算が足りない → 要る額の増額・人手 → 従業員の上限・それ以外 → その部門のパネル（いまの詰まりに効く手、
 *   無ければ次の詰まりへの備え）。パネルの効き目は、状態の写しに仮に当てて「会社の売れる数（調達・製造・輸送・販売のいちばん細い所）」の増えではかる。
 *   いくつかの良い手から、部長のヒーローの施策の好み（voice.ts の HeroStyle：攻め／守り・速さ／堅実・新しい手／正攻法・人を育てる）で 1 つ選び、言い回しも寄せる。
 */
import { t } from '../../i18n';
import { ADS, BOARD, BUDGET, DEPT_SKILLS, SKILL, isResearch, levelCost, rpCost, type DeptId, type Skill } from './data';
import { amountOf, budgetDepts, crewWageMonth, deptBudget, headReserve } from './budget';
import { headOf, unitMargin } from './deleg';
import { pl } from './company';
import { legalHere } from './legal';
import { bottleneck, gainSkill, has, levelLock, levelUp, learn, lvOf, myShops, scratch, sellNow, setLevel, skillLock, stageCaps, type P1State, type Stage } from './model';
import { parseStyle, styleCode, type HeroStyle } from './voice';
import { toneOf } from './persona';
import { TALK_MAX, talkLen } from './mine';

/** セリフの芯は、社長の呼び方を付けても 60 字に収まる長さから選ぶ（長い名前の手は、言い回しを短くしていく） */
const CORE_MAX = TALK_MAX - 6;
const fitCore = (...xs: string[]) => xs.find((x) => talkLen(x) <= CORE_MAX) ?? xs[xs.length - 1];

// ---------------------------------------------------------------- 型

/** 何もできなかった（施策が少なかった）原因 */
export type Cause =
  | { k: 'budget'; cost: number; room: number; need: number; nm: string; val: number }
  | { k: 'labor'; lab: number; cap: number }
  | { k: 'cash'; reserve: number }
  | { k: 'lock'; nm: string; pre: string[]; stage: Stage; units: number }
  | { k: 'busy'; n: number; of: number }
  | { k: 'need'; stage: Stage }
  | { k: 'town'; why: 'dig' | 'legal' | 'site' | 'shop' };
/**
 * 来期の打ち手：panel＝パネルを開く・強化する（ids の順に。最後が効き目の元。now＝いまの詰まりに効く・false は次の詰まりへの備え）・
 * crew＝従業員の上限を上げる・budget＝予算を増やす（③ 必要予算の増額の要求になる）
 */
export type Lever =
  | { k: 'panel'; ids: string[]; lv: boolean; nm: string; pre: string[]; stage: Stage; now: boolean; units: number; val: number; cost: number; rp: number }
  | { k: 'crew'; cap: number; add: number; lab: number; wage: number }
  | { k: 'budget'; amt: number; nm: string; val: number };
/** 会社の余力（月）：earn＝部門の予算を使う前の月の稼ぎ・caps＝全部門の月の予算の合計・slack＝earn − caps・net＝月の資金の出入り・spent＝部門が使った額（月）・n＝はかった月の数 */
export interface CoSlack {
  earn: number;
  caps: number;
  slack: number;
  net: number;
  spent: number;
  n: number;
}

// ---------------------------------------------------------------- 名前

export const STAGE_JA: Record<Stage, () => string> = { buy: () => t('調達', 'buying'), craft: () => t('製造', 'crafting'), haul: () => t('輸送', 'hauling'), sell: () => t('販売', 'selling') };
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const n1 = (v: number) => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
const nm = (id: string) => SKILL[id]?.name ?? id;

// ---------------------------------------------------------------- 施策の好み

export const styleOfHero = (hero: number): HeroStyle => parseStyle(styleCode(hero, toneOf(hero)));

// ---------------------------------------------------------------- 会社の余力

/**
 * 会社の余力（直近 3 か月の帳簿の平均。帳簿が無ければ 0 の月）。net は月の利益（営業 ＋ 営業外 − 法人税。建物・買収などの投資や入国料の特別な出入りは除く：
 * 一度きりの投資で毎月の余力がぶれないように）
 */
export function coSlack(s: P1State): CoSlack {
  const ms = s.books?.months.slice(-BOARD.months) ?? [];
  const n = ms.length;
  const net = n
    ? ms.reduce((a, x) => {
        const p = pl(x.l);
        return a + p.op + p.nonop - p.tax;
      }, 0) / n
    : 0;
  let spent = 0;
  let caps = 0;
  for (const d of budgetDepts(s)) {
    if (!headOf(s, d)) continue;
    const B = deptBudget(s, d);
    caps += amountOf(s, d);
    // 四半期の使った額（無ければ先月 × 月の数）を月に直す
    spent += n ? (B.qused ?? (B.last?.used ?? 0) * n) / n : 0;
  }
  const earn = net + spent;
  return { earn: Math.round(earn), caps: Math.round(caps), slack: Math.round(earn - caps), net: Math.round(net), spent: Math.round(spent), n };
}

/** 開いている会議の余力：議題を作ったときの稼ぎ（帳簿）に、いまの全部門の予算の合計（先に決めた人の増減を入れる）。議題に余力が無ければ、いまはかる */
export function coLive(s: P1State, base: CoSlack | undefined): CoSlack {
  if (!base) return coSlack(s);
  let caps = 0;
  for (const d of budgetDepts(s)) if (headOf(s, d)) caps += amountOf(s, d);
  return { ...base, caps: Math.round(caps), slack: Math.round(base.earn - caps) };
}

// ---------------------------------------------------------------- パネルの打ち手（効き目をはかる）

type Flow = Record<Stage, number>;
/** 打ち手の見込みの近道（効き目が無いと分かっている手は、販売の数をはかり直さない）。止めると全部はかる。テストで「答えが同じ」を確かめる */
export const LEVER_FAST = { on: true };
/** 会社の流れ（個／月）：調達・製造・輸送はその段の処理力、販売は売れる数。お店が無ければ販売は数えない */
function flowOf(s: P1State, sell?: number, caps?: ReturnType<typeof stageCaps>): Flow {
  const c = caps ?? stageCaps(s, true, true);
  const v = (k: Stage) => (c[k].stopped ? 0 : c[k].perMonth);
  return { buy: v('buy'), craft: v('craft'), haul: v('haul'), sell: sell ?? (myShops(s).length ? sellNow(s).units : Infinity) };
}
const outOf = (f: Flow) => Math.min(f.buy, f.craft, f.haul, f.sell);
const okLock = (e: string | null) => e == null || e === 'money' || e === 'rp';

/** その部門のパネルの打ち手（効き目のあるものすべて）。いまの詰まりに効く手（now）と、次の詰まりへの備え */
/** いまの流れ・詰まり・次の詰まり（同じ日の同じ状態は 1 回だけはかる：議題を作るあいだ部門ごとに使う） */
const baseMemo = new WeakMap<P1State, { day: number; skills: number; f0: Flow; out0: number; bn: Stage; next: Stage | null; margin: number }>();
function baseOf(s: P1State) {
  const m = baseMemo.get(s);
  if (m && m.day === s.day && m.skills === s.skills.length) return m;
  const f0 = flowOf(s);
  const bn = bottleneck(stageCaps(s));
  // 次の詰まり：いまの詰まりのほかで、いちばん細い段
  const rest = (['buy', 'craft', 'haul', 'sell'] as Stage[]).filter((k) => k !== bn && Number.isFinite(f0[k]));
  const next = rest.sort((a, b) => f0[a] - f0[b])[0] ?? null;
  const x = { day: s.day, skills: s.skills.length, f0, out0: outOf(f0), bn, next, margin: unitMargin(s) };
  baseMemo.set(s, x);
  return x;
}
export function panelLevers(s: P1State, d: DeptId): Extract<Lever, { k: 'panel' }>[] {
  if (!myShops(s).length) return [];
  const { f0, out0, bn, next, margin } = baseOf(s);
  const out: Extract<Lever, { k: 'panel' }>[] = [];
  // はかるパネル：前提の要らないもの（取れる・強化できる）を先に、前提が 1 段で取れるものを後に。BOARD.lever.evals まで
  const cand: { k: Skill; lv: boolean; pre: string[] }[] = [];
  for (const k of DEPT_SKILLS[d] ?? []) {
    if (k.train || k.big || k.donate || k.inf) continue;
    const lv = has(s, k.id);
    if (lv) {
      const e = levelLock(s, k);
      if (e == null || e === 'money') cand.push({ k, lv, pre: [] });
      continue;
    }
    const e = skillLock(s, k);
    if (okLock(e)) cand.push({ k, lv, pre: [] });
    else if (e === 'requires') {
      const pre = (k.requires ?? []).filter((r) => !has(s, r));
      if (pre.length && !pre.some((r) => !SKILL[r] || SKILL[r].train || SKILL[r].big || !okLock(skillLock(s, SKILL[r])))) cand.push({ k, lv, pre });
    }
  }
  cand.sort((a, b) => a.pre.length - b.pre.length);
  for (const { k, lv, pre } of cand.slice(0, BOARD.lever.evals)) {
    const c = scratch(s);
    for (const r of pre) gainSkill(c, r);
    if (!lv && pre.length && !okLock(skillLock(c, k))) continue;
    if (lv) setLevel(c, k.id, lvOf(s, k.id) + 1);
    else gainSkill(c, k.id);
    // 販売の数（重い）は、販売がいまの詰まりか次の詰まりのときだけはかり直す（ほかは変わらないものとして数える）。
    // 販売がいまの詰まりで、ほかの段がどれも「いまの数 + minUnits」に届かなければ、販売がいくら増えても now にならない：はかり直さない（結果は同じ）
    let sell1: number | undefined = bn === 'sell' || next === 'sell' ? undefined : f0.sell;
    const c1 = stageCaps(c, true, true);
    if (LEVER_FAST.on && bn === 'sell' && next !== 'sell') {
      const v = (k: Stage) => (c1[k].stopped ? 0 : c1[k].perMonth);
      if (Math.min(v('buy'), v('craft'), v('haul')) - out0 < BOARD.lever.minUnits) sell1 = f0.sell;
    }
    const f1 = flowOf(c, sell1, c1);
    const nowU = outOf(f1) - out0;
    const nextU = next ? f1[next] - f0[next] : 0;
    const now = nowU >= BOARD.lever.minUnits;
    if (!now && !(nextU >= BOARD.lever.minUnits)) continue;
    const units = now ? nowU : nextU;
    const steps = [...pre.map((r) => SKILL[r]), k];
    const cost = pre.reduce((a, r) => a + (isResearch(SKILL[r]) ? 0 : SKILL[r].cost), 0) + (lv ? levelCost(k, lvOf(s, k.id) + 1) : isResearch(k) ? 0 : k.cost);
    const rp = steps.reduce((a, x, i) => a + (i === steps.length - 1 && lv ? 0 : rpCost(x)), 0);
    out.push({ k: 'panel', ids: [...pre, k.id], lv, nm: k.name, pre: pre.map(nm), stage: now ? bn : next!, now, units: Math.round(units * 10) / 10, val: Math.round(units * margin), cost, rp });
  }
  return out;
}
/** そのパネルを先に要るパネルの数（堅実な部長は、あとにつながる手を好む） */
const unlocks = (id: string) => Object.values(SKILL).filter((x: Skill) => x.requires?.includes(id)).length;
/**
 * 打ち手の選び方（部長のヒーローの施策の好み）。どれも効き目のある良い手の中から 1 つ。
 * 土台は月の見込み（G）× いまの詰まりに効くか（次の詰まりへの備えは BOARD.lever.later）。
 * 攻め：大きな見込みをそのまま・守り：元が取れる早さ（費用 ÷ 見込み）で割り引く・速さ：前提の要らない手・堅実：あとにつながる手・
 * 新しい手：まだ開いていないパネル（研究パネル）・正攻法：いまのパネルの強化・人を育てる：人のパネル（人事・総務）
 */
export function leverScore(L: Extract<Lever, { k: 'panel' }>, st: HeroStyle, d: DeptId): number {
  let v = Math.max(1, L.val) * (L.now ? 1 : BOARD.lever.later);
  const pay = (L.cost + L.rp * 20) / Math.max(1, L.val);
  if (st.atk < 0) v /= 1 + pay / 3;
  if (st.atk > 0) v *= 1 + Math.min(1, L.units / 20) * 0.3;
  if (st.spd > 0) v *= L.pre.length ? 0.6 : 1.3;
  if (st.spd < 0) v *= 1 + 0.05 * Math.min(10, unlocks(L.ids[L.ids.length - 1]));
  if (st.odd > 0) v *= L.lv ? 0.85 : 1.25;
  if (st.odd < 0) v *= L.lv ? 1.25 : 0.95;
  if (st.grow && (d === 'hr' || d === 'general' || SKILL[L.ids[L.ids.length - 1]]?.branch === 'people')) v *= 1.3;
  return v;
}
export function pickLever(levers: Extract<Lever, { k: 'panel' }>[], st: HeroStyle, d: DeptId): Extract<Lever, { k: 'panel' }> | null {
  let best: Extract<Lever, { k: 'panel' }> | null = null;
  let bv = -Infinity;
  for (const L of levers) {
    const v = leverScore(L, st, d);
    if (v > bv) {
      bv = v;
      best = L;
    }
  }
  return best;
}

// ---------------------------------------------------------------- 原因と打ち手（議題を作るとき）

/** 部門の原因と来期の打ち手（四半期の締め。acts：その四半期の施策の数） */
export function diagnose(s: P1State, d: DeptId, acts: number, st: HeroStyle): { why: Cause | null; lever: Lever | null } {
  const B = deptBudget(s, d);
  const q = B.qwhy;
  const blocks = q ? q.over + q.labor + q.cash + q.none : acts ? 0 : 1;
  if (acts >= BOARD.lever.few && !(q && q.over + q.labor)) return { why: null, lever: null };
  if (!blocks) return { why: null, lever: null };
  // 止まった理由のいちばん多いもの（同じなら 予算 → 人手 → 資金 → 手が無い）
  const k = q ? (['over', 'labor', 'cash', 'none'] as const).reduce((m, x) => (q[x] > q[m] ? x : m), 'over' as 'over' | 'labor' | 'cash' | 'none') : 'none';
  if (q && k === 'over' && q.over > 0 && q.need != null) {
    const why: Cause = { k: 'budget', cost: q.cost ?? 0, room: q.room ?? 0, need: q.need, nm: q.nm ?? '', val: q.val ?? 0 };
    const amt = Math.min(BUDGET.max, Math.ceil((q.need * (st.atk > 0 ? 1 + BOARD.lever.pad : 1)) / BUDGET.round) * BUDGET.round);
    return { why, lever: amt > amountOf(s, d) ? { k: 'budget', amt, nm: why.nm, val: why.val } : null };
  }
  if (q && k === 'labor' && q.labor > 0) {
    const lab = q.lab ?? BUDGET.crew.labor;
    const add = Math.max(1, Math.ceil(lab / BUDGET.crew.labor));
    const cap = Math.min(BUDGET.crew.capMax, B.cap + add);
    return { why: { k: 'labor', lab, cap: q.cap ?? B.cap }, lever: cap > B.cap ? { k: 'crew', cap, add: cap - B.cap, lab, wage: (cap - B.cap) * crewWageMonth() } : null };
  }
  if (q && k === 'cash' && q.cash > 0) return { why: { k: 'cash', reserve: Math.round(headReserve(s)) }, lever: null };
  // 打てる手が無かった：いまの状態から、なぜ無いのか・次に何を打つか
  const levers = panelLevers(s, d);
  // いまの詰まりに効く手があれば、その中から（次の詰まりへの備えは、いまの詰まりに効く手が無いときだけ）
  const nowL = pickLever(levers.filter((x) => x.now), st, d);
  const L = nowL ?? pickLever(levers, st, d);
  let why: Cause;
  if (d === 'marketing' && ADS.every((a) => (s.ads[a.id] ?? 0) > 0)) why = { k: 'busy', n: ADS.length, of: ADS.length };
  else if (nowL) why = { k: 'lock', nm: nowL.nm, pre: nowL.pre, stage: nowL.stage, units: nowL.units };
  else if (!myShops(s).length) why = { k: 'town', why: 'shop' };
  else if (d === 'rnd') why = { k: 'town', why: 'dig' };
  else if (d === 'legal' && !legalHere(s)) why = { k: 'town', why: 'legal' };
  else if (d === 'sales') why = { k: 'town', why: 'site' };
  else why = { k: 'need', stage: bottleneck(stageCaps(s)) };
  return { why, lever: L };
}

// ---------------------------------------------------------------- 打ち手を実行する（会議で承認したとき）

/** 打ち手を実行する（承認）。パネルは前提から順に開く（お金・RP が足りなくなったらそこまで）。開いた数を返す */
export function applyLever(s: P1State, d: DeptId, L: Lever): number {
  if (L.k === 'crew') {
    const B = deptBudget(s, d);
    B.cap = Math.max(B.cap, Math.min(BUDGET.crew.capMax, L.cap));
    return 1;
  }
  if (L.k !== 'panel') return 0;
  let n = 0;
  for (const id of L.ids) {
    const e = has(s, id) && id === L.ids[L.ids.length - 1] && L.lv ? levelUp(s, id) : has(s, id) ? null : learn(s, id);
    if (e != null) break;
    n++;
  }
  return n;
}
/** 打ち手の推奨（承認＝0・見送る＝1）：パネルは「いまの詰まりに効く・資金（取り置きを除く）の BOARD.lever.cash まで・RP は BOARD.lever.rp まで」。人手は給料が月の予算の BOARD.lever.crew まで */
export function leverRec(s: P1State, d: DeptId, L: Lever | null | undefined): 0 | 1 {
  if (!L || L.k === 'budget') return 0;
  if (L.k === 'crew') return (deptBudget(s, d).crew + L.add) * crewWageMonth() <= amountOf(s, d) * BOARD.lever.crew ? 0 : 1;
  if (!L.now) return 1;
  const free = Math.max(0, s.money - headReserve(s));
  return L.cost <= free * BOARD.lever.cash && L.rp <= (s.rp ?? 0) * BOARD.lever.rp ? 0 : 1;
}

// ---------------------------------------------------------------- 画面・セリフの文

/** 原因の札（短い名前） */
export function causeName(c: Cause): string {
  switch (c.k) {
    case 'budget':
      return t('予算が足りない', 'Budget too small');
    case 'labor':
      return t('人手が足りない', 'Short of hands');
    case 'cash':
      return t('会社の資金を守った', 'Protected company cash');
    case 'lock':
      return t('打てる手が無い（開放不足）', 'No move open (locked)');
    case 'busy':
      return t('手はもう打ってある', 'Already running');
    case 'need':
      return t('手を打つ必要が無かった', 'No need to act');
    case 'town':
      return t('この町では打てる手が無い', 'Nothing to do in this town');
  }
}
/** 原因の数字のチップ */
export function causeChips(c: Cause): string[] {
  switch (c.k) {
    case 'budget':
      return [t(`止まった手 ${g(c.cost)}`, `Blocked move ${g(c.cost)}`), t(`予算の残り ${g(c.room)}`, `Budget left ${g(c.room)}`), t(`要る予算 月 ${g(c.need)}`, `Needs ${g(c.need)}/mo`)];
    case 'labor':
      return [t(`足りない人手 ${c.lab} 人日`, `Short ${c.lab} person-days`), t(`従業員の上限 ${c.cap} 人`, `Staff cap ${c.cap}`)];
    case 'cash':
      return [t(`資金の取り置き ${g(c.reserve)}`, `Cash reserve ${g(c.reserve)}`)];
    case 'lock':
      return [t(`足りないパネル：${c.pre.length ? c.pre.join('・') : c.nm}`, `Missing panel: ${c.pre.length ? c.pre.join(', ') : c.nm}`), t(`効き目 ${STAGE_JA[c.stage]()} 月 +${n1(c.units)} 個`, `+${n1(c.units)}/mo ${STAGE_JA[c.stage]()}`)];
    case 'busy':
      return [t(`流している宣伝 ${c.n} / ${c.of}`, `Ads running ${c.n}/${c.of}`)];
    case 'need':
      return [t(`いまの詰まり：${STAGE_JA[c.stage]()}`, `Bottleneck: ${STAGE_JA[c.stage]()}`), t('この部門の手の効き目 0', 'No effect from this division')];
    case 'town':
      return [c.why === 'dig' ? t('申請できる荒れ地 0', 'No site to permit') : c.why === 'legal' ? t('法務は Epic の町から', 'Legal opens in Epic towns') : c.why === 'site' ? t('伸びる出店の区画 0', 'No good site') : t('お店 0 軒', 'No shops')];
  }
}
/** 予実の報告のひと言（原因から。heroLine に渡す芯） */
export function causeCore(c: Cause, acts: number, used: number): string {
  const head = acts ? t(`施策 ${acts} 件・${g(used)}。`, `${acts} moves for ${g(used)}. `) : t('施策は 0 件です。', 'No moves. ');
  const body = causeBody(c);
  return fitCore(head + body, body, causeName(c));
}
function causeBody(c: Cause): string {
  const head = '';
  switch (c.k) {
    case 'budget':
      return head + t(`「${c.nm}」が ${g(c.cost)} で予算の残り ${g(c.room)} を超えました`, `“${c.nm}” at ${g(c.cost)} topped the ${g(c.room)} left`);
    case 'labor':
      return head + t(`人手が ${c.lab} 人日足りず、手が止まりました`, `we ran ${c.lab} person-days short`);
    case 'cash':
      return head + t(`会社の資金の取り置き ${g(c.reserve)} を守り、止めました`, `I held back to keep the ${g(c.reserve)} reserve`);
    case 'lock':
      return head + t(`詰まりの${STAGE_JA[c.stage]()}に効く『${c.pre[0] ?? c.nm}』が未開放です`, `“${c.pre[0] ?? c.nm}”, the fix for ${STAGE_JA[c.stage]()}, isn’t open`);
    case 'busy':
      return head + t(`宣伝は ${c.n} つとも流し続けています`, `all ${c.n} ads are already running`);
    case 'need':
      return head + t(`詰まりは${STAGE_JA[c.stage]()}で、うちの手は効かず予算は温存しました`, `the bottleneck is ${STAGE_JA[c.stage]()}; our moves don’t touch it, so I saved the budget`);
    case 'town':
      return head + (c.why === 'dig' ? t('申請できる荒れ地がありませんでした', 'there was no site to permit') : c.why === 'legal' ? t('法務の手続きは Epic の町からです', 'legal work opens in Epic towns') : c.why === 'site' ? t('出店で伸びる区画がありませんでした', 'no site would grow sales') : t('お店がまだありません', 'there are no shops yet'));
  }
}

/**
 * 来期の計画のひと言（打ち手から。部長の施策の好みで言い回しを寄せる）。芯だけ（heroLine に渡す）
 */
export function leverCore(L: Lever, st: HeroStyle): string {
  if (L.k !== 'panel') return fitCore(leverText(L, st), leverText(L, { atk: 0, spd: 0, odd: 0, grow: 0 }));
  // 長い名前：前提のパネルを外す → 好みの言い回しを外す → いちばん短い形
  const bare = { ...L, pre: [] };
  return fitCore(leverText(L, st), leverText(bare, st), leverText(bare, { atk: 0, spd: 0, odd: 0, grow: 0 }), t(`『${L.nm}』を開き、${STAGE_JA[L.stage]()} 月 +${n1(L.units)} 個`, `Open “${L.nm}”: +${n1(L.units)}/mo`));
}
function leverText(L: Lever, st: HeroStyle): string {
  if (L.k === 'budget') {
    const v = L.val > 0 ? t(`。見込み +${g(L.val)}`, `; worth +${g(L.val)}`) : '';
    if (st.atk > 0 || st.spd > 0) return t(`月 ${g(L.amt)} あれば、すぐ「${L.nm}」を打ちます${v}`, `give me ${g(L.amt)}/mo and “${L.nm}” goes out at once${v}`);
    return t(`月 ${g(L.amt)} あれば「${L.nm}」を打てます${v}`, `with ${g(L.amt)}/mo I can run “${L.nm}”${v}`);
  }
  if (L.k === 'crew') return st.grow ? t(`従業員の上限を ${L.cap} 人に。人を入れて育て、手を止めません`, `raise the staff cap to ${L.cap}; I’ll hire and train them`) : t(`従業員の上限を ${L.cap} 人にしてください。足りない ${L.lab} 人日を埋めます`, `raise the staff cap to ${L.cap} to cover ${L.lab} person-days`);
  const pn = L.pre.length ? t(`『${L.pre[0]}』から『${L.nm}』`, `“${L.pre[0]}” then “${L.nm}”`) : `『${L.nm}』`;
  const eff = t(`${STAGE_JA[L.stage]()}が月 +${n1(L.units)} 個`, `+${n1(L.units)}/mo ${STAGE_JA[L.stage]()}`);
  const up = L.lv ? t('を強化し、', ' upgraded,') : t('を開き、', ' opened,');
  if (!L.now) return t(`次の詰まりの${STAGE_JA[L.stage]()}に備え、${pn}${up}${eff}`, `ahead of the next bottleneck: ${pn}${up} ${eff}`);
  if (st.atk > 0 && st.spd > 0) return t(`すぐ${pn}${up}${eff}。迷う暇はありません`, `${pn}${up} right now: ${eff}`);
  if (st.odd > 0) return t(`新しい手で攻めます。${pn}${up}${eff}`, `a fresh move: ${pn}${up} ${eff}`);
  if (st.atk < 0) return t(`まず${pn}${up}足場を固めます。${eff}`, `first ${pn}${up} to firm up: ${eff}`);
  if (st.spd < 0) return t(`${pn}${up}順に積み上げます。${eff}`, `${pn}${up} step by step: ${eff}`);
  if (st.grow) return t(`${pn}${up}人が育つ形で、${eff}`, `${pn}${up} so the team grows: ${eff}`);
  if (st.atk > 0) return t(`${pn}${up}攻めに出ます。${eff}`, `${pn}${up} and we push: ${eff}`);
  return t(`${pn}${up}${eff}。決裁をお願いします`, `${pn}${up} ${eff}. Your sign-off, please`);
}
/** 打ち手が無いときの来期の計画（原因から。受け身にしない：何を待つか・何を返すか） */
export function noLeverCore(c: Cause | null): string {
  if (c?.k === 'cash') return t('資金が取り置きを上回る月に、止めた手から順に打ちます', 'I’ll restart the held moves as soon as cash clears the reserve');
  if (c?.k === 'town' && c.why === 'dig') return t('次の荒れ地が出たら、その月に許可を申請します', 'I’ll file a permit the month a new site opens');
  if (c?.k === 'town' && c.why === 'legal') return t('Epic の町に入ったら、特許と買収の打診から始めます', 'In an Epic town I’ll start with patents and offers');
  return t('この部門の手は詰まりに効かないので、予算は会社に残し、詰まりが移ったらすぐ動きます', 'Our moves don’t touch the bottleneck; I’ll leave the budget with HQ until one does');
}
/** 目標の上乗せが押せないとき：何があれば見込みが出るか（1 行） */
export function forecastHint(L: Lever | null | undefined, c?: Cause | null): string {
  if (!L) {
    if (c?.k === 'cash') return t('見込みを出すには：会社の資金が取り置きを上回ること', 'A forecast needs cash above the reserve');
    if (c?.k === 'town') return c.why === 'dig' ? t('見込みを出すには：申請できる荒れ地', 'A forecast needs a site to permit') : c.why === 'legal' ? t('見込みを出すには：Epic の町', 'A forecast needs an Epic town') : t('見込みを出すには：伸びる出店の区画', 'A forecast needs a good site');
    return t('見込みを出すには：この部門の手が効く詰まりになること', 'A forecast needs a bottleneck this division can move');
  }
  if (L.k === 'budget') return t(`見込みを出すには：予算 月 ${g(L.amt)}`, `For a forecast: ${g(L.amt)}/mo budget`);
  if (L.k === 'crew') return t(`見込みを出すには：従業員の上限 ${L.cap} 人`, `For a forecast: staff cap ${L.cap}`);
  return t(`見込みを出すには：パネル『${L.pre[0] ?? L.nm}』（${STAGE_JA[L.stage]()} 月 +${n1(L.units)} 個）`, `For a forecast: open “${L.pre[0] ?? L.nm}” (+${n1(L.units)}/mo ${STAGE_JA[L.stage]()})`);
}
/** 打ち手の承認の選択肢の文（名前・小さな値） */
export function leverOpts(L: Lever): { name: string; val: string }[] {
  if (L.k === 'crew') return [{ name: t('承認：上限を上げる', 'Approve: raise cap'), val: t(`${L.cap} 人まで（給料 月 +${g(L.wage)} まで）`, `Up to ${L.cap} (wages up to +${g(L.wage)}/mo)`) }, { name: t('見送る', 'Hold'), val: t('上限はそのまま', 'Keep the cap') }];
  const price = [L.k === 'panel' && L.cost ? g(L.cost) : '', L.k === 'panel' && L.rp ? `${L.rp} RP` : ''].filter(Boolean).join(t('・', ' + ')) || t('費用なし', 'Free');
  const act = L.k === 'panel' && L.lv ? t('強化する', 'upgrade') : t('開く', 'open');
  return [
    { name: t(`承認：${act}`, `Approve: ${act}`), val: price },
    { name: t('見送る', 'Hold'), val: t('いまは開かない', 'Not now') },
  ];
}
/** 打ち手の推奨の理由（1 行） */
export function leverWhy(s: P1State, L: Lever, rec: 0 | 1): string {
  if (L.k === 'crew') return rec === 0 ? t(`給料は月の予算の内に収まる（月 +${g(L.wage)} まで）`, `Wages fit the budget (up to +${g(L.wage)}/mo)`) : t('給料が月の予算を圧迫する', 'Wages would squeeze the budget');
  if (L.k !== 'panel') return '';
  if (!L.now) return t('次の詰まりへの備え。いまの売れる数は増えない', 'Prep for the next bottleneck; no gain today');
  const free = Math.max(0, s.money - headReserve(s));
  if (rec === 0) return L.cost ? t(`費用は自由に使える資金 ${g(free)} の ${Math.max(1, Math.round((L.cost / Math.max(1, free)) * 100))}%。見込み 月 +${g(L.val)}`, `Cost is ${Math.max(1, Math.round((L.cost / Math.max(1, free)) * 100))}% of free cash ${g(free)}; +${g(L.val)}/mo`) : t(`RP ${L.rp}（手持ち ${s.rp ?? 0}）。見込み 月 +${g(L.val)}`, `${L.rp} RP of ${s.rp ?? 0}; +${g(L.val)}/mo`);
  return L.rp > (s.rp ?? 0) * BOARD.lever.rp ? t(`RP が足りない（要る ${L.rp}・手持ち ${s.rp ?? 0}）`, `Not enough RP (${L.rp} of ${s.rp ?? 0})`) : t(`費用 ${g(L.cost)} が自由に使える資金 ${g(free)} に重い`, `${g(L.cost)} is heavy against free cash ${g(free)}`);
}
/** 余力に対する割合の言い方（「余力の 1 割」「1 割未満」） */
export function ofSlack(v: number, slack: number): string {
  if (slack <= 0) return t('余力なし', 'no slack');
  const r = v / slack;
  if (r < 0.1) return t('余力の 1 割未満', 'under 10% of slack');
  if (r > 1) return t(`余力の ${n1(r)} 倍`, `${n1(r)}× slack`);
  return t(`余力の ${Math.round(r * 10)} 割`, `${Math.round(r * 10) * 10}% of slack`);
}
