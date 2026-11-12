/**
 * 段 UIX3a：画面の部品（docs/ISLAND_UIX.md「画面の部品」）。土台の部品（parts.ts：キー・ランプ・計器・カウンター…）を組んだ、
 * 画面を作るときの決まった形。どの画面も同じ形で組むための物なので、同じ役目の部品を画面ごとに作らない。
 * 見出しの貼り札（節）・行・数字の札・タブ・一覧のカード・「あと N G」の目盛り・空のとき・選ぶ引き出し・紙のページ・
 * 縦の棒グラフ・順位の行・ヒーローの札・届いた印のランプ・下に貼りつく決めるキーの帯・打たれる札。
 * 見た目は sparts.css（class は uxp-）。本体（p1/）は読まない：絵（ヒーロー・商品）は、呼ぶ側が要素で渡す。
 */
import { isEn, t } from '../../i18n';
import { el, fmtN, type Kid } from './dom';
import { uxIcon } from './icons';
import { later } from './loop';
import { Odo, meterStep, press, rollNumber, shake, uxKey, uxLamp, uxMeter, uxTape, type KeyOpts, type LampKind, type OdoOpts, type TapeKind } from './parts';
import { isCalm } from './prefs';
import { uxSfx } from './sound';

/** タブの横送り（見本：520ms・8 段） */
export const UXP_TAB_MS = 520;
/** 引き出しの出入り（出る 260ms・しまう 180ms） */
export const UXP_DRAWER_IN_MS = 260;
export const UXP_DRAWER_OUT_MS = 180;
/** 札が打たれるまで（見本：420ms） */
export const UXP_STAMP_MS = 420;

/** 1 回きりの CSS の動きをやり直す */
export function uxpReplay(e: HTMLElement, cls: string) {
  e.classList.remove(cls);
  void e.offsetWidth;
  e.classList.add(cls);
}
const setText = (e: HTMLElement, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};
/**
 * 数字まじりの値：頭の数字（符号・桁区切り・小数・%・G）は数字の書体、うしろの言葉（万・個・人…）は日本語の書体で出す。
 * 数字の書体に無い字が、大きな代わりの字で出ないようにする
 */
export function uxpNum(text: string, cls = ''): HTMLElement {
  const m = /^([-+−±]?[\d,.]+(?:\s?[%GKM](?![a-z]))?)(.*)$/.exec(text);
  const c = cls ? '.' + cls : '';
  if (!m) return el(`span.uxp-num${c}`, text);
  return el(`span.uxp-num${c}`, el('span.ux-num', m[1]), m[2] ? el('span.uxp-num-u', m[2]) : null);
}

// ---------------------------------------------------------------- 見出しの貼り札（節）
export interface HeadOpts {
  kind?: TapeKind;
  /** 見出しの絵（icons.ts の名前） */
  ico?: string;
  /** 見出しの右に添える短い説明 */
  note?: Kid;
  /** 右端に置く物（数の札・小さなキーなど） */
  right?: Kid;
}
/** 見出しの貼り札（節）：貼り札 ＋ 右へ伸びる罫 ＋（あれば）右端の物。節のはじめに 1 つ */
export function uxpHead(title: Kid, o: HeadOpts = {}): HTMLElement {
  const dark = o.kind === 'dark';
  const ico = o.ico ? uxIcon(o.ico, { color: dark ? '#f4ecd4' : '#1a1c2e', hi: dark ? '#fffdf3' : '#1a1c2e', lo: dark ? '#0b0d17' : '#8a7f5c', scale: 1 }) : null;
  return el('div.uxp-head', { role: 'heading', 'aria-level': '3' }, uxTape([ico, typeof title === 'string' ? el('b', title) : title], o.kind ?? 'amber'), o.note ? el('span.uxp-head-note', o.note) : null, el('i.uxp-head-rule'), o.right ? el('span.uxp-head-right', o.right) : null);
}

