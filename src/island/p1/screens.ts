/**
 * フェーズ 1 の札：工房（クラフト）・お店・調達・従業員・市場データ・ランキング・スキル・月の報告。
 * どれも下から出る大きな札（sheet）。中身は state から毎回作り直す。
 */
import { t, isEn } from '../../i18n';
import type { Sfx } from './sfx';
import { assetUrl, drawRef } from '../../render/images';
import { heroById, heroFacesRight } from '../../game/catalog';
import raw from '../../generated/catalog.json';
import { DEF } from '../defs';
import {
  INTEL,
  INVESTS,
  MAT_KEYS,
  MATS,
  P1B,
  PRODUCT,
  rivalDef,
  SELF_RUN,
  UNCOMMON,
  sku,
  skuParts,
  type Mat,
  type Sku,
  type Task,
} from './data';
import {
  hasRoute,
  assign,
  intelLv,
  invest,
  investCost,
  invLv,
  unsellableHere,
  type PBuilding,
  myWorkshop,
  myShops,
  makeSku,
  setShelf,
  shelvesAuto,
  staffOf,
  startCraft,
  type P1State,
  type Report,
  relicMinCraft,
  } from './model';
import { UNSELLABLE_TEXT } from './digview';
import { applyPlan, manualPlan } from './plan';
import { btn, extImage, fmt, h, heroName, money, sheet, skuIcon, skuName, rich } from './ui';
import { pickExt, pickHero, techNeed } from './heroui';
import { craftable, shopInvestOrder } from './orders';
import { openPayroll as openPayrollHr } from './hrui';
import { uxb } from '../uix/screens/b-slots';
import { uxs } from '../uix/screens/s-slots';
import { uxk } from '../uix/screens/k-slots';
import { uxh } from '../uix/screens/h-slots';
import { uxr } from '../uix/screens/r-slots';

export interface Ctx {
  s: () => P1State;
  root: HTMLElement;
  save: () => void;
  /** 地図と上の帯を描き直す */
  refresh: () => void;
  toast: (text: string) => void;
  /** ✕ や外側を押して札を閉じた（下の帯のメニューも閉じる） */
  dismissed?: () => void;
  /** チュートリアル：この画面でマインちゃんが言うこと（無ければ null） */
  tip?: (screen: string) => string | null;
  /** チュートリアル：この画面の ✕ を光らせるか（見終わったら閉じてほしい画面） */
  closeGlow?: (screen: string) => boolean;
  /** 札を閉じて、その建物を置くモードへ（at：そのマスから置き始める） */
  build?: (id: string, at?: [number, number]) => void;
  /** チュートリアルのいまの段（tut.ts の id。終わっていれば null） */
  step?: () => string | null;
  /** 効果音 */
  sfx?: (k: Sfx, gain?: number, rate?: number) => void;
  /** スキルツリーを開く（focus：枝の key かスキルの id。そのパネルを真ん中に） */
  skills?: (focus?: string) => void;
  /** ほかのランドセクタへ移った（land.ts の moveTo のあと） */
  moved?: (target: string, fresh: boolean, manager: number | null) => void;
  /** 被災した町の復興を任せた（ランドマップ。マインちゃんの一言・1 回だけ） */
  delegated?: (id: string) => void;
  /** 研究ポイントの増えた知らせ（「研究ポイント +N」のトースト）を済みにする（その画面が自分でトーストを出したとき。研究への寄付） */
  rpNoted?: () => void;
  /** 段 SALES1：札を閉じて、そのお店の吹き出しを開く（地図でそのお店の商圏が光る） */
  showShop?: (uid: number) => void;
  /** 段 FACTORY1a：札を閉じて、工房の建て替えの置き方を選ぶモードへ（町工場・大工場） */
  rebuild?: () => void;
}

/**
 * 画面の中のマインちゃんの一言（チュートリアル中）。
 * 一言は画面の下（会話と同じ場所）に出す。閉じても、画面の上に「いまやること」を 1 行で残す（押すとまた下に出る）。
 * body：その画面のいちばん上（リマインドを置く所）。
 */
let dock: { el: HTMLElement; text: HTMLElement; root: HTMLElement } | null = null;
let dockShown = '';
let dockClosed = '';
function dockEl(root: HTMLElement) {
  if (dock && dock.root === root && dock.el.isConnected) return dock;
  const el = h('div', 'isl-dock');
  const mi = h('img', 'isl-dock-mine');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  const name = h('b', 'isl-talk-name', t('マインちゃん', 'Mine-chan'));
  const text = h('p', 'isl-dock-text');
  const ok = h('button', 'isl-dock-close', '✕');
  ok.type = 'button';
  ok.setAttribute('aria-label', t('閉じる', 'Close'));
  el.append(mi, name, text, ok);
  const close = () => {
    dockClosed = dockShown;
    hideDock();
    current?.render();
  };
  ok.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  root.append(el);
  dock = { el, text, root };
  return dock;
}
/** 下の一言の高さを、画面の余白（--dock-h）に入れる（隠れた所までスクロールできるように） */
function dockPad() {
  const r = dock?.root;
  if (!r) return;
  const hgt = dock && !dock.el.hidden ? Math.ceil(dock.el.getBoundingClientRect().height) + 12 : 0;
  r.style.setProperty('--dock-h', `${hgt}px`);
}
export function hideDock() {
  if (!dock) return;
  dock.el.hidden = true;
  dockShown = '';
  dockPad();
}
export function mineTip(ctx: Ctx, screen: string, body: HTMLElement) {
  // 閉じてほしい画面：右上の ✕ を金色に光らせる（👆）
  body.closest('.isl-sheet')?.querySelector('.isl-sheet-head .isl-btn')?.classList.toggle('is-guide', !!ctx.closeGlow?.(screen));
  const text = ctx.tip?.(screen);
  if (!text) {
    hideDock();
    return;
  }
  const closed = dockClosed === text;
  // 上：いまやること（閉じたあとに出す。押すとまた下に出る）
  const rem = h('button', 'isl-remind');
  rem.type = 'button';
  const mi = h('img');
  mi.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
  mi.alt = '';
  const p = h('span');
  p.append(rich(text));
  rem.append(mi, h('b', '', t('いまやること', 'To do')), p);
  rem.hidden = !closed;
  rem.addEventListener('click', () => {
    dockClosed = '';
    current?.render();
  });
  body.append(rem);
  if (closed) {
    hideDock();
    return;
  }
  const d = dockEl(ctx.root);
  if (dockShown !== text) {
    d.text.replaceChildren(rich(text));
    d.el.classList.remove('is-new');
    void d.el.offsetWidth;
    d.el.classList.add('is-new');
  }
  dockShown = text;
  d.el.hidden = false;
  requestAnimationFrame(dockPad);
}

