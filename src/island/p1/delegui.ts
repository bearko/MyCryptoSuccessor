
import { stockMsg, stockPlan } from './moves';
import { t } from '../../i18n';
import { DELEG, DEPT, DUTY, deptAptName, type DeptId } from './data';
import {
  actName,
  approve,
  dutyLine,
  headDepts,
  heroNm,
  qText,
  quality,
  setHead,
  type PickRole,
  type Proposal,
  } from './deleg';
import { staffOf, type P1State } from './model';
import { after, type Ctx } from './screens';
import { sectorDef } from './company';
import { money } from './ui';
import { showCard } from './cardui';
import { openProposal } from './proposalui';
import { planOf } from './plan';
import { cardInbox } from './card';
import { lineOf } from './voice';
import { budgetLine } from './budget';
import { uxd } from '../uix/screens/d-slots';
/** 段 UI7a：引き出しの説明の文（役ごと）。部長は持ち場の仕事と兼ねる・リーダーは選ぶと持ち場の仕事から外れる */
export function pickNote(dept: DeptId, want: PickRole): string {
  const base = t(`数字は「出来」（手でやると 100%）。${DEPT[dept].name}に向く能力値（${deptAptName(dept)}）・Lv・${DEPT[dept].name}のパッシブで上がります。`, `Numbers are quality (by hand = 100%). It rises with ${deptAptName(dept)}, level and ${DEPT[dept].name} passives. `);
  return want.kind === 'head'
    ? base + t('持ち場の仕事（製造・調達・バイトなど）はそのまま、部長と兼ねられます。ほかの部長・セクター長とは兼ねられません。', 'Their current job (crafting, buying, part-time…) stays — a head can do both. They can’t also head another division or sector.')
    : base + t('持ち場の仕事の人を選ぶと、その仕事から外れて、リーダーに専念します。', 'Picking someone with a job moves them off it to lead full-time.');
}
/**
 * 任命の候補の引き出し：出来の高い順（向く能力値・Lv・パッシブで）。いまの担当・役目は札で。
 * 段 UI5b：組織図からも使う（読みの確かさ ★ を添える。onClear があれば「外す（自分に戻す）」）
 * 段 UI7a：want（部長／リーダー）で見分ける。灰色は、ほかの部長・リーダー・セクター長だけ（初めは隠す。チェックボックスで出す）。
 * 持ち場の仕事の人は灰色にしない。おすすめは出している中の選べる人から
 */
export function pickFor(ctx: Ctx, want: PickRole, title: string, current: number | null, onPick: (hero: number) => void, onClear?: () => void) {
  return uxd.pickFor!(ctx, want, title, current, onPick, onClear);
}

/** 段 UI6：初めて部長を任命するとき（候補を選ぶ前）のマインちゃんの一言。main.ts が first を結ぶ（一言のあとに go で候補を出す） */
export const headHooks: { first?: (go: () => void) => void } = {};
/**
 * 段 UI6：部長の候補を出す（部門の担当・組織図・部長との会話から）。まだ部長が 1 人もいなくて、初めて任命するときは、
 * 先にマインちゃんの一言（部長を選ぶと操作の仕方が大きく変わる）。onPick を省くと、その部門の部長にする
 */
export function pickHead(ctx: Ctx, dept: DeptId, current: number | null, onPick?: (hero: number) => void, onClear?: () => void) {
  const s = ctx.s();
  const d = DEPT[dept];
  const pick = onPick ?? ((hero: number) => done(ctx, setHead(s, dept, hero), t(`${heroNm(hero)}を${d.name}部長にしました！`, `${heroNm(hero)} now heads ${d.name}!`)));
  const go = () => pickFor(ctx, { kind: 'head', dept }, t(`${d.name}部長`, `${d.name} head`), current, pick, onClear);
  if (!s.flags.headPick && current == null && !headDepts(s).length && headHooks.first) {
    s.flags.headPick = true;
    ctx.save();
    headHooks.first(go);
    return;
  }
  go();
}

/** 部門の担当（部門の画面の上の帯の「担当」から）：事業部長・業務ごとのチームリーダー */
export function openDeleg(ctx: Ctx, dept: DeptId) {
  return uxd.deleg!(ctx, dept);
}
const ERR: Record<string, string> = {
  closed: t('この部門はまだ開いていません', 'This department is not open yet'),
  locked: t('理解度が足りません', 'Not enough understanding'),
  'no-staff': t('そのヒーローはいません', 'No such hero'),
  away: t('そのヒーローは、ほかのセクタのセクター長です', 'That hero heads another sector'),
  training: t('そのヒーローは修行中です', 'That hero is training'),
  busy: t('そのヒーローは、ほかの部長を務めています（役職の兼任はできません）', 'That hero already heads another division (no double posts)'),
};
export function done(ctx: Ctx, e: string | null, ok: string) {
  if (e) {
    ctx.sfx?.('error');
    ctx.toast(ERR[e] ?? e);
    return;
  }
  ctx.sfx?.('levelup');
  ctx.toast(ok);
  after(ctx);
}

/** 段 UIX3d：部長の提案の「提案書を見る」（今の画面と新しい画面で同じ処理。中身は今のまま切り出した） */
export function propSee(ctx: Ctx, s: P1State, p: Proposal) {
  const d = DEPT[p.dept];
  const c = cardInbox(s).find((x) => x.src === 'head' && x.pid === p.id);
  if (c) return showCard(ctx, c, { done: () => after(ctx) });
  const st = staffOf(s, p.hero);
  openProposal(ctx, planOf(s, [p.act], { hero: p.hero, q: st ? quality(st, p.dept) : DELEG.q.lo, dept: p.dept }), {
    src: 'head',
    role: t(`${d.name}部長`, `${d.name} head`),
    approve: () => {
      const name = actName(s, p.act);
      const act = p.act;
      const plan = act.k === 'stock' ? stockPlan(s, act) : null;
      const e = approve(s, p.id);
      if (e === 'money' || e === 'rp') return { ok: false, err: e, did: [] };
      if (e) return { ok: false, err: 'gone', did: [] };
      return { ok: true, did: [name, ...(plan && act.k === 'stock' ? [stockMsg(plan, act.key)] : [])] };
    },
    done: () => after(ctx),
  });
}

