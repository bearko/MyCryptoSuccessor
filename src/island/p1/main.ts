/**
 * フェーズ 1「新天地で実績を上げろ」の画面。地図・上の帯・事業別メニュー（下の帯）・マスの吹き出し・マインちゃんの案内・時間。
 * 仕様は docs/ISLAND_PHASE1.md。
 */
import '../island.css';
import './p1.css';
import { Sound } from '../../audio';
import { allSeries, getExtension, heroById } from '../../game/catalog';
import { isEn, setLang, t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { icon } from '../../ui/dom';
import { DEF, artId } from '../defs';
import { effectDone, image, loading, pick, waterFrame, type Camera, type Effect } from '../render';
import { cells, type Dir } from '../sim';
import { FX_LEVELS, FX_PAL, clearFx, fxAtEl, fxLevel, fxStats, playFx, rampOf, setFxEnabled, setFxLevel, warmFx, type FxLevel } from '../fx/layer';
import type { FxId } from '../fx/registry.js';
import { BRAND, BUILD_CATS, DAY_BASE_MS, MATS, MISSIONS, P1_BUILDINGS, rewardText, P1B, PACES, PRODUCT, SIDE, SKILL, TIERS, LEGAL_INTRO, skuParts, STORE, DEPT, PASSIVES, PROMO_ITEM, PROMO_ITEMS, HERO_RARITY, MORALE, type PromoItem, type DeptGroup, type DeptId, type Mat, type Tier, SALES_INTRO, ACCT_INTRO, CS_INTRO } from './data';
import { deptLevel, deptNews, menuDepts, menuLayout, nextMark } from './dept';
import { bandText } from './deleg';
import { headHooks, openDeleg, openProps } from './delegui';
import { openHeadTalk } from './headtalkui';
import { HEAD_OPEN_TALK, HEAD_PICK_TALK, headTalkDue, talkMode } from './headtalk';
import { openTrophies, trophyEl, trophyTick } from './trophyui';
import { openBudget } from './budgetui';
import { budgetOpen } from './budget';
import type { TrophyDef } from './trophy';
import { autoText, cardInbox, cardsCompany, cardsDay, cardsMonth, demoDraft, diploDraft, stockDraft, enqueue, eventDraft, markSeen, nextPop, takeAuto } from './card';
import { duoPages } from './duo';
import { cardNav, showCard } from './cardui';
import { crestEl, openDiplo } from './diploui';
import { openProposal } from './proposalui';
import { reportProposal } from './card';
import type { Plan } from './plan';
import { diploOf, hostCost, landDef, meetPages, relOf, reqTerms, tradeTerms, type LandId } from './diplo';
import { activeFx, evIcon, fxText, isGood, makeEvent, type EvKind } from './events';
import {
  allowedDirs,
  digSite,
  placeFind,
  build,
  canBuild,
  canMoveTo,
  canPlaceAt,
  date,
  daysToClose,
  DAYS,
  deserializeP1,
  doorOf,
  ground,
  roadPath,
  wholesaler,
  monthRevenue,
  moveCost,
  myShops,
  myWorkshop,
  newP1,
  occupant,
  relocate,
  serializeP1,
  step,
  turn,
  type P1State,
  type PlaceErr,
  activeMissions,
  claim,
  forceHaul,
  recipeOf,
  depotInfo,
  missionProgress,
  siteInfo,
  tutSpot,
  walkDays,
  buildCatOpen,
  buildKnown,
  gateOf,
  gateToll,
  openGate,
  has,
  hotCells,
  type Report as P1Report,
  extName,
  present,
  topicsOf,
  applyPermit,
  endRun,
  firstSite,
  grantFirst,
  holdReport,
  runTick,
  startRun,
  wasteName,
  wasteSpots,
  type DigHit,
  type RunEnd,
  openRelics,
  DUNGEON,
  revivedSites,
  museumOpen,
  shelvesAuto,
  poolUsed as poolUsedOf,
  poolCap as poolCapOf,
} from './model';
import type { LevelUp } from './hero';
import { openMuseum } from './museumui';
import { along, newAnim, type Walker } from './anim';
import { areaOverlay, drawP1, shutterFx, type P1Ghost } from './render';
import { openTrade } from './tradeui';
import { storeName, surveyed } from './trade';
import {
  makeHooks,
  closeSheet,
  openAds,
  openBom,
  openBuy,
  openData,
  openDev,
  openHire,
  openInvest,
  openMA,
  openMissions,
  openPayroll,
  openRanking,
  openStaff,
  openWorkshop,
  makeInWorkshop,
  refreshSheet,
  rivalName,
  sheetOpen,
  type Ctx,
  mineTip,
  shopScene,
  shopSceneSale,
  open as openSheet,
  openTogether,
  sheetHooks,
  setOpenGuard,
} from './screens';
import { openSupply } from './scm';
import { openSales } from './sales';
import { pickHooks } from './heroui';
import { openDigSummary, openMonthReport } from './report';
import { openOrg } from './orgui';
import { openSkills } from './tree';
import { openSide } from './side';
import { resolveSub, subDefs, type ScreenId, type SubDef } from './menus';
import { openGrowth } from './growthui';
import { openCharisma } from './hrui';
import { openGa, openTax } from './acctui';
import { openForecast, openInbox, openPr, openSat } from './csui';
import { legalToasts, openContract, openLegalMA, openPatents, openSuits, type LegalHooks } from './legalui';
import { startDeal } from './legal';
import { csOn } from './cs';
import { gradeName, gradeOf } from './mkt';
import { taxHint } from './acct';
import { quitLeft, type HrDay } from './hr';
import { IslandSfx } from './sfx';
import { tileContent } from './tile';
import { closeDig, digOpen, digRect, extIcon, openDig, openNotes, refreshDig, refreshTimer, showEndCard } from './digui';
import { MEET_FOUND, MEET_LINES, canPresent, chiefHome, digMet, chiefOf, digSummary, letterToGet, lettersLeft, meetReady, meetTip, presentAfter, presentPages } from './digmeet';
import { BUDGET_TALK, CHIP_SRC, CLEAR_LINE, FOOT_TALK, HIRE_LINES, RP_LINE, DUNGEON_LINE, GATE_LINES, LAND_CLEAR_LINE, MUSEUM_LINE, RANK_LINES, RELIC_LINE, REVIVE_LINE, SIDE_LINES, TOUR, arrivalPages, bubbleKind, chipOf, deptTalkNext, introPages, needsIntro, talkWaits, type ArrivePage, type TalkUi, type TourEv, type TourPhase } from './mine';
import type { Stage } from './model';
import { TIER_NOTE, openBooks, openBrand, openLand, openRankUp, startMove } from './landui';
import { pendingReset, rankUpTier } from './reset';
import { playDisaster } from './disaster';
import { brandAdd, sectorDef, sectorState, tierLabel, TIER_NAME } from './company';
import { advanceGo, advanceOf, camCell, camShift, edgeNear, enteredSector, gridDelta, layerOf, needLine, sectorBadges, sectorFacts, switchSector, type SectorBadge } from './world';
import type { Sku as SkuT } from './data';
import { STRIP, corners, overviewScale, worldOf } from './worldrender';
import { landCleared, letterLockOf, letterLocked, playable } from './land';
import { actOf, hlOf, pointOf, TUT, TUT_DONE, TUT_END, tutFix, tutOf, type TutGo, type TutPage, type TutStep } from './tut';
import { btn, h, heroIcon, heroName, matIcon, money, plain, rich, signed, skuIcon, skuName } from './ui';

const q = new URLSearchParams(location.search);
const TEST = q.get('test') === '2';
// 経済の数字を大きく変えたので v2（v1 のセーブは使わない）
const SAVE = 'mycryptoisland.p1.v2';
const GUIDE = 'mycryptoisland.p1.guide';
const SOUND = 'mycryptoisland.p1.sound';

function load(): P1State {
  try {
    const raw = localStorage.getItem(SAVE);
    const s = raw ? deserializeP1(raw) : null;
    if (s) return s;
  } catch {
    // 保存先が使えないときは新しく始める
  }
  return newP1();
}
let s = load();
// チュートリアルの段の並びが変わっていたら、今いるべき段に置き直す
tutFix(s);
function save() {
  try {
    localStorage.setItem(SAVE, serializeP1(s));
  } catch {
    // 保存できなくても遊べる
  }
}
let guideOn = true;
try {
  guideOn = localStorage.getItem(GUIDE) !== 'off';
} catch {
  // 既定は表示
}

// ---------------------------------------------------------------- 音（BGM と効果音は mycryptoheroes の音源）

const sound = new Sound();
let vol = { bgm: 1, se: 1 };
try {
  vol = { ...vol, ...(JSON.parse(localStorage.getItem(SOUND) ?? '{}') as Partial<typeof vol>) };
} catch {
  // 既定は両方あり
}
sound.setVolumes(vol);
sound.playBgm('bgmCraft');
// 効果音はコードで作った音（scripts/island/sfx.py）。BGM だけ mycryptoheroes の曲
const sfx = new IslandSfx();
sfx.level = vol.se;
// ブラウザは最初の操作まで音を出せない
// スマホは指を離したとき（pointerup・touchend・click）がユーザーの操作として数えられる。鳴るまで毎回試す
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
  addEventListener(
    ev,
    () => {
      sound.unlock();
      sfx.unlock();
    },
    { capture: true },
  );
// ボタンを押したら軽いクリック音（会話の「次へ」はポン）
addEventListener(
  'click',
  (e) => {
    const b = e.target instanceof Element ? e.target.closest('button') : null;
    if (!b || b.disabled) return;
    sfx.play(b.closest('.isl-talk, .isl-next-month') ? 'page' : 'tap');
  },
  { capture: true },
);

const canvas = document.getElementById('isl-map') as HTMLCanvasElement;
const ctx2 = canvas.getContext('2d')!;
const root = document.getElementById('isl-ui')!;
let W = 0;
let H = 0;
let DPR = 1;
let dirty = true;
/** 撤退した他社の店（シャッターの演出を待っている）。月次報告を閉じたら、その店へ地図を寄せてシャッターを下ろす（playShutters） */
const pendingShutter: number[] = [];
const cam: Camera = { x: 0, y: (s.n - 1) * 55, zoom: innerWidth < 600 ? 0.3 : 0.5 };
let speed = 1;
/** 建てる（move があれば移転） */
let placing: { id: string; dir: Dir; i: number; j: number; move?: number } | null = null;
let selected: number | null = null;
/** 吹き出しを出しているマス */
let pop: [number, number] | null = null;
/** 隣のセクタのマスを押したときの吹き出し（そのセクタの id。つながった地図） */
let popSector: string | null = null;
const fx: Effect[] = [];

function resize() {
  DPR = Math.min(2, devicePixelRatio || 1);
  W = Math.round(visualViewport?.width ?? innerWidth);
  H = Math.round(visualViewport?.height ?? innerHeight);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  dirty = true;
  if (root.childElementCount) layout();
}
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);

// ---------------------------------------------------------------- お知らせ

const toasts = h('div', 'isl-toasts');
/** 発掘画面のあいだに来たお知らせ（作業のあとに出す） */
let heldToasts: [string, string | undefined][] = [];
/** お知らせ（icon：左に添える絵。エンブレム・ゴールドダストなど） */
/** 提案・報告のカード・会話が出ているあいだのお知らせ（カードの上にかぶらないように、閉じたあとにまとめて。段 UI1・UI3） */
const cardToasts: [string, string | undefined][] = [];
/** 会話・カードのあいだはトーストをためる（段 UI3：会話の箱・カードに重ねない。閉じたあとにまとめて出す。流れの案内のあいだは前のまま出さない） */
const holdToasts = () => !!root.querySelector('.isl-cardm, .isl-talk');
function flushCardToasts() {
  if (!cardToasts.length || holdToasts()) return;
  for (const [x, img] of cardToasts.splice(0)) toast(x, img);
}
/** お知らせを出す。出したトーストの要素を返す（ためたときは null。同じ文が続いたときは前のトースト） */
function toast(text: string, img?: string): HTMLElement | null {
  if (holdToasts()) {
    if (!cardToasts.some((x) => x[0] === text)) cardToasts.push([text, img]);
    if (cardToasts.length > 4) cardToasts.shift();
    return null;
  }
  // 発掘作業のあいだ（全画面の発掘画面）は、町で起きたことのお知らせは出さない。作業のあとにまとめて（多ければ新しい 4 つ）
  if (digOpen()) {
    if (!heldToasts.some((x) => x[0] === text)) heldToasts.push([text, img]);
    if (heldToasts.length > 4) heldToasts.shift();
    return null;
  }
  const prev = toasts.lastElementChild as HTMLElement | null;
  if (prev && prev.dataset.text === text) {
    const n = Number(prev.dataset.n ?? 1) + 1;
    prev.dataset.n = String(n);
    prev.textContent = `${text} ×${n}`;
    return prev;
  }
  const e = h('div', `isl-toast ${img ? 'has-icon' : ''}`, text);
  if (img) {
    const im = h('img', 'isl-toast-icon');
    im.src = assetUrl(img);
    im.alt = '';
    e.prepend(im);
  }
  e.dataset.text = text;
  toasts.append(e);
  placeToasts();
  setTimeout(() => e.remove(), 3300);
  while (toasts.children.length > 3) toasts.firstChild?.remove();
  return e;
}
/**
 * 段 FX2：トーストの左の端（絵があれば絵）に小さな効果を付ける（トーストが動いても付いていく・消えたら隠す）。
 * 小さな手応えは組「small」で 1 秒に 1 つまで（docs/ISLAND_FX.md の間引き）
 */
function toastFx(e: HTMLElement | null, id: FxId, o: Parameters<typeof playFx>[3] = {}) {
  if (!e) return false;
  const at = () => {
    if (!e.isConnected) return null;
    const r = (e.querySelector('.isl-toast-icon') ?? e).getBoundingClientRect();
    return { x: e.querySelector('.isl-toast-icon') ? r.left + r.width / 2 : r.left + 14, y: r.top + r.height / 2 };
  };
  return playFx(id, 0, 0, { scale: innerWidth < 600 ? 1 : 4 / 3, thin: 'small', anchor: at, ...o });
}

const ctx: Ctx = {
  s: () => s,
  root,
  save,
  refresh: () => renderAll(),
  toast,
  build: (id, at) => {
    closeSheet();
    startPlacing(id, at ? { at } : {});
  },
  tip: (screen) => tutTip(screen),
  closeGlow: (screen) => !!tutStep()?.closeOn?.includes(screen),
  sfx: (k, gain, rate) => sfx.play(k, gain, rate),
  moved: (target, fresh, manager) => afterMove(target, fresh, manager),
  // 初めて復興を任せた（1 回だけ。発掘 v2 の 7 段目）
  delegated: () => {
    if (s.flags.delegateTalk) return;
    s.flags.delegateTalk = true;
    save();
    // 段 UI2：画面の下のマインちゃんの一言はやめた（ランドマップの復興の札に進みが出る）
  },
  skills: (focus) => openSkills(ctx, focus),
  rpNoted: () => (rpSeen = s.rp ?? 0),
  step: () => (tutOf(s) < TUT_DONE ? (TUT[tutOf(s)]?.id ?? null) : null),
  dismissed: () => {
    menu = null;
    sub = null;
    renderAll();
  },
};

// ヒーロー選びの引き出し（heroui.ts）：休憩中を押したときのトースト・効果音・✕ で担当を外したあとの描き直し
pickHooks.toast = toast;
pickHooks.sfx = (k) => sfx.play(k);
pickHooks.changed = () => {
  save();
  refreshSheet();
  renderAll();
};
// 付け替え（ほかの担当の人を押して、ここに付ける）はチュートリアルが終わってから
pickHooks.tutorial = () => tutOf(s) < TUT_DONE;

// ---------------------------------------------------------------- 上の帯

const hud = h('div', 'isl-hud');
const statMoney = h('div', 'isl-stat');
const statSales = h('div', 'isl-stat');
const statRank = h('button', 'isl-stat isl-stat-btn');
statRank.type = 'button';
statRank.addEventListener('click', () => openRanking(ctx));
const statDate = h('div', 'isl-stat isl-stat-date');
const dateText = h('span');
/** 月の進み（満タンで月が終わる） */
const monthBar = h('div', 'isl-month');
const monthFill = h('i');
monthBar.append(monthFill);
statDate.append(dateText, monthBar);
// ブランド力（資金のとなり）。押すとブランド力の画面
const statBrand = h('button', 'isl-stat isl-stat-btn isl-stat-brand');
statBrand.type = 'button';
statBrand.addEventListener('click', () => openBrand(ctx));
// 炎上のおそれ・炎上中の札（段 G。ブランド力のとなり。予告か炎上のときだけ）。押すと顧客満足度の画面（手を打つボタン）
const statFlame = h('button', 'isl-stat isl-stat-btn isl-stat-flame');
statFlame.type = 'button';
statFlame.hidden = true;
statFlame.addEventListener('click', () => openSatScreen());
// いまいるランドセクタ（関所を開いたあと）。押すとランドマップ
const statSector = h('button', 'isl-stat isl-stat-btn isl-stat-sector');
statSector.type = 'button';
statSector.addEventListener('click', () => openLand(ctx));
const sectorTier = h('small');
const sectorNames = h('span', 'isl-sector-names');
statSector.append(sectorTier, sectorNames);
/** 札に出しているセクタ（変わったら、古い名前が上へ抜けて新しい名前が下から入る） */
let shownSector: string | null = null;
const sectorPill = h('div', 'isl-sector-pill');
sectorPill.hidden = true;
let pillTimer = 0;
function showSectorName(id: string, animate: boolean) {
  const d = sectorDef(id);
  statSector.style.setProperty('--tc', TIERS[d.tier].color);
  sectorTier.textContent = tierLabel(d.tier);
  const nb = h('b', animate ? 'is-in' : '', `📍 ${d.name}`);
  if (animate) {
    for (const old of [...sectorNames.children]) {
      old.classList.remove('is-in');
      old.classList.add('is-out');
      setTimeout(() => old.remove(), 420);
    }
    statSector.classList.remove('is-flash');
    void statSector.offsetWidth;
    statSector.classList.add('is-flash');
    // 中央の上に小さく「📍 セクタ名」（1.2 秒）
    sectorPill.textContent = `📍 ${d.name}`;
    sectorPill.style.setProperty('--tc', TIERS[d.tier].color);
    sectorPill.hidden = false;
    sectorPill.classList.remove('is-on');
    void sectorPill.offsetWidth;
    sectorPill.classList.add('is-on');
    clearTimeout(pillTimer);
    pillTimer = window.setTimeout(() => (sectorPill.hidden = true), 1250);
  } else sectorNames.replaceChildren();
  sectorNames.append(nb);
}
/**
 * 段 UI2：「詰まり」の札（段 UI5a で「課題あり」。上の帯。いまの SCM の詰まりの段のアイコンと 1〜2 語）。2 か月目からの地図の吹き出しの代わり。
 * 押すと、その段のヒーローの提案のカード（受け箱にあれば）か、SCM ダッシュボード（④ 販売なら販売の内訳）。工房・お店がまだ無ければ建築へ
 */
