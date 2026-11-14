/**
 * 段 UIX5t：部長との対話の新しい画面（src/island/uix/screens/t-talk.ts）へ渡す、本体の関数の束と、画面に出す中身（DOM なしの形）。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、本番のビルドで本体の束の分かれ方が変わり、
 * 切のときの読み込みが今と変わる）。ここは本体の側（p1/main.ts と同じ束）。CSS を持つモジュール（headtalkui.ts ほか）は読まない：
 * 会話の状態と、押した先の関数（話題を変える・承認・却下・あとで・提案書・詳しい画面）は、headtalkui.ts が描くときに渡す（HtCall）。
 * 中身の決め方（並び・推奨・候補・気にかけたい人）は、今の画面（headtalkui.ts の summaryData ほか）と同じ計算。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { DEPT, DEPT_DUTIES, DUTY, TASKS, aptitude, type DeptId, type HeroRarity, type Task } from './data';
import { actName, headFx, headOf, heroNm, pickList, propEst, propWhy, qText, quality } from './deleg';
import { choiceText, inTutorial, planOfChoice, quipOfCard, roleOfCard, sayOf, shownRec, starOf, type Card } from './card';
import { charismaLine, moraleAvg, payroll, wantsToQuit } from './hr';
import { hrReportText } from './hrui';
import { orgChart } from './org';
import { heroStats, staffOf, wageOf, type P1State, type Staff } from './model';
import { heroRarityOf } from './hero';
import { GRADE_COLOR, bestFits, fitLine, fitName, gradeOf, whyOf, type FitKey } from './voice';
import { heroIcon, money } from './ui';
import type { CheckItem } from './headtalk';
import type { Plan } from './plan';

/** 史実の適性の札（今の gradeChip・fitTag と同じ中身：名前・段・色・根拠） */
export interface HtGrade {
  name: string;
  g: string;
  color: string;
  why: string;
}
const grade = (hero: number, k: FitKey): HtGrade | null => {
  const g = gradeOf(hero, k);
  return g ? { name: fitName(k), g, color: GRADE_COLOR[g], why: whyOf(hero, k).replace(/。$/, '') } : null;
};
const duties = (dept: DeptId) => DEPT_DUTIES[dept].map((u) => ({ icon: DUTY[u].icon, name: DUTY[u].name, note: DUTY[u].note }));
/** 待機中（仕事も役目も無い）の人 */
const idleOf = (s: P1State) => s.staff.filter((x) => x.task == null && !x.heads?.length);

/** 話す人（部長）：顔・★・Lv・史実の適性（今の会話の箱の名前の下の一行と同じ中身） */
export function htWho(s: P1State, dept: DeptId) {
  const H = headOf(s, dept);
  if (!H) return null;
  const st = staffOf(s, H.hero);
  const q = st ? quality(st, dept) : 0.7;
  return { hero: H.hero, name: heroNm(H.hero), star: starOf(q, st?.level ?? 1), level: st?.level ?? 1, grade: grade(H.hero, dept) };
}

/** はじめ：その部門の数字と先月の報告・部長がしていること（部長がいるとき）／部長の候補（いないとき） */
export function htSummary(s: P1State, dept: DeptId, mode: 'head' | 'mine') {
  const last = [...s.reports].reverse().find((r) => r.hr);
  const rep = last ? hrReportText(last) : null;
  return {
    heroes: s.staff.length,
    idle: idleOf(s).length,
    avg: moraleAvg(s) ?? null,
    quit: wantsToQuit(s).length,
    pay: payroll(s),
    cands: s.hirePool.length,
    charisma: charismaLine(s),
    last: rep ? { month: last!.month, text: rep[0] } : null,
    duties: mode === 'head' ? duties(dept) : null,
    // 段 UI7a：ほかの部長・リーダー・セクター長は候補に出さない（任命の引き出しと同じ）
    heads:
      mode === 'mine'
        ? pickList(s, { kind: 'head', dept }, headOf(s, dept)?.hero ?? null, false)
            .slice(0, 3)
            .map(({ st, q }) => ({ hero: st.hero, name: heroNm(st.hero), star: starOf(q, st.level ?? 1), q, qText: qText(q), grade: grade(st.hero, dept) }))
        : null,
  };
}

