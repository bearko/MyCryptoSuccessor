/**
 * 段 UIX2s：月次報告（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：月次報告」）。
 * 見本（public/uixlab/c/js/report.js）の場面を、本体の本物のデータへ移した：
 * 月末に紙テープが打ち出される。売上が数え上がり（金貨の音が音階を上がる）、数え終わってから先月比。順位は行が入れ替わる。推移は縦の棒が伸びる。
 * ページ送りは 600ms。紙を押すと、そのページがすぐ全部出る。「とばす」で閉じる。動きを減らすときは、数え上げなしで全部すぐ出る。
 * ページ：① 売上（KPI ①）→ ② 企業ランキング（KGI）→ ③ 月次売上の推移（KPI ②）→ ④ サプライチェーン（KPI ③）→ ⑤ 各部からの報告（ある月だけ）。
 * 出す中身・押せる導線は、今の月次報告（p1/report.ts）と同じだけそろえる。器は今の札（open()）：閉じ方・時間の止め方・月末の流れは今のまま。
 * 発掘作業のまとめ報告も、同じ紙テープの 1 ページで出す。
 */
import { isEn, t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { coinsPop, sparks } from '../fx';
import { later as laterOn } from '../loop';
import { Odo, press, shake, uxKey, uxLamp, uxPlate, uxTape, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxScene, uxSfx } from '../sound';
import { inkIcon, sIcon } from './s-icons';
import { safe } from './s-press';
import './report.css';
import type { DigSummary } from '../../p1/digmeet';
import type { P1State, Report, Stage } from '../../p1/model';
import type { DigSummaryHooks, ReportHooks } from '../../p1/report';
import type { Ctx } from '../../p1/screens';
import { D } from './s-deps';

/** ページ送り（見本：600ms・9 段） */
export const FEED_MS = 600;
/** 売上の数え上げ（見本：1.9 秒。金額に関係なく同じ長さ） */
export const COUNT_MS = 1900;

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 絵文字を外す（今の文には絵文字の印が付いている。新しい画面ではドットのアイコンを添える）。✔ は言葉に */
export function noEmoji(text: string): string {
  return text
    .replace(/\s*✔/g, t(' 済', ' done'))
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/^\s+/, '')
    .replace(/[ \t]{2,}/g, ' ');
}
const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
/** 目盛りの上の端（きりのよい数へ切り上げる：1・1.2・1.5・2・2.5・3・4・5・6・8・10 ×10ⁿ） */
export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (NICE.find((x) => m <= x + 1e-9) ?? 10) * p;
}
/** 縦の棒の置き方：0 の線からの下端（%）と高さ（%）。lo〜hi が図の下〜上 */
export function barBox(v: number, lo: number, hi: number): { b: number; h: number } {
  const span = Math.max(1e-9, hi - lo);
  const a = Math.min(v, 0);
  return { b: ((a - lo) / span) * 100, h: (Math.abs(v) / span) * 100 };
}
/** 続けて伸びている月の数（最後の月まで。伸びていなければ 0） */
export function growStreak(vals: number[]): number {
  let n = 0;
  for (let k = vals.length - 1; k > 0 && vals[k] > vals[k - 1]; k--) n++;
  return n;
}
/**
 * 棒の上の短い金額。日本語は見本と同じく小数 1 桁まで（54.1万・104.7万・1.2億）。1 万未満は 3 桁区切り。
 * 英語は、今のグラフと同じ短い書き方（shortN：541k・1M）
 */
export function manText(v: number): string {
  if (isEn) return D.shortN(v);
  const a = Math.abs(v);
  const sgn = v < 0 ? '−' : '';
  if (a >= 1e8) return `${sgn}${+(a / 1e8).toFixed(1)}億`; // i18n-ja
  if (a >= 1e4) return `${sgn}${+(a / 1e4).toFixed(1)}万`; // i18n-ja
  return sgn + Math.round(a).toLocaleString('en-US');
}
/** 順位の動き（先月の順位 → 今月の順位）。先月が無ければ new */
export type RankMove = 'new' | 'up' | 'down' | 'keep';
export const rankMove = (prev: number | null, cur: number): RankMove => (prev == null ? 'new' : prev > cur ? 'up' : prev < cur ? 'down' : 'keep');
/** 順位の並び：売上の多い順（同じなら元の順）。行の番号 → 何位か（0 から） */
export function rankOrder(vals: number[]): number[] {
  const idx = vals.map((_, i) => i).sort((a, b) => vals[b] - vals[a] || a - b);
  const pos: number[] = [];
  idx.forEach((i, p) => (pos[i] = p));
  return pos;
}
/** 月次報告のページ（各部からの報告は、行がある月だけ） */
export type RpPage = 'sales' | 'rank' | 'trend' | 'scm' | 'dept';
export const reportPages = (dept: boolean): RpPage[] => (dept ? ['sales', 'rank', 'trend', 'scm', 'dept'] : ['sales', 'rank', 'trend', 'scm']);
/** 推移の期間（3・6・12 か月・全期間＝0）。今の月次報告と同じ鍵でこのブラウザに覚える */
export type Range = 3 | 6 | 12 | 0;
export const RANGE_KEY = 'isl.chartRange';
export function readRange(get: (k: string) => string | null): Range {
  try {
    const raw = get(RANGE_KEY);
    const v = Number(raw);
    return raw != null && ([3, 6, 12, 0] as number[]).includes(v) ? (v as Range) : 6;
  } catch {
    return 6;
  }
}
export type TrendView = 'sales' | 'both' | 'cash';

/**
 * 紙テープのページ送りの芯（DOM なし）：いまのページ・送っている途中（押しても進まない）・もう見たページ（数え上げをしない）・
 * 「紙を押すとすぐ出る」・最後のページの「つぎへ」は閉じる。
 * render(k, dir, feed)：k ページ目を出す。feed が真なら紙を送る動き（600ms）をして、終わったら fed() を呼ぶ
 */
export function paperCore(n: number, ev: { render: (k: number, dir: 1 | -1, feed: boolean) => void; close: () => void }, calm: () => boolean = () => false, again = false) {
  let page = -1;
  let busy = false;
  let skip: (() => void) | null = null;
  const seen = new Set<number>();
  const core = {
    get page() {
      return page;
    },
    get busy() {
      return busy;
    },
    /** いまのページに、まだ出していない行がある（紙を押すとすぐ出る） */
    get printing() {
      return !!skip;
    },
    /** 数え上げ・印字の動きをしない：開き直し・動きを減らす・もう見たページ */
    instant: () => again || calm() || seen.has(page),
    /** いまのページの演出を一気に終わらせる関数を預かる（null：もう全部出ている） */
    setSkip(fn: (() => void) | null) {
      skip = fn;
    },
    /** 紙を押した：そのページをすぐ全部出す。出すものが無ければ false */
    tap(): boolean {
      const f = skip;
      if (!f) return false;
      skip = null;
      f();
      return true;
    },
    show(k: number, dir: 1 | -1 = 1): boolean {
      if (busy || k < 0 || k >= n) return false;
      core.tap();
      if (page >= 0) seen.add(page);
      const feed = page >= 0 && !calm();
      page = k;
      busy = feed;
      ev.render(k, dir, feed);
      return true;
    },
    /** 紙を送り終わった */
    fed() {
      busy = false;
    },
    /** つぎへ（d=1）・前へ（d=-1）。最後のページのつぎは、閉じる */
    go(d: 1 | -1) {
      if (busy) return;
      if (d > 0 && page >= n - 1) return ev.close();
      if (d < 0 && page <= 0) return;
      core.show(page + d, d);
    },
  };
  return core;
}

// ---------------------------------------------------------------- 紙の上の小さな部品

/** [[ ]] で囲んだ言葉を太字に */
function rich(text: string): DocumentFragment {
  const f = document.createDocumentFragment();
  noEmoji(text)
    .split(/\[\[(.+?)\]\]/)
    .forEach((part, k) => {
      if (part) f.append(k % 2 ? el('b', part) : document.createTextNode(part));
    });
  return f;
}
const num = (text: string, cls = '') => el(`span.ux-num${cls ? '.' + cls : ''}`, text);
/** 「104.7万」：数字は数字の書体、単位は日本語の書体で */
function man(v: number): HTMLElement {
  const m = /^([−\-\d.,]+)(.*)$/.exec(manText(v));
  return el('span.uxs-man', num(m ? m[1] : manText(v)), m?.[2] ?? '');
}
/** 増減の色の class（色だけに頼らない：▲▼・符号・言葉を添える） */
const tone = (v: number) => (Math.round(v) > 0 ? 'is-good' : Math.round(v) < 0 ? 'is-bad' : 'is-even');
/** ▲▼ のアイコン（紙の上の色。色覚に配慮した組では、青と橙） */
function toneIcon(v: number): HTMLElement | null {
  if (Math.round(v) === 0) return null;
  const cvd = document.documentElement.classList.contains('is-cvd');
  return sIcon(v > 0 ? 'up' : 'down', { color: v > 0 ? (cvd ? '#14568a' : '#14804c') : cvd ? '#8a4408' : '#9c2238', scale: 1 });
}
/** 伝票の行（名前 …… 値。点線でつなぐ） */
function rcp(label: Kid, value: Kid, cls = ''): HTMLElement {
  return el(`span.uxs-rcp${cls ? '.' + cls : ''}`, el('b', label), el('i'), typeof value === 'string' ? num(value) : value);
}
/** 紙の上のキー（紙の色の面・墨の縁・固い影。押すと沈む）。kind：ink＝墨の面（そのページでいちばん押してほしい導線） */
function pkey(label: Kid, fn: () => void, o: { ico?: string; kind?: 'ink' | ''; cls?: string; pressed?: boolean } = {}): HTMLButtonElement {
  const b = el<HTMLButtonElement>(`button.uxs-pkey${o.kind ? '.uxs-pkey--' + o.kind : ''}${o.cls ? '.' + o.cls : ''}`, { type: 'button' }, el('span.uxs-pkey-cap', o.ico ? (o.kind === 'ink' ? sIcon(o.ico, { scale: 1 }) : inkIcon(o.ico, 1)) : null, typeof label === 'string' ? el('b', label) : label));
  if (o.pressed != null) b.setAttribute('aria-pressed', String(o.pressed));
  return press(b, safe(fn));
}
/** 折りたたみ（今の画面の details と同じ：押すと中身が出る） */
function fold(label: Kid, build: () => Kid[]): HTMLElement {
  const box = el('div.uxs-fold-body', { hidden: true });
  let built = false;
  let on = false;
  const key = pkey(
    label,
    () => {
      on = !on;
      if (on && !built) {
        built = true;
        box.append(...build().flatMap((k) => (k == null || k === false ? [] : [k instanceof Node ? k : document.createTextNode(String(k))])));
      }
      box.hidden = !on;
      key.setAttribute('aria-expanded', String(on));
      uxSfx('flap');
    },
    { ico: 'next', cls: 'uxs-fold-key' },
  );
  key.setAttribute('aria-expanded', 'false');
  return el('div.uxs-fold', key, box);
}

