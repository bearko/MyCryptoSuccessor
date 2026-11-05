/**
 * 段 UI8：ゲーム全体で使うグラフの部品（DOM。SVG と CSS で描く。外部のライブラリは使わない）。
 * 段 UI7d〜UI7g の slideui.ts の部品（折れ線・倉庫の棒・予算の積み上げ棒・寄与の横棒）と同じ色と枠で、ほかの画面でも使えるようにまとめた。
 * - 線と棒（trendEl）・ろうそく足（candleEl）・ドーナツ（donutEl）・100% の積み上げ棒（pctBarEl）・ウォーターフォール（fallEl）・
 *   順位の横棒（rankBarsEl）・バブル（bubbleEl）・ヒートマップ（heatEl）・数字のカード（kpiCardEl）・目標との比べ（bulletEl）
 * - どの型も：凡例（形・模様と名前）・符号（＋−）と ▲▼・0 の線と基準線・字は画面の上で 12px 以上（幅に合わせて描き直す）・
 *   指を置く／マウスを乗せると、その点の数を吹き出しで。色だけで意味を伝えない（模様・線の形・字を添える）。半透明は使わない
 * 数は dash.ts（DOM なし）。決まりは docs/ISLAND_UX_CHARTER.md「2-7」「2-8」。
 */
import { t } from '../../i18n';
import { heatStep, monHead, monLab, type Bubble, type Candle, type Heat, type Part, type Step } from './dash';
import { h, money } from './ui';
import './ui8.css';

// ---------------------------------------------------------------- 数の書き方・色

const fmtN = (v: number) => Math.abs(Math.round(v)).toLocaleString('en-US');
/** 符号つきの G（＋−±） */
export const sgnG = (v: number) => (Math.round(v) > 0 ? `+${fmtN(v)} G` : Math.round(v) < 0 ? `−${fmtN(v)} G` : '±0 G');
/** 目盛りの短い書き方（日本語は「万」、英語は k・M。1 万未満はそのまま） */
export function shortN(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 10000) {
    const ja = a >= 1e8 ? `${+(a / 1e8).toFixed(1)}億` : `${+(a / 1e4).toFixed(a >= 1e5 ? 0 : 1)}万`; // i18n-ja
    const en = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : `${Math.round(a / 1e3)}k`;
    return s + t(ja, en);
  }
  return s + Math.round(a).toLocaleString('en-US');
}
export const arw = (v: number) => (Math.round(v) > 0 ? '▲' : Math.round(v) < 0 ? '▼' : '=');
/** 割合の切れ・カテゴリの色（不透明。ドット絵の世界の落ち着いた色） */
export const PALETTE = ['#3a8fd8', '#f2b544', '#5fc4b0', '#c0609a', '#8f9bb8', '#e8885a', '#9a7ae0', '#6b7590'];

const NS = 'http://www.w3.org/2000/svg';
const sv = <K extends keyof SVGElementTagNameMap>(tag: K, at: Record<string, string | number> = {}, text = '') => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
};
let seq = 0;
/** 模様（点・斜線・格子・横縞）の defs。id の頭を返す */
function patDefs(svg: SVGSVGElement): string {
  const id = `isl-cv${++seq}`;
  const defs = sv('defs');
  const dots = sv('pattern', { id: `${id}-dots`, width: 5, height: 5, patternUnits: 'userSpaceOnUse' });
  dots.append(sv('circle', { cx: 2.5, cy: 2.5, r: 1.1, class: 'isl-cv-pdot' }));
  const hatch = sv('pattern', { id: `${id}-hatch`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
  hatch.append(sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'isl-cv-pline' }));
  const grid = sv('pattern', { id: `${id}-grid`, width: 6, height: 6, patternUnits: 'userSpaceOnUse' });
  grid.append(sv('path', { d: 'M0,0H6M0,0V6', class: 'isl-cv-pline' }));
  const stripe = sv('pattern', { id: `${id}-stripe`, width: 6, height: 6, patternUnits: 'userSpaceOnUse' });
  stripe.append(sv('line', { x1: 0, y1: 3, x2: 6, y2: 3, class: 'isl-cv-pline' }));
  defs.append(dots, hatch, grid, stripe);
  svg.append(defs);
  return id;
}
/** 凡例の見本（色と模様。CSS の背景で描く） */
export function swatch(p: Pick<Part, 'col' | 'pat'>): HTMLElement {
  const e = h('i', `isl-cv-sw is-${p.pat}`);
  e.style.setProperty('--c', PALETTE[p.col % PALETTE.length]);
  return e;
}

