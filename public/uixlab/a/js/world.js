// 町の地図：1 枚の絵の上に、動く層（雲の影・水面・煙・歩く人・荷車・売れた札）を重ねる。
// 動きはすべて transform と opacity の合成だけ（毎コマの JS は無い）。
import { $, h, calm, clamp, fx, heroStyle } from './kit.js';
import { ATLAS, HERO } from './assets.js';

const IMG_W = 2048;
const IMG_H = 1920;
/** マス (i, j) の中心 → 絵の上の位置 */
const P = (i, j) => [1500 + (i - j) * 100, 80 + (i + j) * 55];
const SPOT = {
  ws: { at: [895, 925], tile: P(5, 11), pin: [893, 846], chimney: [917, 858] },
  storeA: { at: [695, 1040], pin: [694, 976] },
  storeB: { at: [1900, 700], pin: [1900, 650] },
};
// 海の点（きらめきの置き場所）。絵から拾った、岸から離れた水の上
const SEA = [[883, 1621], [255, 1779], [836, 193], [1146, 1878], [853, 107], [354, 113], [331, 216], [817, 1809], [896, 15], [961, 76], [462, 453], [55, 1833], [51, 1391], [572, 2], [585, 1588], [727, 84], [846, 156], [835, 1895], [392, 1615], [243, 1401], [829, 1743], [677, 1661], [10, 1226], [172, 209], [754, 10], [57, 1668], [885, 110], [217, 1856], [208, 1644], [211, 1910], [841, 1727], [667, 1598], [342, 501], [136, 76], [365, 1741], [1932, 1874], [1860, 14], [666, 1823], [255, 318], [35, 1670], [399, 170], [776, 1784], [271, 236], [455, 86], [998, 26], [1679, 1827], [2003, 1816], [673, 1538], [849, 1793], [911, 1882], [305, 1785], [55, 550], [124, 294], [809, 1890], [359, 47], [951, 31], [1912, 1724], [729, 28], [851, 169], [11, 1528], [1915, 1717], [1254, 1816], [814, 1604], [265, 515]];

let camEl;
let fxEl;
const cam = { x: 940, y: 900, z: 0.5 };
let view = { w: 390, h: 844 };
const hud = () => {
  const tk = $('.ticker');
  return { top: tk.offsetTop + tk.offsetHeight, bottom: $('.dock').offsetHeight };
};
const coverZ = () => Math.max(view.w / IMG_W, view.h / IMG_H);
const wide = () => view.w >= 760;

