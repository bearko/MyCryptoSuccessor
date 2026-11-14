/**
 * 段 I2：経営会議の画面（ミニゲーム）。中身の計算は board.ts（DOM なし）。
 * 入場 → 1 人ずつの発表（予実の報告 → 来期の計画 → 必要予算 ＋ その他の要求・監査の指摘）→ 3 つの選択（推奨を選んだ状態から）→ ハンコ → 結果のまとめ。
 * - 押すだけで進む：どの話し手も「推奨」が選ばれた状態で出るので、「決定」を押すだけで次へ。入場と発表の途中で「全員 推奨で一括承認」、右上の ✕ で飛ばす（推奨で決める）。
 * - 演出：席の入場・話し手の席が光る・ハンコ（承認は会社の赤い丸印・却下や減額は青い「否」）と、演出の層 playFx（承認 collect-burst・却下 poof・一括承認と
 *   目標の達成 firework-burst）。演出の設定が「なし」なら効果の層は出さず（playFx が false）、CSS の動きも止めて待ち時間を短く。
 * - 音：入場から結果まで BGM 9on9（hooks.bgm）、閉じたら元の BGM。SE は承認 okay・上げる buff・却下と減額 deny・一括承認と目標の達成 jingle・ハンコ place（UI5a と同じ）。
 * - 会議室の絵（壁・長い机・座る部長）は CSS の仮の絵（docs/ISLAND_ART_TODO.md に PixelLab への指示）。
 */
import { t } from '../../i18n';
import { BOARD, DEPT } from './data';
import {
  boardOf,
  budgetOpts,
  type BoardAgenda,
  type BoardItem,
  type BoardPick,
} from './board';
import type { P1State } from './model';
import type { Sfx } from './sfx';
import type { Bgm } from '../../audio';
import type { Ctx } from './screens';
import { h } from './ui';
import { uxd } from '../uix/screens/d-slots';
import { coLive, ofSlack } from './boardplan';
import { budgetLabels, stack100El, stack100Of } from './slideui';
import type { Stack } from './slides';
import './board.css';

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;

export interface BoardHooks {
  sfx: (k: Sfx, gain?: number, rate?: number) => void;
  /** BGM を替える（入場で 9on9、閉じたら元へ） */
  bgm: (k: Bgm) => void;
  bgmNow: () => Bgm | null;
  /** 閉じた（時間を戻す・描き直す） */
  done: () => void;
}

/**
 * 段 K へのつなぎ口：入場のあと・1 人目の発表の前に差し込む場面（年初の回の「経営方針発表会」：社長が全社方針を選ぶ → 部長が事業別の方針を発表する、など）。
 * when が true の場面を順に出す。run は panel を自分で描き、終わったら next を呼ぶ（next を呼ぶと次の場面か、1 人目の発表へ）。
 * 一括承認・飛ばすで会議を閉じたときは出さない（決めることは board.ts の BOARD_FINISH_HOOKS で）
 */
export interface BoardScene {
  id: string;
  when: (s: P1State, a: BoardAgenda) => boolean;
  run: (ctx: Ctx, a: BoardAgenda, panel: HTMLElement, next: () => void, hooks: BoardHooks) => void;
}
export const BOARD_SCENES: BoardScene[] = [];
/**
 * 段 K へのつなぎ口：部長 1 人ずつの発表に足す行（「事業別の方針」など）。② 来期の計画の前に、返した数だけ段として並べる（無ければ null）
 */
export type BoardItemLine = (s: P1State, it: BoardItem, a: BoardAgenda) => { title: string; say: string; note?: string; el?: HTMLElement } | null;
export const BOARD_ITEM_LINES: BoardItemLine[] = [];

/**
 * 経営会議を開く（議題が無ければ何もしない）。閉じるときは hooks.done
 */
export function openBoard(ctx: Ctx, hooks: BoardHooks): boolean {
  const s = ctx.s();
  const A = boardOf(s).agenda;
  if (!A || !A.items.some((x) => !x.done)) return false;
  // 段 UIX3d：新しい画面（議題 → 意見 → 決議の帯・出席者の札・決議の判）。決める処理は同じ board.ts
  return uxd.board!(ctx, hooks);
}
/**
 * 段 I2b：会社の余力のメーター（UI7d のスライドの予算のメーターと同じ流儀）：上に 3 つの数（見出し・大きな数字・小さなラベル）、
 * 下に区切りの棒（ほかの部門の予算・この部門・増額・余力。月の利益を超えた分は斜線）。選んだ額で描き直す
 */
