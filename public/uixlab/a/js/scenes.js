// 場面：吹き出し・工房の札・部長の提案（検印）・月次報告（帳面）・制覇・設定・目次
import { $, $$, h, wait, calm, clamp, fmt, prefs, applyPrefs, buzz, Roller, typeText, Slider, fx, shake, heroStyle } from './kit.js';
import { audio } from './audio.js';
import { world } from './world.js';
import { hud } from './hud.js';
import { S, PRICE, layersOf } from './state.js';
import { ATLAS, HERO, EXT } from './assets.js';

const app = () => $('#app');
const layer = () => $('#layer');
const veil = () => $('#veil');
const hero = (id, scale = 1, cls = '') => `<i class="hero ${cls}" style="${heroStyle(HERO[id], ATLAS.hero, scale)}"></i>`;
const ext = (id) => `<i class="ext" style="${heroStyle(EXT[id], ATLAS.ext)}"></i>`;
const gold = (label, cls = '', attr = '') => `<button class="btn sh ${cls}" ${attr}><span class="face nt gold">${label}<i class="sheen"></i></span></button>`;
const sub = (label, cls = '', attr = '') => `<button class="btn sub sh ${cls}" ${attr}><span class="face nt paper">${label}</span></button>`;
const price = (n) => `<span class="price"><i class="coin"></i>${fmt(n)} G</span>`;
const center = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

/** いま開いている場面（1 つだけ） */
let cur = null;
const hooks = {};
export const onScene = (o) => Object.assign(hooks, o);
export const isOpen = () => !!cur;
function setHeld(on) {
  S.held = on;
  app().classList.toggle('held', on);
}
function stage({ sunk = false, dock = false, soft = false, on = true }) {
  veil().classList.toggle('on', on);
  veil().classList.toggle('soft', on && soft);
  app().classList.toggle('sunk', on && sunk);
  app().classList.toggle('sheeted', on && dock);
}
async function leave(el, ms = 200) {
  el.classList.remove('in');
  el.classList.add('out');
  await wait(calm() ? 0 : ms);
  el.remove();
}
export async function closeAll(instant = false) {
  if (!cur) return;
  const c = cur;
  cur = null;
  await c.close(instant);
}
function done(name) {
  stage({ on: false });
  setHeld(false);
  hooks.closed?.(name);
}
// Esc で閉じる
addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur?.esc) cur.esc(); });

// ================================================================ 吹き出し
const LINES = [
  'おう、若旦那。',
  'センスの注文が増えてるぜ。作業台は三つとも回してる。',
  '治具をそろえりゃ、もっと速く作れる。設備投資の頁をのぞいてくれ。売れた分は、ちゃんと帳面に付けてあるからな。',
];
export async function openBalloon() {
  if (cur) return;
  const me = (cur = { name: 'balloon' });
  setHeld(true);
  world.hint(false);
  audio.se('whoosh');
  world.focus(640);
  stage({ soft: true });
  await wait(calm() ? 0 : 430);
  if (cur !== me) return;
  const an = world.anchor();
  const el = h(`<div class="bal in" role="dialog" aria-label="工房の職人 平賀源内">
    <div class="bal-tail"></div>
    <div class="bal-sh nt"></div>
    <div class="bal-bg nt face paper"></div>
    <div class="face-out">${hero('gennai', 2)}</div>
    <div class="bal-in">
      <div class="bal-head"><div class="who"><span class="role">工房（本店）の職人</span><span class="name">平賀源内</span></div></div>
      <button class="xbtn x" aria-label="閉じる"><i></i></button>
      <div class="say" data-press tabindex="0" role="button" aria-label="つづきを聞く"></div>
      <div class="pips">${LINES.map(() => '<i></i>').join('')}</div>
      <div class="bal-acts">
        ${gold('工房を開く', 'b-open')}
        ${sub(`町工場にする（1×2）${price(PRICE.factory)}`, 'b-up')}
      </div>
    </div>
  </div>`);
  el.style.top = `${Math.round(an.y + 26)}px`;
  layer().appendChild(el);
  el.style.setProperty('--tx', `${clamp(an.x - el.offsetLeft, 50, el.offsetWidth - 50)}px`);
  audio.se('open');
  const sayEl = $('.say', el);
  const face = $('.face-out', el);
  const pips = $$('.pips i', el);
  let li = 0;
  let tw = null;
  const say = (text, k) => {
    const h0 = el.offsetHeight;
    tw = typeText(sayEl, text, { voice: 0, onTalk: (on) => face.classList.toggle('talk', on) });
    pips.forEach((p, n) => p.classList.toggle('on', n === k));
    const h1 = el.offsetHeight;
    // セリフの量で枠が伸び縮みする（枠は拡大縮小、下の部品はずれて付いてくる）
    if (h0 && h0 !== h1 && !calm()) {
      const o = { duration: 300, easing: 'cubic-bezier(0.3, 1.5, 0.5, 1)' };
      for (const b of [$('.bal-bg', el), $('.bal-sh', el)]) b.animate([{ transform: `${b.classList.contains('bal-sh') ? 'translate(4px,5px) ' : ''}scaleY(${h0 / h1})` }, { transform: b.classList.contains('bal-sh') ? 'translate(4px,5px)' : 'none' }], o);
      for (const b of [$('.pips', el), $('.bal-acts', el)]) b.animate([{ transform: `translateY(${h0 - h1}px)` }, { transform: 'none' }], o);
    }
  };
  const next = () => {
    if (!tw.done) return tw.finish();
    li = (li + 1) % LINES.length;
    say(LINES[li], li);
  };
  sayEl.addEventListener('click', next);
  sayEl.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && next());
  setTimeout(() => cur === me && say(LINES[0], 0), calm() ? 0 : 240);
  const close = async (keep) => {
    tw?.finish();
    audio.se('close');
    if (!keep) world.base(560);
    await leave(el, 170);
    if (!keep) done('balloon');
  };
  me.close = () => close(false);
  me.esc = () => closeAll();
  $('.x', el).addEventListener('click', () => closeAll());
  $('.b-open', el).addEventListener('click', async () => {
    if (cur !== me) return;
    cur = null;
    audio.se('decide');
    await close(true);
    openWorkshop(true);
  });
  $('.b-up', el).addEventListener('click', () => {
    // 足りないときは、職人がやわらかく断る（責めない）
    const lack = PRICE.factory - S.funds;
    audio.se(lack > 0 ? 'deny' : 'soft');
    li = -1;
    say(lack > 0 ? `町工場かい。あと ${fmt(lack)} G だな。急ぐこたぁねえ、いまは台を回して蓄えよう。` : '蓄えは足りてるな。建て替えの図面は、次の版で見せるぜ。', -1);
  });
}

