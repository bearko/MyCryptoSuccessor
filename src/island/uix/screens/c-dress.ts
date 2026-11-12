/**
 * 段 UIX3a：今の要素のまま着せ替える画面（お知らせ・トロフィーのお知らせ・窓・建てるモードの札・マインちゃんの一言・流れの案内・
 * 建築の札・部門の帯・ミッションの一覧・ニュースの一覧・設定とシステムの札）の、CSS だけではできない分（入のときだけ）。
 * - 字の中の絵文字を、ドットの絵に替える（決めた入れ物の中だけ。字そのものは変えない：読み上げ・本体の読み取りに触らない）
 * - 主役のボタン 1 つを、前の層に出す（class ux-front）
 * - トロフィーのお知らせに、火花と音
 * 見た目は c-skin.css。今の要素・押す先・チュートリアルの目印は、今のまま。
 */
import { sparks } from '../fx';
import { UX_ICONS, uxIcon } from '../icons';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { M_ICONS, mIcon } from './micons';
import { S_ICONS, sIcon } from './s-icons';
import './c-skin.css';

/** 絵文字 → ドットの絵の名前（土台 icons.ts・上と下の帯の micons.ts・工房と報告の s-icons.ts の絵を使う。仮の絵は docs/ISLAND_ART_TODO.md） */
export const EMOJI_ICO: Record<string, string> = {
  '⏩': 'ff',
  '⏸': 'pause',
  '👑': 'crown',
  '🏆': 'crown',
  '🏅': 'crown',
  '📜': 'mail',
  '📩': 'mail',
  '✉': 'mail',
  '🏪': 'shop',
  '🏬': 'shop',
  '🔒': 'lock',
  '🔓': 'unlock',
  '⛏': 'pick',
  '📍': 'pin',
  '⚠': 'warn',
  '🔥': 'fire',
  '🎯': 'flag',
  '🚩': 'flag',
  '🌱': 'flag',
  '👆': 'up',
  '☝': 'up',
  '👈': 'left',
  '✔': 'check',
  '✅': 'check',
  '📦': 'box',
  '🌐': 'globe',
  '🌍': 'globe',
  '🗺': 'compass',
  '🧭': 'compass',
  '🧾': 'receipt',
  '🔨': 'hammer',
  '🏗': 'crane',
  '🏭': 'hammer',
  '🛒': 'cart',
  '🛍': 'cart',
  '🛃': 'gate',
  '🤝': 'tag',
  '💡': 'bulb',
  '💴': 'coin',
  '💰': 'coin',
  '🪙': 'coin',
  '💬': 'bubble',
  '😴': 'zzz',
  '⬆': 'up',
  '⬇': 'down',
  '📣': 'horn',
  '⭐': 'star',
  '🌟': 'star',
  '✨': 'star',
  '🎁': 'star',
  '🎉': 'star',
  '📰': 'list',
  '📖': 'list',
  '📋': 'list',
  '👤': 'person',
  '👥': 'people',
  '💼': 'folder',
  '📁': 'folder',
  '🏛': 'office',
  '🏠': 'shop',
  '🏚': 'warn',
  '🚚': 'truck',
  '⚙': 'gear',
  '🔧': 'wrench',
  '🔍': 'compass',
  '📊': 'list',
  '📈': 'up',
  '📉': 'down',
  '🎵': 'note',
  '🔔': 'horn',
  '⚡': 'bolt',
  '⚖': 'scales',
  '🧪': 'flask',
  '🎧': 'headset',
};
const KEYS = Object.keys(EMOJI_ICO).sort((a, b) => b.length - a.length);
/** 絵文字を探す（うしろの異体字の印 U+FE0F も一緒に取る） */
export const EMOJI_RE = new RegExp(`(${KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\uFE0F?`, 'u');
/** 字を、絵文字とそれ以外に分ける（DOM なしの芯）。知らない絵文字は、字のまま残す */
export function splitByEmoji(text: string): { text: string; ico?: string }[] {
  const out: { text: string; ico?: string }[] = [];
  let rest = text;
  for (let guard = 0; guard < 64; guard++) {
    const m = EMOJI_RE.exec(rest);
    if (!m) break;
    if (m.index > 0) out.push({ text: rest.slice(0, m.index) });
    out.push({ text: m[0], ico: EMOJI_ICO[m[1]] });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) out.push({ text: rest });
  return out;
}
/** 絵の名前から canvas を作る（3 つの絵の表から探す） */
function iconOf(name: string, color: string): HTMLCanvasElement {
  const o = { color, hi: color, lo: color === '#1a1c2e' ? '#8a7f5c' : '#0b0d17', scale: 1, cls: 'uxc-emo' };
  if (M_ICONS.includes(name)) return mIcon(name, o);
  if (S_ICONS.includes(name)) return sIcon(name, o);
  return uxIcon(UX_ICONS.includes(name) ? name : 'star', o);
}
/** 字の色の明るさ（暗い字＝紙の上：墨の絵。明るい字＝板の上：紙の色の絵） */
function inkOf(e: Element): string {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(getComputedStyle(e).color);
  if (!m) return '#f4ecd4';
  const lum = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
  return lum < 110 ? '#1a1c2e' : lum > 200 ? '#f4ecd4' : `rgb(${m[1]},${m[2]},${m[3]})`;
}
/** root の中の字に入っている絵文字を、ドットの絵に替える（絵には、もとの字を読み上げ用に残さない：飾りなので） */
export function dressEmoji(root: Node) {
  const doc = root.ownerDocument ?? document;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (EMOJI_RE.test(n.textContent ?? '')) hits.push(n as Text);
  for (const n of hits) {
    const host = n.parentElement;
    if (!host || host.closest('.ux-ico, script, style, textarea, input, select')) continue;
    const color = inkOf(host);
    const f = doc.createDocumentFragment();
    for (const p of splitByEmoji(n.textContent ?? '')) f.append(p.ico ? iconOf(p.ico, color) : p.text);
    n.replaceWith(f);
  }
}

