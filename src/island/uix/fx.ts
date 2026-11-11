/**
 * 段 UIX1a：UI の上の効果（上掛けの canvas 1 枚。docs/ISLAND_UIX.md）：金貨・火花・紙ふぶき・押した印・網目の幕。
 * 手触りラボ C（public/uixlab/c/js/fx.js・ui.js の Wipe）の値をそのまま移した。粒は 2px の格子に乗せ、重いときは数を自動で減らす（loop.ts の quality）。
 * 動かすものが無いあいだは描かない（rAF も回さない）。地図の canvas（#isl-map）には触らない。
 */
import { later, loop, quality } from './loop';
import { isCalm } from './prefs';

export interface Pt {
  x: number;
  y: number;
}
interface Part {
  t: number;
  life: number;
  end?: (() => void) | null;
  draw: (c: CanvasRenderingContext2D, p: Part) => void;
}
/** 同時に出す粒の上限 */
export const MAX_PARTS = 260;

let cv: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let dpr = 1;
let off: (() => void) | null = null;
const parts: Part[] = [];
/** 幕（いま動いているもの。1 つだけ） */
let wipeDraw: ((c: CanvasRenderingContext2D, dt: number) => boolean) | null = null;
const vw = () => Math.round(window.visualViewport?.width ?? innerWidth);
const vh = () => Math.round(window.visualViewport?.height ?? innerHeight);

function size() {
  if (!cv) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(vw() * dpr);
  cv.height = Math.round(vh() * dpr);
}
/** 上掛けの canvas を作る（1 回だけ。body の直下・#isl-ui より上） */
export function initFx(): HTMLCanvasElement {
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.className = 'ux-fx';
  cv.setAttribute('aria-hidden', 'true');
  ctx = cv.getContext('2d');
  document.body.append(cv);
  size();
  addEventListener('resize', size);
  return cv;
}
function tick(dtMs: number) {
  if (!ctx || !cv) return;
  const dt = Math.min(0.05, dtMs / 1000);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw(), vh());
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t < 0) continue;
    if (p.t >= p.life) {
      parts.splice(i, 1);
      p.end?.();
      continue;
    }
    p.draw(ctx, p);
  }
  if (wipeDraw && !wipeDraw(ctx, dtMs)) wipeDraw = null;
  if (!parts.length && !wipeDraw) {
    // 動かすものが無くなったら、止める（待機のときの負荷は 0）
    ctx.clearRect(0, 0, vw(), vh());
    off?.();
    off = null;
  }
}
function wake() {
  if (!cv) initFx();
  if (!off) off = loop.add(tick);
}
function push(p: Part) {
  if (parts.length >= MAX_PARTS) {
    p.end?.();
    return;
  }
  parts.push(p);
  wake();
}
/** いま出ている粒の数（確かめ用） */
export const fxCount = () => parts.length;

const q = (v: number) => Math.round(v / 2) * 2;
function coin(c: CanvasRenderingContext2D, x: number, y: number, f: number) {
  // 金貨（四角い貨）。回って見えるよう、幅を 3 段で変える
  const w = f === 0 ? 12 : f === 1 ? 8 : 4;
  c.fillStyle = '#0b0d17';
  c.fillRect(x - w / 2 - 2, y - 8, w + 4, 16);
  c.fillStyle = '#ffb81f';
  c.fillRect(x - w / 2, y - 6, w, 12);
  c.fillStyle = '#ffe394';
  c.fillRect(x - w / 2, y - 6, Math.max(2, w - 4), 2);
  c.fillStyle = '#b8650d';
  c.fillRect(x - w / 2, y + 4, w, 2);
}

/** 金貨が from から to へ飛ぶ（買う＝資金から品物へ／入金＝店から資金へ） */
export function coinsFly(from: Pt, to: Pt, n = 8, onHit?: () => void) {
  if (isCalm()) {
    onHit?.();
    return;
  }
  n = Math.max(3, Math.round(n * quality.scale));
  for (let k = 0; k < n; k++) {
    const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 80;
    const my = Math.min(from.y, to.y) - 30 - Math.random() * 50 + Math.abs(to.y - from.y) * 0.2;
    push({
      t: -k * 0.045,
      life: 0.52,
      end: k === n - 1 ? onHit : null,
      draw(c, p) {
        const u = p.t / p.life;
        const e = u * u * (3 - 2 * u);
        const x = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * mx + e * e * to.x;
        const y = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * my + e * e * to.y;
        coin(c, q(x), q(y), Math.floor(p.t * 14 + k) % 3);
      },
    });
  }
}

/** その場で金貨がはじける（数え上げ・完成） */
export function coinsPop(at: Pt, n = 6, spread = 1) {
  if (isCalm()) return;
  n = Math.max(2, Math.round(n * quality.scale));
  for (let k = 0; k < n; k++) {
    const vx = (Math.random() - 0.5) * 260 * spread;
    const vy = -160 - Math.random() * 200;
    push({
      t: -k * 0.012,
      life: 0.7 + Math.random() * 0.2,
      draw(c, p) {
        const x = at.x + vx * p.t;
        const y = at.y + vy * p.t + 520 * p.t * p.t;
        if (p.t > p.life - 0.15 && Math.floor(p.t * 30) % 2) return;
        coin(c, q(x), q(y), Math.floor(p.t * 14 + k) % 3);
      },
    });
  }
}

