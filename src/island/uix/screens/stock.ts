/**
 * 段 UIX3b：在庫と倉庫の引き出し（入のときだけ。docs/ISLAND_UIX.md「画面：在庫・倉庫」）。画面の部品（sparts.ts：uxp-）で組み直した。
 * - 在庫を優先して売りさばく（p1/stockui.ts の pickClear）：倉庫の計器・在庫品の札・段ごとに「月に売れていく数」の縦の棒・段のカード。
 *   押して選び、下のキーで決める（はじめは推奨、無ければいまの方針を選んでおく）。決めると「決定」の札が打たれてから、本体の clearChoose。
 * - 棚が 1 段のお店（openShelfChoice）：3 択のカード（推奨・費用・見込み）。拡張は資金が足りなければ「あと N G」の目盛り。
 * - ランクアップ（openRankUp）：いまの商品 → アンコモンの絵と値段・要るものの行（済み／まだ）と、そろった数の計器・いちばん先にやることの主のキー。
 * 計算と押した先は本体のまま（clearChoose・shelfOpts・rankDev は今の画面と共通）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxKey, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpDrawer, uxpGap, uxpNum, uxpRow, uxpSelect, uxpStamp, type UxpDrawer } from '../sparts';
import { B } from './b-deps';
import { bIcon } from './b-icons';
import { bEmpty, bHead, num, payFx, skuPic, whyLine } from './b-kit';
import './stock.css';
import type { Sku } from '../../p1/data';
import type { Plan } from '../../p1/plan';
import type { OneShelf, ShelfPick } from '../../p1/stock';
import type { Ctx } from '../../p1/screens';

/** 決めたあと、「決定」の札を見せてからしまうまで（選ぶ引き出しと同じ） */
export const STOCK_STAMP_MS = 240;
/** 倉庫の計器が 0 から今の量まで進むのを待つ間（引き出しが出きってから） */
const METER_DELAY_MS = 280;

/** 決めたあと：選んだカードに札を打って、少し見せてから引き出しをしまい、本体の処理を呼ぶ（動きを減らすときは、すぐ） */
function decideAndClose(d: UxpDrawer, card: HTMLElement | null, label: string, fn: () => void) {
  if (isCalm() || !card) {
    d.drop();
    fn();
    return;
  }
  const st = uxpStamp(label);
  st.el.classList.add('uxb-stock-stamp');
  card.append(st.el);
  st.hit(card);
  d.el.classList.add('is-busy');
  later(STOCK_STAMP_MS, () => {
    d.drop();
    fn();
  });
}
/** 一覧の札が、上から順に入る */
const stagger = (cards: HTMLElement[]) => cards.forEach((c, i) => c.style.setProperty('--i', String(Math.min(i, 8))));
/** 計器を 0 から v まで進める（開いたときの動き） */
function meterIn(v: number, kind: '' | 'good' | 'cyan' = '') {
  const m = uxMeter(isCalm() ? v : 0, kind);
  if (!isCalm()) later(METER_DELAY_MS, () => m.set(v));
  return m;
}
/** 在庫品の札（絵・名前・個数）。8 つまで */
function stockChips(items: { x: Sku; n: number }[], max: number, main: Sku[] = []): HTMLElement {
  return el(
    'div.uxb-chips',
    main.map((x) => el('span.uxb-chip.is-main', skuPic(x, 32), el('span.uxb-chip-k', uxTape(t('主力', 'Main'), 'amber')), el('span.uxb-chip-n', B.skuName(x)))),
    items.slice(0, max).map((y) => el('span.uxb-chip', skuPic(y.x, 32), el('span.uxb-chip-n', B.skuName(y.x)), num(`×${y.n}`, 'uxb-chip-q'))),
  );
}
/** 売上の変わり方（月）：符号と言葉で（色だけにしない） */
const salesText = (v: number) => t(`売上 ${v >= 0 ? '+' : '−'}${B.money(Math.abs(v))}／月`, `Sales ${v >= 0 ? '+' : '−'}${B.money(Math.abs(v))}/mo`);
function salesLine(v: number): HTMLElement {
  const up = v >= 0;
  return el(`span.uxb-gain${up ? '' : '.is-bad'}`, bIcon(up ? 'up' : 'down', { color: up ? '#36e08b' : '#ffb81f', scale: 1 }), salesText(v));
}

// ---------------------------------------------------------------- 在庫を優先して売りさばく