// ---------------------------------------------------------------- 行（名前・値・添え書き）
export type Tone = '' | 'good' | 'bad' | 'amber' | 'dim';
export interface RowOpts {
  ico?: string;
  /** 値の下の小さな添え書き */
  note?: Kid;
  tone?: Tone;
  /** 値を数字の書体で出す（既定：値が文字列で、数字で始まるとき） */
  num?: boolean;
  cls?: string;
}
/** 行：名前 …… 値（点線でつなぐ）。添え書きは下の行に。暗い板の上でも紙の上でも使える（紙の上では墨の色になる） */
export function uxpRow(name: Kid, value: Kid, o: RowOpts = {}): HTMLElement {
  const isNum = o.num ?? (typeof value === 'string' && /^[-+−±]?[\d,.]/.test(value));
  const v = typeof value === 'string' || typeof value === 'number' ? (isNum ? uxpNum(String(value), 'uxp-row-v') : el('span.uxp-row-v', String(value))) : el('span.uxp-row-v', value);
  return el(
    `div.uxp-row${o.tone ? '.is-' + o.tone : ''}${o.cls ? '.' + o.cls : ''}`,
    el('span.uxp-row-main', el('span.uxp-row-k', o.ico ? uxIcon(o.ico, { scale: 1, color: '#97a1cf' }) : null, name), el('i.uxp-row-dots'), v),
    o.note ? el('span.uxp-row-note', o.note) : null,
  );
}