/** 開いている札（1 日ごとに描き直す） */
let current: { render: () => void; close: () => void } | null = null;
export function refreshSheet() {
  const a = document.activeElement;
  if (current && !(a instanceof HTMLSelectElement)) current.render();
}
export const sheetOpen = () => !!current;
export function closeSheet() {
  current?.close();
  current = null;
  together = null;
}

/**
 * まとめた画面（段 UI3：似た画面を 1 つの画面に縦に並べる）。capture のあいだは open() が札を開かずに、中身を作る関数だけを集める。
 * together：いま開いているまとめた画面の部分（部分の中のボタンがその画面を開き直したら、まとめた画面のその部分だけを差し替える）
 */
interface Part {
  title: string;
  render: (body: HTMLElement) => void;
  onClose?: () => void;
}
let capture: Part[] | null = null;
let together: { titles: string[]; parts: Part[] } | null = null;
/** f が開く画面の中身（札は開かない）。開かなかったら null */
function grab(f: () => void): Part | null {
  capture = [];
  let p: Part | null = null;
  try {
    f();
    p = capture[0] ?? null;
  } finally {
    capture = null;
  }
  return p;
}
/**
 * いくつかの画面を 1 つの画面にまとめて開く（上から順に見出しをつけて並べる。2 つ以上なら上に「↓ 見出し」の近道）。
 * focus：はじめにその部分（番号）までスクロールする。開けた部分が 1 つなら、その画面をそのまま開く
 */
export function openTogether(ctx: Ctx, title: string, opens: (() => void)[], focus = 0) {
  const got = opens.map(grab);
  const parts = got.filter((x): x is Part => !!x);
  // focus は opens の番号 → 開けた部分の番号
  focus = got.slice(0, focus).filter((x) => !!x).length;
  if (!parts.length) return;
  if (parts.length === 1) {
    open(ctx, parts[0].title, parts[0].render, parts[0].onClose);
    return;
  }
  open(
    ctx,
    title,
    (body) => {
      body.classList.add('isl-together');
      const jump = h('div', 'isl-part-jump');
      // 段 UIX4a：部分の箱を先に画面へ入れてから描く（「画面に入っていなければ描かない」描き方の画面が、空にならないように）
      body.append(jump);
      parts.forEach((p, k) => {
        const sec = h('section', 'isl-part');
        sec.dataset.part = String(k);
        sec.append(h('h3', 'isl-part-title', p.title));
        body.append(sec);
        p.render(sec);
        if (k > 0) {
          const b = btn(`↓ ${p.title}`, () => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }), 'isl-part-go');
          jump.append(b);
        }
      });
      // 段 UIX3b：新しい画面：見出しの貼り札・区切り・開いた所へ送る動き
      uxb.together?.(body, focus);
    },
    () => parts.forEach((p) => p.onClose?.()),
  );
  together = { titles: parts.map((p) => p.title), parts };
  if (focus > 0) requestAnimationFrame(() => document.querySelector<HTMLElement>(`.isl-sheet .isl-part[data-part="${Math.min(focus, parts.length - 1)}"]`)?.scrollIntoView({ block: 'start' }));
}

/** 画面を開いたとき（main.ts：部門の帯を画面の見出しの下に置く。段 UI3） */
export const sheetHooks: { opened?: () => void } = {};

/** 画面を開いてよいか（発掘作業のあいだは研究ノートだけ。main.ts が決める。false なら開かない） */
let openGuard: ((title: string) => boolean) | null = null;
export const setOpenGuard = (f: ((title: string) => boolean) | null) => (openGuard = f);

/** keep：中身を作り直さない（段 UIX2s：新しい画面は、自分の中身を持ったまま描き直す。render は毎回呼ぶ） */
export function open(ctx: Ctx, title: string, render: (body: HTMLElement) => void, onClose?: () => void, keep = false) {
  // まとめた画面の中身を集めているあいだ：札は開かない
  if (capture) {
    capture.push({ title, render, onClose });
    return;
  }
  // まとめた画面の部分の中のボタンが、その画面を開き直した（ランキングのエリア／ランド／世界など）：その部分だけ差し替える
  if (together && current) {
    const k = together.titles.indexOf(title);
    if (k >= 0) {
      together.parts[k] = { title, render, onClose };
      current.render();
      return;
    }
  }
  if (openGuard && !openGuard(title)) return;
  closeSheet();
  const sh = sheet(
    ctx.root,
    title,
    () => {
      current = null;
      together = null;
      hideDock();
      onClose?.();
      ctx.refresh();
    },
    () => ctx.dismissed?.(),
  );
  const draw = () => {
    if (keep) return render(sh.body);
    const y = sh.body.scrollTop;
    sh.body.replaceChildren();
    render(sh.body);
    sh.body.scrollTop = y;
  };
  current = { render: draw, close: sh.close };
  draw();
  sheetHooks.opened?.();
  // チュートリアルで光らせた枠が見えるところまで送る
  const hot = sh.body.querySelector('.is-hot');
  if (hot && hot.getBoundingClientRect().bottom > sh.body.getBoundingClientRect().bottom) requestAnimationFrame(() => hot.scrollIntoView({ block: 'center' }));
}
export const after = (ctx: Ctx) => {
  ctx.save();
  ctx.refresh();
  current?.render();
};

