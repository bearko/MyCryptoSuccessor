/**
 * フェーズ 1「新天地で実績を上げろ」の数値（docs/ISLAND_PHASE1.md）。
 * 素材 → クラフト → 運搬 → 陳列 → 販売。商品は MCH の Common エクステ 5 シリーズ。
 */
import { allSeries } from '../../game/catalog';
import { t } from '../../i18n';
import { OUTER_SKILLS } from './skillsx';
import { TREE_LINKS } from './treelinks';

export type Mat = 'iron' | 'wood' | 'clay' | 'glass' | 'cloth' | 'paper' | 'gem';
export const MAT_KEYS: Mat[] = ['iron', 'wood', 'clay', 'glass', 'cloth', 'paper', 'gem'];

export interface MatDef {
  name: string;
  price: number;
  /** 最初から買える */
  open: boolean;
  /** 自力でルートを開拓するのにかかる日数（開拓の適性 1.0 のとき） */
  exploreDays: number;
}

export const MATS: Record<Mat, MatDef> = {
  iron: { name: t('鉄', 'Iron'), price: 150, open: true, exploreDays: 0 },
  wood: { name: t('木材', 'Wood'), price: 60, open: true, exploreDays: 0 },
  clay: { name: t('粘土', 'Clay'), price: 50, open: true, exploreDays: 0 },
  glass: { name: t('ガラス', 'Glass'), price: 600, open: true, exploreDays: 0 },
  cloth: { name: t('布', 'Cloth'), price: 180, open: false, exploreDays: 10 },
  paper: { name: t('紙', 'Paper'), price: 100, open: false, exploreDays: 10 },
  gem: { name: t('宝石', 'Gems'), price: 120, open: false, exploreDays: 20 },
};

export const START_MATS: Partial<Record<Mat, number>> = { iron: 10, wood: 24, clay: 12, glass: 9 };

export type Rar = 'C' | 'U';

/** 商品を作るのに要る「技」（スキルツリーの技の枝。スキルの id は 't_' + 技） */
export type TechKey = 'wood' | 'paper' | 'metal' | 'glass' | 'clay' | 'textile' | 'jewel';
export const techSkill = (k: TechKey) => `t_${k}`;

export interface ProductDef {
  /** シリーズの key（catalog.json の series.key） */
  key: string;
  name: string;
  /** Common と Uncommon のエクステの id（絵と名前） */
  ext: Record<Rar, number>;
  price: number;
  /** 1 回のクラフト（1 ロット）でできる数（Common。Uncommon はその半分） */
  batch: number;
  /** クラフトの日数（製造の適性 1.0 のとき） */
  days: number;
  recipe: Record<Rar, Partial<Record<Mat, number>>>;
  /** エリアの月の需要（個）。新しいお店は認知度のぶんしか売れない */
  demand: number;
  /** 作るのに要る「技」（スキルツリーの技の枝）。無ければ基礎の商品（最初から作れる） */
  tech?: TechKey;
  /** この商品が主役になる最小のランク（無ければ C）。それより下のセクタでは需要が無く、市場データにも出さない */
  tier?: Tier;
  /** 復刻品（発掘 v2 の 3 段目）：もとの遺物（エクステの id）・作るランク（出たセクタのランク）。docs/ISLAND_PHASE1.md「3. 復刻品」 */
  relic?: { ext: number; rank: Rar; rare?: boolean; epic?: boolean };
}

export const PRODUCTS: ProductDef[] = [
  // 基礎の 5 つ（最初から作れる。最初の町タオックスで売れる）
  { key: 'Sensu', name: t('センス', 'Sensu'), ext: { C: 1032, U: 2032 }, price: 900, batch: 4, days: 3, recipe: { C: { wood: 6 }, U: { wood: 6, paper: 4 } }, demand: 20 },
  { key: 'Mallet', name: t('マレット', 'Mallet'), ext: { C: 1073, U: 2073 }, price: 1100, batch: 4, days: 4, recipe: { C: { wood: 4, iron: 2 }, U: { wood: 4, iron: 4, gem: 1 } }, demand: 12 },
  { key: 'Node-Doll', name: t('ノード・ドール', 'Node-Doll'), ext: { C: 1107, U: 2107 }, price: 1400, batch: 3, days: 4, recipe: { C: { clay: 6, glass: 1 }, U: { clay: 6, cloth: 4 } }, demand: 8 },
  { key: 'Lantern', name: t('ランタン', 'Lantern'), ext: { C: 1150, U: 2150 }, price: 1300, batch: 4, days: 4, recipe: { C: { iron: 2, glass: 3 }, U: { iron: 4, glass: 4, gem: 1 } }, demand: 30 },
  { key: 'Scissors', name: t('鋏', 'Scissors'), ext: { C: 1171, U: 2171 }, price: 1000, batch: 4, days: 3, recipe: { C: { iron: 5 }, U: { iron: 5, gem: 1 } }, demand: 22 },
  // 技が要る 12（docs/ISLAND_PHASE1.md「商品と技」。セクタごとの「まだ誰も売っていない」商品）
  { key: 'Chair', name: t('椅子', 'Chair'), ext: { C: 1170, U: 2170 }, price: 1500, batch: 3, days: 4, recipe: { C: { wood: 8, cloth: 2 }, U: { wood: 8, cloth: 2, paper: 2 } }, demand: 14, tech: 'wood' },
  { key: 'Parasol', name: t('傘', 'Parasol'), ext: { C: 1190, U: 2190 }, price: 1200, batch: 4, days: 3, recipe: { C: { wood: 3, paper: 6 }, U: { wood: 3, paper: 6, gem: 1 } }, demand: 18, tech: 'paper' },
  { key: 'Knife', name: t('ナイフ', 'Knife'), ext: { C: 1048, U: 2048 }, price: 1100, batch: 4, days: 3, recipe: { C: { iron: 6 }, U: { iron: 6, gem: 1 } }, demand: 16, tech: 'metal' },
  { key: 'Compass', name: t('コンパス', 'Compass'), ext: { C: 1156, U: 2156 }, price: 1600, batch: 4, days: 4, recipe: { C: { iron: 3, glass: 3 }, U: { iron: 3, glass: 3, gem: 1 } }, demand: 10, tech: 'metal' },
  { key: 'Goblet', name: t('ゴブレット', 'Goblet'), ext: { C: 1030, U: 2030 }, price: 1700, batch: 4, days: 4, recipe: { C: { glass: 5 }, U: { glass: 5, gem: 1 } }, demand: 10, tech: 'glass' },
  { key: 'Monocle', name: t('モノクル', 'Monocle'), ext: { C: 1102, U: 2102 }, price: 1300, batch: 4, days: 3, recipe: { C: { glass: 3, iron: 1 }, U: { glass: 3, iron: 1, gem: 1 } }, demand: 12, tech: 'glass' },
  { key: 'Moai', name: t('モアイ', 'Moai'), ext: { C: 1106, U: 2106 }, price: 1000, batch: 3, days: 4, recipe: { C: { clay: 10 }, U: { clay: 10, paper: 2 } }, demand: 14, tech: 'clay' },
  { key: 'JapaneseDoll', name: t('日本人形', 'Japanese Doll'), ext: { C: 1127, U: 2127 }, price: 1800, batch: 3, days: 4, recipe: { C: { clay: 5, cloth: 4, paper: 1 }, U: { clay: 5, cloth: 4, paper: 1, gem: 1 } }, demand: 9, tech: 'clay' },
  { key: 'Ribbon', name: t('リボン', 'Ribbon'), ext: { C: 1110, U: 2110 }, price: 900, batch: 4, days: 3, recipe: { C: { cloth: 5 }, U: { cloth: 5, paper: 2 } }, demand: 22, tech: 'textile' },
  { key: 'Hat', name: t('ハット', 'Hat'), ext: { C: 1059, U: 2059 }, price: 1400, batch: 3, days: 4, recipe: { C: { cloth: 6, paper: 2 }, U: { cloth: 6, paper: 2, gem: 1 } }, demand: 12, tech: 'textile' },
  { key: 'Quill', name: t('ペン', 'Quill'), ext: { C: 1003, U: 2003 }, price: 800, batch: 4, days: 3, recipe: { C: { paper: 4, iron: 1 }, U: { paper: 4, iron: 1, gem: 1 } }, demand: 24, tech: 'paper' },
  { key: 'MusicBox', name: t('オルゴール', 'Music Box'), ext: { C: 1165, U: 2165 }, price: 2600, batch: 3, days: 4, recipe: { C: { wood: 4, iron: 3, gem: 1 }, U: { wood: 4, iron: 3, gem: 1, paper: 2 } }, demand: 6, tech: 'jewel', tier: 'U' },
];
/**
 * 商品の定義（キー → 定義）。いまの 17 商品に、復刻品（RELICS。下の「復刻品」）も入る。
 * 商品を引くときは productOf（ここ 1 か所の入口）。会社で開いた復刻品だけの一覧は model.ts の productsOf
 */
export const PRODUCT: Record<string, ProductDef> = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));
export const productOf = (key: string): ProductDef | undefined => PRODUCT[key];

/** Uncommon は値段 2.5 倍、売り場での強さ 1.3 倍。作るには工房の設備と製造の適性 60 以上が要る */
export const UNCOMMON = { price: 2.5, pull: 1.3, minCraft: 31 };

/** 商品の番号（シリーズとレアリティ） */
export type Sku = `${string}:${Rar}`;
export const sku = (key: string, r: Rar): Sku => `${key}:${r}`;
export const skuParts = (s: Sku): [string, Rar] => s.split(':') as [string, Rar];
export const skuPrice = (s: Sku) => {
  const [k, r] = skuParts(s);
  return Math.round(PRODUCT[k].price * (r === 'U' ? UNCOMMON.price : 1));
};

// ---------------------------------------------------------------- 同業他社（同じエリアの物販）

export interface RivalDef {
  id: string;
  name: string;
  /** 扱っている商品と売り場での強さ */
  sells: Partial<Record<string, number>>;
  /** エクステ以外の売上（月） */
  base: number;
  /** 地図に置く店（建物の id） */
  store: string;
  /** 利益率（調査で分かる） */
  margin: number;
}

export const RIVALS: RivalDef[] = [
  { id: 'lamp', name: t('ランタン堂', 'Lantern House'), sells: { Lantern: 1.6, Scissors: 1.5 }, base: 7000, store: 'import', margin: 0.18 },
  { id: 'kane', name: t('カネモノ商会', 'Kanemono Trading'), sells: { Lantern: 1, Mallet: 1 }, base: 9000, store: 'general_store', margin: 0.12 },
  { id: 'hibana', name: t('ヒバナ雑貨', 'Hibana Goods'), sells: { Scissors: 1, 'Node-Doll': 1 }, base: 8000, store: 'greengrocer', margin: 0.15 },
  { id: 'marumi', name: t('マルミ商店', 'Marumi Store'), sells: { Lantern: 1 }, base: 6000, store: 'watch', margin: 0.08 },
];

/** ライバルが月ごとに強くなる割合と、自社が独り占めしている商品に新しく参入するまでの月数 */
export const RIVAL_GROWTH = 0.012;
export const ENTRY_AFTER = 4;
/** エリアの需要の伸び（月）。他社の「エクステ以外の売上」もこれと同じだけ伸びる（市場より速くは伸びない） */
export const MARKET_GROWTH = 0.015;
/**
 * 他社の伸びと撤退（docs/ISLAND_PHASE1.md「同業他社」）。
 * pullCap：売り場の強さは RIVAL_GROWTH ずつ伸びるが、扱い始めたときの pullCap 倍で頭打ち（市場より速く強くなり続けない）。
 * 追随で入った商品は、その月の売上がその商品の市場（自社＋他社）の weakShare 未満の月が weakMonths 続くと撤退する。
 */
export const RIVAL = { pullCap: 1.3, weakShare: 0.15, weakMonths: 3 };
/**
 * Uncommon の同業他社の強さ（発掘 v2 の 8 段目。docs/ISLAND_PHASE1.md「同業他社」の「Uncommon の他社」・docs/ISLAND_BALANCE.md の v15）。
 * Common の数字（RIVAL・RIVAL_GROWTH・ENTRY_AFTER・MARKET_GROWTH）は変えず、Uncommon のセクタだけに掛かる。
 * - base：エクステ以外の月の売上に、ランクの倍率（TIERS.U.rival）とセクタの rivalMul にさらに掛ける（町を作るとき）。
 * - town：町ごとの、エクステ以外の月の売上の倍率（base にさらに掛ける。無い町は 1）。Uncommon の入り口のウメコタウン（u1）は 1、
 *   ほかの 4 つの町は大きい（2 つ目からの Uncommon の町は、会社のお金が戻っていて立ち上げが速いので）。
 * - growth・baseCap：エクステ以外の売上の月の伸び（Common は MARKET_GROWTH でずっと伸びる）。町を作ったときの baseCap 倍で止まる（追いかける目標が逃げ続けない）。
 * - entryAfter：自社のヒット商品に他社が入ってくるまでの月数（Common は ENTRY_AFTER）。
 * - sale：巻き返し。自社が 1 位になった月の締めで、まだこの町でセールをしていない会社のうち売上のいちばん大きい会社（ふつうは 2 位）が、
 *   翌月から months か月セールをする。足す売上（月）は「自社の売上 × target − その会社の売上」（少なくともその会社の売上の min）で、
 *   毎月の締めで自社の売上を見て決めなおし、残りの月に比例して弱まって戻る。終わってから cool か月は次のセールをしない
 *   （1 位を取り返した月は、ほかの会社が続けて始める）。1 つの町で max 社まで。ポイントカードなど「他社の反撃」を弱めるパネルで target は 1 に近づく。
 */
export const UNCOMMON_RIVAL = {
  base: 3,
  town: { u2: 7.5, u3: 7.5, u4: 7.5, u5: 7.5 } as Record<string, number>,
  growth: 0.015,
  baseCap: 1.1,
  entryAfter: 3,
  sale: { target: 1.3, min: 0.15, months: 3, cool: 1, max: 2 },
};
/**
 * Rare の同業他社の強さ（Rare の町 ①。docs/ISLAND_PHASE1.md「Rare の町」・docs/ISLAND_BALANCE.md の v16）。UNCOMMON_RIVAL と同じ形で、
 * Rare のセクタだけに掛かる（ランクの倍率 TIERS.R.rival ×3.5 にさらに掛ける）。入り口のグリーン・マウス（r1）は 1、ほかの町は town の倍率。
 * 自動プレイで壁にならない値（通常・100% が Rare の町を制覇できる）にした
 */
export const RARE_RIVAL: typeof UNCOMMON_RIVAL = {
  base: 6,
  town: { r2: 2.5, r3: 2.5, r4: 2.5 },
  growth: 0.015,
  baseCap: 1.1,
  entryAfter: 3,
  sale: { target: 1.3, min: 0.15, months: 3, cool: 1, max: 2 },
};
/**
 * Rare の町 ②（段 C：営業の始まり）：商圏の取り合い・撤退と空き店舗（docs/ISLAND_PHASE1.md「商圏の取り合い（Rare）」・docs/ISLAND_BALANCE.md の v16c）。
 * Rare の町だけに掛かる（Common・Uncommon の売れ方は変えない）。
 * - d0：Rare の町の距離の重み（この距離で来やすさが半分。Common・Uncommon は MARKET.d0）。小さいほど、店の場所が効く
 * - stores：町を作るとき、他社 1 社が持つ店の数（1 軒目はいままでの場所。残りは町のあちこちに）
 * - pull：他社の店の引き（その会社の扱う商品の強さの平均 × ランクの倍率 × pull）。その店に無い商品のお客さんも引き寄せる（買わずに帰る）
 * - branch：支店の引き（本店＝その会社の 1 軒目に対して。支店は押せば撤退させやすい）
 * - quitAt・quitMonths：他社の店の取り分が開店のときの quitAt 倍を下回る月が quitMonths か月続くと撤退（空き店舗になる）
 * - refill・refillChance・refillMax：空き店舗を放っておくと、撤退の refill か月後の締めから毎月 refillChance の確率で、refillMax か月までには必ず、
 *   別の他社が新しい店を出す（調整 1：他社が空き地にすぐ戻ってくる）。町から撤退した会社も戻ってくる（営業している他社がほかにいないとき）
 * - vacant：空き店舗に自社が入るときの費用（その建物の値段 × cost）と工期（days 日。内装だけ）
 * - cap：他社の店の売上の上限（開店のときの取り分の cap 倍まで。まわりが撤退すると伸びる）
 * - sale：巻き返し（セール）の間、その会社の店の引き ×(1 ＋ sale × 残りの月 ÷ セールの月数)
 */
export const RARE_AREA = {
  d0: 1.3,
  stores: 5,
  pull: 4.5,
  branch: 0.45,
  quitAt: 0.6,
  quitMonths: 2,
  refill: 1,
  refillChance: 0.5,
  refillMax: 3,
  vacant: { cost: 0.5, days: 2 },
  cap: 1.6,
  sale: 0.6,
};
/**
 * Epic の同業他社の強さ（段 H1：Epic の町 ①。docs/ISLAND_PHASE1.md「Epic の町 ①」・docs/ISLAND_BALANCE.md の v23）。RARE_RIVAL と同じ形で、
 * Epic のセクタだけに掛かる（ランクの倍率 TIERS.E.rival ×5 にさらに掛ける）。入り口のヒトシタウン（e1）は 1、ほかの町は town の倍率。
 * 自動プレイで壁にならない値（通常が Epic の 1 町・100% が 3 町を制覇できる）にした
 */
export const EPIC_RIVAL: typeof UNCOMMON_RIVAL = {
  base: 15,
  town: { e2: 2, e3: 2 },
  growth: 0.015,
  baseCap: 1.1,
  entryAfter: 3,
  sale: { target: 1.3, min: 0.15, months: 3, cool: 1, max: 2 },
};
/**
 * Epic の町の商圏の取り合い（段 H1。RARE_AREA と同じ式・同じ項目）。Epic の地図は 26 × 26 マスと Rare（21）より広いので、
 * 距離の重み d0 を広さに合わせて少し伸ばした（Rare 1.3 → 1.6 マス。1 軒で届く町の割合が Rare と同じくらい）。ほかは Rare と同じ
 */
export const EPIC_AREA: typeof RARE_AREA = { ...RARE_AREA, d0: 1.6 };
/** そのランクの商圏の取り合いの数字（Rare・Epic。ほかのランクには商圏の取り合いが無い） */
export const AREA_TUNE: Partial<Record<Tier, typeof RARE_AREA>> = { R: RARE_AREA, E: EPIC_AREA };
/** 商圏の取り合いがあるランクか（Rare・Epic） */
export const hasArea = (tier?: Tier) => !!AREA_TUNE[tier ?? 'C'];
/** そのランクの商圏の数字（取り合いの無いランクは Rare の数字。表示用） */
export const areaTuneOf = (tier?: Tier) => AREA_TUNE[tier ?? 'C'] ?? RARE_AREA;
/** 営業の奥義の予告（理解度 15。効き目は段 I。表示だけ） */
export const SALES_MASTERY = () => t('奥義 1：撤退した他社の土地を、出店許可なしで取れる（準備中）', 'Mastery 1: take over land left by a closed rival with no permit (coming soon)');
/** そのランクの他社の強さ（Uncommon・Rare・Epic。Common は null） */
export const RIVAL_TUNE: Partial<Record<Tier, typeof UNCOMMON_RIVAL>> = { U: UNCOMMON_RIVAL, R: RARE_RIVAL, E: EPIC_RIVAL };

// ---------------------------------------------------------------- 建てられる建物

export interface P1Building {
  id: string;
  kind: 'workshop' | 'shop' | 'food' | 'warehouse' | 'depot' | 'fun' | 'big' | 'museum';
  cost: number;
  days: number;
  upkeep: number;
  /** 棚の数（並べられる商品の種類） */
  shelves?: number;
  /** 売り場での強さ */
  pull?: number;
  /** 最初から建てられる。false ならスキルで解放（requires） */
  requires?: string;
  /** 準備中（フェーズ 1 では建てられない） */
  soon?: boolean;
}

export const P1_BUILDINGS: P1Building[] = [
  { id: 'workshop', kind: 'workshop', cost: 0, days: 4, upkeep: 800 },
  { id: 'general_store', kind: 'shop', cost: 3000, days: 5, upkeep: 1200, shelves: 1, pull: 1 },
  { id: 'warehouse', kind: 'warehouse', cost: 4000, days: 5, upkeep: 600 },
  { id: 'logistics', kind: 'depot', cost: 6000, days: 6, upkeep: 900, requires: 'hub' },
  { id: 'import', kind: 'shop', cost: 8000, days: 8, upkeep: 2000, shelves: 2, pull: 1.15, requires: 'shop2' },
  { id: 'boutique', kind: 'shop', cost: 15000, days: 10, upkeep: 3200, shelves: 2, pull: 1.35, requires: 'shop3' },
  { id: 'ramen', kind: 'food', cost: 1800, days: 6, upkeep: 300, soon: true },
  { id: 'cafe', kind: 'food', cost: 1800, days: 6, upkeep: 300, soon: true },
  { id: 'bakery', kind: 'food', cost: 1600, days: 6, upkeep: 300, soon: true },
  { id: 'arcade', kind: 'fun', cost: 12000, days: 10, upkeep: 1500, soon: true },
  { id: 'amusement', kind: 'fun', cost: 40000, days: 20, upkeep: 5000, soon: true },
  { id: 'factory', kind: 'big', cost: 60000, days: 20, upkeep: 6000, soon: true },
  { id: 'harbor', kind: 'big', cost: 120000, days: 30, upkeep: 9000, soon: true },
  // 遺物の展示館（発掘 v2 の 4 段目）：復興した土地にだけ・会社で 1 つ。値段はブティック（Common の大きめの建物）と同じくらい
  { id: 'museum', kind: 'museum', cost: 15000, days: 10, upkeep: 600 },
];

/**
 * 建築の一覧のカテゴリ（タブ）。建てられる建物（資金だけが足りないものも含む）が 1 つも無いカテゴリはロック。
 * 1 つ以上建てられるようになったら、ロックが外れる演出（Flags.buildCats に見たカテゴリを覚える）。
 */
export const BUILD_CATS: { id: string; name: string; icon: string; ids: string[] }[] = [
  { id: 'base', name: t('本店', 'Head office'), icon: '🏠', ids: ['workshop'] },
  { id: 'shop', name: t('お店', 'Shops'), icon: '🛍️', ids: ['general_store', 'import', 'boutique'] },
  { id: 'logi', name: t('物流・倉庫', 'Logistics'), icon: '📦', ids: ['warehouse', 'logistics'] },
  { id: 'food', name: t('飲食', 'Food'), icon: '🍜', ids: ['ramen', 'cafe', 'bakery'] },
  { id: 'fun', name: t('娯楽', 'Leisure'), icon: '🎡', ids: ['arcade', 'amusement'] },
  { id: 'big', name: t('大型施設', 'Large sites'), icon: '🏭', ids: ['factory', 'harbor'] },
  // 発掘 v2 の 4 段目：復興した土地ができると開く
  { id: 'relic', name: t('遺物', 'Relics'), icon: '🏛', ids: ['museum'] },
];
export const P1B: Record<string, P1Building> = Object.fromEntries(P1_BUILDINGS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- 従業員

export type Task = 'craft' | 'transport' | 'shop' | 'explore' | 'intel' | 'buy' | 'side' | 'manager' | 'train' | 'dig' | 'lead';
export const TASKS: { key: Task; name: string; note: string }[] = [
  { key: 'craft', name: t('製造', 'Craft'), note: t('3 つの能力のバランス', 'Balance of all three stats') },
  { key: 'transport', name: t('運搬', 'Haul'), note: t('PHY 重視', 'Mostly PHY') },
  { key: 'shop', name: t('販売', 'Sell'), note: t('INT 重視', 'Mostly INT') },
  { key: 'explore', name: t('開拓', 'Scout'), note: t('AGI 重視', 'Mostly AGI') },
  { key: 'intel', name: t('調査', 'Research'), note: t('INT と AGI', 'INT and AGI') },
  { key: 'buy', name: t('調達', 'Buying'), note: t('INT 寄りのバランス', 'Balanced, a bit more INT') },
];

export interface Stats {
  hp: number;
  phy: number;
  int: number;
  agi: number;
}

/**
 * 作業の適性（0〜100）。能力値は MCH の値を、全ヒーロー中の最大が 100 になるように縮めたもの（`model.ts` の heroStats）。
 * 見習いの MCHアーティストの製造が約 28、コモンの得意な仕事が 40〜55、レジェンダリーで 80〜88。
 */
export function aptitude(s: Stats, task: Task): number {
  switch (task) {
    case 'craft':
      return 0.5 * Math.min(s.phy, s.int, s.agi) + 0.5 * ((s.phy + s.int + s.agi) / 3);
    case 'transport':
      return 0.6 * s.phy + 0.4 * s.agi;
    case 'shop':
      return 0.6 * s.int + 0.4 * s.agi;
    case 'explore':
      return 0.5 * s.agi + 0.25 * s.phy + 0.25 * s.int;
    case 'intel':
      return 0.5 * s.int + 0.5 * s.agi;
    case 'buy':
      return 0.4 * s.int + 0.3 * s.phy + 0.3 * s.agi;
    case 'side':
      // 他店でのバイト：売り場の仕事なので販売と同じ
      return 0.6 * s.int + 0.4 * s.agi;
    case 'manager':
      // セクタマネージャー：能力値の合計（平均）
      return (s.phy + s.int + s.agi) / 3;
    case 'train':
      // 技の修行：製造と同じ
      return 0.5 * Math.min(s.phy, s.int, s.agi) + 0.5 * ((s.phy + s.int + s.agi) / 3);
    case 'dig':
      // 発掘：力仕事が中心（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）
      return 0.6 * s.phy + 0.2 * s.agi + 0.2 * s.int;
    case 'lead':
      // チームリーダー・事業部長（段 D）：部門ごとに向く能力値は deptApt。ここは 3 つの平均
      return (s.phy + s.int + s.agi) / 3;
  }
}

export const START_STAFF = [10001, 10002, 10003];

/**
 * 他店でバイト（資金が尽きたときの助け）。ヒーローを他社のお店で働かせ、1 日 pay × 販売の速さ を受け取る。
 * 毎日 grow の確率で、能力値（INT・AGI・PHY のどれか）が 1 上がる。資金が rescue 以下になるとマインちゃんが紹介する。
 */
export const SIDE = { pay: 180, grow: 0.04, rescue: 10000 };
/**
 * 関所（ランドのふち）。通行料を払うと開通し、次のランドセクタへ行けるようになる。
 * 通行料 ＝ このエリアで 1 位の他社の先月の売上 × mult（round G 単位で切り上げ）。倍率はテストプレイで決める。
 * at は置く場所の目安（東のふち、横の道路の出口のそば）。
 */
export const GATE = { mult: 1, round: 1000, at: [15, 8] as [number, number] };

/**
 * ブランド力（0〜max）。ランドセクタで 1 位になったり、実績を上げると上がり、順位が大きく下がったり不祥事で下がる。
 * 売り場の強さが brand × pullPer だけ上がる（最大 pullCap）。スキルツリーにブランド力が要るパネルがある。
 */
export const BRAND = {
  /** すべてのランクの上限（段 H1 から、いまの上限は出店したいちばん上のランクで決まる：BRAND_CAP） */
  max: 1600,
  log: 30,
  pullPer: 0.001,
  pullCap: 0.3,
  /** 上がるとき */
  firstSale: 5,
  sectorTop: 30,
  stayTop: 5,
  rankUp: 2,
  mission: 3,
  uncommon: 4,
  gate: 10,
  enter: { C: 5, U: 15, R: 25, E: 40, L: 60 } as Record<Tier, number>,
  adsSkill: 2,
  /** ランド制覇（そのランクのセクタすべてで 1 位） */
  landClear: 20,
  /** 下がるとき：順位が 2 つ以上下がったら、下がった数 × rankDown */
  rankDown: 6,
  /** 不祥事（妨害工作がばれた など。いまはまだ起きない） */
  scandal: 60,
};
/**
 * ブランド力の上限（段 H1：段 G の未解決「100% で Common のうちに 999 に届く」）。会社として出店したいちばん上のランクで決まる
 * （上のランクの町に出店すると上限が上がる＝伸びしろが残る）。売り場の強さはブランド力 300（BRAND.pullCap ÷ pullPer）で頭打ち、
 * カリスマ度は 400 で頭打ちなので、Common の上限 400 でも売れ方と雇えるレアリティは前と同じ。docs/ISLAND_BALANCE.md の v23
 */
export const BRAND_CAP: Record<Tier, number> = { C: 400, U: 600, R: 800, E: 1200, L: 1600 };

/** ランドセクタのランク（地図の広さ・他社の強さ・お客さんの多さ・Common の商品の売れにくさ・出店許可申請の費用） */
export type Tier = 'C' | 'U' | 'R' | 'E' | 'L';
export const TIERS: Record<Tier, { n: number; rival: number; demand: number; commonPull: number; color: string }> = {
  C: { n: 16, rival: 1, demand: 1, commonPull: 1, color: '#b8c0d4' },
  U: { n: 21, rival: 2.2, demand: 2, commonPull: 0.55, color: '#7ee08f' },
  R: { n: 21, rival: 3.5, demand: 3, commonPull: 0.35, color: '#6fc6f0' },
  E: { n: 26, rival: 5, demand: 4.5, commonPull: 0.25, color: '#b49bff' },
  L: { n: 26, rival: 8, demand: 7, commonPull: 0.15, color: '#ffd257' },
};
/**
 * セクタの個性（docs/ISLAND_PHASE1.md「ランドマップとセクタ」）。
 * 同じランクでも、他社・売れ筋・特産・地形がセクタごとに違う。
 */
export interface SectorProfile {
  /** このセクタの同業他社（4 社）。無ければ RIVALS（最初のセクタ・タオックス） */
  rivals?: RivalDef[];
  /** 商品ごとの需要の倍率（無い商品は 1。gap の商品は 1.4〜1.8） */
  demand?: Partial<Record<string, number>>;
  /**
   * このセクタで「まだ誰も売っていない」勝ち筋の商品（2〜3 つ）。他社の sells には入れない。
   * 市場データ・マインちゃんのおすすめ（recommend）はここから選ぶ。最初の町タオックスはセンスと鋏（基礎の商品が売れる）
   */
  gap?: string[];
  /** 飽和（他社 2 社以上が扱う商品の売れにくさ）を掛けない。最初の町だけ（チュートリアルの売れ方を変えない） */
  noSaturation?: boolean;
  /** 特産：この素材が 20% 安い */
  cheap?: Mat[];
  /** 最初から全部のルート（紙・布・宝石）が開いている */
  routesOpen?: boolean;
  /** 最初からこのルートだけ開いている（routesOpen の一部だけ版） */
  routes?: Mat[];
  /** 住宅の数の倍率（町の大きさ。populate の住宅数に掛ける） */
  homes?: number;
  /** 他社のエクステ以外の月の売上の倍率（商売敵の強さ） */
  rivalMul?: number;
  /** 運ぶ日数の倍率（坂道 1.2 など） */
  haul?: number;
  /** 宣伝の効き目の倍率 */
  ads?: number;
  /** ランドマップに出す一言の特徴 */
  tag: string;
  /**
   * 到着の案内（マインちゃん 3 枚：目標 → リサーチ（市場データを開くボタン付き）→ 最初の一手）。
   * {top} は 1 位の他社の月の売上の見込みに置き換える。Uncommon の 3 枚目は「魔法の釜」がまだのときの文（あれば工房の文になる）
   */
  intro: string[];
}
/** 特産の素材の値引き */
export const CHEAP_RATE = 0.8;

export interface SectorDef {
  id: string;
  tier: Tier;
  name: string;
  /** 出店許可申請の費用（入国料） */
  fee: number;
  /** ランドマップの上の位置（0〜100） */
  at: [number, number];
  /**
   * つながった地図の上の位置（同じランクの階層の中。gx はマスの i の向き、gy は j の向き）。
   * 上下左右に 1 違いのセクタが隣どうし（斜めは隣ではない）。ランクが違えば別の階層で、つながらない。
   */
  grid: [number, number];
  /** 雲に覆われていて、まだ行けない */
  cloud?: boolean;
  /** 開放の条件：そのランクのセクタに n 個以上出店 */
  need?: { tier: Tier; n: number };
  /** 開放されても、まだ遊べない（準備中） */
  soon?: boolean;
  /** セクタの個性 */
  profile: SectorProfile;
  /** ランドマップの説明に添える予告（準備中のセクタ） */
  teaser?: string;
}

const rv = (id: string, name: string, sells: Partial<Record<string, number>>, base: number, store: string, margin: number): RivalDef => ({ id, name, sells, base, store, margin });
/** 3 枚目（最初の一手）：工房から */
const FIRST_WS = t('まずは[[工房]]を建て直そう。建物はセクタごとだよ。', 'First, rebuild your [[workshop]]. Buildings belong to each sector.');
/** Uncommon の 3 枚目：魔法の釜がまだのとき */
const FIRST_POT = t('まずは[[工房]]から。スキルツリーの[[魔法の釜]]で[[商品開発]]ができるよ。', 'Start with the [[workshop]]. The [[Magic pot]] in the skill tree unlocks [[product development]].');

/** 2 枚目（リサーチ）：基礎の商品はもう他店が売っている → 市場データで、まだ誰も売っていない商品を探す */
const RESEARCH = t('[[センス]]や[[鋏]]はもう他店が売っている。[[市場データ]]で、まだ誰も売っていない商品を探そう！', 'Rivals already sell [[Sensu]] and [[Scissors]]. Find goods nobody sells yet in the [[market data]]!');
const RESEARCH_U = t('基礎の商品はもう他店が売っている。[[市場データ]]で空いている商品を探して[[アンコモン]]にしよう！', 'Rivals already sell the basics. Find an open item in the [[market data]] and make it [[Uncommon]]!');
const RESEARCH_R = t('[[市場データ]]で空いている商品を探して、[[アンコモン]]か Rare の[[復刻品]]で勝負しよう！', 'Find an open item in the [[market data]] and compete with [[Uncommons]] or Rare [[revivals]]!');
const RESEARCH_E = t('[[市場データ]]で空いている商品を探して、Epic の[[復刻品]]と[[骨董]]で勝負しよう！', 'Find an open item in the [[market data]] and compete with Epic [[revivals]] and [[antiques]]!');
/** 到着の案内の 2 枚目（リサーチ）か。main.ts が「市場データを開く」ボタンを付ける */
export const isResearchPage = (text: string) => text === RESEARCH || text === RESEARCH_U || text === RESEARCH_R || text === RESEARCH_E;
/** 法務の部門の紹介（Epic の町に初めて進出して、法務の部門が開いたとき。段 H2 で中身ができた：M&A・契約・特許・争い） */
export const LEGAL_INTRO = () => [
  t('新しい部門：[[法務]]！ 他社の[[買収（M&A）]]・[[契約]]・[[特許]]・[[争いごと]]を受け持つよ。', 'New department: [[Legal]]! It handles [[M&A]], [[contracts]], [[patents]] and [[disputes]].'),
  t('[[M&A]]で 1 位でない他社を店ごと買える。[[特許]]で復刻品を守り、[[契約]]で素材を安く。まずは法務の画面へ！', '[[M&A]] buys a non-#1 rival, stores and all. [[Patents]] guard revivals; [[contracts]] cut material costs. See Legal!'),
];
/** 営業の部門の紹介（Rare の町に初めて進出して、営業の部門が開いたとき。main.ts の会話） */
export const SALES_INTRO = () => [
  t('新しい部門：[[営業]]！ 他社の店から[[お客さんを奪う]]のが仕事だよ。画面で店ごとの[[商圏]]が見えるの。', 'New department: [[Sales]]! It [[wins customers]] from rivals. Its screen shows each store’s [[trade area]].'),
  t(`取り分が開店時の ${Math.round(RARE_AREA.quitAt * 10)} 割を切って ${RARE_AREA.quitMonths} か月続くと、他社の店は撤退して[[空き店舗]]に。安く・すぐ出店できるよ！`, `A rival under ${Math.round(RARE_AREA.quitAt * 100)}% of its opening share for ${RARE_AREA.quitMonths} months closes, leaving a cheap [[vacant store]]!`),
];

/** 経理・総務の紹介（Uncommon の町に初めて進出して、2 つの部門が開いたとき。main.ts の会話。段 F） */
export const ACCT_INTRO = () => [
  t('新しい部門：[[経理]]と[[総務]]！ ここからは四半期ごとに利益へ[[法人税]]がかかるよ。', 'New departments: [[Accounting]] and [[General Affairs]]! Quarterly profit now pays [[corporate tax]].'),
  t('締めの前に[[設備]]や[[研究]]へ投資すると税が減るよ。[[総務]]ではヒーローの[[疲れ]]が見えるの。', 'Investing in [[upgrades]] or [[research]] before the close lowers the tax. [[General Affairs]] shows heroes’ [[fatigue]].'),
];
/** 1 枚目（目標）：ようこそ ＋ エリア 1 位 ＋ 1 位の他社の月の売上（{top}） */
const goal = (name: string) => t(`[[${name}]]へようこそ！ 目標は[[2 か月続けてエリア 1 位]]。1 位の他社は月 約 {top}。`, `Welcome to [[${name}]]! The goal: [[#1 in the area two months running]]. The leader makes about {top} a month.`);

/**
 * ランド「はじまりの国 Lime」の 21 セクタ（docs/ISLAND_PHASE1.md「ランドマップとセクタ」）。
 * id はセーブと繋がるので変えない（c1〜c3・u1〜u2・r1・e1・l1 は前からある id）。
 * at：ランドマップの位置（0〜100）。つながった地図の grid に合わせて、下から Common 2 段（4＋4。列＝gx・段＝gy）・Uncommon 3＋2・Rare 2＋2・Epic 3。
 * Legendary は Rare の 2 段目のあいだ（ランドの真ん中の都）。札が重ならないよう、同じ段は横に 19% 以上、段は縦に 13% 以上あける。
 */
export const SECTORS: SectorDef[] = [
  // ---------------------------------------------------------------- Common（下の段：c1〜c4）
  // gap：まだ誰も売っていない商品（他社の sells に入れない）。センスと鋏は、タオックスの外ではどこも他社 2 社以上が扱う（飽和）
  {
    id: 'c1',
    tier: 'C',
    name: t('タオックス', 'Taox'),
    fee: 0,
    at: [13, 89],
    grid: [0, 0],
    profile: { tag: t('はじまりの町。センスとランタンがよく売れる', 'Where it all begins. Sensu and Lanterns sell well'), intro: [], gap: ['Sensu', 'Scissors'], noSaturation: true },
  },
  {
    id: 'c2',
    tier: 'C',
    name: t('ユーホタウン', 'Yuho Town'),
    fee: 5000,
    at: [37, 89],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('kohan', t('湖畔ガラス', 'Lakeshore Glass'), { Lantern: 1.7, Scissors: 1 }, 9500, 'import', 0.18),
        rv('mizube', t('ミズベ商店', 'Mizube Store'), { Lantern: 1, Sensu: 1 }, 7000, 'general_store', 0.12),
        rv('watashi', t('渡し場雑貨', 'Ferry Goods'), { 'Node-Doll': 1.4, Scissors: 1.2 }, 6500, 'greengrocer', 0.14),
        rv('yoshino', t('ヨシノ工芸', 'Yoshino Crafts'), { Sensu: 1.3, Mallet: 0.8 }, 8000, 'watch', 0.1),
      ],
      gap: ['Goblet', 'Monocle'],
      demand: { Goblet: 1.6, Monocle: 1.5 },
      cheap: ['glass', 'clay'],
      tag: t('湖の町。ガラスと粘土が安く、ガラス細工を売る店がまだない', 'A lake town. Glass and clay are cheap, and no one sells glasswork yet'),
      intro: [goal(t('ユーホタウン', 'Yuho Town')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c3',
    tier: 'C',
    name: t('リデル・ヒルズ', 'Riddle Hills'),
    fee: 6000,
    at: [13, 75],
    grid: [0, 1],
    profile: {
      rivals: [
        rv('fusha', t('風車堂', 'Windmill House'), { Mallet: 1.5, Scissors: 1.2 }, 7500, 'import', 0.16),
        rv('okaue', t('丘の上雑貨', 'Hilltop Goods'), { Sensu: 1, Mallet: 1 }, 8000, 'general_store', 0.12),
        rv('kazami', t('カザミ金物', 'Kazami Hardware'), { Scissors: 1.6, Lantern: 0.8 }, 9000, 'greengrocer', 0.15),
        rv('hane', t('ハネ商店', 'Hane Store'), { Mallet: 0.8, Sensu: 1 }, 5500, 'watch', 0.08),
      ],
      gap: ['Knife', 'Compass'],
      demand: { Knife: 1.6, Compass: 1.5 },
      cheap: ['iron'],
      haul: 1.2,
      tag: t('金物好きの丘の町。鉄が安く、坂道で運ぶのに時間がかかる', 'A hill town that loves hardware. Iron is cheap; slopes slow hauling'),
      intro: [goal(t('リデル・ヒルズ', 'Riddle Hills')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c4',
    tier: 'C',
    name: t('キッチョムシティ', 'Kitchom City'),
    fee: 8000,
    at: [37, 75],
    grid: [1, 1],
    profile: {
      rivals: [
        rv('kitcho', t('キッチョム雑貨', 'Kitchom Goods'), { Sensu: 1.3, Scissors: 1.1 }, 8500, 'import', 0.15),
        rv('machida', t('よろず屋マチダ', 'Machida General'), { Sensu: 1, Mallet: 1, Lantern: 0.8 }, 9000, 'general_store', 0.12),
        rv('tsumugi', t('ツムギ生活館', 'Tsumugi Living'), { Scissors: 1.3, 'Node-Doll': 1, Ribbon: 1.2 }, 7500, 'greengrocer', 0.14),
        rv('komono', t('コモノ堂', 'Komono-do'), { Sensu: 1.2, Ribbon: 1 }, 6000, 'watch', 0.1),
      ],
      gap: ['Chair', 'Hat'],
      demand: { Chair: 1.6, Hat: 1.5 },
      homes: 1.3,
      tag: t('人が多い町。暮らしの品はそろっているが、家具と帽子の店がない', 'A busy town. Everyday goods abound, but no one sells furniture or hats'),
      intro: [goal(t('キッチョムシティ', 'Kitchom City')), RESEARCH, FIRST_WS],
    },
  },
  // ---------------------------------------------------------------- Common（上の段：c5〜c8）
  {
    id: 'c5',
    tier: 'C',
    name: t('オマツリタウン', 'Omatsuri Town'),
    fee: 8000,
    at: [63, 89],
    grid: [2, 0],
    profile: {
      rivals: [
        rv('yatai', t('屋台通り商会', 'Stall Street Trading'), { Lantern: 1.4, Sensu: 1.2 }, 8000, 'import', 0.16),
        rv('mikoshi', t('ミコシ屋', 'Mikoshiya'), { Sensu: 1.5, Scissors: 1 }, 7000, 'general_store', 0.13),
        rv('akari', t('提灯のアカリ', 'Akari Lanterns'), { Lantern: 1.6 }, 8500, 'greengrocer', 0.15),
        rv('hayashi', t('ハヤシ雑貨', 'Hayashi Goods'), { Scissors: 1, Mallet: 0.8 }, 6000, 'watch', 0.09),
      ],
      gap: ['Parasol', 'Quill'],
      demand: { Parasol: 1.7, Quill: 1.5 },
      ads: 1.4,
      tag: t('お祭りの町。宣伝がよく効き、紙の品を売る店がまだない', 'A festival town. Ads work well, and no one sells paper goods yet'),
      intro: [goal(t('オマツリタウン', 'Omatsuri Town')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c6',
    tier: 'C',
    name: t('ジラ・カントリー', 'Zira Country'),
    fee: 7000,
    at: [63, 75],
    grid: [2, 1],
    profile: {
      rivals: [
        rv('kikori', t('きこり商店', 'Woodcutter Store'), { Mallet: 1.3, Sensu: 1 }, 6500, 'import', 0.14),
        rv('hatake', t('ハタケ雑貨', 'Hatake Goods'), { Scissors: 1.1, Sensu: 0.9 }, 6000, 'general_store', 0.12),
        rv('bokujo', t('牧場の店', 'Ranch Shop'), { 'Node-Doll': 1.2, Lantern: 0.8 }, 5500, 'greengrocer', 0.11),
        rv('zira', t('ジラ金物', 'Zira Hardware'), { Mallet: 1, Scissors: 1 }, 7000, 'watch', 0.13),
      ],
      gap: ['Moai', 'Chair'],
      demand: { Moai: 1.6, Chair: 1.4 },
      cheap: ['wood'],
      homes: 0.8,
      haul: 1.1,
      tag: t('のどかな田舎。木材が安いが、お客さんは少なめ', 'Quiet countryside. Wood is cheap, but customers are fewer'),
      intro: [goal(t('ジラ・カントリー', 'Zira Country')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c7',
    tier: 'C',
    name: t('サクラコシティ', 'Sakurako City'),
    fee: 10000,
    at: [87, 89],
    grid: [3, 0],
    profile: {
      rivals: [
        rv('hanami', t('花見堂', 'Hanami-do'), { Sensu: 1.5, Lantern: 1 }, 8500, 'import', 0.17),
        rv('washi', t('サクラ和紙店', 'Sakura Paper Shop'), { Sensu: 1.2, Quill: 1.2 }, 7000, 'general_store', 0.13),
        rv('hinaya', t('ひな人形のヒナヤ', 'Hinaya Dolls'), { 'Node-Doll': 1.5, Scissors: 1 }, 7500, 'greengrocer', 0.15),
        rv('harukaze', t('春風商店', 'Spring Breeze Store'), { Scissors: 1, Mallet: 1, Quill: 0.8 }, 6500, 'watch', 0.1),
      ],
      gap: ['Parasol', 'JapaneseDoll'],
      demand: { Parasol: 1.6, JapaneseDoll: 1.7 },
      routes: ['paper'],
      tag: t('桜の町。紙が手に入り、和の品がまだ足りない', 'A cherry-blossom town. Paper is on sale; traditional goods are scarce'),
      intro: [goal(t('サクラコシティ', 'Sakurako City')), RESEARCH, FIRST_WS],
    },
  },
  {
    id: 'c8',
    tier: 'C',
    name: t('ペストタウン', 'Pest Town'),
    fee: 12000,
    at: [87, 75],
    grid: [3, 1],
    profile: {
      rivals: [
        rv('gekiyasu', t('ゲキヤス本舗', 'Gekiyasu Honpo'), { Sensu: 1.2, Scissors: 1.2, Lantern: 1.2 }, 10000, 'import', 0.08),
        rv('nendo', t('ネンド工房ショップ', 'Nendo Studio Shop'), { 'Node-Doll': 1.5, Mallet: 1 }, 8000, 'general_store', 0.14),
        rv('tenbin', t('天秤商会', 'Tenbin Trading'), { Mallet: 1.3, Lantern: 1.2, Sensu: 1 }, 9000, 'greengrocer', 0.12),
        rv('kuiki', t('クイキ商店', 'Kuiki Store'), { Scissors: 1.4 }, 8500, 'watch', 0.11),
      ],
      gap: ['Ribbon', 'Knife'],
      demand: { Ribbon: 1.6, Knife: 1.5 },
      cheap: ['clay'],
      rivalMul: 1.15,
      tag: t('商売敵の多い町。基礎の商品はどれも取り合い。粘土が安い', 'A town full of rivals; every basic good is contested. Clay is cheap'),
      intro: [goal(t('ペストタウン', 'Pest Town')), RESEARCH, FIRST_WS],
    },
  },
  // ---------------------------------------------------------------- Uncommon（u1〜u5）
  // 基礎の 5 つはどれも他社 2 社以上が扱う。gap の商品をアンコモンにするのが勝ち筋
  {
    id: 'u1',
    tier: 'U',
    name: t('ウメコタウン', 'Umeko Town'),
    fee: 150000,
    at: [20, 62],
    grid: [0, 0],
    profile: {
      rivals: [
        rv('ship', t('シップ商会', 'Ship Trading'), { Lantern: 1.4, Scissors: 1.4, Mallet: 1 }, 12000, 'import', 0.2),
        rv('shiokaze', t('潮風堂', 'Sea Breeze House'), { Sensu: 1.2, 'Node-Doll': 1.2 }, 10000, 'general_store', 0.14),
        rv('kowan', t('港湾雑貨', 'Harbor Goods'), { Mallet: 1.3, Lantern: 1, 'Node-Doll': 1 }, 9000, 'greengrocer', 0.15),
        rv('funanori', t('船乗りの店', 'Sailors’ Shop'), { Scissors: 1, Sensu: 1 }, 8000, 'watch', 0.1),
      ],
      gap: ['MusicBox', 'Compass'],
      demand: { MusicBox: 1.6, Compass: 1.5 },
      routesOpen: true,
      tag: t('遠くの素材（紙・布・宝石）が最初から買える港町。アンコモンの出番', 'A port where far-off materials (paper, cloth, gems) are on sale from day one. Time for Uncommons'),
      intro: [goal(t('ウメコタウン', 'Umeko Town')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u2',
    tier: 'U',
    name: t('ヤツカノタウン', 'Yatsukano Town'),
    fee: 180000,
    at: [50, 62],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('kajiya', t('鍛冶屋ヤツカ', 'Yatsuka Smithy'), { Mallet: 1.5, Scissors: 1.3 }, 12000, 'import', 0.18),
        rv('hagane', t('ハガネ商会', 'Hagane Trading'), { Scissors: 1.5, Sensu: 1, Chair: 1 }, 10000, 'general_store', 0.15),
        rv('kanagu', t('金具のカナグ', 'Kanagu Fittings'), { Mallet: 1.2, Lantern: 1, 'Node-Doll': 1 }, 9000, 'greengrocer', 0.13),
        rv('tsuchiya', t('ツチ屋', 'Tsuchiya'), { Mallet: 1, Sensu: 1, Lantern: 0.8, 'Node-Doll': 0.8, Chair: 1 }, 8000, 'watch', 0.1),
      ],
      gap: ['Knife', 'MusicBox'],
      demand: { Knife: 1.7, MusicBox: 1.5 },
      cheap: ['iron'],
      tag: t('金物の町。鉄が安く、刃物と細工物がまだ足りない', 'A hardware town. Iron is cheap; blades and fine work are scarce'),
      intro: [goal(t('ヤツカノタウン', 'Yatsukano Town')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u3',
    tier: 'U',
    name: t('エムケーシティ', 'MK City'),
    fee: 220000,
    at: [80, 62],
    grid: [2, 0],
    profile: {
      rivals: [
        rv('sakaue', t('坂上百貨', 'Slopetop Department'), { Sensu: 1.2, Mallet: 1.2, 'Node-Doll': 1.2, Lantern: 1.2, Scissors: 1.2, Ribbon: 1 }, 15000, 'import', 0.22),
        rv('guild', t('ギルド商店', 'Guild Store'), { Lantern: 1.5, Mallet: 1.5 }, 12000, 'general_store', 0.16),
        rv('nobori', t('のぼり屋', 'Banner House'), { Sensu: 1.5, Ribbon: 1.2 }, 9000, 'greengrocer', 0.14),
        rv('sakashita', t('坂下金物', 'Slopefoot Hardware'), { Scissors: 1.6, 'Node-Doll': 1 }, 10000, 'watch', 0.1),
      ],
      gap: ['Hat', 'Goblet'],
      demand: { Hat: 1.6, Goblet: 1.5 },
      haul: 1.3,
      ads: 1.5,
      tag: t('商人の坂の町。宣伝がよく効くが、坂で運ぶのは遅い', 'A merchants’ hill town. Ads work well, but hauling up the slope is slow'),
      intro: [goal(t('エムケーシティ', 'MK City')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u4',
    tier: 'U',
    name: t('ゴリ・ラグズ', 'Gori Rugs'),
    fee: 260000,
    at: [35, 49],
    grid: [0, 1],
    profile: {
      rivals: [
        rv('orimono', t('織物のゴリ', 'Gori Weaves'), { 'Node-Doll': 1.5, Sensu: 1, Hat: 1 }, 12000, 'import', 0.19),
        rv('shikimono', t('敷物商会', 'Rug Trading'), { 'Node-Doll': 1.2, Lantern: 1, Mallet: 1 }, 10500, 'general_store', 0.14),
        rv('momen', t('モメン屋', 'Momenya'), { Sensu: 1.2, Scissors: 1.1, Hat: 1.2 }, 9000, 'greengrocer', 0.13),
        rv('itoyo', t('糸屋イトヨ', 'Itoyo Threads'), { Scissors: 1.3, Lantern: 1, Mallet: 0.8 }, 8000, 'watch', 0.1),
      ],
      gap: ['Ribbon', 'JapaneseDoll'],
      demand: { Ribbon: 1.6, JapaneseDoll: 1.7 },
      routes: ['cloth'],
      tag: t('織物の町。布が手に入り、リボンや人形を売る店がまだない', 'A weaving town. Cloth is on sale; no one sells ribbons or dolls yet'),
      intro: [goal(t('ゴリ・ラグズ', 'Gori Rugs')), RESEARCH_U, FIRST_POT],
    },
  },
  {
    id: 'u5',
    tier: 'U',
    name: t('ザックシティ', 'Zack City'),
    fee: 300000,
    at: [65, 49],
    grid: [1, 1],
    profile: {
      rivals: [
        rv('zack', t('ザック百貨', 'Zack Department'), { Sensu: 1.2, Mallet: 1.2, 'Node-Doll': 1.2, Lantern: 1.2, Scissors: 1.2, Knife: 1 }, 16000, 'import', 0.2),
        rv('metro', t('メトロ商会', 'Metro Trading'), { Lantern: 1.4, Scissors: 1.3, Chair: 1 }, 13000, 'general_store', 0.16),
        rv('tokai', t('トカイ雑貨', 'Tokai Goods'), { Sensu: 1.3, 'Node-Doll': 1.2, Knife: 1 }, 11000, 'greengrocer', 0.14),
        rv('ekimae', t('駅前マート', 'Station Mart'), { Mallet: 1.3, Sensu: 1, Chair: 1 }, 10000, 'watch', 0.12),
      ],
      gap: ['MusicBox', 'Monocle', 'Goblet'],
      demand: { MusicBox: 1.5, Monocle: 1.4, Goblet: 1.4 },
      homes: 1.3,
      rivalMul: 1.2,
      tag: t('Uncommon いちばんの大都市。お客さんも商売敵も多い', 'The biggest Uncommon city. Many customers, many rivals'),
      intro: [goal(t('ザックシティ', 'Zack City')), RESEARCH_U, FIRST_POT],
    },
  },
  // ---------------------------------------------------------------- Rare（r1〜r4。Rare の町 ①）
  // 基礎の 5 つは Uncommon と同じく、どれも他社 2 社以上が扱う。gap の商品をアンコモンにする・Rare の復刻品（他社の sells に入れない）が勝ち筋。
  // 他社の店の場所（store）は町を作るときに決まる。Rare の町 ②（段 C）：他社 1 社に RARE_AREA.stores 軒の店があり、店ごとに商圏を取り合う
  {
    id: 'r1',
    tier: 'R',
    name: t('グリーン・マウス', 'Green Mouse'),
    fee: 600000,
    at: [25, 36],
    grid: [0, 0],
    profile: {
      rivals: [
        rv('midori', t('緑門商会', 'Green Gate Trading'), { Lantern: 1.4, Scissors: 1.3, Mallet: 1.2, Sensu: 1 }, 15000, 'import', 0.2),
        rv('konoha', t('木の葉百貨', 'Konoha Department'), { Sensu: 1.3, 'Node-Doll': 1.2, Hat: 1 }, 13000, 'general_store', 0.16),
        rv('morimichi', t('森の道具屋', 'Forest Tools'), { Mallet: 1.4, Knife: 1.1, Lantern: 1 }, 11000, 'greengrocer', 0.14),
        rv('wakaba', t('若葉マート', 'Wakaba Mart'), { Scissors: 1.2, 'Node-Doll': 1, Sensu: 1 }, 10000, 'watch', 0.1),
      ],
      gap: ['Chair', 'Moai'],
      demand: { Chair: 1.6, Moai: 1.5 },
      cheap: ['wood'],
      routesOpen: true,
      tag: t('緑に囲まれた、9 つのランドへの門の町。木材が安く、家具と石像の店がない', 'A green town at the gate to the nine lands. Wood is cheap; no one sells furniture or statues'),
      intro: [goal(t('グリーン・マウス', 'Green Mouse')), RESEARCH_R, FIRST_POT],
    },
  },
  {
    id: 'r2',
    tier: 'R',
    name: t('カスミシティ', 'Kasumi City'),
    fee: 700000,
    at: [75, 36],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('kasumiya', t('霞屋', 'Kasumiya'), { Sensu: 1.3, Lantern: 1.3, Scissors: 1.2, Ribbon: 1 }, 16000, 'import', 0.2),
        rv('oichiba', t('大市場商会', 'Grand Market Trading'), { Mallet: 1.3, 'Node-Doll': 1.3, Knife: 1 }, 14000, 'general_store', 0.15),
        rv('nesage', t('ネサゲ本舗', 'Nesage Honpo'), { Sensu: 1.2, Scissors: 1.4, Quill: 1.1 }, 13000, 'greengrocer', 0.08),
        rv('yagura', t('やぐら百貨', 'Yagura Department'), { Lantern: 1.1, Mallet: 1, 'Node-Doll': 1, Chair: 1, Ribbon: 1 }, 12000, 'watch', 0.12),
      ],
      gap: ['Goblet', 'Monocle', 'Hat'],
      demand: { Goblet: 1.5, Monocle: 1.5, Hat: 1.4 },
      rivalMul: 1.15,
      ads: 1.3,
      tag: t('霞のかかる大きな市場。他社の店が立ち並び、ガラス細工と帽子の店がない', 'A great market in the haze, lined with rival stores. No one sells glasswork or hats'),
      intro: [goal(t('カスミシティ', 'Kasumi City')), RESEARCH_R, FIRST_POT],
    },
  },
  {
    id: 'r3',
    tier: 'R',
    name: t('デグノブタウン', 'Degnob Town'),
    fee: 800000,
    at: [25, 23],
    grid: [0, 1],
    profile: {
      rivals: [
        rv('degno', t('デグノ工房ショップ', 'Degno Workshop Shop'), { Mallet: 1.5, Scissors: 1.3, Chair: 1.1 }, 15000, 'import', 0.18),
        rv('kozan', t('鉱山通り商店', 'Mine Street Store'), { Lantern: 1.4, Mallet: 1.1, 'Node-Doll': 1, Moai: 1 }, 13000, 'general_store', 0.15),
        rv('shokunin', t('職人横丁', 'Crafters’ Alley'), { Sensu: 1.3, 'Node-Doll': 1.3, Goblet: 1 }, 12000, 'greengrocer', 0.14),
        rv('hagaya', t('鋼屋', 'Hagaya'), { Scissors: 1.2, Sensu: 1, Lantern: 1 }, 11000, 'watch', 0.11),
      ],
      gap: ['Knife', 'Compass'],
      demand: { Knife: 1.7, Compass: 1.5 },
      cheap: ['iron'],
      haul: 1.2,
      tag: t('深い坑道の上の、職人と商人の町。鉄が安く、坂で運ぶのは遅い', 'A crafters’ and traders’ town over deep mines. Iron is cheap; slopes slow hauling'),
      intro: [goal(t('デグノブタウン', 'Degnob Town')), RESEARCH_R, FIRST_POT],
    },
  },
  {
    id: 'r4',
    tier: 'R',
    name: t('ネコツ・バメ', 'Nekotsu Bame'),
    fee: 900000,
    at: [75, 23],
    grid: [1, 1],
    profile: {
      rivals: [
        rv('minatoya', t('港の大店', 'Harbor Emporium'), { Lantern: 1.3, Sensu: 1.3, Mallet: 1.2, Scissors: 1.2, Compass: 1 }, 17000, 'import', 0.2),
        rv('nekotsu', t('ネコツ商会', 'Nekotsu Trading'), { 'Node-Doll': 1.4, Scissors: 1.2, Hat: 1 }, 14000, 'general_store', 0.15),
        rv('bame', t('バメ雑貨', 'Bame Goods'), { Sensu: 1.2, Mallet: 1.1, Goblet: 1 }, 12000, 'greengrocer', 0.13),
        rv('shiosai', t('潮騒マーケット', 'Shiosai Market'), { Lantern: 1.1, 'Node-Doll': 1, Knife: 1 }, 11000, 'watch', 0.12),
      ],
      gap: ['MusicBox', 'Ribbon', 'JapaneseDoll'],
      demand: { MusicBox: 1.5, Ribbon: 1.5, JapaneseDoll: 1.6 },
      routes: ['cloth', 'gem'],
      homes: 1.3,
      tag: t('港と市場が隣り合う、にぎやかな町。布と宝石が手に入り、お客さんが多い', 'A lively town where the port meets the market. Cloth and gems are on sale; many customers'),
      intro: [goal(t('ネコツ・バメ', 'Nekotsu Bame')), RESEARCH_R, FIRST_POT],
    },
  },
  // ---------------------------------------------------------------- Epic（e1〜e3。段 H1：Epic の町 ①）
  // 基礎の 5 つは Rare と同じく、どれも他社 2 社以上が扱う。gap の商品・Epic の復刻品・骨董（ダンジョンの Rare 以上）は他社の sells に入れない（勝ち筋）。
  // 商圏の取り合い（EPIC_AREA）も Rare と同じく効く。入国料は Rare（60〜90 万 G）より高い（Epic への初進出はランクアップなので取らない）
  {
    id: 'e1',
    tier: 'E',
    name: t('ヒトシタウン', 'Hitoshi Town'),
    fee: 1200000,
    at: [25, 10],
    grid: [0, 0],
    profile: {
      rivals: [
        rv('yoriai', t('寄り合い百貨', 'Yoriai Department'), { Sensu: 1.3, Lantern: 1.3, Scissors: 1.2, Mallet: 1.1 }, 17000, 'import', 0.2),
        rv('hitoshi', t('ヒトシ商会', 'Hitoshi Trading'), { 'Node-Doll': 1.4, Ribbon: 1.2, Sensu: 1 }, 15000, 'general_store', 0.16),
        rv('wakeai', t('分け合い市場', 'Sharing Market'), { Mallet: 1.3, Lantern: 1.1, Knife: 1 }, 13000, 'greengrocer', 0.13),
        rv('chobo', t('帳面屋', 'Ledger House'), { Scissors: 1.3, Quill: 1.2, 'Node-Doll': 1 }, 12000, 'watch', 0.11),
      ],
      gap: ['Hat', 'JapaneseDoll'],
      demand: { Hat: 1.6, JapaneseDoll: 1.6 },
      cheap: ['cloth'],
      routesOpen: true,
      homes: 1.1,
      tag: t('裂けた大地から人々が集まり、分け合って立て直した町。布が安く、帽子と人形の店がない', 'Where people gathered after the land split and rebuilt by sharing. Cloth is cheap; no one sells hats or dolls'),
      intro: [goal(t('ヒトシタウン', 'Hitoshi Town')), RESEARCH_E, FIRST_POT],
    },
  },
  {
    id: 'e2',
    tier: 'E',
    name: t('ヌコカントリー', 'Nuko Country'),
    fee: 1400000,
    at: [50, 10],
    grid: [1, 0],
    profile: {
      rivals: [
        rv('nuko', t('ヌコ物産', 'Nuko Produce'), { Sensu: 1.3, Mallet: 1.3, 'Node-Doll': 1.1, Lantern: 1 }, 16000, 'import', 0.18),
        rv('hatakeya', t('畑の大店', 'Field Emporium'), { Scissors: 1.3, Sensu: 1.1, Ribbon: 1 }, 14000, 'general_store', 0.15),
        rv('tanemori', t('種守商店', 'Seedkeeper Store'), { Lantern: 1.2, Mallet: 1, Knife: 1.1, Hat: 1 }, 12500, 'greengrocer', 0.14),
        rv('komichi', t('こみち雑貨', 'Komichi Goods'), { Scissors: 1.2, 'Node-Doll': 1.2, Compass: 1 }, 11500, 'watch', 0.11),
      ],
      gap: ['Chair', 'Parasol'],
      demand: { Chair: 1.6, Parasol: 1.6 },
      cheap: ['wood', 'clay'],
      routesOpen: true,
      homes: 0.9,
      haul: 1.1,
      tag: t('守られた種から畑を立て直した、のどかな国。木材と粘土が安く、家具と傘の店がない', 'A quiet land whose fields grew back from saved seeds. Wood and clay are cheap; no one sells furniture or parasols'),
      intro: [goal(t('ヌコカントリー', 'Nuko Country')), RESEARCH_E, FIRST_POT],
    },
  },
  {
    id: 'e3',
    tier: 'E',
    name: t('クリプト・サン・シティ', 'Crypto Sun City'),
    fee: 1600000,
    at: [75, 10],
    grid: [2, 0],
    profile: {
      rivals: [
        rv('taiyo', t('太陽百貨', 'Sun Department'), { Lantern: 1.4, Sensu: 1.3, Mallet: 1.2, Scissors: 1.2, Hat: 1 }, 18000, 'import', 0.21),
        rv('tomoshibi', t('ともしび商会', 'Tomoshibi Trading'), { Lantern: 1.3, 'Node-Doll': 1.3, Knife: 1 }, 15000, 'general_store', 0.16),
        rv('kirimukou', t('霧の向こう屋', 'Beyond-the-Mist'), { Sensu: 1.2, Scissors: 1.3, Ribbon: 1, Chair: 1 }, 13000, 'greengrocer', 0.13),
        rv('tounomoto', t('塔のふもと商店', 'Towerfoot Store'), { Mallet: 1.1, 'Node-Doll': 1, Compass: 1, Quill: 1 }, 12000, 'watch', 0.12),
      ],
      gap: ['MusicBox', 'Goblet', 'Monocle'],
      demand: { MusicBox: 1.5, Goblet: 1.5, Monocle: 1.4 },
      routesOpen: true,
      homes: 1.3,
      rivalMul: 1.15,
      ads: 1.3,
      tag: t('霧の向こうへ灯を送る太陽の塔の都。Epic いちばんの大都市で、オルゴールとガラス細工の店がない', 'The city of the sun tower that sends light beyond the mist. The biggest Epic city; no one sells music boxes or glasswork'),
      intro: [goal(t('クリプト・サン・シティ', 'Crypto Sun City')), RESEARCH_E, FIRST_POT],
    },
  },
  // ---------------------------------------------------------------- Legendary（雲の向こう）
  { id: 'l1', tier: 'L', name: t('ヤマピーキングダム', 'Yamapi Kingdom'), fee: 0, at: [50, 23], grid: [0, 0], cloud: true, profile: { tag: t('ブランド力で売る、ランドいちばんの都', 'The capital of the land, won by brand power'), intro: [] } },
];

/** すべてのセクタの同業他社（id はセクタをまたいで重ならない） */
export const ALL_RIVALS: RivalDef[] = [...RIVALS, ...SECTORS.flatMap((x) => x.profile.rivals ?? [])];
/** 他社の定義（どのセクタの他社でも引ける） */
export const rivalDef = (id: string) => ALL_RIVALS.find((x) => x.id === id);
/** セクタの他社（無ければタオックスの 4 社） */
export const rivalsOf = (sector = 'c1') => SECTORS.find((x) => x.id === sector)?.profile.rivals ?? RIVALS;
/** Uncommon の 3 枚目：魔法の釜があれば工房の文 */
export const introFirstStep = (tier: Tier, hasPot: boolean) => (tier !== 'C' && !hasPot ? FIRST_POT : FIRST_WS);

/**
 * セクタマネージャー：離れたセクタを、指名したヒーローが運営する。
 * 月の売上 ＝ 離れたときの売上 ×（at0 ＋ 適性 × per。min〜max）× ゆらぎ（±noise）×（投資で伸びたぶん）。
 * 適性は能力値の平均。見習い（約 28）で 0.83、コモンの強い人（約 45）で 1.0、レジェンダリー（約 75）で 1.3。
 * 投資：利益のうち invest の割合をそのセクタへ。投資 1 G で月の売上が roi G 伸びる。
 */
export const MANAGER = { at0: 0.55, per: 0.01, min: 0.5, max: 1.4, none: 0.5, noise: 0.12, roi: 0.25, invest: 0.3, choices: [0, 0.3, 0.5, 0.8] };
/** 1 日働くとスタミナが減る量と、休むと戻る量 */
export const STAMINA = { work: 10, rest: 30, tired: 0.15, back: 0.8 };
/** 雇ったヒーローの月給（基準）。能力の合計に比例 */
export const WAGE_PER_STAT = 3;

// ---------------------------------------------------------------- 運搬・お店

/** 荷車は 1 日に道を cellsPerDay マス（遠いお店ほど運ぶ日数がかかる）。調達係は歩いて walkPerDay マス */
export const TRANSPORT = { cap: 10, cellsPerDay: 2.5, walkPerDay: 8 };

/**
 * 商圏（docs/ISLAND_PHASE1.md「商圏と出店」）。
 * 住宅と駅にお客さんが住んでいて、商品ごとの需要を持つ。お客さんは近いお店・強いお店ほど行き、
 * 遠いと「買わない」を選ぶ（outside）。お店への引き寄せ = 売り場の強さ ÷ (1 + (距離 / d0)²)。
 * - 他社の近くで同じ商品を売ると、同じお客さんの取り合い（他社の売上も減る）
 * - 自社のお店どうしを近くに置くと、自社で取り合う
 * - 散らばらせると、まだ取られていないお客さんに届くが、工房から遠くなって運ぶのに日数がかかる
 * pot：エリアの需要（PRODUCTS.demand）に掛ける倍率（お店が近くにないと買われないぶん、もとの需要より多めに持つ）
 */
export const MARKET = {
  d0: 2.5,
  outside: 0.3,
  pot: 2.2,
  rivalPull: 1.1,
  pop: { station: 6, apartment: 3, manor: 1.5, house: 1, cottage: 1, garage_house: 1, japanese_house: 1 } as Record<string, number>,
  /**
   * 他社が 2 社以上扱っている商品は「他店で供給が足りている」（飽和）。自社の売り場の引き寄せに掛ける（Uncommon の商品は satU）。
   * そのセクタの gap（まだ誰も売っていない商品）と、noSaturation のセクタ（最初の町）は除く。
   */
  saturated: 0.45,
  satU: 0.7,
  satAt: 2,
  /** 技が要る商品のうち、そのセクタの gap でないものの需要の倍率（その町ではまだあまり求められていない） */
  niche: 0.5,
  /**
   * 他社の反撃：自社がそのセクタで 1 位になった月（前月は 1 位でない）から rallyMonths か月、
   * 他社の売り場の強さが rally 倍（宣伝を始める）。docs/ISLAND_PHASE1.md「他社の反撃」
   */
  rally: 1.25,
  rallyMonths: 2,
};
/** 制覇（KGI の達成）：そのセクタで、この月数だけ続けて 1 位 */
export const TOP_STREAK = 2;
/**
 * 発掘 v2 の 5 段目：Uncommon の調査依頼状は、Common のセクタでこの数だけ研究成果を発表したら届く
 * （docs/ISLAND_PHASE1.md「お題・発表・調査依頼状」）
 */
export const LETTER_NEED = 2;
/** 物流拠点：工房 → 拠点はトラックの定期便（距離 × link）、拠点 → お店は荷車 */
export const DEPOT = { link: 0.3 };
export const SHOP = { shelfCap: 10, storageCap: 20, displayPerDay: 6, partTimeDisplay: 4, partTimeWage: 30, partTimeMax: 1, noStaff: 0 };
/**
 * 段 UI5a：お店の自走。店長（お店の担当のヒーロー）が休んでいる日は、店長が管理する従業員（アルバイト）が店を回す：
 * 従業員が min 人以上いれば、売り場の強さは 1 人 per（店長がいる日の手伝いは 1 人 0.15）・上限 cap（店長がいる日はおよそ 1）。
 * 1 人だけでは店を回せない（レジの手伝いだけ。前のまま 0.15）。店長のいないお店も前のまま。
 * docs/ISLAND_PHASE1.md「お店の自走」
 */
export const SELF_RUN = { min: 2, per: 0.3, cap: 0.75 };
/**
 * 段 UI5c：お店の方針「在庫を優先して売りさばく」。cuts：値引きの段（0＝値引きなしで棚の順だけ・1 割・2 割・3 割）。
 * 売りさばく品（在庫品：いま作り続けていない商品の在庫と、手持ちの素材で使い切りに作った品）だけ、値段 ×(1 − 値引き)・売り場の強さ ×(1 + 値引き)。
 * 1 個あたりの売上は (1 − c)(1 + c) ＝ 1 − c² 以下になる（売上の上乗せはしない。在庫を減らす手）。
 * warn：倉庫（工房の物置と倉庫）がこの割合を超えた月の締めに、店長（いなければ運搬係）から提案のカード。
 * docs/ISLAND_PHASE1.md「在庫の売りさばき（段 UI5c）」
 */
export const CLEAR = { cuts: [0, 0.1, 0.2, 0.3], warn: 0.8, def: 1 };
/** 新しいお店の認知度：開店した日は 0.2、1 日 0.02 ずつ上がって 1 まで（売れる数にかかる） */
export const AWARE = { start: 0.35, perDay: 0.025 };
/**
 * 新商品の認知（セクタごと・商品ごと。0〜1）。そのセクタで初めて並べる商品は、お客さんがまだ知らない（start）。
 * 自社のお店の棚に並んでいる日に perDay、宣伝が効いている日はさらに ad だけ育つ（並べていない日は変わらない）。
 * 売れる数（売り場の強さ）に掛ける。noSaturation のセクタ（最初の町タオックス）は全部 1（チュートリアルを変えない）
 */
export const AWARE_GOODS = { start: 0.3, perDay: 0.02, ad: 0.03, low: 0.6 };
/**
 * 保管：工房の物置（素材と、運ぶ前の商品の合計）と、倉庫 1 つで増える数。いっぱいだと調達もクラフトもできない。
 * 段 UI5d：物流拠点（建物 logistics）も 1 つで depot 置ける（倉庫より少し小さい：仕分けと積み替えの場所をとる）。
 * 倉庫の強化（設備投資 rack）は 1 段 rack 個、物流拠点の強化（設備投資 dock）は 1 段 dock 個
 */
export const STORE = { base: 80, warehouse: 200, depot: 150, rack: 100, dock: 75 };
/**
 * 段 UI7f：倉庫があふれる先の見込み（storefc.ts）。hist：グラフに出す月末の記録の数（いちばん新しいものから）・ahead：グラフの予想の月の数（あふれる月が先ならそこまで、max まで）・
 * minDays：記録の増え方で見込むのに要る日数（足りなければ先月の流れの数＝買った・作った・運んだから）
 */
export const STORE_FC = { hist: 4, ahead: 4, max: 6, minDays: 20 };
/**
 * 段 I2c：税・経費の手（経理のパネル。acctgain.ts）を部長が打つ・経営会議で出す目安：元が取れるまで（導入 ÷ 月の税・経費の減り）pay か月まで。
 * 研究ポイントは 1 RP を rpG G として数える（経営会議の打ち手の選び方と同じ）
 */
export const MONEY_LEVER = { pay: 24, rpG: 20 };

// ---------------------------------------------------------------- スキルツリー

/** 枝（9 本）。dig＝発掘（発掘 v2 の 2 段目。Lime だけ・発掘との出会いのあとに雲から出る。パネルはすべてお金パネル） */
/** sales：営業の枝（段 C。Rare の外周だけ。BRANCHES の 9 本には入れない＝もとの枝の数・外周の半径は変えない） */
export type Branch = 'shop' | 'craft' | 'logi' | 'buy' | 'people' | 'ops' | 'sys' | 'tech' | 'dig' | 'sales' | 'legal';

export interface Skill {
  id: string;
  /** もとの枝（9 本。RP の値段の割り振り・SCM の段・自動プレイが使う）。スキルツリーでは部門の枝の中の小さな束 */
  branch: Branch;
  /** 部門（data.ts の DEPT_MOVE・BRANCH_DEPT で決める。docs/ISLAND_PHASE1.md「部門」） */
  dept?: DeptId;
  name: string;
  /** 効き目（数字で書く） */
  note: string;
  cost: number;
  requires?: string[];
  /** 先に要るパネルのレベル（requires のうち、Lv2 以上が要るもの。「発掘隊の手際 Lv3」など） */
  reqLv?: Record<string, number>;
  /** ids のうち n 個以上を取っていると取れる（「技を 3 つ」など） */
  anyOf?: { ids: string[]; n: number };
  /** 取るのに要るブランド力 */
  brand?: number;
  /** 技の修行の日数（取ったあと、職人が修行して身につけるまで。製造の適性で縮む。無ければ即日） */
  train?: number;
  /**
   * 外周（ランクのエリア。無ければ C＝内側）。そのランクのセクタに出店したあと、スキルツリーを開いたときに開く（Flags.rings）。
   * docs/ISLAND_PHASE1.md「スキルツリー」
   */
  tier?: Tier;
  /** 取るのに要るエンブレムの数（持っている数。使って減らない） */
  emblem?: number;
  /**
   * 大きめの研究パネル（以前の ✨ ゴールドダストのパネル）。同じランクの研究パネルの約 2.5 倍の RP。
   * docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」
   */
  big?: boolean;
  /**
   * 区分：研究パネル（RP で開く。レベルなし）／お金パネル（資金で開く。Lv1〜5）。data.ts の最後で決める（MONEY_PANELS）
   */
  cat?: SkillCat;
  /** 研究パネルの値段（RP）。お金パネルは 0 */
  rp?: number;
  /** 封印（Epic・Legendary の外周。名前は「???」。まだ取れない） */
  sealed?: boolean;
  /** 準備中（まだ取れない） */
  soon?: boolean;
  /**
   * お金パネルの最大レベル（無ければ 5）。研究パネルはいつも 1（レベルなし。ここの値は使わない）。
   * docs/ISLAND_PHASE1.md「スキルツリー」「パネルのレベル」
   */
  max?: number;
  /** 数字の効果（レベル 1 の値）。汎用の効き目（model.ts の fxSum）で効く。レベル n で ×(1 + 0.25(n − 1)) */
  fx?: Fx[];
  /** 解放型のパネルの Lv2 からの効果（Lv2 の値。Lv n で ×(n − 1)）。汎用の効き目で効く */
  up?: Fx[];
  /** 効き目の表示（既存のパネル。効き目そのものは model.ts に個別に書いてある）。fx のパネルは fx から作る */
  show?: Shown[];
  /** 解放型のパネルの Lv2 からの個別の効き目の表示（効き目は model.ts。Lv n で ×(n − 1)） */
  upShow?: Shown[];
  /**
   * 無限の強化パネル（発掘 v2 の 6 段目）：研究パネル（RP 払い）なのに Lv の上限が無い。値段は infCost（Lv ごとに上がる）、
   * 効き目は model.ts の digRepeatMs・digPower・発破とドリルの大きさ（DIG_BALANCE.infinite）。RP 払いなので、のちのリセットでも残る側
   */
  inf?: InfKind;
  /** 研究への寄付（お金で RP を買う）：開放するパネルではなく、押すたびに G を払って RP を受け取る（回数の上限なし。donateCost） */
  donate?: boolean;
  /** 段 K：取るのに要る、そのパネルの部門の理解度（経営方針のパネル。「部門の開拓が一定に達すると開く」） */
  deptLv?: number;
  /** 段 K：スキルツリーで置く外周（無ければ tier）。法務の経営方針のパネルは Epic のパネルだが、Epic の外周に入る幅が無いので Rare の外周の位置に置く */
  ring?: Tier;
}
/** 無限の強化パネルの種類：発掘の速さ・掘る力・掘る範囲 */
export type InfKind = 'speed' | 'power' | 'reach';

/**
 * 汎用の効き目の種類（docs/ISLAND_PHASE1.md「汎用の効き目」）。新しいパネルは fx を書くだけで効く。
 * v は割合（0.1 = 10%）。apt・brand・lot は数。
 */
export type FxKind =
  | 'pull'
  | 'price'
  | 'demand'
  | 'known'
  | 'craftDays'
  | 'lot'
  | 'haulDays'
  | 'cartCap'
  | 'matPrice'
  | 'procCap'
  | 'buyDays'
  | 'display'
  | 'stamina'
  | 'rest'
  | 'apt'
  | 'wage'
  | 'upkeep'
  | 'ads'
  | 'brand'
  | 'rally'
  | 'manager'
  | 'flow'
  | DigFxKind;
/**
 * 発掘の枝の効き目（docs/ISLAND_PHASE1.md「発掘のスキルツリー」）。値はレベルごとの表（Fx.at）で書く（Lv で素直に比例しないため）。
 * fxSum で合計を読む（発掘作業の長さ・1 打の強さ・会心・長押しの間隔・隣への力・隊の速さ・常駐の速さ・交代制・素材）
 */
export type DigFxKind = 'dig.sec' | 'dig.power' | 'dig.crit' | 'dig.repeat' | 'dig.reach' | 'dig.crew' | 'dig.autoSpeed' | 'dig.relay' | 'dig.mat';
export interface Fx {
  kind: FxKind;
  v: number;
  /** レベルごとの値（Lv1〜5）。あれば v × 倍率の代わりにこれを使う（発掘の枝） */
  at?: number[];
}
/** 効き目の表示の 1 行（label の後ろに「+15%」のように値が付く） */
export interface Shown {
  label: string;
  v: number;
  /** % なら割合（0.15 → 15%）。'' なら数（+2） */
  unit: '%' | '';
  /** 下げる効果（−） */
  down?: boolean;
  /** レベルで 1 ずつ足す（ロット +1 個 → Lv2 で +2 個）。無ければ ×(1 + 0.25(n − 1)) */
  lin?: boolean;
  /** レベルごとの値（Lv1〜5。発掘の枝）。あれば v × 倍率の代わりにこれ */
  at?: number[];
  /** レベルごとの文（Lv1〜5。発掘の枝の「岩盤まで」「左右 1 マス」など）。あれば数の代わりにこれ */
  txt?: string[];
  /** 値のうしろの単位（「 秒」「 ms」など） */
  suf?: string;
  /** 符号（+・−）を付けない（「150 ms」のような、そのものの値） */
  bare?: boolean;
}
/** 数で足す効き目（ロット・ブランド力）：レベルで 1 ずつ（v × lv）。このパネルは最大 3 */
export const FX_LIN: FxKind[] = ['lot', 'brand'];
/** 下げる効き目（表示で −） */
export const FX_DOWN: FxKind[] = ['craftDays', 'haulDays', 'matPrice', 'buyDays', 'stamina', 'wage', 'upkeep', 'rally', 'dig.relay'];
/** fx の種類の表示名 */
export const FX_LABEL: Record<FxKind, string> = {
  pull: t('すべてのお店の売り場の強さ', 'All shops’ pull'),
  price: t('すべての商品の値段', 'All prices'),
  demand: t('エリアの需要', 'Area demand'),
  known: t('新商品の認知の育ち', 'New items get known'),
  craftDays: t('クラフトの日数', 'Crafting days'),
  lot: t('基礎の商品のロット', 'Basic goods per lot'),
  haulDays: t('運ぶ日数', 'Hauling days'),
  cartCap: t('荷車に積める数', 'Cart load'),
  matPrice: t('素材の値段', 'Material prices'),
  procCap: t('月の調達の上限', 'Monthly buying limit'),
  buyDays: t('調達係の往復の日数', 'Buyer round trips'),
  display: t('品出しの速さ', 'Shelving speed'),
  stamina: t('働くときのスタミナの消耗', 'Stamina drain at work'),
  rest: t('休むと戻るスタミナ', 'Stamina recovered by rest'),
  apt: t('全員の適性', 'Everyone’s aptitude'),
  wage: t('給料', 'Wages'),
  upkeep: t('建物の維持費', 'Building upkeep'),
  ads: t('宣伝の効き目', 'Ad strength'),
  brand: t('ブランド力（月に）', 'Brand (a month)'),
  rally: t('他社の反撃の効き目', 'Rival counterattacks'),
  manager: t('マネージャーのセクタの売上', 'Managed sectors’ sales'),
  flow: t('全段の「ひと月に流せる数」', 'Every stage’s monthly flow'),
  'dig.sec': t('1 回の発掘作業', 'Each dig run'),
  'dig.power': t('1 打の強さ', 'Strike power'),
  'dig.crit': t('会心（2 倍）の確率', 'Critical (×2) chance'),
  'dig.repeat': t('長押しの間隔', 'Hold-strike interval'),
  'dig.reach': t('隣のマスへの力', 'Power to neighbours'),
  'dig.crew': t('発掘隊の 1 日に打つ回数', 'Dig crew strikes a day'),
  'dig.autoSpeed': t('常駐の速さ', 'Standing crew speed'),
  'dig.relay': t('常駐で働く日のスタミナの消耗', 'Stamina drain on standing days'),
  'dig.mat': t('掘り出した素材', 'Materials dug up'),
};
/** 発掘の枝の効き目の単位（% でないもの）と、そのものの値で見せるもの（長押しの間隔：170 ms から引いた値） */
const DIG_UNIT: Partial<Record<FxKind, { suf?: string; pct?: boolean; disp?: (v: number) => number; bare?: boolean }>> = {
  'dig.sec': { suf: t(' 秒', ' s') },
  'dig.power': {},
  'dig.crit': { pct: true },
  'dig.repeat': { suf: ' ms', disp: (v) => 170 - v, bare: true },
  'dig.reach': { pct: true },
  'dig.pierce': { pct: true },
  'dig.crew': { pct: true },
  'dig.autoSpeed': { pct: true },
  'dig.relay': { pct: true },
  'dig.mat': { pct: true },
};
/** fx を表示の行に */
export const fxShown = (f: Fx): Shown => {
  const d = DIG_UNIT[f.kind];
  if (d) return { label: FX_LABEL[f.kind], v: f.v, unit: d.pct ? '%' : '', down: FX_DOWN.includes(f.kind) && !d.bare, at: f.at?.map(d.disp ?? ((v) => v)), suf: d.suf, bare: d.bare };
  return { label: FX_LABEL[f.kind], v: f.v, unit: f.kind === 'apt' || f.kind === 'brand' || f.kind === 'lot' ? '' : '%', down: FX_DOWN.includes(f.kind), lin: FX_LIN.includes(f.kind) };
};

/** レベルのコストの倍率（Lv1〜5。合計 20）。docs/ISLAND_PHASE1.md「パネルのレベル」 */
export const LV_COST = [1, 2, 3.5, 5.5, 8];
/** レベル n の効果の倍率：1 + 0.25(n − 1)（Lv5 で 2 倍）。未取得 0 */
export const lvMulOf = (lv: number) => (lv <= 0 ? 0 : 1 + 0.25 * (lv - 1));
/** スキルの区分：研究パネル（RP）・お金パネル（資金） */
export type SkillCat = 'research' | 'money';
/** 研究パネルか（お金パネルでなければ研究パネル） */
export const isResearch = (k: Skill) => k.cat !== 'money';
/** 最大レベル（研究パネル・封印・準備中・研究への寄付は 1。無限の強化パネルは上限なし＝Infinity） */
export const maxLv = (k: Skill) => (k.inf ? Infinity : k.sealed || k.soon || k.donate || isResearch(k) ? 1 : (k.max ?? 5));
/** そのレベル（lv）にするコスト（GUM）：round(cost × 倍率 / 100) × 100 */
export const levelCost = (k: Skill, lv: number) => Math.round((k.cost * LV_COST[Math.max(0, Math.min(LV_COST.length, lv) - 1)]) / 100) * 100;
/** 効き目の表示の行：レベル lv のときの値（up は Lv2 から） */
export const shownAt = (x: Shown, lv: number, up = false) => (x.at || x.txt ? (lv <= 0 ? 0 : (x.at?.[lv - 1] ?? lv)) : up ? x.v * Math.max(0, lv - 1) : x.lin ? x.v * lv : x.v * lvMulOf(lv));
/** パネルの効き目の行（fx・show と、Lv2 からの up・upShow） */
/** 効き目の値の表示（+15%・−20%・+2・+3 秒・150 ms） */
export function fmtShown(x: Shown, v: number): string {
  const n = x.unit === '%' ? v * 100 : v;
  const r = Math.round(n * 10) / 10;
  return `${x.bare ? '' : x.down ? '−' : '+'}${r}${x.unit}${x.suf ?? ''}`;
}
/** そのレベルの効き目の文（無ければ null）。文の表（txt）があればそれ、無ければ数（fmtShown） */
export function shownText(x: Shown, lv: number, up = false): string | null {
  if (x.txt) return lv <= 0 ? null : (x.txt[Math.min(x.txt.length, lv) - 1] ?? null);
  const v = shownAt(x, lv, up);
  return v ? fmtShown(x, v) : null;
}
export function shownOf(k: Skill): { base: Shown[]; up: Shown[] } {
  return { base: [...(k.show ?? []), ...(k.fx ?? []).map(fxShown)], up: [...(k.upShow ?? []), ...(k.up ?? []).map(fxShown)] };
}
/** 修行の日数の縮み方：適性 apt で ×(1 − min(cut, apt / per))（適性 100 で −40%） */
export const TRAIN = { cut: 0.4, per: 250 };

/**
 * スキルツリー v2（docs/ISLAND_PHASE1.md「スキルツリー」）。実際の店舗運営で使われている工夫をパネルにし、効き目は数字で書く。
 * 内側（C）＋外周（U・R・E・L）。U・R の最初のパネルはエンブレムが要る。✨ はゴールドダストで取る。
 * 既存のパネルの値段は変えない。
 */
export const SKILLS: Skill[] = [
  // ---------------------------------------------------------------- ④ 販売
  { id: 'host', branch: 'shop', name: t('接客の研修', 'Customer service training'), note: t('すべてのお店の売り場の強さ +15%', 'All shops’ pull +15%'), cost: 4000 },
  { id: 'display', branch: 'shop', name: t('品出しの名人', 'Shelving pros'), note: t('棚に並べる速さ +50%', 'Shelving speed +50%'), cost: 3500 },
  { id: 'vmd', branch: 'shop', name: t('売り場の見せ方（VMD）', 'Visual merchandising'), note: t('棚が 2 つ以上あるお店の売り場の強さ +10%', 'Pull +10% at shops with 2+ shelves'), cost: 5000, requires: ['host'] },
  { id: 'pop', branch: 'shop', name: t('手書き POP', 'Handwritten POP cards'), note: t('新商品の認知の育ち +50%', 'New items get known 50% faster'), cost: 3000, requires: ['display'] },
  { id: 'golden', branch: 'shop', name: t('ゴールデンゾーンの棚割', 'Golden-zone planogram'), note: t('各お店の 1 番目の棚（主力商品）の売り場の強さ +12%', 'Pull +12% for each shop’s first shelf (main product)'), cost: 6000, requires: ['vmd'] },
  { id: 'set', branch: 'shop', name: t('セット販売', 'Bundle sales'), note: t('2 種類以上並べているお店の商品の値段 +5%', 'Prices +5% at shops stocking 2+ kinds'), cost: 7000, requires: ['golden'] },
  { id: 'point', branch: 'shop', name: t('ポイントカード', 'Loyalty cards'), note: t('他社の反撃の効き目が半分（他社の売り場の強さ ×1.25 → ×1.12）', 'Rival counterattacks hit half as hard (rival pull ×1.25 → ×1.12)'), cost: 8000, requires: ['pop'] },
  { id: 'hours', branch: 'shop', name: t('営業時間の延長', 'Longer opening hours'), note: t('棚に並べる数 +2／日（お店ごと）・店員のスタミナの消耗 +20%', 'Shelve +2 a day per shop; clerks tire 20% faster'), cost: 4500, requires: ['display'] },
  { id: 'shop2', branch: 'shop', name: t('輸入品店', 'Import store'), note: t('棚 2 の輸入品店を建てられる（売り場の強さ ×1.15）', 'Unlocks the import store (2 shelves, pull ×1.15)'), cost: 6000, requires: ['host'] },
  { id: 'shop3', branch: 'shop', name: t('ブティック', 'Boutique'), note: t('売り場が強いブティックを建てられる（棚 2・売り場の強さ ×1.35）', 'Unlocks the boutique (2 shelves, pull ×1.35)'), cost: 14000, requires: ['shop2'] },
  { id: 'b_sign', branch: 'shop', name: t('ブランドの看板', 'Brand signboards'), note: t('すべてのお店の売り場の強さ +25%', 'All shops’ pull +25%'), cost: 12000, requires: ['host'], brand: 30, tier: 'U', emblem: 1 },
  { id: 'order', branch: 'shop', name: t('客注・取り寄せ', 'Special orders'), note: t('自社のお店に来るお客さん +10%（エリアの需要 +10%）', 'Customers at your shops +10% (area demand +10%)'), cost: 15000, requires: ['set'], tier: 'U' },
  { id: 'fair', branch: 'shop', name: t('季節の催事', 'Seasonal fairs'), note: t('宣伝の費用 −30%・効き目 +10%', 'Ads cost 30% less and work 10% better'), cost: 12000, requires: ['point'], tier: 'U' },
  { id: 'b_premium', branch: 'shop', name: t('プレミアム価格', 'Premium pricing'), note: t('すべての商品の値段 +15%', 'All prices +15%'), cost: 30000, requires: ['shop3', 'b_sign'], brand: 80, tier: 'R' },
  { id: 'concierge', branch: 'shop', name: t('接客の匠', 'Master hosts'), note: t('すべてのお店の売り場の強さ +20%', 'All shops’ pull +20%'), cost: 40000, requires: ['b_sign'], tier: 'R', emblem: 3 },
  { id: 'd_shop', branch: 'shop', name: t('名物店主', 'Famous shopkeeper'), note: t('選んだ 1 軒の売り場の強さ +40%（お店の画面で選ぶ。替えられる）', 'One chosen shop’s pull +40% (pick it in the shop screen; you can switch)'), cost: 0, big: true },
  // ---------------------------------------------------------------- ② 製造
  { id: 'jig', branch: 'craft', name: t('段取りの改善', 'Better setups'), note: t('クラフトの日数 −20%', 'Crafting −20% days'), cost: 4000 },
  { id: 'pot', branch: 'craft', name: t('魔法の釜', 'Magic pot'), note: t('「商品開発」でアンコモンを開発できる（作るには製造の適性 31 以上の職人）', 'Develop Uncommons in Product development (crafting them needs aptitude 31+)'), cost: 10000 },
  { id: 'five_s', branch: 'craft', name: t('5S（整理・整頓）', '5S (sort and tidy)'), note: t('クラフトの日数 −5%・職人のスタミナの消耗 −10%', 'Crafting −5% days; crafters tire 10% slower'), cost: 3000 },
  { id: 'jig2', branch: 'craft', name: t('型の工夫', 'Better molds'), note: t('クラフトの日数 −15%', 'Crafting −15% days'), cost: 7000, requires: ['jig'] },
  { id: 'lot', branch: 'craft', name: t('ロットの改善', 'Bigger lots'), note: t('基礎の商品（技なし）の 1 ロット +1 個', 'Basic goods (no craft skill) +1 per lot'), cost: 6000, requires: ['jig'] },
  { id: 'chair', branch: 'craft', name: t('職人の椅子', 'Crafter chairs'), note: t('職人のスタミナの消耗 −30%', 'Crafters tire 30% slower'), cost: 3000, requires: ['five_s'] },
  { id: 'kaizen', branch: 'craft', name: t('カイゼン提案箱', 'Kaizen suggestion box'), note: t('クラフトの日数 −10%', 'Crafting −10% days'), cost: 9000, requires: ['five_s', 'jig2'] },
  { id: 'night', branch: 'craft', name: t('夜間稼働', 'Night shifts'), note: t('クラフトの日数 −15%・職人のスタミナの消耗 +20%', 'Crafting −15% days; crafters tire 20% faster'), cost: 12000, requires: ['kaizen'], tier: 'U', emblem: 1 },
  { id: 'mold', branch: 'craft', name: t('共通の型', 'Shared molds'), note: t('アンコモンの 1 ロット +1 個', 'Uncommons +1 per lot'), cost: 15000, requires: ['pot'], tier: 'U' },
  { id: 'line', branch: 'craft', name: t('自動化ライン', 'Automated line'), note: t('クラフトの日数 −20%', 'Crafting −20% days'), cost: 40000, requires: ['night'], tier: 'R', emblem: 3 },
  { id: 'd_craft', branch: 'craft', name: t('名工の作業台', 'Master’s workbench'), note: t('全員の製造の適性 +15', 'Everyone’s crafting aptitude +15'), cost: 0, big: true },
  // ---------------------------------------------------------------- ③ 物流
  { id: 'loading', branch: 'logi', name: t('積み込みの工夫', 'Smart loading'), note: t('荷車に積める数 +30%', 'Cart load +30%'), cost: 2500 },
  { id: 'shortcut', branch: 'logi', name: t('近道の地図', 'Shortcut map'), note: t('運ぶ日数 −15%', 'Hauling −15% days'), cost: 3500, requires: ['loading'] },
  { id: 'timetable', branch: 'logi', name: t('定期便の時刻表', 'Scheduled runs'), note: t('お店の裏が半分以上埋まっていても便を出す（待ちなし）', 'Send runs even when a backroom is over half full (no waiting)'), cost: 4000, requires: ['loading'] },
  { id: 'route_opt', branch: 'logi', name: t('配送ルートの最適化', 'Route optimization'), note: t('運ぶ日数 −10%', 'Hauling −10% days'), cost: 5000, requires: ['shortcut'] },
  { id: 'hub', branch: 'logi', name: t('物流拠点', 'Logistics hub'), note: t('物流拠点を建てられる（工房 → 拠点はトラックで日数 ×0.3）', 'Lets you build hubs (workshop → hub by truck, days ×0.3)'), cost: 5000, requires: ['timetable'] },
  { id: 'crossdock', branch: 'logi', name: t('クロスドッキング', 'Cross-docking'), note: t('工房 → 拠点の日数 ×0.3 → ×0.2', 'Workshop → hub days ×0.3 → ×0.2'), cost: 12000, requires: ['hub'], tier: 'U', emblem: 1 },
  { id: 'joint', branch: 'logi', name: t('共同配送', 'Shared deliveries'), note: t('運搬係 1 人が同時に出せる便 +1', 'Each hauler runs one more trip at once'), cost: 15000, requires: ['route_opt'], tier: 'U' },
  { id: 'fleet', branch: 'logi', name: t('自社トラック網', 'Own truck fleet'), note: t('運ぶ速さ ×1.3', 'Hauling speed ×1.3'), cost: 40000, requires: ['crossdock'], tier: 'R', emblem: 3 },
  { id: 'd_logi', branch: 'logi', name: t('配送センター', 'Distribution center'), note: t('運ぶ日数 −30%', 'Hauling −30% days'), cost: 0, big: true },
  // ---------------------------------------------------------------- ① 調達
  { id: 'route_cloth', branch: 'buy', name: t('布のルート', 'Cloth route'), note: t('布を買えるようになる', 'Lets you buy cloth'), cost: 2000 },
  { id: 'route_paper', branch: 'buy', name: t('紙のルート', 'Paper route'), note: t('紙を買えるようになる', 'Lets you buy paper'), cost: 2000, requires: ['route_cloth'] },
  { id: 'route_gem', branch: 'buy', name: t('宝石のルート', 'Gem route'), note: t('宝石を買えるようになる', 'Lets you buy gems'), cost: 6000, requires: ['route_paper'] },
  { id: 'bulk', branch: 'buy', name: t('まとめ買い', 'Bulk buying'), note: t('素材の値段 −15%', 'Materials −15%'), cost: 4000 },
  { id: 'stock1', branch: 'buy', name: t('調達枠の拡大', 'Bigger buying quota'), note: t('月の調達の上限 +30%', 'Monthly buying limit +30%'), cost: 3000 },
  { id: 'stock2', branch: 'buy', name: t('大口契約', 'Bulk contracts'), note: t('月の調達の上限 +60%', 'Monthly buying limit +60%'), cost: 8000, requires: ['stock1', 'bulk'] },
  { id: 'bulk2', branch: 'buy', name: t('卸との信頼', 'Wholesaler trust'), note: t('素材の値段 さらに −10%', 'Materials −10% more'), cost: 7000, requires: ['bulk'] },
  { id: 'stock3', branch: 'buy', name: t('年間契約', 'Annual contract'), note: t('月の調達の上限 +100%', 'Monthly buying limit +100%'), cost: 15000, requires: ['stock2'] },
  { id: 'swift', branch: 'buy', name: t('早足の買い付け', 'Brisk buying trips'), note: t('調達係の往復の日数 −30%', 'Buyer round trips −30% days'), cost: 3000, requires: ['stock1'] },
  { id: 'eye', branch: 'buy', name: t('目利き', 'Sharp eye'), note: t('調達ランクの経験 +50%', 'Buying rank exp +50%'), cost: 2500, requires: ['stock1'] },
  // 段 UI5a：調達の定員（1 人がスタミナ切れで休んでも調達を止めない）。RP は決め打ち（ほかの研究パネルの値段を動かさない：UI5_RP）。
  // 2 枚目（Uncommon・3 人まで）は、スキルツリーの線の交わりが 4 か所以上増えるので見送った（つながりの見直しのあとで）
  { id: 'relief', branch: 'buy', name: t('調達の交代要員', 'Relief buyer'), note: t('調達係の定員 +1（2 人目は、1 人目が休む日に代わりに買い付けへ）', 'Buyer slots +1 (the 2nd buyer goes when the 1st rests)'), cost: 0, requires: ['stock2'] },
  { id: 'scoutmap', branch: 'buy', name: t('開拓の手引き', 'Scouting guide'), note: t('ルートの開拓の日数 −40%', 'Scouting −40% days'), cost: 3000, requires: ['route_paper'] },
  { id: 'abc', branch: 'buy', name: t('ABC 分析', 'ABC analysis'), note: t('調達係の買う量を消費にぴったり合わせる（買いすぎなし）・素材の値段 −5%', 'Buyers match purchases to use (no overbuying); materials −5%'), cost: 4000, requires: ['stock1'] },
  { id: 'contract', branch: 'buy', name: t('長期契約', 'Long-term contract'), note: t('素材の値段 −5%（値段の変動が入ったら 6 か月固定）', 'Materials −5% (locks prices for 6 months once prices fluctuate)'), cost: 10000, requires: ['bulk2'], tier: 'U', emblem: 1 },
  { id: 'b_partner', branch: 'buy', name: t('指名の取引先', 'Preferred supplier'), note: t('素材の値段 −15%・月の調達の上限 +50%', 'Materials −15%, monthly buying limit +50%'), cost: 15000, requires: ['bulk2'], brand: 50, tier: 'U' },
  { id: 'direct', branch: 'buy', name: t('産地との直接取引', 'Direct sourcing'), note: t('素材の値段 −10%・月の調達の上限 +50%', 'Materials −10%, monthly buying limit +50%'), cost: 35000, requires: ['contract'], tier: 'R', emblem: 3 },
  { id: 'd_buy', branch: 'buy', name: t('商社との提携', 'Trading-house alliance'), note: t('すべての素材のルートが開く・素材の値段 −10%', 'Opens every material route; materials −10%'), cost: 0, big: true },
  // ---------------------------------------------------------------- 人材
  { id: 'hire', branch: 'people', name: t('人材の募集', 'Recruiting'), note: t('ヒーローを雇えるようになる（候補 3 人・毎月入れ替わる）', 'Hire heroes (3 candidates, refreshed monthly)'), cost: 3000 },
  { id: 'lounge', branch: 'people', name: t('休憩室', 'Lounge'), note: t('スタミナの回復 +50%', 'Stamina recovers 50% faster'), cost: 2500 },
  { id: 'manual', branch: 'people', name: t('マニュアル整備', 'Work manuals'), note: t('全員の適性 +3（すべての仕事）', 'Everyone’s aptitude +3 (all jobs)'), cost: 4000, requires: ['hire'] },
  { id: 'shift', branch: 'people', name: t('シフト制の導入', 'Shift system'), note: t('働くときのスタミナの消耗 −20%', 'Stamina drain while working −20%'), cost: 5000, requires: ['lounge'] },
  { id: 'slots', branch: 'people', name: t('採用枠の拡大', 'More openings'), note: t('雇える候補 3 → 4 人', 'Hiring candidates 3 → 4'), cost: 7000, requires: ['hire'] },
  { id: 'ojt', branch: 'people', name: t('OJT', 'On-the-job training'), note: t('担当のある人の、担当に効く能力が月に +1（PHY・INT・AGI。上限 100）', 'Assigned staff gain +1 a month in the stat their job uses (PHY/INT/AGI, max 100)'), cost: 6000, requires: ['manual'] },
  { id: 'incentive', branch: 'people', name: t('インセンティブ', 'Incentives'), note: t('売り場の強さ +5%・給料 +10%', 'Pull +5%; wages +10%'), cost: 5000, requires: ['manual'] },
  { id: 'welfare', branch: 'people', name: t('福利厚生', 'Benefits'), note: t('休むと戻るスタミナ +50%・給料 +5%', 'Rest recovers 50% more stamina; wages +5%'), cost: 6000, requires: ['shift'] },
  { id: 'b_scout', branch: 'people', name: t('憧れの職場', 'Dream employer'), note: t('雇える候補が 5 人に（アンコモンも来る）', 'Recruiting shows 5 candidates (Uncommons too)'), cost: 12000, requires: ['slots'], brand: 60, tier: 'U' },
  { id: 'training', branch: 'people', name: t('社内研修', 'In-house training'), note: t('技の修行の日数 −30%', 'Craft-skill training −30% days'), cost: 12000, requires: ['ojt'], tier: 'U', emblem: 1 },
  { id: 'mgr', branch: 'people', name: t('マネージャー研修', 'Manager training'), note: t('セクタマネージャーの売上の倍率 +0.1', 'Sector managers’ sales rate +0.1'), cost: 15000, requires: ['incentive'], tier: 'U' },
  { id: 'headhunt', branch: 'people', name: t('ヘッドハンティング', 'Headhunting'), note: t('雇える候補にレアのヒーローが 1 人来る', 'One Rare hero joins the hiring candidates'), cost: 40000, requires: ['b_scout'], tier: 'R', emblem: 3 },
  { id: 'd_people', branch: 'people', name: t('カリスマ採用', 'Star recruiter'), note: t('雇うときの能力 +20%（PHY・INT・AGI。上限 100）', 'New hires’ stats +20% (PHY/INT/AGI, max 100)'), cost: 0, big: true },
  // ---------------------------------------------------------------- 経営
  { id: 'pace1', branch: 'ops', name: t('業務の効率化', 'Streamlined operations'), note: t('ゲームの進行速度を 1.5 倍にできる（システム → 進行速度）', 'Lets you run the game at 1.5× (System → Game speed)'), cost: 4000 },
  { id: 'pace2', branch: 'ops', name: t('業務の自動化', 'Automated operations'), note: t('ゲームの進行速度を 2 倍にできる（システム → 進行速度）', 'Lets you run the game at 2× (System → Game speed)'), cost: 12000, requires: ['pace1'] },
  { id: 'budget', branch: 'ops', name: t('予算管理', 'Budgeting'), note: t('建物の維持費 −10%', 'Building upkeep −10%'), cost: 4000 },
  { id: 'pdca', branch: 'ops', name: t('月次 PDCA', 'Monthly PDCA'), note: t('月次報告に来月の見込み（売上・利益）が出る', 'Monthly reports show next month’s forecast (sales, profit)'), cost: 5000, requires: ['budget'] },
  { id: 'b_ads', branch: 'ops', name: t('ブランド広告', 'Brand advertising'), note: t('宣伝の効き目 ×1.5・ブランド力が月に +2', 'Ads 1.5× as strong; brand +2 a month'), cost: 10000, requires: ['pace1'], brand: 40, tier: 'U' },
  { id: 'pr', branch: 'ops', name: t('広報室', 'PR office'), note: t('ブランド力が月に +1', 'Brand +1 a month'), cost: 12000, requires: ['pdca'], tier: 'U', emblem: 1 },
  { id: 'holding', branch: 'ops', name: t('持株会社', 'Holding company'), note: t('マネージャーのセクタの利益 +10%', 'Managed sectors’ profit +10%'), cost: 40000, requires: ['pr'], tier: 'R', emblem: 3 },
  { id: 'd_ops', branch: 'ops', name: t('ブランド戦略室', 'Brand strategy office'), note: t('ブランド力の効き目 ×2（売り場の強さ 最大 +30% → +60%）', 'Brand effect ×2 (pull bonus cap +30% → +60%)'), cost: 0, big: true },
  // ---------------------------------------------------------------- システム
  { id: 'pos', branch: 'sys', name: t('POS レジ', 'POS registers'), note: t('市場データに商品ごとの「きのう売れた数」が出る・売り場の強さ +3%', 'Market data shows yesterday’s sales per item; pull +3%'), cost: 5000 },
  { id: 'auto_order', branch: 'sys', name: t('自動発注（EDI）', 'Auto-ordering (EDI)'), note: t('調達係の買い付けが毎日届く（往復なし）・注文の納期 −50%', 'Buyer purchases arrive daily (no round trip); order lead time −50%'), cost: 8000, requires: ['pos'] },
  { id: 'inventory', branch: 'sys', name: t('在庫管理システム', 'Inventory system'), note: t('お店の裏 +10・工房の物置 +20', 'Backrooms +10; workshop stockroom +20'), cost: 6000, requires: ['pos'] },
  { id: 'erp', branch: 'sys', name: t('ERP', 'ERP'), note: t('全段の「ひと月に流せる数」+5%（調達・製造・物流・販売）', 'Every stage’s monthly flow +5% (buy, craft, haul, sell)'), cost: 20000, requires: ['auto_order', 'inventory'], tier: 'U', emblem: 1 },
  { id: 'dyn', branch: 'sys', name: t('ダイナミックプライシング', 'Dynamic pricing'), note: t('需要が供給より多い商品（扱う他社が 1 社以下）の値段 +8%', 'Prices +8% where demand beats supply (1 rival or fewer)'), cost: 18000, requires: ['pos'], tier: 'U' },
  { id: 'flow', branch: 'sys', name: t('人流解析', 'Foot-traffic analytics'), note: t('建てるときにお客さんの多い区画（上位 20%）が光る・売り場の強さ +5%', 'Busiest blocks (top 20%) glow when placing; pull +5%'), cost: 15000, requires: ['inventory'], tier: 'U' },
  { id: 'forecast', branch: 'sys', name: t('需要予測 AI', 'Demand-forecast AI'), note: t('新商品の認知が 30% → 50% から始まる', 'New items start 50% known instead of 30%'), cost: 40000, requires: ['erp'], tier: 'R', emblem: 3 },
  { id: 'ec', branch: 'sys', name: t('EC サイト', 'Online store'), note: t('遠いお客さんも買う（自社のお店の届き方が最低 25%）', 'Far customers buy too (your shops reach at least 25%)'), cost: 45000, requires: ['dyn'], tier: 'R' },
  { id: 'd_sys', branch: 'sys', name: t('基幹システム刷新', 'Core system overhaul'), note: t('全段の「ひと月に流せる数」+10%（調達・製造・物流・販売）', 'Every stage’s monthly flow +10% (buy, craft, haul, sell)'), cost: 0, big: true },
  // ---------------------------------------------------------------- 技（作れる商品を増やす。docs/ISLAND_PHASE1.md「商品と技」）
  { id: 't_wood', branch: 'tech', name: t('木工の技', 'Woodworking'), note: t('椅子を作れる', 'Lets you make Chairs'), cost: 4000, train: 8 },
  { id: 't_paper', branch: 'tech', name: t('紙工の技', 'Papercraft'), note: t('傘・ペンを作れる', 'Lets you make Parasols and Quills'), cost: 5000, train: 10 },
  { id: 't_metal', branch: 'tech', name: t('金工の技', 'Metalwork'), note: t('ナイフ・コンパスを作れる', 'Lets you make Knives and Compasses'), cost: 6000, train: 12 },
  { id: 't_glass', branch: 'tech', name: t('ガラス細工', 'Glasswork'), note: t('ゴブレット・モノクルを作れる', 'Lets you make Goblets and Monocles'), cost: 7000, train: 14 },
  { id: 't_clay', branch: 'tech', name: t('陶芸の技', 'Pottery'), note: t('モアイ・日本人形を作れる', 'Lets you make Moai and Japanese Dolls'), cost: 5000, train: 10 },
  { id: 't_textile', branch: 'tech', name: t('織物の技', 'Weaving'), note: t('リボン・ハットを作れる', 'Lets you make Ribbons and Hats'), cost: 6000, train: 12 },
  { id: 't_jewel', branch: 'tech', name: t('宝飾の技', 'Jewelcraft'), note: t('オルゴールを作れる', 'Lets you make Music Boxes'), cost: 12000, train: 20, requires: ['t_metal'] },
  { id: 't_master', branch: 'tech', name: t('匠の技', 'Master craft'), note: t('技が要る商品の売り場の強さ +15%（技を 3 つ取ると開放できる）', 'Pull +15% for goods that need a craft skill (unlock after any 3 craft skills)'), cost: 15000, anyOf: { ids: ['t_wood', 't_paper', 't_metal', 't_glass', 't_clay', 't_textile', 't_jewel'], n: 3 } },
  { id: 't_rare', branch: 'tech', name: t('レアの技', 'Rare craft'), note: t('レアの商品を作れる（準備中）', 'Lets you make Rare goods (coming soon)'), cost: 50000, requires: ['t_master'], tier: 'U', emblem: 1, soon: true },
];

/** 効き目の表示の行（既存のパネル用） */
const up_ = (label: string, v: number, lin = false): Shown => ({ label, v, unit: '%', lin });
const dn_ = (label: string, v: number): Shown => ({ label, v, unit: '%', down: true });
const nm_ = (label: string, v: number, lin = false): Shown => ({ label, v, unit: '', lin });
const PULL_ = FX_LABEL.pull;
const CRAFT_ = FX_LABEL.craftDays;
const HAUL_ = FX_LABEL.haulDays;
const MAT_ = FX_LABEL.matPrice;
const PROC_ = FX_LABEL.procCap;
const STAM_ = FX_LABEL.stamina;
/**
 * 既存のパネルのレベル（docs/ISLAND_PHASE1.md「パネルのレベル」）。効き目そのものは model.ts（lvMul で比例）。
 * 数字の効果は最大 5（表示の行 show）、解放型は 2〜3（Lv2 からの効果 up／upShow）。デメリット（スタミナ +20%・給料 +10% など）はレベルで増えない。
 */
const LEVELS: Record<string, Partial<Skill>> = {
  host: { show: [up_(PULL_, 0.15)] },
  display: { show: [up_(t('棚に並べる速さ', 'Shelving speed'), 0.5)] },
  vmd: { show: [up_(t('棚 2 つ以上のお店の売り場の強さ', 'Pull at shops with 2+ shelves'), 0.1)] },
  pop: { show: [up_(FX_LABEL.known, 0.5)] },
  golden: { show: [up_(t('1 番目の棚の売り場の強さ', 'Pull of each first shelf'), 0.12)] },
  set: { show: [up_(t('2 種類以上並べたお店の値段', 'Prices at shops with 2+ kinds'), 0.05)] },
  point: { show: [dn_(FX_LABEL.rally, 0.5)] },
  hours: { show: [nm_(t('棚に並べる数（1 日・お店ごと）', 'Shelved a day per shop'), 2)] },
  shop2: { max: 3, upShow: [up_(t('輸入品店の売り場の強さ', 'Import stores’ pull'), 0.1)] },
  shop3: { max: 3, upShow: [up_(t('ブティックの売り場の強さ', 'Boutiques’ pull'), 0.1)] },
  b_sign: { show: [up_(PULL_, 0.25)] },
  order: { show: [up_(FX_LABEL.demand, 0.1)] },
  fair: { show: [dn_(t('宣伝の費用', 'Ad costs'), 0.3), up_(FX_LABEL.ads, 0.1)] },
  b_premium: { show: [up_(FX_LABEL.price, 0.15)] },
  concierge: { show: [up_(PULL_, 0.2)] },
  d_shop: { show: [up_(t('選んだ 1 軒の売り場の強さ', 'Chosen shop’s pull'), 0.4)] },
  jig: { show: [dn_(CRAFT_, 0.2)] },
  pot: { max: 3, upShow: [dn_(t('商品開発の日数', 'Development days'), 0.2)] },
  five_s: { show: [dn_(CRAFT_, 0.05), dn_(t('職人のスタミナの消耗', 'Crafter stamina drain'), 0.1)] },
  jig2: { show: [dn_(CRAFT_, 0.15)] },
  lot: { max: 3, show: [nm_(FX_LABEL.lot, 1, true)] },
  chair: { show: [dn_(t('職人のスタミナの消耗', 'Crafter stamina drain'), 0.3)] },
  kaizen: { show: [dn_(CRAFT_, 0.1)] },
  night: { show: [dn_(CRAFT_, 0.15)] },
  mold: { max: 3, show: [nm_(t('アンコモンのロット', 'Uncommons per lot'), 1, true)] },
  line: { show: [dn_(CRAFT_, 0.2)] },
  d_craft: { show: [nm_(t('全員の製造の適性', 'Everyone’s crafting aptitude'), 15)] },
  loading: { show: [up_(FX_LABEL.cartCap, 0.3)] },
  shortcut: { show: [dn_(HAUL_, 0.15)] },
  timetable: { max: 2, up: [{ kind: 'haulDays', v: 0.05 }] },
  route_opt: { show: [dn_(HAUL_, 0.1)] },
  hub: { max: 3, upShow: [dn_(t('拠点からお店まで運ぶ日数', 'Hub → shop days'), 0.1)] },
  crossdock: { show: [dn_(t('工房 → 拠点の日数（×0.3 から）', 'Workshop → hub days (from ×0.3)'), 0.33)] },
  joint: { max: 3, show: [nm_(t('運搬係 1 人が同時に出せる便', 'Trips per hauler at once'), 1, true)] },
  fleet: { show: [up_(t('運ぶ速さ', 'Hauling speed'), 0.3)] },
  d_logi: { show: [dn_(HAUL_, 0.3)] },
  route_cloth: { max: 3, upShow: [dn_(t('布の値段', 'Cloth price'), 0.08)] },
  route_paper: { max: 3, upShow: [dn_(t('紙の値段', 'Paper price'), 0.08)] },
  route_gem: { max: 3, upShow: [dn_(t('宝石の値段', 'Gem price'), 0.08)] },
  bulk: { show: [dn_(MAT_, 0.15)] },
  stock1: { show: [up_(PROC_, 0.3)] },
  stock2: { show: [up_(PROC_, 0.6)] },
  bulk2: { show: [dn_(MAT_, 0.1)] },
  stock3: { show: [up_(PROC_, 1)] },
  swift: { show: [dn_(FX_LABEL.buyDays, 0.3)] },
  eye: { show: [up_(t('調達ランクの経験', 'Buying rank exp'), 0.5)] },
  relief: { show: [nm_(t('調達係の定員', 'Buyer slots'), 1)] },
  scoutmap: { show: [dn_(t('ルートの開拓の日数', 'Scouting days'), 0.4)] },
  abc: { show: [dn_(MAT_, 0.05)] },
  contract: { show: [dn_(MAT_, 0.05)] },
  b_partner: { show: [dn_(MAT_, 0.15), up_(PROC_, 0.5)] },
  direct: { show: [dn_(MAT_, 0.1), up_(PROC_, 0.5)] },
  d_buy: { show: [dn_(MAT_, 0.1)] },
  hire: { max: 3, up: [{ kind: 'wage', v: 0.05 }] },
  lounge: { show: [up_(t('スタミナの回復', 'Stamina recovery'), 0.5)] },
  manual: { show: [nm_(FX_LABEL.apt, 3)] },
  shift: { show: [dn_(STAM_, 0.2)] },
  slots: { max: 2, up: [{ kind: 'wage', v: 0.05 }] },
  ojt: { max: 3, show: [nm_(t('担当に効く能力（月に）', 'Job stat (a month)'), 1, true)] },
  incentive: { show: [up_(PULL_, 0.05)] },
  welfare: { show: [up_(FX_LABEL.rest, 0.5)] },
  b_scout: { max: 2, up: [{ kind: 'apt', v: 2 }] },
  training: { show: [dn_(t('技の修行の日数', 'Training days'), 0.3)] },
  mgr: { show: [up_(t('マネージャーの売上の倍率', 'Managers’ sales rate'), 0.1)] },
  headhunt: { max: 2, up: [{ kind: 'apt', v: 2 }] },
  d_people: { show: [up_(t('雇うときの能力', 'New hires’ stats'), 0.2)] },
  pace1: { max: 2, up: [{ kind: 'upkeep', v: 0.05 }] },
  pace2: { max: 2, up: [{ kind: 'upkeep', v: 0.05 }] },
  budget: { show: [dn_(FX_LABEL.upkeep, 0.1)] },
  pdca: { max: 2, up: [{ kind: 'flow', v: 0.02 }] },
  b_ads: { show: [up_(FX_LABEL.ads, 0.5), nm_(FX_LABEL.brand, 2)] },
  pr: { max: 3, show: [nm_(FX_LABEL.brand, 1, true)] },
  holding: { show: [up_(t('マネージャーのセクタの利益', 'Managed sectors’ profit'), 0.1)] },
  d_ops: { show: [up_(t('ブランド力の効き目', 'Brand effect'), 1)] },
  pos: { show: [up_(PULL_, 0.03)] },
  auto_order: { max: 2, up: [{ kind: 'procCap', v: 0.1 }] },
  inventory: { show: [nm_(t('お店の裏', 'Backroom'), 10), nm_(t('工房の物置', 'Stockroom'), 20)] },
  erp: { show: [up_(FX_LABEL.flow, 0.05)] },
  dyn: { show: [up_(t('競合の少ない商品の値段', 'Prices with little competition'), 0.08)] },
  flow: { show: [up_(PULL_, 0.05)] },
  forecast: { show: [up_(t('新商品の認知のはじめ（30% に足す）', 'Starting awareness (added to 30%)'), 0.2)] },
  ec: { show: [up_(t('遠いお客さんへの届き方（最低）', 'Minimum reach to far customers'), 0.25)] },
  d_sys: { show: [up_(FX_LABEL.flow, 0.1)] },
  t_master: { show: [up_(t('技の商品の売り場の強さ', 'Pull for craft-skill goods'), 0.15)] },
  t_rare: { max: 1 },
};
// 技：Lv2 から、その技の商品のロット +1（最大 3）
for (const k of SKILLS) if (k.branch === 'tech' && k.train) LEVELS[k.id] = { max: 3, upShow: [nm_(t(`${k.name}の商品のロット`, `${k.name} goods per lot`), 1)] };
for (const k of SKILLS) Object.assign(k, LEVELS[k.id] ?? {});
// 外周（U・R・E・L）のパネル：汎用の効き目（fx）で書いた追加のパネル
SKILLS.push(...OUTER_SKILLS);
/**
 * 段 H2（Epic の町 ②）：Epic の外周の 2 枚を、M&A の遊びに合わせて見直した（名前はそのまま・効き目を M&A に。値段・先に要るパネル・区分は前のまま）。
 * - M&A 部門（e_ops_1。お金パネル）：前は「セクター長の売上の倍率」→ 買収の提示を相手が受ける見込み +4%（Lv ごとに +25%）
 * - 工芸の工房の買収（e_tech_2。研究パネル）：前は「適性 +」→ 買った店から引き継ぐ商売（相手のエクステ以外の売上）+10%
 * 効き目は legal.ts（maChance・keepRate）。docs/ISLAND_PHASE1.md「Epic の町 ②」
 */
for (const k of OUTER_SKILLS) {
  if (k.id === 'e_ops_1') {
    delete k.fx;
    k.note = t('買収の提示を相手が受ける見込み +4%（M&A の交渉術。Lv ごとに +25%）', 'Odds a rival accepts your acquisition offer +4% (M&A negotiation; +25% per Lv)');
    k.show = [{ label: t('買収の提示を受ける見込み', 'Offer acceptance odds'), v: 0.04, unit: '%' }];
  }
  if (k.id === 'e_tech_2') {
    delete k.fx;
    k.note = t('M&A で買った店から引き継ぐ商売（相手のエクステ以外の売上）+10%（職人の工房ごと引き継ぐ）', 'Business carried over from stores bought through M&A (the rival’s non-extension sales) +10% (the artisans come with the studio)');
  }
}

/** 発掘のスキルツリーの数字（DIG_BALANCE.tree） */
export interface DigTree {
  cost: Record<string, number>;
  ext: number[];
  ext2: number[];
  maxSec: number;
  power: number[];
  crit: number[];
  critMul: number;
  power2: number[];
  repeat: number[];
  reach: number[];
  reachDir: ('lr' | 'lrd' | 'all')[];
  lamp: number[];
  hint: number;
  deep: Record<DigTier, number[]>;
  cap: number[];
  deepMul: number[];
  blastCost: number[];
  blastSize: number[];
  drill: number[];
  drillFuel: number;
  office: number[];
  crew: number[];
  auto: number[];
  autoSpeed: number[];
  relay: number[];
  mat: number[];
  /**
   * 調整 v25c：発掘の枝の研究パネル（RP で開く・レベルなし）を開いたときの効き目の段（Lv1〜5 の表のどこか）。
   * lv がふつうの段、keep は決め打ち（深い層の許可・研究の目利き・発掘隊の役所は、先へ進むのに要るので Lv5）
   */
  rpLv: { lv: number; keep: Record<string, number> };
  /** 調整 v25c：発掘の枝の研究パネルの RP（決め打ち）。Common はほかの研究パネル（20〜80）より安く。書いていないものは RP の段の自動の値段 */
  rp: Record<string, number>;
}

// ---------------------------------------------------------------- 発掘と研究ポイントの調整値（ここ 1 か所）

/**
 * 地層の発掘と研究ポイントの、自動プレイ（`npm run island:sim`）で直す数字はここにまとめる（docs/ISLAND_BALANCE.md「v8」「v9」）。
 * 使う所：研究パネルの値段（RP_PRICE）・RP の入り方（RP_GAIN）・地層の硬さと荒れ地の壁のマス目・出土品の割合（DIG）・自動発掘の速さ（DIG_AUTO）・
 * 発掘作業の長さ（sessionSec）・長押しの間隔（repeatMs）・発掘許可の申請料（permitFee）・自動プレイの打つ速さ（simTapsPerSec）・
 * 発掘のスキルツリー（tree。発掘 v2 の 2 段目：パネルの値段とレベルごとの効き目。以前の工房の設備投資「ツルハシ・ランタン・発破の道具」はここへ移した）。
 * v8 で直したもの（前 → 後）：Common の粘土層の硬さ 1〜2 → 1〜3・岩盤 2〜3 → 3（掘り尽くすのを Common の 1 か所目の滞在に合わせる）／
 * Common の RP「初めて掘る」10 → 15・「研究 Lv」5・10・15・20 → 8・15・20・25（1 か所目で RP が尽きて止まらない）／
 * ツルハシの新調 5,000・15,000 → 10,000・30,000 G（1 か所目のはじめに買って、すぐ掘り尽くさない）／発破の火薬代 1,000 → 2,000 G（余ったお金の使い道）。
 * v9（発掘 v2 の 1 段目）：ツルハシの回数をやめ、荒れ地 4 か所 × 15 秒の発掘作業に（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）
 * v10（発掘 v2 の 2 段目）：発掘のスキルツリー（9 本目の枝「発掘」。tree）。道具の値段（tools）・火薬代（blastCost）は tree へ
 * v11（発掘画面の作り直し）：上から掘る断面（rows）をやめ、正面の壁（wall。横 7 × 縦 9）を手前から奥へ。硬さ（hard）は奥ほど硬く・出土品の割合（odds）は 1 か所の数がそろうように
 */
export const DIG_BALANCE: {
  rpPrice: Record<Tier, { lo: number; hi: number; big: number; step: number }>;
  /**
   * RP の入り方。first・lv（出土品 1 個ぶん）は v14a からどのランクも同じ（レアリティの倍率なし）。
   * topic・tablet・present はセクタのランク（C・U の荒れ地）で決まる。R・E・L はダンジョンの奥で出る上のランクのエクステ（お題・石板・発表は無い）
   */
  rpGain: Record<Tier, { first: number; lv: [number, number, number, number]; topic: number; tablet: number; present: number }>;
  /** 地層の硬さ（層ごと。手前 → 奥。奥ほど硬い） */
  hard: Record<DigTier, [number, number][]>;
  /** 荒れ地 1 か所の正面の壁のマス目（横 × 縦）。各マスに奥行きの層が DIG.<ランク>.layers の数だけ */
  wall: Record<DigTier, [number, number]>;
  /** 壁に埋まっているものの割合（マス × 層 1 枚あたり。お題・石板のほかに）：エクステ・素材。残りは土だけ */
  odds: Record<DigTier, { ext: number; mat: number }>;
  autoPerDay: number;
  /** 発掘のスキルツリー（9 本目の枝「発掘」）。表は Lv1〜5（[0] が Lv1）。deep・study・office は Lv0〜5（[0] が未取得） */
  tree: DigTree;
  /** 1 回の発掘作業の長さ（現実の秒）。2 段目のスキル「追加申請」で延びる（model.ts の sessionSec） */
  sessionSec: number;
  /** 長押しで続けて打つ間隔（ミリ秒）。2 段目のスキル「速さ」で短くなる（model.ts の digRepeatMs） */
  repeatMs: number;
  /** 発掘許可の申請料（G。セクタの 1 か所目は無料、2 か所目から） */
  permitFee: Record<DigTier, number>;
  /** 自動プレイ（scripts/island/sim.ts）で、1 秒に打てる数の仮定 */
  simTapsPerSec: number;
  /**
   * お題 k を埋める層（手前 0 から。ランクごと）。v13（発掘 v2 の 5 段目）：制覇に研究成果の発表が要るので、お題を奥の層へ
   * （v12 までは お題 k ＝ k 番目の層）。docs/ISLAND_BALANCE.md「v13」
   */
  topicLayer: Record<DigTier, number[]>;
  /**
   * 復刻品（発掘 v2 の 3 段目。docs/ISLAND_PHASE1.md「3. 復刻品」）：レシピが開く研究 Lv・売値の倍率（同じランクの商品の平均に掛ける）・
   * 独占の月数（初めて売った月から、どのセクタでも他社が真似しない）・需要（1 種類の月の需要。ランクの需要と町の大きさを掛ける。
   * 同じランクの gap の商品の 0.6 倍くらい）・作る手間（日数・1 ロットの数）
   */
  relic: {
    openLv: number;
    priceMul: number;
    monopolyMonths: number;
    demandBase: number;
    days: [number, number];
    batch: number;
    /**
     * Rare の復刻品（Rare の町 ①）：売値は同じランクの商品の平均 × priceMul × price（Uncommon の復刻品は SKU の値段で ×UNCOMMON.price＝2.5）・
     * 工期・作る職人の製造の適性（Uncommon の UNCOMMON.minCraft より 1 段上）・材料の足し（宝石 gem 個と、Uncommon の素材 more 個）
     */
    rare: { price: number; days: [number, number]; minCraft: number; gem: number; more: number };
    /** Epic の復刻品（段 H1：Epic の町 ①）：Rare の復刻品から 1 段上（売値・工期・職人の製造の適性・材料の足し） */
    epic: { price: number; days: [number, number]; minCraft: number; gem: number; more: number };
  };
  /**
   * 復興（発掘 v2 の 4 段目。docs/ISLAND_PHASE1.md「4. 復興・ダンジョン・展示館」）：掘りきった荒れ地 1 か所で、そのセクタの家の数 × homes の家が増え、
   * 商品ごとの需要も同じ割合で上がる。地図の住宅の絵は houses 軒まで（近くの空き地に）
   */
  revive: { homes: number; houses: number };
  /**
   * ダンジョン（セクタで最後に掘りきった荒れ地から）：壁（横 × 縦）・層の数・硬さ（ランクごと・層ごと）・掘れる層（深い層の許可の Lv0〜5）・
   * 出土品の割合・層ごとのエクステのランクの確率（そのセクタのランク／1 つ上／2 つ上／3 つ上）・上のランクの出土品の種類の数（セクタごと・ランクごと）
   */
  dungeon: {
    wall: [number, number];
    layers: number;
    hard: Record<DigTier, [number, number][]>;
    deep: number[];
    odds: { ext: number; mat: number };
    rarity: Record<DigTier, [number, number, number, number][]>;
    pick: number;
  };
  /**
   * 遺物の展示館：値段は P1B の museum。枠（はじめ・展示室の増築のあと）・増築の値段・価値（レアリティ × 研究 Lv）・
   * 来館者（価値 1 あたりの月の人数）・入館料（1 人）・節目（展示の価値の合計）と、節目ごとの恒久のボーナス（会社全体の新商品の認知の上がり方・ブランド力）
   */
  museum: { slots: number[]; expand: number[]; val: Record<Tier, number>; lvStep: number; visitors: number; fee: number; marks: number[]; known: number; brand: number };
  /**
   * 無限の強化パネル（発掘 v2 の 6 段目。RP 払い・Lv の上限なし）：値段（Lv1 の RP）と Lv ごとの倍率・丸める単位。
   * 効き目は Lv の curve 乗（1 より小さいので、上がるほど少しずつ鈍くなる。上限は無い）：
   * 速さ＝長押しの間隔 ÷（1 ＋ speed × Lv^curve）（下限 minMs）・力＝1 打の強さ ×（1 ＋ power × Lv^curve）・
   * 範囲＝発破・ドリルが 1 つ大きくなる確率 reach × Lv^curve（1 を超えたぶんは確実に +1、端数が確率）
   */
  infinite: { cost: number; grow: number; step: number; curve: number; speed: number; minMs: number; power: number; reach: number };
  /** 研究への寄付（お金で RP を買う・回数の上限なし）：はじめの値段（G）・押すごとの倍率・丸める単位・受け取る RP（一定） */
  buyRp: { cost: number; grow: number; step: number; rp: number };
  /**
   * Uncommon の研究成果の発表の条件（お題に加えて）：そのセクタの出土品（finds）のうち n 種を、その町の荒れ地（ダンジョンを除く）で
   * この周回に dug 個ずつ掘り出す（発掘 v2 の 7 段目。6 段目の「研究 Lv」は会社で共有のため、着いた時点でそろっていて縛りにならなかった）
   */
  presentRes: Partial<Record<DigTier, { n: number; dug: number }>>;
} = {
  // 研究パネルの RP の値段：根もと lo 〜 枝先 hi（平均は (lo + hi) / 2）・大きめの研究パネル big・丸める単位 step
  rpPrice: {
    C: { lo: 20, hi: 80, big: 125, step: 5 },
    U: { lo: 60, hi: 180, big: 300, step: 5 },
    R: { lo: 150, hi: 450, big: 750, step: 10 },
    E: { lo: 375, hi: 1125, big: 1875, step: 25 },
    L: { lo: 940, hi: 2810, big: 4700, step: 50 },
  },
  // RP の入り方：初めて掘る・研究 Lv2〜5・お題・石板・発表
  rpGain: {
    C: { first: 15, lv: [8, 15, 20, 25], topic: 40, tablet: 20, present: 60 },
    // v14a（発掘 v2 の 6 段目）：出土品 1 個ぶんの RP（初発見・研究 Lv の上がり）はレアリティで変わらない（どのランクも Common の表）。
    // レアリティの差は売上の側（展示館の価値・復刻品の売値）。お題・石板・発表は、セクタのランクの違いとして残す
    // （前：U 初発見 25・Lv 12・25・38・50／R 80・38〜160／E 250・120〜500／L 600・288〜1,200）
    U: { first: 15, lv: [8, 15, 20, 25], topic: 100, tablet: 50, present: 150 },
    // Rare の町 ①：お題・石板・発表は Uncommon の 2.5 倍（Common 40/20/60 → Uncommon 100/50/150 と同じ伸び）。研究パネルの値段も 2.5 倍
    R: { first: 15, lv: [8, 15, 20, 25], topic: 250, tablet: 125, present: 375 },
    // Epic の町 ①（段 H1）：お題・石板・発表は Rare の 2.5 倍（研究パネルの値段 rpPrice.E も Rare の 2.5 倍）。出土品 1 個ぶんは変えない
    E: { first: 15, lv: [8, 15, 20, 25], topic: 625, tablet: 312, present: 937 },
    L: { first: 15, lv: [8, 15, 20, 25], topic: 0, tablet: 0, present: 0 },
  },
  // 地層の硬さ（層ごと・手前 → 奥。1 打の強さ 1 のときに打つ回数の範囲）。v11：正面の壁を手前から奥へ。奥ほど硬い
  hard: {
    C: [
      [1, 1],
      [1, 2],
      [2, 3],
    ],
    U: [
      [2, 3],
      [3, 3],
      [3, 4],
      [4, 5],
    ],
    // Rare の町 ①：Uncommon から 1 段上（層が 1 枚多く、どの層も 1〜2 硬い。発掘の枝の強化と無限の強化パネルを持ち込んだ前提）
    R: [
      [3, 4],
      [4, 4],
      [4, 5],
      [5, 6],
      [6, 7],
    ],
    // Epic の町 ①（段 H1）：Rare から 1 段上（層が 1 枚多く、どの層も 1 硬い）
    E: [
      [4, 5],
      [5, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
    ],
  },
  // 荒れ地 1 か所の正面の壁（横 7 × 縦 9。スマホの縦長の全画面に合う形）
  wall: { C: [7, 9], U: [7, 9], R: [7, 9], E: [7, 9] },
  // 壁に埋まっているもの（マス × 層 1 枚あたり）。v10 の断面（Common 140 マス・Uncommon 168 マス × エクステ 24%・素材 14%）と、1 か所の出土の数がそろうように
  odds: { C: { ext: 0.178, mat: 0.104 }, U: { ext: 0.16, mat: 0.093 }, R: { ext: 0.14, mat: 0.09 }, E: { ext: 0.125, mat: 0.08 } },
  // 自動発掘：適性の速さ 1.0 で 1 日に打つ回数
  autoPerDay: 3,
  // 発掘のスキルツリー（仮。Lv が上がるほど levelCost で ×2・×3.5・×5.5・×8）
  tree: {
    cost: {
      dig_ext: 2000,
      dig_power: 4000,
      dig_speed: 5000,
      dig_reach: 8000,
      dig_pierce: 9000,
      dig_lamp: 3000,
      dig_deep: 5000,
      dig_study: 6000,
      dig_blast: 6000,
      dig_drill: 12000,
      dig_office: 4000,
      dig_crew: 7000,
      u_dig_ext2: 40000,
      u_dig_auto: 60000,
      u_dig_power2: 80000,
      u_dig_route: 30000,
      u_dig_relay: 20000,
      u_dig_mat: 25000,
    },
    // 追加申請：+3 秒／Lv（15 → 30 秒）・長期の発掘許可：さらに +6 秒／Lv（最大 60 秒）
    ext: [3, 6, 9, 12, 15],
    ext2: [6, 12, 18, 24, 30],
    maxSec: 60,
    // ツルハシの鍛え直し：1 打の強さ +1（Lv1）・+2（Lv3）・+3（Lv5）。間の Lv は会心（2 倍）の確率 +10%
    power: [1, 1, 2, 2, 3],
    crit: [0, 0.1, 0.1, 0.2, 0.2],
    critMul: 2,
    // 重機の貸し出し：さらに +1（Lv1・3・5）
    power2: [1, 1, 2, 2, 3],
    // 手早い掘り方：長押しの間隔 170 → 150・130・115・100・90 ms（170 から引く ms）
    repeat: [20, 40, 55, 70, 80],
    // 広く掘る：隣のマスへの力（打った強さの割合）と向き（lr 左右・lrd 左右と下・all 上下左右）
    reach: [0.25, 0.35, 0.45, 0.5, 0.6],
    reachDir: ['lr', 'lr', 'lrd', 'all', 'all'],
    // 段 DIG3：貫通（超えた力の持ち越し）25 → 35・50・65・80%
    pierce: [0.25, 0.35, 0.5, 0.65, 0.8],
    // 発掘のランタン：ひびの隙間から見え始める深さ（何枚手前から。ふだんは いまの層だけ）。Lv4 でお題の気配が さらに 2 枚先から、Lv5 で石板も
    lamp: [1, 2, 3, 3, 3],
    hint: 2,
    // 深い層の許可：掘れる層の数（Lv0〜5）。ダンジョンの深さは DIG_BALANCE.dungeon.deep
    // Rare：Lv2 で 3 層目・Lv3 で 4 層目・Lv4 で 5 層目。Epic：Lv5 で 6 層目（1 段上）
    deep: { C: [2, 3, 3, 3, 3, 3], U: [2, 2, 3, 4, 4, 4], R: [2, 2, 3, 4, 5, 5], E: [2, 2, 3, 4, 5, 6] },
    // 研究の目利き：研究 Lv の上限（Lv0〜5）と、深い層ほど研究が進みやすい倍率（層 n で 1 + 0.25 × (n − 1) × 倍率 個ぶん）
    cap: [3, 4, 5, 5, 5, 5],
    deepMul: [0, 0, 0, 1, 1.5, 2],
    // 発破：火薬代（G）と大きさ（N × N）
    blastCost: [2000, 1500, 1000, 1000, 1000],
    blastSize: [3, 3, 3, 4, 5],
    // 掘削ドリル：押したマス 1 つを奥へ N 層・1 回の燃料代（G）
    drill: [3, 4, 5, 6, 7],
    drillFuel: 1000,
    // 発掘隊の役所：隊の人数の上限（Lv0〜5）・発掘隊の手際：1 日に打つ回数 +20%／Lv
    office: [1, 2, 3, 3, 4, 5],
    crew: [0.2, 0.4, 0.6, 0.8, 1.0],
    // 常駐（自動化）：作業していない日の速さ（作業中の何割）・段取り：速さ +10%／Lv・交代制：スタミナの消耗 −15%／Lv・素材の選り分け：+20%／Lv
    auto: [0.2, 0.4, 0.55, 0.7, 0.8],
    autoSpeed: [0.1, 0.2, 0.3, 0.4, 0.5],
    relay: [0.15, 0.3, 0.45, 0.6, 0.75],
    mat: [0.2, 0.4, 0.6, 0.8, 1.0],
    // 調整 v25c（PR #29 で研究パネルにした発掘の枝）：効き目は Lv3 の段（以前の最大 Lv5 のままだと、災害で消えなくなったぶん
    // Rare・Epic の再発掘が速くなりすぎた）。深い層の許可・研究の目利き・発掘隊の役所は Lv5（Rare・Epic のお題の層・研究 Lv5・発掘隊 5 人に要る）
    rpLv: { lv: 2, keep: { dig_deep: 5, dig_study: 5, dig_office: 5 } },
    // 調整 v25c：Common の発掘のパネルの RP（前は Common の研究パネルの段 20〜80 で合計 550 → 合計 210）。
    // Common の RP をほかの研究に回せるように（v25b で Common が +9〜12% 遅くなった）。Uncommon の 6 枚は段の自動の値段（60〜180）のまま
    rp: { dig_ext: 15, dig_lamp: 25, dig_deep: 40, dig_power: 10, dig_office: 15, dig_speed: 15, dig_blast: 20, dig_crew: 25, dig_reach: 30, dig_drill: 30, dig_study: 35 },
  },
  // 発掘作業：15 秒（現実の秒）・長押し 0.17 秒ごと
  sessionSec: 15,
  repeatMs: 170,
  // 発掘許可の申請料（仮。セクタの 1 か所目は無料）
  permitFee: { C: 2000, U: 8000, R: 20000, E: 50000 },
  // 自動プレイ：1 秒に 4 打
  simTapsPerSec: 4,
  // お題の層（v13）
  topicLayer: { C: [1, 2, 2], U: [2, 3, 3, 3], R: [2, 3, 4, 4], E: [3, 4, 5, 5] },
  // 復刻品：研究 Lv3 で開く・売値 ×1.25・独占 4 か月・需要 12 個（gap の商品の平均 20.5 の 0.6 倍）・3〜4 日・1 ロット 4 個（アンコモンは半分）
  // Epic の復刻品（段 H1）：Rare から 1 段上（売値 ×10・工期 5〜6 日・製造の適性 48・宝石 +1・布か紙 +2）
  relic: { openLv: 3, priceMul: 1.05, monopolyMonths: 3, demandBase: 12, days: [3, 4], batch: 4, rare: { price: 5, days: [4, 5], minCraft: 40, gem: 1, more: 2 }, epic: { price: 10, days: [5, 6], minCraft: 48, gem: 1, more: 2 } },
  // 復興：家の数の +6%（46 軒の町で +3 軒）・地図に描く住宅は 2 軒まで
  revive: { homes: 0.06, houses: 2 },
  dungeon: {
    wall: [7, 9],
    layers: 6,
    // 奥ほど硬い。Common のセクタでも、奥の層は Uncommon の荒れ地の奥（3〜4）より硬い
    hard: {
      C: [
        [2, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
      ],
      U: [
        [3, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
      ],
      R: [
        [4, 4],
        [4, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [8, 9],
      ],
      E: [
        [5, 5],
        [5, 6],
        [6, 7],
        [7, 8],
        [8, 9],
        [9, 10],
      ],
    },
    // 掘れる層（深い層の許可 Lv0〜5）：Lv1〜3 で 3 層・Lv4 で 5 層・Lv5 で 6 層（荒れ地を掘りきるには Common で Lv1・Uncommon で Lv3 が要る）
    deep: [2, 3, 3, 3, 5, 6],
    odds: { ext: 0.178, mat: 0.104 },
    // 層ごとのエクステのランク：[そのセクタのランク, 1 つ上, 2 つ上, 3 つ上]。
    // Common のセクタ（1 つ上＝Uncommon・2 つ上＝Rare・3 つ上＝Epic）：1〜2 層は Common だけ・3 層 U 10%・4 層 U 25% R 5%・5 層 U 25% R 12% E 2%・6 層 U 25% R 20% E 6%
    // Uncommon のセクタは 1 つ上へずらす（R・E・L）。Legendary は 6 層の 1% だけ
    rarity: {
      C: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.9, 0.1, 0, 0],
        [0.7, 0.25, 0.05, 0],
        [0.61, 0.25, 0.12, 0.02],
        [0.49, 0.25, 0.2, 0.06],
      ],
      U: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.9, 0.1, 0, 0],
        [0.7, 0.25, 0.05, 0],
        [0.63, 0.25, 0.12, 0],
        [0.54, 0.25, 0.2, 0.01],
      ],
      // Rare のセクタ（1 つ上＝Epic・2 つ上＝Legendary。3 つ上は無い）
      R: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.92, 0.08, 0, 0],
        [0.78, 0.2, 0.02, 0],
        [0.7, 0.25, 0.05, 0],
        [0.62, 0.3, 0.08, 0],
      ],
      // Epic のセクタ（1 つ上＝Legendary だけ。2 つ上・3 つ上は無い）
      E: [
        [1, 0, 0, 0],
        [1, 0, 0, 0],
        [0.94, 0.06, 0, 0],
        [0.85, 0.15, 0, 0],
        [0.8, 0.2, 0, 0],
        [0.74, 0.26, 0, 0],
      ],
    },
    pick: 9,
  },
  // 展示館：枠 4（展示室の増築で 8・12・16）・価値 C 1・U 2・R 5・E 15・L 40 ×（1 + 0.25 ×（研究 Lv − 1））・価値 1 で月 12 人・入館料 15 G
  museum: { slots: [4, 8, 12, 16], expand: [20000, 50000, 120000], val: { C: 1, U: 2, R: 5, E: 15, L: 40 }, lvStep: 0.25, visitors: 12, fee: 15, marks: [20, 50, 100, 200, 400, 800], known: 0.05, brand: 1 },
  // 無限の強化パネル：Lv1 2,000 RP・×1.25 ずつ（50 RP 単位）。Lv^0.85：速さ −2%・力 +5%・範囲 +3% から（Lv10 で 速さ ÷1.14・力 ×1.35・範囲 21%）
  infinite: { cost: 2000, grow: 1.25, step: 50, curve: 0.85, speed: 0.02, minMs: 40, power: 0.05, reach: 0.03 },
  // 研究への寄付：はじめ 20,000 G で 100 RP・押すごとに ×1.15（100 G 単位）
  buyRp: { cost: 20000, grow: 1.15, step: 100, rp: 100 },
  // Uncommon の発表：お題に加えて、そのセクタの出土品 2 種を、この町の荒れ地で 10 個ずつ掘り出す（v14：研究 Lv3 → この町で掘った数。町の荒れ地に埋まっている数は、多い 2 種で 18〜27 個）。Common は お題だけ
  // Rare の町 ①：出土品 2 種を この町で 12 個ずつ（層が 1 枚多いので、多い 2 種で 20〜30 個埋まっている）
  // Epic の町 ①（段 H1）：出土品 2 種を この町で 14 個ずつ（層がさらに 1 枚多い）
  presentRes: { U: { n: 2, dug: 10 }, R: { n: 2, dug: 12 }, E: { n: 2, dug: 14 } },
};

/**
 * ランクアップの災害と徴収・被災した町の復興（発掘 v2 の 7 段目。docs/ISLAND_PHASE1.md「ランクアップの災害と復興」）。
 * 自動プレイ（npm run island:sim）で直す数字はここの 1 か所。必要金額（建物・投資・パネル・入国料・出店許可）は上げない
 */
export const RESET = {
  /** ランドからの復興の支度金（Uncommon への初進出。タオックスの開始資金と同じ） */
  grant: 30000,
  /**
   * 2 回目のランクアップ（Uncommon → Rare への初進出）の支度金。Rare の町で工房とお店 1 軒・はじめの素材と魔法の釜が揃う程度
   * （Rare の町 ①。自動プレイで決めた。docs/ISLAND_BALANCE.md の v16）
   */
  grantR: 60000,
  /**
   * 3 回目のランクアップ（Rare → Epic への初進出）の支度金（段 H1）。Epic の町で工房とお店 1 軒・はじめの素材・ひと月ぶんの給与が出せる額
   * （自動プレイで決めた。docs/ISLAND_BALANCE.md の v23）
   */
  grantE: 150000,
  /** 手で直す：元の建物の値段の rate（最低 min G）・元の工期の days 倍（最低 1 日） */
  repair: { rate: 0.4, min: 1000, days: 0.4 },
  /**
   * ヒーローに任せる（復興支援金）：修繕の値段 × costMul（割高）・1 か月に直せる数（担当の能力値の平均 apt が lo 未満で 1・hi 未満で 2・それ以上で 3）・
   * 送る額の選択肢（G）
   */
  delegate: { costMul: 1.5, lo: 35, hi: 55, perMonth: [1, 2, 3] as [number, number, number], funds: [10000, 30000, 80000] as [number, number, number], fundsU: [20000, 50000, 120000] as [number, number, number], fundsR: [40000, 100000, 240000] as [number, number, number] },
  /** 復興の担当の伸び：毎月、能力値の低い順に stats 個を +lo〜hi（上限 100。OJT の 3 倍くらい） */
  grow: { stats: 2, lo: 2, hi: 3 },
};
/** 行き先のランクの復興の支度金（Uncommon 30,000 G・Rare RESET.grantR・Epic RESET.grantE） */
export const grantOf = (tier: Tier) => (tier === 'C' || tier === 'U' ? RESET.grant : tier === 'R' ? RESET.grantR : RESET.grantE);
/**
 * 被災した町に送る復興支援金の選択肢（町のランクで。Uncommon の町は修繕の合計が大きいので大きめ。必要金額ではない）。
 * Rare の町（段 H1：3 回目の災害）は、修繕の合計（Rare の町は建物が多く、お店 5〜8 軒・倉庫・工房で 8〜15 万 G ほど）から 2 倍の段
 */
export const fundsOf = (tier: Tier): [number, number, number] => (tier === 'C' ? RESET.delegate.funds : tier === 'U' ? RESET.delegate.fundsU : RESET.delegate.fundsR);

// ---------------------------------------------------------------- 発掘の枝（9 本目。発掘 v2 の 2 段目）

/**
 * 発掘の枝のパネル（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」の「2. 発掘のスキルツリー」）。すべてお金パネル（Lv1〜5・levelCost）。
 * Common の区画（根もとから枝先へ）11 枚と、Uncommon の外周 6 枚。数字は DIG_BALANCE.tree の 1 か所。効き目は model.ts（fxSum・lvOf）。
 * 発掘との出会い（digMeet）の前は、枝ごと雲で隠す（skillLock の 'hidden'）。Lime だけ（digLand）
 */
const DT = DIG_BALANCE.tree;
const lvTxt = (f: (v: number, lv: number) => string, xs: number[]) => xs.map((v, k) => f(v, k + 1));
const dShow = (label: string, txt: string[]): Shown => ({ label, v: 0, unit: '', txt });
const REACH_DIR = { lr: t('左右', 'left & right'), lrd: t('左右と下', 'sides & below'), all: t('上下左右', 'all 4 sides') };
const LAYER_C = [t('表土', 'Topsoil'), t('粘土層', 'Clay'), t('岩盤', 'Bedrock')];
const LAYER_U = [t('岩盤', 'Bedrock'), t('古い港の跡', 'Old harbor'), t('古い街道の跡', 'Old highway'), t('大地のつなぎ目', 'Seam of the lands')];
const LAYER_R = [t('崩れた石畳', 'Fallen paving'), t('止まった時計の層', 'Stopped clock'), t('古い坑道', 'Old mine shafts'), t('大地の裂け目', 'Rift in the earth'), t('9 つの境目', 'Border of the nine')];
const upTo = (names: string[], n: number) => t(`${names[n - 1]}まで`, `to ${names[n - 1]}`);
const dig_ = (id: string, name: string, note: string, more: Partial<Skill> = {}): Skill => ({ id, branch: 'dig', name, note, cost: DT.cost[id], ...more });
/**
 * 調整 v25c：研究パネルとして開いたときの効き目の段（digRpLv と同じ。DT.rpLv）と、その段の値（Lv1〜5 の表は [段 − 1]、Lv0〜5 の表は [段]）。
 * 説明の文はこの段の値で書く（研究パネルはレベルが無いので「／Lv」と書かない）
 */
const rl = (id: string) => Math.min(5, DT.rpLv.keep[id] ?? DT.rpLv.lv);
const at1 = <T,>(xs: T[], id: string): T => xs[rl(id) - 1];
const at0 = <T,>(xs: T[], id: string): T => xs[rl(id)];
const pct = (v: number) => Math.round(v * 100);
const lampHint = (id: string) => (rl(id) >= 5 ? t(`・お題の気配（金色のにじみ）と石板が さらに ${DT.hint} 枚先から`, `; target glow and tablets ${DT.hint} more layers ahead`) : rl(id) >= 4 ? t(`・お題の気配（金色のにじみ）が さらに ${DT.hint} 枚先から`, `; target glow ${DT.hint} more layers ahead`) : '');
const routeTxt = (id: string) => (rl(id) >= 5 ? t('お題の気配のある層・研究 Lv の低いエクステを優先し、出土品の重なりを避ける', 'toward hidden targets and low-research finds, avoiding maxed finds') : rl(id) >= 3 ? t('お題の気配のある層・研究 Lv の低いエクステを優先', 'toward hidden targets and low-research finds') : t('お題の気配のある層を優先', 'toward hidden targets'));
export const DIG_SKILLS: Skill[] = [
  // Common の区画（根もと）
  dig_('dig_ext', t('発掘の追加申請', 'Extra dig time'), t(`1 回の発掘作業 +${at1(DT.ext, 'dig_ext')} 秒（15 → ${15 + at1(DT.ext, 'dig_ext')} 秒）`, `Each dig run +${at1(DT.ext, 'dig_ext')} s (15 → ${15 + at1(DT.ext, 'dig_ext')} s)`), { fx: [{ kind: 'dig.sec', v: DT.ext[0], at: DT.ext }] }),
  dig_('dig_power', t('ツルハシの鍛え直し', 'Reforged pickaxe'), t(`1 打の強さ +${at1(DT.power, 'dig_power')}${at1(DT.crit, 'dig_power') ? `・会心の確率 +${pct(at1(DT.crit, 'dig_power'))}%（会心で ${DT.critMul} 倍）` : ''}`, `Strike power +${at1(DT.power, 'dig_power')}${at1(DT.crit, 'dig_power') ? `, critical chance +${pct(at1(DT.crit, 'dig_power'))}% (×${DT.critMul})` : ''}`), {
    fx: [
      { kind: 'dig.power', v: DT.power[0], at: DT.power },
      { kind: 'dig.crit', v: DT.crit[1], at: DT.crit },
    ],
  }),
  dig_('dig_speed', t('手早い掘り方', 'Quick swings'), t(`なぞって掘るときに打つ間隔 170 → ${170 - at1(DT.repeat, 'dig_speed')} ms`, `Strike interval while digging 170 → ${170 - at1(DT.repeat, 'dig_speed')} ms`), { requires: ['dig_power'], fx: [{ kind: 'dig.repeat', v: DT.repeat[0], at: DT.repeat }] }),
  dig_('dig_reach', t('広く掘る', 'Wide digging'), t(`打ったマスの隣（${REACH_DIR[at1(DT.reachDir, 'dig_reach')]}）の、いまの層にも力の ${pct(at1(DT.reach, 'dig_reach'))}%（はがれたら中身も出る）`, `${pct(at1(DT.reach, 'dig_reach'))}% of each strike also hits the neighbours (${REACH_DIR[at1(DT.reachDir, 'dig_reach')]}) on the current layer (their contents come out too)`), {
    requires: ['dig_speed'],
    fx: [{ kind: 'dig.reach', v: DT.reach[0], at: DT.reach }],
    // 段 DIG3：スキルツリーの札に「範囲：3 マス → 5 マス」（なぞって掘るときの点線の枠の広さ）
    show: [dShow(t('効く範囲', 'Cells hit'), DT.reachDir.map((d) => t(`${REACH_N[d]} マス`, `${REACH_N[d]} cells`))), dShow(t('力が届く向き', 'Directions'), DT.reachDir.map((d) => REACH_DIR[d]))],
  }),
  // 段 DIG3：貫通（打った力が層の硬さを超えたぶんを、下の層へ持ち越す）。Common の枝・広く掘るの先
  dig_('dig_pierce', t('貫通', 'Pierce'), t(`打った力が層の硬さを超えたぶんの ${pct(at1(DT.pierce, 'dig_pierce'))}% を、同じマスの下の層へ持ち越す（奥まで一気に）`, `${pct(at1(DT.pierce, 'dig_pierce'))}% of the power left over after a layer breaks carries into the next layer of that cell`), {
    requires: ['dig_reach'],
    fx: [{ kind: 'dig.pierce', v: DT.pierce[0], at: DT.pierce }],
  }),
  dig_('dig_lamp', t('発掘のランタン', 'Dig lantern'), t(`ひびの隙間から、奥に埋まっているものがうっすら見える（ふだんは いまの層だけ → ${at1(DT.lamp, 'dig_lamp')} 枚手前から）${lampHint('dig_lamp')}`, `Faintly glimpse finds deeper in (normally only the current layer → ${at1(DT.lamp, 'dig_lamp')} layer(s) ahead)${lampHint('dig_lamp')}`), {
    requires: ['dig_ext'],
    show: [dShow(t('見え始める深さ', 'Sight'), lvTxt((v) => t(`${v} 枚手前から`, `${v} layer(s) ahead`), DT.lamp)), dShow(t('お題の気配', 'Target hints'), [t('なし', 'none'), t('なし', 'none'), t('なし', 'none'), t(`さらに ${DT.hint} 枚先から`, `${DT.hint} more layers`), t(`さらに ${DT.hint} 枚先から（石板も）`, `${DT.hint} more layers (tablets too)`)])],
  }),
  dig_('dig_deep', t('深い層の許可', 'Deep-layer permit'), t(`掘れる層の上限：はじめは 2 層目まで（岩盤は国の許可が要る）。研究すると Common は ${at0(DT.deep.C, 'dig_deep')} 層目（岩盤）・Uncommon は ${at0(DT.deep.U, 'dig_deep')} 層目・Rare は ${at0(DT.deep.R, 'dig_deep')} 層目・Epic は ${at0(DT.deep.E, 'dig_deep')} 層目まで。ダンジョンは ${at0(DIG_BALANCE.dungeon.deep, 'dig_deep')} 層まで`, `Deepest layer you may dig: layer 2 at first (bedrock needs a permit). Researched: Common layer ${at0(DT.deep.C, 'dig_deep')} (bedrock), Uncommon ${at0(DT.deep.U, 'dig_deep')}, Rare ${at0(DT.deep.R, 'dig_deep')}, Epic ${at0(DT.deep.E, 'dig_deep')}. Dungeons: ${at0(DIG_BALANCE.dungeon.deep, 'dig_deep')} layers`), {
    requires: ['dig_lamp'],
    show: [dShow(t('Common の荒れ地', 'Common wastelands'), DT.deep.C.slice(1).map((n) => upTo(LAYER_C, n))), dShow(t('Uncommon の荒れ地', 'Uncommon wastelands'), DT.deep.U.slice(1).map((n) => upTo(LAYER_U, n))), dShow(t('Rare の荒れ地', 'Rare wastelands'), DT.deep.R.slice(1).map((n) => upTo(LAYER_R, n))), dShow(t('ダンジョンの深さ', 'Dungeon depth'), DIG_BALANCE.dungeon.deep.slice(1).map((n) => t(`${n} 層まで`, `${n} layers`)))],
  }),
  dig_('dig_study', t('研究の目利き', 'Keen research'), t(`研究 Lv の上限：はじめは Lv3 → Lv${at0(DT.cap, 'dig_study')}${at0(DT.deepMul, 'dig_study') ? `。深い層ほど研究が進みやすい（層 n で 1 + 0.25 × (n − 1) × ${at0(DT.deepMul, 'dig_study')} 個ぶん数える）` : ''}`, `Research level cap: Lv3 at first → Lv${at0(DT.cap, 'dig_study')}${at0(DT.deepMul, 'dig_study') ? `. Deeper layers count more (layer n counts 1 + 0.25 × (n − 1) × ${at0(DT.deepMul, 'dig_study')})` : ''}`), {
    requires: ['dig_deep'],
    show: [dShow(t('研究 Lv の上限', 'Research cap'), DT.cap.slice(1).map((n) => t(`Lv${n}`, `Lv${n}`))), dShow(t('深い層の倍率', 'Depth multiplier'), DT.deepMul.slice(1).map((m) => (m ? `×${m}` : t('なし', 'none'))))],
  }),
  dig_('dig_blast', t('発破', 'Blasting'), t(`発破が使える（押したマスを真ん中に ${at1(DT.blastSize, 'dig_blast')} × ${at1(DT.blastSize, 'dig_blast')} の、いまの層を 1 枚ずつ一度にはがす・硬さに関係なく・1 回ごとに火薬代 ${at1(DT.blastCost, 'dig_blast').toLocaleString('en-US')} G）`, `Unlocks blasting (peel one layer off the ${at1(DT.blastSize, 'dig_blast')} × ${at1(DT.blastSize, 'dig_blast')} around the cell at once, however hard; ${at1(DT.blastCost, 'dig_blast').toLocaleString('en-US')} G powder each time)`), {
    requires: ['dig_power'],
    show: [dShow(t('火薬代', 'Powder'), DT.blastCost.map((v) => `${v.toLocaleString('en-US')} G`)), dShow(t('大きさ', 'Size'), DT.blastSize.map((v) => `${v} × ${v}`))],
  }),
  dig_('dig_drill', t('掘削ドリル', 'Drill'), t(`押したマス 1 つを奥へ ${at1(DT.drill, 'dig_drill')} 層一気にはがす。1 回ごとに燃料代 ${DT.drillFuel.toLocaleString('en-US')} G`, `Peel ${at1(DT.drill, 'dig_drill')} layers off the tapped cell at once. ${DT.drillFuel.toLocaleString('en-US')} G fuel each time`), {
    requires: ['dig_blast'],
    show: [dShow(t('奥へ', 'Deeper by'), lvTxt((v) => t(`${v} 層`, `${v} layers`), DT.drill))],
  }),
  dig_('dig_office', t('発掘隊の役所', 'Dig crew office'), t(`発掘隊の人数の上限 1 → ${at0(DT.office, 'dig_office')} 人`, `Dig crew size limit 1 → ${at0(DT.office, 'dig_office')}`), {
    requires: ['dig_ext'],
    show: [dShow(t('発掘隊の上限', 'Crew limit'), DT.office.slice(1).map((n) => t(`${n} 人`, `${n}`)))],
  }),
  dig_('dig_crew', t('発掘隊の手際', 'Skilled crew'), t(`発掘隊の 1 日に打つ回数 +${pct(at1(DT.crew, 'dig_crew'))}%`, `Dig crew strikes a day +${pct(at1(DT.crew, 'dig_crew'))}%`), { requires: ['dig_office'], fx: [{ kind: 'dig.crew', v: DT.crew[0], at: DT.crew }] }),
  // Uncommon の外周
  dig_('u_dig_ext2', t('長期の発掘許可', 'Long-term dig permit'), t(`1 回の発掘作業 さらに +${at1(DT.ext2, 'u_dig_ext2')} 秒（最大 ${DT.maxSec} 秒）`, `Each dig run +${at1(DT.ext2, 'u_dig_ext2')} s more (max ${DT.maxSec} s)`), { tier: 'U', emblem: 1, requires: ['dig_ext'], reqLv: { dig_ext: 5 }, fx: [{ kind: 'dig.sec', v: DT.ext2[0], at: DT.ext2 }] }),
  dig_('u_dig_auto', t('発掘隊の常駐（自動化）', 'Standing dig crew'), t(`作業していない日も、許可のある荒れ地を発掘隊が掘る（作業中の速さの ${pct(at1(DT.auto, 'u_dig_auto'))}%）。出土品・RP・研究は手で掘ったのと同じ。スタミナは減る`, `On days you are not digging, the crew digs permitted wastelands (${pct(at1(DT.auto, 'u_dig_auto'))}% of the in-run pace). Finds, RP and research count the same. They tire`), {
    tier: 'U',
    emblem: 2,
    requires: ['dig_crew'],
    reqLv: { dig_crew: 3 },
    show: [dShow(t('作業していない日の速さ', 'Pace on idle days'), DT.auto.map((v) => t(`作業中の ${Math.round(v * 100)}%`, `${Math.round(v * 100)}% of in-run`)))],
  }),
  dig_('u_dig_power2', t('重機の貸し出し', 'Heavy machinery'), t(`1 打の強さ さらに +${at1(DT.power2, 'u_dig_power2')}。Uncommon の硬い層も楽に`, `Strike power +${at1(DT.power2, 'u_dig_power2')} more. Makes Uncommon’s hard layers easy`), { tier: 'U', requires: ['dig_power'], reqLv: { dig_power: 5 }, fx: [{ kind: 'dig.power', v: DT.power2[0], at: DT.power2 }] }),
  dig_('u_dig_route', t('常駐の段取り', 'Crew planning'), t(`常駐で打つマスの選び方を賢く（${routeTxt('u_dig_route')}）・常駐の速さ +${pct(at1(DT.autoSpeed, 'u_dig_route'))}%`, `Smarter targets for the standing crew (${routeTxt('u_dig_route')}); standing pace +${pct(at1(DT.autoSpeed, 'u_dig_route'))}%`), {
    tier: 'U',
    requires: ['u_dig_auto'],
    fx: [{ kind: 'dig.autoSpeed', v: DT.autoSpeed[0], at: DT.autoSpeed }],
    show: [dShow(t('マスの選び方', 'Targeting'), [t('お題の気配を優先', 'targets first'), t('お題の気配を優先', 'targets first'), t('＋研究 Lv の低いもの', '+ low research'), t('＋研究 Lv の低いもの', '+ low research'), t('＋重なりを避ける', '+ avoid maxed')])],
  }),
  dig_('u_dig_relay', t('常駐の交代制', 'Crew shifts'), t(`常駐で働く日のスタミナの消耗 −${pct(at1(DT.relay, 'u_dig_relay'))}%`, `Stamina drain on standing days −${pct(at1(DT.relay, 'u_dig_relay'))}%`), { tier: 'U', requires: ['u_dig_auto'], fx: [{ kind: 'dig.relay', v: DT.relay[0], at: DT.relay }] }),
  dig_('u_dig_mat', t('素材の選り分け', 'Material sorting'), t(`掘り出した素材 +${pct(at1(DT.mat, 'u_dig_mat'))}%（端数は持ち越し）`, `Materials dug up +${pct(at1(DT.mat, 'u_dig_mat'))}% (fractions carry over)`), { tier: 'U', fx: [{ kind: 'dig.mat', v: DT.mat[0], at: DT.mat }] }),
];
SKILLS.push(...DIG_SKILLS);
/**
 * 発掘の枝のパネル（17 枚）。以前はお金パネル（Lv1〜5）だったが、ランクアップの災害でお金のパネルが未取得に戻って遊びにくいので、
 * **研究パネル（RP で開く・レベルなし）** にした（値段は同じランクの研究パネルの RP の段。下の RP の決め方）。
 * 効き目は決まった段（調整 v25c：ふつう Lv3・深い層の許可・研究の目利き・発掘隊の役所は Lv5。DT.rpLv）：開いたとき skillLv をその段にする（model.ts の gainSkill）。
 * 値段は DT.rp（Common は決め打ちで安く）。無限の強化パネル・研究への寄付・発掘許可・発破とドリルの毎回の代金は、そのままお金
 */
export const DIG_PANELS = DIG_SKILLS.map((k) => k.id);
/** 発掘パネル（研究パネル）を開いたときの効き目の段（調整 v25c：ふつう Lv3・深い層の許可・研究の目利き・発掘隊の役所は Lv5。DT.rpLv） */
export const digRpLv = (k: Skill) => Math.min(k.max ?? 5, DT.rpLv.keep[k.id] ?? DT.rpLv.lv);

// ---------------------------------------------------------------- 無限の強化パネル・研究への寄付（発掘 v2 の 6 段目）

const DI = DIG_BALANCE.infinite;
const DB = DIG_BALANCE.buyRp;
/** 無限の強化パネルの Lv lv の値段（RP）：cost × grow^(lv − 1)（step 単位）。lv ≤ 0 は 0 */
export const infCost = (lv: number) => (lv <= 0 ? 0 : Math.max(DI.step, Math.round((DI.cost * DI.grow ** (lv - 1)) / DI.step) * DI.step));
/** 無限の強化パネルの Lv lv の効き目の量：per × lv^curve（上がるほど少しずつ鈍くなる。上限なし） */
export const infAmt = (per: number, lv: number) => (lv <= 0 ? 0 : per * lv ** DI.curve);
/** 研究への寄付の n 回目（0 から）の値段（G）：cost × grow^n（step 単位） */
export const donateCost = (n: number) => Math.max(DB.step, Math.round((DB.cost * DB.grow ** Math.max(0, n)) / DB.step) * DB.step);
const inf_ = (id: string, kind: InfKind, name: string, note: string, requires: string[]): Skill => ({ id, branch: 'dig', tier: 'U', inf: kind, name, note, cost: 0, requires, reqLv: Object.fromEntries(requires.map((r) => [r, 5])) });
/**
 * 無限の強化パネル 3 枚（発掘の枝の Uncommon の外周の、いちばん外の段。研究パネル＝RP 払い・Lv の上限なし）。
 * 開く条件：対応する発掘のパネルを最大 Lv（速さ＝手早い掘り方 Lv5・力＝重機の貸し出し Lv5・範囲＝発破 Lv5 と掘削ドリル Lv5）
 */
export const INF_SKILLS: Skill[] = [
  inf_('u_dig_speed_inf', 'speed', t('発掘の速さ ∞', 'Dig speed ∞'), t(`長押しで続けて打つ間隔をさらに短く（Lv ごとに約 −${Math.round(DI.speed * 100)}%。上がるほど少しずつ鈍くなる・${DI.minMs} ms まで）。Lv の上限なし・研究ポイントで上げる`, `Hold-strike interval even shorter (about −${Math.round(DI.speed * 100)}% per level, tapering; down to ${DI.minMs} ms). No level cap · paid in RP`), ['dig_speed']),
  inf_('u_dig_power_inf', 'power', t('掘る力 ∞', 'Dig power ∞'), t(`1 打の強さ ×（1 ＋ 約 ${Math.round(DI.power * 100)}%／Lv。上がるほど少しずつ鈍くなる）。Lv の上限なし・研究ポイントで上げる`, `Strike power × (1 + about ${Math.round(DI.power * 100)}% per level, tapering). No level cap · paid in RP`), ['u_dig_power2']),
  inf_('u_dig_reach_inf', 'reach', t('掘る範囲 ∞', 'Dig reach ∞'), t(`発破が 1 回り大きく・ドリルが 1 層深くなる確率 +約 ${Math.round(DI.reach * 100)}%／Lv（上がるほど少しずつ鈍くなる。100% を超えたぶんは もう 1 つ）。Lv の上限なし・研究ポイントで上げる`, `Chance for a blast one size bigger and a drill one layer deeper +about ${Math.round(DI.reach * 100)}% per level (tapering; past 100% adds another). No level cap · paid in RP`), ['dig_blast', 'dig_drill']),
];
/**
 * 研究への寄付（お金パネル。発掘の枝の根もとの近く）：押すたびに G を払って RP を受け取る（回数の上限なし。値段は donateCost で上がる）。
 * 開く時期：Uncommon の調査依頼状を持っている、または Common のセクタを 1 つ制覇したあと（model.ts の donateLock）
 */
export const DONATE: Skill = {
  id: 'dig_donate',
  branch: 'dig',
  donate: true,
  name: t('研究への寄付', 'Research donation'),
  note: t(`国の研究所に寄付して、研究ポイントを受け取る（1 回 ${DB.rp} RP。押すたびに寄付の額が ×${DB.grow} ずつ上がる・回数の上限なし）`, `Donate to the national institute for research points (${DB.rp} RP each; each donation costs ×${DB.grow} more · no limit)`),
  cost: DB.cost,
};
/**
 * 営業のパネル（段 C。Rare の外周・営業の枝。docs/ISLAND_PHASE1.md「営業の部門」）。効き目は Rare の町の商圏だけに効く（model.ts の「商圏の取り合い」）。
 * 研究パネル 2 枚（立地調査・ドミナント出店）・お金パネル 4 枚（SALES_MONEY。Lv1〜5）
 */
export const SALES_SKILLS: Skill[] = [
  { id: 'sa_survey', branch: 'sales', tier: 'R', name: t('立地調査', 'Site survey'), note: t('営業の画面の「出店の候補地」と、お店を置くときの下見に、取れる取り分の予測（％）が出る', 'Shows the predicted share (%) at candidate sites and when placing a shop'), cost: 0 },
  { id: 'sa_local', branch: 'sales', tier: 'R', name: t('地域密着', 'Local roots'), note: t('Rare の町の自社のお店の引き +10%（商圏の取り分が増える）', 'Your shops’ pull in Rare towns +10% (bigger trade-area share)'), cost: 60000, requires: ['sa_survey'], show: [{ label: t('自社の店の引き', 'Your store pull'), v: 0.1, unit: '%' }] },
  { id: 'sa_dominant', branch: 'sales', tier: 'R', name: t('ドミナント出店', 'Dominant clustering'), note: t('同じ町の自社のお店どうしの商圏が重なっても取り合わない（重なった所のお客さんは、自社の店の引きの合計で選ぶ）', 'Your shops in the same town stop competing where their trade areas overlap (customers there weigh your shops’ combined pull)'), cost: 0, requires: ['sa_survey'] },
  { id: 'sa_road', branch: 'sales', tier: 'R', name: t('ロードサイド', 'Roadside stores'), note: t('Rare の町の自社のお店の商圏（お客さんが来る距離）+15%', 'Your shops’ trade-area reach in Rare towns +15%'), cost: 90000, requires: ['sa_local'], show: [{ label: t('商圏の距離', 'Reach'), v: 0.15, unit: '%' }] },
  { id: 'sa_nego', branch: 'sales', tier: 'R', name: t('撤退の交渉', 'Exit negotiations'), note: t('撤退した店の跡（空き店舗）に自社が入る費用 −20%', 'Moving into a vacant store costs 20% less'), cost: 80000, requires: ['sa_dominant'], show: [{ label: t('空き店舗に入る費用', 'Vacant-store cost'), v: 0.2, unit: '%', down: true }] },
  { id: 'sa_edge', branch: 'sales', tier: 'R', name: t('差別化の売り場', 'Differentiated floors'), note: t('Rare の町の他社の店の引き −6%（商品と売り場で差をつけ、他社のお客さんを奪う）', 'Rival stores’ pull in Rare towns −6% (stand out to win their customers)'), cost: 130000, requires: ['sa_road'], show: [{ label: t('他社の店の引き', 'Rival store pull'), v: 0.06, unit: '%', down: true }] },
];
/** 営業のお金パネル（Lv1〜5） */
export const SALES_MONEY = ['sa_local', 'sa_road', 'sa_nego', 'sa_edge'];
SKILLS.push(...SALES_SKILLS);
/**
 * 人事のパネル（段 E2。人材の枝＝人事の部門。docs/ISLAND_PHASE1.md「士気と給与」「カリスマ度」）。効き目は hr.ts（士気・給与・カリスマ度）。
 * 研究パネル 2 枚（面談・採用ブランド）・お金パネル 2 枚（HR_MONEY。Lv1〜5：キャリアの道すじ・給与テーブル）。
 * 研究パネルの RP は決め打ち（HR_RP）：ほかの人材の枝の研究パネルの値段を動かさない（段 E2 の前と同じ値段）
 */
export const HR_SKILLS: Skill[] = [
  { id: 'hr_talk', branch: 'people', name: t('面談', 'One-on-ones'), note: t('「辞めたい」の予告が 30 → 45 日に・引き止めの面談で上がる士気 +15 → +25', '“Wants to quit” notice 30 → 45 days; a stay talk lifts morale +15 → +25'), cost: 0, requires: ['ojt'] },
  { id: 'hr_career', branch: 'people', name: t('キャリアの道すじ', 'Career paths'), note: t('昇進・昇格・レベルアップで上がる士気 +50%', 'Morale from promotions, rank-ups and level-ups +50%'), cost: 4500, requires: ['incentive'], show: [{ label: t('昇進・昇格・レベルアップの士気', 'Morale from promotions and level-ups'), v: 0.5, unit: '%' }] },
  { id: 'hr_brand', branch: 'people', tier: 'U', name: t('採用ブランド', 'Employer brand'), note: t('カリスマ度 +5（良いヒーローが来る会社として知られる。雇えるレアリティが上がる）', 'Charisma +5 (known as a great place to work; higher rarities can be hired)'), cost: 0, requires: ['b_scout'] },
  { id: 'hr_paytable', branch: 'people', tier: 'U', name: t('給与テーブル', 'Pay scale'), note: t('給与が相場どおりか上の人の士気の目標 +4（Lv ごとに +25%）', 'Morale target +4 for heroes paid at or above market (+25% per Lv)'), cost: 18000, requires: ['mgr'], show: [{ label: t('相場どおりか上の人の士気', 'Morale at or above market'), v: 4, unit: '' }] },
];
/** 人事のお金パネル（Lv1〜5） */
export const HR_MONEY = ['hr_career', 'hr_paytable'];
/** 人事の研究パネルの RP（決め打ち） */
export const HR_RP: Record<string, number> = { hr_talk: 45, hr_brand: 130 };
/** 段 F の研究パネルの RP（決め打ち。Uncommon の研究パネルの範囲 60〜180 の中） */
export const ACCT_RP: Record<string, number> = { ac_advisor: 90, ac_rnd: 140, ac_carry: 170, ga_check: 120 };
SKILLS.push(...HR_SKILLS);
/**
 * 経理のパネル（段 F。Uncommon の外周・経営の枝のうち経理の部門。docs/ISLAND_PHASE1.md「経理」）。効き目は acct.ts（税・節税）と汎用の効き目（素材の値段・維持費）。
 * 研究パネル 3 枚（税理士の顧問・研究開発の税制・繰越の損失）・お金パネル 3 枚（ACCT_MONEY。Lv1〜5：減価償却・材料費の分析・経費の見直し）。
 * 研究パネルの RP は決め打ち（FIXED_RP）：ほかの経営の枝の研究パネルの値段を動かさない
 */
export const ACCT_SKILLS: Skill[] = [
  { id: 'ac_advisor', branch: 'ops', tier: 'U', name: t('税理士の顧問', 'Tax advisor'), note: t('節税の上限（差し引ける額）が四半期の利益の 50% → 60% に', 'Tax-saving cap rises from 50% to 60% of quarterly profit'), cost: 0 },
  { id: 'ac_deprec', branch: 'ops', tier: 'U', name: t('減価償却', 'Depreciation'), note: t('設備投資（建てる・設備・お金パネル）の差し引き 30% → 36%（Lv ごとに +25%）', 'Capex deduction 30% → 36% (+25% per Lv)'), cost: 24000, requires: ['ac_advisor'], show: [{ label: t('設備投資の差し引き', 'Capex deduction'), v: 0.06, unit: '%' }] },
  { id: 'ac_rnd', branch: 'ops', tier: 'U', name: t('研究開発の税制', 'R&D tax credit'), note: t('研究開発（研究への寄付・発掘許可・商品開発）の差し引き 50% → 80%', 'R&D deduction (donations, dig permits, product development) 50% → 80%'), cost: 0, requires: ['ac_advisor'] },
  { id: 'ac_cost', branch: 'ops', tier: 'U', name: t('材料費の分析', 'Material cost analysis'), note: '', cost: 30000, requires: ['ac_advisor'], fx: [{ kind: 'matPrice', v: 0.04 }] },
  { id: 'ac_carry', branch: 'ops', tier: 'U', name: t('繰越の損失', 'Loss carryforward'), note: t('赤字の四半期の損失を、4 四半期まで繰り越して利益から差し引ける（立ち上げの赤字のあとの税が軽い）', 'A loss-making quarter’s loss is carried forward up to 4 quarters (lighter tax after a loss-making start)'), cost: 0, requires: ['ac_deprec'] },
  { id: 'ac_upkeep', branch: 'ops', tier: 'U', name: t('経費の見直し', 'Expense review'), note: '', cost: 42000, requires: ['ac_cost'], fx: [{ kind: 'upkeep', v: 0.06 }] },
];
/** 経理のお金パネル（Lv1〜5） */
export const ACCT_MONEY = ['ac_deprec', 'ac_cost', 'ac_upkeep'];
/**
 * 総務のパネル（段 F で足した 3 枚。人材の枝のうち総務の部門・Uncommon の外周。docs/ISLAND_PHASE1.md「総務」）。いまの 9 枚（休憩室・シフト制・福利厚生など）と同じく、
 * 取った枚数が士気の目標の「職場の環境」に入る（hr.ts の envPanels）。お金パネル 2 枚（GA_MONEY：社員食堂・仮眠室）・研究パネル 1 枚（ストレスチェック）
 */
export const GA_SKILLS: Skill[] = [
  { id: 'ga_canteen', branch: 'people', tier: 'U', name: t('社員食堂', 'Staff canteen'), note: '', cost: 20000, requires: ['welfare'], fx: [{ kind: 'rest', v: 0.15 }] },
  { id: 'ga_nap', branch: 'people', tier: 'U', name: t('仮眠室', 'Nap room'), note: '', cost: 28000, requires: ['ga_canteen'], fx: [{ kind: 'stamina', v: 0.06 }] },
  { id: 'ga_check', branch: 'people', tier: 'U', name: t('ストレスチェック', 'Stress checks'), note: t('疲れが働きの速さと士気に響く分 −50%', 'Fatigue’s hit on work speed and morale −50%'), cost: 0, requires: ['ga_canteen'] },
];
/** 総務のお金パネル（Lv1〜5） */
export const GA_MONEY = ['ga_canteen', 'ga_nap'];
SKILLS.push(...ACCT_SKILLS, ...GA_SKILLS);
/**
 * カスタマーサポートのパネル（段 G。Uncommon の外周・販売の枝のうちカスタマーサポートの部門。docs/ISLAND_PHASE1.md「カスタマーサポート」）。効き目は cs.ts。
 * 研究パネル 3 枚（FAQ・返品の決まり・満足度の調査）・お金パネル 1 枚（CS_MONEY。Lv1〜5：サポートセンター）。
 * 研究パネルの RP は決め打ち（CSM_RP）：ほかの販売の枝の研究パネルの値段を動かさない
 */
export const CS_SKILLS: Skill[] = [
  { id: 'cs_center', branch: 'shop', tier: 'U', name: t('サポートセンター', 'Support center'), note: t('届いた問い合わせの 30% をセンターが自動で受ける（出来 75%。Lv ごとに +10%）', 'The center answers 30% of new inquiries on its own (75% quality; +10% per Lv)'), cost: 16000, show: [{ label: t('自動で受ける割合', 'Auto-handled'), v: 0.3, unit: '%', at: [0.3, 0.4, 0.5, 0.6, 0.7], bare: true }] },
  { id: 'cs_faq', branch: 'shop', tier: 'U', name: t('FAQ（よくある質問）', 'FAQ page'), note: t('届く問い合わせ −30%（よくある質問は自分で調べてもらう）', 'Inquiries −30% (customers find common answers themselves)'), cost: 0, requires: ['cs_center'] },
  { id: 'cs_policy', branch: 'shop', tier: 'U', name: t('返品の決まり', 'Return policy'), note: t('返金の費用 −40%・返事の期限 14 → 21 日', 'Refunds cost 40% less; reply deadline 14 → 21 days'), cost: 0, requires: ['cs_center'] },
  { id: 'cs_survey', branch: 'shop', tier: 'U', name: t('満足度の調査', 'Satisfaction survey'), note: t('合う返事で上がる顧客満足度 +30%・満足度が来店に効く分 ×1.5（何がお客さんに響くかが分かる）', 'Satisfaction from a fitting reply +30%; satisfaction’s effect on visits ×1.5 (learn what customers value)'), cost: 0, requires: ['cs_faq'] },
];
/** カスタマーサポートのお金パネル（Lv1〜5） */
export const CS_MONEY = ['cs_center'];
/**
 * マーケの段 G のパネル（Uncommon の外周・販売の枝のうちマーケの部門。docs/ISLAND_PHASE1.md「マーケ（市場調査・広報・企業の格）」）。効き目は mkt.ts・cs.ts。
 * 研究パネル 3 枚（市場調査の部署・需要の読み・危機管理の手引き）・お金パネル 2 枚（MKT_MONEY。Lv1〜5：プレスリリース・コーポレートアイデンティティ）
 */
export const MKT_SKILLS: Skill[] = [
  { id: 'mk_research', branch: 'shop', tier: 'U', name: t('市場調査の部署', 'Research desk'), note: t('市場の見通しが 1 → 2 か月先まで・他社の売れ筋が見える', 'Market outlook 1 → 2 months ahead; shows rivals’ best-sellers'), cost: 0 },
  { id: 'mk_forecast', branch: 'shop', tier: 'U', name: t('需要の読み', 'Demand modeling'), note: t('市場の見通しが 3 か月先まで・他社が真似してくる時期の予報が見える', 'Market outlook 3 months ahead; forecasts when rivals will copy your goods'), cost: 0, requires: ['mk_research'] },
  { id: 'mk_press', branch: 'shop', tier: 'U', name: t('プレスリリース', 'Press releases'), note: t('広報で良いニュースを出したときのブランド力 +30%（Lv ごとに +25%）', 'Brand gained from good-news releases +30% (+25% per Lv)'), cost: 18000, requires: ['mk_research'], show: [{ label: t('良いニュースのブランド力', 'Brand from good news'), v: 0.3, unit: '%' }] },
  { id: 'mk_crisis', branch: 'shop', tier: 'U', name: t('危機管理の手引き', 'Crisis manual'), note: t('火消しの効き目 ×1.5・お詫びの告知の費用 −50%', 'Damage control ×1.5; apology notices cost 50% less'), cost: 0, requires: ['mk_press'] },
  { id: 'mk_ci', branch: 'shop', tier: 'U', name: t('コーポレートアイデンティティ', 'Corporate identity'), note: t('企業の格を決めるブランド力 +10%（Lv ごとに +25%）', 'Brand counted for your company standing +10% (+25% per Lv)'), cost: 30000, requires: ['mk_press'], show: [{ label: t('格のブランド力', 'Brand for standing'), v: 0.1, unit: '%' }] },
];
/** マーケの段 G のお金パネル（Lv1〜5） */
export const MKT_MONEY = ['mk_press', 'mk_ci'];
/** 段 G の研究パネルの RP（決め打ち。Uncommon の研究パネルの範囲 60〜180 の中） */
export const CSM_RP: Record<string, number> = { cs_faq: 70, cs_policy: 110, cs_survey: 150, mk_research: 80, mk_forecast: 130, mk_crisis: 160 };
SKILLS.push(...CS_SKILLS, ...MKT_SKILLS);
/**
 * 法務（段 H2：Epic の町 ②。docs/ISLAND_PHASE1.md「Epic の町 ②：法務と M&A」・docs/SUCCESSOR_ROADMAP.md 4-8）。計算は legal.ts（DOM なし）。
 * どれも Epic の町だけで起きる（Common・Uncommon・Rare の町には M&A・特許・訴え・仕入れの契約が出ない）。
 * - ma：M&A（他社の買収）。打診の返事まで replyDays 日・調査（デューデリジェンス）ddDays 日（調査の目利きで −ddFast）・調査料は目安の値段の ddFee（ddMin から）・
 *   値段の交渉の返事まで negoDays 日。値段の目安＝相手の月の売上 × months（伸びと利益率で 6〜10 か月）。提示は offer の 3 段・受ける見込み chance
 *   （企業の格 1 段 +grade・法務の理解度 1 ごとに +legalLv（legalMax まで）・弱っている相手 +weak・2 位の相手 second・M&A 部門 +panel × Lv の倍率・
 *   条項 1 つ clause（店員の引き継ぎは +staff）。cap まで）。断られたら wait 日は同じか安い提示ができない（高い提示はすぐできる）。
 *   買えるのは町の他社の maxShare まで。隠れた借金（debtP の確率で、目安の値段の debt）・訴えの種（seedP の確率で seed）は調査で見える。
 *   条項：支払いの分割（split：月の締めごとに months 回・合わせて +extra）・従業員の引き継ぎ（店員ごと＝すぐ開く・引き継ぐ商売 keep.yes／引き継がない＝noStaffDays 日の休業・keep.no）・
 *   競業避止（相手のオーナーが返りの returnAfter か月で新しい店を出さない。無ければ、そのころ 1 軒だけ戻ってくる＝買ったときの売上の returnBase）。
 *   買った店には売れ筋を stock 個ずつ。工芸の工房の買収（研究パネル）で引き継ぐ商売 +tech
 * - supply：仕入れの契約（卸問屋）。期間 terms か月で素材 −cut・独占で −excl 足す（違約金 ×exclPen）。途中でやめると違約金＝残りの月 × 先月の素材の費用 × penalty（cap まで）を、
 *   卸問屋が訴える（違約金なしの条項なら 0）
 * - patent：特許（Epic の町で、Rare・Epic の復刻品）。出願料 fee・審査 examDays 日・期間 months か月（特許の事務所で +office か月 × Lv の倍率）。特許の間は他社が追随しない。
 *   使用料で貸すと追随を許し、他社がその商品を売った額の royalty が毎月入る。更新は renew。貸さずに真似を止めた他社は sueP の確率で「無効の訴え」（損害 claim か月ぶんの売上の見込み）
 * - suit：争い（訴えは実際に起きたことからだけ）。months か月の勝負・毎月少しずつ進む。勝ちの見込み＝base（訴えられた側 def・訴えた側 plain）＋理解度 1 ごとに legalLv（legalMax まで）
 *   ＋顧問弁護士 counsel × Lv の倍率＋証拠 evidence（調査をした・特許がある）＋企業の格 1 段 grade＋担当のヒーローの INT（int[0] から 1 ごとに int[1]）。floor〜cap。
 *   和解は settle（訴えられた側は払う・訴えた側は受け取る）ですぐ終わる。負けても払うのは maxPay まで（資金が TAX.keep を切らない。残りは月ごとに）。訴えるときは file の費用
 * - clauses：通せる条項の数（はじめ base・法務の理解度 at で +1・契約の雛形で +1）。xp：契約・特許・M&A・裁判で上がる法務の理解度（max まで）
 */
export const LEGAL = {
  ma: {
    replyDays: 5,
    ddDays: 10,
    ddFast: 0.4,
    ddFee: 0.02,
    ddMin: 50000,
    negoDays: 7,
    months: [6, 10] as [number, number],
    offer: { low: 0.85, mid: 1, high: 1.2 },
    chance: { low: 0.3, mid: 0.55, high: 0.85 },
    grade: 0.03,
    legalLv: 0.01,
    legalMax: 0.12,
    weak: 0.15,
    second: -0.1,
    panel: 0.04,
    clause: -0.05,
    staff: 0.05,
    cap: 0.95,
    wait: 30,
    maxShare: 0.5,
    debtP: 0.5,
    debt: [0.08, 0.2] as [number, number],
    seedP: 0.35,
    seed: [0.04, 0.1] as [number, number],
    split: { months: 3, extra: 0.05 },
    keep: { yes: 0.8, no: 0.6 },
    noStaffDays: 5,
    returnAfter: 2,
    returnBase: 0.3,
    stock: 6,
    tech: 0.1,
  },
  supply: { terms: [3, 6, 12], cut: { 3: 0.04, 6: 0.07, 12: 0.1 } as Record<number, number>, excl: 0.03, exclPen: 1.5, penalty: 0.25, cap: 400000 },
  patent: { fee: 150000, examDays: 20, months: 12, office: 2, royalty: 0.08, renew: 100000, sueP: 0.5, claim: 3 },
  suit: { months: 3, base: { def: 0.45, plain: 0.5 }, legalLv: 0.02, legalMax: 0.16, counsel: 0.08, evidence: 0.15, grade: 0.02, int: [40, 0.004] as [number, number], floor: 0.1, cap: 0.95, settle: 0.5, maxPay: 1500000, file: 30000, dmg: 3 },
  clauses: { base: 1, at: 3, template: 1 },
  xp: { max: 10 },
};
/**
 * 法務のパネル（段 H2。Epic の外周・法務の枝。docs/ISLAND_PHASE1.md「Epic の町 ②」）。効き目は legal.ts。
 * 研究パネル 2 枚（契約の雛形・調査の目利き）・お金パネル 2 枚（LEGAL_MONEY。Lv1〜5：特許の事務所・顧問弁護士）。
 * 値段は Epic の段の釣り合い（Rare の営業のパネル 6〜13 万 G の 2.5 倍の流儀・研究パネルは Epic の研究パネルの範囲 375〜1,125 RP の中で決め打ち）。
 * M&A の交渉術は経営企画の「M&A 部門」（e_ops_1）が受け持つ（上の見直し）
 */
export const LEGAL_SKILLS: Skill[] = [
  { id: 'lg_template', branch: 'legal', tier: 'E', name: t('契約の雛形', 'Contract templates'), note: t('M&A と仕入れの契約で、通せる条項 +1（有利な条項を選びやすい）', 'One more clause in M&A and supply deals (easier to get favorable terms)'), cost: 0 },
  { id: 'lg_patent', branch: 'legal', tier: 'E', name: t('特許の事務所', 'Patent office'), note: t(`特許の期間 +${LEGAL.patent.office} か月（Lv ごとに +25%）・審査の日数 −25%`, `Patents last ${LEGAL.patent.office} more months (+25% per Lv); exams 25% faster`), cost: 160000, requires: ['lg_template'], show: [{ label: t('特許の期間（か月）', 'Patent term (months)'), v: LEGAL.patent.office, unit: '' }] },
  { id: 'lg_dd', branch: 'legal', tier: 'E', name: t('調査の目利き', 'Due-diligence eye'), note: t(`M&A の調査で「訴えの種」まで見える・調査の日数 −${Math.round(LEGAL.ma.ddFast * 100)}%`, `M&A due diligence also finds pending claims; ${Math.round(LEGAL.ma.ddFast * 100)}% faster`), cost: 0, requires: ['lg_template'] },
  { id: 'lg_counsel', branch: 'legal', tier: 'E', name: t('顧問弁護士', 'Legal counsel'), note: t(`裁判の勝ちの見込み +${Math.round(LEGAL.suit.counsel * 100)}%（Lv ごとに +25%）`, `Odds of winning a trial +${Math.round(LEGAL.suit.counsel * 100)}% (+25% per Lv)`), cost: 240000, requires: ['lg_dd'], show: [{ label: t('裁判の勝ちの見込み', 'Trial win odds'), v: LEGAL.suit.counsel, unit: '%' }] },
];
/** 法務のお金パネル（Lv1〜5） */
export const LEGAL_MONEY = ['lg_patent', 'lg_counsel'];
/** 法務の研究パネルの RP（決め打ち。Epic の研究パネルの範囲 375〜1,125 の中） */
export const LEGAL_RP: Record<string, number> = { lg_template: 500, lg_dd: 750 };
SKILLS.push(...LEGAL_SKILLS);
/**
 * 段 K：部門ごとの「経営方針」パネル（docs/ISLAND_PHASE1.md「経営方針（段 K）」）。その部門の理解度が deptLv に達すると取れる（Rare の外周）。
 * 営業は Rare の外周に入る幅が無い（枝の幅が足りず、ほかの枝が詰まる）ので Epic の外周。法務は逆に Epic の外周に入らないので、Epic のパネルのまま Rare の外周の位置に置く（Skill.ring。契約の雛形の先）。
 * 研究パネル 10 枚（取ると、その部門の事業別の方針が 1 つ選べるようになる。RP は決め打ち POL_RP）。
 * 段 K2：全社方針の枠のパネル（経営企画のお金パネル）はやめた。枠はセクタのランクが上がるたびに 1 枚ずつ、無償の特別なパネルで取る（POL.grant・policy.ts の claimSlot）。
 * どれも C・U の外ではないので、100% の「C・U の取れるパネル」の数は変わらない。開く方針は POLICIES の open.panel
 */
export const POL_SKILLS: Skill[] = [
  { id: 'pol_mk', branch: 'shop', tier: 'R', deptLv: 8, name: t('経営方針：STP', 'Policy: STP'), note: t('マーケの事業別の方針「STP マーケティング」が選べるようになる', 'Unlocks the Marketing policy “STP marketing”'), cost: 0, requires: ['r_shop_2'] },
  { id: 'pol_lg', branch: 'tech', tier: 'R', deptLv: 8, name: t('経営方針：TQM', 'Policy: TQM'), note: t('物流の事業別の方針「TQM（総合的品質管理）」が選べるようになる', 'Unlocks the Logistics policy “TQM”'), cost: 0, requires: ['r_tech_1'] },
  { id: 'pol_sy', branch: 'sys', tier: 'R', deptLv: 8, name: t('経営方針：アジャイル', 'Policy: Agile'), note: t('システムの事業別の方針「アジャイル開発」が選べるようになる', 'Unlocks the Systems policy “Agile development”'), cost: 0, requires: ['ec'] },
  { id: 'pol_rd', branch: 'ops', tier: 'R', deptLv: 8, name: t('経営方針：オープン・イノベーション', 'Policy: Open innovation'), note: t('R&D の事業別の方針「オープン・イノベーション」が選べるようになる', 'Unlocks the R&D policy “Open innovation”'), cost: 0, requires: ['u_dig_auto'] },
  { id: 'pol_hr', branch: 'people', tier: 'R', deptLv: 8, name: t('経営方針：ティール組織', 'Policy: Teal organization'), note: t('人事の事業別の方針「ティール組織」が選べるようになる', 'Unlocks the HR policy “Teal organization”'), cost: 0, requires: ['r_people_1'] },
  { id: 'pol_ga', branch: 'people', tier: 'R', deptLv: 6, name: t('経営方針：ウェルビーイング', 'Policy: Well-being'), note: t('総務の事業別の方針「ウェルビーイング経営」が選べるようになる', 'Unlocks the General Affairs policy “Well-being management”'), cost: 0, requires: ['r_people_5'] },
  { id: 'pol_cs', branch: 'shop', tier: 'R', deptLv: 5, name: t('経営方針：カスタマーサクセス', 'Policy: Customer success'), note: t('カスタマーサポートの事業別の方針「カスタマーサクセス」が選べるようになる', 'Unlocks the Support policy “Customer success”'), cost: 0, requires: ['cs_center'] },
  { id: 'pol_ac', branch: 'ops', tier: 'R', deptLv: 5, name: t('経営方針：ゼロベース予算', 'Policy: Zero-based budgeting'), note: t('経理の事業別の方針「ゼロベース予算」が選べるようになる', 'Unlocks the Accounting policy “Zero-based budgeting”'), cost: 0, requires: ['ac_cost'] },
  { id: 'pol_sa', branch: 'sales', tier: 'E', deptLv: 6, name: t('経営方針：インサイド・セールス', 'Policy: Inside sales'), note: t('営業の事業別の方針「インサイド・セールス」が選べるようになる', 'Unlocks the Sales policy “Inside sales”'), cost: 0, requires: ['sa_edge'] },
  { id: 'pol_le', branch: 'legal', tier: 'E', ring: 'R', deptLv: 4, name: t('経営方針：コンプライアンス', 'Policy: Compliance'), note: t('法務の事業別の方針「コンプライアンス経営」が選べるようになる', 'Unlocks the Legal policy “Compliance management”'), cost: 0, requires: ['lg_template'] },
];
/** 段 K の経営方針のパネルの id（枝の幅の余り・RP の割り振り・自動プレイの研究の並びに入れない） */
export const POL_PANELS = POL_SKILLS.map((k) => k.id);
/** 経営方針のパネルの部門（DEPT_MOVE に入れる） */
export const POL_PANEL_DEPT: Record<string, DeptId> = { pol_mk: 'marketing', pol_lg: 'logistics', pol_sy: 'systems', pol_rd: 'rnd', pol_hr: 'hr', pol_ga: 'general', pol_cs: 'support', pol_ac: 'accounting', pol_sa: 'sales', pol_le: 'legal' };
/** 経営方針の研究パネルの RP（決め打ち：Rare 150・Epic 400。ほかの研究パネルの値段の割り振りを動かさない） */
export const POL_RP: Record<string, number> = { pol_mk: 150, pol_lg: 150, pol_sy: 150, pol_rd: 150, pol_hr: 150, pol_ga: 150, pol_cs: 150, pol_ac: 150, pol_sa: 400, pol_le: 400 };
SKILLS.push(...POL_SKILLS);
SKILLS.push(...INF_SKILLS, DONATE);
/** 無限の強化パネルの id */
export const INF_PANELS = INF_SKILLS.map((k) => k.id);

// ---------------------------------------------------------------- スキルツリーの 2 区分（研究パネル・お金パネル）

/**
 * お金パネル（資金で開く・Lv1〜5）：技を除く 7 本の枝 × 5 ランクに 1 枚ずつ（35 枚）と、発掘の枝の 18 枚（DIG_PANELS）・研究への寄付（DONATE。押すたびに RP を買う）。
 * それ以外はすべて研究パネル（RP で開く・レベルなし。無限の強化パネル INF_SKILLS だけは Lv の上限なし）。
 * Common は仕様の 7 枚。Uncommon〜Legendary は「枝の根もと近く、Lv5 まであり、レベルを上げるほど素直に効く数字のパネル」＝
 * そのランク・その枝の追加のパネルの 1 枚目（`<ランク>_<枝>_1`。ロット・ブランド力のような最大 3 のパネルは無い）。
 * docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」「お金パネル 35 枚」
 */
export const MONEY_PANELS: Record<Tier, Partial<Record<Branch, string>>> = {
  C: { shop: 'host', craft: 'jig', logi: 'shortcut', buy: 'bulk', people: 'manual', ops: 'budget', sys: 'pos' },
  U: { shop: 'u_shop_1', craft: 'u_craft_1', logi: 'u_logi_1', buy: 'u_buy_1', people: 'u_people_1', ops: 'u_ops_1', sys: 'u_sys_1' },
  R: { shop: 'r_shop_1', craft: 'r_craft_1', logi: 'r_logi_1', buy: 'r_buy_1', people: 'r_people_1', ops: 'r_ops_1', sys: 'r_sys_1' },
  E: { shop: 'e_shop_1', craft: 'e_craft_1', logi: 'e_logi_1', buy: 'e_buy_1', people: 'e_people_1', ops: 'e_ops_1', sys: 'e_sys_1' },
  L: { shop: 'l_shop_1', craft: 'l_craft_1', logi: 'l_logi_1', buy: 'l_buy_1', people: 'l_people_1', ops: 'l_ops_1', sys: 'l_sys_1' },
};
/**
 * 研究パネルの RP の値段（仮）。ランク・枝ごとに、根もと（lo）から枝先（hi）へ、先に要るパネルの深さの順に並べて割り振る（平均は (lo + hi) / 2）。
 * Common 20〜80（平均 50）・Uncommon 60〜180（平均 120）・Rare 以降は Uncommon の 2.5 倍ずつ。大きめの研究パネル（以前の ✨）は big。
 * 人材の募集はチュートリアルで最初の 30 RP で開くので 30（START_RP）。
 */
export const RP_PRICE = DIG_BALANCE.rpPrice;
/** 開始時に持っている研究ポイント（マインちゃんの「前の世界の研究ノート」。新しいゲームだけ） */
export const START_RP = 30;
/** 以前のゴールドダスト 1 つ ＝ RP（古いセーブの移し替え・依頼の報酬の置き換え） */
export const RP_PER_DUST = 40;
const RP_FIXED: Record<string, number> = { hire: START_RP };
/** 段 UI5a で足した研究パネルの RP（決め打ち。同じ枝のほかの研究パネルの値段の割り振りに入れない） */
const UI5_RP: Record<string, number> = { relief: 40 };
/** 段 UI5a で足したパネル（スキルツリーの枝の幅の余りの数に入れない：treelayout.ts） */
export const UI5_SKILLS = ['relief'];
{
  const money = new Set([...Object.values(MONEY_PANELS).flatMap((x) => Object.values(x)), DONATE.id, ...SALES_MONEY, ...HR_MONEY, ...ACCT_MONEY, ...GA_MONEY, ...CS_MONEY, ...MKT_MONEY, ...LEGAL_MONEY]);
  const byId = new Map(SKILLS.map((k) => [k.id, k]));
  const tierOf = (k: Skill) => k.tier ?? 'C';
  // 同じランクの中の深さ（先に要るパネルのうち、同じランクのものをたどった最長の数）
  const depth = new Map<string, number>();
  const dep = (k: Skill): number => {
    const hit = depth.get(k.id);
    if (hit != null) return hit;
    depth.set(k.id, 0);
    const inner = (k.requires ?? []).map((r) => byId.get(r)).filter((r): r is Skill => !!r && tierOf(r) === tierOf(k));
    const d = inner.length ? 1 + Math.max(...inner.map(dep)) : 0;
    depth.set(k.id, d);
    return d;
  };
  for (const k of SKILLS) {
    k.cat = money.has(k.id) ? 'money' : 'research';
    k.rp = 0;
  }
  for (const tier of ['C', 'U', 'R', 'E', 'L'] as Tier[]) {
    const P = RP_PRICE[tier];
    const round = (v: number) => Math.max(P.step, Math.round(v / P.step) * P.step);
    for (const b of new Set(SKILLS.map((k) => k.branch))) {
      const list = SKILLS.filter((k) => tierOf(k) === tier && k.branch === b && k.cat === 'research' && !k.big && !k.inf && HR_RP[k.id] == null && ACCT_RP[k.id] == null && CSM_RP[k.id] == null && LEGAL_RP[k.id] == null && DT.rp[k.id] == null && UI5_RP[k.id] == null && POL_RP[k.id] == null).sort((x, y) => dep(x) - dep(y) || x.cost - y.cost);
      list.forEach((k, i) => (k.rp = round(P.lo + ((P.hi - P.lo) * (list.length > 1 ? i : 0)) / Math.max(1, list.length - 1))));
      // 1 枚だけの枝は真ん中の値段
      if (list.length === 1) list[0].rp = round((P.lo + P.hi) / 2);
    }
    for (const k of SKILLS) if (tierOf(k) === tier && k.big) k.rp = P.big;
  }
  for (const [id, v] of Object.entries({ ...RP_FIXED, ...HR_RP, ...ACCT_RP, ...CSM_RP, ...LEGAL_RP, ...DT.rp, ...UI5_RP, ...POL_RP })) if (byId.get(id)) byId.get(id)!.rp = v;
  // 発掘の枝の研究パネルはレベルが無い（開いたときの段は決まっている）ので、「先に要る Lv」（長期の発掘許可＝追加申請 Lv5 など）は外す。持っていればよい
  for (const k of SKILLS)
    if (k.reqLv) {
      for (const r of Object.keys(k.reqLv)) if (byId.get(r)?.branch === 'dig' && byId.get(r)?.cat === 'research') delete k.reqLv[r];
      if (!Object.keys(k.reqLv).length) delete k.reqLv;
    }
  // 無限の強化パネル：Lv1 の値段（Lv2 からは infCost）
  for (const k of INF_SKILLS) k.rp = infCost(1);
  // 研究パネルはレベルなし（効き目は Lv1 の値）：Lv2 からの効き目は持たない
  for (const k of SKILLS)
    if (k.cat === 'research') {
      delete k.up;
      delete k.upShow;
    }
}
/**
 * 段 UI5b：スキルツリーのつながりの見直し（線どうしの交わりを 0 に。treelinks.ts）。値段（RP の深さ）を決めたあとで置き換える。
 * もとの「先に要る」は REQUIRES_ORIG に残す（見直しの探索・テスト用）
 */
export const REQUIRES_ORIG: Record<string, string[]> = Object.fromEntries(SKILLS.map((k) => [k.id, [...(k.requires ?? [])]]));
for (const k of SKILLS) {
  const r = TREE_LINKS[k.id];
  if (!r) continue;
  if (r.length) k.requires = [...r];
  else delete k.requires;
}
/** 研究パネルの値段（RP。お金パネルは 0） */
export const rpCost = (k: Skill) => (isResearch(k) ? (k.rp ?? 0) : 0);

// 解放型のお金パネルの説明に「Lv2〜：…」を足す
for (const k of SKILLS) {
  // 外周のパネルの説明は fx から（「すべてのお店の売り場の強さ +13%・…」）
  if (!k.note && k.fx) k.note = k.fx.map((f) => `${FX_LABEL[f.kind]} ${fmtShown(fxShown(f), f.v)}`).join(t('・', ', '));
  const ups = shownOf(k).up;
  const list = ups.map((x) => `${x.label} ${fmtShown(x, x.v)}`).join(t('・', ', '));
  if (ups.length) k.note += t(`（Lv2〜：${list}）`, ` (Lv2+: ${list})`);
}
export const SKILL: Record<string, Skill> = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
/** 枝（9 本）。docs/ISLAND_PHASE1.md「スキルツリー」：物流が主軸・人材で勝負・システムでハイテク企業・発掘（Lime。出会いのあと） */
export const BRANCHES: { key: Branch; name: string }[] = [
  { key: 'shop', name: t('お店', 'Shops') },
  { key: 'craft', name: t('工房', 'Workshop') },
  { key: 'logi', name: t('物流', 'Logistics') },
  { key: 'buy', name: t('調達', 'Buying') },
  { key: 'people', name: t('人材', 'People') },
  { key: 'ops', name: t('経営', 'Operations') },
  { key: 'sys', name: t('システム', 'Systems') },
  { key: 'tech', name: t('技', 'Crafts') },
  { key: 'dig', name: t('発掘', 'Digging') },
];
// ---------------------------------------------------------------- 部門（ロードマップ段 B。docs/ISLAND_PHASE1.md「部門」）

/** 11 の部門（docs/SUCCESSOR_VISION.md「部門」）。スキルツリーの枝・下の帯のメニューの単位 */
export type DeptId = 'logistics' | 'sales' | 'strategy' | 'rnd' | 'hr' | 'systems' | 'marketing' | 'legal' | 'support' | 'accounting' | 'general';
/** 部門のグループ（メニューが 7 つ以上になったときの引き出し） */
export type DeptGroup = 'biz' | 'strat' | 'admin' | 'base';
/** ロードマップの段（docs/SUCCESSOR_ROADMAP.md「ロードマップ」）。部門の中身（遊び）ができる段 */
export type RoadStage = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
/**
 * いまできている段（段 H2：Epic の町 ②）。中身ができる段がこれ以下の部門だけメニューに出る。
 * 法務（stage 'H'）は段 H1 で部門の演出と紹介、段 H2 で中身（M&A・契約・特許・争い。legal.ts）ができた
 */
export const ROAD_NOW: RoadStage = 'H';
export interface DeptDef {
  id: DeptId;
  name: string;
  /** スマホの下の帯の短い名前 */
  short: string;
  /** 仮のアイコン（絵文字。docs/ISLAND_ART_TODO.md） */
  icon: string;
  color: string;
  group: DeptGroup;
  /** 開くランク（そのランクのセクタに出店すると開く。ロードマップ 8 章の決定：ランクごとに順に） */
  opens: Tier;
  /** 中身（その部門の遊び）ができる段 */
  stage: RoadStage;
  /** 部門の遊びの一言（部門の画面の上の帯・鍵の枝の札） */
  note: string;
}
/** 11 部門（並びはスキルツリーの枝の並び。マーケ → 物流 → … → 経営企画で一周） */
export const DEPTS: DeptDef[] = [
  { id: 'marketing', name: t('マーケティング', 'Marketing'), short: t('マーケ', 'Mktg'), icon: '📣', color: '#ff7fae', group: 'strat', opens: 'C', stage: 'B', note: t('宣伝・市場調査・ブランド', 'Ads, research, brand') },
  { id: 'logistics', name: t('物流', 'Logistics'), short: t('物流', 'Logistics'), icon: '🚚', color: '#7ee08f', group: 'biz', opens: 'C', stage: 'B', note: t('調達 → 製造 → 運搬 → 販売の流れ', 'Buy → craft → haul → sell') },
  { id: 'sales', name: t('営業', 'Sales'), short: t('営業', 'Sales'), icon: '🤝', color: '#f0a35a', group: 'biz', opens: 'R', stage: 'C', note: t('他店との交渉・販路の開拓', 'Deals with rivals, new channels') },
  { id: 'support', name: t('カスタマーサポート', 'Customer Support'), short: 'CS', icon: '🎧', color: '#7fc8ff', group: 'biz', opens: 'U', stage: 'G', note: t('お客さんの問い合わせ・顧客満足度', 'Inquiries and satisfaction') },
  { id: 'systems', name: t('システム', 'Systems'), short: t('システム', 'System'), icon: '⚙', color: '#5fe0d0', group: 'base', opens: 'C', stage: 'B', note: t('業務の効率化・ゲームの設定', 'Efficiency and game settings') },
  { id: 'rnd', name: 'R&D', short: 'R&D', icon: '🔬', color: '#d0945a', group: 'strat', opens: 'C', stage: 'B', note: t('発掘・研究・復刻品', 'Digs, research, revivals') },
  { id: 'legal', name: t('法務', 'Legal'), short: t('法務', 'Legal'), icon: '⚖', color: '#b8b8d8', group: 'admin', opens: 'E', stage: 'H', note: t('契約・特許・争い', 'Contracts, patents, disputes') },
  { id: 'hr', name: t('人事', 'HR'), short: t('人事', 'HR'), icon: '👥', color: '#ff9f5a', group: 'admin', opens: 'C', stage: 'B', note: t('配置・採用・育成', 'Staffing, hiring, growth') },
  { id: 'general', name: t('総務', 'General Affairs'), short: t('総務', 'GA'), icon: '🛋', color: '#e6d36a', group: 'admin', opens: 'U', stage: 'F', note: t('職場の環境・福利厚生', 'Workplace and benefits') },
  { id: 'accounting', name: t('経理', 'Accounting'), short: t('経理', 'Acct'), icon: '🧾', color: '#9fd27a', group: 'admin', opens: 'U', stage: 'F', note: t('決算書・税・節税', 'Statements, tax, savings') },
  { id: 'strategy', name: t('経営企画', 'Strategy'), short: t('経営企画', 'Strategy'), icon: '✦', color: '#c49bff', group: 'strat', opens: 'C', stage: 'B', note: t('全社の方針・スキルツリー', 'Company policy, skill tree') },
];
export const DEPT: Record<DeptId, DeptDef> = Object.fromEntries(DEPTS.map((d) => [d.id, d])) as Record<DeptId, DeptDef>;
export const DEPT_GROUPS: { id: DeptGroup; name: string; icon: string }[] = [
  { id: 'biz', name: t('事業', 'Business'), icon: '🏪' },
  { id: 'strat', name: t('戦略', 'Strategy'), icon: '🧭' },
  { id: 'admin', name: t('管理', 'Admin'), icon: '🗂' },
  { id: 'base', name: t('基盤', 'Base'), icon: '🧱' },
];
/**
 * 理解度の節目（ロードマップ 1-2）。3 チームリーダー・8 事業部長は段 D で置けるようになった（deleg.ts）。奥義は後の段（いまは準備中）
 */
export const DEPT_MARKS: { at: number; name: string }[] = [
  { at: 3, name: t('チームリーダー', 'Team leader') },
  { at: 8, name: t('事業部長', 'Division head') },
  { at: 15, name: t('奥義 1', 'Mastery 1') },
  { at: 25, name: t('奥義 2', 'Mastery 2') },
  { at: 40, name: t('奥義 3', 'Mastery 3') },
];
/** 節目の一言（トースト。「部門を丸ごと任せられる」） */
export const deptMarkNote = (k: number) => [t('業務を 1 つ任せられる', 'delegate one task'), t('部門を丸ごと任せられる', 'delegate the whole department'), t('部門の奥義', 'department mastery'), t('部門の奥義', 'department mastery'), t('部門の奥義', 'department mastery')][k] ?? '';
/**
 * パネルの部門の割り振り（docs/ISLAND_PHASE1.md「部門」の表）。枝（branch）ごとの決まり：
 * 調達・製造・物流・技・販売 → 物流／経営 → 経営企画／人材 → 人事／発掘 → R&D／システム → システム。
 * 例外：販売の枝の宣伝・ブランド・見せ方 → マーケ、経営の枝のブランドのもの → マーケ、人材の枝の職場の環境 → 総務
 */
export const BRANCH_DEPT: Record<Branch, DeptId> = { shop: 'logistics', craft: 'logistics', logi: 'logistics', buy: 'logistics', tech: 'logistics', ops: 'strategy', people: 'hr', dig: 'rnd', sys: 'systems', sales: 'sales', legal: 'legal' };
export const DEPT_MOVE: Record<string, DeptId> = Object.fromEntries([
  ...['vmd', 'pop', 'golden', 'point', 'set', 'd_ops', 'b_sign', 'fair', 'u_shop_2', 'u_shop_5', 'u_shop_6', 'b_ads', 'b_premium', 'r_shop_2', 'r_shop_3', 'r_shop_5', 'r_shop_6', 'r_shop_8', 'e_shop_3', 'e_shop_5', 'e_shop_6', 'e_shop_8', 'e_shop_10', 'l_shop_1', 'l_shop_2', 'l_shop_5', 'l_shop_6', 'l_shop_7', 'l_shop_8', 'l_shop_9'].map((id) => [id, 'marketing']),
  ...['lounge', 'shift', 'welfare', 'u_people_5', 'r_people_5', 'e_people_3', 'e_people_7', 'l_people_3', 'l_people_6', ...GA_SKILLS.map((k) => k.id)].map((id) => [id, 'general']),
  // 段 F：経理のパネル（経営の枝のうち経理）
  ...ACCT_SKILLS.map((k) => [k.id, 'accounting']),
  // 段 G：カスタマーサポートのパネル・マーケの段 G のパネル（販売の枝のうち）
  ...CS_SKILLS.map((k) => [k.id, 'support']),
  ...MKT_SKILLS.map((k) => [k.id, 'marketing']),
  // 段 K：経営方針のパネル
  ...Object.entries(POL_PANEL_DEPT),
]) as Record<string, DeptId>;
for (const k of SKILLS) k.dept = DEPT_MOVE[k.id] ?? BRANCH_DEPT[k.branch];
/** パネルの部門 */
export const deptOf = (k: Skill): DeptId => k.dept ?? BRANCH_DEPT[k.branch];
/** 部門のパネル（並びは SKILLS の順） */
export const DEPT_SKILLS: Record<DeptId, Skill[]> = Object.fromEntries(DEPTS.map((d) => [d.id, SKILLS.filter((k) => deptOf(k) === d.id)])) as Record<DeptId, Skill[]>;

// ---------------------------------------------------------------- 任せ方の 4 段（ロードマップ段 D。docs/ISLAND_PHASE1.md「任せ方」）

/** チームリーダーに任せられる業務（部門ごと。理解度 3 から 1 つずつ） */
export type DutyId = 'order' | 'craft' | 'shelf' | 'swap' | 'rest' | 'dig' | 'ads' | 'vacant' | 'reply' | 'renew';
export interface DutyDef {
  id: DutyId;
  dept: DeptId;
  /** 仮のアイコン（絵文字。docs/ISLAND_ART_TODO.md） */
  icon: string;
  name: string;
  /** 何をしてくれるか（任命の画面） */
  note: string;
  /** 出来の悪さが出る数（月次報告・任命の画面。「素材切れ 2 日」の「素材切れ」） */
  miss: string;
}
export const DUTIES: DutyDef[] = [
  { id: 'order', dept: 'logistics', icon: '📦', name: t('素材の発注', 'Ordering'), note: t('作業台の作るものに合わせて調達の品目をそろえ、素材が切れそうなら問屋に注文する（調達係が休む日の穴も埋める）', 'Keeps buying in step with the benches and orders lots before materials run out (covers the buyer’s rest days too)'), miss: t('素材切れ', 'Out of materials') },
  { id: 'craft', dept: 'logistics', icon: '🔨', name: t('作るものの選択', 'What to craft'), note: t('売れる見込み × 粗利で、作業台ごとに作るものを決め直す', 'Re-picks each bench’s product by expected sales × margin'), miss: t('見込み', 'Plan') },
  { id: 'shelf', dept: 'logistics', icon: '🏷', name: t('品出し（棚の入れ替え）', 'Shelving'), note: t('作っている商品を棚に並べ、作らなくなった商品は売り切ってから入れ替える', 'Shelves what is being made; swaps out dropped items once they sell out'), miss: t('入れ替え待ち', 'Waiting shelf') },
  { id: 'swap', dept: 'hr', icon: '🔁', name: t('配置換え', 'Staffing'), note: t('空いた作業台・お店・運搬・調達に、待機中の人を回す（詰まりの段から）', 'Moves free heroes into empty benches, shops, hauling and buying (the jam first)'), miss: t('空き', 'Vacant') },
  { id: 'rest', dept: 'hr', icon: '😴', name: t('休ませる（交代）', 'Rest & cover'), note: t('休む職人・店員の持ち場に待機中の人を入れて止めない。疲れた待機中の人は休ませる', 'Covers resting crafters and clerks with free heroes; rests tired free heroes'), miss: t('止まった', 'Stopped') },
  { id: 'dig', dept: 'rnd', icon: '⛏', name: t('荒れ地の採掘', 'Wasteland digging'), note: t('発掘作業をしていない日に、許可のある荒れ地を少しずつ掘る（お題は自分で掘る）', 'Digs permitted wastelands a little on days you are not digging (targets are left to you)'), miss: t('掘った', 'Dug') },
  { id: 'ads', dept: 'marketing', icon: '📣', name: t('宣伝の出し直し', 'Ad renewals'), note: t('切れた宣伝を、効き目の見込みが費用より大きければ出し直す', 'Re-runs expired ads when the expected lift beats the cost'), miss: t('切れていた', 'Lapsed') },
  { id: 'vacant', dept: 'sales', icon: '🏚', name: t('空き店舗に入る', 'Take vacancies'), note: t('他社が撤退した空き店舗に、取り分が伸びるなら入る', 'Moves into vacated rival stores when it grows your share'), miss: t('空いたまま', 'Left empty') },
  // 段 G：カスタマーサポート
  { id: 'reply', dept: 'support', icon: '🎧', name: t('問い合わせの返事', 'Answering inquiries'), note: t('届いた問い合わせに、中身に合う返事（謝る・返金・代わりの品）を選んで返す', 'Answers inquiries with the reply that fits (apologize, refund or a substitute)'), miss: t('期限切れ', 'Expired') },
  // 段 H2：法務（Epic の町）
  { id: 'renew', dept: 'legal', icon: '📜', name: t('契約と特許の見直し', 'Contract & patent upkeep'), note: t('仕入れの契約が切れたら結び直し、売れている復刻品の特許が切れそうなら更新する（真似されそうな復刻品は出願する）', 'Re-signs the supply contract when it ends, renews patents on selling revivals before they lapse (and files for revivals about to be copied)'), miss: t('切れていた', 'Lapsed') },
];
export const DUTY: Record<DutyId, DutyDef> = Object.fromEntries(DUTIES.map((d) => [d.id, d])) as Record<DutyId, DutyDef>;
/** 部門の業務（並びは DUTIES の順。業務の無い部門は空＝部長の提案と補正だけ） */
export const DEPT_DUTIES: Record<DeptId, DutyId[]> = Object.fromEntries(DEPTS.map((d) => [d.id, DUTIES.filter((x) => x.dept === d.id).map((x) => x.id)])) as Record<DeptId, DutyId[]>;
/**
 * 任せ方の数字（1 か所。docs/ISLAND_PHASE1.md「任せ方」・docs/SUCCESSOR_ROADMAP.md の段 D）。
 * - leaderAt・headAt：理解度の節目（DEPT_MARKS の 3・8）。
 * - q：出来（0〜1。手でやると 1）＝ lo ＋（hi − lo）×（部門に向く能力値 − aptLo）÷（aptHi − aptLo）（0〜1 に収める）＋ Lv の上乗せ（lv ×（Lv − 1）。lvMax まで）
 *   ＋ その部門のパッシブ 1 つにつき passive（段が上がるごとに +25%）。cap で頭打ち（手を超えるのは奥義＝段 I）。部長の下のリーダーは underHead。
 * - every：業務を見直す間隔（日）。出来 lo で slow 日・cap で fast 日（その間は手を付けない＝出来の悪さが「品切れの日」などで出る）。
 * - headFx：部長の補正＝（出来 − 0.85）× headFx（−3%〜+2%。部門の効き目に掛ける）。
 * - order：発注の量（days 日ぶん × 誤差 ±(1 − 出来) × err）・先回りの日数（ahead）。craftErr・adErr：見込みの誤差の大きさ。
 * - dig：リーダーの採掘の速さ（発掘隊の常駐の 20% と同じ流儀で、作業中の rate 倍 × 出来）。
 * - prop：部長の提案（月に perMonth 枚まで・受け箱は keep 枚まで・保留は expire か月で消える・見込みの誤差 ±(1 − 出来) × err）。
 * - sector：セクター長（need：任命の条件の事業部長の数。ready：条件を効かせるか（いまは表示だけ＝準備中）・invest：提案 1 件で利益の何割を投資へ・max：月に承認する数）。
 */
export const DELEG = {
  leaderAt: 3,
  headAt: 8,
  q: { lo: 0.7, hi: 0.9, aptLo: 20, aptHi: 70, lv: 0.001, lvMax: 0.05, passive: 0.01, cap: 0.97, underHead: 0.03 },
  every: { slow: 8, fast: 1 },
  headFx: 0.2,
  order: { days: 12, ahead: 3, err: 1.5 },
  craftErr: 0.8,
  adErr: 1,
  dig: { rate: 0.15 },
  prop: { perMonth: 2, keep: 4, expire: 3, err: 1 },
  sector: { need: 3, ready: false, invest: 0.1, max: 2 },
};
/**
 * 段 I1：Rare からの「予算で任せる」（budget.ts・budgetui.ts。docs/SUCCESSOR_ROADMAP.md「段 I1 の実装」）。数字はここ 1 か所。
 * - from：会社がこのランクの町に出店したら開く（全部門に理解度に関係なく部長を置け、部長に月の予算を渡せる）。
 * - rate：予算の段（小 S・中 M・大 L）＝ いまの町の先月の売上 × 割合（部門ごと）。floor：会社の格ごとの下限。round：丸め。max：数字で決めるときの上限。
 *   余った予算は会社に戻る（お金を取り分けない。部長が使ってよい上限）。自動プレイ（通常）はどの部門も「中」。
 * - perHead：部長が 1 か月に予算の中で実行する施策の数の上限（見込みの大きい順）。
 * - crew：部門の従業員（ヒーローではない人数の数字）。wage：1 人 1 日の給料（お店の従業員と同じく毎日払う）・labor：1 人の月の労力（人日）・
 *   cap：はじめの上限（プレイヤーが決める）・capMax：上限の上限・idle：労力が 1 人ぶん以上余った月がこの数つづくと、部長が 1 人減らす。
 * - hand：部長自身の手（人日／月）＝ base ＋ star ×（★ − 1）。
 * - eff：予算の効き（同じ施策を安く・少ない労力で）＝ 1 ＋ star ×（★ − 1）＋ 史実の適性（fit）。費用は ÷ 効き、労力も ÷ 効き。
 * - labor：施策（いまの手）ごとの労力（人日）。無い手は def。
 * - ask：予算の使い切り（spent：使った割合）・成果なし（idle：施策を打てない月がこの数つづく）。
 */
// ---------------------------------------------------------------- 段 UI7c：経営方針（社長の価値観。policy.ts・brief.ts）

/** 経営方針の id（段 UI7c の 7 つ＝はじめから選べる全社方針。段 K で POLICIES の全部） */
export type PolicyId = string;
/** 提案書の指標（短期利益・長期利益・士気・顧客満足度・ブランド力・研究ポイント） */
export type ValueKey = 'short' | 'long' | 'morale' | 'sat' | 'brand' | 'rp';
/**
 * 経営方針の重み（1 か所）。提案の「価値」＝ Σ 重み × 指標（お金に直したもの）。価値がプラスなら承認を推奨する。ゲームの数字には効かせない（推奨・並び・言い方・束ね方だけ）。
 * - w：方針ごとの重み。短期利益と長期利益は G のまま、士気・満足度・ブランド・研究は下の unit で G に直してから掛ける。
 * - unit：お金以外の指標 1 つぶんを、何 G とみなすか（月の売上 × 割合。売上が小さい町は floor G を下限に）。士気は全員の目指す値の平均 1 点・満足度は落ち着く先の 1 点・
 *   ブランド力は 12 か月で増える 1。研究ポイントは研究への寄付の初めの値段（DIG_BALANCE.buyRp：100 RP が 20,000 G）で直す。
 * - months：長期利益を見る月数。
 */
export const POLICY = {
  ids: ['balance', 'profit', 'growth', 'brand', 'people', 'customer', 'research'] as PolicyId[],
  w: {
    balance: { short: 0.4, long: 0.6, morale: 0.5, sat: 0.5, brand: 0.5, rp: 0.5 },
    profit: { short: 0.6, long: 0.6, morale: 0, sat: 0, brand: 0, rp: 0 },
    growth: { short: 0.2, long: 1, morale: 0.3, sat: 0.3, brand: 0.5, rp: 0.5 },
    brand: { short: 0.3, long: 0.5, morale: 0.2, sat: 0.7, brand: 2, rp: 0.2 },
    people: { short: 0.3, long: 0.5, morale: 2, sat: 0.3, brand: 0.3, rp: 0.2 },
    customer: { short: 0.3, long: 0.5, morale: 0.3, sat: 2, brand: 0.7, rp: 0.2 },
    research: { short: 0.3, long: 0.5, morale: 0.3, sat: 0.2, brand: 0.3, rp: 2 },
  } as Record<PolicyId, Record<ValueKey, number>>,
  unit: { morale: 0.02, sat: 0.01, brand: 0.004 },
  floor: 5000,
  months: 12,
};

// ---------------------------------------------------------------- 段 K：経営方針（全社方針と事業別の方針。policy.ts・policyui.ts）

/**
 * 経営方針の効き目の種類：汎用の効き目（FxKind。model.ts の fxSum に足す）と、方針だけの 4 つ
 * （morale：士気の目指す値 +点・rp：入る研究ポイント +%・sat：問い合わせへの返事で上がる顧客満足度 +%・labor：部長の施策に使える労力 +%）
 */
export type PolFxKind = FxKind | 'morale' | 'rp' | 'sat' | 'labor';
/** 方針の推す提案の種類（brief.ts の actTheme と同じ言葉。提案の出やすさと並びに効く） */
export type PolTheme = 'sell' | 'store' | 'morale' | 'workplace' | 'people' | 'sat' | 'brand' | 'rp' | 'legal' | 'cost' | 'flow';
/** 開く条件：はじめから・石板（ids をすべて読む）・スキルツリーのパネル（id を取る） */
export type PolOpen = { k: 'start' } | { k: 'tablet'; ids: string[] } | { k: 'panel'; id: string };
export interface PolicyDef {
  id: string;
  /** 全社方針（社長が選ぶ。枠の数まで）か、事業別の方針（部門ごとに 1 つ。部長が発表する） */
  kind: 'corp' | 'dept';
  /** 部門：事業別の方針はその部門。全社方針は、強さを決める部門（その部門のレベルと部長の能力） */
  dept: DeptId;
  /** 仮のアイコン（絵文字。docs/ISLAND_ART_TODO.md） */
  icon: string;
  /** 名前（手法の名前）と、手法の要点（ゲームの言葉で 1〜2 行） */
  name: string;
  note: string;
  /** 効き目（＋だけ。基本の値。強さ ＝ 基本 × 部門のレベル × 部長の能力：policy.ts の polPower） */
  fx: { k: PolFxKind; v: number }[];
  /** 推奨の重み（brief.ts の価値。選んだ方針の重みの平均で推奨を決める） */
  w: Record<ValueKey, number>;
  /** 推す提案の種類（その年の部長・ヒーローの提案の出やすさと並び） */
  themes: PolTheme[];
  open: PolOpen;
  /** 強さを、部長でなくセクター長の能力で決める（ほかの町の売上に効く方針） */
  sector?: boolean;
}
/** 推奨の重みの形（バランスの重みに、大事な指標を 1 つ上乗せ） */
const wOf = (k: ValueKey, v = 1.5): Record<ValueKey, number> => ({ ...{ short: 0.4, long: 0.6, morale: 0.5, sat: 0.5, brand: 0.5, rp: 0.5 }, [k]: v });
const W7 = POLICY.w;
/**
 * 経営方針の一覧（1 か所。docs/ISLAND_PHASE1.md「経営方針（段 K）」の表）。全社 14（はじめから 7・石板 Common 7）・事業別 23（部門ごとに 2〜3。
 * スキルツリーの「経営方針」パネル 10・石板 13：Common 1 枚・Uncommon・Rare・Epic は同じ町の 2 枚で 1 つ）。32 枚の石板はどれも、どれかの方針を開く。
 * 実在の企業・人の名前は書かない（手法の名前だけ）
 */
export const POLICIES: PolicyDef[] = [
  // ---- 全社方針：はじめから（段 UI7c の 7 つの価値観）
  { id: 'balance', kind: 'corp', dept: 'strategy', icon: '⚖', name: t('バランス', 'Balanced'), note: t('バランスト・スコアカード：お金・お客様・仕事の流れ・人の育ちの 4 つを、ほどよく見る', 'Balanced scorecard: weigh money, customers, workflow and growth evenly'), fx: [{ k: 'upkeep', v: 0.03 }], w: W7.balance, themes: [], open: { k: 'start' } },
  { id: 'profit', kind: 'corp', dept: 'accounting', icon: '💰', name: t('利益重視', 'Profit first'), note: t('コスト・リーダーシップ：むだな費用を削り、お金になる提案だけを通す', 'Cost leadership: cut waste and approve what makes money'), fx: [{ k: 'matPrice', v: 0.045 }], w: W7.profit, themes: ['cost', 'store'], open: { k: 'start' } },
  { id: 'growth', kind: 'corp', dept: 'strategy', icon: '📈', name: t('成長重視（長期）', 'Growth (long term)'), note: t('成長戦略：目先が赤字でも、1 年で取り戻せる投資を先に打つ', 'Growth strategy: invest now if it pays back within a year'), fx: [{ k: 'demand', v: 0.03 }], w: W7.growth, themes: ['sell', 'people'], open: { k: 'start' } },
  { id: 'brand', kind: 'corp', dept: 'marketing', icon: '★', name: t('ブランド重視', 'Brand first'), note: t('ブランド・エクイティ：名前そのものを会社の財産として育てる', 'Brand equity: grow the name itself as a company asset'), fx: [{ k: 'brand', v: 1.5 }], w: W7.brand, themes: ['brand'], open: { k: 'start' } },
  { id: 'people', kind: 'corp', dept: 'hr', icon: '😊', name: t('人を大事に（士気）', 'People first (morale)'), note: t('人的資本経営：働く人を費用でなく資本とみて、士気と育ちに投資する', 'Human-capital management: treat staff as capital, invest in morale and growth'), fx: [{ k: 'morale', v: 3 }], w: W7.people, themes: ['morale', 'workplace'], open: { k: 'start' } },
  { id: 'customer', kind: 'corp', dept: 'support', icon: '🤝', name: t('お客様第一（満足度）', 'Customers first'), note: t('顧客満足経営：お客様の満足を、いちばんの物差しにする', 'Customer-satisfaction management: make satisfaction the main yardstick'), fx: [{ k: 'pull', v: 0.0225 }], w: W7.customer, themes: ['sat', 'sell'], open: { k: 'start' } },
  { id: 'research', kind: 'corp', dept: 'rnd', icon: '🔬', name: t('研究重視', 'Research first'), note: t('研究開発型経営：研究に投じて、他社にない技で勝つ', 'R&D-led management: invest in research to win with unique skills'), fx: [{ k: 'rp', v: 0.09 }], w: W7.research, themes: ['rp'], open: { k: 'start' } },
  // ---- 全社方針：Common の石板
  { id: 'empower', kind: 'corp', dept: 'hr', icon: '🙌', name: t('権限委譲', 'Empowerment'), note: t('現場に決める力を渡し、任された人が自分で考えて速く動く', 'Hand decisions to the front line so people think and act fast'), fx: [{ k: 'apt', v: 1.5 }], w: { short: 0.4, long: 0.6, morale: 1, sat: 0.4, brand: 0.3, rp: 0.3 }, themes: ['people', 'morale'], open: { k: 'tablet', ids: ['tab_c1'] } },
  { id: 'focus', kind: 'corp', dept: 'logistics', icon: '🎯', name: t('選択と集中', 'Focus'), note: t('強い商品と得意な仕事に、人とお金を集める', 'Pour people and money into your strongest goods and skills'), fx: [{ k: 'price', v: 0.0225 }], w: { short: 0.6, long: 0.5, morale: 0.2, sat: 0.2, brand: 0.4, rp: 0.2 }, themes: ['sell'], open: { k: 'tablet', ids: ['tab_c3'] } },
  { id: 'purpose', kind: 'corp', dept: 'hr', icon: '🌱', name: t('パーパス経営', 'Purpose-driven'), note: t('会社が何のためにあるかを言葉にして、全員で分かち合う', 'Put the company’s reason to exist into words everyone shares'), fx: [{ k: 'morale', v: 2.25 }], w: { short: 0.3, long: 0.5, morale: 1.2, sat: 0.6, brand: 0.8, rp: 0.3 }, themes: ['morale', 'brand'], open: { k: 'tablet', ids: ['tab_c4'] } },
  { id: 'okr', kind: 'corp', dept: 'strategy', icon: '🏁', name: 'OKR', note: t('大きな目標 1 つと、測れる主要な成果を決め、四半期ごとに見直す', 'Set one bold objective with measurable key results; review each quarter'), fx: [{ k: 'labor', v: 0.12 }], w: { short: 0.5, long: 0.6, morale: 0.3, sat: 0.3, brand: 0.3, rp: 0.3 }, themes: ['flow'], open: { k: 'tablet', ids: ['tab_c5'] } },
  { id: 'esg', kind: 'corp', dept: 'general', icon: '🌳', name: t('サステナビリティ経営', 'Sustainability'), note: t('環境と社会に配慮し、むだを出さずに長く続ける', 'Care for people and the environment; waste less and last longer'), fx: [{ k: 'upkeep', v: 0.06 }], w: { short: 0.3, long: 0.7, morale: 0.5, sat: 0.5, brand: 1.2, rp: 0.3 }, themes: ['brand', 'workplace'], open: { k: 'tablet', ids: ['tab_c6'] } },
  { id: 'leanStartup', kind: 'corp', dept: 'marketing', icon: '🧪', name: t('リーン・スタートアップ', 'Lean startup'), note: t('新しい品は小さく出して、売れ方を見て直し、また出す', 'Launch small, learn from sales, fix and launch again'), fx: [{ k: 'known', v: 0.12 }], w: { short: 0.4, long: 0.8, morale: 0.3, sat: 0.6, brand: 0.3, rp: 0.6 }, themes: ['sell', 'rp'], open: { k: 'tablet', ids: ['tab_c7'] } },
  { id: 'ambidex', kind: 'corp', dept: 'rnd', icon: '🤹', name: t('両利きの経営', 'Ambidexterity'), note: t('いまの事業を深めつつ、まだ無い事業を探る。片方だけにしない', 'Deepen today’s business while exploring tomorrow’s — never just one'), fx: [{ k: 'demand', v: 0.015 }, { k: 'rp', v: 0.045 }], w: { short: 0.3, long: 0.7, morale: 0.3, sat: 0.3, brand: 0.4, rp: 1.2 }, themes: ['rp', 'sell'], open: { k: 'tablet', ids: ['tab_c8'] } },
  // ---- 事業別：マーケティング
  { id: 'stp', kind: 'dept', dept: 'marketing', icon: '🎯', name: t('STP マーケティング', 'STP marketing'), note: t('お客さんを分け、狙う相手を決め、他社とちがう立ち位置で届ける', 'Segment customers, pick a target, and position apart from rivals'), fx: [{ k: 'ads', v: 0.09 }], w: wOf('brand'), themes: ['sell', 'brand'], open: { k: 'panel', id: 'pol_mk' } },
  { id: 'blueOcean', kind: 'dept', dept: 'marketing', icon: '🌊', name: t('ブルー・オーシャン戦略', 'Blue ocean strategy'), note: t('他社と奪い合う市場を避け、まだ競う相手のいない市場をつくる', 'Skip the crowded market and create one with no rivals yet'), fx: [{ k: 'rally', v: 0.12 }], w: wOf('brand'), themes: ['brand', 'sell'], open: { k: 'tablet', ids: ['tab_u1a', 'tab_u1b'] } },
  // ---- 事業別：物流
  { id: 'tqm', kind: 'dept', dept: 'logistics', icon: '🔧', name: t('TQM（総合的品質管理）', 'TQM'), note: t('全員で品質を見張り、小さな直しを毎日つみ重ねる', 'Everyone guards quality and stacks small fixes every day'), fx: [{ k: 'craftDays', v: 0.045 }], w: wOf('short', 0.8), themes: ['flow'], open: { k: 'panel', id: 'pol_lg' } },
  { id: 'jit', kind: 'dept', dept: 'logistics', icon: '⏱', name: t('ジャスト・イン・タイム', 'Just in time'), note: t('要るものを、要る時に、要るだけ。待ち時間と置き場所のむだを消す', 'What’s needed, when needed, as much as needed — no waiting, no piles'), fx: [{ k: 'buyDays', v: 0.06 }], w: wOf('short', 0.8), themes: ['store', 'flow'], open: { k: 'tablet', ids: ['tab_c2'] } },
  { id: 'lean', kind: 'dept', dept: 'logistics', icon: '📉', name: t('リーン生産', 'Lean production'), note: t('運ぶ・待つ・積み直すを「むだ」として数え、1 つずつ消す', 'Count hauling, waiting and re-stacking as waste and remove it one by one'), fx: [{ k: 'haulDays', v: 0.06 }], w: wOf('short', 0.8), themes: ['flow', 'store'], open: { k: 'tablet', ids: ['tab_u2a', 'tab_u2b'] } },
  // ---- 事業別：システム
  { id: 'agile', kind: 'dept', dept: 'systems', icon: '🔁', name: t('アジャイル開発', 'Agile development'), note: t('小さく作って、すぐ使ってもらい、短い周期で直していく', 'Build small, ship fast, improve in short cycles'), fx: [{ k: 'flow', v: 0.0225 }], w: wOf('long', 1), themes: ['flow'], open: { k: 'panel', id: 'pol_sy' } },
  { id: 'dx', kind: 'dept', dept: 'systems', icon: '💻', name: t('DX（デジタル・トランスフォーメーション）', 'Digital transformation'), note: t('帳簿と仕事の流れをデジタルでそろえ、仕組みごと変える', 'Unify records and workflows digitally and change how work is done'), fx: [{ k: 'procCap', v: 0.075 }], w: wOf('long', 1), themes: ['flow', 'store'], open: { k: 'tablet', ids: ['tab_u3a', 'tab_u3b'] } },
  // ---- 事業別：R&D
  { id: 'openInnov', kind: 'dept', dept: 'rnd', icon: '🔓', name: t('オープン・イノベーション', 'Open innovation'), note: t('社内だけで抱えず、外の知恵と組んで研究を速める', 'Team up with outside know-how instead of researching alone'), fx: [{ k: 'rp', v: 0.09 }], w: wOf('rp'), themes: ['rp'], open: { k: 'panel', id: 'pol_rd' } },
  { id: 'stageGate', kind: 'dept', dept: 'rnd', icon: '🚪', name: t('ステージゲート法', 'Stage-gate'), note: t('研究を段に分け、門ごとに続けるか止めるかを決める', 'Split research into stages and decide go or stop at each gate'), fx: [{ k: 'dig.mat', v: 0.09 }], w: wOf('rp'), themes: ['rp'], open: { k: 'tablet', ids: ['tab_u5a', 'tab_u5b'] } },
  { id: 'designThinking', kind: 'dept', dept: 'rnd', icon: '💡', name: t('デザイン思考', 'Design thinking'), note: t('使う人の暮らしを見て、困りごとから品を考える', 'Watch how people live and design from their problems'), fx: [{ k: 'known', v: 0.09 }], w: wOf('rp'), themes: ['rp', 'sat'], open: { k: 'tablet', ids: ['tab_e2a', 'tab_e2b'] } },
  // ---- 事業別：人事
  { id: 'teal', kind: 'dept', dept: 'hr', icon: '🍃', name: t('ティール組織', 'Teal organization'), note: t('上からの指示でなく、一人ひとりが目的に沿って自分で決める', 'People decide for themselves by the purpose, not by orders from above'), fx: [{ k: 'morale', v: 3 }], w: wOf('morale'), themes: ['morale'], open: { k: 'panel', id: 'pol_hr' } },
  { id: 'oneOnOne', kind: 'dept', dept: 'hr', icon: '💬', name: t('1on1 ミーティング', 'One-on-ones'), note: t('上司と部下が 1 人ずつ短く話し、悩みを小さいうちに聞く', 'Short one-to-one talks catch worries while they’re small'), fx: [{ k: 'morale', v: 2.25 }], w: wOf('morale'), themes: ['morale'], open: { k: 'tablet', ids: ['tab_u4a', 'tab_u4b'] } },
  { id: 'jobBased', kind: 'dept', dept: 'hr', icon: '📋', name: t('ジョブ型雇用', 'Job-based employment'), note: t('仕事ごとに要る技を書き出し、合う人をその役に置く', 'Write down the skills each job needs and put the right person in it'), fx: [{ k: 'apt', v: 1.5 }], w: wOf('morale'), themes: ['people'], open: { k: 'tablet', ids: ['tab_r4a', 'tab_r4b'] } },
  // ---- 事業別：総務
  { id: 'wellbeing', kind: 'dept', dept: 'general', icon: '🧘', name: t('ウェルビーイング経営', 'Well-being management'), note: t('働く人の心と体の調子を整えることを、会社の仕事にする', 'Make the health of body and mind part of the company’s job'), fx: [{ k: 'stamina', v: 0.06 }], w: wOf('morale'), themes: ['workplace'], open: { k: 'panel', id: 'pol_ga' } },
  { id: 'workLife', kind: 'dept', dept: 'general', icon: '🌙', name: t('ワーク・ライフ・バランス', 'Work-life balance'), note: t('働く日と休む日を決めて守る。よく休んだ人ほど、よく働く', 'Set and keep work and rest days — the well-rested work best'), fx: [{ k: 'rest', v: 0.09 }], w: wOf('morale'), themes: ['workplace'], open: { k: 'tablet', ids: ['tab_r3a', 'tab_r3b'] } },
  // ---- 事業別：カスタマーサポート
  { id: 'custSuccess', kind: 'dept', dept: 'support', icon: '🏆', name: t('カスタマーサクセス', 'Customer success'), note: t('問い合わせを待つだけでなく、お客様がうまく使えるよう先に動く', 'Don’t just wait for questions — help customers succeed first'), fx: [{ k: 'sat', v: 0.225 }], w: wOf('sat'), themes: ['sat'], open: { k: 'panel', id: 'pol_cs' } },
  { id: 'serviceProfit', kind: 'dept', dept: 'support', icon: '🔗', name: t('サービス・プロフィット・チェーン', 'Service-profit chain'), note: t('働く人が満ちれば、お客様が満ち、売上が続く。そのつながりを育てる', 'Happy staff make happy customers, and lasting sales — grow that chain'), fx: [{ k: 'pull', v: 0.015 }], w: wOf('sat'), themes: ['sat', 'morale'], open: { k: 'tablet', ids: ['tab_r2a', 'tab_r2b'] } },
  // ---- 事業別：経理
  { id: 'zeroBased', kind: 'dept', dept: 'accounting', icon: '0️⃣', name: t('ゼロベース予算', 'Zero-based budgeting'), note: t('去年の額を引き継がず、毎年ゼロから要る費用だけを積む', 'Don’t roll last year over — rebuild every cost from zero each year'), fx: [{ k: 'upkeep', v: 0.06 }], w: wOf('short', 0.8), themes: ['cost'], open: { k: 'panel', id: 'pol_ac' } },
  { id: 'abc', kind: 'dept', dept: 'accounting', icon: '🧮', name: t('活動基準原価計算（ABC）', 'Activity-based costing'), note: t('仕事ごとの手間を数え、本当に高くついている所を見つける', 'Count the effort of each activity to find what truly costs the most'), fx: [{ k: 'matPrice', v: 0.03 }], w: wOf('short', 0.8), themes: ['cost'], open: { k: 'tablet', ids: ['tab_e3a', 'tab_e3b'] } },
  // ---- 事業別：営業
  { id: 'solution', kind: 'dept', dept: 'sales', icon: '🧩', name: t('ソリューション営業', 'Solution selling'), note: t('品を売る前に、お客さんの困りごとを聞き、解き方として売る', 'Hear the customer’s problem first, then sell the answer to it'), fx: [{ k: 'price', v: 0.015 }], w: wOf('long', 1), themes: ['sell'], open: { k: 'tablet', ids: ['tab_r1a', 'tab_r1b'] } },
  { id: 'insideSales', kind: 'dept', dept: 'sales', icon: '📡', name: t('インサイド・セールス', 'Inside sales'), note: t('会いに行けない遠くのお客さんと、離れたまま話して注文を取る', 'Win orders from faraway customers without visiting them'), fx: [{ k: 'manager', v: 0.06 }], w: wOf('long', 1), themes: ['sell'], open: { k: 'panel', id: 'pol_sa' }, sector: true },
  // ---- 事業別：法務
  { id: 'compliance', kind: 'dept', dept: 'legal', icon: '🛡', name: t('コンプライアンス経営', 'Compliance management'), note: t('決まりを守ることを強みにし、信頼される会社になる', 'Make following the rules a strength and earn trust'), fx: [{ k: 'brand', v: 1.5 }], w: wOf('brand'), themes: ['legal'], open: { k: 'panel', id: 'pol_le' } },
  { id: 'ipStrategy', kind: 'dept', dept: 'legal', icon: '📜', name: t('知財戦略', 'IP strategy'), note: t('考えた工夫を権利として守り、事業の武器にする', 'Protect ideas as rights and turn them into business weapons'), fx: [{ k: 'price', v: 0.015 }], w: wOf('brand'), themes: ['legal'], open: { k: 'tablet', ids: ['tab_e1a', 'tab_e1b'] } },
];
export const POLICY_OF: Record<string, PolicyDef> = Object.fromEntries(POLICIES.map((p) => [p.id, p]));

// ---------------------------------------------------------------- 段 K3：方針の副次効果（policy.ts の polFx・polMorale・polEvW・tiltOf。画面は policycardsui.ts）

/** できごとの種類（events.ts の EvKind と同じ言葉。tests/island-p1-stagek3.test.ts で同じか確かめる） */
export type PolEvKind = 'heat' | 'festival' | 'tourists' | 'trend' | 'wholesale' | 'idea' | 'traveler' | 'celebrity' | 'bigorder' | 'sponsor' | 'rain' | 'matrise' | 'breakdown' | 'rumor' | 'rivalsale' | 'scout' | 'complaint' | 'defect' | 'roadwork' | 'tired';
/**
 * 副次効果（主要な効き目のほかに、その方針を選ぶと起きること。＋も−もある）。強さ（部門のレベル × 部長の能力）は掛けない（いつも同じ値）。
 * - mo：その部門の人（部長・リーダー・持ち場の人。duo.ts の deptOfStaff）の士気の目指す値 ±v 点（hr.ts の moraleParts の pol）
 * - fx：汎用の効き目（model.ts の fxSum に足す。− は逆向き：維持費 −2% の逆は +2%）
 * - less：その種類の提案が減る・並びの下に（× (1 − POL.less)。tiltOf）。増えるほうは方針の themes（× (1 + POL.tilt)）
 * - ev：できごとの起きやすさ ×(1 + v)（良いできごと・困りごとの中で、その種類が選ばれる重み。events.ts の eventDue）
 */
export type PolSide = { k: 'mo'; d: DeptId; v: number } | { k: 'fx'; fx: PolFxKind; v: number } | { k: 'less'; th: PolTheme } | { k: 'ev'; ev: PolEvKind; v: number };
const mo = (d: DeptId, v: number): PolSide => ({ k: 'mo', d, v });
const sfx = (fx: PolFxKind, v: number): PolSide => ({ k: 'fx', fx, v });
const less = (th: PolTheme): PolSide => ({ k: 'less', th });
const ev = (e: PolEvKind, v: number): PolSide => ({ k: 'ev', ev: e, v });
/**
 * 方針ごとの副次効果と「この方針が向いている時期」（1 か所。docs/ISLAND_PHASE1.md「段 K3」の表）。
 * どの方針も、＋と−を 1 つ以上ずつ（現実らしい引き換え）。数は themes（提案が増える）と合わせて 3〜6
 */
export const POL_SIDES: Record<string, { side: PolSide[]; when: string }> = {
  // ---- 全社方針
  balance: { side: [mo('strategy', 2), mo('accounting', 2), ev('tired', -0.3), mo('marketing', -1)], when: t('まだ会社の形が決まらず、どこも少しずつ伸ばしたいとき', 'When the company is still finding its shape and everything needs a little growth') },
  profit: { side: [mo('accounting', 3), mo('hr', -2), less('workplace'), ev('scout', 0.3)], when: t('売上はあるのに、お金が手元に残らないとき', 'When sales come in but the money doesn’t stay') },
  growth: { side: [mo('marketing', 3), mo('accounting', -2), sfx('upkeep', -0.02), ev('tired', 0.3)], when: t('Common の町で、まず売上を伸ばしたいとき', 'In a Common town, when you want sales to grow first') },
  brand: { side: [mo('marketing', 3), ev('celebrity', 0.6), sfx('matPrice', -0.02), less('cost')], when: t('名前が知られる前に、上のランクの町へ進みたいとき', 'Before moving up to a higher-rank town, while your name is still unknown') },
  people: { side: [mo('hr', 3), sfx('wage', -0.03), less('cost'), ev('scout', -0.5)], when: t('辞めたい人が出はじめた・士気が下がってきたとき', 'When people start wanting to quit or morale is sagging') },
  customer: { side: [mo('support', 3), ev('complaint', -0.5), mo('logistics', -1)], when: t('問い合わせが増え、満足度が落ちてきたとき', 'When inquiries pile up and satisfaction is slipping') },
  research: { side: [mo('rnd', 3), ev('idea', 0.6), less('sell'), mo('sales', -2)], when: t('発掘と研究で、他社にない品を出したいとき', 'When you want digs and research to bring unique goods') },
  empower: { side: [mo('logistics', 2), mo('strategy', -2), ev('defect', 0.3)], when: t('部長とリーダーがそろい、任せて速く回したいとき', 'When heads and leaders are in place and you want speed') },
  focus: { side: [mo('sales', 2), less('rp'), less('workplace'), sfx('known', -0.04)], when: t('売れる商品がはっきりしていて、そこに集めたいとき', 'When your best sellers are clear and you want to back them') },
  purpose: { side: [mo('hr', 2), ev('sponsor', 0.5), ev('bigorder', -0.3)], when: t('人が増えて、会社の向きをそろえたいとき', 'When the team has grown and needs one direction') },
  okr: { side: [mo('strategy', 3), ev('tired', 0.4), less('workplace')], when: t('部長が動きはじめ、四半期ごとに成果を見たいとき', 'When heads are running and you want results each quarter') },
  esg: { side: [mo('general', 3), sfx('matPrice', -0.02), ev('complaint', -0.5)], when: t('町が増え、建物の維持費が重くなってきたとき', 'When towns multiply and upkeep weighs heavy') },
  leanStartup: { side: [mo('marketing', 2), ev('trend', 0.5), ev('defect', 0.3)], when: t('新しい商品をいくつも試したいとき', 'When you want to try many new goods') },
  ambidex: { side: [mo('rnd', 2), mo('strategy', 2), sfx('labor', -0.04)], when: t('いまの商売が回り、次の柱も探したいとき', 'When today’s business runs and you want the next pillar') },
  // ---- 事業別：マーケティング
  stp: { side: [mo('marketing', 3), ev('trend', 0.4), less('store')], when: t('宣伝にお金をかけていて、効き目を上げたいとき', 'When you spend on ads and want them to hit harder') },
  blueOcean: { side: [mo('marketing', 2), ev('rivalsale', -0.5), sfx('known', -0.03)], when: t('他社の反撃が強く、1 位を守るのがつらいとき', 'When rivals hit back hard and holding #1 is tough') },
  // ---- 事業別：物流
  tqm: { side: [mo('logistics', 2), ev('defect', -0.6), less('sell')], when: t('作る数が増え、品質のむらが気になるとき', 'When output grows and quality gets uneven') },
  jit: { side: [mo('logistics', 1), sfx('upkeep', 0.02), ev('matrise', 0.4)], when: t('調達に日数がかかり、倉庫が素材であふれるとき', 'When buying is slow and the warehouse overflows with materials') },
  lean: { side: [mo('accounting', 2), ev('breakdown', -0.4), mo('logistics', -1)], when: t('運ぶ距離が長く、荷車が足りないとき', 'When hauls are long and carts run short') },
  // ---- 事業別：システム
  agile: { side: [mo('systems', 3), ev('idea', 0.3), ev('defect', 0.3)], when: t('流れのどこかが詰まり、少しずつ直したいとき', 'When the flow jams somewhere and you want to fix it bit by bit') },
  dx: { side: [mo('systems', 2), mo('accounting', 2), mo('general', -1)], when: t('調達の上限に当たり、帳簿をそろえたいとき', 'When you hit the buying limit and want unified records') },
  // ---- 事業別：R&D
  openInnov: { side: [mo('rnd', 2), ev('traveler', 0.5), ev('scout', 0.3)], when: t('研究ポイントが足りず、パネルが開けないとき', 'When research points run short for panels') },
  stageGate: { side: [mo('rnd', 1), mo('accounting', 2), ev('idea', -0.3)], when: t('発掘の素材を、むだなく研究に回したいとき', 'When you want dug materials to feed research without waste') },
  designThinking: { side: [mo('support', 2), ev('trend', 0.4), sfx('labor', -0.02)], when: t('新しい商品が、なかなか知られないとき', 'When new goods are slow to get noticed') },
  // ---- 事業別：人事
  teal: { side: [mo('hr', 3), mo('logistics', 2), sfx('labor', -0.04), ev('scout', -0.4)], when: t('現場の士気を上げ、自分で動く人を増やしたいとき', 'When you want higher morale and more self-starters') },
  oneOnOne: { side: [mo('hr', 2), ev('tired', -0.4), sfx('labor', -0.02)], when: t('疲れた人・辞めたい人が出はじめたとき', 'When people start getting worn out or wanting to quit') },
  jobBased: { side: [mo('hr', 1), mo('general', -1), ev('scout', 0.3)], when: t('人が増え、適材適所にしたいとき', 'When the team is big enough to put the right person in each role') },
  // ---- 事業別：総務
  wellbeing: { side: [mo('general', 3), ev('tired', -0.5), sfx('wage', -0.02)], when: t('働く人のスタミナが続かないとき', 'When staff run out of stamina') },
  workLife: { side: [mo('general', 2), mo('logistics', 1), sfx('labor', -0.03)], when: t('休みのあとの戻りが遅いとき', 'When people come back slowly from rest') },
  // ---- 事業別：カスタマーサポート
  custSuccess: { side: [mo('support', 3), ev('complaint', -0.4), sfx('labor', -0.02)], when: t('満足度を上げて、お客さんに戻ってきてほしいとき', 'When you want higher satisfaction and repeat customers') },
  serviceProfit: { side: [mo('support', 2), mo('logistics', 1), sfx('wage', -0.02)], when: t('お店の人とお客さんの両方を大事にしたいとき', 'When you want to look after both staff and customers') },
  // ---- 事業別：経理
  zeroBased: { side: [mo('accounting', 2), mo('marketing', -2), less('sell')], when: t('建物が増え、維持費が利益を食うとき', 'When buildings multiply and upkeep eats profit') },
  abc: { side: [mo('accounting', 2), mo('logistics', -1), less('workplace')], when: t('素材の仕入れが、いちばんの費用になったとき', 'When materials have become your biggest cost') },
  // ---- 事業別：営業
  solution: { side: [mo('sales', 3), ev('bigorder', 0.5), sfx('labor', -0.02)], when: t('値段を上げても売れる、強い品があるとき', 'When you have strong goods that sell even at higher prices') },
  insideSales: { side: [mo('sales', 2), ev('bigorder', 0.3), mo('logistics', -1)], when: t('任せた町が増え、離れた町の売上を伸ばしたいとき', 'When you manage many towns and want remote sales to grow') },
  // ---- 事業別：法務
  compliance: { side: [mo('legal', 3), ev('rumor', -0.5), sfx('labor', -0.02)], when: t('悪いうわさ・争いで、ブランドが揺れたとき', 'When rumors or disputes shake your brand') },
  ipStrategy: { side: [mo('legal', 2), mo('rnd', 2), ev('rivalsale', -0.3), sfx('labor', -0.02)], when: t('研究の成果を、他社にまねされたくないとき', 'When you don’t want rivals copying your research') },
};
/**
 * 経営方針の数字（1 か所）。強さ ＝ 基本 ×（1 ＋ lv × 部門の理解度（lvCap まで））×（部長の能力：1 ＋ head × 出来の帯（0〜1）。部長がいなければ 1）。
 * 出来の帯は、部長は (出来 − 0.7) ÷ 0.27、セクター長は (出来 − 0.5) ÷ 0.45（0〜1 に収める）。
 * - slots：全社方針の枠（はじめ。経営企画の「全社方針の枠」パネルの Lv ごとに +1、max まで）。
 * - tilt：方針の推す種類の提案の、出やすさ・並びの重み（× (1 + tilt)）。
 */
/**
 * 経営方針の数字（policy.ts）。lv・lvCap：部門のレベルの効き・head：部長の能力の効き・slots：全社方針のはじめの枠・max：枠の上限・tilt：提案の傾向。
 * 段 K2：grant＝全社方針の枠が 1 つ増える特別なパネル（無償）が取れるようになる、会社として初めて進出したランク（U で 2 枠・R で 3・E で 4・L で 5）。
 * 効き目の基本の値（POLICIES の fx）は段 K2 で一律 1.5 倍にした。
 * 段 K3：less＝副次効果の「提案が減る」の重み（× (1 − less)）・evMin＝できごとの起きやすさの下限（×0.1）
 */
export const POL = { lv: 0.02, lvCap: 20, head: 0.35, slots: 1, max: 5, tilt: 0.25, less: 0.2, evMin: 0.1, grant: ['U', 'R', 'E', 'L'] as Tier[] };

export const BUDGET = {
  from: 'R' as Tier,
  rate: { S: 0.02, M: 0.05, L: 0.1 } as Record<'S' | 'M' | 'L', number>,
  floor: { C: 20_000, U: 20_000, R: 20_000, E: 50_000, L: 80_000 } as Record<Tier, number>,
  round: 1000,
  max: 9_999_000,
  perHead: 2,
  crew: { wage: 100, labor: 20, cap: 2, capMax: 20, idle: 2 },
  hand: { base: 8, star: 4 },
  eff: { star: 0.04, fit: { S: 0.04, A: 0.02, B: 0.01, C: 0, D: -0.02 } as Record<'S' | 'A' | 'B' | 'C' | 'D', number> },
  labor: { invest: 4, build: 12, skill: 6, level: 4, hire: 3, permit: 6, ad: 3, vacant: 10, patent: 8, ma: 15, stock: 4, part: 2, famous: 3, assign: 1, order: 2, staff: 2 } as Record<string, number>,
  laborDef: 4,
  ask: { spent: 0.95, idle: 2 },
};
/**
 * 段 I2：経営会議と社内監査（board.ts・boardui.ts。docs/SUCCESSOR_ROADMAP.md「段 I2 の実装」）。数字はここの 1 か所。
 * - 会社の四半期の締め（経理の決算とそろえる）に、部長のいる部門とセクター長が順に「予実の報告 → 来期の計画 → 必要予算」を話す。
 * - plan：計画の目標の上乗せ（承認・+10%・+20%）。budget：予算の増額・減額の幅（承認・+20%・−20%）。
 * - share：来期の計画の見込み＝いまの見込みの大きい施策（月 BUDGET.perHead 件）× 3 か月 × share（月ごとに打てる手が減るぶん）。
 * - findG：出土品 1 個を、施策の成果の G に直すときの値（計画と実績の単位をそろえる）。
 * - pad：報告の盛りの大きさ。盛り ＝ (1 − 出来) × pad × (0.4〜1)（部長の提案の見込みの誤差 Proposal.err ＝ (1 − 出来) × DELEG.prop.err と同じ考え）。
 * - push：目標を上げたときの押し上げ。労力 ×(1 + 上乗せ × labor)・上乗せが move 以上なら月の施策 +1・セクター長は売上の倍率 + 上乗せ × sector。
 * - morale：士気の目標の 1 項目「目標の重さ」（hr.ts の moraleParts の goal。二重に数えない）。上乗せ 10% ごとに −per10・予算も上げれば × eased・
 *   予算を削ると 10% ごとに −cut・予算だけ上げると 10% ごとに +up（upMax まで）。期末に上げた目標に届けば +hit・届かなければ miss（その場で）。
 * - audit：社内監査は経理部長が持つ。経理部長の ★ で、見抜ける盛りの下限（★1 15%・★2 8%・★3 3%）。
 * - heroAt：その他の要求「部長のいない部門にヒーローを」を推奨する理解度（自動プレイの部長の置き方と同じ節目）。
 * - lever（段 I2b：部長の「来期の打ち手」。boardplan.ts）：few＝施策がこの件数より少ない四半期は原因を出す・evals＝1 部門で見込みをはかるパネルの数の上限・
 *   minUnits＝打ち手に数える効き目（個／月）・later＝次の詰まりへの備えの重み（いまの詰まりに効く手 1 に対して）・
 *   cash＝パネルの決裁を推奨する資金の上限（給料・維持費の取り置きを除いた資金の割合）・rp＝研究パネルを推奨する RP の上限（持っている RP の割合）・
 *   slackUp＝増額の要求を推奨する上限（会社の余力の割合）・pad＝攻めの部長が要る予算に乗せる余裕・crew＝人手の打ち手（従業員の上限を上げる）を推奨する給料の上限（月の予算の割合）。
 */
export const BOARD = {
  plan: [0, 0.1, 0.2],
  budget: 0.2,
  months: 3,
  share: 0.6,
  findG: 400,
  pad: 1,
  push: { labor: 1, move: 0.2, sector: 0.5 },
  morale: { per10: 5, eased: 0.4, cut: 3, up: 2, upMax: 4, hit: 4, miss: -3 },
  audit: { see: { 1: 0.15, 2: 0.08, 3: 0.03 } as Record<1 | 2 | 3, number> },
  heroAt: 8,
  lever: { few: 2, evals: 10, minUnits: 0.5, later: 0.35, cash: 0.25, rp: 0.6, slackUp: 0.5, pad: 0.15, crew: 0.6 },
};
/**
 * 提案・報告のカード（段 UI1。card.ts・cardui.ts。docs/ISLAND_PHASE1.md「提案・報告のカード」）：時間を止めて選ばせるカードの出る数と、
 * ヒーローの読みの確かさ（★）。効き目・値段はいまの手のまま（ここはカードの出し方だけ）
 */
export const CARD = {
  /** 時間を止めて出す（ポップアップ）のは、月にこの枚数まで（町のランク）。あふれたものは受け箱だけ */
  cap: { C: 1, U: 2, R: 3, E: 3, L: 3 } as Record<'C' | 'U' | 'R' | 'E' | 'L', number>,
  /** 同じ種類のカードは、出してから 2 か月目まで出さない（月の締めの回数で数える） */
  kindGap: 2,
  /** セリフの字数の上限（[[ ]] を除いた字数） */
  sayMax: 60,
  /** 読みの確かさ ★2・★3（出来と Lv。★3 で「任せる」を選べる） */
  star: { two: { q: 0.8, lv: 10 }, three: { q: 0.87, lv: 20 } },
  /** 受け箱に置いておく枚数・ヒーローの提案が古くなる月数（同じ種類の新しい提案が来たら差し替える） */
  keep: 8,
  expire: 2,
  /** 選択肢（任せるを除く）の数 */
  choices: 3,
  /**
   * 段 UI5a（設計の考え方：ゲームが進むほど、担当者から受ける提案の割合が増える）：
   * capStar＝会社に読みの確かさ ★3 の担当がいると、時間を止めて出す上限を +1。
   * size＝提案書 1 枚で変える項目（打ち手）の数の上限：町のランクごと × 話し手の ★（★1 は 1 つ・★2 は 2 つまで・★3 は 3 つまで）
   */
  capStar: 1,
  size: { C: 1, U: 2, R: 3, E: 3, L: 3 } as Record<'C' | 'U' | 'R' | 'E' | 'L', number>,
};
/**
 * 突発のできごと（段 UI4。events.ts。docs/ISLAND_PHASE1.md「突発のできごと」）：マインちゃん・関わるヒーロー・町の長が持ってくる、良いできごとと困りごと。
 * 効き目は、いまある数字（来店・需要・値段・素材の値段・運ぶ日数・作る速さ・ブランド力・研究ポイント・士気）に一時的な倍率をかける形だけ。
 * - first：この町の月の締めの回数（報告の数）がこれ以上のときから（1 か月目＝チュートリアルは出さない）。
 * - gap：次のできごとまでの月の締めの回数（[最小, 最大]。ランクに関係なく 2〜3 か月に 1 回）。
 * - calmRank：1 位を争っている月は出さない（まだ制覇していない町で、締めの順位がこれ以内か、1 位が続いているか、他社の巻き返しのさなか。
 *   予定の月は動かさず、落ち着いた締めで出す。外交の新しい使者・提案も同じ）。1 位の取り合いの勝ち負けをできごとで変えないため（v26 の計測）。
 * - conv：見込みの計算（需要の増えのうち売上になる割合・値段の上げのうち利益になる割合・運ぶ日数の遅れで落ちる売上の割合・作る速さの割合）。
 * - brand・rp・morale：見込みに直すときの、1 点・1 RP・士気 1（全員）あたりの G（月の売上に対する割合）。
 * - scale：金額・個数の元（月の売上・売れた数に掛ける）。ランクで月の売上が増えるので、規模も自然に上がる。
 */
export const EVENT = {
  first: 2,
  gap: [2, 3] as [number, number],
  calmRank: 2,
  conv: { demand: 1, price: 1, haul: 0.3, craft: 0.3 },
  val: { brand: 0.003, rp: 0.0004, morale: 0.0006 },
  /** 大口の注文の上乗せ（1 個あたり）と、在庫から渡す数（今月売れた数の割合・最低 5 個） */
  order: { premium: 0.25, share: 0.2, min: 5 },
  /** ランクごとの研究ポイントとブランド力の量（ひらめき・旅人・有名人など） */
  rp: { C: 60, U: 120, R: 240, E: 600, L: 900 } as Record<Tier, number>,
  brand: { C: 4, U: 5, R: 6, E: 8, L: 10 } as Record<Tier, number>,
};
/**
 * 段 P2：ヒーローの適性（史実の調査の S〜D。voice.ts）の効き目。任せた部門の「出来」（deleg.ts の quality）と、持ち場の速さ（model.ts の speed）・
 * セクター長の売上の倍率に掛ける。C は「ふつう・記録が無い」がいちばん多いので 1（判断。全体を遅くも速くもしすぎない）
 */
export const HERO_FIT = { mul: { S: 1.1, A: 1.05, B: 1.02, C: 1, D: 0.96 } as Record<'S' | 'A' | 'B' | 'C' | 'D', number> };
/**
 * 段 P2：ヒーローの組み合わせ（duo.ts。docs/ISLAND_PHASE1.md「ヒーローの組み合わせ」）の数字（1 か所）。
 * - fx：見つけた組み合わせの、条件がそろっているあいだの効き目（関係の種類ごと。その組み合わせのヒーローだけ）。morale は士気の寄り先（目標）に足す点・
 *   speed は持ち場の速さ・drain は 1 日に減るスタミナ（疲れ）の倍率。
 * - opt：特殊イベントの選択肢（cost は先月の売上の割合・最低 minCost。days は期限（日）。morale はその場で足す士気）。
 * - first：この町の締めがこの回数から（1 か月目＝チュートリアルは出さない。できごとと同じ）。
 */
export const DUO = {
  fx: {
    ally: { morale: 4, speed: 1.02, drain: 1 },
    kin: { morale: 5, speed: 1, drain: 1 },
    mentor: { morale: 3, speed: 1.03, drain: 1 },
    rival: { morale: 0, speed: 1.05, drain: 1.12 },
    tension: { morale: -4, speed: 1, drain: 1 },
  },
  opt: {
    /** 盟友・兄弟・師弟：組ませる（速さ ×、期限つき）・祝いの席（費用・士気 +） */
    team: { speed: 1.06, days: 60 },
    party: { cost: 0.01, morale: 8 },
    /** 宿敵：競わせる（速さ ×・疲れ ×、期限つき）・離す（いつもの効き目を止める・士気 +） */
    compete: { speed: 1.08, drain: 1.25, days: 45 },
    apart: { morale: 3 },
    /** 緊張：間に入って話し合う（費用・解消・士気 +）・あえて任せる（速さ ×、期限つき・その場の士気 −） */
    talk: { cost: 0.005, morale: 5 },
    push: { speed: 1.05, days: 30, morale: -6 },
  },
  minCost: 300,
  first: 2,
};
/**
 * 段 S1：教え（ヒーロー → 社長への Successor。lesson.ts・lessonui.ts。docs/ISLAND_PHASE1.md「教え（段 S1）」）の数字（1 か所）。
 * - need：そのヒーローとかかわった回数（違う日に数える：カードを選ぶ・部長の提案を承認／却下・部長との会話の話題・組み合わせのできごと・経営会議の報告）。
 *   これに届くか、そのヒーローの提案を承認して翌月の締めで見込みの向きに数字が動いたら、その締めで教えが残る。
 * - perMonth：1 回の締めで残る教えの数の上限（提案の結果を先に）。first：この町の締めの回数がこれ以上のときから（1 か月目＝チュートリアルは残らない）。
 * - cap：型ごとに効く数（これより多く集めても効き目は増えない）。
 * - fx：型ごとの効き目（1 つあたり。いまのモデルの数字だけ）：決断＝部長の施策に使える労力 +%・速さ＝運ぶ日数と調達の日数 −%・堅実＝建物の維持費 −%・
 *   奇策＝入る研究ポイント +%・人を育てる＝役目（リーダー・部長・セクター長）のある人の士気の目指す値 +点・顧客＝顧客満足度の下がり方 −%・
 *   数字＝提案の読みの誤差 −%（掛ける）・交渉＝素材の値段 −%
 */
export type LessonType = 'decide' | 'speed' | 'steady' | 'novel' | 'people' | 'customer' | 'numbers' | 'deal';
export const LESSON = {
  need: 4,
  perMonth: 1,
  first: 2,
  cap: 5,
  fx: { decide: 0.01, speed: 0.01, steady: 0.01, novel: 0.01, people: 1, customer: 0.03, numbers: 0.03, deal: 0.01 } as Record<LessonType, number>,
};
/**
 * Epic の外交（段 UI4。diplo.ts。docs/ISLAND_PHASE1.md「外交（Epic）」）：霧の向こうのランドの使者。石板 e3-b「返事の光」の続き。
 * - lands：会うランド（MCH のランドの名前。色と紋は仮の絵＝docs/ISLAND_ART_TODO.md）。順に会う。
 * - start：初めの仲の良さ（0〜100）。afterMonths：Epic の町に初めて着いてから、この会社の月数で初めての使者（e3-b を読んだらすぐ）。
 * - nextMonths：次のランドの使者が来るまでの会社の月数。every：提案（交易・依頼）を持ってくる間隔（会社の月数）。
 * - rel：仲の上下（交易を守った月・守れなかった月・依頼の達成・期限切れ・断った・もてなした）。
 * - trade：交易の約束（毎月の数＝Epic の町で売れた復刻品・骨董の数の share・最低 min。値段の上乗せ＝ bonus ＋ 仲 × bonusRel。
 *   期間 months。届けられなかった月のお金の罰＝足りない数 × 値段 × penalty、上限 penaltyMax）。交易は Epic の町にいる月だけ（ほかの町にいる月と、町に着いて grace 日までは休み）。
 * - req：使者の依頼（数＝その商品の月の売れた数の share・最低 min・期限 days 日）。届けた品は値段どおりの売上（町の売上に入る）、そろったらお礼＝ 数 × 値段 × (reward ＋ 仲 × rewardRel) と研究ポイント rp。
 * - host：使者をもてなす費用（月の売上の割合・最低）。open：仲の予告（この値を超えると、いつか道が開く。Legendary・次の国＝段 J）。
 */
export const DIPLO = {
  lands: [
    { id: 'ruby', name: t('ルビー', 'Ruby'), icon: '💎', color: '#c8324a', envoy: t('交易組合の代表', 'Guild envoy') },
    { id: 'strawberry', name: t('ストロベリー', 'Strawberry'), icon: '🍓', color: '#d9467a', envoy: t('果樹園の組合長', 'Orchard envoy') },
    { id: 'blueberry', name: t('ブルーベリー', 'Blueberry'), icon: '🫐', color: '#4a63c8', envoy: t('港の船頭頭', 'Harbor envoy') },
  ],
  start: 30,
  afterMonths: 3,
  nextMonths: 3,
  every: 2,
  rel: { kept: 3, missed: -6, done: 10, late: -8, decline: -3, host: 8, sign: 5 },
  trade: { grace: 60, share: 0.08, min: 3, bonus: 0.2, bonusRel: 0.002, months: 4, penalty: 0.1, penaltyMax: 30000 },
  req: { share: 0.15, min: 4, days: 40, reward: 0.5, rewardRel: 0.01, rp: 300 },
  host: { share: 0.01, min: 20000 },
  open: 80,
};
/** 部門に向く能力値（ロードマップ 2-4）：物流 AGI・営業とマーケ PHY・R&D と経理と法務とシステム INT・ほか（人事・総務・CS・経営企画）は 3 つの平均 */
export function deptApt(st: Stats, d: DeptId): number {
  switch (d) {
    case 'logistics':
      return st.agi;
    case 'sales':
    case 'marketing':
      return st.phy;
    case 'rnd':
    case 'accounting':
    case 'legal':
    case 'systems':
      return st.int;
    default:
      return (st.phy + st.int + st.agi) / 3;
  }
}
/** 向く能力値の名前（任命の画面） */
export const deptAptName = (d: DeptId) => (d === 'logistics' ? 'AGI' : d === 'sales' || d === 'marketing' ? 'PHY' : d === 'rnd' || d === 'accounting' || d === 'legal' || d === 'systems' ? 'INT' : t('3 つの平均', 'avg of 3'));

/** 技の「技を n つ」の条件を満たしているか（has：取ったスキル） */
export const anyOfMet =(k: Skill, has: (id: string) => boolean) => !k.anyOf || k.anyOf.ids.filter(has).length >= k.anyOf.n;

/** 雇える候補（Common のヒーロー）。月の初めに入れ替わる */
export const HIRE_POOL = [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008, 1009, 1010, 1011, 1012, 1013, 1014, 1015, 1016, 1017, 1018, 1019, 1020];

// ---------------------------------------------------------------- ランキング（エリアの外は飾り）

export const LAND_COMPANIES: [string, number][] = [
  [t('ミナトの百貨', 'Minato Department'), 420000],
  [t('ナギサ物産', 'Nagisa Products'), 260000],
  [t('アオバ商事', 'Aoba Trading'), 180000],
  [t('ツクモ工芸', 'Tsukumo Crafts'), 120000],
  [t('カザミ屋', 'Kazamiya'), 90000],
  [t('ホシノ雑貨', 'Hoshino Goods'), 70000],
  [t('イソベ商店', 'Isobe Store'), 48000],
  [t('ヨツバ堂', 'Yotsuba-do'), 30000],
];
export const WORLD_COMPANIES: [string, number][] = [
  [t('ギルド・オブ・ナイン', 'Guild of Nine'), 24000000],
  [t('セブンシーズ商会', 'Seven Seas Trading'), 15000000],
  [t('クラウン・ホールディングス', 'Crown Holdings'), 9800000],
  [t('ドラゴンゲート', 'Dragon Gate'), 7200000],
  [t('ルビーネット', 'Ruby Net'), 5100000],
  [t('グラファイト工業', 'Graphite Industries'), 3900000],
  [t('ブルーベリー海運', 'Blueberry Shipping'), 2600000],
  [t('セージ・ラジオ', 'Sage Radio'), 1800000],
];

// ---------------------------------------------------------------- 設備投資（建物ごと）

export interface Invest {
  id: string;
  /** どの建物に付けるか（建物ごと＝セクタごと。工房はセクタに 1 つ、倉庫は棟ごと） */
  kind: 'shop' | 'workshop' | 'warehouse' | 'depot' | 'museum';
  name: string;
  note: string;
  /** 段ごとの値段 */
  cost: number[];
}

/**
 * 設備投資（建物ごと）。棚・作業台・荷車・置き場所のような「設備」は、スキルツリーではなくここ（docs/ISLAND_PHASE1.md「設備投資」）。
 * 建物はセクタごとなので、新しいセクタでは入れ直す（タオックスで育てた設備をそのまま持ち込めない）。値段は以前のスキルと同じ
 */
export const INVESTS: Invest[] = [
  { id: 'shelves', kind: 'shop', name: t('棚を増やす', 'More shelves'), note: t('このお店の棚 +1（1 段ごと。別の商品を並べると売上が増える）', 'This shop’s shelves +1 per level (a different item adds sales)'), cost: [3000, 9000] },
  { id: 'sign', kind: 'shop', name: t('看板を出す', 'Signboard'), note: t('このお店の売り場の強さ +10%（1 段ごと）', 'This shop’s pull +10% per level'), cost: [2000, 4000, 8000] },
  { id: 'staffroom', kind: 'shop', name: t('アルバイトの控室', 'Part-timer room'), note: t('このお店のアルバイトの上限 +2', 'This shop can take 2 more part-timers'), cost: [2500] },
  { id: 'fixtures', kind: 'shop', name: t('陳列の什器', 'Display fixtures'), note: t('棚に並べる速さ +30%（1 段ごと）', 'Shelving speed +30% per level'), cost: [2500, 5000] },
  { id: 'backroom', kind: 'shop', name: t('裏の倉庫を広げる', 'Bigger backroom'), note: t('裏に置ける数 +20（1 段ごと）', 'Backroom +20 per level'), cost: [1500, 3000, 4000] },
  { id: 'bench', kind: 'workshop', name: t('作業台を増やす', 'More workbenches'), note: t('作業台 +1（1 段ごと。2 段目は工場にして、クラフトの日数 −20% も）', 'Workbench +1 per level (level 2 also cuts crafting days by 20%)'), cost: [5000, 22000] },
  { id: 'carts', kind: 'workshop', name: t('荷車を増やす', 'More carts'), note: t('運搬係 1 人が同時に出せる便 +1（1 段ごと）', 'Each hauler runs one more trip at once per level'), cost: [3000, 7000] },
  { id: 'truck', kind: 'workshop', name: t('小型トラック', 'Small truck'), note: t('積める数 ×2.5・運ぶ速さ ×1.5', 'Load ×2.5, hauling speed ×1.5'), cost: [8000] },
  { id: 'stockroom', kind: 'workshop', name: t('物置の整理', 'Tidy stockroom'), note: t('工房の物置 +40 個', 'Workshop stockroom +40'), cost: [2500] },
  { id: 'tools', kind: 'workshop', name: t('道具の新調', 'New tools'), note: t('クラフトの日数 −10%（1 段ごと）', 'Crafting −10% days per level'), cost: [3000, 6000, 12000] },
  { id: 'breakroom', kind: 'workshop', name: t('職人の休憩所', 'Crafters’ break room'), note: t('工房で働く人のスタミナの消耗 −30%', 'Crafters lose 30% less stamina'), cost: [2500] },
  // 段 UI5d：倉庫の強化（1 棟を段で。倉庫が乱立しないように）。1 個あたりの値段は建てる（4,000 G で +200 ＝ 20 G・毎月 600 G）と同じくらいで、維持費のぶん少し得
  { id: 'rack', kind: 'warehouse', name: t('倉庫の強化（高い棚）', 'Warehouse upgrade (tall racks)'), note: t('この倉庫の置き場所 +100 個（1 段ごと・維持費は増えない）', 'This warehouse holds 100 more per level (no extra upkeep)'), cost: [2000, 2500, 3000] },
  // 段 UI5d：物流拠点の保管の強化（拠点の置き場所 +75 個／段）
  { id: 'dock', kind: 'depot', name: t('拠点の保管棚', 'Hub storage racks'), note: t('この物流拠点の置き場所 +75 個（1 段ごと・維持費は増えない）', 'This hub holds 75 more per level (no extra upkeep)'), cost: [1500, 2000] },
  // 遺物の展示館（発掘 v2 の 4 段目）：展示の枠 4 → 8・12・16
  { id: 'hall', kind: 'museum', name: t('展示室の増築', 'Gallery extension'), note: t('展示の枠 +4（4 → 8・12・16）', 'Display slots +4 (4 → 8, 12, 16)'), cost: DIG_BALANCE.museum.expand },
  // 発掘の道具（ツルハシの新調・ランタン・発破の道具）は、発掘 v2 の 2 段目でスキルツリーの「発掘」の枝へ移した（DIG_PANELS。古いセーブは版 4 で移す）
];
/** 以前の発掘の道具（工房の設備投資）→ 発掘の枝のパネル（版 3 → 4。段 → Lv：ツルハシ 1 段 Lv1・2 段 Lv3／ランタン Lv1／発破 Lv1） */
export const OLD_DIG_TOOLS: Record<string, { id: string; lv: number[] }> = { pick: { id: 'dig_power', lv: [1, 3] }, lantern: { id: 'dig_lamp', lv: [1] }, blast: { id: 'dig_blast', lv: [1] } };
/**
 * 以前のスキル → 設備投資（古いセーブの移し替え。deserializeP1）。
 * 外したスキルを持っていたら、いまのセクタの建物に同じ段を付ける（お金は取らない）
 */
export const SKILL_TO_INVEST: Record<string, string> = {
  shelf1: 'shelves',
  shelf2: 'shelves',
  parttime: 'staffroom',
  backroom: 'backroom',
  bench2: 'bench',
  bench3: 'bench',
  tidy: 'stockroom',
  cart2: 'carts',
  cart3: 'carts',
  truck: 'truck',
  rack: 'rack',
};
export const INVEST: Record<string, Invest> = Object.fromEntries(INVESTS.map((x) => [x.id, x]));

/** 移転は建てる値段の半分（最低 2,000 G）・工期の半分。撤去は建てる値段の 3 割が戻る */
export const MOVE = { rate: 0.5, min: 2000, days: 0.5, refund: 0.3 };

// ---------------------------------------------------------------- 地層の発掘と研究ポイント（docs/ISLAND_PHASE1.md「地層の発掘と研究ポイント」）

/** 発掘場のあるランク（Common・Uncommon・Rare・Epic。Legendary は雲の向こう） */
export type DigTier = 'C' | 'U' | 'R' | 'E';
export interface Stratum {
  name: string;
  /** 1 マスの硬さ（打つ回数。1 打の強さ 1 のとき）の範囲 */
  hard: [number, number];
  /** コードで描くときの色（仮。docs/ISLAND_ART_TODO.md） */
  color: string;
}
/**
 * 荒れ地 1 か所の発掘場（正面の壁）：横 w × 縦 h のマス目。各マスに奥行きの層が layers の数だけ（手前 → 奥）。
 * 叩くと手前の層から 1 枚ずつはがれる（どのマスも最初から叩ける）。奥の層ほど硬い。
 * layers の color は壁の面の色（仮。手前ほど明るい土、奥ほど暗く硬そうな岩。docs/ISLAND_ART_TODO.md）。
 * mat：素材が出たときの数。セクタの地図に荒れ地が 4 か所（WASTE）あり、1 か所に 1 枚の壁
 */
export const DIG: Record<DigTier, { w: number; h: number; layers: Stratum[]; mat: number; mats: Mat[] }> = {
  C: {
    w: DIG_BALANCE.wall.C[0],
    h: DIG_BALANCE.wall.C[1],
    mat: 3,
    mats: ['iron', 'wood', 'clay', 'glass'],
    layers: [
      { name: t('表土', 'Topsoil'), hard: DIG_BALANCE.hard.C[0], color: '#a77d4e' },
      { name: t('粘土層', 'Clay layer'), hard: DIG_BALANCE.hard.C[1], color: '#8a5f3c' },
      { name: t('岩盤', 'Bedrock'), hard: DIG_BALANCE.hard.C[2], color: '#615b57' },
    ],
  },
  U: {
    w: DIG_BALANCE.wall.U[0],
    h: DIG_BALANCE.wall.U[1],
    mat: 2,
    mats: ['cloth', 'paper', 'gem'],
    layers: [
      { name: t('岩盤', 'Bedrock'), hard: DIG_BALANCE.hard.U[0], color: '#77706b' },
      { name: t('古い港の跡', 'Old harbor ruins'), hard: DIG_BALANCE.hard.U[1], color: '#566a76' },
      { name: t('古い街道の跡', 'Old highway ruins'), hard: DIG_BALANCE.hard.U[2], color: '#54495e' },
      { name: t('大地のつなぎ目', 'Seam of the lands'), hard: DIG_BALANCE.hard.U[3], color: '#38364a' },
    ],
  },
  // Rare の町 ①：Lime が荒れたわけ（掘りすぎた坑道・大地の裂け目）の層。色は仮（docs/ISLAND_ART_TODO.md）
  R: {
    w: DIG_BALANCE.wall.R[0],
    h: DIG_BALANCE.wall.R[1],
    mat: 2,
    mats: ['cloth', 'paper', 'gem'],
    layers: [
      { name: t('崩れた石畳', 'Fallen paving'), hard: DIG_BALANCE.hard.R[0], color: '#6e6a74' },
      { name: t('止まった時計の層', 'Layer of the stopped clock'), hard: DIG_BALANCE.hard.R[1], color: '#5a5f78' },
      { name: t('古い坑道', 'Old mine shafts'), hard: DIG_BALANCE.hard.R[2], color: '#4b4a63' },
      { name: t('大地の裂け目', 'Rift in the earth'), hard: DIG_BALANCE.hard.R[3], color: '#3b3352' },
      { name: t('9 つの境目', 'Border of the nine'), hard: DIG_BALANCE.hard.R[4], color: '#28233a' },
    ],
  },
  // Epic の町 ①（段 H1）：裂けたあと、Lime の人々が何を残し、どう立て直そうとしたか（灰の下の寄り合い・埋め戻した土・灯の土台）。色は仮（docs/ISLAND_ART_TODO.md）
  E: {
    w: DIG_BALANCE.wall.E[0],
    h: DIG_BALANCE.wall.E[1],
    mat: 2,
    mats: ['cloth', 'paper', 'gem'],
    layers: [
      { name: t('灰をかぶった道', 'Ash-covered road'), hard: DIG_BALANCE.hard.E[0], color: '#7a7470' },
      { name: t('寄り合いの広場の跡', 'Old gathering square'), hard: DIG_BALANCE.hard.E[1], color: '#6a6052' },
      { name: t('埋め戻した土', 'Refilled earth'), hard: DIG_BALANCE.hard.E[2], color: '#5b4a3c' },
      { name: t('古い畑の畝', 'Old furrows'), hard: DIG_BALANCE.hard.E[3], color: '#4a4436' },
      { name: t('灯の土台', 'Footing of the beacon'), hard: DIG_BALANCE.hard.E[4], color: '#3d3448' },
      { name: t('裂け目のふた', 'Lid on the rift'), hard: DIG_BALANCE.hard.E[5], color: '#241d33' },
    ],
  },
};
/**
 * ダンジョンの壁（発掘 v2 の 4 段目。セクタで最後に掘りきった荒れ地の底から見つかる。入るたびに作り直す）：横 7 × 縦 9 × 奥行き 6 層。
 * 層の名前・色は仮（docs/ISLAND_ART_TODO.md）。硬さは DIG_BALANCE.dungeon.hard（セクタのランクごと。奥ほど硬い）。素材はそのセクタの荒れ地と同じ
 */
const DUNGEON_LAYERS = (): { name: string; color: string }[] => [
  { name: t('古い地下道', 'Old tunnels'), color: '#6b5a48' },
  { name: t('遺跡の床', 'Ruined floor'), color: '#5a5566' },
  { name: t('崩れた回廊', 'Fallen gallery'), color: '#4d4258' },
  { name: t('眠る宝物庫', 'Sleeping vault'), color: '#5b4526' },
  { name: t('封じられた祭壇', 'Sealed altar'), color: '#3a2c4c' },
  { name: t('大地の底', 'Bottom of the earth'), color: '#1f1a2e' },
];
export const DUNGEON_DIG: Record<DigTier, { w: number; h: number; layers: Stratum[]; mat: number; mats: Mat[] }> = {
  C: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.C.mat, mats: DIG.C.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.C[k] })) },
  U: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.U.mat, mats: DIG.U.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.U[k] })) },
  R: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.R.mat, mats: DIG.R.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.R[k] })) },
  E: { w: DIG_BALANCE.dungeon.wall[0], h: DIG_BALANCE.dungeon.wall[1], mat: DIG.E.mat, mats: DIG.E.mats, layers: DUNGEON_LAYERS().map((x, k) => ({ ...x, hard: DIG_BALANCE.dungeon.hard.E[k] })) },
};
/**
 * 荒れ地（未開拓エリア）：発掘場のあるセクタの地図に 2 × 2 マスを 4 か所。1 か所が 1 つの発掘場。
 * 置き場所は区画の内側（道路に面していないマス＝町の 1 マスの建物が建たない所）から、セクタの id で決める（model.ts の wasteSpots）
 */
export const WASTE = { count: 4, size: 2 };
/** 壁に埋まっているものの割合（マス × 層 1 枚あたり。お題・石板のほかに）：エクステ・素材。残りは土だけ */
export const DIG_ODDS = DIG_BALANCE.odds;
/** 石板を置く層（Common 1 枚・Uncommon 2 枚・Rare 2 枚・Epic 2 枚） */
export const TABLET_LAYERS: Record<DigTier, number[]> = { C: [2], U: [1, 3], R: [1, 3], E: [2, 4] };
/** 発掘隊（仕事「発掘」）：発掘作業のあいだだけ、適性の速さ 1.0 で 1 日に打つ回数（手で掘るほうが速い） */
export const DIG_AUTO = { perDay: DIG_BALANCE.autoPerDay };
/** 発破：Lv1 の火薬代（G。仮。Lv で安くなる：model.ts の blastCost） */
export const BLAST = { cost: DIG_BALANCE.tree.blastCost[0] };

/**
 * 研究ポイント（RP）の入り方（数字は仮）。研究レベルは Lv1〜5：Lv2・3・4・5 に上がるのに、重なりがそれぞれ 1・2・3・4 個要る。
 * first：新しいエクステを初めて掘る／lv：Lv2〜5 に上がる／topic：お題を掘る（その場で Lv5）／tablet：石板／present：お題をそろえて発表する
 */
export const RP_GAIN = DIG_BALANCE.rpGain;
/** 研究レベルに要る、掘った数の合計（Lv1〜5）：1・2・4・7・11 */
export const RESEARCH_NEED = [1, 2, 4, 7, 11];
/** 掘った数 → 研究レベル（0〜5） */
export const researchLv = (n: number) => RESEARCH_NEED.filter((x) => n >= x).length;

/**
 * セクタごとの出土品（ここ 1 か所にまとめる。bearko があとで差し替えられるように）。
 * topics：お題（Common 3・Uncommon 4。各層に 1 つずつ、上の層から順に）。どのセクタのお題も、ほかのセクタの出土品には入れない。
 * finds：お題以外（Common 8・Uncommon 10。何度も出る。となりのセクタと重なってよい＝研究レベルは続きから）。
 * いまの 17 商品のシリーズ（PRODUCTS）は入れない。選んだ理由は docs/ISLAND_PHASE1.md「出土品の一覧」。
 */
export const DIG_SITES: Record<string, { topics: number[]; finds: number[] }> = {
  // Common：職人の町の名残（道具・暮らし・祭り）
  c1: { topics: [1122, 1104, 1034], finds: [1011, 1056, 1031, 1096, 1008, 1016, 1105, 1111] },
  c2: { topics: [1160, 1075, 1019], finds: [1089, 1132, 1169, 1185, 1155, 1086, 1105, 1017] },
  c3: { topics: [1099, 1152, 1018], finds: [1011, 1010, 1004, 1081, 1097, 1164, 1183, 1001] },
  c4: { topics: [1182, 1061, 1193], finds: [1031, 1096, 1172, 1174, 1129, 1151, 1180, 1179] },
  c5: { topics: [1071, 1140, 1063], finds: [1064, 1067, 1066, 1037, 1118, 1058, 1157, 1141] },
  c6: { topics: [1163, 1173, 1131], finds: [1056, 1137, 1159, 1191, 1184, 1138, 1020, 1023] },
  c7: { topics: [1103, 1006, 1142], finds: [1016, 1141, 1013, 1124, 1058, 1098, 1181, 1139] },
  c8: { topics: [1108, 1177, 1189], finds: [1109, 1134, 1092, 1094, 1087, 1091, 1179, 1051] },
  // Uncommon：つながっていた 9 つのランド（港・道・市場・織物・都。お題に 8 つのランドのエクステ）
  u1: { topics: [2047, 2038, 2143, 2045], finds: [2019, 2647, 2640, 2160, 2089, 2086, 2151, 2157, 2084, 2122] },
  u2: { topics: [2131, 2034, 2099, 2042], finds: [2011, 2001, 2006, 2010, 2004, 2081, 2152, 2153, 2097, 2164] },
  u3: { topics: [2033, 2036, 2172, 2040], finds: [2017, 2009, 2111, 2178, 2140, 2095, 2037, 2063, 2064, 2067] },
  u4: { topics: [2141, 2193, 2043, 2044], finds: [2096, 2031, 2077, 2007, 2180, 2174, 2016, 2112, 2139, 2184] },
  u5: { topics: [2182, 2041, 2039, 2046], finds: [2118, 2129, 2154, 2142, 2115, 2186, 2130, 2158, 2161, 2121] },
  // Rare：Lime がなぜ荒れたのか（9 つのランドへの門・奪い合いの市・掘りすぎた坑道・最後の船）。カタログの Rare のエクステ（真の再販・いまの商品のシリーズを除く）
  r1: { topics: [3041, 3111, 3143, 3036], finds: [3163, 3159, 3191, 3184, 3139, 3112, 3117, 3020, 3023, 3005] },
  r2: { topics: [3039, 3045, 3172, 3095], finds: [3129, 3151, 3154, 3157, 3176, 3055, 3058, 3178, 3131, 3105] },
  r3: { topics: [3042, 3034, 3108, 3050], finds: [3011, 3099, 3152, 3183, 3081, 3018, 3086, 3092, 3132, 3179] },
  r4: { topics: [3047, 3046, 3038, 3122], finds: [3019, 3089, 3093, 3155, 3160, 3113, 3186, 3016, 3008, 3017] },
  // Epic（段 H1）：裂けたあと、Lime の人々が何を残し、どう立て直そうとしたか（寄り合いの丘と分け合いの帳面・守られた種の畑・霧へ灯を送る太陽の塔）。
  // カタログの Epic のエクステ（真の再販・いまの商品のシリーズを除く）。お題も出土品も、どのダンジョン（Rare 以上）の出土品ともシリーズで重ならない
  // （骨董の需要＝ダンジョンのシリーズと分ける。Rare の荒れ地のシリーズの Epic 版が多い：Rare の町で掘ったものの「その先」）
  e1: { topics: [4008, 4016, 4050, 4111], finds: [4036, 4095, 4172, 4105, 4017, 4113, 4151, 4154, 4157, 4055] },
  e2: { topics: [4041, 4163, 4191, 4034], finds: [4159, 4184, 4139, 4112, 4131, 4023, 4005, 4020, 4092, 4108] },
  e3: { topics: [4143, 4046, 4038, 4121], finds: [4047, 4122, 4019, 4089, 4093, 4155, 4160, 4039, 4045, 4042] },
};

/** エクステの id → シリーズの key（catalog.json の series.key。カタログに無ければ「#id」） */
let seriesKeys: Map<number, string> | null = null;
export function seriesOf(ext: number): string {
  if (!seriesKeys) {
    seriesKeys = new Map();
    for (const x of allSeries) for (const e of x.items) if (!seriesKeys.has(e.id)) seriesKeys.set(e.id, x.key);
  }
  return seriesKeys.get(ext) ?? `#${ext}`;
}

// ---------------------------------------------------------------- 復刻品（発掘 v2 の 3 段目。docs/ISLAND_PHASE1.md「3. 復刻品」）

/** 復刻品の商品キー（「Relic-1122」。SKU は「Relic-1122:C」。いまの 17 商品のキーと重ならない） */
/**
 * ダンジョンの奥で出る、本来そのセクタでは手に入らないランクのエクステ（セクタごと・ランクごとに DIG_BALANCE.dungeon.pick 種。セクタの id の種で選ぶ）。
 * Common のセクタ：Uncommon（Uncommon のセクタのお題以外の出土品から。復刻品のレシピがある）・Rare・Epic。Uncommon のセクタ：Rare・Epic・Legendary。Rare のセクタ：Epic・Legendary。
 * Rare は Rare の町に進出すると復刻品のレシピが開く（Rare の町 ①）。
 * Rare 以上はカタログのそのレアリティのエクステ（真の再販は除く・いまの 17 商品のシリーズは除く）。Epic・Legendary は 2 × 2
 */
export const DUNGEON_FINDS: Record<string, Partial<Record<Tier, number[]>>> = (() => {
  const RAR: Record<Tier, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
  const used = new Set(PRODUCTS.flatMap((p) => Object.values(p.ext)));
  const prodSeries = new Set(allSeries.filter((x) => x.items.some((e) => used.has(e.id))).map((x) => x.key));
  const byRar = (r: Tier) => [...new Set(allSeries.filter((x) => !prodSeries.has(x.key)).flatMap((x) => x.items.filter((e) => e.rarity === RAR[r] && !e.shin).map((e) => e.id)))].sort((a, b) => a - b);
  const uFinds = [...new Set(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('u')).flatMap(([, x]) => x.finds))].sort((a, b) => a - b);
  // 文字列の種（FNV）と、種から決まる並べ替え
  const seed = (x: string) => {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  const shuffle = (xs: number[], key: string) => {
    let a = seed(key) || 1;
    const r = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t0 = a;
      t0 = Math.imul(t0 ^ (t0 >>> 15), t0 | 1);
      t0 ^= t0 + Math.imul(t0 ^ (t0 >>> 7), t0 | 61);
      return ((t0 ^ (t0 >>> 14)) >>> 0) / 4294967296;
    };
    const out = [...xs];
    for (let k = out.length - 1; k > 0; k--) {
      const m = Math.floor(r() * (k + 1));
      [out[k], out[m]] = [out[m], out[k]];
    }
    return out;
  };
  // Rare の町 ①：Rare の荒れ地のお題は、ほかのセクタのダンジョンにも出さない（お題はそのセクタだけ）。
  // 売れるシリーズ（MARKET_SERIES）：Rare の荒れ地の出土品（お題以外も）のシリーズは、Common・Uncommon のダンジョンに出さない
  // （Rare の町では新しいシリーズが出る。ダンジョンの Rare は Epic の町の骨董の需要へ）。荒れ地の側の選び（テーマ・依頼）はそのまま、ダンジョンの側を選び直す
  const rSeries = new Set(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('r')).flatMap(([, x]) => [...x.topics, ...x.finds]).map((e) => seriesOf(e)));
  const notR = (xs: number[]) => xs.filter((id) => !rSeries.has(seriesOf(id)));
  // Epic・Legendary も同じ（シリーズの単位で重ならない。Epic の町の骨董の需要はダンジョンのシリーズだけ）
  const pools: Partial<Record<Tier, number[]>> = { U: uFinds, R: notR(byRar('R')), E: notR(byRar('E')), L: notR(byRar('L')) };
  // Epic の町 ①（段 H1）：Epic のセクタのダンジョン（奥は Legendary だけ）は、Epic の荒れ地のシリーズも除く（骨董の需要とシリーズで重ならない）。
  // Common〜Rare のセクタのダンジョンは前のまま（選ぶ元の並びを変えない＝出土品が変わらない）
  const eSeries = new Set(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('e')).flatMap(([, x]) => [...x.topics, ...x.finds]).map((e) => seriesOf(e)));
  const out: Record<string, Partial<Record<Tier, number[]>>> = {};
  for (const id of Object.keys(DIG_SITES)) {
    // Rare のセクタ：上のランクは Epic・Legendary（2 × 2）。Epic のセクタ：Legendary だけ
    const ups: Tier[] = id.startsWith('e') ? ['L'] : id.startsWith('r') ? ['E', 'L'] : id.startsWith('u') ? ['R', 'E', 'L'] : ['U', 'R', 'E'];
    const poolOf = (r: Tier) => (id.startsWith('e') ? (pools[r] ?? []).filter((x) => !eSeries.has(seriesOf(x))) : (pools[r] ?? []));
    out[id] = Object.fromEntries(ups.map((r) => [r, shuffle(poolOf(r), `dungeon:${id}:${r}`).slice(0, DIG_BALANCE.dungeon.pick).sort((a, b) => a - b)]));
  }
  return out;
})();
export const relicKey = (ext: number) => `Relic-${ext}`;
export const isRelic = (key: string) => key.startsWith('Relic-');
/** 遺物の id から決まる種（同じ遺物はいつも同じレシピ・値段・日数） */
const relicHash = (ext: number) => {
  let x = (ext * 2654435761) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
};
/** 遺物のエクステの名前（カタログの全シリーズから。日本語・英語） */
let relicNames: Map<number, [string, string]> | null = null;
const relicName = (ext: number): [string, string] => {
  relicNames ??= new Map(allSeries.flatMap((x) => x.items.map((e) => [e.id, [e.name, e.nameEn] as [string, string]] as const)));
  return relicNames.get(ext) ?? [`#${ext}`, `#${ext}`];
};
/**
 * 復刻品のレシピ：そのセクタの発掘の素材から、遺物の id で決める（同じ遺物はいつも同じ）。
 * Common：鉄・木材・粘土・ガラスから 2 種（4 個と 2 個。ガラスは高いので 2 個のほう）。
 * Uncommon：布・紙・宝石から 1〜2 種（3 個・2 個目は 1 個）＋ Common の素材 1 種（4 個）。数はいまの同じランクの商品と同じくらい（C 6.7・U 8.5 個）
 */
export function relicRecipe(ext: number, rank: Rar): Partial<Record<Mat, number>> {
  const hsh = relicHash(ext);
  const cm = DIG.C.mats;
  if (rank === 'C') {
    const a = cm[hsh % cm.length];
    const rest = cm.filter((m) => m !== a);
    const b = rest[Math.floor(hsh / 7) % rest.length];
    const [big, small] = a === 'glass' ? [b, a] : [a, b];
    return { [big]: 4, [small]: 2 };
  }
  const um = DIG.U.mats;
  const u1 = um[hsh % um.length];
  const two = Math.floor(hsh / 5) % 2 === 1;
  const u2 = um.filter((m) => m !== u1)[Math.floor(hsh / 11) % (um.length - 1)];
  const c = cm.filter((m) => m !== 'glass')[Math.floor(hsh / 13) % 3];
  return { [c]: 4, [u1]: 3, ...(two ? { [u2]: 1 } : {}) };
}
/**
 * Rare の復刻品のレシピ（Rare の町 ①）：Uncommon の復刻品のレシピから 1 段上（宝石を DIG_BALANCE.relic.rare.gem 個・Uncommon の素材をもう 1 種 more 個）。
 * 数はおよそ 12 個（Uncommon の復刻品 8.5 個）
 */
export function rareRelicRecipe(ext: number): Partial<Record<Mat, number>> {
  const R = DIG_BALANCE.relic.rare;
  const base = relicRecipe(ext, 'U');
  const out: Partial<Record<Mat, number>> = { ...base };
  out.gem = (out.gem ?? 0) + R.gem;
  const um = DIG.U.mats.filter((m) => m !== 'gem');
  const extra = um[relicHash(ext) % um.length];
  out[extra] = (out[extra] ?? 0) + R.more;
  return out;
}
/**
 * Epic の復刻品のレシピ（段 H1：Epic の町 ①）：Rare の復刻品のレシピから 1 段上（宝石をもう DIG_BALANCE.relic.epic.gem 個・布か紙をもう more 個）。
 * 数はおよそ 15 個（Rare の復刻品 12 個）
 */
export function epicRelicRecipe(ext: number): Partial<Record<Mat, number>> {
  const E = DIG_BALANCE.relic.epic;
  const out: Partial<Record<Mat, number>> = { ...rareRelicRecipe(ext) };
  out.gem = (out.gem ?? 0) + E.gem;
  const um = DIG.U.mats.filter((m) => m !== 'gem');
  const extra = um[(relicHash(ext) >>> 5) % um.length];
  out[extra] = (out[extra] ?? 0) + E.more;
  return out;
}
/** 同じランクのいまの商品の平均の値段（Common の商品。アンコモンは SKU の値段で ×UNCOMMON.price） */
const AVG_PRICE = PRODUCTS.filter((p) => !p.tier).reduce((a, p) => a + p.price, 0) / PRODUCTS.filter((p) => !p.tier).length;
/** 復刻品 1 つの定義（遺物の id・出たセクタのランク） */
function relicDef(ext: number, rank: Rar, rare = false, epic = false): ProductDef {
  const hsh = relicHash(ext);
  const B = DIG_BALANCE.relic;
  const [ja, en] = relicName(ext);
  // 値段：平均 × 1.25 を中心に ±10%（遺物ごとに少しずつ違う）。Rare の復刻品は SKU（アンコモンの格）の ×UNCOMMON.price に加えて、合わせて ×rare.price になるように。
  // Epic の復刻品（段 H1）は合わせて ×epic.price
  const mul = epic ? B.epic.price / UNCOMMON.price : rare ? B.rare.price / UNCOMMON.price : 1;
  const price = Math.round((AVG_PRICE * B.priceMul * mul * (0.9 + 0.1 * (hsh % 3))) / 10) * 10;
  const recipe = epic ? epicRelicRecipe(ext) : rare ? rareRelicRecipe(ext) : relicRecipe(ext, rank);
  const days = epic ? B.epic.days : rare ? B.rare.days : B.days;
  return { key: relicKey(ext), name: t(`復刻 ${ja}`, `Revival ${en}`), ext: { C: ext, U: ext }, price, batch: B.batch, days: days[(hsh >>> 3) % days.length], recipe: { C: recipe, U: recipe }, demand: B.demandBase, relic: { ext, rank, ...(rare ? { rare: true } : {}), ...(epic ? { epic: true } : {}) } };
}
/**
 * 復刻品（発掘で出るエクステ 1 つにつき 1 つ。DIG_SITES の全セクタの topics と finds）。ランクは出たセクタのランク。
 * いまの 17 商品と同じエクステ（シリーズ）は作らない（いまの DIG_SITES には無い。足したときのため）
 */
export const RELICS: ProductDef[] = (() => {
  const own = new Set(PRODUCTS.flatMap((p) => [p.ext.C % 1000, p.ext.U % 1000]));
  const out = new Map<number, ProductDef>();
  for (const [sec, d] of Object.entries(DIG_SITES)) {
    const tier = SECTORS.find((x) => x.id === sec)?.tier;
    if (tier !== 'C' && tier !== 'U') continue;
    for (const id of [...d.topics, ...d.finds]) if (!out.has(id) && !own.has(id % 1000)) out.set(id, relicDef(id, tier));
  }
  // Rare の町 ①：Rare の復刻品（Rare の荒れ地の出土品と、Common・Uncommon のダンジョンの奥で出る Rare のエクステ）。作るのはアンコモンの格（SKU は :U）で、値段・材料・工期は 1 段上
  const rare = [...Object.entries(DIG_SITES).filter(([sec]) => SECTORS.find((x) => x.id === sec)?.tier === 'R').flatMap(([, d]) => [...d.topics, ...d.finds]), ...Object.values(DUNGEON_FINDS).flatMap((x) => x.R ?? [])];
  for (const id of rare) if (!out.has(id) && !own.has(id % 1000)) out.set(id, relicDef(id, 'U', true));
  // Epic の町 ①（段 H1）：Epic の復刻品（Epic の荒れ地の出土品と、Common〜Rare のダンジョンの奥で出る Epic のエクステ）。Rare と同じくアンコモンの格（:U）で、
  // 値段・材料・工期・職人は Rare からさらに 1 段上。Legendary の復刻品はまだ無い（Legendary の都で）
  const epic = [...Object.entries(DIG_SITES).filter(([sec]) => SECTORS.find((x) => x.id === sec)?.tier === 'E').flatMap(([, d]) => [...d.topics, ...d.finds]), ...Object.values(DUNGEON_FINDS).flatMap((x) => x.E ?? [])];
  for (const id of epic) if (!out.has(id) && !own.has(id % 1000)) out.set(id, relicDef(id, 'U', true, true));
  return [...out.values()];
})();
for (const p of RELICS) PRODUCT[p.key] = p;

/**
 * 売れるシリーズ（ランクの町ごとの市場。docs/ISLAND_PHASE1.md「売れるシリーズ・売れないシリーズ」）。
 * - Common・Uncommon：制限なし（いまの商品・復刻品がいまどおり売れる）。
 * - Rare：Rare の 4 町の荒れ地（お題・出土品）のシリーズの Rare の復刻品だけが売れる。いまの商品（Common は commonPull のまま）・
 *   Common・Uncommon の復刻品はいまどおり。Common・Uncommon のダンジョンで出た Rare のシリーズは入れない（Rare の町では売れない）。
 * - Epic（段 H1）：Epic の 3 町の荒れ地のシリーズの Epic の復刻品・Rare の荒れ地のシリーズの Rare の復刻品 ＋ これまでの各ダンジョンで掘った
 *   Rare 以上のシリーズの「骨董の需要」（antique。値段と需要は ANTIQUE）。Legendary（まだ無い。soon）は骨董のデータだけ。
 * relics・antique はシリーズの key。町ごとの違いは無し（ランクの単位で決める）
 */
export interface SeriesMarket {
  /** Rare 以上の復刻品のうち、このランクの町で売れるシリーズ（無ければ制限なし） */
  relics?: string[];
  /** 骨董の需要：ダンジョンで掘った Rare 以上のシリーズ（Epic 以降） */
  antique?: string[];
  /** まだ遊べないランク（データの準備だけ） */
  soon?: boolean;
}
export const MARKET_SERIES: Record<Tier, SeriesMarket> = (() => {
  const uniq = (xs: number[]) => [...new Set(xs.map((e) => seriesOf(e)))].sort();
  const rDig = uniq(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('r')).flatMap(([, d]) => [...d.topics, ...d.finds]));
  const eDig = uniq(Object.entries(DIG_SITES).filter(([id]) => id.startsWith('e')).flatMap(([, d]) => [...d.topics, ...d.finds]));
  // 骨董の需要：これまでの各ダンジョン（Common・Uncommon・Rare・Epic のセクタ）の奥で出る Rare 以上のシリーズ（荒れ地のシリーズとは重ならない）
  const antique = uniq(Object.values(DUNGEON_FINDS).flatMap((x) => [...(x.R ?? []), ...(x.E ?? []), ...(x.L ?? [])]));
  // Epic の町 ①（段 H1）：Epic の町では、Epic の荒れ地のシリーズの Epic の復刻品・Rare の荒れ地のシリーズの Rare の復刻品（前のランクの復刻品）・骨董が売れる
  return { C: {}, U: {}, R: { relics: rDig }, E: { relics: [...new Set([...rDig, ...eDig])].sort(), antique }, L: { soon: true, antique } };
})();
/** 復刻品のランク（Rare 以上の復刻品：Rare・Epic。ほかは null） */
export const relicTier = (p: Pick<ProductDef, 'relic'> | undefined): Tier | null => (p?.relic?.epic ? 'E' : p?.relic?.rare ? 'R' : null);
/** その復刻品が、そのランクの町で骨董として売れるか（段 H1：ダンジョンで掘った Rare 以上のシリーズ。Epic 以上の町だけ） */
export function isAntique(p: Pick<ProductDef, 'relic'> | undefined, tier: Tier): boolean {
  if (!p?.relic?.rare) return false;
  const m = MARKET_SERIES[tier];
  if (m.soon || !m.antique || !m.relics) return false;
  return m.antique.includes(seriesOf(p.relic.ext));
}
/**
 * その復刻品が、そのランクの町で売れるか（Rare 以上の復刻品だけ市場で決まる。ほかはいつも売れる）。
 * 町より上のランクの復刻品（Rare の町の Epic の復刻品）は、シリーズが同じでもその町では売れない
 */
export function relicSells(p: Pick<ProductDef, 'relic'> | undefined, tier: Tier): boolean {
  if (!p?.relic?.rare) return true;
  const m = MARKET_SERIES[tier];
  if (m.soon || !m.relics) return true;
  const order: Tier[] = ['C', 'U', 'R', 'E', 'L'];
  if (order.indexOf(relicTier(p) ?? 'R') > order.indexOf(tier)) return false;
  const k = seriesOf(p.relic.ext);
  return m.relics.includes(k) || (m.antique ?? []).includes(k);
}
/**
 * 骨董の値段と需要（段 H1：Epic の町の骨董の需要）：その復刻品の値段 × price・需要（復刻品 1 種の需要）× demand。
 * 骨董は「掘ってきた人へのご褒美」：1 個は高いが、1 種の需要は復刻品より少ない（Epic の町の売上の柱は Epic の復刻品と商品）。docs/ISLAND_BALANCE.md の v23
 */
export const ANTIQUE = { price: 1.2, demand: 0.3 };
/** その遺物（エクステの id）の復刻品。無ければ undefined */
export const relicOf = (ext: number): ProductDef | undefined => PRODUCT[relicKey(ext)];

/**
 * 石板（読み物）。Common：栄えていた頃の Lime の職人の町／Uncommon：Lime がほかの国とつながって交易していた頃（9 つのランドの謎は伏線）／
 * Rare：Lime がなぜ荒れたのか（9 つのランドの謎に一歩近づく）／Epic：裂けたあと、Lime の人々が何を残し、どう立て直そうとしたか
 */
export interface Tablet {
  id: string;
  sector: string;
  title: string;
  text: string;
  /** まだ読めない（準備中の枠。いまは無い） */
  soon?: boolean;
}
export const TABLETS: Tablet[] = [
  { id: 'tab_c1', sector: 'c1', title: t('職人の町', 'The crafters’ town'), text: t('栄えていた頃の Lime には、ここに職人の町があった。人々は工房に集まり、道具から暮らしの品まで、なんでも自分たちの手で作った。', 'In Lime’s golden age, a crafters’ town stood here. People gathered in workshops and made everything by hand, from tools to everyday goods.') },
  { id: 'tab_c2', sector: 'c2', title: t('湖のガラス', 'Glass by the lake'), text: t('湖のほとりで、Lime の職人たちは砂からガラスを吹いた。町で作った品は、舟で湖の向こうへ運ばれた。', 'By the lake, Lime’s crafters blew glass from sand. Goods made in town were ferried across the water.') },
  { id: 'tab_c3', sector: 'c3', title: t('丘の鍛冶場', 'The hill forge'), text: t('丘の鍛冶場では、鉄を打つ音が一日じゅう響いた。ここで鍛えた道具が、町の仕事を支えた。', 'At the hill forge, hammers rang all day. The tools forged here kept the town at work.') },
  { id: 'tab_c4', sector: 'c4', title: t('にぎやかな市場', 'The busy market'), text: t('栄えていた Lime の町には大勢が暮らし、家具も服も、隣どうしで作って分け合った。市場はいつもにぎわっていた。', 'Many lived in Lime’s thriving town, making furniture and clothes for each other. The market was always lively.') },
  { id: 'tab_c5', sector: 'c5', title: t('職人の祭り', 'The crafters’ festival'), text: t('年に一度、職人たちは作った品を持ち寄り、祭りで見せ合った。いちばんの品を作った者が、町の長になった。', 'Once a year, crafters showed their work at a festival. Whoever made the finest piece became head of the town.') },
  { id: 'tab_c6', sector: 'c6', title: t('森と畑の村', 'Village of woods and fields'), text: t('森の木を切り、畑を耕し、町の職人に材料を届けた。この村が、町の暮らしを支えていた。', 'They felled trees, tilled fields and brought materials to the town’s crafters. This village kept the town going.') },
  { id: 'tab_c7', sector: 'c7', title: t('はじまりの国', 'The Land of Beginnings'), text: t('職人たちは紙に技を書き残し、弟子へと伝えた。「はじまりの国」の名は、ここで技がはじまったことから。', 'Crafters wrote their skills on paper and passed them to apprentices. The “Land of Beginnings” is named for where the crafts began.') },
  { id: 'tab_c8', sector: 'c8', title: t('町の外へ', 'Beyond the town'), text: t('職人の町はやがて大きくなり、店どうしの競い合いが始まった。粘土の人形は町の外へも売られたが、ある時から、町は静かに荒れていった。', 'The crafters’ town grew, and shops began to compete. Clay dolls were sold far beyond its walls — until, one day, the town quietly fell to ruin.') },
  { id: 'tab_u1a', sector: 'u1', title: t('どこへでも行ける港', 'A harbor to anywhere'), text: t('この港から、Lime の船はどこへでも行けた。海の向こうの国々と品物を交わし、港はいつも荷であふれていた。', 'From this harbor, Lime’s ships could go anywhere. They traded with lands across the sea, and the docks overflowed with cargo.') },
  { id: 'tab_u1b', sector: 'u1', title: t('古い海図', 'An old sea chart'), text: t('古い海図には、9 つの土地が 1 本の航路で結ばれている。いまの地図には、その航路が無い。', 'An old chart links nine lands with a single route. Today’s maps show no such route.') },
  { id: 'tab_u2a', sector: 'u2', title: t('山からの鉄', 'Iron from the mountains'), text: t('鍛冶の町の鉄は、遠いグラファイトの山から運ばれてきた。Lime と山の国は、交易の道でつながっていた。', 'The smiths’ iron came from the far Graphite mountains. Lime and the mountain land were joined by a trade road.') },
  { id: 'tab_u2b', sector: 'u2', title: t('途切れた道', 'The broken road'), text: t('道は 9 つの土地を巡っていた。どこで道が切れたのか、記録は途中で途切れている。', 'The road once circled all nine lands. Where it broke, the records do not say.') },
  { id: 'tab_u3a', sector: 'u3', title: t('9 つの品の市場', 'A market of nine lands'), text: t('坂の上の市場には、9 つの土地の品が並んだ。タンジェリンの果実も、ここでは珍しくなかった。', 'The hilltop market sold goods from all nine lands. Even Tangerine fruit was nothing unusual here.') },
  { id: 'tab_u3b', sector: 'u3', title: t('ひとつの通貨', 'One currency'), text: t('商人の帳簿には、9 つの土地の名が同じ通貨で書かれている。世界は、もとは 1 つだった。', 'Merchants’ ledgers list all nine lands in one currency. The world was once one.') },
  { id: 'tab_u4a', sector: 'u4', title: t('9 色の織物', 'A cloth of nine colors'), text: t('織物の模様は、9 つの土地の色を 1 枚に織り込んだもの。どの色も、となりの色とつながっている。', 'The pattern weaves the colors of nine lands into one cloth. Every color touches the next.') },
  { id: 'tab_u4b', sector: 'u4', title: t('ひとつの谷', 'One valley'), text: t('グレープとセージの職人は、同じ機で布を織った。2 つの土地は、もとは 1 つの谷だった。', 'Grape and Sage weavers shared one loom. The two lands were once a single valley.') },
  { id: 'tab_u5a', sector: 'u5', title: t('石の地図', 'The stone map'), text: t('大きな街の広場に、9 つの土地を描いた石の地図がある。真ん中に、ひとつの大地が描かれている。', 'In the city square lies a stone map of nine lands. At its center is a single, whole land.') },
  { id: 'tab_u5b', sector: 'u5', title: t('霧の向こう', 'Beyond the mist'), text: t('ある日、大地は 9 つに分かれた。そのうちいくつかは、霧の向こうに見えなくなったという。', 'One day, the land split into nine. Some of them, it is said, vanished beyond the mist.') },
  // Rare（Rare の町 ①）：Lime がなぜ荒れたのか（店どうしの奪い合い・掘りすぎた大地・9 つに裂けた大地・最後の船）。9 つのランドの謎に一歩近づく
  { id: 'tab_r1a', sector: 'r1', title: t('緑の門', 'The green gate'), text: t('グリーン・マウスは、9 つのランドへ続く道の入り口だった。門をくぐれば、どのランドへも一日で着いたという。', 'Green Mouse was the entrance to the roads of the nine lands. Through its gate, they say, any land was a day away.') },
  { id: 'tab_r1b', sector: 'r1', title: t('止まった時計', 'The stopped clock'), text: t('町の大時計は、ある日の同じ時刻で止まっている。その日、大地が大きく揺れ、門は二度と開かなかった。', 'The town clock stopped at one hour of one day. That day the earth shook hard, and the gate never opened again.') },
  { id: 'tab_r2a', sector: 'r2', title: t('霞の市', 'The market in the haze'), text: t('霞の市では、ストロベリーやブルーベリーの商人が肩を並べた。品物が足りなくなると、店どうしの奪い合いが始まった。', 'At the market in the haze, Strawberry and Blueberry merchants stood side by side. When goods ran short, the shops began to fight over customers.') },
  { id: 'tab_r2b', sector: 'r2', title: t('値札の戦い', 'The price-tag war'), text: t('値下げの競い合いは止まらなかった。職人は休まず作らされ、町から笑い声が消えていった。', 'The price cuts never stopped. Crafters worked without rest, and laughter faded from the town.') },
  { id: 'tab_r3a', sector: 'r3', title: t('掘りすぎた大地', 'The over-dug earth'), text: t('もっと多くの石と鉄を求めて、人々は大地の深くまで掘った。やがて地の底から、低いうなりが聞こえ始めた。', 'Wanting ever more stone and iron, people dug deep into the earth. Soon a low rumble rose from below.') },
  { id: 'tab_r3b', sector: 'r3', title: t('裂け目', 'The rift'), text: t('ある夜、坑道の奥から大地が裂けた。裂け目は 9 つに広がり、ランドとランドを引き離した。', 'One night the earth split open from deep in the mines. The rift spread nine ways and pulled the lands apart.') },
  { id: 'tab_r4a', sector: 'r4', title: t('最後の船', 'The last ship'), text: t('最後の船がこの港を出たとき、海の向こうのルビーの灯は、もう霧の中だった。Lime は独りになった。', 'When the last ship left this harbor, the lights of Ruby across the sea were already lost in the mist. Lime was alone.') },
  { id: 'tab_r4b', sector: 'r4', title: t('もう一度ここから', 'From here, once more'), text: t('残った人々は町を捨てず、職人の技を紙に書き残した。いつか誰かが、もう一度ここから始められるように。', 'Those who stayed did not abandon the town. They wrote down the crafters’ skills, so that someday someone could begin again from here.') },
  // Epic（段 H1：Epic の町 ①）：裂けたあと、Lime の人々が何を残し、どう立て直そうとしたか（集まって数え合う・分け合う・種を守る・掘りすぎない・灯をともす・返事）
  { id: 'tab_e1a', sector: 'e1', title: t('寄り合いの鐘', 'The gathering bell'), text: t('裂けた夜が明けると、残った人々はこの丘に集まった。鐘を鳴らし、名前を呼び合って、ひとりずつ数えた。', 'When the night of the rift was over, those who were left gathered on this hill. They rang a bell, called each other’s names, and counted everyone, one by one.') },
  { id: 'tab_e1b', sector: 'e1', title: t('分け合いの帳面', 'The sharing ledger'), text: t('人々は一冊の帳面に、持っている道具と食べ物を書き出した。足りない人には、ある人が分けた。奪い合いは、もうしないと決めた。', 'They listed every tool and every bit of food in a single ledger. Whoever had, shared with whoever lacked. They decided never to fight over things again.') },
  { id: 'tab_e2a', sector: 'e2', title: t('守られた種', 'The saved seeds'), text: t('畑は裂け目に呑まれたが、ひと袋の種だけは残った。人々はそれを 9 つに分け、いつか会うランドのぶんも取っておいた。', 'The fields fell into the rift, but one bag of seeds was saved. They split it nine ways, keeping shares for the lands they hoped to meet again.') },
  { id: 'tab_e2b', sector: 'e2', title: t('掘りすぎない約束', 'The promise not to over-dig'), text: t('「土は借りもの。掘ったら埋め戻す」――畑の石に刻まれた約束。Lime の人々は、栄えすぎた昔をくり返さないと誓った。', '“The earth is only lent to us. What you dig, fill back in.” — a promise carved on a field stone. Lime’s people swore never to repeat the days of too much.') },
  { id: 'tab_e3a', sector: 'e3', title: t('太陽の塔', 'The sun tower'), text: t('人々は町でいちばん高い塔に灯をともした。霧の向こうのルビーやストロベリーのランドに、Lime がまだここにいると知らせるために。', 'They lit a beacon atop the tallest tower in town, to tell Ruby, Strawberry and the other lands beyond the mist that Lime was still here.') },
  { id: 'tab_e3b', sector: 'e3', title: t('返事の光', 'An answering light'), text: t('ある晩、霧の向こうで小さな光がまたたいた。返事だったのかもしれない。9 つのランドは、まだ同じ空の下にある。', 'One night, a small light flickered beyond the mist. Perhaps it was an answer. The nine lands still lie under the same sky.') },
];
export const TABLET: Record<string, Tablet> = Object.fromEntries(TABLETS.map((x) => [x.id, x]));
/**
 * 段 K：石板に記された「ランドの運営のノウハウ」の一節（石板ごとに 1 つ。読むと、その方針が選べるようになる＝POLICIES の open.tablet）。
 * Common は 1 枚で 1 つ。Uncommon・Rare・Epic は同じ町の 2 枚（a・b）で 1 つ（a が前半・b が後半）
 */
export const TABLET_KNOW: Record<string, string> = {
  tab_c1: t('町の長は、道具の選び方を職人に任せた。任された者ほど、よく考えて速く動いた。', 'The town head let crafters choose their own tools. Those trusted thought harder and moved faster.'),
  tab_c2: t('舟が着く日に合わせてガラスを吹けば、割れずに済み、倉も空いた。要るものを、要る時に、要るだけ。', 'Blow glass to match the day the boat arrives: nothing breaks and the store stays clear. What’s needed, when needed, as much as needed.'),
  tab_c3: t('鍛冶場は、すべての道具を打つのをやめた。いちばん良い鍬に火を集めると、遠くの村からも買いに来た。', 'The forge stopped making every tool. When it put its fire into the finest hoe, far villages came to buy.'),
  tab_c4: t('市場の入り口には「隣の暮らしを良くするために作る」と書いてあった。迷ったときは、皆でこの言葉に戻った。', 'Over the market gate it said, “We make things to better our neighbors’ lives.” When in doubt, everyone came back to those words.'),
  tab_c5: t('祭りの前に、職人は大きな目標を 1 つと、確かめられる成果を 3 つ書いて壁に貼った。季節ごとに見直した。', 'Before the festival, each crafter pinned up one bold goal and three results anyone could check, and reviewed them every season.'),
  tab_c6: t('木を 1 本切れば 2 本植えた。村は、森が続くかぎり町を支えられると知っていた。', 'For every tree felled, they planted two. The village knew it could keep the town only as long as the forest lasted.'),
  tab_c7: t('新しい品は、まず 1 つだけ作って市に出した。売れ方を見て直し、また出した。', 'A new item was first made just once and taken to market. They watched how it sold, fixed it, and tried again.'),
  tab_c8: t('町は、得意な品を磨く工房と、まだ誰も知らない品を試す工房を分けて持った。片方だけでは、町はやがて止まる。', 'The town kept one workshop to polish its best goods and another to try what no one knew yet. With only one, a town stalls.'),
  tab_u1a: t('港の商人は言った。「皆が奪い合う海で網を投げるな」', 'The harbor merchants said, “Don’t cast your net where everyone fights for fish.”'),
  tab_u1b: t('「まだ誰もいない海を探せ。そこでは値を下げなくても、魚が獲れる」', '“Find a sea where no one sails yet. There the fish come without cutting your price.”'),
  tab_u2a: t('鍛冶の町の親方は、運ぶ・待つ・積み直すを「むだ」と呼び、1 つずつ数えた。', 'The smith masters called hauling, waiting and re-stacking “waste” and counted each one.'),
  tab_u2b: t('むだを 1 つ消すたびに、道具は早く届いた。速さは、足すより引くことで生まれる。', 'Each waste removed got tools out sooner. Speed comes from taking away, not adding.'),
  tab_u3a: t('9 つの土地の帳簿は、ばらばらの字と数え方で書かれていた。', 'The ledgers of the nine lands were kept in different scripts and different counts.'),
  tab_u3b: t('商人たちは帳簿を 1 つの書き方にそろえた。どの店の品も、ひと目で分かるようになった。', 'The merchants made every ledger follow one form. Every shop’s goods could be seen at a glance.'),
  tab_u4a: t('機を織る親方は、毎晩、弟子と 1 人ずつ短く話した。', 'Each night the master weaver had a short talk with each apprentice, one at a time.'),
  tab_u4b: t('糸のもつれと同じで、悩みも小さいうちなら、すぐにほどけた。', 'Like a tangled thread, a worry caught early came loose with ease.'),
  tab_u5a: t('新しい道具の工夫は、門を 1 つずつくぐらせて確かめた。', 'Every new tool idea had to pass through gates, one by one.'),
  tab_u5b: t('見込みの無い工夫は早めに止め、見込みのある工夫に人と材を回した。', 'Ideas without promise were stopped early; people and materials went to the ones with promise.'),
  tab_r1a: t('門番は、通る旅人に、何に困っているかを尋ねた。', 'The gatekeeper asked each traveler what troubled them.'),
  tab_r1b: t('困りごとに合う品を勧めると、旅人は門を通るたびに買っていった。', 'Offered goods that fit their troubles, travelers bought each time they passed.'),
  tab_r2a: t('値札の戦いのあと、ある店だけが客を取り戻した。', 'After the price-tag war, only one shop won its customers back.'),
  tab_r2b: t('その店は、まず働く人を大事にした。満ち足りた店員の店に、客は何度も戻った。', 'That shop cared for its workers first. Customers kept returning to a shop of contented clerks.'),
  tab_r3a: t('掘りすぎた大地が裂けたように、休まない人も、いつか折れる。', 'As the over-dug earth split, so people who never rest will one day break.'),
  tab_r3b: t('残った人々は、働く日と休む日を決めた。よく休んだ者ほど、よく掘った。', 'Those who remained set days to work and days to rest. The well-rested dug best.'),
  tab_r4a: t('最後の船を見送った職人たちは、仕事ごとに要る技を書き出した。', 'After the last ship left, the crafters wrote down the skills each job needed.'),
  tab_r4b: t('何をする役かがはっきりすると、新しく来た者もすぐ持ち場に立てた。', 'Once each role was clear, newcomers could take their posts at once.'),
  tab_e1a: t('分け合いの帳面には、誰がどの工夫を考えたかも書かれていた。', 'The sharing ledger also recorded who had thought of each idea.'),
  tab_e1b: t('考えた者の名を守ると、皆が競って新しい工夫を持ち寄った。', 'When thinkers’ names were protected, everyone raced to bring new ideas.'),
  tab_e2a: t('種をまく前に、人々は食べる者の暮らしを見に行った。', 'Before sowing, they went to see how those who would eat really lived.'),
  tab_e2b: t('困りごとから考えた畑は、少ない種でも皆を満たした。', 'Fields planned from people’s troubles fed everyone, even from few seeds.'),
  tab_e3a: t('塔の灯の油は貴重だった。人々は、どの灯にどれだけ油を使ったかを数えた。', 'Beacon oil was precious. They counted how much oil each light burned.'),
  tab_e3b: t('灯ごとに油を数えると、むだに燃えている灯が分かった。', 'Counting oil light by light showed which ones burned for nothing.'),
};

/**
 * セクター長（町の長・シャドーヒーロー）の仮の絵：MCH のヒーローのデータに「シャドー」の区分が無いので、
 * セクタごとに replica のヒーロー（Common のセクタは RepC、Uncommon は RepB、Rare は RepA）を割り当てる。差し替えはここだけ（docs/ISLAND_ART_TODO.md）。
 */
export const SECTOR_CHIEF: Record<string, number> = {
  c1: 12023, // ミケランジェロ（職人の町のはじまり）
  c2: 12006, // アルキメデス（湖・水）
  c3: 12031, // ビスマルク（鉄の丘）
  c4: 12026, // 豊臣秀吉（大勢の暮らし・城下町）
  c5: 12030, // 出雲阿国（お祭り）
  c6: 12019, // 金太郎（森と畑）
  c7: 12036, // 樋口一葉（技を書き残した町）
  c8: 12041, // ベンジャミン・フランクリン（商売敵の町）
  u1: 13037, // マゼラン（どこへでも行ける港）
  u2: 13018, // 武蔵坊弁慶（金物・刀）
  u3: 13003, // 平賀源内（商人の坂・宣伝）
  u4: 13035, // 小野小町（織物）
  u5: 13044, // 徳川家康（大都市）
  // Rare（RepA）
  r1: 14008, // マルコ・ポーロ（9 つのランドへの門）
  r2: 14011, // マルクス（奪い合いの市）
  r3: 14007, // トーマス・エジソン（掘りすぎた坑道）
  r4: 14052, // フランシス・ドレーク（最後の船の港）
  // Epic（RepS。段 H1）
  e1: 15008, // 坂本龍馬（人と人をつないで立て直した町）
  e2: 15011, // 卑弥呼（種と土への祈り・掘りすぎない約束）
  e3: 15027, // ガリレオ・ガリレイ（空を見上げ、霧の向こうへ灯を送る塔）
};

/** 到着の案内の「この町の地層には[[〇〇]]が眠っているはず」（docs/ISLAND_PHASE1.md「お題・発表・調査依頼状」） */
export const DIG_THEME: Record<string, string> = {
  c1: t('職人の町のはじまり', 'the start of the crafters’ town'),
  c2: t('湖のガラス細工', 'the lakeside glasswork'),
  c3: t('丘の鍛冶場', 'the hill forge'),
  c4: t('大勢の暮らし', 'the life of many'),
  c5: t('職人の祭り', 'the crafters’ festival'),
  c6: t('森と畑の村', 'a village of woods and fields'),
  c7: t('書き残された技', 'crafts written down'),
  c8: t('粘土の人形', 'clay dolls'),
  u1: t('どこへでも行けた港', 'a harbor to anywhere'),
  u2: t('山からの鉄の道', 'the iron road from the mountains'),
  u3: t('9 つのランドの市場', 'a market of nine lands'),
  u4: t('9 色の織物', 'a cloth of nine colors'),
  u5: t('石の地図の都', 'the city of the stone map'),
  r1: t('9 つのランドへの門', 'the gate to the nine lands'),
  r2: t('奪い合いの市', 'the market of rivalry'),
  r3: t('掘りすぎた坑道', 'the over-dug mines'),
  r4: t('最後の船の港', 'the harbor of the last ship'),
  e1: t('人々が集まった寄り合いの丘', 'the hill where people gathered'),
  e2: t('守られた種の畑', 'the fields of the saved seeds'),
  e3: t('霧へ灯を送る太陽の塔', 'the sun tower that sends light into the mist'),
};

/** 発掘の依頼の報酬（RP。セクタの id の頭の文字＝ランク：Common 40・Uncommon 80・Rare 200・Epic 500） */
export const DIG_REQUEST_RP: Record<string, number> = { c: 40, u: 80, r: 200, e: 500 };
/** 発掘の依頼（セクタに 1 つ）：古い〇〇を掘り出す（お題以外の出土品から）。報酬は RP（Common 40・Uncommon 80・Rare 200） */
export const DIG_REQUEST: Record<string, { ext: number; name: string; from: string }> = {
  c1: { ext: 1111, name: t('懐中時計', 'Pocket Watch'), from: t('タオックスの町内会', 'Taox council') },
  c2: { ext: 1086, name: t('アンモナイト', 'Ammonite'), from: t('湖の漁師', 'A lake fisher') },
  c3: { ext: 1010, name: t('ノービスシールド', 'Novice Shield'), from: t('丘の鍛冶屋', 'A hill smith') },
  c4: { ext: 1179, name: t('ネズミ捕り', 'Mouse Trap'), from: t('キッチョムシティの町内会', 'Kitchom City council') },
  c5: { ext: 1064, name: t('フルート', 'Flute'), from: t('お祭りの楽団', 'The festival band') },
  c6: { ext: 1137, name: t('ハチミツ', 'Honey'), from: t('村の養蜂家', 'A village beekeeper') },
  c7: { ext: 1016, name: t('スクロール', 'Scrolls'), from: t('サクラコシティの町内会', 'Sakurako City council') },
  c8: { ext: 1092, name: t('ステゴエッグ', 'Stego Egg'), from: t('ペストタウンの古物商', 'A Pest Town antique dealer') },
  u1: { ext: 2647, name: t('クラブシェル', 'Crab Shell'), from: t('港の船大工', 'A harbor shipwright') },
  u2: { ext: 2153, name: t('鉄製パンジャンドラム', 'Iron Panjandrum'), from: t('鍛冶組合の長老', 'An elder of the smiths’ guild') },
  u3: { ext: 2111, name: t('エリート懐中時計', 'Elite Pocket Watch'), from: t('坂の時計屋', 'The slope watchmaker') },
  u4: { ext: 2016, name: t('エリートスクロール', 'Elite Scrolls'), from: t('織物組合の記録係', 'The weavers’ archivist') },
  u5: { ext: 2115, name: t('にゃ～さんのスクーター', 'Nya’s Scooter'), from: t('ザックシティの博物館', 'The Zack City museum') },
  r1: { ext: 3159, name: t('寿りんご', 'Auspicious Apple'), from: t('緑の門の果樹園', 'The green-gate orchard') },
  r2: { ext: 3105, name: t('女優鏡', 'Hollywood Mirror'), from: t('霞の市の芝居小屋', 'The haze-market playhouse') },
  r3: { ext: 3086, name: t('ステラアンモナイト', 'Stella Ammonite'), from: t('坑道の地質学者', 'A mine geologist') },
  r4: { ext: 3016, name: t('ウィズダムスクロール', 'Wisdom Scrolls'), from: t('港の記録係', 'The harbor archivist') },
  e1: { ext: 4172, name: t('ワニ革財布', 'Crocodile Leather Wallet'), from: t('分け合いの帳面の係', 'The keeper of the sharing ledger') },
  e2: { ext: 4184, name: t('光合成オオスカシバ', 'Photosynthetic Clearwing Moth'), from: t('畑の虫の博士', 'A field-insect scholar') },
  e3: { ext: 4160, name: t('月明かりのハンギングアクアリウム', 'Moonlit Hanging Aquarium'), from: t('太陽の塔の灯守', 'The keeper of the sun tower’s light') },
};

// ---------------------------------------------------------------- 商品開発・宣伝・調査・依頼・給与

/** アンコモンの開発：値段は Common の値段 × 40、10 日（「魔法の釜」が要る） */
export const DEV = { rate: 4, days: 10 };

/**
 * 宣伝の効く範囲（段 M1）：town＝出した町の自社の全店（段 1〜3。いままでどおり）・land＝同じランク（Common ランド・Uncommon ランド…）の町の全店・
 * all＝会社の全店。land・all の宣伝は会社のもの（町を移っても続く。`s.adFrom` に出した町）。任せている町には `AD_TIER.remote` を掛けて売上の倍率に足す
 */
export type AdScope = 'town' | 'land' | 'all';
/** 解禁の条件（段 M1）：いまの町の自社の店の数・店のある町の数・会社の月商（先月。いまの町 ＋ 任せている町）。or：どれか 1 つで解禁 */
export interface AdNeed {
  shops?: number;
  towns?: number;
  rev?: number;
  or?: boolean;
}
export interface Ad {
  id: string;
  name: string;
  note: string;
  cost: number;
  days: number;
  boost: number;
  /** 絵文字（段 M1。無ければ 📣） */
  icon?: string;
  /** 効く範囲（無ければ town） */
  scope?: AdScope;
  /** 期間の終わりに 1 回、ブランド力に足す（段 M1。上限 brandCap まで） */
  brand?: number;
  /** 解禁の条件（無ければいつでも。段 1〜3） */
  need?: AdNeed;
}
/**
 * 宣伝のはしご（段 M1。docs/SUCCESSOR_ROADMAP.md「段 M1 の実装」）。段 1〜3 は前のまま（値段・日数・効き目・範囲）。
 * 上の段は、店頭 → 近隣 → 市街 → 地域 → 全国で約 3 桁の相場の差を、会社の規模（店の数・月商）に釣り合う値段で。
 * 値段は「その段に合う月商の 3〜5% ／ 月」になる所に置いた（段を 1 つ飛ばして買うと 10〜20%＝攻めの投資）
 */
export const ADS: Ad[] = [
  { id: 'flyer', name: t('チラシ配り', 'Flyers'), note: t('10 日間、自社のお店の売り場の強さ +15%', 'Your shops’ pull +15% for 10 days'), cost: 1500, days: 10, boost: 0.15 },
  { id: 'poster', name: t('駅のポスター', 'Station posters'), note: t('30 日間、自社のお店の売り場の強さ +20%', 'Your shops’ pull +20% for 30 days'), cost: 5000, days: 30, boost: 0.2 },
  { id: 'event', name: t('店頭イベント', 'In-store event'), note: t('5 日間、自社のお店の売り場の強さ +50%', 'Your shops’ pull +50% for 5 days'), cost: 4000, days: 5, boost: 0.5 },
  { id: 'signage', icon: '🪧', name: t('駅のサイネージ', 'Station signage'), note: t('30 日間、同じ町の全店の売り場の強さ +15%', 'All shops in this town +15% pull for 30 days'), cost: 15000, days: 30, boost: 0.15, scope: 'town', need: { shops: 2 } },
  { id: 'vision', icon: '🪧', name: t('街頭の大型ビジョン', 'Street video wall'), note: t('14 日間、同じ町の全店の売り場の強さ +25%・ブランド力 +5（期間の終わりに）', 'All shops in this town +25% pull for 14 days; brand +5 when it ends'), cost: 50000, days: 14, boost: 0.25, scope: 'town', brand: 5, need: { shops: 3 } },
  { id: 'local_tv', icon: '📺', name: t('地域のテレビ・ラジオ', 'Regional TV & radio'), note: t('30 日間、同じランドの全店の売り場の強さ +20%・ブランド力 +15（期間の終わりに）', 'All shops in this land +20% pull for 30 days; brand +15 when it ends'), cost: 80000, days: 30, boost: 0.2, scope: 'land', brand: 15, need: { rev: 5_000_000 } },
  { id: 'billboard', icon: '🪧', name: t('一等地のビルボード', 'Prime-site billboard'), note: t('14 日間、全店の売り場の強さ +30%・ブランド力 +30（期間の終わりに）', 'All shops +30% pull for 14 days; brand +30 when it ends'), cost: 300000, days: 14, boost: 0.3, scope: 'all', brand: 30, need: { towns: 2, rev: 10_000_000, or: true } },
  { id: 'nat_tv', icon: '📺', name: t('全国のテレビ CM', 'National TV ads'), note: t('30 日間、全店の売り場の強さ +40%・ブランド力 +50（期間の終わりに。恒久）', 'All shops +40% pull for 30 days; brand +50 when it ends (lasting)'), cost: 1_000_000, days: 30, boost: 0.4, scope: 'all', brand: 50, need: { rev: 30_000_000 } },
];
/**
 * 宣伝の重ね掛けと範囲の数字（段 M1。ここ 1 か所）。
 * - cap：効いている宣伝の boost の和の上限（段 1〜3 だけの合計の最大 +85% と同じ。既存の通しを変えない）
 * - decay：上の段（signage から）の 2 本目以降の効き（大きい順に 1 本目 100%・2 本目 50%・3 本目 25%…）。段 1〜3 どうしは前のまま足す
 * - remote：任せている町（マネージャーの売上）への効き。売り場の強さがそのまま売上に出ないので半分
 * - auto.upper：自動の判断（部長の提案・カード・見通しの「いちばん効く宣伝」）に上の段を出すか。ゲームでは true。
 *   自動プレイ（scripts/island/sim.ts の SIM_AD）は通常・最短で false（段 1〜3 のまま。Sim の時間を変えない）
 */
export const AD_TIER = { cap: 0.85, decay: 0.5, remote: 0.5, auto: { upper: true } };

/** 他社の調査：段階ごとに分かることが増える（見習いの速さで 1 日 1） */
export const INTEL = [5, 12, 20];

export interface Mission {
  id: string;
  /** このセクタでだけ受けられる（無ければどこでも） */
  sector?: string;
  from: string;
  title: string;
  text: string;
  reward: number;
  /** 研究ポイントの報酬（受け取るときに会社の RP へ。以前の ✨ 1 つ = RP_PER_DUST） */
  rp?: number;
  /** 発掘の依頼：このエクステを掘り出す（研究ノートに 1 つ以上） */
  dig?: number;
  /** 受ける前の一言（段 UI1：中身と報酬は変えずに、気をつけることを添える） */
  note?: string;
}
export const MISSIONS: Mission[] = [
  { id: 'first_sale', from: t('町内会', 'Neighborhood council'), title: t('はじめての売上', 'First sale'), text: t('お店で商品を 1 つ売る', 'Sell one item in your shop'), reward: 1000 },
  { id: 'sensu100', from: t('近所の住民', 'A neighbor'), title: t('夏祭りにセンスを', 'Fans for the festival'), text: t('ひと月にセンスを 15 個売る', 'Sell 15 Sensu in one month'), reward: 3000 },
  { id: 'ad', from: t('町内会', 'Neighborhood council'), title: t('お店を知ってほしい', 'Let people know'), text: t('宣伝広報をする', 'Run an ad'), reward: 1000 },
  { id: 'two_shops', from: t('商店会', 'Merchants’ association'), title: t('通りににぎわいを', 'Liven up the street'), text: t('お店を 2 軒にする', 'Open a second shop'), reward: 3000, note: t('近くに建てると、自社のお店どうしでお客さんを食い合います。維持費とアルバイト代が毎月かかります（よろず屋は月 2,100 G）。', 'Built close by, your shops split the same customers. Upkeep and part-time pay cost every month (2,100 G for a general store).') },
  { id: 'research', from: t('商店会', 'Merchants’ association'), title: t('ライバルを知る', 'Know your rivals'), text: t('他社のお店を調査する', 'Research a rival store'), reward: 1500 },
  { id: 'lantern50', from: t('駅長', 'Stationmaster'), title: t('夜道を明るく', 'Light up the night'), text: t('ひと月にランタンを 10 個売る', 'Sell 10 Lanterns in one month'), reward: 3000 },
  { id: 'uncommon', from: t('収集家', 'A collector'), title: t('めずらしい品を', 'Something rare'), text: t('アンコモンを合わせて 5 個売る', 'Sell 5 Uncommons in total'), reward: 5000, rp: 40 },
  { id: 'rank3', from: t('商店会', 'Merchants’ association'), title: t('エリアの顔に', 'Face of the area'), text: t('月の報告でエリア 3 位以内に入る', 'Finish a month in the area top 3'), reward: 5000, rp: 40 },
  // セクタの依頼（そのセクタでだけ受けられる。id はセーブと繋がる）
  // 湖・丘の依頼は、そのセクタの「まだ誰も売っていない」商品（ランタン・マレットは他店で供給が足りているので、ゴブレット・ナイフに）
  { id: 'c2_goblet', sector: 'c2', from: t('湖の宿', 'The lakeside inn'), title: t('湖畔で乾杯', 'A toast by the lake'), text: t('ひと月にゴブレットを 10 個売る', 'Sell 10 Goblets in one month'), reward: 4000, rp: 40 },
  { id: 'c2_top', sector: 'c2', from: t('ユーホタウンの町内会', 'Yuho Town council'), title: t('湖の一番店', 'Top shop on the lake'), text: t('ユーホタウンで 2 か月続けて 1 位になる', 'Become #1 in Yuho Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'c3_knife', sector: 'c3', from: t('丘の上の大工さん', 'A hilltop carpenter'), title: t('ナイフを 10 本', 'Ten Knives'), text: t('ひと月にナイフを 10 本売る', 'Sell 10 Knives in one month'), reward: 4000, rp: 40 },
  { id: 'c3_top', sector: 'c3', from: t('リデル・ヒルズの町内会', 'Riddle Hills council'), title: t('丘の一番店', 'Top shop on the hill'), text: t('リデル・ヒルズで 2 か月続けて 1 位になる', 'Become #1 in Riddle Hills two months in a row'), reward: 10000, rp: 40 },
  { id: 'c4_top', sector: 'c4', from: t('キッチョムシティの町内会', 'Kitchom City council'), title: t('町いちばんの店', 'Top shop in town'), text: t('キッチョムシティで 2 か月続けて 1 位になる', 'Become #1 in Kitchom City two months in a row'), reward: 10000, rp: 40 },
  { id: 'c5_top', sector: 'c5', from: t('お祭りの実行委員会', 'The festival committee'), title: t('お祭りの顔に', 'Face of the festival'), text: t('オマツリタウンで 2 か月続けて 1 位になる', 'Become #1 in Omatsuri Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'c6_top', sector: 'c6', from: t('ジラ・カントリーの村長', 'Zira Country’s village head'), title: t('村の一番店', 'Top shop in the village'), text: t('ジラ・カントリーで 2 か月続けて 1 位になる', 'Become #1 in Zira Country two months in a row'), reward: 10000, rp: 40 },
  { id: 'c7_top', sector: 'c7', from: t('サクラコシティの町内会', 'Sakurako City council'), title: t('桜の一番店', 'Top shop under the blossoms'), text: t('サクラコシティで 2 か月続けて 1 位になる', 'Become #1 in Sakurako City two months in a row'), reward: 10000, rp: 40 },
  { id: 'c8_top', sector: 'c8', from: t('ペストタウンの商店会', 'Pest Town merchants'), title: t('激戦区の一番店', 'Top of the battleground'), text: t('ペストタウンで 2 か月続けて 1 位になる', 'Become #1 in Pest Town two months in a row'), reward: 10000, rp: 40 },
  { id: 'u1_dev', sector: 'u1', from: t('港の商人', 'A harbor merchant'), title: t('新しい品を', 'Something new'), text: t('アンコモンを 1 つ開発する', 'Develop one Uncommon'), reward: 8000, rp: 40 },
  { id: 'u1_top', sector: 'u1', from: t('ウメコタウンの商工会', 'Umeko Town guild'), title: t('港の一番店', 'Top shop in the harbor'), text: t('ウメコタウンで 2 か月続けて 1 位になる', 'Become #1 in Umeko Town two months in a row'), reward: 30000, rp: 80 },
  { id: 'u2_top', sector: 'u2', from: t('ヤツカノタウンの鍛冶組合', 'Yatsukano smiths’ guild'), title: t('金物の町の一番店', 'Top shop in the hardware town'), text: t('ヤツカノタウンで 2 か月続けて 1 位になる', 'Become #1 in Yatsukano Town two months in a row'), reward: 32000, rp: 80 },
  { id: 'u3_ads', sector: 'u3', from: t('坂の商店会', 'Slope merchants'), title: t('坂を宣伝で', 'Advertise the slope'), text: t('宣伝を 2 種類以上同時にする', 'Run 2 or more kinds of ads at once'), reward: 6000 },
  { id: 'u3_top', sector: 'u3', from: t('エムケーシティの商店会', 'MK City association'), title: t('坂の一番店', 'Top shop on the slope'), text: t('エムケーシティで 2 か月続けて 1 位になる', 'Become #1 in MK City two months in a row'), reward: 35000, rp: 80 },
  { id: 'u4_top', sector: 'u4', from: t('ゴリ・ラグズの織物組合', 'Gori Rugs weavers’ guild'), title: t('織物の町の一番店', 'Top shop in the weaving town'), text: t('ゴリ・ラグズで 2 か月続けて 1 位になる', 'Become #1 in Gori Rugs two months in a row'), reward: 38000, rp: 80 },
  { id: 'u5_top', sector: 'u5', from: t('ザックシティの商工会議所', 'Zack City chamber of commerce'), title: t('大都市の一番店', 'Top shop in the big city'), text: t('ザックシティで 2 か月続けて 1 位になる', 'Become #1 in Zack City two months in a row'), reward: 40000, rp: 80 },
  // 発掘の依頼（セクタに 1 つ。id は <セクタ>_dig。報酬は RP だけ）
  ...Object.entries(DIG_REQUEST).map(([sec, q]): Mission => ({
    id: `${sec}_dig`,
    sector: sec,
    from: q.from,
    title: t(`古い${q.name}を探して`, `Find an old ${q.name}`),
    text: t(`発掘場で「${q.name}」を掘り出す`, `Dig up a ${q.name} at the dig site`),
    reward: 0,
    rp: DIG_REQUEST_RP[sec.charAt(0)] ?? 40,
    dig: q.ext,
  })),
];
/** 依頼の報酬の文（お金・RP。RP だけの依頼はお金を書かない） */
export const rewardText = (m: Mission) =>
  m.reward > 0 && m.rp ? t(`報酬 ${m.reward.toLocaleString('en-US')} G・研究 ${m.rp} RP`, `Reward ${m.reward.toLocaleString('en-US')} G + ${m.rp} RP`) : m.reward > 0 ? t(`報酬 ${m.reward.toLocaleString('en-US')} G`, `Reward ${m.reward.toLocaleString('en-US')} G`) : t(`報酬 研究 ${m.rp ?? 0} RP`, `Reward ${m.rp ?? 0} RP`);

/** 賞与：スタミナが満タンになる。昇給：作業の速さ +5%（3 段まで）、月給 +15%（基準の月給に対して） */
export const PAY = { bonusBase: 800, bonusRate: 0.3, raiseSpeed: 0.05, raiseWage: 0.15, raiseMax: 3 };

// ---------------------------------------------------------------- 調達ランク

/**
 * 調達ランク（Lv.1〜100）。月に買える素材の数の合計に上限がある（ランクとスキルで上がる）。
 * 経験値：買った数 1 個で 1（調達係が買うと適性の速さ倍）＋ 1 回の買い付けで 5。
 */
export const PROC = { maxLv: 100, base: 100, perLv: 20, expBase: 50, expPerLv: 10, perBuy: 5 };
/** 次のランクまでの経験値 */
export const procNeed = (lv: number) => PROC.expBase + PROC.expPerLv * lv;

// ---------------------------------------------------------------- ゲームの進行速度

/** 1 日の長さ（ms、標準）。体感に合わせて 1.2 秒（ひと月 36 秒） */
export const DAY_BASE_MS = 1200;
/** 進行速度（システム → 進行速度）。1.5 倍・2 倍はスキルで選べるようになる */
export const PACES: { v: number; skill?: string }[] = [{ v: 1 }, { v: 1.5, skill: 'pace1' }, { v: 2, skill: 'pace2' }];

// ---------------------------------------------------------------- ヒーローの育成（段 E1。docs/ISLAND_PHASE1.md「ヒーローの育成」）

/** ヒーローのレアリティ（育成の段）。N＝Novice（MCH の novice。レアリティ無し）・LL＝Limited Legendary（もとから Legendary のヒーローだけ） */
export type HeroRarity = 'N' | 'C' | 'U' | 'R' | 'E' | 'L' | 'LL';
export const HERO_RARITIES: HeroRarity[] = ['N', 'C', 'U', 'R', 'E', 'L', 'LL'];
/** 強化アイテム（昇格の証）：昇格したあとのレアリティで呼ぶ（'C' は Novice → Common に使う） */
export type PromoItem = Exclude<HeroRarity, 'N'>;
export const PROMO_ITEMS: PromoItem[] = ['C', 'U', 'R', 'E', 'L', 'LL'];
/** パッシブスキルの種類（部門と結び付ける。効き目は model.ts の speed・drainOf・gainXp・closeCompanyMonth） */
export type PassiveKind = 'craft' | 'haul' | 'sell' | 'scout' | 'dig' | 'mentor' | 'manage' | 'system';

/**
 * ヒーローの育成の数字（1 か所）。
 * - cap：レアリティの上限 Lv（ユーザー決定）。
 * - mul：能力値の倍率。Lv1 は ×1（いまの能力値）。もとのレアリティの上限 Lv で ×(1 + atCap)。そこから先は 1 Lv ごとに +beyond、
 *   Limited Legendary（Lv101〜120）は 1 Lv ごとに +limited。昇格 1 回ごとに +promo（その場の上乗せ）。
 *   能力値ごとの伸び（lo〜hi）は MCH の Lv1 → 最大 Lv の伸び方の比（3 つの平均を 1 に）。HP（スタミナ）は伸ばさない。
 * - curve：Lv L に届くまでの経験値の合計 ＝ k ×（L − 1）^p。
 * - xp：働いた日の経験値（仕事ごと）× いるセクタのランクの倍率（tier）。マネージャー・復興の担当は会社の月の締めで 30 日ぶん。
 *   OJT：担当のある人の経験値 +ojt × Lv の倍率。社内研修：技の修行中の経験値 +training × Lv の倍率。
 * - passiveAt：パッシブが開く Lv（6 つ）。passiveStep：昇格で段が 1 つ上がるごとの効き目の上乗せ（段 1 の v に対して）。
 * - items：強化アイテムの入り方（町のランクごとにもらうアイテム）。dungeon：ダンジョンの layer 枚目より奥をはがしたマスごとに odds の確率、
 *   deep 枚目より奥は 1 つ上のアイテム（Legendary の町の奥の限定の王冠は、その ll 倍の確率）。
 */
/**
 * 役職（事業部長・セクター長）を兼ねられる数（段 UI5b・組織図の決まり。ユーザー 2026-11-03）。ふつうは 1（兼任しない）。
 * ヒーローの固有の能力として、多くの分野で活躍した人物だけ 2 にする（docs/heroes/research の史実から。のちの段 P で見直す）。
 * 持ち場（作業台・調達など）の仕事は役職と別に数える（部長は町の持ち場と兼ねてよい）。キーは MCH のヒーローの番号（下 4 桁。復刻の 1xxxx も同じ人物）
 */
export const HERO_MULTI_ROLE: Record<number, number> = {
  /** レオナルド・ダ・ビンチ（絵画・解剖学・工学・建築） */
  5005: 2,
  /** ベンジャミン・フランクリン（印刷業・科学・外交・政治） */
  2041: 2,
  /** 平賀源内（本草学・発明・鉱山開発・戯作） */
  3003: 2,
};
/** そのヒーローが兼ねられる役職の数（ふつう 1） */
export const multiRole = (hero: number) => HERO_MULTI_ROLE[hero % 10000] ?? 1;
export const HERO_GROWTH = {
  cap: { N: 40, C: 60, U: 70, R: 80, E: 90, L: 100, LL: 120 } as Record<HeroRarity, number>,
  mul: { atCap: 0.35, beyond: 0.002, limited: 0.0175, promo: 0.05, lo: 0.7, hi: 1.3 },
  curve: { k: 60, p: 1.4 },
  xp: {
    day: { craft: 10, transport: 10, buy: 10, shop: 10, explore: 10, intel: 10, dig: 12, train: 12, side: 6, manager: 20, lead: 13 } as Record<Task, number>,
    /** 任せ方の 4 段（段 D）：チームリーダー 1 日 13・事業部長 1 日 16（セクター長＝マネージャーは 20・復興の担当は 25）。上の役目ほど多い */
    leader: 13,
    head: 16,
    revive: 25,
    tier: { C: 1, U: 2, R: 4, E: 8, L: 12 } as Record<Tier, number>,
    ojt: 0.2,
    training: 0.3,
    /** 人事のパッシブ（仲間の経験値）を合わせた上限 */
    mentorMax: 0.3,
  },
  passiveAt: [10, 30, 50, 70, 90, 110],
  passiveStep: 0.25,
  items: {
    present: { C: 'C', U: 'U', R: 'R', E: 'E', L: 'L' } as Record<Tier, PromoItem>,
    clear: { C: 'C', U: 'U', R: 'R', E: 'E', L: 'LL' } as Record<Tier, PromoItem>,
    mission: { C: 'C', U: 'C', R: 'U', E: 'R', L: 'E' } as Record<Tier, PromoItem>,
    dungeon: { layer: 3, deep: 5, odds: 0.02, ll: 0.25 },
  },
  /** 古いセーブ（版 11 まで）の雇用中のヒーロー：会社の月数 × days 日ぶん働いたとして Lv を決める（創業の 3 人は × 1、雇った人は × half） */
  migrate: { days: 12, half: 0.5 },
};
/** 上限 Lv */
export const capLv = (r: HeroRarity) => HERO_GROWTH.cap[r];
/** レアリティの名前・色（Novice は銅、Limited Legendary は特別な色） */
export const HERO_RARITY: Record<HeroRarity, { name: string; short: string; color: string }> = {
  N: { name: t('ノービス', 'Novice'), short: 'N', color: '#a08a6a' },
  C: { name: t('コモン', 'Common'), short: 'C', color: '#b9b9b9' },
  U: { name: t('アンコモン', 'Uncommon'), short: 'U', color: '#63d471' },
  R: { name: t('レア', 'Rare'), short: 'R', color: '#4fa8ff' },
  E: { name: t('エピック', 'Epic'), short: 'E', color: '#c77dff' },
  L: { name: t('レジェンド', 'Legendary'), short: 'L', color: '#ffb627' },
  LL: { name: t('リミテッド・レジェンド', 'Limited Legendary'), short: 'LL', color: '#ff5fc8' },
};
/** 強化アイテムの名前 */
export const PROMO_ITEM: Record<PromoItem, { name: string; note: string }> = {
  C: { name: t('銅の昇格の証', 'Bronze Promotion Seal'), note: t('ノービス → コモン', 'Novice → Common') },
  U: { name: t('翠の昇格の証', 'Jade Promotion Seal'), note: t('コモン → アンコモン', 'Common → Uncommon') },
  R: { name: t('蒼の昇格の証', 'Azure Promotion Seal'), note: t('アンコモン → レア', 'Uncommon → Rare') },
  E: { name: t('紫の昇格の証', 'Violet Promotion Seal'), note: t('レア → エピック', 'Rare → Epic') },
  L: { name: t('金の昇格の証', 'Golden Promotion Seal'), note: t('エピック → レジェンド', 'Epic → Legendary') },
  LL: { name: t('限定の王冠', 'Limited Crown'), note: t('レジェンド → リミテッド・レジェンド（もとから Legendary のヒーローだけ）', 'Legendary → Limited Legendary (born-Legendary heroes only)') },
};
/**
 * パッシブスキル（部門と結び付ける）。v：段 1 の効き目（+4〜6%）。tasks：その仕事をしているときに速さ（speed）に効く。
 * mentor は仲間の経験値、manage はマネージャーのときのセクタの売上、system はスタミナの消耗（自分の仕事の手間が減る）
 */
export const PASSIVES: Record<PassiveKind, { dept: DeptId; v: number; name: string; note: (pct: number) => string; tasks?: Task[] }> = {
  craft: { dept: 'logistics', v: 0.05, tasks: ['craft', 'train'], name: t('職人の勘', 'Maker’s instinct'), note: (p) => t(`製造の速さ +${p}%（作業台・修行のとき）`, `Crafting speed +${p}% (at a bench or training)`) },
  haul: { dept: 'logistics', v: 0.05, tasks: ['transport', 'buy'], name: t('段取り上手', 'Good planner'), note: (p) => t(`運搬・調達の速さ +${p}%（運搬係・調達係のとき）`, `Hauling and buying speed +${p}% (as hauler or buyer)`) },
  sell: { dept: 'marketing', v: 0.04, tasks: ['shop', 'side'], name: t('看板の笑顔', 'Shop’s smile'), note: (p) => t(`担当のお店の売り場の強さ・品出し +${p}%（店員のとき）`, `Pull and shelving at their shop +${p}% (as clerk)`) },
  scout: { dept: 'marketing', v: 0.06, tasks: ['explore', 'intel'], name: t('聞き込み', 'Legwork'), note: (p) => t(`開拓・調査の速さ +${p}%`, `Scouting and research speed +${p}%`) },
  dig: { dept: 'rnd', v: 0.06, tasks: ['dig'], name: t('掘り当て', 'Lucky strike'), note: (p) => t(`発掘隊の掘る速さ +${p}%（発掘隊のとき）`, `Dig crew speed +${p}% (on the dig crew)`) },
  mentor: { dept: 'hr', v: 0.05, name: t('面倒見', 'Mentor'), note: (p) => t(`この人が働いた日、仲間の経験値 +${p}%（合わせて +${Math.round(HERO_GROWTH.xp.mentorMax * 100)}% まで）`, `Teammates gain +${p}% XP on days this hero works (up to +${Math.round(HERO_GROWTH.xp.mentorMax * 100)}% in all)`) },
  manage: { dept: 'strategy', v: 0.04, name: t('采配', 'Command'), note: (p) => t(`セクタマネージャーのとき、そのセクタの売上 +${p}%`, `Sector sales +${p}% as sector manager`) },
  system: { dept: 'systems', v: 0.06, name: t('手順の自動化', 'Automated routine'), note: (p) => t(`働くときのスタミナの消耗 −${p}%`, `Stamina drain while working −${p}%`) },
};
/** 陣営 → パッシブ（ヒーローごとの並びの 2 つ目。1 つ目はいちばん向いている仕事） */
export const FACTION_PASSIVE: Record<string, PassiveKind> = { 玄武: 'dig', 朱雀: 'sell', 青龍: 'craft', 白虎: 'haul', 黄竜: 'manage' };

// ---------------------------------------------------------------- 人事：カリスマ度・士気・給与（段 E2。docs/ISLAND_PHASE1.md「カリスマ度」「士気と給与」。計算は hr.ts）

/**
 * 経営者のカリスマ度（0〜max。会社の格。ランクアップの災害でも失わない）。記録からいつでも数え直す（古いセーブもさかのぼって同じ数）：
 * - clear：町を制覇したとき（町のランクごと）
 * - present：研究成果を発表したとき（その荒れ地のランクごと）
 * - brand：ブランド力のいちばん高かった値 per ごとに +1（brandMax まで）
 * - panel：人事のパネル「採用ブランド」
 * - cap：雇えるレアリティのしきい値（これ以上で、そのレアリティまで雇える。Novice・Common はいつでも）
 */
export const CHARISMA = {
  max: 100,
  clear: { C: 3, U: 6, R: 10, E: 15, L: 20 } as Record<Tier, number>,
  present: { C: 1, U: 2, R: 3, E: 3, L: 3 } as Record<Tier, number>,
  brand: { per: 40, max: 10 },
  panel: 5,
  cap: { U: 10, R: 35, E: 60, L: 85 } as Partial<Record<HeroRarity, number>>,
};
/** 雇えるレアリティの段（しきい値の順） */
export const HIRE_RARITIES: HeroRarity[] = ['C', 'U', 'R', 'E', 'L'];

/**
 * 給与（段 E2）。月給 ＝（もとの月給 ＋ 給与の段 × 1 段の額）× 給料の倍率（パネル）。もとの月給はいままでどおり（MCH の能力値の合計 × WAGE_PER_STAT。創業の 3 人は 0）、
 * 1 段の額は PAY.raiseWage（もとの月給の 15%、最低 100 G）。給与の段は min〜PAY.raiseMax（上げた段だけ作業の速さ +PAY.raiseSpeed）。
 * 相場の段：Lv がもとのレアリティの上限に届くと atCap、昇格 1 回ごとに promo、上限より先は beyond 段 / Lv（0〜PAY.raiseMax）
 */
export const SALARY = { min: -2, market: { atCap: 1, promo: 0.5, beyond: 1 / 40 } };

/**
 * 士気（ヒーローごと 0〜100）。毎日、目標（target）へ rate ずつ寄る。出来事で上下する（ev）。
 * - target ＝ base ＋ 給与（相場との差。上 up / 下 down 点 / 段、lo〜hi に収める。下げた段はさらに cut 点 / 段）＋ 総務の職場の環境のパネル env 点 / 枚（envMax まで）
 *   ＋ 役目（リーダー・部長・セクター長）role ＋ 給与テーブル − 同じ仕事の続きすぎ（same.after 日を過ぎたら same.per 日ごとに −1、same.max まで）
 * - 働きの速さ：band.lo〜band.hi は ×1（ふつう）。hi から 100 で ×top。lo から floor で ×low へ、floor 未満は ×low
 * - 辞める：quit.below 未満が quit.days 日続くと「辞めたい」（予告 quit.notice 日。面談のパネルで noticeTalk 日）。予告のあいだに quit.safe 以上に戻れば思いとどまる。
 *   引き止めの面談（予告 1 回に 1 度）で +quit.talk（面談のパネルで +quit.talkPanel）。ヒーローが quit.keep 人以下のときは辞めない
 */
export const MORALE = {
  start: 70,
  base: 55,
  rate: 0.04,
  // 調整 1（2026-11-02）：上の帯を強めた（100 で ×1.1 → ×1.2。20 未満の ×0.9・初めの 70 で ×1 は変えない）
  band: { lo: 40, hi: 70, floor: 20, top: 1.2, low: 0.9 },
  pay: { up: 8, down: 10, lo: -20, hi: 16, cut: 8 },
  env: 2,
  envMax: 12,
  role: 6,
  paytable: 4,
  same: { after: 60, per: 10, max: 10 },
  /** 出来事（その場で）：休んだ日・待機中の日・スタミナが尽きて休んだ（働きすぎ）・レベルアップ 1 つ・昇進（役目が上がった）・昇格・昇給・給与を下げた・賞与 */
  ev: { rest: 0.8, idle: 0.3, tired: -3, level: 1, role: 10, promo: 12, raise: 4, cut: -8, bonus: 8 },
  /** キャリアの道すじ（パネル）：昇進・昇格・レベルアップの士気 ×(1 + career × Lv の倍率) */
  career: 0.5,
  quit: { below: 20, days: 20, notice: 30, noticeTalk: 45, safe: 35, talk: 15, talkPanel: 25, keep: 3 },
  /** 「士気が低い」の札（画面）・自動プレイが休ませる目安 */
  warn: 35,
};

// ---------------------------------------------------------------- 経理と総務（ロードマップ段 F。docs/ISLAND_PHASE1.md「経理」「総務」）

/**
 * 法人税と節税（段 F。計算は acct.ts）。ロードマップ 8 章の決定 3：税は Uncommon から、そのぶん売上の側も整え、節税の上手さで差がつく。
 * - rate：会社の格（入ったいちばん上のランク）の税率。Common の町の利益とタオックスのチュートリアルには、かけない。
 * - price：その町の商品の単価の倍率（自社も他社も。Uncommon からの町は物価が高い）。節税しなくても遊ぶ時間が変わらない値（docs/ISLAND_BALANCE.md の v20）。
 * - ded：税の計算の前に差し引ける割合（設備投資＝建てる・設備・お金パネル／研究開発＝研究への寄付・発掘許可・商品開発／総務の環境＝総務のパネル・職人の休憩所）。
 * - cap：差し引ける額の上限（四半期の利益に対して）。advisor：税理士の顧問（研究パネル）で上がるぶん。deprec：減価償却（お金パネル）で設備投資の割合に足すぶん（Lv で ×1.25 ずつ）。
 *   rnd：研究開発の税制（研究パネル）の研究開発の割合。carry：繰越の損失（研究パネル）で繰り越せる四半期の数。
 * - keep：税を払っても資金がこの額を切らない（足りないぶんは次の四半期へ。町を回すお金を残す）
 * - hint：決算の何か月前から「あと ○○ G 投資すると税が △△ G 減る」を知らせるか（会社の月で）
 */
export const TAX = {
  rate: { C: 0, U: 0.2, R: 0.25, E: 0.3, L: 0.35 } as Record<Tier, number>,
  price: { C: 1, U: 1.1, R: 1.13, E: 1.15, L: 1.18 } as Record<Tier, number>,
  ded: { capex: 0.3, rnd: 0.5, env: 0.5 },
  cap: 0.5,
  advisor: 0.1,
  deprec: 0.06,
  rnd: 0.8,
  carry: 4,
  hint: 1,
  keep: 30000,
};
/** 節税の区分 */
export type DedKind = 'capex' | 'rnd' | 'env';
/** 総務の環境に入る設備投資（工房の「職人の休憩所」） */
export const ENV_INVESTS = ['breakroom'];

/**
 * 疲れ（段 F。総務。計算は ga.ts）：いまのスタミナを「疲れ」として見せる（疲れ ＝ 1 − スタミナ ÷ HP）。Uncommon の町に出店してから効く。
 * - from〜to：疲れがこの間で増えると、働きの速さが ×1 → ×(1 − work)、士気の目標が 0 → −morale（to より上はそのまま）。
 *   ストレスチェック（研究パネル）で、どちらも ×(1 − check)。士気は段 E2 の士気の目標の 1 項目（二重に数えない）。
 * - show：画面で「疲れている」の札を出す目安
 */
export const FATIGUE = { from: 0.6, to: 0.85, work: 0.08, morale: 6, check: 0.5, show: 0.6 };

/** 経理・総務の奥義（理解度 15・25・40。効き目は段 I。表示だけ） */
export const ACCT_MASTERY = () => [
  t('奥義 1：税率 −5%（準備中）', 'Mastery 1: tax rate −5% (coming soon)'),
  t('奥義 2：繰越の損失がいつでも使える（リセット後の税が軽い。準備中）', 'Mastery 2: loss carryforward always on (lighter tax after a reset; coming soon)'),
  t('奥義 3：経理の助言どおりに自動で節約（準備中）', 'Mastery 3: savings follow the accountant’s advice automatically (coming soon)'),
];
export const GA_MASTERY = () => [
  t('奥義 1：疲れの回復 ×2（準備中）', 'Mastery 1: fatigue recovery ×2 (coming soon)'),
  t('奥義 2：士気が下がらない（準備中）', 'Mastery 2: morale never drops (coming soon)'),
  t('奥義 3：疲れが極限まで下がり、最高の働きを続ける（準備中）', 'Mastery 3: fatigue drops to the minimum; peak work every day (coming soon)'),
];
/** 掛け合わせの予告（経理 × 総務。効き目は段 I。表示だけ） */
export const CROSS_ACCT_GA = () => t('掛け合わせ（経理 × 総務）：節税になる設備投資 — 設備の費用の 30% を税から引く（両方の理解度 10 で開く・準備中）', 'Cross panel (Accounting × General Affairs): tax-saving capex — 30% of upgrade costs off your tax (opens at understanding 10 in both; coming soon)');

// ---------------------------------------------------------------- カスタマーサポートとマーケ（ロードマップ段 G。docs/ISLAND_PHASE1.md「カスタマーサポート」「マーケ（市場調査・広報・企業の格）」「炎上」）

/** 問い合わせの中身：品切れ・値段が高い・お店が閉まっていた */
export type InqKind = 'out' | 'price' | 'closed';
/** 返事：謝る・返金・代わりの品 */
export type ReplyKind = 'sorry' | 'refund' | 'swap';
/** 問い合わせごとに合う返事（品切れ → 代わりの品・値段 → 返金・閉まっていた → 謝る） */
export const REPLY_FIT: Record<InqKind, ReplyKind> = { out: 'swap', price: 'refund', closed: 'sorry' };
/**
 * カスタマーサポート（段 G。計算は cs.ts）。Uncommon 以上の町だけ（Common の町・タオックスのチュートリアルには問い合わせが来ない）。
 * - start：顧客満足度のはじめ（古いセーブも）。drift：月の締めごとに start へ戻る割合。
 * - 問い合わせ（先月の実際の数字から、月の締めに）：品切れの日 outPer 日ごとに 1 件（outMax まで）・お店が閉まっていた日 closedPer 日ごとに 1 件（closedMax まで）・
 *   自社の値段が町の相場より priceAt 以上高いと 1 件（priceAt2 以上で 2 件）。受け箱は inboxMax 件まで。
 * - 返事の期限 expire 日（返品の決まりで policyDays）。合う返事 good・合わない返事 ok・期限切れ ignore（満足度の点）。
 * - 返金：その町の並べている商品の平均の単価 × refundUnits（refundMin より少なくしない。返品の決まりで −policyCut）。代わりの品：在庫から swapUnits 個（いちばん安い商品）。
 * - 効き目：来店（リピーター）が start より上は (満足度 − start) ÷ (100 − start) × up、下は (満足度 − start) ÷ start × down。満足度の調査で ×survey。
 *   ブランド力：月の締めで満足度が brandHi 以上なら +1、brandLo 以下なら −1。
 * - FAQ：届く問い合わせ −faq。サポートセンター：届いた問い合わせの center.base（Lv ごとに +perLv）を自動で受ける（出来 center.q）。満足度の調査：合う返事 +care・来店に効く分 ×survey
 */
export const CS = {
  start: 60,
  drift: 0.2,
  outPer: 2,
  outMax: 3,
  closedPer: 3,
  closedMax: 2,
  priceAt: 0.12,
  priceAt2: 0.3,
  inboxMax: 8,
  expire: 14,
  policyDays: 21,
  good: 6,
  ok: 1,
  ignore: -3,
  refundUnits: 2,
  refundMin: 300,
  policyCut: 0.4,
  swapUnits: 2,
  up: 0.06,
  down: 0.04,
  survey: 1.5,
  brandHi: 80,
  brandLo: 30,
  faq: 0.3,
  center: { base: 0.3, perLv: 0.1, q: 0.75 },
  care: 0.3,
};
/**
 * 炎上（段 G。計算は cs.ts。Uncommon 以上の町だけ）：
 * - 起きるもの：品切れが outDays 日以上の月・期限切れの問い合わせが ignored 件以上の月。1 か月目は「炎上のおそれ」の予告（札）、
 *   手を打たずに 2 か月続くと炎上。手を打つ＝お詫びの告知（notice。危機管理の手引きで −50%）か、その月のうちに中身を直す（品切れを減らす・返事をする）。
 * - 起きると：来店 −hit（熱さ 1 のとき。熱さは月の締めごとに 1 ÷ months ずつ下がり、months か月で消える）・ブランド力 −brand（熱さが下がるのに合わせて戻る）・全員の士気 −morale。
 * - 早く戻す：広報の火消し（putCost。熱さ −put。危機管理の手引きで ×1.5。putCool 日に 1 回）・合う返事 1 件で熱さ −reply。
 * - 費用はランク（Uncommon 以上）の決め打ち
 */
export const FLAME = {
  outDays: 5,
  ignored: 2,
  hit: 0.06,
  months: 3,
  brand: 12,
  morale: 3,
  put: 0.4,
  putCool: 15,
  reply: 0.05,
  crisis: 1.5,
  notice: { C: 0, U: 3000, R: 8000, E: 20000, L: 50000 } as Record<Tier, number>,
  putCost: { C: 0, U: 5000, R: 12000, E: 30000, L: 80000 } as Record<Tier, number>,
};
/** 広報で出せる良いニュースの種類：町の制覇・研究成果の発表・新商品・新しいお店 */
export type PrKind = 'clear' | 'present' | 'product' | 'shop';
/**
 * 広報（段 G。計算は mkt.ts。Uncommon の町に出店してから）：実際に起きた良いニュースを発表するとブランド力が上がる。
 * gain：種類ごとのブランド力（プレスリリースで +press、Lv で ×1.25）。cool：次の発表まで（日）。keep：ニュースが古くなるまで（日）・max：持っておける数。cost：1 回の費用（ランク）
 */
export const PR = {
  gain: { clear: 8, present: 5, product: 4, shop: 2 } as Record<PrKind, number>,
  press: 0.3,
  cool: 30,
  keep: 60,
  max: 4,
  cost: { C: 0, U: 2000, R: 5000, E: 12000, L: 30000 } as Record<Tier, number>,
};
/**
 * 企業の格（段 G。計算は mkt.ts）：ブランド力から決まる段（無名 → 地元の店 → 地域の有名店 → 全国ブランド → 世界ブランド）。
 * at：段のしきい値（ブランド力。コーポレートアイデンティティで、数えるブランド力 +ci（Lv で ×1.25））。docs/ISLAND_BALANCE.md の v22 で決めた。
 * 段 H1（v23）：世界ブランドを 800 → 1000 に。ブランド力の上限（BRAND_CAP）が Rare まで 800 なので、世界ブランドは Epic の町に出店してから
 * （CI を Lv5 まで上げても Rare の上限 800 × 1.2 ＝ 960 で届かない）。地元の店・地域の有名店・全国ブランドは前のまま（通常・最短の Common〜Rare の格は変わらない）。
 * 効き目（小さく）：area＝Rare・Epic の町の自社の店の引き +area × 段・hire＝雇える候補の数（段ごと）。カリスマ度（雇えるレアリティ）とは別の軸
 */
export const GRADE = {
  at: [0, 100, 250, 450, 1000],
  ci: 0.1,
  area: 0.03,
  hire: [0, 0, 1, 1, 2],
};
/** 企業の格の名前（段の順） */
export const GRADE_NAME = () => [t('無名', 'Unknown'), t('地元の店', 'Local shop'), t('地域の有名店', 'Regional name'), t('全国ブランド', 'National brand'), t('世界ブランド', 'Global brand')];

/** カスタマーサポートの紹介（Uncommon の町に初めて進出したあと。main.ts の会話。経理・総務の紹介のあと） */
export const CS_INTRO = () => [
  t('新しい部門：[[カスタマーサポート]]！ 月の締めに、お客さんから[[問い合わせ]]が届くよ。', 'New department: [[Customer Support]]! Customers send [[inquiries]] at each monthly close.'),
  t('合う返事で[[顧客満足度]]が上がる。放っておくと[[炎上]]することも。受け箱を見てみよう！', 'Fitting replies raise [[satisfaction]]. Ignore them and a [[backlash]] may follow. Check the inbox!'),
];
/** カスタマーサポート・マーケの奥義（理解度 15・25・40。効き目は段 I。表示だけ） */
export const CS_MASTERY = () => [
  t('奥義 1：問い合わせからリピーターが生まれる（準備中）', 'Mastery 1: inquiries turn into regulars (coming soon)'),
  t('奥義 2：炎上を未然に防ぐ（準備中）', 'Mastery 2: backlashes are stopped before they start (coming soon)'),
  t('奥義 3：顧客満足度が下がらない（準備中）', 'Mastery 3: satisfaction never drops (coming soon)'),
];
export const MKT_MASTERY = () => [
  t('奥義 1：企業の格が 1 段上に見える（準備中）', 'Mastery 1: your standing looks one rank higher (coming soon)'),
  t('奥義 2：炎上が起きにくい（準備中）', 'Mastery 2: backlashes are rarer (coming soon)'),
  t('奥義 3：宣伝の効き目が切れない（準備中）', 'Mastery 3: ads never wear off (coming soon)'),
];
/** 掛け合わせの予告（効き目は段 I。表示だけ） */
export const CROSS_MKT_CS = () => t('掛け合わせ（マーケ × カスタマーサポート）：ファンのコミュニティ — 炎上の被害 半分・リピーター +15%（両方の理解度 10 で開く・準備中）', 'Cross panel (Marketing × Customer Support): fan community — half the backlash damage, regulars +15% (opens at understanding 10 in both; coming soon)');
export const CROSS_HR_MKT = () => t('掛け合わせ（人事 × マーケ）：採用マーケ — 雇う候補 +2・カリスマ +5 相当の候補（両方の理解度 10 で開く・準備中）', 'Cross panel (HR × Marketing): recruiting marketing — +2 candidates, as if charisma +5 (opens at understanding 10 in both; coming soon)');

/** 法務の奥義（理解度 15・25・40。効き目は段 I。表示だけ。ロードマップ 4-8） */
export const LEGAL_MASTERY = () => [
  t('奥義 1：契約で不利な条項を受けない（準備中）', 'Mastery 1: never accept a bad clause (coming soon)'),
  t('奥義 2：特許の期間 2 倍（準備中）', 'Mastery 2: patents last twice as long (coming soon)'),
  t('奥義 3：裁判で負けない（準備中）', 'Mastery 3: never lose a trial (coming soon)'),
];
/** 掛け合わせの予告（法務。効き目は段 I。表示だけ。特許そのものは法務のパネルで開く＝二重にしない） */
export const CROSS_RND_LEGAL = () => t('掛け合わせ（R&D × 法務）：特許の取得 — 研究の成果を守り、使用料を受け取る力が上がる（両方の理解度 10 で開く・準備中）', 'Cross panel (R&D × Legal): patent strategy — stronger protection and royalties for your research (opens at understanding 10 in both; coming soon)');
export const CROSS_SALES_LEGAL = () => t('掛け合わせ（営業 × 法務）：有利な契約の雛形 — 契約の条項を 1 つ多く選べる（両方の理解度 10 で開く・段 I・準備中）', 'Cross panel (Sales × Legal): favorable contract templates — pick one more clause (opens at understanding 10 in both; stage I; coming soon)');

// ---------------------------------------------------------------- 段 UI7g：契約金・課題の一覧

/**
 * 段 UI7g：契約金（雇うときに 1 回払う。model.ts の signFee）。目安は月給 1 か月分（給料の倍率込み）× レアリティの倍率（高いほど高い）。
 * 序盤の Common（と Novice）のヒーローは 0：GitHub の Sim（9 シード）で Common も ×1 にすると通常の合計が +1.3%（C +2.4%・R +2.5%・E +2.4%）延びたため
 * （遊ぶ時間を延ばさない決まり。docs/ISLAND_BALANCE.md の v36）。Uncommon から払う。
 * 最初の町の 1 か月目（タオックスのチュートリアル。月次報告がまだ無い）は 0（チュートリアルの通しを変えない）。毎月の給与は今までどおり月の締めに払う
 */
export const SIGN = { mul: { N: 0, C: 0, U: 1.25, R: 1.5, E: 2, L: 3, LL: 3 } as Record<HeroRarity, number>, round: 10 };

/**
 * 段 UI7g：課題の一覧（issues.ts）。会社（いまの町）の課題を、いまのモデルの数字から並べる。
 * - next：SCM の詰まりの段の「次に細い段まで太くしたら」の流れの増え（個／月）を G に直したものが優先の元（boost は詰まりの段を先に置く倍率）
 * - store：倉庫の埋まり（CLEAR.warn を超えたら課題）。あふれるまでの日数が短いほど重い（days 日で 1 か月の粗利ぶん）
 * - morale：士気の平均がこれ未満・辞めたい人がいる。sat：顧客満足度がこれ未満（Uncommon から）。cash：資金がひと月の固定費を下回る・先月が赤字
 * - grow：成長の余地（ブランド力・研究）は、ほかの課題が無いときの下の段（優先は小さく）
 * - 段 UI9：優先は重要度（G／月）× 緊急度（storeDays 日以内で 1〜2 倍）。solve：流れの課題を「解いた」と言える売れる数の増え（いまの処理量に対する割合）・
 *   raise：提起する最小の重要度（月の粗利に対する割合。期限の無い課題だけ）・profitMonths：収益性の課題を解くのに要る長期の利益（重要度 × 月数）
 * - 段 UI9b：優先度の 3 段（高・中・低）の境。score（重要度 × 緊急度）÷ 月の粗利が lv.hi 以上で「高」・lv.mid 以上で「中」・それ未満は「低」。流れが止まっていれば「高」
 */
export const ISSUE = { boost: 2, storeDays: 60, morale: 55, sat: 50, grow: 0.05, min: 1, solve: 0.02, raise: 0.03, profitMonths: 3, lv: { hi: 0.3, mid: 0.1 } };
