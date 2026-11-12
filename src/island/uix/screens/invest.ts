/**
 * 段 UIX3k：設備投資（方向 C「管制卓」。入のときだけ。docs/ISLAND_UIX.md「画面：設備投資」）。
 * 出す中身・並び・値段は今の画面（p1/screens.ts の openInvest・investList）と同じ（p1/uxk.ts の investView が、今と同じ計算で作る）。
 * - 上：資金（桁の回るカウンター。買うと回って減る）・導入した設備の段（n / N）
 * - 建物ごとの節（名前・工事中のランプとあと N 日）に、設備のカード（絵・段のランプ・説明・見込み・値段・「あと N G」の目盛り・買うキー）
 * - 買う手応え：キーを押し込む → レジの音・金貨が資金から飛ぶ・資金が回って減る・カードが光って揺れる → 420ms 後に段のランプが点き、最後の段なら「導入済」が打たれる
 * - 足りないとき：責めない（やわらかい音・目盛りが進む・「あと N G。売上がたまれば届きます」）。キーは押せる（押すと目盛りが動く）
 * - 主役のキー（前の層）は 1 つ：上から見て、いま買えるいちばん上の設備（お店は、いま効く順に並んでいる）
 * 器は今の札（open()。keep：画面は 1 回だけ組み、描き直しは値だけ合わせる。手応えの動きが作り直しで切れない）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { coinsFly } from '../fx';
import { later } from '../loop';
import { shake, uxKey, uxLamp, vibrate } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpCard, uxpEmpty, uxpGap, uxpHead, uxpPrice, uxpReplay, uxpStamp, uxpStat } from '../sparts';
import { K } from './k-deps';
import { kIcon } from './k-icons';
import './k-screens.css';
import type { InvestView } from '../../p1/uxk';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
/** 買う手応えの間（キーを押してから、段のランプ・「導入済」が打たれるまで） */
export const BUY_MS = 420;
/** 設備の絵（12×12 のドットの絵。この束・同じ束の絵・土台の絵の名前） */
export const INVEST_ICO: Record<string, string> = {
  shelves: 'shelf',
  sign: 'flag',
  staffroom: 'people',
  fixtures: 'layers',
  backroom: 'box',
  bench: 'bench',
  carts: 'cart',
  truck: 'truck',
  stockroom: 'shelf',
  tools: 'wrench',
  breakroom: 'cup',
  rack: 'bricks',
  dock: 'box',
  hall: 'gem',
};
/** 建物の種類の絵 */
export const KIND_ICO: Record<string, string> = { shop: 'shop', workshop: 'hammer', warehouse: 'box', depot: 'truck', museum: 'gem' };
type Item = InvestView[number]['items'][number];
/** キーの様子：max＝導入済（平ら）・busy＝工事中（平ら）・short＝足りない（押せる：目盛りが動く）・buy＝買える */
export type BuyState = 'max' | 'busy' | 'short' | 'buy';
export function buyState(it: Pick<Item, 'cost'>, money: number, left: number): BuyState {
  if (it.cost == null) return 'max';
  if (left > 0) return 'busy';
  return money < it.cost ? 'short' : 'buy';
}
/** 主役のキー（前の層に出す 1 つ）：上から見て、いま買える設備のうち、効かないもの（いまは販売が増えない）を除いたいちばん上 */
export function mainPick(v: InvestView, money: number): string | null {
  for (const b of v) for (const it of b.items) if (buyState(it, money, b.left) === 'buy' && !it.gain?.weak) return `${b.uid}:${it.id}`;
  return null;
}
/** 見込みの一言（今の画面と同じ言葉） */
export function gainText(id: string, g: NonNullable<Item['gain']>): string {
  if (g.weak) return t('いまは効かない（販売は増えない）', 'No effect now (sales won’t rise)');
  return id === 'shelves' ? t(`別の商品を並べて +${g.units} 個／月`, `+${g.units}/mo with a new item`) : t(`見込み +${g.units} 個／月`, `+${g.units}/mo expected`);
}

// ---------------------------------------------------------------- 画面
const setText = (e: Element, text: string) => {
  if (e.textContent !== text) e.textContent = text;
};
const keyText = (b: HTMLElement, text: string) => {
  const x = b.querySelector('b');
  if (x) setText(x, text);
};
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
/** 資金の数字の場所（金貨が飛び立つ所）：この画面の資金の札 → 上の帯 */
function fundsAt(root: HTMLElement): { x: number; y: number } {
  const e = root.querySelector('.uxk-iv-funds') ?? document.querySelector('[data-ux-funds], #isl-ui .isl-hud .isl-stat');
  const r = e?.getBoundingClientRect();
  return r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 70, y: 40 };
}

