// 帳場の道具箱：押した手応え・転がる数字・1 字ずつ喋る・物差しのつまみ・画面の上の粒
import { audio } from './audio.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** 文字列から要素をつくる */
export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------------------------------------------------------------- 設定
const KEY = 'uixlab.a.prefs.v1';
const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
export const prefs = { bgm: 70, se: 80, muted: false, rm: false, fz: 100, cb: false, talk: 1 };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}'));
} catch { /* 保存できない環境でもそのまま動く */ }
/** 動きを減らすか（設定か、端末の設定のどちらか） */
export const calm = () => prefs.rm || !!mq?.matches;
export function applyPrefs() {
  const r = document.documentElement;
  r.style.fontSize = `${(16 * prefs.fz) / 100}px`;
  r.classList.toggle('rm', calm());
  r.classList.toggle('cb', !!prefs.cb);
  audio.setVol({ bgm: prefs.bgm / 100, se: prefs.se / 100, muted: prefs.muted });
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch { /* 無視 */ }
}
mq?.addEventListener?.('change', applyPrefs);

/** スマホの短い振動（大きな手応えにだけ。動きを減らすときは切る） */
export function buzz(ms = 12) {
  if (calm()) return;
  try {
    navigator.vibrate?.(ms);
  } catch { /* 無視 */ }
}

// ---------------------------------------------------------------- 押した手応え
/** すべてのボタンに共通：押すと沈んで木の音、離すと戻る音 */
export function initPress(root = document) {
  let cur = null;
  const up = (ok) => {
    if (!cur) return;
    cur.classList.remove('is-down');
    if (ok && cur.dataset.se !== 'none') audio.se('release');
    cur = null;
  };
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('button, [data-press]');
    if (!b || b.disabled) return;
    cur = b;
    b.classList.add('is-down');
    if (b.dataset.se !== 'none') audio.se('press');
  }, { passive: true });
  root.addEventListener('pointerup', () => up(true), { passive: true });
  root.addEventListener('pointercancel', () => up(false), { passive: true });
  root.addEventListener('pointerleave', () => up(false), { passive: true });
  // キーボードでも同じ音
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('button') && !e.repeat) audio.se('press');
  });
}

// ---------------------------------------------------------------- 桁が転がる数字
const STRIP = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9';
export class Roller {
  /** el：入れ物。opt.unit：後ろに付ける字（G・位・個）。opt.wob：最後の桁がゆらぐ */
  constructor(el, value = 0, opt = {}) {
    this.el = el;
    this.opt = opt;
    this.value = null;
    this.cells = [];
    el.classList.add('roll');
    if (opt.wob) el.classList.add('wob');
    this.set(value, { instant: true });
  }
  build(str) {
    const el = this.el;
    el.textContent = '';
    this.cells = [];
    for (const c of str) {
      if (c >= '0' && c <= '9') {
        const d = document.createElement('span');
        d.className = 'rd';
        const s = document.createElement('span');
        s.className = 'rs';
        s.textContent = STRIP;
        d.appendChild(s);
        el.appendChild(d);
        this.cells.push({ s, v: -1 });
      } else {
        const x = document.createElement('span');
        x.className = 'rc';
        x.textContent = c;
        el.appendChild(x);
        this.cells.push(null);
      }
    }
    if (this.opt.unit) {
      const u = document.createElement('span');
      u.className = 'ru';
      u.textContent = this.opt.unit;
      el.appendChild(u);
    }
    this.len = str.length;
  }
  set(value, o = {}) {
    value = Math.round(value);
    const str = (this.opt.sign && value > 0 ? '+' : '') + fmt(value);
    const fresh = str.length !== this.len;
    if (fresh) this.build(str);
    const dur = o.instant || calm() ? 0 : o.dur ?? 520;
    const digits = this.cells.filter(Boolean);
    let k = digits.length;
    for (let i = 0; i < str.length; i++) {
      const c = this.cells[i];
      if (!c) continue;
      k--;
      const d = +str[i];
      if (c.v === d && !fresh) continue;
      c.v = d;
      c.s.style.setProperty('--rdur', `${dur ? dur + k * 40 : 0}ms`);
      c.s.style.transitionDelay = dur ? `${k * 24}ms` : '0ms';
      c.s.style.transform = `translateY(${-d * 10}%)`;
    }
    this.value = value;
    this.el.setAttribute('aria-label', str + (this.opt.unit ?? ''));
  }
}

