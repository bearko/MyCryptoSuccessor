/**
 * 段 UIX1a：方向 C「管制卓」の部品（docs/ISLAND_UIX.md「部品」）。手触りラボ C（public/uixlab/c/js/ui.js・pop.js・proposal.js）から移した。
 * 画面はこの部品だけで組む：キー（ボタン）・板・貼り札・ランプ・計器・桁の回るカウンター・「+N」・レバー・スイッチ・つまみ・吹き出し・枠破りのヒーロー・お知らせ。
 * 見た目は parts.css（class は ux-）。動きの長さ・色は見本の値。動かすのは transform と opacity。
 */
import { t } from '../../i18n';
import { el, fmtN, type Kid } from './dom';
import { sparks } from './fx';
import { uxIcon } from './icons';
import { later, loop } from './loop';
import { TALK_CPS, isCalm, prefs } from './prefs';
import { uxSfx } from './sound';

export function vibrate(ms: number) {
  if (isCalm()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // 使えない端末では何もしない
  }
}
/** 揺れ（承認などの大きな手応え。180ms） */
export function shake(e: Element | null) {
  if (isCalm() || !e) return;
  e.classList.remove('ux-shake');
  void (e as HTMLElement).offsetWidth;
  e.classList.add('ux-shake');
}

// ---------------------------------------------------------------- 押す手応え
/** すばやく叩いても、沈んだ形が見える長さ（ms） */
export const PRESS_MIN_MS = 70;
/** press() を通したキーに付く目印（class の接頭辞が ux-・uxp-・uxs-・uxm-・uxc- のどれでも同じに扱うため） */
export const KEY_ATTR = 'data-ux-key';
/** 押した所が、b の中に置いた別のキー・ボタン・入力か（押せるカードの中のキーを押したとき、カードまで動かさないため） */
export function innerKey(b: Element, target: EventTarget | null): boolean {
  const t = target as { closest?: (sel: string) => Element | null } | null;
  if (!t || typeof t.closest !== 'function') return false;
  const inner = t.closest('button, a, input, select, [data-ux-key], [role="switch"], [role="slider"]');
  return !!inner && inner !== b && b.contains(inner);
}
/** 続く click を呑む間（ms）と、同じ場所とみなす幅（px） */
export const SWALLOW_MS = 400;
export const SWALLOW_PX = 24;
/** 呑むかどうか：押した所の近く（SWALLOW_PX 以内）に来た click だけ。場所の無い click（読み上げ・コードから）は呑まない */
export const swallowHit = (x: number, y: number, cx: number, cy: number, detail: number) => detail > 0 && Math.abs(cx - x) <= SWALLOW_PX && Math.abs(cy - y) <= SWALLOW_PX;
/**
 * 指を離した瞬間（pointerup）に動くキーの守り：そのあとブラウザが同じ場所へ届ける click を 1 回だけ呑む。
 * 呑まないと、操作で開いたばかりの窓（引き出しの外側＝閉じる）や、札を閉じたあとの地図に、その click が当たる。
 * 近くに来た click だけを呑むので、すぐ別の所を押した click は通る。SWALLOW_MS のあいだに来なければ、何もしない
 */
export function swallowClick(x: number, y: number, ms = SWALLOW_MS) {
  if (typeof addEventListener !== 'function') return;
  const stop = (e: Event) => {
    const m = e as MouseEvent;
    if (!swallowHit(x, y, m.clientX, m.clientY, m.detail)) return;
    e.stopPropagation();
    e.preventDefault();
    off();
  };
  const off = () => {
    removeEventListener('click', stop, true);
    clearTimeout(id);
  };
  addEventListener('click', stop, true);
  const id = setTimeout(off, ms);
}
/**
 * 押す手応え：押した瞬間に沈む（60〜90ms）・離すと戻る。音は押す／離すで別。
 * 指を離した所がボタンの上（まわり 8px まで）なら fn を呼ぶ。読み上げなどの「クリック」だけが来たときも呼ぶ
 */
export function press<T extends HTMLElement>(b: T, fn?: (b: T) => void, opt: { silent?: boolean; strong?: boolean } = {}): T {
  let downAt = 0;
  let isDown = false;
  // 自分で沈むキーの目印（接頭辞に関係なく、土台の初期化・いまの入口の手応えがこれを見る：base.css・legacy.ts）
  b.setAttribute(KEY_ATTR, '');
  const off = () => (b as unknown as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true';
  const up = (fire: boolean) => {
    if (!isDown) return;
    isDown = false;
    const held = performance.now() - downAt;
    const lift = () => {
      b.classList.remove('is-ux-down');
      if (!opt.silent) uxSfx('release');
    };
    if (held < PRESS_MIN_MS) setTimeout(lift, PRESS_MIN_MS - held);
    else lift();
    if (fire) fn?.(b);
  };
  const down = () => {
    isDown = true;
    downAt = performance.now();
    b.classList.add('is-ux-down');
    if (!opt.silent) uxSfx('press', opt.strong ? { pitch: 0.8 } : undefined);
  };
  b.addEventListener('pointerdown', (e) => {
    if (off() || e.button > 0) return;
    // 中に置いたキー・ボタンを押したときは、外側（押せるカードなど）は動かさない
    if (innerKey(b, e.target)) return;
    down();
    try {
      b.setPointerCapture(e.pointerId);
    } catch {
      // 取れなくても動く
    }
  });
  b.addEventListener('pointerup', (e) => {
    const r = b.getBoundingClientRect();
    const hit = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
    // 離した瞬間に操作を呼ぶので、このあとブラウザが同じ場所へ届ける click を 1 回だけ呑む（開いたばかりの窓・閉じたあとの地図に当てない）
    if (hit && isDown) swallowClick(e.clientX, e.clientY);
    up(hit);
  });
  b.addEventListener('pointercancel', () => up(false));
  b.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && !off()) {
      e.preventDefault();
      down();
    }
  });
  b.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') up(true);
  });
  b.addEventListener('click', (e) => {
    // 押す・離すで呼んだあとの click は、ほかの聞き手（札の外側を押して閉じる、など）へ伝えない
    e.stopPropagation();
    if (e.detail === 0 && !isDown && !off()) fn?.(b);
  });
  return b;
}