/** 採用の状況：雇う提案（あれば。推奨の手 k）・候補の一覧・カリスマ */
export function htHire(s: P1State, card: Card | null, k: number) {
  const ch = card && k >= 0 ? card.choices[k] : null;
  const x = card && ch ? choiceText(s, card, ch) : null;
  return {
    offer: card && x ? { card, k, icon: x.icon, label: x.label, sub: x.sub, plan: planOfChoice(s, card, k) } : null,
    pool: s.hirePool.map((id) => {
      const st = heroStats(id);
      const best = TASKS.reduce((a, b) => (aptitude(st, b.key) > aptitude(st, a.key) ? b : a), TASKS[0]);
      const bf = bestFits(id)[0];
      return { hero: id, name: heroNm(id), rarity: heroRarityOf(id) as HeroRarity, best: { key: best.key as Task, name: best.name, apt: aptitude(st, best.key) }, grade: bf ? grade(id, bf) : null, wage: wageOf(id) };
    }),
    charisma: charismaLine(s),
  };
}

/** 組織のこと：部門ごとの部長・リーダー・持ち場、気にかけたい人（辞めたい → 待機中 → 士気の低い順に 5 人まで） */
export function htOrg(s: P1State) {
  const o = orgChart(s);
  const depts = o.depts.map((d) => {
    const D = DEPT[d.dept];
    const head = d.byCeo ? t('社長（あなた）', 'You (president)') : d.head.hero != null ? heroNm(d.head.hero) : d.head.open ? t('あなた（置ける）', 'You (can appoint)') : t(`あなた・🔒 ${d.head.lock?.at ?? ''}`, `You · 🔒 ${d.head.lock?.at ?? ''}`);
    const leads = d.leaders.filter((x) => x.hero != null).length;
    return { dept: d.dept, name: D.name, icon: D.icon, color: D.color, head, has: d.head.hero != null, lock: !d.byCeo && d.head.hero == null && !d.head.open, leaders: d.leaders.length ? { n: leads, of: d.leaders.length } : null, posts: d.posts.length };
  });
  const quit = wantsToQuit(s);
  const idle = idleOf(s);
  const low = [...s.staff].sort((a, b) => (a.morale ?? 70) - (b.morale ?? 70)).slice(0, 3);
  const people = [...quit, ...idle, ...low]
    .filter((x, k, a) => a.indexOf(x) === k)
    .slice(0, 5)
    .map((st: Staff) => ({ st, hero: st.hero, name: heroNm(st.hero), quit: st.quit != null, idle: st.quit == null && st.task == null && !st.heads?.length }));
  return { depts, people };
}

/** 任せ方：部長の出来・適性・回している業務・部門の効き目の補正 */
export function htDeleg(s: P1State, dept: DeptId, hero: number) {
  const st = staffOf(s, hero);
  const q = st ? quality(st, dept) : 0.7;
  return { hero, name: heroNm(hero), star: starOf(q, st?.level ?? 1), q, qText: qText(q), level: st?.level ?? 1, fitLine: fitLine(hero, dept) || null, fx: headFx(s, dept), duties: duties(dept) };
}

/** 確認事項 1 件：部長の提案（理由・見込み・費用）／カード（話し手・セリフ・選択肢の見込みと提案書） */
export function htItem(s: P1State, item: CheckItem) {
  if (item.k === 'prop') {
    const p = item.p;
    return { k: 'prop' as const, p, hero: p.hero, title: actName(s, p.act), why: propWhy(s, p), est: propEst(p), cost: p.cost, rp: p.rp ?? 0, money: s.money, haveRp: s.rp ?? 0 };
  }
  const c = item.c;
  const rk = shownRec(s, c);
  return {
    k: 'card' as const,
    c,
    role: roleOfCard(s, c),
    hero: c.hero,
    name: c.hero != null ? heroNm(c.hero) : t('マインちゃん', 'Mine-chan'),
    quip: quipOfCard(c),
    say: sayOf(s, c),
    choices: c.choices.map((ch, k) => {
      const x = choiceText(s, c, ch);
      const plan: Plan | null = ch.act.k === 'do' || ch.act.k === 'approve' ? planOfChoice(s, c, k) : null;
      // 段 UI9b：「推奨」の札はチュートリアルのあいだだけ
      return { k, icon: x.icon, label: x.label, sub: x.sub, rec: k === rk, recTag: k === rk && inTutorial(s), plan };
    }),
  };
}

export const uxtDeps = {
  DEPT,
  assetUrl,
  heroIcon,
  money,
  htWho,
  htSummary,
  htHire,
  htOrg,
  htDeleg,
  htItem,
};
export type UxtDeps = typeof uxtDeps;
