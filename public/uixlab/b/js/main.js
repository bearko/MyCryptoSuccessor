// 手触りラボ B「号外」— 入口。台本を進める（触って進むのが基本。待っているあいだも画面は生きている）。
import { $, G, bus, wait, reduced, pressable, applySettings } from './core.js';
import { audio } from './audio.js';
import { NEWS, HL, SAY } from './text.js';
import { makeTextures, loadSprites, initFx, ribbon, burst, loadImage, cutout } from './fx.js';
import { typeText } from './ui.js';
import { initMap, camTo, home, cam, WS, SHOPS, setTag, beat as mapBeat, celebrate, dim, lockMap } from './map.js';
import { initHud, initDock, chrome, chromeInit, startClock, news, planNote, beat as hudBeat, cue, setDate, setSales, setRank, setSpeed, hold, sale } from './hud.js';
import { ui, initTitle, openBubble, openWorkshop, openSettings, toggleToc, clearAll, escape } from './scenes-a.js';
import { openProposal, openReport, conquer, clearB } from './scenes-b.js';

const START = { funds: 23716, sales: 31840, brand: 16, rank: 2, month: 3, day: 24 };

async function boot() {
  applySettings();
  makeTextures();
  initFx();
  pressable(document);
  chromeInit();
  await loadSprites();
  initMap({ onWorkshop: () => openBubble() });
  initHud();
  initDock({
    onPlan: (b) => {
      if (G.proposal === 'ready') {
        audio.se('decide');
        openProposal();
      } else {
        audio.se('slash');
        ribbon(HL.plan, G.proposal === 'approved' ? '提案は承認済み。次の提案を待っています' : 'いまは提案がありません', { from: 'right', color: 'gold' });
      }
    },
    onSystem: () => openSettings(),
  });
  $('#toc-key').addEventListener('click', (e) => toggleToc(jump, e.currentTarget));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && escape());
  // 主のボタンは、押した所から網点が小さく弾ける
  bus.on('press', ({ el, x, y }) => {
    if (el.matches('.btn--gold, .btn--shu, .dk--main')) burst(x, y, { count: 9, speed: 240, size: 5, life: 0.36, lines: false });
  });
  $('#town').decode?.().catch(() => {});
  bus.on('toc', (anchor) => toggleToc(jump, anchor));
  audio.onBeat((b) => {
    mapBeat(b);
    hudBeat(b);
  });
  await initTitle(enter);
  wire();
  document.documentElement.classList.add('ready');
  // 確かめ・撮影用の窓口（?at=ws などで場面へ飛べる）
  window.__lab = { G, jump, audio, ui, cam };
  const at = new URLSearchParams(location.search).get('at');
  if (at) {
    $('#title').hidden = true;
    enter(true);
    if (at !== 'map') setTimeout(() => jump(at), 900);
  }
}

/** はじまりの板が開いて、地図へ入る */
function enter(quick = false) {
  ui.open = 'map';
  G.stage = 'map';
  // カメラ：工房に寄った所から、町ぜんたいへ引く
  const hm = home();
  if (!quick && !reduced()) {
    Object.assign(cam, { x: WS.x, y: WS.y - 80, z: Math.min(1, hm.z * 1.7) });
    camTo({ ...hm }, { dur: 1500, ease: 'cubic-bezier(.3,0,.1,1)' });
  }
  setTimeout(() => chrome('map', { dur: 320 }), quick ? 0 : 380);
  setTimeout(() => {
    startClock();
    setTag('call');
    news(NEWS.first, { quiet: true });
    hint();
  }, quick ? 50 : 1100);
  setTimeout(probe, 2600);
}
/** 重い端末を見つける：地図で 1.2 秒ぶんコマの間隔を測り、中央の値が 26ms を超えたら効果を落とす */
function probe() {
  const d = [];
  let last = 0;
  const t0 = performance.now();
  const loop = (t) => {
    if (last) d.push(t - last);
    last = t;
    if (t - t0 < 1200) return requestAnimationFrame(loop);
    d.sort((a, b) => a - b);
    if (d.length && d[Math.floor(d.length / 2)] > 26) document.documentElement.classList.add('lite');
  };
  requestAnimationFrame(loop);
}
/** 最初の案内：工房を押してみて（押すまで出しておく） */
function hint() {
  if (G.visitedWs || G.proposal !== 'none') return;
  cue(`<span class="kick kick--shu cue-msg"><b>工房の建物を押してみてください</b></span>`);
}

