/**
 * 段 UI5c の画面の部品：お店の方針「在庫を優先して売りさばく」の段を選ぶ引き出し・ランクアップの窓・作業台の作る物の選び方
 * （並び・絞り込み・ランクアップの印。heroui.ts の pickExt の craft）。計算は stock.ts・plan.ts（DOM なし）。
 * 仕様は docs/ISLAND_PHASE1.md「在庫の売りさばき（段 UI5c）」。
 */
import { t } from '../../i18n';
import { CLEAR, UNCOMMON, skuPrice, type Sku } from './data';
import { DEF } from '../defs';
import { develop, sellNow, staffOf, type P1State } from './model';
import { afterOf, applyPlan, manualPlan, type Plan } from './plan';
import { clearInfo, clearUnits, cutName, gatePlan, growBlock, rankUp, shelfGate, storeFull, upPrice, type OneShelf, type ShelfPick } from './stock';
import { drawer, pickExt } from './heroui';
import { after, chooseMake, type Ctx } from './screens';
import { btn, h, heroName, money, recLine, skuIcon, skuName } from './ui';

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
      b.append(recLine(name + (on ? t('（いま）', ' (now)') : ''), cut === CLEAR.def && sh.clear == null && storeFull(s)), h('small', '', sub));
      b.addEventListener('click', () => {
        close();
        if (on) return;
        const plan = manualPlan([{ k: 'clear', uid, cut }], hero);
        const say = (msg: string) => ctx.toast(hero != null ? t(`${heroName(hero)}「${msg}」`, `${heroName(hero)}: “${msg}”`) : msg);
        const run = (p: Plan) => {
          const r = applyPlan(s, p);
          if (!r.ok) {
            ctx.sfx?.('error');
            ctx.toast(r.err === 'money' ? t('資金が足りません', 'Not enough funds') : t('いまはできません', 'Can’t do that now'));
            return;
          }
          ctx.sfx?.(p.steps.some((x) => x.k === 'shelf') ? 'spend' : 'tap');
          const grow = p.steps.some((x) => x.k === 'shelf');
          say(cut == null ? t('売りさばきをやめます', 'Back to normal selling') : grow ? t(`棚を 1 段増やして、主力と在庫品を両方並べます（${cutName(cut)}）`, `added a shelf: main item and stock items both on sale (${cutName(cut)})`) : t(`在庫品を先に並べます（${cutName(cut)}）`, `Stock items go first (${cutName(cut)})`));
          after(ctx);
          done();
        };
        // 段 UI5d：棚が 1 段のお店は、主力商品が棚から外れるので 3 択（主力を外す・主力を残す・棚を拡張する（推奨））
        const gate = shelfGate(s, plan);
        if (gate.length) {
          openShelfChoice(ctx, plan, gate, (p, pick) => {
            if (p) run(p);
            else if (pick === 'keep') {
              ctx.sfx?.('tap');
              say(t('主力商品を残します（在庫品は先に並べません）', 'keeping the main item (stock items don’t jump the queue)'));
              done();
            }
          });
          return;
        }
        run(plan);
      });
      body.append(b);
    }
  });
}

// ---------------------------------------------------------------- 段 UI5d：棚が 1 段のお店の売りさばき（3 択）

/** 3 択それぞれの見込み：在庫品がひと月に売れていく数・売上の変わり方（月） */
function gateOutlook(s: P1State, p: Plan | null, items: Sku[]): { units: number; sales: number } {
  if (!p) return { units: 0, sales: 0 };
  const aft = afterOf(s, p);
  return { units: clearUnits(aft, items), sales: sellNow(aft).yen - sellNow(s).yen };
}

/**
 * 棚が 1 段のお店で売りさばきを選んだときの 3 択の窓（決まり：選択肢と推奨を明示する）。
 * - 主力商品を外して出土品（在庫品）だけ売る（plan のまま）
 * - 主力商品を残して在庫品は売らない（そのお店の方針はオンにしない。何も残らなければ p は null）
 * - 棚を拡張して両方売る（推奨。設備投資「棚を増やす」の次の段と方針のオンを 1 回で）。お金が足りなければ押せず、理由を 1 行
 * 選ぶと go(作り直した plan, 選んだもの)。✕・外を押したら何もしない
 */
