// 手触りラボ C「管制卓」：はじまり・時間の進み・台本の進み（場面どうしをつなぐ）
import { Engine } from './audio.js';
import { Music } from './music.js';
import { Sfx } from './sfx.js';
import { World } from './world.js';
import { G, fresh, closeAll, syncLayers, DAY_MS, STREAK_DAYS } from './game.js';
import { REPORT, resolveAtlas } from './data.js';
import { loadStore, store, onStore, isCalm } from './store.js';
import { h, loop, env, Wipe, press, toast, fmt, after } from './ui.js';
import { initFx, fxState, coinsFly } from './fx.js';
import { buildHud, heroEl } from './hud.js';
import { openPop } from './pop.js';
import { openWorkshop, tickBenches } from './workshop.js';
import { openProposal } from './proposal.js';
import { openReport } from './report.js';
import { startConquest } from './conquer.js';
import { openSettings, openToc } from './settings.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
loadStore();
await resolveAtlas();
env.calm = isCalm;
G.s = fresh();
$('title-cast').append(heroEl('hokusai', 2), heroEl('ryoma', 2), heroEl('polo', 2));
G.layer = $('layer');
G.wipe = new Wipe($('wipe'));
initFx($('fx'));

const world = new World({ map: $('map'), world: $('world'), land: $('land'), live: $('live'), spot: $('spot') });
G.world = world;
const spot = $('spot');
spot.hidden = true;

// ---- 場面どうしのつなぎ
G.on = {
  speed(v) {
    G.s.speed = v;
    hud.setSpeed(v);
    world.speed = v === 0 ? 0 : v > 1 ? 2.4 : 1;
  },
  guide() {
    const s = G.s;
    if (s.step === 'ws') {
      spot.classList.remove('is-ping');
      void spot.offsetWidth;
      spot.classList.add('is-ping');
      const r = spot.getBoundingClientRect();
      world.ripple(r.left + r.width / 2, r.top + r.height / 2);
      toast('光っている「工房」を押すと、職人が話します');
    } else if (s.step === 'prop') {
      hud.proposal(true);
      toast('下の「経営企画」に、部長の提案が届いています');
    } else if (s.step === 'wait' || s.step === 'streak') {
      G.on.speed(4);
      toast(s.step === 'wait' ? '早送りにしました。月末に、月次報告が出ます' : '早送りにしました。ランプが全部点くと、制覇です');
    } else G.on.replay();
  },
  toc: () => openToc(),
  dock(id, el) {
    if (id === 'sys') return openSettings(el);
    if (id === 'plan') {
      if (G.s.propReady) return openProposal();
      G.sfx.flap();
      return toast('部長の提案は、まだ届いていません。まずは工房へ');
    }
    hud.notYet(el.textContent.trim());
  },
  openWorkshop: (el) => openWorkshop(el),
  benchDone(n) {
    if (G.ws) return;
    // 工房を閉じているあいだ：できあがるたびに煙がもくもく。ときどきトラックが店へ走る
    world.puff(3);
    if (n === 0 && G.holds === 0 && G.s.speed > 0) {
      trucks++;
      if (trucks % 2 === 1) world.truck(ROUTES[(trucks >> 1) % ROUTES.length].path, null);
    }
  },
  workshopClosed() {
    const s = G.s;
    if (s.step === 'ws') {
      s.step = s.approved ? (s.reported ? 'streak' : 'wait') : 'prop';
      hud.setGuide();
    }
    if (!s.propReady) readyProposal();
  },
  approved() {
    const s = G.s;
    s.step = s.conquered ? 'done' : s.reported ? 'streak' : 'wait';
    hud.setGuide();
  },
  proposalClosed() {
    const s = G.s;
    if (s.approved && !s.importShown) {
      // 承認した輸入の荷が、港のほうから店へ届く → 「+12,400 G」
      s.importShown = true;
      const shop = world.shops.find((b) => b.i === 8 && b.j === 14) ?? world.shops[0];
      world.truck([[7, 20], [7, 14]], () => {
        gain(12400, shop, true);
        G.sfx.deposit(1.4);
        coinsFly(toScreen(shop), hud.fundsPos(), 7);
      });
    }
  },
  reportClosed() {
    const s = G.s;
    s.reported = true;
    s.month = 6;
    s.day = 1;
    s.dayFrac = 0;
    s.sales = 0;
    s.rank = 1;
    s.brand += 4;
    s.streak = 0;
    s.step = s.conquered ? 'done' : 'streak';
    hud.setSales(0, 500);
    hud.setRank(1);
    hud.setBrand(s.brand);
    hud.setDate();
    hud.setGuide();
    hud.setStreak(0, !s.conquered);
    hud.news(`5月の企業ランキング：${'あなたの商会'}が 1 位に`);
    syncLayers();
    if (!s.propReady) readyProposal();
  },
  conquestClosed() {
    hud.refresh();
    hud.setStreak(STREAK_DAYS, false);
  },
  replay: () => location.reload(),
  jump(id) {
    if (id === 'title') return location.reload();
    if (id === 'settings') return openSettings();
    closeAll();
    world.trucks.length = 0;
    G.holds = 0;
    hud.under.classList.remove('is-off');
    const s = (G.s = fresh());
    world.speed = 1;
    world.festive = 0;
    if (id === 'proposal') Object.assign(s, { propReady: true, step: 'prop' });
    if (id === 'report') Object.assign(s, { day: 30, dayFrac: 0.6, sales: REPORT.sales - 21480, funds: 173200, propReady: true, step: 'wait' });
    if (id === 'conquer') Object.assign(s, { reported: true, rank: 1, month: 6, day: 7, sales: 268400, funds: 262900, brand: 20, streak: STREAK_DAYS - 1, step: 'streak', propReady: true, approved: true, bought: true });
    hud.refresh();
    hud.setStreak(s.streak, s.step === 'streak');
    if (G.music.name !== 'map') G.music.cue('map');
    syncLayers();
    if (id === 'pop') openPop();
    if (id === 'workshop') openWorkshop();
    if (id === 'proposal') openProposal();
    if (id === 'report') monthEnd();
    if (id === 'conquer') startConquest();
  },
};

