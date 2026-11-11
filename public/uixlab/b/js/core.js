// 土台：小さな道具・設定・台本の状態。
import { audio } from './audio.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const fmt = (n) => Math.round(n).toLocaleString('en-US');

// ---------------------------------------------------------------- 設定（この端末に覚える）
const KEY = 'uixlab.b.settings.v1';
export const settings = { bgm: 0.7, se: 0.8, mute: false, reduce: false, fs: 1, cb: false, talk: 1 };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
} catch { /* 覚えていなければ既定のまま */ }
const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
/** 動きを減らすか（設定か、端末の設定） */
export const reduced = () => settings.reduce || !!mq?.matches;
export function applySettings() {
  const r = document.documentElement;
  r.style.setProperty('--fs', String(settings.fs));
  r.classList.toggle('rm', reduced());
  r.classList.toggle('cb', settings.cb);
  audio.setVol('bgm', settings.bgm);
  audio.setVol('se', settings.se);
  audio.setVol('mute', settings.mute);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* 覚えられなくても動く */ }
  bus.emit('settings');
}
mq?.addEventListener?.('change', applySettings);

// ---------------------------------------------------------------- できごとの連絡
const subs = new Map();
export const bus = {
  on(k, f) {
    if (!subs.has(k)) subs.set(k, new Set());
    subs.get(k).add(f);
    return () => subs.get(k).delete(f);
  },
  emit(k, v) {
    subs.get(k)?.forEach((f) => f(v));
  },
};

// ---------------------------------------------------------------- 動き
const EASE = {
  out: 'cubic-bezier(.16,.84,.28,1)',
  back: 'cubic-bezier(.2,1.5,.4,1)',
  slam: 'cubic-bezier(.3,0,.1,1)',
  inout: 'cubic-bezier(.7,0,.2,1)',
  in: 'cubic-bezier(.6,0,.9,.4)',
};
export { EASE };
/**
 * Web Animations の薄い包み。動きを減らすときは、動き（transform）を外して淡い切り替えにする。
 * opt.deco が真なら、動きを減らすときは何もしない（飾りの動き）。
 */
export function anim(el, frames, opt = {}) {
  if (!el || !el.animate) return { finished: Promise.resolve(), cancel() {}, finish() {} };
  const o = { duration: 240, easing: EASE.out, fill: 'both', ...opt };
  delete o.deco;
  if (reduced()) {
    if (opt.deco) return { finished: Promise.resolve(), cancel() {}, finish() {} };
    const list = Array.isArray(frames) ? frames : [frames];
    const hasOpacity = list.some((f) => 'opacity' in f);
    const first = list[0], last = list[list.length - 1];
    frames = hasOpacity ? [{ opacity: first.opacity ?? 1 }, { opacity: last.opacity ?? 1 }] : [{ opacity: 1 }, { opacity: 1 }];
    o.duration = Math.min(o.duration, 140);
    o.delay = Math.min(o.delay ?? 0, 60);
    o.easing = 'linear';
    delete o.iterations;
  }
  const a = el.animate(frames, o);
  a.finished.catch(() => {});
  return a;
}
/** アニメが終わるのを待つ（途中で消されても止まらない） */
export const done = (a) => (a?.finished ?? Promise.resolve()).catch(() => {});

export function vibrate(p) {
  if (reduced()) return;
  try {
    navigator.vibrate?.(p);
  } catch { /* 使えない端末 */ }
}

// ---------------------------------------------------------------- 台本の状態
export const G = {
  funds: 23716,
  brand: 16,
  sales: 31840,
  rank: 2,
  year: 1,
  month: 3,
  day: 24,
  hour: 9,
  speed: 1, // 0 止める・1 再生・3 早送り
  hold: 0, // 札を開いているあいだは時間を止める（数える）
  stage: 'title', // title → map → … → conquered
  proposal: 'none', // none → ready → approved
  bought: false,
  visitedWs: false,
  reportSeen: false,
  conquered: false,
  target: 80,
  auto: true,
};

// ---------------------------------------------------------------- 押せる物の手応え（どのボタンも同じ作法）
/** 押した・離したを class と音で返す。data-se で音を替えられる（none で鳴らさない）。 */
export function pressable(root = document) {
  let cur = null;
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('[data-press]');
    if (!b || b.disabled) return;
    cur = b;
    b.classList.add('is-down');
    void audio.start();
    bus.emit('press', { el: b, x: e.clientX, y: e.clientY });
    const se = b.dataset.se ?? 'tap';
    if (se !== 'none') audio.se(se);
  }, { passive: true });
  const up = () => {
    if (!cur) return;
    cur.classList.remove('is-down');
    if ((cur.dataset.se ?? 'tap') !== 'none') audio.se('release');
    cur = null;
  };
  root.addEventListener('pointerup', up, { passive: true });
  root.addEventListener('pointercancel', up, { passive: true });
  root.addEventListener('pointerleave', up, { passive: true });
}
