/**
 * 段 UIX3b：サプライチェーンの画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：サプライチェーン」）。
 * ① 調達 → ② 製造 → ③ 物流 → ④ 販売 の流れと詰まりを、計器盤で見せる：段ごとのランプ・縦の棒・ひと月に流せる数（桁が回る）・
 * 下のベルトを流れる点（詰まりの手前でたまり、先は細る）。詰まりの札は「どこで・あと何が足りないか」を目盛りと言葉で（責めない）。
 * 段を押すと、その段のくわしい札（担当・いまの様子・課題・直す画面へのキー・数字を上げる手・スキル）へ 520ms で送る。
 * 段ごとの判定・打ち手の見込み・言葉は、今の画面（p1/scm.ts）と同じ関数を束（B）で受け取って使う。器は今の札（open()）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { Odo, uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpGap, uxpHead, uxpRow, uxpStamp, uxpStat, uxpTabs } from '../sparts';
import { B } from './b-deps';
import { bDim, bIcon, bInk } from './b-icons';
import { block, dim, done, facePic, fold, heroSlot, key, matPic, noEmoji, num, payFx, put, root, setText, sigOf, skuPic, stampLater, state, whyLine, type Block } from './b-kit';
import './supply.css';
import type { Mat, Sku } from '../../p1/data';
import type { P1State, Stage, WhatIf } from '../../p1/model';
import type { Lamp, Up } from '../../p1/scm';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

export const STAGES: Stage[] = ['buy', 'craft', 'haul', 'sell'];
/** 段の絵 */
export const STAGE_ICO: Record<Stage, string> = { buy: 'box', craft: 'hammer', haul: 'truck', sell: 'shop' };
/** 段のランプ：順調＝緑／注意＝琥珀（またたく）／停止＝赤（またたく）。言葉も添える（色だけにしない） */
export const lampLook = (l: Lamp): { kind: '' | 'good' | 'bad'; blink: boolean } => (l === 'ok' ? { kind: 'good', blink: false } : l === 'warn' ? { kind: '', blink: true } : { kind: 'bad', blink: true });
/** 縦の棒の高さ（0〜1。50 段）。止まっている段は 0 */
export const barRatio = (perMonth: number, stopped: boolean, max: number) => (stopped ? 0 : Math.round((Math.max(0, perMonth) / Math.max(1, max)) * 50) / 50);
/**
 * ベルトを流れる点の数（段ごと。0〜4）：その段まで実際に届く数（そこまでの段のいちばん小さい数）を、いちばん大きい段との割合で。
 * 止まっている段から先は 0。流れているなら、少なくとも 1 つ
 */
export function beltDots(caps: Record<Stage, { perMonth: number; stopped: boolean }>): Record<Stage, number> {
  const max = Math.max(1, ...STAGES.map((k) => (caps[k].stopped ? 0 : caps[k].perMonth)));
  let flow = Infinity;
  const out = {} as Record<Stage, number>;
  for (const k of STAGES) {
    flow = Math.min(flow, caps[k].stopped ? 0 : caps[k].perMonth);
    out[k] = flow <= 0 ? 0 : Math.max(1, Math.round((flow / max) * 4));
  }
  return out;
}
/** 詰まりの段と、次に細い段との差：「あと N 個／月で並ぶ」。ほかの段が全部止まっていれば null */
export function jamGap(caps: Record<Stage, { perMonth: number; stopped: boolean }>, bn: Stage): { cur: number; next: Stage; target: number; gap: number } | null {
  const cur = caps[bn].stopped ? 0 : caps[bn].perMonth;
  const others = STAGES.filter((k) => k !== bn && !caps[k].stopped);
  if (!others.length) return null;
  const next = others.reduce((a, k) => (caps[k].perMonth < caps[a].perMonth ? k : a), others[0]);
  return { cur, next, target: caps[next].perMonth, gap: Math.max(0, Math.round(caps[next].perMonth - cur)) };
}
/** 流れの計器盤の棒が伸びる長さ（タブの送りと同じ 520ms・8 段） */
export const FLOW_GROW_MS = 520;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sumOf = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);

// ---------------------------------------------------------------- 画面

/** サプライチェーンの画面を開く（p1/scm.ts の openSupply から。入のときだけ） */
export function openSupplyUx(ctx: Ctx, opt: { breakdown?: boolean } = {}) {
  let view: ReturnType<typeof build> | null = null;
  B.open(ctx, t('サプライチェーン（SCM）', 'Supply chain (SCM)'), (body) => {
    const first = !view;
    view ??= build(ctx);
    view.mount(body);
    if (first && opt.breakdown) view.breakdown();
  });
}