/** 「+N」が飛び出して消える */
export function popNum(el, text, cls = 'up') {
  if (!el) return;
  el.innerHTML = text;
  el.className = `pop ${cls}`;
  if (calm()) {
    el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1200 });
    return;
  }
  el.animate(
    [
      { opacity: 0, transform: 'translateY(-8px) scale(0.7)' },
      { opacity: 1, transform: 'translateY(2px) scale(1.12)', offset: 0.18 },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.3 },
      { opacity: 1, transform: 'translateY(0) scale(1)', offset: 0.75 },
      { opacity: 0, transform: 'translateY(10px) scale(1)' },
    ],
    { duration: 1300, easing: 'ease-out' },
  );
}

// ---------------------------------------------------------------- 1 字ずつ喋る
const PAUSE = { '、': 150, '。': 260, '！': 220, '？': 220, '…': 200, ' ': 30 };
/** el に text を 1 字ずつ出す。戻り値の finish() で最後まで出す */
export function typeText(el, text, o = {}) {
  el.classList.remove('done');
  el.textContent = '';
  const spans = [];
  for (const c of text) {
    const s = document.createElement('span');
    s.className = 'ch';
    s.textContent = c;
    el.appendChild(s);
    spans.push(s);
  }
  const nx = document.createElement('i');
  nx.className = 'nx';
  el.appendChild(nx);
  let i = 0;
  let timer = 0;
  let over = false;
  const speed = [62, 40, 22][prefs.talk] ?? 40;
  const end = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    for (const s of spans) s.classList.add('on');
    el.classList.add('done');
    o.onTalk?.(false);
    o.onDone?.();
  };
  const step = () => {
    if (over) return;
    if (i >= spans.length) return end();
    const c = text[i];
    spans[i].classList.add('on');
    if (!PAUSE[c] && i % 2 === 0) audio.se('talk', { voice: o.voice ?? 0, gap: 0.02 });
    i++;
    timer = setTimeout(step, speed + (PAUSE[c] ?? 0));
  };
  o.onTalk?.(true);
  if (calm()) end(); else timer = setTimeout(step, o.delay ?? 120);
  return { finish: end, get done() { return over; } };
}

// ---------------------------------------------------------------- 物差しのつまみ
export class Slider {
  constructor(el, o) {
    this.el = el;
    this.o = o;
    el.classList.add('sld');
    el.setAttribute('role', 'slider');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-valuemin', o.min);
    el.setAttribute('aria-valuemax', o.max);
    if (o.label) el.setAttribute('aria-label', o.label);
    el.innerHTML = '<div class="trk"><div class="fil"></div></div><div class="knob"></div>';
    el.style.setProperty('--steps', Math.round((o.max - o.min) / o.step));
    this.value = o.value;
    this.paint();
    const at = (e) => {
      const r = el.getBoundingClientRect();
      const p = clamp((e.clientX - r.left - 14) / (r.width - 28), 0, 1);
      const v = Math.round((o.min + p * (o.max - o.min)) / o.step) * o.step;
      if (v !== this.value) {
        this.value = v;
        this.paint();
        audio.se('slide', { p: (v - o.min) / (o.max - o.min), gap: 0.02 });
        o.onInput?.(v);
      }
    };
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      audio.se('press');
      at(e);
    });
    el.addEventListener('pointermove', (e) => el.classList.contains('drag') && at(e));
    const up = () => {
      if (!el.classList.contains('drag')) return;
      el.classList.remove('drag');
      audio.se('release');
      o.onChange?.(this.value);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const v = clamp(this.value + d * o.step, o.min, o.max);
      if (v === this.value) return;
      this.value = v;
      this.paint();
      audio.se('slide', { p: (v - o.min) / (o.max - o.min) });
      o.onInput?.(v);
      o.onChange?.(v);
    });
    this.ro = new ResizeObserver(() => this.paint());
    this.ro.observe(el);
  }
  paint() {
    const { el, o } = this;
    const p = (this.value - o.min) / (o.max - o.min);
    el.style.setProperty('--p', p);
    el.style.setProperty('--w', p * Math.max(0, el.clientWidth - 28));
    el.setAttribute('aria-valuenow', this.value);
  }
  set(v) {
    this.value = v;
    this.paint();
  }
}