// ================================================================ 工房の札
export async function openWorkshop(fromBalloon = false) {
  if (cur) return;
  const me = (cur = { name: 'workshop' });
  setHeld(true);
  world.hint(false);
  if (!fromBalloon) world.focus(560);
  stage({ sunk: true, dock: true });
  const el = h(`<section class="sheet in" role="dialog" aria-label="工房（本店）">
    <i class="ply p2"></i><i class="ply p1"></i>
    <div class="sheet-paper">
      <div class="bgf nt n12 face paper"></div>
      <div class="sheet-head" style="min-height:0;padding:12px 0 0 0"></div>
      <div class="ws-win">
        <div class="bg"></div><div class="shade"></div>
        <div class="big" aria-hidden="true">工房</div>
        <div class="crew">${hero('gennai')}${hero('michel')}${hero('wright')}</div>
        <button class="xbtn x" aria-label="閉じる" style="position:absolute;right:0;top:0;color:var(--kinari);background:var(--sumi)"><i></i></button>
      </div>
      <div class="tabs" role="tablist">
        <button class="tab on" role="tab" aria-selected="true" data-se="none">作業台<span class="n">3</span></button>
        <button class="tab" role="tab" aria-selected="false" data-se="none">設備投資</button>
      </div>
      <div class="pages">
        <div class="page on" role="tabpanel"><div class="scroll">
          <div class="made"><span><i class="dia"></i>3 台が動いています</span><span class="sp"></span>今月の製造<span class="num" id="v-made"></span></div>
          <div id="benches"></div>
          <div class="order">
            <h3><b id="ord-t">作業台 1</b>の指図</h3>
            <div class="row qty"><span class="lb">作る数</span><span class="val"><span id="v-qty"></span><span class="jp">個</span></span><div id="sld-qty"></div></div>
            <div class="row"><span class="lb" style="flex:1;width:auto">自動製造<span class="hint" id="auto-note" style="display:block;margin:0;font-weight:400"></span></span><button class="tgl" id="tgl-auto" role="switch" aria-checked="true" aria-label="自動製造" data-se="none"><span class="trk"><span>入</span><span>切</span></span><span class="nob"></span></button></div>
          </div>
          <div class="crates"><h3><b>倉庫の荷札</b>できた分は、ここから店へ</h3>${S.benches.map((b, k) => `<div class="crate"><span class="cn">LOT ${String(k + 1).padStart(2, '0')}</span><span class="nm">${b.itemName}</span><span class="qv"><span></span></span></div>`).join('')}</div>
        </div></div>
        <div class="page" role="tabpanel"><div class="scroll">
          <div class="inv sh" id="inv-jig"><div class="face nt paper">
            <div class="hd"><b>治具をそろえる</b><span class="no">No. 014</span></div>
            <p class="ef">3 台とも、作る速さが <span class="up"><i class="tri"></i>25% 上がる</span></p>
            <div class="ft">${price(PRICE.jig)}<span class="sp"></span>${gold('買う', 'b-buy')}</div>
          </div><span class="seal small">済</span></div>
          <div class="inv sh" id="inv-lathe"><div class="face nt paper">
            <div class="hd"><b>蒸気の旋盤</b><span class="no">No. 015</span></div>
            <p class="ef">1 回に作れる数の上限が <span class="up"><i class="tri"></i>40 個ふえる</span></p>
            <div class="ft">${price(PRICE.lathe)}<span class="sp"></span>${sub('買う', 'b-lathe')}</div>
            <div class="lack"><span id="lack-tx"></span><span class="bar"><span class="fill" id="lack-fill"></span></span></div>
          </div></div>
          <div class="note-slip sh n4" id="lathe-note"><div class="face nt n4 paper">${hero('gennai')}<span id="lathe-tx"></span></div></div>
          <div class="inv sh owned"><div class="face nt paper">
            <div class="hd"><b>帳場の灯り</b><span class="no">No. 009</span></div>
            <p class="ef">日が落ちても作業ができる</p>
            <div class="ft"><span class="sumi-mk">導入済み（先代から）</span></div>
          </div></div>
        </div></div>
      </div>
    </div>
  </section>`);
  layer().appendChild(el);
  audio.se('open');

  // ---- 作業台
  const host = $('#benches', el);
  const made = new Roller($('#v-made', el), S.made, { unit: '個' });
  const rows = S.benches.map((b, k) => {
    const r = h(`<button class="bench sh n4 ${b.run ? 'busy' : ''} ${k === S.sel ? 'sel' : ''}" data-se="none" aria-pressed="${k === S.sel}">
      <span class="face nt paper">
        <span class="who2">${hero(b.hero)}</span>
        <span class="mid">
          <span class="t1"><b>作業台 ${k + 1}</b>${b.name}</span>
          <span class="t2">${b.itemName}<span class="q"></span><span class="st"></span></span>
          <span class="bar"><span class="fill"></span></span>
        </span>
        <span class="item">${ext(b.item)}</span>
      </span>
      <span class="done-mk">済</span><span class="plus"></span>
    </button>`);
    host.appendChild(r);
    const q = new Roller($('.q', r), b.qty, { unit: '個' });
    return { r, fill: $('.fill', r), q, st: $('.st', r), item: $('.item', r), bar: $('.bar', r), mk: $('.done-mk', r), plus: $('.plus', r) };
  });
  const crates = $$('.crate', el).map((c, k) => ({ c, q: new Roller($('.qv span', c), S.benches[k].stock, { unit: '個' }) }));
  const status = (k) => { const b = S.benches[k]; rows[k].st.textContent = b.auto ? '自動' : b.run ? '1 回だけ' : '止まっています'; rows[k].r.classList.toggle('busy', b.run); };
  S.benches.forEach((_, k) => status(k));
  const complete = (k) => {
    const b = S.benches[k];
    const x = rows[k];
    S.made += b.qty;
    made.set(S.made, { dur: 600 });
    b.stock += b.qty;
    crates[k].q.set(b.stock, { dur: 600 });
    retrigger(crates[k].c, 'bump');
    retrigger(x.bar, 'flash');
    retrigger(x.item, 'pop');
    retrigger(x.mk, 'hit');
    x.plus.textContent = `+${b.qty} 個`;
    if (!calm()) x.plus.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.7)' }, { opacity: 1, transform: 'translateY(-4px) scale(1.1)', offset: 0.2 }, { opacity: 1, transform: 'translateY(-8px)', offset: 0.75 }, { opacity: 0, transform: 'translateY(-18px)' }], { duration: 1200 });
    audio.se('complete');
    if (tab === 0) fx.spark(...center(x.item), 8);
    status(k);
  };
  let alive = true;
  let last = performance.now();
  const loop = (t) => {
    if (!alive) return;
    const dt = Math.min(120, t - last) / 1000;
    last = t;
    S.benches.forEach((b, k) => {
      if (!b.run) return;
      b.p += dt / (b.dur / (S.bought ? 1.25 : 1));
      if (b.p >= 1) {
        b.p = b.auto ? b.p - 1 : 0;
        if (!b.auto) b.run = false;
        complete(k);
      }
      rows[k].fill.style.transform = `scaleX(${b.p.toFixed(4)})`;
    });
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // ---- 指図（作る数・自動製造）
  const qty = new Roller($('#v-qty', el), S.benches[S.sel].qty);
  const tgl = $('#tgl-auto', el);
  const sld = new Slider($('#sld-qty', el), {
    min: 10, max: 120, step: 10, value: S.benches[S.sel].qty, label: '作る数',
    onInput: (v) => { S.benches[S.sel].qty = v; qty.set(v, { dur: 220 }); rows[S.sel].q.set(v, { dur: 220 }); },
  });
  const paintOrder = () => {
    const b = S.benches[S.sel];
    $('#ord-t', el).textContent = `作業台 ${S.sel + 1}`;
    sld.set(b.qty);
    qty.set(b.qty, { dur: 300 });
    tgl.setAttribute('aria-checked', b.auto);
    $('#auto-note', el).textContent = b.auto ? '素材があるかぎり、作りつづけます' : 'いまの 1 回で止まります';
  };
  paintOrder();
  rows.forEach((x, k) => x.r.addEventListener('click', () => {
    if (S.sel === k) return;
    S.sel = k;
    rows.forEach((y, n) => { y.r.classList.toggle('sel', n === k); y.r.setAttribute('aria-pressed', n === k); });
    audio.se('tab', { dir: 1 });
    paintOrder();
  }));
  tgl.addEventListener('click', () => {
    const b = S.benches[S.sel];
    b.auto = !b.auto;
    if (b.auto) b.run = true;
    audio.se('toggle', { on: b.auto });
    buzz(8);
    paintOrder();
    status(S.sel);
  });

  // ---- タブ（横に送る）
  let tab = 0;
  let turning = false;
  const tabs = $$('.tab', el);
  const pages = $$('.page', el);
  const go = async (n) => {
    if (n === tab || turning) return;
    turning = true;
    const dir = n > tab ? 1 : -1;
    audio.se('tab', { dir });
    tabs.forEach((t, k) => { t.classList.toggle('on', k === n); t.setAttribute('aria-selected', k === n); });
    const a = pages[tab];
    const b = pages[n];
    b.classList.add('on');
    if (!calm()) {
      const o = { duration: 560, fill: 'both' };
      const x = a.animate([{ transform: 'none', opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.7, 0.4)' }, { transform: `translateX(${-dir * 60}%) rotate(${-dir * 1.5}deg)`, opacity: 0.2, offset: 0.7 }, { transform: `translateX(${-dir * 70}%) rotate(${-dir * 1.5}deg)`, opacity: 0 }], o);
      const y = b.animate([{ transform: `translateX(${dir * 104}%) rotate(${dir * 2.4}deg)`, easing: 'cubic-bezier(0.55, 0, 0.3, 1)' }, { transform: `translateX(${-dir * 1.6}%) rotate(${-dir * 0.4}deg)`, offset: 0.82, easing: 'ease-out' }, { transform: 'none' }], o);
      await y.finished;
      x.cancel();
      y.cancel();
    }
    a.classList.remove('on');
    tab = n;
    turning = false;
  };
  tabs.forEach((t, k) => t.addEventListener('click', () => go(k)));

  // ---- 設備投資
  const lack = () => {
    const d = PRICE.lathe - S.funds;
    $('#lack-tx', el).textContent = d > 0 ? `いまの資金で ${Math.floor((S.funds / PRICE.lathe) * 100)}%。あと ${fmt(d)} G` : '買えます';
    $('#lack-fill', el).style.transform = `scaleX(${clamp(S.funds / PRICE.lathe, 0, 1)})`;
  };
  lack();
  const jig = $('#inv-jig', el);
  const own = () => {
    jig.classList.add('owned');
    $('.ft', jig).innerHTML = '<span class="sumi-mk">導入済み</span>';
    $('.seal', jig).classList.add('hit');
  };
  if (S.bought) own();
  $('.b-buy', el)?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled || S.funds < PRICE.jig) return;
    btn.disabled = true;
    audio.se('decide');
    // 金貨が資金から注文書へ飛び、資金の桁が転がって減る
    const to = center($('.price', jig));
    fx.coins(hud.rectOf('#st-funds'), to, 8, (k) => audio.se('tick', { n: 7 - k, vel: 0.26, gap: 0.01 }));
    hud.funds(-PRICE.jig);
    audio.se('pay', { delay: 0.05 });
    await wait(calm() ? 0 : 620);
    S.bought = true;
    own();
    audio.se('stampSmall');
    buzz(12);
    fx.dust(...center($('.seal', jig)), '#d8432a', 8, 40);
    lack();
    hooks.bought?.();
    await wait(500);
    if (cur === me) hud.slip('治具がそろい、作業台が速くなりました');
  });
  $('.b-lathe', el).addEventListener('click', () => {
    // 足りない：責めずに、あといくらかを伝える
    const d = PRICE.lathe - S.funds;
    lack();
    retrigger($('#inv-lathe', el), 'nudge');
    audio.se('deny');
    $('#lathe-tx', el).textContent = d > 0 ? `あと ${fmt(d)} G だ。売上が貯まったら、また声をかけてくれ。` : '図面は次の版で見せるぜ。';
    const n = $('#lathe-note', el);
    n.classList.add('on');
    clearTimeout(me.nt);
    me.nt = setTimeout(() => n.classList.remove('on'), 4200);
  });

  const close = async () => {
    alive = false;
    audio.se('close');
    world.base(560);
    stage({ on: false });
    await leave(el, 200);
    S.visited = true;
    done('workshop');
  };
  me.close = close;
  me.esc = () => closeAll();
  me.goTab = go;
  $('.x', el).addEventListener('click', () => closeAll());
}
export const workshopTab = (n) => cur?.goTab?.(n);

