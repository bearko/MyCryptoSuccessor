/**
 * 段 UIX3h：人と管理の画面に共通の道具（docs/ISLAND_UIX.md「画面：職人と採用」ほか）。
 * - ヒーローの札：どの画面でも同じ形（顔の窓・名前・段の札（レアリティ）・Lv・いちばん向いている仕事のランクと数）。画面の部品の uxpCard・uxpFace で組む
 * - 段の札（レアリティ。色だけにしない：字 N・C・U・R・E・L・LL と名前）・ランクの札（G〜S と数）・能力の縦の棒（今のレーダーと同じ 6 つの仕事）
 * - 札の器（今の open() の keep：1 回だけ組み、描き直しは値だけ合わせる）・節の見出し・入る動きの順番・飛んで入る札
 * 本体の関数は束（H）から使う。DOM なしの芯（テストから読む）は先頭に置く。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { uxIcon } from '../icons';
import { isCalm } from '../prefs';
import { uxTape } from '../parts';
import { uxpCard, uxpEmpty, uxpFace, uxpHead, type CardOpts } from '../sparts';
import { H } from './h-deps';
import { H_ART } from './h-icons';
import { kIcon } from './k-icons';
import type { Ctx } from '../../p1/screens';
import type { HeroRarity, Stats, Task } from '../../p1/data';
import type { Staff } from '../../p1/model';

// ---------------------------------------------------------------- DOM なしの芯
/** 能力の縦の棒の並び（今のレーダーと同じ順：サプライチェーンの 4 つ → 開拓・調査） */
export const APT_ORDER: Task[] = ['buy', 'craft', 'transport', 'shop', 'intel', 'explore'];
/** ランクの見た目の組（S＝琥珀・A/B＝水色・C/D＝緑・E 以下＝灰）。色だけにしない：字と数を必ず添える */
export function rankTone(r: string): 'top' | 'hi' | 'mid' | 'low' {
  if (r === 'S') return 'top';
  if (r === 'A' || r === 'B') return 'hi';
  if (r === 'C' || r === 'D') return 'mid';
  return 'low';
}
/** 入る動きの順番の遅れ（1 枚 30ms・12 枚目からは同じ） */
export const enterDelay = (i: number) => Math.min(i, 12) * 30;

// ---------------------------------------------------------------- 絵
export interface IcoOpts {
  color?: string;
  hi?: string;
  lo?: string;
  scale?: number;
  cls?: string;
}
const PAL: Record<string, string> = { a: '#ffb81f', r: '#ff5964', g: '#36e08b', c: '#5fe4ff', w: '#fffdf3', k: '#0b0d17' };
/** アイコンの canvas（この段で足した絵。無ければ k-icons の順に探す：経営企画 → 工房 → 世界 → 土台） */
export function hIcon(name: string, o: IcoOpts = {}): HTMLCanvasElement {
  const art = H_ART[name];
  if (!art) return kIcon(name, o);
  const { color = '#f4ecd4', hi = '#fffdf3', lo = '#0b0d17', scale = 2, cls = '' } = o;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 12;
  cv.className = `ux-ico ${cls}`.trim();
  cv.style.width = cv.style.height = `${(12 * scale) / 16}rem`;
  cv.setAttribute('aria-hidden', 'true');
  const g = cv.getContext('2d');
  if (g)
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        const ch = art[y][x];
        if (ch === '.' || !ch) continue;
        g.fillStyle = ch === '#' ? color : ch === '+' ? hi : ch === '-' ? lo : (PAL[ch] ?? color);
        g.fillRect(x, y, 1, 1);
      }
  return cv;
}
export const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
export const lite = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
export const dim = { color: '#97a1cf', hi: '#c9cff0', lo: '#0b0d17', scale: 1 };
/** 節の見出し（絵は、この段の絵も描ける） */
export const sect = (title: Kid, ico: string, o: { kind?: 'amber' | 'dark'; note?: Kid; right?: Kid } = {}) =>
  uxpHead([hIcon(ico, o.kind === 'dark' ? lite : ink), typeof title === 'string' ? el('b', title) : title], { kind: o.kind ?? 'amber', note: o.note || undefined, right: o.right ?? undefined });
