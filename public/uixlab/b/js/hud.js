// 常設の UI：上の帯（資金・売上・日付・ブランド力・順位）・テロップ・時間の進み・下の帯。
// 時間は台本の中で進み、数字は生きて変わる。
import { $, $$, G, anim, done, reduced, bus, rand, pick, EASE, fmt, h } from './core.js';
import { audio } from './audio.js';
import { Digits } from './ui.js';
import { SHOPS, salePop, cam, project } from './map.js';
import { slam, ribbon, burst } from './fx.js';

const DAY_MS = 5200;
let dFunds, dSales, dayAnim = null, saleTimer = 0, movers = [];
const el = {};

export function initHud() {
  for (const k of ['v-funds', 'v-sales', 'v-month', 'v-day', 'v-brand', 'v-rank', 'daybar', 'date-hold', 'tk-run', 'tk-tag', 'chip-rank', 'st-funds', 'st-sales', 'dk-note', 'dk-plan']) el[k] = $('#' + k);
  dFunds = new Digits(el['v-funds'], G.funds);
  dSales = new Digits(el['v-sales'], G.sales);
  paintDate(false);
  paintRank(false);
  // 上の帯の高さを測って、テロップと札の位置に使う（字の大きさ・幅で変わる）
  const fitTop = () => document.documentElement.style.setProperty('--top-h', `${$('#top').offsetHeight}px`);
  fitTop();
  window.addEventListener('resize', fitTop);
  bus.on('settings', () => requestAnimationFrame(fitTop));
  document.fonts?.ready.then(fitTop);
  for (const b of $$('.spd button')) b.addEventListener('click', () => setSpeed(+b.dataset.spd));
  setNews(['タオックスの朝市、きょうも人出', 'センスの注文がじわり増加', 'よろず屋 本通り店に行列', '港に南からの船が着く']);
  try {
    movers = document.getAnimations().filter((a) => a.effect?.target?.closest?.('.wk, .trk'));
  } catch { /* 古いブラウザ：歩く人は止めずにおく */ }
}
/** 上下の帯の出し入れ：'map' ぜんぶ・'sheet' 上の帯だけ・'none' ぜんぶ隠す */
let chromeMode = 'none';
export function chrome(mode, { dur = 260 } = {}) {
  if (mode === chromeMode) return;
  const was = chromeMode;
  chromeMode = mode;
  const top = $('#top'), tk = $('#ticker'), dock = $('#dock'), cue = $('#cue');
  const show = (e, on, from) => {
    const hid = e.dataset.off === '1';
    if (on === !hid) return;
    e.dataset.off = on ? '0' : '1';
    e.style.pointerEvents = on ? '' : 'none';
    e.style.transform = on ? '' : `translateY(${from})`;
    if (!on) e.style.opacity = '0';
    else e.style.opacity = '';
    anim(e, on
      ? [{ transform: `translateY(${from})`, opacity: 1 }, { transform: 'translateY(0)', opacity: 1 }]
      : [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${from})`, opacity: 1 }], { duration: dur, easing: on ? EASE.back : EASE.in, fill: 'none' });
  };
  show(top, mode !== 'none', '-110%');
  show(tk, mode === 'map', '-340%');
  show(dock, mode === 'map', '120%');
  show(cue, mode === 'map', '300%');
  void was;
}
export function chromeInit() {
  for (const [id, from] of [['#top', '-110%'], ['#ticker', '-340%'], ['#dock', '120%'], ['#cue', '300%']]) {
    const e = $(id);
    e.dataset.off = '1';
    e.style.transform = `translateY(${from})`;
    e.style.opacity = '0';
    e.style.pointerEvents = 'none';
  }
}

// ---------------------------------------------------------------- 日付と時間
function paintDate(hit = true) {
  const m = el['v-month'], d = el['v-day'];
  if (m.textContent !== String(G.month)) {
    m.textContent = G.month;
    if (hit) slam(m, { from: 2, rot: -10, dur: 180 });
  }
  if (d.textContent !== String(G.day)) {
    d.textContent = G.day;
    if (hit) anim(d, [{ transform: 'translateY(-45%) scale(1.5)', opacity: 0 }, { transform: 'translateY(5%) scale(0.95)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 150, easing: EASE.slam, fill: 'none' });
  }
}
function startDay() {
  dayAnim?.cancel();
  dayAnim = el.daybar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DAY_MS, easing: 'linear', fill: 'forwards' });
  dayAnim.onfinish = () => nextDay();
  syncClock();
}
function nextDay() {
  // 提案が決まるまでは、月の締めの手前で待つ（決裁待ち）
  if (G.day >= 29 && G.proposal !== 'approved' && G.month === 3) {
    if (G.proposal === 'none') bus.emit('proposal-ready');
    el['date-hold'].hidden = false;
    G.waiting = true;
    return;
  }
  if (G.day >= 30) {
    bus.emit('month-end');
    return;
  }
  G.day++;
  paintDate();
  if (G.day === 27 && G.proposal === 'none') bus.emit('proposal-ready');
  startDay();
}
/** 決裁待ちを解く（承認したあと） */
export function resumeDays() {
  el['date-hold'].hidden = true;
  if (G.waiting) {
    G.waiting = false;
    G.day = Math.min(30, G.day + 1);
    paintDate();
    startDay();
  }
}
export function setDate(month, day) {
  G.month = month;
  G.day = day;
  G.waiting = false;
  el['date-hold'].hidden = true;
  paintDate();
  startDay();
}
function pace() {
  return G.hold > 0 || G.speed === 0 ? 0 : G.speed === 3 ? 3 : 1;
}
function syncClock() {
  const p = pace();
  if (dayAnim && dayAnim.playState !== 'finished') {
    if (p === 0) dayAnim.pause();
    else {
      dayAnim.playbackRate = p;
      dayAnim.play();
    }
  }
  // 歩く人と荷車：時間を止めると止まり、早送りで速くなる（雲・水・煙は止めない）
  const mp = G.speed === 0 ? 0 : G.speed === 3 ? 2.4 : 1;
  for (const a of movers) {
    if (mp === 0) a.pause();
    else {
      a.playbackRate = mp;
      if (a.playState === 'paused') a.play();
    }
  }
}
export function setSpeed(s) {
  G.speed = s;
  for (const b of $$('.spd button')) b.setAttribute('aria-pressed', String(+b.dataset.spd === s));
  syncClock();
}
/** 札を開いているあいだは時間を止める（重ねて数える） */
export function hold(on) {
  G.hold = Math.max(0, G.hold + (on ? 1 : -1));
  syncClock();
}
export function startClock() {
  startDay();
  loopSales();
}

// ---------------------------------------------------------------- お金
/** 売れた：お店の上に「+N G」、資金と今月の売上が増える */
export function sale(shop, amount, big = false) {
  G.sales += amount;
  G.funds += amount;
  salePop(shop, amount, big);
  dSales.set(G.sales);
  dFunds.set(G.funds);
}
function loopSales() {
  clearTimeout(saleTimer);
  const p = pace();
  const boosted = G.proposal === 'approved';
  const gap = p === 0 ? 500 : rand(boosted ? 1700 : 2100, boosted ? 3200 : 3900) / (p === 3 ? 2.4 : 1);
  saleTimer = setTimeout(() => {
    if (pace() > 0 && chromeMode !== 'none' && !document.hidden) {
      const inView = SHOPS.filter((s) => {
        const [x, y] = project(s.x, s.y);
        return x > 20 && x < cam.vw - 20 && y > 150 && y < cam.vh - 90;
      });
      const shop = boosted && Math.random() < 0.5 ? SHOPS[1] : pick(inView.length ? inView : SHOPS);
      const amt = shop.id === 'import' && boosted ? pick([240, 320, 480]) : pick([60, 80, 80, 120, 160, 240]);
      sale(shop, amt, false);
    }
    loopSales();
  }, gap);
}
/** 支払う：金額の札が資金へ飛び、資金が段で転がって減る */
export async function spend(amount, fromEl) {
  const to = el['st-funds'].getBoundingClientRect();
  if (fromEl && !reduced()) {
    const r = fromEl.getBoundingClientRect();
    const t = h(`<div class="fly">−${fmt(amount)}<small>G</small></div>`);
    $('#layer-top').append(t);
    const dx = to.left + 70 - (r.left + r.width / 2), dy = to.top + 30 - (r.top + r.height / 2);
    t.style.left = `${r.left + r.width / 2}px`;
    t.style.top = `${r.top + r.height / 2}px`;
    await done(anim(t, [
      { transform: 'translate(-50%,-50%) scale(0.6) rotate(-8deg)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.25) rotate(-8deg)', opacity: 1, offset: 0.25 },
      { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.1) rotate(4deg)`, opacity: 1, offset: 0.65 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6) rotate(0deg)`, opacity: 0.9 },
    ], { duration: 520, easing: 'cubic-bezier(.4,0,.6,1)' }));
    t.remove();
  }
  G.funds -= amount;
  anim(el['st-funds'], [{ transform: 'translateY(0)' }, { transform: 'translateY(4px)' }, { transform: 'translateY(0)' }], { duration: 160, fill: 'none', deco: true });
  let n = 0;
  await dFunds.count(G.funds, { dur: 640, se: (i, total) => { if (i % 2 === 0) audio.se('tick', 10 - Math.round((i / total) * 10)); n++; } });
  audio.se('thunk');
}
export function setSales(v, strong = false) {
  G.sales = v;
  dSales.set(v, { strong });
}
export const salesEl = () => el['st-sales'];

// ---------------------------------------------------------------- 順位・ブランド力
function paintRank(hit = true) {
  el['v-rank'].textContent = G.rank;
  el['chip-rank'].classList.toggle('is-top', G.rank === 1);
  if (hit) {
    slam(el['chip-rank'], { from: 2.2, rot: -12, dur: 220 });
    const r = el['chip-rank'].getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 16, speed: 300, size: 5 });
  }
}
export function setRank(n, hit = true) {
  if (G.rank === n) return;
  G.rank = n;
  paintRank(hit);
}
export function setBrand(n) {
  G.brand = n;
  el['v-brand'].textContent = n;
  slam(el['v-brand'], { from: 1.8, rot: 8, dur: 180 });
}

// ---------------------------------------------------------------- テロップ
let items = [];
function paintNews(restart) {
  const run = el['tk-run'];
  run.innerHTML = items.map((t, i) => `<span${i === 0 && restart ? ' class="hot-n"' : ''}>${t}</span>`).join('');
  const w = run.scrollWidth;
  run.style.animation = 'none';
  void run.offsetWidth;
  run.style.animation = '';
  run.style.animationDuration = `${Math.max(12, w / 62)}s`;
}
export function setNews(list) {
  items = list.slice();
  paintNews(false);
}
/** 知らせを流す。extra なら札が「号外」に替わる */
export function news(text, { extra = false, quiet = false } = {}) {
  items = [text, ...items.filter((t) => t !== text)].slice(0, 5);
  paintNews(true);
  const tag = el['tk-tag'];
  tag.classList.toggle('is-extra', extra);
  tag.firstElementChild.textContent = extra ? '号外' : '速報';
  slam(tag.firstElementChild, { from: 2, rot: -10, dur: 200 });
  if (!quiet) audio.se('news');
}

// ---------------------------------------------------------------- 下の帯
export function initDock({ onPlan, onSystem }) {
  const DEPT = {
    logi: ['物流', '仕入れと配送の入口', 'left', 'ink'],
    hr: ['人事', '採用と持ち場の入口', 'left', 'shu'],
    mkt: ['マーケ', '広告と調査の入口', 'right', 'shu'],
  };
  for (const b of $$('.dk')) {
    b.addEventListener('click', () => {
      const d = b.dataset.dept;
      if (d === 'plan') return onPlan(b);
      if (d === 'sys') return onSystem(b);
      const [name, sub, from, color] = DEPT[d];
      audio.se('slash');
      ribbon(name, `${sub}（この見本では開きません）`, { from, color });
    });
  }
}
export function planNote(on) {
  el['dk-note'].hidden = !on;
  if (on) slam(el['dk-note'], { from: 2.4, rot: 20, dur: 220 });
}
/** 拍に合わせて、主の入口が小さく弾む（提案が届いているあいだ） */
export function beat(b) {
  if (reduced() || el['dk-note'].hidden || chromeMode !== 'map') return;
  if (b % 2 === 0) anim(el['dk-plan'], [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)', offset: 0.3 }, { transform: 'translateY(0)' }], { duration: 260, easing: 'ease-out', fill: 'none' });
}

// ---------------------------------------------------------------- 先へ誘う札
export function cue(html, handlers = {}) {
  const c = $('#cue');
  if (!html) {
    c.hidden = true;
    c.innerHTML = '';
    return;
  }
  c.innerHTML = html;
  c.hidden = false;
  for (const [sel, f] of Object.entries(handlers)) c.querySelector(sel)?.addEventListener('click', f);
  [...c.children].forEach((e, i) => slam(e, { from: 1.5, rot: i % 2 ? 4 : -4, dur: 220, delay: i * 70 }));
}
