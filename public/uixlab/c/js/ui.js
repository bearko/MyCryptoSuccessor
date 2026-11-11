// 部品：DOM の組み立て・押す手応え・桁が回る数字・1 字ずつ喋る・網目の幕（遷移）・つまみ・スイッチ
import { icon } from './icons.js';

export const env = {
  sfx: null,
  calm: () => document.documentElement.classList.contains('is-calm'),
};

/** h('div.c-a.c-b', {attrs}, ...children) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  for (const k of kids.flat(3)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}

// ---- 毎フレームの呼び出し（1 つの rAF にまとめる）
const tasks = new Set();
export const loop = {
  add(fn) {
    tasks.add(fn);
    return () => tasks.delete(fn);
  },
  run(dt, now) {
    for (const fn of tasks) fn(dt, now);
  },
};
/** 画面の時計で待つ（タブが隠れているあいだは進まない） */
export function wait(ms) {
  return new Promise((res) => {
    let left = ms;
    const off = loop.add((dt) => {
      left -= dt;
      if (left <= 0) {
        off();
        res();
      }
    });
  });
}
export const after = (ms, fn) => {
  let left = ms;
  let dead = false;
  const off = loop.add((dt) => {
    left -= dt;
    if (left <= 0) {
      off();
      if (!dead) fn();
    }
  });
  return () => {
    dead = true;
    off();
  };
};

export function vibrate(ms) {
  if (env.calm()) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 使えない端末では何もしない */
  }
}

export function shake(el) {
  if (env.calm() || !el) return;
  el.classList.remove('is-shake');
  void el.offsetWidth;
  el.classList.add('is-shake');
}

// ---- 押す手応え：押した瞬間に沈む（60〜90ms）・離すと戻る。音は押す／離すで別
export function press(el, fn, opt = {}) {
  let downAt = 0;
  let isDown = false;
  const up = (fire) => {
    if (!isDown) return;
    isDown = false;
    const held = performance.now() - downAt;
    const lift = () => {
      el.classList.remove('is-down');
      if (!opt.silent) env.sfx?.release();
    };
    // すばやく叩いても、沈んだ形が 1 コマは見えるようにする
    if (held < 70) setTimeout(lift, 70 - held);
    else lift();
    if (fire) fn?.(el);
  };
  el.addEventListener('pointerdown', (e) => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    if (e.button > 0) return;
    isDown = true;
    downAt = performance.now();
    el.classList.add('is-down');
    if (!opt.silent) env.sfx?.press(opt.strong);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* 取れなくても動く */
    }
  });
  el.addEventListener('pointerup', (e) => {
    const r = el.getBoundingClientRect();
    const inside = e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8;
    up(inside);
  });
  el.addEventListener('pointercancel', () => up(false));
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault();
      isDown = true;
      downAt = performance.now();
      el.classList.add('is-down');
      if (!opt.silent) env.sfx?.press(opt.strong);
    }
  });
  el.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') up(true);
  });
  // 読み上げなどの「クリック」だけが来たとき
  el.addEventListener('click', (e) => {
    if (e.detail === 0 && !isDown) fn?.(el);
  });
  return el;
}

/** 機械のキー。kind: amber | paper | good | flat | ''  */
export function key(label, fn, { kind = '', big = false, ico = null, cls = '', attrs = {}, strong = false, icoColor } = {}) {
  const dark = kind === 'amber' || kind === 'paper' || kind === 'good';
  const cap = h('span.c-cap', ico ? icon(ico, { color: icoColor ?? (dark ? '#1a1c2e' : '#f4ecd4'), hi: dark ? '#1a1c2e' : '#fffdf3', lo: dark ? '#7a3f06' : '#0b0d17' }) : null, typeof label === 'string' ? h('b', label) : label);
  const b = h(`button.c-key${kind ? '.c-key--' + kind : ''}${big ? '.c-key--big' : ''}${cls ? '.' + cls : ''}`, { type: 'button', ...attrs }, cap);
  press(b, fn, { strong });
  return b;
}