/** キーの字と絵（uxKey の ico は土台の絵しか描けないので、絵はここで描いて字と並べる） */
export const keyLabel = (ico: string | null, label: string, dark = false): Kid[] => [ico ? hIcon(ico, dark ? ink : lite) : null, el('b', label)];

// ---------------------------------------------------------------- 段の札・ランクの札
/** 段の札（レアリティ）：色の帯と字（N・C・U・R・E・L・LL）。名前は読み上げと title に */
export function rarTag(r: HeroRarity, big = false): HTMLElement {
  const d = H.HERO_RARITY[r];
  const e = el(`span.uxh-rar.is-${r.toLowerCase()}${big ? '.is-big' : ''}`, { title: d.name, 'aria-label': d.name }, el('b.ux-num', d.short));
  e.style.setProperty('--hc', d.color);
  return e;
}
/** ランクの札（「E 45」：字と数。ランクの組で色。100 を超える数はそのまま） */
export function rankChip(apt: number): HTMLElement {
  const r = H.rankOf(apt);
  return el(`span.uxh-rk.is-${rankTone(r)}`, { 'aria-label': `${r} ${H.aptShow(apt)}` }, el('b.ux-num', r), el('span.ux-num', String(H.aptShow(apt))));
}
/** いちばん向いている仕事（今の画面と同じ選び方） */
export function bestTask(stats: Stats, keys?: Task[]): { key: Task; name: string; apt: number } {
  const list = H.TASKS.filter((k) => (keys ? keys.includes(k.key) : true));
  const best = list.reduce((a, k) => (H.aptitude(stats, k.key) > H.aptitude(stats, a.key) ? k : a), list[0]);
  return { key: best.key, name: best.name, apt: H.aptitude(stats, best.key) };
}
/** ランクの目盛り（本体の決まり：RANK_AT の下限で F・E・D・C・B・A・S に替わる）。下から順 */
export function aptTicks(ranks: readonly string[], at: readonly number[]): { r: string; at: number }[] {
  return at.map((v, k) => ({ r: ranks[k + 1], at: v }));
}
/** 値 → 棒の高さ（px。0〜100 を同じ尺度で、2px の升目に乗せる。値があれば 2px は出す） */
export const aptPx = (v: number, h: number) => (v <= 0 ? 0 : Math.max(2, Math.round((Math.min(100, v) / 100) * (h / 2)) * 2));
/**
 * 能力の縦の棒（今のレーダーと同じ情報：仕事 6 つの名前・ランク・数。図の上は 100 で頭打ち）。
 * 0〜100 の同じ尺度で、底の線から伸ばす。横の細い線とランクの字（左右の余白に互い違い）で、ランクの境目（本体の RANK_AT）の目盛り。
 * 各棒のすぐ上に「ランク 数」、下に仕事の名前（せまい幅でも読めるよう、名前は 2 段に互い違い）。いちばん向いている仕事は琥珀
 */
