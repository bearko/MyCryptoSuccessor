/**
 * 段 UIX3d：決める場面（提案のカード・提案書・経営会議・方針・部長との対話・任せる）の新しい画面（src/island/uix/screens/）へ渡す、本体の関数の束。
 * p1/uxs.ts と同じ決まり：新しい画面の束は本体のモジュールを自分では読まない（読むと、本番のビルドで本体の束の分かれ方が変わり、
 * 切のときの読み込みが今と変わる）。本体の側（このファイル。p1/main.ts と同じ束）から、使う関数と、画面に出す中身（DOM なしの形）を渡す。
 * 中身の決め方（並び・推奨・押せない理由）は、今の画面（cardui.ts ほか）と同じ計算。
 */
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { aptitude, type DeptId, type Task } from './data';
import {
  PROPOSAL_SRC,
  canTrust,
  cardInbox,
  cardStar,
  choiceShort,
  choiceText,
  eventHead,
  goneLine,
  goneNow,
  inTutorial,
  moveLine,
  popLeft,
  quipOfCard,
  roleOfCard,
  sayOf,
  shownRec,
  speechOf,
  trustCard,
  trustName,
  trustText,
  untrust,
  withdrawStale,
  type Card,
  type ChooseRes,
  type Speech,
} from './card';
import { cardChoose, cardNav, showCard, type CardHooks } from './cardui';
import { storeBlock } from './proposalui';
import { rankOf } from './heroui';
import { poolCap, staffOf, type P1State } from './model';
import { traitOf } from './persona';
import { landDef, relOf, relTeaser } from './diplo';
import { after, type Ctx } from './screens';
import { afterOf, planOf } from './plan';
import { useUpOf } from './proj';
import { DUO_BY_ID } from './duo';
import { ISSUE_ICON, issueLv, issueName, issueTag, issuesOf, lvWord, type IssueKey } from './issues';
import { DEPT } from './data';
import { heroIcon, heroName, money, rich } from './ui';

/** 小さい一行の適性（話し手の持ち場の仕事）：今の画面と同じ */
const TASK_OF: Partial<Record<Card['src'], Task>> = { clerk: 'shop', crafter: 'craft', buyer: 'buy', cs: 'shop' };
const TASK_NM: Partial<Record<Task, () => string>> = { shop: () => t('販売', 'Selling'), craft: () => t('製造', 'Crafting'), buy: () => t('調達', 'Buying') };