/** 幅に合わせて描き直す（字はいつも 12px） */
function responsive(wrap: HTMLElement, draw: () => void) {
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(wrap);
  requestAnimationFrame(draw);
}
/** 吹き出し：wrap の中に置く。x は wrap の左からの px（はみ出さないように寄せる） */
function tipOf(wrap: HTMLElement) {
  const tip = h('div', 'isl-cv-tip');
  tip.hidden = true;
  wrap.append(tip);
  return {
    show(rows: (HTMLElement | string)[], x: number, y = 0) {
      tip.replaceChildren(...rows.map((r) => (typeof r === 'string' ? h('span', '', r) : r)));
      tip.hidden = false;
      const w = tip.offsetWidth || 160;
      const W = wrap.clientWidth || 300;
      tip.style.left = `${Math.max(0, Math.min(W - w, x - w / 2))}px`;
      tip.style.top = `${Math.max(0, y)}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}
/** 指・マウスの当たり（透明の四角）：位置 → 番号 */
function hitArea(svg: SVGSVGElement, W: number, x0: number, x1: number, H: number, at: (x: number) => void, off: () => void) {
  const hit = sv('rect', { x: x0, y: 0, width: Math.max(1, x1 - x0), height: H, fill: 'transparent', class: 'isl-cv-hit' });
  svg.append(hit);
  const pos = (e: Event) => {
    const r = svg.getBoundingClientRect();
    at((((e as PointerEvent).clientX - r.left) / Math.max(1, r.width)) * W);
  };
  hit.addEventListener('pointermove', pos);
  hit.addEventListener('pointerdown', pos);
  hit.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse') off();
  });
}
/** 目盛り：0 を含む・1・2・2.5・5 × 10 の何乗か */
function niceScale(vals: number[], o: { lo?: number; hi?: number; zero?: boolean } = {}) {
  let lo = o.lo ?? Math.min(o.zero === false ? Infinity : 0, ...vals);
  let hi = o.hi ?? Math.max(o.zero === false ? -Infinity : 0, ...vals);
  if (!isFinite(lo)) lo = 0;
  if (!isFinite(hi)) hi = 1;
  if (hi === lo) hi = lo + 1;
  const span = hi - lo;
  const raw = span / 3;
  const p10 = 10 ** Math.floor(Math.log10(raw));
  const stepV = [1, 2, 2.5, 5, 10].map((x) => x * p10).find((x) => x >= raw) ?? raw;
  const lo2 = o.lo ?? Math.floor(lo / stepV) * stepV;
  const hi2 = o.hi ?? Math.ceil(hi / stepV) * stepV;
  const ticks: number[] = [];
  for (let v = lo2; v <= hi2 + stepV * 0.01; v += stepV) ticks.push(Math.round(v * 1000) / 1000);
  return { lo: lo2, hi: hi2, ticks: ticks.length > 6 ? ticks.filter((_, k) => k % 2 === 0) : ticks };
}

// ---------------------------------------------------------------- 枠

/** グラフの枠（紺に金の内枠）：見出し（何が言えるかの 1 行）と出どころの注記 */
export function cvBox(title: string, note = '', cls = ''): { el: HTMLElement; body: HTMLElement } {
  const el = h('figure', `isl-cv ${cls}`.trim());
  const head = h('figcaption', 'isl-cv-head');
  head.append(h('b', '', title));
  if (note) head.append(h('small', '', note));
  const body = h('div', 'isl-cv-body');
  el.append(head, body);
  return { el, body };
}
/** 凡例（形と名前） */
export function legendEl(keys: { cls: string; name: string; sw?: HTMLElement }[]): HTMLElement {
  const e = h('div', 'isl-cv-legend');
  for (const k of keys) {
    const x = h('span', `isl-cv-key ${k.cls}`);
    x.append(k.sw ?? h('i', ''), document.createTextNode(k.name));
    e.append(x);
  }
  return e;
}

// ---------------------------------------------------------------- 線と棒（時間の推移）

export interface TSer {
  name: string;
  /** line＝実線と点・dash＝点線（見込み・前の値）・bar＝棒（負は 0 の線から下へ） */
  kind: 'line' | 'dash' | 'bar';
  /** 色の class（is-gold・is-teal・is-grey・is-blue） */
  cls: string;
  vals: (number | null)[];
}
export interface TRef {
  v: number;
  label: string;
  cls: string;
}
export interface TrendOpts {
  labels: string[];
  /** 吹き出しの見出し（無ければ labels） */
  heads?: string[];
  series: TSer[];
  refs?: TRef[];
  aria: string;
  /** 吹き出しの数の書き方（既定は G） */
  fmt?: (v: number) => string;
  /** 目盛りの書き方（既定は shortN） */
  axis?: (v: number) => string;
  lo?: number;
  hi?: number;
  /** 縦を逆に（順位：1 位が上） */
  invert?: boolean;
  /** 線の右端に名前と値 */
  ends?: boolean;
  height?: number;
  /** 予想の始まり（この番号から右は予想。境目の線と「予想 →」） */
  fcFrom?: number;
}
/**
 * 時間の推移：線（実線・点線）と棒を 1 本の縦の目盛りで。0 の線・基準線（帯の線と字）・線の右端に名前と値。
 * 指・マウスで月の値（十字の線と吹き出し）
 */
export function trendEl(o: TrendOpts): HTMLElement {
  const wrap = h('div', 'isl-cv-chart');
  const svg = sv('svg', { role: 'img', 'aria-label': o.aria }) as SVGSVGElement;
  wrap.append(svg);
  const tip = tipOf(wrap);
  const f = o.fmt ?? money;
  const ax = o.axis ?? shortN;
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = o.height ?? (W < 420 ? 172 : 188);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const pid = patDefs(svg);
    const n = Math.max(1, o.labels.length);
    const lines = o.series.filter((x) => x.kind !== 'bar');
    const L = 44;
    const R = o.ends && lines.length ? 74 : 10;
    const T = o.fcFrom != null ? 22 : 10;
    const B = 22;
    const all = o.series.flatMap((x) => x.vals.filter((v): v is number => v != null)).concat((o.refs ?? []).map((r) => r.v));
    const sc = niceScale(all.length ? all : [0, 1], { lo: o.lo, hi: o.hi, zero: !o.invert });
    const span = sc.hi - sc.lo || 1;
    const py = (v: number) => (o.invert ? T + ((H - T - B) * (v - sc.lo)) / span : T + (H - T - B) * (1 - (v - sc.lo) / span));
    const bw = (W - L - R) / n;
    const px = (k: number) => L + bw * (k + 0.5);
    for (const v of sc.ticks) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-cv-grid' }));
      svg.append(sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-cv-axis' }, ax(v)));
    }
    if (!o.invert && sc.lo < 0 && sc.hi > 0) svg.append(sv('line', { x1: L, x2: W - R, y1: py(0), y2: py(0), class: 'isl-cv-zero' }));
    // 予想の境目
    if (o.fcFrom != null && o.fcFrom > 0 && o.fcFrom < n) {
      const x = L + bw * o.fcFrom;
      svg.append(sv('line', { x1: x, x2: x, y1: 2, y2: H - B, class: 'isl-cv-fcline' }));
      svg.append(sv('text', { x: x + 4, y: 14, class: 'isl-cv-axis' }, t('予想 →', 'Forecast →')));
      svg.append(sv('text', { x: x - 4, y: 14, 'text-anchor': 'end', class: 'isl-cv-axis' }, t('← 実績', '← Actual')));
    }
    // 基準線（帯の線：点線と字。字は線の上、左の端）
    for (const r of o.refs ?? []) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(r.v), y2: py(r.v), class: `isl-cv-ref ${r.cls}` }));
      // 字は線の上（上の端に近ければ線の下）
      const ty = py(r.v) - 4 < T + 10 ? py(r.v) + 14 : py(r.v) - 4;
      svg.append(sv('text', { x: W - R - 4, y: ty, 'text-anchor': 'end', class: `isl-cv-reftxt ${r.cls}` }, r.label));
    }
    // 棒（棒の系列が複数なら横に並べる）
    const bars = o.series.filter((x) => x.kind === 'bar');
    const gw = Math.min(28, bw * 0.62);
    const one = bars.length ? gw / bars.length : 0;
    bars.forEach((ser, j) => {
      ser.vals.forEach((v, k) => {
        if (v == null) return;
        const x = px(k) - gw / 2 + one * j;
        const base = o.invert ? py(sc.hi) : py(Math.max(sc.lo, Math.min(sc.hi, 0)));
        const y = py(v);
        const neg = v < 0;
        const top = Math.min(y, base);
        const hh = Math.max(1, Math.abs(base - y));
        svg.append(sv('rect', { x: x + 1, y: top, width: Math.max(2, one - 2), height: hh, class: `isl-cv-bar ${ser.cls} ${neg ? 'is-neg' : ''}` }));
        // 赤字の棒は斜線も（色だけに頼らない）
        if (neg) svg.append(sv('rect', { x: x + 1, y: top, width: Math.max(2, one - 2), height: hh, fill: `url(#${pid}-hatch)`, class: 'isl-cv-over' }));
      });
    });
    // 線
    const pathOf = (vs: (number | null)[]) => {
      let d = '';
      let pen = false;
      vs.forEach((v, k) => {
        if (v == null) {
          pen = false;
          return;
        }
        d += `${pen ? 'L' : 'M'}${px(k).toFixed(1)},${py(v).toFixed(1)}`;
        pen = true;
      });
      return d;
    };
    for (const ser of lines) {
      svg.append(sv('path', { d: pathOf(ser.vals), class: `isl-cv-line ${ser.kind === 'dash' ? 'is-dash' : ''} ${ser.cls}` }));
      ser.vals.forEach((v, k) => {
        if (v == null) return;
        const lastK = ser.vals.reduce<number>((a, x, i) => (x != null ? i : a), -1);
        svg.append(sv('circle', { cx: px(k), cy: py(v), r: k === lastK ? 4 : ser.kind === 'dash' ? 3 : 2.6, class: `isl-cv-dot ${ser.kind === 'dash' ? 'is-hollow' : ''} ${ser.cls}` }));
      });
    }
    // 線の右端の名前と値（近すぎたら離す）
    if (o.ends && lines.length) {
      const ends = lines
        .map((ser) => {
          const k = ser.vals.reduce<number>((a, x, i) => (x != null ? i : a), -1);
          return k < 0 ? null : { ser, k, v: ser.vals[k] as number, y: py(ser.vals[k] as number) };
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => a.y - b.y);
      // 上から 28px ずつ離し、下の端からはみ出すなら下から詰め直す（名前が重ならないように）
      const yMin = T + 10;
      const yMax = H - B - 14;
      for (let i = 0; i < ends.length; i++) ends[i].y = Math.max(yMin, i ? Math.max(ends[i].y, ends[i - 1].y + 28) : ends[i].y);
      for (let i = ends.length - 1; i >= 0; i--) ends[i].y = Math.min(ends[i].y, yMax - (ends.length - 1 - i) * 28);
      for (const e of ends) {
        const y = Math.max(yMin, e.y);
        svg.append(sv('text', { x: W - R + 8, y: y - 2, class: `isl-cv-end ${e.ser.cls}` }, e.ser.name));
        svg.append(sv('text', { x: W - R + 8, y: y + 12, class: 'isl-cv-endv' }, ax(e.v)));
      }
    }
    // 横軸の名前（6 つまで。最後は必ず）
    const every = Math.ceil(n / 6);
    o.labels.forEach((lab, k) => {
      if ((n - 1 - k) % every !== 0) return;
      svg.append(sv('text', { x: px(k), y: H - 6, 'text-anchor': n === 1 ? 'middle' : k === 0 && px(k) - L < 20 ? 'start' : 'middle', class: 'isl-cv-axis' }, lab));
    });
    // 指・マウスで月の値
    const cross = sv('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'isl-cv-cross' });
    cross.style.display = 'none';
    svg.append(cross);
    hitArea(
      svg,
      W,
      L,
      W - R,
      H,
      (x) => {
        const k = Math.max(0, Math.min(n - 1, Math.floor((x - L) / bw)));
        cross.setAttribute('x1', String(px(k)));
        cross.setAttribute('x2', String(px(k)));
        cross.style.display = '';
        const rows: HTMLElement[] = [h('b', '', o.heads?.[k] ?? o.labels[k])];
        for (const ser of o.series) {
          const v = ser.vals[k];
          if (v == null) continue;
          const r = h('span', `isl-cv-tiprow ${ser.cls}`);
          r.append(h('i', `isl-cv-mk is-${ser.kind}`), document.createTextNode(`${ser.name} ${f(v)}`));
          rows.push(r);
        }
        tip.show(rows, (px(k) / W) * (wrap.clientWidth || W));
      },
      () => {
        cross.style.display = 'none';
        tip.hide();
      },
    );
  };
  responsive(wrap, draw);
  return wrap;
}
/** 線と棒の凡例（線の形・棒の形と名前） */
export function trendLegend(series: TSer[], refs: TRef[] = []): HTMLElement {
  return legendEl([...series.map((x) => ({ cls: `is-${x.kind} ${x.cls}`, name: x.name })), ...refs.map((r) => ({ cls: `is-ref ${r.cls}`, name: r.label }))]);
}

