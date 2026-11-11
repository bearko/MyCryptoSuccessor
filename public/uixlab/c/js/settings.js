// 設定（システム）と、目次
import { G, hold } from './game.js';
import { store, setStore, isCalm } from './store.js';
import { icon } from './icons.js';
import { h, key, fader, toggle, env } from './ui.js';

export function openSettings(originEl) {
  if (G.settings) return;
  const { sfx, wipe } = G;
  const release = hold();
  let closed = false;
  const r0 = originEl?.getBoundingClientRect?.();
  const origin = r0 ? { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 } : { x: innerWidth - 40, y: innerHeight - 40 };

  const row = (label, ctl, note) => h('div.c-set-row', h('span.c-tape', label), h('div.c-set-ctl', ctl), note ? h('p.c-set-note.t-dim', note) : null);
  const val = (v) => h('span.c-set-val.num', String(v));

  const bgmV = val(store.bgm);
  const bgm = fader({
    min: 0, max: 10, step: 1, value: store.bgm, label: 'BGM の音量',
    onInput: (v, p) => { bgmV.textContent = v; setStore({ bgm: v }); sfx.slider(p); },
  });
  const seV = val(store.se);
  const se = fader({
    min: 0, max: 10, step: 1, value: store.se, label: 'SE の音量',
    onInput: (v, p) => { seV.textContent = v; setStore({ se: v }); sfx.slider(p); sfx.deposit(1.2); },
  });
  const mute = toggle({ label: '消音', value: store.mute, on: '消音', off: '鳴らす', onChange: (v) => setStore({ mute: v }) });
  const calm = toggle({ label: '動きを減らす', value: store.calm, onChange: (v) => setStore({ calm: v }) });
  const cvd = toggle({ label: '色覚に配慮した色', value: store.cvd, onChange: (v) => setStore({ cvd: v }) });
  const crt = toggle({ label: '走査線', value: store.crt, onChange: (v) => setStore({ crt: v }) });
  const sizes = [100, 115, 130].map((n) => {
    const b = key(`${n}%`, () => {
      setStore({ text: n });
      sizes.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      sfx.decide();
    }, { cls: 'c-size-key', attrs: { 'aria-pressed': String(store.text === n) } });
    b.style.setProperty('--lit', 'var(--amber)');
    return b;
  });
  const sample = h('div.c-set-sample', h('span.c-set-chip.is-good', icon('up', { color: '#1a1c2e', scale: 1 }), '増えた'), h('span.c-set-chip.is-bad', icon('down', { color: '#1a1c2e', scale: 1 }), '急ぎ'), h('span.t-dim', '色は、形と言葉でも伝えます'));

  const sheet = h(
    'section.c-sheet.c-set',
    { role: 'dialog', 'aria-label': '設定' },
    h(
      'div.c-sheet-plate.c-plate',
      h('div.c-screws'),
      h('div.c-sheet-head', h('h2.c-bleed', 'システム'), h('span.c-tape', '設定'), key(h('span.vh', '閉じる'), () => close(), { ico: 'close', cls: 'c-sheet-x', attrs: { 'aria-label': '閉じる' } })),
      h(
        'div.c-set-body',
        h('h3.c-set-h', icon('note', { color: '#5fe4ff', scale: 1 }), '音'),
        row('BGM', [bgm.el, bgmV]),
        row('SE', [se.el, seV]),
        row('消音', mute.el),
        h('h3.c-set-h', icon('gear', { color: '#5fe4ff', scale: 1 }), '見え方'),
        row('文字の大きさ', h('div.c-sizes', { role: 'group' }, sizes)),
        row('動きを減らす', calm.el, isCalm() && !store.calm ? '端末の設定で、動きを減らしています' : '揺れ・光・カットインを止めます'),
        row('色覚に配慮', cvd.el),
        sample,
        row('走査線', crt.el, 'ブラウン管の線とにじみ'),
      ),
    ),
  );
  function close(instant) {
    if (closed) return;
    closed = true;
    G.open = G.open.filter((f) => f !== close);
    const finish = () => {
      sheet.remove();
      release();
      G.settings = null;
      if (!G.open.length) document.getElementById('dim').classList.remove('is-on');
    };
    if (instant) return finish();
    sfx.close();
    wipe.play(origin, finish, { reverse: true, label: '地図' });
  }
  G.settings = { close };
  G.open.push(close);
  sfx.open();
  wipe.play(origin, () => {
    document.getElementById('app').append(sheet);
    document.getElementById('dim').classList.add('is-on');
  }, { label: 'システム' });
}

const SCENES = [
  ['title', 'はじまり'],
  ['map', '地図と常設の UI'],
  ['pop', '建物を押す → 吹き出し'],
  ['workshop', '工房の画面'],
  ['proposal', '部長の提案 → 承認'],
  ['report', '月次報告'],
  ['conquer', '制覇'],
  ['settings', '設定'],
];
export function openToc() {
  if (G.toc) return G.toc.close();
  const { sfx } = G;
  const release = hold();
  let closed = false;
  const list = h(
    'div.c-toc-list',
    SCENES.map(([id, label], i) =>
      key(h('span.c-toc-l', h('span.num', String(i + 1)), h('b', label)), () => {
        close(true);
        G.on.jump(id);
      }, { cls: 'c-toc-key' }),
    ),
  );
  const el = h('section.c-toc', { role: 'dialog', 'aria-label': '目次' }, h('div.c-toc-plate.c-plate.c-float', h('div.c-sheet-head', h('h2', '目次'), h('span.t-dim', '好きな場面へ'), key(h('span.vh', '閉じる'), () => close(), { ico: 'close', cls: 'c-sheet-x', attrs: { 'aria-label': '閉じる' } })), list));
  el.addEventListener('pointerdown', (e) => {
    if (e.target === el) close();
  });
  function close(instant) {
    if (closed) return;
    closed = true;
    G.toc = null;
    release();
    if (!instant) sfx.close();
    el.classList.add('is-out');
    setTimeout(() => el.remove(), instant || env.calm() ? 0 : 160);
  }
  G.toc = { close };
  sfx.open();
  document.getElementById('app').append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
}
