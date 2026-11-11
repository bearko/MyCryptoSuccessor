// 手触りラボ・方向 A「帳場」：台本の進行
import { $, wait, calm, prefs, applyPrefs, initPress, fx, makeTextures, watchPerf, buzz } from './kit.js';
import { audio, renderOffline, SE_NAMES } from './audio.js';
import { world } from './world.js';
import { hud } from './hud.js';
import { S, resetState, layersOf } from './state.js';
import { preload } from './assets.js';
import { openBalloon, openWorkshop, workshopTab, openProposal, openReport, reportTurn, playConquest, openFin, openSettings, openToc, closeToc, closeAll, isOpen, onScene } from './scenes.js';

const app = $('#app');
const title = $('#title');
const DAY = 3.2; // 1 日の長さ（秒。等速）
let saleIn = 1.2;
let saleN = 0;
let timers = [];
const later = (ms, fn) => timers.push(setTimeout(fn, ms));

makeTextures();
applyPrefs();
initPress();
fx.init($('#fx'));
preload();
world.init(() => S.scene === 'map' && openBalloon());
// 画面の外にある部品へ焦点が移っても、舞台がずれないようにする
for (const el of [app, document.documentElement, document.body]) el.addEventListener('scroll', () => { el.scrollLeft = 0; el.scrollTop = 0; }, { passive: true });
addEventListener('scroll', () => scrollTo(0, 0), { passive: true });
hud.init({
  speed: (v) => world.pause(v === 0),
  dock: (act) => {
    if (S.scene !== 'map' || isOpen()) return;
    if (act === 'sys') return openSettings();
    if (act === 'plan') {
      if (S.propReady && !S.approved) return openProposal();
      audio.se('soft');
      return hud.slip(S.approved ? '提案は承認ずみです。次の提案を待ちましょう' : 'いまは提案がありません。まず工房をのぞいてみましょう');
    }
    audio.se('soft');
    hud.slip({ logi: '物流の帳面は、この見本では閉じています', hr: '人事の帳面は、この見本では閉じています', mkt: 'マーケの帳面は、この見本では閉じています' }[act]);
  },
  callout: () => S.scene === 'map' && !isOpen() && openProposal(),
});

function syncLayers() { audio.setLayers(layersOf()); }
function readyProposal() {
  if (S.propReady || S.approved) return;
  S.propReady = true;
  hud.callout(true);
  audio.se('soft');
  hud.news('貿易部長のヴァスコ・ダ・ガマから、提案が届いています');
}

onScene({
  closed(name, instant) {
    syncLayers();
    if (name === 'workshop' || name === 'balloon') later(1300, readyProposal);
    if (name === 'report') {
      // 月をまたぐ
      S.months.push(Math.round(S.sales / 10) * 10);
      S.month++;
      S.day = 1;
      S.frac = 0;
      S.sales = 0;
      hud.refresh(false);
      if (!instant && !S.conquered) later(calm() ? 200 : 650, () => !isOpen() && playConquest());
    }
    if (name === 'conquest') later(1100, () => !isOpen() && openFin());
  },
  bought() {
    syncLayers();
    hud.news('工房に治具がそろいました — 作る速さ 25% 上がる');
  },
  approved() {
    syncLayers();
    world.importCart();
    hud.news('センスの輸入をはじめました — 見込み 月 +12,400 G');
    later(500, () => { hud.salesNote('<i class="tri"></i>+12,400／月'); audio.se('income'); });
    later(900, () => hud.brand(S.brand + 2));
  },
  ranked() {
    syncLayers();
    hud.news('エリア 1 位になりました');
  },
  restart,
  jump,
});

