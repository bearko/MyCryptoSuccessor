// 制覇：ランプが全部点く → 小太鼓の連打 → 曲の小節の頭でカットイン（2.6 秒・押せば飛ばせる）。
// 大見出しは人物の後ろを通り、テロップの帯は人物の手前を通る。地図には花火、BGM は祝いの曲に替わって戻る。
import { G, hold, syncLayers } from './game.js';
import { TOWN, HERO } from './data.js';
import { heroEl } from './hud.js';
import { icon } from './icons.js';
import { h, key, after, vibrate, env, typeText } from './ui.js';
import { confetti, sparks } from './fx.js';

export function startConquest() {
  if (G.cut) return;
  const { sfx, music, eng, hud, world } = G;
  const s = G.s;
  const release = hold();
  let closed = false;
  let cutDone = false;
  let offs = [];
  const app = document.getElementById('app');
  const hero = HERO.ryoma;

  // 小節の頭に合わせて始める。それまでは、ランプが追いかけっこをして、小太鼓が鳴る
  const t = music.cue('fanfare', 'map');
  const waitMs = Math.max(0, (t - eng.now) * 1000);
  sfx.roll(eng.now + 0.02, t);
  sfx.conquest(t);
  hud.streakChase(true);
  s.conquered = true;
  s.step = 'done';

  const big = h('div.c-cut-big.c-bleed', { 'aria-hidden': 'true' }, h('span', '制'), h('span', '覇'));
  const cut = h(
    'div.c-cut',
    { role: 'dialog', 'aria-label': '制覇' },
    h('div.c-cut-strip', h('div.c-cut-rays'), big),
    h('div.c-cut-band.c-cut-band--t'),
    h('div.c-cut-band.c-cut-band--b'),
    h('div.c-cut-hero', heroEl('ryoma', 5)),
    h('div.c-cut-telop', h('div.c-cut-telop-in', icon('crown', { scale: 3 }), h('b', `${TOWN}を制覇！`))),
    h('div.c-cut-sub', h('span.c-tape.c-tape--amber', '1 位を守りきった')),
    h('div.c-cut-skip.t-dim', '押すと、とばせます'),
  );

  const say = h('p.c-end-say');
  const card = h(
    'section.c-end',
    { role: 'dialog', 'aria-label': '制覇しました' },
    h(
      'div.c-end-wrap.c-float',
      heroEl('ryoma', 2, 'c-end-face'),
      h(
        'div.c-end-card.c-plate',
        h('div.c-screws'),
        h('div.c-end-head', icon('crown', { scale: 3 }), h('h2.c-bleed', '制覇！')),
        h('div.c-end-lamps', Array.from({ length: 9 }, (_, i) => h(`i.c-lamp.is-on${i % 3 === 0 ? '.c-lamp--good' : i % 3 === 1 ? '' : '.c-lamp--cyan'}`))),
        h('div.c-end-bubble', h('span.c-tape.c-prop-name', h('b', hero.name), h('span', hero.role)), say),
        h('div.c-end-keys', key('もう一度見る', () => G.on.replay(), { kind: 'amber', big: true, strong: true }), key('目次', () => G.on.toc(), { ico: 'list' }), key('町をながめる', () => close())),
      ),
    ),
  );

  function endCut() {
    if (cutDone || closed) return;
    cutDone = true;
    cut.classList.add('is-out');
    after(env.calm() ? 0 : 220, () => {
      cut.remove();
      if (closed) return;
      G.layer.append(card);
      card.classList.add('is-in');
      sfx.open();
      confetti(4);
      typeText(say, `やりましたね。${TOWN}は、もうあなたの町です。次の町が、海の向こうで待っていますよ。`, { voice: hero.voice });
    });
  }

  function close(instant) {
    if (closed) return;
    closed = true;
    G.open = G.open.filter((f) => f !== close);
    offs.forEach((f) => f());
    cut.remove();
    card.remove();
    hud.streakChase(false);
    release();
    G.cut = null;
    document.getElementById('dim').classList.remove('is-on', 'is-soft');
    if (!instant) sfx.close();
    G.on.conquestClosed();
  }
  G.cut = { close };
  G.open.push(close);

  offs.push(
    after(waitMs, () => {
      if (closed) return;
      app.append(cut);
      hud.streakChase(false);
      hud.setStreak(99, true);
      world.celebrate(12);
      vibrate([30, 50, 30]);
      syncLayers();
      hud.refresh();
      cut.addEventListener('pointerdown', () => {
        sfx.flap();
        endCut();
      });
      const r = big.getBoundingClientRect();
      offs.push(after(380, () => sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }, 22)));
      offs.push(after(env.calm() ? 1800 : 2600, endCut));
    }),
  );
}
