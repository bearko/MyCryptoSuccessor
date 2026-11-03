/**
 * ドット絵のエフェクトの層（pixelfx。docs/ISLAND_FX.md）。指定の場所で 1 回鳴らす：playFx(id, x, y, opts)。
 *
 * - 効果ごとに小さなキャンバスを 1 枚置き、image-rendering: pixelated で整数倍に拡大する（デバイスの画素で整数倍）。
 * - 層は 2 つ：'map'（地図の上・UI の下。地図のマスに付く効果）と 'ui'（いちばん上。お祝い）。どちらも pointer-events: none で、押す場所を隠さない。
 * - 動いている効果が無いときは、何も描かない（requestAnimationFrame も止める）。描くのは 30 コマ/秒まで。
 * - 設定の「演出：ふつう／控えめ／なし」（段 FX2。fxLevel）：控えめは花火・紙吹雪を出さず、光だけ小さく。なしは効果の層を出さない。
 *   端末の「動きを減らす」（prefers-reduced-motion: reduce）は「なし」を初期値にする。画面を押すと 'ui' の効果はすぐ薄れて消える（待たせない）。
 * - 明るい地図の上でも読めるように、色のドットの外側に 1px の濃い縁（ink）を付け、光（加算）は弱めにする。
 * - 要素の後ろに描く（host。段 FX2）：札・窓の中で、絵の後ろに光の柱・光の放射を置く。
 * - 間引き（thin。段 FX2）：小さな手応えは、同じ組で 1 秒に 1 つまで（続けて来たら、あとのものは出さない）。
 */
import { EFFECTS, clearFrame, composite, createFrame, createFx, type FxFrame, type FxId, type FxInstance } from './registry.js';

export type FxLayer = 'map' | 'ui';

/** ゲームの色（scripts/pixel/palette.mjs から。暗い → 明るい） */
export const FX_PAL = {
  /** 灯りの金（お金・研究・発見） */
  gold: ['#3d1e17', '#704536', '#b55f1d', '#d4892f', '#f2b844', '#ffdb57', '#f7f0bc', '#ffffff'],
  /** 自社の青緑 */
  ours: ['#196270', '#299091', '#3db3a3', '#55d4b0', '#94d2e0', '#c4eaf2', '#ffffff'],
  /** 紙吹雪（屋根・灯り・木の葉・自社・海） */
  party: ['#ed6f68', '#e89e76', '#ffdb57', '#81b569', '#55d4b0', '#94d2e0', '#82a8bf'],
  /** 花火の芯（金。7 段） */
  core: ['#704536', '#b55f1d', '#d4892f', '#f2b844', '#ffdb57', '#f7f0bc', '#ffffff'],
  /** 木の葉と草（復興の芽。葉 leaf ＋ 草地 grass ＋ 畑 field ＋ 砂の白） */
  leaf: ['#215227', '#215227', '#367335', '#59944d', '#81b569', '#bfd49d', '#e8e78e', '#f7f0bc'],
  /** 花びら（屋根の赤 roofA ＋ 砂の白） */
  petal: ['#852c2c', '#c7735a', '#e89e76', '#f7f0bc'],
  /** 花の芯（灯り lantern ＋ 砂の白） */
  heart: ['#b55f1d', '#f2b844', '#ffdb57', '#f7f0bc'],
  /** 土ぼこりと岩（道 road ＋ 幹 trunk の影。ダンジョンの入り口） */
  dust: ['#704536', '#b38e76', '#c7ac8f', '#dbcaab', '#f0e6c9'],
  /** 灰色の煙（中立 neutral ＋ 広場 plaza。他社の撤退） */
  smoke: ['#574541', '#786861', '#998d85', '#bab4ad', '#e0d6c1', '#ffffff'],
} as const;

/**
 * レアリティの色（光の柱。暗い → 明るい）。Common〜Rare は palette.mjs のランプ（中立・葉と草・海と窓）から、Legendary は gold。
 * Epic の紫は palette.mjs に無いので、ゲームのレアリティの色（game/catalog.ts の RARITY_COLOR.Epic #c77dff）を中心に作ったランプ。
 */
