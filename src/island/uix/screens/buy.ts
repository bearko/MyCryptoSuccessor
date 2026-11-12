/**
 * 段 UIX3b：調達の画面（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：調達」）。
 * 器は今の札（p1/screens.ts の open()）：閉じ方・時間の止め方・チュートリアルの一言（mineTip の「buy」）は今のまま。
 * 上に計器（今月の調達の枠・置き場所）、その下にタブ：素材（在庫の計器・値段・納期・月の量・いま注文する）／注文中（届くまでの目盛り）／買い付け（調達係・調達ランク・作りたいエクステ）。
 * 注文の手応え：キーを押し込む → 資金が回って減る・金貨が飛ぶ →「注文済」の札が打たれる → 届くまでの目盛りが札に出る。足りないときは「あと N G」。
 * 中身は 1 回だけ組み、値が変わった札だけ作り直す（block）。数字とゲームの決まりは p1/model.ts のまま。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { rollNumber, uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpCard, uxpEmpty, uxpGap, uxpHead, uxpPrice, uxpRow, uxpStamp, uxpTabs } from '../sparts';
import { B } from './b-deps';
import { bDim, bInk } from './b-icons';
import { block, dim, done, facePic, heroSlot, key, matPic, num, payFx, put, root, sigOf, skuPic, stampLater, state, whyLine, type Block } from './b-kit';
import './buy.css';
import { tradeCmpUx } from './tariff';
import type { Mat } from '../../p1/data';
import type { Order, P1State } from '../../p1/model';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 注文できない理由（できれば null）。順は本体の order() と同じ：資金 → 今月の枠 → 置き場所 */
export type OrderWhy = 'money' | 'cap' | 'storage' | null;
/** qty 個を unit G で注文できるか。tut：チュートリアルの段（今月の枠は見ない：今の画面と同じ） */
export function orderWhy(have: { money: number; left: number; free: number }, qty: number, unit: number, tut = false): OrderWhy {
  if (have.money < unit * qty) return 'money';
  if (!tut && have.left < qty) return 'cap';
  if (have.free < qty) return 'storage';
  return null;
}
/** 届くまでの進み（0〜1）：はじめの日数のうち、過ぎたぶん */
export const orderEta = (o: Pick<Order, 'left' | 'total'>) => Math.max(0, Math.min(1, 1 - o.left / Math.max(1, o.total)));
/** 月の量の計器の右端（今の画面と同じ：月の量・先月の消費・100% のいちばん大きい値の 1.25 倍。10 より小さくしない） */
export const qtyScale = (n: number, last: number | null, full: number) => Math.max(10, n, last ?? 0, full) * 1.25;
/** 在庫の計器（0〜1）：月の量に対して、いまの在庫がどれだけあるか。月の量が無ければ、1 ロットに対して */
export const stockRatio = (stock: number, perMonth: number, lot: number) => Math.max(0, Math.min(1, stock / Math.max(lot, perMonth)));
/** できごとで値段が動いているあいだの添え書き（今の画面と同じ言葉） */
export function priceNote(k: number): string {
  const r = Math.round(k * 100) / 100;
  if (r === 1) return '';
  return r > 1 ? t(`値上がり中 ×${r}`, `price up ×${r}`) : t(`値引き中 ×${r}`, `discount ×${r}`);
}
/** タブの並び */
export type BuyTab = 'mats' | 'orders' | 'auto';

// ---------------------------------------------------------------- 小さな部品

/** 計器の札：名前・いまの数（桁が回る）／上限・目盛り */
function gauge(label: string, rollKey: string, v: number, cap: number, o: { unit: string; ico: string; full?: boolean; note?: string }) {
  const m = uxMeter(v / Math.max(1, cap), o.full ? '' : 'cyan');
  m.el.classList.toggle('is-full', !!o.full);
  const odo = rollNumber(rollKey, v, { digits: Math.max(3, String(Math.round(cap)).length), size: 's' });
  return el(
    `div.uxb-gauge${o.full ? '.is-full' : ''}`,
    el('span.uxb-gauge-k', uxTape([bInk(o.ico), el('b', label)])),
    el('span.uxb-gauge-v', odo.el, num(`/ ${B.fmt(cap)}`, 'uxb-gauge-cap'), el('span.uxb-gauge-u', o.unit)),
    m.el,
    o.note ? el('span.uxb-gauge-note', o.note) : null,
  );
}
/** 注文 1 つの「届くまでの目盛り」 */
function etaRow(s: P1State, o: Order): HTMLElement {
  const m = uxMeter(orderEta(o), 'good');
  const onWay = o.left <= B.walkDays(s);
  return el(
    'div.uxb-eta',
    { 'data-order': String(o.id) },
    el('span.uxb-eta-who', facePic(o.courier, 40, { breathe: onWay })),
    el(
      'span.uxb-eta-body',
      el('span.uxb-eta-top', state(onWay ? 'good' : '', onWay ? t(`${B.heroName(o.courier)}が運んでいる途中`, `${B.heroName(o.courier)} is on the way`) : t('問屋で支度中', 'Being packed'), onWay), el('span.uxb-eta-left', t('あと ', ''), num(o.left), t(' 日', ' d'))),
      m.el,
    ),
  );
}