// ---------------------------------------------------------------- 数字の札（桁の回る計器つき）
export interface StatOpts extends OdoOpts {
  /** 同じ鍵で前に出した値を覚えていて、作り直しても前の値から回る（rollNumber） */
  key?: string;
  /** 数字の右の単位（G・個・人…） */
  unit?: string;
  ico?: string;
  /** 値が変わったぶんの「+N」を飛び出させる */
  plus?: boolean;
  tone?: Tone;
  /** 下の小さな添え書き */
  note?: Kid;
}
/** 数字の札：貼り札の名前 ＋ 桁の回るカウンター ＋ 単位。set(v) で桁が回る */
export function uxpStat(label: Kid, value: number, o: StatOpts = {}) {
  const digits = o.digits ?? Math.max(3, String(Math.max(0, Math.round(value))).length);
  const odo = o.key ? rollNumber(o.key, value, { ...o, digits, plus: o.plus }) : new Odo({ ...o, digits, value });
  const note = el('span.uxp-stat-note');
  if (o.note) note.append(...(Array.isArray(o.note) ? (o.note as Node[]) : [o.note as Node | string]));
  const e = el(`div.uxp-stat${o.tone ? '.is-' + o.tone : ''}`, el('span.uxp-stat-k', o.ico ? uxIcon(o.ico, { scale: 1, color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c' }) : null, label), el('span.uxp-stat-v', odo.el, o.unit ? el(`span.uxp-stat-u${/^[\x20-\x7e]+$/.test(o.unit) ? '.ux-num' : ''}`, o.unit) : null), o.note ? note : null);
  return {
    el: e,
    odo,
    /** 値を替える（桁が回る・音は 1 桁ごとの小さな刻み） */
    set(v: number, dur = 600) {
      if (Math.round(v) === odo.v) return;
      odo.set(v, { dur, onTick: () => uxSfx('tick') });
    },
    note(text: string) {
      setText(note, text);
    },
  };
}

// ---------------------------------------------------------------- タブ（520ms の横送り）
export interface TabDef<K extends string> {
  key: K;
  label: string;
  ico?: string;
  /** 中身（先に作ってある物） */
  pane?: HTMLElement;
  /** はじめて開くときに中身を作る */
  build?: (pane: HTMLElement) => void;
  /** 開くたびに呼ぶ（値を合わせ直す） */
  onShow?: (pane: HTMLElement) => void;
  /** 届いた印（赤いランプ。数を渡すと数も出す） */
  dot?: boolean | number;
  attrs?: Record<string, string>;
}
export interface TabsOpts<K extends string> {
  initial?: K;
  onChange?: (key: K) => void;
  /** 中身の高さを、内容に合わせる（札の中を縦に送る画面）。既定は、残りの高さいっぱいの窓（中を送る） */
  flow?: boolean;
  cls?: string;
}
/**
 * タブ：表示板が横へ「カタカタ」と送られる（520ms・8 段）。開いているタブはランプが点いて沈む。
 * 押してすぐ次の中身が読める（送りのあいだも中身は出ている）。動きを減らすときは、すぐ替わる
 */
export function uxpTabs<K extends string>(defs: TabDef<K>[], o: TabsOpts<K> = {}) {
  let now: K = o.initial ?? defs[0].key;
  let busy = false;
  const built = new Set<K>();
  const panes = new Map<K, HTMLElement>();
  const keys = defs.map((d) => {
    const lamp = uxLamp('', d.key === now);
    const dot = uxpDot(typeof d.dot === 'number' ? d.dot : d.dot ? 0 : null);
    const b = uxKey(el('span.ux-tab-l', lamp, d.ico ? el('span.uxp-tab-ico', uxIcon(d.ico, { scale: 1 })) : null, el('b', d.label), dot.el), () => set(d.key), {
      cls: 'ux-tab uxp-tab',
      attrs: { role: 'tab', 'aria-selected': String(d.key === now), 'aria-pressed': String(d.key === now), 'data-tab': d.key, 'data-ux-quiet': '', ...(d.attrs ?? {}) },
    });
    const pane = d.pane ?? el('div');
    pane.classList.add('ux-pane', 'uxp-pane');
    pane.setAttribute('role', 'tabpanel');
    pane.hidden = d.key !== now;
    panes.set(d.key, pane);
    return { d, b, lamp, dot };
  });
  const show = (k: K) => {
    const d = defs.find((x) => x.key === k)!;
    const pane = panes.get(k)!;
    if (!built.has(k)) {
      built.add(k);
      d.build?.(pane);
    }
    d.onShow?.(pane);
  };
  function set(key: K, instant = false) {
    if (key === now || busy || !panes.has(key)) return;
    const from = panes.get(now)!;
    const to = panes.get(key)!;
    const order = defs.map((d) => d.key);
    const dir = order.indexOf(key) > order.indexOf(now) ? 1 : -1;
    for (const x of keys) {
      const on = x.d.key === key;
      x.b.setAttribute('aria-selected', String(on));
      x.b.setAttribute('aria-pressed', String(on));
      x.lamp.classList.toggle('is-on', on);
    }
    now = key;
    uxSfx('tab');
    to.hidden = false;
    show(key);
    o.onChange?.(key);
    if (instant || isCalm() || typeof to.animate !== 'function') {
      from.hidden = true;
      return;
    }
    busy = true;
    uxSfx('page', { step: 5 });
    const opt: KeyframeAnimationOptions = { duration: UXP_TAB_MS, easing: 'steps(8, end)', fill: 'both' };
    from.classList.add('is-leaving');
    from.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-dir * 104}%,0,0)` }], opt);
    to.animate([{ transform: `translate3d(${dir * 104}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], opt).onfinish = () => {
      from.hidden = true;
      from.classList.remove('is-leaving');
      for (const a of from.getAnimations()) a.cancel();
      for (const a of to.getAnimations()) a.cancel();
      busy = false;
    };
  }
  const tabs = el('div.ux-tabs.uxp-tabs', { role: 'tablist' }, keys.map((x) => x.b));
  const body = el(`div.ux-tabbody.uxp-tabbody${o.flow ? '.is-flow' : ''}`, [...panes.values()]);
  const box = el(`div.uxp-tabbox${o.flow ? '.is-flow' : ''}${o.cls ? '.' + o.cls : ''}`, tabs, body);
  show(now);
  return {
    el: box,
    tabs,
    body,
    set,
    get now() {
      return now;
    },
    pane: (k: K) => panes.get(k)!,
    key: (k: K) => keys.find((x) => x.d.key === k)!.b,
    /** 届いた印を付け外しする（数を渡すと数も出す。null・false で消す） */
    dot(k: K, v: boolean | number | null) {
      keys.find((x) => x.d.key === k)?.dot.set(v === true ? 0 : v === false ? null : v);
    },
  };
}

// ---------------------------------------------------------------- 届いた印のランプ
/** 届いた印：赤いランプがまたたく。数を渡すと、数の札も添える。n：null＝出さない・0＝ランプだけ・1 以上＝数つき */
export function uxpDot(n: number | null = 0, kind: LampKind = 'bad') {
  const lamp = uxLamp(kind, true, true);
  const num = el('b.uxp-dot-n.ux-num');
  const e = el('span.uxp-dot', lamp, num);
  const set = (v: number | null) => {
    e.hidden = v == null;
    num.hidden = !v;
    setText(num, v ? (v > 99 ? '99+' : String(v)) : '');
    if (v == null) e.removeAttribute('aria-label');
    else e.setAttribute('aria-label', v ? t(`${v} 件`, `${v} new`) : t('お知らせあり', 'New'));
  };
  set(n);
  return { el: e, set };
}

// ---------------------------------------------------------------- 一覧のカード（絵・名前・説明・右にキー）
export interface CardOpts {
  /** 左の絵（ヒーロー・商品・アイコン。呼ぶ側が要素で渡す） */
  pic?: Kid;
  name: Kid;
  /** 名前の横の小さな札（貼り札・ランプなど） */
  tags?: Kid;
  desc?: Kid;
  /** 説明の下（値段・「あと N G」の目盛りなど） */
  foot?: Kid;
  /** 右に置く物（ふつうはキー） */
  right?: Kid;
  /** 右上の札（「おすすめ」など） */
  badge?: string;
  /** カード全体を押せるようにする（選ぶ一覧） */
  onTap?: (card: HTMLElement) => void;
  /** 選ばれている */
  selected?: boolean;
  /** 灰色（選べない・ほかで使っている） */
  off?: boolean;
  cls?: string;
  attrs?: Record<string, string>;
}
/**
 * 一覧のカード：絵・名前・説明・右にキー。onTap を渡すと、カード全体が押せる（選ぶ一覧。選ばれた物はランプが点いて琥珀の枠）。
 * 中にキーを置けるよう、button ではなく role=button の箱にしてある
 */
export function uxpCard(o: CardOpts): HTMLElement {
  const lamp = o.onTap ? uxLamp('', !!o.selected) : null;
  if (lamp) lamp.classList.add('uxp-card-lamp');
  const card = el(
    `div.uxp-card${o.off ? '.is-off' : ''}${o.selected ? '.is-sel' : ''}${o.right ? '.has-right' : ''}${o.cls ? '.' + o.cls.split(' ').join('.') : ''}`,
    { ...(o.attrs ?? {}) },
    o.pic ? el('span.uxp-card-pic', o.pic) : null,
    el('span.uxp-card-body', el('span.uxp-card-name', typeof o.name === 'string' ? el('b', o.name) : o.name, o.tags ?? null), o.desc ? el('span.uxp-card-desc', o.desc) : null, o.foot ? el('span.uxp-card-foot', o.foot) : null),
    o.right ? el('span.uxp-card-right', o.right) : null,
    lamp,
    o.badge ? el('span.uxp-card-badge.ux-tape.ux-tape--amber', o.badge) : null,
  );
  if (!o.pic) card.classList.add('no-pic');
  if (o.onTap) {
    card.classList.add('is-tap');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-pressed', String(!!o.selected));
    card.setAttribute('data-ux-quiet', '');
    press(card, () => o.onTap?.(card));
  }
  return card;
}
/** カードを選んだ形にする（ランプ・琥珀の枠・押し込まれた音と小さな揺れ）。feel：手応えを出す */
export function uxpSelect(card: HTMLElement, on: boolean, feel = false) {
  card.classList.toggle('is-sel', on);
  if (card.hasAttribute('aria-pressed')) card.setAttribute('aria-pressed', String(on));
  card.querySelector(':scope > .uxp-card-lamp')?.classList.toggle('is-on', on);
  if (on && feel) {
    uxSfx('toggle', { step: 1 });
    uxpReplay(card, 'is-pick');
  }
}

// ---------------------------------------------------------------- 「あと N G」の目盛り
/** 足りないときの目盛り（0.05〜1。1/20 刻み・少しは点ける） */
export const uxpGapRatio = (have: number, cost: number) => Math.max(0.05, meterStep(Math.max(0, have) / Math.max(1, cost)));
/** 「あと N G」の言葉（足りていれば null） */
export function uxpGapText(have: number, cost: number, unit = 'G'): string | null {
  const gap = Math.ceil(cost - have);
  if (gap <= 0) return null;
  return t(`あと ${fmtN(gap)} ${unit}`, `${fmtN(gap)} ${unit} to go`);
}
export interface GapOpts {
  unit?: string;
  /** 目盛りの下に添える一言（既定「売上がたまれば届きます」。'' で出さない） */
  hint?: string;
}
/**
 * 足りないとき：責めない言い方と目盛り（「あと N G」。赤い × で終わらせない）。足りているあいだは隠れる。
 * nudge()：足りないまま押したとき。やわらかい音・目盛りが 0 から今の所まで進む
 */
export function uxpGap(have: number, cost: number, o: GapOpts = {}) {
  const m = uxMeter(0);
  const txt = el('b.uxp-gap-t');
  const hint = el('span.uxp-gap-h', o.hint ?? t('売上がたまれば届きます', 'Sales will get you there'));
  const e = el('div.uxp-gap', { role: 'status' }, el('span.uxp-gap-top', uxIcon('coin', { scale: 1 }), txt), m.el, o.hint === '' ? null : hint);
  let h = have;
  let c = cost;
  const set = (have2: number, cost2: number) => {
    h = have2;
    c = cost2;
    const text = uxpGapText(h, c, o.unit);
    e.hidden = !text;
    if (!text) return;
    setText(txt, text);
    m.set(uxpGapRatio(h, c));
  };
  set(have, cost);
  return {
    el: e,
    meter: m,
    set,
    get short() {
      return !e.hidden;
    },
    nudge() {
      if (e.hidden) return;
      uxSfx('deny');
      m.set(0);
      uxpReplay(e, 'is-in');
      requestAnimationFrame(() => m.set(uxpGapRatio(h, c)));
    },
  };
}

/** 値段：金貨の絵 ＋ 数字（0 なら「無料」） */
export function uxpPrice(cost: number, unit = 'G'): HTMLElement {
  if (cost <= 0) return el('span.uxp-price.is-free', el('b', t('無料', 'Free')));
  return el('span.uxp-price', uxIcon('coin', { scale: 1 }), el('span.ux-num', `${fmtN(cost)} ${unit}`));
}

// ---------------------------------------------------------------- 空のとき
/** 空のとき：点線の枠・息をする絵・一言・（あれば）次に押すキー。「何も無い」で終わらせず、次の一手を添える */
export function uxpEmpty(text: Kid, o: { ico?: string; sub?: Kid; key?: Kid } = {}): HTMLElement {
  return el('div.uxp-empty', el('span.uxp-empty-ico', uxIcon(o.ico ?? 'list', { scale: 3, color: '#4a5486', hi: '#97a1cf', lo: '#20253d' })), el('span.uxp-empty-t', text), o.sub ? el('span.uxp-empty-s', o.sub) : null, o.key ?? null);
}

// ---------------------------------------------------------------- 下に貼りつく決めるキーの帯
/** 下に貼りつく帯：決めるキー（主のキー 1 つ）と、脇の弱いキー。送っても下に残る。主のキーは前の層に出る（front.ts） */
export function uxpFoot(...kids: Kid[]): HTMLElement {
  return el('div.uxp-foot', kids);
}

// ---------------------------------------------------------------- 選ぶ引き出し（下から出る・一覧・決めるキー）
export interface DrawerOpts {
  /** 入れる所（#isl-ui） */
  root: HTMLElement;
  title: string;
  note?: Kid;
  /** 見出しの絵 */
  ico?: string;
  cls?: string;
  /** しまったあと（✕・外側・Esc・close() のどれでも 1 回） */
  onClose?: () => void;
  /** 決めるキー（下に貼りつく帯の主のキー）。無ければ帯を出さない */
  decide?: { label: string; onDecide: () => void; ico?: string };
  /** 帯の左に置く弱いキー（「外す」「並べない」など） */
  side?: HTMLElement | null;
}
/**
 * 選ぶ引き出し：下から出る板（260ms）・一覧・下に貼りつく決めるキー。外側・✕・Esc でしまう（180ms）。
 * いまの引き出しと同じ目印（.isl-picker）を付けるので、開いているあいだの時間の止め方・チュートリアルの待ち方は今のまま。
 * decide.label は setDecide で替えられる（選んだ物の名前を入れる）。選ぶまでは押せない
 */
export function uxpDrawer(o: DrawerOpts) {
  let closed = false;
  const body = el('div.uxp-drawer-body');
  const noteEl = el('p.uxp-drawer-note');
  if (o.note) noteEl.append(...(Array.isArray(o.note) ? (o.note as Node[]) : [o.note as Node | string]));
  const closeKey = uxKey(el('span.ux-vh', t('閉じる', 'Close')), () => close(), { ico: 'close', cls: 'ux-sheet-x uxp-drawer-x', attrs: { 'aria-label': t('閉じる', 'Close') } });
  const decideLabel = el('b', o.decide?.label ?? '');
  let decideFn = o.decide?.onDecide;
  const decideKey = o.decide
    ? uxKey(decideLabel, () => decideFn?.(), { kind: 'main', big: true, ico: o.decide.ico ?? 'check', cls: 'uxp-decide', strong: true, disabled: true, attrs: { 'data-ux-quiet': '' } })
    : null;
  const pickName = el('span.uxp-foot-pick');
  const foot = o.decide || o.side ? uxpFoot(o.side ?? null, el('span.uxp-foot-main', pickName, decideKey)) : null;
  const box = el(
    'div.uxp-drawer-box.ux-plate',
    { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title },
    el('div.ux-screws'),
    el('div.uxp-drawer-grip', { 'aria-hidden': 'true' }),
    el('div.uxp-drawer-head', o.ico ? uxIcon(o.ico, { scale: 2 }) : null, el('h3', o.title), closeKey),
    o.note ? noteEl : null,
    body,
    foot,
  );
  // 今の目印（.isl-picker）を残す：本体は、これがあるあいだ時間を止め、会話を待たせる
  const e = el(`div.isl-picker.uxp-drawer.ux-root${o.cls ? '.' + o.cls.split(' ').join('.') : ''}`, box);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && e.isConnected && !e.querySelector('.uxp-drawer-over')) {
      ev.stopPropagation();
      close();
    }
  };
  function close() {
    if (closed) return;
    closed = true;
    removeEventListener('keydown', onKey, true);
    uxSfx('close');
    const done = () => {
      e.remove();
      o.onClose?.();
    };
    if (isCalm() || !e.isConnected) return done();
    e.classList.add('is-out');
    later(UXP_DRAWER_OUT_MS, done);
  }
  e.addEventListener('click', (ev) => {
    ev.stopPropagation();
    if (ev.target === e) close();
  });
  addEventListener('keydown', onKey, true);
  o.root.append(e);
  uxSfx('open');
  return {
    el: e,
    box,
    body,
    foot,
    note: noteEl,
    decideKey,
    close,
    get closed() {
      return closed;
    },
    /** すぐ消す（しまう動きを待たない：決めたあと、次の画面をすぐ出すとき） */
    drop() {
      if (closed) return;
      closed = true;
      removeEventListener('keydown', onKey, true);
      e.remove();
      o.onClose?.();
    },
    /**
     * 決めるキーの様子を替える：label＝キーの字・name＝選んだ物の名前（キーの左に出す）・on＝押せるか・fn＝押したとき。
     * 押せるようになった瞬間に、キーが 1 回光る
     */
    setDecide(p: { label?: string; name?: Kid; on?: boolean; fn?: () => void; kind?: 'main' | 'danger' | '' }) {
      if (!decideKey) return;
      if (p.label != null) setText(decideLabel, p.label);
      if (p.fn) decideFn = p.fn;
      if (p.name !== undefined) {
        pickName.replaceChildren();
        if (p.name != null && p.name !== false) pickName.append(...(Array.isArray(p.name) ? (p.name as Node[]) : [p.name as Node | string]));
      }
      if (p.on != null) {
        const was = !decideKey.disabled;
        decideKey.disabled = !p.on;
        const kind = p.kind ?? 'main';
        decideKey.className = `ux-key ux-key--big uxp-decide ${p.on ? (kind ? 'ux-key--' + kind : '') : 'ux-key--flat'}`.trim();
        if (p.on && !was) uxpReplay(decideKey, 'is-ready');
      }
    },
  };
}
export type UxpDrawer = ReturnType<typeof uxpDrawer>;