export const FX_RARITY: Record<string, readonly string[]> = {
  Common: ['#574541', '#786861', '#998d85', '#bab4ad', '#e0d6c1', '#f2eedf', '#fffcf0', '#ffffff'],
  Uncommon: ['#215227', '#367335', '#59944d', '#81b569', '#bfd49d', '#e8e78e', '#f7f0bc', '#ffffff'],
  Rare: ['#2e365c', '#3c547d', '#557b9e', '#73a6bf', '#94d2e0', '#c4eaf2', '#ffffff'],
  Epic: ['#2e1f4a', '#4b2c73', '#6f3fa3', '#9a5bd6', '#c77dff', '#e2b8ff', '#f6e8ff', '#ffffff'],
  Legendary: FX_PAL.gold,
};

/** 1 つの色から 7 段のランプ（暗い → 明るい）：ほぼ黒の縁の色 #181818 と白へ混ぜる。部門の色（data.ts の DEPT の color）の花火に */
export function rampOf(hex: string): string[] {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mix = (to: number, k: number) => `#${c.map((v) => Math.round(v + (to - v) * k).toString(16).padStart(2, '0')).join('')}`;
  return [mix(24, 0.7), mix(24, 0.45), mix(24, 0.2), hex.toLowerCase(), mix(255, 0.35), mix(255, 0.65), '#ffffff'];
}

export interface PlayOpts {
  /** 'ui'（既定）か 'map' */
  layer?: FxLayer;
  /** 1 ドットを何 CSS px で描くか（既定：ui は 2・スマホは 4/3、map は 1）。デバイスの画素で整数倍になるように丸める */
  scale?: number;
  palette?: readonly string[];
  seed?: number;
  flip?: boolean;
  /** 光の強さ（既定：map 0.4・ui 0.7） */
  light?: number;
  /** 外側の濃い縁（既定 true） */
  ink?: boolean;
  /** 置く位置を上下にずらす（効果のドットで。負は上）。効果の原点が中心でないとき（collect-burst は原点の 30 ドット上で光る） */
  dy?: number;
  /** この時間（ms）で薄れて終わる。ループする効果（loot-beam・sunburst など）は既定 2000。1 回きりの効果は最後まで */
  life?: number;
  /** 鳴らすまでの待ち（ms） */
  delay?: number;
  /** 地図のマスに付いて動く：毎コマ画面の位置を返す（null なら隠す） */
  anchor?: () => { x: number; y: number } | null;
  /** 効果ごとの設定（core など） */
  opts?: Record<string, unknown>;
  /**
   * 要素の後ろに描く（段 FX2）：host の中にキャンバスを入れ、host の中身（絵・文字）の後ろ・host の背景の上に描く。
   * このとき (x, y) は host の左上からの CSS px。host は position が static でないこと（中で absolute に置く）。host が外されたら消える
   */
  host?: HTMLElement;
  /** 間引きの組（段 FX2）：同じ組の効果は THIN_MS（1 秒）に 1 つまで。続けて来たら出さない（false を返す） */
  thin?: string;
}

interface Live {
  id: FxId;
  layer: FxLayer;
  inst: FxInstance;
  frame: FxFrame;
  img: ImageData;
  cv: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  x: number;
  y: number;
  dy: number;
  css: number;
  ink: boolean;
  wait: number;
  age: number;
  life: number;
  anchor?: PlayOpts['anchor'];
  host?: HTMLElement;
}

const MAX = 8;
/** 描く間隔（ms）。重い端末では 1 コマの時間（cost。ならした値）に応じて 30 → 20 → 15 コマ/秒に落とす（動きの速さは変わらない） */
const stepOf = (cost: number) => (cost > 16 ? 1000 / 15 : cost > 9 ? 1000 / 20 : 1000 / 30);
let cost = 0;
const INK = 0xff181818;
const live: Live[] = [];
const roots: Partial<Record<FxLayer, HTMLDivElement>> = {};
let raf = 0;
let last = 0;
let enabled = true;
/** 計測（撮影スクリプト用）：描いたコマ数・合計と最大の時間（ms）・同時の最大数 */
const stats = { frames: 0, total: 0, max: 0, peak: 0, played: 0 };

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 演出の強さ（段 FX2）：ふつう（full）・控えめ（calm：花火・紙吹雪を出さず、光だけ小さく）・なし（off） */
export type FxLevel = 'full' | 'calm' | 'off';
export const FX_LEVELS: FxLevel[] = ['full', 'calm', 'off'];
const FX_KEY = 'isl.fxLevel';
/** 控えめで出さない効果（大きなお祝い：花火・紙吹雪・光の柱） */
export const LOUD: readonly FxId[] = ['firework-burst', 'confetti', 'loot-beam'];
/** 間引きの間（ms）：同じ組の小さな手応えは、この間に 1 つまで */
export const THIN_MS = 1000;