// ---------------------------------------------------------------- ろうそく足（月のはじめ・高い・安い・終わり）

/**
 * ろうそく足：胴＝月のはじめ → 月末（増えた月は中抜き・緑の枠／減った月は塗り・赤）、ヒゲ＝その月のいちばん高い・安い。
 * 高い・安いの記録の無い月（以前の報告）は、胴を点線の枠に（ヒゲなし）。指を置くと 4 つの数と増減（▲▼・符号）
 */
export function candleEl(cs: Candle[], labels: string[], heads: string[], aria: string): HTMLElement {
  const wrap = h('div', 'isl-cv-chart');
  const svg = sv('svg', { role: 'img', 'aria-label': aria }) as SVGSVGElement;
  wrap.append(svg);
  const tip = tipOf(wrap);
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = W < 420 ? 172 : 188;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const n = Math.max(1, cs.length);
    const L = 44;
    const R = 10;
    const T = 10;
    const B = 22;
    const sc = niceScale(cs.flatMap((c) => [c.h, c.l]), { zero: false });
    const span = sc.hi - sc.lo || 1;
    const py = (v: number) => T + (H - T - B) * (1 - (v - sc.lo) / span);
    const bw = (W - L - R) / n;
    const px = (k: number) => L + bw * (k + 0.5);
    for (const v of sc.ticks) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-cv-grid' }));
      svg.append(sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-cv-axis' }, shortN(v)));
    }
    if (sc.lo < 0 && sc.hi > 0) svg.append(sv('line', { x1: L, x2: W - R, y1: py(0), y2: py(0), class: 'isl-cv-zero' }));
    const cw = Math.max(6, Math.min(22, bw * 0.56));
    cs.forEach((c, k) => {
      const up = c.c >= c.o;
      const cls = `${up ? 'is-up' : 'is-down'} ${c.est ? 'is-est' : ''}`;
      if (!c.est) svg.append(sv('line', { x1: px(k), x2: px(k), y1: py(c.h), y2: py(c.l), class: `isl-cv-wick ${cls}` }));
      const y1 = py(Math.max(c.o, c.c));
      const y2 = py(Math.min(c.o, c.c));
      svg.append(sv('rect', { x: px(k) - cw / 2, y: y1, width: cw, height: Math.max(2, y2 - y1), class: `isl-cv-candle ${cls}` }));
    });
    const every = Math.ceil(n / 6);
    labels.forEach((lab, k) => {
      if ((n - 1 - k) % every !== 0) return;
      svg.append(sv('text', { x: px(k), y: H - 6, 'text-anchor': 'middle', class: 'isl-cv-axis' }, lab));
    });
    const cross = sv('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'isl-cv-cross' });
    cross.style.display = 'none';
    svg.append(cross);
    hitArea(
      svg,
      W,
      L,
      W - R,
      H,
      (x) => {
        const k = Math.max(0, Math.min(n - 1, Math.floor((x - L) / bw)));
        const c = cs[k];
        if (!c) return;
        cross.setAttribute('x1', String(px(k)));
        cross.setAttribute('x2', String(px(k)));
        cross.style.display = '';
        const d = c.c - c.o;
        const rows: (HTMLElement | string)[] = [h('b', '', heads[k] ?? labels[k]), t(`はじめ ${money(c.o)} → 月末 ${money(c.c)}`, `Open ${money(c.o)} → close ${money(c.c)}`), h('span', d >= 0 ? 'is-good' : 'is-bad', `${arw(d)} ${sgnG(d)}`)];
        rows.push(c.est ? t('（高い・安いの記録なし）', '(no high/low record)') : t(`高い ${money(c.h)}・安い ${money(c.l)}`, `High ${money(c.h)} · low ${money(c.l)}`));
        tip.show(rows, (px(k) / W) * (wrap.clientWidth || W));
      },
      () => {
        cross.style.display = 'none';
        tip.hide();
      },
    );
  };
  responsive(wrap, draw);
  return wrap;
}
export function candleLegend(cs: Candle[]): HTMLElement {
  const keys = [
    { cls: 'is-cup', name: t('増えた月（中抜き）', 'Up month (hollow)') },
    { cls: 'is-cdown', name: t('減った月（塗り）', 'Down month (filled)') },
    { cls: 'is-cwick', name: t('ヒゲ＝高い・安い', 'Wick = high/low') },
  ];
  if (cs.some((c) => c.est)) keys.push({ cls: 'is-cest', name: t('記録なしの月（点線）', 'No record (dotted)') });
  return legendEl(keys);
}

