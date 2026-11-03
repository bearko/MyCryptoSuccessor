/**
 * 月次報告（ゲームのテンポを作る、月に一度のフィードバックと判断の画面）。
 * 0. 発表：全画面で「N年目・M月の売上」をドラムロールつきでカウントアップ → ポンと跳ねて金貨（売上 0 の月はマインちゃんの一言）
 * 1. 【KPI ①】売上報告：売上・先月比・利益・資金の変化（月初 → 月末）。内訳は折りたたみ。導線：スキルツリー
 * 2. 【KGI】企業ランキング（エリア）：順位と前月比、次の順位までの距離とゴール。ランキング表は折りたたみ（ゴールラインつき）
 * 3. 【KPI ②】月次売上推移：売上（左軸・折れ線）と利益（右軸・棒）。期間の切り替え、押すと吹き出し
 * 4. 【KPI ③】サプライチェーン管理：① 調達 → ② 製造 → ③ 物流 → ④ 販売 の数と詰まり。導線：SCM ダッシュボード
 * スマホ（390×844）では、折りたたみを閉じた状態でスクロールせずに 1 画面に収める。
 * docs/ISLAND_PHASE1.md「月の売上報告」。
 */
import { hrReportText } from './hrui';
import { delegReportText } from './delegui';
import { clearCondText, digMet, digReportLine, digReportText, presentReady, rebuildText, reviveReportText, type DigSummary } from './digmeet';
import { t } from '../../i18n';
import { csReportText } from './csui';
import { legalReportText } from './legalui';
import { eventReportText } from './events';
import { dipReportText } from './diplo';
import { assetUrl } from '../../render/images';
import { PRODUCT, TOP_STREAK, sku } from './data';
import { jamOf, myShops, whatIf, type P1State, type Report, type Stage } from './model';
import { moveUp, sellBigUp } from './scm';
import { bestSell } from './moves';
import { reportProposal, stallSay } from './card';
import type { Plan } from './plan';
import { closeSheet, open, type Ctx } from './screens';
import { btn, h, heroName, money, rich, select, skuIcon } from './ui';
import { ZERO_LINE } from './mine';

const STAGE_NAME: Record<Stage, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };
const STAGE_ICON: Record<Stage, string> = { buy: '🧱', craft: '🔨', haul: '🛒', sell: '🏪' };
/** 段ごとの直し方（ボトルネックのとき） */
const STAGE_HINT: Record<Stage, string> = {
  buy: t('素材が足りていません。調達係を置くか、スキル「調達枠の拡大」「まとめ買い」で仕入れを太くしましょう。', 'Materials are short. Assign a buyer or widen buying with the Bigger quota / Bulk buying skills.'),
  craft: t('作る数が足りていません。作業台を増やす（工房の設備投資）・段取りの改善（スキル）か、製造の得意なヒーローを置きましょう。', 'Crafting is the limit. Add a bench (workshop investment), Better jigs (skill), or put a better crafter on the bench.'),
  haul: t('運ぶ数が足りていません。荷車を増やす・小型トラック（工房の設備投資）、遠いお店には物流拠点を。', 'Hauling is the limit. More carts or a Small truck (workshop investment); a hub for far shops.'),
  sell: t('売れる数が頭打ち。棚やお店の数ではなく、別の商品・届く場所・売り場の強さ・認知で伸びます（SCM の販売の内訳へ）。', 'Sales are capped. They grow with another item, reaching new homes, stronger shops or awareness — not more shelves or shops (see the SCM sales breakdown).'),
};
/** スマホ用の短い版（2 行以内） */
const STAGE_HINT_SHORT: Record<Stage, string> = {
  buy: t('素材が足りない。調達係やスキルで仕入れを太く。', 'Short of materials. Add a buyer or buying skills.'),
  craft: t('作る数が足りない。作業台（設備投資）・スキル・職人を。', 'Crafting is short. Benches (investment), skills or a crafter.'),
  haul: t('運ぶ数が足りない。荷車（設備投資）・物流拠点を。', 'Hauling is short. Carts (investment) or a hub.'),
  sell: t('売れる数が頭打ち。別の商品・届く場所・売り場・認知で（販売の内訳へ）。', 'Sales capped: new item, reach, pull or awareness (breakdown).'),
};
/** 段を太くするスキル（スキルツリーの枝） */
const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };

/** ゴールの順位（いまはエリア 1 位で固定。セクタのランクで変える余地）。制覇はこれを TOP_STREAK か月続ける */
const GOAL_RANK = 1;

/** 「今月のレベルアップ」の文（長い・短い）。無ければ null。多いときは Lv の上がった数の大きい 2 人と「ほか N 人」 */
export function levelUpText(r: Report): [string, string] | null {
  const ups = [...(r.levelUps ?? [])].sort((a, b) => b.to - b.from - (a.to - a.from) || b.to - a.to);
  const items = Object.entries(r.items ?? {}).reduce((a, [, n]) => a + (n ?? 0), 0);
  if (!ups.length && !items) return null;
  const one = (x: { hero: number; from: number; to: number }) => t(`${heroName(x.hero)} Lv ${x.from}→${x.to}`, `${heroName(x.hero)} Lv ${x.from}→${x.to}`);
  const head = ups.slice(0, 2).map(one).join(t('・', ', '));
  const more = ups.length > 2 ? t(`・ほか ${ups.length - 2} 人`, ` +${ups.length - 2} more`) : '';
  const it = items ? t(`${ups.length ? '・' : ''}強化アイテム +${items}`, `${ups.length ? ' · ' : ''}promotion items +${items}`) : '';
  const long = head + more + it;
  const short = (ups.length ? t(`${ups.length} 人`, `${ups.length} heroes`) : '') + it;
  return [long, short];
}

export interface ReportHooks {
  openSkills: (branch?: string) => void;
  openSupply: () => void;
  openRanking: () => void;
  /** 研究ノート（「今月の出土品」の導線） */
  openNotes?: () => void;
  /** ヒーローの育成（「今月のレベルアップ」の導線。段 E1） */
  openGrowth?: () => void;
  /** 営業の画面（Rare の町の「商圏の取り分」の導線） */
  openTrade?: () => void;
  /** 部長の提案（「担当の報告」の導線。段 D） */
  openProps?: () => void;
  /** 給与・労務（「士気と給与」の導線。段 E2） */
  openPay?: () => void;
  /** カスタマーサポート（「お客さんの声」の導線。段 G） */
  openCs?: () => void;
  /** 法務（「⚖ 法務」の導線。段 H2） */
  openLegal?: () => void;
  /** 外交（「🌐 交易」の導線。段 UI4） */
  openDiplo?: () => void;
  /** 段 UI5a：KPI ③ の「担当者からの提案」（提案書を開く） */
  openProposal?: (plan: Plan, say: string, role: string) => void;
  /** 効果音 */
  sfx?: (k: 'sale' | 'win' | 'levelup' | 'check' | 'report' | 'drum' | 'error') => void;
}

/** 通算の月 → 年目と月 */
const ym = (month: number) => ({ year: 1 + Math.floor((month - 1) / 12), month: ((month - 1) % 12) + 1 });

/** 報告のタイトル：「月次報告（1年目・3月）」 */
export function reportTitle(month: number): string {
  const d = ym(month);
  return t(`月次報告（${d.year}年目・${d.month}月）`, `Monthly report (Y${d.year} · M${d.month})`);
}

/** 舞い上がるコイン */
function coins(box: HTMLElement, n: number) {
  for (let k = 0; k < n; k++) {
    const c = h('i', 'isl-rp-coin');
    c.style.setProperty('--x', `${(Math.random() * 2 - 1) * 160}px`);
    c.style.setProperty('--d', `${(Math.random() * 0.5).toFixed(2)}s`);
    c.style.setProperty('--r', `${Math.round(Math.random() * 720 - 360)}deg`);
    box.append(c);
  }
}

