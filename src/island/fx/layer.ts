/**
 * ドット絵のエフェクトの層（pixelfx。docs/ISLAND_FX.md）。指定の場所で 1 回鳴らす：playFx(id, x, y, opts)。
 *
 * - 効果ごとに小さなキャンバスを 1 枚置き、image-rendering: pixelated で整数倍に拡大する（デバイスの画素で整数倍）。
 * - 層は 2 つ：'map'（地図の上・UI の下。地図のマスに付く効果）と 'ui'（いちばん上。お祝い）。どちらも pointer-events: none で、押す場所を隠さない。
 * - 動いている効果が無いときは、何も描かない（requestAnimationFrame も止める）。描くのは 30 コマ/秒まで。
 * - 設定の「演出：ふつう／控えめ／なし」（段 FX2。fxLevel）：控えめは花火・紙吹雪を出さず、光だけ小さく。なしは効果の層を出さない。
 *   端末の「動きを減らす」（prefers-reduced-motion: reduce）は「なし」を初期値にする。画面を押すと 'ui' の効果はすぐ薄れて消える（待たせない）。
 * - 明るい地図の上でも読めるように、色のドットの外側に 1px の濃い縁（ink）を付け、光（加算）は弱めにする。
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
} as const;

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
/** 控えめで出さない効果（大きなお祝い） */
const LOUD: FxId[] = ['firework-burst', 'confetti'];
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
  if (layer === 'ui' && !skipBound) {
    skipBound = true;
    window.addEventListener('pointerdown', skipUi, { capture: true, passive: true });
  }
  return r;
}
let skipBound = false;
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
  const calm = fxLevel() === 'calm';
  // 控えめ：花火・紙吹雪は出さない
  if (calm && LOUD.includes(id)) return false;
  const mod = EFFECTS[id];
  if (!mod) return false;
  const layer = o.layer ?? 'ui';
  // 同じ層が多すぎたら、いちばん古いものから消す
  const mine = live.filter((v) => v.layer === layer);
  if (mine.length >= MAX) drop(mine[0]);
  const [w, h] = mod.meta.size;
  const [ox, oy] = mod.meta.origin;
  // 控えめ：光は半分の強さ・小さく（1 ドットの大きさを 3/4。整数倍の丸めは下で）
  const light = (o.light ?? (layer === 'map' ? 0.4 : 0.7)) * (calm ? 0.5 : 1);
  const opts: Record<string, unknown> = { x: ox, y: oy, light, ...(o.opts ?? {}) };
  if (o.palette) opts.palette = [...o.palette];
  if (o.seed != null) opts.seed = o.seed;
  if (o.flip) opts.flip = true;
  const inst = createFx(mod, opts);
  const dpr = window.devicePixelRatio || 1;
  const want = (o.scale ?? (layer === 'map' ? 1 : phone() ? 4 / 3 : 2)) * (calm ? 0.75 : 1);
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
  rootOf(layer).append(cv);
  const v: Live = { id, layer, inst, frame: createFrame(w, h), img: g.createImageData(w, h), cv, g, x, y, dy: o.dy ?? 0, css, ink: o.ink ?? true, wait: (o.delay ?? 0) / 1000, age: 0, life: (o.life ?? (mod.meta.loop ? 2000 : Infinity)) / 1000, anchor: o.anchor };
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
  const r = { active: live.length, fps: Math.round(1000 / stepOf(cost)), frames: stats.frames, avgMs: stats.frames ? stats.total / stats.frames : 0, maxMs: stats.max, peak: stats.peak, played: stats.played, ids: live.map((x) => x.id) };
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
    if (x.inst.done()) {
      drop(x);
      continue;
    }
    const at = x.anchor ? x.anchor() : { x: x.x, y: x.y };
    if (!at) {
      x.cv.style.visibility = 'hidden';
      continue;
    }
    const [ox, oy] = x.inst.meta.origin;
    // デバイスの画素にそろえる（拡大したドットの幅がそろうように）
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