interface Col {
  /** 下の名前 */
  label: Kid;
  /** 棒（1 本か 2 本）。kind：main＝今月（琥珀）・past＝前の月（網目）・ink＝墨・neg＝赤字（斜線）・dash＝見込み（点線） */
  bars: { v: number; kind: 'main' | 'past' | 'ink' | 'neg' | 'dash' }[];
  /** ろうそく足（資金）：高値・安値のひげ */
  wick?: [number, number];
  /** 棒の上に出す値 */
  top?: Kid;
  /** 押したときに下に出す 1 行 */
  read?: Kid;
}
/**
 * 縦の棒のグラフ（紙の上）。目盛りは 0・まん中・上の端。負の値があれば 0 の線を上げる。
 * 棒は is-on で下から伸びる（transform）。列を押すと選ばれて、下の 1 行に値が出る
 */
function vchart(cols: Col[], o: { cls?: string; sel?: number; onSel?: (k: number) => void; aria: string } = { aria: '' }) {
  const vals = cols.flatMap((c) => [...c.bars.map((b) => b.v), ...(c.wick ?? [])]);
  const hi = niceMax(Math.max(1, ...vals));
  const lo = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(0, ...vals)) : 0;
  const grid = [...new Set([lo, 0, hi / 2, hi])].map((v) => {
    const g = el(`div.uxs-tr-grid${v === 0 ? '.is-zero' : ''}`, el('span', v === 0 ? '0' : man(v)));
    g.style.setProperty('--y', String((v - lo) / (hi - lo)));
    return g;
  });
  const els = cols.map((c, k) => {
    const plot = el('div.uxs-tr-plot');
    if (c.wick) {
      const w = el('i.uxs-tr-wick');
      const a = ((c.wick[0] - lo) / (hi - lo)) * 100;
      const b = ((c.wick[1] - lo) / (hi - lo)) * 100;
      w.style.setProperty('--b', `${Math.min(a, b).toFixed(2)}%`);
      w.style.setProperty('--h', `${Math.max(0.5, Math.abs(b - a)).toFixed(2)}%`);
      plot.append(w);
    }
    let topAt = 0;
    c.bars.forEach((b, n) => {
      const box = barBox(b.v, lo, hi);
      const bar = el(`i.uxs-tr-bar.is-${b.kind}${b.v < 0 ? '.is-under' : ''}${c.bars.length > 1 ? `.is-n${n}` : ''}`);
      bar.style.setProperty('--b', `${box.b.toFixed(2)}%`);
      bar.style.setProperty('--h', `${Math.max(b.v ? 1 : 0.4, box.h).toFixed(2)}%`);
      plot.append(bar);
      if (n === 0) topAt = box.b + (b.v >= 0 ? box.h : 0);
    });
    if (c.top) {
      const v = el('span.uxs-tr-v', c.top);
      v.style.setProperty('--b', `${topAt.toFixed(2)}%`);
      plot.append(v);
    }
    const col = el('div.uxs-tr-col', plot, el('span.uxs-tr-m', c.label));
    // 列を押しても選べる（細い列は押しにくいので、下の ◀ ▶ のキーが主の口）
    col.addEventListener('click', () => {
      uxSfx('tick');
      select(k);
    });
    return col;
  });
  const text = el('div.uxs-tr-read-in', { 'aria-live': 'polite' });
  let sel = 0;
  const select = (k: number) => {
    sel = Math.max(0, Math.min(cols.length - 1, k));
    els.forEach((e, i) => e.classList.toggle('is-sel', i === sel));
    text.replaceChildren();
    const r = cols[sel]?.read;
    if (r != null && r !== false) text.append(r instanceof Node ? r : document.createTextNode(String(r)));
    prev.setAttribute('aria-disabled', String(sel <= 0));
    next.setAttribute('aria-disabled', String(sel >= cols.length - 1));
    o.onSel?.(sel);
  };
  // 見る列を 1 つずつ送るキー（44px）
  const prev = pkey(el('span.ux-vh', t('前の列', 'Previous')), () => select(sel - 1), { ico: 'next', cls: 'uxs-tr-step.uxs-tr-step--prev' });
  const next = pkey(el('span.ux-vh', t('次の列', 'Next')), () => select(sel + 1), { ico: 'next', cls: 'uxs-tr-step' });
  prev.setAttribute('aria-label', t('前の列', 'Previous'));
  next.setAttribute('aria-label', t('次の列', 'Next'));
  const read = el('div.uxs-tr-read', prev, text, next);
  const chart = el(`div.uxs-tr${cols.length > 7 ? '.is-dense' : ''}${o.cls ? '.' + o.cls : ''}`, { role: 'img', 'aria-label': o.aria }, grid, el('div.uxs-tr-cols', els));
  if (cols.length) select(Math.max(0, Math.min(cols.length - 1, o.sel ?? cols.length - 1)));
  return { el: chart, read, cols: els, grow: (k: number) => els[k]?.classList.add('is-on'), growAll: () => els.forEach((e) => e.classList.add('is-on')) };
}

// ---------------------------------------------------------------- 紙テープの器（印字機・ページ送り・とばす）

interface PageApi {
  /** 画面の時計で待つ（動きを減らすとき・開き直しは、すぐ） */
  later: (ms: number, fn: () => void) => void;
  clear: () => void;
  /** いまのページの演出を一気に終わらせる関数（null：もう全部出ている） */
  skip: (fn: (() => void) | null) => void;
  /** 数え上げ・印字の動きをしない（開き直し・もう見たページ・動きを減らす） */
  instant: () => boolean;
  /** 報告を閉じる（幕で地図へ） */
  close: () => void;
}
interface Page {
  el: HTMLElement;
  run: () => void;
}
const line = (...kids: Kid[]) => el('div.ux-rl.uxs-rl', ...kids);
const showAll = (root: HTMLElement) => root.querySelectorAll('.ux-rl').forEach((l) => l.classList.add('is-on'));
/** 行を順に打ち出す（from 行目から）。終わったら done */
function printLines(api: PageApi, root: HTMLElement, from = 0, gap = 110, t0 = 0, done?: () => void): void {
  const ls = [...root.querySelectorAll<HTMLElement>('.ux-rl')].slice(from);
  if (api.instant() || !ls.length) {
    showAll(root);
    done?.();
    return;
  }
  ls.forEach((l, i) =>
    api.later(t0 + i * gap, () => {
      l.classList.add('is-on');
      uxSfx('print', { step: 3 + (i % 3) });
      if (i === ls.length - 1) done?.();
    }),
  );
}