// ================================================================ 部長の提案 → 検印
export async function openProposal() {
  if (cur) return;
  const me = (cur = { name: 'proposal' });
  setHeld(true);
  stage({ sunk: true });
  const el = h(`<div class="prop in" role="dialog" aria-label="貿易部長の提案">
    <div class="prop-w">
      <i class="ply"></i><div class="sh0 nt n12"></div><div class="bgf nt n12 face paper"></div>
      <div class="face-out">${hero('gama', 2)}</div>
      <div class="prop-in">
        <span class="doc">稟議 第 0524 号</span>
        <div class="prop-top"><div class="who"><span class="role">貿易部長</span><span class="name">ヴァスコ・ダ・ガマ</span></div></div>
        <h2>センスを輸入に足す</h2>
        <div class="say" data-press></div>
        <div class="gainbox">
          <div><div class="k">この町の売上（見込み）</div><div class="v"><i class="tri"></i><span class="num" id="pv"></span><span class="jp">／月</span></div></div>
          <div class="duo" aria-hidden="true"><div class="c"><i style="--h:0.2"></i>いま</div><div class="c now"><i style="--h:0.2"></i>承認後</div></div>
        </div>
        <div class="stamps" aria-hidden="true">
          <div class="bx"><span class="cap">起案</span><span class="mini">ガマ</span></div>
          <div class="bx"><span class="cap">経理</span><span class="mini b">一葉</span></div>
          <div class="bx target"><span class="cap">承認</span><span class="ph">検印</span><i class="bleed"></i><span class="seal imp">承認</span></div>
        </div>
        <div class="prop-acts">
          <div class="hint"><b>検印を押して、承認する</b>押すと印が上がり、離すと叩きます。<br><button class="btn flat b-later" style="margin-left:-18px"><span class="face">あとで決める</span></button></div>
          <button class="sealbtn" aria-label="承認する（検印を押す）" data-se="none"><span class="pad"></span><span class="sd"></span><span class="st">承認</span></button>
        </div>
      </div>
      <div class="approved-note">承認しました</div>
    </div>
  </div>`);
  layer().appendChild(el);
  audio.se('open');
  const pv = new Roller($('#pv', el), 0, { sign: true, unit: 'G' });
  const face = $('.face-out', el);
  const tw = typeText($('.say', el), 'センスを輸入に足すと、この町の売上 月 +12,400 G。', {
    voice: 1, delay: 380,
    onTalk: (on) => face.classList.toggle('talk', on),
    onDone: () => {
      pv.set(12400, { dur: 700 });
      audio.se('income');
      $$('.duo .c i', el).forEach((b, k) => b.style.setProperty('--h', k ? 1 : 0.86));
    },
  });
  $('.say', el).addEventListener('click', () => tw.finish());

  const btn = $('.sealbtn', el);
  const st = $('.st', btn);
  let busy = false;
  let lifted = false;
  const lift = () => {
    if (busy || lifted) return;
    lifted = true;
    btn.classList.add('lift');
    audio.se('lift');
  };
  const drop = () => { lifted = false; btn.classList.remove('lift'); };
  const slam = async () => {
    if (busy) return;
    busy = true;
    tw.finish();
    const imp = $('.imp', el);
    const base = btn.getBoundingClientRect();
    const from = [base.left + 14 + 38, base.top + 16 + 38];
    const to = center(imp);
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const now = getComputedStyle(st).transform;
    btn.classList.add('gone');
    if (!calm()) {
      // 0.18 秒で叩きつける
      await st.animate(
        [
          { transform: now === 'none' ? 'translate(-3px,-12px) scale(1.1) rotate(-4deg)' : now, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 34}px) scale(1.16) rotate(-11deg)`, offset: 0.45, easing: 'cubic-bezier(0.7, 0, 1, 0.5)' },
          { transform: `translate(${dx}px, ${dy}px) scale(0.71) rotate(-7deg)` },
        ],
        { duration: 180, fill: 'forwards' },
      ).finished;
    }
    // 当たり：音・揺れ・にじみ・しぶき・振動。紙が一瞬へこむ
    imp.classList.add('on');
    $('.bleed', el).classList.add('go');
    $('.ph', el).style.visibility = 'hidden';
    audio.duck(0.5, 0.7);
    audio.se('stamp');
    buzz(24);
    shake(app(), 2.5, 190);
    fx.ink(to[0], to[1], 1);
    if (!calm()) {
      $('.prop-in', el).animate([{ transform: 'scale(0.982)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.3, 1.6, 0.5, 1)' });
      st.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.71) rotate(-7deg)`, opacity: 1 }, { transform: `translate(${dx}px, ${dy}px) scale(0.71) rotate(-7deg)`, opacity: 1, offset: 0.3 }, { transform: `translate(${dx + 10}px, ${dy - 46}px) scale(0.86) rotate(-12deg)`, opacity: 0 }], { duration: 300, fill: 'forwards' });
    } else st.style.opacity = 0;
    $('.approved-note', el).classList.add('on');
    S.approved = true;
    hud.callout(false);
    await wait(calm() ? 600 : 1150);
    if (cur !== me) return;
    cur = null;
    // 綴じて、片づける
    audio.se('flip');
    el.classList.remove('in');
    el.classList.add('filed');
    stage({ on: false });
    await wait(calm() ? 0 : 400);
    el.remove();
    setHeld(false);
    hooks.approved?.();
    hooks.closed?.('proposal');
  };
  btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture?.(e.pointerId); lift(); });
  btn.addEventListener('pointerup', () => { if (lifted) slam(); });
  btn.addEventListener('pointercancel', drop);
  btn.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); lift(); setTimeout(slam, 140); } });
  const close = async () => {
    tw.finish();
    audio.se('close');
    stage({ on: false });
    await leave(el, 240);
    done('proposal');
  };
  me.close = close;
  me.esc = () => !busy && closeAll();
  $('.b-later', el).addEventListener('click', () => !busy && closeAll());
}