function wire() {
  bus.on('sheet-closed', (kind) => {
    if (kind === 'ws' && G.proposal === 'none') setTimeout(() => bus.emit('proposal-ready'), 900);
  });
  bus.on('proposal-ready', () => {
    if (G.proposal !== 'none') return;
    G.proposal = 'ready';
    planNote(true);
    news(NEWS.proposal);
    if (ui.open === 'map') cueProposal();
  });
  bus.on('back-to-map', () => {
    if (G.proposal === 'ready') cueProposal();
    else if (G.stage === 'april') cueApril();
    else if (G.conquered) cueEnd();
    else hint();
  });
  bus.on('approved', () => {
    cue('');
  });
  bus.on('month-end', async () => {
    // 4 月の締め：早回しを使わずに待っていた人も、ここで制覇へ進む
    if (G.month === 4 && !G.conquered && !lapsing) {
      while (ui.open !== 'map' || ui.busy) await wait(400);
      if (!G.conquered) conquer();
      return;
    }
    if (G.month !== 3 || ui.open === 'report') return;
    // 開いている物があれば、閉じてから（急がせない：地図に戻るまで待つ）
    while (ui.open !== 'map' || ui.busy) await wait(400);
    news(NEWS.monthEnd, { extra: true });
    await wait(reduced() ? 300 : 900);
    openReport();
  });
  bus.on('report-closed', () => {
    G.reportSeen = true;
    G.stage = 'april';
    setRank(1);
    news(NEWS.top, { extra: true });
    setDate(4, 1);
    setSales(0);
    audio.layers(5);
    cueApril();
  });
  bus.on('conquered', () => {
    G.stage = 'done';
    setTimeout(() => ui.open === 'map' && cueEnd(), 1600);
  });
}
function cueProposal() {
  cue(`<span class="kick kick--shu cue-msg"><b>経営企画に提案が届いています</b></span>
       <button class="btn btn--gold" type="button" data-press data-go><span class="btn-f">提案を見る<i class="tri tri--r"></i></span></button>`, { '[data-go]': () => openProposal() });
}
function cueApril() {
  cue(`<span class="kick kick--shu cue-msg"><b>来月も 1 位を守れば、${HL.town}を制覇</b></span>
       <button class="btn btn--gold" type="button" data-press data-go><span class="btn-f">翌月の締めへ進める<i class="ic-ff"></i></span></button>`, { '[data-go]': () => timelapse() });
}
function cueEnd() {
  // 最後の一言は、案内役が喋る（声は 3 人め）
  cue(`<div class="cue-talk"><div class="cue-hero" aria-hidden="true"></div><div class="cue-say"><p class="say"></p></div></div>
       <div class="cue-row"><button class="btn btn--gold" type="button" data-press data-again><span class="btn-f">もう一度見る</span></button>
       <button class="btn" type="button" data-press data-toc><span class="btn-f">${HL.toc}</span></button></div>`, {
    '[data-again]': () => jump('title'),
    '[data-toc]': (e) => toggleToc(jump, e.currentTarget),
  });
  const c = $('#cue');
  loadImage('../../mch/Image/Characters/navi_ain_speak_00_talk.png').then((im) => {
    const box = c.querySelector('.cue-hero');
    if (im && box && !box.firstChild) box.append(cutout(im, { scale: 1, outline: 2, reg: 3, rect: [0, 0, 96, 84] }));
  });
  const say = c.querySelector('.say');
  if (say) typeText(say, SAY.ending, { who: 2 });
}
/** 一か月を早回しして、制覇へ */
let lapsing = false;
async function timelapse() {
  if (lapsing || ui.busy) return;
  lapsing = true;
  cue('');
  lockMap(true);
  setSpeed(3);
  audio.se('decide');
  if (!reduced()) ribbon(HL.later, '4月の商いが進みます', { from: 'right', color: 'ink' });
  for (let d = 2; d <= 30; d++) {
    setDate(4, d);
    if (d % 3 === 0) sale(SHOPS[d % SHOPS.length], d % 2 ? 1800 : 900, d % 2 === 1);
    await wait(reduced() ? 12 : 62);
  }
  setSpeed(1);
  hold(true);
  await wait(reduced() ? 100 : 500);
  hold(false);
  lapsing = false;
  lockMap(false);
  await conquer();
}

/** 目次：好きな場面へ飛ぶ */
async function jump(k) {
  await clearAll();
  clearB();
  cue('');
  if (k === 'title') {
    // はじめから：数字を戻して、はじまりへ
    Object.assign(G, { ...START, proposal: 'none', bought: false, visitedWs: false, reportSeen: false, conquered: false, stage: 'title', waiting: false, hold: 0 });
    location.replace(location.pathname);
    return;
  }
  if (ui.open === 'title') return;
  celebrate(G.conquered);
  dim(0);
  chrome('map');
  if (k === 'map') {
    camTo({ ...home() }, { dur: 500 });
    bus.emit('back-to-map');
  } else if (k === 'bubble') openBubble();
  else if (k === 'ws') openWorkshop();
  else if (k === 'prop') {
    if (G.proposal !== 'ready') {
      G.proposal = 'ready';
      planNote(true);
    }
    openProposal();
  } else if (k === 'report') openReport();
  else if (k === 'conquer') conquer();
  else if (k === 'set') openSettings();
}

boot();