/**
 * 演出の強さで、効果をどう出すか（純関数。テストする）：null は出さない。
 * なし → 何も出さない。控えめ → 大きなお祝い（LOUD）は出さない・ほかは 1 ドット 3/4・光は半分。ふつう → そのまま
 */
export function fxPlan(id: FxId, lv: FxLevel): { scale: number; light: number } | null {
  if (lv === 'off') return null;
  if (lv === 'calm') return LOUD.includes(id) ? null : { scale: 0.75, light: 0.5 };
  return { scale: 1, light: 1 };
}
/**
 * 間引き（純関数。テストする）：組 key の前に出した時刻 last から THIN_MS 経っていなければ false（出さない）。
 * 出せるときは last を now に書き換えて true
 */
export function thinOk(last: Map<string, number>, key: string, now: number, ms = THIN_MS): boolean {
  const t0 = last.get(key);
  if (t0 != null && now - t0 < ms) return false;
  last.set(key, now);
  return true;
}
const thinLast = new Map<string, number>();
let level: FxLevel | null = null;
/** いまの演出の強さ（覚えていなければ、端末の「動きを減らす」なら「なし」・ほかは「ふつう」） */
export function fxLevel(): FxLevel {
  if (level) return level;
  let v: string | null = null;
  try {
    v = localStorage.getItem(FX_KEY);
  } catch {
    // 読めなければ初期値
  }
  level = FX_LEVELS.includes(v as FxLevel) ? (v as FxLevel) : reduced() ? 'off' : 'full';
  return level;
}
/** 演出の強さを変える（このブラウザに覚える）。なしにしたら、いま出ている効果も消す */
export function setFxLevel(v: FxLevel) {
  level = v;
  try {
    localStorage.setItem(FX_KEY, v);
  } catch {
    // 覚えられなくても切り替える
  }
  if (v === 'off') for (const x of live.splice(0)) x.cv.remove();
}
const phone = () => innerWidth < 600;

function rootOf(layer: FxLayer): HTMLDivElement {
  let r = roots[layer];
  if (r) return r;
  r = document.createElement('div');
  r.className = `isl-fx isl-fx-${layer}`;
  r.setAttribute('aria-hidden', 'true');
  // 地図の層は UI（#isl-ui）の前に入れて、UI の下に描く。ui の層は最後（いちばん上）
  const ui = document.getElementById('isl-ui');
  if (layer === 'map' && ui) ui.before(r);
  else document.body.append(r);
  roots[layer] = r;
  if (layer === 'ui') bindSkip();
  return r;
}
let skipBound = false;
function bindSkip() {
  if (skipBound) return;
  skipBound = true;
  window.addEventListener('pointerdown', skipUi, { capture: true, passive: true });
}
/** 画面を押したら、お祝いの効果はすぐ薄れて消える（出てすぐの 0.2 秒は、その効果を出した押しなので除く） */
function skipUi() {
  for (const x of live) if (x.layer === 'ui' && x.wait <= 0 && x.age > 0.2) x.inst.stop();
}

/** 効果を出せるか（演出「なし」・止めているとき・画面が無いときは出さない。「動きを減らす」は演出の初期値「なし」で） */
export function fxOn(): boolean {
  return enabled && typeof document !== 'undefined' && fxLevel() !== 'off';
}
/** 効果を止める・戻す（撮影の比べ用） */
export function setFxEnabled(v: boolean) {
  enabled = v;
  if (!v) for (const x of live.splice(0)) x.cv.remove();
}

/**
 * 効果 id を画面の (x, y)（CSS px。効果の原点＝足もと・中心）で 1 回鳴らす。出したら true。
 * 地図のマスに付けるときは anchor で毎コマの位置を渡す。
 */