// ---------------------------------------------------------------- 割合：ドーナツ・100% の積み上げ棒

/**
 * ドーナツ：切れは大きい順・色と模様。真ん中に合計。凡例は 見本・名前・値・割合（%）。切れを押す／乗せると吹き出し
 */
export function donutEl(parts: Part[], center: { big: string; small: string }, aria: string, fmt: (v: number) => string = money): HTMLElement {
  const wrap = h('div', 'isl-cv-donut');
  const tot = parts.reduce((a, x) => a + x.v, 0) || 1;
  const S = 132;
  const R0 = 64;
  const R1 = 40;
  const svg = sv('svg', { role: 'img', 'aria-label': aria, viewBox: `0 0 ${S} ${S}`, width: S, height: S }) as SVGSVGElement;
  const pid = patDefs(svg);
  const fig = h('div', 'isl-cv-dfig');
  fig.append(svg);
  const mid = h('div', 'isl-cv-dmid');
  mid.append(h('b', '', center.big), h('small', '', center.small));
  fig.append(mid);
  const tip = tipOf(fig);
  let a0 = -Math.PI / 2;
  const pt = (a: number, r: number) => `${(S / 2 + r * Math.cos(a)).toFixed(2)},${(S / 2 + r * Math.sin(a)).toFixed(2)}`;
  const legend = h('ul', 'isl-cv-dlist');
  for (const p of parts) {
    const frac = p.v / tot;
    const a1 = a0 + Math.max(0.0001, frac * Math.PI * 2 - (parts.length > 1 ? 0.03 : 0));
    const big = a1 - a0 > Math.PI ? 1 : 0;
    const d = frac >= 0.9999 ? `M${pt(-Math.PI / 2, R0)}A${R0},${R0} 0 1 1 ${pt(-Math.PI / 2 - 0.0001, R0)}L${pt(-Math.PI / 2 - 0.0001, R1)}A${R1},${R1} 0 1 0 ${pt(-Math.PI / 2, R1)}Z` : `M${pt(a0, R0)}A${R0},${R0} 0 ${big} 1 ${pt(a1, R0)}L${pt(a1, R1)}A${R1},${R1} 0 ${big} 0 ${pt(a0, R1)}Z`;
    const seg = sv('path', { d, fill: PALETTE[p.col % PALETTE.length], class: 'isl-cv-seg' });
    svg.append(seg);
    if (p.pat !== 'solid') svg.append(sv('path', { d, fill: `url(#${pid}-${p.pat})`, class: 'isl-cv-over' }));
    const pc = Math.round(frac * 100);
    const say = () => tip.show([h('b', '', p.name), t(`${fmt(p.v)}（${pc}%）`, `${fmt(p.v)} (${pc}%)`)], S / 2, S / 2 - 22);
    seg.addEventListener('pointerenter', say);
    seg.addEventListener('pointerdown', say);
    seg.addEventListener('pointerleave', (e) => (e as PointerEvent).pointerType === 'mouse' && tip.hide());
    const li = h('li', '');
    li.append(swatch(p), h('span', 'isl-cv-dname', p.name), h('b', '', fmt(p.v)), h('small', '', `${pc}%`));
    legend.append(li);
    a0 += frac * Math.PI * 2;
  }
  wrap.append(fig, legend);
  return wrap;
}

