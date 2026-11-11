/**
 * 段 UIX1a：部品の見本帳（?uix=kit。dev でも本番でも開ける。docs/ISLAND_UIX.md「見本帳」）。
 * 入の状態で、部品を全部並べる：色 2 組・文字 3 段・ボタン 4 種 ×（ふつう・押した・押せない）・器・窓・幕・カウンター・
 * レバー・スイッチ・つまみ・ランプ・計器・吹き出し・枠破り・お知らせ・粒。
 */
import '../island.css';
import './kit.css';
import { isEn, t } from '../../i18n';
import { btn, heroIcon, heroName, sheet } from '../p1/ui';
import { el, type Kid } from './dom';
import { coinsFly, coinsPop, confetti, pressOrigin, sparks, wipe } from './fx';
import { ux } from './hooks';
import { UX_ICONS, uxIcon } from './icons';
import { KEY_KINDS, Odo, forgetRoll, rollNumber, uxBubble, uxCloseKey, uxFader, uxKey, uxLamp, uxLever, uxMeter, uxPlate, uxPlus, uxStand, uxTape, uxToast, uxToggle, type KeyKind } from './parts';
import { prefs, setPrefs, type CalmMode, type UxPrefs } from './prefs';
import { renderUxSettings } from './settings';
import { uxSfx } from './sound';

const KIND_NAME: Record<KeyKind, () => string> = {
  main: () => t('主（琥珀）', 'Main (amber)'),
  '': () => t('ふつう', 'Normal'),
  weak: () => t('弱い', 'Weak'),
  danger: () => t('危ない', 'Danger'),
  flat: () => t('押せない', 'Disabled'),
};
const HERO_A = 5024;
const HERO_B = 4008;

function sec(id: string, title: string, note: string, ...kids: Kid[]): HTMLElement {
  return el(`section.ux-kit-sec`, { id: `kit-${id}` }, el('h2.ux-kit-h', uxTape(title, 'amber'), el('span.ux-t-dim', note)), kids);
}
const rowOf = (...kids: Kid[]) => el('div.ux-kit-row', kids);
const cell = (label: string, ...kids: Kid[]) => el('div.ux-kit-cell', el('span.ux-kit-k.ux-t-dim', label), kids);