/** 段 UI5a：お店が閉まった一言を出した（お店:締めの回数） */
const closedTold = new Set<string>();
const statJam = h('button', 'isl-stat isl-stat-btn isl-stat-jam');
statJam.type = 'button';
statJam.hidden = true;
const JAM_ICON: Record<Stage, string> = { buy: '📦', craft: '🔨', haul: '🛒', sell: '🏪' };
const JAM_NAME = (k: Stage) => ({ buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') })[k];
statJam.addEventListener('click', () => {
  const c = chipOf(s);
  if (!c) return;
  if (c.k !== 'jam') {
    openBuildTab();
    return;
  }
  const src = CHIP_SRC[c.stage];
  // 段 UI5a：流れが止まっていれば「○○が止まっています」のカードを先に
  const card = cardInbox(s).find((x) => x.src === 'stall') ?? (src ? cardInbox(s).find((x) => x.src === src) : undefined);
  if (card) showCard(ctx, card, { done: cardDone, open: cardOpen });
  else openSupply(ctx, { breakdown: c.stage === 'sell' });
});
/**
 * 上の帯の「受け箱」（段 UI3）：部長の提案・ヒーローからの提案と報告・お客さんの問い合わせの数。押すと受け箱
 * （経営企画 → 受け箱：部長の提案に問い合わせをまとめた画面）。承認・返事まで 2 タップ
 */
const statInbox = h('button', 'isl-stat isl-stat-btn isl-stat-inbox');
statInbox.type = 'button';
statInbox.hidden = true;
statInbox.title = t('受け箱：提案・報告・問い合わせ', 'Inbox: proposals, reports, inquiries');
statInbox.addEventListener('click', () => {
  if (tutStep()) return lockedNote();
  closePop();
  goSub('strategy', 'props');
});
/** 受け箱の数（いまのセクタの部長の提案・ヒーローからのカード・問い合わせ） */
function inboxCount(): number {
  const here = s.sector ?? 'c1';
  const props = (s.deleg?.inbox ?? []).filter((p) => (p.sector ?? here) === here).length;
  const cards = cardInbox(s).filter((x) => x.src !== 'head').length;
  const cs = menuDepts(s).includes('support') && csOn(s) ? (s.cs?.inbox.length ?? 0) : 0;
  return props + cards + cs;
}
let inboxKey = '';
function renderInbox() {
  const n = tutOf(s) < TUT_DONE ? 0 : inboxCount();
  statInbox.hidden = !n;
  const key = `${n}:${isEn}`;
  if (key === inboxKey) return;
  inboxKey = key;
  statInbox.replaceChildren(h('small', '', t('受け箱', 'Inbox')), h('b', '', `📥 ${n}`));
}
/**
 * 段 UI4：「効き目」の札（上の帯）。突発のできごとで選んだ手の、いま効いている倍率（アイコンと残りの日数）。押すと中身をトーストで
 */
const statEv = h('button', 'isl-stat isl-stat-btn isl-stat-ev');
statEv.type = 'button';
statEv.hidden = true;
statEv.addEventListener('click', () => {
  const xs = activeFx(s);
  if (!xs.length) return;
  for (const f of xs) toast(t(`${evIcon(f.ev)} ${fxText(f)}：あと ${Math.max(0, f.until - s.day)} 日`, `${evIcon(f.ev)} ${fxText(f)}: ${Math.max(0, f.until - s.day)}d left`));
});
let evKey = '';
function renderEv() {
  const xs = tutOf(s) < TUT_DONE ? [] : activeFx(s);
  statEv.hidden = !xs.length;
  if (!xs.length) return;
  const left = Math.max(...xs.map((f) => f.until - s.day));
  const f = xs[0];
  const bad = xs.some((x) => !isGood(x.ev) && (x.k === 'haul' || x.k === 'mat' ? x.mul > 1 : x.mul < 1));
  const key = `${f.ev}:${left}:${xs.length}:${bad}:${isEn}`;
  if (key === evKey) return;
  evKey = key;
  statEv.classList.toggle('is-bad', bad);
  statEv.title = xs.map((x) => fxText(x)).join(' / ');
  statEv.replaceChildren(h('small', '', t('効き目', 'Effect')), h('b', '', `${evIcon(f.ev)}${xs.length > 1 ? `×${xs.length}` : ''} ${t(`${left} 日`, `${left}d`)}`));
}
let jamKey = '';
function renderJam() {
  const c = chipOf(s);
  statJam.hidden = !c;
  if (!c) return;
  const key = c.k === 'jam' ? `jam:${c.stage}` : c.k;
  if (key === jamKey) return;
  jamKey = key;
  statJam.classList.toggle('is-build', c.k !== 'jam');
  if (c.k === 'jam') {
    // 段 UI5a：「詰まり」→「課題あり」（月次報告の KPI ③ とそろえる）
    statJam.replaceChildren(h('small', '', t('課題あり', 'Issue')), h('b', '', `${JAM_ICON[c.stage]} ${JAM_NAME(c.stage)}`));
    statJam.title = t('いちばんの課題。押すと、担当の提案か SCM ダッシュボード', 'The biggest issue. Tap for the proposal or the SCM dashboard');
  } else {
    statJam.replaceChildren(h('small', '', t('次の一手', 'Next')), h('b', '', c.k === 'ws' ? t('🔨 工房', '🔨 Workshop') : t('🏪 お店', '🏪 Shop')));
    statJam.title = t('押すと建築', 'Tap to build');
  }
}
const SPEEDS = [0, 1, 4];
const speedBtns = SPEEDS.map((v) =>
  btn(v === 0 ? '⏸' : v === 1 ? '▶' : '⏩', () => {
    // 月末ポーズのあいだは ▶⏩ では進まない（「次の月に進む」で始める）
    // 発掘作業のあいだは止められない（15 秒は現実の時間。止めて掘り続けることはできない）
    if (v === 0 && s.digRun) {
      toast(t('発掘作業のあいだは、時間は止まらないよ', 'Time keeps running while you dig'));
      return;
    }
    if (v > 0 && s.monthPause && !s.digRun) {
      toast(t('「次の月に進む」を押すと、次の月が始まるよ', 'Press “Next month” to start the next month'));
      return;
    }
    speed = v;
    renderHud();
  }),
);
const speedBox = h('div', 'isl-speed');
speedBox.append(...speedBtns);
hud.append(statMoney, statBrand, statFlame, statSales, statRank, statSector, statDate, statJam, statEv, statInbox, h('div', 'isl-spacer'), speedBox);

/** 流れの案内：売れたけれど、店内のレジでまだ払っていない額（上の帯にはまだ出さない） */
let tourUnpaid = 0;
/** 資金の表示（減ったときは数字が下がっていく演出） */
let shownMoney = s.money;
let moneyAnim: { from: number; to: number; t0: number } | null = null;
/** 日が進む間の増減は演出しない（買い物や建築など、操作で減ったときだけ） */
let ticking = false;
const moneyLabel = h('b');
function moneyText(v: number) {
  moneyLabel.textContent = money(v);
}
/** ブランド力が動いたら知らせる（新しい履歴だけ） */
let brandSeen = s.brandLog?.[0] ?? null;
function brandNews() {
  const log = s.brandLog ?? [];
  if (!log.length || log[0] === brandSeen) return;
  const k = brandSeen ? log.indexOf(brandSeen) : log.length;
  const fresh = log.slice(0, k < 0 ? 1 : k).reverse();
  brandSeen = log[0];
  for (const e of fresh) {
    toast(t(`ブランド力 ${signed(e.d)}（${e.why}）`, `Brand ${signed(e.d)} (${e.why})`));
    statBrand.classList.remove('is-up', 'is-down');
    void statBrand.offsetWidth;
    statBrand.classList.add(e.d > 0 ? 'is-up' : 'is-down');
  }
  if (fresh.some((e) => e.d > 0)) {
    sfx.play('levelup');
    // 段 FX2：上の帯のブランド力の札で光る（小さな手応え。1 秒に 1 つ）
    fxAtEl('collect-burst', statBrand, { palette: FX_PAL.gold, dy: 30, scale: innerWidth < 600 ? 1 : 4 / 3, thin: 'small' });
  }
}

/** エンブレム・研究ポイントが増えたら知らせる（上の帯には出さない。スキルツリーの通貨の帯に出す） */
let emblemSeen = s.emblem ?? 0;
let rpSeen = s.rp ?? 0;
/** 強化アイテム（段 E1）：増えたら「✨ 銅の昇格の証を手に入れた！」 */
let itemSeen: Partial<Record<PromoItem, number>> = { ...s.heroItems };
function currencyNews() {
  const e = s.emblem ?? 0;
  const d = s.rp ?? 0;
  for (const k of PROMO_ITEMS) {
    const n = s.heroItems?.[k] ?? 0;
    if (n > (itemSeen[k] ?? 0)) toast(t(`✨ 強化アイテム「${PROMO_ITEM[k].name}」を手に入れた！（${n} 個）`, `✨ Got a promotion item: ${PROMO_ITEM[k].name}! (${n})`));
  }
  itemSeen = { ...s.heroItems };
  if (e > emblemSeen) {
    const te = toast(t(`🏅 エンブレムを獲得！（いま ${e}）`, `🏅 Emblem earned! (now ${e})`), 'mch/Image/Icons/emblem.webp');
    sfx.play('levelup');
    // 段 FX2：トーストのエンブレムの絵の上に、跳ねる金の星（星は原点の 25 ドット上に浮かぶ）
    toastFx(te, 'power-star', { palette: FX_PAL.gold, opts: { shadow: false }, dy: 25, life: 1300 });
  }
  // 発掘場を開いているあいだは、パネルの演出で見せる（トーストを重ねない）
  if (d > rpSeen && !digOpen()) toast(t(`研究ポイント +${d - rpSeen}（いま ${d}）`, `Research points +${d - rpSeen} (now ${d})`));
  emblemSeen = e;
  rpSeen = d;
}

function renderHud() {
  statMoney.className = `isl-stat ${s.money < 0 ? 'is-bad' : ''} ${moneyAnim ? 'is-spending' : ''}`;
  if (!statMoney.firstChild) statMoney.append(h('small', '', t('資金', 'Funds')), moneyLabel);
  const spent = shownMoney - s.money;
  if (!ticking && spent >= 1 && !moneyAnim) {
    moneyAnim = { from: shownMoney, to: s.money, t0: performance.now() };
    const fly = h('span', 'isl-spend', `−${money(spent)}`);
    statMoney.append(fly);
    setTimeout(() => fly.remove(), 1200);
    sfx.play('spend');
    statMoney.classList.add('is-spending');
  } else if (!moneyAnim) {
    shownMoney = s.money;
    moneyText(s.money - tourUnpaid);
  }
  const lb = t('ブランド力', 'Brand');
  statBrand.innerHTML = `<small>${lb}</small><b>★ ${s.brand ?? 0}</b>`;
  // 段 G：企業の格（札の説明に。上の帯は混み合わせない）・炎上のおそれ／炎上中の札
  statBrand.title = t(`ブランド力 ${s.brand ?? 0}・企業の格「${gradeName(gradeOf(s))}」`, `Brand ${s.brand ?? 0} · standing: ${gradeName(gradeOf(s))}`);
  const fl = s.cs?.flame;
  const fw = s.cs?.warn;
  statFlame.hidden = !csOn(s) || (!fl && (!fw || !!fw.done));
  // スマホは上の帯に札を足さず、ブランド力の札に小さな印（⚠・🔥）。押すとブランド力の画面（上に炎上の札）
  statBrand.classList.toggle('has-warn', !statFlame.hidden && !fl);
  statBrand.classList.toggle('has-fire', !statFlame.hidden && !!fl);
  if (!statFlame.hidden) {
    statFlame.className = `isl-stat isl-stat-btn isl-stat-flame ${fl ? 'is-fire' : 'is-warn'}`;
    statFlame.replaceChildren(h('small', '', fl ? t('炎上中', 'Backlash') : t('炎上のおそれ', 'Risk')), h('b', '', fl ? `🔥 ${Math.round(fl.heat * 100)}%` : '⚠'));
    statFlame.title = fl ? t('炎上中：来店とブランド力が下がっています。広報の火消し・合う返事で早くおさまる', 'Backlash: visits and brand are down. Damage control and fitting replies cool it') : t('炎上のおそれ：このまま次の締めを迎えると炎上します。お詫びの告知か、中身を直そう', 'Backlash risk: it will blow up at the next close. Post an apology or fix the cause');
  }
  statSector.hidden = !s.land;
  if (s.land && shownSector !== s.land.cur) {
    showSectorName(s.land.cur, shownSector != null);
    shownSector = s.land.cur;
  }
  brandNews();
  currencyNews();
  const ls = t('今月の売上', 'Sales this month');
  statSales.innerHTML = `<small>${ls}</small><b>${money(monthRevenue(s) - tourUnpaid)}</b>`;
  const last = s.reports[s.reports.length - 1];
  statRank.hidden = !last;
  const lr = t('エリア', 'Area');
  if (last) statRank.innerHTML = `<small>${lr}</small><b>${t(`${last.rank} 位`, `#${last.rank}`)}</b>`;
  const d = date(s);
  dateText.textContent = d ? (isEn ? `Y${d.year} M${d.month} D${d.day}` : `${d.year} 年目 ${d.month} 月 ${d.day} 日`) : t(`開業準備 ${s.day - (s.arrived ?? 0) + 1} 日目`, `Prep day ${s.day - (s.arrived ?? 0) + 1}`); // i18n-ja
  // 月の進み：開店後は締めまでの日数、開店前は（最初の締めまでが決まっていないので）空
  const left = daysToClose(s);
  const frac = d ? (DAYS - left) / DAYS : 0;
  monthFill.style.width = `${Math.round(frac * 100)}%`;
  monthBar.classList.toggle('is-near', d != null && left <= 5);
  monthBar.title = d ? t(`月の締めまで あと ${left} 日`, `${left} days to the monthly close`) : '';
  speedBtns.forEach((b, k) => b.classList.toggle('is-on', SPEEDS[k] === speed));
  // 見習い期間で時間を止めている段・月末ポーズのあいだは、速さのボタンを薄く（押しても進まない）
  speedBox.classList.toggle('is-off', tutHold() || !!s.monthPause);
  renderJam();
  renderEv();
  renderInbox();
  // 段 UI4（UI3 の残り）：札が増えて上の帯の行が増えたら、画面（シート）の上端を下げ直す（スマホで「受け箱」の札がシートに半分隠れていた）
  const hb = hud.offsetHeight;
  if (hb !== hudH) {
    hudH = hb;
    if (root.childElementCount) layout();
  }
}
let hudH = 0;
// 上の帯の大きさが変わったら（札が増えて行が増えた・字の大きさ）、いつでも画面の上端を下げ直す
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => root.childElementCount && layout()).observe(hud);

// ---------------------------------------------------------------- 下の帯：事業別メニュー

/**
 * 下の帯は部門のメニュー（段 B：部門の土台。docs/ISLAND_PHASE1.md「部門」）。開いた部門（開くランクに達し、中身ができた部門）だけが並ぶ。
 * 経営企画は真ん中の大きいボタン（1 つ目の小メニューがスキルツリー）。7 つ以上になったらグループの引き出し（dept.ts の menuLayout）
 */
type Menu = DeptId;
interface Sub {
  key: string;
  name: string;
  /** スマホのサブタブの短い名前（段 UI3） */
  short: string;
  note: string;
  def: SubDef;
  needs?: 'workshop' | 'land' | 'hire' | 'tree' | 'museum' | 'budget';
}
/**
 * 画面ごとに開く関数（段 UI3：サブタブは menus.ts の SUB_DEFS。似た画面は 1 つのサブタブに縦に並べる）。
 * 部門がまだ開いていない画面（問い合わせなど）は何もしない（まとめた画面から外れる）
 */
const SCREEN: Record<ScreenId, () => void> = {
  flow: () => openSupply(ctx),
  buy: () => openBuy(ctx),
  bom: () => openBom(ctx),
  sales: () => openSales(ctx),
  tree: () => openSkills(ctx),
  build: () => openBuildSheet(),
  land: () => openLand(ctx),
  books: () => openBooks(ctx),
  props: () => openProps(ctx),
  ceo: () => openCharisma(ctx),
  ma: () => (menuDepts(s).includes('legal') ? openLegalScreen('ma') : openMA(ctx)),
  staff: () => openStaff(ctx),
  org: () => openOrg(ctx),
  side: () => openSide(ctx),
  growth: () => openGrowth(ctx),
  // 人材登用の画面は「候補の一覧 → カリスマ（経営者の部分に 1 つだけ）」の順（カリスマの札が 2 回出ないように）
  hire: () => openHire(ctx, { charisma: false }),
  pay: () => openPayroll(ctx),
  notes: () => openNotes(ctx),
  dev: () => openDev(ctx),
  museum: () => openMuseum(ctx),
  ads: () => openAds(ctx),
  missions: () => openMissions(ctx),
  data: () => openData(ctx),
  outlook: () => openForecast(ctx, { skills: () => panelsOf('marketing'), ads: () => openAds(ctx) }),
  ranking: () => openRanking(ctx),
  pr: () => openPr(ctx, { ...csHooks(), skills: () => panelsOf('marketing') }),
  inbox: () => menuDepts(s).includes('support') && openInbox(ctx, csHooks()),
  sat: () => openSat(ctx, csHooks()),
  area: () => openTradeScreen(),
  diplo: () => openDiplo(ctx),
  tax: () => openTax(ctx, { books: () => openBooks(ctx), skills: () => panelsOf('accounting') }),
  env: () => openGa(ctx, { invest: () => openInvest(ctx), skills: () => panelsOf('general') }),
  contract: () => openLegalScreen('contract'),
  patent: () => openLegalScreen('patent'),
  suit: () => openLegalScreen('suit'),
  invest: () => openInvest(ctx),
  settings: () => openSettings(),
  pace: () => openPace(),
  save: () => openSaveMenu(),
  trophy: () => openTrophies(ctx),
  budget: () => openBudget(ctx),
  test: () => TEST && openTest(),
};
/** サブタブの画面を開く（まとめた画面は縦に並べて。チュートリアルのあいだは 1 つ目の画面だけ：教える画面を変えない）。part：はじめにその部分へ */
function openDef(x: SubDef, part: ScreenId | null = null) {
  const parts = x.parts.filter((p) => p !== 'test' || TEST);
  if (x.key === 'settings' && TEST) parts.push('test');
  if (tutStep() || parts.length === 1) return SCREEN[part && tutStep() ? part : parts[0]]();
  openTogether(ctx, x.name, parts.map((p) => () => SCREEN[p]()), Math.max(0, parts.indexOf(part ?? parts[0])));
}
/** 部門のサブタブ（経理が開いたら、決算書は経営企画から外す） */
const subsOf = (m: Menu): Sub[] => subDefs(m, menuDepts(s)).map((x) => ({ key: x.key, name: x.name, short: x.short, note: x.note, needs: x.needs, def: x }));
/** 部門の名前（タブ・マインちゃんの案内の「「物流」タブ」） */
const MENU_NAME = (m: Menu) => DEPT[m].name;

let menu: Menu | null = null;
let sub: string | null = null;

const foot = h('div', 'isl-foot');
const panel = h('div', 'isl-panel');
/** 部門の画面の上の共通の帯：部門のアイコンと名前・理解度・次の節目（準備中）・担当（準備中）・「この部門のパネルを見る」 */
const deptBand = h('div', 'isl-dband');
const subRow = h('div', 'isl-subs');
const cards = h('div', 'isl-cards');
panel.append(deptBand, subRow, cards);
const tabbar = h('nav', 'isl-tabbar');
let tabBtns = {} as Partial<Record<Menu, HTMLButtonElement>>;
/** グループの引き出し（部門が 7 つ以上のとき。いまは器だけ） */
let drawer: DeptGroup | null = null;
/** 段 UI5b：グループの帯の説明のあと、光らせるグループ（人事の入っている「管理」）。押すか 60 秒で消える */
let footGuide: DeptGroup | null = null;
let footGuideAt = 0;
const drawerEl = h('div', 'isl-drawer');
drawerEl.hidden = true;
let tabKey = '';
/** 下の帯のタブを、開いている部門で作り直す（開く部門が変わったときだけ） */
function buildTabs() {
  const ids = menuDepts(s);
  const key = ids.join(',');
  if (key === tabKey) return;
  tabKey = key;
  tabBtns = {};
  const lay = menuLayout(ids);
  const tab = (m: Menu) => {
    const d = DEPT[m];
    const b = h('button', `isl-tab ${m === lay.center ? 'is-center' : ''}`);
    b.type = 'button';
    b.dataset.dept = m;
    b.append(h('i', '', d.icon), h('span', 'is-full', d.name), h('span', 'is-short', d.short));
    b.addEventListener('click', () => pickMenu(m));
    tabBtns[m] = b;
    return b;
  };
  const leftG = h('div', 'isl-tabgroup');
  const rightG = h('div', 'isl-tabgroup');
  const center = lay.center ? tab(lay.center) : h('span');
  if (lay.kind === 'flat') {
    leftG.append(...lay.left.map(tab));
    rightG.append(...lay.right.map(tab));
  } else {
    // グループのボタン（押すと、そのグループの部門の引き出し）
    lay.groups.forEach((g, k) => {
      const b = h('button', 'isl-tab is-group');
      b.type = 'button';
      b.dataset.group = g.id;
      b.append(h('i', '', g.icon), h('span', 'is-full', g.name), h('span', 'is-short', g.name));
      b.addEventListener('click', () => {
        drawer = drawer === g.id ? null : g.id;
        // 段 UI5b：光らせていたグループを押した：引き出しの人事を光らせる（人事を押すまで）
        if (footGuide === g.id && drawer) footGuideAt = -1;
        drawerEl.replaceChildren(...g.depts.map((m) => tab(m)));
        drawerEl.hidden = !drawer;
        renderFoot();
      });
      for (const m of g.depts) tab(m);
      (k < Math.ceil(lay.groups.length / 2) ? leftG : rightG).append(b);
    });
  }
  tabbar.replaceChildren(leftG, center, rightG);
}
foot.append(drawerEl, panel, tabbar);

/** サブタブがまだ使えない（工房が無い・関所を開いていない） */
const needsOff = (x: Sub) =>
  (x.needs === 'workshop' && !myWorkshop(s)) || (x.needs === 'land' && !s.land) || (x.needs === 'hire' && (!s.skills.includes('hire') || hireUnlocking)) || (x.needs === 'tree' && !myWorkshop(s) && !s.land) || (x.needs === 'museum' && !museumOpen(s)) || (x.needs === 'budget' && !budgetOpen(s));
const needWs = () => {
  toast(t('まずは工房を建てましょう', 'Build the workshop first'));
};

/** 人材登用のアンロックの演出中 */
let hireUnlocking = false;
function unlockHire() {
  hireUnlocking = true;
  renderAll();
  sfx.play('levelup');
  setTimeout(() => sfx.play('clear'), 450);
  setTimeout(() => {
    hireUnlocking = false;
    s.flags.hireUnlocked = true;
    save();
    renderAll();
    if (tutStep()?.id === 'hire')
      talk(
        HIRE_LINES().map((text) => ({ text })),
        t('人材登用を開く', 'Open recruiting'),
        () => goSub('hr', 'hire'),
      );
    else toast(t('人材登用が使えるようになりました！', 'Recruiting is now available!'));
  }, 1700);
}

/** 下の帯のタブ：押すと 1 つ目のサブタブの画面まで開く。もう一度押すと閉じる */
function pickMenu(m: Menu) {
  if (s.digRun) return busyDig();
  if (m === 'hr') footGuide = null;
  const ws = !!myWorkshop(s);
  if (menuLocked(m)) return lockedNote();
  // 工房がまだ：物流は開けない。人事はほかのセクタに来たばかりなら開ける（会社ぜんたいのスキルは経営企画 → スキルツリー）
  if (!ws && (m === 'logistics' || (m === 'hr' && !s.land))) return needWs();
  closePop();
  if (menu === m) return closeMenu();
  if (placing && !placing.move) placing = null;
  menu = m;
  sub = null;
  // 人材の募集を開放して、はじめて人事を開いた：人材登用のロックが外れる演出
  if (m === 'hr' && s.skills.includes('hire') && !s.flags.hireUnlocked) {
    closeSheet();
    unlockHire();
    return;
  }
  drawer = null;
  // 段 UI6：部長との会話で動かす部門（いまは人事）。部長がいれば部長、置けるのにいなければマインちゃん。チュートリアルのあいだは変えない
  if (!tutStep() && talkMode(s, m)) {
    closeSheet();
    sub = null;
    sfx.play('tap');
    openHeadTalk(ctx, m, { detail: (key) => goSub(m, key) });
    renderAll();
    return;
  }
  // チュートリアル中は、いま開いてほしい小メニューから開く
  const ts = tutStep();
  const [hm, hk] = (ts ? hlOf(ts, s) : '').split(':');
  const target = hm === m && hk ? subsOf(m).find((x) => x.key === hk) : undefined;
  // 自分で押してもらう段：サブタブを出すだけ（光っているサブタブを押してもらう）
  if (ts?.lesson && target) {
    closeSheet();
    sfx.play('tap');
    renderAll();
    return;
  }
  const first = target ?? subsOf(m).find((x) => !needsOff(x) && !subLocked(m, x.key)) ?? subsOf(m)[0];
  openSub(first);
}

/** サブタブ：画面を切り替える（下の帯は出したまま）。part：まとめた画面のその部分から */
function openSub(x: Sub, part: ScreenId | null = null) {
  if (menu && subLocked(menu, x.key)) return lockedNote();
  if (x.needs === 'workshop' && !myWorkshop(s)) return needWs();
  if (x.needs === 'land' && !s.land) return toast(t('ランドのふちの関所を開くと使えます', 'Open the gate at the edge of the land first'));
  if (x.needs === 'tree' && !myWorkshop(s) && !s.land) return needWs();
  if (x.needs === 'budget' && !budgetOpen(s)) return toast(t('Rare の町に出店すると開きます', 'Opens once you open in a Rare town'));
  if (x.needs === 'museum' && !museumOpen(s)) return toast(t('遺物の展示館を建てると開けます（復興した土地に。経営企画 → 建築）', 'Build the relic museum first (on revived land: Strategy → Build)'));
  if (x.needs === 'hire' && !s.skills.includes('hire')) {
    sfx.play('error');
    return toast(t('スキルツリーの「人材の募集」を研究すると使えます', 'Research Recruiting in the skill tree first'));
  }
  if (hireUnlocking) return;
  sub = x.key;
  if (x.key !== 'build' && placing && !placing.move) placing = null;
  closeSheet();
  openDef(x.def, part);
  renderAll();
}

function closeMenu() {
  menu = null;
  sub = null;
  if (placing && !placing.move) placing = null;
  closeSheet();
  renderAll();
}

function renderFoot() {
  buildTabs();
  const tb = (m: Menu) => tabBtns[m];
  for (const m of Object.keys(tabBtns) as Menu[]) tb(m)!.classList.toggle('is-on', menu === m);
  const ws = !!myWorkshop(s);
  tb('hr')?.classList.toggle('is-off', !ws);
  tb('logistics')?.classList.toggle('is-off', !ws);
  const ready = MISSIONS.some((m) => s.missions[m.id] === 'done');
  tb('marketing')?.classList.toggle('has-dot', ready);
  // 段 UI3：スキルツリーもほかのサブタブと同じ（サブタブを隠さない）
  panel.hidden = !menu || !!placing?.move;
  // グループの引き出し：開いているあいだはサブタブの代わりに出す（下に積むのは 2 段まで：引き出しかサブタブ ＋ タブ）
  drawerEl.hidden = !drawer;
  root.classList.toggle('has-drawer', !!drawer);
  // チュートリアル：次に押すところを光らせる
  const tk = tutOf(s);
  const step = tk < TUT_DONE ? TUT[tk] : undefined;
  // 発掘との出会いの最後：経営企画のタブを光らせる（スキルツリーで研究パネルを開いてもらう）
  const [hm, hk] = (step && !introPending() ? hlOf(step, s) : !step && s.flags.digMeet === 'skill' && !root.querySelector('.isl-modal') ? 'strategy' : '').split(':');
  for (const m of Object.keys(tabBtns) as Menu[]) {
    tb(m)!.classList.toggle('is-guide', !placing && hm === m && (menu !== m || (!hk && !sheetOpen())));
    tb(m)!.classList.toggle('is-lock', menuLocked(m));
  }
  for (const g of tabbar.querySelectorAll<HTMLElement>('.isl-tab.is-group')) g.classList.toggle('is-on', drawer === g.dataset.group);
  // 段 UI5b：グループの帯の説明のあと：「管理」を光らせ、開いたら中の「人事」を光らせる（人事を押す・60 秒で消える）
  if ((footGuide && footGuideAt >= 0 && performance.now() - footGuideAt > 60000) || menu === 'hr') footGuide = null;
  for (const g of tabbar.querySelectorAll<HTMLElement>('.isl-tab.is-group')) g.classList.toggle('is-guide', !!footGuide && footGuide === g.dataset.group && drawer !== footGuide && !step);
  if (footGuide && drawer === footGuide && !step) tabBtns.hr?.classList.add('is-guide');
  speedBtns[2].classList.toggle('is-guide', hm === 'speed' && speed !== 4);
  if (!menu) {
    placeBand();
    return;
  }
  renderBand(menu);
  subRow.replaceChildren(
    ...subsOf(menu).map((x) => {
      const b = h('button', `isl-sub ${sub === x.key ? 'is-on' : ''} ${needsOff(x) ? 'is-off' : ''} ${hm === menu && hk === x.key && sub !== x.key ? 'is-guide' : ''} ${subLocked(menu as Menu, x.key) ? 'is-lock' : ''}`);
      b.type = 'button';
      b.append(h('b', 'is-full', x.name), h('b', 'is-short', x.short), h('small', '', x.note));
      if (x.key === 'missions' && ready) b.classList.add('has-dot');
      // 人材登用：「人材の募集」を開放するまでは 🔒。開放したあと、はじめて人事を開いたときにロックが外れる演出
      if (x.needs === 'hire') {
        if (!s.skills.includes('hire')) b.append(h('span', 'isl-sub-lock', '🔒'));
        else if (hireUnlocking) {
          b.classList.add('is-unlocking');
          b.append(h('span', 'isl-sub-lock is-open', '🔓'));
          for (let k = 0; k < 8; k++) {
            const sp = h('i', 'isl-spark');
            sp.style.setProperty('--a', `${k * 45}deg`);
            sp.style.animationDelay = `${0.35 + (k % 2) * 0.12}s`;
            b.append(sp);
          }
        }
      }
      b.addEventListener('click', () => openSub(x));
      return b;
    }),
  );
  cards.hidden = true;
  subRow.hidden = !!placing || !!drawer;
  deptBand.hidden = !!placing;
  placeBand();
}

sheetHooks.opened = () => placeBand();
/**
 * 部門の帯（理解度・担当・パネル）の置き場所（段 UI3）：PC（右の帯）は帯の中、スマホは開いている画面の見出しの下の 1 行（下に段として積まない）。
 * 画面が開いていなければ出さない
 */
function placeBand() {
  // （右の帯かどうかは layout() が付ける is-rail で見る：RAIL はこのファイルの後ろで作る）
  if (root.classList.contains('is-rail')) {
    if (deptBand.parentElement !== panel) panel.prepend(deptBand);
    return;
  }
  const head = root.querySelector('.isl-sheet .isl-sheet-head');
  if (head && menu) {
    if (head.nextElementSibling !== deptBand) head.after(deptBand);
  } else if (deptBand.parentElement) deptBand.remove();
}

/** 部門の画面の上の帯（どの部門も同じ形）。担当（チームリーダー・事業部長。段 D）を押すと任命の画面。奥義は準備中 */
let bandKey = '';
function renderBand(m: Menu) {
  const d = DEPT[m];
  const lv = deptLevel(s, m);
  const nx = nextMark(lv);
  const bt = bandText(s, m);
  const key = `${m}:${lv}:${isEn}:${bt.long}`;
  if (key === bandKey) return;
  bandKey = key;
  deptBand.style.setProperty('--br', d.color);
  const go = h('button', 'isl-dband-go');
  go.type = 'button';
  go.addEventListener('click', () => {
    if (tutStep()) return lockedNote();
    menu = 'strategy';
    sub = 'tree';
    closeSheet();
    openSkills(ctx, m);
    renderAll();
  });
  // スマホは 1 行に収める（短い言い方）
  const two = (long: string, short: string) => [h('span', 'is-long', long), h('span', 'is-short', short)];
  go.replaceChildren(...two(t('この部門のパネルを見る', 'See this department’s panels'), t('パネル ›', 'Panels ›')));
  const next = h('small', 'isl-dband-next');
  // 奥義（15・25・40）は後の段（準備中）。チームリーダー（3）・事業部長（8）は置ける
  const soon = nx && nx.k >= 2;
  next.append(...(nx ? two(t(`次の節目：${nx.name}まで あと ${nx.left}${soon ? '（準備中）' : ''}`, `Next: ${nx.name} in ${nx.left}${soon ? ' (coming soon)' : ''}`), t(`次：${nx.name} あと ${nx.left}`, `Next: ${nx.name} in ${nx.left}`)) : two(t('節目はすべて到達（奥義は準備中）', 'All milestones reached (mastery coming soon)'), t('節目はすべて到達', 'All milestones reached'))));
  // 担当：押すと任命の画面（チュートリアル中は押せない）
  const lead = h('button', `isl-dband-lead ${bt.on ? 'is-on' : ''}`);
  lead.type = 'button';
  lead.append(...two(bt.long, bt.short));
  lead.addEventListener('click', () => {
    if (tutStep()) return lockedNote();
    closeSheet();
    openDeleg(ctx, m);
    renderAll();
  });
  deptBand.replaceChildren(
    (() => {
      const nm = h('span', 'isl-dband-name');
      nm.append(...two(`${d.icon} ${d.name}`, `${d.icon} ${d.short}`));
      return nm;
    })(),
    h('span', 'isl-dband-lv', t(`理解度 ${lv}`, `Understanding ${lv}`)),
    next,
    lead,
    go,
  );
}

// ---------------------------------------------------------------- 建てる

const ERR: Record<PlaceErr, string> = {
  ground: t('空き地にだけ建てられます', 'Build on empty lots only'),
  waste: t('荒れ地は発掘許可をもらって掘りきると、建てられるようになる', 'Wastelands become buildable once you dig them out with a permit'),
  taken: t('ほかの建物があります', 'Something is already there'),
  road: t('道路に面した場所にだけ建てられます（入口は道路側）', 'Must face a road (entrance toward the road)'),
  money: t('資金が足りません', 'Not enough funds'),
  locked: t('まだ建てられません', 'Not available yet'),
  soon: t('準備中です（スキルツリーで解放予定）', 'Coming soon (unlocked by skills)'),
  limit: t('工房は 1 つまでです', 'Only one workshop for now'),
  revive: t('遺物の展示館は、復興した土地（掘りきった荒れ地）にだけ建てられる', 'The relic museum can only go on revived land (a dug-out wasteland)'),
};
/** 建てられない理由（建物ごと：展示館は会社で 1 つ） */
const errOf = (id: string, e: PlaceErr) => (id === 'museum' && e === 'limit' ? t('遺物の展示館は会社で 1 つまで', 'Only one relic museum per company') : id === 'museum' && e === 'locked' ? t('遺物の展示館は、復興した土地（掘りきった荒れ地）ができると建てられる', 'The relic museum unlocks once you have revived land (a dug-out wasteland)') : ERR[e]);

function lockNote(id: string): string {
  const b = P1B[id];
  if (b.soon) return t('準備中', 'Coming soon');
  if (b.kind === 'workshop') return s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop') ? t('建設済み', 'Built') : t('無料', 'Free');
  if (b.kind === 'shop' && !s.buildings.some((x) => x.owner === 'me' && x.id === 'workshop')) return t('工房のあと', 'After the workshop');
  if (b.kind === 'museum') return s.museum?.at ? t('建設済み（会社で 1 つ）', 'Built (one per company)') : t('復興した土地が要る', 'Needs revived land');
  if (b.requires && !s.skills.includes(b.requires)) return t('スキルで解放', 'Unlock by skill');
  return money(b.cost);
}

/** 「ここに建てる」で選んだマス */
let buildAt: [number, number] | null = null;

/** 建築の一覧で開いているカテゴリ */
let buildCat: string | null = null;

/** 建物の種類のひとこと */
function kindNote(b: (typeof P1_BUILDINGS)[number]): string {
  switch (b.kind) {
    case 'workshop':
      return t('作業台でエクステを作る', 'Craft Extensions at benches');
    case 'shop':
      return t(`お店・棚 ${b.shelves ?? 1}`, `Shop · ${b.shelves ?? 1} shelf`);
    case 'warehouse':
      return t(`置き場所 +${STORE.warehouse}`, `Storage +${STORE.warehouse}`);
    case 'depot':
      return t('遠いお店への便が速くなる', 'Faster runs to far shops');
    case 'museum':
      return t('遺物を飾ると、毎月お客さんが来る（復興した土地にだけ・会社で 1 つ）', 'Display relics for monthly visitors (revived land only · one per company)');
    default:
      return '';
  }
}

/** 「？」のパネルのヒント（スキルで解放・準備中） */
function secretHint(id: string): string {
  const b = P1B[id];
  if (b.soon) return t('これから解放', 'Coming later');
  if (b.requires) return t(`スキル「${SKILL[b.requires]?.name ?? b.requires}」で解放`, `Unlock with ${SKILL[b.requires]?.name ?? b.requires}`);
  return t('まだ建てられない', 'Not yet');
}

/**
 * 建築の一覧（ほかの画面と同じ大きな画面）。上にカテゴリのタブ、下に建物のカード。
 * 資金だけが足りない建物は灰色で値段を赤く、スキルなどの条件を満たさない建物は「？」で外観を見せない。
 */
function openBuildSheet() {
  openSheet(ctx, t('建築', 'Build'), (body) => {
    const tk = tutOf(s);
    const guideId = tk < TUT_DONE ? TUT[tk]?.card : undefined;
    if (guideId) buildCat = BUILD_CATS.find((c) => c.ids.includes(guideId))?.id ?? buildCat;
    buildCat ??= buildCatOpen(s, 'shop') ? 'shop' : 'base';
    mineTip(ctx, 'build', body);
    if (buildAt) body.append(h('p', 'isl-dim', t('選んだマスに建てます。建物を選んでください。', 'Choose a building for the selected lot.')));
    // カテゴリのタブ（建てられる建物が 1 つも無いものはロック。開いたら一度だけロックが外れる演出）
    const seen = (s.flags.buildCats ??= ['base']);
    const fresh: string[] = [];
    const tabs = h('div', 'isl-bcats');
    for (const c of BUILD_CATS) {
      // 「遺物」（遺物の展示館）は、荒れ地が初めて復興するまで出さない（チュートリアル・はじめの建築の一覧は今のまま）
      if (c.id === 'relic' && !revivedSites(s).length && !s.museum?.at) continue;
      const open = buildCatOpen(s, c.id);
      const isNew = open && !seen.includes(c.id);
      if (isNew) fresh.push(c.id);
      const b = h('button', `isl-bcat ${buildCat === c.id ? 'is-on' : ''} ${open ? '' : 'is-lock'} ${isNew ? 'is-unlocking' : ''}`);
      b.type = 'button';
      const known = c.ids.filter((id) => buildKnown(s, id)).length;
      b.append(h('span', 'isl-bcat-icon', c.icon), h('b', '', c.name), h('small', '', `${known}/${c.ids.length}`));
      if (!open) b.append(h('span', 'isl-bcat-lock', '🔒'));
      if (isNew) {
        b.append(h('span', 'isl-bcat-lock is-open', '🔓'));
        for (let k = 0; k < 8; k++) {
          const sp = h('i', 'isl-spark');
          sp.style.setProperty('--a', `${k * 45}deg`);
          sp.style.animationDelay = `${0.3 + (k % 2) * 0.12}s`;
          b.append(sp);
        }
      }
      b.addEventListener('click', () => {
        buildCat = c.id;
        sfx.play('tap');
        refreshSheet();
      });
      tabs.append(b);
    }
    body.append(tabs);
    if (fresh.length) {
      seen.push(...fresh);
      save();
      sfx.play('levelup');
      for (const id of fresh) toast(t(`「${BUILD_CATS.find((c) => c.id === id)?.name}」の建物が建てられるようになりました！`, `New buildings available: ${BUILD_CATS.find((c) => c.id === id)?.name}!`));
    }
    const cat = BUILD_CATS.find((c) => c.id === buildCat)!;
    if (!buildCatOpen(s, cat.id)) body.append(h('p', 'isl-dim isl-bnote', t('このカテゴリの建物は、まだ建てられません。スキルや会社の成長で、ひとつずつ解放されます。', 'Nothing here can be built yet. Skills and company growth unlock them one by one.')));
    const grid = h('div', 'isl-bgrid');
    for (const id of cat.ids) {
      const b = P1B[id];
      if (!b) continue;
      const err = canBuild(s, id);
      if (!buildKnown(s, id)) {
        // 条件を満たしていない：外観を見せない「？」
        const c = h('button', 'isl-bcard is-secret');
        c.type = 'button';
        c.append(h('div', 'isl-bcard-q', '?'), h('b', '', '???'), h('small', 'isl-dim', secretHint(id)));
        c.addEventListener('click', () => {
          sfx.play('error');
          toast(secretHint(id));
        });
        grid.append(c);
        continue;
      }
      const guide = guideId === id;
      const c = h('button', `isl-bcard ${err === 'money' ? 'is-poor' : ''} ${err && err !== 'money' ? 'is-off' : ''} ${guide ? 'is-guide' : ''}`);
      c.type = 'button';
      const im = image(`b/${artId(id)}/rd.png`).cloneNode() as HTMLImageElement;
      im.alt = '';
      const cost = err === 'limit' ? t('建設済み', 'Built') : err === 'locked' ? lockNote(id) : b.cost ? money(b.cost) : t('無料', 'Free');
      c.append(im, h('b', '', DEF[id].name), h('span', `isl-bcost ${err === 'money' ? 'is-short' : ''}`, cost));
      const note = kindNote(b);
      if (note) c.append(h('small', 'isl-dim', note));
      c.append(h('small', 'isl-dim', t(`工期 ${b.days} 日・維持費 ${money(b.upkeep)}/月`, `${b.days} days · upkeep ${money(b.upkeep)}/mo`)));
      if (err === 'money') c.append(h('small', 'isl-bad', t(`あと ${money(b.cost - s.money)} 足りない`, `${money(b.cost - s.money)} short`)));
      c.addEventListener('click', () => {
        const e = canBuild(s, id);
        if (e) {
          sfx.play('error');
          toast(errOf(id, e));
          return;
        }
        closeSheet();
        selected = null;
        const sp = guideId === id ? tutSpot(s, id) : null;
        const at = sp ? ([sp[0], sp[1]] as [number, number]) : (buildAt ?? undefined);
        buildAt = null;
        startPlacing(id, { at, dir: sp?.[2] });
        // チュートリアル：建ててもらう場所を大きく
        if (sp) tween = { x0: cam.x, y0: cam.y, x1: (sp[0] - sp[1]) * 100, y1: (sp[0] + sp[1]) * 55, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 0.6 : 0.85, dur: 700 };
      });
      grid.append(c);
    }
    body.append(grid);
  });
}

const ignoreOf = () => placing?.move;
/** 置こうとしているマスで、入口を道路に向けられる向きにそろえる */
function fitDir() {
  if (!placing) return;
  const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
  if (ok.length && !ok.includes(placing.dir)) placing.dir = ok[0];
}
/** チュートリアルで建ててもらう場所（建築で光らせている建物を置くときだけ） */
function tutSpotNow(): [number, number, Dir] | null {
  if (!placing || placing.move != null) return null;
  const st = tutStep();
  return st?.card === placing.id ? tutSpot(s, placing.id) : null;
}
const placeErr = (): PlaceErr | 'spot' | null => {
  if (!placing) return null;
  const e = placing.move != null ? canMoveTo(s, placing.move, placing.i, placing.j, placing.dir) : canPlaceAt(s, placing.id, placing.i, placing.j, placing.dir);
  if (e) return e;
  const sp = tutSpotNow();
  return sp && (sp[0] !== placing.i || sp[1] !== placing.j) ? 'spot' : null;
};

// 置くときの画面：右上に「選択中」と戻る、建物のそばに理由・建てる・回す
const selBox = h('div', 'isl-selbox');
const ghostUi = h('div', 'isl-ghost-ui');
const placeBox = h('div', 'isl-place');
placeBox.hidden = true;

/** 置けるマス（置くときだけ。地図のほかのマスは暗くする） */
let placeCache: { key: string; set: Set<number> } | null = null;
function placeable(): Set<number> | null {
  if (!placing) return null;
  const key = `${placing.id}:${placing.move ?? ''}:${s.buildings.length}:${s.nextUid}`;
  if (placeCache?.key === key) return placeCache.set;
  const set = new Set<number>();
  for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (allowedDirs(s, placing.id, i, j, placing.move).length) set.add(j * s.n + i);
  placeCache = { key, set };
  return set;
}

/** 画面の真ん中のマス */
const centerCell = () => pick(cam, W, H, W / 2, H / 2);

/** 置くモードを始める（at があればそのマスへ） */
function startPlacing(id: string, opts: { move?: number; at?: [number, number]; dir?: Dir } = {}) {
  closePop();
  menu = null;
  sub = null;
  const [i, j] = opts.at ?? centerCell();
  placing = { id, dir: opts.dir ?? 'rd', i, j, move: opts.move };
  fitDir();
  if (opts.at) tweenTo(i, j);
  sfx.play('move');
  renderAll();
}

/** 置く建物を (i, j) へ。マスが変わったら音を鳴らす */
function setGhost(i: number, j: number) {
  if (!placing || (placing.i === i && placing.j === j)) return;
  placing.i = i;
  placing.j = j;
  fitDir();
  sfx.play('move');
  renderPlace();
}

/** マスを画面の真ん中へ動かす */
function tweenTo(i: number, j: number) {
  tween = { x0: cam.x, y0: cam.y, x1: (i - j) * 100, y1: (i + j) * 55, t0: performance.now() };
}

/** 置けない理由（短く。地図の建物のそばに出す） */
function reasonOf(err: PlaceErr | 'spot' | null): string {
  if (!err || !placing) return '';
  if (err === 'spot') return t('光っている場所に建ててみて！', 'Build on the glowing spot!');
  if (err === 'ground') {
    const onRoad = cells(DEF[placing.id], placing.i, placing.j, placing.dir).some(([x, y]) => ground(s, x, y) === 'road');
    return onRoad ? t('道路には置けません', 'Not on a road') : t('ここには置けません', 'Can’t build here');
  }
  if (err === 'taken') return t('建物があります', 'Already built on');
  if (err === 'waste') return t('荒れ地は掘りきるまで建てられません', 'Not until the wasteland is dug out');
  if (err === 'revive') return t('復興した土地にだけ建てられます', 'Revived land only');
  if (err === 'road') return t('道路に面していません', 'Doesn’t face a road');
  if (err === 'money') return t('資金が足りません', 'Not enough funds');
  return ERR[err];
}

function tryPlace() {
  if (!placing) return;
  const err = placeErr();
  if (err) {
    sfx.play('error');
    // 荒れ地：なぜ建てられないか、いつ建てられるかを一言で
    if (err === 'waste') toast(ERR.waste);
    return;
  }
  const name = DEF[placing.id].name;
  if (placing.move != null) {
    const e = relocate(s, placing.move, placing.i, placing.j, placing.dir);
    if (e) toast(ERR[e]);
    else {
      toast(t(`${name}の移転を始めました`, `Moving ${name}`));
      placing = null;
      save();
    }
  } else {
    const r = build(s, placing.id, placing.i, placing.j, placing.dir);
    if (typeof r === 'string') toast(errOf(placing.id, r));
    else {
      toast(t(`${name}の工事を始めました（${P1B[placing.id].days} 日）`, `Started building: ${name} (${P1B[placing.id].days} days)`));
      // お金が減るときは資金の演出で同じ音が鳴る。無料（工房）のときだけここで鳴らす
      if (!P1B[placing.id].cost) sfx.play('place');
      else setTimeout(() => sfx.play('place'), 120);
      placing = null;
      menu = null;
      sub = null;
      save();
    }
  }
  renderAll();
}
function renderPlace() {
  dirty = true;
  root.classList.toggle('is-placing', !!placing);
  canvas.classList.toggle('is-placing', !!placing);
  selBox.hidden = !placing;
  ghostUi.hidden = !placing;
  if (!placing) return;
  const moving = placing.move != null;
  const name = DEF[placing.id].name;
  selBox.replaceChildren(
    h('div', 'isl-sel-name', moving ? t(`移転：${name}`, `Moving: ${name}`) : t(`選択中：${name}`, `Selected: ${name}`)),
    btn(t('戻る', 'Back'), () => {
      const was = placing;
      placing = null;
      // 建築から来たときは建物の一覧へ戻る
      if (was && was.move == null) return openBuildTab();
      renderAll();
    }),
  );
  const err = placeErr();
  const dirs = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
  const row = h('div', 'isl-row');
  if (err) row.append(h('span', 'isl-reason', reasonOf(err)));
  else {
    const cost = moving ? moveCost(s.buildings.find((b) => b.uid === placing!.move)!) : P1B[placing.id].cost;
    row.append(btn(moving ? t(`ここへ移転 ${money(cost)}`, `Move here ${money(cost)}`) : cost ? t(`建てる ${money(cost)}`, `Build ${money(cost)}`) : t('建てる', 'Build'), tryPlace, 'is-on'));
  }
  if (dirs.length > 1)
    row.append(
      btn('↻', () => {
        if (!placing) return;
        const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
        if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
        sfx.play('move', 0.7);
        renderPlace();
      }, 'isl-rot'),
    );
  ghostUi.classList.toggle('is-bad', !!err);
  ghostUi.replaceChildren(...siteCard(placing.id, placing.i, placing.j, placing.dir, placing.move), row);
  placeGhostUi();
}

/**
 * 出店の下見：お店なら、ここでの見込み（月に何個）・他社と自社のお店から取る数・近くの家・工房からの日数。
 * 物流拠点なら、お店ごとの片道の日数がどう縮むか。
 */
function siteCard(id: string, i: number, j: number, dir: Dir, move?: number): HTMLElement[] {
  const kind = P1B[id]?.kind;
  if (kind === 'shop') {
    // 移転の下見は、いまのお店を外して考える
    const self = move != null ? s.buildings.find((b) => b.uid === move) : null;
    const saved = self ? s.buildings.splice(s.buildings.indexOf(self), 1) : [];
    const info = siteInfo(s, id, i, j, dir);
    if (saved.length) s.buildings.push(...saved);
    if (!info) return [];
    const c = h('div', 'isl-site');
    // チュートリアル：お店の場所の選び方を一言
    const say = tutStep()?.tips?.place?.(s);
    if (say) {
      const p = h('p', 'isl-site-tip');
      p.append(rich(say));
      c.append(p);
    }
    const name = PRODUCT[info.key]?.name ?? info.key;
    const head = h('div', 'isl-site-head');
    head.append(h('small', '', t(`${name}の見込み`, `${name} forecast`)), h('b', '', t(`月 ${Math.round(info.units)} 個`, `${Math.round(info.units)}/mo`)));
    c.append(head);
    const rows = h('div', 'isl-site-rows');
    const row = (label: string, v: string, cls = '') => {
      const r = h('div', `isl-site-row ${cls}`);
      r.append(h('span', '', label), h('b', '', v));
      rows.append(r);
    };
    row(t('近くの家', 'Homes nearby'), t(`${info.homes} 軒`, `${info.homes}`));
    // 営業の立地調査（Rare の町）：この店の商圏の取り分の予測
    if (s.area && surveyed(s) && info.share != null) row(t('商圏の取り分（予測）', 'Trade-area share (forecast)'), `${Math.round(info.share * 1000) / 10}%`, 'is-good');
    if (info.fromRivals >= 0.5) row(t('他社から奪う', 'Taken from rivals'), t(`${info.fromRivals.toFixed(1)} 個`, `${info.fromRivals.toFixed(1)}`), 'is-good');
    if (info.rivals) row(t('近くの競合', 'Rivals nearby'), t(`${info.rivals} 社`, `${info.rivals}`), 'is-warn');
    if (info.fromMine >= 0.5) row(t('自社の店と取り合い', 'Cannibalized'), t(`−${info.fromMine.toFixed(1)} 個`, `−${info.fromMine.toFixed(1)}`), 'is-bad');
    row(t('工房から', 'From workshop'), info.days < 0.5 ? t('すぐ近く', 'Right nearby') : t(`片道 ${info.days.toFixed(1)} 日`, `${info.days.toFixed(1)} d one way`), info.days > 2.5 ? 'is-warn' : '');
    c.append(rows);
    return [c];
  }
  if (kind === 'depot') {
    const list = depotInfo(s, i, j, dir);
    const c = h('div', 'isl-site');
    const head = h('div', 'isl-site-head');
    head.append(h('small', '', t('お店までの片道', 'One way to shops')));
    c.append(head);
    const rows = h('div', 'isl-site-rows');
    if (!list.length) rows.append(h('small', 'isl-dim', t('お店がまだありません', 'No shops yet')));
    for (const x of list) {
      const r = h('div', `isl-site-row ${x.after < x.before - 0.05 ? 'is-good' : ''}`);
      r.append(h('span', '', DEF[x.shop.id].name), h('b', '', x.after < x.before - 0.05 ? t(`${x.before.toFixed(1)} → ${x.after.toFixed(1)} 日`, `${x.before.toFixed(1)} → ${x.after.toFixed(1)} d`) : t(`${x.before.toFixed(1)} 日（変わらない）`, `${x.before.toFixed(1)} d (no change)`)));
      rows.append(r);
    }
    c.append(rows);
    return [c];
  }
  return [];
}

/** 理由・建てるボタンを、置く建物の真下に */
function placeGhostUi() {
  if (!placing || ghostUi.hidden) return;
  const sx = ((placing.i - placing.j) * 100 - cam.x) * cam.zoom + W / 2;
  const sy = ((placing.i + placing.j) * 55 - cam.y) * cam.zoom + H / 2;
  ghostUi.style.left = `${Math.round(sx)}px`;
  ghostUi.style.top = `${Math.round(sy + 60 * cam.zoom + 8)}px`;
}

// ---------------------------------------------------------------- マスの吹き出し

const popEl = h('div', 'isl-pop');
const popHead = h('div', 'isl-pop-head');
const popTitle = h('h3');
const popBody = h('div', 'isl-pop-scroll');
const popTail = h('i', 'isl-pop-tail');
popHead.append(popTitle, btn('✕', () => closePop()));
popEl.append(popTail, popHead, popBody);
popEl.hidden = true;
popEl.addEventListener('pointerdown', (e) => e.stopPropagation());

function openPop(i: number, j: number) {
  // 発掘作業のあいだは、地図の吹き出しを出さない（発掘に集中）
  if (s.digRun) return busyDig();
  closeDig();
  pop = [i, j];
  popSector = null;
  menu = null;
  sub = null;
  placing = null;
  const b = occupant(s, i, j);
  selected = b ? b.uid : null;
  // チュートリアル：地図のお店をタップした
  if (b && b.owner === 'me' && P1B[b.id]?.kind === 'shop') tutSeen.add('shopPop');
  renderPop();
  centerOn(b ? b.i : i, b ? b.j : j);
}
function closePop() {
  if (!pop) return;
  pop = null;
  popSector = null;
  selected = null;
  popEl.hidden = true;
  dirty = true;
}
function renderPop() {
  if (!pop) return;
  // 撤去・移転で建物がなくなったら、いまのマスで作り直す
  if (selected != null && !s.buildings.some((b) => b.uid === selected)) selected = null;
  const y = popBody.scrollTop;
  const { title, body } = popSector ? sectorPop(popSector) : tileContent(ctx, pop[0], pop[1], {
    move: (uid) => {
      const b = s.buildings.find((x) => x.uid === uid);
      if (!b) return;
      startPlacing(b.id, { move: uid, at: [b.i, b.j], dir: b.dir });
    },
    buildHere: (i, j) => {
      closePop();
      buildAt = [i, j];
      openBuildTab();
    },
    close: () => closePop(),
    redraw: () => renderPop(),
    gate: () => payGate(),
    land: () => (closePop(), openLand(ctx)),
    dig: (k) => startDig(k),
    permit: (k) => askPermit(k),
    notes: () => (closePop(), openNotes(ctx)),
    present: () => startPresent(),
    museum: () => (closePop(), openMuseum(ctx)),
    // 段 H2：他社の店の「買収の打診」（Epic の町）
    ma: (rid) => {
      closePop();
      const d = startDeal(s, rid);
      if (typeof d !== 'string') toast(t(`🤝 買収を打診した（返事は数日後）`, `🤝 Acquisition approach sent (reply in a few days)`));
      save();
      openLegalScreen('ma', rid);
    },
  });
  popTitle.textContent = title;
  popBody.replaceChildren(body);
  popBody.scrollTop = y;
  popEl.hidden = false;
  placePop();
  dirty = true;
}
// 発掘作業のあいだに開けるのは研究ノートだけ（時間は流れたまま）
setOpenGuard((title) => {
  if (!s.digRun || title === t('研究ノート', 'Research notebook')) return true;
  busyDig();
  return false;
});
/** 発掘作業のあいだに、ほかの操作をしようとした */
function busyDig() {
  sfx.play('error');
  toast(t('発掘中はあとで（「発掘を終える」で町に戻る）', 'Not while digging (press “Stop digging” to return)'));
}

/** 荒れ地 k のまんなか（マスの座標） */
function wasteMid(k: number): [number, number] | null {
  if (k === DUNGEON) k = s.dig?.dungeon?.site ?? -1;
  const sp = wasteSpots(s.sector ?? 'c1')[k];
  return sp ? [sp[0] + 0.5, sp[1] + 0.5] : null;
}
/** 荒れ地 k へカメラを寄せる */
function focusWaste(k: number) {
  const m = wasteMid(k);
  if (!m) return;
  tween = { x0: cam.x, y0: cam.y, x1: (m[0] - m[1]) * 100, y1: (m[0] + m[1]) * 55, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 0.75 : 1, dur: 800 };
}
/** 発掘許可を申請する（荒れ地の吹き出し）：許可が下りたら判子がポンと押される */
function askPermit(k: number) {
  const r = applyPermit(s, k);
  if (typeof r === 'string') {
    sfx.play('error');
    if (r === 'money') toast(t('申請料が足りません', 'Not enough funds for the fee'));
    return;
  }
  save();
  renderPop();
  sfx.play('check');
  const st = h('div', 'isl-stamp');
  st.append(h('b', '', t('許可', 'OK')), h('small', '', t('Lime 国', 'Lime')));
  popEl.append(st);
  setTimeout(() => st.remove(), 1500);
  setTimeout(() => sfx.play('win', 0.6), 380);
  toast(t(`${wasteName(s.sector ?? 'c1', k)}の発掘許可が下りた！`, `Dig permit granted for the ${wasteName(s.sector ?? 'c1', k)}!`));
  renderAll();
}

/**
 * 発掘作業を始める（荒れ地の吹き出しの「⛏ 発掘する（15 秒）」）。時間は止めない（止まっていたら 1 倍で流す。月末ポーズからなら次の月へ）。
 * 作業のあいだは月の締めがあっても月末ポーズと月次報告を出さず、作業のあとにまとめ報告（finishDig）
 */
function startDig(k: number) {
  const wasPause = !!s.monthPause;
  const r = startRun(s, k);
  if (typeof r === 'string') {
    sfx.play('error');
    if (r === 'no-permit') toast(t('この荒れ地は、まだ発掘許可がありません', 'No dig permit for this wasteland yet'));
    else if (r === 'done') toast(t('この荒れ地は掘りきった', 'This wasteland is fully dug'));
    else if (r === 'no-site' && k === DUNGEON) toast(t('このセクタには、まだダンジョンが見つかっていない', 'No dungeon found in this sector yet'));
    else if (r === 'deep') toast(t('ここから下は深い層の許可が要る（スキル → 発掘の「深い層の許可」）', 'Deeper layers need a permit (Skills → Digging: Deep-layer permit)'));
    return;
  }
  const note = wasPause ? t('発掘を始めたので、次の月が始まったよ', 'Digging started the next month') : undefined;
  if (speed === 0) speed = 1;
  // 発掘との出会いの最初の 1 回は 1 倍で（はじめての 15 秒を落ち着いて）
  if (s.flags.digMeet === 'tap') {
    s.flags.digMeet = 'open';
    speed = 1;
  }
  save();
  closePop();
  closeSheet();
  menu = null;
  sub = null;
  placing = null;
  sfx.play('dig');
  // BGM：町の曲をフェードアウト → 発掘の曲（MCH の land）
  sound.fadeBgm('bgmDig');
  openDigPanel(note);
}
/** 発掘画面（全画面）を開く。開いているあいだは町を描かない（ゲームの計算は進める）。閉じたら町の描画と BGM を戻す */
function openDigPanel(note?: string) {
  openDig(
    ctx,
    {
      end: () => finishDig(),
      closed: () => {
        sound.fadeBgm('bgmCraft');
        flushToasts();
        renderAll();
        // 町に戻ったら：復興（土 → 草地）・ダンジョンの入り口が見つかった演出
        setTimeout(() => townFxNow(), 380);
      },
      hit: (hits) => digHit(hits),
      make: (key) => makeRelic(key),
      // 発掘との出会いの最初の 1 回は、時間切れの「発掘終了」を見せる
      noEnd: () => s.flags.digMeet === 'open',
      meetFirst: () => s.flags.digMeet === 'open' && !!s.digRun,
      // 発掘終了の札の「次の強化のおすすめ」・作業の外の「🔒」：スキルツリーのそのパネルへ（出会いの途中は、出会いの流れを優先）
      skill: s.flags.digMeet === 'done' ? (id) => openSkills(ctx, id) : undefined,
      deepTip: () => {
        if (s.flags.digDeepTip) return false;
        s.flags.digDeepTip = true;
        save();
        return true;
      },
      // 初めてひびの隙間から何か見えた（1 回だけ。出会いの最初の作業では、壁の掘り方の一言を閉じたあとに）
      peekTip: () => {
        if (s.flags.digPeekTip) return false;
        s.flags.digPeekTip = true;
        save();
        return true;
      },
      // 再発掘で初めて RP が入った（1 回だけ。発掘 v2 の 7 段目）
      againTip: () => {
        if (s.flags.redigTalk) return false;
        s.flags.redigTalk = true;
        save();
        return true;
      },
    },
    note,
  );
  renderAll();
}
/** 発掘画面のあいだに来たお知らせを出す */
function flushToasts() {
  const xs = heldToasts;
  heldToasts = [];
  for (const [text, img] of xs) toast(text, img);
}
/** 打った：荒れ地を掘りきったら、作業を終える */
function digHit(hits: DigHit[]) {
  const all = hits.flatMap((x) => [x, ...(x.extra ?? [])]);
  if (!all.some((x) => x.done)) return;
  if (s.digRun?.site === DUNGEON) toast(t('ダンジョンの壁を掘りきった！', 'You dug out the whole dungeon wall!'));
  else if (all.some((x) => x.dungeon)) toast(t('この荒れ地は掘りきった！ 底にダンジョンの入り口が…！', 'This wasteland is fully dug! A dungeon entrance lies beneath…!'));
  else toast(t('この荒れ地は掘りきった！ 町に戻ると復興するよ', 'This wasteland is fully dug! It will be revived back in town'));
  sfx.play('win');
  finishDig();
}

// ---------------------------------------------------------------- 復興・ダンジョンの入り口（町に戻ったあとの演出。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）

/** 町に戻ったら出す演出（発掘作業で荒れ地を掘りきった） */
let townFx: { kind: 'revive' | 'dungeon'; site: number; homes: number }[] = [];
let townFxTries = 0;
/** 町に戻ったあと、会話・画面が閉じてから：カメラを荒れ地へ寄せて、土が草地に変わる（ダンジョンは入り口が現れる）→ トースト → マインちゃん（1 回目だけ） */
function townFxNow() {
  if (!townFx.length) return;
  if (!calm()) {
    // まとめ報告・会話のあと（待ちすぎたら、そのまま出す）
    if (townFxTries++ < 120) setTimeout(() => townFxNow(), 500);
    return;
  }
  townFxTries = 0;
  const fx0 = townFx.shift()!;
  focusWaste(fx0.site);
  anim.revive = { site: fx0.site, t0: performance.now() };
  wasteFx(fx0.kind, fx0.site);
  sfx.play(fx0.kind === 'dungeon' ? 'mining' : 'levelup');
  const name = wasteName(s.sector ?? 'c1', fx0.site);
  setTimeout(() => {
    if (fx0.kind === 'dungeon') toast(t(`⛏ ${name}の底に、ダンジョンの入り口が見つかった！`, `⛏ A dungeon entrance beneath the ${name}!`));
    else toast(t(`🌱 ${name}が復興した！ 住民が増えた（家 +${fx0.homes}）`, `🌱 The ${name} is revived! More residents (homes +${fx0.homes})`));
    sfx.play('win', 0.7);
  }, 1500);
  setTimeout(() => {
    if (anim.revive?.site === fx0.site) anim.revive = null;
    const next = () => {
      if (townFx.length) townFxNow();
      else museumTalkOnce();
    };
    if (fx0.kind === 'revive' && !s.flags.reviveTalk) {
      s.flags.reviveTalk = true;
      save();
      talk([{ text: REVIVE_LINE() }], t('わかった', 'Got it'), next);
    } else if (fx0.kind === 'dungeon' && !s.flags.dungeonTalk) {
      s.flags.dungeonTalk = true;
      save();
      talk([{ text: DUNGEON_LINE() }], t('わかった', 'Got it'), next);
    } else next();
    renderAll();
  }, 2900);
  renderAll();
}
/** 地図の上の点（ワールドの座標）に付いて動く効果（pixelfx。docs/ISLAND_FX.md）。縮小の全体表示・発掘のあいだは隠す */
function mapFx(id: FxId, wx: number, wy: number, o: Parameters<typeof playFx>[3] = {}) {
  return playFx(id, 0, 0, {
    layer: 'map',
    anchor: () => (digOpen() || overviewOn() ? null : { x: (wx - cam.x) * cam.zoom + W / 2, y: (wy - cam.y) * cam.zoom + H / 2 }),
    ...o,
  });
}
/**
 * 段 FX2：復興（土 → 草地）は芽が出て花が開く（healing-bloom。まんなかと左右に 3 つ）、ダンジョンの入り口は土ぼこりと岩（summon-rise。門の下）。
 * いまの canvas の演出（reviveGround・dungeonGate）に重ねるだけ。カメラが寄ったあとの拡大率で大きさを決める（focusWaste と同じ）
 */
function wasteFx(kind: 'revive' | 'dungeon', site: number) {
  const m = wasteMid(site);
  if (!m) return;
  const wx = (m[0] - m[1]) * 100;
  const wy = (m[0] + m[1]) * 55;
  const z = innerWidth < 600 ? 0.75 : 1;
  if (kind === 'dungeon') {
    mapFx('summon-rise', wx, wy + 20, { scale: z * 2, palette: FX_PAL.gold, opts: { beast: false, dust: true, stone: FX_PAL.dust }, seed: site + 3 });
    return;
  }
  const bloom = { palette: FX_PAL.leaf, opts: { petal: FX_PAL.petal, heart: FX_PAL.heart } };
  mapFx('healing-bloom', wx, wy + 30, { ...bloom, scale: z * 3, delay: 400, seed: site + 1 });
  // スマホは 1 つ（重さ）
  if (innerWidth >= 600) {
    mapFx('healing-bloom', wx - 120, wy + 10, { ...bloom, scale: z * 2, delay: 750, seed: site + 5 });
    mapFx('healing-bloom', wx + 120, wy + 14, { ...bloom, scale: z * 2, delay: 1050, seed: site + 9 });
  }
}
/** 遺物の展示館を建てられるようになったとき（1 回だけ）：マインちゃん → 建築の「遺物」 */
function museumTalkOnce() {
  if (s.flags.museumTalk || s.museum?.at || !buildCatOpen(s, 'relic') || !calm()) return;
  s.flags.museumTalk = true;
  save();
  talk([{ text: MUSEUM_LINE() }], t('建築を開く', 'Open Build'), () => {
    buildCat = 'relic';
    openBuildTab();
  });
}
/** 発掘作業のあいだに締めた月のトースト（他社のニュース・会社の締め）。作業のあとにまとめて出す */
let heldNews: (() => void)[] = [];
function flushHeld() {
  const xs = heldNews;
  heldNews = [];
  for (const f of xs) f();
}
/** 発掘作業を終える（時間切れ・「発掘を終える」）：発掘終了の札 → 月をまたいでいたらまとめ報告 → 月末ポーズを 1 回 */
function finishDig() {
  const end = endRun(s);
  if (!end) return;
  // 掘りきった荒れ地：町に戻ったら、復興・ダンジョンの入り口の演出
  if (end.revived) townFx.push({ kind: 'revive', site: end.revived.site, homes: end.revived.homes });
  if (end.found != null) townFx.push({ kind: 'dungeon', site: end.found, homes: 0 });
  save();
  // 研究ノートを開いていたら閉じて、パネルに戻して札を見せる
  if (sheetOpen()) closeSheet();
  if (!digOpen()) openDigPanel();
  const meetFirst = s.flags.digMeet === 'open';
  showEndCard(end, {
    then: end.crossed ? () => showDigSummary(end) : undefined,
    again: meetFirst ? undefined : () => startDig(end.site),
    after: () => {
      flushHeld();
      if (meetFirst) meetAfterDig();
      else relicTalkOnce(end);
    },
  });
  renderAll();
}
/** まとめ報告 1 枚（作業のあいだに締めた月）。閉じたら月末ポーズ（「次の月へ」を押すまで止まる。endRun で monthPause） */
function showDigSummary(end: RunEnd) {
  speed = 0;
  closePop();
  const sum = digSummary(s, end.held, end.got);
  let detail = false;
  const after = () => {
    flushHeld();
    afterReport();
    if (s.flags.digMeet === 'open') meetAfterDig();
    else relicTalkOnce(end);
    renderAll();
  };
  openDigSummary(
    ctx,
    sum,
    {
      detail: () => {
        detail = true;
        openMonthReport(ctx, sum.latest, reportHooks(), after);
      },
      openNotes: () => openNotes(ctx),
      sfx: (k) => sfx.play(k),
    },
    () => {
      if (!detail) after();
    },
  );
}

// ---------------------------------------------------------------- 発掘との出会い・町の長と研究成果の発表（digmeet.ts）

/** 操作がないまま進んだ日数（出会いの「初めて手が空いたとき」。押す・キーで 0 に戻る） */
let idleDays = 0;
addEventListener('pointerdown', () => (idleDays = 0), true);
addEventListener('keydown', () => (idleDays = 0), true);
addEventListener('wheel', () => (idleDays = 0), { capture: true, passive: true });
/** 出会いの演出の途中（荒れ地の上の 📜 と手紙の音 → 会話） */
let meetPing = false;
/** 出会いで光らせる荒れ地（1 か所目） */
const meetSite = () => (s.dig ? firstSite(s) : -1);

/** 会話も画面も開いていない（出会い・発表の演出を割り込ませてよい） */
const calm = () => !s.digRun && !pop && !placing && !tour && !menu && !sheetOpen() && !digOpen() && !moving && !root.querySelector('.isl-modal, .isl-rp-reveal, .isl-picker');

/**
 * 2 か月目の途中、初めて手が空いたとき：国の役所からの手紙（荒れ地の上に 📜 と音）→ 会話（セリフ 1〜3）→
 * 1 か所目の荒れ地（発掘許可は手紙で済ませる）をタップしてもらう
 */
function checkMeet() {
  if (meetPing || !calm() || !meetReady(s, idleDays)) return;
  meetPing = true;
  const k = grantFirst(s);
  save();
  focusWaste(k);
  // スマホは右上のミッションと重ならないよう、荒れ地を少し下寄りに（下のマインちゃんの一言には隠れない程度）
  if (tween && innerWidth < 600 && tween.z1) tween.y1 -= 70 / tween.z1;
  sfx.play('page');
  setTimeout(() => sfx.play('check', 0.8), 420);
  renderAll();
  // 手紙を見てもらってから、会話（会話のあいだは時間が止まる）
  setTimeout(() => {
    talk(
      MEET_LINES().map((text) => ({ text })),
      t('わかった', 'Got it'),
      () => {
        meetPing = false;
        s.flags.digMeet = 'tap';
        save();
        renderAll();
      },
    );
  }, 1600);
}

/** 最初の発掘作業が終わった（発掘終了の札のあと）：セリフ 4（スキルツリーの研究パネルへ） */
/** 復刻品を工房で作る（発掘終了の札・マインちゃんの会話）：発掘のパネルを閉じて、市場データの「工房で作る」と同じ動き */
function makeRelic(key: string) {
  if (digOpen()) closeDig();
  makeInWorkshop(ctx, key, t('新しいレシピ', 'New recipe'));
}
/** 初めて復刻品のレシピが開いたあと（1 回だけ）のマインちゃん：独占のうちに売り込もう（ボタン「工房で作る」） */
function relicTalkOnce(end: RunEnd) {
  if (s.flags.relicTalk) return;
  const key = end.got.recipes?.[0] ?? openRelics(s)[0]?.key;
  const p = key ? PRODUCT[key] : undefined;
  if (!key || !p?.relic) return;
  s.flags.relicTalk = true;
  save();
  const ext = p.relic.ext;
  talk(
    [{ text: RELIC_LINE(), el: () => extIcon(ext, 64) }],
    t('工房で作る', 'Make it'),
    () => makeRelic(key),
  );
}
function meetAfterDig() {
  if (s.flags.digMeet !== 'open') return;
  talk([{ text: MEET_FOUND() }], t('わかった', 'Got it'), () => {
    s.flags.digMeet = 'skill';
    save();
    closeDig();
    renderAll();
  });
}

/** 地図の上の印：荒れ地の上の 📜（手紙）・👆（タップしてもらう）と、町の長の家の上の顔（発表できるときは吹き出し「研究成果を発表する」） */
const meetEl = h('button', 'isl-meet');
meetEl.type = 'button';
meetEl.hidden = true;
const meetIcon = h('span', 'isl-meet-pick', '📜');
const meetSay = h('b', 'isl-meet-say', t('国の役所から手紙！', 'A letter from the office!'));
meetEl.append(meetIcon, meetSay);
meetEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const sp = wasteSpots(s.sector ?? 'c1')[meetSite()];
  if (sp && (s.flags.digMeet === 'tap' || s.flags.digMeet === 'open') && !s.digRun) openPop(sp[0], sp[1]);
});
const chiefEl = h('div', 'isl-chief');
chiefEl.hidden = true;
let chiefKey = '';
function updateMarks() {
  const busy = !!placing || !!tour || overviewOn() || tutOf(s) < TUT_DONE;
  const tapping = (s.flags.digMeet === 'tap' || s.flags.digMeet === 'open') && !s.digRun && !digOpen();
  const m = s.dig ? wasteMid(meetSite()) : null;
  const showMeet = !busy && !!m && (meetPing || (tapping && !pop)) && !sheetOpen();
  meetEl.hidden = !showMeet;
  if (showMeet && m) {
    const ping = meetPing;
    meetEl.classList.toggle('is-tap', !ping);
    const ic = ping ? '📜' : '👆';
    if (meetIcon.textContent !== ic) meetIcon.textContent = ic;
    const say = ping ? t('国の役所から手紙！', 'A letter from the office!') : t('タップ！', 'Tap!');
    if (meetSay.textContent !== say) meetSay.textContent = say;
    const p = toScreen(m[0], m[1]);
    meetEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 60 * cam.zoom)}px) translate(-50%, -100%)`;
  }
  anim.wasteGlow = !busy && tapping ? meetSite() : null;
  const home = digMet(s) ? chiefHome(s) : null;
  const chief = s.dig ? chiefOf(s.dig.sector) : null;
  const showChief = !busy && !!home && chief != null && !sheetOpen() && !s.digRun && !(pop && home && pop[0] === home.i && pop[1] === home.j);
  chiefEl.hidden = !showChief;
  if (!showChief || !home || chief == null) return;
  const ready = canPresent(s);
  const key = `${chief}|${ready}|${isEn}`;
  if (key !== chiefKey) {
    chiefKey = key;
    const face = h('button', 'isl-chief-face');
    face.type = 'button';
    face.append(heroIcon(chief, 32), h('small', '', t('町の長', 'Head')));
    face.title = t(`町の長 ${heroName(chief)}の家`, `Home of town head ${heroName(chief)}`);
    face.addEventListener('click', (e) => {
      e.stopPropagation();
      openPop(home.i, home.j);
    });
    chiefEl.replaceChildren(face);
    if (ready) {
      const b = btn(t('📜 研究成果を発表する', '📜 Present findings'), () => startPresent(), 'is-on is-guide isl-chief-go');
      chiefEl.prepend(b);
    }
  }
  const p = toScreen(home.i, home.j);
  chiefEl.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y - 120 * cam.zoom)}px) translate(-50%, -100%)`;
}

