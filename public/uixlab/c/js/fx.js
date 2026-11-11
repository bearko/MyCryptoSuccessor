// UI の上の効果（1 枚の canvas）：金貨・紙ふぶき・火花。粒は 2px の格子に乗せ、重いときは数を減らす。
import { loop, env } from './ui.js';

let cv = null;
let ctx = null;
let dpr = 1;
const parts = [];
export const fxState = { scale: 1 };

export function initFx(canvas) {
  cv = canvas;
  ctx = cv.getContext('2d');
  const size = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(innerWidth * dpr);
    cv.height = Math.round(innerHeight * dpr);
  };
  size();
  addEventListener('resize', size);
  let dirty = false;
  loop.add((dtMs) => {
    if (!parts.length) {
      if (dirty) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        dirty = false;
      }
      return;
    }
    dirty = true;
    const dt = Math.min(0.05, dtMs / 1000);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) {
        p.end?.();
        parts.splice(i, 1);
        continue;
      }
      p.draw(ctx, p, dt);
    }
  });
}

const q = (v) => Math.round(v / 2) * 2;
function coin(ctx, x, y, f) {
  // 金貨（6×6 の四角い貨）。回って見えるよう、幅を 3 段で変える
  const w = f === 0 ? 12 : f === 1 ? 8 : 4;
  ctx.fillStyle = '#0b0d17';
  ctx.fillRect(x - w / 2 - 2, y - 8, w + 4, 16);
  ctx.fillStyle = '#ffb81f';
  ctx.fillRect(x - w / 2, y - 6, w, 12);
  ctx.fillStyle = '#ffe394';
  ctx.fillRect(x - w / 2, y - 6, Math.max(2, w - 4), 2);
  ctx.fillStyle = '#b8650d';
  ctx.fillRect(x - w / 2, y + 4, w, 2);
}

/** 金貨が from から to へ飛ぶ（買う＝資金から品物へ／入金＝店から資金へ） */
export function coinsFly(from, to, n = 8, onHit) {
  if (env.calm()) {
    onHit?.();
    return;
  }
  n = Math.max(3, Math.round(n * fxState.scale));
  for (let k = 0; k < n; k++) {
    const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * 80;
    const my = Math.min(from.y, to.y) - 30 - Math.random() * 50 + Math.abs(to.y - from.y) * 0.2;
    parts.push({
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
export function coinsPop(at, n = 6, spread = 1) {
  if (env.calm()) return;
  n = Math.max(2, Math.round(n * fxState.scale));
  for (let k = 0; k < n; k++) {
    const vx = (Math.random() - 0.5) * 260 * spread;
    const vy = -160 - Math.random() * 200;
    parts.push({
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
export function sparks(at, n = 14, colors = ['#ffb81f', '#fffdf3', '#5fe4ff']) {
  if (env.calm()) return;
  n = Math.max(4, Math.round(n * fxState.scale));
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
    const v = 120 + Math.random() * 160;
    const col = colors[k % colors.length];
    parts.push({
      t: 0,
      life: 0.45 + Math.random() * 0.2,
      draw(c, p) {
        const u = p.t / p.life;
        const d = 1 - (1 - u) * (1 - u);
        const size = u < 0.5 ? 4 : 2;
        c.fillStyle = col;
        c.fillRect(q(at.x + Math.cos(a) * v * d * 0.5), q(at.y + Math.sin(a) * v * d * 0.5), size, size);
      },
    });
  }
}

/** 紙ふぶき（制覇） */
export function confetti(sec = 4) {
  if (env.calm()) return;
  const cols = ['#ffb81f', '#ff5964', '#5fe4ff', '#36e08b', '#f4ecd4'];
  const n = Math.round(110 * fxState.scale);
  for (let k = 0; k < n; k++) {
    const x0 = Math.random() * innerWidth;
    const sway = 20 + Math.random() * 30;
    const v = 110 + Math.random() * 140;
    const col = cols[k % cols.length];
    const ph = Math.random() * 6;
    const w = Math.random() < 0.5 ? 6 : 8;
    parts.push({
      t: -Math.random() * sec * 0.6,
      life: (innerHeight + 40) / v,
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