// ---------------------------------------------------------------- キー（ボタン）
/** ボタンの種類は 4 つまで：主（琥珀。1 画面に 1 つ）・ふつう・弱い・危ない。押せないものは平ら（flat） */
export type KeyKind = 'main' | '' | 'weak' | 'danger' | 'flat';
export const KEY_KINDS: readonly KeyKind[] = ['main', '', 'weak', 'danger'];
export interface KeyOpts {
  kind?: KeyKind;
  big?: boolean;
  /** 左に添えるアイコン（icons.ts の名前） */
  ico?: string | null;
  cls?: string;
  attrs?: Record<string, string | boolean | number>;
  /** 大事な一手：押す音を低く */
  strong?: boolean;
  disabled?: boolean;
}
/** 明るい面のキー（字は濃い色） */
const BRIGHT: Record<string, boolean> = { main: true, danger: true };
/** キーの class（種類ごと） */
export function keyClass({ kind = '', big = false, cls = '', disabled = false }: KeyOpts = {}): string {
  const k = disabled ? 'flat' : kind;
  return ['ux-key', k ? `ux-key--${k}` : '', big ? 'ux-key--big' : '', cls].filter(Boolean).join(' ');
}
/** 機械のキー：胴・縁の光・固い影・切り欠き。押すと沈む。押せないときは平ら */
export function uxKey(label: Kid, fn?: (b: HTMLButtonElement) => void, o: KeyOpts = {}): HTMLButtonElement {
  const dark = !!BRIGHT[o.disabled ? 'flat' : (o.kind ?? '')];
  const cap = el('span.ux-cap', o.ico ? uxIcon(o.ico, { color: dark ? '#1a1c2e' : '#f4ecd4', hi: dark ? '#1a1c2e' : '#fffdf3', lo: dark ? '#7a3f06' : '#0b0d17' }) : null, typeof label === 'string' ? el('b', label) : label);
  const b = el<HTMLButtonElement>('button', { type: 'button', ...(o.attrs ?? {}) }, cap);
  b.className = keyClass(o);
  if (o.disabled) b.disabled = true;
  press(b, fn, { strong: o.strong });
  return b;
}
/** 閉じるキー（✕ の絵。44px 角） */
export function uxCloseKey(fn: () => void): HTMLButtonElement {
  return uxKey(el('span.ux-vh', t('閉じる', 'Close')), fn, { ico: 'close', cls: 'ux-sheet-x', attrs: { 'aria-label': t('閉じる', 'Close') } });
}

