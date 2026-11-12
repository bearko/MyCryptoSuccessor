/**
 * 段 UIX3b：事業の画面に共通の道具（docs/ISLAND_UIX.md「画面：調達」ほか）。画面の部品（sparts.ts：uxp-）で足りない分だけを置く：
 * 値が変わった所だけ作り直す箱（block）・資金から金貨が飛ぶ手応え（payFx）・ヒーローの枠（heroSlot）・商品と素材の絵・絵文字を外す。
 * 見た目は b-kit.css（class は uxb-）。本体（p1/）は読まない（型だけ）：本体の関数は束（B）から。
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { coinsFly } from '../fx';
import { later } from '../loop';
import { shake, uxKey, uxLamp, uxMeter, uxTape, vibrate, type KeyOpts } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpFace, uxpReplay } from '../sparts';
import { B } from './b-deps';
import { bIcon } from './b-icons';
import './b-kit.css';
import type { Mat, Sku, Task } from '../../p1/data';
import type { P1State } from '../../p1/model';
import type { Ctx } from '../../p1/screens';

/** 札の中身が入ってくる動きの長さ（出入りは 180〜260ms） */
export const ENTER_MS = 260;

export const setText = (e: HTMLElement, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};
export const num = (text: string | number, cls = '') => el(`span.ux-num${cls ? '.' + cls : ''}`, String(text));
/** 文の頭や途中の絵文字・飾りの記号を外す（絵はドットのアイコンで添える） */
export const noEmoji = (text: string) =>
  text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '')
    .replace(/^\s+/, '')
    .replace(/\s{2,}/g, ' ');

/** 値が変わった所だけ作り直す箱：sig() が前と同じなら、何もしない（中で動いている物を切らない） */
export interface Block {
  el: HTMLElement;
  sync: () => void;
}
export function block(sel: string, sig: () => string, build: (host: HTMLElement) => void): Block {
  const host = el(sel);
  let last: string | null = null;
  return {
    el: host,
    sync() {
      const now = sig();
      if (now === last) return;
      const first = last == null;
      last = now;
      host.replaceChildren();
      build(host);
      // 値が変わって作り直したときは、箱が小さく光る（開いたときは、入ってくる動きがあるので光らせない）
      if (!first) uxpReplay(host, 'is-fresh');
    },
  };
}
/** block の sig を作る（値を並べるだけ） */
export const sigOf = (...xs: unknown[]) => xs.map((x) => (x == null ? '' : typeof x === 'object' ? JSON.stringify(x) : String(x))).join('|');

/** 資金の数字の場所（金貨が飛んでくる元。上の帯の作りが替わっても落ちないよう、順に探す） */
export function fundsPos(): { x: number; y: number } {
  const e = typeof document !== 'undefined' ? document.querySelector('[data-ux-funds], #isl-ui .isl-hud .isl-stat') : null;
  const r = e?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 70, y: 40 };
}
/** お金を払った手応え：レジの音・振動・資金から金貨が飛ぶ・札が揺れる（資金の桁は、上の帯が自分で回る） */
export function payFx(target: Element | null, coins = 8) {
  uxSfx('cash');
  vibrate(12);
  if (!target || isCalm()) return;
  const r = target.getBoundingClientRect();
  coinsFly(fundsPos(), { x: r.left + Math.min(44, r.width / 2), y: r.top + Math.min(36, r.height / 2) }, coins);
  shake(target);
}
/** 決めたあと：札（「注文済」「実施中」など）が打たれる。打つまでの間（見本：420ms）を置く */
export function stampLater(fn: () => void, ms = 420) {
  if (isCalm()) fn();
  else later(ms, fn);
}

/** 画面の根：入ってくる動きは、開いたときの 1 回だけ（まとめた画面の描き直しで、もう一度入れ直しても動かさない） */
export function root(cls: string, ...kids: Kid[]): HTMLElement {
  const e = el(`div.uxb.ux-root.${cls}.is-enter`, kids);
  if (isCalm()) e.classList.remove('is-enter');
  else later(ENTER_MS + 400, () => e.classList.remove('is-enter'));
  return e;
}

/** 商品の絵（ドット絵は整数倍・にじませない） */
export function skuPic(x: Sku, px = 32): HTMLElement {
  const ic = B.skuIcon(x, px);
  ic.classList.add('ux-ext', 'uxb-pic');
  return ic;
}
/** 素材の絵 */
export function matPic(m: Mat, px = 32): HTMLElement {
  const ic = B.matIcon(m, px);
  ic.classList.add('ux-ext', 'uxb-pic');
  ic.style.width = ic.style.height = `${px}px`;
  return ic;
}
/** ヒーローの顔（64px の絵を win の窓で） */
export const facePic = (hero: number, win = 56, o: { off?: boolean; breathe?: boolean } = {}) => uxpFace(B.heroIcon(hero, 64), { win, ...o });

/** 適性の段と数の札（工房の札と同じ形） */
export function rankTag(s: P1State, hero: number, task: Task): HTMLElement | null {
  const st = B.staffOf(s, hero);
  if (!st) return null;
  const apt = Math.round(B.aptitude(st.stats, task));
  const r = B.rankOf(apt);
  const e = el(`span.uxb-rank.is-${r.toLowerCase()}`, el('b', r), num(B.aptShow(apt)));
  e.title = t(`適性 ${r} ${B.aptShow(apt)}`, `Aptitude ${r} ${B.aptShow(apt)}`);
  return e;
}