// ---------------------------------------------------------------- 時間（地図にいるあいだだけ進む）
setInterval(() => {
  if (S.scene !== 'map' || S.held || S.speed === 0 || document.hidden) return;
  const dt = 0.1 * S.speed;
  S.frac += dt / DAY;
  if (S.frac >= 1) {
    S.frac -= 1;
    S.day++;
    if (S.day > 30) {
      // 月の終わり：月次報告が自動で開く
      S.day = 30;
      S.frac = 0.999;
      hud.ruler();
      if (!isOpen()) openReport();
      return;
    }
    hud.date();
    audio.se('tick', { n: S.day % 5, vel: 0.07 });
  }
  hud.ruler();
  saleIn -= dt;
  if (saleIn <= 0) {
    saleIn = (S.approved ? 1.5 : 2.5) * (0.7 + Math.random() * 0.6);
    const pool = S.approved ? [480, 720, 960, 1200] : [240, 360, 480, 720];
    const n = pool[Math.floor(Math.random() * pool.length)];
    world.sale(Math.random() < 0.72 ? 'storeA' : 'storeB', n);
    hud.sales(n);
    // 資金に残るのは、仕入れと給料を引いた分
    hud.funds(Math.round((n * 0.4) / 10) * 10, { quiet: true });
    audio.se('coin', { n: saleN++ % 5, vel: 0.13 });
  }
}, 100);

// ---------------------------------------------------------------- はじまり
async function start(fast = false) {
  if (S.scene !== 'title') return;
  S.scene = 'opening';
  audio.start();
  applyPrefs();
  audio.setScene('map');
  syncLayers();
  audio.se('start');
  buzz(16);
  if (!calm()) $('.dir', title).animate([{ transform: 'rotate(7deg) scale(1.5)' }, { transform: 'rotate(7deg) scale(0.94)', offset: 0.6 }, { transform: 'rotate(7deg) scale(1)' }], { duration: 220 });
  await wait(calm() || fast ? 0 : 200);
  title.classList.add('open');
  title.classList.toggle('rm', calm());
  world.base(fast ? 0 : 1700);
  await wait(calm() || fast ? 0 : 300);
  app.classList.add('live');
  await wait(calm() || fast ? 30 : 640);
  title.style.display = 'none';
  S.scene = 'map';
  hud.ruler();
  hud.tape();
  watchPerf();
  later(1600, () => S.scene === 'map' && !S.visited && !isOpen() && world.hint(true));
  later(22000, () => S.scene === 'map' && readyProposal());
}
title.addEventListener('click', () => start());
title.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && start());

async function restart() {
  timers.forEach(clearTimeout);
  timers = [];
  await closeAll(true);
  world.uncelebrate();
  resetState();
  saleIn = 1.2;
  hud.refresh(true);
  hud.resetNews();
  hud.callout(false);
  world.hint(false);
  world.pause(false);
  audio.setScene('map');
  syncLayers();
  app.classList.remove('live');
  title.classList.remove('open', 'rm');
  // 開く動きが残っていても、表紙を閉じた形に戻す
  for (const x of title.getAnimations({ subtree: true })) if (x.animationName === 'covopen' || x.animationName === 'fadeout') x.cancel();
  title.style.display = '';
  world.base(0);
}

// ---------------------------------------------------------------- 目次：好きな場面へ飛ぶ
async function jump(id) {
  if (id === 'title') return restart();
  if (S.scene === 'title') await start(true);
  await closeAll(true);
  await wait(60);
  if (id === 'map') world.base(600);
  if (id === 'balloon') openBalloon();
  if (id === 'workshop') openWorkshop();
  if (id === 'invest') { await openWorkshop(); await wait(calm() ? 0 : 380); workshopTab(1); }
  if (id === 'proposal') { S.approved = false; S.propReady = true; hud.callout(true); openProposal(); }
  if (id === 'report') openReport();
  if (id === 'conquest') playConquest();
  if (id === 'settings') openSettings();
}
$('#toc-tab').addEventListener('click', () => { if (!audio.ready && S.scene !== 'title') audio.start(); openToc(); });

// 確かめ用（撮影・音の書き出し）
window.__lab = { S, audio, world, hud, jump, start, reportTurn, workshopTab, renderOffline, SE_NAMES, prefs, applyPrefs, closeToc, isOpen };