// ---------------------------------------------------------------- 板・貼り札・ランプ・計器
/** 機械の板（パネル）。四隅にねじ。float：浮いている板（固い影を落とす外側の箱で包む） */
export function uxPlate(cls = '', ...kids: Kid[]): HTMLElement {
  return el(`div.ux-plate${cls ? '.' + cls.split(' ').join('.') : ''}`, el('div.ux-screws'), kids);
}
export type TapeKind = '' | 'amber' | 'good' | 'dark';
/** 貼り札（ラベルのテープ） */
export function uxTape(label: Kid, kind: TapeKind = ''): HTMLElement {
  return el(`span.ux-tape${kind ? '.ux-tape--' + kind : ''}`, label);
}
export type LampKind = '' | 'good' | 'bad' | 'cyan';
/** ランプ（点く・またたく） */
export function uxLamp(kind: LampKind = '', on = false, blink = false): HTMLElement {
  return el(`i.ux-lamp${kind ? '.ux-lamp--' + kind : ''}${on ? '.is-on' : ''}${blink ? '.is-blink' : ''}`);
}
/** 計器の目盛り（0〜1 を段に乗せる。見本は 20 段） */
export const meterStep = (v: number, steps = 20) => Math.round(Math.max(0, Math.min(1, v)) * steps) / steps;
/** 計器（進みのバー）：目盛りの棒。進みのバーは、この 1 つの部品にまとめる */
export function uxMeter(v = 0, kind: '' | 'good' | 'cyan' = ''): { el: HTMLElement; set: (v: number) => void; flash: () => void } {
  const bar = el('i');
  const e = el(`div.ux-meter${kind ? '.ux-meter--' + kind : ''}`, { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar);
  let lastQ = -1;
  const set = (x: number) => {
    const q = meterStep(x);
    if (q === lastQ) return;
    lastQ = q;
    bar.style.transform = `scaleX(${q})`;
    e.setAttribute('aria-valuenow', String(Math.round(q * 100)));
  };
  set(v);
  return {
    el: e,
    set,
    flash() {
      e.classList.remove('is-flash');
      void e.offsetWidth;
      e.classList.add('is-flash');
    },
  };
}

// ---------------------------------------------------------------- 桁が回る数字（機械のカウンター）
/**
 * 桁ごとの筒の位置（0〜10。1/20 刻み）。下の桁が 9 → 0 に回るあいだだけ、上の桁が一緒に回る（本物のカウンターと同じ動き）。
 * 返す配列は下の桁から
 */
export function odoPositions(x: number, digits: number): number[] {
  const whole = Math.floor(x);
  let carry = x - whole;
  const out: number[] = [];
  for (let k = 0; k < digits; k++) {
    const d = Math.floor(whole / Math.pow(10, k)) % 10;
    out.push(Math.round((d + carry) * 20) / 20);
    carry = d === 9 ? carry : 0;
  }
  return out;
}
/** 回っている途中の値（3 乗のイーズ） */
export const rollEase = (k: number) => 1 - Math.pow(1 - k, 3);
export function rollValue(from: number, to: number, k: number, ease: (k: number) => number = rollEase): number {
  return k >= 1 ? to : from + (to - from) * ease(Math.max(0, k));
}

export interface OdoOpts {
  digits?: number;
  size?: '' | 's' | 'l' | 'xl';
  value?: number;
  cls?: string;
}
export interface RollOpts {
  dur?: number;
  onTick?: (k: number, x: number) => void;
  onDone?: () => void;
  ease?: (k: number) => number;
}
const odos = new Set<Odo>();
let odoOff: (() => void) | null = null;
function odoTick(dt: number) {
  let any = false;
  for (const o of odos)
    if (o.anim) {
      o.step(dt);
      any = any || !!o.anim;
    }
  if (!any) {
    odoOff?.();
    odoOff = null;
  }
}
export class Odo {
  readonly el: HTMLElement;
  readonly n: number;
  v: number;
  shown: number;
  anim: { from: number; to: number; t: number; dur: number; onTick?: RollOpts['onTick']; onDone?: RollOpts['onDone']; last: number; ease: (k: number) => number } | null = null;
  private cells: { cell: HTMLElement; strip: HTMLElement; pos: number; lead?: boolean }[] = [];
  private seps: (HTMLElement | undefined)[] = [];
  constructor({ digits = 7, size = '', value = 0, cls = '' }: OdoOpts = {}) {
    this.n = digits;
    this.v = value;
    this.shown = value;
    this.el = el(`span.ux-odo${size ? '.ux-odo--' + size : ''}${cls ? '.' + cls : ''}`, { role: 'img' });
    for (let k = digits - 1; k >= 0; k--) {
      const strip = el('span', '0123456789'.split('').map((d) => el('i', d)), el('i', '0'));
      const cell = el('span.ux-odo-d', strip);
      this.cells[k] = { cell, strip, pos: -1 };
      this.el.append(cell);
      if (k % 3 === 0 && k > 0) {
        const s = el('span.ux-odo-sep', ',');
        this.seps[k] = s;
        this.el.append(s);
      }
    }
    this.draw(value);
  }
  /** 値を替える。dur を渡すと、その時間で桁が転がる（動きを減らすときは、すぐ替わる） */
  set(v: number, { dur = 600, onTick, onDone, ease }: RollOpts = {}) {
    v = Math.max(0, Math.round(v));
    this.v = v;
    if (isCalm() || dur <= 0 || v === this.shown) {
      this.anim = null;
      this.draw(v);
      onDone?.();
      return;
    }
    this.anim = { from: this.shown, to: v, t: 0, dur, onTick, onDone, last: Math.floor(this.shown), ease: ease ?? rollEase };
    odos.add(this);
    odoOff ??= loop.add(odoTick);
  }
  finish() {
    const a = this.anim;
    if (!a) return;
    this.anim = null;
    this.draw(a.to);
    a.onDone?.();
  }
  step(dt: number) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const x = rollValue(a.from, a.to, k, a.ease);
    this.draw(x);
    const f = Math.floor(x);
    if (f !== a.last) {
      a.last = f;
      a.onTick?.(k, x);
    }
    if (k >= 1) {
      this.anim = null;
      odos.delete(this);
      a.onDone?.();
    }
  }
  draw(x: number) {
    this.shown = x;
    const pos = odoPositions(x, this.n);
    for (let k = 0; k < this.n; k++) {
      const c = this.cells[k];
      if (pos[k] !== c.pos) {
        c.pos = pos[k];
        c.strip.style.transform = `translate3d(0,${(-pos[k] * 0.75).toFixed(4)}em,0)`;
      }
    }
    // 頭の 0 は暗くする
    const whole = Math.floor(x);
    let lead = true;
    for (let k = this.n - 1; k >= 0; k--) {
      const d = Math.floor(whole / Math.pow(10, k)) % 10;
      if (d !== 0 || k === 0) lead = false;
      const c = this.cells[k];
      if (c.lead !== lead) {
        c.lead = lead;
        c.cell.classList.toggle('is-lead', lead);
        this.seps[k]?.classList.toggle('is-lead', lead);
      }
    }
    this.el.setAttribute('aria-label', String(Math.round(x)));
  }
}

/** 画面を作り直す前の値（鍵ごと）。after() の描き直しの前後で、値の差を覚えておく */
const rollMemo = new Map<string, number>();
/** 覚えている値との差（覚えていなければ 0）。呼ぶと、新しい値を覚える */
export function rollDelta(key: string, value: number): { from: number; delta: number } {
  const from = rollMemo.has(key) ? rollMemo.get(key)! : value;
  rollMemo.set(key, value);
  return { from, delta: value - from };
}
export const forgetRoll = (key?: string) => (key ? void rollMemo.delete(key) : rollMemo.clear());
/**
 * 桁の回るカウンター。同じ鍵で前に出した値を覚えていて、値が変わっていたら、前の値から新しい値へ桁が回る
 * （画面を丸ごと作り直しても、数字の変化が見える）。plus：変わったぶんの「+N」を飛び出させる
 */
export function rollNumber(key: string, value: number, o: OdoOpts & RollOpts & { plus?: boolean } = {}): Odo {
  const { from, delta } = rollDelta(key, value);
  const odo = new Odo({ ...o, value: from });
  if (delta) {
    // 画面に入ってから回す（作り直しの途中で回し始めない）
    requestAnimationFrame(() => {
      odo.set(value, { dur: o.dur ?? 600, onTick: o.onTick ?? (() => uxSfx('tick')), onDone: o.onDone, ease: o.ease });
      if (o.plus && odo.el.isConnected) uxPlus(odo.el, delta);
    });
  }
  return odo;
}