export const CRAFT_ERR: Record<string, string> = {
  pot: t('アンコモンには「魔法の釜」が要ります（スキル）', 'Uncommons need the Magic Pot (skill)'),
  dev: t('このアンコモンはまだ開発していません（R&D → 商品開発）', 'Develop this Uncommon first (R&D → Product development)'),
  skill: t(`アンコモンには製造の適性 ${UNCOMMON.minCraft} 以上の職人が要ります`, `Uncommons need a crafter with aptitude ${UNCOMMON.minCraft}+`),
  mats: t('素材が足りません（「調達」で買えます）', 'Not enough materials (buy them under Buy)'),
  full: t('置き場所がいっぱいで、できた商品を置けません（倉庫を建てるか、お店へ運びましょう）', 'No room for finished goods (build a warehouse or haul to shops)'),
  worker: t('職人を割り当ててください', 'Assign a crafter first'),
  busy: t('作業中です', 'Already working'),
  relic: t('この復刻品のレシピはまだ分かっていません（遺物の研究 Lv3 で開く）', 'This revival recipe is not known yet (research the relic to Lv3)'),
};
/** 作れない理由（技が要るものは、その技の名前） */
export const craftErr = (x: Sku, e: string, s?: P1State) =>
  (e === 'tech' ? techNeed(skuParts(x)[0], s) : null) ??
  // Rare の復刻品（Rare の町 ①）は 1 段上の職人
  (e === 'skill' && PRODUCT[skuParts(x)[0]]?.relic?.rare ? t(`${PRODUCT[skuParts(x)[0]]?.relic?.epic ? 'Epic' : 'Rare'} の復刻品には製造の適性 ${relicMinCraft(skuParts(x)[0])} 以上の職人が要ります`, `${PRODUCT[skuParts(x)[0]]?.relic?.epic ? 'Epic' : 'Rare'} revivals need a crafter with aptitude ${relicMinCraft(skuParts(x)[0])}+`) : null) ??
  CRAFT_ERR[e] ??
  e;

/** 作れる商品（DOM なしの orders.ts へ移した。ほかの画面はここから読む） */
export { craftable };



// ---------------------------------------------------------------- 工房

/** 作業台 k で x を作る（作るものを選んだとき・市場データの「工房で作る」）。トーストを出し、描き直す */
/** 段 UI4（追加の要望）：作業台の作る物を A から B に替えた（main.ts が「お店の主力商品も替えますか？」のシートを出す） */
export const makeHooks: { switched?: (a: Sku, b: Sku) => void } = {};
export function chooseMake(ctx: Ctx, s: P1State, k: number, x: Sku, msg?: string) {
  const sl = s.slots[k];
  if (!sl) return;
  const prev = sl.sku;
  // 段 UI5c：使い切りの製造をやめて、ふつうの自動製造に
  delete sl.back;
  if (sl.sku !== x) {
    sl.sku = x;
    sl.running = false;
    sl.progress = 0;
  }
  sl.repeat = true;
  const e = sl.worker == null ? 'worker' : startCraft(s, k, x, true);
  if (e && e !== 'busy') ctx.toast(craftErr(x, e, s));
  else ctx.toast(msg ?? t(`${skuName(x)}を作り始めました`, `Started making ${skuName(x)}`));
  after(ctx);
  if (prev && prev !== x) makeHooks.switched?.(prev, x);
}

/**
 * 工房の画面。
 * invest：いちばん下の「設備投資」の欄までスクロールして光らせる（マインちゃんの助言から）。
 * make：その商品を作るものとして選んだ状態で開く（市場データの「工房で作る」）。空いている作業台があればそこに入れ、
 * 無ければ 1 台目の作るものの選択をその商品を先頭にして開く。作る数のところへスクロールして光らせる
 */
export function openWorkshop(ctx: Ctx, opt: boolean | { invest?: boolean; make?: Sku; from?: string } = false) {
  const o = typeof opt === 'boolean' ? { invest: opt } : opt;
  // 段 UIX2s：新しい画面（uix/screens/workshop.ts）
  return uxs.workshop!(ctx, o);
}

// ---------------------------------------------------------------- お店

/** お店の中の小さな場面：窓・棚・店員・お客さん */
/** 店員を選ぶ（お店の画面・地図の吹き出し） */
export function pickClerk(ctx: Ctx, uid: number, done: () => void) {
  const s = ctx.s();
  const sh = s.shops[uid];
  const b = s.buildings.find((x) => x.uid === uid);
  if (!sh || !b) return;
  pickHero(ctx.root, s, {
    title: t(`${DEF[b.id].name}の店員`, `Clerk for ${DEF[b.id].name}`),
    task: 'shop',
    current: sh.staff,
    onPick: (v) => {
      if (v == null && sh.staff != null) assign(s, sh.staff, null);
      else if (v != null) assign(s, v, 'shop', uid);
      done();
    },
  });
}

