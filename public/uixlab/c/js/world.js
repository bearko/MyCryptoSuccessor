// 地図：町の絵（1 枚）の上に、生きている層を重ねる。
// ・水面（流れる波の模様と、きらめき）・雲の影・煙突の煙・歩く人（建物の裏を通る）・トラック・「+N G」・花火
// ・カメラ：町の絵は CSS の transform で動かし、上の canvas は同じカメラで描く
import { sprite } from './icons.js';
import { ATLAS, WALKERS } from './data.js';
import { env } from './ui.js';

const ROADS = [2, 7, 12, 17];
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

const TRUCK = sprite(
  [
    '..................',
    '.kkkkkkkkkkkk.....',
    '.kaaaaaaaaaak.....',
    '.kahhhhhhhhak.kkk.',
    '.kaaaaaaaaaakkcck.',
    '.kaaaaaaaaaakcwckk',
    '.kaaaawwaaaakrrrrk',
    '.kaaaaaaaaaakrrrrk',
    '.kllllllllllkrrrrk',
    'kkkkkkkkkkkkkkkkkk',
    '.kddk......kddk...',
    '..kk........kk....',
  ],
  { k: '#0b0d17', a: '#ffb81f', h: '#ffe394', l: '#b8650d', w: '#fffdf3', c: '#5fe4ff', r: '#ff5964', d: '#97a1cf' },
);

function loadImg(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
}

export class World {
  constructor({ map, world, land, live, spot }) {
    this.mapEl = map;
    this.worldEl = world;
    this.landEl = land;
    this.cv = live;
    this.ctx = live.getContext('2d');
    this.spot = spot;
    this.cam = { x: 1200, y: 1200, s: 0.5 };
    this.tween = null;
    this.focused = false;
    this.ready = false;
    this.walkers = [];
    this.trucks = [];
    this.puffs = [];
    this.pluses = [];
    this.glints = [];
    this.clouds = [];
    this.ripples = [];
    this.bursts = [];
    this.sparks = [];
    this.quality = 2;
    this.t = 0;
    this.speed = 1;
    this.festive = 0;
    this.art = new Map();
    this.smokeOn = true;
    this.onSale = null;
  }

  async load() {
    const [meta, hero] = await Promise.all([fetch('img/map.json').then((r) => r.json()), loadImg(ATLAS.hero)]);
    this.meta = meta;
    this.hero = hero;
    if (!hero) document.documentElement.classList.add('no-atlas');
    await (this.landEl.decode?.().catch(() => {}) ?? Promise.resolve());
    this.W = meta.w;
    this.H = meta.h;
    this.worldEl.style.width = `${this.W}px`;
    this.worldEl.style.height = `${this.H}px`;
    this.ws = meta.b.find((b) => b.id === 'workshop');
    this.wsPos = { x: this.ws.x + 100, y: this.ws.y + 96 };
    this.chimney = { x: this.ws.x + 77, y: this.ws.y + 12 };
    this.shops = meta.b.filter((b) => b.own === 'me' && b.id === 'general_store');
    this._water();
    this._glints();
    this._clouds();
    this._walkers();
    // 人の手前に来る建物の絵（人が建物の裏を通るように、あとから重ねる）。読めたものから使う
    for (const b of meta.b) {
      if (this.art.has(b.src)) continue;
      this.art.set(b.src, null);
      loadImg(`../../island/${b.src}`).then((im) => this.art.set(b.src, im));
    }
    this.resize();
    this.snap(this.overview());
    this.ready = true;
  }

  cell(i, j) {
    return [(i - j) * 100 + this.meta.ox, (i + j) * 55 + this.meta.oy];
  }