// ---------------------------------------------------------------- 画面

/** 調達の画面を開く（p1/screens.ts の openBuy から。入のときだけ） */
export function openBuyUx(ctx: Ctx) {
  let view: ReturnType<typeof build> | null = null;
  B.open(ctx, t('調達', 'Buying'), (body) => {
    view ??= build(ctx);
    view.mount(body);
  });
}

function build(ctx: Ctx) {
  const s = () => ctx.s();
  const tipBox = el('div.uxb-tip');
  const main = el('div.uxb-buy-main');
  const e = root('uxb-buy', tipBox, main);
  const stamps = new Map<string, ReturnType<typeof uxpStamp>>();
  const gaps = new Map<string, ReturnType<typeof uxpGap>>();
  let tut: boolean | null = null;
  let blocks: Block[] = [];
  let tabs: ReturnType<typeof uxpTabs<BuyTab>> | null = null;

  /** いま足りない素材（調達に入っていて、在庫が無く、注文もしていない）：その札の「1 ロット」が主役のキー */
  const needNow = (st: P1State): Mat | null => B.procMats(st).find((x) => B.hasRoute(st, x.m) && (st.mats[x.m] ?? 0) <= 0 && !(st.orders ?? []).some((o) => o.m === x.m))?.m ?? null;
  const have = (st: P1State) => ({ money: st.money, left: B.procLeft(st), free: B.poolFree(st) });

  /** 注文する：できたら、資金から金貨が飛び、「注文済」が打たれる。できないときは、責めない言い方で理由を返す */
  function order(m: Mat, lots: number, from?: string) {
    const st = s();
    const qty = lots * B.LOT;
    const days = from ? B.importLead(st, from) : B.leadDays(st);
    const id = from ? `${m}@${from}` : m;
    const err = from ? B.orderFrom(st, m, lots, from) : B.order(st, m, lots);
    if (err) {
      if (err === 'money') {
        const unit = from ? B.importPrice(st, m, from).unit : B.unitPrice(st, m);
        const g = gaps.get(m);
        g?.set(st.money, unit * qty);
        g?.nudge();
        if (!g) uxSfx('deny');
      } else {
        uxSfx('deny');
        ctx.toast(err === 'cap' ? t('今月の調達の枠を使い切りました。来月になると、また買えます', 'This month’s buying quota is used up. It resets next month') : t('置き場所がいっぱいです。倉庫を建てると、もっと置けます', 'Storage is full. A warehouse gives you more room'));
      }
      return;
    }
    const nb = from ? B.tradeNeighbors(st).find((x) => x.id === from) : null;
    ctx.toast(
      nb
        ? t(`${nb.name}から${B.MATS[m].name}を ${qty} 個取り寄せます（${days} 日後に届きます）`, `Importing ${qty} ${B.MATS[m].name} from ${nb.name} (arrives in ${days} days)`)
        : lots === 1 && tut
          ? t(`${B.MATS[m].name}を 1 ロット注文しました（${days} 日後に届きます）`, `Ordered 1 lot of ${B.MATS[m].name} (arrives in ${days} days)`)
          : t(`${B.MATS[m].name}を ${qty} 個注文しました（${days} 日後に届きます）`, `Ordered ${qty} ${B.MATS[m].name} (arrives in ${days} days)`),
    );
    done(ctx);
    // 描き直したあとの札に、手応えを出す
    const card = e.querySelector<HTMLElement>(`[data-mat="${m}"]`);
    payFx(card);
    tabs?.dot('orders', s().orders?.length ?? 0);
    stampLater(() => stamps.get(id)?.hit(card) ?? stamps.get(m)?.hit(card));
  }

  /** 素材 1 つの「注文済」の札と、届くまでの目盛り（その素材の注文があるあいだ） */
  function pending(st: P1State, m: Mat, host: HTMLElement) {
    const stamp = uxpStamp(t('注文済', 'Ordered'));
    stamps.set(m, stamp);
    const mine = (st.orders ?? []).filter((o) => o.m === m);
    if (mine.length) stamp.show();
    host.append(el('div.uxb-pend', stamp.el, mine.length ? el('span.uxb-pend-n', num(mine.reduce((a, o) => a + o.qty, 0)), t(' 個が届きます', ' on the way')) : null), ...mine.map((o) => etaRow(st, o)));
  }

  // ---- チュートリアルの「素材」の段：作るのに使う素材を、手で 1 ロット買う所だけ
  function buildTut() {
    const list = block(
      'div.uxb-list',
      () => {
        const st = s();
        return sigOf(B.procMats(st), st.mats, st.orders, st.money, B.poolFree(st));
      },
      (host) => {
        const st = s();
        const mats = B.procMats(st).map((x) => x.m);
        host.append(uxpHead(t('素材を買い足す（卸問屋）', 'Top up materials (wholesaler)'), { ico: 'shop' }));
        for (const m of mats.length ? mats : B.MAT_KEYS.filter((k) => B.hasRoute(st, k))) {
          const unit = B.unitPrice(st, m);
          const days = B.leadDays(st);
          // 今の目印（チュートリアルが光らせて、押してもらうボタン）：isl-btn・is-on・is-guide。主役なので前の層へ（ux-front）
          const b = el<HTMLButtonElement>('button.isl-btn.is-on.ux-front.uxb-order-tut', { type: 'button' }, t(`1 ロット（${B.LOT} 個）注文する（${B.money(unit * B.LOT)}・納期 ${days} 日）`, `Order 1 lot (${B.LOT}) — ${B.money(unit * B.LOT)}, ${days} days`));
          if (!st.orders?.length) b.classList.add('is-guide');
          b.disabled = !!orderWhy(have(st), B.LOT, unit, true);
          b.addEventListener('click', (ev) => {
            ev.stopPropagation();
            order(m, 1);
          });
          const gap = uxpGap(st.money, unit * B.LOT);
          gaps.set(m, gap);
          const stock = rollNumber(`b.mat.${m}`, st.mats[m] ?? 0, { digits: 3, size: 's' });
          const card = el('div.uxb-mat', { 'data-mat': m }, el('div.uxb-mat-head', matPic(m, 32), el('b.uxb-mat-name', B.MATS[m].name), el('span.uxb-mat-stock', el('span.uxb-mat-stock-k', t('在庫', 'Stock')), stock.el, el('span', t('個', '')))), b, gap.el);
          pending(st, m, card);
          host.append(card);
        }
        if (!st.orders?.length) host.append(dim(t('注文すると、納期に問屋の人が工房まで運んできます（工房に入ったら在庫になります）。', 'Ordered materials are carried to the workshop by the wholesaler’s staff on the due day.')));
      },
    );
    blocks = [list];
    main.replaceChildren(list.el);
  }

  // ---- ふだんの画面
  function buildFull() {
    // 上の計器：今月の調達の枠・置き場所
    const top = block(
      'div.uxb-gauges',
      () => {
        const st = s();
        return sigOf(st.proc.bought, B.procCap(st), B.poolUsed(st), B.poolCap(st), B.myWarehouses(st).length);
      },
      (host) => {
        const st = s();
        const wh = B.myWarehouses(st).length;
        const full = B.poolFree(st) <= 0;
        host.append(
          gauge(t('今月の調達', 'Bought'), 'b.buy.bought', st.proc.bought, B.procCap(st), { unit: t('個', ''), ico: 'box', full: B.procLeft(st) <= 0 }),
          gauge(t('置き場所', 'Storage'), 'b.buy.pool', B.poolUsed(st), B.poolCap(st), { unit: t('個', ''), ico: 'shelf', full, note: wh ? t(`工房の物置＋倉庫 ${wh}`, `workshop + ${wh} warehouse(s)`) : full ? t('いっぱいです。「建築」で倉庫を', 'Full: build a warehouse') : t('工房の物置', 'workshop') }),
        );
      },
    );

    // ---- 素材のタブ：素材ごとの札（買い付ける素材を上に）
    const matHost = el('div.uxb-list');
    const matBlocks = new Map<Mat, Block>();
    const matSig = (m: Mat) => {
      const st = s();
      const sel = B.procMats(st).find((x) => x.m === m);
      const unit = B.unitPrice(st, m);
      const nbs = B.tradeNeighbors(st).filter((nb) => B.canImport(st, m, nb.id));
      const scout = st.staff.find((x) => x.task === 'explore' && x.target === m);
      const hv = have(st);
      return sigOf(
        st.mats[m] ?? 0,
        unit,
        B.evMul(st, 'mat', m),
        B.isCheap(st, m),
        B.hasRoute(st, m),
        sel?.from,
        sel ? [B.procQty(st, m), st.proc.qty[m], st.matUsedLast?.[m], B.fullUse(st)[m], B.utilRate(st.utilLast)] : '',
        [1, 5].map((l) => orderWhy(hv, l * B.LOT, unit)),
        st.money < unit * B.LOT ? st.money : '',
        (st.orders ?? []).filter((o) => o.m === m).map((o) => [o.id, o.left]),
        scout ? [scout.hero, scout.explore] : '',
        nbs.map((nb) => [nb.id, B.importPrice(st, m, nb.id), orderWhy(hv, B.LOT, B.importPrice(st, m, nb.id).unit)]),
        B.sourceOf(st, m),
        B.headSuggest(st, [m])[0],
        needNow(st) === m,
      );
    };
    const matBuild = (m: Mat) => (host: HTMLElement) => {
      const st = s();
      host.dataset.mat = m;
      const route = B.hasRoute(st, m);
      const sel = B.procMats(st).find((x) => x.m === m);
      const unit = B.unitPrice(st, m);
      const n = sel ? B.procQty(st, m) : 0;
      const stockN = st.mats[m] ?? 0;
      host.classList.toggle('is-sel', !!sel);
      host.classList.toggle('is-off', !route);
      // 見出し：絵・名前・札・在庫（桁が回る）と在庫の計器
      const stock = rollNumber(`b.mat.${m}`, stockN, { digits: 3, size: 's' });
      const sm = uxMeter(stockRatio(stockN, n, B.LOT), stockN > 0 ? 'good' : '');
      sm.el.classList.add('uxb-mat-meter');
      const ev = priceNote(B.evMul(st, 'mat', m));
      host.append(
        el(
          'div.uxb-mat-head',
          matPic(m, 32),
          el('span.uxb-mat-title', el('b.uxb-mat-name', B.MATS[m].name), el('span.uxb-mat-tags', B.isCheap(st, m) ? uxTape(t('特産 −20%', 'Local −20%'), 'good') : null, sel?.from === 'item' ? uxTape(t('エクステから', 'From extensions'), 'amber') : null)),
          el('span.uxb-mat-stock', el('span.uxb-mat-stock-k', t('在庫', 'Stock')), stock.el, el('span', t('個', ''))),
        ),
        sm.el,
        el('div.uxb-mat-price', uxpPrice(unit), el('span.uxb-mat-per', t('／個', ' each')), ev ? el('span.uxb-mat-ev', bDim(ev.startsWith(t('値上', 'price up')) ? 'up' : 'down'), ev) : null, route ? el('span.uxb-mat-lead', bDim('hour'), t(`納期 ${B.leadDays(st)} 日`, `${B.leadDays(st)} days`)) : null),
      );
      // 月の量：計器（先月・100% の印）と、−10・−1・＋1・＋10
      if (route && sel) {
        const q = st.proc.qty[m];
        const last = st.matUsedLast ? (st.matUsedLast[m] ?? 0) : null;
        const full = B.fullUse(st)[m] ?? 0;
        const u = B.utilRate(st.utilLast);
        const max = qtyScale(n, last, full);
        const qm = uxMeter(n / max);
        const marks = el('div.uxb-qty-marks', { 'aria-hidden': 'true' });
        const mark = (v: number, cls: string, label: string) => marks.append(el(`i.uxb-qty-mark.${cls}`, { style: { left: `${Math.round((v / max) * 50) * 2}%` }, title: label }));
        if (last != null) mark(last, 'is-last', t('先月の消費', 'Used last month'));
        mark(full, 'is-full', t('100% 動いたとき', 'At 100%'));
        const set = (v: number | null) => {
          B.setProcQty(st, m, v);
          uxSfx('slide', { step: Math.round(((v ?? n) / max) * 10) });
          done(ctx);
        };
        const step = (d: number) => uxKey(num(d > 0 ? `+${d}` : `−${-d}`), () => set(n + d), { cls: 'uxb-step', attrs: { 'aria-label': t(`月の量を ${d > 0 ? '+' : '−'}${Math.abs(d)}`, `Monthly amount ${d > 0 ? '+' : '−'}${Math.abs(d)}`), 'data-ux-quiet': '' } });
        const odo = rollNumber(`b.qty.${m}`, n, { digits: Math.max(3, String(n).length), dur: 200 });
        const ref = [last == null ? t('先月の消費：記録なし', 'Last month: no record') : t(`先月の消費 ${last} 個`, `Used last month: ${last}`)];
        if (u != null && u < 0.995) ref.push(t(`稼働率 100% なら ${full} 個`, `${full} at 100% utilization`));
        else if (last == null) ref.push(t(`工房が 100% 動けば ${full} 個`, `${full} if the workshop runs 100%`));
        host.append(
          el(
            'div.uxb-qty',
            el('div.uxb-qty-k', uxTape(t('月の量', 'Per month'), 'dark'), el('span.uxb-qty-how', q && !q.auto ? t('手で決めた量', 'Set by you') : (st.matUsedLast?.[m] ?? 0) > 0 ? t('先月と同じ（自動）', 'Same as last month (auto)') : t('いつもの体制の見込み（自動）', 'Usual pace estimate (auto)'))),
            el('div.uxb-qty-meter', qm.el, marks),
            el('div.uxb-qty-legend', last != null ? el('span', el('i.uxb-qty-mark.is-last'), t('先月', 'Last month')) : null, el('span', el('i.uxb-qty-mark.is-full'), t('100% 稼働', 'At 100%'))),
            el('div.uxb-qty-row', step(-10), step(-1), el('span.uxb-qty-n', odo.el, el('span', t('個／月', '/mo'))), step(1), step(10)),
            el('div.uxb-qty-keys', full ? key(t('100% に合わせる', 'Match 100%'), () => set(full)) : null, q && !q.auto ? key(t('自動に戻す', 'Back to auto'), () => set(null), { kind: 'weak' }) : null),
            dim(ref.join(t('・', ' · '))),
          ),
        );
      }
      if (route) {
        // いま注文する：1 ロット・5 ロット
        const hv = have(st);
        const gap = uxpGap(st.money, unit * B.LOT);
        gaps.set(m, gap);
        const keys = [1, 5].map((lots) => {
          const k = lots * B.LOT;
          const why = orderWhy(hv, k, unit);
          const mainKey = lots === 1 && needNow(st) === m && !why;
          return uxKey(el('span.uxb-order-l', el('b', t(`${lots} ロット`, `${lots} lot${lots > 1 ? 's' : ''}`)), num(`${B.fmt(unit * k)} G`)), () => order(m, lots), { kind: mainKey ? 'main' : why === 'cap' || why === 'storage' ? 'flat' : '', cls: 'uxb-order', strong: true, attrs: { 'data-ux-quiet': '', 'data-lots': String(lots), 'data-why': why ?? '' } });
        });
        const cap = orderWhy(hv, B.LOT, unit);
        const cap5 = cap ? null : orderWhy(hv, 5 * B.LOT, unit);
        put(
          host,
          el('div.uxb-spot', el('span.uxb-spot-k', bDim('cart'), t(`いま注文する（1 ロット ${B.LOT} 個）`, `Order now (${B.LOT} per lot)`)), el('div.uxb-spot-keys', keys)),
          gap.el,
          cap === 'cap' ? whyLine(t('今月の調達の枠を使い切りました。来月になると、また買えます。', 'This month’s buying quota is used up. It resets next month.'), 'hour') : cap === 'storage' ? whyLine(t('置き場所がいっぱいです。倉庫を建てると、もっと置けます。', 'Storage is full. A warehouse gives you more room.'), 'shelf') : null,
          cap5 === 'cap' ? dim(bDim('hour'), t(`5 ロットは、今月の調達の枠（あと ${hv.left} 個）を超えます。`, `5 lots go over this month’s quota (${hv.left} left).`)) : cap5 === 'storage' ? dim(bDim('shelf'), t(`5 ロットは、置き場所（あと ${hv.free} 個ぶん）に入りきりません。`, `5 lots don’t fit in storage (room for ${hv.free}).`)) : null,
        );
        pending(st, m, host);
        if (sel?.from !== 'item')
          host.append(
            el(
              'div.uxb-mat-foot',
              key(
                sel ? t('調達から外す', 'Remove') : t('調達に追加', 'Add'),
                () => {
                  B.toggleProcExtra(st, m);
                  uxSfx('toggle', { step: sel ? 0 : 1 });
                  done(ctx);
                },
                { kind: sel ? 'weak' : '', ico: sel ? null : 'check', attrs: { 'data-ux-quiet': '' } },
              ),
              el('span.uxb-dim', sel ? t('調達係が、毎日すこしずつ買い付けます', 'The buyer tops it up every day') : t('追加すると、調達係が自動で買い付けます', 'Add it and the buyer tops it up')),
            ),
          );
      } else {
        // ルートが無い：開拓（開拓中は進みの目盛り）
        const scout = st.staff.find((x) => x.task === 'explore' && x.target === m);
        const need = B.MATS[m].exploreDays * B.scoutMul(st);
        if (scout) {
          const pm = uxMeter(scout.explore / need, 'cyan');
          host.append(el('div.uxb-scout', facePic(scout.hero, 40, { breathe: true }), el('span.uxb-eta-body', state('cyan', t(`${B.heroName(scout.hero)}が開拓中`, `${B.heroName(scout.hero)} is scouting`), true), pm.el)));
        } else
          host.append(
            el(
              'div.uxb-mat-foot',
              el('span.uxb-dim', bDim('compass'), t(`ルートがまだありません（開拓 ${Math.round(need)} 日〜）`, `No route yet (scouting from ${Math.round(need)} days)`)),
              key(t('ヒーローを開拓に出す', 'Send a scout'), () =>
                B.pickHero(ctx.root, st, {
                  title: t(`${B.MATS[m].name}のルートを開拓する`, `Scout a ${B.MATS[m].name} route`),
                  task: 'explore',
                  current: null,
                  onPick: (v) => {
                    if (v == null) return;
                    B.assign(st, v, 'explore', m);
                    ctx.toast(t(`${B.heroName(v)}が${B.MATS[m].name}のルートを開拓しに出かけました`, `${B.heroName(v)} went scouting for a ${B.MATS[m].name} route`));
                    done(ctx);
                  },
                }),
              ),
            ),
          );
      }
      tradeRows(st, m, host, !!sel);
    };
    /** となり町の問屋：ここ／となり町の値段の比べ・「1 ロット取り寄せる」・調達係の仕入れ先・物流の部長の提案 */
    function tradeRows(st: P1State, m: Mat, host: HTMLElement, picked: boolean) {
      const nbs = B.tradeNeighbors(st).filter((nb) => B.canImport(st, m, nb.id));
      if (!nbs.length) return;
      const box = el('div.uxb-trade');
      const src = B.sourceOf(st, m);
      const hs = B.headSuggest(st, [m])[0];
      if (hs) {
        const nm = B.sectorDef(hs.from).name;
        const ok = uxpStamp(t('承認済', 'Approved'));
        stamps.set(`${m}!head`, ok);
        box.append(
          el(
            'div.uxb-say',
            facePic(hs.hero, 40),
            el('span.uxb-say-body', uxTape(t(`${B.heroName(hs.hero)}（物流の部長）`, `${B.heroName(hs.hero)} (Logistics head)`)), el('span', t(`「${B.MATS[m].name}は${nm}で買うと月 −${B.money(hs.save)}」`, `“Buying ${B.MATS[m].name} in ${nm} saves ${B.money(hs.save)} a month”`))),
            key(
              t('承認', 'Approve'),
              () => {
                B.setSource(st, m, hs.from);
                ctx.toast(t(`${B.MATS[m].name}は、調達係が${nm}から取り寄せます`, `The buyer will import ${B.MATS[m].name} from ${nm}`));
                done(ctx);
                uxSfx('stamp');
              },
              { kind: 'main', ico: 'check', strong: true },
            ),
            ok.el,
          ),
        );
      }
      for (const nb of nbs) {
        const p = B.importPrice(st, m, nb.id);
        const days = B.importLead(st, nb.id);
        const here = B.unitPrice(st, m);
        const why = orderWhy(have(st), B.LOT, p.unit);
        const on = src === nb.id;
        const st2 = uxpStamp(t('注文済', 'Ordered'));
        stamps.set(`${m}@${nb.id}`, st2);
        box.append(
          el(
            'div.uxb-trade-row',
            tradeCmpUx({ name: nb.name, here, base: p.base, duty: p.duty, rate: B.dutyText(st, nb.id), days, cheap: B.cheapAt(nb.id, m) }),
            el(
              'div.uxb-trade-keys',
              uxKey(el('span.uxb-order-l', el('b', t('1 ロット取り寄せる', 'Import 1 lot')), num(`${B.fmt(p.unit * B.LOT)} G`)), () => order(m, 1, nb.id), { kind: why === 'cap' || why === 'storage' ? 'flat' : '', cls: 'uxb-order', strong: true, attrs: { 'data-ux-quiet': '', 'data-why': why ?? '' } }),
              picked || on
                ? uxKey(
                    el('span.uxb-src-l', uxLamp('good', on), el('b', on ? t(`調達係は${nb.name}で買う`, `Buyer buys in ${nb.name}`) : t(`調達係を${nb.name}で買わせる`, `Have the buyer buy in ${nb.name}`))),
                    () => {
                      B.setSource(st, m, on ? null : nb.id);
                      uxSfx('toggle', { step: on ? 0 : 1 });
                      ctx.toast(on ? t(`${B.MATS[m].name}は、この町の卸問屋で買います`, `${B.MATS[m].name} will be bought here`) : t(`${B.MATS[m].name}は、調達係が${nb.name}から取り寄せます`, `The buyer will import ${B.MATS[m].name} from ${nb.name}`));
                      done(ctx);
                    },
                    { cls: 'uxb-src isl-trade-src', attrs: { 'aria-pressed': String(on), 'data-ux-quiet': '' } },
                  )
                : null,
              st2.el,
            ),
          ),
        );
      }
      host.append(box);
    }
    let orderSig = '';
    const syncMats = () => {
      const st = s();
      const picked = B.procMats(st);
      // 買い付ける素材を上に
      const order = [...B.MAT_KEYS].sort((a, b) => Number(!picked.some((x) => x.m === a)) - Number(!picked.some((x) => x.m === b)));
      for (const m of order) if (!matBlocks.has(m)) matBlocks.set(m, block('div.uxb-mat', () => matSig(m), matBuild(m)));
      const sig = order.join(',');
      if (sig !== orderSig) {
        orderSig = sig;
        matHost.replaceChildren(uxpHead(t('素材ごとの在庫と月の量', 'Stock and monthly amount'), { ico: 'list' }), ...order.map((m) => matBlocks.get(m)!.el));
      }
      for (const m of order) matBlocks.get(m)!.sync();
    };

    // ---- 注文中のタブ
    const orders = block(
      'div.uxb-list',
      () => sigOf(s().orders, B.walkDays(s())),
      (host) => {
        const st = s();
        host.append(uxpHead(t('注文中', 'On order'), { ico: 'truck', right: st.orders?.length ? num(String(st.orders.length), 'uxb-count') : null }));
        if (!st.orders?.length) {
          host.append(uxpEmpty(t('いま注文している素材はありません', 'No orders right now'), { ico: 'truck', sub: t('注文すると、納期に問屋の人が工房まで運んできます（工房に入ったら在庫になります）。', 'Ordered materials are carried to the workshop by the wholesaler’s staff on the due day.'), key: key(t('素材を見る', 'See materials'), () => tabs?.set('mats')) }));
          return;
        }
        for (const o of st.orders) {
          const from = o.from ? B.sectorDef(o.from).name : '';
          host.append(uxpCard({ pic: matPic(o.m, 32), name: el('b', t(`${B.MATS[o.m].name} ${o.qty} 個`, `${o.qty} ${B.MATS[o.m].name}`)), tags: from ? uxTape(t(`${from}から`, `from ${from}`)) : null, desc: etaRow(st, o), cls: 'uxb-ordercard' }));
        }
      },
    );

    // ---- 買い付けのタブ：調達係・調達ランク・作りたいエクステ
    const auto = block(
      'div.uxb-list',
      () => {
        const st = s();
        const buyer = st.staff.find((x) => x.task === 'buy');
        return sigOf(buyer?.hero, buyer?.resting, buyer?.stamina, st.proc.lv, Math.floor(st.proc.exp), B.procBonus(st), B.utilRate(st.utilLast), B.procItems(st), B.craftable(st));
      },
      (host) => {
        const st = s();
        const buyer = st.staff.find((x) => x.task === 'buy');
        host.append(
          uxpHead(t('自動の買い付け', 'Automatic buying'), { ico: 'people' }),
          heroSlot(st, {
            label: t('調達係', 'Buyer'),
            task: 'buy',
            hero: buyer?.hero ?? null,
            empty: t('調達係を置く', 'Assign a buyer'),
            onTap: () =>
              B.pickHero(ctx.root, st, {
                title: t('調達の担当', 'Buyer'),
                task: 'buy',
                current: buyer?.hero ?? null,
                onPick: (v) => {
                  for (const x of st.staff) if (x.task === 'buy' && x.hero !== v) B.assign(st, x.hero, null);
                  if (v != null) {
                    B.assign(st, v, 'buy');
                    ctx.toast(t(`${B.heroName(v)}が調達係になりました`, `${B.heroName(v)} is now the buyer`));
                  }
                  done(ctx);
                },
              }),
          }),
          !buyer
            ? whyLine(t('調達係がいないので、自動では買いません。素材のタブの「月の量」は、調達係を決めると毎日少しずつ買い付けます。', 'No buyer: nothing is bought automatically. Assign one to buy the monthly amounts a little every day.'), 'person')
            : buyer.resting
              ? whyLine(t('調達係が休憩中なので、いまは買い付けが止まっています。', 'The buyer is resting; buying is paused.'), 'cup')
              : dim(t('調達係が工房から卸問屋まで歩いて行き、「月の量」をもとに、次の買い付けが届くまでもつぶんを買って帰ります（休む前には休むあいだのぶんも。月の上限・資金・置き場所の中で）。適性が高いほど速く歩き、ランクも早く上がります。', 'The buyer walks from the workshop to the wholesaler and, based on the monthly amounts, brings back enough to last until the next delivery (plus the rest days before resting; within the limit, funds and storage). Higher aptitude walks faster and raises the rank faster.')),
        );
        const u = B.utilRate(st.utilLast);
        host.append(uxpRow(t('先月の工房の稼働率', 'Workshop utilization last month'), u == null ? t('まだ記録がありません', 'no record yet') : `${Math.round(u * 100)}%`, { ico: 'gear', tone: u == null ? 'dim' : '' }));
        // 調達ランク
        const need = B.procNeed(st.proc.lv);
        const maxed = st.proc.lv >= B.PROC.maxLv;
        const bonus = Math.round(B.procBonus(st) * 100);
        const rm = uxMeter(maxed ? 1 : st.proc.exp / need);
        host.append(
          uxpHead(t('調達ランク', 'Buying rank'), { ico: 'star', right: el('span.uxb-lv', 'Lv.', num(st.proc.lv)) }),
          rm.el,
          dim(maxed ? t('最高ランクです', 'Max rank') : t(`次のランクまで ${Math.ceil(need - st.proc.exp)}（買った数と買い付けの回数で上がります）`, `${Math.ceil(need - st.proc.exp)} to the next rank (raised by units and purchases)`)),
          dim(bonus ? t(`今月の調達の枠（月に買える素材の数）は、ランクが上がると増えます（スキルで +${bonus}%）。`, `The monthly quota grows with rank (skills +${bonus}%).`) : t('今月の調達の枠（月に買える素材の数）は、ランクが上がると増えます。スキル「調達枠の拡大」でも増やせます。', 'The monthly quota grows with rank and the “Bigger buying quota” skill.')),
        );
        // 作りたいエクステ
        const items = B.procItems(st);
        host.append(
          uxpHead(t('作りたいエクステ', 'Extensions to make'), { ico: 'hammer' }),
          dim(t('選ぶと、必要な素材が「素材」のタブで自動で選ばれます（最初は作業台で作っているもの）。', 'Their materials are selected on the Materials tab automatically (defaults to what the benches make).')),
          el(
            'div.uxb-picks',
            B.craftable(st).map((x) => {
              const on = items.includes(x);
              return uxKey(
                el('span.uxb-pick-l', uxLamp('good', on), skuPic(x, 32), el('b', B.skuName(x))),
                () => {
                  B.toggleProcItem(st, x);
                  uxSfx('toggle', { step: on ? 0 : 1 });
                  done(ctx);
                },
                { cls: 'uxb-pick', attrs: { 'aria-pressed': String(on), 'data-ux-quiet': '', 'data-sku': x } },
              );
            }),
          ),
        );
      },
    );

    tabs = uxpTabs<BuyTab>(
      [
        { key: 'mats', label: t('素材', 'Materials'), pane: matHost },
        { key: 'orders', label: t('注文中', 'On order'), pane: orders.el, dot: s().orders?.length ? s().orders!.length : false },
        { key: 'auto', label: t('買い付け', 'Buyer'), pane: auto.el },
      ],
      { flow: true, cls: 'uxb-buy-tabs' },
    );
    blocks = [top, { el: matHost, sync: syncMats }, orders, auto];
    main.replaceChildren(top.el, tabs.el);
  }

  function sync() {
    const st = s();
    const now = ctx.step?.() === 'mats';
    if (now !== tut) {
      tut = now;
      stamps.clear();
      gaps.clear();
      tabs = null;
      if (tut) buildTut();
      else buildFull();
    }
    tipBox.replaceChildren();
    B.mineTip(ctx, 'buy', tipBox);
    for (const b of blocks) b.sync();
    const n = st.orders?.length ?? 0;
    tabs?.dot('orders', n ? n : null);
  }

  return {
    el: e,
    sync,
    /** 札（またはまとめた画面の部分）へ入れて、値を合わせる */
    mount(body: HTMLElement) {
      body.append(e);
      sync();
    },
  };
}
