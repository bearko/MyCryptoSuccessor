/**
 * 段 UI6：部門は「部長との会話」で動かす（DOM なし：headtalkui.ts とテストが使う）。
 * 部門の画面の下に部長（任せたヒーロー）の顔・名前・肩書きと会話の箱、上〜中にその部門のデータ。プレイヤーは話題（2〜4）を選び、
 * 部長が業務の中で「社長に確認したいこと」（提案のカード・部長の提案）だけを順に聞いてくる（承認・却下・あとで）。
 * 部長がいない部門（置ける理解度に達している）は、マインちゃんが代わりに出て「任せる人を選ぶ？」→ いまの細かい操作の画面。
 * 共通の器（TALK_DEFS に部門ごとの話題を足せば、ほかの部門にも広がる）。いまは人事だけ（ユーザーの判断待ち）。
 * セリフは 1 枚 60 字（mine.ts の TALK_MAX）。史実の調査のあるヒーローは社長の呼び方（voice.ts）、無ければ口調の型（persona.ts）。
 * ゲームの数字（効き目・値段・時間）は変えない：打つ手は、いまのカード・部長の提案・提案書の関数をそのまま使う。
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 UI6 の実装」。
 */
import { policySort } from './brief';
import { t } from '../../i18n';
import { DELEG, DEPT, DEPTS, type DeptId } from './data';
import { deptLevel, menuDepts } from './dept';
import { actName, headDepts, headLeft, headOf, heroNm, type Proposal } from './deleg';
import { cardInbox, hireOffer, inTutorial, sayOf, type Card } from './card';
import { moraleAvg, wantsToQuit } from './hr';
import { say, toneOf, type Tone } from './persona';
import { voiceOf } from './voice';
import { TALK_MAX, talkLen } from './mine';
import type { P1State } from './model';

/** 会話で動かす部門（いまは人事だけ。形が決まったら全部門へ：TALK_DEFS に足す） */
export const TALK_DEPTS: DeptId[] = ['hr'];

/** 話題 */
export type TopicId = 'hire' | 'org' | 'check' | 'deleg' | 'pick' | 'self';
export interface Topic {
  id: TopicId;
  label: string;
  /** 件数（今月の確認事項） */
  n?: number;
}
/** 会話の相手：部長（ヒーロー）か、部長がいないときのマインちゃん */
export type TalkMode = 'head' | 'mine';

/**
 * その部門を会話で動かすか（null：いまの細かい操作の画面のまま）。
 * チュートリアル（タオックスの 1 か月目）は変えない。部長がいれば部長、いなくても部長を置ける理解度ならマインちゃん、置けなければ null
 */
export function talkMode(s: P1State, d: DeptId): TalkMode | null {
  if (inTutorial(s) || !TALK_DEPTS.includes(d) || !menuDepts(s).includes(d)) return null;
  if (headOf(s, d)) return 'head';
  // 段 I1：Rare からは理解度に関係なく部長を置ける（deleg.ts の headLeft）
  return deptLevel(s, d) >= DELEG.headAt || headLeft(s, d) === 0 ? 'mine' : null;
}

// ---------------------------------------------------------------- 確認したいこと

/** 確認したいこと：提案・報告のカード（受け箱）か、部長の提案（カードになっていないもの：保留にした・前の月の） */
export type CheckItem = { k: 'card'; c: Card } | { k: 'prop'; p: Proposal };
/** カードの部門（辞めたいの話は人事） */
export const cardDept = (c: Card): DeptId | null => (c.src === 'quit' ? 'hr' : c.dept);
/** その部門の確認したいこと（カード → 部長の提案の順。受け箱にあるもの） */
export function checkItems(s: P1State, d: DeptId): CheckItem[] {
  const cards = cardInbox(s).filter((c) => cardDept(c) === d);
  const pids = new Set(cards.flatMap((c) => c.choices.map((x) => (x.act.k === 'approve' ? x.act.pid : -1))));
  const here = s.sector ?? 'c1';
  const props = (s.deleg?.inbox ?? []).filter((p) => p.dept === d && !p.src && (p.sector ?? here) === here && !pids.has(p.id));
  // 段 UI7c：部長の提案は、社長の経営方針の価値の大きい順に（画面の並びだけ）
  return [...cards.map((c): CheckItem => ({ k: 'card', c })), ...policySort(s, props).map((p): CheckItem => ({ k: 'prop', p }))];
}