/**
 * 棚の商品を替える（setShelf）。外した商品がこのお店のどの棚にも無くなり、棚に残っていた分が裏へ戻るときは
 * moved(prev, n) を呼ぶ（「棚の ○○ は裏に戻ります」のトースト）。setShelf の挙動（裏の在庫はそのまま）に合わせる
 */
export function changeShelf(s: P1State, uid: number, k: number, x: Sku | null, moved?: (prev: Sku, n: number) => void) {
  const sh = s.shops[uid];
  if (!sh) return;
  const prev = sh.shelves[k] ?? null;
  const n = prev ? sh.shelf[prev] ?? 0 : 0;
  if (!setShelf(s, uid, k, x)) return;
  if (prev && prev !== x && n > 0 && !sh.shelves.includes(prev)) moved?.(prev, n);
}

/** 「棚の ○○ N 個は裏に戻ります」のトースト（pickShelf の moved） */
export const shelfMoved = (ctx: Ctx) => (prev: Sku, n: number) => ctx.toast(t(`棚の${skuName(prev)} ${n} 個は裏に戻ります`, `${n} ${skuName(prev)} on the shelf go to the back room`));

/** 棚に並べるものを選ぶ（k：棚の番号。0 が主力商品）。moved：外した商品の棚の残りが裏へ戻ったとき */
export function pickShelf(ctx: Ctx, uid: number, k0: number, done: () => void, moved?: (prev: Sku, n: number) => void) {
  const s = ctx.s();
  // 段 UI5a：チュートリアルのあとは、どの棚を押しても「主力を選ぶ」（ほかの棚は製造に合わせて自動）
  const k = shelvesAuto(s) ? 0 : k0;
  const sh = s.shops[uid];
  if (!sh) return;
  // 段 UI5a：何を売るかは製造が決める。並べる候補は工房で作っている商品だけ（まだ何も作っていなければ前のまま）。
  // チュートリアルのあとは、主力を選ぶだけ（並んでいる・作っている商品から。ほかの棚は自動）
  const making = s.slots.map((y) => y.sku).filter((y): y is Sku => !!y);
  const auto = shelvesAuto(s);
  pickExt(ctx.root, s, {
    title: k === 0 ? t('主力商品を選ぶ', 'Choose the main product') : t(`棚 ${k + 1} に並べるもの`, `What shelf ${k + 1} sells`),
    items: auto ? [...new Set([...sh.shelves.filter((y): y is Sku => !!y), ...making])] : making.length ? [...new Set(making)] : craftable(s, !!ctx.step?.()),
    current: sh.shelves[k] ?? null,
    allowNone: true,
    making: s.slots.map((y) => y.sku).filter((y): y is Sku => !!y),
    badge: (() => {
      const m = s.slots.find((y) => y.sku)?.sku;
      return m ? { x: m, text: t('工房で作っている', 'Being crafted') } : null;
    })(),
    note: auto ? t('並ぶのは工房で作っている商品です（作る物を変えると、棚も自動で入れ替わります）。主力は 1 番目の目立つ棚に並びます。', 'Shelves follow what the workshop makes. The main item takes the first, most visible shelf.') : t('工房で作っているエクステを並べましょう。他社が少なく需要の大きいものほど売れます。', 'Shelve what your workshop makes. Items with high demand and few rivals sell best.'),
    // この町で売れない商品（売れるシリーズに無い復刻品）：灰色にして、押すと止める
    blocked: (x) => unsellableHere(s, skuParts(x)[0]),
    onBlocked: (x) => ctx.toast(t(`${skuName(x)}：${UNSELLABLE_TEXT(skuParts(x)[0])}`, `${skuName(x)}: ${UNSELLABLE_TEXT(skuParts(x)[0])}`)),
    onPick: (v) => {
      if (auto && k === 0) {
        if (v) applyPlan(s, manualPlan([{ k: 'main', uid, x: v }]));
      } else changeShelf(s, uid, k, v, moved);
      done();
    },
  });
}

/**
 * 店内の様子（お客さんが来て、棚を見て、レジで払って帰る）。
 * 店員や主力商品が決まっていなければ、店員が立つ所・商品が並ぶ所に「＋」の枠を出して、その場で決められる。
 */