// ---------------------------------------------------------------- 紙のページ
/** 紙のページ：読ませる面（紙に墨）。両端に送りの穴。中の行・見出し・数字は墨の色になる。plain：穴なし（小さな紙きれ） */
export function uxpPaper(o: { plain?: boolean; cls?: string } | Kid = {}, ...kids: Kid[]): HTMLElement {
  const isOpt = !!o && typeof o === 'object' && !(o instanceof Node) && !Array.isArray(o);
  const opt = (isOpt ? o : {}) as { plain?: boolean; cls?: string };
  return el(`div.uxp-paper${opt.plain ? '.is-plain' : ''}${opt.cls ? '.' + opt.cls : ''}`, isOpt ? null : (o as Kid), kids);
}
/**
 * 印字：行が上から順に打たれていく（1 行 70ms ずつ。押すと全部すぐ出る）。lines は紙の中の行の要素。
 * 動きを減らすときは、全部すぐ出る。返した finish() で残りをすぐ出す
 */
export function uxpPrint(lines: HTMLElement[], o: { gap?: number; sound?: boolean; onDone?: () => void } = {}) {
  let done = false;
  const offs: (() => void)[] = [];
  for (const l of lines) l.classList.add('ux-rl');
  const finish = () => {
    if (done) return;
    done = true;
    for (const f of offs) f();
    for (const l of lines) l.classList.add('is-on');
    o.onDone?.();
  };
  if (isCalm()) finish();
  else {
    lines.forEach((l, i) =>
      offs.push(
        later(i * (o.gap ?? 70), () => {
          l.classList.add('is-on');
          if (o.sound !== false) uxSfx('tick');
          if (i === lines.length - 1) finish();
        }),
      ),
    );
    if (!lines.length) finish();
  }
  return {
    finish,
    get done() {
      return done;
    },
  };
}

