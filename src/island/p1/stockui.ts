/**
 * 段 UI5c の画面の部品：お店の方針「在庫を優先して売りさばく」の段を選ぶ引き出し・ランクアップの窓・作業台の作る物の選び方
 * （並び・絞り込み・ランクアップの印。heroui.ts の pickExt の craft）。計算は stock.ts・plan.ts（DOM なし）。
 * 仕様は docs/ISLAND_PHASE1.md「在庫の売りさばき（段 UI5c）」。
 */
import { t } from '../../i18n';
import { CLEAR, UNCOMMON, skuPrice, type Sku } from './data';
import { develop, sellNow, staffOf, type P1State } from './model';
import { afterOf, applyPlan, manualPlan } from './plan';
import { clearInfo, clearUnits, cutName, rankUp, storeFull, upPrice } from './stock';
import { drawer, pickExt } from './heroui';
import { after, chooseMake, type Ctx } from './screens';
import { btn, h, heroName, money, skuIcon, skuName } from './ui';

// ---------------------------------------------------------------- 在庫を優先して売りさばく（お店の方針）

/** 段ごとの見込み：在庫品がひと月に売れていく数と、売上の変わり方（月） */
export function clearOutlook(s: P1State, uid: number, cut: number | null): { units: number; sales: number } {
  const items = clearInfo(s).items.map((y) => y.x);
  const aft = afterOf(s, manualPlan([{ k: 'clear', uid, cut }]));
  return { units: clearUnits(aft, items), sales: sellNow(aft).yen - sellNow(s).yen };
}

/**
 * 店長への指示「在庫を優先して売りさばく」：段を選ぶ引き出し（オフ・値引きなし・1〜3 割引）。それぞれに見込み（在庫品が月に何個売れていくか・売上の変わり方）。
 * 選ぶとすぐそのお店の方針に（applyPlan）。在庫品のアイコンと数を上に
 */
export function pickClear(ctx: Ctx, uid: number, hero: number | null, done: () => void) {
  const s = ctx.s();
  const sh = s.shops[uid];
  if (!sh) return;
  const info = clearInfo(s);
  drawer(ctx.root, t('在庫を優先して売りさばく', 'Clear stock first'), t('売れ残り・発掘で出た品・いまの素材で使い切りに作った品を、作っている商品より先に棚へ並べます。値引きは在庫品だけ（そのぶん目に留まって売れやすく、1 個あたりの売上は下がります）。', 'Puts leftovers, dug-up goods and use-it-up batches on the shelves before what you make. The discount is on stock items only (they sell faster, at less per piece).'), (body, close) => {
    const top = h('div', 'isl-clear-top');
    top.append(h('b', '', t(`倉庫 ${Math.round(info.rate * 100)}%（${info.used} / ${info.cap} 個：素材 ${info.mats}・商品 ${info.goods}）`, `Storage ${Math.round(info.rate * 100)}% (${info.used} / ${info.cap}: ${info.mats} materials, ${info.goods} goods)`)));
    const chips = h('div', 'isl-clear-items');
    if (!info.items.length) chips.append(h('small', 'isl-dim', t('いま売りさばく在庫品はありません（作っている商品だけ）', 'No stock items to clear right now')));
    for (const y of info.items.slice(0, 8)) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(y.x, 26), h('span', '', `${skuName(y.x)} ×${y.n}`));
      chips.append(c);
    }
    top.append(chips);
    body.append(top);
    const opts: (number | null)[] = [null, ...CLEAR.cuts.map((_, k) => k)];
    for (const cut of opts) {
      const on = (sh.clear ?? null) === cut;
      const o = info.items.length ? clearOutlook(s, uid, cut) : { units: 0, sales: 0 };
      const b = h('button', `isl-clear-opt ${on ? 'is-on' : ''} ${cut === CLEAR.def && sh.clear == null && storeFull(s) ? 'is-rec' : ''}`);
      b.type = 'button';
      b.dataset.cut = cut == null ? 'off' : String(cut);
      const name = cut == null ? t('オフ（作っている商品から並べる）', 'Off (what we make goes first)') : t(`オン：${cutName(cut)}`, `On: ${cutName(cut)}`);
      const sub = cut == null ? t('いまのまま', 'As now') : [t(`在庫品 月 ${Math.round(o.units)} 個ほど売れていく`, `~${Math.round(o.units)} stock items sell a month`), t(`売上 ${o.sales >= 0 ? '+' : '−'}${money(Math.abs(o.sales))}／月`, `Sales ${o.sales >= 0 ? '+' : '−'}${money(Math.abs(o.sales))}/mo`)].join(t('・', ' · '));
      b.append(h('b', '', name + (on ? t('（いま）', ' (now)') : '')), h('small', '', sub));
      b.addEventListener('click', () => {
        close();
        if (on) return;
        applyPlan(s, manualPlan([{ k: 'clear', uid, cut }], hero));
        ctx.sfx?.('tap');
        const msg = cut == null ? t('売りさばきをやめます', 'Back to normal selling') : t(`在庫品を先に並べます（${cutName(cut)}）`, `Stock items go first (${cutName(cut)})`);
        ctx.toast(hero != null ? t(`${heroName(hero)}「${msg}」`, `${heroName(hero)}: “${msg}”`) : msg);
        after(ctx);
        done();
      });
      body.append(b);
    }
  });
}

// ---------------------------------------------------------------- ランクアップ（Common → Uncommon）

/**
 * ランクアップの窓：要るもの（パネル・開発のお金と日数・職人の適性・素材）に ✓／✕、いちばん先にやることのボタン
 * （スキルツリーで魔法の釜を見る・開発を始める・アンコモンを作る）。できない理由は 1 行で
 */
