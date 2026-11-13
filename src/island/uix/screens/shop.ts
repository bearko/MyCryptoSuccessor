/**
 * 段 UIX3b：お店の札（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：お店の札」）。
 * 器は今の札（p1/screens.ts の open()）：閉じ方・時間の止め方・チュートリアルの一言（mineTip の「shop」）は今のまま。
 * 上に店内の様子（今の場面そのまま：お客さん・棚・店員。光る「＋」の枠＝今の目印 isl-shop-spot）、その下にタブ：
 * 売り場（棚・主力商品・値段・店員・従業員）／売れ行き（売上の桁・先月と今月の縦の棒・売れた数と逃した数・満足・認知）／設備（設備投資・名物店主）。
 * 棚に並べる・店員を置くは、今の入口（pickShelf・pickHero）＝新しい選ぶ引き出し。設備を買うと「導入済」が打たれる。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { rollNumber, uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpGap, uxpPrice, uxpRow, uxpStamp, uxpStat, uxpTabs } from '../sparts';
import { B } from './b-deps';
import { bDim, bIcon } from './b-icons';
import { bHead, block, dim, done, heroSlot, key, num, payFx, put, root, setText, sigOf, skuPic, stampLater, state, type Block, whyLine } from './b-kit';
import './shop.css';
import type { Sku } from '../../p1/data';
import type { ShopState } from '../../p1/model';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

/** お店のいまの様子（見出しのランプと言葉）：今の 1 行（crewLine）と同じ決まり */
export type ShopOpen = 'open' | 'self' | 'weak' | 'closed';
export function shopOpen(sh: Pick<ShopState, 'staff' | 'part'>, resting: boolean, selfMin: number): ShopOpen {
  if (sh.staff == null) return sh.part > 0 ? 'self' : 'closed';
  if (!resting) return 'open';
  return sh.part >= selfMin ? 'self' : sh.part > 0 ? 'weak' : 'closed';
}
/** 棚 1 段の様子：空（まだ選んでいない）・品切れ（棚にも裏にも無い）・入荷待ち（裏にはある）・並んでいる */
export type ShelfLook = 'empty' | 'out' | 'back' | 'ok';
export function shelfLook(x: Sku | null, onShelf: number, back: number): ShelfLook {
  if (!x) return 'empty';
  if (onShelf > 0) return 'ok';
  return back > 0 ? 'back' : 'out';
}
/** 満足の言葉（色だけにしない） */
export const satWord = (sat: number) => (sat > 0.8 ? t('満足', 'Happy') : sat > 0.65 ? t('やや不満', 'A bit unhappy') : t('不満', 'Unhappy'));
/** タブの並び（チュートリアルのあいだは、設備を出さない：今の画面と同じ） */
export type ShopTab = 'floor' | 'sales' | 'equip';
export const shopTabs = (tut: boolean): ShopTab[] => (tut ? ['floor', 'sales'] : ['floor', 'sales', 'equip']);

/** 設備の絵（設備投資の id → アイコン） */
const INVEST_ICO: Record<string, string> = { shelves: 'shelf', sign: 'flag', staffroom: 'cup', fixtures: 'bench', backroom: 'box' };

// ---------------------------------------------------------------- 画面

/** お店の札を開く（p1/screens.ts の openShop から。入のときだけ） */
export function openShopUx(ctx: Ctx, uid: number) {
  const b = ctx.s().buildings.find((x) => x.uid === uid);
  if (!b) return;
  let view: ReturnType<typeof build> | null = null;
  B.open(ctx, B.DEF[b.id].name, (body) => {
    view ??= build(ctx, uid);
    view.mount(body);
  });
}

