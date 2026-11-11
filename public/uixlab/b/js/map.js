// 地図：町の絵（ゲームの画面から撮った 1 枚）の上に、動く層を重ねる。カメラは transform だけで動かす。
// 雲の影・水面のきらめき・煙・歩く人・荷車・舟・「+N G」。待っているあいだも町は生きている。
import { $, h, anim, done, reduced, clamp, rand, EASE, bus, fmt } from './core.js';
import { audio } from './audio.js';
import { SPR } from './fx.js';

export const MAP = { W: 3720, H: 2140 };
/** マスのまん中（地図の絵の座標） */
export const P = (i, j) => [1860 + (i - j) * 100, 245 + (i + j) * 55];
export const WS = { x: 1260, y: 1125, top: 1000 };
export const SHOPS = [
  { id: 'yorozu', x: 1060, y: 1235, name: 'よろず屋 本通り店' },
  { id: 'import', x: 1660, y: 1235, name: '輸入雑貨店' },
  { id: 'yorozu2', x: 2260, y: 905, name: 'よろず屋 駅前店' },
];
const CHIMNEYS = [[1283, 1024], [1393, 760], [1322, 1300], [2103, 1166], [961, 1128]];

let world, camEl, amb, pops, screenEl, tag, hot;
export const cam = { x: 1400, y: 1090, z: 0.5, vw: 390, vh: 844, busy: false };
let baseZ = 0.5;
const tf = (c = cam) => `translate3d(${(cam.vw / 2 - c.x * c.z).toFixed(2)}px, ${(cam.vh / 2 - c.y * c.z).toFixed(2)}px, 0) scale(${c.z})`;
function fit(c) {
  const hw = cam.vw / 2 / c.z, hh = cam.vh / 2 / c.z;
  c.x = hw * 2 >= MAP.W ? MAP.W / 2 : clamp(c.x, hw, MAP.W - hw);
  c.y = hh * 2 >= MAP.H ? MAP.H / 2 : clamp(c.y, hh, MAP.H - hh);
  return c;
}
function apply() {
  camEl.style.transform = tf();
  camEl.style.setProperty('--inv', String(1 / cam.z));
}
/** 地図の点が、いま画面のどこにあるか */
export const project = (x, y, c = cam) => [cam.vw / 2 + (x - c.x) * c.z, cam.vh / 2 + (y - c.y) * c.z];
/** いつもの構え（端末の幅で縮尺を決める） */
export function home() {
  const wide = cam.vw >= 900;
  return fit({ x: wide ? 1500 : 1400, y: wide ? 1040 : 1090, z: baseZ });
}
let camAnim = null;
/** カメラをなめらかに動かす。ax・ay は、地図の点を画面のどこ（0〜1）に置くか */
export function camTo({ x, y, z = cam.z, ax = 0.5, ay = 0.5 }, { dur = 720, ease = EASE.inout } = {}) {
  const t = fit({ x: x - ((ax - 0.5) * cam.vw) / z, y: y - ((ay - 0.5) * cam.vh) / z, z });
  const from = tf();
  const inv0 = 1 / cam.z;
  Object.assign(cam, t);
  const to = tf();
  camAnim?.cancel();
  apply();
  cam.busy = true;
  camAnim = anim(camEl, [{ transform: from }, { transform: to }], { duration: dur, easing: ease, fill: 'none' });
  // 地図の上の札は、縮尺が変わっても同じ大きさに見えるよう、逆の倍率を同じ時間で動かす
  for (const e of camEl.querySelectorAll('.keep')) anim(e, [{ transform: `scale(${inv0})` }, { transform: `scale(${1 / cam.z})` }], { duration: dur, easing: ease, fill: 'none' });
  return done(camAnim).then(() => { cam.busy = false; });
}

