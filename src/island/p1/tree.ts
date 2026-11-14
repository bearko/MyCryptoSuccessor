/**
 * スキルツリー（引っぱって動かせる木）。段 ST1：上から下へ流れる形。いちばん上の「本社」から、部門の列（マーケ・物流・営業・CS・システム・R&D・法務・人事・総務・経理・経営企画）が
 * 下へ伸びる。縦はランクの帯（Common・Uncommon・Rare・Epic・Legendary）で、帯の中は前提の深さの順に下へ。部門の見出しは画面の上に固定（列ごとの「取った数／全部」の縦の棒つき）。
 * まだ開いていない帯は暗い。帯は、そのランクのセクタに出店したあと、はじめてツリーを開いたときの演出で開く（Flags.rings）。
 * パネルの形は払うもので決まる（研究ポイント＝四角・お金＝菱形）。中はアイコンだけ。名前・値段・効き目は PC のツールチップと下の詳細カードで。
 * 線は上から下へ（先に要るパネル → パネル）：全部要る＝実線・n 個要る＝点線（合流点に「2/3」）・ほかの部門の前提＝細い点線。
 * 状態で描き分け（開いている＝実線・鍵＝細い点線・取得済みどうし＝実線で光る）、選んだパネルのつながりを太く明るく。
 * docs/ISLAND_PHASE1.md「スキルツリー」、docs/ISLAND_UX_CHARTER.md「線の種類と帯」。
 */
import { getExtension } from '../../game/catalog';
import { t } from '../../i18n';
import { assetUrl } from '../../render/images';
import { icon } from '../../ui/dom';
import { TIER_NAME } from './company';
import { DEPT, DIG_BALANCE, r2Panel, SKILL, deptOf, isResearch, rpCost, type DeptId, type FxKind, type Mat, type Skill, type Sku, type Tier } from './data';
import { donateLock, infAt, levelLock, nextDonateCost, nextLevelCost, nextLevelRp, ringOpen, skillLock, skillTier, type P1State } from './model';
import { type Ctx } from './screens';
import { BANDS, DEPT_LAYOUT, GROUP_STAGE, POS, STEP, deptCenter, groupCenter, groupOfBranch, type P } from './treelayout';
import { h, heroIcon, matIcon, money, skuIcon } from './ui';
import { uxk } from '../uix/screens/k-slots';

/** ランドセクタの絵（はじまりの国 Lime） */
const TIER_IMG: Record<Tier, string> = { C: '04_Lime_1_Common', U: '04_Lime_2_Uncommon', R: '04_Lime_3_Rare', E: '04_Lime_4_Epic', L: '04_Lime_5_Legendary' };
const tierImg = (tier: Tier) => assetUrl(`mch/Image/LandSectors/${TIER_IMG[tier]}.png`);
const tierArea = (tier: Tier) => t(`${TIER_NAME[tier]} エリア`, `${TIER_NAME[tier]} area`);

