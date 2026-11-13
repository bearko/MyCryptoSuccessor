/**
 * 段 UIX3a：今の要素のまま着せ替える画面（お知らせ・トロフィーのお知らせ・窓・建てるモードの札・マインちゃんの一言・流れの案内・
 * 建築の札・部門の帯・ミッションの一覧・ニュースの一覧・設定とシステムの札）の、CSS だけではできない分（入のときだけ）。
 * - 字の中の絵文字を、ドットの絵に替える（決めた入れ物の中だけ。字そのものは変えない：読み上げ・本体の読み取りに触らない）
 * - 主役のボタン 1 つを、前の層に出す（class ux-front）
 * - トロフィーのお知らせに、火花と音
 * 見た目は c-skin.css。今の要素・押す先・チュートリアルの目印は、今のまま。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { sparks } from '../fx';
import { EMOJI_DOT, hasIcon, uxIcon } from '../icons';
import { loop } from '../loop';
import { typeInto, uxLamp, uxTape, type Typing } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpFace } from '../sparts';
import { C } from './c-deps';
import { M_ICONS, mIcon } from './micons';
import { S_ICONS, sIcon } from './s-icons';
import './c-skin.css';

/** 絵文字 → ドットの絵の名前（段 UIX4a：全段で 1 つの表 EMOJI_DOT。土台 icons.ts） */
export const EMOJI_ICO: Record<string, string> = EMOJI_DOT;
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
/** 絵の名前から canvas を作る（上と下の帯 → 工房と報告 → 土台と登録した段の表） */
function iconOf(name: string, color: string): HTMLCanvasElement {
  const o = { color, hi: color, lo: color === '#1a1c2e' ? '#8a7f5c' : '#0b0d17', scale: 1, cls: 'uxc-emo' };
  if (M_ICONS.includes(name)) return mIcon(name, o);
  if (S_ICONS.includes(name)) return sIcon(name, o);
  // 土台と、登録した段の絵の表（段 UIX4a）。どこにも無ければ星
  return uxIcon(hasIcon(name) ? name : 'star', o);
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

// ---------------------------------------------------------------- お知らせ（信号の帯）

/** お知らせの種類：済み（緑のランプ・チェック）・注意（赤のランプがまたたく・三角）・セリフ（名前の札と顔）・知らせ（水色のランプ） */
export type ToastKind = 'done' | 'warn' | 'say' | 'info';
const DONE_RE = /^(✔|✅|✓|🎉|⭐|🏆|🔓)\uFE0F?\s*/u;
const WARN_RE = /^(⚠|🔥|😣|✕|❌|🔒)\uFE0F?\s*/u;
const SAY_RE = /^💬\uFE0F?\s*(.+?)「(.+)」\s*$/su;
export function toastKind(text: string): ToastKind {
  if (SAY_RE.test(text)) return 'say';
  if (DONE_RE.test(text)) return 'done';
  if (WARN_RE.test(text)) return 'warn';
  return 'info';
}
/** セリフのお知らせ（💬 名前「…」）を、名前とセリフに分ける */
export function sayParts(text: string): { name: string; line: string } | null {
  const m = SAY_RE.exec(text);
  return m ? { name: m[1].trim(), line: m[2] } : null;
}
/** お知らせの字を、頭の印（種類の絵文字）・本文・うしろの「×N」に分ける */
export function toastParts(text: string): { kind: ToastKind; body: string; n: number } {
  const m = /^(.*?)(?:\s×(\d+))?$/su.exec(text) ?? ['', text, undefined];
  const main = m[1] ?? text;
  const kind = toastKind(main);
  return { kind, body: kind === 'say' ? main : main.replace(DONE_RE, '').replace(WARN_RE, ''), n: m[2] ? Number(m[2]) : 1 };
}
/** 続けて出るお知らせの音を間引く間（ms） */
export const TOAST_SFX_GAP = 500;
const TOAST_ICO: Record<ToastKind, string> = { done: 'check', warn: 'warn', say: 'bubble', info: 'horn' };
const TOAST_LAMP: Record<ToastKind, '' | 'good' | 'bad' | 'cyan'> = { done: 'good', warn: 'bad', say: '', info: 'cyan' };
let toastSfxAt = -1e9;
const sounded = new WeakSet<Element>();
/** お知らせ 1 つを、信号の帯に組む：ランプ（種類で色）・絵・字（3 行まで）・「×N」。字そのもの（data-text）は今のまま */
function dressToast(e: HTMLElement) {
  if (e.querySelector(':scope > .ux-lamp')) return;
  const { kind, body, n } = toastParts(e.textContent ?? '');
  const img = e.querySelector<HTMLElement>(':scope > .isl-toast-icon');
  const lamp = uxLamp(TOAST_LAMP[kind], true, kind === 'warn');
  const txt = el('span.uxc-sig-t');
  let pic: Node = img ?? iconOf(TOAST_ICO[kind], kind === 'done' ? '#36e08b' : kind === 'warn' ? '#ffb81f' : '#5fe4ff');
  const say = kind === 'say' ? sayParts(body) : null;
  if (say) {
    // ヒーローのセリフ：小さな顔（64px の絵を 40px の窓で）と名前の札
    const id = C.heroByName?.(say.name) ?? null;
    if (id != null) pic = uxpFace(C.heroIcon(id, 64), { win: 40 });
    txt.append(uxTape(el('b', say.name), 'dark'), el('span.uxc-sig-line', say.line));
  } else txt.append(body);
  e.replaceChildren(lamp, el('span.uxc-sig-pic', pic), txt);
  if (n > 1) e.append(el('b.uxc-sig-n.ux-num', `×${n}`));
  dressEmoji(txt);
  e.classList.add('uxc-sig', `is-${kind}`);
  // 種類ごとの小さな音（続けて出るときは間引く。同じ札の「×N」の書き直しでは鳴らさない）
  if (sounded.has(e)) return;
  sounded.add(e);
  const now = performance.now();
  if (now - toastSfxAt < TOAST_SFX_GAP) return;
  toastSfxAt = now;
  if (kind === 'say') uxSfx('blip', { voice: [...(say?.name ?? '')].reduce((a, c) => (a + (c.codePointAt(0) ?? 0)) % 997, 0) });
  else uxSfx('lamp', { step: kind === 'done' ? 4 : kind === 'warn' ? 0 : 2 });
}
/** トロフィーのお知らせの絵：表にある絵文字はその絵、無ければトロフィーの絵（黒い四角だけを出さない） */
function dressTrophy(e: HTMLElement) {
  const i = e.querySelector<HTMLElement>(':scope > i');
  if (!i || i.dataset.uxc) return;
  i.dataset.uxc = '1';
  const m = EMOJI_RE.exec(i.textContent ?? '');
  i.replaceChildren(uxIcon(m ? EMOJI_ICO[m[1]] : 'trophy', { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: 2, cls: 'uxc-tr-ico' }));
  if (!i.querySelector('canvas')?.width) i.replaceChildren(uxIcon('trophy', { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: 2, cls: 'uxc-tr-ico' }));
}

// ---------------------------------------------------------------- マインちゃんの一言（地図の上・画面の中）：1 字ずつ喋る

/** 案内役の声（会話と同じ） */
const TIP_VOICE = 3;
const tips = new WeakMap<Element, { key: string; el: Element; typing: Typing | null }>();
/**
 * 一言の字を、1 字ずつ出す（文が替わったときだけ。同じ文のまま要素が作り直されたときは、全部出たまま）。
 * box：一言の入れ物（覚える所）・p：字の要素
 */
function sayTip(box: Element, p: HTMLElement) {
  const key = p.textContent ?? '';
  const last = tips.get(box);
  if (last && last.key === key) {
    // 喋っている途中に作り直された：もう全部出ている（前の要素の音は止める）
    if (last.el !== p) {
      last.typing?.skip();
      last.el = p;
      last.typing = null;
    }
    return;
  }
  last?.typing?.skip();
  if (!key) return void tips.delete(box);
  const f = document.createDocumentFragment();
  f.append(...p.childNodes);
  tips.set(box, { key, el: p, typing: typeInto(p, f, { voice: TIP_VOICE }) });
}

// ---------------------------------------------------------------- 光る枠（指さし）：琥珀のかぎが四隅から締まる

/** 枠を付ける相手（札・吹き出し・建築の札の中の「ここを押す」）。下の帯のタブ・サブタブ・速さのキーは、上と下の帯の段が自分で囲む */
export const GUIDE_SEL = ['.isl-picker .is-hot', '.isl-sheet .is-hot', '.isl-sheet .isl-btn.is-guide', '.isl-sheet .isl-bcard.is-guide', '.isl-pop .is-hot', '.isl-pop .isl-btn.is-guide', '.uxm-pop-stage .isl-btn.is-guide', '.uxm-pop-stage .is-hot'];
/** 枠の出し入れ：相手が替わったら締まり直す（key が替わったとき）。相手が無ければ消す */
export function guideStep(prev: string, next: string | null): 'hide' | 'snap' | 'keep' {
  if (next == null) return 'hide';
  return next === prev ? 'keep' : 'snap';
}
/** 枠が締まる長さ（ms）と、音を間引く間 */
export const GUIDE_SNAP_MS = 180;
export const GUIDE_SFX_GAP = 600;
function installGuide(root: HTMLElement) {
  const ring = el('div.uxc-guide', { 'aria-hidden': 'true', hidden: true }, el('i'), el('i'), el('i'), el('i'));
  document.body.append(ring);
  let target: Element | null = null;
  let key = '';
  let off: (() => void) | null = null;
  let sfxAt = -1e9;
  let box = '';
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight) return false;
    // 上・中・下のどこか 1 点でも手前に見えていれば、指す（下の一言の札に半分隠れた札も指す）
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2));
    return [0.2, 0.5, 0.8].some((k) => {
      const top = document.elementFromPoint(x, Math.min(innerHeight - 1, Math.max(0, r.top + r.height * k)));
      return !!top && (e.contains(top) || top.contains(e));
    });
  };
  const place = () => {
    if (!target || !target.isConnected) return find();
    const r = target.getBoundingClientRect();
    const b = `${Math.round(r.left) - 6},${Math.round(r.top) - 6},${Math.round(r.width) + 12},${Math.round(r.height) + 12}`;
    if (b === box) return;
    box = b;
    const [x, y, w, h] = b.split(',');
    ring.style.transform = `translate3d(${x}px,${y}px,0)`;
    ring.style.width = `${w}px`;
    ring.style.height = `${h}px`;
  };
  function find() {
    let next: Element | null = null;
    if (!root.querySelector('.isl-talk')) for (const sel of GUIDE_SEL) {
      const e = [...root.querySelectorAll(sel)].find(visible);
      if (e) {
        next = e;
        break;
      }
    }
    const nk = next ? `${next.tagName}|${next.className.replace(/\s*is-ux-down/, '')}|${(next.textContent ?? '').slice(0, 24)}` : null;
    const act = guideStep(key, nk);
    target = next;
    if (act === 'hide') {
      key = '';
      box = '';
      ring.hidden = true;
      off?.();
      off = null;
      return;
    }
    key = nk ?? '';
    ring.hidden = false;
    place();
    off ??= loop.add(() => place());
    if (act === 'snap') {
      // 新しい所を指した：かぎが四隅から「カチッ」と締まる・小さな音
      ring.classList.remove('is-in');
      void ring.offsetWidth;
      ring.classList.add('is-in');
      const now = performance.now();
      if (now - sfxAt > GUIDE_SFX_GAP) {
        sfxAt = now;
        uxSfx('toggle', { step: 1 });
      }
    }
  }
  return find;
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