/**
 * 増えた・減ったぶんの「+N」が、数字の上に飛び出して消える（色・符号・向きの 3 つで伝える。900ms）。
 * 上掛けの層（body の直下）に出すので、もとの画面が作り直されても消えない
 */
export function uxPlus(at: Element | { x: number; y: number }, n: number, text?: string): HTMLElement {
  const r = at instanceof Element ? at.getBoundingClientRect() : { left: at.x, top: at.y, width: 0 };
  const d = el(`span.ux-delta.ux-delta--float.ux-num${n < 0 ? '.is-down' : ''}`, { 'aria-hidden': 'true' }, n < 0 ? uxIcon('down', { color: '#ff5964', scale: 1 }) : null, text ?? `${n < 0 ? '-' : '+'}${fmtN(Math.abs(n))}`);
  d.style.left = `${Math.round(r.left + r.width / 2)}px`;
  // 数字のすぐ上に出す（数字に重ねない）
  d.style.top = `${Math.round(r.top) - 12}px`;
  document.body.append(d);
  d.classList.add('is-on');
  setTimeout(() => d.remove(), isCalm() ? 600 : 920);
  return d;
}

// ---------------------------------------------------------------- 1 字ずつ喋る
/** 句読点で息をつく（字を出したあとの待ち。per：1 字ぶんの時間） */
export const typePause = (c: string, per: number) => (/[、，,]/.test(c) ? per * 4 : /[。！？…!?.]/.test(c) ? per * 7 : per);
/**
 * 1 字ずつ出す。押すと最後まで出る（skip）。速さは設定（吹き出しの速さ）。字ごとに音の口（blip）を呼ぶ。
 * 先に全部の字を透明で置くので、喋っている途中で枠の大きさが変わらない
 */
export function typeText(box: HTMLElement, text: string, o: TypeOpts = {}): Typing {
  return typeInto(box, text, o);
}
export interface TypeOpts {
  voice?: number;
  cps?: number;
  onDone?: () => void;
}
export interface Typing {
  skip: () => void;
  readonly done: boolean;
}
/**
 * 1 字ずつ出す（中身が要素でもよい：強調の <b> などを保ったまま、中の字を 1 字ずつ出す）。
 * content が文字列なら typeText と同じ
 */
export function typeInto(box: HTMLElement, content: string | Node, { voice, cps = TALK_CPS[prefs.talk], onDone }: TypeOpts = {}): Typing {
  box.textContent = '';
  const chars: string[] = [];
  const spans: HTMLElement[] = [];
  const put = (text: string, into: Node) => {
    for (const c of [...text]) {
      const sp = el('span', { style: { opacity: '0' } }, c);
      chars.push(c);
      spans.push(sp);
      into.appendChild(sp);
    }
  };
  const walk = (n: Node, into: Node) => {
    if (n.nodeType === 3) put(n.textContent ?? '', into);
    else if (n.nodeType === 11) for (const k of [...n.childNodes]) walk(k, into);
    else if (n.nodeType === 1 && !n.hasChildNodes()) {
      // 中身の無い要素（ドットの絵の canvas・画像）は、そのまま 1 字ぶんとして出す（写すと絵が消えるため）
      const e = n as HTMLElement;
      e.style.opacity = '0';
      chars.push('*');
      spans.push(e);
      into.appendChild(e);
    } else if (n.nodeType === 1) {
      const copy = (n as Element).cloneNode(false);
      into.appendChild(copy);
      for (const k of [...n.childNodes]) walk(k, copy);
    }
  };
  if (typeof content === 'string') put(content, box);
  else walk(content, box);
  let i = 0;
  let acc = 0;
  let done = false;
  let off: () => void = () => undefined;
  const finish = () => {
    if (done) return;
    done = true;
    off();
    for (const s of spans) s.style.opacity = '';
    onDone?.();
  };
  if (isCalm() || cps <= 0) finish();
  else
    off = loop.add((dt) => {
      acc += dt;
      const per = 1000 / cps;
      while (acc >= per && i < chars.length) {
        const c = chars[i];
        spans[i].style.opacity = '';
        i++;
        acc -= typePause(c, per);
        if (/\S/.test(c)) uxSfx('blip', { voice });
      }
      if (i >= chars.length) finish();
    });
  return {
    skip: finish,
    get done() {
      return done;
    },
  };
}

// ---------------------------------------------------------------- 枠破りのヒーロー
/**
 * ヒーローの枠破り：パネルの縁からはみ出して、手前に立つ。息をする（1.8 秒・2px）。hop()：喋りはじめに小さく跳ねる。
 * sprite：ヒーローの絵の要素（p1/ui.ts の heroIcon など）。ドット絵は整数倍で、にじませない（もとの 64px の 1・2・3 倍）
 */
export function uxStand(sprite: HTMLElement, scale: 1 | 2 | 3 = 2, size?: { w: number; h: number }): { el: HTMLElement; hop: () => void; set: (sprite: HTMLElement, scale?: 1 | 2 | 3, size?: { w: number; h: number }) => void } {
  const e = el('span.ux-stand', { 'aria-hidden': 'true' });
  let cur = sprite;
  /** 立つ人を替える（会話で話す人が替わるとき）。size：64px の升でない絵（案内役の立ち絵など）の、もとの大きさ × 整数倍 */
  const set = (sp: HTMLElement, sc: 1 | 2 | 3 = 2, sz?: { w: number; h: number }) => {
    const h = sz ? sz.h : 64 * sc;
    const w = sz ? sz.w : 64 * sc;
    sp.style.width = `${w}px`;
    sp.style.height = `${h}px`;
    sp.classList.add('ux-hero', 'ux-pop-face');
    e.style.top = `${-Math.round((h * 84) / 128 / 2) * 2}px`;
    e.replaceChildren(sp);
    cur = sp;
  };
  set(sprite, scale, size);
  return {
    el: e,
    set,
    hop() {
      cur.classList.remove('is-hop');
      void cur.offsetWidth;
      cur.classList.add('is-hop');
    },
  };
}