// ================================================================ 月次報告（帳面をめくる）
const KANJI = ['一', '二', '三'];
const RIVAL = 112800;
export async function openReport() {
  if (cur) await closeAll(true);
  const me = (cur = { name: 'report' });
  setHeld(true);
  stage({ sunk: true, dock: true });
  audio.setScene('report');
  const total = Math.round(S.sales / 10) * 10;
  const prev = S.months[S.months.length - 1];
  const wasTop = S.rank === 1;
  const up = total - prev;
  const a1 = Math.round((total * 0.52) / 10) * 10;
  const a2 = Math.round((total * 0.29) / 10) * 10;
  const brk = [['センス', Math.round(a1 / 55), a1], ['見習い筆パレ', Math.round(a2 / 92), a2], ['懐中時計', Math.round((total - a1 - a2) / 132), total - a1 - a2]];
  const leafHd = (k, kicker, title) => `<div class="leaf-hd"><div class="kicker">${kicker}<span class="pg">頁 ${KANJI[k]}／三</span></div><h2>${title}</h2></div>`;
  const foot = (k) => `<div class="leaf-ft">${k ? sub('<i class="tri" style="transform:rotate(-90deg);margin:0"></i>前の頁', 'back b-prev') : sub('飛ばす', 'back b-skip')}${k < 2 ? gold('次の頁<i class="tri" style="transform:rotate(90deg);margin:0"></i>', 'b-next') : gold('帳面を閉じる', 'b-close')}</div>`;
  const el = h(`<section class="rep in" role="dialog" aria-label="月次報告">
    <div class="cover"></div><div class="spine"></div>
    <div class="leaf on" data-k="0"><div class="bgf face paper"></div><div class="leaf-in">
      ${leafHd(0, `月次報告 ・ ${S.year} 年目 ${S.month} 月`, '今月の売上')}
      <div class="leaf-bd" id="pg-sales">
        <div class="ledger" aria-live="polite">
          ${['十万', '万', '千', '百', '十', '一'].map((u) => `<div class="col"><span class="u">${u}</span><span class="dg"><span class="rs">${' \n0\n1\n2\n3\n4\n5\n6\n7\n8\n9'}</span></span></div>`).join('')}
          <span class="unit">G</span>
        </div>
        <div class="under-rule"></div>
        <div class="cmp">
          <div class="delta"><div class="k">先月とくらべて</div><div class="v"><i class="tri"></i>+${fmt(up)}<span class="jp">G</span></div><div class="w">${Math.round((up / prev) * 100)}% ふえました</div></div>
          <div class="duo" aria-hidden="true"><div class="c"><i style="--h:0"></i>先月</div><div class="c now"><i style="--h:0"></i>今月</div></div>
        </div>
        <table class="brk">
          <thead><tr><th>品目</th><th>個数</th><th>売上（G）</th></tr></thead>
          <tbody>${brk.map((r) => `<tr><td>${r[0]}</td><td class="num">${fmt(r[1])}</td><td class="num">${fmt(r[2])}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>合計</td><td class="num">${fmt(brk.reduce((x, r) => x + r[1], 0))}</td><td class="num">${fmt(total)}</td></tr></tfoot>
        </table>
        <div class="memo">${hero('ichiyo')}<div class="tx" id="memo-tx"></div></div>
      </div>
      ${foot(0)}
    </div><i class="shade"></i></div>
    <div class="leaf" data-k="1"><div class="bgf face paper"></div><div class="leaf-in">
      ${leafHd(1, 'この町の商会', '企業ランキング')}
      <div class="leaf-bd">
        <div class="rank" id="rank"></div>
        <div class="crown"><span class="shuban">首位</span><div class="tx"><b></b><span></span></div></div>
      </div>
      ${foot(1)}
    </div><i class="shade"></i></div>
    <div class="leaf" data-k="2"><div class="bgf face paper"></div><div class="leaf-in">
      ${leafHd(2, `${S.month} か月のあゆみ`, '月次売上の推移')}
      <div class="leaf-bd">
        <div class="chart"><div class="ax"></div><div class="plot"></div></div>
        <div class="xl"><span></span><div></div></div>
        <p class="trend-note"></p>
      </div>
      ${foot(2)}
    </div><i class="shade"></i></div>
    <button class="xbtn x b-skip" aria-label="帳面を閉じる"><i></i></button>
  </section>`);
  layer().appendChild(el);
  audio.se('open');
  audio.se('flip', { delay: 0.12 });
  const leaves = $$('.leaf', el);
  let page = 0;
  let turning = false;
  let alive = true;
  const seen = [false, false, false];

  // ---- 頁 1：売上が数え上がる（帳簿の桁）。押すと飛ばせる
  const strips = $$('.ledger .rs', el);
  const cols = $$('.ledger .col', el);
  const showNum = (v) => {
    const s = String(Math.round(v)).padStart(6, ' ');
    for (let i = 0; i < 6; i++) {
      const d = s[i] === ' ' ? -1 : +s[i];
      strips[i].style.transform = `translateY(${(-(d + 1) / 11) * 100}%)`;
      cols[i].classList.toggle('dim', d < 0);
    }
  };
  showNum(0);
  let counting = null;
  const settle = () => {
    if (!counting) return;
    counting = null;
    showNum(total);
    retrigger($('.ledger', el), 'set');
    audio.se('decide');
    audio.se('income', { delay: 0.06 });
    buzz(10);
    fx.spark(...center($('.ledger', el)), 10);
    $('.under-rule', el).classList.add('on');
    setTimeout(() => {
      if (!alive) return;
      $('.delta', el).classList.add('on');
      $$('#pg-sales .duo .c i', el).forEach((b, k) => b.style.setProperty('--h', k ? 1 : prev / total));
      audio.se('tick', { n: 4 });
      $('.brk', el).classList.add('on');
      $('.memo', el).classList.add('on');
      $('#pg-sales .duo', el).classList.add('on');
      typeText($('#memo-tx', el), `先月より ${fmt(up)} G 多い締めです。帳面は、きれいな黒字。`, { voice: 2, delay: 500 });
    }, calm() ? 0 : 260);
  };
  const count = () => {
    if (calm()) { counting = {}; return settle(); }
    const t0 = performance.now();
    const dur = 2000;
    let lastN = -1;
    counting = {};
    const step = (t) => {
      if (!counting || !alive) return;
      const u = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - u, 3);
      showNum(total * e);
      // 金貨の音が、だんだん高くなる
      const n = Math.floor(u * 15);
      if (n !== lastN) { lastN = n; audio.se('coin', { n, vel: 0.2 + u * 0.14, gap: 0.01 }); }
      if (u < 1) requestAnimationFrame(step); else settle();
    };
    requestAnimationFrame(step);
  };
  $('#pg-sales', el).addEventListener('click', () => counting && settle());

  // ---- 頁 2：順位（横の棒）。2 位から 1 位へ
  const firms = [
    { id: 'midori', name: '緑門商会', v: RIVAL },
    { id: 'me', name: 'あなたの商会', v: wasTop ? total : prev, me: true },
    { id: 'konoha', name: '木の葉百貨', v: 74900 },
    { id: 'wakaba', name: '若葉マート', v: 52100 },
  ];
  if (wasTop) firms.sort((a, b) => b.v - a.v);
  const MAXV = Math.max(140000, total * 1.06);
  const rankEl = $('#rank', el);
  const rk = firms.map((f, k) => {
    const r = h(`<div class="rk ${f.me ? 'me' : ''}"><span class="pos"><span class="num pn">${k + 1}</span><small>位</small></span><div><div class="nm">${f.name}<span class="v">${fmt(f.v)} G</span></div><div class="hb"><i></i></div></div></div>`);
    rankEl.appendChild(r);
    return { f, r, bar: $('.hb i', r), v: $('.v', r), pn: $('.pn', r) };
  });
  const rankShow = async () => {
    rk.forEach((x, k) => setTimeout(() => { x.bar.style.transform = `scaleX(${x.f.v / MAXV})`; audio.se('tick', { n: 3 - k, gap: 0.01 }); }, k * 90));
    await wait(calm() ? 0 : 950);
    if (!alive) return;
    const crown = $('.crown', el);
    const mine = rk.find((x) => x.f.me);
    if (wasTop) {
      $('.tx b', crown).textContent = '1 位を守りました';
      $('.tx span', crown).textContent = `2 位の緑門商会との差は ${fmt(total - RIVAL)} G`;
      crown.classList.add('on');
      audio.se('decide');
      return;
    }
    // 売上が伸びて、緑門商会を抜く
    mine.f.v = total;
    mine.bar.style.transform = `scaleX(${total / MAXV})`;
    const t0 = performance.now();
    let n = -1;
    await new Promise((res) => {
      const step = (t) => {
        const u = calm() ? 1 : Math.min(1, (t - t0) / 800);
        mine.v.textContent = `${fmt(prev + (total - prev) * u)} G`;
        const k = Math.floor(u * 8);
        if (k !== n) { n = k; audio.se('coin', { n: 4 + k, vel: 0.2, gap: 0.01 }); }
        if (u < 1 && alive) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    if (!alive) return;
    // 行が入れ替わる
    const a = rk[0].r;
    const b = mine.r;
    const ya = a.getBoundingClientRect().top;
    const yb = b.getBoundingClientRect().top;
    rankEl.insertBefore(b, a);
    rk[0].pn.textContent = '2';
    mine.pn.textContent = '1';
    if (!calm()) {
      const o = { duration: 560, easing: 'cubic-bezier(0.3, 1.4, 0.45, 1)' };
      b.animate([{ transform: `translateY(${yb - ya}px) scale(1)` }, { transform: `translateY(${(yb - ya) * 0.4}px) scale(1.04)`, offset: 0.4 }, { transform: 'none' }], o);
      a.animate([{ transform: `translateY(${ya - yb}px)` }, { transform: 'none' }], o);
    }
    b.classList.add('top1');
    audio.se('rankup');
    audio.duck(0.6, 0.6);
    buzz(16);
    hud.rank(1);
    await wait(calm() ? 0 : 420);
    if (!alive) return;
    fx.spark(...center($('.pos', b)), 12);
    $('.tx b', crown).textContent = '1 位に上がりました';
    $('.tx span', crown).innerHTML = '先月 2 位から、今月 1 位へ（<i class="tri"></i>1 つ上がる）';
    crown.classList.add('on');
    audio.se('stampSmall', { delay: 0.18 });
    hooks.ranked?.();
  };

  // ---- 頁 3：推移（縦の棒が伸びる）
  const series = [...S.months.slice(-4), total];
  const AX = 150000;
  const chartShow = () => {
    const ax = $('.chart .ax', el);
    const plot = $('.chart .plot', el);
    const xl = $('.xl div', el);
    ax.innerHTML = [0, 5, 10, 15].map((m) => `<span style="bottom:${(m * 10000 / AX) * 100}%">${m ? `${m}万` : '0'}</span>`).join('');
    plot.innerHTML = [5, 10].map((m) => `<i class="gl" style="bottom:${(m * 10000 / AX) * 100}%"></i>`).join('') + series.map((v, k) => `<div class="vb ${k === series.length - 1 ? 'now' : ''}" style="--h:${Math.min(1, v / AX)}"><i></i><span class="tv">${k === series.length - 1 ? fmt(v) : `${(v / 10000).toFixed(1)}万`}</span></div>`).join('');
    xl.innerHTML = series.map((_, k) => `<span class="${k === series.length - 1 ? 'now' : ''}">${S.month - series.length + 1 + k}月</span>`).join('');
    $('.trend-note', el).innerHTML = `${series.length} か月つづけて <span class="up"><i class="tri"></i>ふえています</span>。${S.month} 月は、はじめの月の ${(total / series[0]).toFixed(1)} 倍。`;
    $$('.vb', plot).forEach((b, k) => setTimeout(() => {
      if (!alive) return;
      b.classList.add('go');
      if (k === series.length - 1) { audio.se('complete'); setTimeout(() => alive && fx.spark(...center($('.tv', b)), 8), 500); } else audio.se('coin', { n: k * 2, vel: 0.22, gap: 0.01 });
    }, calm() ? 0 : 160 + k * 150));
  };
  const enter = (k) => {
    if (seen[k]) return;
    seen[k] = true;
    if (k === 0) setTimeout(() => alive && count(), calm() ? 0 : 520);
    if (k === 1) rankShow();
    if (k === 2) chartShow();
  };
  enter(0);

  // ---- めくる（0.6 秒。前へ・後ろへで向きが変わる）
  const turn = async (n) => {
    if (turning || n === page || n < 0 || n > 2) return;
    turning = true;
    if (page === 0 && counting) settle();
    const fwd = n > page;
    const a = leaves[page];
    const b = leaves[n];
    audio.se('flip', { back: !fwd });
    if (calm()) {
      a.classList.remove('on');
      b.classList.add('on');
    } else if (fwd) {
      // いまの頁を、綴じ目を軸に斜めにめくり上げる
      b.classList.add('under');
      a.classList.add('turn');
      a.classList.remove('on');
      const sh = $('.shade', b);
      sh.animate([{ opacity: 0.9 }, { opacity: 0.5, offset: 0.6 }, { opacity: 0 }], { duration: 620 });
      $('.shade', a).animate([{ opacity: 0 }, { opacity: 0.6 }], { duration: 620, fill: 'forwards' });
      // 紙が見えているあいだ（0〜90 度）に、時間のほとんどを使う
      await a.animate(
        [
          { transform: 'rotate3d(0.16, 1, 0, 0deg)', opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.8, 0.6)' },
          { transform: 'rotate3d(0.16, 1, 0, -11deg)', opacity: 1, offset: 0.22, easing: 'linear' },
          { transform: 'rotate3d(0.16, 1, 0, -60deg)', opacity: 1, offset: 0.8, easing: 'cubic-bezier(0.3, 0.3, 0.6, 1)' },
          { transform: 'rotate3d(0.16, 1, 0, -89deg)', opacity: 0.7 },
        ],
        { duration: 620 },
      ).finished;
      a.classList.remove('turn');
      $('.shade', a).getAnimations().forEach((x) => x.cancel());
      b.classList.remove('under');
      b.classList.add('on');
    } else {
      // 前の頁が、上からかぶさって戻る
      b.classList.add('turn');
      a.classList.add('under');
      a.classList.remove('on');
      $('.shade', a).animate([{ opacity: 0 }, { opacity: 0.9 }], { duration: 560, easing: 'ease-in' });
      await b.animate(
        [
          { transform: 'rotate3d(-0.16, 1, 0, -89deg)', opacity: 0.7, easing: 'cubic-bezier(0.4, 0, 0.7, 0.7)' },
          { transform: 'rotate3d(-0.16, 1, 0, -60deg)', opacity: 1, offset: 0.2, easing: 'linear' },
          { transform: 'rotate3d(-0.16, 1, 0, -12deg)', opacity: 1, offset: 0.76, easing: 'cubic-bezier(0.2, 0.9, 0.4, 1.3)' },
          { transform: 'rotate3d(-0.16, 1, 0, 0deg)', opacity: 1 },
        ],
        { duration: 580 },
      ).finished;
      b.classList.remove('turn');
      a.classList.remove('under');
      b.classList.add('on');
    }
    page = n;
    turning = false;
    enter(n);
  };
  $$('.b-next', el).forEach((b) => b.addEventListener('click', () => turn(page + 1)));
  $$('.b-prev', el).forEach((b) => b.addEventListener('click', () => turn(page - 1)));
  // 横に払ってもめくれる
  let sx = null;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; });
  el.addEventListener('pointerup', (e) => {
    if (sx == null) return;
    const d = e.clientX - sx;
    sx = null;
    if (Math.abs(d) > 56) turn(page + (d < 0 ? 1 : -1));
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') turn(page + 1); if (e.key === 'ArrowLeft') turn(page - 1); });

  const close = async (instant) => {
    alive = false;
    counting = null;
    audio.setScene('map');
    if (!instant) audio.se('close');
    stage({ on: false });
    if (instant) el.remove(); else await leave(el, 240);
    S.reported = true;
    if (S.rank !== 1) { hud.rank(1); hooks.ranked?.(); }
    setHeld(false);
    hooks.closed?.('report', instant);
  };
  me.close = close;
  me.esc = () => closeAll();
  me.turn = turn;
  $$('.b-close, .b-skip', el).forEach((b) => b.addEventListener('click', () => closeAll()));
}
export const reportTurn = (n) => cur?.turn?.(n);

// ================================================================ 制覇
export async function playConquest() {
  if (cur) await closeAll(true);
  const me = (cur = { name: 'conquest' });
  setHeld(true);
  S.conquered = true;
  const rm = calm();
  const el = h(`<div class="cut ${rm ? 'rm' : 'go'}" role="dialog" aria-label="制覇。タップで飛ばす">
    <div class="slab a"></div><div class="slab b"></div>
    <div class="band"></div>
    <div class="head" aria-hidden="true">制覇</div>
    <div class="side">${hero('gennai', 2)}${hero('gama', 2)}</div>
    <div class="star"><div class="navi"></div></div>
    <div class="cap"><span class="face nt tag paper">${S.year} 年目 ${S.day === 1 && S.month > 1 ? S.month - 1 : S.month} 月 ・ 港の町</span></div>
    <div class="seal bigseal">祝</div>
    <div class="cap2">一位を守りぬき、町を制覇</div>
    <div class="tapnote">タップで飛ばす</div>
  </div>`);
  app().appendChild(el);
  audio.setScene('fest');
  audio.duck(0.3, 1.2);
  audio.se('conquer');
  buzz(30);
  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(() => cur === me && fn(), ms));
  // 地図を広く見せる。スマホでは帯が画面を覆ってから切り替える（覆われているあいだに大きな層を動かさない）
  if (rm || innerWidth >= 760) { world.wide(rm ? 0 : 1400); world.celebrate(); } else at(320, () => { world.wide(0); world.celebrate(); });
  if (!rm) {
    at(350, () => fx.confetti(70));
    at(1010, () => {
      audio.se('stamp');
      shake(app(), 3, 200);
      buzz(24);
      fx.ink(...center($('.bigseal', el)), 1.2);
    });
    at(1500, () => world.fireworks(3));
  }
  let ended = false;
  const end = async () => {
    if (ended) return;
    ended = true;
    timers.forEach(clearTimeout);
    if (!el.isConnected) return;
    el.style.pointerEvents = 'none';
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140 }).finished.catch(() => {});
    el.remove();
    if (cur !== me) return;
    cur = null;
    world.fireworks(6);
    if (!rm) fx.confetti(50);
    setHeld(false);
    hooks.closed?.('conquest');
  };
  me.close = async () => { ended = true; timers.forEach(clearTimeout); el.remove(); setHeld(false); };
  me.esc = end;
  el.addEventListener('click', end);
  // 撮影のときだけ、自動で終わらせない（window.__lab.cutHold）
  timers.push(setTimeout(() => !window.__lab?.cutHold && end(), rm ? 2000 : 2860));
}

// ================================================================ 結び（もう一度）
export function openFin() {
  if (cur) return;
  const me = (cur = { name: 'fin' });
  const el = h(`<div class="fin in" role="dialog" aria-label="制覇しました">
    <div class="sh0 nt n12"></div><div class="bgf nt n12 face paper"></div>
    <div class="fin-in">
      <div class="fin-hd"><span class="shuban2">制覇</span><div><b>港の町を制覇しました</b><span>見本はここまでです。はじめから、もう一度触れます。</span></div></div>
      <div class="fin-acts">${gold('もう一度見る', 'b-again')}${sub('目次', 'b-toc')}${sub('地図にもどる', 'b-map')}</div>
    </div>
  </div>`);
  layer().appendChild(el);
  audio.se('open');
  const close = async () => { await leave(el, 220); hooks.closed?.('fin'); };
  me.close = close;
  me.esc = () => closeAll();
  $('.b-again', el).addEventListener('click', async () => { await closeAll(); hooks.restart?.(); });
  $('.b-toc', el).addEventListener('click', () => openToc());
  $('.b-map', el).addEventListener('click', () => { world.base(700); closeAll(); });
}

// ================================================================ 設定
export async function openSettings() {
  if (cur) return;
  const me = (cur = { name: 'settings' });
  setHeld(true);
  stage({ sunk: true, dock: true });
  const seg = (id, items, val) => `<div class="seg" id="${id}" role="radiogroup">${items.map(([v, t]) => `<button class="btn sub sh n4 ${v === val ? 'on' : ''}" role="radio" aria-checked="${v === val}" data-v="${v}"><span class="face nt n4">${t}</span></button>`).join('')}</div>`;
  const tgl = (id, on, label) => `<button class="tgl" id="${id}" role="switch" aria-checked="${on}" aria-label="${label}" data-se="none"><span class="trk"><span>入</span><span>切</span></span><span class="nob"></span></button>`;
  const el = h(`<section class="sheet in" role="dialog" aria-label="設定">
    <i class="ply p2"></i><i class="ply p1"></i>
    <div class="sheet-paper">
      <div class="bgf nt n12 face paper"></div>
      <div class="sheet-head"><div><div class="sub">システム</div><h2>設定</h2></div><span class="sp"></span><span class="shaban">帳場</span><button class="xbtn x" aria-label="閉じる"><i></i></button></div>
      <div class="sheet-body"><div class="scroll"><div class="set-list">
        <div class="set-g"><h3>音</h3>
          <div class="row"><span class="lb">BGM</span><div id="s-bgm"></div><span class="val"><span id="sv-bgm"></span></span></div>
          <div class="row"><span class="lb">効果音</span><div id="s-se"></div><span class="val"><span id="sv-se"></span></span></div>
          <div class="row"><span class="lb">消音</span>${tgl('t-mute', prefs.muted, '消音')}</div><p class="hint">すべての音を止めます</p>
        </div>
        <div class="set-g"><h3>動き</h3>
          <div class="row"><span class="lb">動きを減らす</span>${tgl('t-rm', prefs.rm, '動きを減らす')}</div><p class="hint" id="rm-note"></p>
          <div class="row col"><span class="lb">吹き出しの速さ</span>${seg('g-talk', [[0, 'ゆっくり'], [1, 'ふつう'], [2, 'はやい']], prefs.talk)}</div>
        </div>
        <div class="set-g"><h3>字と色</h3>
          <div class="row col"><span class="lb">字の大きさ</span>${seg('g-fz', [[100, '100%'], [115, '115%'], [130, '130%']], prefs.fz)}</div>
          <p class="sample">帳面の字は、この大きさで出ます。<br>今月の売上 128,640 G</p>
          <div class="row"><span class="lb">色覚に配慮した色</span>${tgl('t-cb', prefs.cb, '色覚に配慮した色')}</div><p class="hint">「良い」と「手を打つ」の色を替えます。形と言葉は同じです</p>
          <div class="swatch"><span class="up"><i class="tri"></i>ふえた・良い</span><span class="wn"><i class="dia"></i>いま手を打つ</span></div>
        </div>
      </div></div></div>
    </div>
  </section>`);
  layer().appendChild(el);
  audio.se('open');
  const vb = new Roller($('#sv-bgm', el), prefs.bgm);
  const vs = new Roller($('#sv-se', el), prefs.se);
  new Slider($('#s-bgm', el), { min: 0, max: 100, step: 10, value: prefs.bgm, label: 'BGM の音量', onInput: (v) => { prefs.bgm = v; vb.set(v, { dur: 200 }); applyPrefs(); } });
  new Slider($('#s-se', el), { min: 0, max: 100, step: 10, value: prefs.se, label: '効果音の音量', onInput: (v) => { prefs.se = v; vs.set(v, { dur: 200 }); applyPrefs(); audio.se('coin', { n: v / 10, gap: 0.01 }); } });
  const sw = (id, key, after) => $(id, el).addEventListener('click', (e) => {
    prefs[key] = !prefs[key];
    e.currentTarget.setAttribute('aria-checked', prefs[key]);
    applyPrefs();
    audio.se('toggle', { on: prefs[key] });
    buzz(8);
    after?.();
  });
  const rmNote = () => { $('#rm-note', el).textContent = calm() && !prefs.rm ? '端末の設定に合わせて、減らしています' : '揺れ・光・カットインを止めます'; };
  rmNote();
  sw('#t-mute', 'muted');
  sw('#t-rm', 'rm', () => { rmNote(); hud.tape(); });
  sw('#t-cb', 'cb');
  const pick = (id, key, after) => $$(`${id} .btn`, el).forEach((b) => b.addEventListener('click', () => {
    prefs[key] = +b.dataset.v;
    $$(`${id} .btn`, el).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    applyPrefs();
    audio.se('tab', { dir: 1 });
    after?.();
  }));
  pick('#g-fz', 'fz', () => { hud.ruler(); hud.tape(); });
  pick('#g-talk', 'talk');
  const close = async () => {
    audio.se('close');
    stage({ on: false });
    await leave(el, 200);
    done('settings');
  };
  me.close = close;
  me.esc = () => closeAll();
  $('.x', el).addEventListener('click', () => closeAll());
}

// ================================================================ 目次（どこからでも開ける）
let tocEl = null;
const TOC = [['title', 'はじまり'], ['map', '地図と常設の UI'], ['balloon', '工房の吹き出し'], ['workshop', '工房の画面'], ['invest', '設備投資'], ['proposal', '部長の提案と承認'], ['report', '月次報告'], ['conquest', '制覇'], ['settings', '設定']];
export function closeToc() {
  if (!tocEl) return;
  const el = tocEl;
  tocEl = null;
  leave(el, 160);
}
export function openToc() {
  if (tocEl) return closeToc();
  audio.se('tab', { dir: -1 });
  const n = layersOf();
  const el = (tocEl = h(`<div class="toc in" role="dialog" aria-label="目次">
    <div class="sh0 nt" style="--n:10px"></div><div class="bgf nt face paper" style="--n:10px"></div>
    <div class="toc-in">
      <h2>目次<span class="sp"></span><button class="xbtn x" aria-label="目次を閉じる"><i></i></button></h2>
      <ol>${TOC.map(([id, t], k) => `<li><button data-go="${id}" data-se="none"><span class="no">${'一二三四五六七八九'[k]}</span><span>${t}</span><i class="go"></i></button></li>`).join('')}</ol>
      <div class="lay">曲の層<span class="pp">${[0, 1, 2, 3, 4].map((k) => `<i class="${k < n ? 'on' : ''}"></i>`).join('')}</span><span>${n}／5（勢いで重なる）</span></div>
    </div>
  </div>`));
  app().appendChild(el);
  $('.x', el).addEventListener('click', closeToc);
  $$('[data-go]', el).forEach((b) => b.addEventListener('click', () => {
    audio.se('decide');
    closeToc();
    hooks.jump?.(b.dataset.go);
  }));
}
