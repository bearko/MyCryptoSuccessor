/**
 * フェーズ 1 の札：工房（クラフト）・お店・調達・従業員・市場データ・ランキング・スキル・月の報告。
 * どれも下から出る大きな札（sheet）。中身は state から毎回作り直す。
 */
import { t, isEn } from '../../i18n';
import { pickMake } from './stockui';
import { evMul } from './events';
import type { Sfx } from './sfx';
import { assetUrl, drawRef } from '../../render/images';
import { heroById, heroFacesRight } from '../../game/catalog';
import raw from '../../generated/catalog.json';
import { DEF } from '../defs';
import {
  ADS,
  AD_TIER,
  AWARE_GOODS,
  PROC,
  procNeed,
  DEV,
  INTEL,
  INVESTS,
  LAND_COMPANIES,
  MARKET,
  MISSIONS,
  rewardText,
  MAT_KEYS,
  MATS,
  P1B,
  PRODUCT,
  PRODUCTS,
  rivalDef,
  SELF_RUN,
  SHOP,
  TASKS,
  UNCOMMON,
  WORLD_COMPANIES,
  aptitude,
  sku,
  skuParts,
  skuPrice,
  type Mat,
  type Rar,
  type Sku,
  type Task,
} from './data';
import {
  hasRoute,
  adBoost,
  adLock,
  adUpper,
  adWide,
  companyRevenue,
  townsWithShops,
  fullUse,
  procCap,
  procItems,
  procLeft,
  procMats,
  procQty,
  setProcQty,
  toggleProcExtra,
  toggleProcItem,
  utilRate,
  areaRanking,
  rivalBase,
  saleBonus,
  rivalAreaMul,
  edgeMul,
  assign,
  claim,
  devCost,
  develop,
  intelLv,
  invest,
  investCost,
  invLv,
  accept,
  activeMissions,
  MISSION_MAX,
  missionProgress,
  offeredMissions,
  runAd,
  adCost,
  setDustShop,
  unitCost,
  unsellableHere,
  type PBuilding,
  batchOf,
  order as placeOrder,
  orderFrom,
  LOT,
  leadDays,
  walkDays,
  craftCheck,
  craftDays,
  has,
  myWarehouses,
  myWorkshop,
  poolCap,
  poolFree,
  poolUsed,
  hire,
  market,
  unitPrice,
  isCheap,
  monthRevenue,
  myShops,
  partMax,
  recommend,
  relicMarket,
  relicsSoon,
  relicSku,
  makeSku,
  setPart,
  setShelf,
  shelvesAuto,
  speed,
  staffOf,
  startCraft,
  setCraftPlan,
  setAutoCraft,
  wageOf,
  signFee,
  heroStats,
  type P1State,
  type Report,
  procBonus,
  scoutMul,
  relicMinCraft,
  MAX_HAULERS,
} from './model';
import { canImport, cheapAt, dutyText, headSuggest, importLead, importPrice, setSource, sourceOf, tradeNeighbors } from './tariff';
import { sectorDef as secDef } from './company';
import { tradeCmpEl } from './tariffui';
import { sectorDef, sectorProfile } from './company';
import { UNSELLABLE_TEXT, seriesTag } from './digview';
import { applyPlan, manualPlan } from './plan';
import { bar, btn, extImage, fmt, h, heroIcon, heroName, matIcon, money, sheet, skuIcon, skuName, rich } from './ui';
import { cvBox, rankBarsEl, trendEl } from './chartkit';
import { monHead, monLab, rankHist, rankRows } from './dash';
import { bomRow, extCard, extSlot, jobLabel, knownBar, lotsFromStock, needText, pickExt, pickHero, profitPerDay, radar, rankEl, slot, techNeed } from './heroui';
import { rolesCard } from './delegui';
import { adBreakeven, adGain } from './moves';
import { craftable, shopInvestOrder } from './orders';
import { charismaCard, charismaNeeds, openPayroll as openPayrollHr } from './hrui';
import { hireEmptyLines } from './hr';

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


/**
 * 作る数：0〜手持ちの素材で作れる最大個数のバーと、数の直接入力。右に「自動製造」（素材があるかぎり作り続ける。オンならバーは使えない）。
 */