/** 100% の積み上げ棒（横 1 本）：切れの中に割合（入れば）・下に凡例（見本・名前・値・%）。切れを押すと吹き出し */
export function pctBarEl(parts: Part[], aria: string, fmt: (v: number) => string = money): HTMLElement {
  const wrap = h('div', 'isl-cv-pct');
  const tot = parts.reduce((a, x) => a + x.v, 0) || 1;
  const bar = h('div', 'isl-cv-pbar');
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', aria);
  const tip = tipOf(wrap);
  for (const p of parts) {
    const pc = (p.v / tot) * 100;
    const seg = h('span', `isl-cv-pseg is-${p.pat}`);
    seg.style.setProperty('--c', PALETTE[p.col % PALETTE.length]);
    seg.style.flexGrow = String(p.v / tot);
    if (pc >= 14) seg.append(h('b', '', `${Math.round(pc)}%`));
    const say = () => tip.show([h('b', '', p.name), t(`${fmt(p.v)}（${Math.round(pc)}%）`, `${fmt(p.v)} (${Math.round(pc)}%)`)], seg.offsetLeft + seg.offsetWidth / 2, 34);
    seg.addEventListener('pointerenter', say);
    seg.addEventListener('pointerdown', say);
    seg.addEventListener('pointerleave', (e) => (e as PointerEvent).pointerType === 'mouse' && tip.hide());
    bar.append(seg);
  }
  const keys = h('ul', 'isl-cv-dlist is-row');
  for (const p of parts) {
    const li = h('li', '');
    li.append(swatch(p), h('span', 'isl-cv-dname', p.name), h('b', '', fmt(p.v)), h('small', '', `${Math.round((p.v / tot) * 100)}%`));
    keys.append(li);
  }
  wrap.append(bar, keys);
  return wrap;
}

// ---------------------------------------------------------------- 増減の内訳：ウォーターフォール

