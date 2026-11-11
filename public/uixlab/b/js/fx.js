// 号外の見た目の効果：網点・紙の地・切り抜き・粒・斜めの切り裂き・叩きつけ。
import { $, h, anim, done, reduced, wait, rand, EASE, clamp } from './core.js';
import { audio } from './audio.js';

const INK = '#15110d';
const PAPER = '#f3e9d2';
const SHU = '#e8381b';
const GOLD = '#f5b61a';
const css = (k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
/** 設定（色覚に配慮した色）で替わる色を読む */
export const tone = () => ({ ink: css('--ink') || INK, paper: css('--paper') || PAPER, shu: css('--shu') || SHU, gold: css('--gold') || GOLD });

// ---------------------------------------------------------------- 網点（45° のひし形の点。丸は使わない）
function htCanvas({ cell = 8, rows = 16, color = INK, from = 0, to = 1, scale = 2 }) {
  const c = document.createElement('canvas');
  c.width = cell * scale;
  c.height = (cell / 2) * rows * scale;
  const g = c.getContext('2d');
  g.scale(scale, scale);
  g.fillStyle = color;
  for (let r = -1; r <= rows; r++) {
    const t = clamp(r / (rows - 1), 0, 1);
    const cov = from + (to - from) * t;
    const rad = (cell / 2) * Math.sqrt(Math.max(0, cov)) * 1.02;
    const y = r * (cell / 2);
    for (let k = -1; k <= 1; k++) {
      const x = (r % 2 ? cell / 2 : 0) + k * cell;
      if (rad <= 0.2) continue;
      g.beginPath();
      g.moveTo(x, y - rad);
      g.lineTo(x + rad, y);
      g.lineTo(x, y + rad);
      g.lineTo(x - rad, y);
      g.closePath();
      g.fill();
    }
  }
  return c;
}
function grainCanvas(alpha = 0.07) {
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d');
  const d = g.createImageData(160, 160);
  let s = 4242;
  for (let i = 0; i < d.data.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const v = s / 2147483647;
    const dark = v < 0.5;
    d.data[i] = d.data[i + 1] = d.data[i + 2] = dark ? 40 : 255;
    d.data[i + 3] = Math.floor(Math.pow(Math.abs(v - 0.5) * 2, 3) * 255 * alpha * 2.4);
  }
  g.putImageData(d, 0, 0);
  return c;
}
/** 網点と紙の地を作って、CSS の変数に置く（色が替わったら作り直す） */
export function makeTextures() {
  const T = tone();
  const set = (k, c) => document.documentElement.style.setProperty(k, `url(${c.toDataURL()})`);
  set('--ht-ink-up', htCanvas({ color: T.ink, from: 0, to: 0.96, rows: 20 }));
  set('--ht-ink-dn', htCanvas({ color: T.ink, from: 0.96, to: 0, rows: 20 }));
  set('--ht-shu-up', htCanvas({ color: T.shu, from: 0, to: 0.96, rows: 20 }));
  set('--ht-shu-dn', htCanvas({ color: T.shu, from: 0.96, to: 0, rows: 20 }));
  set('--ht-paper-up', htCanvas({ color: T.paper, from: 0, to: 0.96, rows: 20 }));
  set('--ht-gold-up', htCanvas({ color: T.gold, from: 0, to: 0.9, rows: 20 }));
  set('--ht-ink-20', htCanvas({ color: T.ink, from: 0.2, to: 0.2, rows: 2 }));
  set('--ht-ink-45', htCanvas({ color: T.ink, from: 0.45, to: 0.45, rows: 2 }));
  set('--ht-paper-12', htCanvas({ color: T.paper, from: 0.12, to: 0.12, rows: 2 }));
  set('--ht-shu-30', htCanvas({ color: T.shu, from: 0.3, to: 0.3, rows: 2 }));
  set('--ht-ink-10', htCanvas({ color: T.ink, from: 0.1, to: 0.1, rows: 2, cell: 6 }));
  set('--grain', grainCanvas());
}

// ---------------------------------------------------------------- 切り抜き（ドット絵のヒーローを、紙から切り抜いたように）
const imgs = new Map();
export function loadImage(src) {
  if (imgs.has(src)) return imgs.get(src);
  const p = new Promise((res) => {
    const im = new Image();
    im.decoding = 'async';
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = src;
  });
  imgs.set(src, p);
  return p;
}
let sheet = null;
export async function loadSprites() {
  sheet = await loadImage('img/sprites.png');
  return sheet;
}
/** スプライトの番号（img/sprites.png の並び） */
export const SPR = {
  artist: 0, tactician: 1, warrior: 2, pythagoras: 3, wright: 4, archimedes: 5, fukuzawa: 6, ino: 7,
  shoko: 8, pascal: 9, david: 10, raiden: 11, seton: 12, michel: 13, grimm: 14, kai: 15,
  sensu: 16, mallet: 17, lantern: 18, pen: 19, musicbox: 20, blade: 21, book: 22, ring: 23,
};
const cutCache = new Map();
/**
 * 切り抜きの絵を作る。scale は整数倍。outline は縁の太さ（絵の 1 画素ぶんを単位に）。
 * reg を渡すと、朱の版が少しずれて重なる（版ずれ）。
 */
export function cutout(src, { scale = 3, outline = 1, edge = null, reg = 0, regColor = null, flip = false, rect = null, shadow = 0 } = {}) {
  const key = JSON.stringify([typeof src === 'number' ? src : src?.src, scale, outline, edge, reg, regColor, flip, rect, shadow]);
  if (cutCache.has(key)) return clone(cutCache.get(key));
  const T = tone();
  const im = typeof src === 'number' ? sheet : src;
  const [sx, sy, sw, sh] = typeof src === 'number' ? [(src % 8) * 64, Math.floor(src / 8) * 64, 64, 64] : rect ?? [0, 0, im?.naturalWidth ?? 64, im?.naturalHeight ?? 64];
  const o = outline * scale;
  const pad = o + Math.max(reg, shadow) + 1;
  const c = document.createElement('canvas');
  c.width = sw * scale + pad * 2;
  c.height = sh * scale + pad * 2;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (!im) return c;
  // もとの絵
  const a = document.createElement('canvas');
  a.width = sw * scale;
  a.height = sh * scale;
  const ag = a.getContext('2d');
  ag.imageSmoothingEnabled = false;
  if (flip) {
    ag.translate(a.width, 0);
    ag.scale(-1, 1);
  }
  ag.drawImage(im, sx, sy, sw, sh, 0, 0, a.width, a.height);
  // 影の形（1 色）
  const sil = (color) => {
    const s = document.createElement('canvas');
    s.width = a.width;
    s.height = a.height;
    const sg = s.getContext('2d');
    sg.drawImage(a, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = color;
    sg.fillRect(0, 0, s.width, s.height);
    return s;
  };
  const ring = (s, w, ox = 0, oy = 0) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) g.drawImage(s, pad + dx * w + ox, pad + dy * w + oy);
    g.drawImage(s, pad + ox, pad + oy);
  };
  if (shadow) ring(sil(T.ink), o, shadow, shadow);
  if (reg) ring(sil(regColor ?? T.shu), o, reg, reg);
  if (outline) ring(sil(edge ?? T.paper), o);
  g.drawImage(a, pad, pad);
  c.dataset.pad = String(pad);
  cutCache.set(key, c);
  return clone(c);
}
function clone(c) {
  const n = document.createElement('canvas');
  n.width = c.width;
  n.height = c.height;
  n.getContext('2d').drawImage(c, 0, 0);
  n.style.width = `${c.width}px`;
  n.style.height = `${c.height}px`;
  n.className = 'cut';
  n.dataset.pad = c.dataset.pad ?? '0';
  n.setAttribute('aria-hidden', 'true');
  return n;
}
export function clearCutCache() {
  cutCache.clear();
}

