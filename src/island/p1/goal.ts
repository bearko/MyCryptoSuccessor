/**
 * 段 ST1：「ここまで研究を進める」（DOM なし。main.ts の毎日・tree.ts の目標の帯と道・テストが使う）。
 * 仕様は docs/ISLAND_PHASE1.md「スキルツリー」の「ここまで研究を進める（段 ST1）」。
 *
 * - 目標は 1 つだけ（Flags.goal）。まだ取れないパネルを選ぶと目標になる（別のパネルを選ぶと置き換わる）。
 * - 道（goalPath）：目標までの、まだ取っていない前提をすべて（全部要る＝requires はたどり、n 個要る＝anyOf は安いほうから足りない数だけ）。
 *   取る順は前提の順（道の中の深さ）で、同じ深さなら安い順（研究パネルは RP、お金のパネルは G。比べるときは RP を GOAL.rpG 倍の G とみなす）。
 * - 支払い（goalStep。毎日・RP やお金が入ったあと）：道の次のパネルが、RP とお金の両方で払えて、払ったあとの資金が下限（goalFloor）以上なら自動で取る。
 *   下限は「ひと月の固定費」（部長が施策を打つときに残すお金と同じ：給料・維持費・従業員。budget.ts の headReserve）× 帯で選んだ月数（GOAL.months）。
 *   ブランド力・エンブレム・帯（ランク）・部門の理解度・修行中（技）など、お金で買えない条件で止まるときは待つ（wait にその条件）。
 * - 取ったパネルは Flags.goalGot に積む（下の帯の経営企画のタブの数字・経営企画を開いたときの一覧）。目標に届いたら目標を外す（reached。ニュースに 1 行は main.ts）。
 * - 時間は止めない。Sim（scripts/island/sim.ts）は使わない（目標を置かないので何もしない）。
 * - セーブ：Flags の新しい項目は省略できる（無ければ目標なし）。セーブの版は上げない。
 */
import { GOAL, SKILL, isResearch, rpCost, type Skill } from './data';
import { headReserve } from './budget';
import { has, learn, lvOf, skillLock, trainingOf, type P1State } from './model';

/** 目標の帯で選べる下限の月数（既定は 1 か月） */
export const goalMonths = (s: Pick<P1State, 'flags'>) => (GOAL.months.includes(s.flags.goalMonths ?? 1) ? (s.flags.goalMonths ?? 1) : 1);
/** 自動で払ったあとに残す資金の下限：ひと月の固定費（給料・維持費・従業員）× 選んだ月数 */
export const goalFloor = (s: P1State) => Math.round(headReserve(s) * goalMonths(s));
/** そのパネルは目標にできるか（まだ取っていない・寄付や封印・準備中でない） */
export const goalable = (s: P1State, k: Skill | undefined) => !!k && !has(s, k.id) && !k.donate && !k.sealed && !k.soon && !trainingOf(s, k.id);
/** 比べるための値段（研究パネルは RP を G に直す） */
const priceKey = (k: Skill) => (isResearch(k) ? rpCost(k) * GOAL.rpG : k.cost);

/** 目標までの道（まだ取っていない前提と目標。取る順） */
export function goalPath(s: P1State, id: string): string[] {
  const need = new Set<string>();
  const visit = (x: string) => {
    const k = SKILL[x];
    if (!k || need.has(x) || has(s, x)) return;
    need.add(x);
    for (const r of k.requires ?? []) if (!has(s, r) || lvOf(s, r) < (k.reqLv?.[r] ?? 1)) visit(r);
    if (k.anyOf) {
      const got = k.anyOf.ids.filter((r) => has(s, r)).length;
      const more = k.anyOf.ids
        .filter((r) => !has(s, r))
        .sort((a, b) => (need.has(b) ? 1 : 0) - (need.has(a) ? 1 : 0) || priceKey(SKILL[a]) - priceKey(SKILL[b]))
        .slice(0, Math.max(0, k.anyOf.n - got));
      for (const r of more) visit(r);
    }
  };
  visit(id);
  // 道の中の深さ（道の中の前提をたどった最長の数）
  const depth = new Map<string, number>();
  const dep = (x: string): number => {
    if (depth.has(x)) return depth.get(x)!;
    depth.set(x, 0);
    const k = SKILL[x];
    const ps = [...(k.requires ?? []), ...(k.anyOf?.ids ?? [])].filter((r) => need.has(r));
    const d = ps.length ? 1 + Math.max(...ps.map(dep)) : 0;
    depth.set(x, d);
    return d;
  };
  return [...need].sort((a, b) => dep(a) - dep(b) || priceKey(SKILL[a]) - priceKey(SKILL[b]) || a.localeCompare(b));
}
/** 目標を置く（id が null なら外す）。置けないパネルは false */
export function setGoal(s: P1State, id: string | null): boolean {
  if (id == null) {
    delete s.flags.goal;
    return true;
  }
  if (!goalable(s, SKILL[id])) return false;
  s.flags.goal = id;
  return true;
}
/** 道の次のパネルが止まっている理由：money・rp（足りない・下限）／brand・emblem・ring・dept・busy（お金で買えない条件で待つ） */
export type GoalWait = { id: string; why: 'money' | 'rp' | 'floor' | 'brand' | 'emblem' | 'ring' | 'dept' | 'busy' | 'requires' };
export interface GoalStep {
  /** 今日、自動で取ったパネル */
  got: string[];
  /** 目標に届いた（目標は外した） */
  reached: string | null;
  /** 道の次のパネルが止まっている理由（無ければ null） */
  wait: GoalWait | null;
}
/** いまの道の次のパネルと、止まっている理由（払えるなら wait は null） */
export function goalNext(s: P1State): GoalWait | { id: string; why: null } | null {
  const g = s.flags.goal;
  if (!g) return null;
  const next = goalPath(s, g)[0];
  if (!next) return null;
  const k = SKILL[next];
  if (trainingOf(s, next) || (k.train && s.training)) return { id: next, why: 'busy' };
  const e = skillLock(s, k);
  if (e === 'money' || e === 'rp' || e === 'brand' || e === 'emblem' || e === 'ring' || e === 'dept' || e === 'requires') return { id: next, why: e };
  if (e) return { id: next, why: 'busy' };
  // お金のパネルは、払ったあとの資金が下限以上のときだけ
  if (!isResearch(k) && s.money - k.cost < goalFloor(s)) return { id: next, why: 'floor' };
  return { id: next, why: null };
}
/** 1 日（RP・お金が入ったあと）：払える限り、道の順に取る */
export function goalStep(s: P1State): GoalStep {
  const out: GoalStep = { got: [], reached: null, wait: null };
  for (let n = 0; n < 50 && s.flags.goal; n++) {
    const g = s.flags.goal;
    if (has(s, g) || !SKILL[g]) {
      out.reached = has(s, g) ? g : null;
      delete s.flags.goal;
      break;
    }
    const nx = goalNext(s);
    if (!nx) break;
    if (nx.why) {
      out.wait = nx as GoalWait;
      break;
    }
    if (learn(s, nx.id) != null) break;
    out.got.push(nx.id);
    s.flags.goalGot = [...(s.flags.goalGot ?? []), nx.id].slice(-GOAL.keep);
  }
  if (s.flags.goal && has(s, s.flags.goal)) {
    out.reached = s.flags.goal;
    delete s.flags.goal;
  }
  return out;
}
/** 経営企画を開いて一覧を見た：通知を消す */
export const goalSeen = (s: P1State) => {
  delete s.flags.goalGot;
};
