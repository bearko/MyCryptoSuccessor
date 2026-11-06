/**
 * 段 ST1・R2：研究ポイント（RP）の入り口（DOM なし。model.ts の月の締め・研究ノートとスキルツリーの画面・テストが使う）。数字は data.ts の R2 の 1 か所。
 *
 * ① 研究の施策（「出土品の整理」「文献調査」）：G を払って RP。どちらも月に 1 回ずつ。
 *    Rare の町を開いて R&D 部長がいれば、部長が月の締めで R&D の予算の中で行う（L0 の判定 heroStage に従う）。
 *    それより前（部長がいない）は、プレイヤーがスキルツリーか研究ノートから手で行う。
 * ② 追試：研究発表を済ませた町ごとに、月の締めで小さな RP（その町のランクの R2.retest）。
 * ③ 展示館：展示の価値 × R2.museum の RP を月の締めで（館が開いていれば）。
 * 入った RP は入り口ごとに数える（P1State.rpSrc → 月の報告の rpSrc。研究ノートの縦の積み上げ棒）。
 */
import { t } from '../../i18n';
import { R2, type Tier } from './data';
import { topTierOf } from './company';
import { deduct } from './acct';
import { headOf } from './deleg';
import { budgetOpen, deptBudget, restOf } from './budget';
import { heroStage } from './stage';
import { DAYS, digBranchOpen, digTierOf, gainRp, museumOpen, museumValue, spend, type P1State } from './model';

/** 比べるためだけ：R2 の入り口（追試・展示館・部長の研究の施策）を止める（scripts/island/sim.ts の withoutR2。前の main と同じ流れで比べるテスト） */
export const R2_OFF = { on: false };
export type StudyKind = 'sort' | 'lit';
export const STUDY_KINDS: StudyKind[] = ['sort', 'lit'];
export const studyName = (k: StudyKind) => (k === 'sort' ? t('出土品の整理', 'Sort the finds') : t('文献調査', 'Literature survey'));
/** RP の入り口（研究ノートの棒の色の順。下から） */
export type RpSrc = 'dig' | 'present' | 'study' | 'retest' | 'museum' | 'donate' | 'other';
export const RP_SRCS: RpSrc[] = ['dig', 'present', 'study', 'retest', 'museum', 'donate', 'other'];
export const rpSrcName = (k: RpSrc) =>
  ({ dig: t('発掘', 'Digging'), present: t('研究発表', 'Presentations'), study: t('整理・文献', 'Sorting & surveys'), retest: t('追試', 'Follow-up studies'), museum: t('展示館', 'Museum'), donate: t('寄付', 'Donations'), other: t('ほか', 'Other') })[k];

/** 研究の施策の倍率（会社が出店したことのある最高ランク） */
export const studyScale = (s: P1State) => R2.scale[topTierOf(s) as Tier] ?? 1;
export const studyCost = (s: P1State, k: StudyKind) => Math.round((R2.study[k].g * studyScale(s)) / 100) * 100;
export const studyRp = (s: P1State, k: StudyKind) => Math.round(R2.study[k].rp * studyScale(s));
/** いまの月（会社の月：ゲームの最初から 30 日ごと） */
const monthKey = (s: P1State) => Math.floor(s.day / DAYS);
/** 今月もう行ったか */
export const studyDone = (s: P1State, k: StudyKind) => s.r2?.m === monthKey(s) && !!s.r2.done.includes(k);
/** R&D 部長が研究の施策を任されているか（Rare の町を開いて・予算で任せる仕組みが開いていて・R&D に部長がいる） */
export const studyByHead = (s: P1State) => heroStage(s) === 'R' && budgetOpen(s) && !!headOf(s, 'rnd');
/** 手で行えない理由（null なら行える）：hidden 発掘と出会う前／head 部長に任せている／done 今月はもう行った／money 資金が足りない */
export type StudyLock = 'hidden' | 'head' | 'done' | 'money';
export function studyLock(s: P1State, k: StudyKind): StudyLock | null {
  if (!digBranchOpen(s)) return 'hidden';
  if (studyByHead(s)) return 'head';
  if (studyDone(s, k)) return 'done';
  if (s.money < studyCost(s, k)) return 'money';
  return null;
}
/** 行う（払って RP。研究開発として節税の対象）。by：'me'＝手で・'head'＝部長が予算で */
function doStudy(s: P1State, k: StudyKind): { cost: number; rp: number } {
  const cost = studyCost(s, k);
  s.money -= cost;
  spend(s, 'build', cost);
  deduct(s, 'rnd', cost);
  const before = s.rp ?? 0;
  gainRp(s, studyRp(s, k), 'study');
  const m = monthKey(s);
  s.r2 = s.r2?.m === m ? { m, done: [...s.r2.done, k] } : { m, done: [k] };
  return { cost, rp: (s.rp ?? 0) - before };
}
/** 手で行う（スキルツリー・研究ノートのボタン） */
export function runStudy(s: P1State, k: StudyKind): { cost: number; rp: number } | StudyLock {
  const e = studyLock(s, k);
  if (e) return e;
  return doStudy(s, k);
}
/** 研究発表を済ませた町の追試の RP（月） */
export const retestRp = (s: Pick<P1State, 'presented'>) => (s.presented ?? []).reduce((a, id) => a + (R2.retest[(digTierOf(id) ?? 'C') as Tier] ?? 0), 0);
/** 展示館の来館者からの RP（月）：展示の価値 × R2.museum */
export const museumRp = (s: P1State) => (museumOpen(s) ? Math.round(museumValue(s) * R2.museum) : 0);
/**
 * 月の締め（model.ts の endMonth。月の報告を作る前）：② 追試・③ 展示館の RP、① 部長がいれば研究の施策（R&D の予算の残りの中で、整理 → 文献の順）。
 * 入った RP と、部長の施策（名前）を返す
 */
export function r2Month(s: P1State): { retest: number; museum: number; study: StudyKind[] } {
  const out = { retest: 0, museum: 0, study: [] as StudyKind[] };
  if (R2_OFF.on) return out;
  const r = retestRp(s);
  if (r > 0) {
    const b = s.rp ?? 0;
    gainRp(s, r, 'retest');
    out.retest = (s.rp ?? 0) - b;
  }
  const m = museumRp(s);
  if (m > 0) {
    const b = s.rp ?? 0;
    gainRp(s, m, 'museum');
    out.museum = (s.rp ?? 0) - b;
  }
  if (studyByHead(s) && digBranchOpen(s)) {
    for (const k of STUDY_KINDS) {
      if (studyDone(s, k)) continue;
      const cost = studyCost(s, k);
      if (restOf(s, 'rnd') < cost || s.money < cost) continue;
      doStudy(s, k);
      deptBudget(s, 'rnd').used += cost;
      out.study.push(k);
    }
  }
  return out;
}
/** 入り口ごとに数える（gainRp・寄付・依頼・できごとから） */
export function noteRp(s: P1State, src: RpSrc, v: number) {
  if (!v) return;
  s.rpSrc = { ...(s.rpSrc ?? {}), [src]: (s.rpSrc?.[src] ?? 0) + v };
}