// ---------------------------------------------------------------- 粒（1 枚の上掛けの canvas）
let cv, cx2, W = 0, H = 0, DPR = 1;
const parts = [];
let raf = 0, lastT = 0, slow = 0;
/** 重いと感じたら粒の数を落とす（0.4〜1） */
export let quality = 1;
export function initFx() {
  cv = $('#fx');
  cx2 = cv.getContext('2d');
  const fit = () => {
    // 粒は大きな四角とひし形なので、等倍の canvas で足りる（塗る画素が 1/4 になる）
    DPR = 1;
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
  };
  fit();
  window.addEventListener('resize', fit);
}
let coinImg = null;
loadImage('../../mch/Image/Icons/gum.png').then((im) => (coinImg = im));
function frame(t) {
  raf = 0;
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  // コマが遅い日が続いたら、次からの粒を減らす
  if (t - lastT > 30) slow++;
  else slow = Math.max(0, slow - 0.25);
  if (slow > 12 && quality > 0.4) {
    quality = Math.max(0.4, quality - 0.2);
    slow = 0;
    if (quality <= 0.6) document.documentElement.classList.add('lite');
  }
  lastT = t;
  cx2.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx2.clearRect(0, 0, W, H);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age < 0) continue;
    if (p.age >= p.life) {
      parts.splice(i, 1);
      continue;
    }
    const k = p.age / p.life;
    if (p.to) {
      // 目的地へ吸い込まれる（金貨が資金へ）
      const e = k * k * (3 - 2 * k);
      p.x = p.x0 + (p.to[0] - p.x0) * e + Math.sin(k * Math.PI) * p.arc;
      p.y = p.y0 + (p.to[1] - p.y0) * e - Math.sin(k * Math.PI) * Math.abs(p.arc) * 0.6;
    } else {
      p.vy += p.g * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.rot += p.vr * dt;
    const a = p.fade === 'late' ? (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3) : 1 - k;
    const s = p.size * (p.shrink ? 1 - k * p.shrink : 1);
    cx2.globalAlpha = Math.max(0, a) * (p.alpha ?? 1);
    cx2.fillStyle = p.color;
    if (p.shape === 'dia') {
      cx2.beginPath();
      cx2.moveTo(p.x, p.y - s);
      cx2.lineTo(p.x + s, p.y);
      cx2.lineTo(p.x, p.y + s);
      cx2.lineTo(p.x - s, p.y);
      cx2.fill();
    } else if (p.shape === 'sq') {
      cx2.save();
      cx2.translate(p.x, p.y);
      cx2.rotate(p.rot);
      cx2.fillRect(-s, -s * (p.ratio ?? 1) * Math.cos(p.age * (p.flut ?? 0)), s * 2, s * 2 * (p.ratio ?? 1) * Math.cos(p.age * (p.flut ?? 0)));
      cx2.restore();
    } else if (p.shape === 'paper') {
      // 号外の紙：ひらひら回りながら落ちる（縦の縮みで裏返りを見せる）
      const fl = Math.cos(p.age * p.flut + p.ph);
      cx2.save();
      cx2.translate(p.x + Math.sin(p.age * 1.7 + p.ph) * 26, p.y);
      cx2.rotate(p.rot);
      cx2.scale(1, fl);
      const w = s * 2, hh = s * 2.7;
      cx2.fillStyle = fl > 0 ? p.color : p.back;
      cx2.fillRect(-w / 2, -hh / 2, w, hh);
      if (fl > 0) {
        cx2.fillStyle = p.c2;
        cx2.fillRect(-w / 2 + w * 0.1, -hh / 2 + hh * 0.08, w * 0.8, hh * 0.2);
        cx2.fillStyle = p.c3;
        for (let r = 0; r < 4; r++) cx2.fillRect(-w / 2 + w * 0.1, -hh / 2 + hh * (0.36 + r * 0.14), w * (r === 3 ? 0.5 : 0.8), hh * 0.05);
      }
      cx2.restore();
    } else if (p.shape === 'coin') {
      const fl = Math.abs(Math.cos(p.age * 9 + p.ph));
      if (coinImg) {
        cx2.imageSmoothingEnabled = false;
        cx2.drawImage(coinImg, p.x - s * fl, p.y - s, s * 2 * fl, s * 2);
      } else cx2.fillRect(p.x - s * fl, p.y - s, s * 2 * fl, s * 2);
    } else if (p.shape === 'line') {
      cx2.save();
      cx2.translate(p.x, p.y);
      cx2.rotate(Math.atan2(p.vy, p.vx));
      cx2.fillRect(-s * 4, -s / 2, s * 8 * (1 - k), s);
      cx2.restore();
    }
  }
  cx2.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(frame);
  else cx2.clearRect(0, 0, W, H);
}
function kick() {
  if (!raf && parts.length) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
}
function add(p) {
  parts.push({ age: 0, life: 0.6, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, size: 4, color: PAPER, shape: 'sq', ...p });
}
const n = (v) => Math.max(1, Math.round(v * quality));
/** 網点が弾ける（承認・完成・買ったとき） */
export function burst(x, y, { count = 28, colors = null, speed = 520, size = 7, life = 0.55, spread = Math.PI * 2, dir = 0, lines = true } = {}) {
  if (reduced()) return;
  const T = tone();
  colors ??= [T.shu, T.gold, T.paper, T.ink];
  for (let i = 0; i < n(count); i++) {
    const a = dir + (Math.random() - 0.5) * spread;
    const v = speed * (0.35 + Math.random() * 0.9);
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 3.2, size: size * (0.4 + Math.random() * 0.9), shrink: 0.9, color: colors[i % colors.length], shape: 'dia', life: life * (0.7 + Math.random() * 0.6) });
  }
  if (lines) for (let i = 0; i < n(count / 3); i++) {
    const a = dir + (Math.random() - 0.5) * spread;
    const v = speed * (1.1 + Math.random() * 0.8);
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 4, size: 3, color: i % 2 ? T.ink : T.paper, shape: 'line', life: life * 0.6 });
  }
  kick();
}
/** 金貨が飛ぶ。to を渡すと、そこへ吸い込まれる */
export function coins(x, y, count = 8, to = null) {
  if (reduced()) return;
  for (let i = 0; i < n(count); i++) {
    if (to) add({ x, y, x0: x + rand(-18, 18), y0: y + rand(-12, 12), to, arc: rand(-90, 90), size: 9, shape: 'coin', life: 0.5 + i * 0.035, age: -i * 0.03, fade: 'late', ph: rand(6) });
    else add({ x: x + rand(-10, 10), y, vx: rand(-160, 160), vy: rand(-520, -260), g: 1500, size: 9, shape: 'coin', life: rand(0.7, 1.1), fade: 'late', ph: rand(6) });
  }
  kick();
}
/** 号外の紙が舞う */
export function papers(count = 26, { from = 'top', dur = 3.6 } = {}) {
  if (reduced()) return;
  const T = tone();
  for (let i = 0; i < n(count); i++) {
    const big = Math.random() < 0.35;
    add({
      x: rand(-0.1, 1.1) * W, y: from === 'top' ? rand(-0.5, -0.05) * H : H * 0.5, vx: rand(-40, 40), vy: rand(150, 330), g: 30, drag: 0.2,
      rot: rand(-0.6, 0.6), vr: rand(-1.4, 1.4), size: big ? rand(16, 24) : rand(8, 13), shape: 'paper', flut: rand(2.5, 6), ph: rand(6),
      color: T.paper, back: '#d9cba8', c2: i % 3 ? T.ink : T.shu, c3: '#9a8d70', life: dur * rand(0.8, 1.25), age: -rand(0, 1.2), fade: 'late',
    });
  }
  kick();
}
/** 紙吹雪（四角） */
export function confetti(x, y, count = 40, { up = 700, spread = 500 } = {}) {
  if (reduced()) return;
  const T = tone();
  const cs = [T.shu, T.gold, T.paper, T.gold, T.shu];
  for (let i = 0; i < n(count); i++) add({ x, y, vx: rand(-spread, spread), vy: rand(-up, -up * 0.3), g: 900, drag: 1.2, rot: rand(6), vr: rand(-9, 9), size: rand(3, 6), ratio: rand(0.5, 1.6), flut: rand(6, 14), color: cs[i % cs.length], shape: 'sq', life: rand(1.2, 2.2), fade: 'late' });
  kick();
}
/** 花火（四角の粒）。地図の祝いに */
export function firework(x, y, color = null) {
  if (reduced()) return;
  const T = tone();
  const c = color ?? [T.gold, T.shu, T.paper][Math.floor(Math.random() * 3)];
  const cnt = n(26);
  for (let i = 0; i < cnt; i++) {
    const a = (i / cnt) * Math.PI * 2;
    const v = 240 + (i % 2) * 110;
    add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 160, drag: 2.2, size: 4, shrink: 0.6, color: i % 3 ? c : T.paper, shape: 'dia', life: rand(0.8, 1.1), fade: 'late' });
  }
  kick();
}