export function playFx(id: FxId, x: number, y: number, o: PlayOpts = {}): boolean {
  if (!fxOn()) return false;
  // 控えめ：花火・紙吹雪・光の柱は出さない。ほかは小さく
  const plan = fxPlan(id, fxLevel());
  if (!plan) return false;
  const mod = EFFECTS[id];
  if (!mod) return false;
  if (o.host && !o.host.isConnected) return false;
  // 小さな手応えの間引き（同じ組は 1 秒に 1 つまで）
  if (o.thin && !thinOk(thinLast, o.thin, performance.now())) return false;
  const layer = o.layer ?? 'ui';
  // 同じ層が多すぎたら、いちばん古いものから消す
  const mine = live.filter((v) => v.layer === layer);
  if (mine.length >= MAX) drop(mine[0]);
  const [w, h] = mod.meta.size;
  const [ox, oy] = mod.meta.origin;
  // 控えめ：光は半分の強さ・小さく（1 ドットの大きさを 3/4。整数倍の丸めは下で）
  const light = (o.light ?? (layer === 'map' ? 0.4 : 0.7)) * plan.light;
  const opts: Record<string, unknown> = { x: ox, y: oy, light, ...(o.opts ?? {}) };
  if (o.palette) opts.palette = [...o.palette];
  if (o.seed != null) opts.seed = o.seed;
  if (o.flip) opts.flip = true;
  const inst = createFx(mod, opts);
  const dpr = window.devicePixelRatio || 1;
  const want = (o.scale ?? (layer === 'map' ? 1 : phone() ? 4 / 3 : 2)) * plan.scale;
  const css = Math.max(1, Math.round(want * dpr)) / dpr;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  cv.className = 'isl-fx-cv';
  cv.style.width = `${w * css}px`;
  cv.style.height = `${h * css}px`;
  cv.style.visibility = 'hidden';
  const g = cv.getContext('2d');
  if (!g) return false;
  if (o.host) {
    // 要素の後ろ：host を重なりの基準にして（isolation）、中身の後ろ・背景の上に（z-index: -1）
    o.host.classList.add('isl-fx-host');
    cv.classList.add('is-behind');
    o.host.prepend(cv);
    if (layer === 'ui') bindSkip();
  } else rootOf(layer).append(cv);
  const v: Live = { id, layer, inst, frame: createFrame(w, h), img: g.createImageData(w, h), cv, g, x, y, dy: o.dy ?? 0, css, ink: o.ink ?? true, wait: (o.delay ?? 0) / 1000, age: 0, life: (o.life ?? (mod.meta.loop ? 2000 : Infinity)) / 1000, anchor: o.anchor, host: o.host };
  live.push(v);
  stats.played++;
  stats.peak = Math.max(stats.peak, live.length);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  return true;
}

/** 要素のまんなか（at：'top' なら上の辺のまんなか）で鳴らす */
export function fxAtEl(id: FxId, el: Element | null, o: PlayOpts & { at?: 'center' | 'top' | 'bottom' } = {}): boolean {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return false;
  const y = o.at === 'top' ? r.top : o.at === 'bottom' ? r.bottom : r.top + r.height / 2;
  return playFx(id, r.left + r.width / 2, y, o);
}

/**
 * 温める：初めて鳴らしたときの引っかかり（スマホで 1 コマ数百 ms。JS の最初のコンパイル）を、暇なときに先に済ませる。
 * 効果を 1 つずつ、画面に出さずに数コマ回す（requestIdleCallback。無ければ setTimeout）
 */
let warmed = false;
export function warmFx() {
  if (warmed || !fxOn()) return;
  warmed = true;
  const ids = Object.keys(EFFECTS) as FxId[];
  const ric = (window as { requestIdleCallback?: Window['requestIdleCallback'] }).requestIdleCallback;
  const idle = (fn: () => void) => (ric ? ric.call(window, fn, { timeout: 4000 }) : window.setTimeout(fn, 200));
  const next = () => {
    const id = ids.shift();
    if (!id) return;
    const mod = EFFECTS[id];
    const [w, h] = mod.meta.size;
    const inst = createFx(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1] });
    const f = createFrame(w, h);
    const out = new Uint8ClampedArray(w * h * 4);
    for (let k = 0; k < 8; k++) {
      inst.update(0.1);
      clearFrame(f);
      inst.draw(f);
      ink(f);
      edgeFade(f);
      composite(f, out, null);
    }
    idle(next);
  };
  idle(next);
}

/** 層の効果をすべて消す（層を省くと全部） */
export function clearFx(layer?: FxLayer) {
  for (const x of [...live]) if (!layer || x.layer === layer) drop(x);
}

/** 計測（撮影スクリプト用）：reset で数え直す */
export function fxStats(reset = false) {
  const r = { active: live.length, fps: Math.round(1000 / stepOf(cost)), frames: stats.frames, avgMs: stats.frames ? stats.total / stats.frames : 0, maxMs: stats.max, peak: stats.peak, played: stats.played, ids: live.map((x) => x.id), level: fxLevel() };
  if (reset) Object.assign(stats, { frames: 0, total: 0, max: 0, peak: live.length, played: 0 });
  return r;
}

function drop(x: Live) {
  const k = live.indexOf(x);
  if (k >= 0) live.splice(k, 1);
  x.cv.remove();
}