/** 12,000 → 12k */
function kfmt(v: number): string {
  const a = Math.abs(v);
  const sgn = v < 0 ? '-' : '';
  if (a >= 1000) {
    const x = a / 1000;
    return `${sgn}${x >= 10 ? Math.round(x) : Math.round(x * 10) / 10}k`;
  }
  return `${sgn}${Math.round(a)}`;
}

// ---------------------------------------------------------------- 推移のグラフ

type Range = 3 | 6 | 12 | 0;
const RANGES: { value: Range; label: string }[] = [
  { value: 3, label: t('3 か月', '3 months') },
  { value: 6, label: t('6 か月', '6 months') },
  { value: 12, label: t('1 年', '1 year') },
  { value: 0, label: t('全期間', 'All') },
];
/** 選んだ期間（このブラウザに覚える） */
let chartRange: Range = (() => {
  try {
    const v = Number(localStorage.getItem('isl.chartRange'));
    return ([3, 6, 12, 0] as number[]).includes(v) && localStorage.getItem('isl.chartRange') != null ? (v as Range) : 6;
  } catch {
    return 6;
  }
})();
function setRange(v: Range) {
  chartRange = v;
  try {
    localStorage.setItem('isl.chartRange', String(v));
  } catch {
    // 覚えられなくても動く
  }
}

const NS = 'http://www.w3.org/2000/svg';
function mk(tag: string, attrs: Record<string, string | number>, text = '') {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text) e.textContent = text;
  return e;
}

function monthLabel(m: number): string {
  const d = ym(m);
  return m > 12 ? t(`${d.year}年 ${d.month}月`, `Y${d.year} M${d.month}`) : t(`${d.month} 月`, `M${d.month}`);
}

/** 売上（左軸・折れ線）と利益（右軸・棒）。押すとその月の吹き出し */
function chart(reports: Report[]): SVGSVGElement {
  const rs = chartRange ? reports.slice(-chartRange) : reports.slice();
  const W = 360;
  // 段 UI3：スマホは報告を 1 画面に収めるためグラフが低いので、横長にして幅いっぱいに（目盛りの字が縮まないように）
  const H = typeof innerWidth === 'number' && innerWidth < 600 ? 110 : 150;
  // 段 UI3：目盛りは画面の上で 12px 以上（CSS の --ck でグラフの縮み具合を割る）。そのぶん左右と下を少し広く
  const padL = 40;
  const padR = 40;
  const padT = 12;
  const padB = 24;
  const plotH = H - padT - padB;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.classList.add('isl-rp-chart');
  // グラフの縮み具合（画面の幅 ÷ 360）：目盛りの字の大きさに使う
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() => {
      const w = svg.getBoundingClientRect().width;
      if (w > 0) svg.style.setProperty('--ck', (w / W).toFixed(3));
    }).observe(svg);
  const n = Math.max(1, rs.length);
  const maxR = Math.max(1, ...rs.map((r) => r.revenue));
  const hiP = Math.max(1, ...rs.map((r) => r.profit));
  const loP = Math.min(0, ...rs.map((r) => r.profit));
  const step = (W - padL - padR) / n;
  const x = (k: number) => padL + step * (k + 0.5);
  const yR = (v: number) => padT + plotH * (1 - v / maxR);
  const yP = (v: number) => padT + (plotH * (hiP - v)) / (hiP - loP);
  // 目盛り（左＝売上、右＝利益）と薄い横線
  for (const v of [0, maxR / 2, maxR]) {
    svg.append(mk('line', { x1: padL, y1: yR(v), x2: W - padR, y2: yR(v), class: 'isl-rp-grid' }));
    svg.append(mk('text', { x: padL - 4, y: yR(v) + 5, 'text-anchor': 'end', class: 'isl-rp-yl is-l' }, kfmt(v)));
  }
  // 利益が全部赤字の月だけなら、0・中・最小（下）を出す
  const pTicks = hiP > 1 ? [0, hiP / 2, hiP] : [loP, loP / 2, 0];
  for (const v of pTicks) svg.append(mk('text', { x: W - padR + 4, y: yP(v) + 5, 'text-anchor': 'start', class: 'isl-rp-yl is-r' }, kfmt(v)));
  // 利益の 0 の線
  svg.append(mk('line', { x1: padL, y1: yP(0), x2: W - padR, y2: yP(0), class: 'isl-rp-zero' }));
  // 利益の棒（赤字は 0 の線から下へ）
  const bw = Math.min(26, step * 0.5);
  rs.forEach((r, k) => {
    const v = r.profit;
    const top = v >= 0 ? yP(v) : yP(0);
    const hgt = Math.max(1, Math.abs(yP(v) - yP(0)));
    svg.append(mk('rect', { x: x(k) - bw / 2, y: top, width: bw, height: hgt, rx: 3, class: `isl-rp-bar ${v < 0 ? 'is-neg' : ''}`, style: `--d:${k * 0.05}s` }));
  });
  // 売上の折れ線と点
  if (rs.length > 1) svg.append(mk('polyline', { points: rs.map((r, k) => `${x(k).toFixed(1)},${yR(r.revenue).toFixed(1)}`).join(' '), class: 'isl-rp-line' }));
  rs.forEach((r, k) => {
    svg.append(mk('circle', { cx: x(k), cy: yR(r.revenue), r: k === rs.length - 1 ? 4.5 : 3.2, class: `isl-rp-dot ${k === rs.length - 1 ? 'is-last' : ''}` }));
    // 月の目盛りは 6 つまで（多いときは間引く。最後の月は必ず）
    const every = Math.ceil(rs.length / 6);
    if ((rs.length - 1 - k) % every === 0) svg.append(mk('text', { x: x(k), y: H - 6, 'text-anchor': 'middle', class: 'isl-rp-xl' }, monthLabel(r.month)));
  });
  // 吹き出し（押した月の上に）
  let tip: SVGGElement | null = null;
  let tipK = -1;
  const show = (k: number) => {
    tip?.remove();
    tip = null;
    if (k === tipK) {
      tipK = -1;
      return;
    }
    tipK = k;
    const r = rs[k];
    const top = Math.min(yR(r.revenue), r.profit >= 0 ? yP(r.profit) : yP(0));
    const g = document.createElementNS(NS, 'g') as SVGGElement;
    g.classList.add('isl-rp-tip');
    const box = mk('rect', { x: 0, y: 0, width: 104, height: 46, rx: 6 });
    const lines = [
      mk('text', { x: 0, y: 0, class: 'is-m' }, monthLabel(r.month)),
      mk('text', { x: 0, y: 0 }, t(`売上 ${money(r.revenue)}`, `Sales ${money(r.revenue)}`)),
      mk('text', { x: 0, y: 0, class: r.profit >= 0 ? 'is-good' : 'is-bad' }, t(`利益 ${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}`, `Profit ${r.profit < 0 ? '−' : ''}${money(Math.abs(r.profit))}`)),
    ];
    g.append(box, ...lines);
    svg.append(g);
    // 吹き出しの字は画面の上で 12px 以上（CSS の --ck で割る）。字の大きさから箱の大きさと位置を決める
    const fs = parseFloat(getComputedStyle(lines[0]).fontSize) || 10;
    const lh = fs * 1.25;
    const tw = Math.max(104, ...lines.map((e) => (e as SVGTextElement).getComputedTextLength?.() ?? 0)) + 14;
    const th = lh * 3 + 8;
    const tx = Math.max(2, Math.min(W - tw - 2, x(k) - tw / 2));
    const ty = Math.max(2, top - th - 6);
    box.setAttribute('x', String(tx));
    box.setAttribute('y', String(ty));
    box.setAttribute('width', String(tw));
    box.setAttribute('height', String(th));
    lines.forEach((e, i) => {
      e.setAttribute('x', String(tx + 7));
      e.setAttribute('y', String(ty + 4 + lh * (i + 1) - lh * 0.25));
    });
  };
  // 月ごとの縦の当たり判定（透明）
  rs.forEach((_r, k) => {
    const hit = mk('rect', { x: x(k) - step / 2, y: 0, width: step, height: H, class: 'isl-rp-hit', 'data-k': k });
    hit.addEventListener('click', (e) => {
      e.stopPropagation();
      show(k);
    });
    hit.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'mouse' && tipK !== k) show(k);
    });
    svg.append(hit);
  });
  svg.addEventListener('pointerleave', (e) => {
    if ((e as PointerEvent).pointerType === 'mouse' && tip) {
      tip.remove();
      tip = null;
      tipK = -1;
    }
  });
  return svg;
}

