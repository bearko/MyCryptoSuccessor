/**
 * 下の帯のサブタブ（段 UI3：画面の並び。DOM なし：main.ts とテストが使う）。
 * 部門ごとのサブタブと、1 つのサブタブにまとめた画面（parts）。似た画面は 1 つの画面に縦に並べてまとめる
 * （市場調査データ＋市場の見通し・企業ランキング＋広報と企業の格・設定＋進行速度＋セーブ ほか）。
 * 前のサブタブの key（outlook・pr・bom ほか）は SUB_ALIAS で、まとめた画面のその部分へ開く（チュートリアル・カード・報告のボタンの行き先）。
 * 仕様は docs/ISLAND_PHASE1.md「画面の並び（UI3）」。
 */
import { t } from '../../i18n';
import type { DeptId } from './data';

/** 画面（main.ts の SCREEN が開く関数を持つ） */
export type ScreenId =
  | 'flow'
  | 'buy'
  | 'bom'
  | 'sales'
  | 'tree'
  | 'build'
  | 'land'
  | 'books'
  | 'props'
  | 'ceo'
  | 'ma'
  | 'staff'
  | 'org'
  | 'side'
  | 'growth'
  | 'hire'
  | 'pay'
  | 'notes'
  | 'dev'
  | 'museum'
  | 'ads'
  | 'missions'
  | 'data'
  | 'outlook'
  | 'ranking'
  | 'pr'
  | 'inbox'
  | 'sat'
  | 'area'
  | 'diplo'
  | 'tax'
  | 'env'
  | 'contract'
  | 'patent'
  | 'suit'
  | 'invest'
  | 'settings'
  | 'mapset'
  | 'pace'
  | 'save'
  | 'trophy'
  | 'budget'
  | 'test';

export interface SubDef {
  key: string;
  /**
   * サブタブの名前（PC）・短い名前（スマホ。横にずらさずに 1 行に全部並ぶように）。
   * チュートリアルで「「○○」を押そう！」と名前を出すサブタブ（調達・ヒーローの配置・人材登用・サプライチェーン・建築・企業ランキング）は、名前を変えない
   */
  name: string;
  short: string;
  note: string;
  /** この画面に縦に並べる画面（1 つ目が主。チュートリアルのあいだは 1 つ目だけ） */
  parts: ScreenId[];
  needs?: 'workshop' | 'land' | 'hire' | 'tree' | 'museum' | 'budget';
}

const d = (key: string, name: string, short: string, note: string, parts: ScreenId[], needs?: SubDef['needs']): SubDef => ({ key, name, short, note, parts, ...(needs ? { needs } : {}) });