function tick(now: number) {
  raf = 0;
  if (!live.length) return;
  if (now - last < stepOf(cost) - 1) {
    raf = requestAnimationFrame(tick);
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  const dpr = window.devicePixelRatio || 1;
  for (const x of [...live]) {
    if (x.wait > 0) {
      x.wait -= dt;
      continue;
    }
    x.age += dt;
    if (x.age >= x.life) x.inst.stop();
    x.inst.update(dt);
    // 要素の後ろの効果：要素が外されたら（窓を閉じた）消す
    if (x.inst.done() || (x.host && !x.host.isConnected)) {
      drop(x);
      continue;
    }
    const at = x.anchor ? x.anchor() : { x: x.x, y: x.y };
    if (!at) {
      x.cv.style.visibility = 'hidden';
      continue;
    }
    const [ox, oy] = x.inst.meta.origin;
    // デバイスの画素にそろえる（拡大したドットの幅がそろうように。要素の後ろの効果は要素の中の位置なので、ずれは要素の位置しだい）
    const left = Math.round((at.x - ox * x.css) * dpr) / dpr;
    const top = Math.round((at.y + (x.dy - oy) * x.css) * dpr) / dpr;
    x.cv.style.transform = `translate(${left}px, ${top}px)`;
    x.cv.style.visibility = '';
    const f = x.frame;
    clearFrame(f);
    x.inst.draw(f);
    if (x.ink) ink(f);
    edgeFade(f);
    composite(f, x.img.data, null);
    x.g.putImageData(x.img, 0, 0);
  }
  const ms = performance.now() - t0;
  stats.frames++;
  stats.total += ms;
  stats.max = Math.max(stats.max, ms);
  cost = cost ? cost * 0.85 + ms * 0.15 : ms;
  if (live.length) raf = requestAnimationFrame(tick);
}

/**
 * 色のドットの外側に 1px のほぼ黒の縁（docs/pixel-rules.md の外郭線）。明るい地図の上でも金や白のきらめきが読めるように。
 * 1 つだけ離れたドット（ディザで薄れていく所）には付けない（縁でざらつかないように）。
 */
function ink(f: FxFrame) {
  const { w, h, color: C } = f;
  const n = w * h;
  if (!inkBuf || inkBuf.length < n * 2) inkBuf = new Uint8Array(n * 2);
  const S = inkBuf.subarray(0, n);
  const J = inkBuf.subarray(n, n * 2);
  for (let i = 0; i < n; i++) S[i] = C[i] >>> 24 > 200 ? 1 : 0;
  // まわり 8 マスに色のドットがある（離れたドットでない）色のドット
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      J[i] = 0;
      if (!S[i]) continue;
      const l = x > 0, r = x < w - 1, u = y > 0, d = y < h - 1;
      if ((l && S[i - 1]) || (r && S[i + 1]) || (u && S[i - w]) || (d && S[i + w]) || (l && u && S[i - w - 1]) || (r && u && S[i - w + 1]) || (l && d && S[i + w - 1]) || (r && d && S[i + w + 1])) J[i] = 1;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (C[i]) continue;
      if ((x > 0 && J[i - 1]) || (x < w - 1 && J[i + 1]) || (y > 0 && J[i - w]) || (y < h - 1 && J[i + w])) C[i] = INK;
    }
}
let inkBuf: Uint8Array | null = null;

/**
 * キャンバスの端で切れた光が四角く見えないように、端の 8px で光を弱める（色はそのまま）。
 * pixelfx の tools/lib/fxlib.mjs の edgeFade を TypeScript に写したもの（MIT, Copyright (c) 2026 Patch, Hugo Duprez）。
 */
function edgeFade(f: FxFrame, E = 8) {
  const { w, h, light: L } = f;
  for (let y = 0; y < h; y++) {
    const ey = Math.min(y, h - 1 - y);
    for (let x = 0; x < w; x++) {
      const e = Math.min(ey, x, w - 1 - x);
      if (e >= E) {
        x = w - 1 - E;
        continue;
      }
      const i = y * w + x;
      const l = L[i];
      if (!(l & 0xffffff)) continue;
      const u = (e + 0.5) / E;
      const k = u * u * (3 - 2 * u);
      L[i] = (l & 0xff000000) | Math.round((l & 255) * k) | (Math.round(((l >>> 8) & 255) * k) << 8) | (Math.round(((l >>> 16) & 255) * k) << 16);
    }
  }
}