const topH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--top-h')) || 150;
const ROUTES = [{ path: [[7, 14], [7, 12], [2, 12], [2, 14]] }, { path: [[7, 14], [7, 17], [14, 17]] }, { path: [[7, 14], [7, 12], [12, 12], [12, 10]] }];
let trucks = 0;
let lastShop = null;
let saleT = 600;
const toScreen = (b) => {
  const [x, y] = world.screen(b.x + 100, b.y + 70);
  return { x, y };
};

const hud = buildHud(app, G.on);
G.hud = hud;
hud.top.classList.add('is-off');
hud.under.classList.add('is-off');
hud.dock.classList.add('is-off');
hud.refresh();
press(spot, () => openPop(), { strong: true });
$('map').addEventListener('pointerdown', (e) => {
  if (e.target.closest('.c-spot') || !G.started) return;
  world.ripple(e.clientX, e.clientY);
  G.sfx?.flap();
});

function readyProposal() {
  const s = G.s;
  if (s.propReady) return;
  s.propReady = true;
  hud.proposal(true);
  G.sfx.decide();
}

/** 売れた：店の上に「+N G」、売上と資金が増える */
function gain(amount, shop, big) {
  const s = G.s;
  s.sales += amount;
  s.funds += Math.round(amount * 0.3);
  world.plus(shop.x + 100, shop.y + 56, `+${fmt(amount)} G`, big ? '#36e08b' : '#ffb81f');
  hud.setSales(s.sales, 520);
  hud.funds.set(s.funds, { dur: 520 });
  hud.delta('funds', Math.round(amount * 0.3));
}
function sale() {
  const s = G.s;
  const seen = world.shops.filter((b) => {
    const [x, y] = world.screen(b.x + 100, b.y + 60);
    return x > 40 && x < innerWidth - 40 && y > topH() + 96 && y < innerHeight - 120;
  });
  const pool = seen.length ? seen : world.shops;
  // 同じ店が続かないように
  let shop = pool[Math.floor(Math.random() * pool.length)];
  if (shop === lastShop && pool.length > 1) shop = pool[(pool.indexOf(shop) + 1) % pool.length];
  lastShop = shop;
  let a;
  if (!s.reported) {
    const left = REPORT.sales - s.sales;
    const days = Math.max(0.2, 31 - s.day - s.dayFrac);
    a = Math.round(((left / days / 4.2) * (0.6 + Math.random() * 0.8)) / 10) * 10;
    if (a > left - 800) return;
  } else a = Math.round((5200 + Math.random() * 4600 + (s.approved ? 1400 : 0)) / 10) * 10;
  gain(a, shop);
  G.sfx.sale();
}

function monthEnd() {
  const s = G.s;
  s.day = 30;
  s.dayFrac = 0.999;
  if (s.sales !== REPORT.sales) {
    s.funds += Math.round((REPORT.sales - s.sales) * 0.3);
    s.sales = REPORT.sales;
    hud.setSales(s.sales, 400);
    hud.funds.set(s.funds, { dur: 400 });
  }
  hud.setDate();
  openReport();
}

