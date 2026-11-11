// 部長の提案 → 承認。この方向でいちばんの決めの一手：大きなレバーを引き下ろすと「ガチャン」、
// ランプが曲の拍に合わせて順に点き、「承認済」の札が点いて、伝票が打ち出される。
import { G, hold, syncLayers } from './game.js';
import { HERO } from './data.js';
import { heroEl } from './hud.js';
import { icon } from './icons.js';
import { h, key, typeText, after, loop, shake, vibrate, env } from './ui.js';
import { sparks } from './fx.js';

const TRAVEL = 104;

export function openProposal() {
  if (G.prop) return;
  const { sfx, wipe, hud, eng, music } = G;
  const s = G.s;
  const release = hold();
  const dim = document.getElementById('dim');
  const hero = HERO.polo;
  let closed = false;
  let engaged = s.approved;
  const r0 = hud.center.getBoundingClientRect();
  const origin = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };

  const text = h('p.c-prop-text');
  const face = heroEl('polo', 2, 'c-prop-face');
  const lamps = Array.from({ length: 5 }, () => h('i.c-lamp.c-lamp--good'));
  const doneTxt = h('b', '未承認');
  const done = h('div.c-prop-done', { 'aria-live': 'polite' }, h('span.c-prop-done-in', icon('check', { color: '#1a1c2e' }), doneTxt));
  const ticket = h('div.c-ticket', h('div.c-ticket-paper', h('div', h('b', '承認'), '　センスを輸入に追加'), h('div', 'この町の売上　月 ', h('span.num', '+12,400 G')), h('div.t-ink2', '次の荷から、よろず屋に並びます')));
  const later = key('あとで', () => close(), { cls: 'c-prop-later' });
  const back = key('地図へもどる', () => close(), { kind: 'amber', big: true, cls: 'c-prop-back', strong: true });
  back.hidden = true;

  // ---- レバー
  const knob = h('div.c-lever-knob', h('span.c-lever-grip'), h('b', '承認'));
  const hint = h('div.c-lever-hint', icon('down', { color: '#ffb81f', scale: 1 }), icon('down', { color: '#ffb81f', scale: 1 }), icon('down', { color: '#ffb81f', scale: 1 }));
  const lever = h('div.c-lever', { role: 'button', tabindex: '0', 'aria-label': '承認する（レバーを下げる）' }, h('div.c-lever-slot'), h('div.c-lever-scale'), hint, h('div.c-lever-goal', 'ON'), knob);
  const cap = h('div.c-lever-cap', icon('down', { color: '#ffb81f', scale: 1 }), h('span', '引いて承認'));
  let pos = 0;
  let drag = null;
  let auto = null;
  let lastDet = 0;
  const paint = () => {
    knob.style.transform = `translate3d(0,${Math.round(pos / 2) * 2}px,0)`;
  };
  const engage = () => {
    if (engaged) return;
    engaged = true;
    s.approved = true;
    pos = TRAVEL;
    paint();
    lever.classList.add('is-on');
    cap.replaceChildren(h('span.t-good', 'つながった'));
    card.classList.add('is-approved');
    // ガチャン：音・短い振動・札の揺れ・1 コマの白い光
    sfx.approve();
    vibrate(22);
    shake(card);
    flash.classList.add('is-on');
    const kr = knob.getBoundingClientRect();
    sparks({ x: kr.left + kr.width / 2, y: kr.bottom }, 16);
    // ランプ：曲の 16 分音符の刻みで、下から順に点く（音は和音を上る）
    const st = music.step;
    const t0 = eng.now + 0.11;
    lamps.forEach((l, i) => {
      sfx.lamp(i, t0 + i * st);
      after((0.11 + i * st) * 1000, () => l.classList.add('is-on'));
    });
    sfx.stamp(t0 + 5 * st);
    after((0.11 + 5 * st) * 1000, () => {
      done.classList.add('is-on');
      doneTxt.textContent = '承認済';
      vibrate(10);
      const dr = done.getBoundingClientRect();
      sparks({ x: dr.left + dr.width / 2, y: dr.top + dr.height / 2 }, 12, ['#36e08b', '#fffdf3', '#ffb81f']);
      // 伝票が打ち出される
      ticket.classList.add('is-on');
      sfx.print(6);
      after(180, () => sfx.print(6));
      after(360, () => sfx.print(5));
      later.hidden = true;
      back.hidden = false;
      hud.proposal(false);
      syncLayers();
      G.on.approved();
    });
  };
  const springBack = () => {
    sfx.leverBack();
    auto = { from: pos, to: 0, t: 0, ms: 150, then: null };
  };
  const pull = () => {
    if (engaged || auto) return;
    // 押しただけでも、レバーが自分で落ちる（0.17 秒）
    auto = { from: pos, to: TRAVEL, t: 0, ms: env.calm() ? 1 : 170, then: engage };
  };
  const offLever = loop.add((dt) => {
    if (!auto) return;
    auto.t += dt;
    const k = Math.min(1, auto.t / auto.ms);
    const e = auto.to > auto.from ? k * k : 1 - (1 - k) * (1 - k);
    pos = auto.from + (auto.to - auto.from) * e;
    const det = Math.floor(pos / 12);
    if (det !== lastDet && auto.to > auto.from) {
      lastDet = det;
      sfx.detent(pos / TRAVEL);
    }
    paint();
    if (k >= 1) {
      const then = auto.then;
      auto = null;
      then?.();
    }
  });
  lever.addEventListener('pointerdown', (e) => {
    if (engaged || auto) return;
    lever.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, p0: pos, moved: 0 };
    lever.classList.add('is-drag');
    sfx.press(true);
  });
  lever.addEventListener('pointermove', (e) => {
    if (!drag || engaged) return;
    const d = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(d));
    pos = Math.max(0, Math.min(TRAVEL, drag.p0 + d));
    const det = Math.floor(pos / 12);
    if (det !== lastDet) {
      lastDet = det;
      sfx.detent(pos / TRAVEL);
    }
    paint();
    if (pos >= TRAVEL) {
      drag = null;
      lever.classList.remove('is-drag');
      engage();
    }
  });
  const up = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    lever.classList.remove('is-drag');
    if (engaged) return;
    if (d.moved < 6) pull();
    else if (pos > TRAVEL * 0.6) auto = { from: pos, to: TRAVEL, t: 0, ms: 70, then: engage };
    else springBack();
  };
  lever.addEventListener('pointerup', up);
  lever.addEventListener('pointercancel', up);
  lever.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      sfx.press(true);
      pull();
    }
  });

  const flash = h('i.c-prop-flash');
  const card = h(
    'div.c-prop-card.c-plate',
    h('div.c-screws'),
    flash,
    h('div.c-prop-head', h('span.c-tape.c-tape--amber', '提案書'), h('span.t-dim', '物流部より'), key(h('span.vh', '閉じる'), () => close(), { ico: 'close', cls: 'c-sheet-x', attrs: { 'aria-label': '閉じる' } })),
    h('div.c-prop-say', h('span.c-tape.c-prop-name', h('b', hero.name), h('span', hero.role)), text),
    h(
      'div.c-prop-main',
      h(
        'div.c-prop-effect',
        h('div.c-prop-row', h('span.c-tape.c-tape--dark', '効果'), h('span', 'この町の売上（月）')),
        h('div.c-prop-big', icon('up', { color: '#36e08b' }), h('span.num.c-bleed', '+12,400 G')),
        h('div.c-prop-row', h('span.c-tape.c-tape--dark', '費用'), h('span', h('span.num', '0 G'), '　すぐ効きます')),
        h('div.c-prop-lamps', lamps),
        done,
      ),
      h('div.c-lever-box', lever, cap),
    ),
    h('div.c-ticket-slot', ticket),
    h('div.c-prop-foot', later, back),
  );
  const el = h('section.c-prop', { role: 'dialog', 'aria-label': '部長の提案' }, h('div.c-prop-wrap.c-float', face, card));
  if (engaged) {
    // もう承認してある（目次から来たときなど）
    pos = TRAVEL;
    paint();
    lever.classList.add('is-on');
    cap.replaceChildren(h('span.t-good', 'つながった'));
    lamps.forEach((l) => l.classList.add('is-on'));
    done.classList.add('is-on');
    doneTxt.textContent = '承認済';
    ticket.classList.add('is-on');
    later.hidden = true;
    back.hidden = false;
  }

  let typing = null;
  function close(instant) {
    if (closed) return;
    closed = true;
    G.open = G.open.filter((f) => f !== close);
    typing?.skip();
    const finish = () => {
      el.remove();
      offLever();
      hud.dock.classList.remove('is-off');
      dim.classList.remove('is-on');
      release();
      G.prop = null;
      G.on.proposalClosed();
    };
    if (instant) return finish();
    sfx.close();
    wipe.play(origin, finish, { reverse: true, label: '地図' });
  }
  G.prop = { close };
  G.open.push(close);
  sfx.open();
  wipe.play(origin, () => {
    G.layer.append(el);
    // 提案を読むあいだ、下の帯は引っこむ（札に場所をゆずる）
    hud.dock.classList.add('is-off');
    dim.classList.add('is-on');
    dim.classList.remove('is-soft');
    el.classList.add('is-in');
    after(env.calm() ? 0 : 240, () => {
      if (closed) return;
      typing = typeText(text, 'センスを輸入に足すと、この町の売上 月 +12,400 G。港の倉は、もう押さえてあります。', { voice: hero.voice });
    });
  }, { label: '経営企画' });
  text.parentElement.addEventListener('click', () => typing?.skip());
}
