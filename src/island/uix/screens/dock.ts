/**
 * 段 UIX2m：下の帯（部門のタブ・グループの引き出し）を、機械の板に並ぶキーに着せ替える（docs/ISLAND_UIX.md「画面：上と下の帯」）。
 * 今のタブ（.isl-tab）の要素はそのまま：中身をキーの箱に入れ、絵文字をドットの絵に替えるだけ。
 * 開く・ロック・強調（is-on・is-lock・is-guide）・届いた印（has-dot・has-num）は、今の描き直し（renderFoot）が付ける class のまま効く。
 */
import { el } from '../dom';
import { uxLamp } from '../parts';
import { DEPT_ICO, mIcon } from './micons';

/** タブを 1 つ着せ替える（2 回目は何もしない）。返り値：着せ替えたか */
export function dressTab(b: HTMLElement): boolean {
  if (b.classList.contains('uxm-done')) return false;
  b.classList.add('uxm-done');
  const id = b.dataset.dept ?? b.dataset.group ?? '';
  const ico = DEPT_ICO[id] ?? 'list';
  b.querySelector(':scope > i')?.remove();
  const cap = el('span.uxm-cap', mIcon(ico, { cls: 'is-dim' }), mIcon(ico, { color: '#1a1c2e', hi: '#1a1c2e', lo: '#7a3f06', cls: 'is-lit' }), [...b.childNodes]);
  b.append(el('span.uxm-key', cap), el('span.uxm-badge', { 'aria-hidden': 'true' }, uxLamp('bad', true, true)));
  return true;
}

export function dressDock(foot: HTMLElement) {
  const dress = () => {
    for (const b of foot.querySelectorAll<HTMLElement>('.isl-tab:not(.uxm-done)')) dressTab(b);
  };
  dress();
  if (typeof MutationObserver === 'function') new MutationObserver(dress).observe(foot, { childList: true, subtree: true });
}