interface PaperOpts {
  title: string;
  /** 見出し（大きな字）と、その横の貼り札 */
  head: string;
  tape: string;
  pages: ((api: PageApi) => Page)[];
  /** 開き直し：数え上げをしない */
  again: boolean;
  then?: () => void;
  /** 最後のページの主のキー（既定「地図へもどる」） */
  last?: string;
}
/** 紙テープの報告を開く（今の札の器 open() の中に、印字機と紙を組む）。返り値：閉じる */
function openPaper(ctx: Ctx, o: PaperOpts): void {
  let built = false;
  let dead = false;
  let release: (() => void) | null = null;
  const timers: (() => void)[] = [];
  const clear = () => {
    while (timers.length) timers.pop()?.();
  };
  const destroy = () => {
    dead = true;
    clear();
    release?.();
    release = null;
  };
  D.open(
    ctx,
    o.title,
    (body) => {
      if (built) return;
      built = true;
      build(body);
    },
    () => {
      destroy();
      o.then?.();
    },
    true,
  );

  function build(body: HTMLElement) {
    const sheet = body.closest<HTMLElement>('.isl-sheet');
    // is-report-sheet：今の目印（BGM の場面・撮影の道具が見ている）をそのまま付ける
    sheet?.classList.add('uxs-rp', 'ux-root', 'is-report-sheet');
    body.classList.add('uxs-rp-body');
    release = uxScene('report');
    if (!o.again) uxSfx('bell');

    // ---- 見出し：題・年月の貼り札・「とばす」（今の ✕ のキーを、字のキーにする）
    const head = sheet?.querySelector<HTMLElement>('.isl-sheet-head');
    const h2 = head?.querySelector('h2');
    if (h2) {
      h2.textContent = o.head;
      h2.classList.add('ux-bleed');
      h2.after(uxTape(o.tape));
    }
    const x = head?.querySelector<HTMLButtonElement>('.isl-btn');
    if (x) {
      x.classList.add('uxs-rp-skip');
      x.replaceChildren(document.createTextNode(t('とばす', 'Skip')));
      x.setAttribute('aria-label', t('とばして閉じる', 'Skip and close'));
    }
    const close = () => {
      if (dead) return;
      if (x) x.click();
      else D.closeSheet();
    };

    // ---- 印字機・紙・下の帯
    const n = o.pages.length;
    const lamps = o.pages.map(() => uxLamp());
    const pageNo = num(`1/${n}`);
    const printer = uxPlate('uxs-rp-printer', uxTape(t('印字', 'Print'), 'dark'), uxLamp('good', true, true), el('div.uxs-rp-slot'), el('div.uxs-rp-pages', lamps, pageNo));
    const paper = el('div.uxs-rp-paper');
    const more = el('span.uxs-rp-more', { 'aria-hidden': 'true' }, inkIcon('down', 2));
    const win = el('div.uxs-rp-win', paper, more);
    const tip = el('span.uxs-rp-tip.ux-t-dim', t('紙を押すと、すぐ出ます', 'Tap the paper to print it at once'));
    const backKey = uxKey(el('span.ux-vh', t('前のページ', 'Previous page')), safe(() => go(-1)), { ico: 'next', cls: 'uxs-rp-back', attrs: { 'aria-label': t('前のページ', 'Previous page') } });
    const nextKey = uxKey(t('つぎへ', 'Next'), safe(() => go(1)), { kind: 'main', big: true, ico: 'next', cls: 'uxs-rp-next', strong: true });
    body.replaceChildren(printer, win, el('div.uxs-rp-foot', backKey, tip, nextKey));

    let cur: HTMLElement | null = null;
    const setSkip = (fn: (() => void) | null) => {
      core.setSkip(fn);
      tip.classList.toggle('is-off', !fn);
    };
    const api: PageApi = {
      later: (ms, fn) => {
        if (dead) return;
        if (core.instant()) return fn();
        timers.push(laterOn(ms, () => !dead && fn()));
      },
      clear,
      skip: setSkip,
      instant: () => core.instant(),
      close,
    };
    /** 紙に続きがあるとき、下に小さな印を出す */
    const syncMore = () => {
      const p = cur;
      more.classList.toggle('is-on', !!p && p.scrollHeight > p.clientHeight + 8 && p.scrollTop + p.clientHeight < p.scrollHeight - 8);
    };
    win.addEventListener('click', () => {
      if (core.tap()) uxSfx('flap');
    });
    const core = paperCore(
      n,
      {
        close,
        render(k, dir, feed) {
          clear();
          tip.classList.add('is-off');
          const pg = o.pages[k](api);
          lamps.forEach((l, i) => l.classList.toggle('is-on', i <= k));
          pageNo.textContent = `${k + 1}/${n}`;
          const b = nextKey.querySelector('b');
          if (b) b.textContent = k === n - 1 ? (o.last ?? t('地図へもどる', 'Back to map')) : t('つぎへ', 'Next');
          backKey.hidden = k === 0;
          const old = cur;
          cur = pg.el;
          pg.el.addEventListener('scroll', syncMore, { passive: true });
          paper.append(pg.el);
          const start = () => {
            pg.run();
            requestAnimationFrame(syncMore);
            // 行が打たれて紙が伸びたあとも見直す
            timers.push(laterOn(1200, syncMore));
          };
          if (!old || !feed || typeof pg.el.animate !== 'function') {
            old?.remove();
            core.fed();
            start();
            return;
          }
          // 紙を送る：古いページは下へ出ていき、新しいページが印字口から降りてくる（600ms・9 段）。前へ戻るときは逆向き
          uxSfx('page', { step: 8 });
          printer.classList.add('is-feed');
          const opt: KeyframeAnimationOptions = { duration: FEED_MS, easing: 'steps(9, end)', fill: 'both' };
          old.animate([{ transform: 'translate3d(0,0,0)' }, { transform: `translate3d(0,${dir * 104}%,0)` }], opt);
          pg.el.animate([{ transform: `translate3d(0,${-dir * 104}%,0)` }, { transform: 'translate3d(0,0,0)' }], opt).onfinish = () => {
            old.remove();
            for (const a of pg.el.getAnimations()) a.cancel();
            printer.classList.remove('is-feed');
            core.fed();
            if (!dead) start();
          };
        },
      },
      isCalm,
      o.again,
    );
    const go = (d: 1 | -1) => core.go(d);
    core.show(0, 1);
  }
}

// ---------------------------------------------------------------- 月次報告

/** 月次報告を開く（p1/report.ts の openMonthReport から。入のときだけ） */
export function openMonthReportUx(ctx: Ctx, r: Report, hooks: ReportHooks, then: (() => void) | undefined, again: boolean) {
  const s = ctx.s();
  const idx = s.reports.indexOf(r);
  const prev = idx > 0 ? s.reports[idx - 1] : idx < 0 && s.reports.length ? s.reports[s.reports.length - 1] : null;
  const upto = idx >= 0 ? s.reports.slice(0, idx + 1) : [...s.reports, r];
  const d = D.ymOfMonth(r.month);
  const bn = D.reportJam(s, r);
  const dept = deptLines(s, r, hooks);
  const kinds = reportPages(dept.length > 0);
  const build: Record<RpPage, (api: PageApi) => Page> = {
    sales: (api) => pageSales(api, s, r, prev, hooks, bn),
    rank: (api) => pageRank(api, r, prev, hooks),
    trend: (api) => pageTrend(api, s, r, upto, idx),
    scm: (api) => pageScm(api, ctx, s, r, hooks, bn),
    dept: (api) => pageDept(api, dept),
  };
  openPaper(ctx, {
    title: D.reportTitle(r.month),
    head: t('月次報告', 'Monthly report'),
    tape: t(`${d.y}年目 ${d.m}月`, `Y${d.y} M${d.m}`),
    pages: kinds.map((k) => build[k]),
    again,
    then,
  });
}

/** 見出しの行：墨の札の題と、右に種別（KPI ①・KGI…） */
const title = (name: string, tag: string, extra?: Kid) => line(el('span.ux-rl-k', name), extra, el('span.uxs-rp-tag', tag));