// ---------------------------------------------------------------- 吹き出しの器
const TAIL = `<svg viewBox="0 0 12 8" width="24" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 0h2v1h1v1h1v1h1v1h1v1h1v3H0V5h1V4h1V3h1V2h1V1h1z" fill="#1a1c2e"/><path d="M5 2h2v1h1v1h1v1h1v1h1v2H1V6h1V5h1V4h1V3h1z" fill="#f4ecd4"/></svg>`;
export interface BubbleOpts {
  /** 話す人の絵（枠の上に立つ） */
  face?: HTMLElement;
  name?: string;
  role?: string;
  /** 話す人ごとの声（音の口 blip の voice） */
  voice?: number;
  /** セリフ（押すと次へ） */
  lines: string[];
  onClose?: () => void;
  /** 最後のセリフのあと：true なら最初へ戻る（既定）。false なら onEnd を呼ぶ */
  loop?: boolean;
  onEnd?: () => void;
  /** 立つ人の絵が 64px の升でないとき（案内役の立ち絵など）の大きさ */
  faceSize?: { w: number; h: number };
  /**
   * 押したときの進め方を、呼ぶ側が決める（会話：話す人・上の絵が枚ごとに替わる）。
   * 喋っている途中に押したときは、器が最後まで出して true を渡す（そのときは次へ進めない）
   */
  onTap?: (skipped: boolean) => void;
}
/**
 * 吹き出しの器：中身の長さで枠が伸び縮みする（上のふち・まん中・下のふちの 3 つに分け、まん中を縦に伸ばす：transform だけ）。
 * 尻尾は話す人か建物を指す（pointAt）。1 字ずつ出す（設定の速さ。押すと最後まで）。
 * el は左上が (0,0) の箱：置く側が transform で動かす（地図の建物に付けるときは毎コマ）。flow：その場に置く
 */
export function uxBubble(o: BubbleOpts & { flow?: boolean }) {
  const bgM = el('i.ux-pop-m');
  const bgB = el('i.ux-pop-b');
  const text = el('p.ux-pop-text');
  const mark = el('span.ux-pop-next', '▼');
  const count = el('span.ux-pop-count', `1/${o.lines.length}`);
  const say = el('div.ux-pop-say', { role: 'button', tabindex: '0', 'aria-label': t('セリフを送る', 'Next line') }, text, el('div.ux-pop-foot', o.lines.length > 1 || o.onTap ? count : null, mark));
  const tail = el('span.ux-pop-tail', { html: TAIL });
  const stand = o.face ? uxStand(o.face, 2, o.faceSize) : null;
  const nameTape = el('span.ux-tape.ux-pop-name', el('b', o.name ?? ''), o.role ? el('span', o.role) : null);
  nameTape.style.display = o.name ? '' : 'none';
  let voice = o.voice;
  const rise = el(
    'div.ux-pop-rise',
    el('div.ux-pop-bg', el('i.ux-pop-t'), bgM, bgB),
    tail,
    stand ? el('div.ux-pop-who', stand.el, nameTape) : null,
    o.onClose ? uxKey(el('span.ux-vh', t('閉じる', 'Close')), () => o.onClose?.(), { ico: 'close', cls: 'ux-pop-x', attrs: { 'aria-label': t('閉じる', 'Close') } }) : null,
    say,
  );
  if (!stand) rise.classList.add('ux-pop-rise--plain');
  const bubble = el(`div.ux-pop-bubble${o.flow ? '.ux-pop-bubble--flow' : ''}`, rise);
  let idx = 0;
  let typing: ReturnType<typeof typeText> | null = null;
  let curH = 0;
  let tween: { from: number; to: number; t: number } | null = null;
  let off: (() => void) | null = null;
  const BASE = 100;
  const paint = (hh: number) => {
    const mid = Math.max(4, hh - 16);
    bgM.style.transform = `scaleY(${(mid / BASE).toFixed(4)})`;
    bgB.style.transform = `translate3d(0,${Math.round(mid)}px,0)`;
  };
  const step = (dt: number) => {
    if (!tween) {
      off?.();
      off = null;
      return;
    }
    tween.t += dt;
    const k = Math.min(1, tween.t / 220);
    // 少し行き過ぎて戻る
    const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
    curH = tween.from + (tween.to - tween.from) * e;
    paint(curH);
    if (k >= 1) {
      curH = tween.to;
      tween = null;
    }
  };
  /** 枠を中身の高さに合わせる（animate：伸び縮みを見せる） */
  const fit = (animate = true) => {
    const target = bubble.offsetHeight;
    if (!target) return;
    if (!animate || isCalm() || !curH) {
      curH = target;
      tween = null;
      paint(target);
      return;
    }
    tween = { from: curH, to: target, t: 0 };
    off ??= loop.add(step);
  };
  /** 中身を喋る（文字列でも、強調の入った要素でもよい） */
  const sayNow = (content: string | Node, first: boolean, onDone?: () => void) => {
    mark.classList.remove('is-on');
    typing?.skip();
    typing = typeInto(text, content, {
      voice,
      onDone: () => {
        mark.classList.add('is-on');
        onDone?.();
      },
    });
    fit(!first);
    stand?.hop();
  };
  const speak = (first: boolean) => {
    count.textContent = `${idx + 1}/${o.lines.length}`;
    sayNow(o.lines[idx], first);
  };
  const advance = () => {
    uxSfx('page');
    if (o.onTap) {
      const skipped = !!typing && !typing.done;
      if (skipped) typing?.skip();
      return o.onTap(skipped);
    }
    if (typing && !typing.done) return typing.skip();
    if (idx + 1 >= o.lines.length && o.loop === false) return o.onEnd?.();
    idx = (idx + 1) % o.lines.length;
    speak(false);
  };
  press(say, advance, { silent: true });
  return {
    el: bubble,
    tail,
    /** 画面に入れたあとに呼ぶ：1 つ目のセリフを喋りはじめる */
    start() {
      speak(true);
      // 書体が読めて行の数が変わったら、枠を合わせ直す
      void document.fonts?.ready.then(() => bubble.isConnected && fit(false));
    },
    fit,
    /** 尻尾の先を、吹き出しの左端から x（px）の所へ（話す人・建物を指す） */
    pointAt(x: number) {
      const bw = bubble.offsetWidth || 366;
      tail.style.transform = `translate3d(${Math.round(Math.max(40, Math.min(bw - 60, x - 12)))}px,0,0)`;
    },
    skip: () => typing?.skip(),
    /** 喋っている途中か */
    get typing() {
      return !!typing && !typing.done;
    },
    /** 中身を替えて喋る（会話：枚ごとに呼ぶ）。count：右下の「2/4」 */
    say(content: string | Node, p: { first?: boolean; count?: string; onDone?: () => void } = {}) {
      if (p.count != null) count.textContent = p.count;
      sayNow(content, !!p.first, p.onDone);
    },
    /** 話す人を替える（絵・名前・肩書き・声） */
    setWho(p: { face?: HTMLElement; scale?: 1 | 2 | 3; size?: { w: number; h: number }; name?: string; role?: string; voice?: number }) {
      if (p.face && stand) stand.set(p.face, p.scale ?? 2, p.size);
      if (p.name !== undefined) {
        nameTape.replaceChildren(el('b', p.name), ...(p.role ? [el('span', p.role)] : []));
        nameTape.style.display = p.name ? '' : 'none';
      }
      voice = p.voice;
    },
    get height() {
      return tween ? tween.to : curH;
    },
    destroy() {
      typing?.skip();
      off?.();
    },
  };
}