interface CardView {
  uid: number;
  id: string;
  el: HTMLElement;
  key: HTMLButtonElement;
  sync: (b: InvestView[number], it: Item, money: number, main: boolean) => void;
}
interface Inst {
  struct: string;
  sync: () => void;
}
const insts = new WeakMap<HTMLElement, Inst>();
const structOf = (v: InvestView) => v.map((b) => `${b.uid}:${b.id}:${b.items.map((x) => x.id).join(',')}`).join('|');

/** 設備投資を開く（p1/screens.ts の openInvest から） */
export function openInvestUx(ctx: Ctx) {
  K.open(
    ctx,
    t('設備投資', 'Capital investment'),
    (body) => {
      const v = K.investView(ctx.s(), !!ctx.step?.());
      const cur = insts.get(body);
      if (cur && cur.struct === structOf(v)) return cur.sync();
      body.replaceChildren();
      const inst = build(ctx, body, v);
      insts.set(body, inst);
    },
    undefined,
    true,
  );
}

function build(ctx: Ctx, body: HTMLElement, v0: InvestView): Inst {
  const S = () => ctx.s();
  const root = el('div.uxk-iv.uxk-calm');
  const total = (v: InvestView) => v.reduce((n, b) => n + b.items.reduce((m, x) => m + x.max, 0), 0);
  const have = (v: InvestView) => v.reduce((n, b) => n + b.items.reduce((m, x) => m + x.lv, 0), 0);
  const funds = uxpStat(t('資金', 'Funds'), Math.max(0, S().money), { key: 'uxk.iv.funds', unit: 'G', size: 's', tone: 'amber', digits: Math.max(6, String(Math.round(Math.max(0, S().money))).length) });
  funds.el.classList.add('uxk-iv-funds');
  const lvs = uxpStat(t('導入した設備（段）', 'Upgrades installed'), have(v0), { key: 'uxk.iv.lv', size: 's', digits: Math.max(2, String(total(v0)).length), unit: `/ ${total(v0)}` });
  root.append(el('div.uxp-stats.uxk-iv-top', funds.el, lvs.el), el('p.uxk-note', t('建物ごとに設備を良くします。地図で自社の建物をタップしても投資できます。', 'Upgrade each of your buildings. You can also invest by tapping a building on the map.')));

  const cards: CardView[] = [];
  const heads = new Map<number, { note: HTMLElement; lamp: HTMLElement }>();
  /** 「導入済」を打っている途中のカード（そのあいだは描き直さない） */
  const stamping = new Set<string>();

  if (!v0.length) root.append(uxpEmpty(t('まだ建物がありません。', 'No buildings yet.'), { ico: 'shop' }));
  for (const b of v0) {
    const lamp = uxLamp('', false, true);
    const note = el('span.uxk-iv-busy');
    const sec = el('section.uxk-iv-sec', uxpHead([kIcon(KIND_ICO[b.kind ?? ''] ?? 'gear', ink), el('b', b.name)], { right: el('span.uxk-iv-state', lamp, note) }), el('div.uxp-list', b.items.map((it) => card(b, it).el)));
    heads.set(b.uid, { note, lamp });
    root.append(sec);
  }
  body.append(root);

  function card(b0: InvestView[number], it0: Item): CardView {
    const lamp = uxLamp('good');
    const pic = el('span.uxk-iv-pic', kIcon(INVEST_ICO[it0.id] ?? 'gear', { scale: 3, color: '#97a1cf', hi: '#f4ecd4', lo: '#3a4266' }), lamp);
    const pips = el('span.uxk-iv-pips', { role: 'img' });
    const stamp = uxpStamp(t('導入済', 'Installed'));
    const gain = el('span.uxk-iv-gain');
    const price = el('span.uxk-iv-price');
    const gap = uxpGap(0, 0);
    const key = uxKey(t('買う', 'Buy'), () => buy(), { cls: 'uxk-iv-buy', strong: true, attrs: { 'data-ux-quiet': '' } });
    const c = uxpCard({ pic, name: it0.name, tags: [pips, stamp.el], desc: [el('span', it0.note), gain], foot: [price, gap.el], right: key, cls: 'uxk-iv-card', attrs: { 'data-invest': it0.id } });
    const tag = `${b0.uid}:${it0.id}`;
    const view: CardView = { uid: b0.uid, id: it0.id, el: c, key, sync: () => {} };
    cards.push(view);
    let lastCost: number | null | undefined;
    let cur = { b: b0, it: it0 };

    function buy() {
      if (stamping.has(tag)) return;
      const s = S();
      const st = buyState(cur.it, s.money, cur.b.left);
      if (st === 'max' || st === 'busy') return uxSfx('flap');
      if (st === 'short') return gap.nudge();
      const bld = s.buildings.find((x) => x.uid === cur.b.uid);
      if (!bld) return;
      const from = fundsAt(root);
      const e = K.invest(s, bld.uid, cur.it.id);
      if (e) {
        uxSfx('deny');
        if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
        return;
      }
      // 買えた：レジの音・金貨が資金から飛ぶ・資金が回って減る・カードが光って揺れる
      uxSfx('cash');
      vibrate(12);
      const r = c.getBoundingClientRect();
      if (!isCalm()) coinsFly(from, { x: r.left + 38, y: r.top + 38 }, 9);
      funds.set(Math.max(0, s.money), 700);
      uxpReplay(c, 'is-bought');
      shake(c);
      stamping.add(tag);
      ctx.save();
      ctx.refresh();
      const name = cur.it.name;
      const lvNow = K.investView(S(), !!ctx.step?.()).find((x) => x.uid === cur.b.uid)?.items.find((x) => x.id === cur.it.id)?.lv ?? 0;
      later(isCalm() ? 0 : BUY_MS, () => {
        stamping.delete(tag);
        uxSfx('stamp');
        ctx.toast(t(`「${name}」を導入しました`, `Installed: ${name}`));
        sync();
        // いま点いた段のランプを光らせ、最後の段なら「導入済」を打つ
        const lit = pips.children[lvNow - 1] as HTMLElement | undefined;
        if (lit) uxpReplay(lit, 'is-new');
        if (cur.it.cost == null) stamp.hit(c);
      });
    }

    view.sync = (b, it, money, main) => {
        cur = { b, it };
        if (stamping.has(tag)) return;
        const st = buyState(it, money, b.left);
        lamp.classList.toggle('is-on', it.lv > 0);
        c.classList.toggle('is-owned', it.lv > 0);
        c.classList.toggle('is-max', st === 'max');
        c.classList.toggle('is-weak', !!it.gain?.weak && it.cost != null);
        // 段のランプ（何段まであるか・いま何段か）。1 段だけの設備は出さない
        if (it.max > 1) {
          if (pips.childElementCount !== it.max) pips.replaceChildren(...Array.from({ length: it.max }, () => uxLamp('good')));
          [...pips.children].forEach((p, i) => p.classList.toggle('is-on', i < it.lv));
          pips.setAttribute('aria-label', t(`${it.lv} / ${it.max} 段`, `Level ${it.lv} / ${it.max}`));
          pips.title = `${it.lv}/${it.max}`;
        }
        if (st === 'max') stamp.show();
        else stamp.hide();
        // 見込み（お店：いま効く順。チュートリアルのあいだは出さない：今の画面と同じ）
        gain.hidden = !(it.gain && it.cost != null);
        if (it.gain && it.cost != null) {
          setText(gain, gainText(it.id, it.gain));
          gain.classList.toggle('is-dim', it.gain.weak);
        }
        if (lastCost !== it.cost) {
          lastCost = it.cost;
          price.replaceChildren(...(it.cost == null ? [] : [uxpPrice(it.cost)]));
        }
        price.hidden = it.cost == null;
        // 足りないとき：その場で「あと N G」と目盛り（今の画面と同じく、工事中は出さない）
        gap.set(st === 'short' ? money : 1, st === 'short' ? (it.cost ?? 0) : 0);
        keyText(key, st === 'max' ? t('導入済', 'Installed') : st === 'busy' ? t('工事中', 'Under construction') : t('買う', 'Buy'));
        key.disabled = st === 'max' || st === 'busy';
        key.classList.toggle('ux-key--flat', key.disabled);
        key.classList.toggle('ux-key--main', main && !key.disabled);
        key.setAttribute('aria-label', st === 'short' || st === 'buy' ? `${t('買う', 'Buy')} ${it.name} ${K.money(it.cost ?? 0)}` : `${it.name} ${keyTextOf(st)}`);
    };
    return view;
  }
  const keyTextOf = (st: BuyState) => (st === 'max' ? t('導入済', 'Installed') : t('工事中', 'Under construction'));

  function sync() {
    if (!root.isConnected) return;
    const s = S();
    const v = K.investView(s, !!ctx.step?.());
    const money = s.money;
    const main = mainPick(v, money);
    for (const b of v) {
      const h = heads.get(b.uid);
      if (h) {
        setText(h.note, b.left > 0 ? t(`工事中 あと ${b.left} 日`, `Building, ${b.left} d`) : t('稼働中', 'Open'));
        h.lamp.className = `ux-lamp ux-lamp--${b.left > 0 ? 'bad' : 'good'} is-on${b.left > 0 ? ' is-blink' : ''}`;
      }
      for (const it of b.items) cards.find((c) => c.uid === b.uid && c.id === it.id)?.sync(b, it, money, main === `${b.uid}:${it.id}`);
    }
    if (!stamping.size) funds.set(Math.max(0, money));
    lvs.set(have(v));
  }
  // カードの見え方を、組んだその場で合わせる
  sync();
  return { struct: structOf(v0), sync };
}