// ---------------------------------------------------------------- 提案のカード
/** 選択肢 1 つ（今のカードのボタン 1 つと同じ中身） */
export interface CardChoiceView {
  /** もとの番号（選ぶときはこの番号で） */
  k: number;
  rec: boolean;
  /** 絵文字の印（新しい画面ではドットの絵に替える） */
  icon: string;
  label: string;
  sub: string;
  /** 部長の手の行（部門・種類：手の名前） */
  move: { dept: DeptId; text: string } | null;
  /** 提案書へ進む */
  goProp: boolean;
  /** 「保留」を目立たせない（部長の提案のあとで） */
  later: boolean;
  /** 払えない理由（資金・研究ポイント） */
  why: string;
  shortG: number;
  shortRp: number;
  act: string;
  cost: number;
  rp: number;
  monthly: number;
  /** 効き目（月の利益・個／月・宣伝の期間の利益）。無ければ null */
  gain: { v: number; unit: 'G' | 'ad' | 'units' } | null;
}
export interface CardView {
  id: number;
  src: Card['src'];
  /** 肩書きの色・絵文字の印・字 */
  color: string;
  roleIcon: string;
  roleText: string;
  name: string;
  /** 名前の下の一行（Lv・適性・性格／できごとの札） */
  tag: string | null;
  hero: number | null;
  crest: { icon: string; color: string } | null;
  mine: string | null;
  quip: string | null;
  speech: Speech | null;
  say: string;
  /** この提案が解く課題（札と、放置したときの 1 行・あと何日） */
  iss: { key: IssueKey; icon: string; tag: string; loss: string; days: number | null; lv: string } | null;
  store: HTMLElement | null;
  duoNote: string | null;
  choices: CardChoiceView[];
  two: boolean;
  tut: boolean;
  /** 任せる：2 択のカードは「今後の判断を委任」のスイッチ、ほかは「任せる」の選択肢 */
  trust: null | { mode: 'switch' | 'row'; who: string; label: string; sub: string };
  /** 下の一行（左：読みの確かさ・関係・士気）と、星の数・誤差 */
  footNote: string;
  star: number;
  err: number;
  /** 下の一行（右：あと N 件・受け箱 N 件） */
  left: string;
}
/** 今のカードの中身（cardui.ts の panel と同じ計算）を、DOM なしの形で */
export function cardView(s: P1State, c: Card): CardView {
  const role = roleOfCard(s, c);
  const eh = eventHead(s, c);
  const st = c.hero != null ? staffOf(s, c.hero) : null;
  let tag: string | null = null;
  if (eh) tag = c.hero != null && (c.src === 'event' || c.src === 'duo') ? eh.title : eh.tag;
  else if (st && c.hero != null) {
    const bits = [`Lv ${st.level ?? 1}`];
    const task = TASK_OF[c.src];
    if (task) bits.push(t(`${TASK_NM[task]?.() ?? ''}の適性 ${rankOf(aptitude(st.stats, task))}`, `${TASK_NM[task]?.() ?? ''} ${rankOf(aptitude(st.stats, task))}`));
    bits.push(t(`「${traitOf(c.hero)}」`, `“${traitOf(c.hero)}”`));
    tag = bits.join(t(' ・ ', ' · '));
  }
  const crest = c.src === 'diplo' && c.dip ? { icon: landDef(c.dip.land).icon, color: landDef(c.dip.land).color } : null;
  const sp = speechOf(s, c);
  // 課題の札（今の 🎯 の行と同じ中身）
  let iss: CardView['iss'] = null;
  if (c.iss) {
    const x = c.issues?.find((y) => y.key === c.iss!.key);
    iss = { key: c.iss.key, icon: ISSUE_ICON[c.iss.key], tag: issueTag(c.iss), loss: x?.loss ?? '', days: x?.days ?? null, lv: x ? issueLv(x) : (c.iss.lv ?? 'mid') };
  }
  // 倉庫の提案は、セリフが指すグラフ（今の画面と同じ部品）
  let store: HTMLElement | null = null;
  if (c.issue.k === 'store') {
    const ch = c.choices[shownRec(s, c)];
    const plan = ch?.act.k === 'do' ? planOf(s, [ch.act.a], { hero: c.hero, q: c.q, dept: c.dept }) : null;
    const aft = plan ? { cap: poolCap(afterOf(s, plan)), free: useUpOf(s, plan)?.mats ?? 0, days: useUpOf(s, plan)?.days } : null;
    store = storeBlock(s, aft, true);
  }
  const rk = shownRec(s, c);
  const tut = inTutorial(s);
  const two = !tut && sp != null && rk >= 0 && (c.choices[rk].act.k === 'do' || c.choices[rk].act.k === 'approve');
  const order = c.choices
    .map((_, k) => k)
    .filter((k) => !two || k === rk || c.choices[k].act.k === 'skip' || c.choices[k].act.k === 'reject' || c.choices[k].act.k === 'hold')
    .sort((a, b) => Number(b === rk) - Number(a === rk) || a - b);
  const choices: CardChoiceView[] = order.map((k) => {
    const ch = c.choices[k];
    const isRec = k === rk;
    const x = two && ch.act.k === 'skip' ? { ...choiceText(s, c, ch), icon: '⏸', label: t('見送り', 'Pass') } : choiceText(s, c, ch);
    if (two && isRec && ch.kind === 'ad') {
      const sh = choiceShort(s, c, k);
      if (sh != null) x.sub = t(`${money(ch.cost)}・来月の利益 ${sh >= 0 ? '+' : '−'}${Math.abs(Math.round(sh)).toLocaleString('en-US')} G（費用込み）`, `${money(ch.cost)} · next month ${sh >= 0 ? '+' : '−'}${Math.abs(Math.round(sh)).toLocaleString('en-US')} G net`);
    }
    const shortG = ch.cost > s.money && ch.act.k !== 'skip' ? ch.cost - s.money : 0;
    const shortRp = (ch.rp ?? 0) > (s.rp ?? 0) ? (ch.rp ?? 0) - (s.rp ?? 0) : 0;
    const why = shortRp ? t(`研究ポイント不足（あと ${shortRp} RP）`, `Short ${shortRp} RP`) : shortG ? t(`資金不足（あと ${money(shortG)}）`, `${money(shortG)} short`) : '';
    const ml = two && isRec ? moveLine(s, c, ch) : null;
    const goProp = ch.act.k === 'do' || (ch.act.k === 'approve' && !!s.deleg?.inbox.some((p) => p.id === (ch.act as { pid: number }).pid));
    const gain: CardChoiceView['gain'] = ch.est != null && ch.unit === 'G' ? { v: ch.est, unit: 'G' } : ch.kind === 'ad' && ch.est != null ? { v: ch.est, unit: 'ad' } : ch.units != null ? { v: ch.units, unit: 'units' } : null;
    return {
      k,
      rec: isRec,
      icon: x.icon,
      label: x.label,
      sub: x.sub,
      move: ml && ml.dept ? { dept: ml.dept, text: ml.cat ? t(`${ml.cat}：${ml.name}`, `${ml.cat}: ${ml.name}`) : ml.name } : null,
      goProp,
      later: two && ch.act.k === 'hold',
      why,
      shortG,
      shortRp,
      act: ch.act.k,
      cost: ch.cost,
      rp: ch.rp ?? 0,
      monthly: ch.monthly ?? 0,
      gain,
    };
  });
  let trust: CardView['trust'] = null;
  if (canTrust(s, c) && c.hero != null) {
    const x = trustText();
    trust = two ? { mode: 'switch', who: heroName(c.hero), label: t(`今後の判断を委任（同じ種類の手は ${heroName(c.hero)} に任せる・受け箱から戻せる）`, `Delegate from now on (${heroName(c.hero)} handles this kind of move; undo from the inbox)`), sub: '' } : { mode: 'row', who: heroName(c.hero), label: x.label, sub: x.sub };
  }
  const star = cardStar(s, c);
  let footNote = '';
  if (c.src === 'diplo' && c.dip) footNote = relTeaser(relOf(s, c.dip.land));
  else if ((c.src === 'event' || c.src === 'duo') && eh) footNote = eh.tag;
  else if (star) footNote = t(`予測精度 ±${Math.round((1 - c.q) * 100)}%`, `Forecast accuracy ±${Math.round((1 - c.q) * 100)}%`);
  else if (c.src === 'quit' && st) footNote = t(`士気 ${Math.round(st.morale ?? 0)}`, `Morale ${Math.round(st.morale ?? 0)}`);
  const left = popLeft(s) - (c.seen ? 0 : 1);
  const box = cardInbox(s).length - 1;
  return {
    id: c.id,
    src: c.src,
    color: role.color,
    roleIcon: role.icon,
    roleText: role.text,
    name: eh && (c.hero == null || c.src === 'diplo') ? eh.title : c.hero != null ? heroName(c.hero) : t('マインちゃん', 'Mine-chan'),
    tag,
    hero: c.src === 'diplo' && c.dip ? null : c.hero,
    crest,
    mine: !crest && c.hero == null ? assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png') : null,
    quip: quipOfCard(c) || null,
    speech: sp,
    say: sayOf(s, c),
    iss,
    store,
    duoNote: c.src === 'duo' && c.duo ? (DUO_BY_ID[c.duo.id]?.note() ?? '') : null,
    choices,
    two,
    tut,
    trust,
    footNote,
    star: star ?? 0,
    err: Math.round((1 - c.q) * 100),
    left: left > 0 ? t(`あと ${left} 件`, `${left} more`) : box > 0 ? t(`受け箱 ${box} 件`, `${box} in inbox`) : '',
  };
}
/** 任せる（2 択でないカードの「任せる」の選択肢）：今の画面と同じ（閉じると、任せた一言のお知らせ） */
export function cardTrustPick(s: P1State, c: Card, close: (res: ChooseRes | null, label: string) => void) {
  const rec = c.choices.find((y) => y.rec);
  const recLabel = rec ? choiceText(s, c, rec).label : '';
  close(trustCard(s, c.id), t(`🤝 ${heroName(c.hero!)}に任せました（${recLabel}）`, `🤝 Trusted ${heroName(c.hero!)} (${recLabel})`));
}