export function shopView(ctx: Ctx, uid: number, done: () => void): HTMLElement {
  const s = ctx.s();
  const sh = s.shops[uid];
  const wrap = h('div', 'isl-shop-view');
  wrap.append(shopScene(s, uid));
  if (!sh) return wrap;
  const tut = ctx.step?.() === 'sell';
  const main = sh.shelves[0];
  // 棚：未設定なら「＋ 主力商品」（チュートリアルの段では光る）。決まったあとも押すと差し替えられる（「替える」の札）
  const shelfBtn = h('button', `isl-shop-spot is-shelf ${main ? 'is-set' : ''} ${tut && !main ? 'is-hot' : ''}`);
  shelfBtn.type = 'button';
  if (!main) shelfBtn.append(h('span', 'isl-slot-plus', '+'), h('small', '', t('主力商品', 'Main product')));
  else {
    shelfBtn.setAttribute('aria-label', t('主力商品を替える', 'Change the main product'));
    shelfBtn.append(h('span', 'isl-shop-swap', t('替える', 'Change')));
  }
  shelfBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pickShelf(ctx, uid, 0, done, shelfMoved(ctx));
  });
  wrap.append(shelfBtn);
  if (main && (sh.shelf[main] ?? 0) <= 0) {
    // 主力商品は決まっているが、まだ棚に無い：入荷待ち
    const tag = h('div', 'isl-shop-tag');
    tag.append(skuIcon(main, 22), h('small', '', t(`${skuName(main)}・入荷待ち`, `${skuName(main)} · awaiting stock`)));
    wrap.append(tag);
  }
  // 店員：いなければ「＋ 店員」、いるときも押すと替えられる
  const staffed = sh.staff != null || sh.part > 0;
  const clerkBtn = h('button', `isl-shop-spot is-clerk ${staffed ? 'is-set' : ''} ${tut && !!main && !staffed ? 'is-hot' : ''}`);
  clerkBtn.type = 'button';
  if (!staffed) clerkBtn.append(h('span', 'isl-slot-plus', '+'), h('small', '', t('店員', 'Clerk')));
  else {
    clerkBtn.setAttribute('aria-label', t('店員を替える', 'Change the clerk'));
    clerkBtn.append(h('span', 'isl-shop-swap', t('替える', 'Change')));
  }
  clerkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    pickClerk(ctx, uid, done);
  });
  wrap.append(clerkBtn);
  // 段 UI5a（お店の自走）：店長・従業員の 1 行（チュートリアルのあいだは出さない）
  const crew = crewLine(s, uid);
  if (crew && !ctx.step?.()) wrap.append(crew);
  return wrap;
}
/** 「店長（休み）・従業員 2 人・今日は従業員で営業中」の 1 行 */
export function crewLine(s: P1State, uid: number): HTMLElement | null {
  const sh = s.shops[uid];
  if (!sh) return null;
  const st = sh.staff != null ? staffOf(s, sh.staff) : null;
  const self = !!st?.resting && sh.part >= SELF_RUN.min;
  const head = st ? (st.resting ? t(`店長 ${heroName(st.hero)}（休み）`, `Manager ${heroName(st.hero)} (off)`) : t(`店長 ${heroName(st.hero)}`, `Manager ${heroName(st.hero)}`)) : t('店長なし', 'No manager');
  const today = !st ? (sh.part > 0 ? t('従業員だけで営業中', 'staff only') : t('閉店中', 'closed')) : st.resting ? (self ? t('今日は従業員で営業中', 'staff run it today') : sh.part > 0 ? t('今日は従業員 1 人で手伝いだけ', 'one staff, barely open') : t('今日は閉店', 'closed today')) : t('営業中', 'open');
  return h('p', `isl-shop-crew ${self ? 'is-self' : ''}`, [head, t(`従業員 ${sh.part} 人`, `${sh.part} staff`), today].join(t('・', ' · ')));
}

/** 開いている店内の様子（お店ごと）。売れたらお客さんが来店する */
const scenes = new Map<number, Set<(sku: Sku, yen: number) => void>>();
/** お店で売れた（main.ts が日を進めたときに呼ぶ）：開いている店内に、買うお客さんを来させる */
export function shopSceneSale(uid: number, sku: Sku, yen: number) {
  for (const f of scenes.get(uid) ?? []) f(sku, yen);
}

/**
 * 店内の様子。売れた 1 個ごとにお客さんが入ってきて、棚から商品を取り（棚の商品が 1 つ減る）、
 * 持ったままレジへ。レジの前に来たら、店員の頭の上に「+N GUM」が出る（onPay）。払ったら出ていく。
 * 買わずに見て帰るお客さんもときどき来る。店員はレジの後ろに立つ（お客さんと同じ大きさ）。
 */