/** 四角い火花（承認・順位上げ） */
export function sparks(at: Pt, n = 14, colors = ['#ffb81f', '#fffdf3', '#5fe4ff']) {
  if (isCalm()) return;
  n = Math.max(4, Math.round(n * quality.scale));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
    const v = 120 + Math.random() * 160;
    const col = colors[k % colors.length];
    push({
      t: 0,
      life: 0.45 + Math.random() * 0.2,
      draw(c, p) {
        const u = p.t / p.life;
        const d = 1 - (1 - u) * (1 - u);
        const s = u < 0.5 ? 4 : 2;
        c.fillStyle = col;
        c.fillRect(q(at.x + Math.cos(a) * v * d * 0.5), q(at.y + Math.sin(a) * v * d * 0.5), s, s);
      },
    });
  }
}

/** 紙ふぶき（制覇） */
export function confetti(sec = 4) {
  if (isCalm()) return;
  const cols = ['#ffb81f', '#ff5964', '#5fe4ff', '#36e08b', '#f4ecd4'];
  const n = Math.round(110 * quality.scale);
  for (let k = 0; k < n; k++) {
    const x0 = Math.random() * vw();
    const sway = 20 + Math.random() * 30;
    const v = 110 + Math.random() * 140;
    const col = cols[k % cols.length];
    const ph = Math.random() * 6;
    const w = Math.random() < 0.5 ? 6 : 8;
    push({
      t: -Math.random() * sec * 0.6,
      life: (vh() + 40) / v,
      draw(c, p) {
        const y = -10 + v * p.t;
        const x = x0 + Math.sin(p.t * 3 + ph) * sway;
        c.fillStyle = col;
        // ひらひら：幅が入れ替わる
        const flip = Math.floor(p.t * 8 + ph) % 2;
        c.fillRect(q(x), q(y), flip ? w : 4, flip ? 4 : w);
      },
    });
  }
}

/** 押した所の輪（四角い波紋）：地図など、形の無い所を押したとき */
export function ripple(at: Pt) {
  if (isCalm()) return;
  push({
    t: 0,
    life: 0.4,
    draw(c, p) {
      const k = Math.floor((p.t / 0.4) * 4);
      const s = 8 + k * 8;
      c.globalAlpha = 1 - k * 0.22;
      c.fillStyle = '#fffdf3';
      const x = Math.round(at.x);
      const y = Math.round(at.y);
      c.fillRect(x - s, y - s, s * 2, 2);
      c.fillRect(x - s, y + s - 2, s * 2, 2);
      c.fillRect(x - s, y - s, 2, s * 2);
      c.fillRect(x + s - 2, y - s, 2, s * 2);
      c.globalAlpha = 1;
    },
  });
}

/**
 * 押した手応えの印：押したボタンの形の枠が、外へ 3 段ひろがって消える（四角い波紋と同じ言葉）。
 * 上掛けの層に描くので、押したボタンが作り直されて（after() の描き直し）消えても、印は残る
 */
export function pressMark(r: { left: number; top: number; width: number; height: number }, color = '#fffdf3') {
  if (isCalm()) return;
  const x0 = q(r.left);
  const y0 = q(r.top);
  const w0 = q(r.width);
  const h0 = q(r.height);
  push({
    t: 0,
    life: 0.24,
    draw(c, p) {
      const k = Math.floor((p.t / 0.24) * 3);
      const g = 2 + k * 4;
      c.globalAlpha = 1 - k * 0.3;
      c.fillStyle = color;
      const x = x0 - g;
      const y = y0 - g;
      const w = w0 + g * 2;
      const h = h0 + g * 2;
      // 四隅は切り欠く（角を丸めない・階段の角）
      c.fillRect(x + 2, y, w - 4, 2);
      c.fillRect(x + 2, y + h - 2, w - 4, 2);
      c.fillRect(x, y + 2, 2, h - 4);
      c.fillRect(x + w - 2, y + 2, 2, h - 4);
      c.globalAlpha = 1;
    },
  });
}

// ---------------------------------------------------------------- 網目の幕（決めの遷移）
// 画素の升目が、押した場所から順序つきディザの順で埋まり、同じ順で晴れる。暗転の中央に行き先の札が出る
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export interface WipeOpts {
  inMs?: number;
  holdMs?: number;
  outMs?: number;
  color?: [number, number, number];
  edge?: [number, number, number];
  /** 逆の順（遠くから押した場所へ閉じる：もどるとき） */
  reverse?: boolean;
  /** 幕が閉じているあいだ出す、行き先の名前 */
  label?: string;
}
/** 幕の長さ（見本の値）：閉じる 230ms・止まる 50ms・晴れる 250ms */
export const WIPE = { inMs: 230, holdMs: 50, outMs: 250, cell: 10 };