export interface SlotOpts {
  label: string;
  task: Task;
  hero: number | null;
  onTap: () => void;
  /** チュートリアルの強調（今の is-hot と同じ意味） */
  hot?: boolean;
  /** 置いていないときのキーの字（既定「人を置く」） */
  empty?: string;
  cls?: string;
}
/**
 * ヒーローの枠：顔・名前・適性・スタミナ・Lv・休憩中の札と、入れ替えのキー。今の目印（isl-slot・is-hot・is-empty）を、キーに同じ意味で付ける。
 * 置いていない枠は、点線の窓と「人を置く」のキー
 */
export function heroSlot(s: P1State, o: SlotOpts): HTMLElement {
  const st = o.hero != null ? B.staffOf(s, o.hero) : null;
  const key = uxKey(st ? t('かえる', 'Change') : (o.empty ?? t('人を置く', 'Assign')), () => o.onTap(), { cls: `uxb-slot-key isl-slot${st ? '' : ' is-empty'}${o.hot ? ' is-hot' : ''}`, attrs: { 'aria-label': `${o.label}: ${st ? t('かえる', 'Change') : t('人を置く', 'Assign')}` } });
  const box = el(`div.uxb-slot${st ? '' : '.is-empty'}${o.cls ? '.' + o.cls : ''}`, el('span.uxb-slot-label', o.label));
  if (st) {
    const stamina = uxMeter(st.stamina / st.stats.hp, 'good');
    stamina.el.classList.add('uxb-stamina');
    stamina.el.classList.toggle('is-low', st.stamina / st.stats.hp <= 0.3);
    stamina.el.setAttribute('aria-label', t('スタミナ', 'Stamina'));
    box.append(
      facePic(st.hero, 56, { off: st.resting, breathe: !st.resting }),
      el('span.uxb-slot-body', el('b.uxb-slot-name', B.heroName(st.hero)), el('span.uxb-slot-tags', rankTag(s, st.hero, o.task), (st.level ?? 1) > 1 ? num(`Lv ${st.level}`, 'uxb-lv') : null, st.resting ? uxTape(t('休憩中', 'Resting'), 'amber') : null), stamina.el),
      key,
    );
  } else box.append(el('span.uxb-slot-none', bIcon('person', { color: '#4a5486', hi: '#97a1cf', lo: '#20253d', scale: 3 })), el('span.uxb-slot-body', el('span.ux-t-dim', t('まだ誰もいません', 'Nobody here yet'))), key);
  return box;
}

/** 中へ足す（null・false は飛ばす） */
export function put(host: HTMLElement, ...kids: (Node | string | null | undefined | false)[]) {
  for (const k of kids) if (k != null && k !== false) host.append(k);
}
/** 足りない・できないときの 1 行（責めない言い方。絵と言葉。色だけにしない） */
export function whyLine(text: Kid, ico = 'warn'): HTMLElement {
  return el('p.uxb-why', { role: 'status' }, bIcon(ico, { scale: 1 }), el('span', text));
}
/** 添え書き（弱い字） */
export const dim = (...kids: Kid[]) => el('p.uxb-dim', kids);
/** ランプつきの言葉（様子：順調・注意・停止など。色だけにしない） */
export function state(kind: '' | 'good' | 'bad' | 'cyan', text: string, blink = false): HTMLElement {
  return el(`span.uxb-state${kind ? '.is-' + kind : ''}`, uxLamp(kind, true, blink), el('span', text));
}
/** 小さなキー（一覧の行の右・札の中）。44px の高さは保つ */
export const key = (label: Kid, fn: () => void, o: KeyOpts = {}) => uxKey(label, () => fn(), { ...o, cls: `uxb-key ${o.cls ?? ''}`.trim() });
/** ctx の「保存して描き直す」（今の after と同じ） */
export const done = (ctx: Ctx) => B.after(ctx);

/**
 * 折りたたみ：見出しのキー（ランプ・名前・添え書き）を押すと、中身が開く。中身は、はじめて開くときに 1 回だけ作る。
 * open()：開いて、そこまで送る
 */
export function fold(title: string, build: (box: HTMLElement) => void, o: { open?: boolean; note?: string; ico?: string; cls?: string } = {}) {
  const lamp = uxLamp('', !!o.open);
  const box = el('div.uxb-fold-box', { hidden: !o.open });
  let made = false;
  const make = () => {
    if (made) return;
    made = true;
    build(box);
  };
  const set = (on: boolean, feel = true) => {
    if (on) make();
    box.hidden = !on;
    lamp.classList.toggle('is-on', on);
    head.setAttribute('aria-expanded', String(on));
    if (feel) uxSfx('toggle', { step: on ? 1 : 0 });
    if (on && feel) uxpReplay(box, 'is-open');
  };
  const head = uxKey(el('span.uxb-fold-l', lamp, o.ico ? bIcon(o.ico, { scale: 1 }) : null, el('b', title), o.note ? el('span.uxb-fold-note', o.note) : null, el('span.uxb-fold-chev', bIcon('next', { scale: 1, color: '#97a1cf' }))), () => set(box.hidden === true), { cls: 'uxb-fold-key', attrs: { 'aria-expanded': String(!!o.open), 'data-ux-quiet': '' } });
  if (o.open) make();
  const e = el(`div.uxb-fold${o.cls ? '.' + o.cls : ''}`, head, box);
  return {
    el: e,
    box,
    get isOpen() {
      return !box.hidden;
    },
    open(scroll = true) {
      set(true, false);
      if (scroll) requestAnimationFrame(() => e.scrollIntoView({ block: 'start' }));
    },
  };
}