export function openRankUp(ctx: Ctx, x: Sku, worker: number | null, onMake: (u: Sku) => void, closeParent?: () => void) {
  const s = ctx.s();
  const r = rankUp(s, x, worker);
  if (!r) return;
  drawer(ctx.root, t(`⬆ ランクアップ：${skuName(r.from)} → ${skuName(r.to)}`, `⬆ Rank up: ${skuName(r.from)} → ${skuName(r.to)}`), '', (body, close) => {
    const head = h('div', 'isl-rank-head');
    head.append(skuIcon(r.from, 44), h('span', 'isl-rank-arrow', '→'), skuIcon(r.to, 52));
    const p = h('div');
    p.append(h('b', '', `${money(skuPrice(r.from))} → ${money(upPrice(r.from))}`), h('small', 'isl-dim', t(`アンコモン：値段 ${UNCOMMON.price} 倍・売り場の強さ ${UNCOMMON.pull} 倍`, `Uncommon: ${UNCOMMON.price}× price, ${UNCOMMON.pull}× pull`)));
    head.append(p);
    body.append(head);
    const ul = h('ul', 'isl-rank-needs');
    for (const n of r.needs) {
      const li = h('li', n.ok ? 'is-ok' : 'is-ng');
      li.append(h('b', '', n.ok ? '✓' : '✕'), h('span', '', n.label), h('small', '', n.now ?? ''));
      ul.append(li);
    }
    body.append(ul);
    if (r.why) body.append(h('p', 'isl-bad isl-rank-why', r.why));
    const row = h('div', 'isl-row isl-rank-acts');
    const finish = () => {
      close();
      closeParent?.();
    };
    if (r.next === 'pot')
      row.append(
        btn(t('スキルツリーで見る', 'Open the skill tree'), () => {
          finish();
          ctx.skills?.('pot');
        }, 'is-on'),
      );
    else if (r.next === 'dev')
      row.append(
        btn(t(`開発を始める（${money(r.cost)}・${r.days} 日）`, `Start development (${money(r.cost)}, ${r.days} d)`), () => {
          const e = develop(s, r.key);
          if (e) {
            ctx.sfx?.('error');
            ctx.toast(e === 'money' ? t('資金が足りません', 'Not enough funds') : t('いまは開発できません', 'Can’t develop now'));
            return;
          }
          ctx.sfx?.('spend');
          ctx.toast(t(`${skuName(r.to)}の開発を始めました（${r.days} 日）。できたら作業台で作れます`, `Started developing ${skuName(r.to)} (${r.days} d). Make it once it’s ready`));
          finish();
          after(ctx);
        }, 'is-on'),
      );
    else if (r.next === 'make')
      row.append(
        btn(t(`${skuName(r.to)}を作る`, `Make ${skuName(r.to)}`), () => {
          finish();
          onMake(r.to);
        }, 'is-on'),
      );
    row.append(btn(t('閉じる', 'Close'), close));
    body.append(row);
  });
}

// ---------------------------------------------------------------- 作業台の作る物を選ぶ（段 UI5c の並び・絞り込み・ランクアップ）

/**
 * 作業台 k の作る物を選ぶ引き出し（チュートリアルのあと）。items：候補・onPick：ふつうに選んだとき（自動製造）。
 * 「いまの素材で作れる」で選ぶと使い切りの製造（作り終えたらいまの商品に戻る）。tab：開いたときの並び
 */
export function pickMake(ctx: Ctx, k: number, o: { title: string; items: Sku[]; onPick: (x: Sku) => void; tab?: 'all' | 'stock'; badge?: { x: Sku; text: string } | null; note?: string }) {
  const s = ctx.s();
  const sl = s.slots[k];
  if (!sl) return;
  pickExt(ctx.root, s, {
    title: o.title,
    items: o.items,
    current: sl.sku,
    worker: sl.worker,
    badge: o.badge ?? null,
    note: o.note,
    onPick: (x) => x && o.onPick(x),
    craft: {
      tab: o.tab,
      stock: (x) => useUpAt(ctx, k, x),
      rank: (x, close) => openRankUp(ctx, x, sl.worker, (u) => o.onPick(u), close),
    },
  });
}
/** 作業台 k で、いまの素材で x を作れるだけ作る（提案書と同じ applyPlan）。トースト */
export function useUpAt(ctx: Ctx, k: number, x: Sku) {
  const s = ctx.s();
  const sl = s.slots[k];
  if (!sl) return;
  if (sl.worker == null) {
    ctx.toast(t('職人を割り当ててください', 'Assign a crafter first'));
    return;
  }
  const back = sl.back !== undefined ? sl.back : sl.sku && sl.sku !== x ? sl.sku : null;
  const r = applyPlan(s, manualPlan([{ k: 'useup', slot: k, x }], sl.worker));
  if (!r.ok) {
    ctx.sfx?.('error');
    ctx.toast(t('いまの素材では作れません', 'Can’t make it from current stock'));
    return;
  }
  ctx.sfx?.('tap');
  const st = staffOf(s, sl.worker);
  const msg = back ? t(`${skuName(x)}をいまの素材で作って、そのあと${skuName(back)}に戻ります`, `making ${skuName(x)} from stock, then back to ${skuName(back)}`) : t(`${skuName(x)}をいまの素材で作れるだけ作ります`, `making as many ${skuName(x)} as stock allows`);
  ctx.toast(st ? t(`${heroName(st.hero)}「${msg}」`, `${heroName(st.hero)}: “${msg}”`) : msg);
  after(ctx);
}
/** 作る物を変えたとき（ふつうに選んだ：自動製造） */
export const makeAt = (ctx: Ctx, k: number, x: Sku, msg?: string) => chooseMake(ctx, ctx.s(), k, x, msg);