/**
 * 報告の詰まり：締めの時点で保存した値（Report.bottleneck = jamOf）。SCM ダッシュボードと同じ判定。
 * 古いセーブで保存が無ければ、いまの状態で同じ判定をする（実績の数の少なさでは決めない）
 */
export const reportJam = (s: P1State, r: Report): Stage => r.stall?.stage ?? r.bottleneck ?? jamOf(s);

/** 流れの図：① → ② → ③ → ④ の実績の数。詰まり（reportJam）の段を赤く */
function flowRow(s: P1State, r: Report): HTMLElement {
  const bn = reportJam(s, r);
  const f = r.flow ?? { bought: 0, made: 0, hauled: 0, sold: 0 };
  const vals: Record<Stage, number> = { buy: f.bought, craft: f.made, haul: f.hauled, sell: f.sold };
  const max = Math.max(1, ...Object.values(vals));
  const row = h('div', 'isl-rp-flow');
  (['buy', 'craft', 'haul', 'sell'] as Stage[]).forEach((k, i) => {
    if (i) row.append(h('span', 'isl-rp-arrow', '▶'));
    const c = h('div', `isl-rp-stage ${k === bn ? 'is-bn' : ''}`);
    const bar = h('div', 'isl-rp-sbar');
    const fill = h('i');
    fill.style.height = `${Math.max(6, Math.round((vals[k] / max) * 100))}%`;
    bar.append(fill);
    c.append(h('span', 'isl-rp-sicon', STAGE_ICON[k]), bar, h('b', '', `${vals[k]}`), h('small', '', STAGE_NAME[k]));
    if (k === bn) c.append(h('span', 'isl-rp-bnmark', t('課題あり', 'Issue')));
    row.append(c);
  });
  return row;
}

/** カードの見出し行：種別チップ＋見出し＋右端に導線のボタン */
function cardHead(tag: string, kgi: boolean, title: string, right?: HTMLElement, note = ''): HTMLElement {
  const row = h('div', 'isl-rp-head');
  const h3 = h('h3', '', title);
  // 見出しの補足（スマホでは隠す）
  if (note) h3.append(h('span', 'isl-rp-note', note));
  row.append(h('span', `isl-rp-tag ${kgi ? 'is-kgi' : ''}`, tag), h3);
  if (right) row.append(right);
  return row;
}

/** 前月比のチップ */
function diffChip(cur: number, prev: number): HTMLElement {
  const d = cur - prev;
  return h('span', `isl-rp-diff ${d >= 0 ? 'is-up' : 'is-down'}`, d >= 0 ? t(`先月比 +${money(d)}`, `+${money(d)} vs last`) : t(`先月比 −${money(-d)}`, `−${money(-d)} vs last`));
}

/** 発表の長さ（ミリ秒）：カウント（金額に関係なく一定）→ 跳ね → 金貨 → 「タップで続ける」。待ちきれなければ 6 秒で自動 */
export const REVEAL = { count: 1600, hit: 400, coins: 800, auto: 6000, zero: 1200, tut: 400 } as const;

/**
 * 発表のカウントアップの値（0〜1 の進み k → 表示する金額）。
 * 進みは減速（1 − (1 − k)²）。途中は下 3 桁が転がる（桁数が多い月は転がり方が速く見えるだけで、長さは同じ）。最後の 15% で正確な値へ。
 * 純粋関数（テスト用に切り出し）
 */
export function countValue(to: number, k: number, rnd = Math.random): number {
  if (k >= 1) return to;
  const e = 1 - Math.pow(1 - k, 2);
  const jitter = k < 0.85 && to >= 1000 ? Math.floor(rnd() * 1000) - 500 : 0;
  return Math.min(to, Math.max(0, Math.round(to * e) + jitter));
}

/**
 * 開幕の発表（全画面）。終わったら done。
 * カウントが終わって金額が跳ね、金貨が舞い終わるまでは本体に移らない。そのあと「タップで続ける」を出し、タップで本体へ
 * （REVEAL.auto たてば自動）。カウント中のタップは即到達（スキップ）で、本体へは移らない。
 * tut：チュートリアル（見習い期間）は従来どおり、金貨のあと自動で本体へ（案内の流れを変えない）
 */
function reveal(ctx: Ctx, r: Report, hooks: ReportHooks, top1: boolean, alive: () => boolean, done: () => void, tut = false) {
  const d = ym(r.month);
  const ov = h('div', 'isl-rp-reveal');
  const box = h('div', 'isl-rp-rvbox');
  const coinBox = h('div', 'isl-rp-coins');
  const num = h('b', 'isl-rp-rvnum', '0 G');
  box.append(h('small', 'isl-rp-rvlabel', t(`${d.year}年目・${d.month}月の売上`, `Sales · Y${d.year} M${d.month}`)), coinBox, num);
  const tap = h('small', 'isl-rp-rvtap', t('タップで続ける', 'Tap to continue'));
  tap.hidden = true;
  ov.append(box, tap);
  ctx.root.append(ov);
  let over = false;
  /** 'count'：転がっている（タップで即到達）／'fx'：跳ね・金貨（タップは待つ）／'ready'：タップで本体へ */
  let phase: 'count' | 'fx' | 'ready' = 'count';
  let timer = 0;
  const finish = () => {
    if (over) return;
    over = true;
    clearTimeout(timer);
    ov.classList.add('is-out');
    setTimeout(() => ov.remove(), 260);
    done();
  };
  /** 到達：跳ね → 金貨 → タップ待ち（tut は自動） */
  const to = r.revenue;
  let hit = false;
  const land = () => {
    if (hit || over) return;
    hit = true;
    phase = 'fx';
    num.textContent = money(to);
    num.classList.add('is-hit');
    hooks.sfx?.(top1 ? 'win' : 'sale');
    timer = window.setTimeout(() => {
      coins(coinBox, Math.min(24, 8 + Math.floor(to / 3000)));
      timer = window.setTimeout(() => {
        phase = 'ready';
        ov.classList.add('is-ready');
        tap.hidden = false;
        timer = window.setTimeout(finish, tut ? REVEAL.tut : REVEAL.auto);
      }, REVEAL.coins);
    }, REVEAL.hit);
  };
  ov.addEventListener('click', (e) => {
    e.stopPropagation();
    if (phase === 'count') land();
    else if (phase === 'ready') finish();
  });
  // 売上 0：ドラムロールなし。灰色の 0 G とマインちゃんの一言（従来どおり、しばらくして自動で本体へ。タップでも）
  if (to <= 0) {
    num.classList.add('is-zero');
    const say = h('div', 'isl-rp-rvsay');
    const mi = h('img', 'isl-rp-mine');
    mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
    mi.alt = '';
    // 段 UI2：1 行・30 字まで
    say.append(mi, h('p', '', ZERO_LINE()));
    box.append(say);
    hooks.sfx?.('check');
    phase = 'ready';
    tap.hidden = false;
    timer = window.setTimeout(finish, REVEAL.zero);
    return;
  }
  const t0 = performance.now();
  hooks.sfx?.('drum');
  const tick = (now: number) => {
    if (over || hit) return;
    if (!alive()) {
      ov.remove();
      over = true;
      return;
    }
    const k = Math.min(1, (now - t0) / REVEAL.count);
    num.textContent = money(countValue(to, k));
    if (k < 1) requestAnimationFrame(tick);
    else land();
  };
  requestAnimationFrame(tick);
}