/** 部門のサブタブ（段 UI3 で見直した並び）。経営企画の「決算書」は経理が開くと経理へ移る（subDefs） */
export const SUB_DEFS = (): Record<DeptId, SubDef[]> => ({
  logistics: [
    d('flow', t('サプライチェーン', 'Supply chain'), t('サプライチェーン', 'Supply chain'), t('流れと詰まり', 'Flow and bottlenecks'), ['flow']),
    d('buy', t('調達', 'Buy'), t('調達', 'Buy'), t('素材を買う・素材 → 商品', 'Buy materials, materials → products'), ['buy', 'bom']),
    d('sales', t('販売管理', 'Sales'), t('販売管理', 'Sales'), t('お店の一覧・一括で変える', 'Shops at a glance, bulk changes'), ['sales']),
  ],
  strategy: [
    d('tree', t('スキルツリー', 'Skill tree'), t('スキルツリー', 'Skill tree'), t('全社の方針・パネル', 'Company policy, panels'), ['tree'], 'tree'),
    d('build', t('建築', 'Build'), t('建築', 'Build'), t('工房・お店・倉庫', 'Workshop, shops, storage'), ['build']),
    d('land', t('ランドマップ', 'Land map'), t('ランド', 'Land'), t('関所の先のセクタ', 'Sectors beyond the gate'), ['land'], 'land'),
    d('books', t('決算書', 'Statements'), t('決算書', 'Books'), t('四半期の P/L・B/S', 'Quarterly P/L, B/S'), ['books']),
    d('props', t('受け箱', 'Inbox'), t('受け箱', 'Inbox'), t('提案・報告・問い合わせ', 'Proposals, reports, inquiries'), ['props', 'inbox']),
    // 段 I1：予算と部門（Rare から。営業の部門が開くのも Rare なので、営業が開いていなければ出さない：subDefs）
    d('budget', t('予算と部門', 'Budgets'), t('予算', 'Budget'), t('部門の予算・従業員・施策', 'Dept budgets, staff, moves'), ['budget'], 'budget'),
  ],
  hr: [
    // 段 UI5b：組織図（役目の木）をヒーローの配置の画面にまとめる（サブタブは増やさない）
    d('staff', t('ヒーローの配置', 'Assign heroes'), t('ヒーローの配置', 'Assign heroes'), t('持ち場・組織図・他店でバイト', 'Posts, org chart, part-time work'), ['staff', 'org', 'side']),
    d('growth', t('ヒーローの育成', 'Hero growth'), t('育成', 'Growth'), t('Lv・昇格・パッシブ', 'Levels, promotion, passives'), ['growth']),
    d('hire', t('人材登用', 'Recruiting'), t('人材登用', 'Recruiting'), t('雇う・カリスマ度', 'Hire, charisma'), ['hire', 'ceo'], 'hire'),
    d('pay', t('給与・労務', 'Pay & welfare'), t('給与・労務', 'Pay'), t('給与・士気・休み', 'Pay, morale, rest'), ['pay']),
  ],
  rnd: [
    d('notes', t('研究ノート', 'Notebook'), t('研究ノート', 'Notes'), t('出土品・石板', 'Finds and tablets'), ['notes']),
    d('dev', t('商品開発', 'Products'), t('開発', 'Develop'), t('アンコモンを開発', 'Develop Uncommons'), ['dev'], 'workshop'),
    d('museum', t('遺物の展示館', 'Relic museum'), t('展示館', 'Museum'), t('展示と来館', 'Exhibits, visitors'), ['museum'], 'museum'),
  ],
  marketing: [
    d('ads', t('宣伝広報', 'Advertising'), t('宣伝', 'Ads'), t('売り場を強くする・見込み', 'Boost shops, expected gain'), ['ads'], 'workshop'),
    d('missions', t('依頼', 'Requests'), t('依頼', 'Requests'), t('受ける・報酬', 'Accept, rewards'), ['missions']),
    d('data', t('市場調査', 'Market research'), t('市場調査', 'Market'), t('売れ筋・ニーズ・先読み', 'Demand, sellers, outlook'), ['data', 'outlook']),
    d('ranking', t('企業ランキング', 'Ranking'), t('企業ランキング', 'Ranking'), t('順位・広報・企業の格', 'Rank, PR, standing'), ['ranking', 'pr']),
  ],
  support: [d('inbox', t('問い合わせ', 'Inquiries'), t('問い合わせ', 'Inquiries'), t('返事・顧客満足度', 'Replies, satisfaction'), ['inbox', 'sat'])],
  // 段 UI4：外交（Epic）は商圏の取り合いの画面にまとめる（サブタブは増やさない）
  sales: [d('area', t('商圏の取り合い', 'Trade areas'), t('商圏', 'Areas'), t('取り分・他社の店・外交', 'Shares, rival stores, diplomacy'), ['area', 'diplo'])],
  accounting: [
    d('tax', t('税と節税', 'Tax & savings'), t('税と節税', 'Tax'), t('四半期の税・節税の見込み', 'Quarterly tax, savings plan'), ['tax']),
    d('books', t('決算書', 'Statements'), t('決算書', 'Books'), t('P/L・B/S・コストと助言', 'P/L, B/S, costs, advice'), ['books']),
  ],
  general: [d('env', t('疲れと職場の環境', 'Fatigue & workplace'), t('職場', 'Workplace'), t('疲れ・休ませる・設備', 'Fatigue, rest, facilities'), ['env'])],
  legal: [
    d('ma', 'M&A', 'M&A', t('他社の買収', 'Acquire rivals'), ['ma']),
    d('contract', t('契約', 'Contracts'), t('契約', 'Contracts'), t('仕入れの契約・条項', 'Supply deals, clauses'), ['contract']),
    d('patent', t('特許', 'Patents'), t('特許', 'Patents'), t('復刻品を守る・使用料', 'Protect revivals, royalties'), ['patent']),
    d('suit', t('争い', 'Disputes'), t('争い', 'Disputes'), t('訴え・裁判・和解', 'Suits, trials, settling'), ['suit']),
  ],
  systems: [
    d('invest', t('設備投資', 'Investment'), t('設備', 'Upgrades'), t('建物ごとの設備', 'Per-building upgrades'), ['invest'], 'workshop'),
    // 段 UI6：トロフィー（実績）の一覧も設定の画面にまとめる（サブタブは増やさない）
    // 段 UI10：地図の表示（流れの線・困りごとの印・商圏）の切り替えも設定の画面にまとめる（地図の右下のボタンは外した）
    d('settings', t('設定', 'Settings'), t('設定', 'Settings'), t('速さ・言語・音・地図の表示・セーブ・トロフィー', 'Speed, language, sound, map display, save, trophies'), ['settings', 'mapset', 'pace', 'save', 'trophy']),
  ],
});

