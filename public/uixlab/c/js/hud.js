// 常設の UI：上の帯（資金・今月の売上・順位・ブランド力・日付・速さ）・ニュースのテロップ・つぎの一手の札・下の帯（5 つの入口）
import { G, STREAK_DAYS } from './game.js';
import { NEWS, HERO, ATLAS } from './data.js';
import { icon } from './icons.js';
import { h, key, press, Odo, toast, fmt, env } from './ui.js';

/** ヒーローの絵（表から 1 升を切り出して、整数倍で出す） */
export function heroEl(id, scale = 2, cls = '') {
  const hero = HERO[id];
  const c = hero.cell;
  const el = h(`span.c-hero${cls ? '.' + cls : ''}`, { 'aria-hidden': 'true' });
  const px = 64 * scale;
  Object.assign(el.style, {
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: `url(${ATLAS.hero})`,
    backgroundSize: `${1024 * scale}px ${1024 * scale}px`,
    backgroundPosition: `${-(c % 16) * px}px ${-Math.floor(c / 16) * px}px`,
  });
  return el;
}
export function extEl(ext, scale = 1) {
  const c = ext.cell;
  const el = h('span.c-ext', { 'aria-hidden': 'true' });
  const px = 64 * scale;
  Object.assign(el.style, {
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: `url(${ATLAS.ext})`,
    backgroundSize: `${1024 * scale}px ${1024 * scale}px`,
    backgroundPosition: `${-(c % 16) * px}px ${-Math.floor(c / 16) * px}px`,
  });
  return el;
}

