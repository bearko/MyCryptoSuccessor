/**
 * 段 UI7d：スライド型の提案書の部品（DOM）。スライドの送り（横のスワイプ・下の点と矢印・キーボードの ← →）と、
 * グラフ・タイル・メーター（SVG と CSS で描く。外部のライブラリは使わない）。数字は slides.ts（DOM なし）から。
 * 色：このまま＝灰（#8f9bb8・点線）、承認後＝金（#f2b544・実線）。増える＝緑・減る＝赤は、いつも符号（＋−）と ▲▼ を添える（色だけに頼らない）。
 * 決まりは docs/ISLAND_UX_CHARTER.md「2-5. スライド型の提案書」。
 */
import { t } from '../../i18n';
import { DEPT, POLICY, type DeptId } from './data';
import { RISK_ICON, RISK_LV, type BudgetBar, type Fall, type Kpi, type LineMark, type Meter, type StageMap } from './slides';
import type { StoreChart } from './storefc';
export { storeNote } from './storefc';
import type { Brief, Risk } from './brief';

type CoFunds = Brief['co'];
import { h, money } from './ui';

// ---------------------------------------------------------------- 数の書き方

const fmt = (v: number) => Math.abs(Math.round(v)).toLocaleString('en-US');
/** 符号つき（＋・−・±）。unit：「G」「RP」 */
export function sgn(v: number, unit = ''): string {
  const r = Math.round(v);
  const u = unit ? ` ${unit}` : '';
  return r > 0 ? `+${fmt(r)}${u}` : r < 0 ? `−${fmt(r)}${u}` : `±0${u}`;
}
/** 増減の矢印（色だけに頼らない） */
export const arrow = (v: number) => (Math.round(v) > 0 ? '▲' : Math.round(v) < 0 ? '▼' : '=');
const tone = (v: number) => (Math.round(v) > 0 ? 'is-good' : Math.round(v) < 0 ? 'is-bad' : 'is-even');
/** 目盛りの短い書き方（日本語は「万」、英語は k・M） */
export function short(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 10000) {
    const ja = a >= 1e8 ? `${+(a / 1e8).toFixed(1)}億` : `${Math.round(a / 1e4).toLocaleString('en-US')}万`; // i18n-ja
    const en = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : `${Math.round(a / 1e3)}k`;
    return s + t(ja, en);
  }
  return s + Math.round(a).toLocaleString('en-US');
}

/** 部門の札（短い名前・部門の色の枠） */
export function deptChip(d: DeptId, extra = ''): HTMLElement {
  const e = h('span', `isl-sl-dtag ${extra}`.trim(), DEPT[d].short);
  e.style.setProperty('--d', DEPT[d].color);
  return e;
}

// ---------------------------------------------------------------- 送り（デッキ）

export interface Deck {
  el: HTMLElement;
  /** 下の点と矢印の行 */
  nav: HTMLElement;
  go: (i: number) => void;
  at: () => number;
  /** 閉じるとき（キーボードの受け取りを外す） */
  off: () => void;
}
/**
 * スライドを横に並べる（scroll-snap。スマホは指で横にスワイプ）。下に点と矢印（点はスライドの名前つき。PC は横にも大きな矢印）。
 * キーボードの ← → で送る（入力欄にいるときは送らない）
 */
