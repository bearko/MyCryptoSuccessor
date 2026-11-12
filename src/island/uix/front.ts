/**
 * 段 UIX3f：前の層（docs/ISLAND_UIX.md「前の層」）。
 * 走査線（.ux-crt-lines）は、画面全体のいちばん上にかぶせた 1 枚。その下にある字には、どれも同じ線が乗る。
 * 画面ごとの主役のボタン（主のキー・承認のレバー・`ux-front` を付けた物）だけは、その 1 枚に同じ形の窓を開けて、
 * 線の乗らない、はっきりした見た目にする。背景と、読むだけの字には、今の演出が残る。
 * 「読むだけの字」と「押して動かす主役」が、線のある・なしで見分けられる。
 *
 * 作り：毎コマ、前の層の要素の位置を読み、走査線の 1 枚の clip-path（外側の四角＋窓。evenodd）を作り直す。
 * 変わったときだけ書きこむ。走査線が切のとき・前の層の要素が無いときは何もしない。
 */
import { wipeIsBusy } from './fx';

/**
 * 前の層に出すもの：主のキー（琥珀。1 画面に 1 つ）・承認のレバー・下の帯の主（経営企画）・
 * まだ移していない窓の「推奨」の選択肢（.isl-cardm-btn.is-rec）・画面が名指しした物（class `ux-front`）
 */
export const FRONT_SEL = '.ux-front, .ux-key--main, .ux-lever, #isl-ui.uxm-on .isl-tab.is-center, #isl-ui .isl-cardm-btn.is-rec';
/** 1 画面で前の層に出す数の上限（主役は少ないほど効く。多すぎる画面は、作りを見直す合図） */
export const FRONT_MAX = 12;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 2 つの四角の重なり（無ければ null） */
export function cross(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.w, b.x + b.w);
  const t = Math.min(a.y + a.h, b.y + b.h);
  return r - x > 0 && t - y > 0 ? { x, y, w: r - x, h: t - y } : null;
}

/** 画素の升目にそろえる（外へ広げない：窓がボタンの外にはみ出すと、まわりの線が欠けて見える） */
export function snap(b: Box): Box | null {
  // （+ 0：-0 を 0 にそろえる）
  const x = Math.ceil(b.x - 0.01) + 0;
  const y = Math.ceil(b.y - 0.01) + 0;
  const r = Math.floor(b.x + b.w + 0.01);
  const t = Math.floor(b.y + b.h + 0.01);
  return r - x >= 8 && t - y >= 8 ? { x, y, w: r - x, h: t - y } : null;
}

/** 走査線の 1 枚の形：画面いっぱいの四角から、窓を抜く（evenodd）。窓が無ければ空の文字（＝切り抜かない） */
export function holePath(W: number, H: number, boxes: readonly Box[]): string {
  if (!boxes.length) return '';
  let d = `M0 0H${W}V${H}H0Z`;
  for (const b of boxes) d += `M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z`;
  return d;
}

type Probe = (x: number, y: number) => Element | null;
export interface FrontEnv {
  W: number;
  H: number;
  /** その点でいちばん手前にある要素（document.elementFromPoint） */
  probe: Probe;
  /** 祖先のうち、はみ出しを切る箱（overflow が visible でない物）の中の四角 */
  clips: (el: Element) => Box[];
  /** 押せない設定（pointer-events: none）か。開いた直後など、手前にあっても probe に出ない */
  inert: (el: Element) => boolean;
  /** 見えているか（display・visibility・opacity） */
  shown: (el: Element) => boolean;
}

/**
 * 1 つの要素の形（見えている分だけ。画面や、はみ出しを切る箱の外は除く。無ければ null）
 */
export function shapeOf(el: Element, env: FrontEnv): Box | null {
  if (!env.shown(el)) return null;
  const r = el.getBoundingClientRect();
  let b: Box | null = { x: r.left, y: r.top, w: r.width, h: r.height };
  b = cross(b, { x: 0, y: 0, w: env.W, h: env.H });
  for (const c of env.clips(el)) {
    if (!b) return null;
    b = cross(b, c);
  }
  return b && snap(b);
}
/**
 * その形の所で、要素が手前にあるか。
 * 隠れている物（窓・別の札の下）に窓を開けると、手前の物の上に四角い「線の無い所」ができてしまうので、
 * 3 点（上・中・下）ともその要素が手前のときだけ開ける。
 */
export function onTop(el: Element, b: Box, env: FrontEnv): boolean {
  const cx = b.x + b.w / 2;
  const hit = (y: number) => {
    const top = env.probe(cx, y);
    return !!top && (top === el || el.contains(top));
  };
  if (hit(b.y + 3) && hit(b.y + b.h / 2) && hit(b.y + b.h - 3)) return true;
  // 押せない設定のあいだ（開いた直後の守りなど）は probe に出ない。見えているなら、手前にあるものとして開ける
  return env.inert(el);
}
/** 1 つの要素の窓（出さないときは null：見えていない・画面や箱の外・ほかの物に隠れている） */
export function boxOf(el: Element, env: FrontEnv): Box | null {
  const b = shapeOf(el, env);
  return b && onTop(el, b, env) ? b : null;
}