/**
 * スマホ（〜599px）で月次報告を 1 画面に収める：行の多い月（巻き返し・1 位の一言・法務 など）ではみ出すなら、詰めた表示（is-tight）にする
 * （詰まりの定義の一言を隠す・2 位との差をランキング表の行へ・流れの図と各行を低く）。それでも入らなければ、推移のグラフのカードが縮み、
 * 最後は本体をスクロールできる。はみ出しは、グラフを縮める前の高さで測る
 */
function fitPhone(body: HTMLElement) {
  body.classList.remove('is-tight');
  if (!window.matchMedia?.('(max-width: 599px)').matches) return;
  body.classList.add('is-measure');
  const over = body.scrollHeight > body.clientHeight + 1;
  body.classList.remove('is-measure');
  if (over) body.classList.add('is-tight');
}

/**
 * 発表（ドラムロール）を済ませた報告。1 回の報告で発表は 1 回だけ：同じ報告を開き直したとき（まとめ報告の「くわしい報告を見る」など）は
 * 発表を飛ばして本体をすぐ出す（カードの出る演出・順位のポンもしない）
 */
const announced = new WeakSet<Report>();
/** 発表を済ませたか（テスト用） */
export const wasAnnounced = (r: Report) => announced.has(r);

export function openMonthReport(ctx: Ctx, r: Report, hooks: ReportHooks, then?: () => void) {
  const s = ctx.s();
  const idx = s.reports.indexOf(r);
  const prev = idx > 0 ? s.reports[idx - 1] : idx < 0 && s.reports.length ? s.reports[s.reports.length - 1] : null;
  const upto = idx >= 0 ? s.reports.slice(0, idx + 1) : [...s.reports, r];
  const again = announced.has(r);
  announced.add(r);
  /** 発表が終わったか（終わるまでは本体を隠す） */
  let shown = again;
  /** 本体のカードの出る演出・順位のポン（最初の 1 回だけ） */
  let animated = again;
  let bodyEl: HTMLElement | null = null;
  open(
    ctx,
    reportTitle(r.month),
    (body) => {
      bodyEl = body;
      body.classList.add('is-report');
      body.closest('.isl-sheet')?.classList.add('is-report-sheet');
      body.classList.toggle('is-wait', !shown);
      const cards: HTMLElement[] = [];

      // ---- ① 【KPI ①】売上報告
      const bn = reportJam(s, r);
      const c1 = h('div', 'isl-card2 isl-rp-card');
      c1.append(cardHead(t('KPI ①', 'KPI 1'), false, t('売上報告', 'Sales'), btn(t('投資：スキルツリー', 'Invest: Skills'), () => hooks.openSkills(STAGE_BRANCH[bn]), 'isl-rp-go')));
      const grid = h('div', 'isl-rp-sales');
      const left = h('div', 'isl-rp-col');
      left.append(h('small', 'isl-rp-k', t('売上', 'Sales')), h('b', `isl-rp-rev ${r.revenue <= 0 ? 'is-zero' : ''}`, money(r.revenue)));
      if (prev) left.append(diffChip(r.revenue, prev.revenue));
      const right = h('div', 'isl-rp-col');
      right.append(h('small', 'isl-rp-k', t('利益', 'Profit')), h('b', `isl-rp-pf ${r.profit >= 0 ? 'is-good' : 'is-bad'}`, (r.profit >= 0 ? '+' : '−') + money(Math.abs(r.profit))));
      right.append(h('small', 'isl-rp-k', t('資金の変化', 'Cash')));
      if (r.money) {
        right.append(h('span', 'isl-rp-cash', `${money(r.money.start)} → ${money(r.money.end)}`));
      } else right.append(h('span', 'isl-rp-cash', '—'));
      // 増減とブランド力の増えは 1 行に
      const sub = h('span', 'isl-rp-subrow');
      if (r.money) {
        const dm = r.money.end - r.money.start;
        sub.append(h('small', `isl-rp-dm ${dm >= 0 ? 'is-good' : 'is-bad'}`, t(`（${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))}）`, `(${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))})`)));
      }
      if (r.brand) sub.append(h('small', 'isl-rp-brand', `★ +${r.brand}`));
      if (sub.childElementCount) right.append(sub);
      // 売上のうち復刻品のぶん（1 行）
      if (r.relic) left.append(h('small', 'isl-rp-relic', t(`うち復刻品 ${money(r.relic)}`, `incl. revivals ${money(r.relic)}`)));
      grid.append(left, right);
      c1.append(grid);
      // 月次 PDCA（スキル）：来月の見込み
      if (r.forecast) {
        const fc = h('p', 'isl-rp-fc');
        // スマホは短い文（1 行に収める）
        const fl = h('span', 'is-long');
        fl.append(h('span', '', t(`来月の見込み：売上 ${money(r.forecast.sales)}・利益 `, `Next month: sales ${money(r.forecast.sales)}, profit `)), h('b', r.forecast.profit >= 0 ? 'isl-good' : 'isl-bad', (r.forecast.profit >= 0 ? '+' : '−') + money(Math.abs(r.forecast.profit))));
        const fs = h('span', 'is-short');
        fs.append(h('span', '', t(`来月 売上 ${kfmt(r.forecast.sales)} G・利益 `, `Next: sales ${kfmt(r.forecast.sales)} G, profit `)), h('b', r.forecast.profit >= 0 ? 'isl-good' : 'isl-bad', (r.forecast.profit >= 0 ? '+' : '−') + kfmt(Math.abs(r.forecast.profit)) + ' G'));
        fc.append(h('span', 'isl-tag is-good', t('月次 PDCA', 'Monthly PDCA')), fl, fs);
        c1.append(fc);
      }
      // 内訳（折りたたみ）
      const detail = h('details', 'isl-rp-detail');
      detail.append(h('summary', '', t('売上の内訳（商品ごとの売上・費用）', 'Breakdown (sales by product, costs)')));
      const by = h('div', 'isl-stock');
      for (const [k, v] of Object.entries(r.bySeries)) {
        if (!v) continue;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(sku(k, 'C'), 22), h('span', '', `${PRODUCT[k].name} ${money(v)}`));
        by.append(c);
      }
      const cost = r.costs;
      detail.append(by, h('p', 'isl-dim', t(`費用：素材 ${money(cost.materials)}・建物とスキル ${money(cost.build)}・維持費 ${money(cost.upkeep)}・給料 ${money(cost.wages)}・アルバイト ${money(cost.part)}・宣伝 ${money(cost.ads ?? 0)}`, `Costs: materials ${money(cost.materials)}, buildings & skills ${money(cost.build)}, upkeep ${money(cost.upkeep)}, wages ${money(cost.wages)}, part-timers ${money(cost.part)}, ads ${money(cost.ads ?? 0)}`)));
      for (const n of r.news) {
        const [who, what, kind] = n.split('|');
        if (kind === 'out') detail.append(h('p', 'isl-good', t(`${who}が「${what}」から撤退しました。`, `${who} pulled out of ${what}.`)));
        else if (kind === 'copy') detail.append(h('p', 'isl-warn', t(`${who}が「${what}」を真似しはじめました（独占が終わった）。`, `${who} started copying ${what} (the monopoly ended).`)));
        else detail.append(h('p', 'isl-warn', t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`)));
      }
      c1.append(detail);
      cards.push(c1);

      // ---- ② 【KGI】企業ランキング（エリア）
      const c2 = h('div', 'isl-card2 isl-rp-card isl-rp-rank');
      c2.append(cardHead('KGI', true, t('企業ランキング', 'Company ranking'), btn(t('目標確認：企業ランキング', 'Goal: Ranking'), () => hooks.openRanking(), 'isl-rp-go'), t('（エリア）', ' (area)')));
      const prevRank = prev?.rank ?? null;
      const moved = prevRank != null ? prevRank - r.rank : 0;
      const head = h('div', 'isl-rp-rankhead');
      const num = h('b', `isl-rp-ranknum ${animated ? 'is-done' : ''}`, t(`現在 ${r.rank} 位`, `Now #${r.rank}`));
      head.append(num);
      if (r.rank === 1) head.append(h('span', 'isl-rp-crown', '👑'));
      if (prevRank == null) head.append(h('span', 'isl-rp-move is-new', t('初登場', 'New entry')));
      else if (moved > 0) head.append(h('span', 'isl-rp-move is-up', t(`↑ ${moved} ランクアップ！`, `↑ Up ${moved}!`)));
      else if (moved < 0) head.append(h('span', 'isl-rp-move is-down', t(`↓ ${-moved} ランクダウン`, `↓ Down ${-moved}`)));
      else head.append(h('span', 'isl-rp-move', t('→ キープ', '→ Held')));
      // ゴール：2 か月続けて 1 位（制覇）。1 位の月は「いま n / 2」
      const streak = r.streak ?? (r.rank === 1 ? 1 : 0);
      // 発掘 v2 の 5 段目：制覇は 2 か月続けて 1 位 ＋ そのセクタの研究成果の発表（r.goal。お題の無いセクタ・以前の報告は 1 位だけ）
      const presented = !r.goal || r.goal.present;
      const conquered = streak >= TOP_STREAK && presented;
      const waiting = streak >= TOP_STREAK && !presented;
      // スマホは短い文（順位の行に収める）。まだ制覇していなければ、条件を 2 つとも（「1 位を 2 か月 ✔／研究成果の発表 1 / 3 お題」）
      const goalK = h('b', `isl-rp-goalk ${conquered ? 'is-done' : waiting ? 'is-wait' : ''}`);
      const [goalLong, goalShort] = conquered
        ? [t(`制覇！ ${TOP_STREAK} か月続けて 1 位${r.goal ? '＋研究成果の発表' : ''}`, `Conquered! #1 for ${TOP_STREAK} months${r.goal ? ' + findings' : ''}`), t('👑 制覇！', '👑 Conquered!')]
        : waiting
          ? [t('👑 1 位を守っている（制覇まで：研究成果の発表）', '👑 Holding #1 (to conquer: present findings)'), t('👑 1 位を守っている（あと発表）', '👑 Holding #1 (present next)')]
          : r.goal
            ? clearCondText(streak, r.goal)
            : streak > 0
              ? [t(`ゴール：${TOP_STREAK} か月続けて 1 位（いま ${streak} / ${TOP_STREAK}）`, `Goal: #1 for ${TOP_STREAK} months in a row (${streak} / ${TOP_STREAK})`), t(`ゴール：${TOP_STREAK} か月続けて 1 位（いま ${streak} / ${TOP_STREAK}）`, `Goal: #1 for ${TOP_STREAK} months in a row (${streak} / ${TOP_STREAK})`)]
              : [t(`ゴール：${TOP_STREAK} か月続けて 1 位`, `Goal: #1 for ${TOP_STREAK} months in a row`), t(`ゴール：${TOP_STREAK} か月連続 1 位`, `Goal: #1 × ${TOP_STREAK} months`)];
      goalK.append(h('span', 'is-long', goalLong), h('span', 'is-short', goalShort));
      head.append(goalK);
      c2.append(head);
      // 他社の巻き返し（Uncommon）：1 位を取った月の締めで、2 位の会社が翌月からセール
      if (r.comeback) {
        const cb = h('p', 'isl-rp-sale');
        // スマホは短い文（順位のカードを 1 画面に収める）
        const long = h('span', 'is-long');
        long.append(rich(t(`[[${r.comeback.by}]]がセールで巻き返してきた！（${r.comeback.months} か月）`, `[[${r.comeback.by}]] is fighting back with a sale! (${r.comeback.months} mo)`)));
        const short = h('span', 'is-short');
        short.append(rich(t(`[[${r.comeback.by}]]がセールで巻き返し！（${r.comeback.months} か月）`, `[[${r.comeback.by}]] strikes back with a sale! (${r.comeback.months} mo)`)));
        cb.append(h('span', 'isl-tag is-bad', t('巻き返し', 'Comeback')), long, short);
        c2.append(cb);
        body.classList.add('has-sale');
      }
      // 商圏の取り合い（Rare の町 ②）：自社の取り分（先月から）・撤退した他社の店・空き店舗に入った他社
      if (r.trade) {
        const tr = r.trade;
        const p1 = (v: number) => `${Math.round(v * 1000) / 10}%`;
        const line = h('div', 'isl-rp-trade');
        const txt = h('span', 'isl-rp-trade-text');
        const move = tr.prev != null ? `${p1(tr.prev)} → ${p1(tr.share)}` : p1(tr.share);
        const extra = [tr.quit.length ? t(`撤退 ${tr.quit.length} 軒`, `${tr.quit.length} closed`) : '', tr.refill.length ? t(`他社が空き店舗に ${tr.refill.length} 軒`, `${tr.refill.length} vacancies refilled`) : '', tr.gone.length ? t(`町から撤退 ${tr.gone.length} 社`, `${tr.gone.length} left town`) : '', tr.back?.length ? t(`町に戻った他社 ${tr.back.length} 社`, `${tr.back.length} came back`) : ''].filter(Boolean).join(t('・', ' · '));
        txt.append(h('b', '', t('🤝 商圏の取り分', '🤝 Trade-area share')), h('span', 'is-long', `${move}${extra ? t(`（${extra}）`, ` (${extra})`) : ''}`), h('span', 'is-short', `${move}${tr.quit.length ? t(`・撤退 ${tr.quit.length}`, ` · ${tr.quit.length} closed`) : ''}`));
        line.append(txt);
        if (hooks.openTrade) line.append(btn(t('営業', 'Sales'), () => hooks.openTrade?.(), 'isl-rp-go'));
        c2.append(line);
        body.classList.add('has-trade');
      }
      const me = r.area.findIndex((x) => x.me);
      const mySales = me >= 0 ? r.area[me].sales : r.revenue;
      let gap = '';
      if (me > 0) gap = t(`次の順位（${me} 位の${r.area[me - 1].name}）まで あと ${money(Math.max(0, r.area[me - 1].sales - mySales))}`, `${money(Math.max(0, r.area[me - 1].sales - mySales))} to #${me} (${r.area[me - 1].name})`);
      else if (me === 0 && r.area.length > 1) gap = t(`2 位の${r.area[1].name}との差 ${money(Math.max(0, mySales - r.area[1].sales))}（守り切ろう！）`, `${money(Math.max(0, mySales - r.area[1].sales))} ahead of #2 ${r.area[1].name} — hold on!`);
      if (streak > 0 && !conquered) {
        // 1 回目の 1 位：制覇までの一言（来月も守れば制覇）と、2 位との差を 1 行に（スマホで報告を 1 画面に収める）。
        // 段 UI2：マインちゃんの顔はやめて、短い 1 行（30 字まで）だけ
        const say = h('div', 'isl-rp-say');
        const p = h('p');
        // 発表がまだなら、制覇の 2 つ目の条件（研究成果の発表）を言う
        const g = r.goal;
        // スマホは短い文（条件の数は上の札にあるので繰り返さない。マインちゃんと 1 行に収める）
        const sayShort =
          waiting && g
            ? presentReady(g)
              ? t('あとは[[町の長]]に発表すれば[[制覇]]！', 'Present to the [[town head]] to [[conquer]]!')
              : t('あとは研究成果の発表で[[制覇]]！', 'Present your findings to [[conquer]]!')
            : g && !g.present
              ? g.res
                ? t('来月も守って、発表の条件もそろえよう！', 'Hold on and meet the presenting conditions!')
                : t('来月も守って、お題もそろえよう！', 'Hold on and find the targets!')
              : t('来月も守り切れたら[[制覇]]だよ！', 'Hold on next month and the sector is [[yours]]!');
        p.append(rich(sayShort));
        say.append(p);
        if (me === 0 && r.area.length > 1) say.append(h('small', 'isl-rp-lead', t(`2 位との差 ${money(Math.max(0, mySales - r.area[1].sales))}`, `${money(Math.max(0, mySales - r.area[1].sales))} ahead of #2`)));
        c2.append(say);
        body.classList.add('has-say');
      } else if (gap) c2.append(h('p', 'isl-rp-goal', gap));
      const rk = h('details', 'isl-rp-detail');
      const sum = h('summary', '', t('ランキング表', 'Ranking table'));
      // 詰めた表示（スマホで収まらない月）：2 位との差は、一言の下ではなくこの行に
      if (streak > 0 && !conquered && me === 0 && r.area.length > 1) sum.append(h('small', 'isl-rp-sumlead', t(`・2 位との差 ${money(Math.max(0, mySales - r.area[1].sales))}`, ` · ${money(Math.max(0, mySales - r.area[1].sales))} ahead of #2`)));
      rk.append(sum);
      const list = h('ol', 'isl-rank isl-rp-list');
      r.area.forEach((x, k) => {
        const li = h('li', x.me ? 'is-me' : '');
        li.style.setProperty('--d', `${k * 0.05}s`);
        li.append(h('span', 'isl-rank-n', `${k + 1}`), h('span', '', x.me ? t('あなたの会社', 'Your company') : x.name), h('b', '', money(x.sales)));
        list.append(li);
        if (k + 1 === GOAL_RANK && r.area.length > GOAL_RANK) list.append(h('li', 'isl-rp-goalline', t('── ゴールライン ──', '── Goal line ──')));
      });
      rk.append(list);
      c2.append(rk);
      cards.push(c2);

      // ---- ③ 【KPI ②】月次売上推移
      const c3 = h('div', 'isl-card2 isl-rp-card isl-rp-trend');
      const wrap = h('div', 'isl-rp-chartwrap');
      let svg = chart(upto);
      const sel = select(RANGES, chartRange, (v) => {
        setRange(v);
        const next = chart(upto);
        svg.replaceWith(next);
        svg = next;
      });
      sel.classList.add('isl-rp-range');
      c3.append(cardHead(t('KPI ②', 'KPI 2'), false, t('月次売上推移', 'Monthly trend'), sel));
      const legend = h('div', 'isl-rp-legend');
      legend.append(h('span', 'is-line', t('売上（左軸）', 'Sales (left)')), h('span', 'is-bar', t('利益（右軸）', 'Profit (right)')));
      wrap.append(svg, legend);
      c3.append(wrap);
      cards.push(c3);

      // ---- ④ 【KPI ③】サプライチェーン管理
      const c4 = h('div', 'isl-card2 isl-rp-card');
      c4.append(cardHead(t('KPI ③', 'KPI 3'), false, t('サプライチェーン管理', 'Supply chain'), btn(t('分析：SCM ダッシュボード', 'Analyze: SCM'), () => hooks.openSupply(), 'isl-rp-go'), t('（SCM）', ' (SCM)')));
      // 段 UI2：詰まりの定義の 1 行はやめて、直し方の 1 行だけ（SCM ダッシュボードの上に 1 回だけ書いてある）
      c4.append(flowRow(s, r));
      const hint = h('p', 'isl-rp-hint');
      const long = h('span', 'is-long');
      const short = h('span', 'is-short');
      // 段 UI5a：「詰まり」→「課題あり」・「効く手」→「改善案」。ボタンは「担当者からの提案」（提案書を開く：As-Is／To-Be・承認でハンコ → 一気に変更）。
      // 流れが止まっている月（全段が 0 など。r.stall）は、いちばん上流の止まっている段とその理由（宣伝を勧めない）
      let bestBtn: HTMLButtonElement | null = null;
      const prop = hooks.openProposal ? reportProposal(s, r) : null;
      const goProp = () => {
        if (!prop) return;
        hooks.openProposal?.(prop.plan, prop.say, prop.role);
      };
      if (r.stall) {
        const why = stallSay(r.stall.stage, r.stall.why);
        long.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${why.replace(/^\[\[[^\]]*\]\]が止まっている。/, '')}。`, `[[${STAGE_NAME[bn]}]] needs attention. ${why}.`)));
        short.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${why.replace(/^\[\[[^\]]*\]\]が止まっている。/, '')}`, `[[${STAGE_NAME[bn]}]] needs attention. ${why}`)));
      } else {
        // 課題ありの段の打ち手のうち、見込み（+N 個／月）のいちばん大きいもの（SCM ダッシュボードの「上げるには」と同じ）。④ 販売は moves.ts の bestSell
        const sm = bn === 'sell' && myShops(s).length ? bestSell(s) : null;
        const top = sm ? undefined : bn !== 'sell' || myShops(s).length ? whatIf(s, bn).find((w) => w.ok) : undefined;
        const best = sm ? sellBigUp(ctx, s, sm) : top ? moveUp(ctx, s, top) : null;
        if (best && (top || sm)) {
          const n = Math.round(sm ? sm.units : top!.units);
          long.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。いちばんの改善案は[[${best.label}]]（${best.sub}）。`, `[[${STAGE_NAME[bn]}]] needs attention. Best fix: [[${best.label}]] (${best.sub}).`)));
          short.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。改善案：[[${best.label}]]（+${n} 個／月）`, `[[${STAGE_NAME[bn]}]] needs attention. Fix: [[${best.label}]] (+${n} / mo)`)));
          if (!prop) {
            hint.classList.add('has-go');
            bestBtn = btn(t('担当者からの提案', 'Proposal from staff'), () => {
              closeSheet();
              best.go();
            }, 'is-on isl-rp-best');
            if (best.short) bestBtn.classList.add('is-short');
          }
        } else {
          long.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${STAGE_HINT[bn]}`, `[[${STAGE_NAME[bn]}]] needs attention. ${STAGE_HINT[bn]}`)));
          short.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${STAGE_HINT_SHORT[bn]}`, `[[${STAGE_NAME[bn]}]] needs attention. ${STAGE_HINT_SHORT[bn]}`)));
        }
      }
      if (prop) {
        hint.classList.add('has-go');
        bestBtn = btn(t('📄 担当者からの提案', '📄 Proposal from staff'), goProp, 'is-on isl-rp-best');
      }
      hint.append(long, short);
      if (bestBtn) hint.append(bestBtn);
      c4.append(hint);
      // 今月の出土品（発掘との出会いのあと・発掘場のあるセクタ）：新発見・研究 Lv ↑・RP。導線は研究ノート
      const dg = digMet(s) ? digReportLine(r) : null;
      if (dg) {
        const [dl, ds] = digReportText(dg);
        const line = h('div', 'isl-rp-dig');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('⛏ 今月の出土品', '⛏ Finds this month')), h('span', 'is-long', dl), h('span', 'is-short', ds));
        // 復興と遺物の展示館（同じ行に続けて。スマホで 1 画面に収まるように）
        const rv = reviveReportText(r);
        if (rv) {
          txt.className += ' has-revive';
          txt.append(h('span', 'is-long isl-rp-revive', rv[0]), h('span', 'is-short isl-rp-revive', rv[1]));
        }
        line.append(txt);
        if (hooks.openNotes) line.append(btn(t('研究ノート', 'Notebook'), () => hooks.openNotes?.(), 'isl-rp-go'));
        c4.append(line);
        body.classList.add('has-dig');
      } else {
        // 発掘場の無いセクタ・出会いの前でも、被災した町の復興の行は出す（発掘 v2 の 7 段目）
        const rb = rebuildText(r.rebuild);
        if (rb) {
          const line = h('div', 'isl-rp-dig');
          const txt = h('span', 'isl-rp-dig-text has-revive');
          txt.append(h('span', 'is-long isl-rp-revive', rb[0]), h('span', 'is-short isl-rp-revive', rb[1]));
          line.append(txt);
          c4.append(line);
        }
      }
      // 今月のレベルアップ・強化アイテム（ヒーローの育成。段 E1）：1 行にまとめる（スマホで 1 画面に収まるように）
      const lt = levelUpText(r);
      if (lt) {
        const line = h('div', 'isl-rp-dig isl-rp-lv');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('⭐ 今月のレベルアップ', '⭐ Level-ups this month')), h('span', 'is-long', lt[0]), h('span', 'is-short', lt[1]));
        line.append(txt);
        if (hooks.openGrowth) line.append(btn(t('育成', 'Growth'), () => hooks.openGrowth?.(), 'isl-rp-go'));
        c4.append(line);
        body.classList.add('has-lv');
      }
      // 担当の報告（任せ方の 4 段。段 D）：リーダーの出来・部長の提案と結果・セクター長の 1 行（1 行にまとめる）
      const dt = delegReportText(s, r);
      if (dt) {
        const line = h('div', 'isl-rp-dig isl-rp-deleg');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('👔 担当の報告', '👔 Delegation')), h('span', 'is-long', dt[0]), h('span', 'is-short', dt[1]));
        line.append(txt);
        if (hooks.openProps) line.append(btn(t('担当', 'Leads'), () => hooks.openProps?.(), 'isl-rp-go'));
        c4.append(line);
        body.classList.add('has-deleg');
      }
      // 士気と給与（人事。段 E2）：士気の平均・辞めたい・辞めた・カリスマ度（1 行にまとめる）
      const ht = hrReportText(r);
      if (ht) {
        const line = h('div', 'isl-rp-dig isl-rp-hr');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('👥 士気と給与', '👥 Morale & pay')), h('span', 'is-long', ht[0]), h('span', 'is-short', ht[1]));
        line.append(txt);
        if (hooks.openPay) line.append(btn(t('給与', 'Pay'), () => hooks.openPay?.(), 'isl-rp-go'));
        if (r.hr && (r.hr.want || r.hr.quit.length)) line.classList.add('is-warn');
        // スマホ：辞めたい・辞めた・カリスマ度が上がった月だけ出す（報告を 1 画面に収める。ふつうの月は PC だけ）
        const notable = !!r.hr && (r.hr.want > 0 || r.hr.quit.length > 0 || r.hr.charisma > 0);
        if (!notable) line.classList.add('is-quiet');
        c4.append(line);
        if (notable) body.classList.add('has-hr');
      }
      // お客さんの声（カスタマーサポートと炎上。段 G。Uncommon 以上の町）：問い合わせ・返事・期限切れ・満足度・炎上（1 行にまとめる）
      const ct = csReportText(r);
      if (ct) {
        const line = h('div', 'isl-rp-dig isl-rp-cs');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('🎧 お客さんの声', '🎧 Customer voice')), h('span', 'is-long', ct[0]), h('span', 'is-short', ct[1]));
        line.append(txt);
        if (hooks.openCs) line.append(btn(t('問い合わせ', 'Inquiries'), () => hooks.openCs?.(), 'isl-rp-go'));
        const hot = !!r.cs && (!!r.cs.warn || !!r.cs.ignited || !!r.cs.heat || r.cs.expired > 0);
        if (hot) line.classList.add('is-warn');
        // スマホ：炎上のおそれ・炎上・期限切れのあった月だけ出す（報告を 1 画面に収める。問い合わせが届いたことはトーストで知らせる）
        const notable = hot;
        if (!notable) line.classList.add('is-quiet');
        c4.append(line);
        if (notable) body.classList.add('has-cs');
      }
      // 法務（段 H2。Epic の町）：成立した買収・引き継いだ商売・特許（止めた真似・使用料）・裁判（1 行にまとめる）
      const lgt = legalReportText(r);
      if (lgt) {
        const line = h('div', 'isl-rp-dig isl-rp-legal');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('⚖ 法務', '⚖ Legal')), h('span', 'is-long', lgt[0]), h('span', 'is-short', lgt[1]));
        line.append(txt);
        if (hooks.openLegal) line.append(btn(t('法務', 'Legal'), () => hooks.openLegal?.(), 'isl-rp-go'));
        // スマホ：買収が成立した月・裁判の判決・新しい訴えの月だけ出す（報告を 1 画面に収める）
        const notable = !!r.legal && (r.legal.closed.length > 0 || r.legal.newSuits > 0 || r.legal.won > 0 || r.legal.lost > 0);
        if (notable) line.classList.add('is-warn');
        else line.classList.add('is-quiet');
        c4.append(line);
        if (notable) body.classList.add('has-legal');
      }
      // 突発のできごと（段 UI4）：前の報告から選んだできごと・いま効いている倍率（1 行にまとめる）
      const et = eventReportText(r.events ?? [], r.evFx ?? [], r.evYen ?? 0);
      if (et) {
        const line = h('div', 'isl-rp-dig isl-rp-ev');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('📣 できごと', '📣 Events')), h('span', 'is-long', et[0]), h('span', 'is-short', et[1]));
        line.append(txt);
        // スマホ：できごとを選んだ月だけ出す（効き目だけの月は PC だけ）
        if (!r.events?.length) line.classList.add('is-quiet');
        c4.append(line);
        if (r.events?.length) body.classList.add('has-ev');
      }
      // 外交の交易（段 UI4。Epic の町）：届けた数と売上・足りなかった数・依頼（1 行にまとめる）
      if (r.dip) {
        const dt2 = dipReportText(r.dip);
        const line = h('div', 'isl-rp-dig isl-rp-dip');
        const txt = h('span', 'isl-rp-dig-text');
        txt.append(h('b', '', t('🌐 交易', '🌐 Trade')), h('span', 'is-long', dt2[0]), h('span', 'is-short', dt2[1]));
        line.append(txt);
        if (hooks.openDiplo) line.append(btn(t('外交', 'Diplomacy'), () => hooks.openDiplo?.(), 'isl-rp-go'));
        if (r.dip.short || r.dip.late) line.classList.add('is-warn');
        c4.append(line);
        body.classList.add('has-dip');
      }
      cards.push(c4);

      cards.forEach((c, k) => c.style.setProperty('--d', `${k * 0.08}s`));
      body.append(...cards);
      fitPhone(body);
    },
    then,
  );
  const alive = () => !!bodyEl?.isConnected;
  // 開き直し：発表は済んでいる（ドラムロールを繰り返さない）
  if (again) return;
  reveal(
    ctx,
    r,
    hooks,
    r.rank === 1,
    alive,
    () => {
      shown = true;
      const body = bodyEl;
      if (!body || !body.isConnected) return;
      body.classList.remove('is-wait');
      body.classList.add('is-in');
      const num = body.querySelector('.isl-rp-ranknum');
      setTimeout(() => {
        num?.classList.add('is-show');
        if (prev && prev.rank > r.rank) hooks.sfx?.('levelup');
      }, 420);
      setTimeout(() => {
        animated = true;
        body.classList.remove('is-in');
        body.querySelectorAll('.isl-rp-ranknum').forEach((e) => e.classList.add('is-done'));
      }, 1300);
    },
    // チュートリアル中は従来どおり自動で本体へ
    !!ctx.step?.(),
  );
}