// ---- 桁が回る数字
const odos = new Set();
export class Odo {
  constructor({ digits = 7, size = '', value = 0, cls = '', unit = '' } = {}) {
    this.n = digits;
    this.v = value;
    this.shown = value;
    this.anim = null;
    this.cells = [];
    this.seps = [];
    this.el = h(`span.c-odo${size ? '.c-odo--' + size : ''}${cls ? '.' + cls : ''}`, { role: 'img' });
    for (let k = digits - 1; k >= 0; k--) {
      const strip = h('span', '0123456789'.split('').map((d) => h('i', d)), h('i', '0'));
      const cell = h('span.c-odo-d', strip);
      this.cells[k] = { cell, strip, pos: -1 };
      this.el.append(cell);
      if (k % 3 === 0 && k > 0) {
        const s = h('span.c-odo-sep', ',');
        this.seps[k] = s;
        this.el.append(s);
      }
    }
    if (unit) this.el.append(h('span.c-odo-unit', unit));
    this.draw(value);
    odos.add(this);
  }
  /** 値を替える。dur を渡すと、その時間で桁が転がる */
  set(v, { dur = 600, onTick, onDone, ease } = {}) {
    v = Math.max(0, Math.round(v));
    this.v = v;
    if (env.calm() || dur <= 0) {
      this.anim = null;
      this.draw(v);
      onDone?.();
      return;
    }
    this.anim = { from: this.shown, to: v, t: 0, dur, onTick, onDone, last: Math.floor(this.shown), ease: ease ?? ((x) => 1 - Math.pow(1 - x, 3)) };
  }
  finish() {
    if (!this.anim) return;
    const a = this.anim;
    this.anim = null;
    this.draw(a.to);
    a.onDone?.();
  }
  step(dt) {
    const a = this.anim;
    if (!a) return;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const x = a.from + (a.to - a.from) * a.ease(k);
    this.draw(k >= 1 ? a.to : x);
    const f = Math.floor(x);
    if (f !== a.last) {
      a.last = f;
      a.onTick?.(k, x);
    }
    if (k >= 1) {
      this.anim = null;
      a.onDone?.();
    }
  }
  draw(x) {
    this.shown = x;
    const whole = Math.floor(x);
    const frac = x - whole;
    // 下の桁が 9 → 0 に回るあいだだけ、上の桁が一緒に回る（本物のカウンターと同じ動き）
    let carry = frac;
    let lead = true;
    for (let k = 0; k < this.n; k++) {
      const p10 = Math.pow(10, k);
      const d = Math.floor(whole / p10) % 10;
      const pos = d + carry;
      const c = this.cells[k];
      const q = Math.round(pos * 20) / 20;
      if (q !== c.pos) {
        c.pos = q;
        c.strip.style.transform = `translate3d(0,${(-q * 0.75).toFixed(4)}em,0)`;
      }
      carry = d === 9 ? carry : 0;
    }
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
  destroy() {
    odos.delete(this);
  }
}
loop.add((dt) => {
  for (const o of odos) if (o.anim) o.step(dt);
});

// ---- 1 字ずつ喋る。押すと全文が出る
export function typeText(el, text, { voice, cps = 26, onDone } = {}) {
  el.textContent = '';
  const chars = [...text];
  // 先に全部の字を透明で置く：枠の大きさが喋っている途中で変わらない
  const spans = chars.map((c) => h('span', { style: { opacity: '0' } }, c));
  el.append(...spans);
  let i = 0;
  let acc = 0;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    off();
    for (const s of spans) s.style.opacity = '';
    onDone?.();
  };
  const off = loop.add((dt) => {
    acc += dt;
    const per = 1000 / cps;
    while (acc >= per && i < chars.length) {
      const c = chars[i];
      spans[i].style.opacity = '';
      i++;
      // 句読点で息をつく
      acc -= /[、，]/.test(c) ? per * 4 : /[。！？…]/.test(c) ? per * 7 : per;
      if (voice) env.sfx?.speak(voice, c);
    }
    if (i >= chars.length) finish();
  });
  if (env.calm()) finish();
  return { skip: finish, get done() { return done; } };
}

// ---- お知らせ
let toastOff = null;
export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.replaceChildren(h('div', msg));
  t.classList.add('is-on');
  toastOff?.();
  toastOff = after(ms, () => t.classList.remove('is-on'));
}

