/**
 * 段 UIX3b：まとめた画面の器（p1/screens.ts の openTogether。入のときだけ。docs/ISLAND_UIX.md「画面：まとめた画面の器」）。
 * 呼び方と中の作りの約束は変えない（部分は section.isl-part[data-part]・見出しは h3.isl-part-title・近道は .isl-part-jump > .isl-part-go。
 * 経営企画の画面もこの器の中に出る）。整えるのは 3 つだけ：
 * - 見出し：部分のランプ・貼り札・右へ伸びる罫・「2 / 3」の番号。
 * - 区切り：紙テープの切り取り線。
 * - 近道と送る動き：近道の列は札の上に貼りつく（先頭の部分へ戻るキーを足す）。いま見ている部分のキーとランプが点く。
 *   押した先・はじめに送った先の部分は、四隅のかぎと見出しが 1 回光る（音つき）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxKey, uxLamp, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpReplay } from '../sparts';
import { bIcon } from './b-icons';
import './together.css';

/** 開いた所へ送ったときの合図の長さ */
export const PART_FLASH_MS = 900;
/** 「いま見ている部分」：見出しが札の上からこの高さ（近道の列の下）までに入った、いちばん下の部分 */
export const PART_SEEN_PX = 24;

/** いま見ている部分の番号：上から順に、見出しの位置（札の上からの px）が line 以下になった最後の部分 */
export function seenPart(tops: number[], line: number): number {
  let k = 0;
  tops.forEach((y, i) => {
    if (y <= line) k = i;
  });
  return k;
}

/** もう合図を出した札（描き直しのたびに出さない） */
const seen = new WeakSet<HTMLElement>();
/** 描き直しのたびに、前の見張りを外す */
const stops = new WeakMap<HTMLElement, () => void>();

/** 部分へ送った合図：見出しの貼り札と四隅のかぎが 1 回光る */
function flash(sec: HTMLElement) {
  uxSfx('page', { step: 3 });
  if (isCalm()) return;
  uxpReplay(sec, 'uxb-part-focus');
  later(PART_FLASH_MS, () => sec.classList.remove('uxb-part-focus'));
}
/** 札の中を送る箱（いちばん近い、縦に送れる祖先） */
function scroller(e: HTMLElement): HTMLElement | null {
  for (let p: HTMLElement | null = e; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
  }
  return null;
}

/** まとめた画面の器：中身を並べたあとに呼ばれる（描き直しのたび） */
export function togetherUx(body: HTMLElement, focus: number) {
  stops.get(body)?.();
  body.classList.add('uxb-together');
  const secs = [...body.querySelectorAll<HTMLElement>(':scope > .isl-part')];
  const n = secs.length;
  const lamps: HTMLElement[] = [];
  secs.forEach((sec, k) => {
    const h3 = sec.querySelector<HTMLElement>(':scope > .isl-part-title');
    if (!h3) return;
    const title = h3.textContent ?? '';
    const lamp = uxLamp('', k === focus);
    lamps[k] = lamp;
    // 見出し：ランプ・貼り札・罫・番号（字は変えない。h3.isl-part-title は残す）
    h3.replaceChildren(lamp, uxTape(el('b', title), 'amber'), el('i.uxb-part-rule'), el('span.uxb-part-of.ux-num', `${k + 1} / ${n}`));
    h3.classList.add('uxb-part-head');
    h3.setAttribute('aria-label', title);
  });
  // 近道：今のキー（2 つ目から）は、絵を替えて押した先に合図。先頭へ戻るキーを足す。列は札の上に貼りつく
  const jump = body.querySelector<HTMLElement>(':scope > .isl-part-jump');
  const goKeys: HTMLElement[] = [];
  if (jump && n > 1) {
    const top = uxKey(el('b', secs[0].querySelector('.isl-part-title')?.getAttribute('aria-label') ?? t('はじめ', 'Top')), () => {
      secs[0].scrollIntoView({ block: 'start', behavior: isCalm() ? 'auto' : 'smooth' });
      flash(secs[0]);
    }, { cls: 'uxb-part-go0', attrs: { 'data-ux-quiet': '' } });
    top.querySelector('.ux-cap')?.prepend(bIcon('up', { scale: 1 }));
    goKeys.push(top);
    jump.querySelectorAll<HTMLButtonElement>(':scope > .isl-part-go').forEach((b, k) => {
      const text = (b.textContent ?? '').replace(/^↓\s*/, '');
      b.replaceChildren(bIcon('down', { scale: 1 }), el('span', text));
      b.setAttribute('data-ux-quiet', '');
      b.addEventListener('click', () => secs[k + 1] && flash(secs[k + 1]));
      goKeys.push(b);
    });
    jump.prepend(top);
    jump.classList.add('uxb-part-jump');
  }
  // いま見ている部分：キーとランプが点く（送っているあいだ。1 コマに 1 回だけ数える）
  const box = typeof getComputedStyle === 'function' ? scroller(body) : null;
  let cur = -1;
  const mark = () => {
    if (!box) return;
    const r0 = box.getBoundingClientRect().top + (jump && n > 1 ? jump.offsetHeight : 0) + PART_SEEN_PX;
    // いちばん下まで送ったときは、最後の部分（短くて、見出しが上まで来ない部分）
    const end = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
    const k = end ? n - 1 : seenPart(secs.map((s) => s.getBoundingClientRect().top), r0);
    if (k === cur) return;
    cur = k;
    lamps.forEach((l, i) => l?.classList.toggle('is-on', i === k));
    goKeys.forEach((g, i) => g.classList.toggle('is-here', i === k));
  };
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      mark();
    });
  };
  if (box && n > 1) {
    box.addEventListener('scroll', onScroll, { passive: true });
    requestAnimationFrame(() => {
      // 近道の列の高さぶん、送った先の見出しが隠れないように
      if (jump) body.style.setProperty('--uxb-jump-h', `${jump.offsetHeight}px`);
      // 送る箱の上の余白にも貼りつく（列の上から中身がのぞかないように）
      if (jump) jump.style.top = `-${parseFloat(getComputedStyle(box).paddingTop) || 0}px`;
      mark();
    });
    stops.set(body, () => {
      box.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    });
  }
  // 開いたときに、はじめから下の部分へ送ったとき：その部分に合図（1 回だけ）
  if (!seen.has(body)) {
    seen.add(body);
    const sec = focus > 0 ? secs[Math.min(focus, n - 1)] : null;
    if (sec) requestAnimationFrame(() => requestAnimationFrame(() => sec.isConnected && flash(sec)));
  }
}