// ---------------------------------------------------------------- 話題

/** 部門ごとの話題（データの話題 2 つ ＋ 今月の確認事項 ＋ 任せ方）。ほかの部門は、ここに足す */
interface TalkDef {
  /** データの話題（部長がいるとき） */
  topics: { id: TopicId; label: () => string }[];
  /** 詳しい画面（サブタブの key） */
  detail: string;
}
export const TALK_DEFS: Partial<Record<DeptId, TalkDef>> = {
  hr: {
    topics: [
      { id: 'hire', label: () => t('採用の状況', 'Hiring') },
      { id: 'org', label: () => t('組織のこと', 'The organization') },
    ],
    detail: 'staff',
  },
};
/** 話題の選択肢（2〜4） */
export function topicsOf(s: P1State, d: DeptId, mode: TalkMode = talkMode(s, d) ?? 'mine'): Topic[] {
  const n = checkItems(s, d).length;
  const check: Topic[] = n ? [{ id: 'check', label: t(`今月の確認事項（${n}）`, `To confirm (${n})`), n }] : [];
  if (mode === 'mine') return [{ id: 'pick', label: t('任せる人を選ぶ', 'Pick someone to run it') }, ...check, { id: 'self', label: t('自分で決める（詳しい画面）', 'I’ll do it myself (details)') }];
  const def = TALK_DEFS[d];
  return [...(def?.topics ?? []).map((x) => ({ id: x.id, label: x.label() })), ...check, { id: 'deleg', label: t('任せ方を変える', 'Change who runs it') }];
}
/** 詳しい画面（サブタブの key） */
export const detailOf = (d: DeptId) => TALK_DEFS[d]?.detail ?? '';

// ---------------------------------------------------------------- セリフ（60 字まで）

/** 型ごとの「ご用件は？」（あいさつの結び） */
const GREET: Record<Tone, () => string> = {
  scholar: () => t('どのデータからご覧になりますか？', 'Which data shall we look at?'),
  warrior: () => t('何なりとお申し付けを！', 'Command me!'),
  leader: () => t('用件を聞こう。', 'What do you need?'),
  polite: () => t('ご用件を伺います。', 'How may I help?'),
  cheer: () => t('なになに？ 何から話す？', 'What’s up? Where do we start?'),
  merchant: () => t('さて、どのお話からいたしましょう？', 'So, which matter first?'),
  easy: () => t('ふあ…今日は何の話にする？', 'Hmm… what shall we talk about?'),
  quiet: () => t('…用件を。', '…Your business?'),
};
/** 社長の呼び方（史実の調査のあるヒーローはその人の呼び方） */
const callOf = (hero: number) => voiceOf(hero)?.to ?? t('社長', 'Chief');
/** 60 字に収まる最初の候補 */
export function fit60(...xs: string[]): string {
  return xs.find((x) => talkLen(x) <= TALK_MAX) ?? xs[xs.length - 1];
}
/** 言い切りの文（「〜している」）を、そのヒーローの口ぶりで（声 → 社長の呼び方、無ければ口調の型） */
export function heroLine(hero: number, core: string): string {
  const v = voiceOf(hero);
  const a = v ? `${v.to}、${core}${t('。', '.')}` : say(toneOf(hero), core);
  return fit60(a, v ? `${core}${t('。', '.')}` : say(toneOf(hero), core, { suf: false }), core);
}

