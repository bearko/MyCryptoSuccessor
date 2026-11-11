/**
 * 段 UIX1a：いまの入口へ、新しい器と手応えを差し込む（入のときだけ。docs/ISLAND_UIX.md「差し込み」）。
 * - ボタン：押した瞬間に沈む（60ms）・離すと戻る。押した印は上掛けの層に出す（after() で中身が作り直されても消えない）
 * - 札（sheet()）：地図から開く・地図へ閉じるのは網目の幕（押した場所から埋まり、行き先の札を出して晴れる）。
 *   閉じるのは、幕が閉じきるのを待ってから消す。札から札へは短い出入り。開いているあいだ、地図は暗い網目で落とす
 * - 窓（modal() と、直接作っている 10 か所）：共通の器の class を付ける
 * - お知らせ：開いている札・窓の中身に重ねない
 * - 承認のボタン：レバーに替える（2 か所で試す）
 */
import { t } from '../../i18n';
import { el } from './dom';
import { lastPress, pressMark, pressOrigin, ripple, wipe } from './fx';
import { ux } from './hooks';
import { uxIcon } from './icons';
import { PRESS_MIN_MS, uxLever } from './parts';
import { isCalm } from './prefs';
import { renderUxSettings } from './settings';
import { uxSfx } from './sound';

/** 札から札への切り替えとみなす間（ms）：closeSheet() のすぐあとに sheet() が呼ばれたとき */
export const SWAP_MS = 80;
/** 幕の上の行き先の札に出す名前（長い見出しは切る） */
export const wipeLabel = (title: string) => {
  const c = [...title.replace(/[（(].*$/, '').trim()];
  return c.length > 10 ? c.slice(0, 10).join('') + '…' : c.join('');
};

/**
 * 閉じるのを、幕が閉じきるまで待つ：play(mid) の mid で fn を呼ぶ（そのあいだに別の経路で消えていたら呼ばない）。
 * 同じ札で 2 回目に呼ばれたら何もしない（✕ の連打・外側の押し直し）
 */
export function deferClose(e: { isConnected: boolean; dataset: Record<string, string | undefined>; classList: { add: (c: string) => void } }, play: (mid: () => void) => void, fn: () => void): boolean {
  if (e.dataset.uxLeaving) return false;
  e.dataset.uxLeaving = '1';
  e.classList.add('ux-leaving');
  play(() => {
    if (e.isConnected) fn();
  });
  return true;
}

let dim: HTMLElement | null = null;
let closedAt = -1e9;
const root = () => document.getElementById('isl-ui');
function syncDim() {
  dim?.classList.toggle('is-on', !!root()?.querySelector(':scope > .isl-sheet:not(.ux-wait)'));
}

export function installLegacy() {
  const ui = root();
  // 札を開いているあいだ、地図を暗い網目で沈める（#isl-ui の下・地図の上）
  dim = el('div.ux-dim', { 'aria-hidden': 'true' });
  if (ui) ui.before(dim);
  else document.body.append(dim);

  // ---- ボタン：押した瞬間に沈む・離すと戻る・押した印
  let down: { b: Element; at: number } | null = null;
  const lift = () => {
    const d = down;
    if (!d) return;
    down = null;
    const held = performance.now() - d.at;
    const off = () => d.b.classList.remove('is-ux-down');
    // すばやく叩いても、沈んだ形が 1 コマは見えるようにする
    if (held < PRESS_MIN_MS) setTimeout(off, PRESS_MIN_MS - held);
    else off();
  };
  addEventListener(
    'pointerdown',
    (e) => {
      lastPress.x = e.clientX;
      lastPress.y = e.clientY;
      lastPress.at = performance.now();
      const tg = e.target instanceof Element ? e.target : null;
      if (!tg) return;
      // 地図を押した所に、四角い波紋
      if (tg.id === 'isl-map') return ripple({ x: e.clientX, y: e.clientY });
      const b = tg.closest('button');
      // 新しい部品（ux-）は、自分で沈む
      if (!b || b.disabled || /(^|\s)ux-/.test(b.className)) return;
      lift();
      b.classList.add('is-ux-down');
      down = { b, at: performance.now() };
    },
    { capture: true, passive: true },
  );
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, lift, { capture: true, passive: true });
  addEventListener(
    'click',
    (e) => {
      const b = e.target instanceof Element ? e.target.closest('button') : null;
      if (!b || b.disabled || !b.closest('#isl-ui') || b.closest('.ux-lever-wrap')) return;
      const r = b.getBoundingClientRect();
      if (r.width && r.height) pressMark(r, b.classList.contains('is-on') || b.classList.contains('ux-key--main') ? '#ffe394' : '#fffdf3');
    },
    { capture: true },
  );

  // ---- 札
  ux.sheetOpen = (e, title) => {
    // ✕ は、絵文字ではなくドットの絵のキーに
    const x = e.querySelector<HTMLButtonElement>('.isl-sheet-head > .isl-btn');
    if (x) {
      x.classList.add('ux-x');
      x.setAttribute('aria-label', t('閉じる', 'Close'));
      x.replaceChildren(uxIcon('close'));
    }
    const swap = performance.now() - closedAt < SWAP_MS;
    if (swap || isCalm()) {
      // 札から札へ：短い出入り
      e.classList.add('ux-swap');
      if (swap) uxSfx('tab');
      else uxSfx('open');
      queueMicrotask(syncDim);
      return;
    }
    // 地図から札へ：網目の幕。閉じきったら札を出して、晴れる
    e.classList.add('ux-wait');
    uxSfx('open');
    void wipe(
      pressOrigin(),
      () => {
        e.classList.remove('ux-wait');
        syncDim();
      },
      { label: wipeLabel(title) },
    );
  };
  ux.sheetLeave = (e, fn) => {
    const started = deferClose(
      e,
      (mid) => void wipe(pressOrigin(), mid, { reverse: true, label: t('地図', 'Map') }),
      fn,
    );
    if (started) uxSfx('close');
  };
  ux.sheetClosed = () => {
    closedAt = performance.now();
    // 札から札へのときは、同じコマのうちに次の札が入る：暗い網目は切らない
    queueMicrotask(syncDim);
  };

  // ---- 窓の共通の器
  ux.modal = (m, kind) => {
    m.classList.add('ux-modal', `ux-modal--${kind}`);
  };

  // ---- お知らせ：札・窓を開いているあいだは、上の帯の上（中身に重ねない）
  ux.toastTop = (y) => (root()?.querySelector(':scope > .isl-sheet, :scope > .isl-modal') ? 8 : y);

  // ---- 承認のボタン → レバー
  ux.lever = (b, label) => {
    const lv = uxLever({
      label: t('承認', 'OK'),
      aria: label ?? b.textContent ?? undefined,
      can: () => !b.disabled,
      // 「承認済」が点いたのを見せてから、もとのボタンを押す
      onDone: () => setTimeout(() => b.isConnected && b.click(), isCalm() ? 0 : 260),
      shakeEl: () => wrap,
    });
    b.classList.add('ux-vh');
    b.tabIndex = -1;
    const wrap = el('span.ux-lever-wrap.ux-root', b, el('span.ux-lever-side', label ? el('span.ux-lever-what', label) : null, lv.lamps, lv.done), lv.el);
    return wrap;
  };

  ux.settings = renderUxSettings;
}