/** 研究成果の発表：マインちゃんと町の長の会話（3 枚）→ RP（present）→ 調査依頼状を受け取る演出（4 枚目） */
function startPresent() {
  if (!canPresent(s) || !s.dig) return;
  const sector = s.dig.sector;
  const chief = chiefOf(sector);
  closePop();
  closeDig();
  const home = chiefHome(s);
  if (home) centerOn(home.i, home.j);
  const fresh = letterToGet(s);
  const left = lettersLeft(s);
  const pages: TutPage[] = presentPages(s).map((pg, k) => ({ text: pg.text, who: pg.who ?? undefined, role: pg.who != null ? t('町の長', 'Town head') : undefined, el: k === 0 ? () => topicsEl(sector) : undefined }));
  talk(pages, t('受け取る', 'Accept'), () => {
    const r = present(s);
    if (typeof r === 'string') return;
    save();
    showLetter(r.rp, r.letter ?? fresh, chief, left, r.conquered);
    renderAll();
  });
}

/**
 * 調査依頼状（と RP）を受け取る演出。left：依頼状まで残りの発表の数（Common の 1 つ目の発表）。
 * conquered：この発表で制覇した（1 位を 2 か月続けていた）→ 👑 の帯とファンファーレ、閉じたら「フェーズ 1 クリア！」（初めての制覇）
 */