export function drawSlack(el: HTMLElement, s: P1State, it: BoardItem, pick: BoardPick) {
  el.replaceChildren();
  // 余力は、先に決めた人の予算を入れた「いま」の値（この人の分は、まだ決める前の額）
  const co = coLive(s, boardOf(s).agenda?.co);
  const v = budgetOpts(it)[pick.budget];
  const d = v - it.ask.cur;
  const caps = co.caps + d;
  const left = co.earn - caps;
  const kp = h('div', 'isl-bm-mk');
  const cell = (lab: string, big: string, sub: string, cls = '') => {
    const c = h('div', `isl-bm-mkc ${cls}`);
    c.append(h('small', '', lab), h('b', '', big), h('small', '', sub));
    kp.append(c);
  };
  cell(t('会社の余力（月）', 'Company slack (per month)'), g(left), d ? t(`いま ${g(co.slack)} から ${d > 0 ? '増額' : '減額'} ${g(Math.abs(d))}`, `now ${g(co.slack)}, ${d > 0 ? 'raise' : 'cut'} ${g(Math.abs(d))}`) : t('あと月これだけ増やしても、月の利益の内', 'How much more fits within monthly profit'), `is-main ${left < 0 ? 'is-bad' : 'is-good'}`);
  const r0 = co.earn > 0 ? Math.round((co.caps / co.earn) * 100) : null;
  const r1 = co.earn > 0 ? Math.round((caps / co.earn) * 100) : null;
  cell(t('全部門の予算', 'All budgets'), r1 == null ? t('利益なし', 'No profit') : t(`利益の ${r1}%`, `${r1}% of profit`), r0 != null && r0 !== r1 ? t(`いま ${r0}% ・月 ${g(caps)}`, `now ${r0}% · ${g(caps)}/mo`) : t(`月 ${g(caps)}`, `${g(caps)}/mo`), r1 != null && r1 > 100 ? 'is-bad' : '');
  if (it.left != null) cell(t('今期の予算の残り', 'Unspent this quarter'), g(it.left), t('繰り越さない（会社の資金に残る）', 'Not carried over (stays in cash)'));
  el.append(kp);
  // 段 UI7g：来期（3 か月）の予算の縦の積み上げ棒（事業部・会社＝全部門の予算の合計）。使う見込みは前期のペース。増額・減額は赤帯と点線
  const M = BOARD.months;
  const was = it.was as { amt?: number; used?: number };
  const n = Math.max(1, Math.min(M, Math.round((was.amt ?? 0) / Math.max(1, it.ask.cur)) || 1));
  const pace = ((was.used ?? 0) / n) * M;
  const L = (sign: number): Pick<Stack, 'labUsed' | 'labExp' | 'labDelta' | 'mode'> => ({ mode: 'cap', labUsed: t('使った', 'Used'), labExp: t('使う見込み（前期のペース）', 'Planned (last quarter’s pace)'), labDelta: sign >= 0 ? t('この増額', 'This raise') : t('この減額', 'This cut') });
  // 段 UI9：同じグラフ内で横並びの 100% の積み上げ縦棒（提案書の「効果と費用」の予算と同じ部品）
  const bars = [
    { title: t(`${DEPT[it.dept!].name}部（来期 ${M} か月）`, `${DEPT[it.dept!].name} (next ${M} months)`), total: it.ask.cur * M, used: 0, expect: Math.min(pace, Math.max(it.ask.cur, v) * M), delta: d * M, ...L(d) },
    { title: t(`会社（全部門の合計・来期 ${M} か月）`, `Company (all budgets, next ${M} months)`), total: co.caps * M, used: 0, expect: Math.min(co.spent * M, Math.max(co.caps, caps) * M), delta: d * M, ...L(d) },
  ].map(stack100Of);
  el.append(stack100El(bars, { ...budgetLabels(d >= 0), delta: d >= 0 ? t('この増額', 'This raise') : t('この減額', 'This cut') }, t('来期の予算：事業部と会社', 'Next quarter’s budget: division and company')));
  if (d > 0 && left > 0) el.append(h('small', 'isl-bm-dim', t(`この増額は${ofSlack(d, co.slack)}`, `This raise is ${ofSlack(d, co.slack)}`)));
}