export function deck(slides: { id: string; name: string; el: HTMLElement }[], onMove?: (i: number) => void): Deck {
  const el = h('div', 'isl-sl-deck');
  const track = h('div', 'isl-sl-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'region');
  track.setAttribute('aria-roledescription', t('スライド', 'slides'));
  for (const [k, s] of slides.entries()) {
    s.el.classList.add('isl-sl');
    s.el.dataset.slide = s.id;
    s.el.setAttribute('aria-label', `${k + 1} / ${slides.length} ${s.name}`);
    track.append(s.el);
  }
  el.append(track);
  let cur = 0;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nav = h('div', 'isl-sl-nav');
  const prev = h('button', 'isl-sl-arrow is-prev', '‹');
  const next = h('button', 'isl-sl-arrow is-next', '›');
  prev.type = next.type = 'button';
  prev.setAttribute('aria-label', t('前のスライド', 'Previous slide'));
  next.setAttribute('aria-label', t('次のスライド', 'Next slide'));
  const dots = h('div', 'isl-sl-dots');
  const dotEls = slides.map((s, k) => {
    const d = h('button', 'isl-sl-dot');
    d.type = 'button';
    d.dataset.i = String(k);
    d.setAttribute('aria-label', `${k + 1}. ${s.name}`);
    d.append(h('span', 'isl-sl-dotpip'), h('span', 'isl-sl-dotname', s.name));
    d.addEventListener('click', (e) => {
      e.stopPropagation();
      go(k);
    });
    dots.append(d);
    return d;
  });
  const page = h('span', 'isl-sl-page');
  nav.append(prev, dots, page, next);
  // PC：スライドの横の大きな矢印
  const sideP = h('button', 'isl-sl-side is-prev', '‹');
  const sideN = h('button', 'isl-sl-side is-next', '›');
  sideP.type = sideN.type = 'button';
  sideP.setAttribute('aria-label', t('前のスライド', 'Previous slide'));
  sideN.setAttribute('aria-label', t('次のスライド', 'Next slide'));
  el.append(sideP, sideN);
  const paint = () => {
    dotEls.forEach((d, k) => {
      d.classList.toggle('is-on', k === cur);
      d.setAttribute('aria-current', k === cur ? 'step' : 'false');
    });
    page.textContent = `${cur + 1} / ${slides.length}`;
    for (const b of [prev, sideP]) b.disabled = cur === 0;
    for (const b of [next, sideN]) b.disabled = cur === slides.length - 1;
    slides.forEach((s, k) => s.el.setAttribute('aria-hidden', k === cur ? 'false' : 'true'));
  };
  const go = (i: number) => {
    const k = Math.max(0, Math.min(slides.length - 1, i));
    const w = track.clientWidth;
    if (w > 0) track.scrollTo({ left: k * w, behavior: reduce ? 'auto' : 'smooth' });
    if (k !== cur) {
      cur = k;
      paint();
      onMove?.(cur);
    }
  };
  for (const [b, d] of [
    [prev, -1],
    [next, 1],
    [sideP, -1],
    [sideN, 1],
  ] as const)
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      go(cur + d);
    });
  // 指で送ったとき：止まった位置から今のスライドを決める
  let tm = 0;
  track.addEventListener('scroll', () => {
    window.clearTimeout(tm);
    tm = window.setTimeout(() => {
      const w = track.clientWidth;
      if (!w) return;
      const k = Math.round(track.scrollLeft / w);
      if (k !== cur) {
        cur = Math.max(0, Math.min(slides.length - 1, k));
        paint();
        onMove?.(cur);
      }
    }, 80);
  });
  // 大きさが変わったら、今のスライドに合わせ直す
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => (track.scrollLeft = cur * track.clientWidth)) : null;
  ro?.observe(track);
  const key = (e: KeyboardEvent) => {
    if (!el.isConnected) return;
    const tg = e.target as HTMLElement | null;
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      go(cur + (e.key === 'ArrowRight' ? 1 : -1));
    }
  };
  window.addEventListener('keydown', key, true);
  paint();
  return {
    el,
    nav,
    go,
    at: () => cur,
    off: () => {
      window.removeEventListener('keydown', key, true);
      ro?.disconnect();
    },
  };
}

/** スライドの枠（見出し 1 行と本文） */
export function slideBox(title: string, cls = ''): { el: HTMLElement; body: HTMLElement } {
  const el = h('section', `isl-sls-${cls}`.trim());
  el.append(h('h3', 'isl-sl-h', title));
  const body = h('div', 'isl-sl-body');
  el.append(body);
  return { el, body };
}
/** 小さな見出し（グラフの名前） */
export const chartHead = (text: string, note = '') => {
  const e = h('div', 'isl-sl-ch');
  e.append(h('b', '', text));
  if (note) e.append(h('small', '', note));
  return e;
};

// ---------------------------------------------------------------- 結論：タイル

export function kpiTile(k: Kpi): HTMLElement {
  const e = h('div', `isl-sl-kpi ${k.tone === 'delta' ? tone(k.v) : 'is-cost'}`);
  e.dataset.kpi = k.key;
  e.append(h('span', 'isl-sl-lab', `${k.icon} ${k.label}`));
  const num = h('b', 'isl-sl-num');
  if (k.tone === 'delta') {
    num.append(h('span', 'isl-sl-arw', arrow(k.v)), document.createTextNode(sgn(k.v)));
  } else num.append(document.createTextNode(fmt(k.v)));
  if (k.unit) num.append(h('small', '', ` ${k.unit}`));
  e.append(num, h('span', 'isl-sl-lab', k.sub));
  return e;
}

// ---------------------------------------------------------------- 効果：棒（このまま vs 承認後）・寄与

