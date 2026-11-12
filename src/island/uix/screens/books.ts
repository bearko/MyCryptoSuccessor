/**
 * 段 UIX3k：決算書（四半期の P/L・B/S。方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：決算書」）。
 * 出す中身・計算・並びは今の画面（p1/landui.ts の openBooks・plTable・bsTable、p1/acctui.ts の costCard）と同じ（p1/uxk.ts の booksView）。
 * - 四半期を選ぶキーの列（うしろの 8 つ。選んだキーはランプが点いて沈む）
 * - 数字の札：売上高・当期の利益・資産の合計（桁が回る。四半期を替えると、前の四半期の値から回る）
 * - P/L：紙のページに印字（行が上から打たれる・数字は右そろえ・小計と合計は罫）＋ 差し引きの縦の棒（引くものは斜線）
 * - B/S：紙のページに印字 ＋ 資産の中身の縦の棒
 * - 四半期ごとの売上高・当期の利益（縦の棒）・コストの大きい順（順位の横の棒）・法人税の行・経理からの助言（紙きれ）
 * 器は今の札（open()。keep：四半期を替えても札は作り直さず、紙を送って打ち直す）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxKey, uxLamp } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpHead, uxpPaper, uxpPrint, uxpRank, uxpRow, uxpShort, uxpStat, type BarDef } from '../sparts';
import { K } from './k-deps';
import { kIcon, noEmoji } from './k-icons';
import './k-screens.css';
import type { BookRow, BooksView } from '../../p1/uxk';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** P/L の差し引きを縦の棒に：はじめ（売上高）・足す・引く（斜線）・途中の合計。最後の当期の利益は琥珀 */
export function fallBars(fall: BooksView['fall']): BarDef[] {
  return fall.map((x, i) => {
    const last = i === fall.length - 1;
    const v = x.kind === 'total' || x.kind === 'start' ? x.to : x.v;
    const kind: BarDef['kind'] = last ? 'main' : x.kind === 'down' ? 'bad' : x.kind === 'up' ? 'good' : '';
    const text = x.kind === 'up' ? `+${uxpShort(x.v)}` : x.kind === 'down' ? `−${uxpShort(-x.v)}` : uxpShort(v);
    return { label: x.name, value: v, kind, text };
  });
}
/** 行の金額（今の画面と同じ money()。引くものは赤と「-」：色だけにしない） */
export const rowTone = (r: Pick<BookRow, 'v'>) => (r.v < 0 ? ('bad' as const) : ('' as const));

// ---------------------------------------------------------------- 画面
/** 選んでいる四半期（今の画面と同じく、札を閉じても覚えている） */
let qSel: number | null = null;
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
const sect = (title: string, ico: string, o: { dark?: boolean; note?: string } = {}) =>
  uxpHead([kIcon(ico, o.dark ? { scale: 1 } : ink), el('b', title)], { kind: o.dark ? 'dark' : 'amber', note: o.note || undefined });

/** 決算書を開く（p1/landui.ts の openBooks から） */
export function openBooksUx(ctx: Ctx) {
  K.open(ctx, t('決算書', 'Financial statements'), (body) => render(ctx, body), undefined, true);
}