// ---------------------------------------------------------------- 発掘作業のまとめ報告（docs/ISLAND_PHASE1.md「まとめ報告」）

export interface DigSummaryHooks {
  /** 「くわしい報告を見る」（最新の月のいつもの月次報告） */
  detail: () => void;
  openNotes?: () => void;
  sfx?: ReportHooks['sfx'];
}

/**
 * 発掘作業のあいだに締めた月（1〜複数）をまとめた 1 枚（スマホ 390×844 でスクロールなし）：
 * 期間の売上の合計（カウントアップ。カウント中のタップで到達）・月ごとの小さな棒・順位の変化・資金の増減・今回の出土・詰まりと打ち手 1 つ。
 * ボタン「くわしい報告を見る」「続ける」。閉じたら then（main.ts が月末ポーズの「次の月へ」を出す）
 */
export function openDigSummary(ctx: Ctx, sum: DigSummary, hooks: DigSummaryHooks, then?: () => void) {
  const s = ctx.s();
  // まとめ報告の発表は、最新の月の報告の発表も兼ねる（「くわしい報告を見る」でドラムロールを繰り返さない）
  announced.add(sum.latest);
  let counted = false;
  /** カウントを始めた時刻（画面を描き直しても、続きから。ドラムロールは最初の 1 回だけ） */
  let t0: number | null = null;
  open(
    ctx,
    sum.title,
    (body) => {
      body.classList.add('is-dsum');
      // ---- 売上の合計（カウントアップ）と月ごとの棒
      const c1 = h('div', 'isl-card2 isl-ds-card');
      c1.append(cardHead(t('KPI ①', 'KPI 1'), false, t('期間の売上', 'Sales in this period')));
      const top = h('div', 'isl-ds-top');
      // 描き直したときは、カウントの続きから
      const num = h('b', 'isl-ds-total', counted ? money(sum.total) : t0 != null ? money(countValue(sum.total, Math.min(1, (performance.now() - t0) / REVEAL.count))) : '0 G');
      top.append(num);
      const bars = h('div', 'isl-ds-bars');
      const max = Math.max(1, ...sum.months.map((m) => m.revenue));
      for (const m of sum.months) {
        const col = h('span', 'isl-ds-bar');
        const f = h('i');
        f.style.height = `${Math.max(4, Math.round((m.revenue / max) * 100))}%`;
        col.append(f, h('small', '', m.label));
        col.title = `${m.label} ${money(m.revenue)}`;
        bars.append(col);
      }
      top.append(bars);
      c1.append(top);
      // 売上のうち復刻品のぶん
      if (sum.relic) c1.append(h('small', 'isl-rp-relic', t(`うち復刻品 ${money(sum.relic)}`, `incl. revivals ${money(sum.relic)}`)));
      const row = h('div', 'isl-ds-row');
      // 順位の変化
      const rk = h('span', 'isl-ds-chip');
      const mv = sum.rankFrom == null ? 0 : sum.rankFrom - sum.rankTo;
      rk.append(h('small', '', t('エリアの順位', 'Area rank')), h('b', `isl-ds-rank ${mv > 0 ? 'is-up' : mv < 0 ? 'is-down' : ''}`, sum.rankFrom == null ? t(`${sum.rankTo} 位`, `#${sum.rankTo}`) : t(`${sum.rankFrom} 位 → ${sum.rankTo} 位`, `#${sum.rankFrom} → #${sum.rankTo}`)));
      if (sum.conquered) rk.append(h('span', 'isl-ds-crown', t('👑 制覇！', '👑 Conquered!')));
      row.append(rk);
      // 資金の増減
      const cash = h('span', 'isl-ds-chip');
      cash.append(h('small', '', t('資金', 'Funds')));
      if (sum.money) {
        const dm = sum.money.end - sum.money.start;
        cash.append(h('b', '', `${money(sum.money.start)} → ${money(sum.money.end)}`), h('small', dm >= 0 ? 'isl-good' : 'isl-bad', `${dm >= 0 ? '+' : '−'}${money(Math.abs(dm))}`));
      } else cash.append(h('b', '', '—'));
      row.append(cash);
      c1.append(row);
      // ---- 今回の出土
      const c2 = h('div', 'isl-card2 isl-ds-card');
      c2.append(cardHead('⛏', false, t('今回の出土', 'This dig'), hooks.openNotes ? btn(t('研究ノート', 'Notebook'), () => hooks.openNotes?.(), 'isl-rp-go') : undefined));
      const g = h('div', 'isl-ds-got');
      const got = sum.got;
      for (const [k, v] of [
        [t('新発見', 'New'), `${got.found}`],
        [t('研究 Lv ↑', 'Lv ↑'), `${got.lv}`],
        ['RP', `+${got.rp}`],
        [t('素材', 'Mats'), `+${got.mat}`],
      ]) {
        const c = h('span', 'isl-ds-stat');
        c.append(h('small', '', k), h('b', '', v));
        g.append(c);
      }
      c2.append(g);
      // 復興と遺物の展示館（期間の来館・収入の合計）
      const rv = reviveReportText({ revive: sum.revive, museum: sum.museum });
      if (rv) c2.append(h('small', 'isl-ds-revive', rv[0]));
      // ---- 詰まり（最新の月）と打ち手 1 つ
      const c3 = h('div', 'isl-card2 isl-ds-card');
      const bn = reportJam(s, sum.latest);
      c3.append(cardHead(t('KPI ③', 'KPI 3'), false, t('いまの課題', 'Current issue')));
      const hint = h('p', 'isl-rp-hint isl-ds-hint');
      const tw = bn !== 'sell' || myShops(s).length ? whatIf(s, bn).find((w) => w.ok) : undefined;
      const best = tw ? moveUp(ctx, s, tw) : null;
      if (sum.latest.stall) hint.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${stallSay(sum.latest.stall.stage, sum.latest.stall.why).replace(/^\[\[[^\]]*\]\]が止まっている。/, '')}`, `[[${STAGE_NAME[bn]}]] needs attention. ${stallSay(sum.latest.stall.stage, sum.latest.stall.why)}`)));
      else if (best && tw) hint.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。改善案：[[${best.label}]]（+${Math.round(tw.units)} 個／月）`, `[[${STAGE_NAME[bn]}]] needs attention. Fix: [[${best.label}]] (+${Math.round(tw.units)} / mo)`)));
      else hint.append(rich(t(`[[${STAGE_NAME[bn]}]]が課題あり。${STAGE_HINT_SHORT[bn]}`, `[[${STAGE_NAME[bn]}]] needs attention. ${STAGE_HINT_SHORT[bn]}`)));
      c3.append(hint);
      // ---- ボタン
      const acts = h('div', 'isl-row isl-ds-acts');
      acts.append(btn(t('くわしい報告を見る', 'Full report'), () => hooks.detail()), btn(t('続ける', 'Continue'), () => closeSheet(), 'is-on'));
      body.append(c1, c2, c3, acts);
      // カウントアップ（いつもの報告の発表と同じ長さ。カウント中のタップで到達）
      if (!counted) {
        if (t0 == null) {
          t0 = performance.now();
          hooks.sfx?.('drum');
        }
        const start = t0;
        let landed = false;
        const land = () => {
          if (landed || counted) return;
          landed = true;
          counted = true;
          num.textContent = money(sum.total);
          num.classList.add('is-hit');
          hooks.sfx?.(sum.conquered || sum.rankTo === 1 ? 'win' : 'sale');
        };
        num.addEventListener('click', land);
        c1.addEventListener('click', land);
        const tick = (now: number) => {
          if (landed || counted || !num.isConnected) return;
          const k = Math.min(1, (now - start) / REVEAL.count);
          num.textContent = money(countValue(sum.total, k));
          if (k < 1) requestAnimationFrame(tick);
          else land();
        };
        requestAnimationFrame(tick);
      }
    },
    then,
  );
}