// ---- ① 売上（KPI ①）
function pageSales(api: PageApi, s: P1State, r: Report, prev: Report | null, hooks: ReportHooks, bn: Stage): Page {
  const d = D.ymOfMonth(r.month);
  const digits = Math.max(7, String(Math.round(Math.max(0, r.revenue))).length);
  const odo = new Odo({ digits, size: digits > 7 ? 'l' : 'xl', value: api.instant() ? r.revenue : 0, cls: 'ux-odo--paper' });
  const zero = r.revenue <= 0;
  const rows: HTMLElement[] = [title(t(`${d.m}月の売上`, `Sales · M${d.m}`), t('KPI ①', 'KPI 1')), line(el('span.uxs-rp-total', odo.el, num('G', 'uxs-rp-g')))];
  // 売上 0 の月：数え上げなし。マインちゃんの一言
  if (zero) rows.push(line(el('span.uxs-rp-say', uxTape(t('マインちゃん', 'Mine-chan')), el('span', D.ZERO_LINE()))));
  rows.push(el('div.ux-rl.uxs-rule'));
  if (prev) {
    const diff = r.revenue - prev.revenue;
    rows.push(line(rcp(t('先月の売上', 'Last month'), D.money(prev.revenue))));
    rows.push(line(rcp([toneIcon(diff), t('先月比', 'vs last month')], D.signed(diff, D.money), tone(diff))));
  }
  rows.push(line(rcp([toneIcon(r.profit), t('利益', 'Profit')], D.signed(r.profit, D.money), tone(r.profit))));
  // 資金の変化（月初 → 月末）
  if (r.money) {
    const dm = r.money.end - r.money.start;
    rows.push(line(rcp(t('資金の変化', 'Cash'), D.signed(dm, D.money), tone(dm)), el('span.uxs-rp-sub', num(`${D.fmt(r.money.start)} G`), inkIcon('next', 1), num(`${D.fmt(r.money.end)} G`))));
  } else rows.push(line(rcp(t('資金の変化', 'Cash'), '—')));
  // 先月とくらべた一言と、小さな縦の棒（先月・今月）
  if (prev) {
    const diff = r.revenue - prev.revenue;
    const pct = prev.revenue > 0 ? Math.round((Math.abs(diff) / prev.revenue) * 100) : null;
    const say = Math.round(diff) === 0 ? t('先月と同じ売上でした。', 'Same sales as last month.') : diff > 0 ? (pct != null ? t(`先月より ${pct}% 増えました。`, `Up ${pct}% from last month.`) : t('先月より増えました。', 'Up from last month.')) : pct != null ? t(`先月より ${pct}% 減りました。`, `Down ${pct}% from last month.`) : t('先月より減りました。', 'Down from last month.');
    rows.push(line(el(`span.uxs-rp-diff.${tone(diff)}`, el('b', say))));
    const top = Math.max(1, r.revenue, prev.revenue);
    const bars = [
      { label: t('先月', 'Last'), v: prev.revenue, main: false },
      { label: t('今月', 'Now'), v: r.revenue, main: true },
    ].map((b) => {
      const fill = el(`i${b.main ? '.is-main' : ''}`);
      fill.style.setProperty('--h', `${Math.max(2, Math.round((b.v / top) * 100))}%`);
      return el('div.uxs-mini-col', man(b.v), el('div.uxs-mini-bar', fill), el('span', b.label));
    });
    rows.push(el('div.ux-rl.uxs-mini', { role: 'img', 'aria-label': t(`先月 ${D.money(prev.revenue)}・今月 ${D.money(r.revenue)}`, `Last ${D.money(prev.revenue)}, now ${D.money(r.revenue)}`) }, bars));
  } else rows.push(line(el('span.uxs-rp-diff.is-even', el('b', t('はじめての月次報告です。', 'Your first monthly report.')))));
  // ブランド力の増減
  if (r.brand) rows.push(line(rcp([inkIcon('star', 1), t('ブランド力', 'Brand')], D.signed(r.brand), tone(r.brand))));
  // 売上のうち復刻品のぶん
  if (r.relic) rows.push(line(rcp(t('うち復刻品', 'incl. revivals'), D.money(r.relic))));
  // 利益と資金の変化の差（利益に入らない入出金の内訳。1 月は開業前の出費）
  const cg = D.cashGap(r);
  if (cg && cg.gap !== 0)
    rows.push(
      line(
        fold(el('span.uxs-fold-l', el('b', t('利益との差', 'Gap vs profit')), num(D.signed(cg.gap, D.money))), () => [
          ...cg.items.map((it) => rcp(D.FLOW_NAME[it.k](), D.signed(it.v, D.money), `is-s.${tone(it.v)}`)),
          cg.rest ? rcp(t('ほか（法務・外交・本社の施策・計上の時期のずれ）', 'Other (legal, diplomacy, HQ moves, timing)'), D.signed(cg.rest, D.money), `is-s.${tone(cg.rest)}`) : null,
          el('p.uxs-memo', t('利益＝売上 − その月の費用。資金にはこのほかの入出金も入る', 'Profit = sales − this month’s costs; cash also moves with the items above')),
        ]),
      ),
    );
  // 段 TRADE1b：輸入した商品（品・数・どこから）
  const xs = r.imports ?? [];
  if (xs.length)
    rows.push(
      line(
        el(
          'span.uxs-rp-text',
          inkIcon('box', 1),
          el('b', t('輸入', 'Imports')),
          xs.map((x) => {
            const ic = D.skuIcon(x.sku, 32);
            ic.classList.add('ux-ext');
            return el('span.uxs-rp-imp', ic, t(`${D.skuName(x.sku)} ${x.n} 個`, `${x.n} ${D.skuName(x.sku)}`), el('span.ux-t-ink2', t(`（${D.sectorDef(x.from).name}から）`, ` (from ${D.sectorDef(x.from).name})`)));
          }),
        ),
      ),
    );
  // 段 TRADE1a：となり町から取り寄せた素材の関税（売上原価）と、いまの率
  const duty = r.costs.duty ?? 0;
  if (duty > 0) {
    const goods = xs.reduce((a, x) => a + x.duty, 0);
    const rates = D.tradeNeighbors(s).map((nb) => `${nb.name} ${D.dutyText(s, nb.id)}`);
    rows.push(
      line(
        rcp([inkIcon('gate', 1), t('関税', 'Duty')], D.money(duty)),
        goods > 0 || rates.length ? el('span.uxs-rp-sub.ux-t-ink2', [goods > 0 ? t(`素材 ${D.money(Math.max(0, duty - goods))}・商品 ${D.money(goods)}`, `materials ${D.money(Math.max(0, duty - goods))}, goods ${D.money(goods)}`) : '', rates.join(t('・', ', '))].filter(Boolean).join(t('／', ' / '))) : null,
      ),
    );
  }
  // 月次 PDCA（スキル）：来月の見込み
  if (r.forecast)
    rows.push(line(el('span.uxs-rp-text', el('span.uxs-chip-k', t('月次 PDCA', 'Monthly PDCA')), t('来月の見込み：売上 ', 'Next month: sales '), num(D.money(r.forecast.sales)), t('・利益 ', ', profit '), num(D.signed(r.forecast.profit, D.money), tone(r.forecast.profit)))));
  // 内訳（折りたたみ）：商品ごとの割合・費用の内訳・売上から利益まで（どれも縦の棒）・他社の動き
  rows.push(line(fold(el('b', t('売上の内訳（商品ごとの割合・費用・売上から利益まで）', 'Breakdown (sales mix, costs, sales to profit)')), () => breakdown(r))));
  // 導線：スキルツリー
  rows.push(line(pkey(t('投資：スキルツリー', 'Invest: Skills'), () => hooks.openSkills(D.STAGE_BRANCH[bn]), { ico: 'star4', cls: 'uxs-rp-go' })));
  const page = el('div.ux-rp-page.uxs-rp-page', rows);

  const run = () => {
    const ls = [...page.querySelectorAll<HTMLElement>('.ux-rl')];
    const rest = () => {
      // 数え終わってから、先月比を打ち出す（結果を先に見せない）
      const tail = ls.slice(2);
      if (api.instant()) {
        showAll(page);
        page.classList.add('is-grown');
        api.skip(null);
        return;
      }
      tail.forEach((l, i) =>
        api.later(200 + i * 130, () => {
          l.classList.add('is-on');
          uxSfx('print', { step: 3 + (i % 3) });
          if (l.classList.contains('uxs-mini')) page.classList.add('is-grown');
          if (i === tail.length - 1) {
            page.classList.add('is-grown');
            api.skip(null);
          }
        }),
      );
      api.skip(() => {
        api.clear();
        showAll(page);
        page.classList.add('is-grown');
        api.skip(null);
      });
    };
    if (api.instant() || zero) {
      odo.set(r.revenue, { dur: 0 });
      if (zero && !api.instant()) {
        uxSfx('lamp');
        ls.slice(0, 2).forEach((l) => l.classList.add('is-on'));
        return rest();
      }
      showAll(page);
      page.classList.add('is-grown');
      return;
    }
    let done = false;
    [0, 1].forEach((i) =>
      api.later(i * 130, () => {
        ls[i]?.classList.add('is-on');
        uxSfx('print', { step: 4 });
      }),
    );
    const finish = () => {
      if (done) return;
      done = true;
      api.clear();
      ls[0]?.classList.add('is-on');
      ls[1]?.classList.add('is-on');
      odo.finish();
      odo.el.classList.add('is-done');
      uxSfx('deposit');
      vibrate(10);
      const b = odo.el.getBoundingClientRect();
      coinsPop({ x: b.left + b.width / 2, y: b.top }, Math.min(16, 6 + Math.floor(r.revenue / 3000)), 1.2);
      rest();
    };
    api.later(300, () => {
      if (done) return;
      odo.set(r.revenue, {
        dur: COUNT_MS,
        ease: (x) => 1 - Math.pow(1 - x, 2.2),
        onTick: (k) => {
          // 金貨の音が、数え上がるほど音階を上がる
          uxSfx('coin', { step: k * 11.99 });
          if (Math.random() < 0.3) {
            const b = odo.el.getBoundingClientRect();
            coinsPop({ x: b.left + b.width * (0.2 + Math.random() * 0.6), y: b.top + 4 }, 1, 0.5);
          }
        },
        onDone: finish,
      });
    });
    api.skip(finish);
  };
  return { el: page, run };
}