export function shopScene(s: P1State, uid: number, onPay?: (yen: number) => void): HTMLCanvasElement {
  const c = h('canvas', 'isl-shop-scene');
  c.width = 320;
  c.height = 180;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const sh = s.shops[uid];
  const guests = [1001, 1002, 1005, 1008, 1011, 1014].filter((id) => heroById.has(id));
  type W = { hero: number; x: number; goal: number; wait: number; bob: number; shelf: number; facing?: number; buy: Sku | null; yen: number; held: boolean; paid?: boolean };
  let walkers: W[] = [];
  /** 売れたけれど、まだ棚から取られていない数（棚の絵に残しておく） */
  const reserved = new Map<string, number>();
  const pops: { yen: number; t: number }[] = [];
  let browseAt = performance.now() + 2500;
  let lastT = performance.now();
  const view = new Image();
  view.src = assetUrl(raw.windowView);
  const gum = new Image();
  gum.src = assetUrl('mch/Image/Icons/gum.png');
  const SIZE = 44;
  const FLOOR = 122;
  const COUNTER = { x: 214, y: 128, w: 96, h: 26 };
  const CASH = COUNTER.x - 18;
  const shelfX = (k: number) => 30 + Math.min(5, k) * 23;
  const spawn = (buy: Sku | null, yen: number) => {
    const slot = buy ? Math.max(0, (sh.shelf[buy] ?? 0) + (reserved.get(buy) ?? 0) - 1) : Math.floor(Math.random() * 5);
    if (buy) reserved.set(buy, (reserved.get(buy) ?? 0) + 1);
    walkers.push({ hero: guests[Math.floor(Math.random() * guests.length)], x: 340 + walkers.length * 26, goal: 0, wait: 0, bob: 0, shelf: shelfX(Math.min(5, slot)) + 10, buy, yen, held: false });
  };
  const listener = (x: Sku, yen: number) => {
    if (walkers.filter((w) => w.buy).length < 4) spawn(x, yen);
    else onPay?.(yen);
  };
  if (!scenes.has(uid)) scenes.set(uid, new Set());
  scenes.get(uid)!.add(listener);
  let raf = 0;
  const startAt = performance.now();
  const drawHero = (hero: number, x: number, y: number, facing: number, alpha = 1) => {
    const g = heroById.get(hero);
    if (!g) return;
    const flip = heroFacesRight(hero) ? facing < 0 : facing > 0;
    const px = x - (flip ? 64 - g.cx : g.cx) * (SIZE / 64);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (flip) {
      ctx.translate(px + SIZE, y);
      ctx.scale(-1, 1);
      drawRef(ctx, g.image, 0, 0, SIZE, SIZE);
    } else drawRef(ctx, g.image, px, y, SIZE, SIZE);
    ctx.restore();
  };
  const draw = (now: number) => {
    if (!c.isConnected && now - startAt > 500) {
      scenes.get(uid)?.delete(listener);
      return cancelAnimationFrame(raf);
    }
    const dt = Math.min(100, now - lastT);
    lastT = now;
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(0, 0, 320, 180);
    if (view.complete && view.naturalWidth) ctx.drawImage(view, 0, 0, 320, 80);
    ctx.fillStyle = '#7a5434';
    ctx.fillRect(0, 80, 320, 100);
    ctx.fillStyle = '#8c6440';
    for (let x = 0; x < 320; x += 32) ctx.fillRect(x, 80, 2, 100);
    // 棚：並んでいる数（売れてまだ取られていない分も含む）を 1 つずつ。6 つまで
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(16, 60, 150, 70);
    sh.shelves.forEach((x, k) => {
      ctx.fillStyle = '#c9925a';
      ctx.fillRect(20, 70 + k * 20, 142, 4);
      if (!x) return;
      const n = Math.min(6, (sh.shelf[x] ?? 0) + (reserved.get(x) ?? 0));
      const [key, r] = skuParts(x);
      const ref = extImage(PRODUCT[key].ext[r]);
      for (let i = 0; i < n; i++) drawRef(ctx, ref, 22 + i * 23, 52 + k * 20, 20, 20);
    });
    // 店員はレジの後ろ（足もとはレジに隠れる）。お客さんと同じ大きさ
    const staff = sh.staff != null ? sh.staff : null;
    if (staff != null) drawHero(staff, COUNTER.x + COUNTER.w / 2, COUNTER.y - SIZE + 14, -1);
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, COUNTER.h);
    ctx.fillStyle = '#d8b07a';
    ctx.fillRect(COUNTER.x, COUNTER.y, COUNTER.w, 5);
    ctx.fillStyle = '#9a7a52';
    ctx.fillRect(COUNTER.x + 10, COUNTER.y - 10, 22, 10);
    // 見て帰るだけのお客さんも、ときどき
    const open = staff != null || sh.part > 0;
    if (open && now >= browseAt && walkers.length < 3) {
      if (Math.random() < 0.5) spawn(null, 0);
      browseAt = now + 5000 + Math.random() * 5000;
    }
    for (const w of walkers) {
      // 入る → 棚の前（商品を取る）→ レジの前（払う）→ 出る。買わない人は棚を見て出る
      const stops = w.buy ? [{ x: w.shelf, wait: 1300 }, { x: CASH, wait: 1100 }, { x: 350, wait: 0 }] : [{ x: w.shelf, wait: 1800 }, { x: 350, wait: 0 }];
      const stop = stops[w.goal];
      if (!stop) continue;
      if (w.wait > 0) {
        w.wait -= dt;
        // 棚の前：手に取る（棚の商品が 1 つ減る）
        if (w.buy && w.goal === 1 && !w.held && w.wait < 700) {
          w.held = true;
          reserved.set(w.buy, Math.max(0, (reserved.get(w.buy) ?? 0) - 1));
        }
        // レジの前：払う
        if (w.buy && w.goal === 2 && !w.paid && w.wait < 800) {
          w.paid = true;
          w.held = false;
          pops.push({ yen: w.yen, t: now });
          onPay?.(w.yen);
        }
      } else {
        const dx = stop.x - w.x;
        if (Math.abs(dx) > 1) {
          w.x += Math.sign(dx) * Math.min(Math.abs(dx), (dt / 1000) * 70);
          w.facing = dx < 0 ? -1 : 1;
          w.bob += dt / 100;
        } else {
          w.x = stop.x;
          w.wait = stop.wait;
          w.goal++;
          // レジの前では、店員のほうを向く
          if (stop.x === CASH) w.facing = 1;
        }
      }
    }
    walkers = walkers.filter((w) => w.goal < (w.buy ? 3 : 2) || w.wait > 0 || w.x < 345);
    // 奥にいる人から描く
    for (const w of [...walkers].sort((a, b) => a.x - b.x)) {
      const walking = w.wait <= 0;
      const hop = walking ? Math.abs(Math.sin(w.bob)) * 3 : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(w.x, FLOOR + SIZE - 2, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 帰り道はレジの手前を通る（レジの上に立って見えないように）
      const leaving = w.goal >= (w.buy ? 2 : 1) && w.wait <= 0;
      const lane = leaving ? Math.max(0, Math.min(1, (w.x - (CASH - 30)) / 30)) * 10 : 0;
      drawHero(w.hero, w.x, FLOOR + lane - hop, w.facing ?? -1, Math.min(1, (345 - w.x) / 25));
      // 持っている商品
      if (w.held && w.buy) {
        const [key, r] = skuParts(w.buy);
        drawRef(ctx, extImage(PRODUCT[key].ext[r]), w.x - 9 + (w.facing ?? -1) * 8, FLOOR + 16 - hop, 18, 18);
      }
    }
    // 店員の頭の上に「+N GUM」
    for (const p of pops) {
      const age = (now - p.t) / 1600;
      if (age > 1) continue;
      const cx = COUNTER.x + COUNTER.w / 2;
      const y = COUNTER.y - SIZE + 4 - age * 18;
      ctx.save();
      ctx.globalAlpha = 1 - age * age;
      ctx.font = "900 13px 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', system-ui, sans-serif";
      ctx.textBaseline = 'middle';
      const txt = `+${p.yen.toLocaleString('en-US')}`;
      const tw = ctx.measureText(txt).width;
      const x0 = cx - (tw + 16) / 2;
      if (gum.complete && gum.naturalWidth) ctx.drawImage(gum, x0, y - 7, 14, 14);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0f1626';
      ctx.strokeText(txt, x0 + 16, y);
      ctx.fillStyle = '#ffd257';
      ctx.fillText(txt, x0 + 16, y);
      ctx.restore();
    }
    while (pops.length && now - pops[0].t > 1600) pops.shift();
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return c;
}

export function openShop(ctx: Ctx, uid: number) {
  // 段 UIX3b：新しい画面（uix/screens/shop.ts）
  return uxb.shop!(ctx, uid);
}

export function openBuy(ctx: Ctx) {
  // 段 UIX3b：新しい画面（uix/screens/buy.ts）
  return uxb.buy!(ctx);
}

// ---------------------------------------------------------------- 従業員

export function jobOptions(s: P1State) {
  const out: { value: string; label: string }[] = [{ value: 'none', label: t('なし（休ませる）', 'None (rest)') }];
  s.slots.forEach((_sl, k) => out.push({ value: `craft:${k}`, label: t(`製造：作業台 ${k + 1}`, `Craft: bench ${k + 1}`) }));
  out.push({ value: 'transport', label: t('運搬', 'Haul') });
  out.push({ value: 'buy', label: t('調達（自動の買い付け）', 'Buying (automatic)') });
  for (const b of myShops(s)) out.push({ value: `shop:${b.uid}`, label: t(`販売：${DEF[b.id].name}`, `Sell: ${DEF[b.id].name}`) });
  for (const m of MAT_KEYS) if (!hasRoute(s, m)) out.push({ value: `explore:${m}`, label: t(`開拓：${MATS[m].name}`, `Scout: ${MATS[m].name}`) });
  for (const r of s.rivals) if (intelLv(s, r.id) < INTEL.length) out.push({ value: `intel:${r.id}`, label: t(`調査：${rivalName(r.id)}`, `Research: ${rivalName(r.id)}`) });
  return out;
}

export const rivalName = (rid: string) => rivalDef(rid)?.name ?? rid;

/** 仕事の選択肢の値を割り当てに直す */
export function applyJob(s: P1State, hero: number, v: string) {
  const [task, target] = v.split(':');
  if (task === 'none') assign(s, hero, null);
  else if (task === 'transport') assign(s, hero, 'transport');
  else if (task === 'buy') assign(s, hero, 'buy');
  else if (task === 'explore') assign(s, hero, 'explore', target as Mat);
  else if (task === 'intel') assign(s, hero, 'intel', target);
  else assign(s, hero, task as Task, Number(target));
}

export function openStaff(ctx: Ctx) {
  return uxh.staff!(ctx);
}

// ---------------------------------------------------------------- 人材登用

/** opts.charisma=false：まとめた画面（候補の一覧 → カリスマ）の前の部分。カリスマの札は後ろの部分（経営者）に 1 つだけ出す */
export function openHire(ctx: Ctx, opts: { charisma?: boolean } = {}) {
  return uxh.hire!(ctx, opts);
}

// ---------------------------------------------------------------- 市場データ

export function openData(ctx: Ctx) {
  // 段 UIX3b：新しい画面（uix/screens/biz.ts）
  return uxb.data!(ctx);
}

/** 市場データ・研究ノート・発掘の札から工房へ：その商品（復刻品はそのランク）を作るものとして選んだ状態で開く。工房が無ければトースト */
export function makeInWorkshop(ctx: Ctx, key: string, from?: string) {
  const s = ctx.s();
  if (!myWorkshop(s)) {
    ctx.sfx?.('error');
    ctx.toast(t('先に工房を建てよう', 'Build the workshop first'));
    return;
  }
  ctx.sfx?.('tap');
  openWorkshop(ctx, { make: makeSku(key), from });
}

export function openRanking(ctx: Ctx, tab: 'area' | 'land' | 'world' = 'area') {
  // 段 UIX3k：新しい画面（uix/screens/ranking.ts）へ
  return uxk.ranking!(ctx, tab);
}

// ---------------------------------------------------------------- スキル

// ---------------------------------------------------------------- 月の報告・他社の店

export function openReport(ctx: Ctx, r: Report, then?: () => void) {
  open(
    ctx,
    t(`${r.month} か月目の売上報告`, `Month ${r.month} sales report`),
    (body) => {
      const sum = h('div', 'isl-card2');
      sum.append(h('h3', '', t('売上', 'Sales')), h('p', 'isl-big', money(r.revenue)));
      const by = h('div', 'isl-stock');
      for (const [k, v] of Object.entries(r.bySeries)) {
        if (!v) continue;
        const c = h('span', 'isl-chip');
        c.append(skuIcon(sku(k, 'C'), 24), h('span', '', `${PRODUCT[k].name} ${money(v)}`));
        by.append(c);
      }
      sum.append(by);
      const cost = r.costs;
      sum.append(
        h('p', 'isl-dim', t(`費用：素材 ${fmt(cost.materials)}・建物とスキル ${fmt(cost.build)}・維持費 ${fmt(cost.upkeep)}・給料 ${fmt(cost.wages)}・アルバイト ${fmt(cost.part)}`, `Costs: materials ${fmt(cost.materials)}, building & skills ${fmt(cost.build)}, upkeep ${fmt(cost.upkeep)}, wages ${fmt(cost.wages)}, part-timers ${fmt(cost.part)}`)),
        h('p', '', t(`利益 ${money(r.profit)}`, `Profit ${money(r.profit)}`)),
      );
      body.append(sum);
      const rank = h('div', 'isl-card2');
      rank.append(h('h3', '', t(`エリアの順位：${r.rank} 位`, `Area rank: #${r.rank}`)));
      const list = h('ol', 'isl-rank');
      r.area.forEach((x, k) => {
        const li = h('li', x.me ? 'is-me' : '');
        li.append(h('span', 'isl-rank-n', `${k + 1}`), h('span', '', x.me ? t('あなたの会社', 'Your company') : x.name), h('b', '', money(x.sales)));
        list.append(li);
      });
      rank.append(list);
      body.append(rank);
      for (const n of r.news) {
        const [who, what, kind] = n.split('|');
        if (kind === 'out') body.append(h('p', 'isl-good', t(`${who}が「${what}」から撤退しました。`, `${who} pulled out of ${what}.`)));
        else if (kind === 'copy') body.append(h('p', 'isl-warn', t(`${who}が「${what}」を真似しはじめました（独占が終わった）。`, `${who} started copying ${what} (the monopoly ended).`)));
        else body.append(h('p', 'isl-warn', t(`${who}が「${what}」の販売を始めました。`, `${who} started selling ${what}.`)));
      }
    },
    then,
  );
}

// ---------------------------------------------------------------- 給与・労務

/** 給与・労務（段 E2 で士気と給与の画面に。hrui.ts） */
export const openPayroll = (ctx: Ctx) => openPayrollHr(ctx);

// ---------------------------------------------------------------- SCM

export function openBom(ctx: Ctx) {
  // 段 UIX3b：新しい画面（uix/screens/biz.ts）
  return uxb.bom!(ctx);
}

// ---------------------------------------------------------------- 経営企画（建築）・R&D（商品開発）

export function openDev(ctx: Ctx) {
  return uxh.dev!(ctx);
}

/** 経営企画 → M&A（法務の部門が開く前：Epic の町に進出すると、法務の部門が他社の買収を受け持つ。開いたあとは法務 → M&A へ。main.ts） */
export function openMA(ctx: Ctx) {
  return uxh.ma!(ctx);
}

// ---------------------------------------------------------------- マーケティング

export function openAds(ctx: Ctx) {
  // 段 UIX3b：新しい画面（uix/screens/biz.ts）
  return uxb.ads!(ctx);
}

export function openMissions(ctx: Ctx) {
  // 段 UIX4r：管制卓の一覧へ（器は同じ札）
  return uxr.missions!(ctx);
}

/** 建物 1 つの設備投資の一覧（工房・お店・倉庫の画面、タイルの吹き出し、システム画面で使う） */
export function investList(ctx: Ctx, b: PBuilding, onDone: () => void): HTMLElement {
  const s = ctx.s();
  const box = h('div', 'isl-invest');
  const kind = P1B[b.id]?.kind;
  // 段 UI3：お店の設備投資は、いま効く順（販売の見込みの大きい順）に並べて「+N 個／月」を添える。効かないもの（序盤の陳列の什器・裏の倉庫）は下に薄く
  const gains = kind === 'shop' && b.left <= 0 && s.shops[b.uid] && !ctx.step?.() ? shopInvestOrder(s, b) : null;
  const list = INVESTS.filter((v) => v.kind === kind);
  if (gains) list.sort((p, q) => gains.findIndex((g) => g.id === p.id) - gains.findIndex((g) => g.id === q.id));
  for (const x of list) {
    const lv = invLv(b, x.id);
    const cost = investCost(b, x.id);
    const gi = gains?.find((g) => g.id === x.id);
    const row = h('div', `isl-invest-row ${gi?.weak && cost != null ? 'is-weak' : ''}`);
    row.dataset.invest = x.id;
    const name = h('div');
    name.append(h('b', '', `${x.name}${x.cost.length > 1 ? `  ${lv}/${x.cost.length}` : lv ? ' ✓' : ''}`), h('small', 'isl-dim', x.note));
    if (gi && cost != null)
      name.append(
        h(
          'small',
          gi.weak ? 'isl-dim' : 'isl-invest-gain',
          gi.weak ? t('いまは効かない（販売は増えない）', 'No effect now (sales won’t rise)') : x.id === 'shelves' ? t(`別の商品を並べて +${Math.round(gi.units * 10) / 10} 個／月`, `+${Math.round(gi.units * 10) / 10}/mo with a new item`) : t(`見込み +${Math.round(gi.units * 10) / 10} 個／月`, `+${Math.round(gi.units * 10) / 10}/mo expected`),
        ),
      );
    // 資金が足りないときは、その場で「あと ○○ G」
    if (cost != null && s.money < cost && b.left <= 0) name.append(h('small', 'isl-warn', t(`あと ${money(cost - s.money)}`, `${money(cost - s.money)} short`)));
    const go = btn(cost == null ? t('最大', 'Max') : money(cost), () => {
      const e = invest(s, b.uid, x.id);
      if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
      else if (!e) ctx.toast(t(`「${x.name}」を導入しました`, `Installed: ${x.name}`));
      ctx.save();
      ctx.refresh();
      onDone();
    }, cost == null ? '' : 'is-on');
    go.disabled = cost == null || s.money < cost || b.left > 0;
    row.append(name, go);
    box.append(row);
  }
  return box;
}

export function openInvest(ctx: Ctx) {
  // 段 UIX3k：新しい画面（uix/screens/invest.ts）へ
  return uxk.invest!(ctx);
}

export const P1B_NAME = (id: string) => (P1B[id] ? DEF[id].name : id);
void isEn;