function showLetter(rp: number, letter: Tier | null, chief: number | null, left = 0, conquered = false) {
  sfx.play('mining');
  setTimeout(() => sfx.play(conquered ? 'clear' : 'win'), 500);
  const body = h('div', 'isl-letter');
  const card = h('div', 'isl-letter-card');
  const rays = h('div', 'isl-letter-rays');
  card.append(rays);
  if (conquered) {
    const name = sectorDef(s.sector ?? 'c1').name;
    const crown = h('div', 'isl-letter-crown');
    crown.append(h('b', '', t(`👑 ${name}を制覇！`, `👑 ${name} conquered!`)), h('small', '', t('2 か月続けて 1 位 ✔／研究成果の発表 ✔', '#1 two months running ✔ / findings presented ✔')));
    card.append(crown);
  }
  if (letter) {
    // 調査依頼状の仮の絵：MCH のエクステ「スクロール」（Uncommon）・「エリートスクロール」（Rare）・「ウィズダムスクロール」（Epic）・「大唐西域記」（Legendary。段 H1）。docs/ISLAND_ART_TODO.md
    const icon = letter === 'U' ? 1016 : letter === 'R' ? 2016 : letter === 'E' ? 3016 : 5016;
    card.append(extIcon(icon, 128), h('b', 'isl-letter-name', t(`${TIER_NAME[letter]} の調査依頼状`, `${TIER_NAME[letter]} survey request`)));
    if (chief != null) card.append(h('small', 'isl-dim', t(`町の長 ${heroName(chief)}より`, `From town head ${heroName(chief)}`)));
  }
  card.append(h('span', 'isl-letter-rp', t(`研究ポイント +${rp}`, `Research points +${rp}`)));
  const say = h('p', 'isl-letter-say');
  say.append(rich(presentAfter(letter, left, conquered, sectorDef(s.sector ?? 'c1').tier)));
  body.append(card, say);
  // 制覇したら、閉じたあとに初めての制覇のお祝い（フェーズ 1 クリア！）
  const then = (f: () => void) => () => {
    if (conquered && s.cleared && !s.flags.clearSeen) clearModal();
    else f();
  };
  modal(
    conquered ? t('👑 研究成果を発表して制覇！', '👑 Findings presented — sector conquered!') : letter ? t('📜 調査依頼状を受け取った！', '📜 Survey request received!') : t('研究成果を発表した！', 'Findings presented!'),
    body,
    letter === 'U' || letter === 'R' || letter === 'E' ? [[t('ランドマップを見る', 'Open land map'), then(() => openLand(ctx)), 'is-on'], [t('続ける', 'Keep going'), then(() => renderAll())]] : [[t('スキルツリーを開く', 'Open skills'), then(() => openSkills(ctx)), 'is-on'], [t('続ける', 'Keep going'), then(() => renderAll())]],
    true,
  );
  root.querySelector('.isl-modal:last-of-type')?.classList.add('is-letter');
  letterFx(conquered);
}
/** 発表・制覇の花火（pixelfx）：手紙のまわりに 2 発（制覇は金の 3 発目と紙吹雪）。重ねるだけ・押せば消える */
function letterFx(conquered: boolean) {
  const card = root.querySelector('.isl-modal:last-of-type .isl-letter-card');
  const r = card?.getBoundingClientRect();
  const cx = r ? r.left + r.width / 2 : innerWidth / 2;
  const cy = r ? r.top + r.height * 0.3 : innerHeight * 0.35;
  const dx = Math.min(innerWidth * 0.3, 260);
  // 手紙の暗い幕の上なので縁（ink）は付けない（軽くなる）。スマホは 1 発ずつ（重さ。docs/ISLAND_FX.md の上限）
  const small = innerWidth < 600;
  playFx('firework-burst', small ? cx : cx - dx, cy, { palette: FX_PAL.ours, opts: { core: FX_PAL.core }, ink: false, delay: 120, seed: 9 });
  if (!small) playFx('firework-burst', cx + dx, cy - 20, { palette: FX_PAL.party, opts: { core: FX_PAL.core }, ink: false, delay: 650, seed: 4 });
  if (conquered) {
    // 制覇：金の 1 発（スマホは 1 発目が消えかけてから）と紙吹雪
    playFx('firework-burst', cx, cy - 40, { palette: FX_PAL.core, opts: { core: FX_PAL.core }, ink: false, delay: small ? 2400 : 1150, seed: 7 });
    // 紙吹雪は画面の下の縁から（手紙の文字に重ねない）。スマホは下のタブの上の縁から（押す場所に重ねない）
    const tb = tabbar.getBoundingClientRect();
    const floor = tb.height && tb.top > innerHeight / 2 ? tb.top - 4 : innerHeight - 6;
    playFx('confetti', innerWidth / 2, floor, { palette: FX_PAL.party, delay: 300, scale: small ? 4 / 3 : 2 });
  }
}

/** 関所の通行料を払って開通する */
function payGate() {
  const toll = gateToll(s);
  if (!openGate(s)) {
    sfx.play('error');
    return;
  }
  sfx.play('spend');
  setTimeout(() => sfx.play('win'), 160);
  closePop();
  save();
  renderAll();
  const g = gateOf(s);
  if (g) {
    centerOn(g.i, g.j);
    gateFx();
  }
  talk(
    GATE_LINES(toll).map((text) => ({ text })),
    t('ランドマップへ', 'To the land map'),
    () => openLand(ctx),
  );
}

/** 段 FX2：関所の上で自社の色の花火を 1 発（地図の層。縁で明るい地図の上でも読める・会話の箱の下） */
function gateFx() {
  const g = gateOf(s);
  if (g) mapFx('firework-burst', (g.i - g.j) * 100, (g.i + g.j) * 55 - 20, { palette: FX_PAL.ours, opts: { core: FX_PAL.core }, scale: Math.max(1, cam.zoom * 3), delay: 500, seed: 11 });
}

/** ほかのセクタへ移ったあと：地図を描き直し、真ん中へ。マインちゃんが一言 */
/** セクタを移っている最中（画面を閉じたときの renderAll で、到着の案内を二重に出さない） */
let moving = false;
function afterMove(target: string, fresh: boolean, manager: number | null) {
  moving = true;
  closeSheet();
  closePop();
  menu = null;
  sub = null;
  placing = null;
  anim.walkers = [];
  anim.crowd = [];
  anim.coins.clear();
  anim.plus = [];
  anim.buyer = null;
  cam.x = 0;
  cam.y = (s.n - 1) * 55;
  cam.zoom = innerWidth < 600 ? 0.3 : 0.5;
  speed = 1;
  save();
  // ランクアップの災害と徴収（発掘 v2 の 7 段目）：演出（災害 → 被害 → 通知 → サインとハンコ → 支度金）のあと、行き先の町の案内へ
  const rs = pendingReset(s);
  if (rs) {
    // 演出のあいだは moving のまま（到着の案内を先に出さない）
    renderAll();
    playDisaster(root, s, rs, { sfx: (k, g, r) => sfx.play(k, g, r), toast: (x) => toast(x), save }, () => {
      moving = false;
      arrive(target, fresh, manager, true);
    });
    return;
  }
  sfx.play('win');
  moving = false;
  arrive(target, fresh, manager, false);
}
/** 移ったあとの案内（到着の案内・戻ってきた・マネージャー。文は mine.ts の arrivalPages）。reset：ランクアップの災害のあと */
function arrive(target: string, fresh: boolean, manager: number | null, reset: boolean) {
  const a = arrivalPages(s, { target, fresh, manager, reset });
  if (a.ruin) s.flags.ruinTalk = true;
  moving = false;
  // 部門の紹介は、到着の案内の日には出さない（1 日に 1 つずつ。mine.ts の deptTalkNext）
  s.flags.talkDay = s.day;
  save();
  if (a.intro) {
    showIntro(a.pages);
    renderAll();
    return;
  }
  renderAll();
  talk(a.pages.map((pg) => ({ text: pg.text })), t('はじめよう！', 'Let’s go!'), () => renderAll());
}

/** お題のエクステの絵の並び（到着の案内・研究成果の発表）。未発見はシルエットと「？？？」 */
function topicsEl(sector: string): HTMLElement {
  const row = h('div', 'isl-topics');
  for (const id of topicsOf(sector)) {
    const known = (s.research?.[id] ?? 0) > 0;
    const c = h('div', `isl-topics-one ${known ? 'is-known' : 'is-unknown'}`);
    const pic = h('div', 'isl-topics-pic');
    pic.append(extIcon(id, 64));
    c.append(pic, h('small', '', known ? extName(id) : t('？？？', '???')));
    row.append(c);
  }
  return row;
}

/** 到着の案内を出す。最初の一手が工房なら、閉じたら建築を開く。2 枚目（リサーチ）には「市場データを開く」ボタン、お題の枚にはお題の絵 */
function showIntro(pages: ArrivePage[]) {
  const id = s.sector ?? 'c1';
  const ws = s.buildings.some((b) => b.owner === 'me' && b.id === 'workshop');
  s.flags.talkDay = s.day;
  const seen = () => {
    s.flags.sectorIntro = [...new Set([...(s.flags.sectorIntro ?? []), id])];
    save();
    renderAll();
  };
  const withData = pages.map((pg): TutPage => (pg.kind === 'research' ? { text: pg.text, button: [t('市場データを開く', 'Open market data'), () => (seen(), openData(ctx))] } : pg.kind === 'topic' ? { text: pg.text, el: () => topicsEl(id) } : { text: pg.text }));
  talk(withData, ws ? t('はじめよう！', 'Let’s go!') : t('建築を開く', 'Open Build'), () => {
    seen();
    if (!ws) openBuildTab();
  });
}

/** 会話も画面も開いていないとき：到着の案内（古いセーブ・途中で閉じたとき）と、ランド制覇のお祝い */
function sectorChecks() {
  if (moving || placing || pop || tour || sheetOpen() || root.querySelector('.isl-modal, .isl-rp-reveal, .isl-picker')) return;
  if (needsIntro(s)) {
    showIntro(introPages(s));
    return;
  }
  const lands: [Tier, 'landCommon' | 'landUncommon' | 'landRare' | 'landEpic', string, string][] = [
    ['C', 'landCommon', t('Common ランド制覇！', 'Common lands conquered!'), LAND_CLEAR_LINE('C', playable('C').length)],
    ['U', 'landUncommon', t('Uncommon ランド制覇！', 'Uncommon lands conquered!'), LAND_CLEAR_LINE('U', playable('U').length)],
    ['R', 'landRare', t('Rare ランド制覇！', 'Rare lands conquered!'), LAND_CLEAR_LINE('R', playable('R').length)],
    // 段 H1：Epic の 3 町すべてで 👑
    ['E', 'landEpic', t('Epic ランド制覇！', 'Epic lands conquered!'), LAND_CLEAR_LINE('E', playable('E').length)],
  ];
  for (const [tier, flag, title, body] of lands) {
    if (s.flags[flag] || !landCleared(s, tier)) continue;
    s.flags[flag] = true;
    brandAdd(s, BRAND.landClear, title);
    save();
    sfx.play('win');
    modal(`👑 ${title}`, `${body} ${t(`ブランド力 +${BRAND.landClear}`, `Brand +${BRAND.landClear}`)}`, [[t('ランドマップを見る', 'Open land map'), () => openLand(ctx), 'is-on'], [t('続ける', 'Keep going'), () => renderAll()]], true);
    return;
  }
}

/** 関所のマスを開く（カメラも寄せる） */
function showGate() {
  const g = gateOf(s);
  if (g) openPop(g.i, g.j);
}

/** 吹き出しを、マスの真下に（しっぽはマスを指す） */
function placePop() {
  if (!pop || popEl.hidden) return;
  const b = selected != null ? s.buildings.find((x) => x.uid === selected) : null;
  const [i, j] = b ? [b.i, b.j] : pop;
  const sx = ((i - j) * 100 - cam.x) * cam.zoom + W / 2;
  const sy = ((i + j) * 55 - cam.y) * cam.zoom + H / 2;
  // PC は右端に縦のメニュー（下には無い）。そのぶん横を空け、下は画面の端まで使う
  const fr = foot.getBoundingClientRect();
  const rail = fr.height > fr.width;
  const right = rail ? fr.left : W;
  const w = Math.min(400, right - 16);
  const left = Math.max(8, Math.min(right - w - 8, sx - w / 2));
  const top = sy + 40 * cam.zoom + 12;
  const bottom = rail ? H - 8 : fr.top - 8;
  popEl.style.width = `${w}px`;
  popEl.style.left = `${left}px`;
  popEl.style.top = `${top}px`;
  popEl.style.maxHeight = `${Math.max(140, bottom - top)}px`;
  popTail.style.left = `${Math.max(16, Math.min(w - 16, sx - left))}px`;
}

/** カメラをマスへ動かす（吹き出しが下に入るよう、マスは画面の上のほうへ） */
let tween: { x0: number; y0: number; x1: number; y1: number; t0: number; z0?: number; z1?: number; dur?: number } | null = null;
function centerOn(i: number, j: number) {
  const hudBottom = hud.getBoundingClientRect().bottom;
  const ty = Math.max(hudBottom + 40 + 150 * cam.zoom, H * 0.28);
  const wx = (i - j) * 100;
  const wy = (i + j) * 55;
  tween = { x0: cam.x, y0: cam.y, x1: wx, y1: wy - (ty - H / 2) / cam.zoom, t0: performance.now() };
}

// ---------------------------------------------------------------- マインちゃんの案内

const advisor = h('div', 'isl-advisor');
const mine = h('img');
mine.src = assetUrl('mch/Image/Characters/navi_ain_speak_00_talk.png');
mine.alt = '';
const bubbleBox = h('div', 'isl-bubble');
advisor.append(mine, bubbleBox);
let hiddenTip = '';

// ---------------------------------------------------------------- 月末ポーズ：「次の月に進む」（地図の右下）

const nextBtn = h('button', 'isl-next-month');
nextBtn.type = 'button';
nextBtn.hidden = true;
const nextIcon = icon(getExtension(1111).image, 'px isl-next-ic');
const nextText = h('span', 'isl-next-text');
const nextSmall = h('small', '', t('次の月へ', 'Next month'));
const nextBig = h('b');
nextText.append(nextSmall, nextBig);
nextBtn.append(nextIcon, nextText);
nextBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  nextMonth();
});
/** ボタンが消える演出のあいだ（すぐに hidden にしない） */
let nextLeaving = false;
function nextMonth() {
  if (!s.monthPause) return;
  sfx.play('page');
  s.monthPause = false;
  speed = 1;
  save();
  renderHud();
  nextLeaving = true;
  nextBtn.classList.add('is-gone');
  setTimeout(() => {
    nextLeaving = false;
    nextBtn.classList.remove('is-gone');
    nextBtn.hidden = true;
    renderAll();
  }, 260);
}
/** ボタンを出すとき：月末ポーズで、画面・窓・吹き出し・建てるモード・メニュー・流れの案内・発表が出ていない */
const nextShown = () => !!s.monthPause && !placing && !menu && !pop && !sheetOpen() && !tour && !root.querySelector('.isl-modal, .isl-rp-reveal');
function renderNext() {
  if (nextLeaving) return;
  const show = nextShown();
  if (show) {
    const d = date(s);
    const label = d ? t(`${d.month} 月に進む ▶`, `Go to M${d.month} ▶`) : t('次の月に進む ▶', 'Next month ▶');
    if (nextBig.textContent !== label) nextBig.textContent = label;
  }
  if (nextBtn.hidden === show) {
    nextBtn.hidden = !show;
    if (show) layout();
  }
}

function openBuildTab() {
  goSub('strategy', 'build');
}

// ---------------------------------------------------------------- チュートリアル中のロック

const tutStep = (): TutStep | undefined => {
  const k = tutOf(s);
  return k < TUT_DONE ? TUT[k] : undefined;
};

/** チュートリアル中、いまの段で使わないメニューはロック（システムはいつでも開ける） */
function menuLocked(m: Menu): boolean {
  const st = tutStep();
  if (!st || m === 'systems') return false;
  const [hm] = hlOf(st, s).split(':');
  return hm !== m && !(st.open ?? []).includes(m);
}

/** 光らせている小メニューがあれば、同じメニューのほかの小メニューはロック */
function subLocked(m: Menu, key: string): boolean {
  const st = tutStep();
  if (!st || m === 'systems') return false;
  const [hm, hk0] = hlOf(st, s).split(':');
  // 経営企画のタブだけを光らせる段（スキルツリーを開く）は、スキルツリーのほかの小メニューはロック
  const hk = hm === 'strategy' && !hk0 ? 'tree' : hk0;
  if (hm === m) return !!hk && hk !== key;
  return menuLocked(m);
}

function lockedNote() {
  const st = tutStep();
  sfx.play('error');
  if (st) toast(plain(t(`いまは「${st.goal(s)}」をしよう！`, `For now: ${st.goal(s)}!`)));
}

// ---------------------------------------------------------------- 右上の「ミッション」（いまやること・受けた依頼）

const missionBox = h('div', 'isl-missions');
let missionKey = '';
let missionFold = false;
/** いまクリアした段（チェックと取り消し線を見せてから、次の段へ入れ替える） */
let cleared: { goal: string; checks: string[]; until: number } | null = null;
/** いま付いたチェック（この 1 回の描き直しだけ、ポンと出す） */
let justChecked = new Set<string>();
let prevChecks = new Map<string, boolean>();

function renderMissions() {
  const st = tutStep();
  const now = performance.now();
  const showCleared = (!!cleared && now < cleared.until) || !!pendingClear;
  // 小さなチェックが付いた瞬間に音
  if (st?.checks && !showCleared) {
    for (const [label, ok] of st.checks) {
      const v = ok(s, seenNow());
      const key = `${st.id}:${label}`;
      if (v && prevChecks.get(key) === false) {
        justChecked.add(key);
        sfx.play('check');
      }
      prevChecks.set(key, v);
    }
  }
  const active = activeMissions(s);
  const items: unknown[] = [missionFold, pendingClear, showCleared ? cleared : null, st && !showCleared ? [st.id, st.goal(s), (st.checks ?? []).map(([l, ok]) => [l, ok(s, seenNow())])] : null, active.map((m) => [m.id, s.missions[m.id], missionProgress(s, m.id)]), [...justChecked]];
  const key = JSON.stringify(items);
  missionBox.hidden = !!placing || (!st && !showCleared && !active.length);
  if (key === missionKey) return;
  missionKey = key;
  const head = h('button', 'isl-missions-head');
  head.type = 'button';
  head.append(h('b', '', t('ミッション', 'Missions')), h('span', '', missionFold ? '▸' : '▾'));
  head.addEventListener('click', () => {
    missionFold = !missionFold;
    renderMissions();
  });
  const list = h('div', 'isl-missions-list');
  list.hidden = missionFold;
  if (pendingClear) {
    // 画面を閉じるまでは、チェックだけ付けて待つ（はんこと取り消し線は地図に戻ってから）
    const row = h('div', 'isl-mis is-tut is-waiting');
    row.append(h('span', 'isl-mis-box', '✓'), h('b', 'isl-mis-text', pendingClear.goal));
    for (const label of pendingClear.checks) row.append(h('small', 'isl-mis-check is-on', `✓ ${label}`));
    list.append(row);
  } else if (showCleared && cleared) {
    const row = h('div', 'isl-mis is-tut is-cleared');
    row.append(h('span', 'isl-mis-box', '✓'), h('b', 'isl-mis-text', cleared.goal), h('span', 'isl-mis-stamp', t('クリア！', 'Clear!')));
    for (const label of cleared.checks) row.append(h('small', 'isl-mis-check is-on', `✓ ${label}`));
    list.append(row);
  } else if (st) {
    const row = h('button', `isl-mis is-tut ${cleared ? 'is-new' : ''}`);
    row.type = 'button';
    row.append(h('span', 'isl-mis-box', ''), h('b', 'isl-mis-text', st.goal(s)));
    for (const [label, ok] of st.checks ?? []) {
      const v = ok(s, seenNow());
      const k2 = `${st.id}:${label}`;
      row.append(h('small', `isl-mis-check ${v ? 'is-on' : ''} ${justChecked.has(k2) ? 'is-just' : ''}`, (v ? '✓ ' : '· ') + label));
    }
    const a = actOf(st, s);
    if (a) {
      row.append(h('small', 'isl-mis-go', `${a[0]} ▶`));
      row.addEventListener('click', () => tutGo(a[1]));
    }
    list.append(row);
  }
  for (const m of active) {
    const done = s.missions[m.id] === 'done';
    const row = h('div', `isl-mis ${done ? 'is-done' : ''}`);
    row.append(h('span', 'isl-mis-box', done ? '✓' : ''), h('b', 'isl-mis-text', m.title));
    const pr = missionProgress(s, m.id);
    row.append(h('small', 'isl-dim', pr && !done ? t(`${m.text}（${pr[0]} / ${pr[1]}）`, `${m.text} (${pr[0]} / ${pr[1]})`) : m.text));
    if (done) {
      const claimBtn = btn(
        t(`${rewardText(m)} を受け取る`, `Claim: ${rewardText(m)}`),
        () => {
          if (!claim(s, m.id)) {
            sfx.play('clear');
            // 受け取った手応え（pixelfx）：押したボタンのまんなかで金の光
            fxAtEl('collect-burst', claimBtn, { palette: FX_PAL.gold, dy: 30 });
            toast(t(`${rewardText(m)} を受け取りました`, `Received: ${rewardText(m)}`));
          }
          save();
          renderAll();
        },
        'is-on',
      );
      row.append(claimBtn);
    }
    list.append(row);
  }
  justChecked = new Set();
  missionBox.replaceChildren(head, list);
}

/** マインちゃんのほめ言葉（上に少しだけ出る） */
function praise(text: string) {
  for (const old of root.querySelectorAll('.isl-praise')) old.remove();
  const e = h('div', 'isl-praise');
  const im = h('img');
  im.src = assetUrl('mch/Image/Characters/navi_ain_cross_01_smile.png');
  im.alt = '';
  const p = h('p');
  p.append(rich(text));
  e.append(im, p);
  root.append(e);
  setTimeout(() => e.remove(), 2600);
}

/** 下の帯の小メニューをコードから開く（チュートリアルの吹き出し・撮影スクリプト用） */
function goSub(m: Menu, key: string) {
  // 段 UI3：まとめた画面の前の key（outlook・pr・bom・side ほか）は、まとめた画面のその部分へ
  const r = resolveSub(m, key, menuDepts(s));
  const x = r ? subsOf(r.m).find((y) => y.key === r.key) : undefined;
  if (!r || !x) return;
  if (!menuDepts(s).includes(r.m)) {
    openDef(x.def, r.part);
    renderAll();
    return;
  }
  menu = r.m;
  openSub(x, r.part);
}

// ---------------------------------------------------------------- チュートリアル（tut.ts の段を進める）

/** この段に入ってから閉じた画面（「見た」の判定は閉じたときにする。読んでいる途中で案内が消えないように） */
let tutSeen = new Set<string>();
let tutOpen: string | null = null;
/** 閉じた画面と、いま開いている画面（ミッションの小さなチェック用） */
const seenNow = () => (tutOpen ? new Set([...tutSeen, tutOpen]) : tutSeen);

// 地図の建物を指さす（チュートリアルで、建物の中を開いてほしいとき）
const pointEl = h('div', 'isl-point', '👈');
pointEl.hidden = true;
function updatePoint() {
  // （発掘との出会いの「荒れ地をタップ」は、荒れ地の上の 👆：updateMarks）
  const what = pointOf(tutStep());
  const b = what === 'workshop' ? myWorkshop(s) : what === 'shop' ? myShops(s)[0] : undefined;
  const show = !!b && !placing && !pop && !sheetOpen() && !root.querySelector('.isl-modal');
  pointEl.hidden = !show;
  if (!show || !b) return;
  const x = ((b.i - b.j) * 100 - cam.x) * cam.zoom + W / 2;
  const y = ((b.i + b.j) * 55 - cam.y) * cam.zoom + H / 2;
  // 建物の右横から指さす（上は施設の吹き出し、右上はミッションと重なるので）
  pointEl.style.left = `${Math.round(x + 95 * cam.zoom)}px`;
  pointEl.style.top = `${Math.round(y - 70 * cam.zoom)}px`;
}
let tutIntro = -1;
/** クリアの手ごたえを見せてから、次の会話を出す */
let tutIntroAfter = 0;
/** クリアしたが、まだ手ごたえを見せていない段（画面を開いているあいだにクリアしたとき） */
let pendingClear: { goal: string; checks: string[]; praise?: string; focus?: 'workshop' | 'shop' } | null = null;
/** クリアの手ごたえを見せる長さ（建物へ寄るときは少し長く） */
const CELEBRATE_MS = 2200;

/** 自分の工房・お店へカメラを寄せる（チュートリアルで、できたものを見せる） */
function focusOn(what: 'workshop' | 'shop') {
  const b = what === 'workshop' ? myWorkshop(s) ?? s.buildings.find((x) => x.owner === 'me' && x.id === 'workshop') : myShops(s)[0] ?? s.buildings.find((x) => x.owner === 'me' && P1B[x.id]?.kind === 'shop');
  if (!b) return;
  const z = innerWidth < 600 ? 0.75 : 1;
  // 建物の絵は基準のマスより上に伸びるので、少し上を真ん中に
  tween = { x0: cam.x, y0: cam.y, x1: (b.i - b.j) * 100, y1: (b.i + b.j) * 55 - 40, t0: performance.now(), z0: cam.zoom, z1: z, dur: 900 };
}

function tutGo(go: TutGo) {
  if (go === 'build') openBuildTab();
  else if (go === 'workshop' || go === 'shop') {
    // 建物の中の画面は、地図の建物から開いてもらう（次から自分で開けるように）。ここではカメラを寄せて指さすだけ
    closeSheet();
    closePop();
    menu = null;
    sub = null;
    focusOn(go);
  } else if (go === 'staff') goSub('hr', 'staff');
  else if (go === 'hire') goSub('hr', 'hire');
  else if (go === 'hr') pickMenu('hr');
  else if (go === 'ranking') goSub('marketing', 'ranking');
  else if (go === 'buy') goSub('logistics', 'buy');
  else if (go === 'scm') goSub('logistics', 'flow');
  else if (go === 'skills') pickMenu('strategy');
  renderAll();
}

/** 画面の上のマインちゃんの一言。その段に決まった一言が無ければ、いまやることを言う */
function tutTip(screen: string): string | null {
  const k = tutOf(s);
  if (k >= TUT_DONE || !TUT[k]) return null;
  if (tutOpen && tutOpen !== screen) tutSeen.add(tutOpen);
  tutOpen = screen;
  const st = TUT[k];
  const tip = st.tips?.[screen];
  if (tip) return tip(s);
  return st.intro && !actOf(st, s) ? null : st.say(s);
}

const tutFree = () => !placing && !sheetOpen() && !pop && !root.querySelector('.isl-modal');