function build(ctx: Ctx, uid: number) {
  const s = () => ctx.s();
  const sh = () => s().shops[uid];
  const here = () => s().buildings.find((x) => x.uid === uid) ?? null;
  const name = () => B.DEF[here()?.id ?? '']?.name ?? '';
  const tipBox = el('div.uxb-tip');
  const main = el('div.uxb-shop-main');
  const e = root('uxb-shop', tipBox, main);
  const stamps = new Map<string, ReturnType<typeof uxpStamp>>();
  const gaps = new Map<string, ReturnType<typeof uxpGap>>();
  let blocks: Block[] = [];
  let tabs: ReturnType<typeof uxpTabs<ShopTab>> | null = null;
  let built = false;
  // 見出しのランプ（札を 1 つで開いているときだけ。✕ は今のキーのまま）
  const runLamp = uxLamp('good', true, true);
  const runTxt = el('span');
  const run = el('span.ux-sheet-run.uxb-run', runLamp, runTxt);

  /** 設備を買う：足りなければ「あと N G」、買えたら金貨が飛んで「導入済」（最後の段）か、段のランプが点く */
  function buy(id: string, label: string) {
    const st = s();
    const b = here();
    if (!b) return;
    const cost = B.investCost(b, id);
    if (cost == null || b.left > 0) return uxSfx('flap');
    if (st.money < cost) return gaps.get(id)?.nudge();
    const err = B.invest(st, b.uid, id);
    if (err) {
      uxSfx('deny');
      if (err === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
      return;
    }
    ctx.toast(t(`「${label}」を導入しました`, `Installed: ${label}`));
    done(ctx);
    const card = e.querySelector<HTMLElement>(`[data-invest="${id}"]`);
    payFx(card, 9);
    stampLater(() => {
      uxSfx('stamp');
      const lit = card?.querySelector<HTMLElement>('.uxb-pips > .is-on:last-of-type');
      lit?.classList.add('is-new');
      if (B.investCost(b, id) == null) stamps.get(id)?.hit(card);
    });
  }

  function buildAll() {
    // ---- 店内の様子（今の場面。光る「＋」の枠・「替える」の札・入荷待ちの札・店長と従業員の 1 行は、今の要素のまま）
    const scene = block(
      'div.uxb-shop-scene',
      () => {
        const st = s();
        const x = sh();
        const mainX = x?.shelves[0] ?? null;
        return sigOf(!!x, mainX, mainX ? (x.shelf[mainX] ?? 0) <= 0 : '', x?.staff, (x?.part ?? 0) > 0, ctx.step?.(), x ? B.crewLine(st, uid)?.textContent : '');
      },
      (host) => {
        host.append(B.shopView(ctx, uid, () => done(ctx)));
      },
    );

    // ---- 売り場のタブ：棚（左が主力商品）・店員・従業員
    const shelves = block(
      'div.uxb-list',
      () => {
        const st = s();
        const x = sh();
        return sigOf(x.shelves, x.shelves.map((y) => (y ? [x.shelf[y] ?? 0, x.storage[y] ?? 0] : 0)), B.shelvesAuto(st), ctx.step?.(), here() ? B.investCost(here()!, 'shelves') : '');
      },
      (host) => {
        const st = s();
        const x = sh();
        const auto = B.shelvesAuto(st);
        const b = here();
        host.append(bHead(t('棚', 'Shelves'), { ico: 'shop' }), dim(auto ? t('左が主力商品。並ぶのは、工房で作っている商品です。', 'Left is the main item; shelves follow the workshop.') : t('左が主力商品です。', 'Left is the main product.')));
        const grid = el('div.uxb-shelves');
        x.shelves.forEach((y, k) => {
          const on = y ? (x.shelf[y] ?? 0) : 0;
          const back = y ? (x.storage[y] ?? 0) : 0;
          const look = shelfLook(y, on, back);
          const hot = ctx.step?.() === 'sell' && k === 0 && !y;
          const label = k === 0 ? t('主力商品', 'Main') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`);
          // 今の目印（isl-slot・isl-ext-slot・is-empty・is-warn・is-hot）を、キーに同じ意味で付ける
          const pick = uxKey(y ? t('替える', 'Change') : t('選ぶ', 'Choose'), () => B.pickShelf(ctx, uid, k, () => done(ctx), B.shelfMoved(ctx)), { cls: `uxb-slot-key isl-slot isl-ext-slot${y ? '' : ' is-empty'}${look === 'out' ? ' is-warn' : ''}${hot ? ' is-hot' : ''}`, attrs: { 'aria-label': t(`${label}：${y ? '替える' : '選ぶ'}`, `${label}: ${y ? 'Change' : 'Choose'}`) } });
          const card = el(`div.uxb-shelf.is-${look}${k === 0 ? '.is-main' : ''}`, { 'data-shelf': String(k) }, el('span.uxb-shelf-label', k === 0 ? uxTape([bIcon('target', { color: '#1a1c2e', hi: '#1a1c2e', lo: '#7a3f06', scale: 1 }), el('b', label)], 'amber') : uxTape(label, 'dark')));
          if (y) {
            const shelfOdo = rollNumber(`b.shelf.${uid}.${k}.on`, on, { digits: 3, size: 's' });
            const backOdo = rollNumber(`b.shelf.${uid}.${k}.back`, back, { digits: 3, size: 's' });
            const sm = uxMeter(on / Math.max(1, B.SHOP.shelfCap), on > 0 ? 'good' : '');
            card.append(
              el('span.uxb-shelf-pic', skuPic(y, 64)),
              el('span.uxb-shelf-body', el('b.uxb-shelf-name', B.skuName(y)), uxpPrice(B.skuPrice(y)), el('span.uxb-shelf-n', el('span', t('棚', 'Shelf')), shelfOdo.el, el('span', t('裏', 'Back')), backOdo.el), sm.el, look === 'out' ? state('bad', t('品切れ。工房から届くのを待っています', 'Sold out. Waiting for the workshop'), true) : look === 'back' ? state('', t('裏から棚へ並べています', 'Restocking from the back')) : null),
              pick,
            );
          } else card.append(el('span.uxb-shelf-pic.is-none', bIcon('plus', { color: '#4a5486', scale: 3 })), el('span.uxb-shelf-body', el('span.ux-t-dim', t('まだ並べていません', 'Nothing here yet'))), pick);
          grid.append(card);
        });
        host.append(grid);
        if (b && B.investCost(b, 'shelves') != null && !ctx.step?.()) host.append(el('p.uxb-dim', t('棚は「設備」のタブの「棚を増やす」で増やせます（お店ごと）。', 'Add shelves with “More shelves” on the Equipment tab (per shop).')));
      },
    );
    const crew = block(
      'div.uxb-list',
      () => {
        const st = s();
        const x = sh();
        const cl = x.staff != null ? B.staffOf(st, x.staff) : null;
        return sigOf(x.staff, cl?.resting, cl?.stamina, cl?.level, x.part, B.partMax(st, uid), ctx.step?.());
      },
      (host) => {
        const st = s();
        const x = sh();
        const max = B.partMax(st, uid);
        const people = el('div.uxb-people', { role: 'img', 'aria-label': t(`従業員 ${x.part} 人（上限 ${max} 人）`, `${x.part} staff (max ${max})`) });
        for (let k = 0; k < max; k++) people.append(el(`span.uxb-person${k < x.part ? '.is-on' : ''}`, bIcon('person', k < x.part ? { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: 2 } : { color: '#3a4266', hi: '#4a5486', lo: '#20253d', scale: 2 })));
        const setPart = (n: number) => {
          B.setPart(st, uid, n);
          uxSfx('lamp', { step: n });
          done(ctx);
        };
        const step = (d: number) => {
          const label = d < 0 ? t('従業員を 1 人減らす', 'One staff less') : t('従業員を 1 人増やす', 'One staff more');
          const off = d < 0 ? x.part <= 0 : x.part >= max;
          const k = uxKey(el('span.ux-vh', label), () => setPart(x.part + d), { cls: 'uxb-step', disabled: off, attrs: { 'aria-label': label, 'data-ux-quiet': '' } });
          k.querySelector('.ux-cap')?.prepend(bIcon(d < 0 ? 'minus' : 'plus', off ? { color: '#97a1cf' } : {}));
          return k;
        };
        const partOdo = rollNumber(`b.part.${uid}`, x.part, { digits: 2, dur: 160 });
        host.append(
          bHead(t('売り場の人', 'Floor staff'), { ico: 'people' }),
          heroSlot(st, {
            label: t('店員', 'Clerk'),
            task: 'shop',
            hero: x.staff,
            empty: t('店員を置く', 'Assign a clerk'),
            hot: ctx.step?.() === 'sell' && x.staff == null && x.part === 0,
            onTap: () =>
              B.pickHero(ctx.root, st, {
                title: t(`${name()}の店員`, `Clerk for ${name()}`),
                task: 'shop',
                current: x.staff,
                onPick: (v) => {
                  if (v == null && x.staff != null) B.assign(st, x.staff, null);
                  else if (v != null) B.assign(st, v, 'shop', uid);
                  done(ctx);
                },
              }),
          }),
          el(
            'div.uxb-part',
            el('span.uxb-slot-label', t(`従業員（${B.SELF_RUN.min} 人で休む日も営業）`, `Staff (${B.SELF_RUN.min} keep it open on days off)`)),
            people,
            el('div.uxb-part-row', step(-1), el('span.uxb-part-n', partOdo.el, el('span', t(`人／上限 ${max}`, ` / ${max}`))), step(1)),
            el('span.uxb-dim', bDim('coin'), t(`1 人 1 日 ${B.SHOP.partTimeWage} G`, `${B.SHOP.partTimeWage} G/day each`)),
          ),
          dim(t('店員かアルバイトがいれば、届いた商品を棚に並べて自動で売ります。販売は INT が高いヒーローが得意です。', 'With a clerk or part-timer, deliveries are shelved and sold automatically. High-INT heroes sell best.')),
        );
      },
    );

    // ---- 売れ行きのタブ
    const sales = block(
      'div.uxb-list',
      () => {
        const x = sh();
        return sigOf(x.rev, x.cost, x.last, x.mu, x.muLast, Math.round(x.sat * 100), Math.round((x.aw ?? 1) * 100));
      },
      (host) => {
        const x = sh();
        const rev = uxpStat(t('今月の売上', 'Sales this month'), x.rev, { key: `b.shop.rev.${uid}`, unit: 'G', digits: Math.max(6, String(Math.round(x.rev)).length), size: 'l', tone: 'amber', plus: true, ico: 'coin' });
        const satM = uxMeter(x.sat, x.sat > 0.8 ? 'good' : '');
        satM.el.classList.toggle('is-full', x.sat <= 0.65);
        const aw = x.aw ?? 1;
        const awM = uxMeter(aw, 'cyan');
        const bars = uxpBars(
          [
            { label: t('先月', 'Last month'), value: x.last?.rev ?? 0 },
            { label: t('今月', 'This month'), value: x.rev, kind: 'main' },
          ],
          { height: 132, cls: 'uxb-shop-bars' },
        );
        put(
          host,
          el('div.uxp-stats', rev.el),
          bHead(t('売上：先月と今月', 'Sales: last month and this month'), { ico: 'bars' }),
          x.last ? null : dim(t('先月の記録は、月の締めのあとに出ます。', 'Last month appears after the first month closes.')),
          bars.el,
          uxpRow(t('今月の費用（素材代・アルバイト代）', 'Costs this month (materials, part-timers)'), `${B.fmt(x.cost)} G`, { ico: 'coin' }),
          x.mu ? uxpRow(t('今月 売れた数', 'Units sold this month'), t(`${B.fmt(x.mu.sold)} 個`, `${B.fmt(x.mu.sold)}`), { ico: 'cart', tone: 'good' }) : null,
          x.mu && x.mu.miss > 0 ? uxpRow(t('棚が空で逃した数（見込み）', 'Missed while shelves were empty (est.)'), t(`${B.fmt(x.mu.miss)} 個`, `${B.fmt(x.mu.miss)}`), { ico: 'warn', tone: 'amber', note: t('品出しが追いつくと、このぶんも売れます', 'Faster shelving would sell these too') }) : null,
          x.muLast ? uxpRow(t('先月 売れた数', 'Units sold last month'), t(`${B.fmt(x.muLast.sold)} 個`, `${B.fmt(x.muLast.sold)}`), { tone: 'dim' }) : null,
          bHead(t('お客さん', 'Customers'), { ico: 'people' }),
          el('div.uxb-field', el('span.uxb-field-k', bDim('smile'), t('お客さんの満足', 'Customer mood')), satM.el, el('span.uxb-field-v', num(`${Math.round(x.sat * 100)}%`), el('span', satWord(x.sat)))),
          dim(t('棚が空になる日が続くと満足が下がり、売れにくくなります。', 'Empty shelves lower the mood and slow sales.')),
          el('div.uxb-field', el('span.uxb-field-k', bDim('eye'), t('お店の認知度', 'Shop awareness')), awM.el, el('span.uxb-field-v', num(`${Math.round(aw * 100)}%`))),
          aw < 0.7 ? dim(t('開店したてのお店は、まだ知られていません。宣伝すると早く広まります。', 'A new shop isn’t well known yet. Ads spread the word faster.')) : null,
        );
      },
    );

    // ---- 設備のタブ：設備投資（いま効く順）・名物店主
    const equip = block(
      'div.uxb-list',
      () => {
        const st = s();
        const b = here();
        if (!b) return '';
        const list = B.INVESTS.filter((v) => v.kind === 'shop');
        return sigOf(b.left, list.map((v) => [B.invLv(b, v.id), (B.investCost(b, v.id) ?? 0) > st.money ? st.money : 'ok']), ctx.step?.() ? '' : B.shopInvestOrder(st, b), B.has(st, 'd_shop'), st.dustShop);
      },
      (host) => {
        const st = s();
        const b = here();
        if (!b) return;
        host.append(bHead(t('設備投資', 'Capital investment'), { ico: 'gear' }), dim(t('このお店の棚・アルバイトの上限・看板など。建物ごと（セクタごと）の設備です。', 'Shelves, part-timer limit, signboard and more for this shop. Equipment belongs to each building (each sector).')));
        const gains = b.left <= 0 && st.shops[b.uid] && !ctx.step?.() ? B.shopInvestOrder(st, b) : null;
        const list = B.INVESTS.filter((v) => v.kind === 'shop');
        if (gains) list.sort((p, q) => gains.findIndex((g) => g.id === p.id) - gains.findIndex((g) => g.id === q.id));
        for (const v of list) {
          const lv = B.invLv(b, v.id);
          const cost = B.investCost(b, v.id);
          const max = cost == null;
          const busy = b.left > 0;
          const gi = gains?.find((g) => g.id === v.id);
          const stamp = uxpStamp(t('導入済', 'Installed'));
          stamps.set(v.id, stamp);
          if (max) stamp.show();
          const gap = uxpGap(st.money, cost ?? 0);
          gaps.set(v.id, gap);
          if (max || busy) gap.el.hidden = true;
          const pips = v.cost.length > 1 ? el('span.uxb-pips', { 'aria-label': `${lv}/${v.cost.length}`, title: `${lv}/${v.cost.length}` }, v.cost.map((_c, i) => uxLamp('good', i < lv))) : null;
          const gain = gi && !max ? (gi.weak ? el('span.uxb-dim', t('いまは効かない（販売は増えない）', 'No effect now (sales won’t rise)')) : el('span.uxb-gain', bIcon('up', { color: '#36e08b', scale: 1 }), v.id === 'shelves' ? t(`別の商品を並べて +${Math.round(gi.units * 10) / 10} 個／月`, `+${Math.round(gi.units * 10) / 10}/mo with a new item`) : t(`見込み +${Math.round(gi.units * 10) / 10} 個／月`, `Expected +${Math.round(gi.units * 10) / 10}/mo`))) : null;
          const buyKey = uxKey(max ? t('導入済', 'Installed') : busy ? t('工事中', 'Under construction') : t('買う', 'Buy'), () => buy(v.id, v.name), { kind: max || busy ? 'flat' : st.money < (cost ?? 0) ? '' : gi && !gi.weak && gains?.[0]?.id === v.id ? 'main' : '', disabled: max || busy, cls: 'uxb-buykey', strong: true, attrs: { 'data-ux-quiet': '' } });
          host.append(
            uxpCard({
              pic: el('span.uxb-inv-pic', bIcon(INVEST_ICO[v.id] ?? 'gear', { scale: 3, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' }), uxLamp('good', lv > 0)),
              name: v.name,
              tags: [pips, stamp.el],
              desc: v.note,
              foot: [gain, max ? null : uxpPrice(cost ?? 0), gap.el],
              right: buyKey,
              off: !!gi?.weak && !max,
              cls: 'uxb-inv',
              attrs: { 'data-invest': v.id },
            }),
          );
        }
        // 名物店主（スキル）：1 軒だけ選べる。替えられる
        if (B.has(st, 'd_shop')) {
          const mine = st.dustShop === uid;
          const otherB = st.dustShop != null && st.dustShop !== uid && st.shops[st.dustShop] ? st.buildings.find((y) => y.uid === st.dustShop) : null;
          const other = otherB ? (B.DEF[otherB.id]?.name ?? '') : '';
          const fs = uxpStamp(t('名物店主', 'Famous shop'), { ico: 'star' });
          stamps.set('famous', fs);
          if (mine) fs.show();
          host.append(
            bHead(t('名物店主', 'Famous shopkeeper'), { ico: 'star' }),
            uxpCard({
              pic: el('span.uxb-inv-pic', bIcon('star', { scale: 3, color: '#ffb81f', hi: '#ffe394', lo: '#b8650d' }), uxLamp('', mine)),
              name: mine ? t('このお店が名物店主のお店です', 'This is your famous shopkeeper’s shop') : t('名物店主のお店にする', 'Make this the famous shop'),
              tags: fs.el,
              desc: t('選んだ 1 軒の売り場の強さ +40%。いつでも替えられます。', 'One chosen shop gets +40% pull. You can switch any time.'),
              right: mine
                ? null
                : key(
                    other ? t(`ここに替える（いまは${other}）`, `Switch here (now: ${other})`) : t('名物店主にする', 'Make it famous'),
                    () => {
                      if (B.setDustShop(st, uid)) ctx.toast(t(`${name()}を名物店主のお店にしました（売り場の強さ +40%）`, `${name()} is now the famous shop (pull +40%)`));
                      done(ctx);
                      stampLater(() => {
                        uxSfx('stamp');
                        stamps.get('famous')?.hit(e.querySelector('.uxb-famous'));
                      }, 120);
                    },
                    { kind: 'main', strong: true },
                  ),
              cls: 'uxb-famous',
            }),
          );
        }
      },
    );

    const floor = el('div.uxb-list', shelves.el, crew.el);
    tabs = uxpTabs<ShopTab>(
      [
        { key: 'floor', label: t('売り場', 'Floor'), pane: floor },
        { key: 'sales', label: t('売れ行き', 'Sales'), pane: sales.el },
        { key: 'equip', label: t('設備', 'Equipment'), pane: equip.el },
      ],
      { flow: true, cls: 'uxb-shop-tabs' },
    );
    blocks = [scene, shelves, crew, sales, equip];
    main.replaceChildren(scene.el, tabs.el);
  }

  function sync() {
    const st = s();
    const x = sh();
    tipBox.replaceChildren();
    B.mineTip(ctx, 'shop', tipBox);
    if (!x) {
      // 工事中：今の画面と同じ一言
      main.replaceChildren(whyLine(t('工事が終わると開けます。', 'Opens when construction is done.'), 'crane'));
      run.hidden = true;
      return;
    }
    if (!built) {
      built = true;
      buildAll();
    }
    const tut = !!ctx.step?.();
    const shown = shopTabs(tut);
    for (const k of ['floor', 'sales', 'equip'] as ShopTab[]) tabs!.key(k).hidden = !shown.includes(k);
    if (!shown.includes(tabs!.now)) tabs!.set('floor', true);
    for (const b of blocks) b.sync();
    // 見出しのランプ：営業中・従業員で営業中・手伝いだけ・閉店中（色だけにしない）
    const cl = x.staff != null ? B.staffOf(st, x.staff) : null;
    const o = shopOpen(x, !!cl?.resting, B.SELF_RUN.min);
    run.hidden = false;
    runLamp.className = `ux-lamp ${o === 'open' || o === 'self' ? 'ux-lamp--good is-on is-blink' : o === 'weak' ? 'is-on' : 'ux-lamp--bad is-on is-blink'}`;
    setText(runTxt, o === 'open' ? t('営業中', 'Open') : o === 'self' ? t('従業員で営業中', 'Staff-run') : o === 'weak' ? t('手伝いだけ', 'Barely open') : t('閉店中', 'Closed'));
    run.classList.toggle('is-idle', o !== 'open' && o !== 'self');
  }

  return {
    el: e,
    sync,
    mount(body: HTMLElement) {
      body.append(e);
      const head = body.closest('.isl-sheet')?.querySelector<HTMLElement>('.isl-sheet-head');
      const h2 = head?.querySelector('h2');
      if (h2 && !body.classList.contains('isl-part') && !run.isConnected) {
        body.closest('.isl-sheet')?.classList.add('uxb-sheet');
        h2.after(run);
      }
      sync();
    },
  };
}
