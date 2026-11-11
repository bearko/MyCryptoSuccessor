// 場面（前半）：はじまり・建物の吹き出し・工房の画面・設定・目次。
import { $, h, G, anim, done, reduced, wait, bus, settings, applySettings, EASE, fmt, vibrate, clamp } from './core.js';
import { audio } from './audio.js';
import { HL, SAY, NEWS } from './text.js';
import { Digits, typeText, slider, toggle, segmented, ping } from './ui.js';
import { SPR, cutout, loadImage, slash, slam, slamType, burst, shake, flash, makeTextures, clearCutCache } from './fx.js';
import { WS, cam, camTo, home, project, dim, setTag, lockMap, coverMap } from './map.js';
import { chrome, hold, news, spend, cue } from './hud.js';

export const ui = { open: 'title', busy: false };

// ---------------------------------------------------------------- はじまり
export async function initTitle(onStart) {
  const cast = $('#title-cast');
  const navi = await loadImage('../../mch/Image/Characters/navi_ain_speak_00_talk.png');
  const put = (c, cls) => {
    const w = h(`<div class="tc ${cls}"></div>`);
    w.append(c);
    cast.append(w);
    return w;
  };
  put(cutout(SPR.artist, { scale: 2, reg: 4 }), 'tc--a');
  if (navi) put(cutout(navi, { scale: 2, reg: 4 }), 'tc--n');
  put(cutout(SPR.tactician, { scale: 2, reg: 4, flip: true }), 'tc--t');
  const go = $('#title-go');
  let started = false;
  const start = async () => {
    if (started) return;
    started = true;
    await audio.start();
    audio.se('start');
    audio.startMusicAt(0.05 + 0.26 * 4);
    vibrate(18);
    const t = $('#title');
    const hl = $('#title-hl');
    flash(null, 0.7, 180);
    shake(3, 220);
    const r = hl.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 46, speed: 900, size: 10, life: 0.7 });
    anim(hl, [{ transform: 'rotate(-9deg) scale(1)' }, { transform: 'rotate(-9deg) scale(1.16)', offset: 0.35 }, { transform: 'rotate(-9deg) scale(1.1)' }], { duration: 260, easing: EASE.slam });
    await wait(reduced() ? 40 : 230);
    onStart();
    anim($('.title-in'), [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 260, easing: EASE.in });
    const pa = anim($('.title-plate--a'), [{ transform: 'rotate(-9deg) translateY(0)' }, { transform: 'rotate(-9deg) translateY(-72vmax)' }], { duration: 620, delay: 90, easing: EASE.inout });
    anim($('.title-plate--b'), [{ transform: 'rotate(-9deg) translateY(0)' }, { transform: 'rotate(-9deg) translateY(72vmax)' }], { duration: 620, delay: 90, easing: EASE.inout });
    if (reduced()) anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 });
    await done(pa);
    t.hidden = true;
  };
  go.addEventListener('click', start);
  // 入り：書体が読めてから、見出しの活字が 1 字ずつ落ち、帯・人物・ボタンが続く（音はまだ鳴らさない）
  await Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(1500)]);
  $('#title').classList.add('is-in');
  const B = { easing: EASE.out, fill: 'backwards' };
  [...$('#title-hl').children].forEach((c, i) => anim(c, [
    { transform: `translateY(-40%) scale(2.4) rotate(${i ? 12 : -14}deg)`, opacity: 0 },
    { transform: 'translateY(3%) scale(0.94) rotate(0deg)', opacity: 1, offset: 0.7 },
    { transform: 'none', opacity: 1 },
  ], { duration: 240, delay: 160 + i * 140, easing: EASE.slam, fill: 'backwards' }));
  anim($('.title-kick'), [{ transform: 'rotate(-9deg) skewX(-12deg) translateX(-160%)' }, { transform: 'rotate(-9deg) skewX(-12deg) translateX(0)' }], { duration: 260, delay: 60, ...B, easing: EASE.back });
  cast.querySelectorAll('.tc').forEach((c, i) => anim(c, [{ transform: 'translateY(60%) rotate(-12deg) scale(0.6)', opacity: 0 }, { transform: 'translateY(-8%) rotate(3deg) scale(1.05)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 480 + i * 110, ...B }));
  anim($('.title-sub'), [{ transform: 'skewX(-12deg) translateX(60%)', opacity: 0 }, { transform: 'skewX(-12deg) translateX(0)', opacity: 1 }], { duration: 260, delay: 560, ...B, easing: EASE.back });
  anim(go, [{ transform: 'translateY(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: 700, ...B, easing: EASE.back });
  $('#title').addEventListener('click', (e) => { if (e.target.closest('.title-in')) start(); });
  // 目次から入る：はじまりの演出のあと、目次を開く
  $('#title-toc').addEventListener('click', () => { start(); setTimeout(() => bus.emit('toc', $('#toc-key')), 1700); });
}
// ---------------------------------------------------------------- 建物の吹き出し
let bub = null, sayCtl = null, line = 0;
const phone = () => cam.vw < 900;
export async function openBubble() {
  if (ui.open !== 'map' || ui.busy) return;
  ui.busy = true;
  ui.open = 'bubble';
  hold(true);
  lockMap(true);
  setTag('hide');
  cue('');
  audio.se('open');
  if (audio.layerCount < 2) audio.layers(2);
  // 押した建物から、網点が小さく弾ける（どこを押したかを目で返す）
  const [px, py] = project(WS.x, WS.y - 40);
  burst(px, py, { count: 14, speed: 300, size: 6, life: 0.4 });
  $('#world').classList.add('is-near');
  const ay = phone() ? 0.33 : 0.36;
  const big = cam.vw >= 480;
  await camTo({ x: WS.x, y: WS.y - 50, z: 1, ax: big ? 0.5 : 0.6, ay }, { dur: 680 });
  dim(1);
  const [bx, by] = project(WS.x, WS.y + 26);
  const w = Math.min(cam.vw - 20, big ? 500 : 420);
  const left = clamp(bx - w / 2, 10, cam.vw - w - 10);
  line = 0;
  const top0 = by + 20;
  bub = h(`
    <div class="bub${big ? ' bub--s3' : ''}" role="dialog" aria-label="工房（本店）" style="left:${left}px;top:${by + 20}px;width:${w}px;--tx:${bx - left}px">
      <div class="bub-sh"></div>
      <div class="bub-bg"></div>
      <i class="bub-tail"></i>
      <div class="bub-burst" aria-hidden="true"></div>
      <div class="bub-hero" aria-hidden="true"></div>
      <div class="bub-top">
        <span class="kick kick--shu bub-role"><b>工房の職人</b></span>
        <b class="bub-name">MCHアーティスト</b>
        <button class="xbtn bub-x" type="button" data-press data-se="none" aria-label="閉じる"><i class="xmark"></i></button>
      </div>
      <button class="bub-say" type="button" data-press data-se="none" aria-label="続きを聞く"><p class="say"></p><i class="bub-more tri tri--dn" aria-hidden="true"></i></button>
      <div class="bub-meta"><span>今月つくった数</span><b class="dg">${fmt(G.made)}</b><span>個</span><i class="dia"></i><span>作業台</span><b class="dg">3</b></div>
      <div class="bub-act">
        <button class="btn btn--gold bub-open" type="button" data-press><span class="btn-f">${HL.wsOpen}<i class="tri tri--r"></i></span></button>
        <button class="btn bub-up" type="button" data-press><span class="btn-f"><span>町工場にする<small>（1×2）</small></span><b class="bub-cost"><span class="dg">30,000</span><small>G</small></b></span></button>
      </div>
    </div>`);
  bub.querySelector('.bub-hero').append(cutout(SPR.artist, { scale: big ? 3 : 2, reg: big ? 4 : 3 }));
  $('#layer-bubble').append(bub);
  const sayEl = bub.querySelector('.say');
  const speak = (text, first = false) => {
    const bg = bub.querySelector('.bub-bg');
    const r0 = bg.getBoundingClientRect();
    sayCtl?.skip();
    sayCtl = typeText(sayEl, text, { who: 0 });
    // 画面の下へはみ出すときは、吹き出しを上へずらす（押す所を欠かさない）
    bub.style.top = `${top0}px`;
    const over = top0 + bub.offsetHeight + 14 - cam.vh;
    if (over > 0) bub.style.top = `${Math.max(cam.vh * 0.16, top0 - over)}px`;
    bub.classList.remove('is-done');
    sayCtl.done.then(() => bub?.classList.add('is-done'));
    if (!first) {
      // 枠が、セリフの長さに合わせて伸び縮みする（前の大きさから、ばねのように）
      const r1 = bg.getBoundingClientRect();
      const sy = r0.height / r1.height;
      for (const e of [bg, bub.querySelector('.bub-sh')]) anim(e, [{ transform: `scaleY(${sy})` }, { transform: `scaleY(${1 + (1 - sy) * 0.12})`, offset: 0.6 }, { transform: 'scaleY(1)' }], { duration: 300, easing: EASE.out, fill: 'none' });
      const dy = r0.height - r1.height;
      for (const e of bub.querySelectorAll('.bub-meta, .bub-act')) anim(e, [{ transform: `translateY(${dy}px)` }, { transform: `translateY(${-dy * 0.12}px)`, offset: 0.6 }, { transform: 'translateY(0)' }], { duration: 300, easing: EASE.out, fill: 'none' });
      const hero = bub.querySelector('.bub-hero');
      anim(hero, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-12px) rotate(-4deg)', offset: 0.4 }, { transform: 'translateY(0) rotate(0)' }], { duration: 260, easing: EASE.out, fill: 'none', deco: true });
    }
  };
  speak(SAY.crafter[0], true);
  // 立ち上がる：建物の足もとから
  if (!reduced()) {
    anim(bub, [{ transform: 'scale(0.2) rotate(-6deg)', opacity: 0 }, { transform: 'scale(1.05) rotate(1deg)', opacity: 1, offset: 0.7 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 250, easing: EASE.out });
    anim(bub.querySelector('.bub-hero'), [{ transform: 'translate(-40px,60px) rotate(-18deg) scale(0.5)', opacity: 0 }, { transform: 'translate(6px,-14px) rotate(4deg) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 300, delay: 110, easing: EASE.out, fill: 'backwards' });
    anim(bub.querySelector('.bub-burst'), [{ transform: 'scale(0.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 320, delay: 90, easing: EASE.back, fill: 'backwards' });
  } else anim(bub, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 });
  bub.querySelector('.bub-say').addEventListener('click', () => {
    if (sayCtl?.typing) {
      sayCtl.skip();
      audio.se('release');
      return;
    }
    line = (line + 1) % SAY.crafter.length;
    audio.se('tab');
    speak(SAY.crafter[line]);
  });
  bub.querySelector('.bub-x').addEventListener('click', () => closeBubble());
  // 吹き出しの外（地図）を押しても閉じる
  const outside = () => { if (ui.open === 'bubble' && !ui.busy) closeBubble(); };
  $('#world').addEventListener('click', outside);
  bub.__off = () => $('#world').removeEventListener('click', outside);
  bub.querySelector('.bub-open').addEventListener('click', () => openWorkshop());
  bub.querySelector('.bub-up').addEventListener('click', (e) => {
    const short = 30000 - G.funds;
    const b = e.currentTarget;
    if (short > 0) {
      audio.se('deny');
      anim(b, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 300, easing: 'ease-out', fill: 'none' });
      speak(SAY.upShort.replace('{n}', fmt(short)));
    } else {
      audio.se('decide');
      speak(SAY.upOk);
    }
  });
  ui.busy = false;
}
export async function closeBubble({ silent = false, keepCam = false } = {}) {
  if (!bub) return;
  const b = bub;
  bub = null;
  b.__off?.();
  sayCtl?.skip();
  if (!silent) audio.se('close');
  dim(0);
  $('#world').classList.remove('is-near');
  if (!silent) await done(anim(b, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.3) rotate(4deg)', opacity: 0 }], { duration: 170, easing: EASE.in }));
  b.remove();
  if (!keepCam) {
    hold(false);
    lockMap(false);
    ui.open = 'map';
    setTag(G.visitedWs ? 'idle' : 'call');
    await camTo({ ...home() }, { dur: silent ? 0 : 560, ease: EASE.out });
    bus.emit('back-to-map');
  }
}

// ---------------------------------------------------------------- 札（工房・設定）の器
let sheet = null, sheetKind = '';
function mountSheet(kind, label, inner) {
  sheet?.remove();
  sheet = h(`<section class="sheet sheet--${kind}" role="dialog" aria-label="${label}"><div class="sheet-paper">${inner}</div></section>`);
  sheetKind = kind;
  $('#layer-sheet').append(sheet);
  // 札が画面の幅ぜんぶを覆うとき（スマホ）は、下の地図を休ませる
  coverMap(sheet.firstElementChild.offsetWidth >= cam.vw - 1);
  return sheet;
}
export async function closeSheet({ silent = false } = {}) {
  if (!sheet || ui.busy) return;
  const kind = sheetKind;
  const leave = () => {
    stopBenches();
    coverMap(false);
    sheet?.remove();
    sheet = null;
    chrome('map');
    dim(0);
    $('#world').classList.remove('is-near');
    hold(false);
    lockMap(false);
    setTag(G.visitedWs ? 'idle' : 'call');
    Object.assign(cam, home());
    camTo({ ...home() }, { dur: 0 });
    ui.open = 'map';
  };
  if (silent) return leave();
  ui.busy = true;
  audio.se('close');
  await slash({ from: kind === 'set' ? 'up' : 'left', mid: leave, colors: kind === 'set' ? ['ink', 'gold'] : ['ink', 'shu'] });
  ui.busy = false;
  bus.emit('sheet-closed', kind);
  bus.emit('back-to-map');
}

// ---------------------------------------------------------------- 工房
const BENCH = [
  { hero: SPR.artist, name: 'MCHアーティスト', item: SPR.sensu, itemName: 'センス', ms: 3400, made: 68 },
  { hero: SPR.pythagoras, name: 'ピタゴラス', item: SPR.lantern, itemName: 'ランタン', ms: 4600, made: 74 },
  { hero: SPR.wright, name: 'ライト兄弟', item: SPR.mallet, itemName: 'マレット', ms: 5900, made: 77 },
];
G.made = BENCH.reduce((a, b) => a + b.made, 0);
let benchRun = [], madeDg = null;
function stopBenches() {
  benchRun.forEach((a) => a?.cancel());
  benchRun = [];
}
const speedMul = () => (G.bought ? 1.15 : 1);
function runBench(i, root) {
  const b = BENCH[i];
  const card = root.querySelector(`.bn[data-i="${i}"]`);
  if (!card) return;
  const fill = card.querySelector('.bn-fill');
  const st = card.querySelector('.bn-st');
  if (!G.auto && b.made >= G.target) {
    card.classList.add('is-stop');
    st.textContent = HL.stop;
    fill.style.transform = 'translateX(-100%)';
    return;
  }
  card.classList.remove('is-stop');
  st.textContent = '';
  const a = fill.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0%)' }], { duration: b.ms / speedMul(), easing: 'linear', fill: 'forwards' });
  benchRun[i] = a;
  a.onfinish = () => {
    if (!sheet || sheetKind !== 'ws') return;
    b.made++;
    G.made++;
    if (G.auto && b.made > G.target) b.made = 1;
    completeBench(i, card);
    setTimeout(() => runBench(i, root), reduced() ? 300 : 520);
  };
}
function completeBench(i, card) {
  const b = BENCH[i];
  const visible = !card.closest('.pane')?.hidden;
  card.querySelector('.bn-n').__dg.set(b.made, { strong: true });
  madeDg?.set(G.made);
  if (!visible) return;
  audio.se('complete', i);
  const it = card.querySelector('.bn-item');
  const r = it.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, { count: 14, speed: 330, size: 5, life: 0.45, lines: false });
  anim(it, [{ transform: 'scale(1) rotate(0)' }, { transform: 'scale(1.5) rotate(-12deg) translateY(-10px)', offset: 0.3 }, { transform: 'scale(0.94) rotate(3deg)', offset: 0.75 }, { transform: 'scale(1) rotate(0)' }], { duration: 360, easing: 'ease-out', fill: 'none', deco: true });
  anim(card.querySelector('.bn-hero'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-16px) rotate(-5deg)', offset: 0.35 }, { transform: 'translateY(0)' }], { duration: 300, easing: 'ease-out', fill: 'none', deco: true });
  const tagEl = card.querySelector('.bn-done');
  anim(tagEl, [{ transform: 'rotate(-9deg) scale(2.2)', opacity: 0 }, { transform: 'rotate(-9deg) scale(0.95)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-9deg) scale(1)', opacity: 1, offset: 0.3 }, { transform: 'rotate(-9deg) scale(1)', opacity: 1, offset: 0.8 }, { transform: 'rotate(-9deg) scale(1) translateY(-8px)', opacity: 0 }], { duration: 760, easing: 'linear', fill: 'both' });
  anim(card.querySelector('.bn-bar'), [{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 200, fill: 'none' });
}
const INVEST = [
  { id: 'polish', name: '研磨機', note: SAY.inv1, cost: 12000 },
  { id: 'kiln', name: '大型の炉', note: SAY.inv2, cost: 150000 },
  { id: 'vent', name: '換気の煙突', note: SAY.inv3, cost: 4000, owned: true },
];
function investHtml() {
  return INVEST.map((v, i) => {
    const owned = v.owned || (v.id === 'polish' && G.bought);
    const can = !owned && G.funds >= v.cost;
    return `
    <article class="iv${owned ? ' is-owned' : ''}" data-id="${v.id}">
      <div class="iv-no dg">0${i + 1}</div>
      <div class="iv-main">
        <h3 class="iv-name">${v.name}</h3>
        <p class="iv-note">${v.note}</p>
        <div class="iv-gauge" hidden><i></i><span></span></div>
      </div>
      <div class="iv-act">
        ${owned
          ? `<div class="iv-owned"><i class="check"></i><b>${HL.owned}</b></div>`
          : `<button class="btn ${can ? 'btn--gold' : 'btn--flat'} iv-buy" type="button" data-press data-se="${can ? 'tap' : 'none'}" aria-label="${v.name}を買う ${fmt(v.cost)} G"><span class="btn-f"><span class="iv-buy-l">${can ? '買う' : 'まだ'}</span><b><span class="dg">${fmt(v.cost)}</span><small>G</small></b></span></button>`}
      </div>
      <div class="iv-stamp" aria-hidden="true">${HL.bought}</div>
    </article>`;
  }).join('');
}
export async function openWorkshop() {
  if (ui.busy || ui.open === 'ws') return;
  ui.busy = true;
  const fromBubble = !!bub;
  if (!fromBubble) {
    hold(true);
    lockMap(true);
    setTag('hide');
    cue('');
  }
  audio.se('open');
  if (audio.layerCount < 3) audio.layers(3);
  let s;
  await slash({
    from: 'right', label: HL.ws,
    mid: () => {
      if (fromBubble) closeBubble({ silent: true, keepCam: true });
      chrome('sheet');
      dim(2);
      ui.open = 'ws';
      s = mountSheet('ws', '工房（本店）', `
        <header class="sh-head">
          <div class="sh-photo" aria-hidden="true"><i></i></div>
          <div class="sh-title">
            <span class="kick kick--shu"><b>${HL.wsSub}</b></span>
            <h2 class="sh-hl reg">${HL.ws}</h2>
          </div>
          <div class="sh-stat"><span>今月つくった数</span><b><span class="dg" id="ws-made"></span><small>個</small></b></div>
          <button class="xbtn sh-x" type="button" data-press data-se="none" aria-label="工房を閉じる"><i class="xmark"></i></button>
        </header>
        <div class="tabs" role="tablist">
          <button class="tab is-on" role="tab" type="button" data-press data-se="none" data-tab="bench" aria-selected="true">${HL.tabBench}</button>
          <button class="tab" role="tab" type="button" data-press data-se="none" data-tab="invest" aria-selected="false">${HL.tabInvest}</button>
          <i class="tabs-rule"></i>
        </div>
        <div class="sh-body">
          <div class="pane pane--bench" data-pane="bench" role="tabpanel">
            ${BENCH.map((b, i) => `
            <article class="bn" data-i="${i}">
              <div class="bn-hero" aria-hidden="true"></div>
              <div class="bn-main">
                <div class="bn-top"><span class="kick"><b>作業台 ${i + 1}</b></span><b class="bn-name">${b.name}</b></div>
                <div class="bn-mid">
                  <i class="bn-item" style="background-position:${-(b.item % 8) * 64}px ${-Math.floor(b.item / 8) * 64}px" aria-hidden="true"></i>
                  <div class="bn-info"><b class="bn-iname">${b.itemName}</b>
                  <span class="bn-cnt"><span class="bn-n dg"></span><span class="bn-of">/ <span class="bn-t">${G.target}</span> 個</span></span></div>
                </div>
                <div class="bn-bar" role="progressbar" aria-label="${b.itemName}の進み"><div class="bn-fill"><i></i></div><span class="bn-st"></span></div>
              </div>
              <div class="bn-done" aria-hidden="true">${HL.done}</div>
            </article>`).join('')}
            <div class="ctl">
              <div class="ctl-row">
                <label class="ctl-l" id="l-target">作る数</label>
                <div class="ctl-sl" id="sl-target"></div>
                <b class="ctl-v"><span class="dg" id="v-target"></span><small>個</small></b>
              </div>
              <div class="ctl-row ctl-row--tg">
                <label class="ctl-l">自動製造</label>
                <button id="tg-auto"></button>
                <p class="ctl-note say" id="auto-note"></p>
              </div>
            </div>
          </div>
          <div class="pane pane--invest" data-pane="invest" role="tabpanel" hidden>
            <div class="iv-list">${investHtml()}</div>
            <div class="iv-talk"><div class="iv-talk-hero" aria-hidden="true"></div><p class="say">${SAY.investIdle}</p></div>
          </div>
        </div>`);
      // 切り抜きと数字
      madeDg = new Digits(s.querySelector('#ws-made'), G.made);
      s.querySelectorAll('.bn').forEach((card, i) => {
        card.querySelector('.bn-hero').append(cutout(BENCH[i].hero, { scale: 2, reg: 3 }));
        card.querySelector('.bn-n').__dg = new Digits(card.querySelector('.bn-n'), BENCH[i].made);
      });
      s.querySelector('.iv-talk-hero').append(cutout(SPR.artist, { scale: 2, reg: 3 }));
      const dT = new Digits(s.querySelector('#v-target'), G.target);
      const note = s.querySelector('#auto-note');
      note.textContent = G.auto ? SAY.benchNote : SAY.benchNoteOff;
      slider(s.querySelector('#sl-target'), {
        min: 10, max: 200, step: 10, value: G.target, label: '作る数', format: (v) => String(v),
        onInput: (v) => {
          G.target = v;
          dT.set(v, { strong: true });
          s.querySelectorAll('.bn-t').forEach((e) => (e.textContent = v));
        },
        onChange: () => BENCH.forEach((_, i) => { if (!benchRun[i] || benchRun[i].playState === 'finished' || s.querySelector(`.bn[data-i="${i}"]`).classList.contains('is-stop')) runBench(i, s); }),
      });
      toggle(s.querySelector('#tg-auto'), {
        on: G.auto, label: '自動製造',
        onChange: (on) => {
          G.auto = on;
          note.textContent = on ? SAY.benchNote : SAY.benchNoteOff;
          anim(note, [{ opacity: 0, transform: 'translateX(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 180, fill: 'none' });
          BENCH.forEach((_, i) => { if (s.querySelector(`.bn[data-i="${i}"]`).classList.contains('is-stop')) runBench(i, s); });
        },
      });
      s.querySelector('.sh-x').addEventListener('click', () => closeSheet());
      s.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchTab(s, t.dataset.tab)));
      s.querySelector('.iv-list').addEventListener('click', (e) => {
        const b = e.target.closest('.iv-buy');
        if (b) buy(s, b.closest('.iv'), b);
      });
    },
  });
  // 入る：見出しの活字が落ち、作業台が順に差し込まれる
  slamType(s.querySelector('.sh-hl'), { gap: 70, se: true });
  s.querySelectorAll('.bn, .ctl').forEach((e, i) => anim(e, [{ transform: 'translateX(46px) skewX(-6deg)', opacity: 0 }, { transform: 'translateX(-4px) skewX(0)', opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: 60 + i * 70, easing: EASE.out, fill: 'backwards' }));
  s.querySelectorAll('.bn-hero').forEach((e, i) => anim(e, [{ transform: 'translate(-30px,20px) rotate(-14deg) scale(0.6)', opacity: 0 }, { transform: 'translate(3px,-6px) rotate(3deg) scale(1.05)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 280, delay: 170 + i * 70, easing: EASE.out, fill: 'backwards', deco: true }));
  BENCH.forEach((_, i) => setTimeout(() => sheet === s && runBench(i, s), 200 + i * 380));
  G.visitedWs = true;
  ui.busy = false;
}
let tabBusy = false;
async function switchTab(s, name) {
  const cur = s.querySelector('.tab.is-on').dataset.tab;
  if (cur === name || tabBusy) return;
  tabBusy = true;
  audio.se('tab');
  const dir = name === 'invest' ? 1 : -1;
  s.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-on', on);
    t.setAttribute('aria-selected', String(on));
    if (on) anim(t, [{ transform: 'translateY(6px)' }, { transform: 'translateY(-3px)', offset: 0.6 }, { transform: 'none' }], { duration: 220, easing: EASE.out, fill: 'none' });
  });
  const out = s.querySelector(`.pane[data-pane="${cur}"]`);
  const inn = s.querySelector(`.pane[data-pane="${name}"]`);
  // 横に払う：朱の帯が斜めに走り、古い面が流れて、新しい面が反対から入る（520ms）
  const body = s.querySelector('.sh-body');
  const band = h(`<i class="tab-band"></i>`);
  body.append(band);
  anim(band, [{ transform: `translateX(${dir * 340}%) skewX(-12deg)` }, { transform: `translateX(${-dir * 340}%) skewX(-12deg)` }], { duration: 520, easing: EASE.inout, deco: true });
  await done(anim(out, [{ transform: 'none', opacity: 1 }, { transform: `translateX(${-dir * 28}%) skewX(${dir * 4}deg)`, opacity: 0 }], { duration: 220, easing: EASE.in, fill: 'none' }));
  out.hidden = true;
  inn.hidden = false;
  body.scrollTop = 0;
  if (name === 'invest') inn.querySelector('.iv-list').innerHTML = investHtml();
  const kids = name === 'invest' ? inn.querySelectorAll('.iv') : inn.querySelectorAll('.bn, .ctl');
  kids.forEach((e, i) => anim(e, [{ transform: `translateX(${dir * 60}px) skewX(${-dir * 5}deg)`, opacity: 0 }, { transform: `translateX(${-dir * 4}px)`, opacity: 1, offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 260, delay: 40 + i * 55, easing: EASE.out, fill: 'backwards' }));
  await wait(reduced() ? 60 : 300);
  band.remove();
  tabBusy = false;
}
let buying = false;
async function buy(s, card, btn) {
  if (buying) return;
  const v = INVEST.find((x) => x.id === card.dataset.id);
  const talk = s.querySelector('.iv-talk');
  const say = talk.querySelector('.say');
  const short = v.cost - G.funds;
  if (short > 0) {
    // 足りない：責めない。あとどれだけかを、やわらかく伝える
    audio.se('deny');
    anim(btn, [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out', fill: 'none' });
    const g = card.querySelector('.iv-gauge');
    g.hidden = false;
    const k = clamp(G.funds / v.cost, 0.02, 1);
    g.querySelector('span').textContent = `いまの資金で ${Math.round(k * 100)}%`;
    anim(g.querySelector('i'), [{ transform: 'scaleX(0)' }, { transform: `scaleX(${k})` }], { duration: 420, easing: EASE.out });
    talk.hidden = false;
    typeText(say, SAY.investNo.replace('{n}', fmt(short)), { who: 0 });
    anim(talk, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, fill: 'none' });
    return;
  }
  buying = true;
  ping(btn);
  vibrate(12);
  audio.se('decide');
  await spend(v.cost, btn);
  G.bought = true;
  audio.se('buy');
  audio.duck(0.5, 0.3, 0.5);
  shake(2, 180);
  vibrate([10, 40, 16]);
  const r = card.getBoundingClientRect();
  burst(r.left + r.width * 0.7, r.top + r.height / 2, { count: 34, speed: 620, size: 8 });
  const stamp = card.querySelector('.iv-stamp');
  stamp.style.opacity = '1';
  await done(slam(stamp, { from: 3, rot: -24, dur: 220 }));
  await wait(reduced() ? 100 : 420);
  card.classList.add('is-owned');
  card.querySelector('.iv-act').innerHTML = `<div class="iv-owned"><i class="check"></i><b>${HL.owned}</b></div>`;
  slam(card.querySelector('.iv-owned'), { from: 1.6, rot: 6, dur: 180 });
  anim(stamp, [{ opacity: 1 }, { opacity: 0 }], { duration: 260, delay: 200 });
  talk.hidden = false;
  typeText(say, SAY.investOk, { who: 0 });
  anim(talk, [{ transform: 'translateY(16px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 200, fill: 'none' });
  news(NEWS.bought, { quiet: true });
  if (audio.layerCount < 4) audio.layers(4);
  // ほかの買えなくなった物を描き直す（資金が減った）
  s.querySelectorAll('.iv:not(.is-owned)').forEach((c) => {
    const x = INVEST.find((y) => y.id === c.dataset.id);
    const b = c.querySelector('.iv-buy');
    if (b && G.funds < x.cost) {
      b.classList.remove('btn--gold');
      b.classList.add('btn--flat');
      b.querySelector('.iv-buy-l').textContent = 'まだ';
    }
  });
  buying = false;
}

// ---------------------------------------------------------------- 設定
export async function openSettings() {
  if (ui.busy || ui.open === 'set') return;
  ui.busy = true;
  if (bub) await closeBubble({ silent: true });
  hold(true);
  lockMap(true);
  cue('');
  audio.se('open');
  let s;
  await slash({
    from: 'down', colors: ['gold', 'ink'], label: HL.settings,
    mid: () => {
      chrome('sheet');
      dim(2);
      ui.open = 'set';
      s = mountSheet('set', '設定', `
        <header class="sh-head sh-head--set">
          <div class="sh-title"><span class="kick"><b>システム</b></span><h2 class="sh-hl reg">${HL.settings}</h2></div>
          <button class="xbtn sh-x" type="button" data-press data-se="none" aria-label="設定を閉じる"><i class="xmark"></i></button>
        </header>
        <div class="sh-body set">
          <div class="set-g"><h3 class="set-h"><i class="dia"></i>音</h3>
            <div class="set-row"><label>BGM の音量</label><div class="set-sl" id="set-bgm"></div><b class="set-v dg" id="v-bgm"></b></div>
            <div class="set-row"><label>SE の音量</label><div class="set-sl" id="set-se"></div><b class="set-v dg" id="v-se"></b></div>
            <div class="set-row set-row--tg"><label>消音</label><button id="set-mute"></button></div>
            <div class="set-row set-row--sg"><label>BGM の層</label><div id="set-layers"></div></div>
            <p class="set-note say">${SAY.layerNote}</p>
          </div>
          <div class="set-g"><h3 class="set-h"><i class="dia"></i>見やすさ</h3>
            <div class="set-row set-row--sg"><label>文字の大きさ</label><div id="set-fs"></div></div>
            <div class="set-row set-row--tg"><label>動きを減らす</label><button id="set-rm"></button></div>
            <p class="set-note say">${SAY.rmNote}</p>
            <div class="set-row set-row--tg"><label>色覚に配慮した色</label><button id="set-cb"></button></div>
            <p class="set-note say">${SAY.cbNote}</p>
            <div class="set-swatch" aria-hidden="true"><i class="sw sw--up"><span class="tri"></span>増えた</i><i class="sw sw--dn"><span class="tri tri--dn"></span>減った</i><i class="sw sw--main">主の操作</i></div>
            <div class="set-row set-row--sg"><label>吹き出しの字の速さ</label><div id="set-talk"></div></div>
          </div>
          <p class="set-foot say">${SAY.setNote}<br>${SAY.credit}</p>
        </div>`);
      const vb = s.querySelector('#v-bgm'), vs = s.querySelector('#v-se');
      const pct = (v) => String(Math.round(v * 100));
      vb.textContent = pct(settings.bgm);
      vs.textContent = pct(settings.se);
      slider(s.querySelector('#set-bgm'), { min: 0, max: 100, step: 5, value: Math.round(settings.bgm * 100), label: 'BGM の音量', se: false, onInput: (v) => { settings.bgm = v / 100; vb.textContent = v; applySettings(); } });
      slider(s.querySelector('#set-se'), { min: 0, max: 100, step: 5, value: Math.round(settings.se * 100), label: 'SE の音量', se: false, onInput: (v, i) => { settings.se = v / 100; vs.textContent = v; applySettings(); audio.se('coin', Math.round(i / 2)); } });
      toggle(s.querySelector('#set-mute'), { on: settings.mute, label: '消音', onChange: (on) => { settings.mute = on; applySettings(); } });
      segmented(s.querySelector('#set-layers'), { label: 'BGM の層', value: audio.layerCount, options: [1, 2, 3, 4, 5].map((n) => ({ label: String(n), value: n })), onChange: (v) => audio.layers(v) });
      toggle(s.querySelector('#set-rm'), { on: settings.reduce, label: '動きを減らす', onChange: (on) => { settings.reduce = on; applySettings(); } });
      toggle(s.querySelector('#set-cb'), { on: settings.cb, label: '色覚に配慮した色', onChange: (on) => { settings.cb = on; applySettings(); clearCutCache(); makeTextures(); } });
      segmented(s.querySelector('#set-fs'), { label: '文字の大きさ', value: settings.fs, options: [{ label: '100%', value: 1 }, { label: '115%', value: 1.15 }, { label: '130%', value: 1.3 }], onChange: (v) => { settings.fs = v; applySettings(); bus.emit('resize'); } });
      segmented(s.querySelector('#set-talk'), { label: '吹き出しの字の速さ', value: settings.talk, options: [{ label: 'ゆっくり', value: 0.6 }, { label: 'ふつう', value: 1 }, { label: 'はやい', value: 1.8 }], onChange: (v) => { settings.talk = v; applySettings(); } });
      s.querySelector('.sh-x').addEventListener('click', () => closeSheet());
    },
  });
  slamType(s.querySelector('.sh-hl'), { gap: 70 });
  s.querySelectorAll('.set-g').forEach((e, i) => anim(e, [{ transform: 'translateY(30px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, delay: 60 + i * 80, fill: 'backwards' }));
  ui.busy = false;
}

// ---------------------------------------------------------------- 目次
let toc = null;
export function toggleToc(onPick, anchor = $('#toc-key')) {
  if (toc) return closeToc();
  audio.se('open');
  const items = [['title', 'はじまり'], ['map', '地図と常設の UI'], ['bubble', '建物の吹き出し'], ['ws', '工房の画面'], ['prop', '部長の提案と承認'], ['report', '月次報告'], ['conquer', '制覇'], ['set', '設定']];
  const r = anchor.getBoundingClientRect();
  toc = h(`
    <div class="toc" role="dialog" aria-label="目次">
      <button class="toc-back" type="button" aria-label="目次を閉じる"></button>
      <div class="toc-box" style="top:${Math.round(r.bottom + 10)}px;right:${Math.max(8, Math.round(cam.vw - r.right))}px">
        <h2 class="toc-h">${HL.toc}</h2>
        <ol class="toc-list">${items.map(([k, t], i) => `<li><button type="button" data-press data-k="${k}"><b class="dg">${i + 1}</b><span>${t}</span></button></li>`).join('')}</ol>
        <button class="btn btn--gold toc-again" type="button" data-press data-k="title"><span class="btn-f">${HL.againSee}</span></button>
      </div>
    </div>`);
  $('#layer-top').append(toc);
  const box = toc.querySelector('.toc-box');
  anim(box, [{ transform: 'scale(0.5) rotate(6deg)', opacity: 0 }, { transform: 'scale(1.03) rotate(-1deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: EASE.out });
  box.querySelectorAll('li').forEach((e, i) => anim(e, [{ transform: 'translateX(24px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 160, delay: 40 + i * 24, fill: 'backwards' }));
  toc.querySelector('.toc-back').addEventListener('click', closeToc);
  toc.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    const k = b.dataset.k;
    closeToc(true);
    onPick(k);
  });
}
export function closeToc(quiet = false) {
  if (!toc) return;
  const t = toc;
  toc = null;
  if (!quiet) audio.se('close');
  done(anim(t.querySelector('.toc-box'), [{ transform: 'none', opacity: 1 }, { transform: 'scale(0.7) rotate(4deg)', opacity: 0 }], { duration: 130, easing: EASE.in })).then(() => t.remove());
}
/** Esc で、いちばん手前の物を閉じる */
export function escape() {
  if (ui.busy) return;
  if (toc) closeToc();
  else if (bub) closeBubble();
  else if (sheet) closeSheet();
}
/** 場面を飛ぶ前に、開いている物をすぐ片付ける */
export async function clearAll() {
  closeToc(true);
  if (bub) await closeBubble({ silent: true });
  if (sheet) await closeSheet({ silent: true });
  ui.busy = false;
}