/** 段の条件を見て進める。新しい段に説明の札があれば、画面が空いたときに出す */
function tutTick() {
  let k = tutOf(s);
  if (k >= TUT_DONE) {
    sideIntro();
    return;
  }
  if (tour) return;
  if (s.tut !== k) s.tut = k;
  if (tutOpen && !sheetOpen()) {
    tutSeen.add(tutOpen);
    tutOpen = null;
  }
  // 段の条件を満たしたとき、画面を開いたまま説明する（例：工房の設定が終わったら、自動製造の説明）
  const cur = TUT[k];
  if (cur?.sheetTalk && sheetOpen() && !s.flags.craftTalk && !root.querySelector('.isl-modal') && !root.querySelector('.isl-picker') && cur.done(s, tutSeen)) {
    s.flags.craftTalk = true;
    save();
    talk(
      cur.sheetTalk.pages,
      cur.sheetTalk.ok,
      () => {
        closeSheet();
        renderAll();
      },
      { over: true },
    );
    return;
  }
  let moved = false;
  while (k < TUT.length && TUT[k].done(s, tutSeen)) {
    k++;
    moved = true;
    tutSeen = new Set();
  }
  if (moved) {
    const done = TUT[k - 1];
    s.tut = k;
    save();
    // クリアの手ごたえは、地図が見えるとき（画面を閉じたあと）に出す
    pendingClear = { goal: done.goal(s), checks: (done.checks ?? []).map(([l]) => l), praise: done.praise, focus: TUT[k]?.focus };
    if (sheetOpen()) refreshSheet();
  }
  // 地図が見えたら：建物へ寄って、右上のミッションにチェックと取り消し線、音、マインちゃんのひとこと。
  // 一拍おいてから（CELEBRATE_MS）、次の会話へ
  // 建物の吹き出しから開いた画面を閉じたら、吹き出しも閉じて、地図でクリアを見せる
  if (pendingClear && pop && !sheetOpen() && !placing) closePop();
  if (pendingClear && tutFree()) {
    const c = pendingClear;
    pendingClear = null;
    const now = performance.now();
    const hold = c.focus ? CELEBRATE_MS + 900 : CELEBRATE_MS;
    cleared = { goal: c.goal, checks: c.checks, until: now + hold };
    tutIntroAfter = now + hold + 200;
    sfx.play('clear');
    // クリアの手応え（pixelfx）：右上のミッションの「クリア！」のはんこで金の光。重ねるだけ（押す場所は隠さない・待たせない）
    window.setTimeout(() => fxAtEl('collect-burst', missionBox.hidden ? null : (missionBox.querySelector('.isl-mis-stamp') ?? missionBox), { palette: FX_PAL.gold, dy: 30 }), 80);
    if (c.praise) praise(c.praise);
    if (c.focus) focusOn(c.focus);
    setTimeout(() => renderAll(), hold + 250);
  }
  if (pendingClear) return;
  if (k >= TUT.length) {
    if (!tutFree() || performance.now() < tutIntroAfter) return;
    s.tut = TUT_DONE;
    save();
    talk(TUT_END, t('はじめる', 'Let’s go'), () => {
      speed = 1;
      renderAll();
    });
    return;
  }
  const st = TUT[k];
  // 初売上までの流れを、地図の上で順に見せる（スキップできない）
  if (st.id === 'firstSale' && !s.flags.tour && tutFree() && performance.now() >= tutIntroAfter) {
    startTour();
    return;
  }
  if (st.autoGo && tutIntro !== k && tutFree() && performance.now() >= tutIntroAfter) {
    tutIntro = k;
    const a = actOf(st, s);
    if (a) tutGo(a[1]);
    return;
  }
  if (st.intro && tutIntro !== k && tutFree() && performance.now() >= tutIntroAfter) {
    tutIntro = k;
    // 研究ポイントの説明：最初に持っている RP（マインちゃんの「前の世界の研究ノート」）で、研究パネルを開く
    const pages = [...st.intro.pages];
    if (st.rpTalk) {
      const add = st.rpTalk(s);
      if (add > 0) {
        s.rp = (s.rp ?? 0) + add;
        save();
      }
      const rp = s.rp ?? 0;
      // 最後の 1 枚（「行ってみよう！」＝次にすること）の前に入れる
      pages.splice(Math.max(0, pages.length - 1), 0, { text: RP_LINE(rp), show: 'gift', gift: { icon: '📜', title: `${rp} RP`, note: t('マインちゃんの研究ノート', 'Mine-chan’s research notes') } });
    }
    talk(pages, st.intro.ok, () => {
      const a = actOf(st, s);
      if (a && !st.lesson) tutGo(a[1]);
      else renderAll();
    });
  }
}

/** 資金が少なくなったら、一度だけマインちゃんが「他店でバイト」を紹介する */
function sideIntro() {
  if (s.flags.side || s.money > SIDE.rescue || !tutFree() || !myWorkshop(s)) return;
  s.flags.side = true;
  save();
  talk(
    SIDE_LINES().map((text) => ({ text })),
    t('バイトを探す', 'Find work'),
    () => goSub('hr', 'side'),
  );
}

// ---------------------------------------------------------------- 初売上までの流れの案内（①調達 → ②製造 → ③物流 → ④販売。スキップできない）

/** できごとを待つ長さの上限（来なければ先へ） */
const TOUR_WAIT = 45000;

let tourReport: Parameters<typeof showReport>[0] | null = null;
/**
 * 流れの案内の段の進み：
 *   say（はじめの一言。時間は止まる。押すと見守りへ）→ watch（できごとを待つ。時間が進む）→ then（できごとのあとの一言。時間は止まる。押すと次の段）。
 * 待つできごとが無い段は say → then を飛ばして、押すと次の段。
 */
let tour: { k: number; t0: number; ev: number | null; phase: TourPhase; deliver?: { t0: number; dur: number; hero: number; mat: Mat }; last?: number; tap?: HTMLButtonElement; inside?: HTMLElement } | null = null;
const tourEl = h('div', 'isl-tour');
tourEl.hidden = true;

function startTour() {
  closeSheet();
  closePop();
  menu = null;
  sub = null;
  placing = null;
  tour = { k: 0, t0: performance.now(), ev: null, phase: 'say' };
  root.classList.add('is-tour');
  tourEl.hidden = false;
  tourStage();
}

/** 段に入る：カメラを寄せ、速さを決め、一言を出す */
function tourStage() {
  if (!tour) return;
  const st = TOUR[tour.k];
  // お店の中を見せるまでは売らない（売上はレジで払ったときに見せる）
  s.holdSales = st.key !== 'inside' && st.key !== 'end';
  tour.t0 = performance.now();
  tour.ev = null;
  tour.phase = 'say';
  // 一言を読むあいだは時間を止める。押したら（tourNext）見守りに入り、その段の速さで進む
  speed = 0;
  renderHud();
  if (st.key === 'buy') {
    const mat = (s.slots.find((x) => x.sku)?.sku ? (Object.keys(recipeOf(s.slots.find((x) => x.sku)!.sku!))[0] as Mat) : 'wood') ?? 'wood';
    tour.deliver = { t0: 0, dur: 4200, hero: GUESTS[3] ?? 1004, mat };
    const wh = wholesaler(s);
    if (wh) tween = { x0: cam.x, y0: cam.y, x1: (wh.i - wh.j) * 100, y1: (wh.i + wh.j) * 55 - 40, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 0.7 : 0.95, dur: 900 };
  } else {
    tour.deliver = undefined;
    if (st.key === 'haul') forceHaul(s);
    if (st.key === 'craft' || st.key === 'haul') focusOn('workshop');
    if (st.key === 'look') focusOn('shop');
    if (st.key === 'inside') {
      // 店内の様子を大きく見せる（棚に並べて、お客さんが来て、売れる）
      const shop = myShops(s)[0];
      if (shop) {
        const box = h('div', 'isl-tour-shop');
        // レジの前で払ったら（店員の頭の上に +N GUM）、はじめて「売れた」
        box.append(
          shopScene(s, shop.uid, (yen) => {
            sfx.play('sale');
            tourUnpaid = Math.max(0, tourUnpaid - yen);
            renderHud();
            tourOn('sold');
          }),
        );
        tour.inside = box;
      }
    }
    if (st.key === 'end') tour.inside = undefined;
  }
  tourRender();
}

/** 流れの案内：お店に入っていくお客さん（見せるためだけ。売上にはならない） */
function tourGuests(shop: (typeof s.buildings)[number]) {
  const homes = s.buildings.filter((b) => b.owner === 'town' && ['house', 'cottage', 'apartment', 'garage_house', 'japanese_house', 'manor'].includes(b.id));
  const near = homes.sort((a, b) => Math.abs(a.i - shop.i) + Math.abs(a.j - shop.j) - (Math.abs(b.i - shop.i) + Math.abs(b.j - shop.j))).slice(0, 4);
  near.forEach((home, k) => {
    const path = pathOf(doorOf(home), doorOf(shop));
    if (path && path.length > 1) anim.walkers.push({ hero: GUESTS[(k * 3) % GUESTS.length] ?? 1001, path, t0: anim.clock + 400 + k * 900, dur: Math.max(1800, path.length * 260) });
  });
}

function tourOn(ev: TourEv | null, ev2: TourEv | null = null) {
  if (!tour) return;
  const st = TOUR[tour.k];
  if (tour.ev == null && tour.phase === 'watch' && st.wait && (ev === st.wait || ev2 === st.wait)) {
    tour.ev = performance.now();
    // できごとのあとの一言：押すまで時間を止める
    tour.phase = 'then';
    speed = 0;
    renderHud();
    sfx.play('check');
    tourRender();
  }
}

/** 一言を押した：say → 見守り（時間が進む）、then → 次の段 */
function tourNext() {
  if (!tour) return;
  const st = TOUR[tour.k];
  sfx.play('page');
  if (tour.phase === 'say') {
    const watch = !!st.wait || st.key === 'buy' || st.key === 'look';
    if (!watch) return tourAdvance();
    tour.phase = 'watch';
    tour.t0 = performance.now();
    speed = st.speed;
    if (st.key === 'buy' && tour.deliver) tour.deliver.t0 = performance.now();
    if (st.key === 'look') tourLookStart();
    renderHud();
    tourRender();
    return;
  }
  if (tour.phase === 'then') tourAdvance();
}
/** 次の段へ（最後なら終わり） */
function tourAdvance() {
  if (!tour) return;
  if (tour.k < TOUR.length - 1) {
    tour.k++;
    tourStage();
    return;
  }
  tourEnd();
}
function tourEnd() {
  tour = null;
  anim.spot = null;
  root.classList.remove('is-tour');
  tourEl.hidden = true;
  s.flags.tour = true;
  s.holdSales = false;
  tourUnpaid = 0;
  speed = 1;
  save();
  renderAll();
  if (tourReport) {
    const r = tourReport;
    tourReport = null;
    showReport(r);
  }
}
/** お店に注目：お店を大きく。お客さんが家からお店へ入っていく */
function tourLookStart() {
  const shop = myShops(s)[0];
  if (!shop) return;
  tween = { x0: cam.x, y0: cam.y, x1: (shop.i - shop.j) * 100, y1: (shop.i + shop.j) * 55 - 40, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 1.05 : 1.25, dur: 1100 };
  tourGuests(shop);
}

/** 毎フレーム：カメラで追いかける・できごとを待つ */
function tourFrame(now: number) {
  if (!tour) return;
  const st = TOUR[tour.k];
  const dtReal = Math.min(100, now - (tour.last ?? now));
  tour.last = now;
  // 一言を読んでいるあいだ（say・then）は、何も進めない（スポットだけ）
  if (tour.phase !== 'watch') {
    const bld = st.key === 'craft' || st.key === 'haul' ? (tour.phase === 'then' && st.key === 'haul' ? myShops(s)[0] : myWorkshop(s)) : st.key === 'look' || st.key === 'inside' ? myShops(s)[0] : st.key === 'buy' ? wholesaler(s) : null;
    anim.spot = bld && st.key !== 'inside' ? { i: bld.i, j: bld.j, r: 210 } : null;
    dirty = true;
    return;
  }
  // お店に注目しているあいだは、ゲームの時間を止めて、お客さんだけ歩かせる
  if (st.key === 'look') {
    tickAnim(dtReal * 0.8);
    dirty = true;
    const shop = myShops(s)[0];
    if (tour.ev == null && now - tour.t0 > 3800) {
      tour.ev = now;
      tour.phase = 'then';
      sfx.play('check');
      tourRender();
    }
    // 読み終わったら、お店をタップしてもらう（ほかは押せない）
    if (tour.ev != null && shop && tour.tap) {
      const q = { x: ((shop.i - shop.j) * 100 - cam.x) * cam.zoom + W / 2, y: ((shop.i + shop.j) * 55 - 60 - cam.y) * cam.zoom + H / 2 };
      tour.tap.style.left = `${q.x}px`;
      tour.tap.style.top = `${q.y}px`;
    }
    anim.spot = shop ? { i: shop.i, j: shop.j, r: 220 } : null;
    return;
  }
  if (st.key === 'inside') {
    anim.spot = null;
    if (st.wait && tour.ev == null && now - tour.t0 > TOUR_WAIT) tourOn(st.wait);
    return;
  }
  // 荷車・届ける人を追いかける
  let target: [number, number] | null = null;
  if (st.key === 'buy' && anim.buyer) {
    const p = along(anim.buyer.path, anim.buyer.k > 0.5 ? (1 - anim.buyer.k) * 2 : anim.buyer.k * 2);
    target = [p.i, p.j];
  }
  if (st.key === 'haul') {
    const trip = s.trips.find((x) => !x.dropped && myShops(s).some((b) => b.uid === x.to));
    const to = trip ? s.buildings.find((b) => b.uid === trip.to) : null;
    const from = trip ? ((trip.from != null ? s.buildings.find((b) => b.uid === trip.from) : null) ?? myWorkshop(s)) : null;
    if (trip && to && from && tour.ev == null) {
      const path = pathOf(doorOf(from), doorOf(to));
      if (path && path.length > 1) {
        const k = Math.min(1, (1 - (trip.left - acc / dayMs()) / trip.total) * 2);
        const p = along(path, Math.max(0, k));
        target = [p.i, p.j];
      }
    }
  }
  // スポットライト：届ける人・荷車を追い、工房・お店は建物に
  // 物流：荷物をお店に届けたら、そのままお店を映す
  const delivered = st.key === 'haul' && tour.ev != null;
  const bld = st.key === 'craft' || (st.key === 'haul' && !target && !delivered) ? myWorkshop(s) : delivered && !target ? myShops(s)[0] : null;
  if (!target && bld) target = [bld.i, bld.j];
  anim.spot = target ? { i: target[0], j: target[1], r: st.key === 'buy' || (st.key === 'haul' && !bld) ? 150 : 210 } : null;
  if (target && !tween && (st.key === 'buy' || st.key === 'haul')) {
    if (delivered) {
      cam.x += ((target[0] - target[1]) * 100 - cam.x) * 0.08;
      cam.y += ((target[0] + target[1]) * 55 - 40 - cam.y) * 0.08;
    } else {
    cam.x += ((target[0] - target[1]) * 100 - cam.x) * 0.08;
    cam.y += ((target[0] + target[1]) * 55 - 30 - cam.y) * 0.08;
    }
  }
  dirty = true;
  if (st.key === 'buy' && tour.ev == null && now - tour.t0 > 4300) {
    tour.ev = now;
    // 届いた素材：作業台で 2 回作れるぶん（この案内のあいだに、工房が止まらないように）
    const sl = s.slots.find((x) => x.sku);
    if (sl?.sku) for (const [m, q] of Object.entries(recipeOf(sl.sku))) s.mats[m as Mat] = Math.max(s.mats[m as Mat] ?? 0, (q ?? 0) * 2);
    // 届けた人は、卸問屋へ帰っていく
    const ws3 = myWorkshop(s);
    const wh3 = wholesaler(s);
    const back = ws3 && wh3 ? pathOf(doorOf(ws3), doorOf(wh3)) : null;
    if (back && tour.deliver) anim.walkers.push({ hero: tour.deliver.hero, path: back, t0: anim.clock + 200, dur: 4200 / 0.3 });
    tour.deliver = undefined;
    tour.phase = 'then';
    speed = 0;
    renderHud();
    sfx.play('check');
    tourRender();
  }
  if (st.wait && tour.ev == null && now - tour.t0 > TOUR_WAIT) tourOn(st.wait);
}

function tourRender() {
  if (!tour) return;
  const st = TOUR[tour.k];
  const steps = h('div', 'isl-tour-steps');
  // 札は段の名前ごとに 1 つ（④ 販売は「お店に注目」と「店内」の 2 段）
  const labels = [...new Set(TOUR.filter((x) => x.label).map((x) => x.label))];
  for (const label of labels) {
    const idxs = TOUR.map((x, k) => (x.label === label ? k : -1)).filter((k) => k >= 0);
    const on = idxs.includes(tour.k);
    const done = !on && Math.max(...idxs) < tour.k;
    steps.append(h('span', `isl-tour-step ${on ? 'is-on' : done ? 'is-done' : ''}`, label));
  }
  const box = h('div', 'isl-talk-box isl-tour-box');
  const mine = h('img', 'isl-talk-mine');
  mine.src = assetUrl(tour.ev != null ? 'mch/Image/Characters/navi_ain_cross_01_smile.png' : 'mch/Image/Characters/navi_ain_speak_00_talk.png');
  mine.alt = '';
  const text = h('p', 'isl-talk-text');
  text.append(rich(tour.phase === 'then' && st.then ? st.then : st.say));
  const watching = tour.phase === 'watch';
  const tapShop = st.key === 'look' && tour.phase === 'then';
  const last = tour.k === TOUR.length - 1;
  const wait = h('small', `isl-tour-wait ${watching ? '' : 'is-click'}`, watching ? t('見守っていてね…', 'Watch…') : tapShop ? t('お店をタップ 👆', 'Tap the shop 👆') : last ? t('▶ おしまい', '▶ Done') : t('▶ タップで進む', '▶ Tap to continue'));
  box.append(mine, h('b', 'isl-talk-name', t('マインちゃん', 'Mine-chan')), text, wait);
  box.classList.toggle('is-click', !watching && !tapShop);
  if (!watching && !tapShop) box.addEventListener('click', () => tourNext());
  const parts: HTMLElement[] = [steps];
  // お店に注目：お客さんが入ったら、お店の上に「タップ」の印（ここだけ押せる）
  if (tapShop) {
    const tap = h('button', 'isl-tour-tap');
    tap.type = 'button';
    tap.append(h('span', '', '👆'), h('small', '', t('タップ', 'Tap')));
    tap.addEventListener('click', () => {
      if (!tour) return;
      sfx.play('tap');
      tour.tap = undefined;
      tourAdvance();
    });
    tour.tap = tap;
    parts.push(tap);
  } else if (tour.tap) tour.tap = undefined;
  // 店内の箱（shopScene）は、店内の段に入ったときに 1 回だけ作り、end まで同じものを置いたままにする。
  // 札・吹き出しの文だけを差し替える（作り直すと、お客さんの動き・出てくる演出が最初からになるため）
  for (const el of [...tourEl.children]) if (el !== tour.inside) el.remove();
  if (tour.inside) {
    if (tour.inside.parentElement !== tourEl) tourEl.append(tour.inside);
    tourEl.prepend(...parts);
    tourEl.append(box);
  } else tourEl.append(...parts, box);
}

/**
 * マインちゃんの会話：1 枚 1 メッセージ（1 枚 60 字まで。mine.ts の TALK_MAX）。押すと次の枚、最後の枚は ok のボタン。
 * 開いているあいだは時間が止まる（.isl-modal）。暗幕で、できるのはセリフ送り（タップ・クリック・スペース／Enter）と最後の枚のボタンだけ。
 * 段 UI2：ほかの会話・カード・月次報告・画面が開いているあいだは待って、閉じたら出す（mine.ts の talkWaits）。
 * over：チュートリアルの「画面を開いたままの説明」（画面の上に出す）
 */
const talkQ: { pages: TutPage[]; ok: string; then: () => void; over: boolean }[] = [];
/** いまの画面の様子（会話を待たせるか。mine.ts の TalkUi） */
function uiNow(): TalkUi {
  return {
    talk: !!root.querySelector('.isl-talk'),
    card: !!root.querySelector('.isl-cardm'),
    report: !!root.querySelector('.isl-rp-reveal, .is-report-sheet, .is-dsum'),
    sheet: sheetOpen(),
    modal: !!root.querySelector('.isl-modal'),
    placing: !!placing,
    tour: !!tour,
    disaster: !!root.querySelector('.isl-disaster'),
    moving,
  };
}
function talk(pages: TutPage[], ok: string, then: () => void, opt: { over?: boolean } = {}) {
  const over = !!opt.over;
  if (talkQ.length || talkWaits(uiNow(), over)) {
    talkQ.push({ pages, ok, then, over });
    return;
  }
  showTalk(pages, ok, then);
}
/** 待たせていた会話を、出せるようになったら出す（毎フレーム） */
function flushTalk() {
  const x = talkQ[0];
  if (!x || talkWaits(uiNow(), x.over)) return;
  talkQ.shift();
  showTalk(x.pages, x.ok, x.then);
}
/** 会話のセリフ送り（スペース・Enter）：いちばん上の会話の「次へ」か、最後の枚のボタン */
const talkKeys = new WeakMap<HTMLElement, () => void>();
function showTalk(pages: TutPage[], ok: string, then: () => void) {
  const m = h('div', 'isl-modal isl-talk');
  const stage = h('div', 'isl-talk-stage');
  const box = h('div', 'isl-talk-box');
  const mine = h('img', 'isl-talk-mine');
  mine.alt = '';
  const name = h('b', 'isl-talk-name', t('マインちゃん', 'Mine-chan'));
  const text = h('p', 'isl-talk-text');
  const foot = h('div', 'isl-talk-foot');
  // 話す人がヒーロー（研究成果の発表の町の長）のときの顔
  const face = h('div', 'isl-talk-who');
  face.hidden = true;
  box.append(mine, face, name, text, foot);
  m.append(stage, box);
  let k = 0;
  /** 画面の中の部分を、金色の枠で囲んで見せる（まわりは暗く） */
  const ring = h('div', 'isl-talk-focus');
  const show = () => {
    const pg = pages[k];
    ring.remove();
    m.classList.toggle('has-focus', !!pg.focus);
    const el = pg.focus ? root.querySelector<HTMLElement>(pg.focus) : null;
    if (el) {
      el.scrollIntoView({ block: 'center' });
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const pad = 8;
        Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
        m.prepend(ring);
      });
    }
    const last = k === pages.length - 1;
    mine.src = assetUrl(last ? 'mch/Image/Characters/navi_ain_cross_01_smile.png' : 'mch/Image/Characters/navi_ain_speak_00_talk.png');
    mine.hidden = pg.who != null || pg.crest != null;
    face.hidden = pg.who == null && pg.crest == null;
    box.classList.toggle('is-who', pg.who != null || pg.crest != null);
    if (pg.crest != null) {
      face.replaceChildren(crestEl(pg.crest));
      name.textContent = pg.role ?? '';
    } else if (pg.who != null) {
      face.replaceChildren(heroIcon(pg.who, innerWidth < 600 ? 72 : 96));
      name.textContent = pg.role ? `${pg.role} ${heroName(pg.who)}` : heroName(pg.who);
    } else name.textContent = t('マインちゃん', 'Mine-chan');
    text.replaceChildren(rich(pg.text));
    stage.replaceChildren();
    if (pg.show === 'crew') stage.append(crewEl(pg.hero));
    else if (pg.show === 'cycle') stage.append(cycleEl());
    else if (pg.show === 'gift') stage.append(giftEl(pg.gift));
    else if (pg.el) stage.append(pg.el());
    stage.hidden = !pg.show && !pg.el;
    foot.replaceChildren(h('small', 'isl-dim', `${k + 1} / ${pages.length}`));
    // その枚だけのボタン（到着の案内の「市場データを開く」など）：押すと会話を閉じて、その画面へ
    const extra = pg.button;
    if (extra)
      foot.append(
        btn(extra[0], () => {
          m.remove();
          extra[1]();
        }, 'is-on isl-talk-extra'),
      );
    const go = last
      ? btn(ok, () => {
          m.remove();
          then();
        }, 'is-on')
      : btn(t('次へ ▶', 'Next ▶'), () => next());
    foot.append(go);
    // スペース・Enter：最後の枚はボタン（「○○を開く」）、ほかは次の枚へ
    talkKeys.set(m, () => (last ? go.click() : next()));
  };
  const next = () => {
    if (k < pages.length - 1) {
      k++;
      show();
    }
  };
  // 箱でも暗幕でも、押すと次へ（最後の枚はボタンで）
  m.addEventListener('click', (e) => {
    if (!(e.target instanceof HTMLButtonElement)) next();
  });
  show();
  root.append(m);
}

/** 前の世界からついてきた 3 人（hero を前に出す） */
function crewEl(hero?: number): HTMLElement {
  const row = h('div', 'isl-crew');
  const role: Record<number, string> = {
    10003: t('手先が器用', 'Handy'),
    10002: t('話し上手', 'Smooth talker'),
    10001: t('力持ち', 'Strong'),
  };
  for (const id of [10003, 10002, 10001]) {
    const c = h('div', `isl-crew-one ${hero == null || hero === id ? '' : 'is-back'} ${hero === id ? 'is-on' : ''}`);
    c.append(heroIcon(id, 72), h('b', '', heroName(id)), h('small', '', role[id]));
    row.append(c);
  }
  return row;
}

/** お祝いの品（スキル「人材の募集」） */
function giftEl(g?: TutPage['gift']): HTMLElement {
  const c = h('div', 'isl-gift');
  c.append(h('span', 'isl-gift-icon', g?.icon ?? '🎁'), h('b', '', g?.title ?? t('人材の募集', 'Recruiting')), h('small', '', g?.note ?? t('ヒーローを雇えるようになる', 'You can hire heroes')));
  return c;
}

/** ①調達 → ②製造 → ③物流 → ④販売 の図。担当がいる段に ✓ */
function cycleEl(): HTMLElement {
  const row = h('div', 'isl-cycle');
  const on = {
    buy: s.staff.some((x) => x.task === 'buy'),
    craft: s.slots.some((sl) => sl.worker != null && !!sl.sku),
    haul: s.staff.some((x) => x.task === 'transport'),
    sell: myShops(s).some((b) => s.shops[b.uid].staff != null || s.shops[b.uid].part > 0),
  };
  const items: [keyof typeof on, string, string, HTMLElement][] = [
    ['buy', t('① 調達', '① Buy'), t('素材を買う', 'Buy materials'), matIcon('wood' as Mat, 36)],
    ['craft', t('② 製造', '② Craft'), t('工房で作る', 'Craft'), skuIcon('Sensu:C', 36)],
    ['haul', t('③ 物流', '③ Haul'), t('お店へ運ぶ', 'Deliver'), h('span', 'isl-cycle-emoji', '🛒')],
    ['sell', t('④ 販売', '④ Sell'), t('お店で売る', 'Sell'), h('span', 'isl-cycle-emoji', '💰')],
  ];
  items.forEach(([k, name, note, icon], i) => {
    const c = h('div', `isl-cycle-step ${on[k] ? 'is-on' : ''}`);
    c.append(icon, h('b', '', name), h('small', '', note));
    if (on[k]) c.append(h('span', 'isl-cycle-ok', '✓'));
    row.append(c);
    if (i < items.length - 1) row.append(h('span', 'isl-cycle-arrow', '▶'));
  });
  return row;
}

/**
 * 地図の吹き出し（段 UI2：チュートリアルと、発掘との出会いの「押す場所」の案内だけ。mine.ts の bubbleKind）。
 * 2 か月目からのほかの助言（月末ポーズの「次の月へ」・販売の詰まり・依頼・税・発掘の助言など）は出さない。
 * 詰まりは上の帯の「詰まり」の札（chipOf）、次の一手はヒーローの提案のカード（段 UI1）、月末ポーズは懐中時計のボタンの光りで知らせる
 */
function tutorial(): { text: string; action?: [string, () => void] } | null {
  // 古いセーブ（tut の無いもの）も tutOf で見る
  const kind = tutOf(s) < TUT_DONE ? 'tut' : bubbleKind(s);
  if (kind === 'tut') {
    const st = TUT[tutOf(s)];
    if (!st) return null;
    // 下の帯のタブ → サブタブを自分で押してもらう段：いま押すところを 1 つずつ
    if (st.lesson) {
      const [hm, hk] = hlOf(st, s).split(':') as [Menu, string];
      const subName = hk ? subsOf(hm)?.find((x) => x.key === hk)?.name : undefined;
      if (menu !== hm) return { text: t(`画面の下の「[[${MENU_NAME(hm)}]]」タブを押そう！`, `Tap the [[${MENU_NAME(hm)}]] tab at the bottom!`) };
      if (subName && sub !== hk) return { text: t(`タブの上に出てきた「[[${subName}]]」を押そう！`, `Now tap [[${subName}]] above the tabs!`) };
      return { text: st.say(s) };
    }
    const a = actOf(st, s);
    return { text: st.say(s), action: a ? [a[0], () => tutGo(a[1])] : undefined };
  }
  // 発掘との出会いの途中（光っている荒れ地をタップ → 発掘する → スキルツリーの研究パネル）
  const meet = kind === 'meet' && !s.monthPause ? meetTip(s) : null;
  if (meet) return { text: meet, action: (s.flags.digMeet === 'tap' || s.flags.digMeet === 'open') && !s.digRun ? [t('荒れ地の場所へ', 'To the wasteland'), () => focusWaste(meetSite())] : undefined };
  return null;
}

/** いまの段の会話をまだ出していない（クリアの演出のあいだ）：次の段の吹き出し・光る場所は、会話のあとで出す */
function introPending(): boolean {
  const k = tutOf(s);
  const st = k < TUT_DONE ? TUT[k] : undefined;
  if (!st) return false;
  // 自分で押してもらう段で会話が無いもの（前の段の会話の続き）：クリアの演出と一拍のあいだは、吹き出しと光る場所を出さない
  if (st.lesson && !st.intro && performance.now() < tutIntroAfter) return true;
  return (!!st.intro || !!st.autoGo) && tutIntro !== k;
}

/**
 * 提案・報告のカード（段 UI1）：落ち着いた時に 1 枚ずつ出す（月次報告を閉じたあと・月の途中）。
 * 会話・画面・吹き出し・置くモード・発掘・流れの案内・チュートリアルのあいだは出さない（次の機会に）
 */
let cardCheck = 0;
function maybeCard(now: number) {
  if (now - cardCheck < 400) return;
  cardCheck = now;
  flushCardToasts();
  if (placing || menu || pop || sheetOpen() || tour || s.digRun || digOpen() || meetPing || tutOf(s) < TUT_DONE) return;
  if (root.querySelector('.isl-modal, .isl-rp-reveal, .isl-tour:not([hidden])')) return;
  const c = nextPop(s);
  if (!c) return;
  closePop();
  // 段 UI4：初めての使者は、物語の会話（マインちゃんと使者）のあとにカード
  if (meetTalk(c)) return;
  // 段 P2：ヒーローの組み合わせは、掛け合いの会話のあとにカード
  if (c.src === 'duo' && c.duo && !c.duo.told && duoPages(c.duo).length) {
    c.duo.told = true;
    markSeen(s, c.id);
    talk(duoPages(c.duo), t('どうする？', 'What now?'), () => showCard(ctx, c, { done: cardDone, open: cardOpen }));
    return;
  }
  showCard(ctx, c, { done: cardDone, open: cardOpen });
}
/** 段 UI4：初めての使者の物語の会話（まだ見ていなければ出して true。会話のあとにカード） */
function meetTalk(c: NonNullable<ReturnType<typeof nextPop>>): boolean {
  if (c.src !== 'diplo' || c.dip?.kind !== 'meet') return false;
  const L = diploOf(s).lands.find((x) => x.id === c.dip!.land);
  if (!L || L.told) return false;
  L.told = true;
  markSeen(s, c.id);
  const def = landDef(c.dip.land);
  const pages = meetPages(c.dip.land).map((pg) => (pg.who === 'envoy' ? { text: pg.text, crest: c.dip!.land, role: t(`${def.name}の使者`, `Envoy of ${def.name}`) } : { text: pg.text }));
  talk(pages, t('話を聞く', 'Hear them out'), () => showCard(ctx, c, { done: cardDone, open: cardOpen }));
  return true;
}
function cardDone() {
  for (const [x, img] of cardToasts.splice(0)) toast(x, img);
  save();
  renderAll();
  refreshSheet();
}
function cardOpen(to: 'tax' | 'ads') {
  if (to === 'tax') openTaxScreen();
  else openAds(ctx);
}
cardNav.done = cardDone;
// 段 UI5a：作業台の作る物を替えたら、棚は自動でついてくる（UI4 の主力のまとめ替えのシートは、この連動に吸収した）。
// 主力にするかは工房の画面の 1 行（「○○のお店に自動で並びます（主力にする）」）で
makeHooks.switched = (_a, b) => {
  if (!shelvesAuto(s) || !myShops(s).length) return;
  ctx.toast(t(`${skuName(b)}は、できしだいお店に自動で並びます`, `${skuName(b)} goes on the shelves as soon as it’s made`));
};
cardNav.open = cardOpen;

function renderAdvisor() {
  advisor.style.display = placing || sheetOpen() || pop || !guideOn || introPending() || (digOpen() && !RAIL.matches) ? 'none' : '';
  const tip = tutorial();
  if (!tip) {
    advisor.hidden = true;
    hiddenTip = '';
    return;
  }
  if (tip.text === hiddenTip) return;
  advisor.hidden = false;
  const p = h('p');
  p.append(rich(tip.text));
  p.addEventListener('click', () => {
    hiddenTip = tip.text;
    advisor.hidden = true;
  });
  bubbleBox.replaceChildren(p);
  if (tip.action) bubbleBox.append(btn(tip.action[0], tip.action[1], 'is-on'));
}

