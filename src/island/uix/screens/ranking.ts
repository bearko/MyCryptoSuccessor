/**
 * 段 UIX3k：企業ランキング（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：企業ランキング」）。
 * 出す数字・並び・決まりは今の画面（p1/screens.ts の openRanking）と同じ（p1/uxk.ts の rankingView が、今の画面と同じ計算で作る）。
 * - 上：順位の札（上の帯の札と同じ言葉・同じ色：「エリア」「N 位」・1 位は琥珀）。順位が動いた月は、先月の順位から札がめくれる
 * - 月の売上は桁の回るカウンター。次の順位までの差は「あと N G」と目盛り（1 位のときは 2 位との差）
 * - タブ（エリア・ランド・世界。520ms の横送り）。順位は横の棒（わが社は琥珀の面）。1 位と 2 位のあいだにゴールの線
 * - 自社の順位の推移は縦の棒（上位ほど高い・1 位は琥珀）
 * 器は今の札（open()）。まとめた画面（企業ランキング＋広報）の中に入っても、そのまま出る（渡された箱に組む）。
 */
import { isEn, t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxLamp, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpGap, uxpHead, uxpRank, uxpRow, uxpStat, uxpTabs } from '../sparts';
import { K } from './k-deps';
import { kIcon } from './k-icons';
import './k-screens.css';
import type { RankRowView, RankingView } from '../../p1/uxk';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
export type RankTab = 'area' | 'land' | 'world';
/** 順位の動き（先月の報告 → 今月の報告）。まだ報告が無い月は「見込み」 */
export type RankMove = 'up' | 'down' | 'keep' | 'new' | 'est';
export function rankMove(rank: number | null, prev: number | null): RankMove {
  if (rank == null) return 'est';
  if (prev == null) return 'new';
  return rank < prev ? 'up' : rank > prev ? 'down' : 'keep';
}
/** 動きの言葉（色だけに頼らない：言葉と ▲▼ の絵を添える） */
export function moveWord(m: RankMove, prev: number | null): string {
  switch (m) {
    case 'up':
      return t(`先月 ${prev} 位 → ランクアップ`, `Up from #${prev}`);
    case 'down':
      return t(`先月 ${prev} 位 → ランクダウン`, `Down from #${prev}`);
    case 'keep':
      return t(`先月も ${prev} 位：キープ`, `Held #${prev}`);
    case 'new':
      return t('初登場', 'First ranking');
    default:
      return t('今月のここまでの見込み', 'Estimate so far this month');
  }
}
/** 横の棒の長さ（いちばん売っている会社を 1 とする。0 でも少しは出す） */
export const rankRatio = (sales: number, top: number) => Math.max(0.02, Math.min(1, sales / Math.max(1, top)));
/** 順位の推移の棒の高さ（上位ほど高い：of 社のうち rank 位 → of − rank ＋ 1） */
export const histHeight = (rank: number, of: number) => Math.max(1, of - rank + 1);

// ---------------------------------------------------------------- 画面の外に覚えておくこと
/** 開いているタブ（描き直しても同じタブ） */
let tabNow: RankTab = 'area';
/** 札のめくりを見せた月（月ごとに 1 回だけ） */
let flippedMonth = -1;
/** 開く動き（行が打たれる・棒が伸びる）を見せた札（同じ札の描き直しでは、すぐ出す） */
const seenSheets = new WeakSet<Element>();
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
/** 見出しの貼り札（絵はこの束の絵：土台の uxpHead の ico は土台の絵の名前しか描けないため） */
const sect = (title: string, ico: string, o: { dark?: boolean; note?: string } = {}) =>
  uxpHead([kIcon(ico, o.dark ? { scale: 1 } : { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 }), el('b', title)], { kind: o.dark ? 'dark' : 'amber', note: o.note || undefined });
const me = () => t('あなたの会社', 'Your company');

