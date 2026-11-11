// 建物を押す → カメラが寄り、吹き出しが建物から立ち上がる。
// 職人の絵は枠の上に立ち、枠をはみ出す。セリフは 1 字ずつ、長さに合わせて枠が伸び縮みする。
import { G, hold } from './game.js';
import { HERO, WS_LINES } from './data.js';
import { heroEl } from './hud.js';
import { h, key, press, typeText, loop, toast, env } from './ui.js';

const TAIL = `<svg viewBox="0 0 12 8" width="24" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 0h2v1h1v1h1v1h1v1h1v1h1v3H0V5h1V4h1V3h1V2h1V1h1z" fill="#1a1c2e"/><path d="M5 2h2v1h1v1h1v1h1v1h1v2H1V6h1V5h1V4h1V3h1z" fill="#f4ecd4"/></svg>`;

export function openPop() {
  if (G.pop) return;
  const { world, sfx } = G;
  const release = hold();
  const dim = document.getElementById('dim');
  const hero = HERO.hokusai;
  let idx = 0;
  let typing = null;
  let closed = false;

  const bgT = h('i.c-pop-t');
  const bgM = h('i.c-pop-m');
  const bgB = h('i.c-pop-b');
  const text = h('p.c-pop-text');
  const mark = h('span.c-pop-next', '▼');
  const face = heroEl('hokusai', 2, 'c-pop-face');
  const count = h('span.c-pop-count.t-dim', `1/${WS_LINES.length}`);
  const say = h('div.c-pop-say', { role: 'button', tabindex: '0', 'aria-label': 'セリフを送る' }, text, h('div.c-pop-foot', count, mark));
  const tail = h('span.c-pop-tail', { html: TAIL });
  const bubble = h('div.c-pop-bubble');
  const rise = h(
    'div.c-pop-rise',
    h('div.c-pop-bg', bgT, bgM, bgB),
    tail,
    h('div.c-pop-who', face, h('span.c-tape.c-pop-name', h('b', hero.name), h('span', hero.role))),
    key(h('span.vh', '閉じる'), () => close(), { ico: 'close', cls: 'c-pop-x', attrs: { 'aria-label': '閉じる' } }),
    say,
  );
  bubble.append(rise);
  const actions = h(
    'div.c-pop-actions',
    key('工房を開く', (b) => G.on.openWorkshop(b), { kind: 'amber', big: true, ico: 'hammer', strong: true, cls: 'c-pop-main' }),
    key(h('span.c-pop-up', h('b', '町工場にする（1×2）'), h('span.num', '30,000 G')), () => {
      sfx.decide();
      toast('建て替えは、この見本ではここまで。「工房を開く」をどうぞ');
    }),
  );
  const el = h('div.c-pop', { role: 'dialog', 'aria-label': `${hero.name}の話` }, bubble, actions);

  // 枠の伸び縮み：上のふち・まん中・下のふちの 3 つに分け、まん中を縦に伸ばす（transform だけで動かす）
  let curH = 0;
  let tween = null;
  const BASE = 100;
  const paint = (hh) => {
    const mid = Math.max(4, hh - 16);
    bgM.style.transform = `scaleY(${(mid / BASE).toFixed(4)})`;
    bgB.style.transform = `translate3d(0,${Math.round(mid)}px,0)`;
  };
  const fit = (animate) => {
    const target = bubble.offsetHeight;
    if (!animate || env.calm() || !curH) {
      curH = target;
      tween = null;
      paint(target);
      return;
    }
    tween = { from: curH, to: target, t: 0 };
  };
  const off = loop.add((dt) => {
    // 吹き出しの付け根を、建物（工房の入口）に合わせる
    const [sx, sy] = world.screen(world.wsPos.x, world.wsPos.y + 62);
    const bw = bubble.offsetWidth;
    const left = Math.max(8, Math.min(innerWidth - bw - 8, sx - bw * 0.62));
    bubble.style.transform = `translate3d(${Math.round(left)}px,${Math.round(sy)}px,0)`;
    tail.style.transform = `translate3d(${Math.round(Math.max(40, Math.min(bw - 60, sx - left - 12)))}px,0,0)`;
    // 広い画面では、ボタンは吹き出しのすぐ下に付いていく（せまい画面では、押しやすい下に固定）
    if (innerWidth >= 700) actions.style.transform = `translate3d(${Math.round(left)}px,${Math.round(sy + (tween ? tween.to : curH) + 10)}px,0)`;
    else if (actions.style.transform) actions.style.transform = '';
    if (tween) {
      tween.t += dt;
      const k = Math.min(1, tween.t / 220);
      // 少し行き過ぎて戻る
      const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      curH = tween.from + (tween.to - tween.from) * e;
      paint(curH);
      if (k >= 1) {
        curH = tween.to;
        tween = null;
      }
    }
  });

  const speak = (first) => {
    mark.classList.remove('is-on');
    count.textContent = `${idx + 1}/${WS_LINES.length}`;
    typing = typeText(text, WS_LINES[idx], {
      voice: hero.voice,
      onDone: () => mark.classList.add('is-on'),
    });
    fit(!first);
    // 喋りはじめに、人物が小さく跳ねる
    face.classList.remove('is-hop');
    void face.offsetWidth;
    face.classList.add('is-hop');
  };
  const advance = () => {
    if (typing && !typing.done) {
      typing.skip();
      sfx.flap();
      return;
    }
    idx = (idx + 1) % WS_LINES.length;
    sfx.flap();
    speak(false);
  };
  press(say, advance, { silent: true });

  function close(instant) {
    if (closed) return;
    closed = true;
    G.pop = null;
    G.open = G.open.filter((f) => f !== close);
    typing?.skip();
    off();
    release();
    dim.classList.remove('is-on', 'is-soft');
    dim.onpointerdown = null;
    document.getElementById('spot').hidden = false;
    if (instant) {
      el.remove();
      world.focused = false;
      world.snap(world.overview());
      return;
    }
    sfx.close();
    sfx.zoom(false);
    el.classList.add('is-out');
    setTimeout(() => el.remove(), env.calm() ? 0 : 200);
    world.unfocus();
  }

  G.pop = { close, el };
  G.open.push(close);
  document.getElementById('spot').hidden = true;
  dim.classList.add('is-on', 'is-soft');
  dim.onpointerdown = () => close();
  sfx.zoom(true);
  world.focus().then(() => {
    if (closed) return;
  });
  // カメラが寄りきる少し前に、吹き出しが立ち上がる
  setTimeout(
    () => {
      if (closed) return;
      G.layer.append(el);
      sfx.open();
      speak(true);
      el.classList.add('is-in');
    },
    env.calm() ? 0 : 300,
  );
  return G.pop;
}
