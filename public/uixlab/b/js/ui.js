// 部品：叩きつける数字・1 字ずつ喋る字・スライダー・切り替え・段の選択。
import { h, anim, done, reduced, clamp, fmt, settings, EASE, wait } from './core.js';
import { audio } from './audio.js';

// ---------------------------------------------------------------- 数字（活字のマスに 1 桁ずつ）
export class Digits {
  constructor(el, value = 0, { sign = false } = {}) {
    this.el = el;
    this.sign = sign;
    this.v = value;
    this.str = '';
    el.classList.add('dg');
    this.render(this.text(value), false);
  }
  text(v) {
    const s = fmt(Math.abs(v));
    return this.sign ? (v < 0 ? '−' : '+') + s : v < 0 ? '−' + s : s;
  }
  render(str, hit = true, strong = false) {
    const el = this.el;
    const old = this.str;
    while (el.children.length < str.length) el.prepend(document.createElement('span'));
    while (el.children.length > str.length) el.firstElementChild.remove();
    const off = old.length - str.length;
    let k = 0;
    for (let i = 0; i < str.length; i++) {
      const c = el.children[i];
      const ch = str[i];
      const was = old[i + off];
      const digit = ch >= '0' && ch <= '9';
      c.className = digit ? 'dg-c' : 'dg-s';
      if (c.textContent !== ch) c.textContent = ch;
      if (hit && was !== ch && digit) {
        if (strong) anim(c, [{ transform: 'translateY(-55%) scale(1.7)', opacity: 0 }, { transform: 'translateY(6%) scale(0.92)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 170, delay: k * 26, easing: EASE.slam, fill: 'backwards' });
        else anim(c, [{ transform: 'translateY(-32%)', opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 90, easing: 'ease-out', fill: 'none' });
        k++;
      }
    }
    this.str = str;
    el.setAttribute('aria-label', str);
  }
  /** すぐ替える（変わった桁だけ小さく跳ねる）。strong で叩きつける */
  set(v, { strong = false } = {}) {
    this.v = v;
    this.render(this.text(v), true, strong);
  }
  /**
   * 段で数え上げる（なめらかに回さず、刻みで叩く）。se は 1 段ごとに呼ばれる (i, n)。
   * 最後の値は強く叩きつける。
   */
  async count(to, { dur = 700, steps = 0, se = null, strongEnd = true } = {}) {
    const from = this.v;
    this._tok = (this._tok ?? 0) + 1;
    const tok = this._tok;
    if (reduced() || from === to) {
      this.set(to);
      return;
    }
    const n = steps || clamp(Math.round(dur / 62), 5, 28);
    for (let i = 1; i <= n; i++) {
      if (tok !== this._tok) return;
      const k = i / n;
      const e = 1 - Math.pow(1 - k, 2.2);
      const v = i === n ? to : Math.round(from + (to - from) * e);
      this.v = v;
      this.render(this.text(v), true, i === n && strongEnd);
      se?.(i, n);
      await wait(dur / n);
    }
  }
}

// ---------------------------------------------------------------- 1 字ずつ喋る
/**
 * el に text を 1 字ずつ出す。先に全部の字を透明で置くので、枠の大きさは最初から決まる。
 * 返り値の skip() で全文を出す。done は出し終わると解ける。
 */
export function typeText(el, text, { who = 0, cps = 26 } = {}) {
  el.textContent = '';
  const spans = [];
  for (const ch of text) {
    const s = document.createElement('span');
    s.textContent = ch;
    s.className = 'ty';
    el.append(s);
    spans.push(s);
  }
  el.setAttribute('aria-label', text);
  let i = 0, stopped = false, timer = 0;
  let res;
  const finished = new Promise((r) => (res = r));
  const show = (s) => s.classList.add('on');
  const finish = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    spans.forEach(show);
    res();
  };
  if (reduced()) {
    finish();
    return { done: finished, skip: finish, get typing() { return false; } };
  }
  const base = 1000 / (cps * (settings.talk || 1));
  const step = () => {
    if (stopped) return;
    if (i >= spans.length) return finish();
    const s = spans[i];
    const ch = s.textContent;
    show(s);
    const quiet = '、。！？「」・…　 ,.'.includes(ch);
    if (!quiet && i % 2 === 0) audio.se('voice', who);
    i++;
    const pause = ch === '。' || ch === '！' || ch === '？' ? base * 7 : ch === '、' ? base * 4 : base;
    timer = setTimeout(step, pause);
  };
  timer = setTimeout(step, 120);
  return { done: finished, skip: finish, get typing() { return !stopped; } };
}

// ---------------------------------------------------------------- スライダー
/** 目盛りごとに音階を上がるスライダー。返り値の set(v) で外から替えられる */
export function slider(el, { min = 0, max = 100, step = 1, value = 0, label = '', format = (v) => String(v), onInput = null, onChange = null, se = true } = {}) {
  el.classList.add('sl');
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', min);
  el.setAttribute('aria-valuemax', max);
  el.innerHTML = `<div class="sl-rail"><div class="sl-fill"></div><div class="sl-ticks"></div></div><div class="sl-thumb"><i></i><span class="sl-val"></span></div>`;
  const fill = el.querySelector('.sl-fill');
  const thumb = el.querySelector('.sl-thumb');
  const val = el.querySelector('.sl-val');
  const n = Math.round((max - min) / step);
  const ticks = el.querySelector('.sl-ticks');
  const tickN = Math.min(n, 20);
  for (let i = 0; i <= tickN; i++) ticks.append(document.createElement('i'));
  let v = value, idx = Math.round((value - min) / step), dragging = false;
  const paint = () => {
    const k = (v - min) / (max - min);
    const w = el.clientWidth - 44;
    thumb.style.transform = `translateX(${k * w}px)`;
    fill.style.transform = `scaleX(${k})`;
    val.textContent = format(v);
    el.setAttribute('aria-valuenow', v);
    el.setAttribute('aria-valuetext', format(v));
    [...ticks.children].forEach((t, i) => t.classList.toggle('on', i / tickN <= k + 0.001));
  };
  const setIdx = (i, user = true) => {
    i = clamp(i, 0, n);
    if (i === idx) return;
    idx = i;
    v = min + i * step;
    paint();
    if (user) {
      if (se) audio.se('tick', Math.round((i / n) * 12));
      anim(val, [{ transform: 'translateY(-30%) scale(1.35)' }, { transform: 'none' }], { duration: 110, easing: EASE.slam, fill: 'none' });
      onInput?.(v, i);
    }
  };
  const fromX = (x) => {
    const r = el.getBoundingClientRect();
    const k = clamp((x - r.left - 22) / (r.width - 44), 0, 1);
    setIdx(Math.round(k * n));
  };
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.classList.add('is-drag');
    el.setPointerCapture(e.pointerId);
    void audio.start();
    fromX(e.clientX);
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => dragging && fromX(e.clientX));
  const end = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-drag');
    if (se) audio.se('thunk');
    anim(thumb.firstElementChild, [{ transform: 'scale(1.18)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], { duration: 180, fill: 'none' });
    onChange?.(v);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (e.key === 'Home') setIdx(0);
    else if (e.key === 'End') setIdx(n);
    else if (d) setIdx(idx + d);
    else return;
    onChange?.(v);
    e.preventDefault();
  });
  window.addEventListener('resize', paint);
  requestAnimationFrame(paint);
  return { set(x) { v = clamp(x, min, max); idx = Math.round((v - min) / step); paint(); }, get value() { return v; }, paint };
}

// ---------------------------------------------------------------- 切り替え（入・切）
export function toggle(el, { on = false, label = '', onChange = null } = {}) {
  el.classList.add('tg');
  el.type = 'button';
  el.setAttribute('role', 'switch');
  el.setAttribute('aria-label', label);
  el.dataset.press = '';
  el.dataset.se = 'none';
  el.innerHTML = `<span class="tg-rail"><span class="tg-on">入</span><span class="tg-off">切</span></span><span class="tg-knob"><i></i></span>`;
  let st = on;
  const knob = el.querySelector('.tg-knob');
  const paint = (move) => {
    el.classList.toggle('is-on', st);
    el.setAttribute('aria-checked', String(st));
    if (move) anim(knob, [{ transform: `translateX(${st ? 0 : 36}px) scaleX(1.25)` }, { transform: `translateX(${st ? 40 : -4}px) scaleX(0.9)`, offset: 0.7 }, { transform: `translateX(${st ? 36 : 0}px)` }], { duration: 200, easing: EASE.slam, fill: 'none' });
  };
  el.addEventListener('click', () => {
    st = !st;
    audio.se('toggle', st);
    paint(true);
    onChange?.(st);
  });
  paint(false);
  return { set(v) { st = v; paint(false); }, get on() { return st; } };
}

// ---------------------------------------------------------------- 段の選択（100%・115%・130% など）
export function segmented(el, { options, value, label = '', onChange = null }) {
  el.classList.add('sg');
  el.setAttribute('role', 'radiogroup');
  el.setAttribute('aria-label', label);
  el.innerHTML = `<i class="sg-ink"></i>` + options.map((o, i) => `<button type="button" role="radio" data-press data-se="none" data-i="${i}">${o.label}</button>`).join('');
  const ink = el.querySelector('.sg-ink');
  let idx = Math.max(0, options.findIndex((o) => o.value === value));
  const paint = (move) => {
    [...el.querySelectorAll('button')].forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === idx));
      b.classList.toggle('is-on', i === idx);
    });
    ink.style.width = `${100 / options.length}%`;
    const to = `translateX(${idx * 100}%)`;
    if (move) done(anim(ink, [{ transform: ink.style.transform || 'translateX(0)' }, { transform: to }], { duration: 200, easing: EASE.back, fill: 'none' }));
    ink.style.transform = to;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const i = +b.dataset.i;
    if (i === idx) return;
    idx = i;
    audio.se('seg', i);
    paint(true);
    onChange?.(options[i].value);
  });
  paint(false);
  return { set(v) { idx = Math.max(0, options.findIndex((o) => o.value === v)); paint(false); } };
}

/** 押した所から小さく弾ける網点（押した手応えを目でも返す） */
export function ping(el, cls = 'ping') {
  if (reduced()) return;
  const p = h(`<i class="${cls}"></i>`);
  el.append(p);
  done(anim(p, [{ transform: 'scale(0.4) rotate(45deg)', opacity: 0.9 }, { transform: 'scale(1.6) rotate(45deg)', opacity: 0 }], { duration: 320, easing: 'ease-out' })).then(() => p.remove());
}