/** 0 を含む目盛りの下端・上端（1・2・2.5・5 × 10 の何乗か） */
function spanOf(vals: number[]): { lo: number; hi: number } {
  const lo0 = Math.min(0, ...vals);
  const hi0 = Math.max(0, ...vals);
  const span = hi0 - lo0 || 1;
  const p10 = 10 ** Math.floor(Math.log10(span / 2));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * p10).find((x) => x >= span / 3) ?? span / 3;
  return { lo: Math.floor(lo0 / step) * step, hi: Math.max(Math.ceil(hi0 / step) * step, lo0 + step) };
}
/** 縦の目盛り（横線 3 本・字）と 0 の線 */
function vgrid(svg: SVGSVGElement, L: number, R: number, W: number, py: (v: number) => number, lo: number, hi: number, ax: (v: number) => string) {
  for (const f of [0, 0.5, 1]) {
    const v = lo + (hi - lo) * f;
    svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-cv-grid' }));
    svg.append(sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-cv-axis' }, ax(v)));
  }
  if (lo < 0 && hi > 0) svg.append(sv('line', { x1: L, x2: W - R, y1: py(0), y2: py(0), class: 'isl-cv-zero' }));
}
/** 字の短縮（棒の下の名前） */
const clip = (x: string, n: number) => ([...x].length > n ? `${[...x].slice(0, n - 1).join('')}…` : x);
/**
 * 段 UI9：ウォーターフォール（縦の棒）：両端が全体の棒（はじめ＝灰・終わり＝金）、間が増減の棒（足す＝緑・▲＋／引く＝赤の斜線・▼−）。
 * 棒の上に値、下に名前（両端）と番号（間）。番号と名前・値の一覧は下に。段を結ぶ点線で「ここまでの合計」を追える。決まり：両端が全体、間が増減。角の丸みは無し
 */
export function fallEl(rows: Step[], aria: string, fmt: (v: number) => string = money): HTMLElement {
  const wrap = h('div', 'isl-cv-fall');
  const chart = h('div', 'isl-cv-chart');
  const svg = sv('svg', { role: 'img', 'aria-label': aria }) as SVGSVGElement;
  chart.append(svg);
  const tip = tipOf(chart);
  const mids = rows.filter((r) => r.kind === 'up' || r.kind === 'down');
  const draw = () => {
    const W = Math.max(240, Math.round(chart.clientWidth || 300));
    const H = W < 420 ? 180 : 200;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const pid = patDefs(svg);
    const L = 46;
    const R = 8;
    const T = 20;
    const B = 20;
    const { lo, hi } = spanOf(rows.flatMap((r) => [r.from, r.to]));
    const py = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    vgrid(svg, L, R, W, py, lo, hi, shortN);
    const n = rows.length;
    const bw = (W - L - R) / n;
    const barW = Math.max(12, Math.min(44, bw * 0.6));
    rows.forEach((r, k) => {
      const cx = L + bw * (k + 0.5);
      const full = r.kind === 'start' || r.kind === 'total';
      const y0 = py(full ? 0 : r.from);
      const y1 = py(r.to);
      const top = Math.min(y0, y1);
      const hh = Math.max(1, Math.abs(y0 - y1));
      const rect = sv('rect', { x: cx - barW / 2, y: top, width: barW, height: hh, class: `isl-cv-fbar is-${r.kind} ${full && r.to < 0 ? 'is-neg' : ''}` });
      svg.append(rect);
      if (r.kind === 'down') svg.append(sv('rect', { x: cx - barW / 2, y: top, width: barW, height: hh, fill: `url(#${pid}-hatch)`, class: 'isl-cv-fover' }));
      if (k < n - 1) svg.append(sv('line', { x1: cx + barW / 2, x2: cx + bw - barW / 2, y1: py(r.to), y2: py(r.to), class: 'isl-cv-flink' }));
      // 棒が細いとき（1 本 80px 未満）は短い書き方（2.7万）で、隣どうしの字が重ならないよう高さを互い違いに。正確な値は下の一覧
      const compact = bw < 80;
      const val = full ? `${r.to < 0 ? '−' : ''}${compact ? shortN(Math.abs(r.to)) : fmt(Math.abs(r.to))}` : compact ? `${arw(r.v)}${shortN(Math.abs(r.v))}` : `${arw(r.v)} ${sgnG(r.v)}`;
      const dy = compact && !full && k % 2 === 0 ? 16 : 4;
      svg.append(sv('text', { x: cx, y: top - dy, 'text-anchor': 'middle', class: `isl-cv-fv ${r.kind === 'up' ? 'is-good' : r.kind === 'down' ? 'is-bad' : ''}` }, val));
      // 段 UI9b：両端の名前（As-Is・To-Be）は 5 字までなら切らない（半角は細いので 1 本 40px あれば入る）
      svg.append(sv('text', { x: cx, y: H - 5, 'text-anchor': 'middle', class: 'isl-cv-axis' }, full ? clip(r.name, Math.max(3, Math.floor(bw / (/^[\x20-\x7e]+$/.test(r.name) ? 7 : 12)))) : String(mids.indexOf(r) + 1)));
      const say = () => tip.show([h('b', '', r.name), full ? `${r.to < 0 ? '−' : ''}${fmt(Math.abs(r.to))}` : t(`${sgnG(r.v)} → ここまで ${r.to < 0 ? '−' : ''}${fmt(Math.abs(r.to))}`, `${sgnG(r.v)} → running ${r.to < 0 ? '−' : ''}${fmt(Math.abs(r.to))}`)], (cx / W) * (chart.clientWidth || W), top);
      rect.addEventListener('pointerenter', say);
      rect.addEventListener('pointerdown', say);
      rect.addEventListener('pointerleave', (ev) => (ev as PointerEvent).pointerType === 'mouse' && tip.hide());
    });
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(chart);
  requestAnimationFrame(draw);
  wrap.append(chart);
  const ol = h('ol', 'isl-cv-fkeys');
  mids.forEach((r, k) => {
    const li = h('li', `isl-cv-fkey is-${r.kind}`);
    li.dataset.key = r.key;
    const nm = h('span', 'isl-cv-fname');
    nm.append(h('b', 'isl-cv-fn', String(k + 1)), document.createTextNode(r.name));
    li.append(nm, h('b', `isl-cv-fval ${r.kind === 'up' ? 'is-good' : 'is-bad'}`, `${arw(r.v)} ${sgnG(r.v)}`));
    ol.append(li);
  });
  wrap.append(ol);
  return wrap;
}
/**
 * 段 UI9：縦棒の比較（横に並べる。名前は棒の下、値は棒の上）。比較は縦棒、横棒はランキングだけ（決まり）。cls：is-gold・is-grey・is-teal・is-blue
 */
export function vbarsEl(items: { name: string; v: number; cls?: string }[], o: { aria: string; fmt?: (v: number) => string; axis?: (v: number) => string; height?: number }): HTMLElement {
  const wrap = h('div', 'isl-cv-chart isl-cv-vbars');
  const svg = sv('svg', { role: 'img', 'aria-label': o.aria }) as SVGSVGElement;
  wrap.append(svg);
  const tip = tipOf(wrap);
  const f = o.fmt ?? money;
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = o.height ?? (W < 420 ? 172 : 188);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const L = 46;
    const R = 8;
    const T = 20;
    const B = 22;
    const { lo, hi } = spanOf(items.map((x) => x.v));
    const py = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo || 1));
    vgrid(svg, L, R, W, py, lo, hi, o.axis ?? shortN);
    const n = Math.max(1, items.length);
    const bw = (W - L - R) / n;
    const barW = Math.max(10, Math.min(48, bw * 0.55));
    items.forEach((x, k) => {
      const cx = L + bw * (k + 0.5);
      const y0 = py(0);
      const y1 = py(x.v);
      const top = Math.min(y0, y1);
      const rect = sv('rect', { x: cx - barW / 2, y: top, width: barW, height: Math.max(1, Math.abs(y0 - y1)), class: `isl-cv-bar ${x.cls ?? 'is-gold'} ${x.v < 0 ? 'is-neg' : ''}` });
      svg.append(rect);
      if (n <= 6) svg.append(sv('text', { x: cx, y: top - 4, 'text-anchor': 'middle', class: 'isl-cv-fv' }, f(x.v)));
      svg.append(sv('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'isl-cv-axis' }, clip(x.name, Math.max(3, Math.floor(bw / 12)))));
      const say = () => tip.show([h('b', '', x.name), f(x.v)], (cx / W) * (wrap.clientWidth || W), top);
      rect.addEventListener('pointerenter', say);
      rect.addEventListener('pointerdown', say);
      rect.addEventListener('pointerleave', (ev) => (ev as PointerEvent).pointerType === 'mouse' && tip.hide());
    });
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(wrap);
  requestAnimationFrame(draw);
  return wrap;
}
export const fallLegend = () =>
  legendEl([
    { cls: 'is-fstart', name: t('はじめ', 'Start') },
    { cls: 'is-fup', name: t('▲ 増加', '▲ Adds') },
    { cls: 'is-fdown', name: t('▼ 減少（斜線）', '▼ Takes (hatched)') },
    { cls: 'is-ftotal', name: t('終わり', 'End') },
  ]);

// ---------------------------------------------------------------- 順位：横棒とゴールライン

/**
 * 順位の横棒（並びはそのまま＝順位の順）：順位・名前・棒・値。自社は金の棒と「◀ 自社」の字。goal 位と次の間にゴールライン（点線と字）
 */
export function rankBarsEl(rows: { name: string; v: number; me: boolean; tag?: HTMLElement }[], o: { goal?: number; aria: string; fmt?: (v: number) => string; meLabel?: string } = { aria: '' }): HTMLElement {
  const e = h('ol', 'isl-cv-rank');
  e.setAttribute('aria-label', o.aria);
  const f = o.fmt ?? money;
  const top = Math.max(1, ...rows.map((r) => r.v));
  rows.forEach((r, k) => {
    const li = h('li', `isl-cv-rrow ${r.me ? 'is-me' : ''}`);
    const nm = h('span', 'isl-cv-rname', r.name);
    if (r.me) nm.append(h('small', 'isl-cv-rme', o.meLabel ?? t('◀ 自社', '◀ You')));
    if (r.tag) nm.append(r.tag);
    const track = h('span', 'isl-cv-rtrack');
    const bar = h('i', `isl-cv-rbar ${r.me ? 'is-me' : ''}`);
    bar.style.width = `${Math.max(1, (Math.max(0, r.v) / top) * 100)}%`;
    track.append(bar);
    li.append(h('b', 'isl-cv-rn', String(k + 1)), nm, track, h('b', 'isl-cv-rv', f(r.v)));
    e.append(li);
    if (o.goal != null && k + 1 === o.goal && rows.length > o.goal) e.append(h('li', 'isl-cv-goal', t('ゴールライン', 'Goal line')));
  });
  return e;
}

// ---------------------------------------------------------------- 2 つの量と大きさ：バブル

/**
 * バブル（散布図）：横 x・縦 y・円の大きさ r。円に番号（字）・下に番号と名前の一覧。y の 0 の線。指を置くと 3 つの数
 */
export function bubbleEl(pts: Bubble[], o: { xName: string; yName: string; rName: string; xFmt: (v: number) => string; yFmt: (v: number) => string; rFmt: (v: number) => string; aria: string; yRef?: TRef }): HTMLElement {
  const wrap = h('div', 'isl-cv-chart isl-cv-bubble');
  const svg = sv('svg', { role: 'img', 'aria-label': o.aria }) as SVGSVGElement;
  wrap.append(svg);
  const tip = tipOf(wrap);
  const list = h('ol', 'isl-cv-blist');
  pts.forEach((p, k) => {
    const li = h('li', '');
    li.append(h('b', 'isl-cv-bn', String(k + 1)), h('span', '', p.name), h('small', '', t(`${o.xFmt(p.x)}・${o.yFmt(p.y)}`, `${o.xFmt(p.x)} · ${o.yFmt(p.y)}`)));
    list.append(li);
  });
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = W < 420 ? 196 : 212;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const L = 44;
    const R = 14;
    const T = 22;
    const B = 34;
    const rMax = Math.max(1, ...pts.map((p) => p.r));
    const rad = (r: number) => 7 + 15 * Math.sqrt(Math.max(0, r) / rMax);
    const sx = niceScale(pts.map((p) => p.x));
    const sy = niceScale(pts.map((p) => p.y).concat(o.yRef ? [o.yRef.v] : []));
    const px = (v: number) => L + 18 + ((W - L - R - 36) * (v - sx.lo)) / (sx.hi - sx.lo || 1);
    const py = (v: number) => T + 14 + (H - T - B - 28) * (1 - (v - sy.lo) / (sy.hi - sy.lo || 1));
    for (const v of sy.ticks) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-cv-grid' }));
      svg.append(sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-cv-axis' }, o.yFmt(v)));
    }
    if (sy.lo < 0 && sy.hi > 0) svg.append(sv('line', { x1: L, x2: W - R, y1: py(0), y2: py(0), class: 'isl-cv-zero' }));
    if (o.yRef) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(o.yRef.v), y2: py(o.yRef.v), class: `isl-cv-ref ${o.yRef.cls}` }));
      svg.append(sv('text', { x: W - R - 4, y: py(o.yRef.v) - 4, 'text-anchor': 'end', class: `isl-cv-reftxt ${o.yRef.cls}` }, o.yRef.label));
    }
    sx.ticks.forEach((v, i) => {
      if (sx.ticks.length > 4 && i % 2) return;
      svg.append(sv('text', { x: px(v), y: H - 20, 'text-anchor': 'middle', class: 'isl-cv-axis' }, shortN(v)));
    });
    svg.append(sv('text', { x: W - R, y: H - 4, 'text-anchor': 'end', class: 'isl-cv-axis' }, `${o.xName} →`));
    svg.append(sv('text', { x: 4, y: 13, class: 'isl-cv-axis' }, `↑ ${o.yName}`));
    // 大きい円から先に描く（小さい円が上に見える）
    const order = pts.map((p, k) => ({ p, k })).sort((a, b) => b.p.r - a.p.r);
    for (const { p, k } of order) {
      const c = sv('circle', { cx: px(p.x), cy: py(p.y), r: rad(p.r), class: `isl-cv-bub ${p.y < 0 ? 'is-neg' : ''}` });
      svg.append(c);
      svg.append(sv('text', { x: px(p.x), y: py(p.y) + 4, 'text-anchor': 'middle', class: 'isl-cv-bubn' }, String(k + 1)));
      const say = () => tip.show([h('b', '', `${k + 1}. ${p.name}`), `${o.xName} ${o.xFmt(p.x)}`, `${o.yName} ${o.yFmt(p.y)}`, `${o.rName} ${o.rFmt(p.r)}`], (px(p.x) / W) * (wrap.clientWidth || W), 0);
      c.addEventListener('pointerenter', say);
      c.addEventListener('pointerdown', say);
      c.addEventListener('pointerleave', (e) => (e as PointerEvent).pointerType === 'mouse' && tip.hide());
    }
  };
  responsive(wrap, draw);
  const box = h('div', 'isl-cv-bwrap');
  box.append(wrap, list);
  return box;
}

