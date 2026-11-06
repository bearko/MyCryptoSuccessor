/**
 * 部門（ロードマップ段 B：部門の土台）。DOM なし（main.ts・tree.ts とテストが使う）。
 * 11 部門の理解度・開く時期・下の帯のメニューの並び。docs/ISLAND_PHASE1.md「部門」・docs/SUCCESSOR_ROADMAP.md「部門の土台」。
 * 理解度の節目：チームリーダー（3）・事業部長（8）は段 D で置けるようになった（deleg.ts）。奥義（15・25・40）は「準備中」として見せるだけ。
 * 法務の理解度は、パネルに加えて契約・特許・M&A・裁判の経験（s.legal.xp）でも上がる（段 H2）。
 */
import { t } from '../../i18n';
import { DELEG, L0, DEPT, DEPTS, DEPT_GROUPS, DEPT_MARKS, DEPT_SKILLS, ROAD_NOW, deptMarkNote, isResearch, type DeptGroup, type DeptId, type RoadStage, type Tier } from './data';
import { lvOf, tiersEntered, type P1State } from './model';
import { headsOpen, heroStage, leadersOpen, stageName } from './stage';

const TIER_ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
const TIER_NAME: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
const STAGES: RoadStage[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/**
 * 部門の理解度：その部門で取ったパネルの Lv の合計（研究パネルは取ったら 1、お金パネルは Lv の数、無限の強化パネルは Lv）。
 * 研究への寄付は開放するパネルではないので数えない
 */
export function deptLevel(s: Pick<P1State, 'skills' | 'skillLv'> & Partial<Pick<P1State, 'legal'>>, d: DeptId): number {
  let n = 0;
  for (const k of DEPT_SKILLS[d]) {
    if (k.donate) continue;
    const lv = lvOf(s, k.id);
    n += lv > 0 && isResearch(k) && !k.inf ? 1 : lv;
  }
  // 段 H2：法務は、契約・特許・M&A・裁判の経験でも上がる（LEGAL.xp.max まで。legal.ts）
  if (d === 'legal') n += s.legal?.xp ?? 0;
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
      // チームリーダー（3）・事業部長（8）は段 D で置けるようになった。奥義は後の段（準備中）。
      // 段 L0：リーダーは Uncommon・部長は Rare の町を開くまでは置けない（そのときは「○○ の町を開くと置ける」）
      const lock = n - 1 === 0 && !leadersOpen(s) ? L0.leaderFrom : n - 1 === 1 && !headsOpen(s) ? L0.headFrom : null;
      out.push(
        lock
          ? t(`${d.name}の理解度が ${m.at} に！ ${m.name}は ${stageName(lock)} の町を開くと置ける（それまでは自分で回そう）`, `${d.name} understanding reached ${m.at}! ${m.name}s open with a ${stageName(lock)} town (run it yourself until then)`)
          : n - 1 < 2
          ? t(`${d.name}の理解度が ${m.at} に！ ${m.name}を置けるようになった！（${deptMarkNote(n - 1)}。部門の画面の上の「担当」から）`, `${d.name} understanding reached ${m.at}! You can now place a ${m.name} (${deptMarkNote(n - 1)} — “Lead” on the department’s band)`)
          : t(`${d.name}の理解度が ${m.at} に！ ${m.name}（${deptMarkNote(n - 1)}）は準備中`, `${d.name} understanding reached ${m.at}! ${m.name} (${deptMarkNote(n - 1)}) is coming soon`),
      );
    }
  }
  // 段 L0：ランクの町を開いて、リーダー・部長を置けるようになった（理解度が届いている部門があるときだけ。1 回だけ）
  const st = heroStage(s);
  const was = s.flags.l0Stage ?? 'C';
  if (st !== was) {
    s.flags.l0Stage = st;
    const lv = (at: number) => DEPTS.some((d) => d.id !== 'strategy' && menuDepts(s, now).includes(d.id) && deptLevel(s, d.id) >= at);
    if (st === 'R' && was !== 'R') out.push(t('Rare の町！ 事業部長を置けるようになり、ヒーローからの提案も届くようになった（組織図から）', 'A Rare town! You can now place division heads, and heroes start bringing proposals (from the org chart)'));
    else if (st === 'U' && was === 'C' && lv(DELEG.leaderAt)) out.push(t(`Uncommon の町！ 理解度 ${DELEG.leaderAt} の部門にチームリーダーを置けるようになった（部門の画面の上の「担当」から）`, `An Uncommon town! Departments at understanding ${DELEG.leaderAt} can now take team leaders (“Lead” on the department’s band)`));
  }
  return out;
}
/** 古いセーブ・新しいゲーム：いま開いている部門と届いている節目は、お知らせ済みに（まとめて出さない） */
export function deptQuiet(s: P1State, now: RoadStage = ROAD_NOW) {
  s.flags.depts = menuDepts(s, now);
  s.flags.deptMarks = Object.fromEntries(DEPTS.map((d) => [d.id, marksReached(deptLevel(s, d.id))]));
  s.flags.l0Stage = heroStage(s);
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