/** 0 を含む横の目盛り（左端〜右端の割合） */
function scaleOf(vs: number[]) {
  const lo = Math.min(0, ...vs);
  const hi = Math.max(0, ...vs);
  const span = hi - lo || 1;
  return (v: number) => ((v - lo) / span) * 100;
}
/** 横の棒 1 本（from〜to。0 の線つき） */
function hbar(x: (v: number) => number, from: number, to: number, cls: string): HTMLElement {
  const track = h('div', 'isl-sl-track2');
  const zero = h('span', 'isl-sl-zero');
  zero.style.left = `${x(0)}%`;
  const bar = h('span', `isl-sl-bar ${cls}`);
  const a = Math.min(x(from), x(to));
  const b = Math.max(x(from), x(to));
  bar.style.left = `${a}%`;
  bar.style.width = `${Math.max(0.6, b - a)}%`;
  track.append(bar, zero);
  return track;
}
/** 来月の利益：このまま（灰）・承認後（金）の 2 本。数は棒の右に（直接ラベル） */
export function pairBars(now: number, after: number): HTMLElement {
  const e = h('div', 'isl-sl-bars');
  const x = scaleOf([now, after]);
  for (const [lab, v, cls] of [
    [t('このまま', 'As is'), now, 'is-now'],
    [t('承認後', 'After'), after, 'is-after'],
  ] as const) {
    const row = h('div', 'isl-sl-brow');
    row.append(h('span', 'isl-sl-blab', lab), hbar(x, 0, v, cls), h('b', 'isl-sl-bval', `${v < -0.5 ? '−' : ''}${fmt(v)} G`));
    e.append(row);
  }
  return e;
}
/** 寄与（ウォーターフォール）：手ごとの月の利益の増え → 導入 → 短期利益の合計 */
export function fallChart(rows: Fall[]): HTMLElement {
  const e = h('div', 'isl-sl-fall');
  const x = scaleOf(rows.flatMap((r) => [r.from, r.to]));
  for (const r of rows) {
    const row = h('div', `isl-sl-frow is-${r.kind}`);
    row.dataset.v = String(Math.round(r.v));
    const lab = h('span', 'isl-sl-flab');
    if (r.dept) lab.append(deptChip(r.dept));
    lab.append(h('span', 'isl-sl-fname', `${r.icon} ${r.label}`));
    row.append(lab, hbar(x, r.from, r.to, r.kind === 'total' ? 'is-after' : r.v >= 0 ? 'is-up' : 'is-down'), h('b', `isl-sl-fval ${tone(r.v)}`, `${arrow(r.v)} ${sgn(r.v, 'G')}`));
    e.append(row);
  }
  return e;
}

// ---------------------------------------------------------------- 効果：12 か月の累計の折れ線

const NS = 'http://www.w3.org/2000/svg';
const sv = <K extends keyof SVGElementTagNameMap>(tag: K, at: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(at)) e.setAttribute(k, String(v));
  return e;
};
/**
 * 累計の折れ線（このまま：灰の点線・承認後：金の実線）。線の右端に名前と値（直接ラベル）。指を置くと月の値（十字の線と吹き出し）。
 * 幅は置かれた場所に合わせて描き直す（字はいつも 12px）
 */