// ---------------------------------------------------------------- レバー（承認の手応え）
/** レバーの行程（px）と、目盛りの間（px） */
export const LEVER = { travel: 104, detent: 12, fallMs: 170, snapMs: 70, backMs: 150, lampMs: 90, lampDelay: 110 };
export interface LeverEvents {
  /** 目盛りを 1 つ越えた（「カチ」。p：0〜1 の位置） */
  detent?: (p: number) => void;
  /** 下まで落ちた（「ガチャン」）。1 回だけ */
  engage?: () => void;
  /** 途中で離して、上へ戻る */
  back?: () => void;
  /** 位置が変わった */
  paint?: (pos: number) => void;
}
/**
 * レバーの動き（DOM なしの芯）：引く（drag）・押す（tap）のどちらでも落ちる。
 * 6px 未満の動きで離したら「押した」とみなして自分で落ちる（0.17 秒）。6 割を越えて離したら落ちきる。手前なら戻る。
 * 落ちたら engage を 1 回だけ呼び、そのあとは動かない
 */
export function leverCore(ev: LeverEvents, calm: () => boolean = () => false, travel: number = LEVER.travel) {
  let pos = 0;
  let engaged = false;
  let drag: { y: number; p0: number; moved: number } | null = null;
  let auto: { from: number; to: number; t: number; ms: number; then: (() => void) | null } | null = null;
  let lastDet = 0;
  const setPos = (p: number) => {
    pos = p;
    ev.paint?.(pos);
  };
  const det = (downOnly: boolean) => {
    const d = Math.floor(pos / LEVER.detent);
    if (d !== lastDet) {
      const down = d > lastDet;
      lastDet = d;
      if (down || !downOnly) ev.detent?.(pos / travel);
    }
  };
  const engage = () => {
    if (engaged) return;
    engaged = true;
    drag = null;
    auto = null;
    setPos(travel);
    ev.engage?.();
  };
  const core = {
    get pos() {
      return pos;
    },
    get engaged() {
      return engaged;
    },
    get busy() {
      return !!auto;
    },
    /** 押しただけ：レバーが自分で落ちる */
    pull() {
      if (engaged || auto) return;
      auto = { from: pos, to: travel, t: 0, ms: calm() ? 1 : LEVER.fallMs, then: engage };
    },
    down(y: number): boolean {
      if (engaged || auto) return false;
      drag = { y, p0: pos, moved: 0 };
      return true;
    },
    move(y: number) {
      if (!drag || engaged) return;
      const d = y - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(d));
      setPos(Math.max(0, Math.min(travel, drag.p0 + d)));
      det(false);
      if (pos >= travel) engage();
    },
    up() {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (engaged) return;
      if (d.moved < 6) core.pull();
      else if (pos > travel * 0.6) auto = { from: pos, to: travel, t: 0, ms: LEVER.snapMs, then: engage };
      else {
        ev.back?.();
        auto = { from: pos, to: 0, t: 0, ms: LEVER.backMs, then: null };
      }
    },
    /** 毎コマ：自分で動いているあいだの位置 */
    step(dt: number) {
      if (!auto) return;
      auto.t += dt;
      const k = Math.min(1, auto.t / auto.ms);
      const e = auto.to > auto.from ? k * k : 1 - (1 - k) * (1 - k);
      setPos(auto.from + (auto.to - auto.from) * e);
      det(true);
      if (k >= 1) {
        const then = auto.then;
        auto = null;
        lastDet = Math.floor(pos / LEVER.detent);
        then?.();
      }
    },
    /** はじめから落ちた形にする（もう承認してあるとき） */
    preset() {
      engaged = true;
      setPos(travel);
    },
  };
  return core;
}

