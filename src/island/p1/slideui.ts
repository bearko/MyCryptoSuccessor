/**
 * 段 UI7d：スライド型の提案書の部品（DOM）。スライドの送り（横のスワイプ・下の点と矢印・キーボードの ← →）と、
 * グラフ・タイル・メーター（SVG と CSS で描く。外部のライブラリは使わない）。数字は slides.ts（DOM なし）から。
 * 色：このまま＝灰（#8f9bb8・点線）、承認後＝金（#f2b544・実線）。増える＝緑・減る＝赤は、いつも符号（＋−）と ▲▼ を添える（色だけに頼らない）。
 * 決まりは docs/ISLAND_UX_CHARTER.md「2-5. スライド型の提案書」。
 */
import { t } from '../../i18n';
import { DEPT, POLICY, type DeptId } from './data';
import { RISK_ICON, RISK_LV, type BudgetBar, type Fall, type Kpi, type Meter, type StageMap } from './slides';
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
export function lineChart(now: number[], after: number[]): HTMLElement {
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
