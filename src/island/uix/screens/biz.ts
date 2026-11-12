/**
 * 段 UIX3b：画面の部品（sparts.ts：uxp-）で組み直した事業の画面（入のときだけ。docs/ISLAND_UIX.md「画面：素材 → 商品・販売管理・宣伝広報」）。
 * 素材 → 商品（BOM）・販売管理（お店の一覧・一括で変える）・宣伝広報。器は今の札（open()）。数字とゲームの決まりは p1/ のまま。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { rollNumber, uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpEmpty, uxpGap, uxpHead, uxpPrice, uxpRow, uxpSeg, uxpStamp, uxpStat } from '../sparts';
import { B } from './b-deps';
import { bDim, bIcon } from './b-icons';
import { dim, done, facePic, key, matPic, noEmoji, num, payFx, put, rankTag, sheet, skuPic, stampLater, state } from './b-kit';
import './biz.css';
import type { Mat, Rar, Sku } from '../../p1/data';
import type { SalesSort, ShopBar } from '../../p1/sales';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** 粗利の割合（0〜1）。値段が 0 なら 0 */
export const marginRate = (price: number, cost: number) => (price > 0 ? (price - cost) / price : 0);
/** 1 日の数の言い方（10 以上は整数・それより小さければ小数 1 桁）：今の画面と同じ */
export const perDay = (v: number) => (v >= 10 ? `${Math.round(v)}` : v.toFixed(1));
/** 積み上げ棒の高さ（%。2% 刻み）：下から 売れた・自店に取られた・逃した */
export function stackParts(x: Pick<ShopBar, 'sold' | 'lost' | 'miss'>, max: number): [number, number, number] {
  const p = (v: number) => (v <= 0 ? 0 : Math.max(2, Math.round((v / Math.max(1e-9, max)) * 50) * 2));
  return [p(x.sold), p(x.lost), p(x.miss)];
}
/** 同じ名前が並ぶときは番号を振る：full＝「よろず屋 2」・short＝棒の下に出す短い名前（「2」）。1 つしか無い名前はそのまま */
export function numbered(names: string[]): { full: string; short: string }[] {
  const count: Record<string, number> = {};
  for (const n of names) count[n] = (count[n] ?? 0) + 1;
  const seen: Record<string, number> = {};
  return names.map((n) => {
    if (count[n] < 2) return { full: n, short: n };
    const k = (seen[n] = (seen[n] ?? 0) + 1);
    return { full: `${n} ${k}`, short: String(k) };
  });
}
/** 宣伝の見込みの様子：元が取れる・まだ取れない */
export const adTone = (gain: number): 'good' | 'amber' => (gain > 0 ? 'good' : 'amber');

// ---------------------------------------------------------------- 素材 → 商品（BOM）

export function openBomUx(ctx: Ctx) {
  sheet(ctx, t('BOM（素材 → 商品）', 'BOM (materials → products)'), null, 'uxb-bom', (host, s) => {
    host.append(uxpHead(t('素材 → 商品', 'Materials → products'), { ico: 'hammer' }), dim(t('1 回のクラフトに使う素材と、できる数・日数・1 個あたりの素材代と粗利です（素材はいまの値段）。', 'Materials per craft, output, days, and material cost and gross margin per item (at current prices).')));
    const list = el('div.uxp-grid.uxb-bom-list');
    for (const p of B.PRODUCTS)
      for (const r of ['C', 'U'] as Rar[]) {
        const x = B.sku(p.key, r);
        const locked = r === 'U' && !s.dev.includes(p.key);
        const price = B.skuPrice(x);
        const uc = B.unitCost(s, x);
        const rate = marginRate(price, uc);
        const mm = uxMeter(Math.max(0, rate), rate > 0 ? 'good' : '');
        list.append(
          uxpCard({
            pic: skuPic(x, 32),
            name: B.skuName(x),
            tags: locked ? uxTape([bIcon('lock', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 }), t('未開発', 'Not developed')]) : null,
            desc: [
              el('span.uxb-recipe', (Object.entries(p.recipe[r]) as [Mat, number][]).map(([m, q]) => el('span.uxb-chip', { title: B.MATS[m].name }, matPic(m, 24), num(`×${q}`))), el('span.uxb-recipe-arrow', bIcon('next', { color: '#ffb81f', scale: 1 })), el('span.uxb-chip.is-out', skuPic(x, 24), num(`×${B.batchOf(x, s)}`)), el('span.uxb-dim', bDim('hour'), t(`${B.craftDays(s, x).toFixed(1)} 日`, `${B.craftDays(s, x).toFixed(1)} d`))),
              uxpRow(t('値段', 'Price'), `${B.fmt(price)} G`),
              uxpRow(t('素材代／個', 'Cost / item'), `${B.fmt(uc)} G`),
              uxpRow(t('粗利／個', 'Margin / item'), `${B.fmt(price - uc)} G`, { tone: rate > 0 ? 'good' : 'bad', note: [mm.el, num(`${Math.round(rate * 100)}%`)] }),
            ],
            off: locked,
            cls: 'uxb-bomcard',
            attrs: { 'data-sku': x },
          }),
        );
      }
    host.append(list);
  });
}