// ---------------------------------------------------------------- 画面の上の粒（1 枚の canvas）
const COL = { kin: '#e6ad2e', kinHi: '#fbe08a', kinLo: '#a87413', shu: '#d8432a', shuLo: '#9c2a17', kinari: '#f4ecd8', ao: '#46d3b8', ink: '#1a2340', white: '#ffffff' };
class Fx {
  constructor() {
    this.ps = [];
    this.run = false;
    this.q = 1; // 重いときは粒を減らす
    this.dts = [];
    this.last = 0;
  }
  init(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    const fit = () => {
      // 粒は四角い画素なので、等倍の解像度で足りる（広い canvas を毎コマ送らない）
      this.dpr = 1;
      cv.width = Math.round(innerWidth * this.dpr);
      cv.height = Math.round(innerHeight * this.dpr);
    };
    fit();
    addEventListener('resize', fit);
  }
  add(p) {
    if (calm() || !this.ctx) return;
    this.ps.push({ age: 0, rot: 0, vr: 0, g: 0, drag: 0, shape: 'sq', a: 1, ...p });
    if (!this.run) {
      this.run = true;
      this.last = performance.now();
      requestAnimationFrame((t) => this.tick(t));
    }
  }
  n(k) { return Math.max(1, Math.round(k * this.q)); }
  tick(now) {
    const dt = Math.min(50, now - this.last);
    this.last = now;
    // 重いときは自動で落とす
    this.dts.push(dt);
    if (this.dts.length > 40) {
      const s = [...this.dts].sort((a, b) => a - b);
      const p90 = s[Math.floor(s.length * 0.9)];
      this.q = p90 > 30 ? Math.max(0.35, this.q * 0.8) : p90 < 19 ? Math.min(1, this.q * 1.05) : this.q;
      this.dts.length = 0;
    }
    const c = this.ctx;
    const k = dt / 1000;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, innerWidth, innerHeight);
    const keep = [];
    for (const p of this.ps) {
      p.age += dt;
      if (p.age < 0) { keep.push(p); continue; }
      if (p.age >= p.life) { p.done?.(); continue; }
      const u = p.age / p.life;
      if (p.path) {
        // 2 次の曲線に沿って飛ぶ（金貨）
        const e = u * u * (3 - 2 * u);
        const [a, b, d] = p.path;
        p.x = (1 - e) * (1 - e) * a[0] + 2 * (1 - e) * e * b[0] + e * e * d[0];
        p.y = (1 - e) * (1 - e) * a[1] + 2 * (1 - e) * e * b[1] + e * e * d[1];
      } else {
        p.vy += p.g * k;
        if (p.drag) { p.vx *= 1 - p.drag * k; p.vy *= 1 - p.drag * k; }
        if (p.sway) p.x += Math.sin(p.age / 260 + p.ph) * p.sway * k;
        p.x += p.vx * k;
        p.y += p.vy * k;
      }
      p.rot += p.vr * k;
      const fade = p.fade ? Math.min(1, (1 - u) / p.fade) : 1;
      c.globalAlpha = p.a * fade * (p.blink ? (Math.floor(p.age / 60) % 2 ? 0.5 : 1) : 1);
      c.fillStyle = p.color;
      const s = p.size * (p.grow ? 1 + p.grow * u : 1);
      if (p.shape === 'sq') {
        c.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
      } else if (p.shape === 'paper') {
        // 紙吹雪：回りながら薄く見える四角
        const w = s * Math.abs(Math.cos(p.rot));
        c.fillRect(p.x - w / 2, p.y - s * 0.32, Math.max(1, w), s * 0.64);
      } else if (p.shape === 'coin') {
        const r = s / 2;
        const w = r * (0.35 + 0.65 * Math.abs(Math.cos(p.rot)));
        c.beginPath();
        c.moveTo(p.x - w * 0.42, p.y - r); c.lineTo(p.x + w * 0.42, p.y - r); c.lineTo(p.x + w, p.y - r * 0.42); c.lineTo(p.x + w, p.y + r * 0.42);
        c.lineTo(p.x + w * 0.42, p.y + r); c.lineTo(p.x - w * 0.42, p.y + r); c.lineTo(p.x - w, p.y + r * 0.42); c.lineTo(p.x - w, p.y - r * 0.42);
        c.closePath();
        c.fill();
        c.fillStyle = COL.kinLo;
        c.fillRect(p.x - w * 0.28, p.y - r * 0.28, w * 0.56, r * 0.56);
      } else if (p.shape === 'dia') {
        c.beginPath();
        c.moveTo(p.x, p.y - s); c.lineTo(p.x + s * 0.6, p.y); c.lineTo(p.x, p.y + s); c.lineTo(p.x - s * 0.6, p.y);
        c.closePath();
        c.fill();
      } else if (p.shape === 'line') {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.ang);
        c.fillRect(0, -1, s, 2);
        c.restore();
      }
      keep.push(p);
    }
    c.globalAlpha = 1;
    this.ps = keep;
    if (keep.length) requestAnimationFrame((t) => this.tick(t)); else { this.run = false; c.clearRect(0, 0, innerWidth, innerHeight); }
  }
  /** 朱のしぶき（検印） */
  ink(x, y, power = 1) {
    for (let i = 0; i < this.n(22 * power); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 300 * power;
      this.add({ x: x + Math.cos(a) * 26, y: y + Math.sin(a) * 26, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 500, drag: 3, size: 2 + Math.random() * 4, color: Math.random() < 0.3 ? COL.shuLo : COL.shu, life: 380 + Math.random() * 420, fade: 0.4 });
    }
    for (let i = 0; i < this.n(8 * power); i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      this.add({ x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 34, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, drag: 6, size: 14 + Math.random() * 12, ang: a, shape: 'line', color: COL.shu, life: 260, fade: 0.6 });
    }
  }
  /** 紙のほこり・金の粉 */
  dust(x, y, color = COL.kinari, n = 10, spread = 60) {
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * spread * 2;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 160, drag: 3, size: 2 + Math.random() * 3, color, life: 400 + Math.random() * 400, fade: 0.5 });
    }
  }
  spark(x, y, n = 7) {
    for (let i = 0; i < this.n(n); i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      const v = 60 + Math.random() * 140;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 240, drag: 2, size: 3 + Math.random() * 3, shape: 'dia', color: Math.random() < 0.5 ? COL.kinHi : COL.kin, life: 500 + Math.random() * 300, fade: 0.5, blink: true });
    }
  }
  /** 金貨が a から b へ飛ぶ。着くたびに each(k) */
  coins(a, b, n, each, done) {
    if (calm() || !this.ctx) { for (let k = 0; k < n; k++) each?.(k); done?.(); return; }
    const m = this.n(n);
    for (let k = 0; k < m; k++) {
      const mid = [(a[0] + b[0]) / 2 + (Math.random() - 0.5) * 90, Math.min(a[1], b[1]) - 30 - Math.random() * 70 + Math.abs(a[1] - b[1]) * 0.2];
      this.add({ age: -k * 55, path: [a, mid, b], x: a[0], y: a[1], size: 12, shape: 'coin', color: COL.kin, rot: Math.random() * 3, vr: 9, life: 460, done: () => { each?.(k); if (k === m - 1) done?.(); } });
    }
  }
  /** 紙吹雪（制覇） */
  confetti(n = 90) {
    const cols = [COL.kin, COL.kinHi, COL.kinari, COL.shu, COL.ao];
    for (let i = 0; i < this.n(n); i++) {
      this.add({ age: -Math.random() * 1600, x: Math.random() * innerWidth, y: -20 - Math.random() * 60, vx: (Math.random() - 0.5) * 40, vy: 90 + Math.random() * 120, sway: 60 + Math.random() * 60, ph: Math.random() * 6, size: 7 + Math.random() * 7, shape: 'paper', vr: 3 + Math.random() * 6, rot: Math.random() * 6, color: cols[i % cols.length], life: 4200 + Math.random() * 2600, fade: 0.2 });
    }
  }
  /** 画素の花火 */
  firework(x, y, color = COL.kinHi) {
    const n = this.n(26);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 150 + (i % 2) * 70;
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 90, drag: 2.2, size: i % 3 ? 3 : 4, color: i % 4 ? color : COL.white, life: 900 + Math.random() * 300, fade: 0.5, blink: i % 2 === 0 });
    }
  }
}
export const fx = new Fx();