export interface LeverOpts {
  /** つまみの字（既定「承認」） */
  label?: string;
  /** 読み上げの名前 */
  aria?: string;
  /** 下の一行（既定「引いて承認」） */
  cap?: string;
  /** ランプの数（既定 5。0 なら出さない） */
  lamps?: number;
  /** ランプのあとに点く札（既定「承認済」。前は「未承認」） */
  doneText?: [string, string];
  /** 引けるか（false なら、引いても落ちずに戻る：資金が足りない、など） */
  can?: () => boolean;
  /** 落ちた瞬間（ガチャン） */
  onEngage?: () => void;
  /** ランプが順に点き、「承認済」が点いたあと。1 回だけ */
  onDone?: () => void;
  /** もう承認してある */
  done?: boolean;
  /** 揺らす箱（既定はレバーの親の板） */
  shakeEl?: () => Element | null;
  /** 引く距離（px。既定 LEVER.travel）。小さいレバー（せまい画面の部長との対話）は、CSS で高さをこれに合わせる */
  travel?: number;
}
/**
 * レバー（承認の手応え）：引く・押すのどちらでも落ちる。目盛りの「カチ」、下で「ガチャン」、光・揺れ・火花・振動、
 * ランプが順に点き、「承認済」が点く。el：レバーと下の一行。lamps・done：ランプの列と「承認済」の札（好きな所に置く）
 */
export function uxLever(o: LeverOpts = {}) {
  const knob = el('div.ux-lever-knob', el('span.ux-lever-grip'), el('b', o.label ?? t('承認', 'OK')));
  const arrow = () => uxIcon('down', { color: '#ffb81f', scale: 1 });
  const hint = el('div.ux-lever-hint', arrow(), arrow(), arrow());
  const lever = el('div.ux-lever', { role: 'button', tabindex: '0', 'aria-label': o.aria ?? t('承認する（レバーを下げる）', 'Approve (pull the lever down)') }, el('div.ux-lever-slot'), el('div.ux-lever-scale'), hint, el('div.ux-lever-goal', 'ON'), knob);
  const cap = el('div.ux-lever-cap', arrow(), el('span', o.cap ?? t('引いて承認', 'Pull to approve')));
  const flash = el('i.ux-prop-flash');
  const box = el('div.ux-lever-box', lever, cap);
  const lamps = Array.from({ length: o.lamps ?? 5 }, () => uxLamp('good'));
  const lampRow = el('div.ux-prop-lamps', lamps);
  const [before, afterTxt] = o.doneText ?? [t('未承認', 'Pending'), t('承認済', 'Approved')];
  const doneTxt = el('b', before);
  const done = el('div.ux-prop-done', { 'aria-live': 'polite' }, el('span.ux-prop-done-in', uxIcon('check', { color: '#1a1c2e' }), doneTxt));
  let fired = false;
  let off: (() => void) | null = null;
  const finish = () => {
    if (fired) return;
    fired = true;
    o.onDone?.();
  };
  const lit = () => {
    lever.classList.add('is-on');
    cap.replaceChildren(el('span.ux-t-good', t('つながった', 'Connected')));
  };
  const core = leverCore(
    {
      paint: (pos) => (knob.style.transform = `translate3d(0,${Math.round(pos / 2) * 2}px,0)`),
      detent: (p) => uxSfx('lever', { step: Math.round(p * 8) }),
      back: () => uxSfx('lever', { step: 0, pitch: 0.7 }),
      engage() {
        lit();
        lever.classList.remove('is-drag');
        // ガチャン：音・短い振動・札の揺れ・1 コマの白い光・火花
        uxSfx('clunk');
        vibrate(22);
        const host = o.shakeEl?.() ?? box.closest('.ux-plate') ?? box.parentElement;
        shake(host);
        if (host && !flash.isConnected && host instanceof HTMLElement && host.classList.contains('ux-plate')) host.append(flash);
        flash.classList.remove('is-on');
        void flash.offsetWidth;
        flash.classList.add('is-on');
        const kr = knob.getBoundingClientRect();
        sparks({ x: kr.left + kr.width / 2, y: kr.bottom }, 16);
        o.onEngage?.();
        // ランプが下から順に点く（音は 1 段ずつ上がる）→「承認済」
        const calm = isCalm();
        lamps.forEach((l, i) =>
          later(calm ? 0 : LEVER.lampDelay + i * LEVER.lampMs, () => {
            l.classList.add('is-on');
            uxSfx('lamp', { step: i });
          }),
        );
        later(calm ? 0 : LEVER.lampDelay + lamps.length * LEVER.lampMs, () => {
          done.classList.add('is-on');
          doneTxt.textContent = afterTxt;
          uxSfx('confirm');
          vibrate(10);
          if (done.isConnected) {
            const dr = done.getBoundingClientRect();
            sparks({ x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 }, 12, ['#36e08b', '#fffdf3', '#ffb81f']);
          }
          finish();
        });
      },
    },
    isCalm,
    o.travel,
  );
  const run = () => {
    off ??= loop.add((dt) => {
      core.step(dt);
      if (!core.busy) {
        off?.();
        off = null;
      }
    });
  };
  const deny = () => {
    uxSfx('deny');
    shake(lever);
  };
  lever.addEventListener('pointerdown', (e) => {
    if (o.can && !o.can()) return deny();
    if (!core.down(e.clientY)) return;
    try {
      lever.setPointerCapture(e.pointerId);
    } catch {
      // 取れなくても動く
    }
    lever.classList.add('is-drag');
    uxSfx('press', { pitch: 0.8 });
  });
  lever.addEventListener('pointermove', (e) => core.move(e.clientY));
  const up = () => {
    lever.classList.remove('is-drag');
    core.up();
    run();
  };
  lever.addEventListener('pointerup', up);
  lever.addEventListener('pointercancel', up);
  lever.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (o.can && !o.can()) return deny();
    uxSfx('press', { pitch: 0.8 });
    core.pull();
    run();
  });
  // レバーの上の click は、外へ伝えない（札の外側を押して閉じる、などに当たらないように）
  box.addEventListener('click', (e) => e.stopPropagation());
  if (o.done) {
    core.preset();
    lit();
    lamps.forEach((l) => l.classList.add('is-on'));
    done.classList.add('is-on');
    doneTxt.textContent = afterTxt;
    fired = true;
  }
  return {
    el: box,
    lever,
    lamps: lampRow,
    done,
    core,
    /** 押しただけと同じ：自分で落ちる */
    pull() {
      core.pull();
      run();
    },
  };
}