/** パネルの絵：建物（b）・商品（sku）・エクステ（ext。MCH のエクステの id）・素材（mat）・ヒーロー（hero）・絵文字（仮。docs/ISLAND_ART_TODO.md） */
const ICON: Record<string, { b?: string; sku?: Sku; ext?: number; mat?: Mat; hero?: number; emoji?: string }> = {
  // 発掘の枝（仮：MCH のエクステ・建物の流用。docs/ISLAND_ART_TODO.md「発掘の枝のパネル」）
  dig_ext: { ext: 1111 },
  dig_power: { ext: 1034 },
  dig_speed: { ext: 1031 },
  dig_reach: { ext: 1011 },
  dig_lamp: { ext: 1150 },
  dig_deep: { ext: 1016 },
  dig_study: { ext: 1008 },
  dig_blast: { emoji: '💥' },
  dig_drill: { ext: 1156 },
  dig_pierce: { emoji: '🏹' },
  dig_office: { b: 'city_hall' },
  dig_crew: { ext: 1096 },
  u_dig_ext2: { ext: 2111 },
  u_dig_auto: { b: 'survey' },
  u_dig_power2: { ext: 2034 },
  u_dig_route: { b: 'lighthouse' },
  u_dig_relay: { b: 'rest_area' },
  u_dig_mat: { mat: 'gem' },
  // 発掘 v2 の 6 段目（仮：MCH のエクステの流用・絵文字。docs/ISLAND_ART_TODO.md「無限の強化パネル・研究への寄付」）
  u_dig_speed_inf: { ext: 2031 },
  u_dig_power_inf: { ext: 2001 },
  u_dig_reach_inf: { emoji: '🧨' },
  dig_donate: { b: 'bank' },
  host: { b: 'hotel' },
  display: { b: 'greengrocer' },
  vmd: { b: 'department' },
  pop: { emoji: '🏷️' },
  golden: { b: 'item' },
  set: { emoji: '🎁' },
  point: { emoji: '💳' },
  hours: { b: 'izakaya' },
  shop2: { b: 'import' },
  shop3: { b: 'boutique' },
  order: { b: 'board' },
  fair: { b: 'food_stalls' },
  concierge: { b: 'inn' },
  d_shop: { b: 'general_store' },
  jig: { sku: 'Scissors:C' },
  jig2: { sku: 'Mallet:C' },
  five_s: { emoji: '🧹' },
  lot: { b: 'assembly' },
  kaizen: { emoji: '💡' },
  chair: { b: 'rest_area' },
  pot: { sku: 'Sensu:U' },
  night: { emoji: '🌙' },
  mold: { sku: 'Lantern:U' },
  line: { b: 'factory' },
  d_craft: { b: 'workshop' },
  loading: { b: 'assembly' },
  shortcut: { b: 'survey' },
  route_opt: { emoji: '🗺️' },
  timetable: { b: 'station' },
  hub: { b: 'logistics' },
  crossdock: { b: 'warehouse' },
  joint: { emoji: '🤝' },
  fleet: { emoji: '🚚' },
  // 段 TRADE1a：関税を下げるパネル（仮の絵：絵文字。docs/ISLAND_ART_TODO.md「段 TRADE1a」）
  customs: { emoji: '🛃' },
  bonded: { emoji: '📦' },
  lane: { emoji: '🚧' },
  d_logi: { b: 'harbor' },
  route_cloth: { mat: 'cloth' },
  route_paper: { mat: 'paper' },
  route_gem: { mat: 'gem' },
  scoutmap: { b: 'lighthouse' },
  bulk: { b: 'wholesale' },
  bulk2: { b: 'trading' },
  stock1: { b: 'realty' },
  stock2: { b: 'bank' },
  stock3: { b: 'hq' },
  swift: { b: 'station' },
  eye: { b: 'jewelry' },
  relief: { emoji: '🔁' },
  // 段 L0：序盤の手を減らす仕組み（仮の絵：絵文字。docs/ISLAND_ART_TODO.md「段 L0」）
  auto_proc: { emoji: '🧾' },
  auto_lineup: { emoji: '🗓' },
  auto_rest: { emoji: '🔄' },
  abc: { emoji: '📊' },
  contract: { emoji: '📜' },
  direct: { emoji: '🌾' },
  d_buy: { b: 'trading' },
  hire: { b: 'school' },
  lounge: { b: 'cafe' },
  manual: { b: 'library' },
  shift: { emoji: '🗓️' },
  slots: { b: 'city_hall' },
  ojt: { b: 'training' },
  incentive: { emoji: '💰' },
  welfare: { b: 'hospital' },
  training: { b: 'school' },
  mgr: { b: 'government' },
  headhunt: { emoji: '🎯' },
  d_people: { b: 'arena' },
  pace1: { b: 'radio' },
  pace2: { b: 'power' },
  budget: { emoji: '🧮' },
  pdca: { emoji: '🔁' },
  pr: { b: 'media' },
  holding: { b: 'tower' },
  d_ops: { b: 'concert_hall' },
  pos: { emoji: '🧾' },
  auto_order: { emoji: '📨' },
  inventory: { emoji: '📦' },
  erp: { b: 'lab' },
  dyn: { emoji: '📈' },
  flow: { emoji: '👣' },
  forecast: { emoji: '🤖' },
  ec: { emoji: '🛒' },
  d_sys: { b: 'power' },
  b_sign: { b: 'media' },
  b_premium: { sku: 'Lantern:U' },
  b_partner: { b: 'harbor' },
  b_ads: { b: 'tower' },
  b_scout: { b: 'arena' },
  // 技：その技で作れるようになる商品のエクステ
  t_wood: { sku: 'Chair:C' },
  t_paper: { sku: 'Parasol:C' },
  t_metal: { sku: 'Knife:C' },
  t_glass: { sku: 'Goblet:C' },
  t_clay: { sku: 'Moai:C' },
  t_textile: { sku: 'Ribbon:C' },
  t_jewel: { sku: 'MusicBox:C' },
  t_master: { sku: 'MusicBox:U' },
  t_rare: { emoji: '💎' },
};

