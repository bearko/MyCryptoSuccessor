/**
 * 部門（ロードマップ段 B：部門の土台）。DOM なし（main.ts・tree.ts とテストが使う）。
 * 11 部門の理解度・開く時期・下の帯のメニューの並び。docs/ISLAND_PHASE1.md「部門」・docs/SUCCESSOR_ROADMAP.md「部門の土台」。
 * 今回は器だけ：理解度の節目（チームリーダー・事業部長・奥義）は「準備中」として見せるだけで、効き目は無い。
 */
import { t } from '../../i18n';
import { DEPT, DEPTS, DEPT_GROUPS, DEPT_MARKS, DEPT_SKILLS, ROAD_NOW, deptMarkNote, isResearch, type DeptGroup, type DeptId, type RoadStage, type Tier } from './data';
import { lvOf, tiersEntered, type P1State } from './model';

const TIER_ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
const TIER_NAME: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
const STAGES: RoadStage[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/**
 * 部門の理解度：その部門で取ったパネルの Lv の合計（研究パネルは取ったら 1、お金パネルは Lv の数、無限の強化パネルは Lv）。
 * 研究への寄付は開放するパネルではないので数えない
 */
export function deptLevel(s: Pick<P1State, 'skills' | 'skillLv'>, d: DeptId): number {
  let n = 0;
  for (const k of DEPT_SKILLS[d]) {
    if (k.donate) continue;
    const lv = lvOf(s, k.id);
    n += lv > 0 && isResearch(k) && !k.inf ? 1 : lv;
  }
  return n;
}

/** 部門が開くランクに達した（そのランク以上のセクタに出店したことがある） */
export function deptOpen(s: P1State, d: DeptId): boolean {
  const top = Math.max(...tiersEntered(s).map((x) => TIER_ORDER.indexOf(x)));
  return TIER_ORDER.indexOf(DEPT[d].opens) <= top;
}
/** 部門の中身（遊び）ができている（中身ができる段が、いまの段まで） */
export const deptReady = (d: DeptId, now: RoadStage = ROAD_NOW) => STAGES.indexOf(DEPT[d].stage) <= STAGES.indexOf(now);
/** 下の帯のメニューに出す部門（開くランクに達し、かつ中身ができた）。並びは DEPTS の順 */
export function menuDepts(s: P1State, now: RoadStage = ROAD_NOW): DeptId[] {
  return DEPTS.filter((d) => deptReady(d.id, now) && deptOpen(s, d.id)).map((d) => d.id);
}
/** 鍵の札の文（「Uncommon で開く・準備中」） */
export function deptLockText(d: DeptId): string {
  const tier = TIER_NAME[DEPT[d].opens];
  return deptReady(d) ? t(`${tier} で開く`, `Opens at ${tier}`) : t(`${tier} で開く・準備中`, `Opens at ${tier} · coming soon`);
}

/** 次の節目（無ければ null）。left：あと何 */
export function nextMark(lv: number): { at: number; name: string; left: number; k: number } | null {
  const k = DEPT_MARKS.findIndex((m) => m.at > lv);
  return k < 0 ? null : { ...DEPT_MARKS[k], left: DEPT_MARKS[k].at - lv, k };
}
/** 届いた節目の数 */
export const marksReached = (lv: number) => DEPT_MARKS.filter((m) => m.at <= lv).length;

/**
 * 部門のお知らせ（トースト。1 回だけ）：新しく開いた部門・理解度の節目に届いた部門。
 * s.flags.depts（お知らせ済みの開いた部門）・s.flags.deptMarks（お知らせ済みの節目の数）を進める。返り値はトーストの文
 */
export function deptNews(s: P1State, now: RoadStage = ROAD_NOW): string[] {
  // 古いセーブ（版 10 まで）・新しいゲーム：はじめはお知らせ済みにするだけ（まとめて出さない）
  if (!s.flags.depts || !s.flags.deptMarks) {
    deptQuiet(s, now);
    return [];
  }
  const out: string[] = [];
  const seen = s.flags.depts;
  for (const d of menuDepts(s, now))
    if (!seen.includes(d)) {
      seen.push(d);
      out.push(t(`新しい部門：${DEPT[d].name}！ 下のメニューに加わりました`, `New department: ${DEPT[d].name}! It joins the menu below`));
    }
  const marks = s.flags.deptMarks;
  for (const d of DEPTS) {
    const lv = deptLevel(s, d.id);
    const n = marksReached(lv);
    const had = marks[d.id] ?? 0;
    if (n > had) {
      marks[d.id] = n;
      const m = DEPT_MARKS[n - 1];
      out.push(t(`${d.name}の理解度が ${m.at} に！ ${m.name}（${deptMarkNote(n - 1)}）は、次の更新で`, `${d.name} understanding reached ${m.at}! ${m.name} (${deptMarkNote(n - 1)}) arrives in a future update`));
    }
  }
  return out;
}
/** 古いセーブ・新しいゲーム：いま開いている部門と届いている節目は、お知らせ済みに（まとめて出さない） */
export function deptQuiet(s: P1State, now: RoadStage = ROAD_NOW) {
  s.flags.depts = menuDepts(s, now);
  s.flags.deptMarks = Object.fromEntries(DEPTS.map((d) => [d.id, marksReached(deptLevel(s, d.id))]));
}

/**
 * 下の帯の並び。6 つまで：左に 3 つ・真ん中に経営企画（大きいボタン。スキルツリー）・右に残り。
 * 7 つ以上：グループ（事業・戦略・管理・基盤）の引き出しにまとめ、経営企画は真ん中のまま
 */
export type MenuLayout = { kind: 'flat'; left: DeptId[]; center: DeptId | null; right: DeptId[] } | { kind: 'groups'; center: DeptId | null; groups: { id: DeptGroup; name: string; icon: string; depts: DeptId[] }[] };
/** 下の帯の左に置く部門（ほかは右） */
const LEFT: DeptId[] = ['logistics', 'hr', 'rnd'];
export function menuLayout(ids: DeptId[]): MenuLayout {
  const center = ids.includes('strategy') ? 'strategy' : null;
  const rest = ids.filter((d) => d !== center);
  if (ids.length <= 6) {
    const order = [...LEFT, ...DEPTS.map((d) => d.id).filter((d) => !LEFT.includes(d))].filter((d) => rest.includes(d));
    const nl = Math.ceil(order.length / 2);
    return { kind: 'flat', left: order.slice(0, nl), center, right: order.slice(nl) };
  }
  return {
    kind: 'groups',
    center,
    groups: DEPT_GROUPS.map((g) => ({ ...g, depts: rest.filter((d) => DEPT[d].group === g.id) })).filter((g) => g.depts.length),
  };
}