// ---------------------------------------------------------------- スイッチ・つまみ
/** 切り替えスイッチ */
export function uxToggle({ label, value = false, on = t('入', 'On'), off = t('切', 'Off'), onChange }: { label: string; value?: boolean; on?: string; off?: string; onChange?: (v: boolean) => void }) {
  const state = el('span.ux-switch-state', value ? on : off);
  const e = el<HTMLButtonElement>('button.ux-switch', { type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label }, el('span.ux-switch-box', el('span.ux-switch-knob')), state);
  let v = value;
  const show = () => {
    e.setAttribute('aria-checked', String(v));
    state.textContent = v ? on : off;
  };
  e.addEventListener('click', (ev) => {
    ev.stopPropagation();
    v = !v;
    show();
    uxSfx('toggle', { step: v ? 1 : 0 });
    onChange?.(v);
  });
  return {
    el: e,
    get value() {
      return v;
    },
    set(nv: boolean) {
      v = nv;
      show();
    },
  };
}

/** つまみ（スライダー）。2px の格子に乗せて動く */
export function uxFader({ min = 0, max = 10, step = 1, value = 0, label = '', onInput, onChange }: { min?: number; max?: number; step?: number; value?: number; label?: string; onInput?: (v: number, p: number) => void; onChange?: (v: number) => void }) {
  const fill = el('div.ux-fader-fill');
  const knob = el('div.ux-fader-knob');
  const e = el('div.ux-fader', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max }, el('div.ux-fader-track', fill), el('div.ux-fader-ticks'), knob);
  let v = value;
  const paint = () => {
    const p = (v - min) / (max - min);
    const w = e.clientWidth || 200;
    const x = Math.round((p * (w - 20) + 10) / 2) * 2;
    knob.style.transform = `translate3d(${x}px,0,0)`;
    fill.style.transform = `scaleX(${(x / w).toFixed(4)})`;
    e.setAttribute('aria-valuenow', String(v));
  };
  const setFrom = (clientX: number) => {
    const r = e.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left - 10) / (r.width - 20)));
    const nv = Math.round((min + p * (max - min)) / step) * step;
    if (nv !== v) {
      v = nv;
      paint();
      uxSfx('slide', { step: Math.round(((v - min) / (max - min)) * 10) });
      onInput?.(v, (v - min) / (max - min));
    }
  };
  e.addEventListener('pointerdown', (ev) => {
    try {
      e.setPointerCapture(ev.pointerId);
    } catch {
      // 取れなくても動く
    }
    e.classList.add('is-drag');
    uxSfx('press');
    setFrom(ev.clientX);
  });
  e.addEventListener('pointermove', (ev) => {
    if (e.classList.contains('is-drag')) setFrom(ev.clientX);
  });
  const end = () => {
    if (!e.classList.contains('is-drag')) return;
    e.classList.remove('is-drag');
    uxSfx('release');
    onChange?.(v);
  };
  e.addEventListener('pointerup', end);
  e.addEventListener('pointercancel', end);
  e.addEventListener('click', (ev) => ev.stopPropagation());
  e.addEventListener('keydown', (ev) => {
    const d = ev.key === 'ArrowRight' || ev.key === 'ArrowUp' ? step : ev.key === 'ArrowLeft' || ev.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    ev.preventDefault();
    const nv = Math.max(min, Math.min(max, v + d));
    if (nv !== v) {
      v = nv;
      paint();
      onInput?.(v, (v - min) / (max - min));
      onChange?.(v);
    }
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(paint).observe(e);
  requestAnimationFrame(paint);
  return {
    el: e,
    get value() {
      return v;
    },
    set(nv: number) {
      v = nv;
      paint();
    },
  };
}

// ---------------------------------------------------------------- お知らせ（新しい画面用）
let toastEl: HTMLElement | null = null;
let toastOff: (() => void) | null = null;
/** お知らせ（上の帯のすぐ下に出る短い紙。160ms で出入りする）。いまの画面のお知らせ（p1/main.ts の toast）は、入のときこの見た目になる */
export function uxToast(msg: Kid, ms = 2200) {
  if (!toastEl) {
    toastEl = el('div.ux-toast.ux-root', { role: 'status', 'aria-live': 'polite' });
    document.body.append(toastEl);
  }
  toastEl.replaceChildren(el('div', msg));
  void toastEl.offsetWidth;
  toastEl.classList.add('is-on');
  toastOff?.();
  const e = toastEl;
  const id = setTimeout(() => e.classList.remove('is-on'), ms);
  toastOff = () => clearTimeout(id);
}