function place(dur = 0, ease = 'cubic-bezier(0.3, 0, 0.2, 1)') {
  const z = Math.max(cam.z, coverZ());
  const tx = clamp(cam.sx - cam.x * z, view.w - IMG_W * z, 0);
  const ty = clamp(cam.sy - cam.y * z, view.h - IMG_H * z, 0);
  cam.tx = tx;
  cam.ty = ty;
  cam.zz = z;
  const d = calm() ? 0 : dur;
  camEl.style.transition = d ? `transform ${d}ms ${ease}` : 'none';
  camEl.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${z})`;
  camEl.style.setProperty('--z', z);
  // 等倍より寄るときは画素をくっきり、引くときはなめらかに
  clearTimeout(place.t);
  if (z >= 1) place.t = setTimeout(() => camEl.classList.add('near'), d);
  else camEl.classList.remove('near');
}

/** 絵の上の点 → 画面の位置（いまのカメラの行き先で） */
function screenOf([x, y]) {
  return [cam.tx + x * cam.zz, cam.ty + y * cam.zz];
}

function setView(mode, dur) {
  const H = hud();
  cam.mode = mode;
  if (mode === 'focus') {
    // 工房に寄る：建物は上、吹き出しは下
    cam.z = wide() ? 1.5 : 1;
    cam.x = SPOT.ws.at[0];
    cam.y = SPOT.ws.at[1];
    cam.sx = view.w / 2;
    cam.sy = H.top + 22 + 72 * cam.z;
  } else if (mode === 'wide') {
    // 制覇：町を広く見せる
    cam.z = wide() ? 0.66 : 0.45;
    cam.x = 960;
    cam.y = 940;
    cam.sx = view.w / 2;
    cam.sy = (H.top + view.h - H.bottom) / 2;
  } else if (mode === 'title') {
    cam.z = (wide() ? 0.75 : 0.5) * 1.3;
    cam.x = 930;
    cam.y = 930;
    cam.sx = view.w / 2;
    cam.sy = view.h / 2;
  } else {
    cam.z = wide() ? 0.75 : 0.5;
    cam.x = wide() ? 1000 : 915;
    cam.y = 930;
    cam.sx = view.w / 2;
    cam.sy = (H.top + view.h - H.bottom) / 2;
  }
  place(dur);
}

// ---------------------------------------------------------------- 動く層
function addGlints() {
  // 512px の升ごとに 1 つの要素にまとめ、升ごとにずらして光らせる（十字は box-shadow で描く。層を小さく保つ）
  const c = 'rgba(232,246,255,0.95)';
  const cells = new Map();
  for (const [x, y] of SEA) {
    const k = `${Math.floor(x / 512)},${Math.floor(y / 512)}`;
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push([x, y]);
  }
  let g = 0;
  for (const [k, pts] of cells) {
    const [cx, cy] = k.split(',').map((v) => +v * 512);
    const sh = pts.map(([x, y]) => { const a = x - cx; const b = y - cy; return `${a}px ${b}px 0 0 ${c},${a - 2}px ${b}px 0 0 ${c},${a + 2}px ${b}px 0 0 ${c},${a}px ${b - 2}px 0 0 ${c},${a}px ${b + 2}px 0 0 ${c}`; }).join(',');
    fxEl.appendChild(h(`<i class="glint" style="left:${cx}px;top:${cy}px;box-shadow:${sh};animation-delay:${-(g % 5) * 0.7}s;animation-duration:${3 + (g % 4) * 0.4}s"></i>`));
    g++;
  }
}
function addClouds() {
  const mk = (seed) => {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 56;
    const x = c.getContext('2d');
    x.fillStyle = '#081230';
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // 低い解像度で楕円を重ね、8 倍に引き伸ばす（縁が階段になる、ドット絵の雲の影）
    for (let k = 0; k < 7; k++) {
      const rx = 12 + r() * 16;
      const ry = 6 + r() * 8;
      x.beginPath();
      x.ellipse(18 + r() * 60, 16 + r() * 24, rx, ry, 0, 0, Math.PI * 2);
      x.fill();
    }
    return c.toDataURL();
  };
  [[11, 0, 92], [29, -34, 118], [47, -66, 104]].forEach(([seed, delay, dur], k) => {
    const el = h(`<img class="cloud" alt="" src="${mk(seed)}" style="width:${768 + k * 120}px;height:${448 + k * 60}px;top:${-140 + k * 330}px;animation-delay:${delay}s;animation-duration:${dur}s">`);
    fxEl.appendChild(el);
  });
}
function addSmoke() {
  const [x, y] = SPOT.ws.chimney;
  for (let k = 0; k < 5; k++) fxEl.appendChild(h(`<i class="puff" style="left:${x - 3 + (k % 2) * 2}px;top:${y - 6}px;animation-delay:${-k * 0.88}s"></i>`));
}

/** 道に沿って歩かせる（cells：通るマス。合成だけで動く） */
function route(el, cells, speed, phase = 0, off = [0, 0]) {
  const pts = cells.map(([i, j]) => { const p = P(i, j); return [p[0] + off[0], p[1] + off[1]]; });
  let total = 0;
  const lens = [];
  for (let k = 1; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); lens.push(d); total += d; }
  let acc = 0;
  const move = pts.map((p, k) => { const o = acc / total; acc += lens[k] ?? 0; return { transform: `translate(${p[0] - 32}px, ${p[1] - 58}px)`, offset: Math.min(1, o) }; });
  acc = 0;
  const flip = pts.map((p, k) => {
    const o = acc / total;
    acc += lens[k] ?? 0;
    const n = pts[Math.min(k + 1, pts.length - 1)];
    const q = k === pts.length - 1 ? pts[k - 1] : p;
    const right = (k === pts.length - 1 ? p[0] - q[0] : n[0] - p[0]) > 0;
    return { transform: `scaleX(${right ? -1 : 1})`, offset: Math.min(1, o), easing: 'step-end' };
  });
  const duration = (total / speed) * 1000;
  const a = el.animate(move, { duration, iterations: Infinity });
  const b = el.firstElementChild.animate(flip, { duration, iterations: Infinity });
  a.currentTime = b.currentTime = phase * duration;
  return [a, b];
}
function addWalkers() {
  const loops = [
    { hero: HERO.inou, cells: [[2, 12], [7, 12], [7, 7], [2, 7], [2, 12]], speed: 34, phase: 0.05 },
    { hero: HERO.ikkyu, cells: [[10, 12], [2, 12], [10, 12]], speed: 30, phase: 0.4 },
    { hero: HERO.ichiyo, cells: [[2, 7], [2, 15.2], [2, 7]], speed: 38, phase: 0.2 },
    { hero: HERO.okuni, cells: [[0, 7], [7, 7], [0, 7]], speed: 32, phase: 0.6 },
    { hero: HERO.kai, cells: [[7, 15.3], [7, 7], [7, 15.3]], speed: 36, phase: 0.75 },
    { hero: HERO.andersen, cells: [[7, 12], [2, 12], [2, 7], [7, 7], [7, 12]], speed: 28, phase: 0.55 },
  ];
  loops.forEach((w, k) => {
    const el = h(`<div class="walker"><i><i class="bob spr" style="${heroStyle(w.hero, ATLAS.hero)};animation-delay:${-k * 0.13}s"></i></i></div>`);
    fxEl.appendChild(el);
    const side = k % 2 ? [-16, -10] : [14, 8];
    anims.push(...route(el, w.cells, w.speed, w.phase, side));
  });
}
/** 荷車の絵（自分で描く 32×32 の画素） */
function cartArt() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d');
  const r = (col, a, b, w, hh) => { x.fillStyle = col; x.fillRect(a, b, w, hh); };
  // 引き手
  r('#3b2a12', 1, 21, 9, 2);
  r('#3b2a12', 1, 19, 2, 2);
  // 荷台
  r('#3b2a12', 8, 20, 20, 5);
  r('#9a6a34', 9, 21, 18, 3);
  // 木箱
  r('#3b2a12', 10, 10, 10, 11);
  r('#d2a25c', 11, 11, 8, 9);
  r('#b98443', 11, 15, 8, 1);
  r('#3b2a12', 19, 13, 8, 8);
  r('#e2b873', 20, 14, 6, 6);
  r('#b98443', 20, 17, 6, 1);
  r('#d8432a', 13, 12, 3, 2);
  // 車輪（八角）
  r('#1a2340', 12, 23, 8, 8);
  r('#1a2340', 11, 25, 10, 4);
  r('#1a2340', 14, 22, 4, 10);
  r('#8d8774', 14, 25, 4, 4);
  r('#f4ecd8', 15, 26, 2, 2);
  return c.toDataURL();
}
const anims = [];
let cartUrl = '';
function addCart(cells, speed, phase) {
  cartUrl ||= cartArt();
  const el = h(`<div class="cart"><i><i class="bob body" style="background-image:url(${cartUrl})"></i></i></div>`);
  fxEl.appendChild(el);
  anims.push(...route(el, cells, speed, phase, [0, 6]));
  return el;
}

function addSpots(onTap) {
  const s = SPOT.ws;
  const tile = h(`<i class="tile" style="left:${s.tile[0] - 100}px;top:${s.tile[1] - 55}px"></i>`);
  fxEl.appendChild(tile);
  const glow1 = h(`<i class="glow" style="left:870px;top:951px;width:26px;height:17px"></i>`);
  fxEl.appendChild(glow1);
  const btn = h(`<button class="spot" data-se="none" aria-label="工房（本店）を開く" style="left:${s.at[0] - 85}px;top:${s.at[1] - 110}px"></button>`);
  btn.addEventListener('click', onTap);
  fxEl.appendChild(btn);
  const pin = h(`<div class="pin" style="left:${s.pin[0]}px;top:${s.pin[1]}px"><b><span class="tagb">工房</span><i class="stem"></i></b></div>`);
  fxEl.appendChild(pin);
  return { tile, pin };
}

let marks;
export const world = {
  init(onTap) {
    camEl = $('#cam');
    fxEl = $('#mapfx');
    view = { w: innerWidth, h: innerHeight };
    addGlints();
    addClouds();
    addSmoke();
    addCart([[5, 12], [2, 12], [2, 7], [7, 7], [7, 12], [5, 12]], 62, 0.9);
    addWalkers();
    marks = addSpots(onTap);
    setView('title', 0);
    addEventListener('resize', () => {
      view = { w: innerWidth, h: innerHeight };
      setView(cam.mode, 0);
    });
  },
  base: (dur = 620) => setView('base', dur),
  focus: (dur = 620) => setView('focus', dur),
  wide: (dur = 900) => setView('wide', dur),
  screenOf: (name) => screenOf(SPOT[name].at),
  /** 寄ったときの、建物の下の端（吹き出しの付け根） */
  anchor() {
    const [x, y] = screenOf(SPOT.ws.at);
    return { x, y: y + 78 * cam.zz };
  },
  hint(on) { marks.tile.classList.toggle('on', on); },
  /** 売れた：店の上に「+N G」 */
  sale(name, n) {
    const s = SPOT[name];
    const el = h(`<div class="gain" style="left:${s.pin[0]}px;top:${s.pin[1]}px"><b><i class="coin"></i>+${n.toLocaleString('en-US')} G</b></div>`);
    fxEl.appendChild(el);
    const z = cam.zz;
    const a = el.animate(
      calm()
        ? [{ opacity: 1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { opacity: 0, transform: 'translateY(0)' },
            { opacity: 1, transform: `translateY(${-16 / z}px)`, offset: 0.14 },
            { opacity: 1, transform: `translateY(${-30 / z}px)`, offset: 0.7 },
            { opacity: 0, transform: `translateY(${-44 / z}px)` },
          ],
      { duration: 1500, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    );
    a.onfinish = () => el.remove();
    return screenOf(s.pin);
  },
  /** 輸入の荷：もう 1 台、西の浜から工房へ */
  importCart() {
    if (this.cart2) return;
    this.cart2 = addCart([[0.2, 12], [5, 12], [7, 12], [7, 15.3], [7, 12], [0.2, 12]], 70, 0);
  },
  /** 制覇の祝い：のぼりが立ち、花火が上がる */
  celebrate() {
    const at = [SPOT.ws.at, SPOT.storeA.at, [1020, 1020], [560, 800], [1240, 760], [800, 1260]];
    this.banners = at.map(([x, y], k) => {
      const el = h(`<div class="banner" style="left:${x - 46}px;top:${y - 124}px"><i></i><b></b></div>`);
      fxEl.appendChild(el);
      setTimeout(() => el.classList.add('up'), 200 + k * 140);
      return el;
    });
  },
  uncelebrate() {
    this.banners?.forEach((b) => b.remove());
    this.banners = null;
  },
  fireworks(n = 5) {
    const H = hud();
    for (let k = 0; k < n; k++) {
      setTimeout(() => fx.firework(view.w * (0.14 + Math.random() * 0.72), H.top + 40 + Math.random() * Math.min(240, view.h * 0.28), ['#fbe08a', '#ffffff', '#f0704f', '#46d3b8'][k % 4]), k * 520 + Math.random() * 200);
    }
  },
  pause(on) { for (const a of anims) on ? a.pause() : a.play(); },
};
