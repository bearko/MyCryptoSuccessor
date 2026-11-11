// 場面（後半）：部長の提案と承認・月次報告・制覇。
import { $, h, G, anim, done, reduced, wait, bus, EASE, fmt, vibrate, rand } from './core.js';
import { audio } from './audio.js';
import { HL, SAY, NEWS } from './text.js';
import { Digits, typeText } from './ui.js';
import { SPR, cutout, loadImage, slash, slam, slamType, typeset, burst, shake, flash, coins, papers, confetti, firework } from './fx.js';
import { cam, camTo, home, dim, setTag, lockMap, celebrate, SHOPS, coverMap } from './map.js';
import { chrome, hold, news, sale, cue, setRank, setBrand, setSales, resumeDays, planNote, salesEl } from './hud.js';
import { ui } from './scenes-a.js';

// ---------------------------------------------------------------- 部長の提案 → 承認（この方向でいちばんの決めの一手：号外を刷る）
let prop = null;
export async function openProposal() {
  if (ui.busy || prop) return;
  ui.busy = true;
  ui.open = 'prop';
  hold(true);
  lockMap(true);
  cue('');
  setTag('hide');
  audio.se('open');
  dim(2);
  prop = h(`
    <div class="pp" role="dialog" aria-label="経営企画部長の提案">
      <div class="pp-card">
        <div class="pp-sh"></div>
        <div class="pp-bg"></div>
        <div class="pp-burst" aria-hidden="true"><i></i></div>
        <div class="pp-hero" aria-hidden="true"></div>
        <div class="pp-in">
          <div class="pp-kick"><span class="kick kick--shu"><b>${HL.prop}</b></span><span class="pp-who">経営企画部長<b>MCHタクティシャン</b></span></div>
          <h2 class="pp-hl reg">${HL.propHead}</h2>
          <div class="pp-say"><i class="pp-say-tail"></i><p class="say"></p></div>
          <div class="pp-num">
            <span class="pp-num-l">この町の売上</span>
            <span class="pp-num-v"><small>月</small><b class="dg">+12,400</b><small>G</small><i class="tri"></i></span>
          </div>
          <div class="pp-act">
            <button class="btn btn--shu pp-ok" type="button" data-press data-se="none"><span class="btn-f"><b>${HL.approve}</b></span></button>
            <button class="btn--ghost pp-later" type="button" data-press>あとで</button>
          </div>
        </div>
        <div class="pp-print" aria-hidden="true"><b class="pp-print-t">${HL.approve}</b></div>
      </div>
    </div>`);
  $('#layer-card').append(prop);
  const card = prop.querySelector('.pp-card');
  // 人物は札の上の縁に立つ。札の上の空き（テロップの下まで）に合わせて、整数倍の大きさを選ぶ
  const room = card.getBoundingClientRect().top - ($('#ticker').getBoundingClientRect().bottom - 30) + 46;
  const hs = Math.max(2, Math.min(4, Math.floor(room / 66)));
  prop.querySelector('.pp-hero').append(cutout(SPR.tactician, { scale: hs, reg: hs + 1 }));
  card.style.setProperty('--hs', `${64 * hs + 10}px`);
  const say = prop.querySelector('.say');
  // 入る：札が下から叩きつけられ、人物が枠を破って飛び込む
  anim(card, [{ transform: 'translateY(60%) rotate(5deg)', opacity: 0 }, { transform: 'translateY(-2%) rotate(-1.2deg)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: EASE.out });
  anim(prop.querySelector('.pp-hero'), [{ transform: 'translate(90px,80px) rotate(22deg) scale(0.5)', opacity: 0 }, { transform: 'translate(-8px,-12px) rotate(-5deg) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], { duration: 340, delay: 140, easing: EASE.out, fill: 'backwards' });
  anim(prop.querySelector('.pp-burst'), [{ transform: 'scale(0.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: 120, easing: EASE.back, fill: 'backwards' });
  slamType(prop.querySelector('.pp-hl'), { gap: 34, delay: 180, se: false });
  audio.seAt('slam', 0.25, 1, 2);
  const ctl = typeText(say, SAY.propose, { who: 1 });
  prop.querySelector('.pp-say').addEventListener('click', () => ctl.skip());
  prop.querySelector('.pp-later').addEventListener('click', () => closeProposal());
  prop.querySelector('.pp-ok').addEventListener('click', (e) => approve(e.currentTarget));
  await wait(260);
  ui.busy = false;
}
export async function closeProposal({ silent = false } = {}) {
  if (!prop) return;
  const p = prop;
  prop = null;
  if (!silent) {
    audio.se('close');
    await done(anim(p.querySelector('.pp-card'), [{ transform: 'none', opacity: 1 }, { transform: 'translateY(50%) rotate(4deg)', opacity: 0 }], { duration: 200, easing: EASE.in }));
  }
  p.remove();
  dim(0);
  hold(false);
  lockMap(false);
  setTag('idle');
  ui.open = 'map';
  if (!silent) bus.emit('back-to-map');
}
let approving = false;
async function approve(btn) {
  if (approving || !prop) return;
  approving = true;
  ui.busy = true;
  const p = prop;
  const card = p.querySelector('.pp-card');
  const print = p.querySelector('.pp-print');
  const r = card.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.46;
  // 一打：版が紙に落ちる。白い 1 コマ → 揺れ → 朱の大きな活字が斜めに刷られる
  audio.duck(0.12, 0.9, 0.9);
  audio.se('approve');
  vibrate([16, 46, 26]);
  flash(null, 0.85, 170);
  shake(4, 260);
  p.classList.add('is-approved');
  burst(cx, cy, { count: 60, speed: 1000, size: 11, life: 0.75 });
  const chars = typeset(print.querySelector('.pp-print-t'));
  print.style.opacity = '1';
  chars.forEach((c, i) => {
    anim(c, [
      { transform: `scale(3.4) rotate(${i ? 14 : -16}deg)`, opacity: 0 },
      { transform: 'scale(0.9) rotate(0deg)', opacity: 1, offset: 0.62 },
      { transform: 'scale(1.06) rotate(0deg)', opacity: 1, offset: 0.8 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 240, delay: i * 130, easing: EASE.slam, fill: 'backwards' });
  });
  if (!reduced()) {
    await wait(130);
    shake(3, 200);
    burst(cx + 40, cy, { count: 30, speed: 760, size: 9 });
  }
  anim(p.querySelector('.pp-hero'), [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-34px) rotate(-8deg)', offset: 0.4 }, { transform: 'translateY(0) rotate(0)' }], { duration: 380, delay: 120, easing: 'ease-out', fill: 'none', deco: true });
  await wait(reduced() ? 200 : 330);
  // 数字が売上へ飛ぶ
  const nv = p.querySelector('.pp-num-v').getBoundingClientRect();
  const to = salesEl().getBoundingClientRect();
  coins(nv.left + nv.width / 2, nv.top + nv.height / 2, 14, [to.left + to.width - 40, to.top + 26]);
  slam(p.querySelector('.pp-num'), { from: 1.4, rot: 3, dur: 200 });
  typeText(p.querySelector('.say'), SAY.proposeAfter, { who: 1 });
  await wait(reduced() ? 500 : 880);
  G.proposal = 'approved';
  planNote(false);
  // 刷り上がった号外が、斜めに切り裂かれて町へ出る
  await slash({
    from: 'left', colors: ['shu', 'gold', 'ink'], label: HL.approved,
    mid: () => {
      p.remove();
      prop = null;
      dim(0);
      hold(false);
      lockMap(false);
      setTag('idle');
      ui.open = 'map';
    },
  });
  papers(16, { dur: 2.6 });
  audio.layers(5);
  news(NEWS.approved, { extra: true });
  resumeDays();
  // 輸入雑貨店にセンスが並ぶ：まとめて売れる
  const shop = SHOPS[1];
  camTo({ x: shop.x - (cam.vw < 900 ? 120 : 0), y: home().y, z: cam.z }, { dur: 700, ease: EASE.out });
  for (let i = 0; i < 6; i++) {
    setTimeout(() => ui.open === 'map' && sale(shop, i === 5 ? 2400 : 2000, true), 500 + i * 620);
  }
  approving = false;
  ui.busy = false;
  bus.emit('approved');
}

// ---------------------------------------------------------------- 月次報告
const RIVALS = [
  { name: 'ランタン堂', v: 41200, prev: 1 },
  { name: 'あなたの商会', v: 0, prev: 2, me: true },
  { name: 'カネモノ商会', v: 33900, prev: 3 },
  { name: 'ヒバナ雑貨', v: 27400, prev: 4 },
  { name: 'マルミ商店', v: 19800, prev: 5 },
];
const TREND = [['10月', 9800], ['11月', 13200], ['12月', 17600], ['1月', 21900], ['2月', 28400]];
let rp = null, page = 0, turning = false, played = [], rpSkip = null;
export async function openReport() {
  if (rp) return;
  ui.busy = true;
  ui.open = 'report';
  hold(true);
  lockMap(true);
  cue('');
  setTag('hide');
  const total = Math.max(G.sales, 45960);
  setSales(total);
  G.reportTotal = total;
  const prev = 28400;
  const diff = total - prev;
  audio.scene('report');
  audio.se('open');
  page = 0;
  played = [false, false, false];
  await slash({
    from: 'down', colors: ['ink', 'shu', 'paper'], label: HL.report, dur: 660,
    mid: () => {
      chrome('none');
      dim(2);
      rp = h(`
        <section class="rp" role="dialog" aria-label="月次報告（1年目 3月）">
          <header class="rp-mast">
            <span class="kick kick--shu rp-extra"><b>${HL.brand}</b></span>
            <h2 class="rp-title">${HL.report}</h2>
            <span class="rp-date">1年目 3月</span>
            <span class="rp-sp"></span>
            <button class="rp-btn rp-toc" type="button" data-press aria-label="目次を開く">目次</button>
            <button class="rp-btn rp-skip" type="button" data-press aria-label="報告を飛ばす">飛ばす</button>
          </header>
          <div class="rp-rule"><i></i><i></i></div>
          <div class="rp-pages">
            <article class="rp-page" data-p="0">
              <span class="kick rp-k"><b>その一</b></span>
              <h3 class="rp-hl reg">${HL.rpSales}</h3>
              <div class="rp-total"><b class="dg" id="rp-total"></b><small>G</small></div>
              <i class="rp-under"></i>
              <div class="rp-row">
                <div class="rp-diff"><span class="rp-diff-b"><i class="tri"></i><span>先月より</span><b class="dg">+${fmt(diff)}</b><small>G</small></span><span class="rp-diff-n">増えた（先月 ${fmt(prev)} G）</span></div>
                <div class="rp-pair" aria-hidden="true">
                  <div class="rp-pair-c"><i style="--k:${(prev / total).toFixed(3)}"></i><span>先月</span></div>
                  <div class="rp-pair-c rp-pair-c--now"><i style="--k:1"></i><span>今月</span></div>
                </div>
              </div>
              <div class="rp-shops">
                <h4>お店ごとの売上</h4>
                <div class="rp-shops-g">${[['輸入雑貨店', 0.44], ['よろず屋<br>本通り店', 0.33], ['よろず屋<br>駅前店', 0.23]].map(([n, k], i) => `
                  <div class="rp-shop${i === 0 ? ' is-top' : ''}"><b class="dg">${fmt(Math.round((total * k) / 10) * 10)}</b><div class="rp-shop-b" style="--k:${(k / 0.44).toFixed(3)}"><i></i></div><span>${n}</span></div>`).join('')}
                </div>
              </div>
              <div class="rp-talk"><div class="rp-talk-hero" aria-hidden="true"></div><div class="rp-talk-b"><p class="say"></p></div></div>
            </article>
            <article class="rp-page" data-p="1" hidden>
              <span class="kick rp-k"><b>その二</b></span>
              <h3 class="rp-hl reg">${HL.rpRank}</h3>
              <p class="rp-lead">${HL.town}・3月の売上</p>
              <ol class="rk">${RIVALS.map((c, i) => `
                <li class="rk-row${c.me ? ' is-me' : ''}" data-i="${i}"><b class="rk-n dg">${c.prev}</b><span class="rk-name">${c.name}</span><span class="rk-bar"><i></i></span><span class="rk-v dg">${fmt(c.me ? total : c.v)}</span></li>`).join('')}
              </ol>
              <div class="rk-up" aria-hidden="true"><span class="rk-up-from">${HL.rank2}</span><i class="tri tri--r"></i><b class="rk-up-to">${HL.rank1}</b></div>
              <div class="rp-talk"><div class="rp-talk-hero" aria-hidden="true"></div><div class="rp-talk-b"><p class="say"></p></div></div>
            </article>
            <article class="rp-page" data-p="2" hidden>
              <span class="kick rp-k"><b>その三</b></span>
              <h3 class="rp-hl reg">${HL.rpTrend}</h3>
              <p class="rp-lead">この半年（単位：G）</p>
              <div class="ch" role="img" aria-label="月次売上の推移。10月 9,800 G から 3月 ${fmt(total)} G まで、6 か月つづけて増えた">
                <div class="ch-grid"><i><span>4万</span></i><i><span>2万</span></i><i><span>0</span></i></div>
                <div class="ch-bars">${[...TREND, ['3月', total]].map(([m, v], i) => `
                  <div class="ch-c${i === 5 ? ' is-now' : ''}"><b class="ch-v dg">${fmt(v)}</b><div class="ch-b" style="--k:${(v / 50000).toFixed(3)}"><i></i></div><span class="ch-m">${m}</span></div>`).join('')}
                </div>
              </div>
              <div class="rp-talk"><div class="rp-talk-hero" aria-hidden="true"></div><div class="rp-talk-b"><p class="say"></p></div></div>
            </article>
          </div>
          <footer class="rp-foot">
            <button class="btn rp-prev" type="button" data-press data-se="none" aria-label="前のページ"><span class="btn-f"><i class="tri tri--l"></i></span></button>
            <div class="rp-pips" aria-hidden="true"><i class="on"></i><i></i><i></i></div>
            <button class="btn btn--gold rp-next" type="button" data-press data-se="none"><span class="btn-f"><span class="rp-next-l">次へ</span><i class="tri tri--r"></i></span></button>
          </footer>
        </section>`);
      rp.querySelectorAll('.rp-talk-hero').forEach((e) => e.append(cutout(SPR.tactician, { scale: 2, reg: 3 })));
      $('#layer-sheet').append(rp);
      coverMap(true);
    },
  });
  news(NEWS.monthEnd, { quiet: true });
  const next = rp.querySelector('.rp-next'), prevB = rp.querySelector('.rp-prev');
  next.addEventListener('click', () => (page === 2 ? closeReport() : turn(page + 1)));
  prevB.addEventListener('click', () => page > 0 && turn(page - 1));
  rp.querySelector('.rp-skip').addEventListener('click', () => closeReport());
  rp.querySelector('.rp-toc').addEventListener('click', (e) => bus.emit('toc', e.currentTarget));
  // 紙面を押すと、数え上げを飛ばす。横に払うと、めくる
  let sx = 0, sy = 0;
  const pages = rp.querySelector('.rp-pages');
  pages.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  pages.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && page < 2) turn(page + 1);
      else if (dx > 0 && page > 0) turn(page - 1);
    } else if (Math.hypot(dx, dy) < 10) rpSkip?.();
  });
  paintFoot();
  ui.busy = false;
  slamType(rp.querySelector('.rp-title'), { gap: 50, se: false });
  playPage(0);
}
function paintFoot() {
  if (!rp) return;
  rp.querySelectorAll('.rp-pips i').forEach((e, i) => e.classList.toggle('on', i === page));
  rp.querySelector('.rp-prev').classList.toggle('is-off', page === 0);
  rp.querySelector('.rp-next-l').textContent = page === 2 ? '報告を閉じる' : '次へ';
}
/** ページを送る：号外を 1 枚、斜めにはぎ取る（560〜620ms） */
async function turn(to) {
  if (turning || !rp || to === page) return;
  turning = true;
  rpSkip?.();
  rpSkip = null;
  const dir = to > page ? 1 : -1;
  const cur = rp.querySelector(`.rp-page[data-p="${page}"]`);
  const nxt = rp.querySelector(`.rp-page[data-p="${to}"]`);
  audio.se('page');
  page = to;
  paintFoot();
  nxt.hidden = false;
  nxt.style.zIndex = '1';
  cur.style.zIndex = '2';
  if (!played[to]) prepPage(to);
  const a = anim(cur, [
    { transform: 'translate(0,0) rotate(0)', opacity: 1 },
    { transform: `translate(${-dir * 12}%, -3%) rotate(${-dir * 5}deg)`, opacity: 1, offset: 0.25, easing: 'cubic-bezier(.5,0,.9,.5)' },
    { transform: `translate(${-dir * 130}%, -14%) rotate(${-dir * 24}deg)`, opacity: 1 },
  ], { duration: 420, easing: 'linear', fill: 'forwards' });
  anim(nxt, [{ transform: 'scale(0.94) translateY(14px)', opacity: 0.4 }, { transform: 'scale(1.012) translateY(-2px)', opacity: 1, offset: 0.78 }, { transform: 'none', opacity: 1 }], { duration: 400, delay: 190, easing: EASE.out, fill: 'backwards' });
  // 切り口の帯
  const band = h(`<i class="rp-tear"></i>`);
  rp.querySelector('.rp-pages').append(band);
  anim(band, [{ transform: `translateX(${dir * 120}%) skewX(-12deg)` }, { transform: `translateX(${-dir * 140}%) skewX(-12deg)` }], { duration: 460, easing: EASE.inout, deco: true });
  await done(a);
  cur.hidden = true;
  a.cancel();
  cur.style.zIndex = '';
  await wait(reduced() ? 0 : 170);
  band.remove();
  shake(1, 120);
  turning = false;
  playPage(to);
}
function prepPage(p) {
  const el = rp.querySelector(`.rp-page[data-p="${p}"]`);
  if (p === 1) el.querySelectorAll('.rk-bar i').forEach((e) => (e.style.transform = 'scaleX(0)'));
  if (p === 2) el.querySelectorAll('.ch-b i').forEach((e) => (e.style.transform = 'scaleY(0)'));
}
async function playPage(p) {
  if (!rp) return;
  const el = rp.querySelector(`.rp-page[data-p="${p}"]`);
  const say = el.querySelector('.say');
  const talk = el.querySelector('.rp-talk');
  const total = G.reportTotal;
  if (played[p]) return;
  played[p] = true;
  let skipped = false;
  rpSkip = () => { skipped = true; };
  const pause = (ms) => new Promise((res) => {
    if (skipped || reduced()) return res();
    const t0 = performance.now();
    const tick = () => (skipped || performance.now() - t0 >= ms ? res() : setTimeout(tick, 30));
    tick();
  });
  const showTalk = (text) => {
    talk.classList.add('on');
    anim(talk, [{ transform: 'translateY(30px) rotate(2deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 240, easing: EASE.back, fill: 'none' });
    typeText(say, text, { who: 1 });
  };
  slamType(el.querySelector('.rp-hl'), { gap: 40, se: false });
  audio.se('slam', 0.8, 1);
  if (p === 0) {
    // 売上が段で数え上がり、金貨の音が高くなっていく
    const dg = new Digits(el.querySelector('#rp-total'), 0);
    const N = 26;
    for (let i = 1; i <= N; i++) {
      if (skipped || reduced()) break;
      const k = i / N;
      const e = 1 - Math.pow(1 - k, 2.4);
      dg.set(Math.round(total * e));
      audio.se('coin', Math.round(k * 13), 0.5 + k * 0.5);
      await wait(46 + k * 44);
    }
    dg.set(total, { strong: true });
    audio.se('credit');
    audio.se('slam', 1.2, 0);
    shake(2, 180);
    vibrate(14);
    const r = el.querySelector('.rp-total').getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, { count: 36, speed: 700, size: 9 });
    coins(r.left + r.width / 2, r.top + r.height * 0.6, 12);
    el.classList.add('s1');
    anim(el.querySelector('.rp-under'), [{ transform: 'scaleX(0) skewX(-12deg)' }, { transform: 'scaleX(1) skewX(-12deg)' }], { duration: 220, easing: EASE.slam });
    await pause(320);
    el.classList.add('s2');
    slam(el.querySelector('.rp-diff-b'), { from: 1.8, rot: -7, dur: 200 });
    audio.se('slam', 1, 3);
    el.querySelectorAll('.rp-pair-c i').forEach((e, i) => anim(e, [{ transform: 'scaleY(0)' }, { transform: `scaleY(${e.style.getPropertyValue('--k')})` }], { duration: 380, delay: 120 + i * 160, easing: EASE.out, fill: 'both' }));
    await pause(420);
    el.classList.add('s3');
    el.querySelectorAll('.rp-shop-b i').forEach((e, i) => {
      anim(e, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.06)', offset: 0.75 }, { transform: 'scaleY(1)' }], { duration: 300, delay: i * 110, easing: EASE.out, fill: 'both' });
      if (!reduced() && !skipped) audio.seAt('coin', (i * 110) / 1000, 6 - i * 2, 0.7);
    });
    await pause(560);
    showTalk(SAY.report1);
  } else if (p === 1) {
    // 棒が伸び、自社が 2 位から 1 位へ入れ替わる
    const rows = [...el.querySelectorAll('.rk-row')];
    const max = Math.max(total, 41200) * 1.04;
    rows.forEach((r, i) => {
      const v = RIVALS[i].me ? total : RIVALS[i].v;
      const bar = r.querySelector('.rk-bar i');
      bar.style.transform = `scaleX(${(v / max).toFixed(3)})`;
      anim(bar, [{ transform: 'scaleX(0)' }, { transform: `scaleX(${(v / max).toFixed(3)})` }], { duration: RIVALS[i].me ? 760 : 420, delay: RIVALS[i].me ? 420 : i * 70, easing: RIVALS[i].me ? 'cubic-bezier(.3,0,.2,1)' : EASE.out, fill: 'backwards' });
      if (!reduced()) audio.seAt('tick', (RIVALS[i].me ? 420 : i * 70) / 1000, 4 - i);
    });
    await pause(1250);
    const me = rows[1], top = rows[0];
    const dy = me.getBoundingClientRect().top - top.getBoundingClientRect().top;
    audio.se('rankup');
    audio.duck(0.3, 0.7, 0.8);
    me.style.transform = `translateY(${-dy}px)`;
    top.style.transform = `translateY(${dy}px)`;
    me.classList.add('is-top');
    anim(me, [{ transform: 'translateY(0) scale(1)' }, { transform: `translateY(${-dy * 0.5}px) scale(1.06)`, offset: 0.5 }, { transform: `translateY(${-dy - 6}px) scale(1.03)`, offset: 0.82 }, { transform: `translateY(${-dy}px) scale(1)` }], { duration: 420, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'none' });
    anim(top, [{ transform: 'translateY(0)' }, { transform: `translateY(${dy}px)` }], { duration: 360, easing: EASE.inout, fill: 'none' });
    await pause(385);
    me.querySelector('.rk-n').textContent = '1';
    top.querySelector('.rk-n').textContent = '2';
    slam(me.querySelector('.rk-n'), { from: 2.6, rot: -16, dur: 200 });
    shake(3, 220);
    flash(null, 0.5, 140);
    vibrate([12, 30, 20]);
    const r = me.getBoundingClientRect();
    burst(r.left + 30, r.top + r.height / 2, { count: 40, speed: 760, size: 9 });
    confetti(r.left + r.width / 2, r.top, 30, { up: 520, spread: 380 });
    const up = el.querySelector('.rk-up');
    up.classList.add('on');
    slam(up, { from: 2.4, rot: -14, dur: 240 });
    setRank(1, false);
    await pause(700);
    showTalk(SAY.report2);
  } else {
    // 縦の棒が、左から順に伸びる
    const cols = [...el.querySelectorAll('.ch-c')];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const b = c.querySelector('.ch-b i');
      b.style.transform = '';
      anim(b, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.06)', offset: 0.75 }, { transform: 'scaleY(1)' }], { duration: i === 5 ? 420 : 280, easing: EASE.out, fill: 'backwards' });
      anim(c.querySelector('.ch-v'), [{ transform: 'translateY(10px) scale(0.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 180, delay: 150, easing: EASE.back, fill: 'both' });
      c.classList.add('on');
      if (i < 5) audio.se('coin', i * 2, 0.7);
      else {
        audio.se('complete', 4);
        audio.se('slam', 1, 4);
        const r = c.getBoundingClientRect();
        if (!skipped) await wait(reduced() ? 0 : 260);
        burst(r.left + r.width / 2, r.top + 20, { count: 26, speed: 520, size: 7, dir: -Math.PI / 2, spread: Math.PI });
        shake(2, 160);
      }
      await pause(i === 4 ? 260 : 130);
    }
    await pause(300);
    showTalk(SAY.report3);
  }
  if (rpSkip && !turning) rpSkip = null;
}
export async function closeReport({ silent = false } = {}) {
  if (!rp) return;
  const leave = () => {
    coverMap(false);
    rp?.remove();
    rp = null;
    rpSkip = null;
    chrome('map');
    dim(0);
    hold(false);
    lockMap(false);
    setTag('idle');
    ui.open = 'map';
  };
  audio.scene('map');
  if (silent) return leave();
  ui.busy = true;
  audio.se('close');
  await slash({ from: 'up', colors: ['paper', 'shu', 'ink'], mid: leave });
  ui.busy = false;
  bus.emit('report-closed');
}

// ---------------------------------------------------------------- 制覇
let cq = null;
export async function conquer() {
  if (cq) return;
  ui.busy = true;
  ui.open = 'conquer';
  hold(true);
  lockMap(true);
  cue('');
  const navi = await loadImage('../../mch/Image/Characters/navi_ain_speak_00_talk.png');
  const wide = cam.vw >= 900 && cam.vh >= 700;
  const sc = wide ? 4 : cam.vh < 720 ? 2 : 3;
  cq = h(`
    <div class="cq" role="dialog" aria-label="タオックスを制覇">
      <div class="cq-plate cq-plate--a"></div>
      <div class="cq-plate cq-plate--b"></div>
      <div class="cq-band"><div class="cq-rays"></div></div>
      <div class="cq-mid">
        <div class="cq-top"><span class="kick kick--gold cq-k"><b>号外</b></span><div class="cq-sub"><b>${HL.town}</b><span>2 か月つづけて 1 位</span></div></div>
        <h2 class="cq-hl" aria-label="制覇"><span data-t="制">制</span><span data-t="覇">覇</span></h2>
      </div>
      <div class="cq-hero" aria-hidden="true"></div>
      <div class="cq-crew" aria-hidden="true"></div>
      <div class="cq-skip">押すと先へ進みます</div>
    </div>`);
  if (navi) cq.querySelector('.cq-hero').append(cutout(navi, { scale: sc, reg: 6 }));
  for (const s of [SPR.artist, SPR.tactician]) {
    const w = h(`<i></i>`);
    w.append(cutout(s, { scale: wide ? 3 : 2, reg: 3, flip: s === SPR.tactician }));
    cq.querySelector('.cq-crew').append(w);
  }
  $('#layer-top').append(cq);
  audio.duck(0.05, 1.3, 1.2);
  audio.se('conquer');
  audio.fete(8, 'map');
  let skip;
  const skipped = new Promise((r) => (skip = r));
  cq.addEventListener('click', () => skip());
  const el = (s) => cq.querySelector(s);
  const A = el('.cq-plate--a'), B = el('.cq-plate--b');
  if (reduced()) {
    anim(cq, [{ opacity: 0 }, { opacity: 1 }], { duration: 140 });
  } else {
    // 0〜：スネアのロールに合わせて、上下の墨の板が斜めに閉じる
    anim(A, [{ transform: 'rotate(-9deg) translateY(-110%)' }, { transform: 'rotate(-9deg) translateY(0)' }], { duration: 300, easing: EASE.slam });
    anim(B, [{ transform: 'rotate(-9deg) translateY(110%)' }, { transform: 'rotate(-9deg) translateY(0)' }], { duration: 300, easing: EASE.slam });
    anim(el('.cq-band'), [{ transform: 'rotate(-9deg) scaleX(0)' }, { transform: 'rotate(-9deg) scaleX(1)' }], { duration: 260, delay: 190, easing: EASE.slam, fill: 'backwards' });
    for (const s of ['.cq-mid', '.cq-hero', '.cq-crew']) el(s).style.opacity = '0';
    await Promise.race([wait(450), skipped]);
    // 板が閉じて地図が見えないあいだは、地図を休ませる
    coverMap(true);
    // 450ms：一打。見出しが 1 字ずつ落ち、人物が見出しの手前へ飛び込む
    flash(null, 0.7, 200);
    shake(5, 320);
    vibrate([20, 40, 30, 40, 40]);
    burst(cam.vw / 2, cam.vh * 0.45, { count: 80, speed: 1300, size: 12, life: 0.9 });
    el('.cq-mid').style.opacity = '1';
    [...el('.cq-hl').children].forEach((c, i) => anim(c, [
      { transform: `scale(4) rotate(${i ? 16 : -18}deg)`, opacity: 0 },
      { transform: 'scale(0.9) rotate(0)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1.05) rotate(0)', opacity: 1, offset: 0.8 },
      { transform: 'scale(1) rotate(0)', opacity: 1 },
    ], { duration: 260, delay: i * 130, easing: EASE.slam, fill: 'backwards' }));
    setTimeout(() => cq && shake(4, 240), 190);
    anim(el('.cq-top'), [{ transform: 'translateX(-130%)' }, { transform: 'translateX(0)' }], { duration: 300, delay: 300, easing: EASE.back, fill: 'backwards' });
    el('.cq-hero').style.opacity = '1';
    anim(el('.cq-hero'), [{ transform: 'translate(70%,90%) rotate(18deg)' }, { transform: 'translate(-4%,-6%) rotate(-4deg)', offset: 0.7 }, { transform: 'none' }], { duration: 380, delay: 250, easing: EASE.out, fill: 'backwards' });
    el('.cq-crew').style.opacity = '1';
    [...el('.cq-crew').children].forEach((c, i) => anim(c, [{ transform: 'translateY(150%)' }, { transform: 'translateY(-16%)', offset: 0.7 }, { transform: 'none' }], { duration: 300, delay: 480 + i * 90, easing: EASE.out, fill: 'backwards' }));
    setTimeout(() => cq && papers(34, { dur: 3.4 }), 250);
    setTimeout(() => cq && confetti(cam.vw / 2, cam.vh * 0.5, 60, { up: 900, spread: 700 }), 300);
  }
  await Promise.race([wait(reduced() ? 1800 : 2000), skipped]);
  // 抜ける：板が開いて、祝いの町へ
  coverMap(false);
  const c = cq;
  G.conquered = true;
  celebrate(true);
  setRank(1, false);
  chrome('map');
  if (!reduced()) {
    anim(el('.cq-hero'), [{ transform: 'none' }, { transform: 'translate(20%,120%) rotate(10deg)' }], { duration: 260, easing: EASE.in });
    anim(el('.cq-mid'), [{ transform: 'none', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 240, easing: EASE.in });
    anim(el('.cq-crew'), [{ transform: 'none' }, { transform: 'translateY(160%)' }], { duration: 220, easing: EASE.in });
    anim(el('.cq-band'), [{ transform: 'rotate(-9deg) scaleX(1)' }, { transform: 'rotate(-9deg) scaleX(0)' }], { duration: 240, delay: 60, easing: EASE.in });
    anim(A, [{ transform: 'rotate(-9deg) translateY(0)' }, { transform: 'rotate(-9deg) translateY(-110%)' }], { duration: 420, delay: 120, easing: EASE.inout });
    await done(anim(B, [{ transform: 'rotate(-9deg) translateY(0)' }, { transform: 'rotate(-9deg) translateY(110%)' }], { duration: 420, delay: 120, easing: EASE.inout }));
  } else await done(anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 160 }));
  c.remove();
  cq = null;
  hold(false);
  lockMap(false);
  ui.open = 'map';
  ui.busy = false;
  news(NEWS.conquer, { extra: true, quiet: true });
  setBrand(G.brand + 8);
  // 町の祝い：花火と号外
  camTo({ ...home(), z: cam.z }, { dur: 900, ease: EASE.out });
  papers(30, { dur: 4.2 });
  let n = 0;
  const fire = () => {
    if (!G.conquered || n++ > 16 || ui.open !== 'map') return;
    firework(rand(0.12, 0.88) * cam.vw, rand(0.24, 0.6) * cam.vh);
    audio.se('sale', n % 5);
    setTimeout(fire, rand(260, 620));
  };
  fire();
  setTimeout(() => G.conquered && ui.open === 'map' && papers(22, { dur: 4 }), 2600);
  bus.emit('conquered');
}
export function clearB() {
  if (prop) closeProposal({ silent: true });
  if (rp) closeReport({ silent: true });
  if (cq) { cq.remove(); cq = null; coverMap(false); hold(false); lockMap(false); }
  approving = false;
  turning = false;
}