/** 部長の提案の受け箱（経営企画 → 部長の提案・月次報告の「担当の報告」から） */
export function openProps(ctx: Ctx) {
  return uxd.props!(ctx);
}
/** セクター長の 1 行ずつ（いまのセクタ以外。任せきり：部長たちの提案を自分で承認） */
export function sectorLines(s: P1State): string[] {
  const out: string[] = [];
  for (const id of s.land?.mine ?? []) {
    if (id === s.land?.cur) continue;
    const rec = s.land?.recs[id];
    if (!rec || rec.manager == null) continue;
    const st = s.staff.find((x) => x.hero === rec.manager && x.task === 'manager' && x.target === id);
    if (!st) continue;
    const last = rec.log[rec.log.length - 1];
    const hd = rec.heads;
    out.push(
      t(
        `${sectorDef(id).name}：セクター長 ${heroNm(st.hero)}${last ? `・先月の利益 ${money(last.profit)}` : ''}${hd ? `・部長の提案 ${hd.n} 件を自分で承認（投資 +${money(hd.invest)}）` : ''}`,
        `${sectorDef(id).name}: ${heroNm(st.hero)}${last ? `, last profit ${money(last.profit)}` : ''}${hd ? `, approved ${hd.n} proposals itself (+${money(hd.invest)} invested)` : ''}`,
      ),
    );
  }
  return out;
}

/** 人事の画面の「役目」の列：役目のあるヒーロー（リーダー・部長・セクター長の札） */
export function rolesCard(ctx: Ctx, s: P1State): HTMLElement | null {
  return uxd.roles!(ctx, s);
}

/** 月次報告の「担当の報告」の文（長い・短い）。無ければ null */
export function delegReportText(s: P1State, r: { deleg?: import('./deleg').DelegReport; cards?: import('./card').CardReport; budget?: import('./budget').BudgetReport }): [string, string] | null {
  const d = r.deleg;
  const sec = sectorLines(s).length;
  const cr = r.cards;
  if (!d && !sec && !cr && !r.budget) return null;
  const parts: string[] = [];
  const short: string[] = [];
  if (d?.duties.length) {
    const top = [...d.duties].sort((a, b) => b.acts - a.acts)[0];
    parts.push(t(`${DUTY[top.id].name}（${heroNm(top.hero)}・${qText(top.q)}）${dutyLine(top)}${d.duties.length > 1 ? `・ほか ${d.duties.length - 1} 業務` : ''}`, `${DUTY[top.id].name} (${heroNm(top.hero)}, ${qText(top.q)}) ${dutyLine(top)}${d.duties.length > 1 ? ` + ${d.duties.length - 1} more` : ''}`));
    short.push(t(`業務 ${d.duties.length}`, `${d.duties.length} tasks`));
  }
  if (d && (d.props || d.waiting)) {
    parts.push(t(`部長の提案 ${d.props} 件（待ち ${d.waiting}）`, `${d.props} proposals (${d.waiting} waiting)`));
    short.push(t(`提案 ${d.waiting}`, `${d.waiting} prop.`));
  }
  if (d?.results.length) {
    // 段 P2：いちばんうまくいった提案のヒーローのひとこと（史実の調査のあるヒーロー）
    const win = [...d.results].filter((x) => x.real > 0).sort((a, b) => b.real - a.real)[0];
    const yay = win ? lineOf(win.hero, 'success', r.deleg?.props ?? 0) : null;
    parts.push(t(`提案の結果 ${d.results.length} 件${yay ? `（${heroNm(win!.hero)}「${yay}」）` : ''}`, `${d.results.length} results`));
    short.push(t(`結果 ${d.results.length}`, `${d.results.length} res.`));
  }
  // 段 UI1：任せた提案（自分で実行して報告）・ヒーローからの提案のカード
  if (cr?.auto.length) {
    const x = cr.auto[0];
    parts.push(t(`🤝 任せた提案：${heroNm(x.hero)}が「${actName(s, x.act)}」を実行${cr.auto.length > 1 ? `ほか ${cr.auto.length - 1} 件` : ''}`, `🤝 Trusted: ${heroNm(x.hero)} did “${actName(s, x.act)}”${cr.auto.length > 1 ? ` + ${cr.auto.length - 1}` : ''}`));
    short.push(t(`任せた ${cr.auto.length}`, `${cr.auto.length} trusted`));
  }
  if (cr?.made) {
    parts.push(t(`提案のカード ${cr.made} 件（受け箱 ${cr.boxed}）`, `${cr.made} proposal cards (${cr.boxed} to inbox)`));
    short.push(t(`カード ${cr.made}`, `${cr.made} cards`));
  }
  // 段 I1：予算で任せた部門（施策・従業員・頼み）
  const bl = budgetLine(r as { budget?: import('./budget').BudgetReport });
  if (bl) {
    parts.push(bl[0]);
    short.push(bl[1]);
  }
  if (sec) {
    parts.push(t(`セクター長 ${sec} 町`, `${sec} sector heads`));
    short.push(t(`セクター長 ${sec}`, `${sec} sect.`));
  }
  if (!parts.length) return null;
  return [parts.join(t('／', ' / ')), short.join(t('・', ' · '))];
}