  // ---- 水面：流れる波の模様（2 層）を CSS の背景にする
  _water() {
    const mk = (color, n, seed) => {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = color;
      let s = seed;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let k = 0; k < n; k++) {
        const px = Math.floor(r() * 60) * 2;
        const py = Math.floor(r() * 30) * 2;
        const w = 6 + Math.floor(r() * 4) * 2;
        x.fillRect(px, py, w, 2);
        if (r() > 0.5) x.fillRect(px + 4, py + 4, w - 4, 2);
      }
      return `url(${c.toDataURL()})`;
    };
    this.seaEl = this.mapEl.querySelector('.c-sea');
    const [a, b] = this.seaEl.querySelectorAll('.c-water');
    a.style.backgroundImage = mk('rgba(173,215,255,0.5)', 9, 11);
    b.style.backgroundImage = mk('rgba(27,74,128,0.55)', 12, 97);
  }

  // ---- きらめき：水の上（町の絵が透明な所）に置く
  _glints() {
    const k = 20;
    const c = document.createElement('canvas');
    c.width = Math.ceil(this.W / k);
    c.height = Math.ceil(this.H / k);
    const x = c.getContext('2d', { willReadFrequently: true });
    let data = null;
    try {
      x.drawImage(this.landEl, 0, 0, c.width, c.height);
      data = x.getImageData(0, 0, c.width, c.height).data;
    } catch {
      data = null;
    }
    const cells = [];
    if (data) for (let i = 0; i < c.width * c.height; i++) if (data[i * 4 + 3] < 8) cells.push(i);
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 150 && cells.length; n++) {
      const i = cells[Math.floor(r() * cells.length)];
      this.glints.push({ x: ((i % c.width) + r()) * k, y: (Math.floor(i / c.width) + r()) * k, ph: r() * 6, per: 1.6 + r() * 2.4 });
    }
  }

  // ---- 雲の影：段のあるかたまりを 2 枚重ねて（ふちは薄く、中は少し濃く）、ゆっくり流す
  _clouds() {
    let s = 31;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 4; n++) {
      const c = document.createElement('canvas');
      c.width = 60;
      c.height = 30;
      const x = c.getContext('2d');
      const blobs = [];
      for (let k = 0; k < 8; k++) {
        const w = 14 + Math.floor(r() * 26);
        const hh = 6 + Math.floor(r() * 12);
        blobs.push([Math.floor(r() * (60 - w)), Math.floor(3 + r() * (27 - hh - 3)), w, hh]);
      }
      x.fillStyle = 'rgba(10,18,48,0.5)';
      for (const [bx, by, w, hh] of blobs) x.fillRect(bx, by, w, hh);
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = 'rgba(10,18,48,1)';
      for (const [bx, by, w, hh] of blobs) if (w > 8 && hh > 6) x.fillRect(bx + 3, by + 2, w - 6, hh - 4);
      this.clouds.push({ img: c, x: r() * this.W, y: r() * this.H, k: 12 + Math.floor(r() * 3) * 2, v: 14 + r() * 8 });
    }
  }

  // ---- 歩く人：道の交差点をつないだ網を、行き当たりばったりに歩く
  _walkers() {
    const ok = (i, j) => {
      const [x, y] = this.cell(i, j);
      return x > 60 && y > 60 && x < this.W - 60 && y < this.H - 60;
    };
    this.nodeOk = ok;
    let s = 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.rnd = r;
    const starts = [[7, 12], [7, 17], [2, 12], [12, 17], [7, 12], [2, 17], [12, 12], [7, 7], [7, 17], [2, 12], [12, 17], [7, 12]];
    starts.forEach((a, n) => {
      const h = WALKERS[n % WALKERS.length];
      const w = { cell: h[0], cx: h[1], right: !!h[2], a, b: a, t: 1, v: 0.42 + r() * 0.3, lane: (n % 2 ? 1 : -1) * (0.14 + r() * 0.1), bob: r() * 6, i: a[0], j: a[1], di: 1, dj: 0 };
      this._next(w);
      w.t = r();
      this.walkers.push(w);
    });
  }
  _next(w) {
    const [i, j] = w.b;
    const opts = [];
    for (const d of [[5, 0], [-5, 0], [0, 5], [0, -5]]) {
      const n = [i + d[0], j + d[1]];
      if (!ROADS.includes(n[0]) || !ROADS.includes(n[1]) || !this.nodeOk(n[0], n[1])) continue;
      if (n[0] === w.a[0] && n[1] === w.a[1] && (i !== w.a[0] || j !== w.a[1])) continue;
      // 工房のあたり（7, 14）へ寄りやすくする：画面の中に人が集まる
      const d0 = Math.abs(i - 7) + Math.abs(j - 14);
      const d1 = Math.abs(n[0] - 7) + Math.abs(n[1] - 14);
      opts.push({ n, w: d1 < d0 ? 3 : 1 });
    }
    if (!opts.length) opts.push({ n: w.a, w: 1 });
    let pick = this.rnd() * opts.reduce((s, o) => s + o.w, 0);
    let to = opts[0].n;
    for (const o of opts) {
      pick -= o.w;
      if (pick <= 0) {
        to = o.n;
        break;
      }
    }
    w.a = w.b;
    w.b = to;
    w.t = 0;
  }

  // ---- カメラ
  resize() {
    const r = this.mapEl.getBoundingClientRect();
    this.vw = r.width;
    this.vh = r.height;
    const cap = this.quality >= 2 ? 2 : this.quality === 1 ? 1.5 : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.cv.width = Math.round(this.vw * this.dpr);
    this.cv.height = Math.round(this.vh * this.dpr);
    let s0 = this.vw < 700 ? 0.5 : 1;
    while (this.W * s0 < this.vw + 40 || this.H * s0 < this.vh + 40) s0 *= 2;
    this.s0 = s0;
    if (this.seaEl) {
      this.seaEl.style.width = `${Math.ceil(this.vw / s0) + 256}px`;
      this.seaEl.style.height = `${Math.ceil(this.vh / s0) + 128}px`;
    }
    if (this.ready && !this.tween) this.snap(this.focused ? this.focusPose() : this.overview());
  }
  clamp(p) {
    const hw = this.vw / 2 / p.s;
    const hh = this.vh / 2 / p.s;
    return { s: p.s, x: Math.max(hw, Math.min(this.W - hw, p.x)), y: Math.max(hh, Math.min(this.H - hh, p.y)) };
  }
  /** いつもの眺め：工房が画面のまん中より少し右上、左下に海 */
  overview() {
    const s = this.s0;
    return this.clamp({ s, x: this.wsPos.x - (0.12 * this.vw) / s, y: this.wsPos.y + (0.13 * this.vh) / s });
  }
  /** 工房に寄った眺め：建物が画面の上 3 割に来る */
  focusPose() {
    const s = this.s0 * 2;
    const wide = this.vw >= 700;
    return this.clamp({ s, x: this.wsPos.x + ((wide ? 0.16 : -0.1) * this.vw) / s, y: this.wsPos.y - 20 + ((wide ? 0.21 : 0.16) * this.vh) / s });
  }
  snap(p) {
    this.cam = { ...p };
    this.tween = null;
    this._apply();
  }
  to(p, ms = 460) {
    if (env.calm()) {
      this.snap(p);
      return Promise.resolve();
    }
    return new Promise((res) => {
      this.tween = { from: { ...this.cam }, to: p, t: 0, ms, res };
    });
  }
  focus() {
    this.focused = true;
    return this.to(this.focusPose(), 480);
  }
  unfocus() {
    this.focused = false;
    return this.to(this.overview(), 420);
  }
  screen(x, y) {
    return [(x - this.cam.x) * this.cam.s + this.vw / 2, (y - this.cam.y) * this.cam.s + this.vh / 2];
  }
  _apply() {
    const { x, y, s } = this.cam;
    const d = this.dpr || 1;
    const tx = Math.round((this.vw / 2 - x * s) * d) / d;
    const ty = Math.round((this.vh / 2 - y * s) * d) / d;
    this.tx = tx;
    this.ty = ty;
    this.worldEl.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${s})`;
    // 海の模様（128 × 64）は町に貼り付いて見えるように、模様 1 枚ぶんの中でずらす
    const mx = 128 * s;
    const my = 64 * s;
    this.seaEl.style.transform = `translate3d(${(((tx % mx) + mx) % mx) - mx}px,${(((ty % my) + my) % my) - my}px,0) scale(${s})`;
    this.worldEl.classList.toggle('is-px', s >= 1 && !this.tween);
  }

  // ---- できごと
  /** 「+N G」などの字を、地図の場所から浮かせる */
  plus(x, y, text, color = '#ffb81f') {
    // 同じ店で続けて売れたら、前の字は消して新しい字に替える（重ねない）
    this.pluses = this.pluses.filter((p) => p.x !== x || p.y !== y);
    this.pluses.push({ x, y, text, color, t: 0 });
    if (this.pluses.length > 14) this.pluses.shift();
  }
  /** トラックを走らせる。path は道のマスの並び（角ごと） */
  truck(path, onArrive) {
    let len = 0;
    const segs = [];
    for (let k = 1; k < path.length; k++) {
      const l = Math.abs(path[k][0] - path[k - 1][0]) + Math.abs(path[k][1] - path[k - 1][1]);
      if (l > 0) segs.push({ a: path[k - 1], b: path[k], l });
      len += l;
    }
    if (!segs.length) {
      onArrive?.();
      return;
    }
    this.trucks.push({ segs, len, d: 0, onArrive });
  }
  puff(n = 1) {
    for (let k = 0; k < n; k++) this.puffs.push({ x: this.chimney.x + (this.rnd() - 0.5) * 6, y: this.chimney.y, t: -k * 0.12, vx: 8 + this.rnd() * 10, life: 2.4 + this.rnd() });
  }
  ripple(sx, sy) {
    this.ripples.push({ x: sx, y: sy, t: 0 });
  }
  /** 花火（画面の場所）。祝いのあいだ、勝手に上がり続ける */
  burst(sx, sy) {
    const cols = ['#ffb81f', '#ff5964', '#5fe4ff', '#36e08b', '#fffdf3'];
    const c = cols[Math.floor(this.rnd() * cols.length)];
    const parts = [];
    const n = this.quality >= 2 ? 26 : 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const v = 70 + this.rnd() * 90;
      parts.push({ vx: Math.cos(a) * v, vy: Math.sin(a) * v, c: this.rnd() < 0.25 ? '#fffdf3' : c });
    }
    this.bursts.push({ x: sx, y: sy, t: 0, parts });
  }
  celebrate(sec) {
    this.festive = sec;
  }

  // ---- 毎フレーム
  frame(dtMs) {
    if (!this.ready) return;
    const calm = env.calm();
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;
    if (this.tween) {
      const tw = this.tween;
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.ms);
      const e = ease(k);
      this.cam.x = tw.from.x + (tw.to.x - tw.from.x) * e;
      this.cam.y = tw.from.y + (tw.to.y - tw.from.y) * e;
      // 寄るときは倍率を対数で動かす：寄り始めと寄り終わりの速さがそろう
      this.cam.s = tw.from.s * Math.pow(tw.to.s / tw.from.s, e);
      if (k >= 1) {
        this.tween = null;
        this.cam = { ...tw.to };
        tw.res();
      }
      this._apply();
    } else if (!calm && !this.focused) {
      // 眺めているあいだ、カメラがごくゆっくり息をする
      const o = this.overview();
      this.cam.x = o.x + Math.sin(this.t / 7) * 6;
      this.cam.y = o.y + Math.cos(this.t / 9) * 4;
      this._apply();
    }

    const sp = calm ? 0 : this.speed;
    // 人
    for (const w of this.walkers) {
      const len = Math.abs(w.b[0] - w.a[0]) + Math.abs(w.b[1] - w.a[1]) || 1;
      w.t += (w.v * dt * Math.min(sp, 2.5)) / len;
      if (w.t >= 1) this._next(w);
      w.di = Math.sign(w.b[0] - w.a[0]);
      w.dj = Math.sign(w.b[1] - w.a[1]);
      w.i = w.a[0] + (w.b[0] - w.a[0]) * w.t + (w.dj ? w.lane : 0);
      w.j = w.a[1] + (w.b[1] - w.a[1]) * w.t + (w.di ? -w.lane : 0);
      w.bob += dt * 9 * Math.min(sp, 2.5);
    }
    // トラック
    for (const t of this.trucks) {
      t.d += dt * 2.2 * Math.max(sp, calm ? 6 : 0);
      if (t.d >= t.len) {
        t.done = true;
        t.onArrive?.();
      }
    }
    this.trucks = this.trucks.filter((t) => !t.done);
    // 煙
    if (this.smokeOn && !calm && sp > 0) {
      this.smokeT = (this.smokeT ?? 0) + dt;
      if (this.smokeT > 0.55) {
        this.smokeT = 0;
        this.puff();
      }
    }
    for (const p of this.puffs) p.t += dt;
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    for (const c of this.clouds) {
      if (calm) break;
      c.x += c.v * dt;
      c.y += c.v * 0.45 * dt;
      if (c.x > this.W + 100) c.x = -60 * c.k;
      if (c.y > this.H + 100) c.y = -30 * c.k;
    }
    for (const p of this.pluses) p.t += dt;
    this.pluses = this.pluses.filter((p) => p.t < 1.25);
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < 0.4);
    for (const b of this.bursts) b.t += dt;
    this.bursts = this.bursts.filter((b) => b.t < 1.1);
    if (this.festive > 0) {
      this.festive -= dt;
      this.fwT = (this.fwT ?? 0) - dt;
      if (this.fwT <= 0 && !calm) {
        this.fwT = 0.22 + this.rnd() * 0.3;
        this.burst(this.vw * (0.12 + this.rnd() * 0.76), this.vh * (0.16 + this.rnd() * 0.5));
        env.sfx?.firework(0.8);
      }
    }
    // いちばん軽い段では、上の canvas は 1 コマおきに描く（カメラが動いているあいだは毎コマ）
    this.tick = (this.tick ?? 0) + 1;
    if (this.quality > 0 || this.tween || this.tick % 2 === 0) this._draw(calm);
    // 工房の印（押せる所）を建物に合わせる
    const [sx, sy] = this.screen(this.wsPos.x, this.wsPos.y - 30);
    this.spot.style.transform = `translate3d(${Math.round(sx)}px,${Math.round(sy)}px,0)`;
  }

  _draw(calm) {
    const ctx = this.ctx;
    const d = this.dpr;
    const s = this.cam.s;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.cv.width, this.cv.height);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(s * d, 0, 0, s * d, this.tx * d, this.ty * d);
    const vx0 = -this.tx / s;
    const vy0 = -this.ty / s;
    const vx1 = vx0 + this.vw / s;
    const vy1 = vy0 + this.vh / s;
    const seen = (x, y, m = 120) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    // 人とトラック（奥から手前へ）
    const items = [];
    for (const w of this.walkers) {
      const [x, y] = this.cell(w.i, w.j);
      if (!seen(x, y)) continue;
      items.push({ z: (w.i + w.j) * 1000 + w.i + 0.6, w, x, y });
    }
    for (const t of this.trucks) {
      let left = t.d;
      let seg = t.segs[0];
      for (const sg of t.segs) {
        seg = sg;
        if (left <= sg.l) break;
        left -= sg.l;
      }
      const k = Math.min(1, left / seg.l);
      const i = seg.a[0] + (seg.b[0] - seg.a[0]) * k;
      const j = seg.a[1] + (seg.b[1] - seg.a[1]) * k;
      const [x, y] = this.cell(i, j);
      if (!seen(x, y)) continue;
      const dirx = (seg.b[0] - seg.a[0]) - (seg.b[1] - seg.a[1]);
      items.push({ z: (i + j) * 1000 + i + 0.75, truck: t, x, y, flip: dirx < 0, a: Math.min(1, t.d / 0.5, (t.len - t.d) / 0.5) });
    }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      let rx, ry, rw, rh;
      if (it.w) {
        const w = it.w;
        const facing = (w.di - w.dj) * 100 < 0 ? -1 : 1;
        const flip = w.right ? facing < 0 : facing > 0;
        const hop = calm ? 0 : Math.round(Math.abs(Math.sin(w.bob)) * 3) * 2;
        rx = Math.round(it.x - (flip ? 64 - w.cx : w.cx));
        ry = Math.round(it.y + 6 - 64 - hop);
        rw = 64;
        rh = 64 + hop + 8;
        ctx.fillStyle = 'rgba(8,10,24,0.3)';
        ctx.fillRect(Math.round(it.x) - 14, Math.round(it.y) + 2, 28, 6);
        ctx.fillRect(Math.round(it.x) - 18, Math.round(it.y) + 4, 36, 2);
        if (this.hero) {
          const sx = (w.cell % 16) * 64;
          const sy = Math.floor(w.cell / 16) * 64;
          if (flip) {
            ctx.save();
            ctx.translate(rx + 64, ry);
            ctx.scale(-1, 1);
            ctx.drawImage(this.hero, sx, sy, 64, 64, 0, 0, 64, 64);
            ctx.restore();
          } else ctx.drawImage(this.hero, sx, sy, 64, 64, rx, ry, 64, 64);
        } else {
          ctx.fillStyle = '#f4ecd4';
          ctx.fillRect(Math.round(it.x) - 8, ry + 30, 16, 30);
          ctx.fillRect(Math.round(it.x) - 6, ry + 18, 12, 12);
        }
      } else {
        const k = 3;
        rw = TRUCK.width * k;
        rh = TRUCK.height * k;
        rx = Math.round(it.x - rw / 2);
        ry = Math.round(it.y - rh + 8 + (calm ? 0 : Math.round(Math.sin(this.t * 22)) * 1));
        ctx.globalAlpha = Math.max(0, Math.round(it.a * 4) / 4);
        if (it.flip) {
          ctx.save();
          ctx.translate(rx + rw, ry);
          ctx.scale(-1, 1);
          ctx.drawImage(TRUCK, 0, 0, rw, rh);
          ctx.restore();
        } else ctx.drawImage(TRUCK, rx, ry, rw, rh);
        ctx.globalAlpha = 1;
      }
      // 手前の建物を、いま描いた絵の四角の中だけ描き直す（人が建物の裏を通る）
      for (const b of this.meta.b) {
        if (b.z <= it.z || b.x > rx + rw || b.x + b.w < rx || b.y > ry + rh || b.y + b.h < ry - 8) continue;
        const im = this.art.get(b.src);
        if (!im) continue;
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx - 2, ry - 2, rw + 4, rh + 4);
        ctx.clip();
        if (b.flip) {
          ctx.translate(b.x + b.w, b.y);
          ctx.scale(-1, 1);
          ctx.drawImage(im, 0, 0, b.w, b.h, 0, 0, b.w, b.h);
        } else ctx.drawImage(im, 0, 0, b.w, b.h, b.x, b.y, b.w, b.h);
        ctx.restore();
      }
    }

    // 煙突の煙：四角い煙が、段々に大きく・薄くなりながら流れる
    for (const p of this.puffs) {
      if (p.t < 0) continue;
      const k = p.t / p.life;
      const size = 8 + Math.floor(k * 5) * 4;
      const x = Math.round((p.x + p.vx * p.t) / 2) * 2;
      const y = Math.round((p.y - 34 * p.t - k * 10) / 2) * 2;
      ctx.globalAlpha = k < 0.25 ? 0.85 : k < 0.5 ? 0.6 : k < 0.75 ? 0.38 : 0.18;
      ctx.fillStyle = '#f4ecd4';
      ctx.fillRect(x - size / 2 + 2, y - size / 2, size - 4, size);
      ctx.fillRect(x - size / 2, y - size / 2 + 2, size, size - 4);
      ctx.fillStyle = '#b9b39c';
      ctx.fillRect(x - size / 2 + 2, y + size / 2 - 2, size - 4, 2);
    }
    ctx.globalAlpha = 1;

    // 雲の影
    if (this.quality >= 1) {
      ctx.globalAlpha = 0.14;
      for (const c of this.clouds) {
        if (c.x > vx1 || c.y > vy1 || c.x + 60 * c.k < vx0 || c.y + 30 * c.k < vy0) continue;
        ctx.drawImage(c.img, Math.round(c.x), Math.round(c.y), 60 * c.k, 30 * c.k);
      }
      ctx.globalAlpha = 1;
    }

    // ここからは画面の座標（字と光は、寄っても引いても同じ大きさで読める）
    ctx.setTransform(d, 0, 0, d, 0, 0);
    // 水面のきらめき
    const gl = this.quality >= 2 ? this.glints.length : Math.floor(this.glints.length / 2);
    ctx.fillStyle = '#eaf6ff';
    for (let n = 0; n < gl; n++) {
      const g = this.glints[n];
      if (!seen(g.x, g.y, 0)) continue;
      const ph = calm ? 0.3 : ((this.t + g.ph) % g.per) / g.per;
      if (ph > 0.42) continue;
      const f = ph < 0.1 ? 1 : ph < 0.22 ? 2 : ph < 0.32 ? 3 : 2;
      const [sx, sy] = this.screen(g.x, g.y);
      const x = Math.round(sx / 2) * 2;
      const y = Math.round(sy / 2) * 2;
      ctx.fillRect(x, y, 2, 2);
      if (f >= 2) {
        ctx.fillRect(x - 2, y, 6, 2);
      }
      if (f >= 3) {
        ctx.fillRect(x, y - 2, 2, 6);
        ctx.fillRect(x - 4, y, 10, 2);
      }
    }

    // 「+N G」
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    for (const p of this.pluses) {
      const [sx, sy] = this.screen(p.x, p.y);
      const k = p.t / 1.25;
      const rise = calm ? 20 : Math.round((1 - Math.pow(1 - Math.min(1, p.t / 0.5), 3)) * 14) * 2 + (k > 0.5 ? Math.round((k - 0.5) * 8) * 2 : 0);
      ctx.font = '37.333px "Jersey 10", "DotGothic16", monospace';
      const half = ctx.measureText(p.text).width / 2 + 6;
      const x = Math.round(Math.max(half, Math.min(this.vw - half, sx)));
      const y = Math.round(sy - rise);
      ctx.globalAlpha = k > 0.8 ? 0.4 : k > 0.7 ? 0.7 : 1;
      ctx.font = '37.333px "Jersey 10", "DotGothic16", monospace';
      ctx.fillStyle = '#0b0d17';
      for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, -2], [-2, 2], [2, 2], [0, 4], [2, 4], [-2, 4]]) ctx.fillText(p.text, x + ox, y + oy);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;

    // 押した所の輪（四角い波紋）
    for (const r of this.ripples) {
      const k = Math.floor((r.t / 0.4) * 4);
      const size = 8 + k * 8;
      ctx.globalAlpha = 1 - k * 0.22;
      ctx.fillStyle = '#fffdf3';
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      ctx.fillRect(x - size, y - size, size * 2, 2);
      ctx.fillRect(x - size, y + size - 2, size * 2, 2);
      ctx.fillRect(x - size, y - size, 2, size * 2);
      ctx.fillRect(x + size - 2, y - size, 2, size * 2);
    }
    ctx.globalAlpha = 1;

    // 花火
    for (const b of this.bursts) {
      const k = b.t / 1.1;
      const drag = 1 - Math.pow(1 - Math.min(1, b.t / 0.7), 2);
      const size = k < 0.5 ? 4 : 2;
      if (k > 0.75 && Math.floor(b.t * 30) % 2) continue;
      for (const p of b.parts) {
        const x = Math.round((b.x + p.vx * drag * 0.8) / 2) * 2;
        const y = Math.round((b.y + p.vy * drag * 0.8 + 60 * b.t * b.t) / 2) * 2;
        ctx.fillStyle = p.c;
        ctx.fillRect(x, y, size, size);
        if (k < 0.4) {
          ctx.globalAlpha = 0.5;
          ctx.fillRect(Math.round((b.x + p.vx * drag * 0.62) / 2) * 2, Math.round((b.y + p.vy * drag * 0.62 + 60 * b.t * b.t) / 2) * 2, 2, 2);
          ctx.globalAlpha = 1;
        }
      }
    }
  }
}
