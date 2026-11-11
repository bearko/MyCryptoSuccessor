// 工房の画面：作業台 3 台（生きて進む）・作る数・自動製造・タブ（作業台／設備投資）
import { G, hold, syncLayers } from './game.js';
import { HERO, EXT } from './data.js';
import { heroEl, extEl } from './hud.js';
import { icon } from './icons.js';
import { h, key, Odo, loop, fader, toggle, toast, fmt, env, shake, vibrate } from './ui.js';
import { coinsFly } from './fx.js';

const BENCH = [
  { hero: 'hokusai', ext: 'sensu', ms: 4200, p: 0.35 },
  { hero: 'davinci', ext: 'katana', ms: 6800, p: 0.7 },
  { hero: 'gennai', ext: 'book', ms: 9400, p: 0.1 },
];
const INVEST = [
  { id: 'grinder', name: '研磨機', desc: '仕上げが速くなる。製造の速さ +20%', price: 12000 },
  { id: 'kiln', name: '大型の窯', desc: '一度に焼ける数が増える。作業台 +2', price: 480000 },
];

// 作業台は、画面を閉じていても裏で進む（地図の煙とトラックにつながる）
export const benches = BENCH.map((b) => ({ ...b, view: null }));
export function tickBenches(dt) {
  const s = G.s;
  const speed = s.bought ? 1.2 : 1;
  benches.forEach((b, n) => {
    const run = s.auto || b.p > 0;
    if (run) b.p += (dt * speed) / b.ms;
    if (b.p >= 1) {
      b.p = s.auto ? b.p - 1 : 0;
      s.made[n]++;
      G.on.benchDone(n, b);
      b.view?.done();
    }
    b.view?.paint(b.p, run);
  });
}