export function buildHud(app, on) {
  const s = G.s;
  const funds = new Odo({ digits: 6, value: s.funds });
  const sales = new Odo({ digits: 7, value: s.sales, cls: 'c-odo--amber' });
  const fundsD = h('span.c-delta.num');
  const rankNum = h('span.c-flap.num', String(s.rank));
  const brand = h('b.num', String(s.brand));
  const date = h('span.c-date-txt');
  const dayBar = h('i');
  const streak = h('div.c-streak', { hidden: true }, h('span', '制覇まで'), h('span.c-streak-lamps', Array.from({ length: STREAK_DAYS }, () => h('i.c-lamp.c-lamp--good'))));

  const speedKeys = [
    ['pause', 0, '一時停止'],
    ['play', 1, '再生'],
    ['ff', 4, '早送り'],
  ].map(([ico, v, label]) => {
    // 点いているキーは金色になる：その上では絵を濃い色に替える
    const b = key(h('span.c-speed-ico', icon(ico, { cls: 'is-dim' }), icon(ico, { color: '#1a1c2e', cls: 'is-lit' }), h('span.vh', label)), () => on.speed(v), { cls: 'c-speed-key', attrs: { 'aria-label': label, 'aria-pressed': String(s.speed === v), 'data-v': v } });
    b.style.setProperty('--lit', 'var(--amber)');
    return b;
  });

  const plate = h(
    'header.c-hud.c-plate',
    h('div.c-screws'),
    h(
      'div.c-hud-row',
      h('div.c-gauge', h('span.c-tape', '資金'), fundsD, h('span.c-gauge-win', funds.el, h('span.c-unit.num', 'G'))),
      h('div.c-gauge', h('span.c-tape', '今月の売上'), h('span.c-gauge-win', sales.el, h('span.c-unit.num', 'G'))),
      h('div.c-rank', { 'aria-live': 'polite' }, h('span.c-tape', 'エリア'), h('span.c-rank-win', rankNum, h('span.c-rank-unit', '位'))),
    ),
    h(
      'div.c-hud-row.c-hud-row--b',
      h('div.c-chip', { title: 'ブランド力' }, icon('star', { color: '#ffb81f' }), brand, h('span.vh', 'ブランド力')),
      h('div.c-date', date, h('div.c-meter.c-meter--cyan', dayBar)),
      h('div.c-speed', { role: 'group', 'aria-label': '時間の進み' }, speedKeys),
    ),
  );

  // ニュースのテロップ：点々の電光板。字は 2px ずつ送る
  const run = h('div.c-ticker-run');
  const layerLamps = Array.from({ length: 5 }, () => h('i.c-lamp.c-lamp--cyan'));
  const ticker = h('div.c-ticker', h('span.c-ticker-tag', h('i.c-lamp.c-lamp--bad.is-on.is-blink'), 'NEWS'), h('div.c-ticker-win', run), h('div.c-layers', { title: 'BGM の層' }, icon('note', { color: '#5fe4ff', scale: 1 }), layerLamps));
  const setNews = (extra) => {
    const list = extra ? [extra, ...NEWS] : NEWS;
    run.replaceChildren(...list.flatMap((t) => [h('span', t), h('span.c-ticker-dot', '◆')]));
    const w = run.scrollWidth + innerWidth;
    run.style.setProperty('--w', `${w}px`);
    run.style.animationDuration = `${Math.round(w / 64)}s`;
    run.style.animationTimingFunction = `steps(${Math.round(w / 2)}, end)`;
    run.style.animationName = 'none';
    void run.offsetWidth;
    run.style.animationName = '';
  };

  // つぎの一手の札（押すと、その場所を教える）と、目次のボタン
  const guideTxt = h('b');
  const guide = h('button.c-guide', { type: 'button' }, h('span.c-guide-in', h('span.c-guide-k', 'つぎ'), icon('next', { color: '#1a1c2e', scale: 1 }), guideTxt));
  press(guide, () => on.guide());
  const toc = h('button.c-toc-btn', { type: 'button', 'aria-label': '目次（好きな場面へ）' }, h('span.c-toc-in', icon('list', { color: '#1a1c2e', scale: 1 }), h('b', '目次')));
  press(toc, () => on.toc());
  ticker.append(toc);

  const top = h('div.c-top', plate, ticker);
  const under = h('div.c-under', guide, streak);
  // 上の帯の下端を CSS に教える（札やテープは、その下から出る）
  const measure = () => document.documentElement.style.setProperty('--top-h', `${top.offsetTop + ticker.offsetTop + ticker.offsetHeight}px`);
  new ResizeObserver(measure).observe(plate);
  requestAnimationFrame(measure);

  // 下の帯
  const lamp = h('i.c-lamp.c-lamp--bad');
  const mk = (id, label, ico, main) => {
    const b = key(h('span.c-dock-l', label), () => on.dock(id, b), { kind: main ? 'amber' : '', ico, cls: main ? 'c-dock-key.c-dock-main' : 'c-dock-key', strong: main, attrs: { 'data-id': id } });
    return b;
  };
  const center = mk('plan', '経営企画', 'star4', true);
  center.append(h('span.c-dock-badge', lamp));
  const peek = h('button.c-peek', { type: 'button', hidden: true, 'aria-label': '物流部長から提案があります' }, heroEl('polo', 2), h('span.c-peek-say', '提案があります'));
  press(peek, () => on.dock('plan', center));
  const dock = h('nav.c-dock', { 'aria-label': '部門' }, peek, h('div.c-dock-plate.c-plate', mk('logi', '物流', 'truck'), mk('hr', '人事', 'people'), center, mk('mkt', 'マーケ', 'horn'), mk('sys', 'システム', 'gear')));

  app.append(top, under, dock);
  setNews();

  const GUIDE = {
    ws: '工房を押す',
    prop: '経営企画の提案をみる',
    wait: '月末を待つ（早送りできます）',
    streak: '1 位を守って、制覇へ',
    done: 'もう一度見る',
  };
  let lastDate = '';
  const hud = {
    top,
    under,
    dock,
    funds,
    sales,
    center,
    /** 増えた・減ったぶんを、数字の上に小さく出す（色・符号・向きの 3 つで伝える） */
    delta(which, n) {
      const el = fundsD;
      el.replaceChildren(n < 0 ? icon('down', { color: '#ff5964', scale: 1 }) : '', `${n < 0 ? '-' : '+'}${fmt(Math.abs(n))}`);
      el.classList.toggle('is-down', n < 0);
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
    },
    setFunds(v, dur = 700) {
      funds.set(v, { dur, onTick: () => env.sfx?.tick() });
    },
    setSales(v, dur = 600) {
      sales.set(v, { dur });
    },
    setRank(n) {
      if (rankNum.textContent === String(n)) return;
      rankNum.classList.remove('is-flip');
      void rankNum.offsetWidth;
      rankNum.classList.add('is-flip');
      setTimeout(() => (rankNum.textContent = String(n)), env.calm() ? 0 : 140);
      plate.querySelector('.c-rank').classList.toggle('is-top', n === 1);
    },
    setBrand(n) {
      brand.textContent = String(n);
    },
    setDate() {
      const t = `${G.s.year}年目 ${G.s.month}月${G.s.day}日`;
      if (t !== lastDate) {
        // 日付が変わると、札が「パタッ」とめくれる
        if (lastDate) {
          date.classList.remove('is-flip');
          void date.offsetWidth;
          date.classList.add('is-flip');
        }
        lastDate = t;
        date.textContent = t;
      }
      // 1 日の進みは、8 段の目盛り
      dayBar.style.transform = `scaleX(${Math.round(G.s.dayFrac * 12) / 12})`;
    },
    setSpeed(v) {
      for (const b of speedKeys) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === v));
    },
    setGuide() {
      guideTxt.textContent = GUIDE[G.s.step] ?? '';
      guide.classList.remove('is-new');
      void guide.offsetWidth;
      guide.classList.add('is-new');
    },
    setStreak(n, show) {
      streak.hidden = !show;
      [...streak.querySelectorAll('.c-lamp')].forEach((l, i) => l.classList.toggle('is-on', i < n));
    },
    streakChase(on) {
      streak.classList.toggle('is-chase', on);
    },
    setLayers(n) {
      layerLamps.forEach((l, i) => l.classList.toggle('is-on', i < n));
    },
    beat(frac) {
      // 曲の拍で、層のランプがかすかに脈を打つ
      ticker.classList.toggle('is-beat', frac < 0.18);
    },
    proposal(on) {
      lamp.classList.toggle('is-on', on);
      lamp.classList.toggle('is-blink', on);
      peek.hidden = !on;
      if (on) {
        peek.classList.remove('is-in');
        void peek.offsetWidth;
        peek.classList.add('is-in');
      }
    },
    news(t) {
      setNews(t);
    },
    refresh() {
      funds.set(G.s.funds, { dur: 0 });
      sales.set(G.s.sales, { dur: 0 });
      rankNum.textContent = String(G.s.rank);
      plate.querySelector('.c-rank').classList.toggle('is-top', G.s.rank === 1);
      brand.textContent = String(G.s.brand);
      hud.setDate();
      hud.setSpeed(G.s.speed);
      hud.setGuide();
      hud.setStreak(G.s.streak, G.s.step === 'streak');
      hud.proposal(G.s.propReady && !G.s.approved);
    },
    /** 資金のカウンターの画面上の場所（金貨が飛ぶ先） */
    fundsPos() {
      const r = funds.el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    notYet(label) {
      toast(`「${label}」は、この見本では開きません。「システム」は開きます`);
    },
    fmt,
  };
  return hud;
}