// ---- 網目の幕：決めの遷移。画素の升目が、押した場所から順序つきディザの順で埋まり、同じ順で晴れる
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export class Wipe {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.cell = 10;
    this.busy = false;
    // 幕が閉じているあいだ、行き先の名前を出す（チャンネルを切り替える機械の札）
    this.label = h('div.c-wipe-label', { 'aria-hidden': 'true' });
    cv.after(this.label);
  }
  /**
   * @param {{x:number,y:number}} origin 画面の点（CSS px）
   * @param {()=>void} mid 幕が閉じきったときに呼ぶ（裏で画面を入れ替える）
   */
  play(origin, mid, { inMs = 230, holdMs = 50, outMs = 250, color = [21, 24, 41], edge = [255, 184, 31], reverse = false, label = '' } = {}) {
    if (env.calm()) {
      // 動きを減らす：淡い切り替えだけ
      const app = this.cv.parentElement;
      app.animate([{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }], { duration: 160 });
      mid?.();
      return Promise.resolve();
    }
    if (this.busy) {
      mid?.();
      return Promise.resolve();
    }
    this.busy = true;
    const W = Math.ceil(innerWidth / this.cell);
    const H = Math.ceil(innerHeight / this.cell);
    const cv = this.cv;
    cv.width = W;
    cv.height = H;
    cv.style.visibility = 'visible';
    const ox = origin.x / this.cell;
    const oy = origin.y / this.cell;
    const far = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy));
    const th = new Float32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        // 四角く広がる（円にしない）：チェビシェフ距離とマンハッタン距離のあいだ
        const dx = Math.abs(x - ox);
        const dy = Math.abs(y - oy);
        const d = (Math.max(dx, dy) * 0.7 + (dx + dy) * 0.3) / (far * 1.05);
        th[y * W + x] = d * 0.74 + (BAYER[(y & 3) * 4 + (x & 3)] / 16) * 0.26;
      }
    const img = this.ctx.createImageData(W, H);
    const px = img.data;
    const draw = (p, out) => {
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
        // 幕のふち：1 段だけ明るい（ブラウン管の光が走る）
        const e = d < 0.035;
        px[k] = e ? edge[0] : color[0];
        px[k + 1] = e ? edge[1] : color[1];
        px[k + 2] = e ? edge[2] : color[2];
        px[k + 3] = 255;
      }
      this.ctx.putImageData(img, 0, 0);
    };
    const lab = this.label;
    lab.textContent = label;
    return new Promise((res) => {
      let t = 0;
      let phase = 0;
      let lastQ = -1;
      const off = loop.add((dt) => {
        t += dt;
        if (phase === 0) {
          const k = Math.min(1, t / inMs);
          // 1 秒に 30 段：カクカクと「機械が切り替える」動きにする
          const q = Math.round(k * 9) / 9;
          if (q !== lastQ) draw(q * 1.06, false);
          lastQ = q;
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
          const q = Math.round(k * 9) / 9;
          if (q !== lastQ) draw(q * 1.06 - 0.03, true);
          lastQ = q;
          if (k >= 0.3) lab.classList.remove('is-on');
          if (k >= 1) {
            off();
            cv.style.visibility = 'hidden';
            this.busy = false;
            res();
          }
        }
      });
    });
  }
}

// ---- つまみ（スライダー）
export function fader({ min = 0, max = 10, step = 1, value = 0, label = '', onInput, onChange }) {
  const fill = h('div.c-fader-fill');
  const knob = h('div.c-fader-knob');
  const el = h('div.c-fader', { role: 'slider', tabindex: '0', 'aria-label': label, 'aria-valuemin': min, 'aria-valuemax': max }, h('div.c-fader-track', fill), h('div.c-fader-ticks'), knob);
  let v = value;
  const paint = () => {
    const p = (v - min) / (max - min);
    const w = el.clientWidth || 200;
    // 2px の格子に乗せる
    const x = Math.round((p * (w - 20) + 10) / 2) * 2;
    knob.style.transform = `translate3d(${x}px,0,0)`;
    fill.style.transform = `scaleX(${(x / w).toFixed(4)})`;
    el.setAttribute('aria-valuenow', v);
  };
  const setFrom = (clientX, fire) => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left - 10) / (r.width - 20)));
    const nv = Math.round((min + p * (max - min)) / step) * step;
    if (nv !== v) {
      v = nv;
      paint();
      if (fire) onInput?.(v, (v - min) / (max - min));
    }
  };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-drag');
    env.sfx?.press();
    setFrom(e.clientX, true);
  });
  el.addEventListener('pointermove', (e) => {
    if (el.classList.contains('is-drag')) setFrom(e.clientX, true);
  });
  const end = () => {
    if (!el.classList.contains('is-drag')) return;
    el.classList.remove('is-drag');
    env.sfx?.release();
    onChange?.(v);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!d) return;
    e.preventDefault();
    const nv = Math.max(min, Math.min(max, v + d));
    if (nv !== v) {
      v = nv;
      paint();
      onInput?.(v, (v - min) / (max - min));
      onChange?.(v);
    }
  });
  new ResizeObserver(paint).observe(el);
  requestAnimationFrame(paint);
  return { el, get value() { return v; }, set(nv) { v = nv; paint(); } };
}

// ---- 切り替えスイッチ
export function toggle({ label, value = false, on = '入', off = '切', onChange }) {
  const state = h('span.c-switch-state', value ? on : off);
  const el = h('button.c-switch', { type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label }, h('span.c-switch-box', h('span.c-switch-knob')), state);
  let v = value;
  const flip = () => {
    v = !v;
    el.setAttribute('aria-checked', String(v));
    state.textContent = v ? on : off;
    env.sfx?.toggle(v);
    onChange?.(v);
  };
  el.addEventListener('click', flip);
  return { el, get value() { return v; }, set(nv) { v = nv; el.setAttribute('aria-checked', String(v)); state.textContent = v ? on : off; } };
}

/** 数字を 3 桁区切りに */
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