// ---------------------------------------------------------------- システム・お祝い

function modal(title: string, body: string | HTMLElement, actions: [string, () => void, string?][], face = false) {
  const m = h('div', 'isl-modal');
  const box = h('div');
  const row = h('div', 'isl-row');
  for (const [label, on, cls] of actions)
    row.append(
      btn(
        label,
        () => {
          m.remove();
          on();
        },
        cls,
      ),
    );
  const head = h('div', 'isl-row');
  if (face) {
    const im = h('img', 'isl-modal-mine');
    im.src = assetUrl('mch/Image/Characters/navi_ain_cross_01_smile.png');
    im.alt = '';
    head.append(im);
  }
  head.append(h('h2', '', title));
  box.append(head, typeof body === 'string' ? h('p', '', body) : body, row);
  m.append(box);
  root.append(m);
}

/**
 * システムの画面（設定・進行速度・セーブ・テスト）。ほかの事業と同じく札で開くので、サブタブで切り替えられる。
 * buttons は描き直すたびに作り直す（押したあとの表示が変わるため）
 */
function sysSheet(title: string, note: string, buttons: () => [string, () => void, string?][]) {
  openSheet(ctx, title, (body) => {
    body.append(h('p', 'isl-dim', note));
    const list = h('div', 'isl-sys-list');
    for (const [label, on, cls] of buttons())
      list.append(
        btn(
          label,
          () => {
            on();
            refreshSheet();
            renderAll();
          },
          cls,
        ),
      );
    body.append(list);
  });
}

/** 演出の強さの名前と説明（段 FX2） */
const FX_LEVEL_NAME: Record<FxLevel, () => string> = { full: () => t('ふつう', 'Normal'), calm: () => t('控えめ', 'Subtle'), off: () => t('なし', 'Off') };
const FX_LEVEL_NOTE: Record<FxLevel, () => string> = {
  full: () => t('花火・紙吹雪・光', 'fireworks, confetti, sparkles'),
  calm: () => t('花火・紙吹雪なし・光だけ小さく', 'no fireworks or confetti, small sparkles only'),
  off: () => t('効果を出さない', 'no effects'),
};
function openSettings() {
  sysSheet(t('設定', 'Settings'), t('言語・マインちゃんの案内・音・街の人通りを切り替えます。', 'Language, Mine-chan’s guide, sound and crowd.'), () => [
    [isEn ? '日本語' : 'English', () => setLang(isEn ? 'ja' : 'en')], // i18n-ja
    [
      guideOn ? t('案内を隠す', 'Hide guide') : t('案内を出す', 'Show guide'),
      () => {
        guideOn = !guideOn;
        try {
          localStorage.setItem(GUIDE, guideOn ? 'on' : 'off');
        } catch {
          // 保存できなくても切り替える
        }
      },
    ],
    [vol.bgm > 0 ? t('BGM を消す', 'BGM off') : t('BGM を流す', 'BGM on'), () => setVol({ bgm: vol.bgm > 0 ? 0 : 1 })],
    [vol.se > 0 ? t('効果音を消す', 'Sound effects off') : t('効果音を出す', 'Sound effects on'), () => setVol({ se: vol.se > 0 ? 0 : 1 })],
    [
      t(`街の人通り：${CROWD_LEVELS[crowdLevel].name}`, `Crowd: ${CROWD_LEVELS[crowdLevel].name}`),
      () => {
        crowdLevel = (crowdLevel + 1) % CROWD_LEVELS.length;
        try {
          localStorage.setItem(CROWD_KEY, CROWD_LEVELS[crowdLevel].key);
        } catch {
          // 保存できなくても切り替える
        }
        toast(t(`街の人通り：${CROWD_LEVELS[crowdLevel].name}（重いときは少なく）`, `Crowd: ${CROWD_LEVELS[crowdLevel].name} (lower it if the game feels slow)`));
      },
    ],
    // 段 FX2：演出（ドットのエフェクト）の強さ。押すたびに ふつう → 控えめ → なし
    [
      t(`演出：${FX_LEVEL_NAME[fxLevel()]()}`, `Effects: ${FX_LEVEL_NAME[fxLevel()]()}`),
      () => {
        const next = FX_LEVELS[(FX_LEVELS.indexOf(fxLevel()) + 1) % FX_LEVELS.length];
        setFxLevel(next);
        toast(t(`演出：${FX_LEVEL_NAME[next]()}（${FX_LEVEL_NOTE[next]()}）`, `Effects: ${FX_LEVEL_NAME[next]()} (${FX_LEVEL_NOTE[next]()})`));
        if (next !== 'off') fxAtEl('collect-burst', root.querySelector('.isl-sheet-body .isl-btn.is-fxlevel'), { palette: FX_PAL.gold, dy: 30 });
      },
      'is-fxlevel',
    ],
    ...(tutOf(s) < TUT_DONE
      ? [
          [
            t('チュートリアルを終える', 'End the tutorial'),
            () => {
              s.tut = TUT_DONE;
              save();
            },
          ] as [string, () => void],
        ]
      : []),
  ]);
}

/** 進行速度：標準・1.5 倍・2 倍（スキルで選べるようになる） */
function openPace() {
  sysSheet(
    t('進行速度', 'Game speed'),
    t(`いまは ${s.pace ?? 1} 倍（1 日 ${(dayMs() / 1000).toFixed(1)} 秒・ひと月 ${Math.round((dayMs() * 30) / 1000)} 秒）。速くするには、スキルツリー（経営）の「業務の効率化」「業務の自動化」が要ります。⏩ はその場だけの早送りです。`, `Now ${s.pace ?? 1}× (a day is ${(dayMs() / 1000).toFixed(1)} s, a month ${Math.round((dayMs() * 30) / 1000)} s). Faster speeds need the Operations skills. ⏩ is a temporary fast-forward.`),
    () =>
      PACES.map((x): [string, () => void, string?] => {
        const ok = !x.skill || s.skills.includes(x.skill);
        return [
          !ok ? t(`${x.v} 倍（スキルで解放）`, `${x.v}× (skill)`) : x.v === 1 ? t('標準', 'Normal') : t(`${x.v} 倍`, `${x.v}×`),
          () => {
            if (!ok) {
              toast(t('スキルツリーの「経営」で解放できます', 'Unlock it in the Operations skills'));
              return;
            }
            s.pace = x.v;
            save();
          },
          x.v === (s.pace ?? 1) ? 'is-on' : '',
        ];
      }),
  );
}

function setVol(v: Partial<typeof vol>) {
  vol = { ...vol, ...v };
  sound.setVolumes(vol);
  sfx.level = vol.se;
  try {
    localStorage.setItem(SOUND, JSON.stringify(vol));
  } catch {
    // 保存できなくても切り替える
  }
}

function openSaveMenu() {
  sysSheet(t('セーブ', 'Save'), t('フェーズ 1「新天地で実績を上げろ」。進み具合はこのブラウザに自動で保存されます。', 'Phase 1: “Make your name in the new land”. Progress is saved in this browser automatically.'), () => [
    [
      t('最初から', 'Start over'),
      () =>
        modal(t('最初からやり直しますか？', 'Start over?'), t('いまの会社は消えます。', 'Your current company will be lost.'), [
          [t('やり直す', 'Start over'), () => restart(), 'is-danger'],
          [t('やめる', 'Cancel'), () => undefined],
        ]),
    ],
  ]);
}

function restart() {
  s = newP1();
  selected = null;
  placing = null;
  closePop();
  closeSheet();
  menu = null;
  sub = null;
  save();
  speed = 1;
  renderAll();
}

function openTest() {
  sysSheet(t('テスト用', 'Test tools'), t('?test=2 のときだけ出ます。', 'Shown only with ?test=2.'), () => [
    [t('資金 +50,000', 'Funds +50,000'), () => (s.money += 50000)],
    [
      t('工事をすべて終える', 'Finish all construction'),
      () => {
        for (const b of s.buildings) if (b.owner === 'me' && b.left > 0) b.left = 1;
        advance(1);
      },
    ],
    [t('1 か月進める', 'Advance a month'), () => advance(daysToClose(s))],
    [t('カリスマ +10', 'Charisma +10'), () => (s.charismaBonus = (s.charismaBonus ?? 0) + 10)],
    [
      t('士気を下げる（雇った人 1 人・次の日に辞めたい）', 'Lower morale (one hire, wants to quit tomorrow)'),
      () => {
        const st = s.staff.find((x) => ![10001, 10002, 10003].includes(x.hero) && x.quit == null) ?? s.staff.find((x) => x.quit == null);
        if (!st) return;
        st.morale = 10;
        st.low = MORALE.quit.days;
        advance(1);
      },
    ],
    [t('最初から', 'Start over'), () => restart()],
    [t('自由建築モードへ', 'Free-build mode'), () => location.assign(`${import.meta.env.BASE_URL}?test=2&mode=free`)],
  ]);
}

// ---------------------------------------------------------------- 配置

/** 広い画面（PC）では、事業別メニューを画面の右に縦に並べる。スマホは下の帯のまま */
const RAIL = matchMedia('(min-width: 1000px) and (min-height: 560px) and (orientation: landscape)');
RAIL.addEventListener('change', () => renderAll());
// ---------------------------------------------------------------- つながった地図（隣のセクタ・シームレスな移動・進出・縮小の札）
// docs/ISLAND_PHASE1.md「つながった地図」。関所を開けるまで（s.land が無いあいだ）は何も出さない