interface ClearRow {
  cut: number | null;
  on: boolean;
  rec: boolean;
  name: string;
  short: string;
  units: number;
  sales: number;
}
export function openClearUx(ctx: Ctx, uid: number, hero: number | null, done: () => void) {
  const s = ctx.s();
  const sh = s.shops[uid];
  if (!sh) return;
  const info = B.clearInfo(s);
  const full = B.storeFull(s);
  const cur = sh.clear ?? null;
  const rows: ClearRow[] = [null, ...B.CLEAR.cuts.map((_x, k) => k)].map((cut) => {
    const o = info.items.length ? B.clearOutlook(s, uid, cut) : { units: 0, sales: 0 };
    return {
      cut,
      on: cur === cut,
      rec: cut === B.CLEAR.def && sh.clear == null && full,
      name: cut == null ? t('オフ（作っている商品から並べる）', 'Off (what we make goes first)') : t(`オン：${B.cutName(cut)}`, `On: ${B.cutName(cut)}`),
      short: cut == null ? t('オフ', 'Off') : B.cutName(cut),
      units: o.units,
      sales: o.sales,
    };
  });
  let sel = rows.find((r) => r.rec) ?? rows.find((r) => r.on) ?? rows[0];
  const d = uxpDrawer({
    root: ctx.root,
    title: t('在庫を優先して売りさばく', 'Clear stock first'),
    note: t('売れ残り・発掘で出た品・いまの素材で使い切りに作った品を、作っている商品より先に棚へ並べます。値引きは在庫品だけ（そのぶん目に留まって売れやすく、1 個あたりの売上は下がります）。', 'Puts leftovers, dug-up goods and use-it-up batches on the shelves before what you make. The discount is on stock items only (they sell faster, at less per piece).'),
    ico: 'shop',
    cls: 'uxb-stockd uxb-clear',
    decide: { label: t('この方針にする', 'Use this'), onDecide: () => decide() },
  });
  const host = el('div.uxb.ux-root');
  d.body.append(host);

  // 倉庫：使っている割合の計器（満杯に近いときは琥珀の札）
  const rate = Math.round(info.rate * 100);
  const meter = meterIn(info.rate, full ? '' : 'good');
  host.append(
    el(
      `div.uxb-store${full ? '.is-full' : ''}`,
      el('span.uxb-store-top', bIcon('box', { scale: 2 }), el('b', t('倉庫', 'Storage')), uxpNum(`${rate}%`, 'uxb-store-rate'), full ? uxTape(t('満杯に近い', 'Nearly full'), 'amber') : null),
      meter.el,
      el('span.uxb-dim', num(`${B.fmt(info.used)} / ${B.fmt(info.cap)}`), t(` 個（素材 ${info.mats}・商品 ${info.goods}）`, ` (${info.mats} materials, ${info.goods} goods)`)),
    ),
  );
  // 在庫品
  host.append(bHead(t('売りさばく在庫品', 'Stock items to clear'), { ico: 'list', right: info.items.length ? num(String(info.items.length)) : null }));
  if (!info.items.length) host.append(bEmpty(t('いま売りさばく在庫品はありません', 'No stock items to clear right now'), { ico: 'box', sub: t('作っている商品だけ', 'Only what you make') }));
  else host.append(stockChips(info.items, 8));

  // 段ごとの見込み：在庫品が月に売れていく数（縦の棒。選んだ段は琥珀）
  let bars: HTMLElement | null = null;
  if (info.items.length) {
    const b = uxpBars(
      rows.map((r) => ({ label: r.short, value: Math.round(r.units), text: t(`${Math.round(r.units)} 個`, `${Math.round(r.units)}`) })),
      { height: 112, cls: 'uxb-clear-bars' },
    );
    bars = b.el;
    host.append(bHead(t('在庫品が月に売れていく数（見込み）', 'Stock items sold a month (forecast)'), { ico: 'bars' }), bars);
  }
  // 段のカード
  host.append(bHead(t('方針の段', 'Policy'), { ico: 'shop' }));
  const cards = new Map<ClearRow, HTMLElement>();
  const list = el('div.uxp-list.uxb-stock-list');
  for (const r of rows) {
    const desc = r.cut == null ? el('span.uxb-dim', t('いまのまま', 'As now')) : el('span.uxb-gain', bIcon('box', { scale: 1 }), t(`在庫品 月 ${Math.round(r.units)} 個ほど売れていく`, `~${Math.round(r.units)} stock items sell a month`));
    const card = uxpCard({
      pic: el(`span.uxb-cut${r.cut == null ? '.is-off' : ''}`, r.cut == null ? bIcon('close', { scale: 2, color: '#97a1cf' }) : bIcon('price', { scale: 2 })),
      name: r.name,
      tags: r.on ? uxTape(t('いま', 'Now'), 'good') : null,
      desc,
      foot: r.cut == null ? null : salesLine(r.sales),
      badge: r.rec ? t('おすすめ', 'Pick') : undefined,
      onTap: () => setSel(r, true),
      selected: r === sel,
      cls: 'uxb-stock-card',
      attrs: { 'data-cut': r.cut == null ? 'off' : String(r.cut) },
    });
    cards.set(r, card);
    list.append(card);
  }
  stagger([...cards.values()]);
  host.append(list);

  function setSel(r: ClearRow, feel: boolean) {
    sel = r;
    for (const [x, c] of cards) uxpSelect(c, x === r, feel && x === r);
    rows.forEach((x, i) => bars?.querySelectorAll('.uxp-bar')[i]?.classList.toggle('is-main', x === r));
    d.setDecide({ name: el('b', r.short), label: r.on ? t('このままにする', 'Keep') : t('この方針にする', 'Use this'), on: true });
  }
  function decide() {
    const r = sel;
    // いまの方針のまま：しまうだけ（今の画面と同じ）
    if (r.on) return d.close();
    decideAndClose(d, cards.get(r) ?? null, t('決定', 'Set'), () => B.clearChoose(ctx, uid, hero, r.cut, done));
  }
  setSel(sel, false);
}