// ---------------------------------------------------------------- 絵を code で描く（舟・荷車・雲の影）
function pix(rows, pal, scale = 3) {
  const c = document.createElement('canvas');
  c.width = rows[0].length * scale;
  c.height = rows.length * scale;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (pal[ch]) {
      g.fillStyle = pal[ch];
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }));
  return c.toDataURL();
}
const BOAT = [
  '.........k..........',
  '........kwk.........',
  '.......kwwk..r......',
  '......kwwwk.rr......',
  '.....kwwwwk.........',
  '....kwwwwwk.........',
  '...kwwwwwwk.........',
  '..kkkkkkkkk.........',
  '.........k..........',
  'kkkkkkkkkkkkkkkkkk..',
  '.kbbbbbbbbbbbbbbbk..',
  '..kbbbbbbbbbbbbbk...',
  '...kkkkkkkkkkkkk....',
];
const TRUCK = [
  '..kkkkkkkkkkkkkk........',
  '..krrrrrrrrrrrrk........',
  '..krrrrrrrrrrrrkkkkkkk..',
  '..krwwrrrrrrrrrkccccck..',
  '..krwwrrrrrrrrrkcsssck..',
  '..krrrrrrrrrrrrkcsssckk.',
  '..krrrrrrrrrrrrkcccccck.',
  '..kyyyyyyyyyyyykcccccck.',
  '..kkkkkkkkkkkkkkkkkkkkk.',
  '....kkk.........kkk.....',
  '....kgk.........kgk.....',
  '....kkk.........kkk.....',
];
function cloudUrl(seed) {
  const c = document.createElement('canvas');
  c.width = 44;
  c.height = 22;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#0c1830';
  for (let i = 0; i < 9; i++) {
    const w = 8 + Math.floor(r() * 16), hh = 4 + Math.floor(r() * 6);
    g.fillRect(Math.floor(r() * (44 - w)), 5 + Math.floor(r() * (14 - hh)), w, hh);
  }
  return c.toDataURL();
}

// ---------------------------------------------------------------- 動く層を置く
function buildAmbient() {
  const frag = document.createDocumentFragment();
  // 水面のきらめき（島の外）
  let s = 99;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0, made = 0; i < 900 && made < 44; i++) {
    const x = r() * MAP.W, y = r() * MAP.H;
    const d = Math.abs(x - 1860) / 1800 + Math.abs(y - 1070) / 990;
    if (d < 1.03) continue;
    // 画面に入りやすい所（島のまわり）を濃く
    if (d > 1.5 && r() < 0.6) continue;
    made++;
    const e = h(`<i class="gl${r() < 0.3 ? ' gl--b' : ''}"></i>`);
    e.style.cssText = `left:${Math.round(x)}px;top:${Math.round(y)}px;animation-delay:${(-r() * 6).toFixed(2)}s;animation-duration:${(2.8 + r() * 3.4).toFixed(2)}s`;
    frag.append(e);
  }
  // 舟
  const boat = pix(BOAT, { k: '#15110d', w: '#f3e9d2', r: '#e8381b', b: '#8a5a2b' }, 4);
  for (const [cls, dur, delay] of [['boat boat--a', 96, -20], ['boat boat--b', 120, -70]]) {
    const b = h(`<div class="${cls}" style="animation-duration:${dur}s;animation-delay:${delay}s"><i style="background-image:url(${boat})"></i></div>`);
    frag.append(b);
  }
  // 煙突の煙
  for (const [x, y] of CHIMNEYS) {
    const c = h(`<div class="smk" style="left:${x}px;top:${y}px"></div>`);
    for (let k = 0; k < 3; k++) c.append(h(`<i style="animation-delay:${(-k * 1.17).toFixed(2)}s"></i>`));
    frag.append(c);
  }
  amb.append(frag);
  // 自社の旗
  for (const p of [...SHOPS, WS]) {
    amb.append(h(`<div class="flag" style="left:${p.x + 22}px;top:${p.y - 126}px"><i></i></div>`));
  }
  buildWalkers();
  // 雲の影（いちばん上）
  [[11, 120, -30], [29, 168, -95], [53, 140, -60]].forEach(([seed, dur, delay], k) => {
    amb.append(h(`<div class="cloud cloud--${k}" style="animation-duration:${dur}s;animation-delay:${delay}s"><i style="background-image:url(${cloudUrl(seed)})"></i></div>`));
  });
}
const FACE_RIGHT = new Set([SPR.shoko, SPR.raiden]);
function path(nodes, off = [0, -12]) {
  return nodes.map(([i, j]) => { const [x, y] = P(i, j); return [x + off[0], y + off[1]]; });
}
/** 折れ線の道を、一定の速さで回る（Web Animations に任せるので、待っているあいだ JS は動かない） */
function runner(el, inner, pts, { speed = 38, loop = true, phase = 0, faceRight = false, pause = 0 }) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    segs.push(d);
    total += d;
  }
  const dur = (total / speed) * 1000 + pause * (pts.length - 1);
  const kf = [], flip = [];
  let acc = 0;
  pts.forEach((p, i) => {
    const o = clamp(acc / dur, 0, 1);
    kf.push({ transform: `translate3d(${p[0]}px,${p[1]}px,0)`, offset: o });
    if (i < pts.length - 1) {
      const right = pts[i + 1][0] > p[0];
      const sx = right !== faceRight ? -1 : 1;
      flip.push({ transform: `scaleX(${sx})`, offset: o, easing: 'steps(1,end)' });
      if (pause) {
        acc += pause;
        kf.push({ transform: `translate3d(${p[0]}px,${p[1]}px,0)`, offset: clamp(acc / dur, 0, 1) });
      }
      acc += (segs[i] / speed) * 1000;
    } else flip.push({ transform: flip[flip.length - 1].transform, offset: 1 });
  });
  if (reduced()) {
    const m = pts[Math.floor(phase * (pts.length - 1))];
    el.style.transform = `translate3d(${m[0]}px,${m[1]}px,0)`;
    return;
  }
  const o = { duration: dur, iterations: loop ? Infinity : 1, delay: -phase * dur, easing: 'linear' };
  el.animate(kf, o);
  inner.animate(flip, o);
}
function buildWalkers() {
  const loops = [
    [[2, 7], [7, 7], [7, 12], [2, 12], [2, 7]],
    [[7, 7], [12, 7], [12, 12], [7, 12], [7, 7]],
    [[7, 2], [12, 2], [12, 7], [7, 7], [7, 2]],
    [[2, 2], [7, 2], [7, 7], [2, 7], [2, 2]],
    [[2, 12], [7, 12], [7, 15], [7, 12], [12, 12], [12, 15], [12, 12], [2, 12]],
  ];
  const cast = [SPR.warrior, SPR.ino, SPR.shoko, SPR.pascal, SPR.david, SPR.raiden, SPR.seton, SPR.michel, SPR.grimm, SPR.kai, SPR.fukuzawa, SPR.archimedes, SPR.wright, SPR.pythagoras];
  let k = 0;
  const frag = document.createDocumentFragment();
  loops.forEach((lp, li) => {
    const n = li === 0 ? 4 : li === 4 ? 2 : 3;
    for (let w = 0; w < n; w++) {
      const rev = w % 2 === 1;
      const spr = cast[k++ % cast.length];
      const pts = path(rev ? lp.slice().reverse() : lp, rev ? [0, 6] : [0, -14]);
      const el = h(`<div class="wk"><div class="wk-f"><i class="wk-s" style="background-position:${-(spr % 8) * 64}px ${-Math.floor(spr / 8) * 64}px;animation-delay:${(-rand(0.5)).toFixed(2)}s"></i></div></div>`);
      frag.append(el);
      runner(el, el.firstElementChild, pts, { speed: rand(30, 44), phase: (w + rand(0.6)) / n, faceRight: FACE_RIGHT.has(spr) });
    }
  });
  // 荷車（工房 → 輸入雑貨店・よろず屋へ品物を運ぶ）
  const truck = pix(TRUCK, { k: '#15110d', r: '#e8381b', w: '#f3e9d2', y: '#f5b61a', c: '#f3e9d2', s: '#7cc6f2', g: '#6b6257' }, 3);
  const routes = [
    [[5, 12], [7, 12], [7, 10], [7, 12], [5, 12]],
    [[5, 12], [2, 12], [2, 13], [2, 12], [5, 12]],
  ];
  routes.forEach((rt, i) => {
    const el = h(`<div class="trk"><div class="trk-f"><i style="background-image:url(${truck})"></i></div></div>`);
    frag.append(el);
    runner(el, el.firstElementChild, path(rt, [0, 0]), { speed: 86, phase: i * 0.45, faceRight: true, pause: 1500 });
  });
  amb.append(frag);
}