const built = new WeakMap<HTMLElement, { draw: (anim: boolean) => void }>();
function render(ctx: Ctx, body: HTMLElement) {
  const cur = built.get(body);
  if (cur) return cur.draw(false);
  const root = el('div.uxk-bk.uxk-calm');
  const chips = el('div.uxk-bk-chips', { role: 'group', 'aria-label': t('四半期を選ぶ', 'Pick a quarter') });
  const statsBox = el('div.uxp-stats.uxk-bk-stats');
  const page = el('div.uxk-bk-page');
  root.append(el('p.uxk-note', t('会社ぜんたいの決算書（簡易版）。会社の月はゲームの最初から 30 日ごとに締め、3 か月で 1 四半期です。ほかのセクタの利益は「他セクタからの利益」に入ります。', 'Company-wide statements (simplified). Company months close every 30 days from the start; 3 months make a quarter. Profit from managed sectors is listed separately.')), chips, statsBox, page);
  body.append(root);
  let shownQ: number | null = null;

  function draw(anim: boolean) {
    if (!root.isConnected) return;
    const v = K.booksView(ctx.s(), qSel);
    qSel = v.q;
    const turned = shownQ != null && shownQ !== v.q;
    const first = shownQ == null;
    shownQ = v.q;
    const motion = anim && !isCalm();

    // ---- 四半期のキー
    chips.replaceChildren(
      ...v.chips.map((c) => {
        const on = c.q === v.q;
        const k = uxKey(el('span.uxk-bk-chip', uxLamp(c.done ? 'good' : '', on), el('b', c.label)), () => {
          if (qSel === c.q) return;
          qSel = c.q;
          uxSfx('page', { step: 5 });
          draw(true);
        }, { cls: `uxk-bk-q${on ? ' is-on' : ''}`, attrs: { 'aria-pressed': String(on), 'data-ux-quiet': '' } });
        return k;
      }),
    );
    // ---- 数字の札（四半期を替えると、前の値から回る）
    const net = v.p.net;
    statsBox.replaceChildren(
      uxpStat(t('売上高', 'Sales'), Math.max(0, v.p.sales), { key: 'uxk.bk.sales', unit: 'G', size: 's', tone: 'amber' }).el,
      uxpStat(net < 0 ? t('当期の利益（赤字）', 'Net profit (loss)') : t('当期の利益', 'Net profit'), Math.abs(net), { key: 'uxk.bk.net', unit: 'G', size: 's', tone: net < 0 ? 'bad' : 'good', note: v.p.sales > 0 ? t(`売上高の ${Math.round((net / v.p.sales) * 100)}% が当期の利益`, `Net margin ${Math.round((net / v.p.sales) * 100)}%`) : undefined }).el,
      uxpStat(t('資産の合計', 'Total assets'), Math.max(0, v.bs[0].v), { key: 'uxk.bk.assets', unit: 'G', size: 's' }).el,
    );

    // ---- P/L（紙に印字 ＋ 差し引きの縦の棒）
    const plLines = v.pl.map((r) => line(r));
    const plPaper = uxpPaper(el('div.uxk-bk-ttl', kIcon('sheet', ink), el('b', t('損益計算書（P/L）', 'Income statement (P/L)')), el('span', v.label)), el('div.uxk-bk-rows', plLines));
    const fall = uxpBars(fallBars(v.fall), { height: 168, cls: 'uxk-bk-fall', auto: !motion });
    // 列が多いときは、1 列の幅を保って横に送る（字を重ねない）
    const wide = (e: HTMLElement, n: number) => (e.style.minWidth = `${n * 72}px`);
    wide(fall.el, v.fall.length);
    fall.el.setAttribute('aria-label', t(`売上高 ${K.money(v.p.sales)}・当期の利益 ${K.money(v.p.net)}`, `Sales ${K.money(v.p.sales)}, net ${K.money(v.p.net)}`));
    // ---- B/S（紙に印字 ＋ 資産の中身の縦の棒）
    const bsLines = v.bs.map((r) => line(r));
    const bsPaper = uxpPaper(el('div.uxk-bk-ttl', kIcon('scales', ink), el('b', t('貸借対照表（B/S）', 'Balance sheet (B/S)'))), el('div.uxk-bk-rows', bsLines), el('p.uxk-bk-fine', t('建物は買った値段のまま（減価償却なし）。借入はまだありません。', 'Buildings at cost (no depreciation). No loans yet.')));
    const big = v.parts.slice().sort((a, b) => b.v - a.v)[0];
    const assets = uxpBars(
      v.parts.map((x) => ({ label: x.name, value: x.v, kind: x === big ? ('main' as const) : ('' as const) })),
      { height: 140, cls: 'uxk-bk-assets', auto: !motion },
    );
    assets.el.setAttribute('aria-label', t(`資産の合計 ${K.money(v.bs[0].v)}`, `Total assets ${K.money(v.bs[0].v)}`));

    const kids: HTMLElement[] = [
      el('section.uxk-bk-sec', sect(t(`P/L：売上高から当期の利益まで（${v.label}）`, `P/L: sales to net profit (${v.label})`), 'chart'), el('div.uxk-bk-pair', plPaper, el('div.uxk-bk-graph', fall.el))),
      el('section.uxk-bk-sec', sect(t('B/S：資産の中身', 'B/S: what you own'), 'scales', { note: big ? t(`いちばん大きいのは${big.name}・借入なし`, `Largest: ${big.name} · no loans`) : '' }), el('div.uxk-bk-pair', bsPaper, el('div.uxk-bk-graph', assets.el))),
    ];
    // ---- 四半期ごとの推移
    const motionBars: { grow: () => void }[] = [fall, assets];
    if (v.trend.length >= 2) {
      const lab = (x: BooksView['trend'][number]) => (x.done ? `Q${x.q}` : t(`Q${x.q} 途中`, `Q${x.q}…`));
      const sales = uxpBars(v.trend.map((x) => ({ label: lab(x), value: x.sales, kind: x.q === v.q ? ('main' as const) : x.done ? ('' as const) : ('dash' as const) })), { height: 132, cls: 'uxk-bk-trend', auto: !motion });
      const nets = uxpBars(v.trend.map((x) => ({ label: lab(x), value: x.net, kind: x.q === v.q ? ('main' as const) : x.done ? ('good' as const) : ('dash' as const) })), { height: 132, cls: 'uxk-bk-trend', auto: !motion });
      wide(sales.el, v.trend.length);
      wide(nets.el, v.trend.length);
      sales.el.setAttribute('aria-label', `${t('売上高', 'Sales')}: ${v.trend.map((x) => `${lab(x)} ${K.money(x.sales)}`).join(' / ')}`);
      nets.el.setAttribute('aria-label', `${t('当期の利益', 'Net profit')}: ${v.trend.map((x) => `${lab(x)} ${K.money(x.net)}`).join(' / ')}`);
      motionBars.push(sales, nets);
      kids.push(el('section.uxk-bk-sec', sect(t('四半期ごとの売上高と当期の利益', 'Sales and net profit by quarter'), 'bars', { dark: true, note: t('最後の四半期は途中まで', 'The last quarter is still in progress') }), el('div.uxk-bk-two', el('div.uxk-bk-graph', el('b.uxk-bk-sub', t('売上高', 'Sales')), sales.el), el('div.uxk-bk-graph', el('b.uxk-bk-sub', t('当期の利益', 'Net profit')), nets.el))));
    }
    // ---- 経理：コストの大きい順・法人税・経理からの助言（今の costCard と同じ中身）
    const top = v.costs[0]?.v || 1;
    const cost = el('section.uxk-bk-sec', { 'data-focus': 'cost-rank' }, sect(t(`コストの大きい順（${v.label}）`, `Costs, largest first (${v.label})`), 'receipt', { dark: true }));
    if (!v.costs.length) cost.append(el('p.uxk-note', t('まだコストがありません。', 'No costs yet.')));
    else cost.append(el('div.uxp-ranks.uxk-bk-costs', v.costs.map((r, i) => uxpRank({ n: i + 1, name: r.name, value: K.money(r.v), ratio: r.v / top, note: v.p.l.sales > 0 ? t(`売上の ${Math.round(r.share * 100)}%`, `${Math.round(r.share * 100)}% of sales`) : '—' }))));
    if (v.tax) {
      const tx = uxpRow(t('法人税', 'Corporate tax'), K.money(v.tax.v), { tone: 'bad', note: t(`課税される利益の ${Math.round(v.tax.rate * 100)}%`, `${Math.round(v.tax.rate * 100)}% of taxable profit`) });
      tx.dataset.focus = 'tax-line';
      cost.append(tx);
    }
    if (v.advice.length) {
      const adv = uxpPaper({ plain: true, cls: 'uxk-bk-advice' }, el('div.uxk-bk-ttl', kIcon('receipt', ink), el('b', t('経理からの助言', 'Advice from accounting'))), el('ul.uxk-bk-list', v.advice.map((x) => el('li', noEmoji(x)))));
      adv.dataset.focus = 'advice';
      cost.append(adv);
    }
    kids.push(cost);
    if (!v.done) kids.push(el('p.uxk-note', t(`いまは ${v.inQ + 1} か月目の途中です。四半期が終わると、マインちゃんが知らせます。`, `Month ${v.inQ + 1} of this quarter is in progress.`)));

    page.replaceChildren(...kids);
    // 選んだ四半期のキーが見える所まで送る（棒のグラフは、いまの四半期＝右端を見せる）
    const onKey = chips.querySelector<HTMLElement>('.uxk-bk-q.is-on');
    if (onKey) chips.scrollLeft = Math.max(0, onKey.offsetLeft - chips.clientWidth + onKey.offsetWidth + 8);
    for (const g of page.querySelectorAll<HTMLElement>('.uxk-bk-graph')) g.scrollLeft = g.scrollWidth;
    // ---- 動き：開いたとき・四半期を替えたとき：紙が送られ、行が上から打たれ、棒が伸びる。描き直し（日ごと・押したあと）は、すぐ出す
    if (motion) {
      if (turned) page.animate?.([{ transform: 'translate3d(0, 24px, 0)', opacity: 0.2 }, { transform: 'translate3d(0, 0, 0)', opacity: 1 }], { duration: 260, easing: 'steps(5, end)' });
      uxpPrint(plLines, { gap: 50, sound: first || turned });
      uxpPrint(bsLines, { gap: 50, sound: false });
      later(200, () => motionBars.forEach((b) => b.grow()));
    } else {
      uxpPrint(plLines).finish();
      uxpPrint(bsLines).finish();
    }
  }
  /** 紙の上の 1 行：名前 …… 金額（右そろえ）。小計・合計は罫と太字。引くものは赤と「-」 */
  function line(r: BookRow): HTMLElement {
    const row = uxpRow(r.k.replace(/^　/, ''), K.money(r.v), { tone: rowTone(r) });
    row.classList.add('uxk-bk-row', r.cls);
    return row;
  }
  built.set(body, { draw });
  draw(true);
}