/** 企業ランキングを開く（p1/screens.ts の openRanking から） */
export function openRankingUx(ctx: Ctx, tab: RankTab) {
  tabNow = tab;
  K.open(ctx, t('企業ランキング（月の売上）', 'Company ranking (monthly sales)'), (body) => render(ctx, body));
}

function rows(list: RankRowView[], o: { goal?: boolean; start?: number } = {}): { el: HTMLElement; bars: HTMLElement[] } {
  const top = Math.max(1, ...list.map((r) => r.sales));
  const box = el('div.uxp-ranks.uxk-ranks', { role: 'list' });
  const bars: HTMLElement[] = [];
  list.forEach((r, k) => {
    // 行には短い札（あと何か月は、上の知らせの札に。読み上げには全部）
    const tag = r.tag ? el('span.uxk-rk-tag', { title: r.tag.label, 'aria-label': r.tag.label }, uxLamp('bad', true, true), el('span', { 'aria-hidden': 'true' }, r.tag.short)) : null;
    const row = uxpRank({ n: (o.start ?? 1) + k, name: r.me ? me() : r.name, value: K.money(r.sales), ratio: rankRatio(r.sales, top), me: r.me, note: tag });
    row.setAttribute('role', 'listitem');
    row.style.setProperty('--i', String(k));
    const bar = row.querySelector<HTMLElement>('.uxp-rank-bar > i');
    if (bar) bars.push(bar);
    box.append(row);
    // 1 位と 2 位のあいだにゴールの線（ここで 1 位になるのが目標）
    if (o.goal && k === 0 && list.length > 1) box.append(el('div.uxk-rk-goal', { 'aria-hidden': 'true' }, el('i'), uxTape([kIcon('flag', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 }), el('b', t('ゴール：1 位', 'Goal: #1'))], 'amber'), el('i')));
  });
  return { el: box, bars };
}
/** 棒を 0 から伸ばす（土台の棒は transform の切り替えで 8 段に伸びる） */
function grow(bars: HTMLElement[], delay = 0) {
  if (isCalm()) return;
  const to = bars.map((b) => b.style.transform);
  bars.forEach((b) => {
    b.style.transition = 'none';
    b.style.transform = 'scaleX(0)';
  });
  later(delay, () =>
    requestAnimationFrame(() =>
      bars.forEach((b, i) => {
        b.style.transition = '';
        b.style.transitionDelay = `${i * 60}ms`;
        b.style.transform = to[i];
      }),
    ),
  );
}