/**
 * 外周の追加のパネル（fx で書いたもの）の絵：効き目の種類ごとの建物（仮。docs/ISLAND_ART_TODO.md「スキルツリー v3 の外周のパネル」）。
 * 同じ種類のパネルが並んでも見分けられるように、候補を順に回す
 */
const KIND_ICON: Partial<Record<FxKind, string[]>> = {
  pull: ['department', 'boutique', 'hotel', 'inn', 'item'],
  price: ['jewelry', 'wine_bar', 'boutique'],
  demand: ['amusement', 'park', 'arcade', 'food_stalls'],
  known: ['media', 'radio'],
  craftDays: ['factory', 'workshop', 'assembly'],
  lot: ['assembly', 'factory'],
  haulDays: ['logistics', 'station', 'harbor'],
  cartCap: ['warehouse', 'logistics'],
  matPrice: ['wholesale', 'trading'],
  procCap: ['trading', 'bank', 'wholesale'],
  buyDays: ['station', 'survey'],
  display: ['greengrocer', 'general_store'],
  stamina: ['rest_area', 'cafe'],
  rest: ['hospital', 'cafe', 'park'],
  apt: ['school', 'training', 'library'],
  wage: ['bank', 'realty'],
  upkeep: ['city_hall', 'bank'],
  ads: ['media', 'tower', 'radio'],
  brand: ['tower', 'concert_hall', 'media'],
  rally: ['guard', 'police'],
  manager: ['government', 'tower'],
  flow: ['lab', 'power'],
};
const kindIcon = (k: Skill) => {
  const kind = k.fx?.[0]?.kind;
  if (!kind) return null;
  const list = KIND_ICON[kind];
  if (!list) return null;
  const n = Number(k.id.match(/_(\d+)$/)?.[1] ?? 0);
  return { b: list[n % list.length] };
};
/** Epic・Legendary の外周：閉じていても名前を出して目標として見せる */
const isGoalTier = (k: Skill) => skillTier(k) === 'E' || skillTier(k) === 'L';

/** 画面を描き直しても、見ている場所・選んだスキルは覚えておく */
const view = { x: 0, y: 0, zoom: 0, sel: null as string | null };
/**
 * 段 UI5b：絞り込み（スマホは部門の札 11 個を「🔍」にしまう）：部門・開けられるものだけ。合わないパネルと線は暗く。
 * more：スマホの詳細カードを広げている（上に引く・「くわしく」）
 */
const filt = { dept: null as DeptId | null, open: false, panel: false, q: '' };
const BURST_MS = 2600;
const DIG_REVEAL_MS = 2200;
/** 発掘の枝の雲の真ん中（木の上の位置。R&D の列）と、雲のかたまりを置く列の上の段（Common の帯の 1 段目からの距離） */
const digCloudAt = (): P => ({ x: DEPT_LAYOUT.rnd.cx, y: BANDS.C.y + STEP * 2 });
const DIG_PUFFS = [0, 1.1, 2.2, 3.3, 4.4, 5.6, 6.8, 8.0];
const RING_MS = 3400;
/** 市場データなどからパネルを選んで開いたとき：最初の place() で、パネルを詳細カードの上へ持ち上げる */
let liftOnce = false;
/** 「全体」ボタンを押した（描き直したあとに、木の全部が収まる大きさを決める） */
const ALL = -2;
/** 帯が開く演出：その帯までが収まる大きさ（place() で） */
const RINGFIT = -3;
/** 本社のパネル（view.sel） */
const HQ = '@hq';
/** ダブルタップ（ダブルクリック）：同じパネルを続けて押したら開放する */
const DOUBLE_MS = 420;