export function openKit() {
  const root = document.getElementById('isl-ui') ?? document.body;
  document.title = t('部品の見本帳｜My Crypto Successor', 'Parts kit | My Crypto Successor');
  const page = el('div.ux-kit.ux-root');

  // ---- 色
  const SW: [string, string][] = [
    ['k0', '--ux-k0'], ['k1', '--ux-k1'], ['k2', '--ux-k2'], ['k3', '--ux-k3'], ['k4', '--ux-k4'], ['k5', '--ux-k5'],
    ['paper', '--ux-paper'], ['paper2', '--ux-paper2'], ['paper3', '--ux-paper3'], ['ink', '--ux-ink'],
    ['amber', '--ux-amber'], ['good', '--ux-good'], ['bad', '--ux-bad'], ['cyan', '--ux-cyan'], ['white', '--ux-white'],
  ];
  const swatches = (cvd: boolean) =>
    el(
      `div.ux-kit-pal${cvd ? '.ux-kit-cvd' : ''}`,
      el('span.ux-kit-k', cvd ? t('色覚に配慮（良い＝青・急ぎ＝橙）', 'Colour-vision friendly (good = blue, urgent = orange)') : t('ふつう', 'Default')),
      el('div.ux-kit-sws', SW.map(([n, v]) => el('span.ux-kit-sw', { style: { background: `var(${v})` } }, el('i', n)))),
      rowOf(
        el('span.ux-set-chip.is-good', uxIcon('up', { color: '#1a1c2e', scale: 1 }), t('増えた', 'Up')),
        el('span.ux-set-chip.is-bad', uxIcon('down', { color: '#1a1c2e', scale: 1 }), t('急ぎ', 'Urgent')),
        uxLamp('good', true),
        uxLamp('bad', true),
        uxLamp('', true),
        uxLamp('cyan', true),
      ),
    );

  // ---- 文字
  const SAMPLE = t('工房で商品を作り、町へ運んで売る。', 'Craft goods, haul them to town and sell.');
  const text = el(
    'div.ux-kit-col',
    ...([100, 115, 130] as const).map((n) => el(`p.ux-kit-type.ux-kit-t${n}`, uxTape(`${n}%`, 'dark'), el('span', SAMPLE), el('span.ux-num', '1,234,567 G'))),
    rowOf(el('span.ux-kit-t1', t('本文 16px', 'Body 16px')), el('span.ux-kit-t15', t('見出し 24px', 'Heading 24px')), el('span.ux-kit-t2', t('大 32px', 'Large 32px'))),
    el('div.ux-kit-row.ux-kit-nums', el('span.ux-num', '15'), el('span.ux-num.ux-n2', '20'), el('span.ux-num.ux-n3', '30'), el('span.ux-num.ux-n4', '40')),
  );

  // ---- ボタン
  const keys = el(
    'div.ux-kit-grid',
    el('span'),
    el('span.ux-kit-k.ux-t-dim', t('ふつう', 'Rest')),
    el('span.ux-kit-k.ux-t-dim', t('押した', 'Pressed')),
    el('span.ux-kit-k.ux-t-dim', t('押せない', 'Disabled')),
    ...KEY_KINDS.flatMap((k) => {
      const down = uxKey(t('決定', 'OK'), undefined, { kind: k });
      down.classList.add('is-ux-down');
      down.dataset.kitStatic = '1';
      return [el('span.ux-kit-k', KIND_NAME[k]()), uxKey(t('決定', 'OK'), () => uxToast(t(`「${KIND_NAME[k]()}」を押した`, `Pressed “${KIND_NAME[k]()}”`)), { kind: k }), down, uxKey(t('決定', 'OK'), undefined, { kind: k, disabled: true })];
    }),
  );
  const bigKeys = rowOf(uxKey(t('工房を開く', 'Open workshop'), () => uxSfx('confirm'), { kind: 'main', big: true, ico: 'hammer', strong: true }), uxKey(t('設定', 'Settings'), undefined, { ico: 'gear' }), uxCloseKey(() => undefined));
  // いまの入口（btn()）の、入のときの見た目
  const legacyDown = btn(t('決定', 'OK'), () => undefined, 'is-on');
  legacyDown.classList.add('is-ux-down');
  legacyDown.dataset.kitStatic = '1';
  const off = btn(t('決定', 'OK'), () => undefined);
  off.disabled = true;
  const legacy = rowOf(btn(t('決定', 'OK'), () => undefined, 'is-on'), btn(t('もどる', 'Back'), () => undefined), btn(t('やり直す', 'Start over'), () => undefined, 'is-danger'), legacyDown, off);

  // ---- 器
  const tabs = [t('作業台', 'Benches'), t('設備投資', 'Equipment')].map((label, n) => {
    const lamp = uxLamp('', n === 0);
    const b = uxKey(el('span.ux-tab-l', lamp, el('b', label)), () => {
      tabs.forEach((x, k) => {
        x.setAttribute('aria-pressed', String(k === n));
        x.querySelector('.ux-lamp')?.classList.toggle('is-on', k === n);
      });
      uxSfx('tab');
    }, { cls: 'ux-tab', attrs: { 'aria-pressed': String(n === 0) } });
    return b;
  });
  const meter = uxMeter(0.35);
  const plate = uxPlate(
    'ux-kit-plate',
    el('div.ux-sheet-head', el('h2.ux-bleed', t('工房', 'Workshop')), uxTape(t('稼働中', 'Running'), 'good'), uxCloseKey(() => uxSfx('close'))),
    el('div.ux-tabs', tabs),
    el('div.ux-tabbody.ux-kit-body', el('div.ux-kit-pane', rowOf(uxTape('1', 'dark'), el('b', t('扇子', 'Fan')), uxLamp('good', true), el('span.ux-t-good', t('製造中', 'Crafting'))), meter.el, el('p.ux-t-dim', t('板・ねじ・貼り札の見出し・タブ・中の面。', 'Plate, screws, tape heading, tabs and the inner face.')))),
  );
  const paper = el(
    'div.ux-kit-paper',
    el('div.ux-rp-page.ux-kit-page', el('div.ux-rl.is-on', el('span.ux-rl-k', t('5月の月次報告', 'Monthly report'))), el('div.ux-rl.is-on', t('今月の売上', 'Sales this month')), el('div.ux-rl.is-on.ux-kit-total', el('span.ux-num.ux-n3', '268,400'), el('span.ux-num.ux-n2', 'G'))),
  );
  // いまの札（sheet()）を、入の器で開く：幕で開き、閉じるのは幕を待ってから消す
  const openSheet = () => {
    const sh = sheet(root, t('調達', 'Buying'), () => ux.sheetClosed?.());
    ux.sheetOpen?.(sh.el, t('調達', 'Buying'));
    sh.body.append(el('p', t('いまの札（sheet()）の、入のときの器です。✕ か外側を押すと、幕が閉じきってから消えます。', 'The current sheet in the new shell. Press ✕ or outside: it is removed after the wipe closes.')), btn(t('決定', 'OK'), () => undefined, 'is-on'), btn(t('もどる', 'Back'), () => undefined));
    return sh;
  };
  const openModal = () => {
    const m = el('div.isl-modal');
    const box = el('div');
    const rowB = el('div.isl-row');
    rowB.append(btn(t('やり直す', 'Start over'), () => m.remove(), 'is-danger'), btn(t('やめる', 'Cancel'), () => m.remove()));
    box.append(el('h2', t('最初からやり直しますか？', 'Start over?')), el('p', t('いまの会社は消えます。', 'Your current company will be lost.')), rowB);
    m.append(box);
    ux.modal?.(m, 'plain');
    root.append(m);
    return m;
  };
  const shells = rowOf(
    uxKey(t('札を開く（幕）', 'Open a sheet (wipe)'), openSheet, { kind: 'main', ico: 'list' }),
    uxKey(t('窓を開く', 'Open a dialog'), openModal),
    uxKey(t('幕：開く', 'Wipe: open'), () => void wipe(pressOrigin(), undefined, { label: t('経営企画', 'Strategy') })),
    uxKey(t('幕：もどる', 'Wipe: back'), () => void wipe(pressOrigin(), undefined, { reverse: true, label: t('地図', 'Map') })),
  );

  // ---- カウンター
  let funds = 173200;
  const odo = new Odo({ digits: 7, value: funds });
  const odoS = new Odo({ digits: 3, value: 80, size: 's' });
  const odoL = new Odo({ digits: 6, value: 268400, size: 'l', cls: 'ux-odo--amber' });
  const add = (n: number) => {
    funds = Math.max(0, funds + n);
    odo.set(funds, { dur: 700, onTick: () => uxSfx('tick') });
    uxPlus(odo.el, n);
    if (n > 0) coinsPop({ x: odo.el.getBoundingClientRect().left + 40, y: odo.el.getBoundingClientRect().top }, 5);
  };
  // 画面を丸ごと作り直しても、前の値から桁が回る（after() の作り直しと同じ形）
  let stock = 34;
  const redrawBox = el('div.ux-kit-redraw');
  const redraw = () => {
    redrawBox.replaceChildren(el('span', t('在庫', 'Stock')), rollNumber('kit.stock', stock, { digits: 4, size: 's', plus: true }).el, el('span', t('個', 'pcs')), uxKey(t('作り直す +12', 'Rebuild +12'), () => { stock += 12; redraw(); }));
  };
  forgetRoll('kit.stock');
  redraw();
  const counters = el(
    'div.ux-kit-col',
    rowOf(cell(t('資金', 'Funds'), el('span.ux-gauge-win', odo.el, el('span.ux-unit.ux-num', 'G'))), uxKey('+12,400', () => add(12400), { kind: 'main', ico: 'coin' }), uxKey('-3,000', () => add(-3000))),
    rowOf(cell(t('小', 'S'), odoS.el), cell(t('大（琥珀）', 'L (amber)'), odoL.el)),
    redrawBox,
  );

  // ---- レバー
  const leverHost = el('div.ux-kit-lever');
  const ticket = el('div.ux-ticket', el('div.ux-ticket-paper', el('div', el('b', t('承認', 'Approved')), t('　扇子を輸入に追加', ' — fans added to imports')), el('div', t('この町の売上　月 ', 'Town sales / month '), el('span.ux-num', '+12,400 G'))));
  let lever: ReturnType<typeof uxLever>;
  const mkLever = () => {
    ticket.classList.remove('is-on');
    lever = uxLever({
      onDone: () => {
        ticket.classList.add('is-on');
        uxSfx('cash');
      },
    });
    const face = uxStand(heroIcon(HERO_B, 128), 2);
    face.el.classList.add('ux-kit-face');
    leverHost.replaceChildren(
      el(
        'div.ux-prop-wrap.ux-float',
        face.el,
        uxPlate(
          'ux-prop-card',
          el('div.ux-prop-head', uxTape(t('提案書', 'Proposal'), 'amber'), el('span.ux-t-dim', t('物流部より', 'From Logistics'))),
          el(
            'div.ux-prop-main',
            el('div.ux-prop-effect', el('div.ux-prop-row', uxTape(t('効果', 'Effect'), 'dark'), el('span', t('この町の売上（月）', 'Town sales / month'))), el('div.ux-prop-big', uxIcon('up', { color: '#36e08b' }), el('span.ux-num.ux-bleed', '+12,400 G')), lever.lamps, lever.done),
            lever.el,
          ),
          el('div.ux-ticket-slot', { 'data-label': t('伝票', 'Slip') }, ticket),
          el('div.ux-prop-foot', uxKey(t('もう一度', 'Again'), mkLever, { kind: 'weak' })),
        ),
      ),
    );
  };
  mkLever();

  // ---- スイッチ・つまみ・ランプ・計器
  const faderV = el('span.ux-set-val.ux-num', '7');
  const meter2 = uxMeter(0.7, 'cyan');
  const meter3 = uxMeter(1, 'good');
  const fader = uxFader({ min: 0, max: 10, value: 7, label: t('つまみ', 'Fader'), onInput: (v, p) => { faderV.textContent = String(v); meter2.set(p); } });
  const controls = el(
    'div.ux-kit-col',
    rowOf(uxToggle({ label: t('自動製造', 'Auto craft'), value: true }).el, uxToggle({ label: t('消音', 'Mute'), value: false }).el),
    el('div.ux-set-row', uxTape(t('つまみ', 'Fader')), el('div.ux-set-ctl', fader.el, faderV)),
    rowOf(cell(t('消えている', 'Off'), uxLamp()), cell(t('点く', 'On'), uxLamp('', true)), cell(t('良い', 'Good'), uxLamp('good', true)), cell(t('急ぎ（またたく）', 'Urgent (blink)'), uxLamp('bad', true, true)), cell(t('知らせ', 'Info'), uxLamp('cyan', true))),
    cell(t('計器（進みのバー）', 'Meter (progress)'), uxMeter(0.35).el, meter2.el, meter3.el),
    rowOf(uxKey(t('光らせる', 'Flash'), () => meter3.flash())),
    rowOf(uxTape(t('貼り札', 'Tape')), uxTape(t('琥珀', 'Amber'), 'amber'), uxTape(t('良い', 'Good'), 'good'), uxTape(t('暗い', 'Dark'), 'dark')),
    el('div.ux-kit-icons', UX_ICONS.map((n) => uxIcon(n))),
  );

  // ---- 吹き出し・枠破り
  const bubble = uxBubble({
    face: heroIcon(HERO_A, 128),
    name: heroName(HERO_A),
    role: t('職人', 'Crafter'),
    voice: 0,
    lines: [
      t('よく来たな。扇子は、今日も調子よく仕上がっているぞ。', 'Welcome. The fans are coming along nicely today.'),
      t('もっと速く作りたいなら、設備を見てくれ。研磨機があれば、仕上げが速くなる。数字で言うと製造の速さ +20%。作業台を増やすなら大型の窯だ。', 'Want it faster? Check the equipment. A grinder speeds up finishing: +20% craft speed. For more benches, get the big kiln.'),
      t('いい品だろう？', 'Fine work, eh?'),
    ],
    onClose: () => uxSfx('close'),
    flow: true,
  });
  bubble.pointAt(240);
  const pop = el('div.ux-kit-pop', bubble.el);

  // ---- お知らせ・粒
  const center = () => ({ x: innerWidth / 2, y: innerHeight / 2 });
  const fxRow = rowOf(
    uxKey(t('お知らせ', 'Toast'), () => uxToast(t('扇子が 12 個できました', '12 fans crafted'))),
    uxKey(t('金貨が飛ぶ', 'Coins fly'), (b) => { const r = b.getBoundingClientRect(); coinsFly({ x: r.left + r.width / 2, y: r.top }, { x: 80, y: 80 }, 8, () => uxSfx('coin')); }, { ico: 'coin' }),
    uxKey(t('火花', 'Sparks'), (b) => { const r = b.getBoundingClientRect(); sparks({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }),
    uxKey(t('紙ふぶき', 'Confetti'), () => confetti(3)),
    uxKey(t('金貨がはじける', 'Coin pop'), () => coinsPop(center(), 8)),
  );
  const toastDemo = el('div.isl-toasts.ux-kit-toasts', el('div.isl-toast', t('✔ 承認：扇子を輸入に追加', '✔ Approved: fans added to imports')));

  // ---- 設定（見本帳の上で、文字・動き・色・走査線を切り替える）
  const set = el('div.ux-kit-set');
  renderUxSettings(set);

  page.append(
    el('header.ux-kit-top', el('h1.ux-bleed', t('部品の見本帳', 'Parts kit')), uxTape('MY CRYPTO SUCCESSOR', 'dark'), uxTape(t('方向 C「管制卓」', 'Direction C “Console”')), uxKey(isEn ? '日本語' : 'English', () => { /* i18n-ja */ void import('../../i18n').then((m) => m.setLang(isEn ? 'ja' : 'en')); }, { kind: 'weak' })),
    sec('color', t('色', 'Colours'), t('2 組。意味は色だけで伝えない（形と言葉を添える）', 'Two sets. Meaning never rests on colour alone'), swatches(false), swatches(true)),
    sec('type', t('文字', 'Type'), t('日本語は 16px から。数字は別の書体', 'Japanese from 16px. Numbers use their own face'), text),
    sec('key', t('ボタン', 'Keys'), t('種類は 4 つ。押すと 60ms で沈む。押せないものは平ら', 'Four kinds. Sinks in 60ms. Disabled keys are flat'), keys, bigKeys, el('span.ux-kit-k.ux-t-dim', t('いまの入口（btn()）の、入のときの見た目', 'The current btn() in the new look')), legacy),
    sec('shell', t('器・窓・幕', 'Shells, dialogs, wipe'), t('機械の板・貼り札・紙テープ。開け閉めは網目の幕', 'Plate, tape, paper tape. Opening and closing use the mesh wipe'), plate, paper, shells),
    sec('odo', t('桁の回るカウンター', 'Rolling counter'), t('下の桁が 9→0 に回るあいだだけ、上の桁が一緒に回る', 'An upper digit turns only while the lower one rolls 9→0'), counters),
    sec('lever', t('レバー（承認）', 'Lever (approve)'), t('引く・押すのどちらでも落ちる', 'Pull it or just press it'), leverHost),
    sec('ctl', t('スイッチ・つまみ・ランプ・計器', 'Switch, fader, lamps, meter'), '', controls),
    sec('pop', t('吹き出し・枠破り', 'Speech bubble, break-out hero'), t('枠は中身で伸び縮みする。押すと次へ', 'The frame stretches with the text. Press for the next line'), pop),
    sec('fx', t('お知らせ・粒', 'Toast, particles'), t('上掛けの canvas 1 枚', 'One overlay canvas'), fxRow, toastDemo),
    sec('set', t('設定', 'Settings'), t('文字の大きさ・動きを減らす・色・吹き出しの速さ・走査線', 'Text size, reduced motion, colours, speech speed, scanlines'), set),
  );
  root.append(page);
  bubble.start();
  // 計器は、少しずつ進む（止まらない画面）
  let p = 0.35;
  setInterval(() => {
    p = p >= 1 ? 0 : p + 0.05;
    meter.set(p);
  }, 400);

  // 撮影・確かめ用
  (window as unknown as { uxKit: unknown }).uxKit = {
    wipe: (x: number, y: number, label = t('経営企画', 'Strategy'), reverse = false) => wipe({ x, y }, undefined, { label, reverse }),
    odo,
    add,
    lever: () => lever,
    resetLever: mkLever,
    openSheet,
    openModal,
    bubble,
    prefs: () => ({ ...prefs }),
    set: (part: Partial<UxPrefs> & { calm?: CalmMode }) => setPrefs(part),
    toast: (m: string) => uxToast(m),
  };
}
openKit();