/** 「名前：いまの値」の字を、名前と値に分ける（「：」が無ければ null）。かっこの添え書きは値に入れる */
export function sysSplit(text: string): [string, string] | null {
  const m = /^(.+?)(?:：|:\s)(.+)$/.exec(text.trim());
  return m ? [m[1], m[2]] : null;
}

/** 着せ替える入れ物（#isl-ui の中）。上と下の帯・吹き出し・工房・月次報告は、それぞれの段が自分で替えている */
export const DRESS_SEL = [
  '.isl-toasts',
  '.isl-advisor',
  '.isl-dock',
  '.isl-remind',
  '.isl-praise',
  '.isl-tour',
  '.isl-place-bar',
  '.isl-ghost-ui',
  '.isl-sel',
  '.isl-modal.ux-modal--plain',
  '.isl-bcats',
  '.isl-bgrid',
  '.isl-bnote',
  '.isl-dband',
  '.isl-sys-list',
  '.isl-mission',
  '.isl-missions',
  '.uxc-talk-stage',
  '.uxc-drawer-legacy',
  '.isl-sheet-head > h2',
].join(', ');
/** 主役のボタン（前の層に出す 1 つ）：建てるモードの「建てる」・窓の主のボタン・マインちゃんの一言の先のボタン */
export const FRONT_PICK = ['.isl-place-bar .isl-btn.is-on.is-big', '.isl-modal.ux-modal--plain .isl-btn.is-on', '.isl-advisor .isl-btn.is-on'];

export function installDress(root: HTMLElement) {
  let queued = false;
  const seenTrophy = new WeakSet<Element>();
  const run = () => {
    queued = false;
    for (const box of root.querySelectorAll(DRESS_SEL)) dressEmoji(box);
    // 主役の 1 つを前の層へ（入れ物ごとに先頭の 1 つだけ）
    for (const sel of FRONT_PICK) {
      const b = root.querySelector(sel);
      if (b && !b.classList.contains('ux-front')) b.classList.add('ux-front');
    }
    // 設定とシステムの札：「名前：いまの値」のキーは、値を右の小さな表示板に分ける（字は変えない）
    for (const b of root.querySelectorAll<HTMLElement>('.isl-sys-list > .isl-btn:not(:has(.uxc-sys-v))')) {
      const n = b.firstChild;
      const m = n && n.nodeType === 3 && b.childNodes.length === 1 ? sysSplit(n.textContent ?? '') : null;
      if (!m) continue;
      const v = document.createElement('span');
      v.className = 'uxc-sys-v';
      v.textContent = m[1];
      b.replaceChildren(m[0], v);
    }
    // トロフィーのお知らせ：出た瞬間に火花と音（1 回だけ）
    for (const tr of root.querySelectorAll('.isl-toast.isl-tr-pop')) {
      if (seenTrophy.has(tr)) continue;
      seenTrophy.add(tr);
      uxSfx('rankup');
      if (isCalm()) continue;
      requestAnimationFrame(() => {
        const r = tr.getBoundingClientRect();
        if (r.width) sparks({ x: r.left + 28, y: r.top + r.height / 2 }, 18, ['#ffb81f', '#fffdf3', '#ffe394']);
      });
    }
  };
  const kick = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };
  run();
  if (typeof MutationObserver === 'function') new MutationObserver(kick).observe(root, { childList: true, subtree: true, characterData: true });
}
