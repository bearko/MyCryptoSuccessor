/** フェーズ 1 の画面の小さな道具（DOM・数の書式・アイコン） */
import { allSeries, extensionById, heroById } from '../../game/catalog';
import { isEn, t } from '../../i18n';
import { icon } from '../../ui/dom';
import { ux } from '../uix/hooks';
import { PRODUCT, skuParts, type Mat, type Sku } from './data';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/**
 * 段 UI5d：「推奨」の札（決まり：提案のカード・提案書・3 択の窓では、選択肢と推奨案を明示する。docs/ISLAND_UX_CHARTER.md）。
 * 選択肢の 1 行目の頭に付ける。色だけに頼らず字で示す
 */
export function recTag(): HTMLElement {
  const e = h('span', 'isl-rec-tag', t('推奨', 'Recommended'));
  e.setAttribute('aria-label', t('推奨', 'Recommended'));
  return e;
}
/** 1 行目（太字）に推奨の札を付ける：rec なら札 ＋ 文、そうでなければ文だけ */
export function recLine(text: string, rec: boolean | undefined, cls = ''): HTMLElement {
  const b = h('b', cls);
  if (rec) b.append(recTag());
  b.append(document.createTextNode(text));
  return b;
}

export function btn(text: string, on: () => void, cls = ''): HTMLButtonElement {
  const b = h('button', `isl-btn ${cls}`.trim(), text);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    on();
  });
  return b;
}

export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const money = (n: number) => `${fmt(n)} G`;

/**
 * 増減の符号つきの数（段 UI5b）：増えた「+10」・減った「−10」（全角に近いマイナス記号 U+2212）・変わらない「±0」。
 * 四捨五入した値で決める（+0.4 は ±0）。f：数の書き方（既定は 3 桁区切り。money を渡すと「+1,200 G」）
 */
export function signed(v: number, f: (n: number) => string = fmt): string {
  const r = Math.round(v);
  return r > 0 ? `+${f(r)}` : r < 0 ? `−${f(-r)}` : `±${f(0)}`;
}
/** 増減の色の class：増えた is-good（緑）・減った is-bad（赤）・変わらない is-even（灰） */
export const signCls = (v: number) => (Math.round(v) > 0 ? 'is-good' : Math.round(v) < 0 ? 'is-bad' : 'is-even');

/** マインちゃんの文：[[ ]] で囲んだ固有名詞に色をつける */
export function rich(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  text.split(/\[\[(.+?)\]\]/).forEach((part, k) => {
    if (!part) return;
    f.append(k % 2 ? h('b', 'isl-em', part) : document.createTextNode(part));
  });
  return f;
}

/** [[ ]] を外した文（トーストなど色をつけない所） */
export const plain = (text: string) => text.replace(/\[\[(.+?)\]\]/g, '$1');

export function heroName(id: number): string {
  const x = heroById.get(id);
  return x ? (isEn ? x.nameEn : x.name) : `#${id}`;
}

export function heroIcon(id: number, size = 48): HTMLElement {
  const x = heroById.get(id);
  const e = icon(x?.image ?? '', 'px isl-hero');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}

export function matIcon(m: Mat, size = 24): HTMLImageElement {
  const im = h('img', 'isl-mat');
  im.src = `${import.meta.env.BASE_URL}island/items/${m}.png`;
  im.alt = '';
  im.width = size;
  im.height = size;
  return im;
}

/** エクステの絵（ゲームで使うシリーズに無いエクステ＝発掘の遺物の一部も、カタログの全シリーズから） */
let allImages: Map<number, string> | null = null;
export function extImage(id: number): string {
  const e = extensionById.get(id);
  if (e) return e.image;
  allImages ??= new Map(allSeries.flatMap((x) => x.items.map((y) => [y.id, y.image] as const)));
  return allImages.get(id) ?? '';
}

export function skuName(x: Sku): string {
  const [k, r] = skuParts(x);
  const p = PRODUCT[k];
  // 復刻品は「復刻 ○○」
  if (p.relic) return p.name;
  return extensionById.get(p.ext[r])?.name ?? p.name;
}

export function skuIcon(x: Sku, size = 40): HTMLElement {
  const [k, r] = skuParts(x);
  const e = icon(extImage(PRODUCT[k].ext[r]), 'px isl-ext');
  e.style.width = `${size}px`;
  e.style.height = `${size}px`;
  return e;
}

export function bar(v: number, color = 'var(--isl-good)'): HTMLElement {
  const b = h('i', 'isl-bar');
  b.style.setProperty('--v', `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`);
  b.style.setProperty('--c', color);
  return b;
}

/** 下から出る大きな札（工房・お店・調達など）。閉じると消える */
export function sheet(root: HTMLElement, title: string, onClose: () => void, onUser?: () => void): { body: HTMLElement; close: () => void; el: HTMLElement } {
  const el = h('div', 'isl-sheet');
  const box = h('div', 'isl-sheet-box');
  const head = h('div', 'isl-sheet-head');
  const close = () => {
    el.remove();
    ux.sheetClosed?.();
    onClose();
  };
  // ✕ や外側を押して閉じたとき（別の札に切り替えるときは呼ばない）
  // 段 UIX1a：網目の幕が閉じきるのを待ってから消す（幕の口 ux.sheetLeave が無いときだけ、すぐ消す）
  const userClose = () => {
    const go = () => {
      close();
      onUser?.();
    };
    if (ux.sheetLeave) ux.sheetLeave(el, go);
    else go();
  };
  head.append(h('h2', '', title), btn('✕', userClose));
  const body = h('div', 'isl-sheet-body');
  box.append(head, body);
  el.append(box);
  el.addEventListener('click', (e) => {
    if (e.target === el) userClose();
  });
  root.append(el);
  ux.sheetOpen?.(el, title);
  return { body, close, el };
}

export function select<T extends string | number>(options: { value: T; label: string; disabled?: boolean }[], value: T | null, on: (v: T) => void, empty?: string): HTMLSelectElement {
  const s = h('select', 'isl-select');
  if (empty !== undefined) {
    const o = h('option', '', empty);
    o.value = '';
    s.append(o);
  }
  for (const op of options) {
    const o = h('option', '', op.label);
    o.value = String(op.value);
    o.disabled = !!op.disabled;
    if (op.value === value) o.selected = true;
    s.append(o);
  }
  s.addEventListener('change', () => {
    const raw = s.value;
    const hit = options.find((op) => String(op.value) === raw);
    if (hit) on(hit.value);
  });
  return s;
}