// ---------------------------------------------------------------- 棚が 1 段のお店（3 択）

export function openShelfChoiceUx(ctx: Ctx, plan: Plan, gate: OneShelf[], go: (p: Plan | null, pick: ShelfPick) => void) {
  const s = ctx.s();
  const info = B.clearInfo(s);
  const { names, mainNm } = B.shelfNames(s, gate);
  const opts = B.shelfOpts(s, plan, gate, mainNm);
  let sel = opts.find((o) => o.rec && !o.off) ?? opts.find((o) => !o.off) ?? opts[0];
  const d = uxpDrawer({
    root: ctx.root,
    title: t('棚が 1 段のお店です', 'This shop has one shelf'),
    note: t(`${names}の棚は 1 段だけです。在庫品を先に並べると、主力の${mainNm}が棚から外れます。`, `${names} has a single shelf. Putting stock items first takes ${mainNm} (the main item) off it.`),
    ico: 'shop',
    cls: 'uxb-stockd uxb-gate isl-gate',
    decide: { label: t('これに決める', 'Confirm'), onDecide: () => decide() },
  });
  const host = el('div.uxb.ux-root');
  d.body.append(host);
  host.append(stockChips(info.items, 5, gate.map((x) => x.main).filter((x): x is Sku => !!x)));
  const ICO: Record<ShelfPick, string> = { drop: 'minus', keep: 'shelf', grow: 'plus' };
  const cards = new Map<ShelfPick, HTMLElement>();
  const gaps = new Map<ShelfPick, ReturnType<typeof uxpGap>>();
  const list = el('div.uxp-list.uxb-stock-list');
  for (const o of opts) {
    const gap = o.cost > 0 && s.money < o.cost ? uxpGap(s.money, o.cost) : null;
    if (gap) gaps.set(o.pick, gap);
    const card = uxpCard({
      pic: el('span.uxb-cut', bIcon(ICO[o.pick], { scale: 2 })),
      name: o.name,
      desc: el('span.uxb-dim', o.sub),
      // 売上の見込みは o.sub（今の画面と同じ文）に入っているので、足りないときの目盛りと理由だけ
      foot: o.off ? (gap ? gap.el : whyLine(o.off)) : null,
      badge: o.rec ? t('おすすめ', 'Pick') : undefined,
      onTap: () => setSel(o.pick, true),
      selected: o === sel,
      off: !!o.off,
      cls: 'uxb-stock-card',
      attrs: { 'data-pick': o.pick },
    });
    cards.set(o.pick, card);
    list.append(card);
  }
  stagger([...cards.values()]);
  host.append(list);

  function setSel(pick: ShelfPick, feel: boolean) {
    const o = opts.find((x) => x.pick === pick);
    if (!o) return;
    // 押せない手（拡張の資金が足りない ほか）：選ばず、目盛りで「あと N G」を返す
    if (o.off) {
      const g = gaps.get(pick);
      if (g) g.nudge();
      else uxSfx('deny');
      return;
    }
    sel = o;
    for (const [k, c] of cards) uxpSelect(c, k === pick, feel && k === pick);
    const label = o.pick === 'grow' ? t('棚を拡張する', 'Add a shelf') : o.pick === 'drop' ? t('主力を外して売る', 'Take it off') : t('主力を残す', 'Keep the main');
    d.setDecide({ name: null, label, on: true });
  }
  function decide() {
    const o = sel;
    if (o.off) return;
    const card = cards.get(o.pick) ?? null;
    if (o.pick === 'grow') payFx(card);
    decideAndClose(d, card, t('決定', 'Set'), () => go(o.plan(), o.pick));
  }
  if (!sel.off) setSel(sel.pick, false);
}