function iconOf(id: string, size: number): HTMLElement {
  const k = SKILL[id];
  if (k?.sealed) {
    const im = h('img', 'isl-tree-b isl-tree-sealimg');
    im.src = tierImg(skillTier(k));
    im.alt = '';
    im.draggable = false;
    return im;
  }
  const spec = ICON[id] ?? (k ? kindIcon(k) : null) ?? { emoji: '✦' };
  if (spec.b) {
    const im = h('img', 'isl-tree-b');
    im.src = assetUrl(`island/b/${spec.b}/rd.png`);
    im.alt = '';
    im.draggable = false;
    return im;
  }
  if (spec.sku) return skuIcon(spec.sku, size);
  if (spec.ext) {
    const e = icon(getExtension(spec.ext).image, 'px isl-ext');
    e.style.width = `${size}px`;
    e.style.height = `${size}px`;
    return e;
  }
  if (spec.mat) return matIcon(spec.mat, size);
  if (spec.hero) return heroIcon(spec.hero, size);
  return h('span', 'isl-tree-emoji', spec.emoji ?? '✦');
}

/** パネルの見え方：取った・修行中・取れる・資金（RP）不足・条件が足りない・外周が閉じている・封印・準備中・雲の中（発掘の枝の出会いの前） */
type State = 'done' | 'training' | 'open' | 'poor' | 'locked' | 'ring' | 'sealed' | 'soon' | 'hidden';
function stateOf(s: P1State, k: Skill): State {
  // 研究への寄付：開いていれば押せる（資金が足りなければ不足）。まだなら条件が足りない
  if (k.donate) {
    const d = donateLock(s);
    return d === null ? 'open' : d === 'money' ? 'poor' : d === 'hidden' ? 'hidden' : 'locked';
  }
  const e = skillLock(s, k);
  if (e === null) return 'open';
  if (e === 'money' || e === 'rp') return 'poor';
  if (e === 'requires' || e === 'dept' || e === 'brand' || e === 'emblem') return 'locked';
  return e as State;
}
/** 値段の表示：研究パネルは「研 40」（RP）、お金パネルは資金 */
const priceOf = (k: Skill) => (isResearch(k) ? t(`研 ${rpCost(k).toLocaleString('en-US')}`, `RP ${rpCost(k).toLocaleString('en-US')}`) : money(k.cost));
/** 無限の強化パネルの効き目の文（Lv lv のとき）：速さ「90 ms」・力「7.35」・範囲「21%」 */
function infText(s: P1State, k: Skill, lv: number): string {
  const v = infAt(s, k.inf!, lv);
  if (k.inf === 'speed') return `${v} ms`;
  if (k.inf === 'power') return String(v);
  return `${Math.round(v * 100)}%`;
}
const INF_LABEL = { speed: () => t('打つ間隔', 'Strike interval'), power: () => t('1 打の強さ', 'Strike power'), reach: () => t('1 回り大きくなる確率', 'Chance of one size bigger') };
/** 開くボタンの言い方：研究パネル「研究する 40 RP」、お金パネル「開放する 4,000 G」 */
const learnLabel = (k: Skill) => (isResearch(k) ? (k.train ? t(`研究して修行に出す ${rpCost(k)} RP`, `Research & train · ${rpCost(k)} RP`) : t(`研究する ${rpCost(k)} RP`, `Research · ${rpCost(k)} RP`)) : k.train ? t(`修行に出す ${money(k.cost)}`, `Start training · ${money(k.cost)}`) : t(`開放する ${money(k.cost)}`, `Unlock · ${money(k.cost)}`));
/** 技の修行の説明（取ったあと、職人が修行して身につける） */
const trainNote = (k: Skill) => t(`取ったあと、職人が修行して身につける（${k.train} 日。製造の適性が高いほど早い）。修行中の職人は作業台に立てない`, `After unlocking, a crafter trains to master it (${k.train} days, shorter with higher crafting aptitude). They can’t work a bench meanwhile`);
const ringNeed = (k: Skill) => t(`${TIER_NAME[skillTier(k)]} のセクタに進出すると開く`, `Opens when you expand into a ${TIER_NAME[skillTier(k)]} sector`);
/** 見えている名前（外周が閉じていれば「？」、封印は「???」） */
const shownName = (s: P1State, k: Skill) => (k.sealed ? '???' : !ringOpen(s, skillTier(k)) && !isGoalTier(k) ? '?' : k.name);
/** 枝の名前のラベル（詳細カードの名前の左に「（物流）」） */
const branchName = (k: Skill) => (deptOf(k) === 'logistics' && GROUP_STAGE[k.branch] ? t(`${DEPT.logistics.name}・${GROUP_STAGE[k.branch]}`, `${DEPT.logistics.name} · ${GROUP_STAGE[k.branch]}`) : DEPT[deptOf(k)].name);
/** 部門の色（枝・研究パネルの枠） */
const colorOf = (k: Skill) => DEPT_LAYOUT[deptOf(k)].color;
/** そのパネルは、いまレベルを上げられるか（資金が足りて、最大でない） */
const canLevel = (s: P1State, k: Skill) => levelLock(s, k) === null;
/** 次のレベルの値段の表示（無限の強化パネルは RP） */
const nextPrice = (s: P1State, k: Skill) => (k.inf || r2Panel(k) ? `${nextLevelRp(s, k).toLocaleString('en-US')} RP` : money(nextLevelCost(s, k)));
/** 寄付のボタンの言い方：「寄付する 20,000 G → +100 RP」 */
const donateLabel = (s: P1State) => t(`寄付する ${money(nextDonateCost(s))} → +${DIG_BALANCE.buyRp.rp} RP`, `Donate ${money(nextDonateCost(s))} → +${DIG_BALANCE.buyRp.rp} RP`);
const DONATE_NEED = () => t('Uncommon の調査依頼状を持っているか、Common のセクタを 1 つ制覇すると開く', 'Opens once you hold the Uncommon survey request or have conquered a Common sector');