// ---------------------------------------------------------------- 縦の棒グラフ
export interface BarDef {
  label: string;
  value: number;
  /** 棒の上の字（既定は値を短く：1.2万） */
  text?: string;
  /** main＝琥珀（主役）・good・bad・dash＝見込み（点線）。負の値は斜線 */
  kind?: '' | 'main' | 'good' | 'bad' | 'dash';
}
/** 棒の上に出す短い数（1,234 → 1,234・12,345 → 1.2万／12.3K） */
export function uxpShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a < 10000) return sign + fmtN(a);
  const man = t('万', '');
  const oku = t('億', '');
  if (!isEn) return a < 1e8 ? sign + (a / 1e4).toFixed(a < 1e6 ? 1 : 0) + man : sign + (a / 1e8).toFixed(1) + oku;
  return a < 1e6 ? `${sign}${(a / 1e3).toFixed(a < 1e5 ? 1 : 0)}K` : `${sign}${(a / 1e6).toFixed(1)}M`;
}
/** きりのよい上限（1・2・5 × 10^n） */
export function uxpNiceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
/**
 * 縦の棒グラフ（グラフは縦。順位だけ横）：棒は下から 8 段で伸びる（520ms）。値は棒の上、名前は下。
 * 色だけに頼らない：負の値は斜線・見込みは点線。grow() で伸ばす（画面に入れたあとに呼ぶ。既定で次のコマに自分で伸びる）
 */