/** 前の層の候補の形（押せない物は除く。上限まで） */
export function frontShapes(els: Iterable<Element>, env: FrontEnv): { el: Element; box: Box }[] {
  const out: { el: Element; box: Box }[] = [];
  for (const el of els) {
    if ((el as HTMLButtonElement).disabled) continue;
    const box = shapeOf(el, env);
    if (box) out.push({ el, box });
    if (out.length >= FRONT_MAX) break;
  }
  return out;
}
/** いまの画面の窓の一覧（上限まで） */
export function frontBoxes(els: Iterable<Element>, env: FrontEnv): Box[] {
  return frontShapes(els, env)
    .filter((x) => onTop(x.el, x.box, env))
    .map((x) => x.box);
}

// ---------------------------------------------------------------- ここから下は画面（DOM）の側
const clipCache = new WeakMap<Element, boolean>();
/** はみ出しを切る箱か（overflow は、開いているあいだに変わらない前提で覚える） */
function clipsKids(a: Element): boolean {
  let v = clipCache.get(a);
  if (v === undefined) {
    const s = getComputedStyle(a);
    v = s.overflowX !== 'visible' || s.overflowY !== 'visible';
    clipCache.set(a, v);
  }
  return v;
}
function domClips(el: Element): Box[] {
  const out: Box[] = [];
  for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    if (!clipsKids(a)) continue;
    const r = a.getBoundingClientRect();
    // 切るのは枠の内側（padding box）
    out.push({ x: r.left + a.clientLeft, y: r.top + a.clientTop, w: a.clientWidth || r.width, h: a.clientHeight || r.height });
  }
  return out;
}
const domShown = (el: Element): boolean => {
  const e = el as HTMLElement & { checkVisibility?: (o?: object) => boolean };
  if (typeof e.checkVisibility === 'function') return e.checkVisibility({ visibilityProperty: true, opacityProperty: true, checkVisibilityCSS: true, checkOpacity: true });
  return !!e.offsetParent || e.getClientRects().length > 0;
};

let lines: HTMLElement | null = null;
let last = '';
let raf = 0;
/** 前のコマの候補の形（同じなら、手前かの確かめは PROBE_EVERY コマに 1 回で足りる） */
let lastShape = '';
let tick = 0;
/** 形が変わらないあいだ、手前かを確かめ直す間隔（コマ）。窓の上に別の窓が出たときの遅れは、長くてこのコマ数 */
export const PROBE_EVERY = 4;

const domEnv = (W: number, H: number): FrontEnv => ({
  W,
  H,
  probe: (x, y) => document.elementFromPoint(x, y),
  clips: domClips,
  inert: (el) => getComputedStyle(el).pointerEvents === 'none',
  shown: domShown,
});

/** 1 コマぶん：窓を作り直す（テストからも呼ぶ）。force：間引かずに確かめる */
export function syncFront(force = false): string {
  if (!lines) return '';
  const root = document.documentElement;
  let d = '';
  // 幕が出ているあいだは開けない（幕は probe に出ないので、幕の上に四角い窓が見えてしまう）
  if (root.classList.contains('is-crt') && !wipeIsBusy()) {
    const els = document.querySelectorAll(FRONT_SEL);
    if (els.length) {
      const W = root.clientWidth || window.innerWidth;
      const H = root.clientHeight || window.innerHeight;
      const env = domEnv(W, H);
      const shapes = frontShapes(els, env);
      const key = shapes.map((x) => `${x.box.x},${x.box.y},${x.box.w},${x.box.h}`).join(';');
      if (!force && key === lastShape && ++tick % PROBE_EVERY) return last;
      lastShape = key;
      d = holePath(W, H, shapes.filter((x) => onTop(x.el, x.box, env)).map((x) => x.box));
    } else lastShape = '';
  } else lastShape = '';
  if (d !== last) {
    last = d;
    lines.style.clipPath = d ? `path(evenodd, "${d}")` : '';
  }
  return d;
}

let hops = 0;
/** 列の最後へ並び直す間隔（コマ） */
const HOP_EVERY = 90;
function frame() {
  syncFront();
  // 位置を読むのは、ほかの毎コマの処理（地図の描画が、吹き出しを建物に合わせて動かす）のあとがよい。
  // rAF は申しこんだ順に呼ばれるので、ときどき 1 回だけ「このコマが終わってから」申しこみ直して、列の最後へ回る
  if (hops++ % HOP_EVERY === 0) setTimeout(() => (raf = requestAnimationFrame(frame)), 0);
  else raf = requestAnimationFrame(frame);
}

/** 走査線の 1 枚を渡して始める（boot.ts）。clip-path の path() が使えない環境では、何もしない（今までどおり全部に線が乗る） */
export function initFront(el: HTMLElement) {
  lines = el;
  last = '';
  lastShape = '';
  const ok = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('clip-path', 'path(evenodd, "M0 0H1V1H0Z")');
  if (!ok || raf || typeof requestAnimationFrame !== 'function') return;
  raf = requestAnimationFrame(frame);
}