/** 部長がいないときのマインちゃんの一言（仕様のとおり） */
export const MINE_NO_HEAD = () => t('部長がいないから、細かいことも全部あなたが決めることになるよ。任せる人を選ぶ？', 'With no head here, every small decision is yours. Want to pick someone to run it?');

/** 会話を開いたときのひと言（部長：用件を聞く・確認したいことがあれば件数） */
export function openLine(s: P1State, d: DeptId): string {
  const H = headOf(s, d);
  if (!H) return MINE_NO_HEAD();
  const n = checkItems(s, d).length;
  const g = GREET[toneOf(H.hero)]();
  const call = callOf(H.hero);
  return n
    ? fit60(t(`${call}、確認したいことが ${n} 件あります。${g}`, `${call}, I have ${n} thing(s) to confirm. ${g}`), t(`確認したいことが ${n} 件あります。${g}`, `${n} thing(s) to confirm. ${g}`))
    : fit60(t(`${call}、${g}`, `${call}, ${g}`), g);
}

/** 人事：採用の状況のひと言（雇う提案があればそのカードのセリフ） */
function hireLine(s: P1State, hero: number): string {
  const card = hireCard(s);
  if (card) return sayOf(s, card);
  const n = s.hirePool.length;
  return heroLine(hero, n ? t(`候補は ${n} 人いますが、いまは急いで雇わなくても回っている`, `${n} candidates, but we can run fine without hiring now`) : t('いまは雇える候補がいない', 'there are no candidates right now'));
}
/** 人事：組織のことのひと言（人数・士気・辞めたい人） */
function orgLine(s: P1State, hero: number): string {
  const avg = moraleAvg(s) ?? 0;
  const q = wantsToQuit(s).length;
  const idle = s.staff.filter((x) => x.task == null && !x.heads?.length).length;
  const core = q
    ? t(`ヒーローは ${s.staff.length} 人、士気の平均は ${avg}。辞めたい人が ${q} 人いる`, `${s.staff.length} heroes, average morale ${avg}; ${q} want to quit`)
    : idle
      ? t(`ヒーローは ${s.staff.length} 人、士気の平均は ${avg}。待機中が ${idle} 人いる`, `${s.staff.length} heroes, average morale ${avg}; ${idle} idle`)
      : t(`ヒーローは ${s.staff.length} 人、士気の平均は ${avg}。みな持ち場で働いている`, `${s.staff.length} heroes, average morale ${avg}; all at their posts`);
  return heroLine(hero, core);
}
/** 任せ方のひと言（部長が回している業務） */
function delegLine(d: DeptId, hero: number): string {
  return heroLine(hero, t(`${DEPT[d].name}の業務は、任されたとおり回している`, `I’m running ${DEPT[d].name} as you asked`));
}
/** 確認したいこと 1 件のひと言（部長が話す。ほかのヒーローの話は「〇〇から相談が届いている」） */
export function itemLine(s: P1State, d: DeptId, x: CheckItem): string {
  const H = headOf(s, d);
  if (x.k === 'card') {
    if (!H || x.c.hero == null || x.c.hero === H.hero) return sayOf(s, x.c);
    return heroLine(H.hero, t(`${heroNm(x.c.hero)}から相談が届いている`, `${heroNm(x.c.hero)} has come to me with something`));
  }
  const name = actName(s, x.p.act);
  const who = H?.hero ?? x.p.hero;
  return fit60(heroLine(who, t(`「${name}」を進めたい。承認がほしい`, `I want to go ahead with “${name}”. I need your OK`)), heroLine(who, t('この提案を進めたい。承認がほしい', 'I want to go ahead with this. I need your OK')));
}
/** 確認したいことが片づいた */
export function doneLine(s: P1State, d: DeptId): string {
  const H = headOf(s, d);
  return H ? heroLine(H.hero, t('確認したいことは、これで全部片づいた', 'that’s everything I needed to confirm')) : t('確認したいことは、これで全部だよ。', 'That’s everything to confirm.');
}
/** 確認事項を「あとで」に回して、最後まで見た（残りの件数） */
export function laterLine(s: P1State, d: DeptId, n: number): string {
  const H = headOf(s, d);
  return H ? heroLine(H.hero, t(`残りの ${n} 件は、またあとで聞く`, `I’ll ask about the other ${n} later`)) : t(`残りの ${n} 件は、またあとでね。`, `The other ${n} can wait.`);
}
/** 話題のひと言 */
export function topicLine(s: P1State, d: DeptId, topic: TopicId): string {
  const H = headOf(s, d);
  if (!H) return MINE_NO_HEAD();
  if (topic === 'hire') return hireLine(s, H.hero);
  if (topic === 'org') return orgLine(s, H.hero);
  if (topic === 'deleg') return delegLine(d, H.hero);
  return openLine(s, d);
}