function build(ctx: Ctx) {
  const s = () => ctx.s();
  const tipBox = el('div.uxb-tip');
  let wantBreakdown = false;

  // ---- 流れの計器盤：段ごとの柱（ランプ・縦の棒・数）と、下のベルト
  interface Col {
    key: HTMLButtonElement;
    lamp: HTMLElement;
    word: HTMLElement;
    bar: HTMLElement;
    odo: Odo;
    stop: HTMLElement;
    jam: HTMLElement;
    seg: HTMLElement;
    dots: number;
  }
  const cols = {} as Record<Stage, Col>;
  const colRow = el('div.uxb-flow-cols', { role: 'tablist', 'aria-label': t('流れの段', 'Stages') });
  const belt = el('div.uxb-flow-belt', { 'aria-hidden': 'true' });
  for (const k of STAGES) {
    const lamp = uxLamp('good', true);
    const word = el('span.uxb-flow-word');
    const bar = el('i.uxb-flow-bar');
    const odo = new Odo({ digits: Math.max(3, String(Math.max(...STAGES.map((x) => B.stageCaps(s())[x].perMonth))).length), size: 's', value: 0 });
    const stop = el('span.uxb-flow-stop', t('止まっている', 'Stopped'));
    const jam = uxTape(t('詰まり', 'Jam'), 'amber');
    jam.classList.add('uxb-flow-jam');
    const st = B.STAGE[k];
    const b = uxKey(
      el('span.uxb-flow-col', el('span.uxb-flow-name', num(st.n.replace(/[①②③④]/, (c) => String('①②③④'.indexOf(c) + 1))), el('b', st.name)), el('span.uxb-flow-st', lamp, word), el('span.uxb-flow-plot', bar, jam), el('span.uxb-flow-n', odo.el, stop)),
      () => tabs.set(k),
      { cls: 'uxb-flow-key', attrs: { role: 'tab', 'data-stage': k, 'aria-pressed': 'false', 'data-ux-quiet': '' } },
    );
    const seg = el('span.uxb-belt-seg', { 'data-stage': k });
    cols[k] = { key: b, lamp, word, bar, odo, stop, jam, seg, dots: -1 };
    colRow.append(b);
    belt.append(seg);
  }
  const board = el('div.uxb-flow', el('div.uxb-flow-head', uxTape([bInk('bars'), el('b', t('流れ', 'Flow'))], 'amber'), el('span.uxb-dim', t('数字＝ひと月に流せる数（個）', 'Numbers = units per month'))), colRow, belt);

  // ---- 詰まりの札・数字の札・次に詰まる段
  const jamBox = block(
    'div.uxb-jam',
    () => {
      const st = s();
      const caps = B.stageCaps(st);
      const bn = B.scmJam(st);
      const is = B.scmIssues(ctx, st, caps);
      return sigOf(bn, caps, is[bn].lamp, is[bn].lines[0], st.money, st.rp, bestUp(st, bn)?.label, bestUp(st, bn)?.sub);
    },
    (host) => {
      const st = s();
      const caps = B.stageCaps(st);
      const bn = B.scmJam(st);
      const is = B.scmIssues(ctx, st, caps);
      const g = jamGap(caps, bn);
      const gain = B.jamGain(st, caps, bn);
      const stg = B.STAGE[bn];
      host.className = `uxb-jam is-${is[bn].lamp}`;
      const up = bestUp(st, bn);
      put(
        host,
        el('div.uxb-jam-head', el('span.uxb-jam-k', t('いまの詰まり（ボトルネック）', 'Current jam (bottleneck)')), el('b.uxb-jam-name', bIcon(STAGE_ICO[bn], { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: 2 }), `${stg.n} ${stg.name}`)),
        el('p.uxb-jam-say', is[bn].lines[0] ?? t('いちばん細いところです。ここを太くすると、サイクル全体の売上が伸びます。', 'This is the narrowest stage. Widen it and the whole cycle sells more.')),
      );
      if (g) {
        const m = uxMeter(g.target > 0 ? g.cur / g.target : 0);
        const nx = B.STAGE[g.next];
        put(
          host,
          el(
            'div.uxb-jam-gap',
            el('span.uxb-jam-gap-top', el('span', num(g.cur), t(' 個／月', ' /mo')), el('span.uxb-dim', bDim('next'), `${nx.n} ${nx.name}`, num(g.target))),
            m.el,
            el('b.uxb-jam-gap-t', g.gap > 0 ? t(`あと ${B.fmt(g.gap)} 個／月で、${nx.n} ${nx.name}に並びます`, `${B.fmt(g.gap)} more / mo to match ${nx.n} ${nx.name}`) : t('ほかの段と並んでいます', 'Level with the other stages')),
            gain ? el('span.uxb-gain', bIcon('up', { color: '#36e08b', scale: 1 }), t(`ここを太くすると、売上は最大で +${gain.n} 個／月（≒ +${B.money(gain.g)}）`, `Widen this: up to +${gain.n} sold / mo (≈ +${B.money(gain.g)})`)) : null,
          ),
        );
      }
      if (up) {
        const k = uxKey(el('span.uxb-jam-go', el('span.uxb-jam-go-k', t('いちばんの改善案', 'Best fix')), el('b', up.label)), () => runUp(up, host), { kind: 'main', big: true, cls: 'uxb-jam-key', strong: true });
        put(host, k, subLine('uxb-jam-sub', up));
      }
    },
  );
  const kpi = block(
    'div.uxp-stats.uxb-scm-kpi',
    () => {
      const st = s();
      const last = st.reports[st.reports.length - 1];
      return sigOf(Math.round(B.monthRevenue(st)), last?.rank, st.cleared, B.clearGoal(st));
    },
    (host) => {
      const st = s();
      const last = st.reports[st.reports.length - 1];
      const rev = Math.round(B.monthRevenue(st));
      host.append(uxpStat(t('今月の売上', 'Sales this month'), rev, { key: 'b.scm.rev', unit: 'G', digits: Math.max(6, String(rev).length), tone: 'amber', ico: 'coin', size: 's' }).el);
      host.append(el('div.uxp-stat.uxb-scm-rank', el('span.uxp-stat-k', bInk('crown'), t('エリア順位', 'Area rank')), el('span.uxp-stat-v', last ? [num(last.rank, 'uxb-scm-rank-n'), el('span.uxp-stat-u', t('位', ''))] : el('span.uxb-dim', t('締めのあと', 'after close')))));
      // 制覇の条件（2 か月続けて 1 位 ＋ 研究成果の発表）。まだ制覇していないセクタで、お題があるとき
      const g = B.clearGoal(st);
      if (!st.cleared && g.all > 0 && last) host.append(el(`div.uxb-scm-cond${g.top && !g.present ? '.is-wait' : ''}`, bDim('flag'), el('span', B.clearCondText(g.streak, g)[0])));
    },
  );
  const nextLine = block(
    'div.uxb-next',
    () => sigOf(B.nextJam(s()), B.scmJam(s())),
    (host) => {
      const st = s();
      const caps = B.stageCaps(st);
      const bn = B.scmJam(st);
      const nx = B.nextJam(st, caps);
      const a = `${B.STAGE[bn].n} ${B.STAGE[bn].name}`;
      const b = `${B.STAGE[nx.next].n} ${B.STAGE[nx.next].name}`;
      host.append(
        bDim('next'),
        el(
          'span',
          caps[bn].stopped
            ? [el('b', a), t('を動かすと、次は', ' moving → next jam: '), el('b', b), t(`（${nx.n} 個／月）が詰まります。`, ` (${nx.n} / mo).`)]
            : nx.same
              ? [el('b', a), t('は、30% 太くしてもまだ詰まりです。思い切って太くしよう。', ' is still the jam even 30% wider. Widen it boldly.')]
              : [t(`ここ（${B.STAGE[bn].n}）を太くすると、次は`, `Widen this (${B.STAGE[bn].n}) → next jam: `), el('b', b), t(`（${nx.n} 個／月）が詰まります。`, ` (${nx.n} / mo).`)],
        ),
      );
    },
  );

  /** 詰まりの段の「いちばんの改善案」：販売は毎月の費用を引いた見込みの大きい手（bestSell）、ほかは見込みの大きい手 */
  function bestUp(st: P1State, k: Stage): Up | null {
    if (k === 'sell') {
      const big = B.myShops(st).length ? B.bestSell(st) : null;
      if (big) return B.sellBigUp(ctx, st, big);
    }
    return upsFor(st, k)[0] ?? null;
  }
  /** その段の数字を上げる手（今の画面と同じ並び。無ければ、その段の画面へ） */
  function upsFor(st: P1State, k: Stage): Up[] {
    const has = k !== 'sell' || B.myShops(st).length > 0;
    const ups = has ? B.upsOf(ctx, st, B.whatIf(st, k)) : [];
    if (!ups.length && has) {
      const none = t('いま効く改善案が見つからない', 'No fix helps right now');
      ups.push(
        k === 'buy'
          ? { label: t('調達を開く', 'Open buying'), sub: none, go: () => B.openBuy(ctx) }
          : k === 'craft'
            ? { label: t('工房を開く', 'Open workshop'), sub: none, go: () => B.openWorkshop(ctx) }
            : k === 'haul'
              ? { label: t('スキルツリーで見る', 'Open skill tree'), sub: none, go: () => B.openSkills(ctx, 'logi') }
              : { label: t('販売の内訳を見る', 'Sales breakdown'), sub: t('なぜ頭打ちか', 'Why it’s capped'), go: () => showBreakdown() },
      );
    }
    return ups;
  }
  /** 手を打つ：その場でお金を払う手（設備投資・棚）は、払えたら金貨が飛ぶ。足りないときは、今の言葉（あと N G）が出る */
  function runUp(u: Up, at: Element | null) {
    const before = s().money;
    u.go();
    if (s().money < before) payFx(at?.isConnected ? at : board);
  }
  /** 手の添え書き：見込み（+N 個／月）は緑と上向きの矢印、足りないときは琥珀と金貨、見込みの無い行き先は弱い字 */
  const subLine = (cls: string, u: Up) => {
    const gain = /^[+＋]/.test(u.sub);
    return el(`span.${cls}${u.short ? '.is-short' : gain ? '' : '.is-plain'}`, u.short ? bIcon('coin', { scale: 1 }) : gain ? bIcon('up', { color: '#36e08b', scale: 1 }) : bDim('info'), u.sub);
  };
  const upCard = (u: Up, k: number) =>
    uxpCard({
      pic: el('span.uxb-up-n', num(k + 1)),
      name: u.label,
      desc: subLine('uxb-up-sub', u),
      right: key(u.buy ? t('買う', 'Buy') : t('開く', 'Open'), () => runUp(u, e.querySelector(`[data-up="${k}"]`)), { strong: !!u.buy }),
      cls: 'uxb-up',
      attrs: { 'data-up': String(k) },
    });

  // ---- 段のくわしい札（4 つ。押した段へ 520ms で送る）
  let stamp = 0;
  const panes = {} as Record<Stage, Block>;
  for (const k of STAGES) panes[k] = block('div.uxb-list.uxb-stage', () => String(stamp), (host) => stagePane(k, host));

  const assignSlot = (st: P1State, label: string, task: 'buy' | 'craft' | 'transport' | 'shop', hero: number | null, target: number | null) =>
    heroSlot(st, {
      label,
      task,
      hero,
      onTap: () =>
        B.pickHero(ctx.root, st, {
          title: t(`${label}（${B.TASK_NAME[task]}）`, `${label} (${B.TASK_NAME[task]})`),
          task,
          current: hero,
          onPick: (v) => {
            if (task === 'buy') for (const x of st.staff) if (x.task === 'buy' && x.hero !== v) B.assign(st, x.hero, null);
            if (v == null) {
              if (hero != null) B.assign(st, hero, null);
            } else {
              if (task === 'transport' && hero != null && hero !== v) B.assign(st, hero, null);
              B.assign(st, v, task, target);
            }
            done(ctx);
          },
        }),
    });
  const field = (label: string, v: number, text: string, kind: '' | 'good' | 'cyan' = '', bad = false) => {
    const m = uxMeter(v, kind);
    m.el.classList.toggle('is-full', bad);
    return el('div.uxb-field.is-row', el('span.uxb-field-k', label), m.el, el('span.uxb-field-v', num(text)));
  };

  function stagePane(k: Stage, host: HTMLElement) {
    const st = s();
    const caps = B.stageCaps(st);
    const is = B.scmIssues(ctx, st, caps)[k];
    const bn = B.scmJam(st);
    const look = lampLook(is.lamp);
    const stg = B.STAGE[k];
    host.dataset.stage = k;
    host.classList.toggle('is-bn', k === bn);
    put(host, uxpHead(`${stg.n} ${stg.name}`, { ico: STAGE_ICO[k], kind: k === bn ? 'amber' : 'dark', right: state(look.kind, B.LAMP_NAME[is.lamp], look.blink) }));
    // 課題（責めない言い方の 1 行ずつ）と、直す画面へのキー
    for (const line of is.lines.slice(0, 3)) host.append(whyLine(noEmoji(line), is.lamp === 'stop' ? 'warn' : 'info'));
    if (is.lamp === 'stop') host.lastElementChild?.classList.add('is-bad');
    if (is.acts.length) host.append(el('div.uxb-acts', is.acts.map(([label, go, cls]) => key(label, go, { kind: cls === 'is-on' ? '' : 'weak', ico: cls === 'is-on' ? 'next' : null }))));
    // 数字を上げるには（見込みの大きい順）
    const ups = upsFor(st, k);
    if (ups.length) put(host, uxpHead(t('数字を上げるには', 'To raise the number'), { ico: 'up' }), el('div.uxp-list', ups.map(upCard)));
    // 担当と、いまの様子
    const buyer = st.staff.find((x) => x.task === 'buy');
    const haulers = st.staff.filter((x) => x.task === 'transport');
    const shops = B.myShops(st);
    if (k === 'buy') {
      const chips = el('div.uxb-chips');
      for (const m of B.MAT_KEYS) {
        if (!B.hasRoute(st, m) && !(st.mats[m] ?? 0)) continue;
        const low = (st.mats[m] ?? 0) < 6;
        chips.append(el(`span.uxb-chip${low ? '.is-low' : ''}`, { title: B.MATS[m].name }, matPic(m as Mat, 24), num(st.mats[m] ?? 0), low ? el('span.uxb-chip-w', t('少', 'low')) : null));
      }
      const tr = st.buyTrip;
      const prog = tr ? (tr.total - tr.left) / tr.total : 0;
      const pos = prog < 0.5 ? prog * 2 : (1 - prog) * 2;
      const cargo = tr ? Object.entries(tr.cargo).map(([m, n]) => `${B.MATS[m as Mat].name}×${n}`).join(t('・', ', ')) : '';
      put(
        host,
        uxpHead(t('担当といまの様子', 'Crew and status'), { ico: 'people' }),
        assignSlot(st, t('調達係', 'Buyer'), 'buy', buyer?.hero ?? null, null),
        el('span.uxb-cap', t('素材の在庫', 'Materials')),
        chips,
        field(t('置き場所', 'Storage'), B.poolUsed(st) / B.poolCap(st), `${B.poolUsed(st)}/${B.poolCap(st)}`, 'cyan', B.poolFree(st) <= 2),
        el('div.uxb-trip', el('span.uxb-trip-end', bDim('hammer'), t('工房', 'Workshop')), el('span.uxb-trip-track', tr ? el(`span.uxb-trip-who${prog >= 0.5 ? '.is-back' : ''}`, { style: { left: `${Math.round(pos * 50) * 2}%` } }, facePic(tr.hero, 32, { breathe: true })) : null), el('span.uxb-trip-end', bDim('shop'), t('卸問屋', 'Wholesaler'))),
        dim(tr ? t(`買い付け中：あと ${Math.max(1, Math.ceil(tr.left))} 日で ${cargo} が届く`, `On a trip: ${cargo} arrives in ${Math.max(1, Math.ceil(tr.left))} d`) : buyer ? t('工房で次の買い付けを待っています', 'Waiting at the workshop') : t('調達係がいません', 'No buyer')),
        uxpRow(t(`今月${stg.what}`, `${stg.what} this month`), t(`${B.fmt(st.proc.bought)} 個`, B.fmt(st.proc.bought)), { ico: 'box' }),
      );
    } else if (k === 'craft') {
      put(host, uxpHead(t('担当といまの様子', 'Crew and status'), { ico: 'people' }));
      st.slots.forEach((sl, i) => {
        const w = sl.worker != null ? B.staffOf(st, sl.worker) : null;
        const p = sl.running && sl.sku && w ? sl.progress / B.craftDays(st, sl.sku) : 0;
        const m = uxMeter(p);
        const word = sl.sku ? (w?.resting ? t('休憩中', 'resting') : sl.running ? `${Math.round(p * 100)}%` : t('止まっている', 'idle')) : t('未定', 'unset');
        host.append(
          assignSlot(st, t(`作業台 ${i + 1}`, `Bench ${i + 1}`), 'craft', sl.worker, i),
          el('div.uxb-benchrow', sl.sku ? skuPic(sl.sku as Sku, 32) : el('span.uxb-q', '?'), el('span.uxb-eta-body', el('span.uxb-eta-top', el('span', sl.sku ? B.skuName(sl.sku) : t('作る物が未定', 'Nothing chosen')), el('span.uxb-eta-left', word)), m.el, sl.sku && w && !w.resting ? el('span.uxb-dim', t(`${(B.craftDays(st, sl.sku) / B.speed(w, 'craft', st)).toFixed(1)} 日/ロット`, `${(B.craftDays(st, sl.sku) / B.speed(w, 'craft', st)).toFixed(1)} d/lot`)) : null)),
        );
      });
      host.append(uxpRow(t(`今月${stg.what}`, `${stg.what} this month`), t(`${B.fmt(st.ws.made)} 個`, B.fmt(st.ws.made)), { ico: 'hammer' }));
    } else if (k === 'haul') {
      put(host, uxpHead(t('担当といまの様子', 'Crew and status'), { ico: 'people' }));
      for (const x of haulers) host.append(assignSlot(st, t('運搬係', 'Hauler'), 'transport', x.hero, null));
      if (haulers.length < B.MAX_HAULERS) host.append(assignSlot(st, t('運搬係', 'Hauler'), 'transport', null, null));
      const waiting = Object.entries(st.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
      put(host, el('span.uxb-cap', t('工房で出荷待ち', 'Waiting to ship')), waiting.length ? el('div.uxb-chips', waiting.map(([x, n]) => el('span.uxb-chip', { title: B.skuName(x) }, skuPic(x, 24), num(`×${n}`)))) : dim(t('工房で待っている商品はありません', 'Nothing waiting at the workshop')));
      host.append(el('span.uxb-cap', t('走っている荷車', 'Carts on the road')));
      for (const tp of st.trips) {
        const to = st.buildings.find((b) => b.uid === tp.to);
        const from = tp.from != null ? st.buildings.find((b) => b.uid === tp.from) : null;
        const via = from && from.id !== 'workshop' ? t('（拠点から）', ' (from hub)') : '';
        const m = uxMeter(1 - tp.left / tp.total);
        host.append(el('div.uxb-eta', facePic(tp.hauler, 32, { breathe: true }), el('span.uxb-eta-body', el('span.uxb-eta-top', el('span.uxb-cart', bDim('cart'), tp.dropped ? t(`帰り道${via}`, `returning${via}`) : `→ ${to ? B.DEF[to.id].name : ''}${via}`), el('span.uxb-eta-left', t('あと ', ''), num(Math.ceil(tp.left)), t(' 日', ' d left'))), m.el)));
      }
      if (!st.trips.length) host.append(dim(t('いま走っている荷車はありません', 'No carts on the road')));
      host.append(uxpRow(t(`今月${stg.what}`, `${stg.what} this month`), t(`${B.fmt(st.ws.hauled ?? 0)} 個`, B.fmt(st.ws.hauled ?? 0)), { ico: 'truck' }));
    } else {
      put(host, shops.length ? uxpHead(t('お店ごと', 'By shop'), { ico: 'shop' }) : null);
      for (const b of shops) {
        const sh = st.shops[b.uid];
        const mainX = sh.shelves[0];
        const on = mainX ? (sh.shelf[mainX] ?? 0) : 0;
        const back = mainX ? (sh.storage[mainX] ?? 0) : 0;
        const area = B.shopArea(st, b);
        host.append(
          uxpCard({
            pic: mainX ? skuPic(mainX, 32) : el('span.uxb-q', '?'),
            name: B.DEF[b.id].name,
            tags: el('span.uxb-shoprev', num(`${B.fmt(sh.rev)} G`)),
            desc: [
              field(t('棚', 'Shelf'), on / 10, String(on), on ? 'good' : '', !on),
              field(t('裏', 'Back'), back / B.storageCap(b, st), String(back)),
              field(t('認知度', 'Known'), sh.aw ?? 1, `${Math.round((sh.aw ?? 1) * 100)}%`, 'cyan'),
              el(`span.uxb-dim${area.rivals.length || area.mine ? '.is-warn' : ''}`, bDim('home'), t(`近くの家 ${area.homes}・競合 ${area.rivals.length}・片道 ${area.way.days.toFixed(1)} 日${area.mine ? `・自社の店と近い` : ''}`, `${area.homes} homes · ${area.rivals.length} rivals · ${area.way.days.toFixed(1)} d${area.mine ? ' · near own shop' : ''}`)),
            ],
            right: key(t('開く', 'Open'), () => B.openShop(ctx, b.uid), { ico: 'next' }),
            cls: 'uxb-shopcard',
            attrs: { 'data-shop': String(b.uid) },
          }),
          assignSlot(st, t(`${B.DEF[b.id].name}の店員`, `Clerk: ${B.DEF[b.id].name}`), 'shop', sh.staff, b.uid),
        );
      }
      const sold = sumOf(st.monthUnits);
      host.append(uxpRow(t(`今月 ${stg.what}`, `${stg.what} this month`), t(`${B.fmt(sold)} 個・${B.money(B.monthRevenue(st))}`, `${B.fmt(sold)} · ${B.money(B.monthRevenue(st))}`), { ico: 'shop', tone: 'amber' }));
      if (shops.length) host.append(breakdownFold(st, k === bn || wantBreakdown));
    }
    // 詰まりを太くするスキル：その場で習得できる
    const sks = k === bn ? B.nextSkills(st, stg.branch) : [];
    if (sks.length) host.append(uxpHead(t('詰まりを太くするスキル', 'Skills to widen the jam'), { ico: 'star' }));
    for (const sk of sks) {
      const research = B.isResearch(sk);
      const cost = research ? B.rpCost(sk) : sk.cost;
      const haveN = research ? (st.rp ?? 0) : st.money;
      const gap = uxpGap(haveN, cost, research ? { unit: 'RP', hint: t('発掘で貯まります', 'Earned by digging') } : {});
      const got = uxpStamp(t('習得済', 'Learned'));
      host.append(
        uxpCard({
          pic: el('span.uxb-inv-pic', bIcon(research ? 'flask' : 'coin', { scale: 3, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' })),
          name: sk.name,
          tags: got.el,
          desc: sk.note,
          foot: [el('span.uxp-price', research ? bIcon('flask', { scale: 1 }) : bIcon('coin', { scale: 1 }), num(research ? `${B.fmt(cost)} RP` : `${B.fmt(cost)} G`)), gap.el],
          right: key(
            research ? t('研究する', 'Research') : t('開放する', 'Unlock'),
            () => {
              const cur = s();
              if ((research ? (cur.rp ?? 0) : cur.money) < cost) return gap.nudge();
              const err = B.learn(cur, sk.id);
              if (err === 'money') return void ctx.toast(t('資金が足りません', 'Not enough funds'));
              if (err === 'rp') return void ctx.toast(t('研究ポイントが足りません（発掘で貯まります）', 'Not enough RP (earned by digging)'));
              if (err) return uxSfx('deny');
              ctx.toast(t(`「${sk.name}」を習得しました`, `Learned: ${sk.name}`));
              const card = e.querySelector<HTMLElement>(`[data-skill="${sk.id}"]`);
              if (!research) payFx(card);
              got.hit(card);
              uxSfx('stamp');
              stampLater(() => done(ctx), 700);
            },
            { strong: true },
          ),
          cls: 'uxb-skill',
          attrs: { 'data-skill': sk.id },
        }),
      );
    }
    host.append(el('div.uxb-acts', key(t('スキルツリーで見る', 'Open skill tree'), () => B.openSkills(ctx, stg.branch), { kind: 'weak', ico: 'star' })));
  }

  // ---- ④ 販売の内訳（頭打ちの理由・打ち手ごとの見込み・商品ごと・お店ごと）
  let bdFold: ReturnType<typeof fold> | null = null;
  function breakdownFold(st: P1State, openNow: boolean) {
    bdFold = fold(t('④ 販売の内訳', '④ Sales breakdown'), (box) => breakdown(st, box), { open: openNow, note: t('売れる数が頭打ちの理由と、効く打ち手', 'Why sales are capped, and what helps'), ico: 'bars', cls: 'uxb-bd' });
    return bdFold.el;
  }
  function breakdown(st: P1State, box: HTMLElement) {
    const info = B.sellInfo(st);
    const ws: WhatIf[] = B.whatIf(st, 'sell').map((w) => (w.move.kind === 'sell' ? w.move.w : null)).filter((w): w is WhatIf => !!w);
    const okW = ws.filter((w) => w.ok);
    const why = B.scmWhy(ctx, st, info, okW.find((w) => w.kind === 'shop') ?? ws.find((w) => w.kind === 'shop'));
    const lim = (label: string, n: number, on: boolean) => el(`div.uxb-lim${on ? '.is-on' : ''}`, uxLamp('', on), el('span.uxb-lim-k', label), el('span.uxb-lim-v', num(B.fmt(Math.round(n))), t(' 個／月', ' /mo')));
    put(
      box,
      el(`div.uxb-bd-why.is-${info.why}`, el('span.uxb-jam-k', t('売れる数が頭打ちの理由', 'Why sales are capped')), el('b', B.WHY_NAME[info.why]), el('p', why.text)),
      el('div.uxb-lims', lim(t('需要から取れる数', 'From demand'), info.potential, info.why !== 'capacity'), lim(t('お店の処理力（品出し）', 'Shelving capacity'), info.capacity, info.why === 'capacity')),
      dim(t('小さいほう（ランプが点いているほう）が、販売の数字です。', 'The smaller one (lamp on) is the Sell number.')),
    );
    // いちばんの改善案は上の「詰まりの札」と同じ手（販売が詰まりのとき）。ここでは、ふつうのキーで
    const big = B.bestSell(st);
    const KIND: Record<string, WhatIf['kind'][]> = { capacity: ['part', 'fixtures'], demand: ['goods', 'shelf'], far: ['shop'], known: ['known'], rival: ['pull'] };
    const mineW = ws.filter((w) => KIND[info.why].includes(w.kind)).sort((a, b) => b.units - a.units)[0];
    if (big) {
      const u = B.sellBigUp(ctx, st, big);
      const k = key(t(`いちばんの改善案：${u.label}`, `Best fix: ${u.label}`), () => runUp(u, box), { cls: `uxb-bd-big${u.short ? ' is-short' : ''}`, strong: true, attrs: { 'data-kind': big.kind } });
      put(box, k, el('span.uxb-gain', bIcon('up', { color: '#36e08b', scale: 1 }), u.sub));
    } else put(box, key(why.act[0], why.act[1], { ico: 'next' }));
    if (mineW && !(big && big.kind === mineW.kind)) {
      const u = B.whatIfUp(ctx, st, mineW);
      box.append(dim(t(`頭打ちの理由の手「${u.label}」は ${B.gainText(mineW)}${mineW.kind === 'shop' ? `・毎月 ${B.money(B.shopMonthly())} かかる` : ''}`, `The reason’s own move, ${u.label}: ${B.gainText(mineW)}${mineW.kind === 'shop' ? `, plus ${B.money(B.shopMonthly())}/mo` : ''}`)));
    }
    // 打ち手ごとの見込み（効き目の大きい順に 3 つ。残りは折りたたみ）
    const row = (w: WhatIf, k: number | null) => {
      const u = B.whatIfUp(ctx, st, w);
      return uxpCard({ pic: el('span.uxb-up-n', k != null ? num(k + 1) : '–'), name: u.label, desc: u.sub, foot: el(`span.uxb-gain${w.ok ? '' : '.is-off'}`, w.ok ? bIcon('up', { color: '#36e08b', scale: 1 }) : null, B.gainText(w)), onTap: () => u.go(), off: !w.ok, cls: 'uxb-up' });
    };
    put(box, uxpHead(t('打ち手ごとの見込み', 'What each move would add'), { ico: 'up' }), el('div.uxp-list', okW.slice(0, 3).map((w, k) => row(w, k))));
    if (!okW.length) box.append(dim(t(`いまの候補では、どれも +${B.unitsX(2)} 個／月に届きません。まずは月が進むのを待つか、下の一覧で商品とお店を見直しましょう。`, `No move adds ${B.unitsX(2)}+ / mo right now. Check the items and shops below.`)));
    const off = [...okW.slice(3), ...ws.filter((w) => !w.ok)];
    if (off.length) box.append(fold(t(`ほかの手（いまはあまり効かない ${off.length}）`, `Other moves (little effect now: ${off.length})`), (b2) => b2.append(el('div.uxp-list', off.map((w) => row(w, null))))).el);
    // 商品ごと（押すと、取れていない理由）
    put(box, uxpHead(t('商品ごと（並べている商品）', 'By item (on your shelves)'), { ico: 'list' }));
    for (const g of info.goods) {
      const reason = el('p.uxb-why', { hidden: true }, bIcon('info', { scale: 1 }), el('span', B.goodsReason(st, g)));
      const card = uxpCard({
        pic: skuPic(g.x, 32),
        name: B.PRODUCT[g.key]?.name ?? g.key,
        tags: uxTape(B.GOODS_WHY[g.why], g.why === 'ok' ? 'good' : 'amber'),
        desc: [
          uxpRow(t('エリアの需要／月', 'Area demand / mo'), t(`${Math.round(g.demand)} 個`, `${Math.round(g.demand)}`)),
          uxpRow(t('自社の取り分', 'Your share'), pct(g.share), { tone: g.share < 0.3 ? 'bad' : 'good', note: g.share < 0.3 ? t('30% 未満', 'under 30%') : undefined }),
          uxpRow(t('他社', 'Rivals'), g.sellers ? (g.saturated ? t(`${g.sellers} 社（飽和）`, `${g.sellers} (saturated)`) : t(`${g.sellers} 社`, `${g.sellers}`)) : t('なし', 'None'), { tone: g.saturated ? 'bad' : '' }),
          uxpRow(t('認知', 'Known'), pct(g.known), { tone: g.known < 0.7 ? 'amber' : '' }),
          uxpRow(t('いま売れる見込み／月', 'Expected now / mo'), t(`${Math.round(g.units)} 個`, `${Math.round(g.units)}`), { tone: 'amber' }),
          reason,
        ],
        onTap: () => {
          reason.hidden = !reason.hidden;
          uxSfx('toggle', { step: reason.hidden ? 0 : 1 });
        },
        cls: 'uxb-goods',
      });
      box.append(card);
    }
    box.append(dim(t('札を押すと、その商品が取れていない理由。取り分 30% 未満は赤と「30% 未満」。', 'Tap a card for why. Shares under 30% are red and marked.')));
    // お店ごと（押すと、そのお店の札）
    put(box, uxpHead(t('お店ごと', 'By shop'), { ico: 'shop' }));
    for (const r of info.shops)
      box.append(
        uxpCard({
          pic: bIcon('shop', { scale: 2, color: '#97a1cf' }),
          name: B.shopLabel(st, r.b),
          tags: el('span.uxb-chips', r.goods.map((x) => skuPic(x, 24))),
          desc: [
            uxpRow(t('商圏の家（届く需要の割合）', 'Homes in reach (share of demand)'), t(`${r.homes} 軒（${pct(r.reach)}）`, `${r.homes} (${pct(r.reach)})`)),
            uxpRow(t('自社の重なり', 'Overlap with own shops'), pct(r.overlap), { tone: r.overlap >= 0.5 ? 'bad' : '', note: r.overlap >= 0.5 ? t('2 軒目の意味が薄い', 'Little gain from this shop') : undefined }),
            uxpRow(t('他社の近さ', 'Nearest rival'), r.rivalDist == null ? t('なし', 'None') : r.rivals ? t(`近くに ${r.rivals} 社（${r.rivalDist} マス）`, `${r.rivals} nearby (${r.rivalDist} tiles)`) : t(`${r.rivalDist} マス先`, `${r.rivalDist} tiles away`), { tone: r.rivals ? 'amber' : '' }),
          ],
          onTap: () => B.openShop(ctx, r.b.uid),
          cls: 'uxb-goods',
        }),
      );
    box.append(dim(t('家ごとに、自社は「いちばん来やすいお店 1 軒」ぶんしか売れません。重なりが大きいお店どうしは、同じお客さんを取り合っています。', 'Each home buys from only your single most convenient shop. Shops with big overlap split the same customers.')));
  }
  function showBreakdown() {
    wantBreakdown = true;
    tabs.set('sell', true);
    panes.sell.sync();
    bdFold?.open();
  }

  const tabs = uxpTabs<Stage>(
    STAGES.map((k) => ({ key: k, label: B.STAGE[k].name, pane: panes[k].el, onShow: () => panes[k].sync() })),
    { flow: true, cls: 'uxb-stage-tabs', initial: B.scmJam(s()), onChange: (k) => markCols(k) },
  );
  const markCols = (now: Stage) => {
    for (const k of STAGES) cols[k].key.setAttribute('aria-pressed', String(k === now));
  };

  // ---- 数字の見方・月ごとの流れ
  const how = fold(
    t('数字の見方', 'How to read the numbers'),
    (box) => {
      const p = (ja: string, en: string) => el('p.uxb-how', t(ja, en));
      box.append(
        p('4 つの段を商品が流れます。数字は、その段がひと月に流せる商品の数です。数字は大きいほどよく、いちばん小さい段が詰まり（赤いランプと「詰まり」の札）。詰まりの段より多くは売れないので、そこを太くするのが近道。全部をそろえる必要はなく、詰まりを順に直していきましょう。', 'Goods flow through four stages. Each number is how many products that stage can move per month. Bigger is better; the smallest stage is the jam (red lamp and the Jam tag). You can’t sell more than the jam allows, so widen it first. No need to even out everything — fix the jams one by one.'),
        p('④ 販売は「並べている商品の需要のうち自社が取れる数」（とお店の品出しの速さの小さいほう）。棚やお店を増やしただけでは増えず、別の商品・遠い家の近くの 2 軒目・売り場の強さ・認知で増えます。', '④ Sell is how much of your items’ demand you can take (or how fast shops shelve, whichever is smaller). More shelves or shops alone won’t raise it; another item, a 2nd shop near far homes, stronger shops, or awareness will.'),
      );
    },
    { ico: 'info', open: typeof innerWidth === 'number' && innerWidth >= 600 },
  );
  let histAt = -1;
  const hist = block(
    'div.uxb-list.uxb-hist',
    () => sigOf(B.flowHist(s().reports), histAt),
    (host) => {
      const fh = B.flowHist(s().reports);
      if (fh.length < 2) return;
      if (histAt < 0 || histAt >= fh.length) histAt = fh.length - 1;
      const cur = fh[histAt];
      const keys = ['bought', 'made', 'hauled', 'sold'] as const;
      const nm = { bought: B.STAGE.buy.name, made: B.STAGE.craft.name, hauled: B.STAGE.haul.name, sold: B.STAGE.sell.name };
      const low = keys.reduce((a, k) => (cur[k] < cur[a] ? k : a), 'bought' as (typeof keys)[number]);
      const max = Math.max(1, ...fh.flatMap((x) => keys.map((k) => x[k])));
      const move = (d: number) =>
        uxKey(el('span.ux-vh', d < 0 ? t('前の月', 'Earlier month') : t('次の月', 'Later month')), () => ((histAt = Math.max(0, Math.min(fh.length - 1, histAt + d))), uxSfx('page', { step: 3 }), hist.sync()), { ico: d < 0 ? 'next' : 'next', cls: `uxb-hist-key${d < 0 ? ' is-prev' : ''}`, disabled: d < 0 ? histAt <= 0 : histAt >= fh.length - 1, attrs: { 'aria-label': d < 0 ? t('前の月', 'Earlier month') : t('次の月', 'Later month'), 'data-ux-quiet': '' } });
      put(
        host,
        uxpHead(t('月ごとの流れ（実績の数）', 'Monthly flow (actual units)'), { ico: 'bars' }),
        el('div.uxb-hist-nav', move(-1), el('b.uxb-hist-month', B.monLab(cur.month)), move(1)),
        uxpBars(keys.map((k) => ({ label: nm[k], value: cur[k], kind: k === low ? 'bad' : k === 'sold' ? 'main' : '', text: B.fmt(cur[k]) })), { max, height: 148 }).el,
        dim(t(`この月いちばん少なかったのは${nm[low]}（${cur[low]} 個）`, `Lowest this month: ${nm[low]} (${cur[low]})`)),
      );
    },
  );

  const e = root('uxb-scm', tipBox, board, jamBox.el, kpi.el, nextLine.el, tabs.el, how.el, hist.el);
  // 今の目印（SCM の中の決まり：p1.css の .is-scm）は付けない。新しい画面は 16px から
  let grown = false;

  function sync() {
    const st = s();
    tipBox.replaceChildren();
    B.mineTip(ctx, 'scm', tipBox);
    const caps = B.stageCaps(st);
    const is = B.scmIssues(ctx, st, caps);
    const bn = B.scmJam(st);
    const max = Math.max(1, ...STAGES.map((k) => caps[k].perMonth));
    const dots = beltDots(caps);
    for (const k of STAGES) {
      const c = cols[k];
      const look = lampLook(is[k].lamp);
      c.lamp.className = `ux-lamp${look.kind ? ' ux-lamp--' + look.kind : ''} is-on${look.blink ? ' is-blink' : ''}`;
      setText(c.word, B.LAMP_NAME[is[k].lamp]);
      c.word.className = `uxb-flow-word is-${is[k].lamp}`;
      c.key.classList.toggle('is-bn', k === bn);
      c.key.classList.toggle('is-stop', caps[k].stopped);
      c.jam.hidden = k !== bn;
      c.bar.style.transform = `scaleY(${grown || isCalm() ? barRatio(caps[k].perMonth, caps[k].stopped, max) : 0})`;
      c.bar.dataset.to = String(barRatio(caps[k].perMonth, caps[k].stopped, max));
      c.odo.el.hidden = caps[k].stopped;
      c.stop.hidden = !caps[k].stopped;
      if (!caps[k].stopped) c.odo.set(caps[k].perMonth, { dur: grown ? 500 : 900, onTick: () => uxSfx('tick') });
      c.key.setAttribute('aria-label', `${B.STAGE[k].n} ${B.STAGE[k].name}: ${B.LAMP_NAME[is[k].lamp]}, ${caps[k].stopped ? t('止まっている', 'Stopped') : t(`ひと月 ${caps[k].perMonth} 個`, `${caps[k].perMonth} per month`)}${k === bn ? t('・詰まり', ', jam') : ''}`);
      // ベルト：点の数が変わったときだけ作り直す（流れを切らない）
      if (c.dots !== dots[k]) {
        c.dots = dots[k];
        c.seg.replaceChildren(...Array.from({ length: dots[k] }, (_x, i) => el('i.uxb-dot', { style: { animationDelay: `${-Math.round((i / Math.max(1, dots[k])) * 2400)}ms` } }, el('b'))));
      }
      c.seg.classList.toggle('is-bn', k === bn);
      c.seg.classList.toggle('is-stop', dots[k] === 0);
    }
    if (!grown) {
      grown = true;
      // 開いたとき：棒が下から 8 段で伸び、ランプが順に点く音
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          STAGES.forEach((k, i) => {
            cols[k].bar.style.transform = `scaleY(${cols[k].bar.dataset.to})`;
            if (!isCalm()) setTimeout(() => e.isConnected && uxSfx('lamp', { step: i }), 120 * i);
          });
        }),
      );
    }
    markCols(tabs.now);
    stamp++;
    for (const b of [jamBox, kpi, nextLine, hist]) b.sync();
    panes[tabs.now].sync();
  }

  return {
    el: e,
    sync,
    mount(body: HTMLElement) {
      body.append(e);
      sync();
    },
    breakdown: showBreakdown,
  };
}