// ---------------------------------------------------------------- 売れたとき
let saleN = 0;
/** お店の上に「+N G」が跳ねる。画面の資金・今月の売上は hud が足す */
export function salePop(shop, amount, big = false) {
  const e = h(`<div class="pop keep${big ? ' pop--big' : ''}" style="left:${shop.x}px;top:${shop.y - 150}px"><b>+${fmt(amount)}<small>G</small></b></div>`);
  e.style.transform = `scale(${1 / cam.z})`;
  pops.append(e);
  const b = e.firstElementChild;
  audio.se('sale', saleN++ % 5);
  if (reduced()) {
    done(anim(b, [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 1400 })).then(() => e.remove());
    return;
  }
  done(anim(b, [
    { transform: 'translateY(26px) scale(0.3) rotate(-10deg)', opacity: 0 },
    { transform: 'translateY(-10px) scale(1.2) rotate(-5deg)', opacity: 1, offset: 0.14 },
    { transform: 'translateY(0) scale(1) rotate(-5deg)', opacity: 1, offset: 0.24 },
    { transform: 'translateY(-10px) scale(1) rotate(-5deg)', opacity: 1, offset: 0.72 },
    { transform: 'translateY(-44px) scale(0.9) rotate(-5deg)', opacity: 0 },
  ], { duration: big ? 1900 : 1500, easing: 'linear' })).then(() => e.remove());
}