/** 要素をごく短く揺らす（検印のときだけ） */
export function shake(el, px = 2, ms = 180) {
  if (calm()) return;
  el.animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${px}px,${px}px)` },
      { transform: `translate(${-px}px,${-px * 0.5}px)` },
      { transform: `translate(${px * 0.5}px,${-px}px)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: ms, easing: 'linear', composite: 'add' },
  );
}

/** 紙の目と、印のかすれ（canvas でつくって CSS 変数に入れる） */
export function makeTextures() {
  const mk = (w, draw) => {
    const c = document.createElement('canvas');
    c.width = c.height = w;
    draw(c.getContext('2d'), w);
    return `url(${c.toDataURL('image/png')})`;
  };
  let s = 9;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const grain = mk(128, (c, w) => {
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(90,70,30,${0.03 + r() * 0.07})`;
      c.fillRect(Math.floor(r() * w), Math.floor(r() * w), 1 + Math.floor(r() * 2), 1);
    }
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(90,70,30,${0.03 + r() * 0.04})`;
      c.fillRect(Math.floor(r() * w), Math.floor(r() * w), 6 + Math.floor(r() * 16), 1);
    }
  });
  const kasure = mk(96, (c, w) => {
    for (let i = 0; i < 240; i++) {
      c.fillStyle = `rgba(244,236,216,${0.25 + r() * 0.6})`;
      c.fillRect(Math.floor(r() * w), Math.floor(r() * w), 1 + Math.floor(r() * 3), 1 + Math.floor(r() * 2));
    }
  });
  document.documentElement.style.setProperty('--grain', grain);
  document.documentElement.style.setProperty('--kasure', kasure);
}

/** 画面の重さを測って、効果の段を決める（hi：ぼかしも使う／lite：粒と雲を減らす） */
export function watchPerf() {
  const root = document.documentElement;
  let last = performance.now();
  let n = 0;
  const ds = [];
  const step = (t) => {
    ds.push(t - last);
    last = t;
    if (++n < 90) return requestAnimationFrame(step);
    const s = ds.slice(10).sort((a, b) => a - b);
    const p90 = s[Math.floor(s.length * 0.9)];
    // ぼかしは、余裕のある端末だけ（60fps を保てていて、コアが多い）
    root.classList.toggle('hi', p90 < 17.6 && (navigator.hardwareConcurrency || 4) >= 6 && !calm());
    root.classList.toggle('lite', p90 > 28);
    if (p90 > 28) fx.q = 0.5;
  };
  requestAnimationFrame(step);
}

/** ヒーローの絵（64px の升）。scale は整数倍 */
export function heroStyle(cell, sheetUrl, scale = 1) {
  const x = (cell % 16) * 64 * scale;
  const y = Math.floor(cell / 16) * 64 * scale;
  return `background-image:url('${sheetUrl}');background-position:${-x}px ${-y}px;background-size:${1024 * scale}px auto;`;
}
