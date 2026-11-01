/**
 * 総務（段 F。docs/ISLAND_PHASE1.md「総務」・docs/SUCCESSOR_ROADMAP.md 4-11）：疲れと職場の環境。
 * DOM なし。数字は data.ts の FATIGUE の 1 か所。テストは tests/island-p1-acct.test.ts。
 *
 * - 疲れは新しい数ではなく、いまのスタミナの見せ方（疲れ ＝ 1 − スタミナ ÷ HP）。働くと増え、休むと減る（いまどおり）。
 * - Uncommon の町に出店してから（総務の部門が開いてから）、疲れが FATIGUE.from を超えると働きの速さと士気の目標が下がる。
 *   士気は段 E2 の士気の目標の 1 項目「疲れ」として入る（別の数を作らない＝二重に数えない）。
 * - 職場の環境：総務のパネル（休憩室・シフト制・福利厚生・健康経営・社員食堂・仮眠室など）と工房の「職人の休憩所」。
 *   パネルの枚数は士気の目標の「職場の環境」（段 E2 の hr.ts の envPanels）、効き目はスタミナの減りと戻り（＝疲れ）。
 */
import { DEPT_SKILLS, FATIGUE, INVEST, SECTORS, type Skill } from './data';
import { ACCT_OFF } from './acct';
import { has, invLv, lvOf, myWorkshop, type P1State, type Staff } from './model';

/** 総務の疲れが効くか（Uncommon 以上の町に出店したことがある。段 F を止めているときは効かない） */
export function gaOn(s: Pick<P1State, 'tier' | 'land'>): boolean {
  if (ACCT_OFF.on) return false;
  if ((s.tier ?? 'C') !== 'C') return true;
  return (s.land?.mine ?? []).some((id) => (SECTORS.find((x) => x.id === id)?.tier ?? 'C') !== 'C');
}
/** 疲れ（0〜1）：1 − スタミナ ÷ HP */
export const fatigueOf = (st: Pick<Staff, 'stamina' | 'stats'>) => Math.max(0, Math.min(1, 1 - st.stamina / Math.max(1, st.stats.hp)));
/** 疲れの響き（0〜1）：from から to へ 0 → 1。ストレスチェックで半分 */
export function fatigueLoad(s: P1State, st: Pick<Staff, 'stamina' | 'stats'>): number {
  if (!gaOn(s)) return 0;
  const f = fatigueOf(st);
  const x = Math.max(0, Math.min(1, (f - FATIGUE.from) / (FATIGUE.to - FATIGUE.from)));
  return x * (has(s, 'ga_check') ? 1 - FATIGUE.check : 1);
}
/** 働きの速さの倍率（疲れていなければ ×1。model.ts の speed） */
export const fatigueMul = (s: P1State, st: Pick<Staff, 'stamina' | 'stats'>) => 1 - FATIGUE.work * fatigueLoad(s, st);
/** 士気の目標の「疲れ」の項目（0 か −。hr.ts の moraleParts） */
export const fatigueMorale = (s: P1State, st: Pick<Staff, 'stamina' | 'stats'>) => -FATIGUE.morale * fatigueLoad(s, st);
/** 疲れの帯（画面の札） */
export type FatigueBand = 'fresh' | 'ok' | 'tired' | 'worn';
export function fatigueBand(st: Pick<Staff, 'stamina' | 'stats'>): FatigueBand {
  const f = fatigueOf(st);
  if (f < 0.3) return 'fresh';
  if (f < FATIGUE.from) return 'ok';
  if (f < FATIGUE.to) return 'tired';
  return 'worn';
}
/** 疲れの平均（持ち場のある人。いなければ全員。0〜1） */
export function fatigueAvg(s: P1State): number {
  const xs = s.staff.filter((st) => st.task && st.task !== 'manager');
  const list = xs.length ? xs : s.staff;
  return list.length ? list.reduce((a, st) => a + fatigueOf(st), 0) / list.length : 0;
}

/** 職場の環境の 1 行：総務のパネル（取ったもの）と、工房の職人の休憩所 */
export interface EnvItem {
  id: string;
  name: string;
  note: string;
  kind: 'panel' | 'invest';
  lv: number;
  on: boolean;
}
export function envItems(s: P1State): EnvItem[] {
  const out: EnvItem[] = DEPT_SKILLS.general.map((k: Skill) => ({ id: k.id, name: k.name, note: k.note, kind: 'panel' as const, lv: lvOf(s, k.id), on: has(s, k.id) }));
  const ws = myWorkshop(s);
  const br = INVEST.breakroom;
  if (br) out.push({ id: '@breakroom', name: br.name, note: br.note, kind: 'invest', lv: ws ? invLv(ws, 'breakroom') : 0, on: !!ws && invLv(ws, 'breakroom') > 0 });
  return out;
}