const HQ_NOTE = t('会社のすべての部門の中心。開放すると、物流・マーケ・経営企画・人事・システムなど 11 の部門の枝が広がり、パネルを取れるようになります（取るほど、その部門の理解度が上がる）。', 'The heart of every department. Unlock it and branches for 11 departments — Logistics, Marketing, Strategy, HR, Systems and more — spread out. Each panel you take raises that department’s understanding.');

/** スキルツリーを開く。focus：その枝を真ん中に（SCM ダッシュボード・チュートリアルから） */
export function openSkills(ctx: Ctx, focus?: string) {
  // 段 ST1：パネル・部門へ寄るときは、引いた大きさ（「全体」のあと）のままにしない
  if (focus) view.zoom = Math.max(view.zoom > 0 ? view.zoom : 0, innerWidth < 600 ? 0.72 : 0.85);
  if (focus && SKILL[focus] && POS.has(focus)) {
    // スキルのパネルを真ん中に、選んだ状態で（市場データ・マインちゃんの助言から）
    const p = POS.get(focus)!;
    view.x = p.x;
    view.y = p.y;
    view.sel = focus;
    // 下の詳細カードに隠れないよう、描いたあとで少し上へ（place()）
    liftOnce = true;
  } else if (focus && DEPT[focus as DeptId]) {
    const c = deptCenter(focus as DeptId);
    view.x = c.x;
    view.y = c.y;
    view.sel = null;
  } else if (focus && groupOfBranch(focus)) {
    const c = groupCenter(groupOfBranch(focus)!);
    view.x = c.x;
    view.y = c.y;
    view.sel = null;
  }
  // 段 UIX3k：新しい画面（回路図のスキルツリー。uix/screens/tree.ts）へ。見ている場所・選んだパネル（view）はそのまま渡る
  if (uxk.tree) {
    const lift = liftOnce;
    liftOnce = false;
    return uxk.tree(ctx, { lift, focus });
  }
}

/**
 * 段 UIX3k：新しい画面（uix/screens/tree.ts）へ渡す、このファイルの道具（p1/uxk.ts が束ねる）。
 * 絵の決め方・見え方（State）・値段と言い方は、今の画面と同じ 1 か所から使う。view・filt は同じ物（見ている場所・絞り込みを、入でも切でも覚えている）
 */
export type TreeState = State;
export const treeKit = {
  view,
  filt,
  HQ,
  ALL,
  RINGFIT,
  DOUBLE_MS,
  BURST_MS,
  DIG_REVEAL_MS,
  RING_MS,
  DIG_PUFFS,
  iconOf,
  digCloudAt,
  tierImg,
  tierArea,
  isGoalTier,
  stateOf,
  priceOf,
  infText,
  INF_LABEL,
  learnLabel,
  trainNote,
  ringNeed,
  shownName,
  branchName,
  colorOf,
  canLevel,
  nextPrice,
  donateLabel,
  DONATE_NEED,
  HQ_NOTE,
};