function craftPlan(ctx: Ctx, s: P1State, k: number): HTMLElement {
  const sl = s.slots[k];
  const x = sl.sku!;
  const batch = batchOf(x, s);
  const max = lotsFromStock(s, x) * batch;
  const box = h('div', `isl-plan ${sl.repeat ? 'is-auto' : ''}`);
  const label = h('small', 'isl-dim', t('作る数', 'Make'));
  const range = h('input', 'isl-plan-range');
  range.type = 'range';
  range.min = '0';
  range.max = String(max);
  range.step = String(batch);
  const cur = sl.repeat ? max : Math.min(sl.left ?? 0, max);
  range.value = String(cur);
  const num = h('input', 'isl-plan-num');
  num.type = 'number';
  num.min = '0';
  num.max = String(max);
  num.step = String(batch);
  num.inputMode = 'numeric';
  num.value = String(cur);
  range.disabled = num.disabled = sl.repeat || max === 0;
  const unit = h('small', '', t('個', 'pcs'));
  const apply = (v: number) => {
    const n = Math.max(0, Math.min(max, Math.ceil(v / batch) * batch));
    setCraftPlan(s, k, n);
    after(ctx);
  };
  range.addEventListener('input', () => (num.value = range.value));
  range.addEventListener('change', () => apply(Number(range.value)));
  num.addEventListener('change', () => apply(Number(num.value) || 0));
  const auto = h('label', 'isl-plan-auto');
  const cb = h('input');
  cb.type = 'checkbox';
  cb.checked = sl.repeat;
  cb.addEventListener('change', () => {
    setAutoCraft(s, k, cb.checked);
    after(ctx);
  });
  auto.append(cb, h('span', '', t('自動製造', 'Auto')));
  box.append(label, range, num, unit, auto);
  const note = sl.repeat
    ? t('素材があるかぎり作り続けます。', 'Keeps making while materials last.')
    : max === 0
      ? t('素材が足りないので、いまは作れません。', 'Not enough materials right now.')
      : t(`手持ちの素材で最大 ${max} 個（1 ロット ${batch} 個ずつ）。${sl.running ? 'いま作っている 1 ロットのあとに、この数だけ作ります。' : ''}`, `Up to ${max} from stock (${batch} per lot).${sl.running ? ' Counted after the current lot.' : ''}`);
  const wrap = h('div', 'isl-plan-wrap');
  wrap.append(box, h('small', 'isl-dim', note));
  return wrap;
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
      const secs: HTMLElement[] = [];
      parts.forEach((p, k) => {
        const sec = h('section', 'isl-part');
        sec.dataset.part = String(k);
        sec.append(h('h3', 'isl-part-title', p.title));
        p.render(sec);
        secs.push(sec);
        if (k > 0) {
          const b = btn(`↓ ${p.title}`, () => sec.scrollIntoView({ block: 'start', behavior: 'smooth' }), 'isl-part-go');
          jump.append(b);
        }
      });
      body.append(jump, ...secs);
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

export function open(ctx: Ctx, title: string, render: (body: HTMLElement) => void, onClose?: () => void) {
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

/** 段 UX1（C-6）：できごとで素材の値段が動いているあいだの添え書き（「（値上がり中 ×1.1）」「（値引き中 ×0.95）」） */
function evNote(s: P1State, m: Mat): string {
  const k = Math.round(evMul(s, 'mat', m) * 100) / 100;
  if (k === 1) return '';
  return k > 1 ? t(`（値上がり中 ×${k}）`, ` (price up ×${k})`) : t(`（値引き中 ×${k}）`, ` (discount ×${k})`);
}
export const after = (ctx: Ctx) => {
  ctx.save();
  ctx.refresh();
  current?.render();
};

const CRAFT_ERR: Record<string, string> = {
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
const craftErr = (x: Sku, e: string, s?: P1State) =>
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
 * 段 UI5a：作業台の作る物の 1 行「🏪 よろず屋・輸入品店に自動で並びます（主力にする）」。
 * 主力にするを押すと、全部のお店の主力をその商品に（提案書と同じ applyPlan）
 */
function makeNote(ctx: Ctx, s: P1State, x: Sku): HTMLElement {
  const shops = myShops(s);
  const names = [...new Set(shops.map((b) => DEF[b.id]?.name ?? ''))].join(t('・', ', '));
  const p = h('p', 'isl-make-note');
  p.append(h('span', '', t(`🏪 ${names}に自動で並びます`, `🏪 Goes on the shelves at ${names}`)));
  const not = shops.filter((b) => s.shops[b.uid]?.shelves[0] !== x);
  if (not.length)
    p.append(
      btn(t('主力にする', 'Make it the main item'), () => {
        applyPlan(s, manualPlan(not.map((b) => ({ k: 'main' as const, uid: b.uid, x }))));
        ctx.sfx?.('tap');
        ctx.toast(t(`${skuName(x)}を ${not.length} 軒のお店の主力にしました`, `${skuName(x)} is now the main item at ${not.length} shop(s)`));
        after(ctx);
      }, 'is-on'),
    );
  else p.append(h('small', 'isl-good', t('（主力）', '(main item)')));
  return p;
}

/** 画面の中の要素までスクロールして、しばらく金色に光らせる */
function flashTo(el: HTMLElement | null) {
  if (!el) return;
  el.classList.add('is-flash');
  requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
  setTimeout(() => el.classList.remove('is-flash'), 2400);
}

/**
 * 工房の画面。
 * invest：いちばん下の「設備投資」の欄までスクロールして光らせる（マインちゃんの助言から）。
 * make：その商品を作るものとして選んだ状態で開く（市場データの「工房で作る」）。空いている作業台があればそこに入れ、
 * 無ければ 1 台目の作るものの選択をその商品を先頭にして開く。作る数のところへスクロールして光らせる
 */
export function openWorkshop(ctx: Ctx, opt: boolean | { invest?: boolean; make?: Sku; from?: string } = false) {
  const o = typeof opt === 'boolean' ? { invest: opt } : opt;
  const toInvest = !!o.invest;
  const s0 = ctx.s();
  /** 作るものを入れた作業台（スクロール先） */
  let made = -1;
  if (o.make) {
    const free = s0.slots.findIndex((sl) => !sl.sku);
    if (free >= 0) {
      made = free;
      chooseMake(ctx, s0, free, o.make);
    }
  }
  open(ctx, t('工房', 'Workshop'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'workshop', body);
    const scene = h('div', 'isl-craft-scene');
    scene.style.backgroundImage = `url("${assetUrl('mch/Image/CraftBackgrounds/Base/100.webp')}")`;
    const amb = h('img', 'isl-craft-amb');
    amb.src = assetUrl('mch/Image/CraftBackgrounds/Base/200.gif');
    amb.alt = '';
    scene.append(amb);
    if (has(s, 'pot')) {
      const pot = h('img', 'isl-craft-pot');
      pot.src = assetUrl('mch/Image/CraftBackgrounds/Stages/201.gif');
      pot.alt = '';
      scene.append(pot);
    }
    const crew = h('div', 'isl-craft-crew');
    for (const sl of s.slots) if (sl.worker != null) crew.append(heroIcon(sl.worker, 64));
    scene.append(crew);
    body.append(scene);

    // 作業台：職人の枠と、作るエクステの枠。エクステを選ぶとすぐ作り始める（続けて作る）
    s.slots.forEach((sl, k) => {
      const card = h('div', 'isl-card2 isl-bench');
      card.append(h('h3', '', t(`作業台 ${k + 1}`, `Workbench ${k + 1}`)));
      const row = h('div', 'isl-slots');
      row.append(
        slot(s, {
          label: t('職人', 'Crafter'),
          task: 'craft',
          hero: sl.worker,
          hot: ctx.step?.() === 'craft' && k === 0 && sl.worker == null,
          onTap: () =>
            pickHero(ctx.root, s, {
              title: t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`),
              task: 'craft',
              current: sl.worker,
              onPick: (v) => {
                if (v == null && sl.worker != null) assign(s, sl.worker, null);
                else if (v != null) assign(s, v, 'craft', k);
                after(ctx);
              },
            }),
        }),
        h('span', 'isl-slot-arrow', '→'),
        extSlot({
          label: t('作るもの', 'Making'),
          x: sl.sku,
          hot: ctx.step?.() === 'craft' && k === 0 && sl.worker != null && !sl.sku,
          // 段 UI5c：使い切りの製造は「いまの素材で あと N 個 → ○○に戻る」
          sub: sl.sku ? (sl.back !== undefined ? (sl.back ? t(`いまの素材で あと ${(sl.left ?? 0) + (sl.running && !s.deleg?.pend?.[k] ? batchOf(sl.sku, s) : 0)} 個 → ${skuName(sl.back)}に戻る`, `From stock: ${(sl.left ?? 0) + (sl.running && !s.deleg?.pend?.[k] ? batchOf(sl.sku, s) : 0)} more → back to ${skuName(sl.back)}`) : t(`いまの素材で あと ${(sl.left ?? 0) + (sl.running && !s.deleg?.pend?.[k] ? batchOf(sl.sku, s) : 0)} 個`, `From stock: ${(sl.left ?? 0) + (sl.running && !s.deleg?.pend?.[k] ? batchOf(sl.sku, s) : 0)} more`)) : sl.repeat ? t('自動製造', 'Auto') : (sl.left ?? 0) > 0 ? t(`あと ${sl.left} 個`, `${sl.left} more`) : t('この 1 ロットで止める', 'Stops after this lot')) : undefined,
          warn: !!sl.sku && !sl.running && !!craftCheck(s, sl.sku, sl.worker, sl.back !== undefined),
          onTap: () =>
            // 段 UI5c：チュートリアルのあとは、並び（いまの素材で作れる）・絞り込み・ランクアップの印つき
            !ctx.step?.()
              ? pickMake(ctx, k, { title: t(`作業台 ${k + 1} で作るもの`, `What bench ${k + 1} makes`), items: craftable(s), onPick: (x) => chooseMake(ctx, s, k, x) })
              : pickExt(ctx.root, s, {
                  title: t(`作業台 ${k + 1} で作るもの`, `What bench ${k + 1} makes`),
                  items: craftable(s, !!ctx.step?.()),
                  current: sl.sku,
                  worker: sl.worker,
                  badge: ctx.step?.() === 'craft' ? { x: sku(recommend(s), 'C'), text: t('マインちゃんのおすすめ', 'Mine-chan’s pick') } : null,
                  onPick: (x) => x && chooseMake(ctx, s, k, x),
                }),
        }),
      );
      card.append(row);
      // 段 UI5a：製造と販売の連動。作る物はお店に自動で並ぶ（主力にするかは 1 行で）。チュートリアルのあいだは出さない
      if (sl.sku && shelvesAuto(s) && myShops(s).length) card.append(makeNote(ctx, s, sl.sku));
      if (sl.sku) card.append(bomRow(s, sl.sku, 24));
      const st = sl.worker != null ? staffOf(s, sl.worker) : null;
      if (sl.running && sl.sku) {
        const need = craftDays(s, sl.sku);
        const p = h('div', 'isl-field');
        const left = Math.max(0, Math.ceil((need - sl.progress) / (st ? speed(st, 'craft', s) : 1)));
        p.append(h('span', '', t('進み', 'Progress')), bar(sl.progress / need, 'var(--isl-gold)'), h('span', 'isl-dim', st?.resting ? t('休憩中', 'Resting') : t(`あと約 ${left} 日`, `~${left} days left`)));
        card.append(p);
      }
      const err = sl.worker == null ? 'worker' : sl.sku ? craftCheck(s, sl.sku, sl.worker, sl.back !== undefined) : null;
      if (err && !sl.running) card.append(h('p', 'isl-warn', sl.sku ? craftErr(sl.sku, err, s) : CRAFT_ERR[err] ?? err));
      if (sl.sku) card.append(craftPlan(ctx, s, k));
      body.append(card);
    });

    // 作れるエクステの見比べ（今の素材で、どれがいちばん効率がよいか）
    const cmp = h('div', 'isl-card2');
    cmp.append(h('h3', '', t('作れるエクステの見比べ', 'Compare extensions')), h('p', 'isl-dim', t('素材 → 商品のつながりと、今の素材で何ロット作れるか、1 日あたりの粗利。押すと作業台 1 で作ります。', 'Materials → product, lots your stock makes and gross profit per day. Tap to make it on bench 1.')));
    // 作れるものを先に（技がまだのものはうしろ）
    const list = [...craftable(s, !!ctx.step?.())].sort((a, b) => Number(craftCheck(s, a, null) === 'tech') - Number(craftCheck(s, b, null) === 'tech') || profitPerDay(s, b) - profitPerDay(s, a));
    const okList = list.filter((x) => lotsFromStock(s, x) > 0 && !craftCheck(s, x, s.slots[0]?.worker ?? null));
    const grid = h('div', 'isl-ext-grid');
    for (const x of list)
      grid.append(
        extCard(s, x, {
          worker: s.slots[0]?.worker ?? null,
          best: x === okList[0],
          on: s.slots.some((sl) => sl.sku === x),
          onTap: () => chooseMake(ctx, s, 0, x),
        }),
      );
    cmp.append(grid);
    body.append(cmp);

    const stock = h('div', 'isl-card2');
    stock.append(h('h3', '', t('工房の倉庫（運ぶ前の商品）', 'Workshop storage (goods to haul)')));
    const sl = h('div', 'isl-stock');
    const entries = Object.entries(s.stock).filter(([, n]) => (n ?? 0) > 0) as [Sku, number][];
    if (!entries.length) sl.append(h('span', 'isl-dim', t('まだありません', 'Nothing yet')));
    for (const [x, n] of entries) {
      const c = h('span', 'isl-chip');
      c.append(skuIcon(x, 28), h('span', '', `${skuName(x)} ×${n}`));
      sl.append(c);
    }
    stock.append(sl, h('p', 'isl-dim', t('できた商品は、物流の担当がお店へ運びます。', 'Haulers carry finished goods to your shops.')));
    body.append(stock);
    const wsB = s.buildings.find((b) => b.owner === 'me' && b.id === 'workshop');
    if (wsB && !ctx.step?.()) body.append(investCard(ctx, wsB, t('作業台・荷車・トラック・物置など。建物ごと（セクタごと）の設備なので、新しいセクタでは入れ直します。', 'Workbenches, carts, truck, stockroom and more. Equipment belongs to each building, so new sectors start fresh.')));
  });
  if (toInvest) flashTo(document.querySelector<HTMLElement>('.isl-sheet .isl-invest-card'));
  if (o.make) {
    if (made >= 0) flashTo(document.querySelectorAll<HTMLElement>('.isl-sheet .isl-bench')[made]?.querySelector<HTMLElement>('.isl-plan-wrap') ?? null);
    else if (s0.slots[0]) {
      // 空いている作業台が無い：1 台目の作るものの選択を、その商品を先頭にして開く
      const x = o.make;
      const onPick = (v: Sku | null) => {
        if (!v) return;
        chooseMake(ctx, s0, 0, v);
        flashTo(document.querySelector<HTMLElement>('.isl-sheet .isl-bench .isl-plan-wrap'));
      };
      const badge = { x, text: o.from ?? t('市場データで選んだ', 'Picked from market data') };
      const note = t('作業台は全部ふさがっています。作業台 1 の作るものを替えるなら、ここで選びましょう。', 'Every bench is busy. Choose here to switch what bench 1 makes.');
      if (!ctx.step?.()) pickMake(ctx, 0, { title: t('作業台 1 で作るもの', 'What bench 1 makes'), items: craftable(s0), badge, note, onPick });
      else
        pickExt(ctx.root, s0, {
          title: t('作業台 1 で作るもの', 'What bench 1 makes'),
          items: craftable(s0, !!ctx.step?.()),
          current: s0.slots[0].sku,
          worker: s0.slots[0].worker,
          badge,
          note,
          onPick,
        });
    }
  }
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
  const s0 = ctx.s();
  const b = s0.buildings.find((x) => x.uid === uid);
  if (!b) return;
  const name = DEF[b.id].name;
  open(ctx, name, (body) => {
    mineTip(ctx, 'shop', body);
    const s = ctx.s();
    const sh = s.shops[uid];
    if (!sh) {
      body.append(h('p', '', t('工事が終わると開けます。', 'Opens when construction is done.')));
      return;
    }
    body.append(shopView(ctx, uid, () => after(ctx)));
    const info = h('div', 'isl-card2');
    info.append(h('h3', '', t('今月の売上', 'Sales this month')), h('p', 'isl-big', money(sh.rev)));
    const sat = h('div', 'isl-field');
    sat.append(h('span', '', t('お客さんの満足', 'Customer mood')), bar(sh.sat, sh.sat > 0.8 ? 'var(--isl-good)' : 'var(--isl-bad)'));
    info.append(sat, h('p', 'isl-dim', t('棚が空になる日が続くと満足が下がり、売れにくくなります。', 'Empty shelves lower the mood and slow sales.')));
    body.append(info);
    // 名物店主（✨ スキル）：1 軒だけ選べる。替えられる
    if (has(s, 'd_shop')) {
      const fam = h('div', 'isl-card2 isl-famous');
      const here = s.dustShop === uid;
      const other = s.dustShop != null && s.dustShop !== uid && s.shops[s.dustShop] ? DEF[s.buildings.find((x) => x.uid === s.dustShop)?.id ?? '']?.name ?? '' : '';
      fam.append(h('h3', '', t('✨ 名物店主', '✨ Famous shopkeeper')), h('p', 'isl-dim', t('選んだ 1 軒の売り場の強さ +40%。いつでも替えられます。', 'One chosen shop gets +40% pull. You can switch any time.')));
      if (here) fam.append(h('p', 'isl-gold', t('このお店が名物店主のお店です', 'This is your famous shopkeeper’s shop')));
      else
        fam.append(
          btn(other ? t(`このお店に替える（いまは${other}）`, `Switch here (now: ${other})`) : t('名物店主にする', 'Make this the famous shop'), () => {
            if (setDustShop(s, uid)) {
              ctx.sfx?.('levelup');
              ctx.toast(t(`${name}を名物店主のお店にしました（売り場の強さ +40%）`, `${name} is now the famous shop (pull +40%)`));
            }
            after(ctx);
          }, 'is-on'),
        );
      body.append(fam);
    }

    // 棚：四角い枠にエクステの絵。押すとエクステを選ぶ
    const shelves = h('div', 'isl-card2');
    shelves.append(h('h3', '', shelvesAuto(s) ? t('棚（左が主力商品。並ぶのは工房で作っている商品）', 'Shelves (left is the main item; they follow the workshop)') : t('棚（左が主力商品）', 'Shelves (left is the main product)')));
    const row = h('div', 'isl-slots');
    sh.shelves.forEach((x, k) => {
      row.append(
        extSlot({
          label: k === 0 ? t('主力商品', 'Main') : t(`棚 ${k + 1}`, `Shelf ${k + 1}`),
          x,
          hot: ctx.step?.() === 'sell' && k === 0 && !x,
          sub: x ? t(`棚 ${sh.shelf[x] ?? 0}・裏 ${sh.storage[x] ?? 0}`, `shelf ${sh.shelf[x] ?? 0}, back ${sh.storage[x] ?? 0}`) : undefined,
          warn: !!x && (sh.shelf[x] ?? 0) <= 0 && (sh.storage[x] ?? 0) <= 0,
          onTap: () => pickShelf(ctx, uid, k, () => after(ctx), shelfMoved(ctx)),
        }),
      );
    });
    shelves.append(row);
    const bNow = s.buildings.find((x) => x.uid === uid);
    if (bNow && investCost(bNow, 'shelves') != null) shelves.append(h('p', 'isl-dim', t('棚は、下の「設備投資」の「棚を増やす」で増やせます（お店ごと）。', 'Add shelves with “More shelves” under Capital investment below (per shop).')));
    body.append(shelves);

    const crew = h('div', 'isl-card2');
    crew.append(h('h3', '', t('売り場の人', 'Floor staff')));
    const r2 = h('div', 'isl-slots');
    r2.append(
      slot(s, {
        label: t('店員', 'Clerk'),
        task: 'shop',
        hero: sh.staff,
        hot: ctx.step?.() === 'sell' && sh.staff == null && sh.part === 0,
        onTap: () =>
          pickHero(ctx.root, s, {
            title: t(`${name}の店員`, `Clerk for ${name}`),
            task: 'shop',
            current: sh.staff,
            onPick: (v) => {
              if (v == null && sh.staff != null) assign(s, sh.staff, null);
              else if (v != null) assign(s, v, 'shop', uid);
              after(ctx);
            },
          }),
      }),
    );
    // アルバイト：人の形を並べて、＋／−
    const pt = h('div', 'isl-part');
    // 段 UI5a：アルバイトは店長が管理する「従業員」（2 人いれば、店長が休む日も従業員で営業）
    pt.append(h('small', 'isl-slot-label', t(`従業員（${SELF_RUN.min} 人で休む日も営業）`, `Staff (${SELF_RUN.min} keep it open on days off)`)));
    const people = h('div', 'isl-part-people');
    for (let k = 0; k < partMax(s, uid); k++) people.append(h('span', `isl-person ${k < sh.part ? 'is-on' : ''}`, '👤'));
    const pr = h('div', 'isl-row');
    const minus = btn('−', () => {
      setPart(s, uid, sh.part - 1);
      after(ctx);
    });
    const plus = btn('+', () => {
      setPart(s, uid, sh.part + 1);
      after(ctx);
    });
    minus.disabled = sh.part <= 0;
    plus.disabled = sh.part >= partMax(s, uid);
    pr.append(minus, plus);
    pt.append(people, pr, h('small', 'isl-dim', t(`1 人 1 日 ${SHOP.partTimeWage} G`, `${SHOP.partTimeWage} G/day each`)));
    r2.append(pt);
    crew.append(r2, h('p', 'isl-dim', t('店員かアルバイトがいれば、届いた商品を棚に並べて自動で売ります。販売は INT が高いヒーローが得意です。', 'With a clerk or part-timer, deliveries are shelved and sold automatically. High-INT heroes sell best.')));
    body.append(crew);
    if (bNow && !ctx.step?.()) body.append(investCard(ctx, bNow, t('このお店の棚・アルバイトの上限・看板など。建物ごと（セクタごと）の設備です。', 'Shelves, part-timer limit, signboard and more for this shop. Equipment belongs to each building (each sector).')));
  });
}

// ---------------------------------------------------------------- 調達

/** 注文中（納期に問屋の人が運んでくる） */
function ordersCard(s: P1State): HTMLElement {
  const card = h('div', 'isl-card2');
  card.append(h('h3', '', t('注文中', 'On order')));
  if (!s.orders?.length) {
    card.append(h('p', 'isl-dim', t('いま注文している素材はありません。注文すると、納期に問屋の人が工房まで運んできます（工房に入ったら在庫になります）。', 'No orders. Ordered materials are carried to the workshop by the wholesaler’s staff on the due day.')));
    return card;
  }
  for (const o of s.orders) {
    const r = h('div', 'isl-row isl-order');
    r.append(matIcon(o.m, 28), h('b', '', t(`${MATS[o.m].name} ${o.qty} 個`, `${o.qty} ${MATS[o.m].name}`)), heroIcon(o.courier, 32), h('small', 'isl-dim', o.left <= walkDays(s) ? t(`${heroName(o.courier)}が運んでいる途中・あと ${o.left} 日`, `${heroName(o.courier)} is on the way · ${o.left} d`) : t(`問屋で支度中・あと ${o.left} 日`, `Being packed · ${o.left} d`)));
    card.append(r);
  }
  return card;
}

export function openBuy(ctx: Ctx) {
  open(ctx, t('調達', 'Buying'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'buy', body);
    // 見習い期間（チュートリアルの「素材」の段）：作るのに使う素材を手で買うところだけ見せる
    if (ctx.step?.() === 'mats') {
      const card = h('div', 'isl-card2');
      card.append(h('h3', '', t('素材を買い足す（卸問屋）', 'Top up materials (wholesaler)')));
      // 作っているものの素材（まだ何も作っていなければ、ルートのある素材）
      const mats = procMats(s).map((x) => x.m);
      for (const m of mats.length ? mats : MAT_KEYS.filter((m) => hasRoute(s, m))) {
        const row = h('div', 'isl-row');
        row.append(matIcon(m, 36), h('b', '', MATS[m].name), h('span', 'isl-dim', t(`在庫 ${s.mats[m] ?? 0}`, `have ${s.mats[m] ?? 0}`)));
        const b = btn(t(`1 ロット（${LOT} 個）注文する（${money(unitPrice(s, m) * LOT)}・納期 ${leadDays(s)} 日）`, `Order 1 lot (${LOT}) — ${money(unitPrice(s, m) * LOT)}, ${leadDays(s)} days`), () => {
          const e = placeOrder(s, m, 1);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (e === 'storage') ctx.toast(t('置き場所がありません', 'No storage room'));
          else if (!e) ctx.toast(t(`${MATS[m].name}を 1 ロット注文しました（${leadDays(s)} 日後に届きます）`, `Ordered 1 lot of ${MATS[m].name} (arrives in ${leadDays(s)} days)`));
          after(ctx);
        }, s.orders?.length ? 'is-on' : 'is-on is-guide');
        b.disabled = s.money < unitPrice(s, m) * LOT || poolFree(s) < LOT;
        row.append(b);
        card.append(row);
      }
      body.append(card, ordersCard(s));
      return;
    }
    body.append(ordersCard(s));
    // ランクと上限
    const rank = h('div', 'isl-card2');
    const need = procNeed(s.proc.lv);
    const bonus = Math.round(procBonus(s) * 100);
    rank.append(
      h('h3', '', t(`調達ランク Lv.${s.proc.lv}`, `Buying rank Lv.${s.proc.lv}`)),
      bar(s.proc.lv >= PROC.maxLv ? 1 : s.proc.exp / need, 'var(--isl-gold)'),
      h('p', 'isl-dim', s.proc.lv >= PROC.maxLv ? t('最高ランクです', 'Max rank') : t(`次のランクまで ${Math.ceil(need - s.proc.exp)}（買った数と買い付けの回数で上がります）`, `${Math.ceil(need - s.proc.exp)} to the next rank (raised by units and purchases)`)),
      h('p', 'isl-big', t(`今月 ${s.proc.bought} / ${procCap(s)} 個`, `This month ${s.proc.bought} / ${procCap(s)}`)),
      h('p', poolFree(s) <= 0 ? 'isl-warn' : 'isl-dim', myWarehouses(s).length ? t(`置き場所（工房の物置＋倉庫 ${myWarehouses(s).length}）：${poolUsed(s)} / ${poolCap(s)} 個`, `Storage (workshop + ${myWarehouses(s).length} warehouse(s)): ${poolUsed(s)} / ${poolCap(s)}`) : t(`置き場所（工房の物置）：${poolUsed(s)} / ${poolCap(s)} 個。いっぱいになったら「建築」で倉庫を建てましょう`, `Storage (workshop): ${poolUsed(s)} / ${poolCap(s)}. Build a warehouse when it fills up`)),
      h('p', 'isl-dim', bonus ? t(`月に買える素材の数の上限です。ランクが上がると増えます（スキルで +${bonus}%）。`, `Monthly limit on materials bought. Grows with rank (skills +${bonus}%).`) : t('月に買える素材の数の上限です。ランクが上がると増えます。スキル「調達枠の拡大」でも増やせます。', 'Monthly limit on materials bought. Grows with rank and the “Bigger buying quota” skill.')),
    );
    body.append(rank);

    // 調達係
    const crew = h('div', 'isl-card2');
    const buyer = s.staff.find((x) => x.task === 'buy');
    const row = h('div', 'isl-slots');
    row.append(buyerSlot(ctx, s));
    crew.append(h('h3', '', t('自動の買い付け', 'Automatic buying')), row);
    crew.append(
      h(
        'p',
        buyer ? (buyer.resting ? 'isl-warn' : 'isl-dim') : 'isl-warn',
        !buyer ? t('調達係がいないので、自動では買いません。下の量は、調達係を決めると毎日少しずつ買い付けます。', 'No buyer: nothing is bought automatically. Assign one to buy the amounts below a little every day.') : buyer.resting ? t('調達係が休憩中なので、いまは買い付けが止まっています。', 'The buyer is resting; buying is paused.') : t('調達係が工房から卸問屋まで歩いて行き、「月の量」をもとに、次の買い付けが届くまでもつぶんを買って帰ります（休む前には休むあいだのぶんも。月の上限・資金・置き場所の中で）。適性が高いほど速く歩き、ランクも早く上がります。', 'The buyer walks from the workshop to the wholesaler and, based on the monthly amounts, brings back enough to last until the next delivery (plus the rest days before resting; within the limit, funds and storage). Higher aptitude walks faster and raises the rank faster.'),
      ),
    );
    const u = utilRate(s.utilLast);
    crew.append(h('p', 'isl-dim', u == null ? t('先月の工房の稼働率：まだ記録がありません', 'Workshop utilization last month: no record yet') : t(`先月の工房の稼働率：${Math.round(u * 100)}%`, `Workshop utilization last month: ${Math.round(u * 100)}%`)));
    body.append(crew);

    // 作りたいエクステ
    const want = h('div', 'isl-card2');
    want.append(h('h3', '', t('作りたいエクステ', 'Extensions to make')), h('p', 'isl-dim', t('選ぶと、必要な素材が下で自動で選ばれます（最初は作業台で作っているもの）。', 'Their materials are selected below automatically (defaults to what the benches make).')));
    const chips = h('div', 'isl-stock');
    const items = procItems(s);
    for (const x of craftable(s)) {
      const c = h('button', `isl-chip isl-pick ${items.includes(x) ? 'is-on' : ''}`);
      c.type = 'button';
      c.append(skuIcon(x, 24), h('small', '', skuName(x)));
      c.addEventListener('click', () => {
        toggleProcItem(s, x);
        after(ctx);
      });
      chips.append(c);
    }
    want.append(chips);
    body.append(want);

    // 素材ごとの月の量
    body.append(h('h3', '', t('素材ごとの月の量', 'Monthly amount per material')));
    const picked = procMats(s);
    const full = fullUse(s);
    // 買い付ける素材を上に
    const order = [...MAT_KEYS].sort((a, b) => Number(!picked.some((x) => x.m === a)) - Number(!picked.some((x) => x.m === b)));
    for (const m of order) {
      const card = h('div', 'isl-card2 isl-matrow');
      const route = hasRoute(s, m);
      const sel = picked.find((x) => x.m === m);
      const top = h('div', 'isl-row');
      top.append(matIcon(m, 32), h('b', '', MATS[m].name), h('span', 'isl-dim', t(`在庫 ${s.mats[m] ?? 0}・1 個 ${unitPrice(s, m)} G${evNote(s, m)}`, `have ${s.mats[m] ?? 0}, ${unitPrice(s, m)} G each${evNote(s, m)}`)));
      if (isCheap(s, m)) top.append(h('span', 'isl-chip is-good isl-cheap', t('特産 −20%', 'Local −20%')));
      if (route) {
        if (sel?.from === 'item') top.append(h('span', 'isl-chip is-on', t('エクステから', 'From extensions')));
        else
          top.append(
            btn(sel ? t('調達から外す', 'Remove') : t('調達に追加', 'Add'), () => {
              toggleProcExtra(s, m);
              after(ctx);
            }, sel ? '' : 'is-on'),
          );
      }
      card.append(top);
      if (route && sel) {
        const q = s.proc.qty[m];
        const n = procQty(s, m);
        const last0 = s.matUsedLast ? (s.matUsedLast[m] ?? 0) : null;
        // 月の量：数字を打つ代わりに、−／＋と、先月・100% の印がついた棒で
        const f = h('div', 'isl-qty');
        const max = Math.max(10, n, last0 ?? 0, full[m] ?? 0) * 1.25;
        const meter = h('div', 'isl-qty-meter');
        const fill = h('i', 'isl-qty-fill');
        fill.style.width = `${(n / max) * 100}%`;
        meter.append(fill);
        if (last0 != null) {
          const mk = h('i', 'isl-qty-mark');
          mk.style.left = `${(last0 / max) * 100}%`;
          mk.title = t('先月の消費', 'Used last month');
          meter.append(mk);
        }
        const mk2 = h('i', 'isl-qty-mark is-full');
        mk2.style.left = `${((full[m] ?? 0) / max) * 100}%`;
        mk2.title = t('100% 動いたとき', 'At 100%');
        meter.append(mk2);
        const steps = h('div', 'isl-row');
        steps.append(
          btn('−10', () => (setProcQty(s, m, n - 10), after(ctx))),
          btn('−1', () => (setProcQty(s, m, n - 1), after(ctx))),
          h('b', 'isl-qty-n', t(`${n} 個／月`, `${n}/mo`)),
          btn('+1', () => (setProcQty(s, m, n + 1), after(ctx))),
          btn('+10', () => (setProcQty(s, m, n + 10), after(ctx))),
        );
        if (full[m]) steps.append(btn(t('100% に合わせる', 'Match 100%'), () => (setProcQty(s, m, full[m] ?? 0), after(ctx))));
        if (q && !q.auto) steps.append(btn(t('自動に戻す', 'Back to auto'), () => (setProcQty(s, m, null), after(ctx))));
        f.append(meter, steps, h('small', 'isl-dim', q && !q.auto ? t('手で決めた量', 'Set by you') : (s.matUsedLast?.[m] ?? 0) > 0 ? t('先月と同じ（自動）', 'Same as last month (auto)') : t('いつもの体制（職人の休みも入れる）の見込み（自動）', 'Estimate at your usual pace, rest included (auto)')));
        card.append(f);
        const last = s.matUsedLast ? (s.matUsedLast[m] ?? 0) : null;
        const ref = [last == null ? t('先月の消費：記録なし', 'Last month: no record') : t(`先月の消費 ${last} 個`, `Used last month: ${last}`)];
        if (u != null && u < 0.995) ref.push(t(`稼働率 100% なら ${full[m] ?? 0} 個`, `${full[m] ?? 0} at 100% utilization`));
        else if (last == null) ref.push(t(`工房が 100% 動けば ${full[m] ?? 0} 個`, `${full[m] ?? 0} if the workshop runs 100%`));
        card.append(h('p', 'isl-dim', ref.join(t('・', ' · '))));
      }
      if (route) {
        const spot = h('div', 'isl-row');
        spot.append(h('small', 'isl-dim', t(`いま注文する（1 ロット ${LOT} 個・納期 ${leadDays(s)} 日）`, `Order now (${LOT} per lot, ${leadDays(s)} days)`)));
        for (const lots of [1, 5]) {
          const k = lots * LOT;
          const b = btn(t(`${lots} ロット（${money(unitPrice(s, m) * k)}）`, `${lots} lot${lots > 1 ? 's' : ''} (${money(unitPrice(s, m) * k)})`), () => {
            const e = placeOrder(s, m, lots);
            if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
            else if (e === 'cap') ctx.toast(t('今月の調達の上限を超えます', 'Over this month’s buying limit'));
            else if (e === 'storage') ctx.toast(t('置き場所がありません（倉庫を建てましょう）', 'No storage room (build a warehouse)'));
            else if (!e) ctx.toast(t(`${MATS[m].name}を ${k} 個注文しました（${leadDays(s)} 日後に届きます）`, `Ordered ${k} ${MATS[m].name} (arrives in ${leadDays(s)} days)`));
            after(ctx);
          });
          b.disabled = s.money < unitPrice(s, m) * k || procLeft(s) < k || poolFree(s) < k;
          spot.append(b);
        }
        card.append(spot);
      } else {
        const scout = s.staff.find((x) => x.task === 'explore' && x.target === m);
        if (scout) card.append(h('p', '', t(`${heroName(scout.hero)}が開拓中`, `${heroName(scout.hero)} is scouting`)), bar(scout.explore / (MATS[m].exploreDays * scoutMul(s))));
        else {
          const r = h('div', 'isl-row');
          r.append(h('span', 'isl-dim', t(`ルートが無い（開拓 ${Math.round(MATS[m].exploreDays * scoutMul(s))} 日〜）`, `No route (scouting from ${Math.round(MATS[m].exploreDays * scoutMul(s))} days)`)));
          r.append(
            btn(t('ヒーローを開拓に出す', 'Send a scout'), () =>
              pickHero(ctx.root, s, {
                title: t(`${MATS[m].name}のルートを開拓する`, `Scout a ${MATS[m].name} route`),
                task: 'explore',
                current: null,
                onPick: (v) => {
                  if (v == null) return;
                  assign(s, v, 'explore', m);
                  ctx.toast(t(`${heroName(v)}が${MATS[m].name}のルートを開拓しに出かけました`, `${heroName(v)} went scouting for a ${MATS[m].name} route`));
                  after(ctx);
                },
              }),
            ),
          );
          card.append(r);
        }
      }
      // 段 TRADE1a：となり町の問屋（ここ／となり町の値段・1 ロット取り寄せる・調達係の仕入れ先）
      tradeRows(ctx, s, m, card, !!sel);
      body.append(card);
    }
  });
}

/**
 * 段 TRADE1a：調達の画面の素材の行の「となり町」。取り寄せられるとなり町ごとに、ここ／となり町の値段（安いほうに印）・
 * 「1 ロット取り寄せる」・調達係の仕入れ先（ここ／この町）。仕入れ先は手で選んだものだけ続く（Common・Uncommon。Rare からは物流の部長も提案する）
 */
function tradeRows(ctx: Ctx, s: P1State, m: Mat, card: HTMLElement, picked: boolean) {
  const nbs = tradeNeighbors(s).filter((nb) => canImport(s, m, nb.id));
  if (!nbs.length) return;
  const box = h('div', 'isl-trade');
  const src = sourceOf(s, m);
  // Rare から：物流の部長の提案「〇〇は隣町で買うと月 −N G」（承認で調達係の仕入れ先が替わる）
  const hs = headSuggest(s, [m])[0];
  if (hs) {
    const nm = secDef(hs.from).name;
    const say = h('div', 'isl-imp-head');
    say.append(heroIcon(hs.hero, 36), h('span', 'isl-imp-say', t(`${heroName(hs.hero)}（物流の部長）「${MATS[m].name}は${nm}で買うと月 −${money(hs.save)}」`, `${heroName(hs.hero)} (Logistics head): “Buying ${MATS[m].name} in ${nm} saves ${money(hs.save)} a month”`)));
    say.append(
      btn(t('承認', 'Approve'), () => {
        setSource(s, m, hs.from);
        ctx.toast(t(`${MATS[m].name}は、調達係が${nm}から取り寄せます`, `The buyer will import ${MATS[m].name} from ${nm}`));
        after(ctx);
      }, 'is-on'),
    );
    box.append(say);
  }
  for (const nb of nbs) {
    const p = importPrice(s, m, nb.id);
    const days = importLead(s, nb.id);
    const row = h('div', 'isl-imp-row');
    row.append(tradeCmpEl({ name: nb.name, here: unitPrice(s, m), base: p.base, duty: p.duty, rate: dutyText(s, nb.id), days, cheap: cheapAt(nb.id, m) }));
    const acts = h('div', 'isl-row');
    const b = btn(t(`1 ロット取り寄せる（${money(p.unit * LOT)}）`, `Import 1 lot (${money(p.unit * LOT)})`), () => {
      const e = orderFrom(s, m, 1, nb.id);
      if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
      else if (e === 'cap') ctx.toast(t('今月の調達の上限を超えます', 'Over this month’s buying limit'));
      else if (e === 'storage') ctx.toast(t('置き場所がありません（倉庫を建てましょう）', 'No storage room (build a warehouse)'));
      else if (!e) ctx.toast(t(`${nb.name}から${MATS[m].name}を ${LOT} 個取り寄せます（${days} 日後に届きます）`, `Importing ${LOT} ${MATS[m].name} from ${nb.name} (arrives in ${days} days)`));
      after(ctx);
    }, p.unit < unitPrice(s, m) ? 'is-on' : '');
    b.disabled = s.money < p.unit * LOT || procLeft(s) < LOT || poolFree(s) < LOT;
    acts.append(b);
    if (picked || src === nb.id) {
      const on = src === nb.id;
      const c = btn(on ? t(`✓ 調達係は${nb.name}で買う`, `✓ Buyer buys in ${nb.name}`) : t(`調達係を${nb.name}で買わせる`, `Have the buyer buy in ${nb.name}`), () => {
        setSource(s, m, on ? null : nb.id);
        ctx.toast(on ? t(`${MATS[m].name}は、この町の卸問屋で買います`, `${MATS[m].name} will be bought here`) : t(`${MATS[m].name}は、調達係が${nb.name}から取り寄せます`, `The buyer will import ${MATS[m].name} from ${nb.name}`));
        after(ctx);
      }, on ? 'is-on isl-trade-src' : 'isl-trade-src');
      acts.append(c);
    }
    row.append(acts);
    box.append(row);
  }
  card.append(box);
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


function heroCard(s: P1State, hero: number, stats: ReturnType<typeof heroStats>): HTMLElement {
  const card = h('div', 'isl-hero-card');
  const top = h('div', 'isl-hero-top');
  const name = h('div');
  // いちばん向いている仕事（ランクと数）
  const best = TASKS.reduce((x, y) => (aptitude(stats, y.key) > aptitude(stats, x.key) ? y : x), TASKS[0]);
  const fit = h('div', 'isl-row');
  fit.append(h('small', 'isl-dim', t('いちばん向いている', 'Best at')), h('b', '', best.name), rankEl(aptitude(stats, best.key)));
  name.append(h('b', 'isl-hero-name', heroName(hero)), fit);
  top.append(heroIcon(hero, 64), name);
  card.append(top, radar(stats));
  void s;
  return card;
}

/** 調達係の枠（1 人） */
function buyerSlot(ctx: Ctx, s: P1State): HTMLElement {
  const buyer = s.staff.find((x) => x.task === 'buy');
  return slot(s, {
    label: t('調達係', 'Buyer'),
    task: 'buy',
    hero: buyer?.hero ?? null,
    onTap: () =>
      pickHero(ctx.root, s, {
        title: t('調達の担当', 'Buyer'),
        task: 'buy',
        current: buyer?.hero ?? null,
        onPick: (v) => {
          for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
          if (v != null) {
            assign(s, v, 'buy');
            ctx.toast(t(`${heroName(v)}が調達係になりました`, `${heroName(v)} is now the buyer`));
          }
          after(ctx);
        },
      }),
  });
}

/** 待機中のヒーローを選んでから枠を押すと、そのまま割り当てる */
let holding: number | null = null;

export function openStaff(ctx: Ctx) {
  holding = null;
  open(ctx, t('ヒーローの配置', 'Hero assignment'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'staff', body);
    body.append(h('p', 'isl-dim', t('① 調達 → ② 製造 → ③ 物流 → ④ 販売 の枠にヒーローを置くと、サイクルが自動で回ります。枠を押すと向いているヒーローの順に出ます。下の「待機中」のヒーローを押してから枠を押しても置けます。', 'Put heroes in ① Buy → ② Craft → ③ Haul → ④ Sell and the cycle runs by itself. Tap a slot to see the best fits, or tap a free hero below, then a slot.')));
    const put = (task: Task, target: number | string | null, title: string, current: number | null, remove?: () => void) => () => {
      if (holding != null) {
        if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== holding) assign(s, x.hero, null);
        if (remove && current != null) remove();
        assign(s, holding, task, target);
        holding = null;
        after(ctx);
        return;
      }
      pickHero(ctx.root, s, {
        title,
        task,
        current,
        onPick: (v) => {
          if (task === 'buy') for (const x of s.staff) if (x.task === 'buy' && x.hero !== v) assign(s, x.hero, null);
          if (v == null) {
            if (current != null) assign(s, current, null);
          } else {
            if (remove && current != null && current !== v) remove();
            assign(s, v, task, target);
          }
          after(ctx);
        },
      });
    };
    const lanes = h('div', 'isl-lanes');
    body.append(lanes);
    const lane = (n: string, title: string, slots: HTMLElement[], note: string) => {
      const c = h('div', 'isl-card2 isl-lane');
      const head = h('div', 'isl-row');
      head.append(h('span', 'isl-lane-n', n), h('h3', '', title));
      c.append(head, h('p', 'isl-dim', note));
      const row = h('div', 'isl-slots');
      row.append(...slots);
      c.append(row);
      lanes.append(c);
    };
    const hot = holding != null;
    // ① 調達
    const buyer = s.staff.find((x) => x.task === 'buy');
    lane('①', t('調達', 'Buy'), [slot(s, { label: t('調達係', 'Buyer'), task: 'buy', hero: buyer?.hero ?? null, hot: hot || (ctx.step?.() === 'hire' && !buyer), onTap: put('buy', null, t('調達の担当', 'Buyer'), buyer?.hero ?? null), onRemove: buyer ? () => (assign(s, buyer.hero, null), after(ctx)) : undefined })], t('卸問屋まで歩いて素材を買い付ける（適性：INT 寄りのバランス）', 'Walks to the wholesaler to buy materials (balanced, a bit more INT)'));
    // ② 製造
    lane(
      '②',
      t('製造', 'Craft'),
      s.slots.map((sl, k) => slot(s, { label: t(`作業台 ${k + 1}`, `Bench ${k + 1}`), task: 'craft', hero: sl.worker, hot, onTap: put('craft', k, t(`作業台 ${k + 1} の職人`, `Crafter for bench ${k + 1}`), sl.worker), onRemove: sl.worker != null ? () => (assign(s, sl.worker!, null), after(ctx)) : undefined })),
      t('工房でエクステを作る（適性：3 つの能力のバランス）', 'Makes extensions in the workshop (balance of all three stats)'),
    );
    // ③ 物流：今いる運搬係＋空きの枠（3 人まで）
    const haulers = s.staff.filter((x) => x.task === 'transport');
    const hs = haulers.map((x) => slot(s, { label: t('運搬係', 'Hauler'), task: 'transport', hero: x.hero, hot, onTap: put('transport', null, t('物流の担当', 'Hauler'), x.hero, () => assign(s, x.hero, null)), onRemove: () => (assign(s, x.hero, null), after(ctx)) }));
    if (haulers.length < MAX_HAULERS) hs.push(slot(s, { label: t('運搬係', 'Hauler'), task: 'transport', hero: null, hot: hot || (ctx.step?.() === 'haul' && !haulers.length), onTap: put('transport', null, t('物流の担当', 'Hauler'), null) }));
    lane('③', t('物流', 'Haul'), hs, t('工房からお店へ荷車で運ぶ（適性：PHY 重視）', 'Carts goods from the workshop to shops (mostly PHY)'));
    // ④ 販売
    const shops = myShops(s);
    lane(
      '④',
      t('販売', 'Sell'),
      shops.length ? shops.map((b) => slot(s, { label: DEF[b.id].name, task: 'shop', hero: s.shops[b.uid].staff, hot, onTap: put('shop', b.uid, t(`${DEF[b.id].name}の店員`, `Clerk for ${DEF[b.id].name}`), s.shops[b.uid].staff), onRemove: s.shops[b.uid].staff != null ? () => (assign(s, s.shops[b.uid].staff!, null), after(ctx)) : undefined })) : [h('p', 'isl-dim', t('お店が開いたら店員を置けます', 'Assign a clerk once a shop opens'))],
      t('お店で棚に並べて売る（適性：INT 重視）', 'Shelves and sells in a shop (mostly INT)'),
    );
    // 役目（任せ方の 4 段。段 D）：リーダー・部長・セクター長の札。チュートリアルの 1 か月目は出さない（画面を変えない）
    if (!ctx.step?.()) {
      const rc = rolesCard(ctx, s);
      if (rc) body.append(rc);
    }
    // そのほかの仕事
    const others = s.staff.filter((x) => x.task === 'explore' || x.task === 'intel' || x.task === 'train');
    if (others.length) {
      const c = h('div', 'isl-card2');
      c.append(h('h3', '', t('そのほかの仕事', 'Other jobs')));
      const row = h('div', 'isl-stock');
      for (const x of others) {
        const chip = h('span', 'isl-chip');
        chip.append(heroIcon(x.hero, 28), h('small', x.task === 'train' ? 'isl-gold' : '', heroName(x.hero) + t('・', ' · ') + jobLabel(s, x)));
        // 技の修行：進み具合
        if (x.task === 'train' && s.training?.hero === x.hero) chip.append(bar(1 - s.training.left / s.training.total, 'var(--isl-gold)'));
        row.append(chip);
      }
      c.append(row);
      body.append(c);
    }
    // 待機中のヒーロー
    const free = s.staff.filter((x) => x.task == null);
    const bench = h('div', 'isl-card2 isl-bench-free');
    bench.append(h('h3', '', t(`待機中のヒーロー（${free.length}）`, `Free heroes (${free.length})`)));
    if (!free.length) bench.append(h('p', 'isl-dim', t('全員が仕事中です。人手が足りなければ「人材登用」で雇えます。', 'Everyone is working. Hire more under Recruiting.')));
    const grid = h('div', 'isl-pick-grid');
    for (const x of free) {
      const card = h('button', `isl-hero-pick is-free ${holding === x.hero ? 'is-on' : ''}`);
      card.type = 'button';
      const best = TASKS.filter((k) => k.key !== 'explore' && k.key !== 'intel').reduce((a, k) => (aptitude(x.stats, k.key) > aptitude(x.stats, a.key) ? k : a));
      card.append(heroIcon(x.hero, 56), h('b', '', heroName(x.hero)), h('small', 'isl-good', t(`向いている：${best.name}`, `Best at: ${best.name}`)), rankEl(aptitude(x.stats, best.key)));
      card.addEventListener('click', () => {
        holding = holding === x.hero ? null : x.hero;
        current?.render();
      });
      grid.append(card);
    }
    bench.append(grid);
    if (holding != null) bench.append(h('p', 'isl-good', t(`${heroName(holding)}を選んでいます。置きたい枠を押してください。`, `${heroName(holding)} selected. Tap a slot.`)));
    const links = h('div', 'isl-row');
    links.append(btn(t('人材登用（雇う）', 'Recruit'), () => openHire(ctx), 'is-on'), btn(t('給与・労務', 'Pay & welfare'), () => openPayroll(ctx)));
    // ヒーローの育成（段 E1）：レベルが上がった人がいれば（チュートリアルの 1 か月目は出さない）
    if (s.staff.some((x) => (x.level ?? 1) > 1)) links.append(btn(t('ヒーローの育成', 'Hero growth'), () => void import('./growthui').then((m) => m.openGrowth(ctx))));
    bench.append(links);
    body.append(bench);
  });
}

// ---------------------------------------------------------------- 人材登用

/** opts.charisma=false：まとめた画面（候補の一覧 → カリスマ）の前の部分。カリスマの札は後ろの部分（経営者）に 1 つだけ出す */
export function openHire(ctx: Ctx, opts: { charisma?: boolean } = {}) {
  open(ctx, t('人材登用', 'Recruiting'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'hire', body);
    if (!has(s, 'hire')) {
      body.append(h('p', 'isl-warn', t('スキル「人材の募集」（人材）を習得すると、ヒーローを雇えるようになります。', 'Learn the Recruiting skill (People) to hire heroes.')));
      return;
    }
    {
      const free = s.staff.filter((x) => x.task == null).length;
      if (free) {
        const go = h('div', 'isl-row');
        go.append(btn(t(`待機中のヒーロー ${free} 人を配置する`, `Assign ${free} free hero(es)`), () => openStaff(ctx), ctx.step?.() === 'hire' ? 'is-on is-guide' : 'is-on'));
        body.append(go);
      }
      body.append(h('p', 'isl-dim', t('雇えるヒーローは毎月入れ替わります。グラフは仕事ごとの向き不向き（G〜S のランクと 100 までの数）です。', 'Candidates change every month. The chart shows aptitude per job (rank G–S and a number up to 100).')));
      // 経営者のカリスマ度（段 E2）：雇えるレアリティ（チュートリアルの 1 か月目は出さない）
      // 候補が 0 人のときは、理由と次の一手（カリスマ度の内訳・いちばん近い上げ方）
      const why = hireEmptyLines(s);
      if (why.length) {
        const box = h('div', 'isl-card2 isl-hire-empty');
        why.forEach((x, k) => box.append(h('p', k === 0 ? 'isl-warn' : 'isl-dim', x)));
        body.append(box);
      }
      if ((s.reports.length || (s.sector ?? 'c1') !== 'c1') && opts.charisma !== false) body.append(charismaCard(s));
      if (s.reports.length || (s.sector ?? 'c1') !== 'c1') for (const x of charismaNeeds(s)) body.append(h('p', 'isl-warn', x));
      // チュートリアル（調達係を雇う段）：調達にいちばん向いている人に印
      const recBuy = ctx.step?.() === 'hire' && !s.staff.some((x) => ![10001, 10002, 10003].includes(x.hero)) ? [...s.hirePool].sort((a, b) => aptitude(heroStats(b), 'buy') - aptitude(heroStats(a), 'buy'))[0] : null;
      const grid = h('div', 'isl-hire-grid');
      body.append(grid);
      for (const id of [...s.hirePool].sort((x, y) => (x === recBuy ? -1 : y === recBuy ? 1 : 0))) {
        const stats = heroStats(id);
        const card = heroCard(s, id, stats);
        if (id === recBuy) {
          card.classList.add('is-rec');
          card.append(h('span', 'isl-best', t('調達にいちばん向いている', 'Best buyer')));
        }
        const r = h('div', 'isl-row');
        r.append(
          // 段 UI7g：契約金（雇うときに 1 回）と月給
          btn(signFee(s, id) > 0 ? t(`雇う（契約金 ${money(signFee(s, id))}・月給 ${money(wageOf(id))}）`, `Hire (${money(signFee(s, id))} + ${money(wageOf(id))}/mo)`) : t(`雇う（月給 ${money(wageOf(id))}）`, `Hire (${money(wageOf(id))}/mo)`), () => {
            const e = hire(s, id);
            if (e === 'money') {
              ctx.sfx?.('error');
              ctx.toast(t(`契約金 ${money(signFee(s, id))} が足りません`, `Not enough for the ${money(signFee(s, id))} signing fee`));
              return;
            }
            ctx.toast(t(`${heroName(id)}が仲間になりました`, `${heroName(id)} joined`));
            after(ctx);
          }, 'is-on'),
        );
        card.append(r);
        grid.append(card);
      }
    }
  });
}

// ---------------------------------------------------------------- 市場データ

export function openData(ctx: Ctx) {
  const s0 = ctx.s();
  s0.flags.data = true;
  // セクタごとに「市場データを見た」を覚える（2 か所目以降のリサーチの案内）
  const here = s0.sector ?? 'c1';
  if (!(s0.flags.dataSeen ?? []).includes(here)) s0.flags.dataSeen = [...(s0.flags.dataSeen ?? []), here];
  ctx.save();
  open(ctx, t('市場データ（このエリア）', 'Market data (this area)'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'data', body);
    const rec = recommend(s);
    // 並び：おすすめ → まだ誰も売っていない（gap）→ そのほか（需要 × 値段の大きい順）。供給が足りている商品はうしろ
    const val = (r: (typeof all)[number]) => r.demand * r.p.price * (r.saturated ? 0.3 : 1);
    const all = market(s);
    const rows = [...all].sort((a, b) => Number(b.p.key === rec) - Number(a.p.key === rec) || Number(b.gap) - Number(a.gap) || Number(a.saturated) - Number(b.saturated) || val(b) - val(a));
    const maxD = Math.max(1, ...rows.map((r) => r.demand));
    // 段 UI2：上のマインちゃんの一言はやめた（おすすめの商品は、行の「マインちゃんのおすすめ」の札と並びの 1 番目で分かる）
    const recRow = all.find((r) => r.p.key === rec);
    const need = recRow?.need;
    const rb = rallyBadge(s);
    if (rb) body.append(rb);
    /** 市場データから工房へ：その商品を作るものとして選んだ状態で工房を開く（工房が無ければトースト） */
    const makeIt = (key: string) => makeInWorkshop(ctx, key);
    if (need && need.kind !== 'dev' && ctx.skills) {
      const go = need.skill;
      body.append(btn(t(`「${PRODUCT[rec].name}」の準備：${needText(need, s)}`, `Get ${PRODUCT[rec].name} ready: ${needText(need, s)}`), () => ctx.skills?.(go), 'is-on'));
    } else if (recRow && !need) body.append(btn(t(`「${PRODUCT[rec].name}」を工房で作る`, `Make ${PRODUCT[rec].name} in the workshop`), () => makeIt(rec), 'is-on isl-data-make'));
    const table = h('div', 'isl-data');
    const head = h('div', 'isl-data-row is-head');
    // POS レジ：商品ごとの「きのう売れた数」
    const pos = has(s, 'pos');
    if (pos) table.classList.add('is-pos');
    for (const x of [t('商品', 'Item'), t('国民のニーズ（月）', 'Demand / mo'), t('売っている会社', 'Sellers'), ...(pos ? [t('きのう売れた', 'Sold yesterday')] : []), t('値段', 'Price'), t('素材', 'Materials')]) head.append(h('span', '', x));
    table.append(head);
    for (const r of rows) {
      const row = h('div', `isl-data-row ${r.p.key === rec ? 'is-rec' : ''} ${r.saturated ? 'is-sat' : ''}`);
      const n = h('span', 'isl-data-name');
      const nm = h('span', 'isl-row');
      nm.append(skuIcon(sku(r.p.key, 'C'), 32), h('b', '', r.p.name));
      n.append(nm);
      if (r.p.key === rec) n.append(h('span', 'isl-tag is-good', t('マインちゃんのおすすめ', 'Mine-chan’s pick')));
      // 自社で作れるか：足りないものを 1 行で。作れる商品は「工房で作る」で、その商品を選んだ状態の工房へ
      n.append(h('small', r.need ? 'isl-warn' : 'isl-good', r.need ? needText(r.need, s) : t('✓ 作れる', '✓ You can make it')));
      if (!r.need) {
        const mk = btn(t('工房で作る', 'Make it'), () => makeIt(r.p.key), 'isl-data-make');
        if (s.slots.some((sl) => sl.sku && skuParts(sl.sku)[0] === r.p.key)) mk.classList.add('is-making');
        n.append(mk);
      }
      // 新商品の認知（このセクタのお客さんが知っている割合。最初の町では出さない）
      if (r.known < 1) n.append(knownBar(r.known));
      const d = h('span', 'isl-col');
      d.append(bar(r.demand / maxD, 'var(--isl-gold)'), h('small', '', t(`${r.demand} 個`, `${r.demand} pcs`)));
      const who = s.rivals.filter((x) => (x.sells[r.p.key] ?? 0) > 0).map((x) => rivalDef(x.id)?.name ?? '');
      const sellers = h('span', 'isl-col');
      if (!r.sellers) sellers.append(h('b', 'isl-gold', t('まだ誰も売っていない', 'Nobody sells it yet')));
      else {
        sellers.append(h('b', r.saturated ? 'isl-warn' : '', t(`${r.sellers} 社`, `${r.sellers}`)));
        if (r.saturated) sellers.append(h('small', 'isl-warn', t('他店で供給が足りている', 'Well supplied by other shops')));
        sellers.append(h('small', 'isl-dim', who.join(t('・', ', '))));
      }
      const mats = h('span', 'isl-row');
      for (const [m, q] of Object.entries(r.p.recipe.C)) {
        const c = h('span', 'isl-chip');
        c.append(matIcon(m as Mat, 18), h('small', '', `×${q}`));
        mats.append(c);
      }
      const yd = h('span', 'isl-col');
      if (pos) {
        const v = s.yday?.[r.p.key] ?? 0;
        yd.append(h('b', v > 0 ? 'isl-good' : 'isl-dim', t(`${v} 個`, `${v}`)));
        if (r.mine) yd.append(h('small', 'isl-dim', t(`認知 ${Math.round(r.known * 100)}%`, `Known ${Math.round(r.known * 100)}%`)));
      }
      row.append(n, d, sellers, ...(pos ? [yd] : []), h('span', '', money(r.p.price)), mats);
      table.append(row);
    }
    body.append(table);
    // 復刻品（開いた順）：独占の残り・他社・工房で作る。まだ開いていないものは「研究 Lv3 で開く」のシルエットを数個
    const relics = relicSection(ctx, s);
    if (relics) body.append(relics);
    const satNames = all.filter((r) => r.saturated).map((r) => r.p.name);
    const note = satNames.length
      ? t(`他店で供給が足りている商品（${satNames.join('・')}）は、並べてもあまり売れません。まだ誰も売っていない商品を探しましょう。`, `Goods other shops already supply (${satNames.join(', ')}) barely sell. Look for goods nobody sells yet.`)
      : t('売れ筋：他社がよく売っているのはランタンと鋏。競争が激しいので、最初は避けるのがおすすめです。', 'Best sellers: rivals sell many lanterns and scissors. Competition is tough there, so avoid them at first.');
    body.append(h('p', 'isl-dim', note));
  });
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

/** 独占の札（「独占 あと N か月」「独占 4 か月（売ったら始まる）」「他社 1 社」） */
export function relicBadge(r: { left: number; started: boolean; sellers: number }): HTMLElement {
  if (r.left > 0) return h('span', 'isl-tag is-gold isl-relic-mono', r.started ? t(`独占 あと ${r.left} か月`, `Monopoly: ${r.left} mo left`) : t(`独占 ${r.left} か月（売ったら始まる）`, `Monopoly ${r.left} mo (starts at first sale)`));
  return h('span', 'isl-tag is-warn isl-relic-mono', r.sellers ? t(`他社 ${r.sellers} 社`, `${r.sellers} rival${r.sellers > 1 ? 's' : ''}`) : t('独占は終わり', 'Monopoly over'));
}

/** 市場データの「復刻品」のまとまり（開いたものが無く、研究中の遺物も無ければ null） */
function relicSection(ctx: Ctx, s: P1State): HTMLElement | null {
  const rows = relicMarket(s);
  const soon = relicsSoon(s, rows.length ? 2 : 3);
  if (!rows.length && !soon.length) return null;
  const box = h('div', 'isl-card2 isl-relic-box');
  box.append(h('h3', '', t('📜 復刻品（遺物の研究 Lv3 で作れる）', '📜 Revivals (research a relic to Lv3)')));
  if (rows.length) box.append(h('p', 'isl-dim', t('昔の Lime の品。初めて売った月から 4 か月は、どの会社も真似できない。', 'Goods of old Lime. For 4 months from the first sale, no rival can copy them.')));
  const grid = h('div', 'isl-relic-grid');
  const maxD = Math.max(1, ...rows.map((r) => r.demand));
  for (const r of rows) {
    const c = h('div', `isl-relic-card ${r.saturated ? 'is-sat' : ''}`);
    const top = h('div', 'isl-row');
    const nm = h('div', 'isl-col');
    nm.append(h('b', '', r.p.name), h('small', 'isl-gold', money(skuPrice(r.x))));
    top.append(skuIcon(r.x, 40), nm);
    const tags = h('div', 'isl-relic-tags');
    tags.append(h('span', 'isl-tag isl-relic-tag', t('復刻', 'Revival')), relicBadge(r));
    // 売れるシリーズの札（Rare の復刻品）
    const sg = seriesTag(r.p.relic!.ext, s.tier);
    if (sg) tags.append(h('span', `isl-tag ${sg[1] ? 'is-good' : 'is-bad'}`, sg[0]));
    c.append(top, tags);
    const d = h('div', 'isl-col');
    d.append(bar(r.demand / maxD, 'var(--isl-gold)'), h('small', '', t(`ニーズ ${r.demand} 個／月`, `Demand ${r.demand} / mo`)));
    c.append(d);
    const mats = h('div', 'isl-row');
    for (const [m, q] of Object.entries(r.p.recipe[skuParts(r.x)[1]])) {
      const ch = h('span', 'isl-chip');
      ch.append(matIcon(m as Mat, 18), h('small', '', `×${q}`));
      mats.append(ch);
    }
    c.append(mats);
    if (r.known < 1) c.append(knownBar(r.known));
    c.append(h('small', r.need ? 'isl-warn' : 'isl-good', r.need ? needText(r.need, s) : t('✓ 作れる（技・開発は要らない）', '✓ You can make it (no skill or dev needed)')));
    if (!r.need) {
      const mk = btn(t('工房で作る', 'Make it'), () => makeInWorkshop(ctx, r.p.key), 'isl-data-make');
      if (s.slots.some((sl) => sl.sku && skuParts(sl.sku)[0] === r.p.key)) mk.classList.add('is-making');
      c.append(mk);
    }
    grid.append(c);
  }
  for (const x of soon) {
    const c = h('div', 'isl-relic-card is-soon');
    const top = h('div', 'isl-row');
    const ic = skuIcon(relicSku(x.p.key), 40);
    ic.classList.add('is-silhouette');
    top.append(ic, h('b', '', t('？？？', '???')));
    c.append(top, h('small', 'isl-dim', t(`研究 Lv3 で開く（いま Lv${x.lv}）`, `Opens at research Lv3 (now Lv${x.lv})`)));
    grid.append(c);
  }
  box.append(grid);
  return box;
}

// ---------------------------------------------------------------- ランキング

/** 他社の反撃中の札（市場データ・ランキング）。反撃していなければ null */
export function rallyBadge(s: P1State): HTMLElement | null {
  const n = s.rally ?? 0;
  if (n <= 0) return null;
  const box = h('p', 'isl-rally');
  box.append(h('span', 'isl-tag is-bad', t(`反撃中（あと ${n} か月）`, `Fighting back (${n} mo left)`)), h('small', '', t(`あなたが 1 位を取ったので、他社が宣伝を始めた。他社の売り場の強さ ×${MARKET.rally}`, `You took #1, so rivals started advertising. Rival pull ×${MARKET.rally}`)));
  return box;
}

export function openRanking(ctx: Ctx, tab: 'area' | 'land' | 'world' = 'area') {
  open(ctx, t('企業ランキング（月の売上）', 'Company ranking (monthly sales)'), (body) => {
    const s = ctx.s();
    mineTip(ctx, 'ranking', body);
    const last = s.reports[s.reports.length - 1];
    const mine = last?.revenue ?? monthRevenue(s);
    const tabs = h('div', 'isl-row');
    for (const [k, label] of [['area', t('エリア', 'Area')], ['land', t('ランド', 'Land')], ['world', t('世界', 'World')]] as const)
      tabs.append(btn(label, () => openRanking(ctx, k), tab === k ? 'is-on' : ''));
    body.append(tabs);
    const list = h('ol', 'isl-rank');
    const rallying = tab === 'area' && (s.rally ?? 0) > 0;
    const selling = tab === 'area' && s.comeback && s.comeback.left > 0 ? s.comeback : null;
    /** 反撃中・セール中の札（横棒の名前に添える） */
    const rivalTag = (name: string, me: boolean): HTMLElement | null => {
      if (me) return null;
      if (selling && name === rivalName(selling.rid)) return h('span', 'isl-tag is-bad isl-sale-tag', t(`セール中（あと ${selling.left} か月）`, `On sale (${selling.left} mo)`));
      if (rallying) return h('span', 'isl-tag is-bad isl-rally-tag', t(`反撃中（あと ${s.rally} か月）`, `Fighting back (${s.rally} mo)`));
      return null;
    };
    const row = (name: string, sales: number, me: boolean, n: number) => {
      const li = h('li', me ? 'is-me' : '');
      const nm = h('span', '', me ? t('あなたの会社', 'Your company') : name);
      if (rallying && !me) nm.append(h('span', 'isl-tag is-bad isl-rally-tag', t(`反撃中（あと ${s.rally} か月）`, `Fighting back (${s.rally} mo)`)));
      // 他社の巻き返し（Uncommon のセール中の会社）
      if (selling && !me && name === rivalName(selling.rid)) nm.append(h('span', 'isl-tag is-bad isl-sale-tag', t(`セール中（あと ${selling.left} か月）`, `On sale (${selling.left} mo)`)));
      li.append(h('span', 'isl-rank-n', `${n}`), nm, h('b', '', money(sales)));
      list.append(li);
    };
    if (tab === 'area') {
      const rb = rallyBadge(s);
      if (rb) body.append(rb);
      // 他社の巻き返し（Uncommon のセール中）：どの会社が・あと何か月・いまいくら上乗せ
      if (selling) {
        const box = h('p', 'isl-rally');
        // Rare の町 ②：セールは売上に足さず、その会社の店の引きが上がる（商圏の取り分を取り返しに来る）
        const how = s.area
          ? t(`店の引き ×${(rivalAreaMul(s, selling.rid) / edgeMul(s)).toFixed(2)}（月ごとに弱まる）`, `store pull ×${(rivalAreaMul(s, selling.rid) / edgeMul(s)).toFixed(2)} (fading each month)`)
          : t(`売上 +${money(saleBonus(s, selling.rid))}／月（月ごとに弱まる）`, `sales +${money(saleBonus(s, selling.rid))}/mo (fading each month)`);
        box.append(h('span', 'isl-tag is-bad', t(`セール中（あと ${selling.left} か月）`, `On sale (${selling.left} mo left)`)), h('small', '', t(`あなたが 1 位を取ったので、${rivalName(selling.rid)}がセールで巻き返してきた。${how}`, `You took #1, so ${rivalName(selling.rid)} is fighting back with a sale: ${how}`)));
        body.append(box);
      }
      const rows = last ? last.area : areaRanking(s, mine, Object.fromEntries(s.rivals.map((r) => [r.id, rivalBase(s, r)])));
      // 段 UI8：順位の表 → 横棒（自社は金・1 位と 2 位の間にゴールライン）と、自社の順位の推移（線。1 位が上）
      const me = rows.findIndex((x) => x.me);
      const gap = me > 0 ? t(`次の順位（${me} 位）まで あと ${money(Math.max(0, rows[me - 1].sales - rows[me].sales))}`, `${money(Math.max(0, rows[me - 1].sales - rows[me].sales))} to #${me}`) : me === 0 && rows.length > 1 ? t(`2 位との差 ${money(Math.max(0, rows[0].sales - rows[1].sales))}`, `${money(Math.max(0, rows[0].sales - rows[1].sales))} ahead of #2`) : '';
      const box = cvBox(t(`エリアの月の売上：自社は ${me + 1} 位`, `Area monthly sales: you are #${me + 1}`), gap);
      box.body.append(
        rankBarsEl(
          rows.map((r) => ({ ...rankRows([r])[0], tag: rivalTag(r.name, r.me) ?? undefined })),
          { goal: 1, aria: t(`エリアの企業ランキング：自社は ${me + 1} 位`, `Area ranking: you are #${me + 1}`) },
        ),
      );
      body.append(box.el);
      const rh = rankHist(s.reports);
      if (rh.length >= 2) {
        const of = Math.max(...rh.map((x) => x.of));
        const g = cvBox(t('自社の順位の推移', 'Your rank by month'), t('上ほど上位・金の点線がゴール（1 位）', 'Higher is better · gold dotted line is the goal (#1)'));
        g.body.append(
          trendEl({
            labels: rh.map((x, k) => monLab(x.month, k === 0)),
            heads: rh.map((x) => monHead(x.month)),
            series: [{ name: t('順位', 'Rank'), kind: 'line', cls: 'is-gold', vals: rh.map((x) => x.rank) }],
            refs: [{ v: 1, label: t('ゴール 1 位', 'Goal #1'), cls: 'is-goal' }],
            invert: true,
            lo: 1,
            hi: Math.max(2, of),
            fmt: (v) => t(`${Math.round(v)} 位`, `#${Math.round(v)}`),
            axis: (v) => (Number.isInteger(v) ? t(`${v} 位`, `#${v}`) : ''),
            aria: t(`自社の順位の推移：いま ${rh[rh.length - 1].rank} 位`, `Your rank: now #${rh[rh.length - 1].rank}`),
            height: 150,
          }),
        );
        body.append(g.el);
      }
      body.append(h('p', 'isl-dim', t('同じエリアで物販をしている同業他社です。ここで 2 か月続けて 1 位になる（制覇）のが目標です。', 'Retail rivals in your area. The goal: #1 here two months in a row (conquer the sector).')));
    } else if (tab === 'land') {
      const rows = [...LAND_COMPANIES.map(([n, v]) => ({ name: n, sales: v, me: false })), { name: '', sales: mine, me: true }].sort((a, b) => b.sales - a.sales);
      // 段 UI8：横棒（自社は金）
      const box = cvBox(t('ランドの月の売上', 'Land monthly sales'));
      box.body.append(rankBarsEl(rankRows(rows), { aria: t('ランドの企業ランキング', 'Land ranking') }));
      body.append(box.el);
    } else {
      WORLD_COMPANIES.forEach(([n, v], k) => row(n, v, false, k + 1));
      const est = Math.max(9, Math.round(4000 / Math.max(1, Math.log10(Math.max(10, mine)))));
      const li = h('li', 'is-me');
      li.append(h('span', 'isl-rank-n', fmt(est * 37)), h('span', '', t('あなたの会社', 'Your company')), h('b', '', money(mine)));
      list.append(h('li', 'isl-dim', '…'), li);
    }
    if (list.childElementCount) body.append(list);
  });
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
  open(ctx, t('BOM（素材 → 商品）', 'BOM (materials → products)'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('1 回のクラフトに使う素材と、できる数・日数・1 個あたりの素材代と粗利です（素材はいまの値段）。', 'Materials per craft, output, days, and material cost and gross margin per item (at current prices).')));
    const table = h('div', 'isl-data isl-bom');
    const head = h('div', 'isl-data-row is-head');
    for (const x of [t('商品', 'Item'), t('素材', 'Materials'), t('できる数・日数', 'Output · days'), t('値段', 'Price'), t('素材代 / 個', 'Cost / item'), t('粗利 / 個', 'Margin / item')]) head.append(h('span', '', x));
    table.append(head);
    for (const p of PRODUCTS)
      for (const r of ['C', 'U'] as Rar[]) {
        const x = sku(p.key, r);
        const row = h('div', `isl-data-row ${r === 'U' && !s.dev.includes(p.key) ? 'is-locked' : ''}`);
        const n = h('span', 'isl-row');
        n.append(skuIcon(x, 28), h('b', '', skuName(x)));
        const mats = h('span', 'isl-row');
        for (const [m, q] of Object.entries(p.recipe[r])) {
          const c = h('span', 'isl-chip');
          c.append(matIcon(m as Mat, 18), h('small', '', `×${q}`));
          mats.append(c);
        }
        const uc = unitCost(s, x);
        row.append(n, mats, h('span', '', t(`${batchOf(x, s)} 個・${craftDays(s, x).toFixed(1)} 日`, `${batchOf(x, s)} · ${craftDays(s, x).toFixed(1)} d`)), h('span', '', money(skuPrice(x))), h('span', '', money(uc)), h('span', '', `${money(skuPrice(x) - uc)} (${Math.round(((skuPrice(x) - uc) / skuPrice(x)) * 100)}%)`));
        table.append(row);
      }
    body.append(table);
  });
}

// ---------------------------------------------------------------- 経営企画（建築）・R&D（商品開発）

export function openDev(ctx: Ctx) {
  open(ctx, t('商品開発', 'Product development'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t(`アンコモンを開発すると、値段 ${UNCOMMON.price} 倍・売り場の強さ ${UNCOMMON.pull} 倍の商品を作れます。開発には「魔法の釜」（スキル・工房）が要り、1 つずつ ${DEV.days} 日かかります。作るには製造の適性 ${UNCOMMON.minCraft} 以上の職人が要ります。`, `Developing an Uncommon gives ${UNCOMMON.price}× price and ${UNCOMMON.pull}× pull. Needs the Magic Pot skill; one at a time, ${DEV.days} days each. Crafting needs aptitude ${UNCOMMON.minCraft}+.`)));
    if (!has(s, 'pot')) body.append(h('p', 'isl-warn', t('スキルツリーの「魔法の釜」で解放されます。', 'Unlocked by the Magic Pot skill.')));
    for (const p of PRODUCTS) {
      const card = h('div', 'isl-card2 isl-dev');
      const row = h('div', 'isl-row');
      row.append(skuIcon(sku(p.key, 'C'), 40), h('span', 'isl-dim', '→'), skuIcon(sku(p.key, 'U'), 40));
      const name = h('div');
      name.append(h('b', '', `${skuName(sku(p.key, 'C'))} → ${skuName(sku(p.key, 'U'))}`), h('div', 'isl-dim', t(`${money(p.price)} → ${money(skuPrice(sku(p.key, 'U')))}`, `${money(p.price)} → ${money(skuPrice(sku(p.key, 'U')))}`)));
      row.append(name);
      card.append(row);
      if (s.dev.includes(p.key)) card.append(h('p', 'isl-good', t('開発済み（工房で作れます）', 'Developed (craft it in the workshop)')));
      else if (s.lab?.key === p.key) card.append(h('div', 'isl-field'), bar(1 - s.lab.left / DEV.days, 'var(--isl-gold)'), h('p', 'isl-dim', t(`開発中：あと ${s.lab.left} 日`, `In development: ${s.lab.left} days left`)));
      else {
        const b = btn(t(`開発する ${money(devCost(p.key))}（${DEV.days} 日）`, `Develop ${money(devCost(p.key))} (${DEV.days} d)`), () => {
          const e = develop(s, p.key);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`${skuName(sku(p.key, 'U'))}の開発を始めました`, `Started developing ${skuName(sku(p.key, 'U'))}`));
          after(ctx);
        }, 'is-on');
        b.disabled = !has(s, 'pot') || !!s.lab || s.money < devCost(p.key);
        card.append(b);
      }
      body.append(card);
    }
  });
}

/** 経営企画 → M&A（法務の部門が開く前：Epic の町に進出すると、法務の部門が他社の買収を受け持つ。開いたあとは法務 → M&A へ。main.ts） */
export function openMA(ctx: Ctx) {
  open(ctx, t('M&A', 'M&A'), (body) => {
    body.append(h('p', 'isl-dim', t('他社の買収（M&A）は、Epic の町に進出すると開く法務の部門が受け持ちます。他社のお店をタップして「調査」しておくと、相手のことがよく分かります。', 'Acquiring rivals (M&A) is handled by the Legal department, which opens when you enter an Epic town. Research rival stores (tap them on the map) to learn about them.')));
    for (const [name, note] of [
      [t('買収（M&A）', 'Acquisition (M&A)'), t('打診 → 調査 → 値段の交渉と条項 → 成立。相手の店と売れ筋を手に入れる（Epic の町）', 'Approach → diligence → price & clauses → signed. Take over the rival’s stores and best-sellers (Epic towns)')],
      [t('業務提携', 'Alliance'), t('他社と組んで、素材や商品を融通しあう（準備中）', 'Team up with a rival to share materials and goods (coming soon)')],
      [t('妨害工作', 'Sabotage'), t('他社の売り場を一時的に弱くする（準備中）', 'Weaken a rival store for a while (coming soon)')],
    ]) {
      const card = h('div', 'isl-skill is-locked');
      card.append(h('b', '', name), h('small', '', note), h('small', 'isl-dim', t('Epic の町で', 'In Epic towns')));
      body.append(card);
    }
  });
}

// ---------------------------------------------------------------- マーケティング

export function openAds(ctx: Ctx) {
  open(ctx, t('宣伝広報', 'Advertising'), (body) => {
    const s = ctx.s();
    const now = adBoost(s);
    const local = sectorProfile(s).ads ?? 1;
    if (local !== 1) body.append(h('p', 'isl-good', t(`このセクタでは宣伝の効き目 ×${local}（${sectorDef(s.sector ?? 'c1').name}）`, `Ads are ×${local} as strong in this sector (${sectorDef(s.sector ?? 'c1').name})`)));
    body.append(h('p', 'isl-dim', now > 0 ? t(`いま自社のお店の売り場の強さが +${Math.round(now * 100)}% です。`, `Your shops have +${Math.round(now * 100)}% pull right now.`) : t('宣伝すると、しばらくの間、自社のすべてのお店が売れやすくなります。種類の違う宣伝は重ねられます。', 'Ads make all your shops sell better for a while. Different ads stack.')));
    // 段 M1：宣伝のはしご（店先 → 町 → ランド → 全国）。重ね掛けの上限と逓減・解禁の条件の元の数字
    body.append(h('p', 'isl-dim isl-ad-ladder', t(`重ね掛けは合計 +${Math.round(AD_TIER.cap * 100)}% まで（上の段は 2 本目から半分）。いまの会社：この町のお店 ${myShops(s).length} 軒・お店のある町 ${townsWithShops(s)}・月商 ${money(companyRevenue(s))}。`, `Stacking caps at +${Math.round(AD_TIER.cap * 100)}% (upper tiers halve from the second). Now: ${myShops(s).length} shops here, shops in ${townsWithShops(s)} towns, monthly sales ${money(companyRevenue(s))}.`)));
    // 新商品の認知：並べている商品のうち、まだ知られていないもの（宣伝で早く育つ）
    const fresh = market(s).filter((r) => r.mine && r.known < 1);
    if (fresh.length) {
      const c = h('div', 'isl-card2 isl-known-card');
      c.append(h('h3', '', t('新しい商品の認知', 'How well new items are known')), h('p', 'isl-dim', t(`並べている日に +${Math.round(AWARE_GOODS.perDay * 100)}%、宣伝が効いている日はさらに +${Math.round(AWARE_GOODS.ad * 100)}%。知られていないうちは売れる数が減ります。`, `+${Math.round(AWARE_GOODS.perDay * 100)}% a day on shelves, +${Math.round(AWARE_GOODS.ad * 100)}% more while an ad runs. Less-known items sell fewer.`)));
      const list = h('div', 'isl-known-list');
      for (const r of fresh) {
        const row = h('div', 'isl-row');
        row.append(skuIcon(sku(r.p.key, 'C'), 28), h('b', '', r.p.name), knownBar(r.known));
        list.append(row);
      }
      c.append(list);
      body.append(c);
    }
    for (const a of ADS) {
      const lock = adLock(s, a.id);
      const card = h('div', `isl-card2 isl-ad${adUpper(a) ? ' is-upper' : ''}${lock ? ' is-locked' : ''}`);
      const left = s.ads[a.id] ?? 0;
      card.append(h('h3', '', `${a.icon ?? '📣'} ${a.name}`));
      // 段 M1：効き目の説明は 1 行（効く範囲・日数と効き目・知名度）
      const scope = a.scope === 'all' ? t('全店', 'All shops') : a.scope === 'land' ? t('同じランドの全店', 'All shops in this land') : t('同じ町の全店', 'All shops in this town');
      const bits = [`${adWide(a) ? '🌍' : '📍'} ${scope}`, t(`${a.days} 日 +${Math.round(a.boost * 100)}%`, `${a.days} d, +${Math.round(a.boost * 100)}%`)];
      if (a.brand) bits.push(t(`★ ブランド力 +${a.brand}（期間の終わりに）`, `★ Brand +${a.brand} (when it ends)`));
      card.append(h('p', 'isl-ad-scope', bits.join(t('・', ' · '))));
      if (lock) card.append(h('p', 'isl-ad-lock isl-dim', t(`🔒 解禁：${lock}`, `🔒 Unlocks: ${lock}`)), h('p', 'isl-dim', t(`費用 ${money(adCost(s, a.id))}`, `Cost ${money(adCost(s, a.id))}`)));
      else if (left > 0) card.append(bar(left / a.days, 'var(--isl-gold)'), h('p', '', t(`実施中：あと ${left} 日`, `Running: ${left} days left`)));
      else {
        const cost = adCost(s, a.id);
        // 段 UI3：見込み（期間の粗利の伸び − 費用。この町で元が取れるか。moves.ts の adGain）
        if (myShops(s).length) {
          const g = adGain(s, a.id);
          // 段 M1：ランド・全店の宣伝は、任せている町の売上の伸びも入れた見込み
          const where = adWide(a) ? t('会社の全店で', 'across all shops') : t('この町で', 'here');
          card.append(h('p', `isl-ad-gain ${g > 0 ? 'isl-good' : 'isl-warn'}`, g > 0 ? t(`見込み：+${money(g)}（${where}元が取れる）`, `Expected: +${money(g)} (pays off ${where})`) : t(`見込み：−${money(-g)}（${where}はまだ元が取れない）`, `Expected: −${money(-g)} (won’t pay off ${where} yet)`)));
          // 段 UX1（C-10）：いくら売れていれば元が取れるか（序盤は赤字の見込みが続くので、目安を添える。数字は変えない）
          const be = adBreakeven(s, a.id);
          if (be) card.append(h('p', 'isl-ad-be isl-dim', be.need == null ? t('いまは売上が伸びない（重ね掛けの上限か、棚の頭打ち）ので元が取れない', 'No lift right now (stacking cap or shelves maxed), so it can’t pay off') : be.need <= 0 ? t(`任せている町の伸びだけで元が取れる（この町の月商の見込み ${money(be.now)}）`, `Delegated towns alone pay for it (sales here now ${money(be.now)}/mo)`) : t(`元が取れる月商の目安 ${money(be.need)}〜（いまの見込み ${money(be.now)}）`, `Pays off from about ${money(be.need)}/mo in sales (now ${money(be.now)})`)));
        }
        const b = btn(t(`実施する ${money(cost)}`, `Run ${money(cost)}`), () => {
          const e = runAd(s, a.id);
          if (e === 'money') ctx.toast(t('資金が足りません', 'Not enough funds'));
          else if (!e) ctx.toast(t(`「${a.name}」を始めました`, `Started: ${a.name}`));
          after(ctx);
        }, 'is-on');
        b.disabled = s.money < cost;
        card.append(b);
      }
      body.append(card);
    }
  });
}

export function openMissions(ctx: Ctx) {
  open(ctx, t('依頼（ミッション）', 'Requests (missions)'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t(`エリアの人たちからの依頼です。受けた依頼は右上の「ミッション」に出て、達成すると報酬がもらえます（同時に ${MISSION_MAX} つまで）。`, `Requests from people in the area. Accepted ones appear under Missions at the top right; complete them for a reward (up to ${MISSION_MAX} at once).`)));
    const card = (m: (typeof MISSIONS)[number]) => {
      const st = s.missions[m.id];
      const c = h('div', `isl-card2 isl-mission ${st === 'done' ? 'is-done' : ''} ${st === 'accepted' ? 'is-on' : ''}`);
      c.append(h('small', 'isl-dim', m.from), h('h3', '', m.title), h('p', '', m.text));
      // 段 UI1：受ける前の一言（気をつけること。中身と報酬は同じ）
      if (m.note && !st) c.append(h('small', 'isl-warn isl-mission-note', `⚠ ${m.note}`));
      const pr = missionProgress(s, m.id);
      if (pr && st === 'accepted') {
        const f = h('div', 'isl-field');
        f.append(bar(pr[0] / pr[1], 'var(--isl-gold)'), h('small', 'isl-dim', `${pr[0]} / ${pr[1]}`));
        c.append(f);
      }
      const row = h('div', 'isl-row');
      row.append(h('b', 'isl-gold', rewardText(m)));
      if (st === 'done')
        row.append(
          btn(t('報酬を受け取る', 'Claim'), () => {
            if (!claim(s, m.id)) ctx.toast(t(`${rewardText(m)} を受け取りました`, `Received: ${rewardText(m)}`));
            after(ctx);
          }, 'is-on'),
        );
      else if (st === 'accepted') row.append(h('span', 'isl-tag is-good', t('進行中', 'In progress')));
      else {
        const b = btn(t('依頼を受ける', 'Accept'), () => {
          const e = accept(s, m.id);
          if (e === 'full') ctx.toast(t(`同時に受けられるのは ${MISSION_MAX} つまでです`, `Up to ${MISSION_MAX} at once`));
          else if (!e && s.missions[m.id] === 'done') {
            // 受けた時点で条件を満たしていた：その場で達成。報酬は「報酬を受け取る」で
            after(ctx);
            ctx.sfx?.('mission');
            ctx.toast(t('もう達成しているね！ 報酬を受け取ろう', 'Already done! Claim the reward'));
            return;
          } else if (!e) ctx.toast(t(`「${m.title}」を受けました。右上のミッションに出ます`, `Accepted “${m.title}”. It shows under Missions at the top right`));
          after(ctx);
        }, 'is-on');
        row.append(b);
      }
      c.append(row);
      return c;
    };
    const active = activeMissions(s);
    if (active.length) {
      body.append(h('h3', '', t('受けている依頼', 'Accepted')));
      for (const m of active) body.append(card(m));
    }
    const offers = offeredMissions(s);
    body.append(h('h3', '', t('届いている依頼', 'Offers')));
    if (!offers.length) body.append(h('p', 'isl-dim', t('いまは新しい依頼がありません。', 'No new requests right now.')));
    for (const m of offers) body.append(card(m));
    const n = MISSIONS.filter((m) => s.missions[m.id] === 'claimed').length;
    body.append(h('p', 'isl-dim', t(`報酬を受け取った依頼 ${n} / ${MISSIONS.length}`, `Claimed ${n} / ${MISSIONS.length}`)));
  });
}

// ---------------------------------------------------------------- システム（設備投資）

/** 工房・お店の画面のいちばん下の「設備投資」の欄 */
export function investCard(ctx: Ctx, b: PBuilding, note: string): HTMLElement {
  const card = h('div', 'isl-card2 isl-invest-card');
  card.append(h('h3', '', t('設備投資', 'Capital investment')), h('p', 'isl-dim', note), investList(ctx, b, () => current?.render()));
  return card;
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
  open(ctx, t('設備投資', 'Capital investment'), (body) => {
    const s = ctx.s();
    body.append(h('p', 'isl-dim', t('建物ごとに設備を良くします。地図で自社の建物をタップしても投資できます。', 'Upgrade each of your buildings. You can also invest by tapping a building on the map.')));
    const mine = s.buildings.filter((b) => b.owner === 'me' && P1B[b.id]?.kind !== 'food');
    if (!mine.length) body.append(h('p', '', t('まだ建物がありません。', 'No buildings yet.')));
    for (const b of mine) {
      const card = h('div', 'isl-card2');
      card.append(h('h3', '', DEF[b.id].name + (b.left > 0 ? t(`（工事中 あと ${b.left} 日）`, ` (building, ${b.left} d)`) : '')), investList(ctx, b, () => current?.render()));
      body.append(card);
    }
  });
}

export const P1B_NAME = (id: string) => (P1B[id] ? DEF[id].name : id);
void isEn;