export function openShelfChoice(ctx: Ctx, plan: Plan, gate: OneShelf[], go: (p: Plan | null, pick: ShelfPick) => void) {
  const s = ctx.s();
  const info = clearInfo(s);
  const items = info.items.map((y) => y.x);
  const shopNm = (uid: number) => DEF[s.buildings.find((x) => x.uid === uid)?.id ?? '']?.name ?? t('お店', 'Shop');
  const names = gate.map((x) => shopNm(x.uid)).join(t('・', ', '));
  const mains = gate.map((x) => (x.main ? skuName(x.main) : '')).filter(Boolean);
  const mainNm = [...new Set(mains)].join(t('・', ', '));
  const cost = gate.reduce((a, x) => a + (x.cost ?? 0), 0);
  const block = growBlock(gate, s.money);
  drawer(ctx.root, t('棚が 1 段のお店です', 'This shop has one shelf'), t(`${names}の棚は 1 段だけです。在庫品を先に並べると、主力の${mainNm}が棚から外れます。`, `${names} has a single shelf. Putting stock items first takes ${mainNm} (the main item) off it.`), (body, close) => {
    body.parentElement?.classList.add('isl-gate');
    const top = h('div', 'isl-gate-top');
    const row = h('div', 'isl-clear-items');
    for (const x of gate) {
      if (!x.main) continue;
      const c = h('span', 'isl-chip is-main');
      c.append(skuIcon(x.main, 26), h('span', '', t(`主力：${skuName(x.main)}`, `Main: ${skuName(x.main)}`)));
      row.append(c);
    }
    for (const y of info.items.slice(0, 5)) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(y.x, 26), h('span', '', `${skuName(y.x)} ×${y.n}`));
      row.append(c);
    }
    top.append(row);
    body.append(top);
    const sales = (v: number) => t(`売上 ${v >= 0 ? '+' : '−'}${money(Math.abs(v))}／月`, `Sales ${v >= 0 ? '+' : '−'}${money(Math.abs(v))}/mo`);
    const opts: { pick: ShelfPick; name: string; sub: string; rec?: boolean; off?: string | null }[] = [];
    const pd = gatePlan(plan, gate, 'drop');
    const od = gateOutlook(s, pd, items);
    opts.push({ pick: 'drop', name: t(`主力商品（${mainNm}）を外して、在庫品だけ売る`, `Take ${mainNm} off; sell stock items only`), sub: [t('費用なし', 'Free'), t(`在庫品 月 ${Math.round(od.units)} 個ほど`, `~${Math.round(od.units)} stock items/mo`), sales(od.sales)].join(t('・', ' · ')) });
    opts.push({ pick: 'keep', name: t('主力商品を残して、在庫品は売らない', 'Keep the main item; don’t clear stock'), sub: t('方針はオンにしない・いまのまま', 'Policy stays off · as now') });
    const pg = gatePlan(plan, gate, 'grow');
    const og = block ? { units: 0, sales: 0 } : gateOutlook(s, pg, items);
    opts.push({ pick: 'grow', name: t('棚を拡張して、両方売れるようにする', 'Add a shelf and sell both'), sub: [t(`棚の拡張 ${money(cost)}`, `Extra shelf ${money(cost)}`), ...(block ? [] : [t(`在庫品 月 ${Math.round(og.units)} 個ほど`, `~${Math.round(og.units)} stock items/mo`), sales(og.sales)])].join(t('・', ' · ')), rec: true, off: block });
    for (const o of opts) {
      const b = h('button', `isl-clear-opt isl-gate-opt ${o.rec ? 'is-rec' : ''}`);
      b.type = 'button';
      b.dataset.pick = o.pick;
      b.disabled = !!o.off;
      b.append(recLine(o.name, o.rec), h('small', '', o.sub));
      if (o.off) b.append(h('small', 'isl-bad isl-gate-why', o.off));
      b.addEventListener('click', () => {
        if (o.off) return;
        close();
        go(o.pick === 'drop' ? pd : o.pick === 'grow' ? pg : gatePlan(plan, gate, 'keep'), o.pick);
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