/** 升目ごとの「埋まる順」（0〜1）。四角く広がる（円にしない）：チェビシェフ距離とマンハッタン距離のあいだ ＋ 網目 */
export function wipeOrder(W: number, H: number, ox: number, oy: number): Float32Array {
  const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
  const th = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - ox);
      const dy = Math.abs(y - oy);
      const d = (Math.max(dx, dy) * 0.7 + (dx + dy) * 0.3) / (far * 1.05);
      th[y * W + x] = d * 0.74 + (BAYER[(y & 3) * 4 + (x & 3)] / 16) * 0.26;
    }
  return th;
}

let wipeBusy = false;
let labelEl: HTMLElement | null = null;
export const wipeIsBusy = () => wipeBusy;

/**
 * 幕を走らせる。origin：画面の点（CSS px）。mid：幕が閉じきったときに呼ぶ（裏で画面を入れ替える）。
 * 動きを減らすとき：淡い切り替えだけ（mid はすぐ呼ぶ）。幕が動いている最中に重ねて呼んだら、mid だけすぐ呼ぶ
 */
export function wipe(origin: Pt, mid?: () => void, o: WipeOpts = {}): Promise<void> {
  const { inMs = WIPE.inMs, holdMs = WIPE.holdMs, outMs = WIPE.outMs, color = [21, 24, 41], edge = [255, 184, 31], reverse = false, label = '' } = o;
  if (isCalm() || typeof document === 'undefined') {
    // 動きを減らす：淡い切り替えだけ
    if (typeof document !== 'undefined') document.getElementById('isl-ui')?.animate?.([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 160 });
    mid?.();
    return Promise.resolve();
  }
  if (wipeBusy) {
    mid?.();
    return Promise.resolve();
  }
  wipeBusy = true;
  const W = Math.ceil(vw() / WIPE.cell);
  const H = Math.ceil(vh() / WIPE.cell);
  const small = document.createElement('canvas');
  small.width = W;
  small.height = H;
  const sctx = small.getContext('2d')!;
  const th = wipeOrder(W, H, origin.x / WIPE.cell, origin.y / WIPE.cell);
  const img = sctx.createImageData(W, H);
  const px = img.data;
  const paint = (p: number, out: boolean) => {
    // p：0→1。out のときは「晴れていく」
    for (let i = 0; i < th.length; i++) {
      const t = reverse ? 1 - th[i] : th[i];
      const k = i * 4;
      const covered = out ? t >= p : t < p;
      const d = out ? t - p : p - t;
      if (!covered) {
        px[k + 3] = 0;
        continue;
      }
      // 幕のふち：1 段だけ明るい（光が走る）
      const e = d < 0.035;
      px[k] = e ? edge[0] : color[0];
      px[k + 1] = e ? edge[1] : color[1];
      px[k + 2] = e ? edge[2] : color[2];
      px[k + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
  };
  if (!labelEl) {
    labelEl = document.createElement('div');
    labelEl.className = 'ux-wipe-label';
    labelEl.setAttribute('aria-hidden', 'true');
    document.body.append(labelEl);
  }
  const lab = labelEl;
  lab.textContent = label;
  return new Promise((res) => {
    let t = 0;
    let phase = 0;
    let lastQ = -1;
    wipeDraw = (c, dt) => {
      t += dt;
      let alive = true;
      if (phase === 0) {
        const k = Math.min(1, t / inMs);
        // 9 段：カクカクと「機械が切り替える」動きにする
        const qq = Math.round(k * 9) / 9;
        if (qq !== lastQ) paint(qq * 1.06, false);
        lastQ = qq;
        if (k >= 0.55 && label) lab.classList.add('is-on');
        if (k >= 1) {
          phase = 1;
          t = 0;
          mid?.();
        }
      } else if (phase === 1) {
        if (t >= holdMs) {
          phase = 2;
          t = 0;
          lastQ = -1;
        }
      } else {
        const k = Math.min(1, t / outMs);
        const qq = Math.round(k * 9) / 9;
        if (qq !== lastQ) paint(qq * 1.06 - 0.03, true);
        lastQ = qq;
        if (k >= 0.3) lab.classList.remove('is-on');
        if (k >= 1) {
          alive = false;
          wipeBusy = false;
          res();
        }
      }
      if (alive) {
        c.imageSmoothingEnabled = false;
        c.drawImage(small, 0, 0, W * WIPE.cell, H * WIPE.cell);
      }
      return alive;
    };
    wake();
  });
}
/** 押した場所を覚える（幕の起点・押した印）。boot.ts が pointerdown で入れる */
export const lastPress = { x: 0, y: 0, at: -1e9 };
/** 幕の起点：いま押したばかりならその場所、そうでなければ画面の下のまん中 */
export function pressOrigin(now = performance.now()): Pt {
  return now - lastPress.at < 600 ? { x: lastPress.x, y: lastPress.y } : { x: vw() / 2, y: vh() - 40 };
}
export { later };