export function openWorkshop(originEl) {
  if (G.ws) return;
  const { sfx, wipe, hud, world } = G;
  const s = G.s;
  s.wsSeen = true;
  const release = hold();
  const dim = document.getElementById('dim');
  let closed = false;
  const [ox, oy] = world.screen(world.wsPos.x, world.wsPos.y);
  const origin = { x: ox, y: oy };

  // ---- 作業台
  const rows = benches.map((b, n) => {
    const hero = HERO[b.hero];
    const ext = EXT[b.ext];
    const heroSp = heroEl(b.hero, 1, 'c-bench-hero');
    const item = extEl(ext, 1);
    const bar = h('i');
    const meter = h('div.c-meter', bar);
    const lamp = h('i.c-lamp.c-lamp--good.is-on');
    const status = h('span.c-bench-st', '製造中');
    const count = new Odo({ digits: 3, value: s.made[n] });
    const plus = h('span.c-bench-plus.num', '+1');
    const row = h(
      'div.c-bench',
      h('div.c-bench-stage', heroSp, h('i.c-bench-spark'), h('span.c-bench-item', item, plus)),
      h('div.c-bench-info', h('div.c-bench-name', h('span.c-tape.c-tape--dark', { title: `作業台 ${n + 1}` }, String(n + 1)), h('b', ext.name)), h('div.c-bench-who.t-dim', hero.name), meter, h('div.c-bench-foot', lamp, status, h('span.c-bench-count', '今月', count.el, '個'))),
    );
    let lastQ = -1;
    let lastRun = null;
    let hopT = n * 130;
    b.view = {
      paint(p, run) {
        const q = Math.round(Math.min(1, p) * 20) / 20;
        if (q !== lastQ) {
          lastQ = q;
          bar.style.transform = `scaleX(${q})`;
        }
        if (run !== lastRun) {
          lastRun = run;
          lamp.classList.toggle('is-on', run);
          lamp.classList.toggle('c-lamp--good', run);
          status.textContent = run ? '製造中' : '待機中';
          row.classList.toggle('is-idle', !run);
        }
      },
      hop(dt) {
        // 職人が槌を振る：2 コマの小さな上下（止まっているときは息だけ）
        hopT += dt;
        const k = lastRun ? Math.floor(hopT / 190) % 4 : Math.floor(hopT / 900) % 2;
        const y = env.calm() ? 0 : lastRun ? (k === 1 ? -4 : k === 2 ? 2 : 0) : k ? -2 : 0;
        if (y !== b.view.y) {
          b.view.y = y;
          heroSp.style.transform = `translate3d(0,${y}px,0)${hero.right ? '' : ' scaleX(-1)'}`;
          row.classList.toggle('is-hit', lastRun && k === 2);
        }
      },
      done() {
        count.set(s.made[n], { dur: 380 });
        meter.classList.remove('is-flash');
        row.classList.remove('is-done');
        void row.offsetWidth;
        meter.classList.add('is-flash');
        row.classList.add('is-done');
        sfx.complete(n === 0 ? 1 : 0.7);
        ship(ext);
      },
    };
    b.view.paint(b.p, s.auto || b.p > 0);
    return row;
  });
  const offHop = loop.add((dt) => benches.forEach((b) => b.view?.hop(dt)));

  // ---- 出荷のベルト：できた商品が流れて、荷台に積まれる
  const shipped = new Odo({ digits: 3, value: s.made.reduce((a, b) => a + b, 0) });
  const track = h('div.c-belt-track', h('i.c-belt-run'));
  const box = h('span.c-belt-box', icon('truck', { color: '#f4ecd4' }));
  const belt = h('div.c-belt', h('span.c-tape', '出荷'), track, box, h('span.c-belt-n', shipped.el, '個'));
  function ship(ext) {
    const total = s.made.reduce((a, b) => a + b, 0);
    if (env.calm()) return shipped.set(total, { dur: 0 });
    const it = extEl(ext, 0.5);
    it.classList.add('c-belt-item');
    track.append(it);
    const w = track.clientWidth + 40;
    it.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${w}px,0,0)` }], { duration: 1900, easing: `steps(${Math.round(w / 4)}, end)` }).onfinish = () => {
      it.remove();
      shipped.set(total, { dur: 300 });
      box.classList.remove('is-bump');
      void box.offsetWidth;
      box.classList.add('is-bump');
      sfx.flap();
    };
  }

  const qty = new Odo({ digits: 3, value: s.qty });
  const qtyFader = fader({
    min: 10,
    max: 150,
    step: 10,
    value: s.qty,
    label: '作る数',
    onInput: (v, p) => {
      s.qty = v;
      qty.set(v, { dur: 160 });
      sfx.slider(p);
    },
  });
  const autoNote = h('span.c-ctl-note.t-dim', s.auto ? '素材があるかぎり作り続けます' : 'いまの 1 個で止まります');
  const auto = toggle({
    label: '自動製造',
    value: s.auto,
    onChange: (v) => {
      s.auto = v;
      autoNote.textContent = v ? '素材があるかぎり作り続けます' : 'いまの 1 個で止まります';
      world.smokeOn = v;
    },
  });
  const paneBench = h(
    'div.c-pane',
    rows,
    belt,
    h('div.c-ctl', h('div.c-ctl-row', h('span.c-tape', '作る数'), qtyFader.el, h('span.c-ctl-val', qty.el, '個')), h('div.c-ctl-row', h('span.c-tape', '自動製造'), auto.el, autoNote)),
  );

  // ---- 設備投資
  const cards = INVEST.map((it) => {
    const owned = it.id === 'grinder' && s.bought;
    const lamp = h('i.c-lamp.c-lamp--good' + (owned ? '.is-on' : ''));
    const gapBar = h('i');
    const gapTxt = h('span');
    const gap = h('div.c-inv-gap', { hidden: true }, h('div.c-meter', gapBar), gapTxt);
    const stamp = h('span.c-inv-stamp.c-tape.c-tape--good', { hidden: !owned }, icon('check', { color: '#1a1c2e', scale: 1 }), '導入済');
    const buyKey = key(owned ? '導入済' : '買う', () => buy(), { kind: owned ? 'flat' : it.price <= s.funds ? 'amber' : '', cls: 'c-inv-buy', strong: true });
    const desc = h('p.c-inv-desc', owned ? '入りました。作業台が 20% 速くなっています' : it.desc);
    if (owned) desc.classList.add('t-good');
    const card = h(
      'div.c-inv' + (owned ? '.is-owned' : ''),
      h('div.c-inv-pic', icon(it.id, { scale: 4, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' }), lamp),
      h('div.c-inv-body', h('div.c-inv-name', h('b', it.name), stamp), desc, h('div.c-inv-price', icon('coin', { scale: 1 }), h('span.num', `${fmt(it.price)} G`)), gap),
      buyKey,
    );
    function buy() {
      if (card.classList.contains('is-owned')) {
        sfx.flap();
        return;
      }
      if (s.funds < it.price) {
        // 足りない：責めない。あといくらかを、目盛りと言葉でそっと見せる
        sfx.deny();
        gap.hidden = false;
        gapTxt.textContent = `あと ${fmt(it.price - s.funds)} G。売上がたまれば届きます`;
        gapBar.style.transform = 'scaleX(0)';
        gap.classList.remove('is-in');
        void gap.offsetWidth;
        gap.classList.add('is-in');
        requestAnimationFrame(() => (gapBar.style.transform = `scaleX(${Math.max(0.05, Math.round((s.funds / it.price) * 20) / 20)})`));
        return;
      }
      // 買えた：資金が転がって減る → 金貨が飛ぶ → 「導入済」の札が貼られ、ランプが点く
      s.funds -= it.price;
      s.bought = true;
      sfx.buy();
      vibrate(12);
      hud.setFunds(s.funds, 900);
      hud.delta('funds', -it.price);
      const r = card.getBoundingClientRect();
      coinsFly(hud.fundsPos(), { x: r.left + 44, y: r.top + 40 }, 9);
      card.classList.add('is-owned', 'is-bought');
      shake(card);
      setTimeout(
        () => {
          lamp.classList.add('is-on');
          stamp.hidden = false;
          buyKey.className = 'c-key c-key--flat c-inv-buy';
          buyKey.querySelector('b').textContent = '導入済';
          sfx.stamp();
          syncLayers();
          desc.textContent = '入りました。作業台が 20% 速くなっています';
          desc.classList.add('t-good');
        },
        env.calm() ? 0 : 420,
      );
    }
    return card;
  });
  const paneInvest = h('div.c-pane', { hidden: true }, cards, h('p.c-pane-note.t-dim', '設備は、工房のすべての作業台に効きます。'));

  // ---- タブ：表示板が横へ「カタカタ」と送られる
  let tabNow = 0;
  let tabBusy = false;
  const panes = [paneBench, paneInvest];
  const tabKeys = ['作業台', '設備投資'].map((label, n) => {
    const lamp = h('i.c-lamp' + (n === 0 ? '.is-on' : ''));
    const b = key(h('span.c-tab-l', lamp, h('b', label)), () => setTab(n), { cls: 'c-tab', attrs: { role: 'tab', 'aria-selected': String(n === 0), 'aria-pressed': String(n === 0) } });
    b.lamp = lamp;
    return b;
  });
  function setTab(n) {
    if (n === tabNow || tabBusy) return;
    const from = panes[tabNow];
    const to = panes[n];
    const dir = n > tabNow ? 1 : -1;
    tabKeys.forEach((b, k) => {
      b.setAttribute('aria-selected', String(k === n));
      b.setAttribute('aria-pressed', String(k === n));
      b.lamp.classList.toggle('is-on', k === n);
    });
    tabNow = n;
    sfx.tab();
    to.hidden = false;
    if (env.calm()) {
      from.hidden = true;
      return;
    }
    tabBusy = true;
    sfx.page(5, 0.075);
    const opt = { duration: 520, easing: 'steps(8, end)', fill: 'both' };
    from.classList.add('is-leaving');
    from.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(${-dir * 104}%,0,0)` }], opt);
    to.animate([{ transform: `translate3d(${dir * 104}%,0,0)` }, { transform: 'translate3d(0,0,0)' }], opt).onfinish = () => {
      from.hidden = true;
      from.classList.remove('is-leaving');
      from.getAnimations().forEach((a) => a.cancel());
      to.getAnimations().forEach((a) => a.cancel());
      tabBusy = false;
    };
  }

  const sheet = h(
    'section.c-sheet.c-ws',
    { role: 'dialog', 'aria-label': '工房' },
    h(
      'div.c-sheet-plate.c-plate',
      h('div.c-screws'),
      h('div.c-sheet-head', h('h2.c-bleed', '工房'), h('span.c-tape', '本店'), h('span.c-sheet-run', h('i.c-lamp.c-lamp--good.is-on.is-blink'), '稼働中'), key(h('span.vh', '閉じる'), () => close(), { ico: 'close', cls: 'c-sheet-x', attrs: { 'aria-label': '閉じる' } })),
      h('div.c-tabs', { role: 'tablist' }, tabKeys),
      h('div.c-tabbody', panes),
    ),
  );

  function close(instant) {
    if (closed) return;
    closed = true;
    G.open = G.open.filter((f) => f !== close);
    const finish = () => {
      sheet.remove();
      offHop();
      benches.forEach((b) => (b.view = null));
      dim.classList.remove('is-on');
      release();
      G.ws = null;
      G.on.workshopClosed();
    };
    if (instant) return finish();
    sfx.close();
    wipe.play(origin, finish, { reverse: true, label: '地図' });
  }

  G.ws = { close };
  G.open.push(close);
  sfx.open();
  wipe.play(origin, () => {
    G.pop?.close(true);
    G.layer.append(sheet);
    dim.classList.add('is-on');
    dim.classList.remove('is-soft');
  }, { label: '工房' });
}
