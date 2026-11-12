/**
 * 段 UIX3b：今の要素のまま着せ替える所（入のときだけ。docs/ISLAND_UIX.md「画面：まとめた画面の器・在庫の引き出し」）。
 * - まとめた画面の器（p1/screens.ts の openTogether）：呼び方と中の作りの約束は変えない。見出しを貼り札に・画面どうしの区切り・
 *   近道のキーの絵・開いた所へ送ったときの合図（四隅のかぎが 1 回光る）だけを足す。
 * - 在庫の売りさばき・棚が 1 段のお店・ランクアップの引き出し（p1/stockui.ts）：器は新しい引き出し。中身の言葉と押す先は今のまま、
 *   絵文字と記号（✓ ✕ → ⬆）をドットの絵に替え、推奨の選択肢を前の層へ出す。見た目は dress.css。
 */
import { el } from '../dom';
import { later } from '../loop';
import { uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpReplay } from '../sparts';
import { bIcon } from './b-icons';
import './together.css';

/** 開いた所へ送ったときの合図の長さ */
export const PART_FLASH_MS = 900;
/** もう合図を出した札（描き直しのたびに出さない） */
const seen = new WeakSet<HTMLElement>();

/** 部分へ送った合図：見出しの貼り札と四隅のかぎが 1 回光る */
function flash(sec: HTMLElement) {
  uxSfx('page', { step: 3 });
  if (isCalm()) return;
  uxpReplay(sec, 'uxb-part-focus');
  later(PART_FLASH_MS, () => sec.classList.remove('uxb-part-focus'));
}

/** まとめた画面の器：中身を並べたあとに呼ばれる（描き直しのたび） */
export function togetherUx(body: HTMLElement, focus: number) {
  body.classList.add('uxb-together');
  const secs = [...body.querySelectorAll<HTMLElement>(':scope > .isl-part')];
  for (const sec of secs) {
    const h3 = sec.querySelector<HTMLElement>(':scope > .isl-part-title');
    if (!h3 || h3.querySelector('.ux-tape')) continue;
    const title = h3.textContent ?? '';
    // 見出し：墨の貼り札と、右へ伸びる罫（字は変えない）
    h3.replaceChildren(uxTape(el('b', title), 'dark'), el('i.uxp-head-rule'));
    h3.classList.add('uxb-part-head');
  }
  // 近道のキー：「↓」を絵に替え、押した先に合図を出す
  body.querySelectorAll<HTMLButtonElement>(':scope > .isl-part-jump > .isl-part-go').forEach((b, k) => {
    const text = (b.textContent ?? '').replace(/^↓\s*/, '');
    b.replaceChildren(bIcon('down', { scale: 1 }), text);
    b.addEventListener('click', () => secs[k + 1] && flash(secs[k + 1]));
  });
  // 開いたときに、はじめから下の部分へ送ったとき：その部分に合図（1 回だけ）
  if (!seen.has(body)) {
    seen.add(body);
    if (focus > 0 && secs[Math.min(focus, secs.length - 1)]) {
      const sec = secs[Math.min(focus, secs.length - 1)];
      requestAnimationFrame(() => requestAnimationFrame(() => sec.isConnected && flash(sec)));
    }
  }
}