export function uxpBars(items: BarDef[], o: { max?: number; height?: number; auto?: boolean; cls?: string } = {}) {
  const max = o.max ?? uxpNiceMax(Math.max(1, ...items.map((x) => Math.abs(x.value))));
  const cols = items.map((x) => {
    const r = Math.max(0, Math.min(1, Math.abs(x.value) / max));
    const bar = el(`i.uxp-bar${x.kind ? '.is-' + x.kind : ''}${x.value < 0 ? '.is-neg' : ''}`, { style: { height: `${Math.max(x.value ? 2 : 0, Math.round(r * 50) * 2)}%` } });
    return el('span.uxp-bar-col', uxpNum(x.text ?? uxpShort(x.value), 'uxp-bar-v'), el('span.uxp-bar-plot', bar), el('span.uxp-bar-l', x.label));
  });
  const e = el(`div.uxp-bars${items.length > 6 ? '.is-many' : ''}${o.cls ? '.' + o.cls : ''}`, { role: 'img', 'aria-label': items.map((x) => `${x.label} ${fmtN(x.value)}`).join(' / ') }, cols);
  if (o.height) e.style.height = `${o.height}px`;
  const grow = () => e.classList.add('is-grown');
  if (o.auto !== false) requestAnimationFrame(() => requestAnimationFrame(grow));
  return { el: e, grow, max };
}