function nextDay() {
  const s = G.s;
  s.day++;
  G.sfx.flap();
  if (!s.reported) {
    if (s.day > 30) return monthEnd();
  } else {
    if (s.day > 30) {
      s.day = 1;
      s.month = s.month >= 12 ? 1 : s.month + 1;
    }
    if (!s.conquered && s.rank === 1) {
      s.streak++;
      hud.setStreak(s.streak, true);
      G.sfx.streak(s.streak, STREAK_DAYS);
      if (s.streak >= STREAK_DAYS) startConquest();
    }
  }
}

// ---- 毎フレーム
const prof = { n: 0, sum: 0, max: 0, list: [] };
let last = performance.now();
let slow = 0;
let frames = 0;
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const now0 = performance.now();
  const raw = now - last;
  last = now;
  const dt = Math.min(100, raw);
  loop.run(dt, now);
  world.frame(dt);
  if (G.started) {
    tickBenches(dt);
    const s = G.s;
    if (G.holds === 0 && s.speed > 0) {
      s.dayFrac += (dt * s.speed) / DAY_MS;
      s.mapSec += dt;
      saleT -= dt * s.speed;
      if (saleT <= 0) {
        saleT = 420 + Math.random() * 560;
        sale();
      }
      if (s.dayFrac >= 1) {
        s.dayFrac -= 1;
        nextDay();
      }
      if (!s.propReady && s.mapSec > 14000) readyProposal();
      hud.setDate();
    }
    if (G.music) hud.beat(G.music.beat().frac);
    // 重い端末では、効果を自動で落とす（粒の数・canvas の細かさ・流れる帯）
    frames++;
    acc += raw;
    if (frames >= 90) {
      const avg = acc / frames;
      frames = 0;
      acc = 0;
      if (avg > 22 && world.quality > 0 && ++slow >= 2) {
        slow = 0;
        world.quality--;
        fxState.scale = world.quality === 1 ? 0.7 : 0.45;
        document.documentElement.classList.add('is-lite');
        world.resize();
      } else if (avg <= 22) slow = 0;
    }
  }
  // 確かめ用：1 コマぶんのスクリプトの時間
  const cost = performance.now() - now0;
  prof.n++;
  prof.sum += cost;
  if (cost > prof.max) prof.max = cost;
  if (prof.list.length < 20000) prof.list.push(cost);
}
requestAnimationFrame(frame);
addEventListener('resize', () => world.resize());

// ---- 音：最初に触れたときに始める。タブが隠れたら止める
function initAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC({ latencyHint: 'interactive' });
  const eng = new Engine(ctx);
  const music = new Music(eng);
  const sfx = new Sfx(eng, music);
  G.eng = eng;
  G.music = music;
  G.sfx = sfx;
  env.sfx = sfx;
  const vol = () => eng.setVol({ bgm: store.bgm / 10, se: store.se / 10, mute: store.mute });
  vol();
  onStore(vol);
  music.onBar = (t, name, bar, layers) => after(Math.max(0, (t - eng.now) * 1000), () => hud.setLayers(layers.length));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
  ctx.resume();
}

// ---- はじまり
const title = $('title');
const go = $('title-go');
let ready = false;
let wantStart = false;
world.load().then(() => {
  ready = true;
  go.textContent = 'タップしてはじめる';
  title.classList.add('is-ready');
  if (wantStart) start();
});
function start() {
  if (G.started || title.classList.contains('is-boot')) return;
  if (!G.eng) initAudio();
  if (!ready) {
    wantStart = true;
    return;
  }
  const calm = isCalm();
  title.classList.add('is-boot');
  G.sfx.boot();
  // 電源が入る：横の白い線 → 上下に開く → 帯が「ガチャ」とはまる → 曲が始まる
  after(calm ? 0 : 560, () => {
    hud.top.classList.remove('is-off');
    hud.under.classList.remove('is-off');
    G.sfx.dock();
  });
  after(calm ? 0 : 740, () => {
    hud.dock.classList.remove('is-off');
    G.sfx.dock(0.85);
  });
  after(calm ? 0 : 900, () => {
    G.music.start('map', G.eng.now + 0.12);
    syncLayers();
    hud.setLayers(2);
  });
  after(calm ? 50 : 1200, () => {
    title.remove();
    G.started = true;
    spot.hidden = false;
    hud.setGuide();
    world.puff(2);
  });
}
title.addEventListener('click', start);
title.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') start();
});

// 撮影・確かめ用
window.uixlab = { G, world, prof, jump: (id) => G.on.jump(id), start };