/** いちばん縮小したとき：同じ階層の全セクタが画面に入る（いまの最小の 1/3 くらいまで） */
function minZoom(): number {
  if (!s.land) return 0.2;
  const cur = sectorDef(s.land.cur);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const d of layerOf(cur.tier)) {
    const g = gridDelta(cur.id, d.id) ?? [0, 0];
    for (const p of corners(g[0] * s.n, g[1] * s.n, s.n)) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
  }
  const fit = Math.min((W - 24) / (x1 - x0), (H - 180) / (y1 - y0 + 300));
  return Math.max(0.02, Math.min(0.2 / 3, fit));
}
/** 同じ階層の全セクタのまんなか（ワールド座標）。縮小して全体を見るときにカメラを寄せる */
function layerCenter(): { x: number; y: number } | null {
  if (!s.land) return null;
  const cur = sectorDef(s.land.cur);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const d of layerOf(cur.tier)) {
    const g = gridDelta(cur.id, d.id) ?? [0, 0];
    for (const p of corners(g[0] * s.n, g[1] * s.n, s.n)) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
/** 縮小して全体に入ったら、階層のまんなかへカメラを寄せる（端のセクタの札が切れないように） */
function centerOverview(wasOv: boolean) {
  if (wasOv || !overviewOn()) return;
  const c = layerCenter();
  if (c) tween = { x0: cam.x, y0: cam.y, x1: c.x, y1: c.y, t0: performance.now() };
}
/** ホイール・「＋／−」で 1 段ずつ */
function zoomStep(dir: 1 | -1) {
  const wasOv = overviewOn();
  const zs = zoomSteps();
  cam.zoom = dir > 0 ? (zs.find((z) => z > cam.zoom + 1e-6) ?? zs[zs.length - 1]) : ([...zs].reverse().find((z) => z < cam.zoom - 1e-6) ?? zs[0]);
  dirty = true;
  if (placing) setGhost(...centerCell());
  centerOverview(wasOv);
}
const zoomBox = h('div', 'isl-zoom');
zoomBox.append(btn('+', () => zoomStep(1)), btn('−', () => zoomStep(-1)));
zoomBox.hidden = true;

/** 縮小して全体を見ている（1 セクタが画面の幅の 60% 未満） */
const overviewOn = () => !!s.land && s.n * 200 * cam.zoom < W * 0.6;

/** ワールド座標 → 画面 */
const toScreen = (i: number, j: number) => ({ x: ((i - j) * 100 - cam.x) * cam.zoom + W / 2, y: ((i + j) * 55 - cam.y) * cam.zoom + H / 2 });

/** 動かせないとき（ほかの画面・案内・置いている途中） */
const worldBusy = () => !!s.digRun || !!placing || !!tour || sheetOpen() || !!root.querySelector('.isl-modal, .isl-talk, .isl-picker') || tutOf(s) < TUT_DONE;

/** 移れなかったセクタ（中心が出るまで、もう一度は試さない。トーストが続かないように） */
let blockedTo: string | null = null;

/**
 * 出店済みの隣のセクタへ、地図をつないだまま移る。引き出しは出さない。
 * カメラは見た目が変わらないように付け直す（移った瞬間に画面が飛ばない）。
 */
function seamless(to: string): boolean {
  const land = s.land;
  if (!land) return false;
  const fromName = sectorDef(land.cur).name;
  const r = switchSector(s, to);
  if (r.err) {
    blockedTo = to;
    sfx.play('error');
    toast(r.err === 'manager' ? t('セクター長にできるヒーローがいません', 'No hero is free to be the sector head') : r.err === 'busy' ? t('そのヒーローは、ほかのセクタのセクター長です', 'That hero manages another sector') : t('このセクタへは移れません', 'You cannot move to this sector'));
    return false;
  }
  blockedTo = null;
  const d = camShift(r.delta[0], r.delta[1], s.n);
  cam.x -= d.x;
  cam.y -= d.y;
  if (drag) {
    drag.cx -= d.x;
    drag.cy -= d.y;
  }
  if (tween) {
    tween.x0 -= d.x;
    tween.x1 -= d.x;
    tween.y0 -= d.y;
    tween.y1 -= d.y;
  }
  // 前のセクタの動き（人・荷車・売上の数字）は捨てる
  anim.walkers = [];
  anim.crowd = [];
  anim.coins.clear();
  anim.plus = [];
  anim.buyer = null;
  closePop();
  selected = null;
  if (r.manager != null)
    toast(
      r.handed
        ? t(`${heroName(r.manager)}が${fromName}のセクター長に交代しました`, `${heroName(r.manager)} now heads ${fromName}`)
        : t(`${fromName}のセクター長に${heroName(r.manager)}を指名しました（適性がいちばん高い待機中のヒーロー）`, `${heroName(r.manager)} now heads ${fromName} (best available hero)`),
    );
  else if (r.back != null) toast(t(`${heroName(r.back)}が本社の仕事に戻りました`, `${heroName(r.back)} is back at HQ`));
  sfx.play('move');
  save();
  renderAll();
  return true;
}

/** 札・吹き出しから：そのセクタへ移り、カメラをそのセクタの真ん中へ */
function goSector(id: string) {
  const ov = overviewOn();
  if (!seamless(id)) return;
  closeSheet();
  const c = (s.n - 1) / 2;
  tween = { x0: cam.x, y0: cam.y, x1: 0, y1: c * 2 * 55, t0: performance.now(), dur: ov ? 500 : 700 };
}

/** 地図を動かして、画面の中心が隣の出店済みセクタに入ったら移る（境界から 1.5 マス以上入ったら） */
function checkSeamless() {
  if (!s.land || worldBusy()) return;
  const to = enteredSector(s, cam.x, cam.y);
  if (!to) {
    blockedTo = null;
    return;
  }
  if (to !== blockedTo) seamless(to);
}

/** 隣のセクタのマスを押したときの吹き出し */
function openSectorPop(id: string, i: number, j: number) {
  pop = [i, j];
  popSector = id;
  menu = null;
  sub = null;
  placing = null;
  selected = null;
  renderPop();
  centerOn(i, j);
}
function sectorPop(id: string): { title: string; body: HTMLElement } {
  const d = sectorDef(id);
  const st = s.land ? sectorState(s.land, id) : 'cloud';
  const body = h('div', 'isl-pop-body');
  body.append(h('small', 'isl-dim', tierLabel(d.tier)));
  if (d.profile.tag && st !== 'cloud') body.append(h('p', '', d.profile.tag));
  const row = h('div', 'isl-row');
  if (st === 'mine') {
    const b = sectorBadges(s).find((x) => x.id === id);
    if (b?.manager != null) body.append(h('p', 'isl-dim', t(`セクター長：${heroName(b.manager)}`, `Sector head: ${heroName(b.manager)}`)));
    row.append(btn(t(`${d.name}へ移動`, `Go to ${d.name}`), () => goSector(id), 'is-on'));
  } else if (st === 'open') {
    row.append(advanceBtn(id));
    if (letterLocked(s, id)) body.append(h('p', 'isl-warn', letterLockOf(s, id)));
  } else body.append(h('p', 'isl-warn', `🔒 ${needLine(s, d) ?? ''}`));
  if (row.childElementCount) body.append(row);
  return { title: st === 'cloud' ? '???' : d.name, body };
}

/** 「このセクタに進出（入国料 N G）」。資金が足りなければ灰色で「あと N G」 */
function advanceBtn(id: string): HTMLButtonElement {
  const d = sectorDef(id);
  // 調査依頼状が無い（Uncommon 以上）：押せず、理由はボタンの下（edgeEl・sectorPop）
  if (letterLocked(s, id)) {
    const b = btn(t(`このセクタに進出（入国料 ${money(d.fee)}）`, `Expand here (permit ${money(d.fee)})`), () => toast(letterLockOf(s, id)));
    b.disabled = true;
    return b;
  }
  // 会社として初めて上のランクへ（発掘 v2 の 7 段目）：入国料は取らず、先に確認の画面（災害と徴収）
  if (rankUpTier(s, id))
    return btn(t('このセクタに進出（災害と徴収あり）…', 'Expand here (disaster & levy)…'), () => {
      closePop();
      openRankUp(ctx, id);
    }, 'is-on');
  const short = d.fee - s.money;
  const b = btn(short > 0 ? t(`あと ${money(short)}`, `${money(short)} short`) : t(`このセクタに進出（入国料 ${money(d.fee)}）`, `Expand here (permit ${money(d.fee)})`), () => {
    closePop();
    startMove(ctx, id);
  }, short > 0 ? '' : 'is-on');
  b.disabled = short > 0;
  return b;
}

/** 地図の上に浮く札（境界の近くの「このセクタに進出」・縮小したときの状況の札） */
const worldUi = h('div', 'isl-world');
let worldKey = '';
let worldEls: { el: HTMLElement; i: number; j: number; dir?: { dx: number; dy: number } }[] = [];

function badgeEl(b: SectorBadge, mini: boolean): HTMLElement {
  const el = h('button', `isl-wbadge is-${b.state} ${mini ? 'is-mini' : ''}`);
  (el as HTMLButtonElement).type = 'button';
  el.style.setProperty('--tc', TIERS[b.tier].color);
  const gray = b.state === 'cloud' || b.state === 'locked' || b.state === 'soon';
  el.append(h('b', 'isl-wbadge-name', b.state === 'cloud' ? '???' : b.name));
  const row = h('span', 'isl-wbadge-row');
  const sz = mini ? 16 : 26;
  if (b.state === 'here' || b.state === 'mine') {
    // 1 位を 2 か月続けたのに発表がまだ：「👑 発表待ち」（縮小の札は 📜）
    row.append(h('span', `isl-wbadge-rank ${b.crown ? 'is-crown' : ''}`, b.crown ? '👑' : b.wait ? (mini ? '👑📜' : t('👑 発表待ち', '👑 Present')) : b.rank ? t(`${b.rank} 位`, `#${b.rank}`) : '—'));
    for (const x of b.items.slice(0, mini ? 1 : 3)) row.append(skuIcon(x, sz));
    if (b.state === 'here') row.append(h('span', 'isl-wbadge-here', mini ? '📍' : t('📍 いまここ', '📍 Here')));
    else if (b.manager != null) row.append(heroIcon(b.manager, sz));
  } else if (b.state === 'open' && letterLocked(s, b.id)) row.append(h('span', 'isl-wbadge-note', mini ? '🔒' : letterLockOf(s, b.id)));
  else if (b.state === 'open') row.append(h('span', 'isl-wbadge-note', mini ? t('未進出', 'New') : t(`未進出・入国料 ${money(b.fee)}`, `Not yet · permit ${money(b.fee)}`)));
  else row.append(h('span', 'isl-wbadge-note', mini ? '🔒' : `🔒 ${needLine(s, sectorDef(b.id)) ?? ''}`));
  el.append(row);
  if (!mini && b.lastRev != null && !gray) el.append(h('small', 'isl-wbadge-rev', t(`先月 ${money(b.lastRev)}`, `Last month ${money(b.lastRev)}`)));
  el.addEventListener('click', () => {
    if (b.state === 'mine') goSector(b.id);
    else if (b.state === 'open' && letterLocked(s, b.id)) toast(letterLockOf(s, b.id));
    else if (b.state === 'open') openSectorCard(b.id);
    else if (b.state === 'here') {
      const c = (s.n - 1) / 2;
      tween = { x0: cam.x, y0: cam.y, x1: 0, y1: c * 110, t0: performance.now(), z0: cam.zoom, z1: innerWidth < 600 ? 0.3 : 0.5, dur: 600 };
    } else toast(needLine(s, sectorDef(b.id)) ?? '');
  });
  return el;
}

/**
 * 隣のセクタの境界の雲の上の町の名前（段 UI4・追加の要望）：ふだんは出さず、画面の中心が境界に近づいたら（world.ts の edgeNear）ふわっと出す。
 * 文字の札だけ（金色のボタンにしない）。押すと町の詳細と進出のポップアップ（openSectorCard）
 */
function edgeEl(id: string): HTMLElement {
  const d = sectorDef(id);
  const st = s.land ? sectorState(s.land, id) : 'cloud';
  const el = h('button', `isl-wname is-${st}`);
  (el as HTMLButtonElement).type = 'button';
  el.style.setProperty('--tc', TIERS[d.tier].color);
  el.append(h('span', 'isl-wedge-tier', d.tier), h('b', '', st === 'cloud' ? '???' : d.name));
  if (st === 'mine') el.append(h('small', '', '▶'));
  else if (st !== 'open') el.append(h('small', '', '🔒'));
  el.addEventListener('click', () => openSectorCard(id));
  return el;
}
/** 町の名前を押したポップアップ（UI1 のカードの形）：名前・ランク・ひと言・他社の数・需要の多い商品・入国料と「進出する」「閉じる」 */
function openSectorCard(id: string) {
  root.querySelector('.isl-sectm')?.remove();
  closePop();
  const d = sectorDef(id);
  const st = s.land ? sectorState(s.land, id) : 'cloud';
  const adv = advanceOf(s, id);
  const facts = sectorFacts(id);
  const m = h('div', 'isl-modal isl-bulk isl-sectm');
  m.dataset.sector = id;
  const p = h('div', 'isl-bulk-panel isl-sectm-panel');
  p.style.setProperty('--tc', TIERS[d.tier].color);
  const who = h('div', 'isl-sectm-who');
  who.append(h('div', 'isl-sectm-face', d.tier));
  const idb = h('div', 'isl-sectm-id');
  idb.append(h('span', 'isl-sectm-role', t('🗺 となりの町', '🗺 Next town')), h('b', 'isl-sectm-name', st === 'cloud' ? '???' : d.name), h('small', '', tierLabel(d.tier)));
  who.append(idb);
  p.append(who);
  if (st !== 'cloud') {
    if (d.profile.tag) p.append(h('p', 'isl-sectm-tag', d.profile.tag));
    p.append(h('small', 'isl-sectm-note', TIER_NOTE[d.tier]));
    const fx = h('div', 'isl-sectm-facts');
    fx.append(h('span', '', t(`🏪 他社 ${facts.rivals} 社`, `🏪 ${facts.rivals} rivals`)));
    if (facts.hot.length) {
      const hot = h('span', 'isl-sectm-hot', t('🔥 需要の多い商品：', '🔥 In demand: '));
      for (const k of facts.hot) hot.append(skuIcon(`${k}:C` as SkuT, 24), h('span', '', PRODUCT[k]?.name ?? k));
      fx.append(hot);
    }
    if (adv.fee > 0 && adv.k !== 'go') fx.append(h('span', '', t(`💴 入国料 ${money(adv.fee)}`, `💴 Permit ${money(adv.fee)}`)));
    p.append(fx);
  }
  const close = () => m.remove();
  const row = h('div', 'isl-bulk-btns');
  const why =
    adv.k === 'short'
      ? t(`資金が足りません（あと ${money(adv.short)}）`, `Not enough funds (${money(adv.short)} short)`)
      : adv.k === 'letter'
        ? letterLockOf(s, id)
        : adv.k === 'locked'
          ? `🔒 ${needLine(s, d) ?? ''}`
          : '';
  const label = adv.k === 'go' ? t(`${d.name}へ移動`, `Go to ${d.name}`) : adv.k === 'rankup' ? t('進出する（災害と徴収あり）…', 'Expand (disaster & levy)…') : t(`進出する（入国料 ${money(adv.fee)}）`, `Expand (permit ${money(adv.fee)})`);
  const go = btn(label, () => {
    close();
    advanceGo(adv.k, { go: () => goSector(id), move: () => startMove(ctx, id), rankup: () => openRankUp(ctx, id) });
  }, adv.k === 'go' || adv.k === 'move' || adv.k === 'rankup' ? 'is-on' : '');
  go.disabled = !(adv.k === 'go' || adv.k === 'move' || adv.k === 'rankup');
  row.append(go, btn(t('閉じる', 'Close'), close));
  if (why) p.append(h('small', 'isl-bad isl-sectm-why', why));
  p.append(row);
  m.addEventListener('click', (e) => {
    if (e.target === m) close();
  });
  m.append(p);
  root.append(m);
  sfx.play('page');
}

/** 浮く札を作り直し（中身が変わったときだけ）、カメラに合わせて動かす */
function placeWorldUi() {
  const land = s.land;
  zoomBox.hidden = !land || !!placing;
  if (!land || worldBusy()) {
    worldUi.hidden = true;
    return;
  }
  const ov = overviewOn();
  const n = s.n;
  const c = (n - 1) / 2;
  const sw = n * 200 * cam.zoom;
  const mini = sw < 240;
  let key: string;
  let items: { id: string; i: number; j: number; dir?: { dx: number; dy: number }; make: () => HTMLElement }[];
  if (ov) {
    const bs = sectorBadges(s);
    key = `ov|${mini}|${JSON.stringify(bs)}|${Math.round(s.money)}|${s.letters.join()}`;
    items = bs.map((b) => ({ id: b.id, i: b.delta[0] * n + c, j: b.delta[1] * n + c, make: () => badgeEl(b, mini) }));
  } else {
    const w = worldOf(s);
    const adj = (w?.regions ?? []).filter((r) => r.adj);
    key = `edge|${land.cur}|${land.mine.join()}|${adj.map((r) => r.id).join()}|${Math.round(s.money)}|${s.letters.join()}`;
    // 隣のセクタ側の外周 3 マスの真ん中
    const mid = (STRIP - 1) / 2;
    items = adj.map((r) => {
      const [li, lj] = r.dx === 1 ? [mid, c] : r.dx === -1 ? [n - 1 - mid, c] : r.dy === 1 ? [c, mid] : [c, n - 1 - mid];
      return { id: r.id, i: li + r.oi, j: lj + r.oj, dir: { dx: r.dx, dy: r.dy }, make: () => edgeEl(r.id) };
    });
  }
  if (key !== worldKey) {
    worldKey = key;
    worldEls = items.map((x) => ({ el: x.make(), i: x.i, j: x.j, dir: x.dir }));
    worldUi.replaceChildren(...worldEls.map((x) => x.el));
  }
  worldUi.hidden = false;
  // 境界の町の名前：画面の中心が境界に近いときだけ（world.ts の edgeNear）
  const center = camCell(cam.x, cam.y);
  for (const x of worldEls) {
    const p = toScreen(x.i, x.j);
    const off = p.x < -40 || p.x > W + 40 || p.y < 40 || p.y > H - 40;
    if (x.dir) x.el.classList.toggle('is-near', !off && edgeNear(n, center, x.dir, [x.i, x.j]));
    x.el.hidden = off;
    if (off) continue;
    // 境界の札は、画面の左右の端で切れないように少し内側へ（縮小の札はセクタの真ん中のまま）
    const hw = ov ? 0 : x.el.offsetWidth / 2;
    // 境界の町の名前は、スマホでは右の「＋／−」ボタンに重ならないように少し内側へ
    const right = W - (root.classList.contains('is-rail') ? foot.getBoundingClientRect().width : 0) - (x.dir && W < 600 ? 64 : 0);
    const px = ov ? p.x : Math.max(hw + 6, Math.min(right - hw - 6, p.x));
    x.el.style.transform = `translate(${Math.round(px)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
  }
}

function layout() {
  const rail = RAIL.matches;
  root.classList.toggle('is-rail', rail);
  root.style.setProperty('--rail-w', rail ? `${Math.round(foot.getBoundingClientRect().width)}px` : '0px');
  const top = hud.getBoundingClientRect().bottom + 8;
  // 画面（札）は上の帯の下から下の帯の上まで。まわりに地図が少し見える
  root.style.setProperty('--hud-h', `${Math.round(top)}px`);
  root.style.setProperty('--foot-h', rail ? '0px' : `${Math.round(innerHeight - foot.getBoundingClientRect().top)}px`);
  const bottom = rail ? 12 : innerHeight - foot.getBoundingClientRect().top + 8;
  advisor.style.bottom = `${bottom}px`;
  // 「次の月に進む」：スマホは下の帯とマインちゃんの吹き出しの上、PC は右の帯の左・下から 24px
  if (!nextBtn.hidden) {
    const advOn = !advisor.hidden && advisor.style.display !== 'none' && advisor.getBoundingClientRect().height > 0;
    const dr = digRect();
    nextBtn.style.bottom = `${rail ? 24 : innerHeight - (dr ? dr.top : advOn ? advisor.getBoundingClientRect().top : foot.getBoundingClientRect().top) + 8}px`;
  }
  placeToasts();
  selBox.style.top = `${hud.getBoundingClientRect().top}px`;
  placePop();
}
/**
 * トーストの高さ：上の帯の下（建てるモードは選んでいる建物の札の下）。
 * 画面（シート）を開いているときは、その見出しの下へ（見出しと ✕ を隠さない。スマホではパネルの見出しの上に重なっていた）
 */
function placeToasts() {
  let y = placing ? selBox.getBoundingClientRect().bottom + 8 : hud.getBoundingClientRect().bottom + 8;
  // （見出しがトーストより下なら、そのまま）
  // 段 UI3：部門の帯が見出しの下にあれば、その下へ
  // 段 UI5b：重なりは画面の見出し（✕ のある行）で調べ、置くのは部門の帯があればその下へ
  // （前は部門の帯の位置だけで調べたので、見出しの行が上の帯のすぐ下にあると、トーストが見出しに重なっていた：外交の「✔ 引き受ける」）
  const head = root.querySelector('.isl-sheet-head')?.getBoundingClientRect();
  const band = root.querySelector('.isl-sheet-box > .isl-dband')?.getBoundingClientRect();
  if (head && head.top < y + Math.max(40, toasts.offsetHeight)) y = Math.max(y, (band && band.height > 0 && band.top >= head.top ? band.bottom : head.bottom) + 6);
  const top = `${Math.round(y)}px`;
  if (toasts.style.top !== top) toasts.style.top = top;
}
function renderAll() {
  dirty = true;
  // 発掘との出会いの最後：スキルツリーを開いたら終わり
  if (s.flags.digMeet === 'skill' && root.querySelector('.isl-tree')) {
    s.flags.digMeet = 'done';
    save();
  }
  // 発掘場のパネルは、ほかの画面（シート・メニュー・建てる）を開いたら閉じる（時間を止める画面と重ねない）
  if (digOpen() && (sheetOpen() || menu || placing || tour)) closeDig();
  root.classList.toggle('is-dig', digOpen());
  tutTick();
  renderMissions();
  renderHud();
  renderFoot();
  renderPlace();
  renderAdvisor();
  renderNext();
  layout();
  sectorChecks();
  deptChecks();
  deptTalk();
  trophyCheck();
  // 撤退した他社の店のシャッター：報告・画面を閉じて地図が見えたら
  if (pendingShutter.length && !root.querySelector('.isl-modal, .isl-rp-reveal') && !sheetOpen()) playShutters();
}
/** 段 UI6：トロフィーの判定（日が変わったか、判定に効く記録が変わったときだけ）。取ったら上に帯と音 */
let trophyKey = '';
function trophyCheck() {
  const key = `${s.day}|${!!s.flags.headEver}|${!!s.flags.landEpic}|${!!s.cleared}|${Object.keys(s.duo?.found ?? {}).length}`;
  if (key === trophyKey) return;
  trophyKey = key;
  trophyQ.push(...trophyTick(s));
  trophyFlush();
}
/** 取ったトロフィーの帯の順番待ち：そのときのトースト・カード・会話・発掘画面が消えてから 1 つずつ（トーストの列に入れるので、あとのトーストとも重ならない） */
const trophyQ: TrophyDef[] = [];
let trophyWait = 0;
function trophyFlush() {
  if (!trophyQ.length || trophyWait) return;
  if (toasts.querySelector('.isl-toast') || holdToasts() || digOpen()) {
    trophyWait = window.setTimeout(() => {
      trophyWait = 0;
      trophyFlush();
    }, 400);
    return;
  }
  const d = trophyQ.shift()!;
  const e = trophyEl(d);
  e.dataset.text = d.id;
  toasts.append(e);
  placeToasts();
  sfx.play('win');
  trophyWait = window.setTimeout(() => {
    e.remove();
    trophyWait = 0;
    trophyFlush();
  }, 4000);
}
/** 段 UI6：初めて部長を任命するとき（候補を選ぶ前）のマインちゃんの一言。画面の上に出す */
headHooks.first = (go) => talk(HEAD_PICK_TALK().map((text) => ({ text })), t('部長を選ぶ', 'Pick a head'), go, { over: true });
/** 部門のお知らせ（新しく開いた部門・理解度の節目。1 回だけ。docs/ISLAND_PHASE1.md「部門」） */
function deptChecks() {
  const had = s.flags.depts?.includes('sales');
  const hadAcct = s.flags.depts?.includes('accounting');
  const hadCs = s.flags.depts?.includes('support');
  const hadLegal = s.flags.depts?.includes('legal');
  const news = deptNews(s);
  if (!news.length) return;
  for (const n of news) toast(n);
  // 営業の部門が開いた（Rare の町に初めて進出）：「新しい部門：営業」の演出（マインちゃんの紹介は、到着の案内のあと）
  if (!had && s.flags.depts?.includes('sales')) newDeptBanner('sales');
  // 経理・総務（段 F。Uncommon の町に初めて進出）
  else if (!hadAcct && s.flags.depts?.includes('accounting')) newDeptBanner('accounting');
  // カスタマーサポート（段 G。経理・総務より後に開いたとき＝段 G の前のセーブで Uncommon にいる）
  else if (!hadCs && s.flags.depts?.includes('support')) newDeptBanner('support');
  // 法務（段 H1。Epic の町に初めて進出）：部門の演出と紹介（段 H2 で中身：M&A・契約・特許・争い）
  else if (!hadLegal && s.flags.depts?.includes('legal')) newDeptBanner('legal');
  save();
}
/** 「新しい部門」の演出：画面の真ん中に部門のアイコンと名前（光って消える） */
function newDeptBanner(d: DeptId) {
  const el = h('div', 'isl-newdept');
  el.style.setProperty('--br', DEPT[d].color);
  el.append(h('small', '', t('新しい部門', 'New department')), h('i', '', DEPT[d].icon), h('b', '', DEPT[d].name));
  for (let k = 0; k < 10; k++) {
    const sp = h('i', 'isl-spark');
    sp.style.setProperty('--a', `${k * 36}deg`);
    el.append(sp);
  }
  root.append(el);
  sfx.play('levelup');
  // 段 FX2：部門の色の花火を 1 発（明るい地図の上は縁で読める）。部門の名前に重ねないように、PC は帯の右上・スマホは帯の上の縁ではじける
  const r = el.getBoundingClientRect();
  // 花火は原点ではじける（打ち上げの玉は原点の下から昇る）
  const fx = innerWidth < 600 ? r.left + r.width / 2 : r.right + 20;
  playFx('firework-burst', fx, r.top + (innerWidth < 600 ? 0 : 20), { palette: rampOf(DEPT[d].color), opts: { core: FX_PAL.core }, delay: 250, seed: d.length * 7 });
  setTimeout(() => el.classList.add('is-out'), 2600);
  setTimeout(() => el.remove(), 3200);
}
/**
 * 部門の紹介（マインちゃん。営業・経理と総務・カスタマーサポート・法務。そのランクの町に初めて進出したあと 1 回ずつ）。
 * 段 UI2：到着の案内・災害の演出・移動が終わってから、1 日に 1 つずつ（Uncommon に着いた日に 12 枚続いていた。mine.ts の deptTalkNext）
 */
function deptTalk() {
  // 段 UI5b：読み込んだときに兼任を外した（役職は 1 人 1 つ）：マインちゃんの一言（会話が出せるときに 1 回）
  if (s.flags.roleFix?.length && tutOf(s) >= TUT_DONE && !talkWaits(uiNow())) {
    const names = s.flags.roleFix.map((id) => heroName(id)).join(t('・', ', '));
    delete s.flags.roleFix;
    save();
    talk([{ text: t(`[[${names}]]が役職を兼ねていたので、1 つだけ残して、ほかの席は[[あなた]]に戻したよ。`, `[[${names}]] held two posts, so I kept one and gave the rest back to [[you]].`) }], t('組織図を見る', 'See the org chart'), () => goSub('hr', 'org'));
    return;
  }
  // 段 UI6：初めて部長を置けるようになった（どこかの部門の理解度 8）：部長を選ぶと操作の仕方が大きく変わることを、先に一言
  const hd = headTalkDue(s);
  if (hd && !talkWaits(uiNow()) && !needsIntro(s) && !pendingReset(s) && (s.flags.talkDay ?? -1) < s.day) {
    s.flags.headTalk = true;
    s.flags.talkDay = s.day;
    save();
    talk(HEAD_OPEN_TALK(hd).map((text) => ({ text })), t('組織図を開く', 'Open the org chart'), () => goSub('hr', 'org'));
    return;
  }
  const k = deptTalkNext(s, uiNow(), { intro: needsIntro(s), reset: !!pendingReset(s) });
  if (!k) return;
  s.flags.talkDay = s.day;
  if (k === 'foot') {
    // 段 UI5b：下の帯がグループの帯になった。会話のあと、人事の入っているグループ（管理）を光らせる（自分で押してもらう）
    s.flags.footTalk = true;
    save();
    talk(FOOT_TALK().map((text) => ({ text })), t('OK', 'OK'), () => {
      footGuide = DEPT.hr.group;
      footGuideAt = performance.now();
      renderAll();
    });
  } else if (k === 'budget') {
    // 段 I1：予算で任せるの紹介 → 予算と部門の画面
    s.flags.budgetTalk = true;
    save();
    talk(BUDGET_TALK().map((text) => ({ text })), t('予算を開く', 'Open budgets'), () => goSub('strategy', 'budget'));
  } else if (k === 'sales') {
    s.flags.salesTalk = true;
    save();
    talk(SALES_INTRO().map((text) => ({ text })), t('営業を開く', 'Open Sales'), () => goSub('sales', 'area'));
  } else if (k === 'acct') {
    s.flags.acctTalk = true;
    save();
    talk(ACCT_INTRO().map((text) => ({ text })), t('経理を開く', 'Open Accounting'), () => goSub('accounting', 'tax'));
  } else if (k === 'cs') {
    s.flags.csTalk = true;
    save();
    talk(CS_INTRO().map((text) => ({ text })), t('問い合わせを開く', 'Open inquiries'), () => goSub('support', 'inbox'));
  } else {
    s.flags.legalTalk = true;
    save();
    talk(LEGAL_INTRO().map((text) => ({ text })), t('M&A を開く', 'Open M&A'), () => goSub('legal', 'ma'));
  }
}
const csHooks = () => ({ skills: () => panelsOf('support'), sat: () => openSatScreen(), inbox: () => openInboxScreen(), pr: () => openPrScreen() });
/** カスタマーサポート → 問い合わせ・顧客満足度 */
function openInboxScreen() {
  goSub('support', 'inbox');
}
/** 顧客満足度（段 UI3：問い合わせの画面にまとめた。その部分へ） */
function openSatScreen() {
  goSub('support', 'sat');
}
/** 広報と企業の格（段 UI3：ランキングの画面にまとめた。その部分へ） */
function openPrScreen() {
  goSub('marketing', 'pr');
}
/** 経理 → 税と節税 */
function openTaxScreen() {
  openTax(ctx, { books: () => openBooks(ctx), skills: () => panelsOf('accounting') });
}
/** 法務の画面（M&A・契約・特許・争い）。どの画面からもほかの 3 つへ行ける */
const legalHooks = (): LegalHooks => ({ skills: () => panelsOf('legal'), ma: () => openLegalScreen('ma'), contract: () => openLegalScreen('contract'), patent: () => openLegalScreen('patent'), suit: () => openLegalScreen('suit') });
function openLegalScreen(k: 'ma' | 'contract' | 'patent' | 'suit', rid?: string) {
  if (k === 'ma') openLegalMA(ctx, legalHooks(), rid);
  else if (k === 'contract') openContract(ctx, legalHooks());
  else if (k === 'patent') openPatents(ctx, legalHooks());
  else openSuits(ctx, legalHooks());
}
/** その部門のパネル（スキルツリーのその枝へ） */
function panelsOf(d: DeptId) {
  menu = 'strategy';
  sub = 'tree';
  closeSheet();
  openSkills(ctx, d);
  renderAll();
}
/** 営業の画面（商圏の取り合い）を開く */
function openTradeScreen() {
  openTrade(ctx, {
    areaView: () => {
      closeMenu();
      areaOverlay.on = true;
      renderAreaPill();
      renderAll();
    },
    panels: () => {
      menu = 'strategy';
      sub = 'tree';
      closeSheet();
      openSkills(ctx, 'sales');
      renderAll();
    },
  });
}
/** 地図の商圏の塗り分けを出しているあいだの札（押すと消す） */
const areaPill = h('button', 'isl-area-pill');
areaPill.type = 'button';
areaPill.hidden = true;
areaPill.addEventListener('click', () => {
  areaOverlay.on = false;
  renderAreaPill();
  renderAll();
});
function renderAreaPill() {
  areaPill.hidden = !areaOverlay.on || !s.area;
  if (!s.area) areaOverlay.on = false;
  areaPill.replaceChildren(h('span', '', t('🗺 商圏を表示中（色＝お客さんが行く会社）', '🗺 Showing trade areas (color = where customers go)')), h('b', '', '✕'));
}
root.append(worldUi, meetEl, chiefEl, hud, sectorPill, areaPill, zoomBox, pointEl, missionBox, tourEl, toasts, advisor, nextBtn, placeBox, popEl, foot, selBox, ghostUi);
resize();
renderAll();
// 始めたばかりなら、建築の一覧を開いておく
if (!s.buildings.some((b) => b.owner === 'me')) openBuildTab();

// ---------------------------------------------------------------- 地図の操作

const pts = new Map<number, { x: number; y: number }>();
let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
let pinch: { d: number; zoom: number } | null = null;
/** ホイールと「＋／−」の段。関所を開けたあとは、同じ階層の全セクタが入るところまで縮小できる */
const zoomSteps = () => {
  const lo = minZoom();
  return [...new Set([lo, ...(s.land && lo < 0.12 ? [0.12] : []), 0.25, 0.5, 1, 2])].sort((a, b) => a - b);
};
const clampZoom = (z: number) => Math.max(minZoom(), Math.min(2, z));
const local = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  return pick(cam, W, H, e.clientX - r.left, e.clientY - r.top);
};

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tween = null;
  if (pts.size === 2) {
    const [a, b] = [...pts.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: cam.zoom };
    drag = null;
  } else drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pts.size === 2) {
    const [a, b] = [...pts.values()];
    cam.zoom = clampZoom((pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
    dirty = true;
    if (placing) setGhost(...centerCell());
    return;
  }
  if (drag) {
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (drag.moved) {
      cam.x = drag.cx - dx / cam.zoom;
      cam.y = drag.cy - dy / cam.zoom;
      dirty = true;
      // 置くときは、地図を動かすと建物が画面の真ん中のマスへ
      if (placing) setGhost(...centerCell());
    }
    return;
  }
});
canvas.addEventListener('pointerup', (e) => {
  pts.delete(e.pointerId);
  if (pinch) {
    if (pts.size < 2) {
      // ピンチで全体まで縮小したら、階層のまんなかへ寄せる（はじめから全体だったときは寄せない）
      const wasOv = !!s.land && s.n * 200 * pinch.zoom < W * 0.6;
      pinch = null;
      centerOverview(wasOv);
    }
    return;
  }
  const d = drag;
  drag = null;
  if (!d || d.moved) return;
  // 発掘作業のあいだは、地図のマスを押しても吹き出しを出さない
  if (s.digRun) return busyDig();
  const [i, j] = local(e);
  if (placing) {
    // 置いている建物のマスをもう一度押すと建てる。ほかのマスなら、そこを真ん中にして建物を動かす
    if (placing.i === i && placing.j === j) tryPlace();
    else {
      setGhost(i, j);
      tweenTo(i, j);
    }
    return;
  }
  if (menu) {
    menu = null;
    sub = null;
  }
  // つながった地図：隣のセクタのマスは、いまのセクタの操作の対象にしない（そのセクタの小さな吹き出し）
  const reg = worldOf(s)?.at(i, j);
  if (reg) {
    openSectorPop(reg.id, i, j);
    renderAll();
    return;
  }
  // 道路は押しても何も出さない（地図を動かそうとして押してしまうことが多いので）。開いている吹き出しは閉じる
  if (ground(s, i, j) === 'road') {
    closePop();
    renderAll();
    return;
  }
  openPop(i, j);
  renderAll();
});
canvas.addEventListener('pointercancel', (e) => {
  pts.delete(e.pointerId);
  drag = null;
  pinch = null;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    zoomStep(e.deltaY < 0 ? 1 : -1);
    if (placing) setGhost(...centerCell());
  },
  { passive: false },
);
addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement)?.tagName === 'SELECT') return;
  // 段 UI2：会話のあいだは、セリフ送り（スペース・Enter）だけ。ほかのキー（Esc・R・時間の ⏸）は効かない
  const talking = [...root.querySelectorAll<HTMLElement>('.isl-talk')].pop();
  if (talking) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      talkKeys.get(talking)?.();
    }
    return;
  }
  // 流れの案内も、タップで進む一言のときはスペース・Enter で進む
  if (tour) {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      tourEl.querySelector<HTMLElement>('.isl-tour-box.is-click')?.click();
    }
    return;
  }
  if (e.key === 'Escape') {
    placing = null;
    closePop();
    closeSheet();
    menu = null;
    sub = null;
    renderAll();
  } else if (e.key === 'r' || e.key === 'R') {
    if (placing) {
      const ok = allowedDirs(s, placing.id, placing.i, placing.j, ignoreOf());
      if (ok.length) placing.dir = ok[(ok.indexOf(placing.dir) + 1) % ok.length];
    } else if (selected != null) turn(s, selected);
    renderAll();
  } else if (e.key === ' ') {
    e.preventDefault();
    speed = speed ? 0 : 1;
    renderHud();
  }
});
addEventListener('visibilitychange', () => {
  if (document.hidden) save();
});

// ---------------------------------------------------------------- 時間

/** 1 日の長さ（ms）。標準 1.2 秒で、スキルで選べる進行速度で短くなる */
const dayMs = () => DAY_BASE_MS / (s.pace ?? 1);
let acc = 0;

// ---------------------------------------------------------------- 地図の上の動き（サイクルを見せる）

const anim = newAnim();
const pathCache = new Map<string, [number, number][] | null>();
function pathOf(a: [number, number], b: [number, number]) {
  const k = `${a}|${b}|${s.seed}`;
  if (!pathCache.has(k)) pathCache.set(k, roadPath(s, a, b));
  return pathCache.get(k) ?? null;
}
/** お客さんになるヒーロー（Common） */
const GUESTS = [1001, 1002, 1003, 1005, 1006, 1008, 1009, 1011, 1013, 1014, 1016, 1018].filter((id) => heroById.has(id));

/** 売れたら、近くの家からお客さんが歩いてきて、着いたら売上が浮かぶ */
function spawnCustomers(sales: { uid: number; yen: number }[]) {
  sales.forEach((x, k) => {
    const shop = s.buildings.find((b) => b.uid === x.uid);
    const homes = s.buildings.filter((b) => b.owner === 'town' && DEF[b.id].cat === 'home');
    let path: [number, number][] | null = null;
    if (shop && homes.length && anim.walkers.length < 40) {
      const near = [...homes].sort((a, b) => Math.abs(a.i - shop.i) + Math.abs(a.j - shop.j) - (Math.abs(b.i - shop.i) + Math.abs(b.j - shop.j))).slice(0, 10);
      const home = near[Math.floor(Math.random() * near.length)];
      path = pathOf(doorOf(home), doorOf(shop));
    }
    if (!path || path.length < 2) {
      addCoin(x.uid, x.yen, anim.clock);
      return;
    }
    anim.walkers.push({ hero: GUESTS[Math.floor(Math.random() * GUESTS.length)] ?? 1001, path, t0: anim.clock + k * 260, dur: Math.max(900, path.length * 190), uid: x.uid, yen: x.yen });
  });
}
function addCoin(uid: number, yen: number, t: number) {
  const list = anim.coins.get(uid) ?? [];
  list.push({ yen, t });
  while (list.length > 12) list.shift();
  anim.coins.set(uid, list);
  sfx.play('sale');
  coinFx(uid);
}
/** 建物の区画のまんなかの、手前の地面（ワールドの座標） */
function bldFoot(uid: number): [number, number] | null {
  const b = s.buildings.find((x) => x.uid === uid);
  const def = b ? DEF[b.id] : undefined;
  if (!b || !def) return null;
  const cs = cells(def, b.i, b.j, b.dir);
  return [cs.reduce((a, [i, j]) => a + (i - j) * 100, 0) / cs.length, cs.reduce((a, [i, j]) => a + (i + j) * 55, 0) / cs.length + 30];
}
/** 段 FX2：製造の槌の火花（工房の上。同じ工房は 1 秒に 1 つ・縮小の全体表示と発掘のあいだは出さない） */
function craftFx(uid: number) {
  if (overviewOn() || digOpen()) return;
  const at = bldFoot(uid);
  if (at) mapFx('hammer-sparks', at[0], at[1] - 40, { scale: Math.max(1, cam.zoom * 3), thin: `craft:${uid}`, seed: (uid * 17 + Math.floor(performance.now())) >>> 0 });
}
/** 段 FX2：外交の依頼を届けたトーストの横で自社の色の光 */
function diploFx(e: HTMLElement | null) {
  toastFx(e, 'collect-burst', { palette: FX_PAL.ours, dy: 30 });
}
/** 売上のコイン（pixelfx。docs/ISLAND_FX.md）：お店の足もとからコインが跳ねる。同じお店は 0.35 秒に 1 回まで・縮小の全体表示と発掘のあいだは出さない */
const coinFxAt = new Map<number, number>();
function coinFx(uid: number) {
  const now = performance.now();
  if (now - (coinFxAt.get(uid) ?? -1e9) < 350 || overviewOn() || digOpen()) return;
  const b = s.buildings.find((x) => x.uid === uid);
  const def = b ? DEF[b.id] : undefined;
  if (!b || !def) return;
  const cs = cells(def, b.i, b.j, b.dir);
  // 区画のまんなかの、手前の地面
  const wx = cs.reduce((a, [i, j]) => a + (i - j) * 100, 0) / cs.length;
  const wy = cs.reduce((a, [i, j]) => a + (i + j) * 55, 0) / cs.length + 30;
  coinFxAt.set(uid, now);
  playFx('coin-pop', 0, 0, {
    layer: 'map',
    // 地図の拡大率に合わせる（拡大率 0.5 で 1 ドット＝1.5 CSS px。デバイスの画素で整数倍に丸める）
    scale: Math.max(1, cam.zoom * 3),
    seed: (uid * 31 + Math.floor(now)) >>> 0,
    anchor: () => (digOpen() ? null : { x: (wx - cam.x) * cam.zoom + W / 2, y: (wy - cam.y) * cam.zoom + H / 2 }),
  });
}
// ---------------------------------------------------------------- 街の人通り（他社のお客さん・駅を行き交う人・散歩する人）

const CROWD_KEY = 'mycryptoisland.p1.crowd';
const CROWD_LEVELS = [
  { key: 'many', n: 30, name: t('多い', 'Busy') },
  { key: 'normal', n: 18, name: t('ふつう', 'Normal') },
  { key: 'few', n: 8, name: t('少ない', 'Quiet') },
  { key: 'none', n: 0, name: t('なし', 'Off') },
] as const;
let crowdLevel = 1;
try {
  const k = CROWD_LEVELS.findIndex((x) => x.key === localStorage.getItem(CROWD_KEY));
  if (k >= 0) crowdLevel = k;
} catch {
  // 既定はふつう
}
let nextCrowd = 0;
let roadCells: [number, number][] = [];
const anyOf = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
/** 道のりのひとつ（他社のお店へ・駅と家・散歩） */
function crowdPath(): [number, number][] | null {
  if (!roadCells.length) for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (ground(s, i, j) === 'road') roadCells.push([i, j]);
  const homes = s.buildings.filter((b) => b.owner === 'town' && DEF[b.id].cat === 'home');
  const near = (b: { i: number; j: number }) => [...homes].sort((x, y) => Math.abs(x.i - b.i) + Math.abs(x.j - b.j) - (Math.abs(y.i - b.i) + Math.abs(y.j - b.j))).slice(0, 10);
  const r = Math.random();
  if (r < 0.4) {
    // 他社のお店：強い会社ほどお客さんが多い。入っていく人と、出てきて帰る人
    const stores = s.buildings.filter((b) => s.rivals.some((x) => x.id === b.owner));
    if (!stores.length || !homes.length) return null;
    const weight = (b: (typeof stores)[number]) => Object.values(s.rivals.find((x) => x.id === b.owner)?.sells ?? {}).reduce<number>((a, v) => a + (v ?? 0), 0.5);
    let w = Math.random() * stores.reduce((a, b) => a + weight(b), 0);
    let store = stores[0];
    for (const b of stores) if ((w -= weight(b)) <= 0) {
      store = b;
      break;
    }
    const home = anyOf(near(store));
    const p = pathOf(doorOf(home), doorOf(store));
    return p && Math.random() < 0.4 ? [...p].reverse() : p;
  }
  if (r < 0.7) {
    // 駅を行き交う人
    const st = s.buildings.find((b) => b.id === 'station');
    if (!st || !homes.length) return null;
    const p = pathOf(doorOf(st), doorOf(anyOf(homes)));
    return p && Math.random() < 0.5 ? [...p].reverse() : p;
  }
  // 散歩：道路の上をぶらぶら（ときどき公園へ）
  const park = s.buildings.find((b) => b.id === 'park');
  const a = anyOf(roadCells);
  const b = park && Math.random() < 0.35 ? doorOf(park) : anyOf(roadCells.filter(([i, j]) => Math.abs(i - a[0]) + Math.abs(j - a[1]) > 4 && Math.abs(i - a[0]) + Math.abs(j - a[1]) < 14));
  return b ? pathOf(a, b) : null;
}
/** 人通りを目標の人数に保つ（はじめは歩いている途中の人も置いて、街がすぐにぎわうように） */
function tickCrowd() {
  const target = CROWD_LEVELS[crowdLevel].n;
  anim.crowd = anim.crowd.filter((w) => anim.clock < w.t0 + w.dur);
  if (anim.crowd.length >= target) return;
  // 最初（とても少ないとき）は、歩いている途中の人を置いてすぐにぎわわせる
  const fresh = anim.crowd.length < target / 3;
  if (!fresh && anim.clock < nextCrowd) return;
  nextCrowd = anim.clock + 120 + Math.random() * 160;
  const p = crowdPath();
  if (!p || p.length < 3) return;
  const dur = p.length * (340 + Math.random() * 140);
  anim.crowd.push({ hero: anyOf(GUESTS) ?? 1001, path: p, t0: fresh ? anim.clock - Math.random() * dur * 0.7 : anim.clock, dur });
}

/** 時計を進めて、着いたお客さんの売上を出す */
function tickAnim(dtGame: number) {
  anim.clock += dtGame;
  tickCrowd();
  for (const w of anim.walkers) {
    if (!w.done && anim.clock >= w.t0 + w.dur) {
      w.done = true;
      if (w.uid != null && w.yen != null) addCoin(w.uid, w.yen, anim.clock);
    }
  }
  anim.walkers = anim.walkers.filter((w: Walker) => !w.done);
  anim.plus = anim.plus.filter((p) => anim.clock - p.t < 1500);
  // 調達係：往復の進み
  const trip = s.buyTrip;
  const ws = myWorkshop(s);
  const wh = wholesaler(s);
  if (trip && ws && wh) {
    const path = pathOf(doorOf(ws), doorOf(wh));
    const k = Math.max(0, Math.min(1, (trip.total - trip.left + acc / dayMs()) / trip.total));
    const carry = (Object.keys(trip.cargo)[0] ?? null) as Mat | null;
    anim.buyer = path ? { hero: trip.hero, path, k, carry } : null;
  } else anim.buyer = null;
  // 注文：納期の歩く日数のあいだ、問屋の人が卸問屋から工房へ歩いてくる
  const walk = walkDays(s);
  anim.couriers = [];
  if (ws && wh && s.orders?.length) {
    const path = pathOf(doorOf(wh), doorOf(ws));
    if (path)
      for (const o of s.orders) {
        if (o.left > walk) continue;
        const f = Math.max(0, Math.min(1, (walk - o.left + acc / dayMs()) / walk));
        anim.couriers.push({ hero: o.courier, path, f, carry: o.m });
      }
  }
  // 流れの案内：卸問屋から工房へ、素材を届ける人
  if (tour?.deliver && ws && wh) {
    const path = pathOf(doorOf(ws), doorOf(wh));
    const f = Math.min(1, (performance.now() - tour.deliver.t0) / tour.deliver.dur);
    if (path) anim.buyer = { hero: tour.deliver.hero, path, k: 0.5 + f * 0.5, carry: tour.deliver.mat };
  }
}
const animating = () => !!anim.mark || anim.crowd.length > 0 || anim.walkers.length > 0 || !!anim.buyer || s.trips.length > 0 || !!s.orders?.length || anim.plus.length > 0 || s.slots.some((sl) => sl.running) || [...anim.coins.values()].some((l) => l.some((c) => anim.clock - c.t < 2600));
let lastDraw = 0;
let last = performance.now();
let lastWater = -1;

/** 日を進める（報告が出たら止めて見せる） */
function advance(days: number) {
  ticking = true;
  for (let k = 0; k < days; k++) {
    // 流れの案内を見ているあいだの日数は、最初の月の締めまでの日数に数えない（案内の途中や直後に締めが来ないように）
    if (tour && s.open !== null && !s.reports.length) s.open++;
    // 操作がないまま進んだ日（発掘との出会い）
    if (!tour) idleDays++;
    const r = step(s);
    for (const b of r.finished) {
      fx.push({ uid: b.uid, start: performance.now() });
      toast(t(`${DEF[b.id].name}が完成しました！`, `${DEF[b.id].name} is complete!`));
      sfx.play('done');
    }
    if (r.crafted.length) sfx.play('craft');
    const wsb = myWorkshop(s);
    if (wsb) for (const m of r.made) anim.plus.push({ uid: wsb.uid, n: m.n, t: anim.clock });
    // 段 FX2：工房の上で槌の火花（同じ工房は 1 秒に 1 つ）
    if (wsb && r.made.length) craftFx(wsb.uid);
    if (r.sales.length) spawnCustomers(r.sales);
    // 開いている店内の様子に、買うお客さんを来させる
    for (const x of r.sales) shopSceneSale(x.uid, x.sku, x.yen);
    // 流れの案内で店内を見ているあいだは、レジで払うまで上の帯の数字に入れない
    if (tour && TOUR[tour.k].key === 'inside') tourUnpaid += r.sales.reduce((a, x) => a + x.yen, 0);
    if (tour) tourOn(r.made.length > 0 ? 'made' : null, r.delivered.some((x) => x.n > 0 && myShops(s).some((b) => b.uid === x.to)) ? 'dropped' : null);
    if (r.missions.length) sfx.play('mission');
    if (r.leveled?.length) levelNews(r.leveled);
    // 段 UI1：任せた提案（★3 のヒーローが自分で実行した）
    for (const x of takeAuto(s)) toast(autoText(s, x));
    if (r.hr) hrNews(r.hr);
    // 段 UI5a（お店の自走）：店長が休んで、回す従業員もいないので閉まった（その月の初めの 1 回だけ。店長の一言）
    for (const uid of r.closed ?? []) {
      const key = `${uid}:${s.reports.length}`;
      if (closedTold.has(key)) continue;
      closedTold.add(key);
      const hero = s.shops[uid]?.staff;
      const b = s.buildings.find((x) => x.uid === uid);
      const nm = b ? DEF[b.id]?.name ?? '' : '';
      toast(hero != null ? t(`${heroName(hero)}「休みの日は${nm}が閉まってしまいます。従業員 2 人いれば開けておけます」`, `${heroName(hero)}: “${nm} closes on my days off. Two staff could keep it open.”`) : t(`${nm}が閉まりました（店長が休み）`, `${nm} closed (manager off)`));
    }
    // 法務（段 H2）：M&A の話の進み・特許の審査が終わった
    if (r.legal) for (const x of legalToasts(r.legal)) toast(x);
    // 外交（段 UI4）：使者の依頼がそろった・期限が切れた
    for (const q of r.diplo?.done ?? []) diploFx(toast(t(`🌐 ${landDef(q.land).name}の依頼を届けた！ +${q.reward.toLocaleString('en-US')} G・研究 +${q.rp} RP・仲 ${Math.round(relOf(s, q.land))}`, `🌐 Delivered ${landDef(q.land).name}’s request! +${q.reward.toLocaleString('en-US')} G, +${q.rp} RP, relations ${Math.round(relOf(s, q.land))}`)));
    for (const q of r.diplo?.late ?? []) toast(t(`🌐 ${landDef(q.land).name}の依頼が期限切れ…仲が下がった（${Math.round(relOf(s, q.land))}）`, `🌐 ${landDef(q.land).name}’s request expired… relations fell (${Math.round(relOf(s, q.land))})`));
    for (const g of r.grew) toast(t(`${heroName(g.hero)}の ${g.stat.toUpperCase()} が 1 上がりました（バイトの経験）`, `${heroName(g.hero)}’s ${g.stat.toUpperCase()} rose by 1 (part-time work)`));
    if (r.procLv) {
      toast(t(`調達ランクが Lv.${r.procLv} に上がりました`, `Buying rank is now Lv.${r.procLv}`));
      sfx.play('levelup');
    }
    for (const x of r.crafted) toast(t(`${PRODUCT[skuParts(x)[0]].name}ができました`, `${PRODUCT[skuParts(x)[0]].name} crafted`));
    for (const m of r.routes) toast(t(`${MATS[m].name}のルートを開拓しました！`, `Opened a ${MATS[m].name} route!`));
    for (const x of r.intel) toast(t(`${rivalName(x.rid)}の調査が段階 ${x.lv} に進みました`, `Research on ${rivalName(x.rid)} reached stage ${x.lv}`));
    for (const k2 of r.developed) toast(t(`${PRODUCT[k2].name}のアンコモンを開発しました！`, `Developed the ${PRODUCT[k2].name} Uncommon!`));
    // 技の修行が終わった
    for (const x of r.learned ?? []) {
      toast(plain(t(`${heroName(x.hero)}が[[${SKILL[x.id]?.name ?? x.id}]]を身につけた！`, `${heroName(x.hero)} mastered [[${SKILL[x.id]?.name ?? x.id}]]!`)));
      sfx.play('levelup');
    }
    for (const id of r.missions) toast(t(`依頼「${MISSIONS.find((m) => m.id === id)?.title ?? ''}」を達成しました`, `Request done: ${MISSIONS.find((m) => m.id === id)?.title ?? ''}`));
    if (r.company) {
      const c = r.company;
      // 発掘作業のあいだに締めた月のトーストは、作業のあとにまとめて
      if (holdReport(s)) heldNews.push(() => companyNews(c));
      else companyNews(c);
    }
    // 注文が届いた：問屋の人が工房に入って在庫になり、卸問屋へ帰っていく
    for (const o of r.orders ?? []) {
      toast(t(`${heroName(o.courier)}が${MATS[o.m].name} ${o.qty} 個を届けてくれました`, `${heroName(o.courier)} delivered ${o.qty} ${MATS[o.m].name}`));
      const ws2 = myWorkshop(s);
      const wh2 = wholesaler(s);
      const back = ws2 && wh2 ? pathOf(doorOf(ws2), doorOf(wh2)) : null;
      if (back) anim.walkers.push({ hero: o.courier, path: back, t0: anim.clock + 300, dur: walkDays(s) * dayMs() });
    }
    if (r.report) {
      const rep = r.report;
      // 発掘作業のあいだ：月の締めは行うが、月末ポーズと月次報告の画面・ニュースのトーストは作業のあとにまとめて（finishDig）
      if (holdReport(s)) {
        heldNews.push(() => reportNews(rep));
        save();
        continue;
      }
      reportNews(rep);
      save();
      // 流れの案内のあいだは、終わってから出す
      if (tour) tourReport = rep;
      else showReport(rep);
      break;
    }
  }
  refreshSheet();
  refreshDig();
  if (pop && !(document.activeElement instanceof HTMLSelectElement && popEl.contains(document.activeElement))) renderPop();
  renderAll();
  ticking = false;
  checkMeet();
}

/**
 * ヒーローの育成（段 E1）：レベルアップのトースト。1 日に 2 人までは 1 人ずつ（「シップ 君が Lv 12 に！ PHY +1」）、
 * 3 人以上は 1 つにまとめる（くどくしない。名前は月次報告の「今月のレベルアップ」に）。上限 Lv に届いたら「昇格できる」
 */
/** 人事のお知らせ（段 E2）：カリスマ度が上がった・辞めたいの予告・思いとどまった・辞めた */
function hrNews(x: HrDay) {
  if (x.charisma) {
    const c = x.charisma;
    toast(c.cap ? t(`👑 カリスマ度 ${c.from} → ${c.to}！ ${HERO_RARITY[c.cap].name}のヒーローを雇えるようになった`, `👑 Charisma ${c.from} → ${c.to}! You can now hire ${HERO_RARITY[c.cap].name} heroes`) : t(`👑 カリスマ度 ${c.from} → ${c.to}`, `👑 Charisma ${c.from} → ${c.to}`));
    if (c.cap) sfx.play('levelup');
  }
  for (const id of x.want) {
    const st = s.staff.find((y) => y.hero === id);
    toast(t(`😣 ${heroName(id)}が「辞めたい」と言っている（あと ${st ? quitLeft(s, st) : 0} 日）。人事 → 給与・労務で引き止めよう`, `😣 ${heroName(id)} wants to quit (in ${st ? quitLeft(s, st) : 0} days). Talk them round in HR → Pay & welfare`));
    sfx.play('error');
  }
  for (const id of x.stay) toast(t(`🙂 ${heroName(id)}が思いとどまってくれた`, `🙂 ${heroName(id)} decided to stay`));
  for (const id of x.quit) {
    toast(t(`💼 ${heroName(id)}が会社を辞めました`, `💼 ${heroName(id)} left the company`));
    sfx.play('error');
  }
}
function levelNews(ups: LevelUp[]) {
  const names = (x: LevelUp) => (['phy', 'int', 'agi'] as const).filter((k) => (x.gain[k] ?? 0) > 0).map((k) => `${k.toUpperCase()} +${x.gain[k]}`).join(t('・', ', '));
  let te: HTMLElement | null = null;
  if (ups.length <= 2)
    for (const x of ups) {
      const g = names(x);
      te = toast(t(`⭐ ${heroName(x.hero)}が Lv ${x.to} に！${g ? ` ${g}` : ''}`, `⭐ ${heroName(x.hero)} reached Lv ${x.to}!${g ? ` ${g}` : ''}`)) ?? te;
    }
  else te = toast(t(`⭐ ${ups.length} 人がレベルアップ！（くわしくは人事 → ヒーローの育成）`, `⭐ ${ups.length} heroes leveled up! (HR → Hero growth)`));
  // 段 FX2：レベルアップのトーストの ⭐ で自社の色の光（小さな手応え。1 秒に 1 つ。地図には出さない）
  if (ups.length) toastFx(te, 'collect-burst', { palette: FX_PAL.ours, dy: 30 });
  for (const x of ups) {
    for (const k of x.passives) toast(t(`✦ ${heroName(x.hero)}のパッシブ「${PASSIVES[k].name}」が開いた`, `✦ ${heroName(x.hero)} unlocked the passive “${PASSIVES[k].name}”`));
    if (x.cap) toast(t(`🎖 ${heroName(x.hero)}が上限 Lv ${x.to}！ 強化アイテムで昇格できるよ`, `🎖 ${heroName(x.hero)} hit the level cap (${x.to})! Promote with an item`));
  }
  sfx.play('levelup');
}

function playShutters() {
  if (!pendingShutter.length) return;
  const now = performance.now();
  const b = s.buildings.find((x) => x.uid === pendingShutter[0]);
  if (b && tutOf(s) >= TUT_DONE) {
    cam.x = (b.i - b.j) * 100;
    cam.y = (b.i + b.j) * 55 - 40;
  }
  pendingShutter.forEach((uid, k) => shutterFx.set(uid, now + 300 + k * 500));
  // 段 FX2：シャッターが下りきったところで灰色の煙がぽんと出る（地図の層）
  pendingShutter.forEach((uid, k) => {
    const at = bldFoot(uid);
    if (at) mapFx('poof', at[0], at[1], { palette: FX_PAL.smoke, opts: { stars: [FX_PAL.gold[4], FX_PAL.gold[6], '#ffffff'] }, scale: Math.max(1, cam.zoom * 3), delay: 300 + k * 500 + 2100, seed: uid });
  });
  pendingShutter.length = 0;
  dirty = true;
}
/** 月の締めのトースト：他社の追随・撤退、OJT、他社の反撃 */
function reportNews(rep: NonNullable<ReturnType<typeof step>['report']>) {
  // 他社の追随：自社が売っている商品を、他社が真似して売り始めた
  for (const n of rep.news) {
    const [who, what, kind] = n.split('|');
    if (kind === 'out') toast(plain(t(`${who}が[[${what}]]から撤退した（売れなかった）`, `${who} pulled out of [[${what}]] (it didn't sell)`)));
    // 復刻品の独占が切れて、他社が後追いしてきた
    else if (kind === 'copy') toast(plain(t(`${who}が「${what}」を真似しはじめた`, `${who} started copying “${what}”`)));
    else toast(plain(t(`${who}が[[${what}]]を売り始めた`, `${who} started selling [[${what}]]`)));
  }
  // カスタマーサポート（段 G）：問い合わせが届いた・炎上のおそれ・炎上
  const cr = rep.cs;
  if (cr) {
    const fresh = cr.got - cr.auto;
    if (fresh > 0) toast(t(`🎧 問い合わせが ${fresh} 件届いた（カスタマーサポート → 問い合わせ）`, `🎧 ${fresh} new inquir${fresh > 1 ? 'ies' : 'y'} (Customer Support → Inquiries)`));
    if (cr.ignited) {
      toast(t('🔥 炎上！ 来店とブランド力が下がった。広報の火消しと、合う返事で早くおさまる', '🔥 Backlash! Visits and brand are down. Damage control and fitting replies cool it'));
      sfx.play('error');
    } else if (cr.warn && !s.cs?.warn?.done) toast(cr.warn === 'out' ? t('⚠ 炎上のおそれ：品切れが続いている。今月も続くと炎上（顧客満足度の画面で手を打てる）', '⚠ Backlash risk: sell-outs keep happening. Another month and it blows up (act from Satisfaction)') : t('⚠ 炎上のおそれ：問い合わせを放っておいた。今月も続くと炎上（顧客満足度の画面で手を打てる）', '⚠ Backlash risk: ignored inquiries. Another month and it blows up (act from Satisfaction)'));
  }
  // OJT：担当のある人の能力が上がった
  if (rep.ojt) toast(t(`OJT：${rep.ojt} 人の能力が 1 上がりました`, `OJT: ${rep.ojt} staff gained +1 in a stat`));
  // 他社の反撃：1 位を取った月から、他社が宣伝を始める
  const ra = rep.rally;
  if (ra) toast(plain(t(`他社が反撃！ [[${ra.by}]]が宣伝を始めた（${ra.months} か月）`, `Rivals strike back! [[${ra.by}]] started advertising (${ra.months} months)`)));
  // 他社の巻き返し（Uncommon）：2 位の会社がセールを始めた
  const cb = rep.comeback;
  if (cb) toast(plain(t(`[[${cb.by}]]がセールで巻き返してきた！（${cb.months} か月）`, `[[${cb.by}]] is fighting back with a sale! (${cb.months} months)`)));
  // 商圏の取り合い（Rare の町 ②）：他社の店の撤退（シャッターの演出）・空き店舗に他社が入った・会社が町から撤退
  const tr = rep.trade;
  if (tr) {
    for (const q of tr.quit) {
      // シャッターの演出は、報告を閉じて地図に戻ったときに（playShutters）
      shutterFx.set(q.uid, Infinity);
      pendingShutter.push(q.uid);
      toast(t(`🏚 ${storeName(s, q.uid, q.rid)}が撤退した！ 空き店舗にすぐ出店できる`, `🏚 ${storeName(s, q.uid, q.rid)} closed! You can move into the vacant store`));
    }
    if (tr.quit.length) sfx.play('clear');
    // 調整 1：町から撤退した会社が戻ってきた（その会社の 1 軒目の出店は「戻ってきた」の 1 回にまとめる）
    const back = new Set(tr.back ?? []);
    if (back.size) {
      const names = [...back].map(rivalName);
      toast(t(`🔁 ${names.join('・')}が町に戻ってきた！ 空き店舗に出店して、また張り合ってくる`, `🔁 ${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} back in town! Opened in vacant stores to compete again`));
    }
    const rest = tr.refill.filter((q) => !back.delete(q.rid));
    // まとめて入った月は 1 つのトーストに（トーストは 3 つまでなので、「戻ってきた」が押し出されないように）
    if (rest.length === 1) toast(t(`🏪 ${storeName(s, rest[0].uid, rest[0].rid)}が空き店舗に新しく出店した`, `🏪 ${storeName(s, rest[0].uid, rest[0].rid)} opened in a vacant store`));
    else if (rest.length > 1) toast(t(`🏪 他社が空き店舗に ${rest.length} 軒、新しく出店した（営業）`, `🏪 Rivals opened in ${rest.length} vacant stores (Sales)`));
    for (const id of tr.gone) toast(t(`${rivalName(id)}が町から撤退した！ ライバルが 1 社減った`, `${rivalName(id)} left town! One fewer rival`));
  }
}

/** 会社の月の締め：マネージャーのセクタの結果・四半期の決算 */
function companyNews(c: NonNullable<ReturnType<typeof step>['company']>) {
  for (const x of c.managed) {
    const name = sectorDef(x.id).name;
    // 被災した町の復興（発掘 v2 の 7 段目）：直した数・支援金が尽きた・担当の伸び
    const rv = x.revive;
    if (rv) {
      if (rv.fixed) toast(t(`🏗 ${name}：${rv.fixed} 軒を直した（${rv.all - rv.left} / ${rv.all} 軒）`, `🏗 ${name}: rebuilt ${rv.fixed} (${rv.all - rv.left} / ${rv.all})`));
      if (rv.left === 0 && rv.fixed) toast(t(`🎉 ${name}の復興が終わった！${rv.refund ? `（残りの支援金 ${money(rv.refund)} は本社へ）` : ''}`, `🎉 ${name} is fully rebuilt!${rv.refund ? ` (${money(rv.refund)} of funds returned)` : ''}`));
      else if (rv.out) toast(t(`🏚 ${name}：支援金が尽きた（ランドマップから追加で送れる）`, `🏚 ${name}: recovery funds ran out (send more from the land map)`));
      const g = Object.entries(rv.grow);
      const ups = g.map(([k, v]) => `${k.toUpperCase()} +${v}`).join(t('・', ' · '));
      if (g.length && x.hero != null) toast(t(`${heroName(x.hero)}が復興の担当で成長！ ${ups}`, `${heroName(x.hero)} grew leading the rebuild! ${ups}`));
      if (x.rev === 0 && x.profit === 0) continue;
    }
    toast(
      x.profit >= 0
        ? t(`${name}：利益 ${money(x.profit)}（本社へ ${money(x.toHQ)}・投資 ${money(x.invest)}）`, `${name}: profit ${money(x.profit)} (to HQ ${money(x.toHQ)}, reinvested ${money(x.invest)})`)
        : t(`${name}：赤字 ${money(-x.profit)}（本社が負担）`, `${name}: loss ${money(-x.profit)} (paid by HQ)`),
    );
  }
  if (c.quarter) {
    sfx.play('report');
    const acct = menuDepts(s).includes('accounting');
    toast(acct ? t(`第 ${c.quarter} 四半期の決算が出ました（経理 → 決算書）`, `Q${c.quarter} statements are ready (Accounting → Statements)`) : t(`第 ${c.quarter} 四半期の決算が出ました（経営企画 → 決算書）`, `Q${c.quarter} statements are ready (Strategy → Statements)`));
    // 経理（段 F）：四半期の税の報告
    if (c.tax) toast(c.tax.saved > 0 ? t(`🧾 第 ${c.tax.q} 四半期の法人税 ${money(c.tax.paid)}（節税で −${money(c.tax.saved)}）`, `🧾 Q${c.tax.q} corporate tax ${money(c.tax.paid)} (saved ${money(c.tax.saved)})`) : t(`🧾 第 ${c.tax.q} 四半期の法人税 ${money(c.tax.paid)}`, `🧾 Q${c.tax.q} corporate tax ${money(c.tax.paid)}`));
  }
  // 経理（段 F）：決算の 1 か月前のお知らせ（あと ○○ G 投資すると、税が △△ G 減る）
  const hint = taxHint(s);
  if (hint) toast(hint);
}

/** 月次報告の画面からほかの画面へ */
const reportHooks = () => ({ openSkills: (br?: string) => openSkills(ctx, br), openSupply: () => openSupply(ctx), openRanking: () => openRanking(ctx), openNotes: () => openNotes(ctx), openGrowth: () => openGrowth(ctx), openTrade: () => openTradeScreen(), openProps: () => openProps(ctx), openPay: () => openPayroll(ctx), openCs: () => openInboxScreen(), openLegal: () => openLegalScreen('ma'), openDiplo: () => goSub('sales', 'diplo'), openProposal: (plan: Plan, say: string, role: string) => {
  // 段 UI5a：月次報告の KPI ③「担当者からの提案」→ 提案書（報告は閉じる）
  closeSheet();
  openProposal(ctx, plan, { say, role, done: () => renderAll() });
}, sfx: (k: Parameters<typeof sfx.play>[0]) => sfx.play(k) });

function showReport(r: NonNullable<ReturnType<typeof step>['report']>) {
  speed = 0;
  closeDig();
  // 月末ポーズ：報告を閉じても、「次の月に進む」を押すまで時間は止まったまま（音は発表のドラムロールから）
  s.monthPause = true;
  save();
  closePop();
  openMonthReport(ctx, r, reportHooks(), () => afterReport());
}
/** 月次報告（・発掘作業のまとめ報告）を閉じたあと：ランキングの紹介・制覇のお祝い。月末ポーズのまま */
function afterReport() {
  playShutters();
  if (tutOf(s) < TUT_DONE) {
    // チュートリアル中は、ランキングの紹介を案内の段（tut.ts の ranking）で出す
    s.flags.ranking = true;
    save();
    renderAll();
  } else if (!s.flags.ranking) {
    s.flags.ranking = true;
    save();
    // 段 UI2：もとは顔つきのモーダル（151 字）。会話 2 枚に
    talk(RANK_LINES().map((text) => ({ text })), t('ランキングを見る', 'Open ranking'), () => openRanking(ctx));
  } else if (s.cleared && !s.flags.clearSeen) {
    clearModal();
  } else {
    speed = 1;
    renderHud();
  }
}

/** 初めての制覇のお祝い（フェーズ 1 クリア！）。月次報告のあと・発表で制覇したとき */
function clearModal() {
  s.flags.clearSeen = true;
  save();
  modal(t('フェーズ 1 クリア！', 'Phase 1 cleared!'), plain(CLEAR_LINE(gateToll(s))), [[t('関所を見る', 'View the gate'), () => ((speed = 1), showGate(), renderHud()), 'is-on'], [t('続ける', 'Keep going'), () => ((speed = 1), renderHud())]], true);
}

/**
 * 時間を止める：建てているとき・メニュー・画面・吹き出し・窓を開いているとき。
 * 見習い期間（1 か月目のチュートリアル）は、放っておいても月が終わらないように、
 * 「⏩ で待つ」段（工事・初売上・締め）と流れの案内の見守り以外は時間を止める。
 */
function tutHold(): boolean {
  const st = tutStep();
  if (!st) return false;
  if (tour) return false;
  return hlOf(st, s) !== 'speed';
}
/** 発掘作業のあいだは止めない（研究ノートを開いていても流れる。憲章 1-2 の例外） */
const uiHold = () => !s.digRun && (!!placing || !!menu || !!pop || sheetOpen() || !!root.querySelector('.isl-modal') || tutHold() || !!s.monthPause || meetPing);
let lastHeld = false;

function frame(now: number) {
  const dt = Math.min(250, now - last);
  last = now;
  // 建てているとき・メニューや画面・吹き出しを開いているときは、ゲームの時間を止める
  const held = uiHold();
  if (held !== lastHeld) {
    lastHeld = held;
    statDate.classList.toggle('is-held', held);
  }
  renderNext();
  maybeCard(now);
  // 段 UI5b：トーストが出ているあいだは毎フレーム置き直す（画面が下から出てくる動きのあいだに置いたトーストが、
  // 動きが終わると見出しに重なっていた：外交の「✔ 引き受ける」）
  if (toasts.childElementCount) placeToasts();
  if (talkQ.length) flushTalk();
  // 発掘作業の残り時間（現実の秒。ゲームの速さに寄らない）
  if (s.digRun) {
    if (speed === 0) speed = 1;
    if (runTick(s, dt)) finishDig();
    else refreshTimer();
  }
  if (!held) acc += dt * speed;
  if (!held && speed > 0) tickAnim(dt * speed);
  anim.frac = held || speed === 0 ? anim.frac : Math.min(1, acc / dayMs());
  anim.speed = speed || 1;
  anim.dayMs = dayMs();
  let changed = false;
  while (acc >= dayMs() && speed > 0) {
    acc -= dayMs();
    changed = true;
    advance(1);
  }
  if (moneyAnim) {
    const k = Math.min(1, (now - moneyAnim.t0) / 700);
    shownMoney = moneyAnim.from + (moneyAnim.to - moneyAnim.from) * (1 - (1 - k) ** 2);
    moneyText(shownMoney);
    if (k >= 1) {
      shownMoney = moneyAnim.to;
      moneyAnim = null;
      statMoney.classList.remove('is-spending');
      renderHud();
    }
  }
  if (tween) {
    const k = Math.min(1, (now - tween.t0) / (tween.dur ?? 320));
    const e = 1 - (1 - k) ** 3;
    cam.x = tween.x0 + (tween.x1 - tween.x0) * e;
    cam.y = tween.y0 + (tween.y1 - tween.y0) * e;
    if (tween.z0 != null && tween.z1 != null) cam.zoom = tween.z0 + (tween.z1 - tween.z0) * e;
    if (k >= 1) tween = null;
    dirty = true;
  }
  updatePoint();
  updateMarks();
  checkSeamless();
  if (tour) tourFrame(now);
  for (let k = fx.length - 1; k >= 0; k--) if (effectDone(fx[k], now)) fx.splice(k, 1);
  const wf = waterFrame(now);
  if (changed || fx.length || wf !== lastWater || loading()) dirty = true;
  // 他社の店の撤退のシャッターが下りているあいだ（月末ポーズで時間が止まっていても描き直す）
  if (shutterFx.size && [...shutterFx.values()].some((t0) => t0 !== Infinity && now - t0 > -1000 && now - t0 < 5000)) dirty = true;
  // 動いているものがあるときは、30 コマ/秒ほどで描き直す
  if (!held && speed > 0 && now - lastDraw > 33 && animating()) dirty = true;
  lastWater = wf;
  // 発掘作業のあいだは画面全体が発掘画面なので、町（地図・人・荷車・建物）は描かない（ゲームの計算は上で進めている）
  if (dirty && !digOpen()) {
    dirty = false;
    // チュートリアル：建ててもらう場所に「ここに建ててみて！」
    const sp = tutSpotNow();
    anim.mark = sp ? { i: sp[0], j: sp[1], label: t('ここに建ててみて！', 'Build here!') } : null;
    const ghost: P1Ghost | null = placing ? { id: placing.id, i: placing.i, j: placing.j, dir: placing.dir, ok: !placeErr(), area: P1B[placing.id]?.kind === 'shop', hot: has(s, 'flow') && !placing.move ? hotCells(s) : undefined } : null;
    lastDraw = now;
    const ov = overviewOn() ? overviewScale(cam.zoom, DPR) : null;
    drawP1(ctx2, s, cam, W, H, DPR, now, fx, ghost, placing?.move ?? selected, pop && selected == null ? pop : null, placeable(), anim, worldOf(s), ov);
    placePop();
    placeWorldUi();
    placeGhostUi();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// ドット絵のエフェクトを暇なときに温めておく（初めて鳴らしたときに引っかからないように）
window.setTimeout(() => warmFx(), 3000);

(window as unknown as { islandDebug: unknown }).islandDebug = {
  state: () => s,
  /** 提案・報告のカード（撮影スクリプト用）：月の締めのカードを作る・辞めたい・経理の助言・持ち場の提案を作って出す・受け箱のカードを出す */
  cardsNow: (opt: { comeback?: string; rally?: string } = {}) => {
    const last = s.reports[s.reports.length - 1];
    const r = { ...(last ?? ({} as P1Report)), month: (last?.month ?? 0) + 1, comeback: opt.comeback ? { by: opt.comeback, rid: '', months: 3, bonus: 0 } : undefined, rally: opt.rally ? { by: opt.rally, months: 2 } : undefined } as P1Report;
    cardsMonth(s, r);
    return s.cards?.inbox.map((c) => ({ id: c.id, src: c.src, pop: c.pop }));
  },
  cardsDay: (heroes: number[]) => cardsDay(s, heroes),
  cardsCompany: () => cardsCompany(s),
  cardDemo: (src: 'clerk' | 'crafter' | 'buyer' | 'idle', hero?: number) => {
    const d = demoDraft(s, src, hero);
    const c = d ? enqueue(s, d) : null;
    if (c) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return c?.id ?? null;
  },
  /** 段 UI5c（撮影スクリプト用）：倉庫が埋まりそうな月の提案を作って出す。作れなければ null */
  pool: () => ({ used: poolUsedOf(s), cap: poolCapOf(s) }),
  stockDemo: () => {
    const d = stockDraft(s);
    const c = d ? enqueue(s, d) : null;
    if (c) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return c?.id ?? null;
  },
  cardRaw: (d: Parameters<typeof enqueue>[1]) => {
    const c = enqueue(s, d);
    if (c) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return c?.id ?? null;
  },
  /** 段 UI4（撮影スクリプト用）：できごとを作って出す（種類・乱数の塩）。作れなければ null */
  eventDemo: (kind: EvKind, salt = 0) => {
    const d = makeEvent(s, kind, salt);
    if (!d) return null;
    const c = enqueue(s, eventDraft(s, d));
    if (c) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return c?.id ?? null;
  },
  /** 段 UI4（撮影スクリプト用）：外交の話を作って出す（meet は物語の会話のあとにカード） */
  diploDemo: (kind: 'meet' | 'trade' | 'req', land: LandId = 'ruby') => {
    const D = diploOf(s);
    if (!D.lands.some((x) => x.id === land)) D.lands.push({ id: land, rel: 30, met: Math.round(s.day / 30) });
    D.since ??= Math.round(s.day / 30);
    const L = D.lands.find((x) => x.id === land)!;
    const req = kind === 'req' ? reqTerms(s, land) : undefined;
    const dd = { kind, land, host: hostCost(s), ...(kind === 'req' ? { req: req ?? undefined } : { trade: tradeTerms(s, land) }) };
    const c = enqueue(s, diploDraft(s, dd));
    if (!c) return null;
    L.told = kind !== 'meet';
    if (!meetTalk(c)) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return c.id;
  },
  /** 追加の要望（撮影スクリプト用）：主力商品のまとめ替えのシートを出す・境界の町の名前（位置と近いか）・町のポップアップ */
  /** 段 UI5a（撮影用）：工房の画面を開く */
  openWs: () => openWorkshop(ctx),
  /** 段 UI5a（撮影・確かめ用）：月次報告の KPI ③ の提案書を、いまの状態で開く。開けたら true */
  proposal: () => {
    const r = s.reports[s.reports.length - 1];
    const p = r ? reportProposal(s, r) : null;
    if (!p) return false;
    openProposal(ctx, p.plan, { say: p.say, role: p.role, done: () => renderAll() });
    return true;
  },
  edges: () => worldEls.filter((x) => x.dir).map((x) => ({ i: x.i, j: x.j, near: x.el.classList.contains('is-near'), text: x.el.textContent, dir: x.dir })),
  sectorCard: (id: string) => openSectorCard(id),
  cardShow: (id: number) => {
    const c = s.cards?.inbox.find((x) => x.id === id);
    if (c) showCard(ctx, c, { done: cardDone, open: cardOpen });
    return !!c;
  },
  setState: (next: P1State) => {
    s = next;
    renderAll();
  },
  advance,
  cam,
  /** マスの画面上の位置（撮影スクリプト用） */
  screenOf: (i: number, j: number) => ({ x: ((i - j) * 100 - cam.x) * cam.zoom + W / 2, y: ((i + j) * 55 - cam.y) * cam.zoom + H / 2 }),
  allowed: (id: string) => {
    for (let j = 0; j < s.n; j++) for (let i = 0; i < s.n; i++) if (allowedDirs(s, id, i, j).length && !canPlaceAt(s, id, i, j, allowedDirs(s, id, i, j)[0])) return [i, j];
    return null;
  },
  dirs: (id: string, i: number, j: number) => allowedDirs(s, id, i, j),
  placing: () => (placing ? { ...placing } : null),
  anim: () => anim,
  pop: (i: number, j: number) => {
    openPop(i, j);
    renderAll();
  },
  menu: (m: Menu | null) => (m ? pickMenu(m) : ((menu = null), renderAll())),
  /** 下の帯の小メニューを開く（撮影スクリプト用） */
  sub: goSub,
  bgm: () => ({ key: sound.currentBgm(), src: sound.bgmSrc(), playing: sound.bgmPlaying(), sfx: sfx.info() }),
  tick: () => renderAll(),
  /** 建てる・置くモードを始める（撮影スクリプト用） */
  place: (id: string) => startPlacing(id),
  /** つながった地図（撮影スクリプト用）：描いている隣のセクタ・縮小の札・いちばん縮小 */
  world: () => worldOf(s)?.regions.map((r) => ({ id: r.id, tier: r.tier, kind: r.kind, dx: r.dx, dy: r.dy })) ?? [],
  badges: () => sectorBadges(s),
  minZoom: () => minZoom(),
  /** 発掘作業（撮影スクリプト用）：荒れ地 k で始める・終える */
  dig: (k?: number) => startDig(k ?? s.dig?.cur ?? 0),
  digEnd: () => finishDig(),
  digOpen: () => digOpen(),
  /** 撮影スクリプト用：いまの荒れ地の壁の層 layer の (x, y) に、エクステ id（Epic なら 2 × 2）を埋める */
  digPlace: (id: number, x: number, y: number, layer = 0) => {
    const L = digSite(s);
    const f = L ? placeFind(L, { kind: 'ext', id }, x, y, layer) : null;
    refreshDig();
    return f ? { size: f.size } : null;
  },
  /** 撮影スクリプト用：Epic のエクステの id（1 つ目） */
  epicId: () => allSeries.flatMap((x) => x.items).find((e) => e.rarity === 'Epic')?.id ?? null,
  /** 荒れ地の左上のマス（撮影スクリプト用） */
  wastes: () => wasteSpots(s.sector ?? 'c1'),
  /** 撮影スクリプト用：ダンジョンの番号・遺物の展示館の画面・展示館を建てる */
  DUNGEON,
  museum: () => openMuseum(ctx),
  /** 撮影スクリプト用：ランドマップ・ランクアップの進出の確認（発掘 v2 の 7 段目） */
  land: () => openLand(ctx),
  rankUp: (id: string) => openRankUp(ctx, id),
  /** 撮影スクリプト用：スキルツリーを開く（focus のパネルを真ん中に・選んだ状態で） */
  skills: (focus?: string) => openSkills(ctx, focus),
  /** 撮影スクリプト用（段 UI5b）：k 番目の月次報告を開く（無ければ最後） */
  reportOpen: (k?: number) => {
    const r = s.reports[k ?? s.reports.length - 1];
    if (r) openMonthReport(ctx, r, reportHooks());
    return !!r;
  },
  speed: (v?: number) => (v != null ? ((speed = v), renderHud()) : speed),
  /** ドット絵のエフェクト（撮影・計測用）：鳴らす・数える・止める（比べる前の画面を撮る） */
  fx: { play: (id: FxId, x: number, y: number, o?: Parameters<typeof playFx>[3]) => playFx(id, x, y, o), stats: (reset?: boolean) => fxStats(reset), enable: (v: boolean) => setFxEnabled(v), clear: () => clearFx(), coin: (uid: number) => coinFx(uid), letter: (conquered: boolean) => letterFx(conquered), letterDemo: (conquered: boolean) => showLetter(120, conquered ? null : 'U', null, 0, conquered), town: (kind: 'revive' | 'dungeon', site: number) => (townFx.push({ kind, site, homes: 0 }), townFxNow()), dept: (d: DeptId) => newDeptBanner(d), gate: () => (gateOf(s) && centerOn(gateOf(s)!.i, gateOf(s)!.j), gateFx()), level: (v?: FxLevel) => (v ? setFxLevel(v) : fxLevel()), levels: (hero: number) => levelNews([{ hero, from: 4, to: 5, gain: { phy: 1 }, passives: [], cap: false }]), diplo: () => diploFx(toast(t('🌐 依頼を届けた！（撮影）', '🌐 Delivered! (demo)'))), craft: () => { const w = myWorkshop(s); if (w) craftFx(w.uid); }, poof: (uid: number) => { pendingShutter.push(uid); playShutters(); } },
  /** 発掘との出会い（撮影スクリプト用）：操作がないまま進んだ日数 */
  idle: (v?: number) => (v != null ? (idleDays = v) : idleDays),
};