// ---------------------------------------------------------------- 順位の行
export interface RankOpts {
  n: number;
  name: Kid;
  /** 右の値（売上など） */
  value: string;
  /** 横の棒（0〜1） */
  ratio: number;
  /** わが社（琥珀の面・墨の棒） */
  me?: boolean;
  /** 名前の下の添え書き */
  note?: Kid;
  pic?: Kid;
}
/** 順位の行（順位だけは横の棒）：順位の数字・名前・横の棒・値。わが社の行は琥珀。1 位は王冠 */
export function uxpRank(o: RankOpts): HTMLElement {
  const bar = el('i');
  bar.style.transform = `scaleX(${meterStep(o.ratio, 50)})`;
  return el(
    `div.uxp-rank${o.me ? '.is-me' : ''}${o.n === 1 ? '.is-top' : ''}`,
    el('span.uxp-rank-n.ux-num', o.n === 1 ? uxIcon('crown', { scale: 1, color: o.me ? '#1a1c2e' : '#ffb81f', hi: o.me ? '#1a1c2e' : '#ffe394', lo: o.me ? '#7a3f06' : '#b8650d' }) : null, String(o.n)),
    o.pic ? el('span.uxp-rank-pic', o.pic) : null,
    el('span.uxp-rank-body', el('span.uxp-rank-name', o.name), el('span.uxp-rank-bar', bar), o.note ? el('span.uxp-rank-note', o.note) : null),
    el('span.uxp-rank-v.ux-num', o.value),
  );
}