// ---------------------------------------------------------------- 画面ごと動かす手応え
/** 画面を 1〜2px 揺らす */
export function shake(power = 2, dur = 200) {
  const s = $('#stage');
  const p = power;
  return anim(s, [
    { transform: `translate(${p}px,${-p}px)` }, { transform: `translate(${-p}px,${p}px)` }, { transform: `translate(${p * 0.6}px,${p * 0.5}px)` },
    { transform: `translate(${-p * 0.4}px,${-p * 0.3}px)` }, { transform: 'translate(0,0)' },
  ], { duration: dur, easing: 'steps(5,end)', fill: 'none', deco: true });
}
/** 叩いた瞬間の白い 1 コマ */
export function flash(color = null, peak = 0.75, dur = 150) {
  if (reduced()) return;
  const f = h(`<div class="flash"></div>`);
  if (color) f.style.background = color;
  $('#layer-cut').append(f);
  done(anim(f, [{ opacity: peak }, { opacity: 0 }], { duration: dur, easing: 'ease-out' })).then(() => f.remove());
}

// ---------------------------------------------------------------- 斜めに切り裂く（この方向の決めの遷移）
/**
 * 帯が斜めに走って画面を切り替える。from：'right'・'left'・'down'・'up'（入口の向きで替える）。
 * mid() は画面が覆われた瞬間に呼ぶ。全体で 560〜640ms。
 */