/** 売上の内訳（折りたたみの中）：どれも縦の棒。押すと下に値が出る */
function breakdown(r: Report): Kid[] {
  const out: Kid[] = [];
  const pct = (v: number, tot: number) => `${Math.round((v / Math.max(1, tot)) * 100)}%`;
  const mix = D.salesParts(r.bySeries);
  if (mix.length) {
    const tot = mix.reduce((a, x) => a + x.v, 0);
    const c = vchart(
      mix.map((x, k) => ({ label: String(k + 1), bars: [{ v: x.v, kind: k === 0 ? 'main' : 'past' }], top: num(pct(x.v, tot)), read: el('span', el('b', `${k + 1}. ${x.name}`), el('span', num(D.money(x.v)), t(`（${pct(x.v, tot)}）`, ` (${pct(x.v, tot)})`))) })),
      { cls: 'is-s', sel: 0, aria: t('商品ごとの売上の割合', 'Sales by product') },
    );
    c.growAll();
    out.push(el('div.uxs-bd', el('b', t('商品ごとの売上の割合', 'Sales by product')), c.el, c.read, el('ol.uxs-bd-list', mix.map((x) => el('li', el('span', x.name), num(pct(x.v, tot)))))));
  }
  const cs = D.costParts(r.costs);
  if (cs.length) {
    const tot = cs.reduce((a, x) => a + x.v, 0);
    const c = vchart(
      cs.map((x, k) => ({ label: String(k + 1), bars: [{ v: x.v, kind: k === 0 ? 'ink' : 'past' }], top: num(pct(x.v, tot)), read: el('span', el('b', `${k + 1}. ${x.name}`), el('span', num(D.money(x.v)), t(`（${pct(x.v, tot)}）`, ` (${pct(x.v, tot)})`))) })),
      { cls: 'is-s', sel: 0, aria: t(`費用の合計 ${D.money(tot)}`, `Total costs ${D.money(tot)}`) },
    );
    c.growAll();
    out.push(el('div.uxs-bd', el('b', t('費用の内訳', 'Costs')), el('span.ux-t-ink2', t(`合計 ${D.money(tot)}・いちばん大きいのは${cs[0].name}（${pct(cs[0].v, tot)}）`, `Total ${D.money(tot)} · largest: ${cs[0].name} (${pct(cs[0].v, tot)})`)), c.el, c.read, el('ol.uxs-bd-list', cs.map((x) => el('li', el('span', x.name), num(pct(x.v, tot)))))));
  }
  // 売上から利益まで：売上 → 費用（大きい順に引く）→ 利益。棒は、引く前の高さから引いたあとの高さまで
  const fall = D.monthFall(r);
  const hi = niceMax(Math.max(1, ...fall.map((x) => Math.max(x.from, x.to))));
  const lo = Math.min(0, ...fall.map((x) => Math.min(x.from, x.to))) < 0 ? -niceMax(-Math.min(0, ...fall.map((x) => Math.min(x.from, x.to)))) : 0;
  const cols = fall.map((x, k) => {
    const a = Math.min(x.from, x.to);
    const b = Math.max(x.from, x.to);
    const bar = el(`i.uxs-tr-bar.is-${x.kind === 'down' ? 'past' : x.kind === 'total' ? (x.v < 0 ? 'neg' : 'main') : 'ink'}`);
    bar.style.setProperty('--b', `${(((a - lo) / (hi - lo)) * 100).toFixed(2)}%`);
    bar.style.setProperty('--h', `${Math.max(1, ((b - a) / (hi - lo)) * 100).toFixed(2)}%`);
    return { el: el('div.uxs-tr-col.is-on', el('div.uxs-tr-plot', bar), el('span.uxs-tr-m', String(k + 1))), x };
  });
  const grid = [...new Set([lo, 0, hi])].map((v) => {
    const g = el(`div.uxs-tr-grid${v === 0 ? '.is-zero' : ''}`, el('span', v === 0 ? '0' : man(v)));
    g.style.setProperty('--y', String((v - lo) / (hi - lo)));
    return g;
  });
  out.push(
    el(
      'div.uxs-bd',
      el('b', t('売上から利益まで', 'From sales to profit')),
      el('span.ux-t-ink2', r.profit >= 0 ? t(`売上の ${Math.round((r.profit / Math.max(1, r.revenue)) * 100)}% が利益に残った`, `${Math.round((r.profit / Math.max(1, r.revenue)) * 100)}% of sales left as profit`) : t('費用が売上を上回った（赤字）', 'Costs exceeded sales (loss)')),
      el('div.uxs-tr.is-s', { role: 'img', 'aria-label': t(`売上 ${D.money(r.revenue)} から費用を引いて、利益 ${D.signed(r.profit, D.money)}`, `Sales ${D.money(r.revenue)} minus costs: profit ${D.signed(r.profit, D.money)}`) }, grid, el('div.uxs-tr-cols', cols.map((c) => c.el))),
      el('ol.uxs-bd-list', fall.map((x) => el('li', el('span', x.name), num(x.kind === 'start' || x.kind === 'total' ? (x.kind === 'total' ? D.signed(x.v, D.money) : D.money(x.v)) : D.signed(x.v, D.money))))),
    ),
  );
  // 他社の動き
  for (const n of r.news) {
    const [who, what, kind] = n.split('|');
    out.push(
      el(
        `p.uxs-memo${kind === 'out' ? '.is-good' : '.is-warn'}`,
        kind === 'out' ? t(`${who}が「${what}」から撤退しました。`, `${who} pulled out of ${what}.`) : kind === 'copy' ? t(`${who}が「${what}」を真似しはじめました（独占が終わった）。`, `${who} started copying ${what} (the monopoly ended).`) : t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`),
      ),
    );
  }
  return out;
}

// ---- ② 企業ランキング（KGI。順位は横の棒）
function pageRank(api: PageApi, r: Report, prev: Report | null, hooks: ReportHooks): Page {
  const meK = r.area.findIndex((x) => x.me);
  const mySales = meK >= 0 ? r.area[meK].sales : r.revenue;
  const prevRank = prev?.rank ?? null;
  const mv = rankMove(prevRank, r.rank);
  // わが社の棒は、先月の売上から今月の売上へ伸びる（縮む）。はじめての月は 0 から
  const from = prev ? prev.revenue : 0;
  const top = Math.max(1, from, ...r.area.map((x) => x.sales)) * 1.05;
  const rows = r.area.map((x, k) => {
    const v0 = x.me && !api.instant() ? from : x.sales;
    const bar = el('i');
    bar.style.transform = `scaleX(${(v0 / top).toFixed(3)})`;
    const no = num('', 'uxs-rk-n');
    const val = num(D.fmt(v0), 'uxs-rk-v');
    const row = el(`div.uxs-rk-row${x.me ? '.is-me' : ''}`, x.me ? el('span.uxs-rk-crown', sIcon('crown', { scale: 2 })) : null, no, el('div.uxs-rk-body', el('div.uxs-rk-name', el(x.me ? 'b' : 'span', x.me ? t('あなたの会社', 'Your company') : x.name)), el('div.uxs-rk-bar', bar)), val);
    return { x, k, row, bar, no, val, v: v0, y: -1 };
  });
  const place = (animate: boolean) => {
    const pos = rankOrder(rows.map((x) => x.v));
    let changed = false;
    rows.forEach((x, i) => {
      x.no.textContent = String(pos[i] + 1);
      const y = pos[i] * 100;
      if (x.y !== y) {
        changed = changed || x.y >= 0;
        x.y = y;
        x.row.style.transitionDuration = animate ? '' : '0s';
        x.row.style.transform = `translate3d(0,${y}%,0)`;
      }
    });
    return changed;
  };
  place(false);
  const me = rows.find((x) => x.x.me) ?? null;
  const list = el('div.uxs-rk', { role: 'img', 'aria-label': t(`企業ランキング：自社は ${r.rank} 位`, `Ranking: you are #${r.rank}`) }, rows.map((x) => x.row), r.area.length > 1 ? el('span.uxs-rk-goal', { 'data-k': t('ゴール', 'Goal'), 'aria-hidden': 'true' }) : null);
  list.style.setProperty('--n', String(rows.length));
  // 順位の札：先月 → 今月
  const win = (n: number, cls = '') => el(`span.uxs-rkb-win${cls}`, num(String(n), 'uxs-rkb-n'), el('span', t('位', '')));
  const moveWord = mv === 'new' ? t('初登場', 'New entry') : mv === 'up' ? t(`${(prevRank ?? 0) - r.rank} ランクアップ！`, `Up ${(prevRank ?? 0) - r.rank}!`) : mv === 'down' ? t(`${r.rank - (prevRank ?? 0)} ランクダウン`, `Down ${r.rank - (prevRank ?? 0)}`) : t('キープ', 'Held');
  const badge = el(
    `div.uxs-rkb.is-${mv}`,
    el('span', t('エリア順位', 'Area rank')),
    prevRank != null ? [win(prevRank), inkIcon('next', 2)] : null,
    win(r.rank, '.is-new'),
    el('span.uxs-rkb-move', mv === 'up' ? inkIcon('up', 1) : mv === 'down' ? inkIcon('down', 1) : null, moveWord),
  );
  // ゴール：TOP_STREAK か月続けて 1 位（制覇）。発掘 v2 の 5 段目：研究成果の発表も
  const streak = r.streak ?? (r.rank === 1 ? 1 : 0);
  const presented = !r.goal || r.goal.present;
  const conquered = streak >= D.TOP_STREAK && presented;
  const waiting = streak >= D.TOP_STREAK && !presented;
  const goalText = conquered
    ? t(`制覇！ ${D.TOP_STREAK} か月続けて 1 位${r.goal ? '＋研究成果の発表' : ''}`, `Conquered! #1 for ${D.TOP_STREAK} months${r.goal ? ' + findings' : ''}`)
    : waiting
      ? t('1 位を守っている（制覇まで：研究成果の発表）', 'Holding #1 (to conquer: present findings)')
      : r.goal
        ? noEmoji(D.clearCondText(streak, r.goal)[0])
        : streak > 0
          ? t(`ゴール：${D.TOP_STREAK} か月続けて 1 位（いま ${streak} / ${D.TOP_STREAK}）`, `Goal: #1 for ${D.TOP_STREAK} months in a row (${streak} / ${D.TOP_STREAK})`)
          : t(`ゴール：${D.TOP_STREAK} か月続けて 1 位`, `Goal: #1 for ${D.TOP_STREAK} months in a row`);
  const kids: HTMLElement[] = [title(t('企業ランキング', 'Company ranking'), t('KGI（エリア）', 'KGI (area)')), el('div.ux-rl', list), el('div.ux-rl', badge)];
  kids.push(line(el(`span.uxs-rp-goal${conquered ? '.is-done' : waiting ? '.is-wait' : ''}`, conquered || waiting ? sIcon('crown', { scale: 1 }) : inkIcon('flag', 1), el('b', goalText))));
  // 次の順位までの差・2 位との差
  if (meK > 0) kids.push(line(rcp(t(`${meK} 位まで あと`, `To reach #${meK}`), D.money(Math.max(0, r.area[meK - 1].sales - mySales))), el('span.uxs-rp-sub', t(`次の順位は ${meK} 位の${r.area[meK - 1].name}`, `Next up: #${meK} ${r.area[meK - 1].name}`))));
  else if (meK === 0 && r.area.length > 1) kids.push(line(rcp([inkIcon('up', 1), t('2 位との差', 'Ahead of #2')], `+${D.money(Math.max(0, mySales - r.area[1].sales))}`, 'is-good'), el('span.uxs-rp-sub', t(`2 位は${r.area[1].name}`, `#2 is ${r.area[1].name}`))));
  // 1 回目の 1 位：制覇までの一言
  if (streak > 0 && !conquered) {
    const g = r.goal;
    const say =
      waiting && g
        ? D.presentReady(g)
          ? t('あとは[[町の長]]に発表すれば[[制覇]]！', 'Present to the [[town head]] to [[conquer]]!')
          : t('あとは研究成果の発表で[[制覇]]！', 'Present your findings to [[conquer]]!')
        : g && !g.present
          ? g.res
            ? t('来月も守って、発表の条件もそろえよう！', 'Hold on and meet the presenting conditions!')
            : t('来月も守って、お題もそろえよう！', 'Hold on and find the targets!')
          : t('来月も守り切れたら[[制覇]]だよ！', 'Hold on next month and the sector is [[yours]]!');
    kids.push(line(el('span.uxs-rp-text', rich(say))));
  } else if (meK === 0 && r.area.length > 1 && !conquered) kids.push(line(el('span.uxs-rp-text', t('守り切ろう！', 'Hold on!'))));
  // 他社の巻き返し（Uncommon）：1 位を取った月の締めで、2 位の会社が翌月からセール
  if (r.comeback) kids.push(line(el('span.uxs-rp-text.is-warn', el('span.uxs-chip-k.is-bad', t('巻き返し', 'Comeback')), rich(t(`[[${r.comeback.by}]]がセールで巻き返してきた！（${r.comeback.months} か月）`, `[[${r.comeback.by}]] is fighting back with a sale! (${r.comeback.months} mo)`)))));
  // 商圏の取り合い（Rare の町 ②）：自社の取り分（先月から）・撤退した他社の店・空き店舗に入った他社
  if (r.trade) {
    const tr = r.trade;
    const p1 = (v: number) => `${Math.round(v * 1000) / 10}%`;
    const extra = [tr.quit.length ? t(`撤退 ${tr.quit.length} 軒`, `${tr.quit.length} closed`) : '', tr.refill.length ? t(`他社が空き店舗に ${tr.refill.length} 軒`, `${tr.refill.length} vacancies refilled`) : '', tr.gone.length ? t(`町から撤退 ${tr.gone.length} 社`, `${tr.gone.length} left town`) : '', tr.back?.length ? t(`町に戻った他社 ${tr.back.length} 社`, `${tr.back.length} came back`) : ''].filter(Boolean).join(t('・', ' · '));
    kids.push(
      line(
        el('span.uxs-rp-act', el('span.uxs-rp-text', inkIcon('share', 1), el('b', t('商圏の取り分', 'Trade-area share')), tr.prev != null ? [num(p1(tr.prev)), inkIcon('next', 1)] : null, num(p1(tr.share)), extra ? el('span.ux-t-ink2', t(`（${extra}）`, ` (${extra})`)) : null), hooks.openTrade ? pkey(t('営業', 'Sales'), () => hooks.openTrade?.()) : null),
      ),
    );
  }
  kids.push(line(pkey(t('目標確認：企業ランキング', 'Goal: Ranking'), () => hooks.openRanking(), { ico: 'crown', cls: 'uxs-rp-go' })));
  const page = el(`div.ux-rp-page.uxs-rp-page${r.rank === 1 ? '.is-top' : ''}`, kids);

  const run = () => {
    const ls = [...page.querySelectorAll<HTMLElement>('.ux-rl')];
    const settle = () => {
      if (me) {
        me.v = mySales;
        me.bar.style.transform = `scaleX(${(me.v / top).toFixed(3)})`;
        me.val.textContent = D.fmt(me.v);
      }
      place(false);
      showAll(page);
      badge.classList.add('is-up');
      page.classList.add('is-crowned');
      api.skip(null);
    };
    if (api.instant() || !me) return settle();
    let done = false;
    let swapped = false;
    [0, 1].forEach((i) =>
      api.later(i * 120, () => {
        ls[i]?.classList.add('is-on');
        uxSfx('print', { step: 4 });
      }),
    );
    const tail = () => {
      // 棒が伸びきったあと：順位の札 → 王冠（1 位のとき）→ 残りの行
      api.later(140, () => {
        ls[2]?.classList.add('is-on');
        badge.classList.add('is-up');
        uxSfx('flap');
      });
      api.later(520, () => {
        page.classList.add('is-crowned');
        if (r.rank === 1) uxSfx('confirm');
      });
      printLines(api, page, 3, 140, 760, () => api.skip(null));
    };
    const steps = 22;
    api.later(520, () => {
      for (let k = 1; k <= steps; k++)
        api.later(k * 42, () => {
          if (done) return;
          const e = 1 - Math.pow(1 - k / steps, 2);
          me.v = Math.round(from + (mySales - from) * e);
          me.bar.style.transform = `scaleX(${(me.v / top).toFixed(3)})`;
          me.val.textContent = D.fmt(me.v);
          uxSfx('coin', { step: (0.2 + (k / steps) * 0.8) * 11.99 });
          if (place(true) && !swapped) {
            swapped = true;
            // 順位が入れ替わる瞬間：行が入れ替わる。上がったときは手応え（音・揺れ・火花）
            if (mySales >= from) {
              uxSfx('rankup');
              vibrate(18);
              shake(list);
              const b = me.row.getBoundingClientRect();
              sparks({ x: b.left + 20, y: b.top + 10 }, 18);
            } else uxSfx('flap');
          }
          if (k === steps) tail();
        });
    });
    api.skip(() => {
      if (done) return;
      done = true;
      api.clear();
      settle();
    });
  };
  return { el: page, run };
}

// ---- ③ 月次売上の推移（KPI ②。縦の棒が伸びる）
let trendView: TrendView = 'sales';
function pageTrend(api: PageApi, s: P1State, r: Report, upto: Report[], idx: number): Page {
  let range: Range = readRange((k) => localStorage.getItem(k));
  const fc = idx < 0 || idx === s.reports.length - 1 ? (r.forecast ?? null) : null;
  const holder = el('div.ux-rl.uxs-tr-holder');
  const legend = el('div.ux-rl.uxs-tr-legend');
  const readLine = el('div.ux-rl.uxs-tr-readline');
  let first = true;
  let chart: ReturnType<typeof vchart> | null = null;
  const paint = () => {
    const rs = range ? upto.slice(-range) : upto.slice();
    const lastK = rs.length - 1;
    let cols: Col[];
    if (trendView === 'cash') {
      // 資金のろうそく足（月のはじめ → 月末・その月のいちばん高い・安い）
      const cs = D.moneyCandles(rs);
      cols = cs.map((c, k) => ({
        label: D.monLab(c.month, k === 0),
        bars: [],
        read: el('span', el('b', D.monHead(c.month)), el('span', num(`${D.fmt(c.o)} G`), inkIcon('next', 1), num(`${D.fmt(c.c)} G`)), c.est ? null : el('span.ux-t-ink2', t(`高 ${D.shortN(c.h)}・安 ${D.shortN(c.l)}`, `high ${D.shortN(c.h)}, low ${D.shortN(c.l)}`))),
      }));
      // ろうそくの胴は、月のはじめ〜月末の高さに置く
      const last = cs[cs.length - 1];
      chart = candleChart(cs, cols, last ? t(`資金の月の動き：いま ${D.money(last.c)}`, `Cash by month: now ${D.money(last.c)}`) : t('資金の月の動き', 'Cash by month'));
    } else {
      const both = trendView === 'both';
      cols = rs.map((x, k) => ({
        label: D.monLab(x.month, k === 0),
        bars: [{ v: x.revenue, kind: k === lastK ? 'main' : 'past' }, ...(both ? [{ v: x.profit, kind: x.profit < 0 ? ('neg' as const) : ('ink' as const) }] : [])],
        top: rs.length <= 6 ? man(x.revenue) : undefined,
        read: el('span', el('b', D.monHead(x.month)), el('span', t('売上', 'Sales'), num(D.money(x.revenue))), el('span', t('利益', 'Profit'), num(D.signed(x.profit, D.money), tone(x.profit)))),
      }));
      // 来月の見込み（月次 PDCA）：点線の棒
      if (fc && rs.length)
        cols.push({
          label: t('来月', 'Next'),
          bars: [{ v: fc.sales, kind: 'dash' }, ...(both ? [{ v: fc.profit, kind: 'dash' as const }] : [])],
          read: el('span', el('b', t('来月（見込み）', 'Next month (forecast)')), el('span', t('売上', 'Sales'), num(D.money(fc.sales))), el('span', t('利益', 'Profit'), num(D.signed(fc.profit, D.money), tone(fc.profit)))),
        });
      const last = rs[lastK];
      chart = vchart(cols, { sel: lastK, aria: last ? t(`月次売上推移：${D.monHead(last.month)}の売上 ${D.money(last.revenue)}・利益 ${D.signed(last.profit, D.money)}`, `Monthly trend: ${D.monHead(last.month)} sales ${D.money(last.revenue)}, profit ${D.signed(last.profit, D.money)}`) : t('月次売上推移', 'Monthly trend') });
    }
    holder.replaceChildren(chart.el);
    readLine.replaceChildren(chart.read);
    // 凡例（色だけに頼らない：模様と言葉）
    const lg = (cls: string, name: string) => el('span.uxs-lg', el(`i.uxs-tr-bar.is-${cls}`), name);
    legend.replaceChildren(
      ...(trendView === 'cash'
        ? [lg('main', t('増えた月', 'Up')), lg('neg', t('減った月', 'Down')), el('span.uxs-lg', el('i.uxs-lg-wick'), t('高値・安値', 'High / low'))]
        : [lg('main', t('今月の売上', 'This month')), lg('past', t('売上', 'Sales')), ...(trendView === 'both' ? [lg('ink', t('利益', 'Profit')), lg('neg', t('赤字', 'Loss'))] : []), ...(fc ? [lg('dash', t('見込み', 'Forecast'))] : [])]),
    );
    for (const [k, b] of Object.entries(viewKeys)) b.setAttribute('aria-pressed', String(k === trendView));
    for (const [k, b] of rangeKeys) b.setAttribute('aria-pressed', String(k === range));
    if (!first) chart.growAll();
  };
  const viewKeys: Record<TrendView, HTMLButtonElement> = {
    sales: pkey(t('売上', 'Sales'), () => ((trendView = 'sales'), paint())),
    both: pkey(t('売上と利益', 'Sales & profit'), () => ((trendView = 'both'), paint())),
    cash: pkey(t('資金', 'Cash'), () => ((trendView = 'cash'), paint())),
  };
  const RANGES: [Range, string][] = [
    [3, t('3 か月', '3 mo')],
    [6, t('6 か月', '6 mo')],
    [12, t('1 年', '1 yr')],
    [0, t('全期間', 'All')],
  ];
  const rangeKeys: [Range, HTMLButtonElement][] = RANGES.map(([v, name]) => [
    v,
    pkey(name, () => {
      range = v;
      try {
        localStorage.setItem(RANGE_KEY, String(v));
      } catch {
        // 覚えられなくても動く
      }
      paint();
    }),
  ]);
  paint();
  first = false;
  // 伸びの一言（数字から読めることだけ）
  const vals = upto.map((x) => x.revenue);
  const up = growStreak(vals);
  const firstV = vals.find((v) => v > 0) ?? 0;
  const span = vals.length - 1 - vals.findIndex((v) => v > 0);
  const times = firstV > 0 ? r.revenue / firstV : 0;
  const kids: HTMLElement[] = [
    title(t('月次売上の推移', 'Monthly trend'), t('KPI ②', 'KPI 2'), el('span.uxs-tr-unit', t('単位：G', 'Unit: G'))),
    el('div.ux-rl.uxs-seg', { role: 'group', 'aria-label': t('見るグラフ', 'Chart') }, Object.values(viewKeys)),
    holder,
    readLine,
    legend,
    el('div.ux-rl.uxs-seg', { role: 'group', 'aria-label': t('期間', 'Range') }, rangeKeys.map(([, b]) => b)),
  ];
  if (times >= 2 && span >= 1 && up >= 1) kids.push(line(el('span.uxs-rp-diff.is-good', inkIcon('up', 1), el('b', t(`${span} か月で ${times >= 10 ? Math.round(times) : Math.round(times * 10) / 10} 倍`, `${times >= 10 ? Math.round(times) : Math.round(times * 10) / 10}× in ${span} months`)))));
  if (up >= 2) kids.push(line(el('span', t(`${up + 1} か月つづけて伸びています。`, `Up ${up + 1} months in a row.`))));
  const page = el('div.ux-rp-page.uxs-rp-page', kids);

  const run = () => {
    const c = chart;
    if (api.instant() || !c) {
      showAll(page);
      c?.growAll();
      return;
    }
    let done = false;
    const ls = [...page.querySelectorAll<HTMLElement>('.ux-rl')];
    [0, 1, 2].forEach((i) =>
      api.later(i * 120, () => {
        ls[i]?.classList.add('is-on');
        uxSfx('print', { step: 4 });
      }),
    );
    const n = c.cols.length;
    const gap = Math.min(190, Math.round(1100 / Math.max(1, n)));
    c.cols.forEach((_, i) =>
      api.later(360 + i * gap, () => {
        if (done) return;
        c.grow(i);
        // 棒が伸びるたびに、和音を 1 段上がる
        uxSfx('lamp', { step: i });
        if (i === n - 1) {
          uxSfx('deposit');
          const b = c.cols[i].getBoundingClientRect();
          api.later(300, () => sparks({ x: b.left + b.width / 2, y: b.top + 20 }, 12));
        }
      }),
    );
    printLines(api, page, 3, 140, 360 + n * gap + 240, () => api.skip(null));
    api.skip(() => {
      if (done) return;
      done = true;
      api.clear();
      showAll(page);
      // 描き直したあとのグラフも伸ばす
      chart?.growAll();
      api.skip(null);
    });
  };
  return { el: page, run };
}
/** 資金のろうそく足：胴（月のはじめ〜月末）とひげ（高値〜安値）。増えた月は琥珀、減った月は斜線 */
function candleChart(cs: { o: number; c: number; l: number; h: number }[], cols: Col[], aria: string) {
  const vals = cs.flatMap((c) => [c.o, c.c, c.l, c.h]);
  const hi = niceMax(Math.max(1, ...vals));
  const lo = Math.min(0, ...vals) < 0 ? -niceMax(-Math.min(0, ...vals)) : 0;
  const c = vchart(cols, { sel: cols.length - 1, aria });
  // 目盛りを、ろうそくの値に合わせて置き直す
  const pct = (v: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
  c.el.querySelectorAll('.uxs-tr-grid').forEach((g) => g.remove());
  c.el.prepend(
    ...[...new Set([lo, 0, hi / 2, hi])].map((v) => {
      const g = el(`div.uxs-tr-grid${v === 0 ? '.is-zero' : ''}`, el('span', v === 0 ? '0' : man(v)));
      g.style.setProperty('--y', String((v - lo) / (hi - lo)));
      return g;
    }),
  );
  c.cols.forEach((colEl, k) => {
    const x = cs[k];
    const plot = colEl.querySelector('.uxs-tr-plot');
    if (!plot || !x) return;
    const w = el('i.uxs-tr-wick');
    w.style.setProperty('--b', pct(x.l));
    w.style.setProperty('--h', `${Math.max(0.5, ((x.h - x.l) / (hi - lo)) * 100).toFixed(2)}%`);
    const b = el(`i.uxs-tr-bar.is-${x.c >= x.o ? 'main' : 'neg'}`);
    b.style.setProperty('--b', pct(Math.min(x.o, x.c)));
    b.style.setProperty('--h', `${Math.max(1, (Math.abs(x.c - x.o) / (hi - lo)) * 100).toFixed(2)}%`);
    plot.append(w, b);
  });
  return c;
}

// ---- ④ サプライチェーン（KPI ③）：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の数と課題
const STAGE_ICO: Record<Stage, string> = { buy: 'brick', craft: 'hammer', haul: 'cart', sell: 'shop' };
function pageScm(api: PageApi, ctx: Ctx, s: P1State, r: Report, hooks: ReportHooks, bn: Stage): Page {
  const f = r.flow ?? { bought: 0, made: 0, hauled: 0, sold: 0 };
  const vals: Record<Stage, number> = { buy: f.bought, craft: f.made, haul: f.hauled, sell: f.sold };
  const max = Math.max(1, ...Object.values(vals));
  const flow = el('div.uxs-flow', { role: 'img', 'aria-label': (['buy', 'craft', 'haul', 'sell'] as Stage[]).map((k) => `${noEmoji(D.STAGE_NAME[k])} ${vals[k]}`).join(t('、', ', ')) });
  (['buy', 'craft', 'haul', 'sell'] as Stage[]).forEach((k, i) => {
    if (i) flow.append(el('span.uxs-flow-arrow', inkIcon('next', 1)));
    const fill = el('i');
    fill.style.setProperty('--h', `${Math.max(6, Math.round((vals[k] / max) * 100))}%`);
    flow.append(el(`div.uxs-flow-col${k === bn ? '.is-bn' : ''}`, inkIcon(STAGE_ICO[k], 2), el('div.uxs-flow-bar', fill), num(String(vals[k]), 'uxs-flow-n'), el('span.uxs-flow-name', D.STAGE_NAME[k]), k === bn ? el('span.uxs-chip-k.is-bad', t('課題あり', 'Issue')) : null));
  });
  // 課題ありの段と、いちばんの改善案（今の月次報告と同じ決まり）
  const hint = el('p.uxs-rp-hint');
  let best: { label: string; fn: () => void; short?: boolean } | null = null;
  const prop = hooks.openProposal ? D.reportProposal(s, r) : null;
  if (r.stall) {
    const why = D.stallSay(r.stall.stage, r.stall.why);
    hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。${why.replace(/^\[\[[^\]]*\]\]が止まっている。/, '')}。`, `[[${D.STAGE_NAME[bn]}]] needs attention. ${why}.`)));
  } else {
    // 課題ありの段の打ち手のうち、見込み（+N 個／月）のいちばん大きいもの。④ 販売は moves.ts の bestSell
    const sm = bn === 'sell' && D.myShops(s).length ? D.bestSell(s) : null;
    const top = sm ? undefined : bn !== 'sell' || D.myShops(s).length ? D.whatIf(s, bn).find((w) => w.ok) : undefined;
    const up = sm ? D.sellBigUp(ctx, s, sm) : top ? D.moveUp(ctx, s, top) : null;
    if (up && (top || sm)) {
      hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。いちばんの改善案は[[${up.label}]]（${up.sub}）。`, `[[${D.STAGE_NAME[bn]}]] needs attention. Best fix: [[${up.label}]] (${up.sub}).`)));
      // 段 L0：Rare より前は担当者からの提案ではなく、自分で打つ改善（押すとその手・その画面へ）
      if (!prop)
        best = {
          label: D.propsOpen(s) ? t('担当者からの提案', 'Proposal from staff') : t('自分で改善する', 'Fix it yourself'),
          fn: () => {
            D.closeSheet();
            up.go();
          },
        };
    } else hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。${D.STAGE_HINT[bn]}`, `[[${D.STAGE_NAME[bn]}]] needs attention. ${D.STAGE_HINT[bn]}`)));
  }
  if (prop) best = { label: t('担当者からの提案', 'Proposal from staff'), fn: () => hooks.openProposal?.(prop.plan, prop.say, prop.role, prop.speech) };
  void D.STAGE_HINT_SHORT;
  const kids: HTMLElement[] = [title(t('サプライチェーン', 'Supply chain'), t('KPI ③（SCM）', 'KPI 3 (SCM)')), el('div.ux-rl', flow), line(hint)];
  if (best) {
    const b = best;
    kids.push(line(pkey(b.label, b.fn, { ico: prop ? 'doc' : 'next', kind: 'ink', cls: 'uxs-rp-go uxs-rp-best' })));
  }
  kids.push(line(pkey(t('分析：サプライチェーンの画面', 'Analyze: supply chain'), () => hooks.openSupply(), { ico: 'truck', cls: 'uxs-rp-go' })));
  const page = el('div.ux-rp-page.uxs-rp-page', kids);
  const run = () => {
    if (api.instant()) {
      showAll(page);
      page.classList.add('is-grown');
      return;
    }
    const ls = [...page.querySelectorAll<HTMLElement>('.ux-rl')];
    [0, 1].forEach((i) =>
      api.later(i * 120, () => {
        ls[i]?.classList.add('is-on');
        uxSfx('print', { step: 4 });
      }),
    );
    api.later(300, () => {
      page.classList.add('is-grown');
      uxSfx('lamp', { step: 2 });
    });
    printLines(api, page, 2, 140, 760, () => api.skip(null));
    api.skip(() => {
      api.clear();
      showAll(page);
      page.classList.add('is-grown');
      api.skip(null);
    });
  };
  return { el: page, run };
}

// ---- ⑤ 各部からの報告（ある月だけ）：出土品・復興・レベルアップ・担当・士気と給与・お客さんの声・法務・できごと・交易
interface DeptLine {
  ico: string;
  label: string;
  text: string;
  more?: string;
  go?: [string, () => void];
  warn?: boolean;
}
function deptLines(s: P1State, r: Report, hooks: ReportHooks): DeptLine[] {
  const out: DeptLine[] = [];
  // 今月の出土品（発掘との出会いのあと・発掘場のあるセクタ）：新発見・研究 Lv ↑・RP。導線は研究ノート
  const dg = D.digMet(s) ? D.digReportLine(r) : null;
  if (dg) {
    const rv = D.reviveReportText(r);
    out.push({ ico: 'pick', label: t('今月の出土品', 'Finds this month'), text: D.digReportText(dg)[0], more: rv?.[0], go: hooks.openNotes ? [t('研究ノート', 'Notebook'), () => hooks.openNotes?.()] : undefined });
  } else {
    // 発掘場の無いセクタ・出会いの前でも、被災した町の復興の行は出す
    const rb = D.rebuildText(r.rebuild);
    if (rb) out.push({ ico: 'crane', label: t('復興', 'Rebuilding'), text: rb[0] });
  }
  // 今月のレベルアップ・強化アイテム（ヒーローの育成）
  const lt = D.levelUpText(r);
  if (lt) out.push({ ico: 'up', label: t('今月のレベルアップ', 'Level-ups this month'), text: lt[0], go: hooks.openGrowth ? [t('育成', 'Growth'), () => hooks.openGrowth?.()] : undefined });
  // 担当の報告（任せ方の 4 段）
  const dt = D.delegReportText(s, r);
  if (dt) out.push({ ico: 'people', label: t('担当の報告', 'Delegation'), text: dt[0], go: hooks.openProps ? [t('担当', 'Leads'), () => hooks.openProps?.()] : undefined });
  // 士気と給与（人事）
  const ht = D.hrReportText(r);
  if (ht) out.push({ ico: 'people', label: t('士気と給与', 'Morale & pay'), text: ht[0], go: hooks.openPay ? [t('給与', 'Pay'), () => hooks.openPay?.()] : undefined, warn: !!r.hr && (r.hr.want > 0 || r.hr.quit.length > 0) });
  // お客さんの声（カスタマーサポートと炎上）
  const ct = D.csReportText(r);
  if (ct) out.push({ ico: 'voice', label: t('お客さんの声', 'Customer voice'), text: ct[0], go: hooks.openCs ? [t('問い合わせ', 'Inquiries'), () => hooks.openCs?.()] : undefined, warn: !!r.cs && (!!r.cs.warn || !!r.cs.ignited || !!r.cs.heat || r.cs.expired > 0) });
  // 法務（買収・特許・裁判）
  const lg = D.legalReportText(r);
  if (lg) out.push({ ico: 'scale', label: t('法務', 'Legal'), text: lg[0], go: hooks.openLegal ? [t('法務', 'Legal'), () => hooks.openLegal?.()] : undefined, warn: !!r.legal && (r.legal.closed.length > 0 || r.legal.newSuits > 0 || r.legal.won > 0 || r.legal.lost > 0) });
  // 突発のできごと
  const et = D.eventReportText(r.events ?? [], r.evFx ?? [], r.evYen ?? 0);
  if (et) out.push({ ico: 'horn', label: t('できごと', 'Events'), text: et[0] });
  // 外交の交易
  if (r.dip) out.push({ ico: 'globe', label: t('交易', 'Trade'), text: D.dipReportText(r.dip)[0], go: hooks.openDiplo ? [t('外交', 'Diplomacy'), () => hooks.openDiplo?.()] : undefined, warn: !!(r.dip.short || r.dip.late) });
  return out;
}
function deptRow(x: DeptLine): HTMLElement {
  return line(
    el(
      `span.uxs-rp-dept${x.warn ? '.is-warn' : ''}`,
      el('span.uxs-rp-act', el('span.uxs-rp-dept-k', inkIcon(x.ico, 1), el('b', x.label), x.warn ? el('span.uxs-chip-k.is-bad', t('要確認', 'Check')) : null), x.go ? pkey(x.go[0], x.go[1]) : null),
      el('span', noEmoji(x.text)),
      x.more ? el('span.ux-t-ink2', noEmoji(x.more)) : null,
    ),
  );
}
function pageDept(api: PageApi, lines: DeptLine[]): Page {
  const page = el('div.ux-rp-page.uxs-rp-page', title(t('各部からの報告', 'From the departments'), t(`${lines.length} 件`, `${lines.length}`)), lines.map(deptRow));
  const run = () => {
    printLines(api, page, 0, 130, 0, () => api.skip(null));
    if (!api.instant())
      api.skip(() => {
        api.clear();
        showAll(page);
        api.skip(null);
      });
  };
  return { el: page, run };
}

// ---------------------------------------------------------------- 発掘作業のまとめ報告（同じ紙テープの 1 ページ）

/** 発掘作業のあいだに締めた月をまとめた 1 枚（p1/report.ts の openDigSummary から。入のときだけ） */
export function openDigSummaryUx(ctx: Ctx, sum: DigSummary, hooks: DigSummaryHooks, then?: () => void) {
  const s = ctx.s();
  const bn = D.reportJam(s, sum.latest);
  const m = /^(.*?)[（(](.+)[）)]\s*$/.exec(sum.title);
  openPaper(ctx, {
    title: sum.title,
    head: m ? m[1] : sum.title,
    tape: m ? m[2] : '',
    again: false,
    then,
    last: t('続ける', 'Continue'),
    pages: [
      (api) => {
        const digits = Math.max(7, String(Math.round(Math.max(0, sum.total))).length);
        const odo = new Odo({ digits, size: digits > 7 ? 'l' : 'xl', value: api.instant() ? sum.total : 0, cls: 'ux-odo--paper' });
        const top = Math.max(1, ...sum.months.map((x) => x.revenue));
        const bars = sum.months.map((x) => {
          const fill = el('i.is-main');
          fill.style.setProperty('--h', `${Math.max(2, Math.round((x.revenue / top) * 100))}%`);
          return el('div.uxs-mini-col', man(x.revenue), el('div.uxs-mini-bar', fill), el('span', x.label));
        });
        const mv = rankMove(sum.rankFrom, sum.rankTo);
        const win = (n: number, cls = '') => el(`span.uxs-rkb-win${cls}`, num(String(n), 'uxs-rkb-n'), el('span', t('位', '')));
        const kids: HTMLElement[] = [title(t('期間の売上', 'Sales in this period'), t('KPI ①', 'KPI 1')), line(el('span.uxs-rp-total', odo.el, num('G', 'uxs-rp-g'))), el('div.ux-rl.uxs-rule')];
        kids.push(el('div.ux-rl.uxs-mini.is-many', { role: 'img', 'aria-label': sum.months.map((x) => `${x.label} ${D.money(x.revenue)}`).join(t('、', ', ')) }, bars));
        if (sum.relic) kids.push(line(rcp(t('うち復刻品', 'incl. revivals'), D.money(sum.relic))));
        kids.push(el('div.ux-rl', el(`div.uxs-rkb.is-${mv}.is-up`, el('span', t('エリアの順位', 'Area rank')), sum.rankFrom != null ? [win(sum.rankFrom), inkIcon('next', 2)] : null, win(sum.rankTo, '.is-new'), sum.conquered ? el('span.uxs-rkb-move', sIcon('crown', { scale: 1 }), t('制覇！', 'Conquered!')) : null)));
        if (sum.money) {
          const dm = sum.money.end - sum.money.start;
          kids.push(line(rcp(t('資金', 'Funds'), D.signed(dm, D.money), tone(dm)), el('span.uxs-rp-sub', num(`${D.fmt(sum.money.start)} G`), inkIcon('next', 1), num(`${D.fmt(sum.money.end)} G`))));
        } else kids.push(line(rcp(t('資金', 'Funds'), '—')));
        // 今回の出土
        const got = sum.got;
        kids.push(
          line(el('span.ux-rl-k', t('今回の出土', 'This dig')), hooks.openNotes ? pkey(t('研究ノート', 'Notebook'), () => hooks.openNotes?.(), { ico: 'pick' }) : null),
          line(
            el(
              'span.uxs-ds-got',
              (
                [
                  [t('新発見', 'New'), `${got.found}`],
                  [t('研究 Lv ↑', 'Lv ↑'), `${got.lv}`],
                  ['RP', `+${got.rp}`],
                  [t('素材', 'Mats'), `+${got.mat}`],
                ] as [string, string][]
              ).map(([k, v]) => el('span.uxs-ds-stat', el('span', k), num(v))),
            ),
          ),
        );
        const rv = D.reviveReportText({ revive: sum.revive, museum: sum.museum });
        if (rv) kids.push(line(el('span.ux-t-ink2', noEmoji(rv[0]))));
        // いまの課題（最新の月）と打ち手 1 つ
        const tw = bn !== 'sell' || D.myShops(s).length ? D.whatIf(s, bn).find((w) => w.ok) : undefined;
        const up = tw ? D.moveUp(ctx, s, tw) : null;
        const hint = el('p.uxs-rp-hint');
        if (sum.latest.stall) hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。${D.stallSay(sum.latest.stall.stage, sum.latest.stall.why).replace(/^\[\[[^\]]*\]\]が止まっている。/, '')}`, `[[${D.STAGE_NAME[bn]}]] needs attention. ${D.stallSay(sum.latest.stall.stage, sum.latest.stall.why)}`)));
        else if (up && tw) hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。改善案：[[${up.label}]]（+${Math.round(tw.units)} 個／月）`, `[[${D.STAGE_NAME[bn]}]] needs attention. Fix: [[${up.label}]] (+${Math.round(tw.units)} / mo)`)));
        else hint.append(rich(t(`[[${D.STAGE_NAME[bn]}]]が課題あり。${D.STAGE_HINT_SHORT[bn]}`, `[[${D.STAGE_NAME[bn]}]] needs attention. ${D.STAGE_HINT_SHORT[bn]}`)));
        kids.push(line(el('span.ux-rl-k', t('いまの課題', 'Current issue')), el('span.uxs-rp-tag', t('KPI ③', 'KPI 3'))), line(hint));
        kids.push(line(pkey(t('くわしい報告を見る', 'Full report'), () => hooks.detail(), { ico: 'list', cls: 'uxs-rp-go' })));
        const page = el('div.ux-rp-page.uxs-rp-page', kids);
        const run = () => {
          const ls = [...page.querySelectorAll<HTMLElement>('.ux-rl')];
          const rest = () => {
            page.classList.add('is-grown');
            printLines(api, page, 2, 120, 200, () => api.skip(null));
            if (!api.instant())
              api.skip(() => {
                api.clear();
                showAll(page);
                api.skip(null);
              });
          };
          if (api.instant() || sum.total <= 0) {
            odo.set(sum.total, { dur: 0 });
            showAll(page);
            page.classList.add('is-grown');
            return;
          }
          let done = false;
          ls.slice(0, 2).forEach((l) => l.classList.add('is-on'));
          const finish = () => {
            if (done) return;
            done = true;
            api.clear();
            odo.finish();
            odo.el.classList.add('is-done');
            uxSfx(sum.conquered || sum.rankTo === 1 ? 'rankup' : 'deposit');
            const b = odo.el.getBoundingClientRect();
            coinsPop({ x: b.left + b.width / 2, y: b.top }, 10, 1.2);
            rest();
          };
          api.later(300, () => {
            if (done) return;
            odo.set(sum.total, { dur: COUNT_MS, ease: (x) => 1 - Math.pow(1 - x, 2.2), onTick: (k) => uxSfx('coin', { step: k * 11.99 }), onDone: finish });
          });
          api.skip(finish);
        };
        return { el: page, run };
      },
    ],
  });
}