function render(ctx: Ctx, body: HTMLElement) {
  const s = ctx.s();
  const v: RankingView = K.rankingView(s);
  const sheet = body.closest('.isl-sheet') ?? body;
  const first = !seenSheets.has(sheet);
  seenSheets.add(sheet);
  const root = el('div.uxk-rk.uxk-calm');
  // マインちゃんの一言・✕ の強調（チュートリアル）：今の画面と同じく、札の中身のはじめに
  K.mineTip(ctx, 'ranking', body);

  // ---- 順位の札（上の帯の札と同じ言葉・同じ色）
  const rankNow = v.rank ?? (v.me >= 0 ? v.me + 1 : null);
  const move = rankMove(v.rank, v.prevRank);
  const flip = first && !isCalm() && (move === 'up' || move === 'down') && flippedMonth !== v.month;
  const num = el('span.uxk-rk-num.ux-num', rankNow == null ? '--' : String(flip ? v.prevRank : rankNow));
  const unit = el('span.uxk-rk-unit', t('位', '#'));
  // 上の帯の札と同じ：月次報告の順位が無いあいだは「--」（灰色）。見込みの順位は、下の一言と一覧に
  const shown = v.rank;
  if (shown == null) num.textContent = '--';
  const plate = el(`div.uxk-rk-plate${shown === 1 && !flip ? '.is-top' : ''}${shown == null ? '.is-none' : ''}`, uxTape(t('エリア', 'Area')), el('span.uxk-rk-win', isEn ? unit : null, num, isEn ? null : unit));
  plate.setAttribute('role', 'img');
  plate.setAttribute('aria-label', shown == null ? t('エリアの順位：まだありません', 'Area rank: none yet') : t(`エリア ${shown} 位`, `Area #${shown}`));
  const moveIco = move === 'up' ? kIcon('up', { color: '#36e08b', scale: 1 }) : move === 'down' ? kIcon('down', { color: '#ff5964', scale: 1 }) : null;
  const moveEl = el(`div.uxk-rk-move.is-${move}`, moveIco, el('span', move === 'est' && rankNow != null ? t(`今月のここまでの見込み：${rankNow} 位`, `So far this month: #${rankNow}`) : moveWord(move, v.prevRank)));
  if (flip) {
    flippedMonth = v.month;
    moveEl.classList.add('is-wait');
    later(520, () => {
      if (!num.isConnected) return;
      num.classList.add('is-flip');
      uxSfx('flap');
      later(140, () => {
        num.textContent = String(rankNow);
        plate.classList.toggle('is-top', rankNow === 1);
        moveEl.classList.remove('is-wait');
        moveEl.classList.add('is-shown');
        if (move === 'up') uxSfx('rankup');
      });
    });
  } else if (v.rank != null) flippedMonth = v.month;

  // ---- 月の売上と、次の順位までの差
  const sales = uxpStat(t('月の売上', 'Monthly sales'), v.mine, { key: 'uxk.rank.sales', unit: 'G', digits: Math.max(6, String(Math.round(v.mine)).length), size: 's' });
  let gapEl: HTMLElement | null = null;
  if (v.gap?.kind === 'next') {
    const g = uxpGap(v.mine, v.gap.top, { hint: t(`次の順位（${v.gap.n} 位）まで`, `to reach #${v.gap.n}`) });
    g.el.classList.add('uxk-rk-gap');
    gapEl = g.el;
    if (first) later(700, () => g.el.isConnected && !isCalm() && g.meter.flash());
  } else if (v.gap) gapEl = uxpRow(t('2 位との差', 'Ahead of #2'), `+${K.money(v.gap.amount)}`, { tone: 'good', ico: 'crown' });
  const head = el('div.uxk-rk-head', el('div.uxk-rk-left', plate, moveEl), el('div.uxk-rk-right', sales.el, gapEl));

  // ---- 反撃・セール（エリアの知らせ）
  const alerts = el('div.uxk-rk-alerts');
  if (v.rally) alerts.append(el('div.uxk-rk-alert', uxLamp('bad', true, true), uxTape(t(`反撃中（あと ${v.rally.left} か月）`, `Fighting back (${v.rally.left} mo left)`), 'dark'), el('span', t(`あなたが 1 位を取ったので、他社が宣伝を始めた。他社の売り場の強さ ×${v.rally.mul}`, `You took #1, so rivals started advertising. Rival pull ×${v.rally.mul}`))));
  if (v.sale) {
    const how = v.sale.pull != null ? t(`店の引き ×${v.sale.pull.toFixed(2)}（月ごとに弱まる）`, `store pull ×${v.sale.pull.toFixed(2)} (fading each month)`) : t(`売上 +${K.money(v.sale.bonus)}／月（月ごとに弱まる）`, `sales +${K.money(v.sale.bonus)}/mo (fading each month)`);
    alerts.append(el('div.uxk-rk-alert', uxLamp('bad', true, true), uxTape(t(`セール中（あと ${v.sale.left} か月）`, `On sale (${v.sale.left} mo left)`), 'dark'), el('span', t(`あなたが 1 位を取ったので、${v.sale.name}がセールで巻き返してきた。${how}`, `You took #1, so ${v.sale.name} is fighting back with a sale: ${how}`))));
  }

  // ---- タブ（エリア・ランド・世界）
  const allBars = new Map<RankTab, HTMLElement[]>();
  const tabs = uxpTabs<RankTab>(
    [
      {
        key: 'area',
        label: t('エリア', 'Area'),
        ico: 'shop',
        build: (pane) => {
          const r = rows(v.area, { goal: true });
          allBars.set('area', r.bars);
          pane.append(sect(t('エリアの月の売上', 'Area monthly sales'), 'crown', { note: rankNow != null ? t(`自社は ${rankNow} 位`, `You are #${rankNow}`) : '' }), alerts.childElementCount ? alerts : null!, r.el);
          if (v.hist.length >= 2) {
            const of = Math.max(...v.hist.map((x) => x.of));
            const bars = uxpBars(
              v.hist.map((x) => ({ label: x.label, value: histHeight(x.rank, of), text: t(`${x.rank}位`, `#${x.rank}`), kind: x.rank === 1 ? ('main' as const) : ('' as const) })),
              { max: of, height: 150, cls: 'uxk-rk-hist' },
            );
            bars.el.setAttribute('aria-label', t(`自社の順位の推移：いま ${v.hist[v.hist.length - 1].rank} 位`, `Your rank: now #${v.hist[v.hist.length - 1].rank}`));
            pane.append(sect(t('自社の順位の推移', 'Your rank by month'), 'chart', { dark: true, note: t('棒が高いほど上位・琥珀が 1 位（ゴール）', 'Taller is better · amber is #1 (the goal)') }), bars.el);
          }
          pane.append(el('p.uxk-note', t('同じエリアで物販をしている同業他社です。ここで 2 か月続けて 1 位になる（制覇）のが目標です。', 'Retail rivals in your area. The goal: #1 here two months in a row (conquer the sector).')));
        },
      },
      {
        key: 'land',
        label: t('ランド', 'Land'),
        ico: 'flag',
        build: (pane) => {
          const r = rows(v.land);
          allBars.set('land', r.bars);
          pane.append(sect(t('ランドの月の売上', 'Land monthly sales'), 'compass'), r.el);
        },
        onShow: () => first && grow(allBars.get('land') ?? [], 120),
      },
      {
        key: 'world',
        label: t('世界', 'World'),
        ico: 'star4',
        build: (pane) => {
          const top = v.world[0]?.sales ?? 1;
          const box = el('div.uxp-ranks.uxk-ranks', { role: 'list' });
          const bars: HTMLElement[] = [];
          for (const w of v.world) {
            const row = uxpRank({ n: w.n, name: w.name, value: K.money(w.sales), ratio: rankRatio(w.sales, top) });
            const bar = row.querySelector<HTMLElement>('.uxp-rank-bar > i');
            if (bar) bars.push(bar);
            box.append(row);
          }
          const mine = uxpRank({ n: v.worldMe, name: me(), value: K.money(v.mine), ratio: rankRatio(v.mine, top), me: true, note: t('見込みの順位', 'Estimated rank') });
          mine.classList.add('uxk-rk-far');
          mine.querySelector('.uxp-rank-n')!.textContent = fmt(v.worldMe);
          box.append(el('div.uxk-rk-dots', { 'aria-hidden': 'true' }, el('i'), el('i'), el('i')), mine);
          allBars.set('world', bars);
          pane.append(sect(t('世界の月の売上', 'World monthly sales'), 'globe'), box);
        },
        onShow: () => first && grow(allBars.get('world') ?? [], 120),
      },
    ],
    { initial: tabNow, flow: true, onChange: (k) => (tabNow = k) },
  );
  root.append(head, tabs.el);
  body.append(root);
  // 開いたとき：行が上から順に打たれ（1 行ごとに小さな音）、棒が伸びる。同じ札の描き直し（日ごと・押したあと）では、すぐ出す
  if (first && !isCalm()) {
    const n = (allBars.get(tabNow) ?? []).length;
    root.classList.add('is-in');
    for (let i = 0; i < n; i++) later(i * 60, () => root.isConnected && uxSfx('tick'));
    grow(allBars.get(tabNow) ?? [], 200);
    later(n * 60 + 900, () => root.classList.remove('is-in'));
  }
}