/** 祝いの旗：制覇のあと、自社の建物に金の旗が立つ */
export function celebrate(on) {
  world.classList.toggle('is-fete', on);
}
/** 札を開いているあいだ、地図を刷り物のように沈める（0 なし・1 吹き出し・2 札） */
export function dim(level) {
  screenEl.dataset.lv = String(level);
}
export function setTag(mode) {
  // 工房の札：'call' 押してほしい・'idle' 置いてあるだけ・'hide'
  tag.dataset.mode = mode;
}
export function beat(b) {
  if (reduced() || tag.dataset.mode !== 'call') return;
  anim(tag.firstElementChild, [{ transform: 'translateY(0) rotate(-6deg)' }, { transform: `translateY(${b === 0 ? -16 : -9}px) rotate(-6deg)`, offset: 0.3 }, { transform: 'translateY(0) rotate(-6deg)' }], { duration: 300, easing: 'ease-out', fill: 'none' });
}

// ---------------------------------------------------------------- はじめる
export function initMap({ onWorkshop }) {
  world = $('#world');
  camEl = $('#cam');
  amb = $('#amb');
  pops = $('#pops');
  screenEl = $('#screen');
  const size = () => {
    cam.vw = window.innerWidth;
    cam.vh = window.innerHeight;
    baseZ = clamp(cam.vw / 1700, 0.5, 0.75);
    baseZ = baseZ < 0.62 ? 0.5 : 0.75;
  };
  size();
  Object.assign(cam, home());
  apply();
  buildAmbient();
  // 工房：押せる場所（地図の座標）と、呼ぶ札
  hot = h(`<button class="hot" type="button" aria-label="工房（本店）を見る" style="left:${WS.x - 120}px;top:${WS.y - 180}px"></button>`);
  tag = h(`<div class="tag keep" data-mode="idle" style="left:${WS.x}px;top:${WS.y - 112}px"><div class="tag-in"><b>工房</b><i></i></div></div>`);
  camEl.append(hot, tag);
  tag.style.transform = `scale(${1 / cam.z})`;
  // 自社のお店の名札（寄ったときだけ見える）
  for (const sp of SHOPS) camEl.append(h(`<div class="shopname keep" style="left:${sp.x}px;top:${sp.y + 20}px;transform:scale(${1 / cam.z})"><span>${sp.name}</span></div>`));

  // 指でずらす（慣性つき）
  let drag = null, moved = false;
  world.addEventListener('pointerdown', (e) => {
    if (cam.busy || world.classList.contains('is-locked')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, vx: 0, vy: 0, t: performance.now(), lx: e.clientX, ly: e.clientY };
    moved = false;
  });
  world.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 8) return;
    if (!moved) {
      moved = true;
      world.setPointerCapture?.(e.pointerId);
      camAnim?.cancel();
    }
    const now = performance.now();
    const dt = Math.max(1, now - drag.t);
    drag.vx = (e.clientX - drag.lx) / dt;
    drag.vy = (e.clientY - drag.ly) / dt;
    drag.t = now;
    drag.lx = e.clientX;
    drag.ly = e.clientY;
    Object.assign(cam, fit({ x: drag.cx - dx / cam.z, y: drag.cy - dy / cam.z, z: cam.z }));
    apply();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (!moved) return;
    const sp = Math.hypot(d.vx, d.vy);
    if (sp > 0.25 && !reduced()) {
      const from = tf();
      Object.assign(cam, fit({ x: cam.x - (d.vx * 260) / cam.z, y: cam.y - (d.vy * 260) / cam.z, z: cam.z }));
      apply();
      camAnim = anim(camEl, [{ transform: from }, { transform: tf() }], { duration: 520, easing: 'cubic-bezier(.1,.7,.2,1)', fill: 'none' });
    }
  };
  world.addEventListener('pointerup', end);
  world.addEventListener('pointercancel', end);
  hot.addEventListener('click', () => {
    if (moved || cam.busy) return;
    onWorkshop();
  });
  window.addEventListener('resize', () => {
    const wasHome = Math.abs(cam.z - baseZ) < 0.01;
    size();
    if (wasHome) Object.assign(cam, home());
    else fit(cam);
    apply();
    bus.emit('resize');
  });
}
export const lockMap = (on) => world.classList.toggle('is-locked', on);
/** 地図が札で完全に隠れているあいだ、地図の描画と動きを休ませる */
export const coverMap = (on) => world.classList.toggle('is-covered', on);
