// 月次報告：紙テープが打ち出される。売上が数え上がり（金貨の音が上がっていく）、順位が 2 位から 1 位へ。
// ページ送りは 600ms：紙が「ジジジ」と送られ、次のページが 1 行ずつ打たれる。
// どの場面でも、押せばすぐ先へ進む（数え上げを待たせない）。
import { G, hold, syncLayers } from './game.js';
import { REPORT } from './data.js';
import { icon } from './icons.js';
import { h, key, Odo, after, fmt, env, shake, vibrate } from './ui.js';
import { coinsPop, sparks } from './fx.js';

/** 「104.7万」：数字は数字の書体、単位は日本語の書体で */
const man = (v) => (v >= 10000 ? h('span.c-man', h('span.num', String(Math.round(v / 1000) / 10)), '万') : h('span.c-man', h('span.num', fmt(v))));

export function openReport() {
  if (G.report) return;
  const { sfx, wipe, music, hud } = G;
  const s = G.s;
  const release = hold();
  let closed = false;
  let page = -1;
  let busy = false;
  let skipPage = null; // いまのページの演出を一気に終わらせる
  const timers = [];
  const later = (ms, fn) => {
    const off = after(env.calm() ? 0 : ms, fn);
    timers.push(off);
    return off;
  };
  const clearTimers = () => {
    while (timers.length) timers.pop()();
  };

  const line = (...kids) => h('div.c-rl', ...kids);
  /** 行を順に打ち出す */
  const printLines = (root, gap = 110, t0 = 0) => {
    const ls = [...root.querySelectorAll('.c-rl')];
    ls.forEach((l, i) =>
      later(t0 + i * gap, () => {
        l.classList.add('is-on');
        sfx.print(3 + (i % 3));
      }),
    );
    return t0 + ls.length * gap;
  };
  const showAll = (root) => root.querySelectorAll('.c-rl').forEach((l) => l.classList.add('is-on'));

  // ---- 1 ページ目：売上
  function pageSales() {
    const odo = new Odo({ digits: 7, size: 'xl', value: 0, cls: 'c-odo--paper' });
    const diff = REPORT.sales - REPORT.last;
    const bars = [
      { label: '先月', v: REPORT.last },
      { label: '今月', v: REPORT.sales, main: true },
    ].map((b) => {
      const fill = h('i' + (b.main ? '.is-main' : ''));
      fill.style.setProperty('--h', `${Math.round((b.v / REPORT.sales) * 100)}%`);
      return h('div.c-mini-col', man(b.v), h('div.c-mini-bar', fill), h('span', b.label));
    });
    const el = h(
      'div.c-rp-page',
      line(h('span.c-rl-k', `${s.month}月の売上`)),
      line(h('span.c-rp-total', odo.el, h('span.num.c-rp-g', 'G'))),
      h('div.c-rl.c-rule'),
      line(h('span.c-rcp', h('span', '先月の売上'), h('i'), h('span.num', `${fmt(REPORT.last)} G`))),
      line(h('span.c-rcp.is-good', h('b', icon('up', { color: '#14804c', scale: 1 }), '先月比'), h('i'), h('span.num', `+${fmt(diff)} G`))),
      line(h('span.c-rp-diff', h('b', `先月より ${Math.round((diff / REPORT.last) * 100)}% 増えました。`))),
      h('div.c-rl.c-mini', bars),
    );
    const run = () => {
      const ls = [...el.querySelectorAll('.c-rl')];
      let done = false;
      [0, 1].forEach((i) => later(i * 130, () => { ls[i].classList.add('is-on'); sfx.print(4); }));
      const finish = () => {
        if (done) return;
        done = true;
        clearTimers();
        ls[0].classList.add('is-on');
        ls[1].classList.add('is-on');
        odo.finish();
        odo.el.classList.add('is-done');
        sfx.deposit(1.4);
        const r = odo.el.getBoundingClientRect();
        coinsPop({ x: r.left + r.width / 2, y: r.top }, 10, 1.2);
        // 数え終わってから、先月比を打ち出す（結果を先に見せない）
        ls.slice(2).forEach((l, i) =>
          later(200 + i * 130, () => {
            l.classList.add('is-on');
            sfx.print(3 + (i % 3));
            if (i === ls.length - 3) {
              el.classList.add('is-grown');
              skipPage = null;
            }
          }),
        );
        skipPage = () => {
          clearTimers();
          showAll(el);
          el.classList.add('is-grown');
          skipPage = null;
        };
      };
      later(300, () => {
        if (done) return;
        odo.set(REPORT.sales, {
          dur: 1900,
          ease: (x) => 1 - Math.pow(1 - x, 2.2),
          onTick: (k) => {
            sfx.coin(k);
            if (Math.random() < 0.3) {
              const r = odo.el.getBoundingClientRect();
              coinsPop({ x: r.left + r.width * (0.2 + Math.random() * 0.6), y: r.top + 4 }, 1, 0.5);
            }
          },
          onDone: finish,
        });
      });
      skipPage = finish;
    };
    return { el, run };
  }

  // ---- 2 ページ目：企業ランキング（順位は横の棒）
  function pageRank() {
    const max = 1100000;
    const rows = REPORT.ranking.map((r) => {
      const me = r.id === 'me';
      const v0 = me ? r.prev : r.sales;
      const bar = h('i');
      bar.style.transform = `scaleX(${(v0 / max).toFixed(3)})`;
      const num = h('span.c-rk-n.num');
      const val = h('span.c-rk-v.num', fmt(v0));
      const row = h('div.c-rk-row' + (me ? '.is-me' : ''), me ? h('span.c-rk-crown', icon('crown', { scale: 2 })) : null, num, h('div.c-rk-body', h('div.c-rk-name', h(me ? 'b' : 'span', r.name)), h('div.c-rk-bar', bar)), val);
      return { r, me, row, bar, num, val, v: v0 };
    });
    const order = (list) => [...list].sort((a, b) => b.v - a.v);
    const place = (animate) => {
      const sorted = order(rows);
      sorted.forEach((x, i) => {
        x.num.textContent = String(i + 1);
        const y = i * 100;
        if (x.y !== y) {
          x.y = y;
          x.row.style.transitionDuration = animate ? '' : '0s';
          x.row.style.transform = `translate3d(0,${y}%,0)`;
        }
      });
    };
    place(false);
    const badge = h('div.c-rkb', h('span', 'エリア順位'), h('span.c-rkb-win', h('span.c-rkb-n.num', '2'), h('span', '位')), icon('next', { color: '#1a1c2e' }), h('span.c-rkb-win.is-new', h('span.c-rkb-n.num', '1'), h('span', '位')));
    const list = h('div.c-rk', rows.map((x) => x.row));
    const gapV = REPORT.sales - REPORT.ranking[0].sales;
    const el = h(
      'div.c-rp-page',
      line(h('span.c-rl-k', '企業ランキング')),
      h('div.c-rl', list),
      h('div.c-rl', badge),
      line(h('span.c-rcp.is-good', h('b', icon('up', { color: '#14804c', scale: 1 }), '2 位との差'), h('i'), h('span.num', `+${fmt(gapV)} G`))),
      line(h('span', h('b', '1 位を 7 日守る'), 'と、この町を制覇できます。')),
    );
    const me = rows.find((x) => x.me);
    const top = () => {
      G.s.rank = 1;
      hud.setRank(1);
    };
    const run = () => {
      let done = false;
      const ls = [...el.querySelectorAll('.c-rl')];
      [0, 1].forEach((i) => later(i * 120, () => { ls[i].classList.add('is-on'); sfx.print(4); }));
      const up = () => {
        // 順位が入れ替わる瞬間：行が入れ替わり、上の帯の順位の札もいっしょにめくれる
        place(true);
        sfx.rankup();
        vibrate(18);
        shake(list);
        top();
        const r = me.row.getBoundingClientRect();
        sparks({ x: r.left + 20, y: r.top - 36 }, 18);
        later(140, () => {
          ls[2].classList.add('is-on');
          badge.classList.add('is-up');
          sfx.flap();
        });
        later(520, () => { el.classList.add('is-crowned'); sfx.decide(); });
        [3, 4].forEach((i, n) => later(760 + n * 140, () => { ls[i].classList.add('is-on'); sfx.print(4); if (n === 1) skipPage = null; }));
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearTimers();
        me.v = me.r.sales;
        me.bar.style.transform = `scaleX(${(me.v / max).toFixed(3)})`;
        me.val.textContent = fmt(me.v);
        place(false);
        showAll(el);
        badge.classList.add('is-up');
        el.classList.add('is-crowned');
        top();
        skipPage = null;
      };
      // わが社の棒が伸びて、数字が上がり、1 位を追い抜く
      later(520, () => {
        const from = me.r.prev;
        const to = me.r.sales;
        const steps = 22;
        let swapped = false;
        for (let k = 1; k <= steps; k++)
          later(k * 42, () => {
            if (done) return;
            const e = 1 - Math.pow(1 - k / steps, 2);
            me.v = Math.round(from + (to - from) * e);
            me.bar.style.transform = `scaleX(${(me.v / max).toFixed(3)})`;
            me.val.textContent = fmt(me.v);
            sfx.coin(0.2 + (k / steps) * 0.8);
            if (!swapped && me.v > rows[0].v) {
              swapped = true;
              up();
            }
          });
      });
      skipPage = finish;
    };
    return { el, run };
  }

  // ---- 3 ページ目：月次売上の推移（縦の棒が伸びる）
  function pageTrend() {
    const max = 1200000;
    const cols = REPORT.trend.map((d, i) => {
      const last = i === REPORT.trend.length - 1;
      const bar = h('i' + (last ? '.is-main' : ''));
      bar.style.setProperty('--h', `${Math.max(2, (d.v / max) * 100).toFixed(1)}%`);
      const val = h('span.c-tr-v', man(d.v));
      val.style.setProperty('--h', `${Math.max(2, (d.v / max) * 100).toFixed(1)}%`);
      return { el: h('div.c-tr-col', h('div.c-tr-plot', val, bar), h('span.c-tr-m', d.m)), bar, val };
    });
    const grid = [0, 50, 100].map((v) => {
      const g = h('div.c-tr-grid', h('span', v ? `${v}万` : '0'));
      g.style.setProperty('--y', String((v * 10000) / max));
      return g;
    });
    const chart = h('div.c-tr', grid, h('div.c-tr-cols', cols.map((c) => c.el)));
    const el = h(
      'div.c-rp-page',
      line(h('span.c-rl-k', '月次売上の推移'), h('span.c-tr-unit', '単位：G')),
      h('div.c-rl', chart),
      line(h('span.c-rp-diff', icon('up', { color: '#14804c', scale: 1 }), h('b', '4 か月で 25 倍'))),
      line(h('span', '5 か月つづけて伸びています。')),
    );
    const run = () => {
      let done = false;
      const ls = [...el.querySelectorAll('.c-rl')];
      [0, 1].forEach((i) => later(i * 120, () => { ls[i].classList.add('is-on'); sfx.print(4); }));
      cols.forEach((c, i) =>
        later(360 + i * 190, () => {
          if (done) return;
          c.el.classList.add('is-on');
          // 棒が伸びるたびに、和音を 1 段上がる
          sfx.lamp(i);
          if (i === cols.length - 1) {
            sfx.deposit(1.3);
            const r = c.el.getBoundingClientRect();
            later(300, () => sparks({ x: r.left + r.width / 2, y: r.top + 20 }, 12));
          }
        }),
      );
      [2, 3].forEach((i, n) => later(360 + cols.length * 190 + 240 + n * 140, () => { ls[i].classList.add('is-on'); sfx.print(5); if (n === 1) skipPage = null; }));
      skipPage = () => {
        if (done) return;
        done = true;
        clearTimers();
        showAll(el);
        cols.forEach((c) => c.el.classList.add('is-on'));
        skipPage = null;
      };
    };
    return { el, run };
  }

  const PAGES = [pageSales, pageRank, pageTrend];
  const pageLamps = PAGES.map(() => h('i.c-lamp'));
  const pageNo = h('span.num', '1/3');
  const paper = h('div.c-rp-paper');
  const nextKey = key('つぎへ', () => next(), { kind: 'amber', big: true, ico: 'next', cls: 'c-rp-next', strong: true });
  const head = h('div.c-rp-head', h('h2.c-bleed', '月次報告'), h('span.c-tape', `${s.year}年目 ${s.month}月`), key('とばす', () => close(), { cls: 'c-rp-skip' }));
  const printer = h('div.c-rp-printer.c-plate', h('div.c-screws'), h('span.c-tape.c-tape--dark', '印字'), h('i.c-lamp.c-lamp--good.is-on.is-blink'), h('div.c-rp-slot'), h('div.c-rp-pages', pageLamps, pageNo));
  const win = h('div.c-rp-win', paper);
  const el = h('section.c-report', { role: 'dialog', 'aria-label': '月次報告' }, head, printer, win, h('div.c-rp-foot', h('span.c-rp-tip.t-dim', '紙を押すと、すぐ出ます'), nextKey));
  win.addEventListener('click', () => {
    if (skipPage) {
      sfx.flap();
      skipPage();
    }
  });

  let cur = null;
  function show(n) {
    if (busy) return;
    clearTimers();
    skipPage?.();
    const pg = PAGES[n]();
    page = n;
    pageLamps.forEach((l, i) => l.classList.toggle('is-on', i <= n));
    pageNo.textContent = `${n + 1}/${PAGES.length}`;
    nextKey.querySelector('b').textContent = n === PAGES.length - 1 ? '地図へもどる' : 'つぎへ';
    const old = cur;
    cur = pg.el;
    paper.append(pg.el);
    if (!old || env.calm()) {
      old?.remove();
      pg.run();
      return;
    }
    // 紙を送る：古いページは下へ出ていき、新しいページが印字口から降りてくる（600ms・9 段）
    busy = true;
    sfx.page(8, 0.068);
    printer.classList.add('is-feed');
    const opt = { duration: 600, easing: 'steps(9, end)', fill: 'both' };
    old.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,104%,0)' }], opt);
    pg.el.animate([{ transform: 'translate3d(0,-104%,0)' }, { transform: 'translate3d(0,0,0)' }], opt).onfinish = () => {
      old.remove();
      pg.el.getAnimations().forEach((a) => a.cancel());
      printer.classList.remove('is-feed');
      busy = false;
      if (!closed) pg.run();
    };
  }
  function next() {
    if (busy) return;
    if (page >= PAGES.length - 1) return close();
    show(page + 1);
  }

  function close(instant) {
    if (closed) return;
    closed = true;
    G.open = G.open.filter((f) => f !== close);
    clearTimers();
    const finish = () => {
      el.remove();
      release();
      G.report = null;
      G.on.reportClosed();
    };
    music.cue('map');
    if (instant) return finish();
    sfx.close();
    wipe.play({ x: innerWidth / 2, y: 0 }, finish, { reverse: true, label: `${G.s.month + 1}月へ` });
  }

  G.report = { close };
  G.open.push(close);
  music.cue('report');
  sfx.bell();
  wipe.play({ x: innerWidth / 2, y: 0 }, () => {
    document.getElementById('app').append(el);
    show(0);
  }, { label: '月次報告' });
  syncLayers();
}