/** 人事：採用の状況で出すカード（受け箱の「人を雇いませんか？」があればそれ。無ければ会話の中の仮のカード） */
export function hireCard(s: P1State): Card | null {
  return cardInbox(s).find((c) => c.src === 'hr' && c.issue.k === 'hire') ?? hireOffer(s)?.card ?? null;
}

// ---------------------------------------------------------------- マインちゃんの一言（部長を置けるようになった・初めて任命する）

/**
 * 初めて部長を置けるようになったとき（どこかの部門の理解度が節目 8 に達し、まだ部長が 1 人もいない）。チュートリアルのあいだ・一言を見たあとは出さない
 */
export function headTalkDue(s: P1State): DeptId | null {
  if (inTutorial(s) || s.flags.headTalk || headDepts(s).length) return null;
  const open = menuDepts(s);
  return DEPTS.find((d) => d.id !== 'strategy' && open.includes(d.id) && deptLevel(s, d.id) >= DELEG.headAt)?.id ?? null;
}
/** 初めて部長を置けるようになったときのマインちゃん（3 枚・60 字まで） */
export const HEAD_OPEN_TALK = (d: DeptId) => [
  t(`[[${DEPT[d].name}]]に[[事業部長]]を置けるようになったよ！ 部長を選ぶと、[[操作の仕方が大きく変わる]]の。`, `You can now place a [[division head]] in [[${DEPT[d].name}]]! Picking a head [[changes how you play]] a lot.`),
  t('部長が部門の細かい業務を回して、あなたには[[確認したいことだけ]]を聞いてくるよ。社長らしく任せる形だね。', 'The head runs the small tasks and only asks you about [[what needs your OK]]. You lead like a president.'),
  t('置かずに全部自分で決めることもできるけど、大変だよ。[[組織図]]で、向いているヒーローを選んでみて！', 'You can still decide everything yourself, but it’s a lot. Pick a well-suited hero on the [[org chart]]!'),
];
/** 初めて部長を任命するとき（候補を選ぶ前。2 枚） */
export const HEAD_PICK_TALK = () => [
  t('部長を選ぶと操作の仕方が大きく変わるよ。部長が業務を回して、あなたは[[確認したいことだけ]]決めるの。', 'A head changes how you play: they run the work, and you only decide [[what they ask you]].'),
  t('人事なら、画面は[[部長との会話]]になるよ。細かい画面も[[詳しい画面を開く]]から、いつでも使えるからね。', 'HR becomes a [[talk with your head]]. The detailed screens stay under [[Open details]].'),
];

// ---------------------------------------------------------------- トロフィー（マイクロマネジメント）のための記録

/** これまでに事業部長を置いたことがあるか（段 UI6 の前のセーブは、部長の提案・カードの記録から） */
export function everHead(s: P1State): boolean {
  if (s.flags.headEver || headDepts(s).length) return true;
  if ((s.cards?.stat?.src?.head?.made ?? 0) > 0) return true;
  if ((s.deleg?.done ?? []).some((x) => !x.p.src)) return true;
  return s.reports.some((r) => !!r.deleg?.heads?.length || (r.deleg?.props ?? 0) > 0);
}
