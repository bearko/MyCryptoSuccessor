// 常設の UI：上の帯（資金・売上・順位・日付・時間）・テロップ・下の帯
import { $, $$, h, Roller, popNum, calm, fmt, heroStyle } from './kit.js';
import { audio } from './audio.js';
import { S } from './state.js';
import { ATLAS, HERO } from './assets.js';

const R = {};
let tapeAnim = null;
const NEWS0 = ['港の市で、センスが評判です', '緑門商会が 2 号店を開きました', '月の終わりに、月次報告が届きます', '工房の平賀源内が、新しい治具を試しています'];
let news = [...NEWS0];

function bump(id) {
  const el = $(id);
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

export const hud = {
  init(on) {
    R.funds = new Roller($('#v-funds'), S.funds, { unit: 'G', wob: true });
    R.sales = new Roller($('#v-sales'), S.sales, { unit: 'G', wob: true });
    R.rank = new Roller($('#v-rank'), S.rank);
    R.brand = new Roller($('#v-brand'), S.brand);
    R.day = new Roller($('#v-day'), S.day);
    $('#callout-hero').style.cssText = heroStyle(HERO.gama, ATLAS.hero);
    $('#callout-hero').classList.add('px');
    for (const b of $$('.spd')) b.addEventListener('click', () => { this.speed(+b.dataset.spd); on.speed?.(+b.dataset.spd); });
    for (const b of $$('.dk')) b.addEventListener('click', () => {
      b.classList.remove('wig');
      void b.offsetWidth;
      b.classList.add('wig');
      on.dock?.(b.dataset.act);
    });
    $('#callout').addEventListener('click', () => on.callout?.());
    this.tape();
    this.refresh(true);
  },
  refresh(instant) {
    R.funds.set(S.funds, { instant });
    R.sales.set(S.sales, { instant });
    R.rank.set(S.rank, { instant });
    R.brand.set(S.brand, { instant });
    this.date();
    this.ruler();
    this.speed(S.speed, true);
  },
  /** 資金が増える・減る：桁が転がり、増減の札が飛び出す */
  funds(delta, o = {}) {
    S.funds += delta;
    R.funds.set(S.funds, { dur: o.dur ?? (Math.abs(delta) > 2000 ? 900 : 480) });
    if (!o.quiet) popNum($('#p-funds'), delta > 0 ? `+${fmt(delta)}` : `<i class="tri dn"></i>${fmt(-delta)}`, delta > 0 ? 'up' : 'dn');
    if (Math.abs(delta) > 2000) bump('#st-funds');
  },
  sales(delta) {
    S.sales += delta;
    R.sales.set(S.sales, { dur: 480 });
  },
  salesNote(text) { popNum($('#p-sales'), text, 'up'); bump('#st-sales'); },
  rank(n) { S.rank = n; R.rank.set(n, { dur: 700 }); bump('#st-rank'); },
  brand(n) { S.brand = n; R.brand.set(n, { dur: 600 }); bump('#st-brand'); },
  date() {
    $('#v-year').textContent = S.year;
    $('#v-month').textContent = S.month;
    R.day.set(S.day, { dur: 360 });
  },
  ruler() {
    const p = Math.min(1, (S.day - 1 + S.frac) / 30);
    const w = $('.ruler').clientWidth;
    $('#r-fill').style.transform = `scaleX(${p})`;
    $('#r-mk').style.transform = `translateX(${(p * w).toFixed(1)}px)`;
  },
  speed(v, quiet) {
    S.speed = v;
    for (const b of $$('.spd')) {
      const on = +b.dataset.spd === v;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    }
    if (!quiet) audio.se('toggle', { on: v > 0 });
    if (tapeAnim) tapeAnim.playbackRate = v === 0 ? 0.5 : v === 3 ? 1.6 : 1;
  },
  /** テロップ：新しい知らせは先頭に */
  news(text) {
    news = [text, ...news.filter((x) => x !== text)].slice(0, 6);
    this.tape();
  },
  resetNews() { news = [...NEWS0]; this.tape(); },
  tape() {
    const el = $('#tape');
    const one = news.map((t) => `<span><i class="dia"></i>${t}</span>`).join('');
    el.innerHTML = one + one;
    tapeAnim?.cancel();
    if (calm()) return;
    requestAnimationFrame(() => {
      const w = el.scrollWidth / 2;
      tapeAnim = el.animate([{ transform: `translateX(${Math.min(120, $('.run').clientWidth * 0.4)}px)` }, { transform: `translateX(${-w}px)` }], { duration: (w / 46) * 1000, iterations: Infinity });
    });
  },
  callout(on) {
    const c = $('#callout');
    c.classList.toggle('on', on);
    c.tabIndex = on ? 0 : -1;
    $('#plan-badge').classList.toggle('on', on);
  },
  /** 一言の紙片（見本では開かない入口など） */
  slip(text, ms = 2200) {
    const s = $('#slip');
    $('#slip-tx').textContent = text;
    s.classList.add('on');
    clearTimeout(this._slip);
    this._slip = setTimeout(() => s.classList.remove('on'), ms);
  },
  rectOf(id) {
    const r = $(id).getBoundingClientRect();
    return [r.left + Math.min(60, r.width / 2), r.top + r.height * 0.62];
  },
};