// ---------------------------------------------------------------- ランクアップ（Common → Uncommon）

export function openRankUpUx(ctx: Ctx, x: Sku, worker: number | null, onMake: (u: Sku) => void, closeParent?: () => void) {
  const s = ctx.s();
  const r = B.rankUp(s, x, worker);
  if (!r) return;
  const finish = () => {
    d.drop();
    closeParent?.();
  };
  // いちばん先にやること（主のキー）。待つ・資金・職人のときは、キーは出さず理由の 1 行
  const act: { label: string; ico: string; fn: () => void } | null =
    r.next === 'pot'
      ? { label: t('スキルツリーで見る', 'Open the skill tree'), ico: 'star', fn: () => (finish(), ctx.skills?.('pot')) }
      : r.next === 'dev'
        ? { label: t(`開発を始める（${B.money(r.cost)}・${r.days} 日）`, `Start development (${B.money(r.cost)}, ${r.days} d)`), ico: 'gear', fn: () => dev() }
        : r.next === 'make'
          ? { label: t(`${B.skuName(r.to)}を作る`, `Make ${B.skuName(r.to)}`), ico: 'hammer', fn: () => (finish(), onMake(r.to)) }
          : null;
  const side = uxKey(t('閉じる', 'Close'), () => d.close(), { kind: 'weak', cls: 'uxb-rank-close' });
  const d = uxpDrawer({
    root: ctx.root,
    title: t(`ランクアップ：${B.skuName(r.from)} → ${B.skuName(r.to)}`, `Rank up: ${B.skuName(r.from)} → ${B.skuName(r.to)}`),
    ico: 'up',
    cls: 'uxb-stockd uxb-rankup',
    side,
    decide: act ? { label: act.label, ico: act.ico, onDecide: () => act.fn() } : undefined,
  });
  const host = el('div.uxb.ux-root');
  d.body.append(host);
  // いまの商品 → アンコモン：絵と値段
  host.append(
    el(
      'div.uxb-rank-head',
      el('span.uxb-rank-pic', skuPic(r.from, 48)),
      el('span.uxb-rank-arrow', bIcon('next', { scale: 2, color: '#ffb81f' })),
      el('span.uxb-rank-pic.is-to', skuPic(r.to, 48), uxTape('U', 'amber')),
      el('span.uxb-rank-price', el('span.uxb-rank-yen', num(B.money(B.skuPrice(r.from))), bIcon('next', { scale: 1, color: '#97a1cf' }), num(B.money(B.upPrice(r.from)), 'uxb-rank-up')), el('span.uxb-dim', t(`アンコモン：値段 ${B.UNCOMMON.price} 倍・売り場の強さ ${B.UNCOMMON.pull} 倍`, `Uncommon: ${B.UNCOMMON.price}× price, ${B.UNCOMMON.pull}× pull`))),
    ),
  );
  // 要るもの：そろった数の計器と、行（済み＝緑のチェック・まだ＝琥珀の矢印。言葉でも）
  const ok = r.needs.filter((n) => n.ok).length;
  const meter = meterIn(ok / Math.max(1, r.needs.length), ok === r.needs.length ? 'good' : '');
  host.append(
    bHead(t('要るもの', 'Needs'), { ico: 'list', right: el('span.uxb-rank-count', num(`${ok} / ${r.needs.length}`)) }),
    el('div.uxb-rank-meter', meter.el),
    el(
      'div.uxb-rank-needs',
      r.needs.map((n) =>
        uxpRow(el('span.uxb-need-k', bIcon(n.ok ? 'check' : 'next', { scale: 1, color: n.ok ? '#36e08b' : '#ffb81f' }), el('span', n.label)), el('span.uxb-need-v', n.ok ? t('済み', 'Done') : t('まだ', 'Not yet')), { tone: n.ok ? 'good' : 'amber', note: n.now || undefined, cls: `uxb-need${n.ok ? '.is-ok' : '.is-ng'}` }),
      ),
    ),
  );
  if (r.why) host.append(whyLine(r.why));
  // 開発の資金が足りない：「あと N G」の目盛り（責めない言い方。売上がたまれば届く）
  if (r.next === 'money') host.append(uxpGap(s.money, r.cost).el);
  if (act) d.setDecide({ name: null, label: act.label, on: true });

  function dev() {
    const card = d.decideKey;
    // 始められたら：資金が回って減る手応え → しまう（本体の rankDev が、知らせと描き直しをする）
    B.rankDev(ctx, r!, () => {
      payFx(card);
      finish();
    });
  }
}