/** 見張りの記録が、本当に何かを変えたか（属性は、古い値と今の値が同じなら変わっていない：hidden を同じ値で付け直したなど） */
export function changedRec(r: { type: string; oldValue: string | null; attributeName: string | null; target: unknown }): boolean {
  if (r.type !== 'attributes' || !r.attributeName) return true;
  const now = (r.target as Element).getAttribute?.(r.attributeName) ?? null;
  return now !== r.oldValue;
}
export function installDress(root: HTMLElement) {
  let queued = false;
  const seenTrophy = new WeakSet<Element>();
  const seenPraise = new WeakSet<Element>();
  const guide = installGuide(root);
  let hadStamp = false;
  let tourOn = '';
  const run = () => {
    queued = false;
    // ---- お知らせ：信号の帯に組む（絵文字の着せ替えより先に：頭の印で種類を決める）
    const toasts = root.querySelector<HTMLElement>(':scope > .isl-toasts');
    if (toasts) {
      for (const e of toasts.querySelectorAll<HTMLElement>(':scope > .isl-toast')) {
        if (e.classList.contains('isl-tr-pop')) dressTrophy(e);
        else dressToast(e);
      }
      // せまい画面：帯は横いっぱいなので、出ているあいだ、右上のミッションの札は見出しだけにたたんで、帯の高さだけ下へよける
      // （帯と重ねない。よけた札が、押してほしい建物を隠さないように、中身はたたむ）
      const hgt = toasts.childElementCount && getComputedStyle(toasts).visibility !== 'hidden' ? toasts.offsetHeight + 6 : 0;
      if (root.style.getPropertyValue('--uxc-toast-h') !== `${hgt}px`) root.style.setProperty('--uxc-toast-h', `${hgt}px`);
      root.classList.toggle('uxc-toasting', hgt > 0);
    }
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
    // ---- トロフィーのお知らせ：出た瞬間に火花と音（1 回だけ）
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
    // ---- マインちゃんの一言：名前の札・1 字ずつ喋る（文が替わったときだけ）
    const adv = root.querySelector<HTMLElement>(':scope > .isl-advisor');
    const bubble = adv?.querySelector<HTMLElement>('.isl-bubble');
    if (adv && bubble) {
      const name = t('マインちゃん', 'Mine-chan');
      if (bubble.dataset.uxcName !== name) bubble.dataset.uxcName = name;
      const p = bubble.querySelector<HTMLElement>(':scope > p');
      if (p && !adv.hidden && adv.style.display !== 'none') sayTip(adv, p);
    }
    for (const dock of root.querySelectorAll<HTMLElement>('.isl-dock')) {
      const p = dock.querySelector<HTMLElement>('.isl-dock-text');
      if (p && !dock.hidden) sayTip(dock, p);
      else if (dock.hidden) tips.delete(dock);
    }
    // ---- ミッションのクリア：「クリア！」の印が打たれる（音と小さな火花。1 回だけ）
    const stamp = root.querySelector<HTMLElement>('.isl-missions .isl-mis-stamp');
    if (stamp && !hadStamp) {
      const box = stamp.closest<HTMLElement>('.isl-missions');
      box?.classList.add('uxc-clear');
      setTimeout(() => box?.classList.remove('uxc-clear'), 420);
      uxSfx('confirm');
      if (!isCalm())
        requestAnimationFrame(() => {
          const r = root.querySelector('.isl-missions .isl-mis-stamp')?.getBoundingClientRect();
          if (r?.width) sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 12, ['#ff5964', '#fffdf3', '#ffb81f']);
        });
    }
    hadStamp = !!stamp;
    // 「クリア！」の印が出ている札の目印（CSS の :not(:has(...)) をやめた：せまい画面で、どこを書き換えても文書全体の見た目の計算が走っていたため。段 UIX3k）
    for (const m of root.querySelectorAll('.isl-missions')) m.classList.toggle('uxc-stamped', !!m.querySelector('.isl-mis-stamp'));
    // ---- 流れの案内：段が進んだら、帯に光が走る・ランプの音（段の位置で音が上がる）
    const tour = root.querySelector<HTMLElement>(':scope > .isl-tour:not([hidden])');
    const steps = tour ? [...tour.querySelectorAll('.isl-tour-step')] : [];
    const onK = steps.findIndex((x) => x.classList.contains('is-on'));
    const onKey = tour && onK >= 0 ? `${onK}` : '';
    if (onKey !== tourOn) {
      tourOn = onKey;
      if (tour && onKey) {
        tour.classList.remove('uxc-run');
        void tour.offsetWidth;
        tour.classList.add('uxc-run');
        uxSfx('lamp', { step: onK });
      }
    }
    // ---- ほめる一言：打たれる札（音と小さな火花。1 回だけ）
    for (const pr of root.querySelectorAll<HTMLElement>(':scope > .isl-praise')) {
      if (seenPraise.has(pr)) continue;
      seenPraise.add(pr);
      pr.classList.add('uxc-hit');
      uxSfx('confirm');
      if (!isCalm())
        requestAnimationFrame(() => {
          const r = pr.getBoundingClientRect();
          if (r.width) sparks({ x: r.left + 24, y: r.top + r.height / 2 }, 10, ['#36e08b', '#fffdf3', '#ffb81f']);
        });
    }
    // ---- 光る枠（指さし）
    guide();
  };
  const kick = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(run);
  };
  run();
  // 段 UIX4a：値の変わらない書き直し（毎コマ hidden を付け直す所がある）では動かない。古い値と今の値をくらべて、変わった記録があるときだけ
  if (typeof MutationObserver === 'function')
    new MutationObserver((recs) => {
      if (recs.some(changedRec)) kick();
    }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: ['class', 'hidden'] });
}