export async function slash({ from = 'right', mid = null, dur = 600, colors = ['shu', 'ink'], label = '' } = {}) {
  if (reduced()) {
    const v = h(`<div class="veil"></div>`);
    $('#layer-cut').append(v);
    await done(anim(v, [{ opacity: 0 }, { opacity: 1 }], { duration: 100 }));
    await mid?.();
    await done(anim(v, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 }));
    v.remove();
    return;
  }
  audio.se('slash');
  const horiz = from === 'right' || from === 'left';
  const sign = from === 'right' || from === 'down' ? 1 : -1;
  const wrap = h(`<div class="slash slash--${horiz ? 'h' : 'v'}"></div>`);
  const bands = colors.map((c, i) => {
    const b = h(`<div class="slash-band slash-band--${c}"><i></i>${label && i === colors.length - 1 ? `<b>${label}</b>` : ''}</div>`);
    wrap.append(b);
    return b;
  });
  $('#layer-cut').append(wrap);
  const ax = horiz ? 'X' : 'Y';
  const skew = horiz ? 'skewX(-12deg)' : 'skewY(-7deg)';
  const half = dur * 0.46;
  const lag = 55;
  const ins = bands.map((b, i) => anim(b, [{ transform: `translate${ax}(${sign * 135}%) ${skew}` }, { transform: `translate${ax}(0%) ${skew}` }], { duration: half, delay: i * lag, easing: EASE.slam }));
  await done(ins[ins.length - 1]);
  await mid?.();
  const outs = bands.map((b, i) => anim(b, [{ transform: `translate${ax}(0%) ${skew}` }, { transform: `translate${ax}(${-sign * 135}%) ${skew}` }], { duration: half, delay: (bands.length - 1 - i) * lag + 40, easing: EASE.inout }));
  await done(outs[0]);
  wrap.remove();
}