// ---------------------------------------------------------------- 受け箱・取り下げ・会社の課題
/** 受け箱（経営企画 → 部長の提案）の上の「ヒーローからの提案・報告」：今の画面（cardInboxCard）と同じ中身 */
export function inboxView(ctx: Ctx) {
  const s = ctx.s();
  withdrawStale(s);
  const hooks: CardHooks = { done: () => (cardNav.done ? cardNav.done() : after(ctx)), open: (to) => cardNav.open?.(to) };
  const list = cardInbox(s)
    .filter((x) => x.src !== 'head')
    .map((x) => {
      const role = roleOfCard(s, x);
      const loss = (x.iss && x.issues?.find((y) => y.key === x.iss!.key)?.loss) || '';
      return { id: x.id, hero: x.hero, color: role.color, roleIcon: role.icon, title: `${role.text}${x.hero != null ? t(`・${heroName(x.hero)}`, ` · ${heroName(x.hero)}`) : ''}`, say: sayOf(s, x), iss: x.iss ? { icon: ISSUE_ICON[x.iss.key], text: loss ? t(`${issueTag(x.iss)}・${loss}`, `${issueTag(x.iss)} · ${loss}`) : issueTag(x.iss) } : null, held: !!x.held, open: () => showCard(ctx, x, hooks) };
    });
  const trusted = (s.cards?.trust ?? []).map((key) => ({
    key,
    name: trustName(key),
    undo: () => {
      untrust(s, key);
      ctx.toast(t('任せるのをやめました。次からカードで聞きます', 'No longer trusted. They will ask you again'));
      after(ctx);
    },
  }));
  return { list, trusted };
}
/** 今月取り下げた提案（3 件まで） */
export const goneView = (s: P1State) => goneNow(s).slice(0, 3).map((g) => ({ hero: g.hero, text: goneLine(g) }));
/** 会社の課題（優先の順・6 件まで）と、受け箱でその課題を解く提案の数 */
export function issuesView(s: P1State) {
  const inbox = cardInbox(s);
  return issuesOf(s)
    .slice(0, 6)
    .map((x) => ({ key: x.key, pri: x.pri, icon: ISSUE_ICON[x.key], name: issueName(x.key), note: x.note, loss: x.loss, lv: issueLv(x), lvWord: lvWord(issueLv(x)), n: inbox.filter((c) => c.iss?.key === x.key).length }));
}

export const uxdDeps = {
  cardView,
  cardChoose,
  cardTrustPick,
  inboxView,
  goneView,
  issuesView,
  PROPOSAL_SRC,
  DEPT,
  heroIcon,
  heroName,
  money,
  rich,
  assetUrl,
};
export type UxdDeps = typeof uxdDeps;