// ---------------------------------------------------------------- ヒーローの札
export interface HeroOpts {
  name?: Kid;
  /** 名前の下（役目・適性・ひと言） */
  sub?: Kid;
  /** 絵の倍率（もとの 64px の整数倍。既定 1）。にじませない */
  scale?: 1 | 2 | 3;
  /** 窓の大きさ（px。絵より小さいと、顔のまわりだけを切り取って見せる：48 など）。既定は絵と同じ */
  win?: number;
  /** 名前の横の札（Lv・適性の段など） */
  tags?: Kid;
  /** 息をする（待っている人） */
  breathe?: boolean;
  /** 灰色（休憩中・ほかの担当） */
  off?: boolean;
  /** 窓の右下に重ねる小さな印（ランプ・アイコン） */
  mark?: Kid;
}
/**
 * ヒーローの顔の窓だけ（暗い窓にドット絵。整数倍・にじませない・flex の子でも伸びない）。
 * sprite：ヒーローの絵の要素（本体の heroIcon が返す物。呼ぶ側が渡す）
 */
export function uxpFace(sprite: HTMLElement, o: Pick<HeroOpts, 'scale' | 'win' | 'breathe' | 'off' | 'mark'> = {}): HTMLElement {
  const px = 64 * (o.scale ?? 1);
  const win = o.win ?? px;
  sprite.style.width = `${px}px`;
  sprite.style.height = `${px}px`;
  sprite.classList.add('ux-hero');
  const face = el(`span.uxp-face${o.breathe ? '.is-breathe' : ''}${o.off ? '.is-off' : ''}`, { style: { width: `${win}px`, height: `${win}px` } }, el('span.uxp-face-in', { style: { width: `${px}px`, height: `${px}px`, marginLeft: `${Math.round((win - px) / 4) * 2}px` } }, sprite), o.mark ? el('span.uxp-face-mark', o.mark) : null);
  return face;
}
/** ヒーローの札：顔の窓 ＋ 名前の貼り札 ＋ 添え書き。一覧のカードの絵（pic）に uxpFace、人の紹介に uxpHero */
export function uxpHero(sprite: HTMLElement, o: HeroOpts = {}): HTMLElement {
  return el(`div.uxp-hero${o.off ? '.is-off' : ''}`, uxpFace(sprite, o), el('span.uxp-hero-body', o.name ? el('span.uxp-hero-name', uxTape(typeof o.name === 'string' ? el('b', o.name) : o.name), o.tags ?? null) : null, o.sub ? el('span.uxp-hero-sub', o.sub) : null));
}

// ---------------------------------------------------------------- 打たれる札（導入済・承認済・決定）
/**
 * 打たれる札：決めたあとに「導入済」「承認済」「決定」が打たれる（200ms・4 段。音と小さな揺れ）。
 * はじめは隠れている。hit() で打つ（shakeEl：一緒に揺らす箱）。show()：打つ動きなしで出す（もう決めてある物）
 */
export function uxpStamp(label: string, o: { kind?: TapeKind; ico?: string | null } = {}) {
  const e = el(`span.uxp-stamp.ux-tape.ux-tape--${o.kind ?? 'good'}`, { hidden: true }, o.ico === null ? null : uxIcon(o.ico ?? 'check', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#1a1c2e', scale: 1 }), el('b', label));
  return {
    el: e,
    show() {
      e.hidden = false;
    },
    hide() {
      e.hidden = true;
      e.classList.remove('is-new');
    },
    hit(shakeEl?: Element | null) {
      e.hidden = false;
      uxpReplay(e, 'is-new');
      uxSfx('confirm');
      shake(shakeEl ?? null);
    },
  };
}

/** 小さな選びのキーの列（2〜4 個から 1 つ。選んだキーは沈んで明るい面） */
export function uxpSeg<V extends string | number>(items: { value: V; label: string; ico?: string }[], value: V, onChange: (v: V) => void, o: { label?: string; cls?: string } = {}) {
  let v = value;
  const keys = items.map((it) =>
    uxKey(it.label, () => set(it.value, true), { ico: it.ico, cls: 'uxp-seg-key', attrs: { 'aria-pressed': String(it.value === v), 'data-ux-quiet': '' } } as KeyOpts),
  );
  function set(nv: V, user = false) {
    if (nv === v) return;
    v = nv;
    keys.forEach((k, i) => k.setAttribute('aria-pressed', String(items[i].value === v)));
    if (user) {
      uxSfx('toggle', { step: 1 });
      onChange(v);
    }
  }
  return {
    el: el(`div.uxp-seg${o.cls ? '.' + o.cls : ''}`, { role: 'group', 'aria-label': o.label ?? '' }, keys),
    get value() {
      return v;
    },
    set,
  };
}