// ---------------------------------------------------------------- 2 つの区分の濃淡：ヒートマップ

const HEAT_NAME = () => [t('0%', '0%'), t('〜50%', '<50%'), t('〜90%', '<90%'), t('〜110%', '≤110%'), t('超え ⚠', 'Over ⚠')];
/** ヒートマップのます目：字（ます目の中）・濃さの段（0〜4）・吹き出しの行。null＝記録なし（—） */
export interface HCell {
  text: string;
  step: number;
  tip: string[];
}
/**
 * ヒートマップ（行 × 列）の共通の形：ます目の濃さ（5 段・不透明）と、ます目の中の字（色だけに頼らない）。押すと吹き出し。
 * legend：5 段の名前（左から段 0〜4）
 */
export function heatGridEl(o: { rows: { name: string; color?: string; sub?: string }[]; cols: string[]; cells: (HCell | null)[][]; legend: string[]; aria: string }): HTMLElement {
  const wrap = h('div', 'isl-cv-heat');
  const grid = h('div', 'isl-cv-hgrid');
  grid.setAttribute('role', 'img');
  grid.setAttribute('aria-label', o.aria);
  grid.style.setProperty('--n', String(o.cols.length));
  const tip = tipOf(wrap);
  grid.append(h('span', 'isl-cv-hcorner', ''));
  for (const c of o.cols) grid.append(h('span', 'isl-cv-hcol', c));
  o.rows.forEach((r, i) => {
    const nm = h('span', 'isl-cv-hrow', r.name);
    if (r.color) nm.style.setProperty('--d', r.color);
    if (r.sub) nm.append(h('small', 'isl-cv-hsub', r.sub));
    grid.append(nm);
    o.cells[i].forEach((c, j) => {
      const cell = h('span', `isl-cv-hcell is-s${c ? c.step : 'x'}`, c ? c.text : '—');
      if (c) {
        const say = () => tip.show([h('b', '', t(`${r.name}・${o.cols[j]}`, `${r.name} · ${o.cols[j]}`)), ...c.tip], cell.offsetLeft + cell.offsetWidth / 2, cell.offsetTop + cell.offsetHeight + 2);
        cell.addEventListener('pointerenter', say);
        cell.addEventListener('pointerdown', say);
        cell.addEventListener('pointerleave', (e) => (e as PointerEvent).pointerType === 'mouse' && tip.hide());
      }
      grid.append(cell);
    });
  });
  const keys = h('div', 'isl-cv-legend');
  o.legend.forEach((nm, k) => {
    const key = h('span', 'isl-cv-key');
    key.append(h('i', `isl-cv-hsw is-s${k}`), document.createTextNode(nm));
    keys.append(key);
  });
  wrap.append(grid, keys);
  return wrap;
}
/** 部門 × 月の予算の使い方（使った ÷ 予算。ます目に % と ⚠） */
export function heatEl(x: Heat, aria: string): HTMLElement {
  return heatGridEl({
    rows: x.rows.map((r) => ({ name: r.name, color: r.color })),
    cols: x.cols.map((c) => c.label),
    cells: x.cells.map((row) =>
      row.map((c) => (c ? { text: `${c.pct}%${heatStep(c.pct) === 4 ? '⚠' : ''}`, step: heatStep(c.pct), tip: [t(`使った ${money(c.used)} / 予算 ${money(c.amt)}`, `Used ${money(c.used)} / ${money(c.amt)}`), t(`施策 ${c.acts} 件`, `${c.acts} moves`)] } : null)),
    ),
    legend: HEAT_NAME(),
    aria,
  });
}