export function aptBars(stats: Stats, o: { height?: number; auto?: boolean } = {}) {
  const H0 = o.height ?? 200;
  const vals = APT_ORDER.map((k) => H.aptitude(stats, k));
  const top = Math.max(...vals);
  const ticks = el(
    'span.uxh-apt-ticks',
    { 'aria-hidden': 'true' },
    // 字は左右の余白に互い違い（境目が近い所でも重ならない）
    aptTicks(H.RANKS, H.RANK_AT).map((x, k) => el(`span.uxh-apt-tick${k % 2 ? '.is-r' : ''}`, { style: { bottom: `${aptPx(x.at, H0)}px` } }, el('b.ux-num.uxh-apt-tr', x.r), el('i.uxh-apt-tl'))),
  );
  const cols = APT_ORDER.map((_k, i) => {
    const v = vals[i];
    const px = aptPx(Math.max(0, Math.round(v)), H0);
    return el(
      `span.uxh-apt-col${v === top ? '.is-main' : ''}`,
      el('i.uxh-apt-bar', { style: { height: `${px}px` } }),
      el('span.uxh-apt-v', { style: { bottom: `${px + 2}px` } }, el('b.ux-num', H.rankOf(v)), el('span.ux-num', String(H.aptShow(v)))),
    );
  });
  const names = APT_ORDER.map((k, i) => el(`span.uxh-apt-n${i % 2 ? '.is-low' : ''}`, el('span', H.TASK_NAME[k])));
  const e = el(
    'div.uxh-apt',
    { role: 'img', 'aria-label': APT_ORDER.map((k, i) => `${H.TASK_NAME[k]} ${H.rankOf(vals[i])} ${H.aptShow(vals[i])}`).join(' / ') },
    el('div.uxh-apt-plot', { style: { height: `${H0}px` } }, ticks, el('span.uxh-apt-cols', cols)),
    el('div.uxh-apt-names', names),
  );
  const grow = () => e.classList.add('is-grown');
  if (isCalm()) grow();
  else if (o.auto !== false) requestAnimationFrame(() => requestAnimationFrame(grow));
  return { el: e, grow };
}

// ---------------------------------------------------------------- ヒーローの札（どの画面でも同じ形）
/** 顔の窓（64px の整数倍を窓で切る。にじませない） */
export const face = (hero: number, win = 56, o: { off?: boolean; breathe?: boolean; mark?: Kid; scale?: 1 | 2 | 3 } = {}) => uxpFace(H.heroIcon(hero, 64 * (o.scale ?? 1)), { win, scale: o.scale, off: o.off, breathe: o.breathe, mark: o.mark });
export interface HeroCardOpts extends Omit<CardOpts, 'pic' | 'name'> {
  rarity?: HeroRarity | null;
  level?: number | null;
  /** 名前のうしろに添える物 */
  more?: Kid;
  win?: number;
  breathe?: boolean;
}
/** ヒーローの札：顔・名前・段の札・Lv（Lv 1 は出さない）＋ 説明・右のキー（一覧のカードの形） */
export function heroCard(hero: number, o: HeroCardOpts = {}): HTMLElement {
  const name = el('span.uxh-name', el('b', H.heroName(hero)), o.rarity ? rarTag(o.rarity) : null, o.level && o.level > 1 ? el('span.uxh-lv.ux-num', `Lv ${o.level}`) : null, o.more ?? null);
  const card = uxpCard({ ...o, pic: face(hero, o.win ?? 56, { off: o.off, breathe: o.breathe }), name, cls: `uxh-card${o.cls ? ' ' + o.cls : ''}` });
  card.dataset.hero = String(hero);
  return card;
}
/** 札に付ける：いちばん向いている仕事とランク */
export const bestLine = (stats: Stats, label = t('向いている', 'Best at')) => {
  const b = bestTask(stats);
  return el('span.uxh-best', el('span.uxh-best-k', label), el('b', b.name), rankChip(b.apt));
};
/** その人の段（もとの段ではなく、いまの段） */
export const rarOf = (st: Staff | null | undefined): HeroRarity => (st?.rarity ?? 'C') as HeroRarity;

// ---------------------------------------------------------------- 器・動き
const built = new WeakMap<HTMLElement, { draw: (anim: boolean) => void }>();
/** 札ごとに、もう入る動きを見せた画面（まとめた画面は、押すたびに中身を作り直すので、2 回目からは動かさない） */
const shown = new WeakMap<Element, Set<string>>();
/**
 * 今の札（open()）に keep で入れる：はじめの 1 回だけ組み、描き直し（1 日ごと・押したあと）は値だけ合わせる。
 * まとめた画面（openTogether）の中では、描き直しのたびに新しい箱で呼ばれる：入る動きは、その札で 1 回だけ
 */