/** 部門の帯：押した入口の名前が、斜めの帯で画面を横切る（まだ中身の無い入口の返事） */
export async function ribbon(text, sub = '', { from = 'left', color = 'ink' } = {}) {
  const el = h(`<div class="ribbon ribbon--${color}" aria-live="polite"><div class="ribbon-in"><b>${text}</b>${sub ? `<span>${sub}</span>` : ''}</div></div>`);
  $('#layer-cut').append(el);
  const s = from === 'left' ? -1 : 1;
  if (reduced()) {
    await done(anim(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }));
    await wait(900);
    await done(anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 140 }));
  } else {
    await done(anim(el, [{ transform: `translateX(${s * 110}%) rotate(-7deg)` }, { transform: 'translateX(0) rotate(-7deg)' }], { duration: 260, easing: EASE.back }));
    anim(el.firstElementChild, [{ transform: `translateX(${s * 14}px)` }, { transform: `translateX(${-s * 14}px)` }], { duration: 950, easing: 'linear' });
    await wait(820);
    await done(anim(el, [{ transform: 'translateX(0) rotate(-7deg)' }, { transform: `translateX(${-s * 115}%) rotate(-7deg)` }], { duration: 240, easing: EASE.in }));
  }
  el.remove();
}

// ---------------------------------------------------------------- 活字を叩きつける
/** 見出しを 1 字ずつの活字にする（版ずれの層つき） */
export function typeset(el, text = el.textContent) {
  el.textContent = '';
  el.classList.add('ts');
  el.setAttribute('aria-label', text);
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'ts-c';
    s.dataset.t = ch;
    s.textContent = ch;
    s.setAttribute('aria-hidden', 'true');
    if (ch === ' ' || ch === '　') s.classList.add('ts-sp');
    el.append(s);
  }
  return [...el.children];
}
/** 活字が 1 つずつ落ちてくる。gap は字の間（ms）。se を鳴らす */
export function slamType(el, { gap = 60, delay = 0, dur = 190, se = true, from = 2.3, rot = 9 } = {}) {
  const cs = el.classList.contains('ts') ? [...el.children] : typeset(el);
  cs.forEach((c, i) => {
    if (c.classList.contains('ts-sp')) return;
    const r = (i % 2 ? 1 : -1) * rot * (0.6 + Math.random() * 0.6);
    anim(c, [
      { transform: `translateY(-38%) scale(${from}) rotate(${r}deg)`, opacity: 0 },
      { transform: `translateY(4%) scale(0.94) rotate(${-r * 0.1}deg)`, opacity: 1, offset: 0.72 },
      { transform: 'translateY(0) scale(1) rotate(0)', opacity: 1 },
    ], { duration: dur, delay: delay + i * gap, easing: EASE.slam });
    if (se && !reduced()) audio.seAt('slam', (delay + i * gap + dur * 0.7) / 1000, 1, i);
  });
  return delay + cs.length * gap + dur;
}
/** 1 つの物を叩きつける（札・帯・数字） */
export function slam(el, { from = 1.9, rot = -6, dur = 200, delay = 0 } = {}) {
  return anim(el, [
    { transform: `scale(${from}) rotate(${rot}deg)`, opacity: 0 },
    { transform: 'scale(0.95) rotate(0.6deg)', opacity: 1, offset: 0.7 },
    { transform: 'scale(1) rotate(0)', opacity: 1 },
  ], { duration: dur, delay, easing: EASE.slam });
}