// ---------------------------------------------------------------- 単発の数字：KPI のカード・目標との比べ

/** 数字のカード：名前・大きな数字・前の月との差（▲▼ と符号。良い向きは goodUp で）・小さな注記 */
export function kpiCardEl(o: { icon: string; label: string; v: string; d?: number | null; dFmt?: (v: number) => string; dLab?: string; goodUp?: boolean; sub?: string; cls?: string }): HTMLElement {
  const e = h('div', `isl-cv-kpi ${o.cls ?? ''}`.trim());
  e.append(h('span', 'isl-cv-klab', `${o.icon} ${o.label}`), h('b', 'isl-cv-knum', o.v));
  if (o.d != null) {
    const good = (o.goodUp ?? true) ? o.d > 0 : o.d < 0;
    const r = Math.round(o.d);
    const df = o.dFmt ?? ((v: number) => (Math.round(v) > 0 ? `+${fmtN(v)}` : Math.round(v) < 0 ? `−${fmtN(v)}` : '±0'));
    e.append(h('span', `isl-cv-kd ${r === 0 ? 'is-even' : good ? 'is-good' : 'is-bad'}`, `${arw(o.d)} ${df(o.d)}${o.dLab ? ` ${o.dLab}` : ''}`));
  }
  if (o.sub) e.append(h('small', 'isl-cv-ksub', o.sub));
  return e;
}
/** KPI のカードを横に並べる（スマホは 2 列） */
export function kpiRow(xs: HTMLElement[]): HTMLElement {
  const e = h('div', 'isl-cv-kpis');
  e.append(...xs);
  return e;
}

/**
 * 目標・上限との比べ（横のメーター）：実績の棒と、目標（上限）の縦の線と字。
 * 目標（既定）：届いた ✔（緑）／届かない ✖（赤と斜線）。上限（over: 'cap'）：超えた ⚠（赤と斜線）／内なら「残り ○」（金）
 */
export function bulletEl(o: { label: string; v: number; target: number; fmt?: (v: number) => string; tName: string; over?: 'cap' | 'progress' }): HTMLElement {
  const f = o.fmt ?? money;
  const e = h('div', 'isl-cv-bullet');
  const cap = o.over === 'cap';
  const max = o.over === 'progress' ? Math.max(1, o.target, o.v) : Math.max(1, o.v, o.target) * 1.1;
  const reach = Math.round(o.v) >= Math.round(o.target);
  const over = Math.round(o.v) > Math.round(o.target);
  const prog = o.over === 'progress';
  const pc = Math.round((o.v / Math.max(1, o.target)) * 100);
  const cls = prog ? (reach ? 'is-good' : 'is-cap') : cap ? (over ? 'is-bad' : 'is-cap') : reach ? 'is-good' : 'is-bad';
  // 進み（progress）：「12 / 40（30%）」。全部そろえば ✔
  const mark = prog ? t(`/ ${f(o.target)}（${pc}%）${reach ? ' ✔' : ''}`, `/ ${f(o.target)} (${pc}%)${reach ? ' ✔' : ''}`) : cap ? (over ? t('⚠ 超え', '⚠ over') : t(`残り ${f(o.target - o.v)}`, `${f(o.target - o.v)} left`)) : reach ? t('✔ 届いた', '✔ met') : t('✖ 届かない', '✖ short');
  const head = h('div', 'isl-cv-btop');
  head.append(h('span', '', o.label), h('b', cls, prog ? `${f(o.v)} ${mark}` : t(`${f(o.v)}・${mark}`, `${f(o.v)} · ${mark}`)));
  const tr = h('div', 'isl-cv-btrack');
  const fill = h('i', `isl-cv-bfill ${cls}`);
  fill.style.width = `${(Math.max(0, o.v) / max) * 100}%`;
  const tick = h('span', 'isl-cv-bmark');
  tick.style.left = `${(o.target / max) * 100}%`;
  tr.append(fill);
  if (!prog) tr.append(tick);
  e.append(head, tr);
  if (!prog) e.append(h('small', 'isl-cv-bnote', `┃ ${o.tName} ${f(o.target)}`));
  return e;
}

// ---------------------------------------------------------------- 段 UI8b：月ごとの記録の推移（枠・線・凡例をまとめて）

/**
 * 月の締めの記録の推移を、枠つきの線グラフ 1 つに（見出し・出どころの 1 行・凡例）。series の vals は months と同じ長さ。
 * 記録が 2 か月より少なければ null（線にならないので出さない）
 */
export function histBox(o: { title: string; note?: string; months: number[]; series: TSer[]; refs?: TRef[]; fmt?: (v: number) => string; axis?: (v: number) => string; lo?: number; hi?: number; aria: string; ends?: boolean; height?: number; cls?: string }): HTMLElement | null {
  if (o.months.length < 2) return null;
  const box = cvBox(o.title, o.note ?? '', o.cls ?? '');
  box.body.append(
    trendEl({ labels: o.months.map((m, k) => monLab(m, k === 0)), heads: o.months.map(monHead), series: o.series, refs: o.refs, fmt: o.fmt, axis: o.axis, lo: o.lo, hi: o.hi, aria: o.aria, ends: o.ends, height: o.height ?? 150 }),
    trendLegend(o.series, o.refs ?? []),
  );
  return box.el;
}