export function keepOpen(ctx: Ctx, title: string, make: (ctx: Ctx, body: HTMLElement) => (anim: boolean) => void, onClose?: () => void) {
  H.open(
    ctx,
    title,
    (body) => {
      const cur = built.get(body);
      if (cur) return cur.draw(false);
      const sheet = body.closest('.isl-sheet') ?? ctx.root.querySelector('.isl-sheet');
      let anim = true;
      if (sheet) {
        const set = shown.get(sheet) ?? new Set<string>();
        anim = !set.has(title);
        set.add(title);
        shown.set(sheet, set);
      }
      const draw = make(ctx, body);
      built.set(body, { draw });
      draw(anim);
    },
    onClose,
    true,
  );
}
/** 描き直しの口：はじめの 1 回は、まだ画面に入っていなくても描く（まとめた画面は、描いてから入れる）。そのあとは、外れていたら描かない */
export function liveDraw(root: HTMLElement, draw: (anim: boolean) => void): (anim: boolean) => void {
  let first = true;
  return (anim) => {
    if (!first && !root.isConnected) return;
    first = false;
    draw(anim);
  };
}
/** 入る動き：上から順に 30ms ずつ（はじめて開いたときだけ）。動きを減らすときは何もしない */
export function enter(els: HTMLElement[]) {
  if (isCalm()) return;
  els.forEach((e, i) => {
    e.classList.add('uxh-in');
    e.style.setProperty('--uxh-d', `${enterDelay(i)}ms`);
  });
}
/** 要素の真ん中（画面の座標） */
export const mid = (e: Element) => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
/**
 * 札が飛んで入る：from の位置に写しを置き、to の位置まで 6 段で動かして消す（transform だけ。260ms）。
 * 画面が作り直されても残るよう、body の直下に置く。動きを減らすときは何もしない
 */
export function flyTo(from: DOMRect, to: Element | null, ghost: HTMLElement) {
  if (isCalm() || !to || typeof ghost.animate !== 'function') return;
  const r = to.getBoundingClientRect();
  ghost.classList.add('uxh-ghost');
  Object.assign(ghost.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
  document.body.append(ghost);
  const dx = r.left + r.width / 2 - (from.left + from.width / 2);
  const dy = r.top + r.height / 2 - (from.top + from.height / 2);
  const k = Math.max(0.2, Math.min(1, r.width / Math.max(1, from.width)));
  ghost.animate([{ transform: 'translate3d(0,0,0) scale(1)', opacity: 1 }, { transform: `translate3d(${dx}px,${dy}px,0) scale(${k})`, opacity: 0.6 }], { duration: 260, easing: 'steps(6, end)' }).onfinish = () => ghost.remove();
}
/** 小さな絵の字（絵＋字） */
export const icoText = (ico: string, text: Kid, o: IcoOpts = dim) => el('span.uxh-it', hIcon(ico, o), typeof text === 'string' ? el('span', text) : text);
/** 貼り札（字だけ） */
export const tape = (label: string, kind: '' | 'amber' | 'good' | 'dark' = '') => uxTape(el('b', label), kind);
/** 絵（土台の絵の名前だけ。ほかは hIcon） */
export const baseIcon = (name: string, o: IcoOpts = lite) => uxIcon(name, o);
/**
 * 空のとき（uxpEmpty）。土台の uxpEmpty の絵は土台の絵の名前しか描けない（知らない名前は空の四角）ので、
 * 絵はここで描き直す（この段・経営企画・工房・世界の絵も使える）
 */
export function hEmpty(text: Kid, o: { ico?: string; sub?: Kid; key?: Kid } = {}): HTMLElement {
  const e = uxpEmpty(text, { ...o, ico: 'list' });
  const slot = e.querySelector('.uxp-empty-ico');
  if (slot && o.ico) slot.replaceChildren(hIcon(o.ico, { color: '#4a5486', hi: '#97a1cf', lo: '#20253d', scale: 3 }));
  return e;
}