export function lineChart(now: number[], after: number[], marks: LineMark[] = []): HTMLElement {
  const wrap = h('div', 'isl-sl-line');
  const svg = sv('svg', { role: 'img', 'aria-label': t(`${POLICY.months} か月の利益の累計：このまま ${fmt(now[now.length - 1])} G、承認後 ${fmt(after[after.length - 1])} G`, `Cumulative profit over ${POLICY.months} months: as is ${fmt(now[now.length - 1])} G, after ${fmt(after[after.length - 1])} G`) });
  const tip = h('div', 'isl-sl-tip');
  tip.hidden = true;
  wrap.append(svg, tip);
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = W < 420 ? 184 : 200;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    const L = 44;
    const R = 78;
    const T = 10;
    const B = 22;
    const all = [...now, ...after, 0];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = hi - lo || 1;
    const n = now.length;
    const px = (k: number) => L + ((W - L - R) * k) / Math.max(1, n - 1);
    const py = (v: number) => T + (H - T - B) * (1 - (v - lo) / span);
    // 目盛り（横の線 3 本・0 の線）
    for (const f of [0, 0.5, 1]) {
      const v = lo + span * f;
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-sl-grid' }));
      const tx = sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-sl-axis' });
      tx.textContent = short(v);
      svg.append(tx);
    }
    if (lo < 0 && hi > 0) svg.append(sv('line', { x1: L, x2: W - R, y1: py(0), y2: py(0), class: 'isl-sl-zero0' }));
    for (const k of [0, Math.floor((n - 1) / 2), n - 1]) {
      const tx = sv('text', { x: px(k), y: H - 6, 'text-anchor': k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle', class: 'isl-sl-axis' });
      tx.textContent = t(`${k + 1} か月`, `M${k + 1}`);
      svg.append(tx);
    }
    const path = (vs: number[]) => vs.map((v, k) => `${k ? 'L' : 'M'}${px(k).toFixed(1)},${py(v).toFixed(1)}`).join('');
    // 段 UI7f：倉庫があふれる日（縦の点線と札。k か月目の累計は k か月目の終わり＝(k+1)×30 日目）
    marks.forEach((mk, i) => {
      const x = px(Math.max(0, Math.min(n - 1, mk.day / 30 - 1)));
      svg.append(sv('line', { x1: x, x2: x, y1: T, y2: H - B, class: `isl-sl-mark ${mk.cls}` }));
      const tx = sv('text', { x: x > W / 2 ? x - 4 : x + 4, y: T + 12 + i * 15, 'text-anchor': x > W / 2 ? 'end' : 'start', class: `isl-sl-mtxt ${mk.cls}` });
      tx.textContent = `${mk.cls === 'is-now' ? '⚠ ' : ''}${mk.label}`;
      svg.append(tx);
    });
    svg.append(sv('path', { d: path(now), class: 'isl-sl-lnow' }), sv('path', { d: path(after), class: 'isl-sl-lafter' }));
    // 右端の名前と値（近すぎたら離す。同じなら 1 つに）
    if (Math.abs(now[n - 1] - after[n - 1]) < 0.5) {
      svg.append(sv('circle', { cx: px(n - 1), cy: py(after[n - 1]), r: 4, class: 'isl-sl-dot2 is-after' }));
      const a = sv('text', { x: W - R + 8, y: py(after[n - 1]) - 2, class: 'isl-sl-end is-after' });
      a.textContent = t('同じ', 'Same');
      const b = sv('text', { x: W - R + 8, y: py(after[n - 1]) + 12, class: 'isl-sl-endv' });
      b.textContent = short(after[n - 1]);
      svg.append(a, b);
    }
    let yn = py(now[n - 1]);
    let ya = py(after[n - 1]);
    if (Math.abs(yn - ya) < 28) {
      const mid = Math.max(T + 26, Math.min(H - B - 18, (yn + ya) / 2));
      const up = ya <= yn ? -1 : 1;
      ya = mid + up * 14;
      yn = mid - up * 14;
    }
    yn = Math.max(T + 10, Math.min(H - B - 14, yn));
    ya = Math.max(T + 10, Math.min(H - B - 14, ya));
    for (const [vs, y, lab, cls] of (Math.abs(now[n - 1] - after[n - 1]) < 0.5
      ? []
      : [
          [now, yn, t('このまま', 'As is'), 'is-now'],
          [after, ya, t('承認後', 'After'), 'is-after'],
        ]) as [number[], number, string, string][]) {
      svg.append(sv('circle', { cx: px(n - 1), cy: py(vs[n - 1]), r: 4, class: `isl-sl-dot2 ${cls}` }));
      const a = sv('text', { x: W - R + 8, y: y - 2, class: `isl-sl-end ${cls}` });
      a.textContent = lab;
      const b = sv('text', { x: W - R + 8, y: y + 12, class: 'isl-sl-endv' });
      b.textContent = short(vs[n - 1]);
      svg.append(a, b);
    }
    // 指・マウスで月の値
    const cross = sv('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'isl-sl-cross' });
    cross.style.display = 'none';
    const hit = sv('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent' });
    svg.append(cross, hit);
    const show = (cx: number) => {
      const r = svg.getBoundingClientRect();
      const x = ((cx - r.left) / Math.max(1, r.width)) * W;
      const k = Math.max(0, Math.min(n - 1, Math.round(((x - L) / Math.max(1, W - L - R)) * (n - 1))));
      cross.setAttribute('x1', String(px(k)));
      cross.setAttribute('x2', String(px(k)));
      cross.style.display = '';
      tip.hidden = false;
      tip.replaceChildren(h('b', '', t(`${k + 1} か月目まで`, `Through month ${k + 1}`)), h('span', 'is-after', t(`承認後 ${fmt(after[k])} G`, `After ${fmt(after[k])} G`)), h('span', 'is-now', t(`このまま ${fmt(now[k])} G`, `As is ${fmt(now[k])} G`)));
      const left = (px(k) / W) * 100;
      tip.style.left = `${Math.min(70, Math.max(0, left - 15))}%`;
    };
    hit.addEventListener('pointermove', (e) => show((e as PointerEvent).clientX));
    hit.addEventListener('pointerdown', (e) => show((e as PointerEvent).clientX));
    hit.addEventListener('pointerleave', () => {
      cross.style.display = 'none';
      tip.hidden = true;
    });
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(wrap);
  requestAnimationFrame(draw);
  return wrap;
}
// ---------------------------------------------------------------- 段 UI7f：倉庫のグラフ（月末の中身の棒・容量の基準線・同じペースの予想）

let patSeq = 0;
/**
 * 倉庫の中身の棒グラフ：実績（月末の記録）は塗り、予想は薄い塗り＋斜線。素材（青・塗り）と商品（赤紫・点の模様）を積み上げ。
 * 容量（いま）の基準線（白の実線）と承認後の容量（金の点線）、承認後の中身の予想（金の線と点）、あふれる月の札（⚠）。指を置くと月の数
 */
export function storeChartEl(c: StoreChart, compact = false): HTMLElement {
  const wrap = h('div', 'isl-sl-store');
  const cur = [...c.bars].reverse().find((b) => !b.fc);
  const used = fmt(cur ? cur.mats + cur.goods : 0);
  const fc = c.over0 != null ? t(`${c.bars[c.over0].name}にあふれる予想`, `Forecast to fill in ${c.bars[c.over0].name}`) : t('あふれない予想', 'Not forecast to fill');
  const svg = sv('svg', { role: 'img', 'aria-label': t(`倉庫の中身：いま ${used} 個・容量 ${fmt(c.cap0)} 個。${fc}`, `Storage: ${used} of ${fmt(c.cap0)}. ${fc}`) });
  const tip = h('div', 'isl-sl-tip');
  tip.hidden = true;
  wrap.append(svg, tip);
  const id = `isl-st${++patSeq}`;
  const draw = () => {
    const W = Math.max(240, Math.round(wrap.clientWidth || 300));
    const H = compact ? 150 : W < 420 ? 176 : 196;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    // 模様：商品の点・予想の斜線
    const defs = sv('defs', {});
    const dots = sv('pattern', { id: `${id}d`, width: 5, height: 5, patternUnits: 'userSpaceOnUse' });
    dots.append(sv('circle', { cx: 2.5, cy: 2.5, r: 1, class: 'isl-sl-pdot' }));
    const hatch = sv('pattern', { id: `${id}h`, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(sv('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'isl-sl-phatch' }));
    defs.append(dots, hatch);
    svg.append(defs);
    const L = 40;
    const R = 6;
    // 上の帯：1 行目「← 実績｜予想 →」・2 行目 あふれる月の札（棒や容量の名前と重ならないように）
    const full = c.days0 === 0;
    const T = c.over0 != null || full ? 40 : 22;
    const B = 20;
    const tot = (b: (typeof c.bars)[number]) => b.mats + b.goods;
    // 目盛りのいちばん上：1・2・5 × 10 の何乗かの、いちばん大きい値より上
    const top = Math.max(c.cap0, c.cap1 ?? 0, ...c.bars.map((b) => Math.max(tot(b), b.after ?? 0))) * 1.05 || 1;
    const p10 = 10 ** Math.floor(Math.log10(top));
    const hi = ([1, 2, 2.5, 5, 10].map((x) => x * p10).find((x) => x >= top) ?? top);
    const py = (v: number) => T + (H - T - B) * (1 - v / hi);
    const n = c.bars.length;
    const bw = (W - L - R) / n;
    const cx = (k: number) => L + bw * (k + 0.5);
    const barW = Math.max(8, Math.min(34, bw * 0.62));
    for (const f of [0, 0.5, 1]) {
      const v = hi * f;
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(v), y2: py(v), class: 'isl-sl-grid' }));
      const tx = sv('text', { x: L - 4, y: py(v) + 4, 'text-anchor': 'end', class: 'isl-sl-axis' });
      tx.textContent = short(v);
      svg.append(tx);
    }
    // 実績と予想の境目
    const first = c.bars.findIndex((b) => b.fc);
    if (first > 0) {
      const x = L + bw * first;
      svg.append(sv('line', { x1: x, x2: x, y1: 2, y2: H - B, class: 'isl-sl-fcline' }));
      const a = sv('text', { x: x + 4, y: 13, class: 'isl-sl-axis' });
      a.textContent = t('予想 →', 'Forecast →');
      const b = sv('text', { x: x - 4, y: 13, 'text-anchor': 'end', class: 'isl-sl-axis' });
      b.textContent = t('← 実績', '← Actual');
      svg.append(a, b);
    }
    // 棒（素材の上に 2px 空けて商品）
    c.bars.forEach((b, k) => {
      const x = cx(k) - barW / 2;
      const y0 = py(0);
      const ym = py(b.mats);
      const yg = py(b.mats + b.goods);
      const fc = b.fc ? ' is-fc' : '';
      if (b.mats > 0) svg.append(sv('rect', { x, y: ym, width: barW, height: Math.max(1, y0 - ym), rx: 2, class: `isl-sl-smat${fc}` }));
      if (b.goods > 0) {
        const top = Math.min(yg, ym - 2);
        const hgt = Math.max(1, ym - 2 - top);
        svg.append(sv('rect', { x, y: top, width: barW, height: hgt, rx: 2, class: `isl-sl-sgood${fc}` }));
        svg.append(sv('rect', { x, y: top, width: barW, height: hgt, rx: 2, fill: `url(#${id}d)`, class: 'isl-sl-sover' }));
      }
      if (b.fc) svg.append(sv('rect', { x, y: yg, width: barW, height: Math.max(1, y0 - yg), rx: 2, fill: `url(#${id}h)`, class: 'isl-sl-sover' }));
      const lab = sv('text', { x: cx(k), y: H - 5, 'text-anchor': 'middle', class: 'isl-sl-axis' });
      lab.textContent = b.label;
      svg.append(lab);
    });
    // 容量の基準線（いま：白の実線・名前は線の下）・承認後（金の点線・名前は線の上）
    svg.append(sv('line', { x1: L, x2: W - R, y1: py(c.cap0), y2: py(c.cap0), class: 'isl-sl-cap' }));
    const near = c.cap1 != null && py(c.cap0) - py(c.cap1) < 18;
    const c0 = sv('text', { x: L + 4, y: near ? py(c.cap0) + 14 : py(c.cap0) - 5, class: 'isl-sl-captxt' });
    c0.textContent = t(`容量 ${fmt(c.cap0)}`, `Capacity ${fmt(c.cap0)}`);
    svg.append(c0);
    if (c.cap1 != null) {
      svg.append(sv('line', { x1: L, x2: W - R, y1: py(c.cap1), y2: py(c.cap1), class: 'isl-sl-cap1' }));
      const c1 = sv('text', { x: L + 4, y: py(c.cap1) - 5, class: 'isl-sl-captxt is-after' });
      c1.textContent = t(`承認後の容量 ${fmt(c.cap1)}`, `After: ${fmt(c.cap1)}`);
      svg.append(c1);
    }
    // 承認後の中身の予想（中身が変わる手だけ）
    const pts = c.bars.map((b, k) => ({ b, k })).filter(({ b }) => b.after != null);
    if (pts.length && first > 0) {
      const p0 = { x: cx(first - 1), y: py(tot(c.bars[first - 1])) };
      const d = [`M${p0.x.toFixed(1)},${p0.y.toFixed(1)}`, ...pts.map(({ b, k }) => `L${cx(k).toFixed(1)},${py(b.after!).toFixed(1)}`)].join('');
      svg.append(sv('path', { d, class: 'isl-sl-lafter' }));
      for (const { b, k } of pts) svg.append(sv('circle', { cx: cx(k), cy: py(b.after!), r: 4, class: 'isl-sl-dot2 is-after' }));
    }
    // あふれる月の札（⚠ と字。棒の上）
    const ko = c.over0 ?? (full ? c.bars.findIndex((b) => b.fc) - 1 : null);
    if (ko != null && ko >= 0) {
      const k = ko;
      const x = cx(k);
      const yb = py(tot(c.bars[k]));
      svg.append(sv('path', { d: `M${x - 5},${yb - 8}L${x + 5},${yb - 8}L${x},${yb - 2}Z`, class: 'isl-sl-overarw' }));
      svg.append(sv('line', { x1: x, x2: x, y1: 30, y2: yb - 8, class: 'isl-sl-overline' }));
      const tx = sv('text', { x: x > W * 0.6 ? x + barW / 2 : x - barW / 2, y: 28, 'text-anchor': x > W * 0.6 ? 'end' : 'start', class: 'isl-sl-overtxt' });
      tx.textContent = c.over0 != null ? t(`⚠ ${c.bars[k].name}にあふれる`, `⚠ Fills in ${c.bars[k].name}`) : t('⚠ もうあふれている', '⚠ Already full');
      svg.append(tx);
    }
    // 指・マウスで月の数
    const hit = sv('rect', { x: L, y: 0, width: W - L - R, height: H, fill: 'transparent' });
    svg.append(hit);
    const show = (clientX: number) => {
      const r = svg.getBoundingClientRect();
      const x = ((clientX - r.left) / Math.max(1, r.width)) * W;
      const k = Math.max(0, Math.min(n - 1, Math.floor((x - L) / bw)));
      const b = c.bars[k];
      const head = b.fc ? t(`${b.name}の月末（予想）`, `End of ${b.name} (forecast)`) : b.label === t('いま', 'Now') ? t('いま', 'Now') : t(`${b.name}の月末`, `End of ${b.name}`);
      const rows = [h('b', '', head), h('span', '', t(`素材 ${fmt(b.mats)}・商品 ${fmt(b.goods)}・計 ${fmt(tot(b))} / ${fmt(c.cap0)}`, `Materials ${fmt(b.mats)}, goods ${fmt(b.goods)}, total ${fmt(tot(b))} / ${fmt(c.cap0)}`))];
      if (b.after != null || (b.fc && c.cap1 != null)) rows.push(h('span', 'is-after', t(`承認後 ${fmt(b.after ?? tot(b))} / ${fmt(c.cap1 ?? c.cap0)}`, `After ${fmt(b.after ?? tot(b))} / ${fmt(c.cap1 ?? c.cap0)}`)));
      tip.replaceChildren(...rows);
      tip.hidden = false;
      tip.style.left = `${Math.min(55, Math.max(0, (cx(k) / W) * 100 - 20))}%`;
    };
    hit.addEventListener('pointermove', (e) => show((e as PointerEvent).clientX));
    hit.addEventListener('pointerdown', (e) => show((e as PointerEvent).clientX));
    hit.addEventListener('pointerleave', () => (tip.hidden = true));
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : null;
  ro?.observe(wrap);
  requestAnimationFrame(draw);
  return wrap;
}
/** 倉庫のグラフの凡例（塗り・模様・線の形と名前：色だけに頼らない）と、あふれる先の 1 行 */
export function storeLegend(c: StoreChart): HTMLElement {
  const e = h('div', 'isl-sl-legend isl-sl-slegend');
  const key = (cls: string, lab: string) => {
    const x = h('span', `isl-sl-key ${cls}`);
    x.append(h('i', ''), document.createTextNode(lab));
    e.append(x);
  };
  key('is-mat', t('素材', 'Materials'));
  key('is-good', t('商品', 'Goods'));
  if (c.bars.some((b) => b.fc)) key('is-fc', t('予想', 'Forecast'));
  key('is-cap', t('容量', 'Capacity'));
  if (c.cap1 != null) key('is-cap1', t('承認後の容量', 'Capacity after'));
  if (c.bars.some((b) => b.after != null)) key('is-after', t('承認後の中身', 'After'));
  return e;
}

/** 折れ線の凡例（線の形と名前：色だけに頼らない） */
export function lineLegend(): HTMLElement {
  const e = h('div', 'isl-sl-legend');
  for (const [cls, lab] of [
    ['is-after', t('承認後', 'After')],
    ['is-now', t('このまま', 'As is')],
  ] as const) {
    const x = h('span', `isl-sl-key ${cls}`);
    x.append(h('i', ''), document.createTextNode(lab));
    e.append(x);
  }
  return e;
}

// ---------------------------------------------------------------- お金以外の指標のメーター

export function meterEl(m: Meter): HTMLElement {
  const e = h('div', `isl-sl-meter ${tone(m.d)}`);
  e.dataset.key = m.key;
  const top = h('div', 'isl-sl-mtop');
  top.append(h('span', 'isl-sl-lab', `${m.icon} ${m.label}`), h('b', `isl-sl-mval ${tone(m.d)}`, `${arrow(m.d)} ${sgn(m.d, m.key === 'rp' ? 'RP' : '')}`));
  e.append(top);
  if (m.scale) {
    const tr = h('div', 'isl-sl-mtrack');
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    const a = h('span', 'isl-sl-mfill');
    a.style.width = `${clamp(m.after)}%`;
    const now = h('span', 'isl-sl-mmark');
    now.style.left = `${clamp(m.now)}%`;
    tr.append(a, now);
    e.append(tr, h('span', 'isl-sl-lab', t(`このまま ${Math.round(m.now)} → 承認後 ${Math.round(m.after)}（0〜100）`, `As is ${Math.round(m.now)} → after ${Math.round(m.after)} (0–100)`)));
  } else e.append(h('span', 'isl-sl-lab', t(`${POLICY.months} か月で このまま ${short(m.now)} → 承認後 ${short(m.after)}`, `${POLICY.months} months: ${short(m.now)} → ${short(m.after)}`)));
  return e;
}

// ---------------------------------------------------------------- 影響とリスク

/** 4 段の地図（変わる段が光る・細いところの札）と、受け持つ部門 */
export function stageMapEl(m: StageMap): HTMLElement {
  const e = h('div', 'isl-sl-map');
  const row = h('div', 'isl-sl-stages');
  m.stages.forEach((x, k) => {
    if (k) row.append(h('span', 'isl-sl-sarw', '›'));
    const c = h('div', `isl-sl-stage ${x.on ? 'is-on' : ''}`);
    c.dataset.stage = x.id;
    c.append(h('span', 'isl-sl-sicon', x.icon), h('span', 'isl-sl-sname', x.name));
    if (x.on) c.append(h('span', 'isl-sl-stag is-on', t('変わる', 'Changes')));
    const nt = x.narrow0 && x.narrow1 ? t('細い', 'Narrow') : x.narrow0 ? t('細い→解消', 'Narrow→ok') : x.narrow1 ? t('承認後に細い', 'Narrow after') : '';
    if (nt) c.append(h('span', 'isl-sl-stag is-narrow', `⛓ ${nt}`));
    row.append(c);
  });
  e.append(row);
  const ds = h('div', 'isl-sl-depts');
  for (const d of m.depts) {
    const c = h('span', `isl-sl-dept ${d.own ? 'is-own' : ''}`);
    c.style.setProperty('--d', d.color);
    c.append(h('span', '', d.icon), h('b', '', d.name), h('small', '', d.own ? t('提案', 'Proposer') : t(`依頼 ${d.n}`, `Asked ×${d.n}`)));
    ds.append(c);
  }
  e.append(ds);
  return e;
}
/** リスクの 1 行（強さの札：低・中・高。字と色の両方） */
export function riskRow(r: Risk): HTMLElement {
  const e = h('li', `isl-sl-risk is-lv${r.lv}`);
  e.append(h('span', `isl-sl-lv is-lv${r.lv}`, RISK_LV[r.lv]()), h('span', 'isl-sl-ricon', RISK_ICON[r.kind]), h('span', 'isl-sl-rtxt', r.text));
  return e;
}
/** 区切りの棒（使った・この提案・超える・残り）。凡例は下に字で */
export function segBar(parts: { v: number; cls: string; lab: string }[], total: number, tick?: { at: number; lab: string }): HTMLElement {
  const e = h('div', 'isl-sl-seg');
  const bar = h('div', 'isl-sl-segbar');
  const sum = Math.max(total, parts.reduce((a, x) => a + x.v, 0)) || 1;
  for (const x of parts) {
    if (x.v <= 0) continue;
    const s = h('span', `isl-sl-segp ${x.cls}`);
    s.style.flexGrow = String(x.v / sum);
    bar.append(s);
  }
  if (tick) {
    const k = h('span', 'isl-sl-segtick');
    k.style.left = `${Math.max(0, Math.min(100, (tick.at / sum) * 100))}%`;
    k.title = tick.lab;
    bar.append(k);
  }
  const keys = h('div', 'isl-sl-segkeys');
  for (const x of [...parts, ...(tick ? [{ cls: 'is-tick', lab: tick.lab }] : [])]) {
    const k = h('span', `isl-sl-segkey ${x.cls}`);
    k.append(h('i', ''), document.createTextNode(x.lab));
    keys.append(k);
  }
  e.append(bar, keys);
  return e;
}
/** 部門の月の予算のメーター */
export function budgetEl(bb: BudgetBar): HTMLElement {
  const e = h('div', 'isl-sl-budget');
  const head = h('div', 'isl-sl-mtop');
  head.append(h('span', 'isl-sl-lab', t(`${DEPT[bb.dept].name}部の予算（月 ${money(bb.amt)}）`, `${DEPT[bb.dept].name} budget (${money(bb.amt)}/mo)`)), h('b', bb.over > 0 ? 'is-bad' : 'is-good', bb.over > 0 ? t(`⚠ 予算外 ${money(bb.over)}`, `⚠ Over by ${money(bb.over)}`) : t('✔ 予算内', '✔ Within budget')));
  e.append(
    head,
    segBar(
      [
        { v: bb.used, cls: 'is-used', lab: t(`使った ${money(bb.used)}`, `Used ${money(bb.used)}`) },
        { v: bb.mine, cls: 'is-mine', lab: t(`この提案 ${money(bb.mine)}`, `This ${money(bb.mine)}`) },
        ...(bb.over > 0 ? [{ v: bb.over, cls: 'is-over', lab: t(`超える ${money(bb.over)}`, `Over ${money(bb.over)}`) }] : []),
        { v: bb.left, cls: 'is-left', lab: t(`残り ${money(bb.left)}`, `Left ${money(bb.left)}`) },
      ],
      bb.amt,
    ),
  );
  return e;
}
/** 会社の資金のメーター（承認後に残る・この提案・ひと月の給料と維持費の目安の線） */
export function fundsEl(co: CoFunds): HTMLElement {
  const e = h('div', 'isl-sl-budget');
  const head = h('div', 'isl-sl-mtop');
  const low = co.left < co.reserve;
  head.append(h('span', 'isl-sl-lab', t(`会社の資金 ${money(co.cash)}`, `Company funds ${money(co.cash)}`)), h('b', low ? 'is-bad' : 'is-good', low ? t('⚠ 固定費を下回る', '⚠ Below a month of costs') : t(`✔ 承認後 ${money(co.left)}`, `✔ After ${money(co.left)}`)));
  const spend = Math.max(0, co.cash - Math.max(0, co.left));
  e.append(
    head,
    segBar(
      [
        { v: Math.max(0, co.left), cls: 'is-left2', lab: t(`残る ${money(Math.max(0, co.left))}`, `Left ${money(Math.max(0, co.left))}`) },
        { v: spend, cls: 'is-mine', lab: t(`この提案 ${money(spend)}`, `This ${money(spend)}`) },
      ],
      Math.max(1, co.cash),
      { at: co.reserve, lab: t(`ひと月の固定費 ${money(co.reserve)}`, `A month of fixed costs ${money(co.reserve)}`) },
    ),
  );
  if (co.n > 0) e.append(h('span', 'isl-sl-lab', t(`受け箱のほかの提案 ${co.n} 件（合計 ${money(co.money)}）`, `${co.n} other proposals in the inbox (${money(co.money)})`)));
  return e;
}