// ---------------------------------------------------------------- 販売管理

let salesSort: SalesSort = 'rev';

export function openSalesUx(ctx: Ctx) {
  sheet(ctx, t('販売管理', 'Sales management'), 'sales', 'uxb-sales', (host, s) => {
    const rows = B.salesRows(s, salesSort);
    const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
    const badge = making[0] ? { x: making[0], text: t('工房で作っている', 'Being crafted') } : null;
    const after = () => done(ctx);
    // 上：並び替えと「販売の内訳」
    const seg = uxpSeg(
      (Object.keys(B.SALES_SORT) as SalesSort[]).map((k) => ({ value: k, label: B.SALES_SORT[k] })),
      salesSort,
      (v) => {
        salesSort = v;
        after();
      },
      { label: t('並び', 'Sort') },
    );
    host.append(el('div.uxb-sales-top', seg.el, key(t('販売の内訳（ダッシュボード）', 'Sales breakdown (dashboard)'), () => B.openSupply(ctx, { breakdown: true }), { ico: 'next' })));
    // お店ごとの売上と利益率（縦の棒と、利益率の行。赤字は斜線と言葉）
    const bs = B.shopBubbles(rows, s.shops);
    if (bs.length >= 2) {
      const lastMo = bs.every((x) => x.last);
      const best = [...bs].sort((a, b) => b.x * b.y - a.x * a.y)[0];
      // 同じ名前のお店は番号を振る（棒の下は、多いときは番号だけ）
      const names = numbered(bs.map((x) => x.name));
      const many = bs.length > 5;
      put(
        host,
        uxpHead(t(`お店の売上と利益率（${lastMo ? '先月' : '今月のここまで'}）`, `Shop sales and margin (${lastMo ? 'last month' : 'this month so far'})`), { ico: 'bars' }),
        dim(t(`いちばん稼いでいるのは${names[bs.indexOf(best)].full}`, `Top earner: ${names[bs.indexOf(best)].full}`)),
        uxpBars(bs.map((x, k) => ({ label: many ? names[k].short : names[k].full, value: x.x, kind: x.y < 0 ? 'bad' : x === best ? 'main' : '', text: many ? '' : undefined })), { height: 132 }).el,
        el('div.uxb-list.uxb-margins', bs.map((x, k) => uxpRow(names[k].full, `${Math.round(x.y)}%`, { tone: x.y < 0 ? 'bad' : x === best ? 'amber' : '', note: [t(`利益率・売上 ${B.fmt(x.x)} G・商圏の家 ${x.r} 軒`, `margin · sales ${B.fmt(x.x)} G · ${x.r} homes`), x.y < 0 ? t('（赤字）', ' (loss)') : ''] }))),
        dim(t('利益率＝（売上 − 素材代とアルバイト代）÷ 売上（維持費は入れない）', 'Margin = (sales − materials and part-timers) ÷ sales (upkeep not included)')),
      );
    }
    // お店ごとの 1 日の数（縦の積み上げ棒：下から 売れた・自店に取られた・逃した）
    const sb = B.shopBars(s);
    if (sb.length) {
      const max = Math.max(1, ...sb.map((x) => x.sold + x.lost + x.miss));
      const hot = sb.filter((x) => x.hot);
      const cols = sb.map((x) => {
        const [a, b, c] = stackParts(x, max);
        const k = uxKey(
          el('span.uxb-stack-col', num(perDay(x.sold), 'uxb-stack-v'), el('span.uxb-stack-plot', el('i.is-miss', { style: { height: `${c}%` } }), el('i.is-lost', { style: { height: `${b}%` } }), el('i.is-sold', { style: { height: `${a}%` } })), el('span.uxb-stack-l', x.name), x.hot ? uxTape(t(`取り合い ${Math.round(x.share * 100)}%`, `Overlap ${Math.round(x.share * 100)}%`), 'amber') : null),
          () => ctx.showShop?.(x.uid),
          { cls: `uxb-stack-key${x.hot ? ' is-hot2' : ''}`, attrs: { 'aria-label': t(`${x.name}：売れた ${perDay(x.sold)}・自店に取られた ${perDay(x.lost)}・逃した ${perDay(x.miss)}（1 日）`, `${x.name}: sold ${perDay(x.sold)}, taken by own shops ${perDay(x.lost)}, missed ${perDay(x.miss)} (a day)`) } },
        );
        return k;
      });
      put(
        host,
        uxpHead(t('お店ごとの 1 日の数', 'Daily units by shop'), { ico: 'bars' }),
        dim(t('棒の高さ＝来るはずのお客さん。押すと商圏を地図で見る', 'Bar height = would-be customers. Tap to see the trade area')),
        el('div.uxb-stacks', { role: 'list' }, cols),
        el('div.uxb-legend', el('span', el('i.is-sold'), t('売れた', 'Sold')), el('span', el('i.is-lost'), t('自店に取られた', 'Taken by own shops')), el('span', el('i.is-miss'), t('棚が空で逃した', 'Missed (empty shelf)'))),
        dim(
          hot.length
            ? t(`「取り合い」の札：自店どうしの取り合いが ${Math.round(B.SALES1_UI.hot * 100)}% 以上（${hot.map((x) => x.name).join('・')}）。離して建てるか、営業の「ドミナント出店」で減らせます`, `Overlap tag: ${Math.round(B.SALES1_UI.hot * 100)}%+ lost to your own shops (${hot.map((x) => x.name).join(', ')}). Build farther apart, or take Dominant clustering`)
            : t('自店どうしの取り合いは少なめ', 'Little overlap between your shops'),
        ),
      );
    }
    // 一括で変える
    const pickAll = (title: string, note: string, apply: (x: Sku) => void) =>
      B.pickExt(ctx.root, s, { title, items: B.craftable(s, !!ctx.step?.()), current: null, making, badge, note, onPick: (x) => x && apply(x), blocked: (x) => B.unsellableHere(s, B.skuParts(x)[0]), onBlocked: (x) => ctx.toast(t(`${B.skuName(x)}：${B.UNSELLABLE_TEXT(B.skuParts(x)[0])}`, `${B.skuName(x)}: ${B.UNSELLABLE_TEXT(B.skuParts(x)[0])}`)) });
    const empty = B.emptyShelfCount(s);
    const noClerk = rows.filter((r) => r.staff == null).length;
    const free = B.freeHeroes(s).length;
    const notes: string[] = [];
    if (empty === 0) notes.push(t('空き棚はありません', 'No empty shelves'));
    if (noClerk === 0) notes.push(t('どのお店にも店員がいます', 'Every shop has a clerk'));
    else if (free === 0) notes.push(t(`店員のいないお店 ${noClerk} 軒。待機中のヒーローがいません（人材登用で雇えます）`, `${noClerk} shop(s) without a clerk, but nobody is free (hire under Recruiting)`));
    else notes.push(t(`店員のいないお店 ${noClerk} 軒・待機中 ${free} 人`, `${noClerk} shop(s) without a clerk · ${free} free hero(es)`));
    const bulkDone = (msg: string) => {
      uxSfx('confirm');
      ctx.toast(msg);
      after();
    };
    put(
      host,
      uxpHead(t('一括で変える', 'Change all at once'), { ico: 'cycle' }),
      dim(t('お店ごとに同じ操作をくり返さなくてよいように。外した商品の棚の残りは裏に戻ります。', 'So you don’t repeat the same step per shop. Items taken off a shelf go to the back room.')),
      el(
        'div.uxb-bulk',
        key(t('全店の主力商品をまとめて替える…', 'Change every shop’s main product…'), () =>
          pickAll(t('全店の主力商品にするもの', 'Main product for every shop'), t('全部のお店の 1 番目の棚をこの商品にします。', 'Every shop’s first shelf will sell this.'), (x) => {
            const n = B.setMainAll(s, x);
            bulkDone(n ? t(`全店の主力商品を${B.skuName(x)}にしました（${n} 軒）`, `Main product set to ${B.skuName(x)} in ${n} shop(s)`) : t(`もう全店の主力商品が${B.skuName(x)}です`, `${B.skuName(x)} is already the main product everywhere`));
          }),
        ),
        key(
          t(`空き棚（${empty}）をまとめて埋める…`, `Fill all ${empty} empty shelves…`),
          () =>
            pickAll(t('空き棚に並べるもの', 'What to put on empty shelves'), t('全部のお店の空いている棚にこの商品を並べます。', 'Every empty shelf in every shop will sell this.'), (x) => {
              const n = B.fillEmptyShelves(s, x);
              bulkDone(t(`空き棚 ${n} つに${B.skuName(x)}を並べました`, `${B.skuName(x)} put on ${n} empty shelf(ves)`));
            }),
          { disabled: empty === 0 },
        ),
        key(
          t('店員のいないお店に、いちばん向いている待機中のヒーローを置く', 'Put the best free hero in each shop without a clerk'),
          () => {
            const done2 = B.staffEmptyShops(s);
            const shopName = (uid: number) => B.DEF[s.buildings.find((b) => b.uid === uid)?.id ?? '']?.name ?? '';
            const who = done2.map((p) => t(`${shopName(p.uid)}に${B.heroName(p.hero)}`, `${B.heroName(p.hero)} to ${shopName(p.uid)}`)).join(t('・', ', '));
            bulkDone(done2.length ? t(`${who}を置きました`, `Assigned ${who}`) : t('置ける人がいません', 'Nobody free to assign'));
          },
          { disabled: noClerk === 0 || free === 0 },
        ),
      ),
      dim(notes.join(t('・', ' · '))),
    );
    // 一覧
    host.append(uxpHead(t('お店の一覧', 'Shops'), { ico: 'shop', right: num(String(rows.length), 'uxb-count') }));
    if (!rows.length) {
      host.append(uxpEmpty(t('お店がまだありません', 'No shops yet'), { ico: 'shop', sub: t('「経営企画」→「建築」で建てましょう。', 'Build one under Strategy → Build.') }));
      return;
    }
    for (const r of rows) {
      const sh = s.shops[r.uid];
      const setPart = (n: number) => {
        B.setPart(s, r.uid, n);
        uxSfx('lamp', { step: n });
        after();
      };
      const step = (d: number) => {
        const label = d < 0 ? t('アルバイトを 1 人減らす', 'One part-timer less') : t('アルバイトを 1 人増やす', 'One part-timer more');
        const off = d < 0 ? r.part <= 0 : r.part >= r.partMax;
        const k = uxKey(el('span.ux-vh', label), () => setPart(sh.part + d), { cls: 'uxb-step', disabled: off, attrs: { 'aria-label': label, 'data-ux-quiet': '' } });
        k.querySelector('.ux-cap')?.prepend(bIcon(d < 0 ? 'minus' : 'plus', off ? { color: '#97a1cf' } : {}));
        return k;
      };
      const awM = uxMeter(r.aw, 'cyan');
      const card = el(
        `div.uxb-salesrow${r.tags.length ? '.is-jam' : ''}`,
        { 'data-shop': String(r.uid) },
        // 名前・商圏・札（押すと、そのお店の札）
        el(
          'div.uxb-salesrow-head',
          key(el('span.uxb-salesrow-name', bIcon('shop', { scale: 1 }), el('b', r.name)), () => B.openShop(ctx, r.uid)),
          el('span.uxb-dim', bDim('home'), t(`商圏の家 ${r.homes} 軒`, `${r.homes} homes nearby`)),
          r.tags.map((k) => state(k === 'closed' || k === 'unset' ? 'bad' : '', B.SALES_TAG[k], true)),
        ),
        // 店員（顔・ランク。押して替える）と、アルバイト −／＋
        el(
          'div.uxb-salesrow-crew',
          el('span.uxb-mini', el('span.uxb-cap', t('店員', 'Clerk')), r.staff ? facePic(r.staff.hero, 40, { off: r.staff.resting }) : el('span.uxb-q', '+'), r.staff ? rankTag(s, r.staff.hero, 'shop') : null, r.staff?.resting ? uxTape(t('休憩中', 'Resting'), 'amber') : null, key(r.staff ? t('かえる', 'Change') : t('置く', 'Assign'), () => B.pickClerk(ctx, r.uid, after), { cls: r.staff ? '' : 'is-empty' })),
          el('span.uxb-mini', el('span.uxb-cap', t('アルバイト', 'Part-timers')), step(-1), el('span.uxb-part-n', rollNumber(`b.sales.part.${r.uid}`, r.part, { digits: 2, dur: 160 }).el), step(1), el('span.uxb-dim', t(`${B.SHOP.partTimeWage} G／日`, `${B.SHOP.partTimeWage} G/day`))),
        ),
        // 棚（絵と名前。空き棚は「＋」。押して替える）
        el(
          'div.uxb-salesrow-shelves',
          r.shelves.map((x, k) => {
            const out = !!x && (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0;
            const label = k === 0 ? t('主力', 'Main') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`);
            return uxKey(el('span.uxb-shelfkey', el('span.uxb-cap', label), x ? skuPic(x, 32) : bIcon('plus', { color: '#97a1cf', scale: 2 }), el('b', x ? B.skuName(x) : t('空き', 'Empty')), out ? el('span.uxb-chip-w', t('品切れ', 'Out')) : null), () => B.pickShelf(ctx, r.uid, k, after, B.shelfMoved(ctx)), { cls: `uxb-shelfkey-k${x ? '' : ' is-empty'}${out ? ' is-warn' : ''}`, attrs: { 'aria-label': `${label}: ${x ? B.skuName(x) : t('空き', 'Empty')}` } });
          }),
        ),
        // 数字：今月の売上・売れる見込み・認知度
        el('div.uxb-salesrow-nums', uxpRow(t('今月の売上', 'Sales this month'), `${B.fmt(r.rev)} G`, { tone: 'amber' }), uxpRow(t('売れる見込み／月', 'Forecast / mo'), t(`${r.est} 個`, `${r.est} pcs`)), el('div.uxb-field.is-row', el('span.uxb-field-k', t('認知度', 'Awareness')), awM.el, el('span.uxb-field-v', num(`${Math.round(r.aw * 100)}%`)))),
      );
      host.append(card);
    }
  });
}

// ---------------------------------------------------------------- 宣伝広報

export function openAdsUx(ctx: Ctx) {
  const stamps = new Map<string, ReturnType<typeof uxpStamp>>();
  sheet(ctx, t('宣伝広報', 'Advertising'), null, 'uxb-ads', (host, s) => {
    const now = B.adBoost(s);
    const local = B.sectorProfile(s).ads ?? 1;
    const boost = uxpStat(t('宣伝の効き目', 'Ad boost'), Math.round(now * 100), { key: 'b.ads.boost', unit: '%', digits: 3, tone: now > 0 ? 'good' : 'dim', ico: 'horn', plus: true });
    put(
      host,
      el('div.uxp-stats', boost.el, el('div.uxb-ads-say', local !== 1 ? state('good', t(`このセクタでは宣伝の効き目 ×${local}（${B.sectorDef(s.sector ?? 'c1').name}）`, `Ads are ×${local} as strong in this sector (${B.sectorDef(s.sector ?? 'c1').name})`)) : null, el('span', now > 0 ? t(`いま自社のお店の売り場の強さが +${Math.round(now * 100)}% です。`, `Your shops have +${Math.round(now * 100)}% pull right now.`) : t('宣伝すると、しばらくの間、自社のすべてのお店が売れやすくなります。種類の違う宣伝は重ねられます。', 'Ads make all your shops sell better for a while. Different ads stack.')))),
      el('p.uxb-dim', t(`重ね掛けは合計 +${Math.round(B.AD_TIER.cap * 100)}% まで（上の段は 2 本目から半分）。いまの会社：この町のお店 ${B.myShops(s).length} 軒・お店のある町 ${B.townsWithShops(s)}・月商 ${B.money(B.companyRevenue(s))}。`, `Stacking caps at +${Math.round(B.AD_TIER.cap * 100)}% (upper tiers halve from the second). Now: ${B.myShops(s).length} shops here, shops in ${B.townsWithShops(s)} towns, monthly sales ${B.money(B.companyRevenue(s))}.`)),
    );
    // 新商品の認知：並べている商品のうち、まだ知られていないもの（宣伝で早く育つ）
    const fresh = B.market(s).filter((r) => r.mine && r.known < 1);
    if (fresh.length) {
      put(
        host,
        uxpHead(t('新しい商品の認知', 'How well new items are known'), { ico: 'eye' }),
        dim(t(`並べている日に +${Math.round(B.AWARE_GOODS.perDay * 100)}%、宣伝が効いている日はさらに +${Math.round(B.AWARE_GOODS.ad * 100)}%。知られていないうちは売れる数が減ります。`, `+${Math.round(B.AWARE_GOODS.perDay * 100)}% a day on shelves, +${Math.round(B.AWARE_GOODS.ad * 100)}% more while an ad runs. Less-known items sell fewer.`)),
        el(
          'div.uxb-list',
          fresh.map((r) => {
            const m = uxMeter(r.known, 'cyan');
            return el('div.uxb-field.is-row.has-pic', skuPic(B.sku(r.p.key, 'C'), 32), el('span.uxb-field-k', r.p.name), m.el, el('span.uxb-field-v', num(`${Math.round(r.known * 100)}%`)));
          }),
        ),
      );
    }
    host.append(uxpHead(t('宣伝を出す', 'Run an ad'), { ico: 'horn' }));
    // いちばん見込みの大きい（元が取れる）宣伝のキーだけ、主役
    const open = B.ADS.filter((a) => !B.adLock(s, a.id) && (s.ads[a.id] ?? 0) <= 0 && s.money >= B.adCost(s, a.id) && B.myShops(s).length > 0);
    const best = open.map((a) => ({ a, g: B.adGain(s, a.id) })).filter((x) => x.g > 0).sort((p, q) => q.g - p.g)[0]?.a.id;
    for (const a of B.ADS) {
      const lock = B.adLock(s, a.id);
      const left = s.ads[a.id] ?? 0;
      const cost = B.adCost(s, a.id);
      const scope = a.scope === 'all' ? t('全店', 'All shops') : a.scope === 'land' ? t('同じランドの全店', 'All shops in this land') : t('同じ町の全店', 'All shops in this town');
      const stamp = uxpStamp(t('実施中', 'Running'), { kind: 'amber', ico: 'horn' });
      stamps.set(a.id, stamp);
      if (left > 0) stamp.show();
      const gap = uxpGap(s.money, cost);
      if (lock || left > 0) gap.el.hidden = true;
      const foot: (HTMLElement | null)[] = [];
      if (lock) foot.push(el('span.uxb-dim', bDim('lock'), t(`解禁：${noEmoji(lock)}`, `Unlocks: ${noEmoji(lock)}`)), uxpPrice(cost));
      else if (left > 0) {
        const m = uxMeter(left / a.days);
        foot.push(el('div.uxb-field.is-row', el('span.uxb-field-k', t('実施中', 'Running')), m.el, el('span.uxb-field-v', t('あと ', ''), num(left), t(' 日', ' d left'))));
      } else {
        if (B.myShops(s).length) {
          const g = B.adGain(s, a.id);
          const where = B.adWide(a) ? t('会社の全店で', 'across all shops') : t('この町で', 'here');
          foot.push(el(`span.uxb-gain${g > 0 ? '' : '.is-wait'}`, bIcon(g > 0 ? 'up' : 'hour', { color: g > 0 ? '#36e08b' : '#ffb81f', scale: 1 }), g > 0 ? t(`見込み：+${B.money(g)}（${where}元が取れる）`, `Expected: +${B.money(g)} (pays off ${where})`) : t(`見込み：−${B.money(-g)}（${where}はまだ元が取れない）`, `Expected: −${B.money(-g)} (won’t pay off ${where} yet)`)));
          const be = B.adBreakeven(s, a.id);
          if (be) foot.push(el('span.uxb-dim', be.need == null ? t('いまは売上が伸びない（重ね掛けの上限か、棚の頭打ち）ので元が取れない', 'No lift right now (stacking cap or shelves maxed), so it can’t pay off') : be.need <= 0 ? t(`任せている町の伸びだけで元が取れる（この町の月商の見込み ${B.money(be.now)}）`, `Delegated towns alone pay for it (sales here now ${B.money(be.now)}/mo)`) : t(`元が取れる月商の目安 ${B.money(be.need)}〜（いまの見込み ${B.money(be.now)}）`, `Pays off from about ${B.money(be.need)}/mo in sales (now ${B.money(be.now)})`)));
        }
        foot.push(uxpPrice(cost), gap.el);
      }
      const run = () => {
        const cur = ctx.s();
        if (cur.money < cost) return gap.nudge();
        const err = B.runAd(cur, a.id);
        if (err) {
          uxSfx('deny');
          if (err === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          return;
        }
        ctx.toast(t(`「${a.name}」を始めました`, `Started: ${a.name}`));
        done(ctx);
        const card = document.querySelector<HTMLElement>(`.uxb-ads [data-ad="${a.id}"]`);
        payFx(card, 9);
        stampLater(() => {
          uxSfx('stamp');
          stamps.get(a.id)?.hit(card);
        });
      };
      host.append(
        uxpCard({
          pic: el('span.uxb-inv-pic', bIcon(B.adWide(a) ? 'globe' : 'horn', { scale: 3, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' }), uxLamp('', left > 0, left > 0)),
          name: a.name,
          tags: [B.adUpper(a) ? uxTape(t('上の段', 'Upper tier'), 'dark') : null, stamp.el],
          desc: el('span', [`${scope}`, t(`${a.days} 日 +${Math.round(a.boost * 100)}%`, `${a.days} d, +${Math.round(a.boost * 100)}%`), a.brand ? t(`ブランド力 +${a.brand}（期間の終わりに）`, `Brand +${a.brand} (when it ends)`) : ''].filter(Boolean).join(t('・', ' · '))),
          foot,
          right: lock || left > 0 ? null : uxKey(t('実施する', 'Run'), run, { kind: best === a.id ? 'main' : '', cls: 'uxb-buykey', strong: true, attrs: { 'data-ux-quiet': '' } }),
          off: !!lock,
          cls: `uxb-ad${B.adUpper(a) ? ' is-upper' : ''}${lock ? ' is-locked' : ''}`,
          attrs: { 'data-ad': a.id },
        }),
      );
    }
  });
}