/** その部門のサブタブ（経理が開いたら、決算書は経営企画から外す） */
export function subDefs(m: DeptId, depts: DeptId[]): SubDef[] {
  const xs = SUB_DEFS()[m] ?? [];
  return xs.filter((x) => !(m === 'strategy' && x.key === 'books' && depts.includes('accounting')) && !(x.key === 'budget' && !depts.includes('sales')));
}
/** 段 UX1（B-7）：右の帯（幅 104px）に収まる、主なサブタブ名の並び（短い名前を「・」でつなぎ、9 字まで。1 つは必ず） */
export function tabHint(shorts: string[]): string {
  const sep = t('・', ' · ');
  let out = shorts[0] ?? '';
  for (const x of shorts.slice(1)) {
    const next = `${out}${sep}${x}`;
    if ([...next].length > 9) break;
    out = next;
  }
  return out;
}
/** 開いている部門のサブタブの数（画面の数の目安） */
export const subCount = (depts: DeptId[]) => depts.reduce((a, m) => a + subDefs(m, depts).length, 0);

/**
 * 前のサブタブ（段 UI3 でまとめた画面）→ いまのサブタブとその中の部分（チュートリアル・カード・報告のボタン・撮影スクリプトの goSub）。
 * 経営企画の M&A（準備中の札）は外した：法務が開いていれば法務の M&A、無ければ受け箱の行き先は無し
 */
export const SUB_ALIAS: Record<string, { m: DeptId; key: string; part: ScreenId }> = {
  'logistics:bom': { m: 'logistics', key: 'buy', part: 'bom' },
  'strategy:ceo': { m: 'hr', key: 'hire', part: 'ceo' },
  'strategy:ma': { m: 'legal', key: 'ma', part: 'ma' },
  'hr:side': { m: 'hr', key: 'staff', part: 'side' },
  'hr:org': { m: 'hr', key: 'staff', part: 'org' },
  'marketing:outlook': { m: 'marketing', key: 'data', part: 'outlook' },
  'marketing:pr': { m: 'marketing', key: 'ranking', part: 'pr' },
  'support:sat': { m: 'support', key: 'inbox', part: 'sat' },
  'systems:mapset': { m: 'systems', key: 'settings', part: 'mapset' },
  'systems:pace': { m: 'systems', key: 'settings', part: 'pace' },
  'systems:save': { m: 'systems', key: 'settings', part: 'save' },
  'systems:trophy': { m: 'systems', key: 'settings', part: 'trophy' },
  'sales:diplo': { m: 'sales', key: 'area', part: 'diplo' },
};
/** 部門 m のサブタブ key（前の key も）→ いまのサブタブと開く部分 */
export function resolveSub(m: DeptId, key: string, depts: DeptId[]): { m: DeptId; key: string; part: ScreenId | null } | null {
  const a = SUB_ALIAS[`${m}:${key}`];
  if (a) return depts.includes(a.m) || a.m === m ? { m: a.m, key: a.key, part: a.part } : null;
  const x = subDefs(m, depts).find((y) => y.key === key);
  return x ? { m, key, part: null } : null;
}
