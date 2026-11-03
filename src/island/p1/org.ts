/**
 * 組織図（段 UI5b。DOM なし：orgui.ts とテストが使う）。いまある役目を木の形にまとめる：
 * - 社長（プレイヤー。経営企画部は社長が持つ）
 * - 本社の事業部長（開いている部門ごと）とその下のチームリーダー（業務ごと）・持ち場（その部門の仕事をしているヒーロー）
 * - セクター長（出店したセクタごと：町の名前・ヒーロー・従業員の数）
 * 人のいない席は「あなた（自分）」が回している（初めはどの席もあなた）：置ける（open）か「🔒 理解度 N で置ける」。段 I（予算・従業員・経営会議）で数字を足す前提の形。
 * 部長は町の持ち場の仕事と兼ねてよい（持ち場にも出る）。役職（事業部長・セクター長）は兼任しない（model.ts の canHoldRole）。
 * 役目の仕組みは deleg.ts（リーダー・部長・セクター長）のまま。数字は変えない。
 */
import { DELEG, DEPTS, DEPT_DUTIES, type DeptId, type DutyId, type Task } from './data';
import { deptLevel, menuDepts } from './dept';
import { headOf, leaderOf, quality } from './deleg';
import { starOf } from './card';
import { staffOf, type P1State, type Staff } from './model';

/** 席：役目と座っているヒーロー。hero が null なら空席（open：いま置ける・lockAt：置けるようになる理解度） */
export interface Seat {
  kind: 'ceo' | 'head' | 'leader' | 'post' | 'sector';
  dept?: DeptId;
  duty?: DutyId;
  sector?: string;
  hero: number | null;
  /** 空席で、いま置ける */
  open: boolean;
  /** 空席で、まだ置けない：この理解度で置ける（いまの理解度 now） */
  lock?: { at: number; now: number };
  /** 読みの確かさ（★1〜3。その部門の出来と Lv） */
  star?: 1 | 2 | 3;
  morale?: number;
  /** 持ち場の仕事（post） */
  task?: Task;
}
export interface OrgDept {
  dept: DeptId;
  /** 経営企画部はプレイヤー（社長）が持つ */
  byCeo: boolean;
  head: Seat;
  leaders: Seat[];
  posts: Seat[];
}
export interface OrgSector {
  sector: string;
  /** いま経営しているセクタ（セクター長はプレイヤー） */
  here: boolean;
  head: Seat;
  /** 従業員の数（ヒーローの持ち場＋アルバイト）。分からなければ null */
  people: number | null;
}
export interface OrgChart {
  ceo: Seat;
  depts: OrgDept[];
  sectors: OrgSector[];
  /** 待機中（仕事も役目も無い）のヒーロー */
  idle: number[];
}

/** 持ち場の仕事 → 部門（チームリーダー・部長の下に並べる） */
export const TASK_DEPT: Partial<Record<Task, DeptId>> = { buy: 'logistics', craft: 'logistics', transport: 'logistics', shop: 'logistics', explore: 'logistics', train: 'logistics', intel: 'marketing', dig: 'rnd', side: 'hr' };

const seatOf = (st: Staff | null, kind: Seat['kind'], d: DeptId | undefined, extra: Partial<Seat> = {}): Seat => {
  if (!st) return { kind, dept: d, hero: null, open: false, ...extra };
  const q = d ? quality(st, d) : DELEG.q.lo;
  return { kind, dept: d, hero: st.hero, open: false, star: starOf(q, st.level ?? 1), morale: Math.round(st.morale ?? 70), ...extra };
};

/** 組織図をつくる（いまの状態から） */
export function orgChart(s: P1State): OrgChart {
  const open = menuDepts(s);
  const depts: OrgDept[] = [];
  for (const d of DEPTS) {
    if (!open.includes(d.id)) continue;
    const lv = deptLevel(s, d.id);
    const byCeo = d.id === 'strategy';
    const H = byCeo ? null : headOf(s, d.id);
    const head: Seat = byCeo ? { kind: 'head', dept: d.id, hero: null, open: false } : H ? seatOf(H, 'head', d.id) : { kind: 'head', dept: d.id, hero: null, open: lv >= DELEG.headAt, ...(lv < DELEG.headAt ? { lock: { at: DELEG.headAt, now: lv } } : {}) };
    const leaders: Seat[] = DEPT_DUTIES[d.id].map((u) => {
      const L = leaderOf(s, u);
      if (L) return seatOf(L, 'leader', d.id, { duty: u });
      return { kind: 'leader', dept: d.id, duty: u, hero: null, open: lv >= DELEG.leaderAt, ...(lv < DELEG.leaderAt ? { lock: { at: DELEG.leaderAt, now: lv } } : {}) };
    });
    const posts: Seat[] = s.staff.filter((x) => x.task && TASK_DEPT[x.task] === d.id).map((x) => seatOf(x, 'post', d.id, { task: x.task! }));
    depts.push({ dept: d.id, byCeo, head, leaders, posts });
  }
  // セクター長：出店したセクタ（無ければ、いまのセクタだけ）
  const ids = s.land?.mine?.length ? s.land.mine : [s.sector ?? 'c1'];
  const cur = s.land?.cur ?? s.sector ?? 'c1';
  const sectors: OrgSector[] = ids.map((id) => {
    if (id === cur) {
      const heroes = s.staff.filter((x) => x.task && x.task !== 'manager' && x.task !== 'lead').length;
      const part = Object.values(s.shops ?? {}).reduce((a, sh) => a + (sh?.part ?? 0), 0);
      return { sector: id, here: true, head: { kind: 'sector', sector: id, hero: null, open: false }, people: heroes + part };
    }
    const rec = s.land?.recs[id];
    const st = rec?.manager != null ? staffOf(s, rec.manager) : null;
    const mgr = st && st.task === 'manager' && st.target === id ? st : null;
    const snapShops = (rec?.snap as { shops?: Record<string, { part?: number }> } | undefined)?.shops;
    const part = snapShops ? Object.values(snapShops).reduce((a, sh) => a + (sh?.part ?? 0), 0) : 0;
    const people = rec ? (mgr ? 1 : 0) + part : null;
    return { sector: id, here: false, head: mgr ? seatOf(mgr, 'sector', 'strategy', { sector: id }) : { kind: 'sector', sector: id, hero: null, open: true }, people };
  });
  const idle = s.staff.filter((x) => x.task == null && !x.heads?.length).map((x) => x.hero);
  return { ceo: { kind: 'ceo', dept: 'strategy', hero: null, open: false }, depts, sectors, idle };
}

/** 数（テスト・見出し用）：埋まっている席・置ける空席・まだ置けない席 */
export function orgCounts(o: OrgChart): { filled: number; open: number; locked: number } {
  const seats = [...o.depts.flatMap((d) => (d.byCeo ? d.leaders : [d.head, ...d.leaders])), ...o.sectors.filter((x) => !x.here).map((x) => x.head)];
  return { filled: seats.filter((x) => x.hero != null).length, open: seats.filter((x) => x.hero == null && x.open).length, locked: seats.filter((x) => x.hero == null && !x.open).length };
}
