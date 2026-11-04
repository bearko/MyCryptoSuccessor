/**
 * 段 UI7d：スライド型の提案書の材料（DOM なし：proposalui.ts・slideui.ts・テストが使う）。
 * brief.ts の Brief（提案書の中身）から、スライドの枚数と、グラフ・タイル・メーターの数字を作る。数字はどれも Brief の数字から出す
 * （グラフの合計・端の値が Brief の短期・長期・導入と一致する）。中身の計算は brief.ts のまま（表示だけ。自動プレイには効かない）。
 * 仕様は docs/ISLAND_PHASE1.md「スライド型の提案書（段 UI7d）」。
 */
import { t } from '../../i18n';
import { DEPT, POLICY, type DeptId, type ValueKey } from './data';
import { METRIC_TEXT, type Ask, type Brief, type Risk } from './brief';
import type { Stage } from './model';
import type { Plan } from './plan';

// ---------------------------------------------------------------- スライドの枚数

/**
 * スライドの種類：sum 結論・change 何が変わる・effect 効果（今月）・long 効果（12 か月）・risk 影響とリスク・more 付録（詳しく）
 */
export type SlideId = 'sum' | 'change' | 'effect' | 'long' | 'risk' | 'more';
export const SLIDE_NAME: Record<SlideId, () => string> = {
  sum: () => t('結論', 'Summary'),
  change: () => t('何が変わる', 'What changes'),
  effect: () => t('効果：来月', 'Effect: next month'),
  long: () => t(`効果：${POLICY.months} か月`, `Effect: ${POLICY.months} months`),
  risk: () => t('影響とリスク', 'Impact and risks'),
  more: () => t('付録：詳しく', 'Appendix: details'),
};
/** 費用の無い 1 つの手だけの小さな提案（結論と付録の 2 枚） */
export const smallBrief = (b: Pick<Brief, 'asks' | 'cost'>) => b.asks.length <= 1 && b.cost.money === 0 && b.cost.rp === 0 && b.cost.monthly === 0;
/**
 * スライドの並び：
 * - 費用の無い 1 つの手だけ（smallBrief）：結論・付録
 * - ほか：結論 → 何が変わる（手が 2 つ以上か、Before → After の絵があるとき）→ 効果（来月）→ 効果（12 か月。手が 2 つ以上のとき。1 つなら来月の 1 枚にまとめる）→ 影響とリスク → 付録
 */
export function slideKinds(b: Pick<Brief, 'asks' | 'cost'>, o: { visual: boolean }): SlideId[] {
  if (smallBrief(b)) return ['sum', 'more'];
  const out: SlideId[] = ['sum'];
  if (b.asks.length >= 2 || o.visual) out.push('change');
  out.push('effect');
  if (b.asks.length >= 2) out.push('long');
  out.push('risk', 'more');
  return out;
}

// ---------------------------------------------------------------- 結論：KPI のタイル

export interface Kpi {
  key: ValueKey | 'setup' | 'month' | 'room';
  icon: string;
  label: string;
  /** 大きな数字（符号つきの差。導入費用は払う額）・単位 */
  v: number;
  unit: string;
  /** 増えるのが良いか（導入費用は 'cost'：色を付けない） */
  tone: 'delta' | 'cost';
  /** 小さなラベル（「このまま → 承認後」「1 回」） */
  sub: string;
}
const fmt = (v: number) => Math.abs(Math.round(v)).toLocaleString('en-US');
/**
 * 結論のタイル 3〜4 枚：短期利益・長期利益・導入費用・動く指標（お金以外がなければ毎月の利益。毎月の利益も動かず、
 * extra（置き場所など、お金でない変わるもの）があればそれ）
 */
export function kpisOf(b: Pick<Brief, 'vals' | 'cost' | 'dProfit' | 'now' | 'after'>, extra: Kpi | null = null): Kpi[] {
  const out: Kpi[] = [];
  const S = b.vals.list.find((m) => m.key === 'short');
  const L = b.vals.list.find((m) => m.key === 'long');
  if (S) out.push({ key: 'short', icon: METRIC_TEXT.short.icon, label: t('短期利益', 'Short-term'), v: S.d, unit: 'G', tone: 'delta', sub: t('来月・導入込み', 'Next month, net of setup') });
  if (L) out.push({ key: 'long', icon: METRIC_TEXT.long.icon, label: t('長期利益', 'Long-term'), v: L.d, unit: 'G', tone: 'delta', sub: t(`${POLICY.months} か月の合計`, `${POLICY.months}-month total`) });
  const setup = b.cost.money > 0 || b.cost.rp === 0;
  out.push({
    key: 'setup',
    icon: '💳',
    label: t('導入費用', 'Setup'),
    v: setup ? b.cost.money : b.cost.rp,
    unit: setup ? 'G' : 'RP',
    tone: 'cost',
    sub: [b.cost.money > 0 && b.cost.rp > 0 ? `+${b.cost.rp} RP` : '', b.cost.monthly ? t(`毎月 +${fmt(b.cost.monthly)} G`, `+${fmt(b.cost.monthly)} G/mo`) : t('1 回', 'once')].filter(Boolean).join(t('・', ' · ')),
  });
  const other = b.vals.list.find((m) => m.key !== 'short' && m.key !== 'long');
  if (other)
    out.push({
      key: other.key,
      icon: METRIC_TEXT[other.key].icon,
      label: METRIC_TEXT[other.key].name().replace(/（.*）$/, '').replace(/ \(.*\)$/, ''),
      v: other.d,
      unit: other.key === 'rp' ? 'RP' : '',
      tone: 'delta',
      sub: other.key === 'brand' || other.key === 'rp' ? t(`${POLICY.months} か月`, `${POLICY.months} months`) : `${Math.round(other.now)} → ${Math.round(other.after)}`,
    });
  else if (extra && Math.abs(b.dProfit) < 0.5) out.push(extra);
  else out.push({ key: 'month', icon: '📅', label: t('毎月の利益', 'Monthly profit'), v: b.dProfit, unit: 'G', tone: 'delta', sub: `${fmt(b.now.profit)} → ${fmt(b.after.profit)} G` });
  return out;
}

// ---------------------------------------------------------------- 効果：棒・寄与・折れ線・メーター

/** 置き場所のタイル（倉庫・物流拠点を建てる・強化する手）：増える数と、埋まり方の前 → 後。置き場所が変わらなければ null */
export function roomKpi(used: number, cap0: number, cap1: number): Kpi | null {
  if (cap1 === cap0) return null;
  const pc = (c: number) => `${Math.round((used / Math.max(1, c)) * 100)}%`;
  return { key: 'room', icon: '📦', label: t('置き場所', 'Storage'), v: cap1 - cap0, unit: t('個', ''), tone: 'delta', sub: t(`埋まり ${pc(cap0)} → ${pc(cap1)}`, `Full ${pc(cap0)} → ${pc(cap1)}`) };
}

/** 来月の利益（導入込み）：このまま vs 承認後（短期の指標と同じ数字） */
export function profitBars(b: Pick<Brief, 'vals'>): { now: number; after: number } {
  const S = b.vals.list.find((m) => m.key === 'short');
  return { now: S?.now ?? 0, after: S?.after ?? 0 };
}

/** 寄与の 1 本（ウォーターフォール）。from → to（累計）。kind 'ask'：承認事項の行・'setup'：導入（1 回）・'total'：短期の合計 */
export interface Fall {
  kind: 'ask' | 'setup' | 'total';
  label: string;
  dept: DeptId | null;
  icon: string;
  v: number;
  from: number;
  to: number;
}
/**
 * 短期利益の寄与（どの手で、いくら）：承認事項の行ごとの月の利益の増え（Brief.parts。手が 1 つなら月の利益の差）→ 導入（1 回）→ 合計。
 * 合計は短期の差（vals の short.d）と一致する
 */
export function fallOf(b: Pick<Brief, 'parts' | 'asks' | 'dProfit' | 'cost'>): Fall[] {
  const out: Fall[] = [];
  let at = 0;
  const add = (kind: Fall['kind'], label: string, dept: DeptId | null, icon: string, v: number) => {
    out.push({ kind, label, dept, icon, v, from: at, to: at + v });
    at += v;
  };
  if (b.parts.length > 1) for (const x of b.parts) add('ask', shortWhat(x.what), x.dept, askIcon(x.kind), x.dProfit);
  else {
    const a = b.asks[0];
    add('ask', a ? shortWhat(a.what) : t('月の利益', 'Monthly profit'), a?.dept ?? null, a ? askIcon(a.kind) : '💰', b.dProfit);
  }
  if (b.cost.money > 0) add('setup', t('導入（1 回）', 'Setup (once)'), null, '💳', -b.cost.money);
  out.push({ kind: 'total', label: t('短期利益', 'Short-term'), dept: null, icon: METRIC_TEXT.short.icon, v: at, from: 0, to: at });
  return out;
}
/** 承認事項の文の頭の種類（「商品：」）を外した短い名前（グラフのラベル） */
export const shortWhat = (x: string) => x.replace(/^[^：:]{1,6}[：:]\s*/, '');

/**
 * 長期の累計の折れ線（月ごと、POLICY.months 点）：1 か月目は来月の利益（承認後は導入を引く）、2 か月目からは落ち着いたときの月の利益
 * （長期の式を月に分けたもの：落ち着いた月 ＝（長期 − 1 か月目）÷（月数 − 1））。最後の点は長期の指標（now・after）と一致する
 */
export function longLine(b: Pick<Brief, 'vals' | 'now' | 'after' | 'cost'>): { now: number[]; after: number[] } {
  const M = POLICY.months;
  const L = b.vals.list.find((m) => m.key === 'long');
  const n1 = b.now.profit;
  const a1 = b.after.profit - b.cost.money;
  const nS = L && M > 1 ? (L.now - n1) / (M - 1) : n1;
  const aS = L && M > 1 ? (L.after - a1) / (M - 1) : a1;
  const now = [n1];
  const after = [a1];
  for (let k = 1; k < M; k++) {
    now.push(now[k - 1] + nS);
    after.push(after[k - 1] + aS);
  }
  return { now, after };
}

/** お金以外の指標のメーター：士気・満足度は 0〜100 の目盛り、ブランド・研究は 12 か月の増え（差の札） */
export interface Meter {
  key: ValueKey;
  icon: string;
  label: string;
  now: number;
  after: number;
  d: number;
  /** 0〜100 の目盛りがあるか */
  scale: boolean;
}
export function metersOf(b: Pick<Brief, 'vals'>): Meter[] {
  return b.vals.list
    .filter((m) => m.key !== 'short' && m.key !== 'long')
    .map((m) => ({ key: m.key, icon: METRIC_TEXT[m.key].icon, label: METRIC_TEXT[m.key].name(), now: m.now, after: m.after, d: m.d, scale: m.key === 'morale' || m.key === 'sat' }));
}

// ---------------------------------------------------------------- 影響とリスク

/** 4 段の地図（調達・製造・輸送・販売）：変わる段と、細いところ（このまま → 承認後） */
export interface StageMap {
  stages: { id: Stage; icon: string; name: string; on: boolean; narrow0: boolean; narrow1: boolean }[];
  /** 承認事項を受け持つ部門（提案した部門を先に）と、提案した部門か */
  depts: { id: DeptId; icon: string; name: string; color: string; own: boolean; n: number }[];
}
export const STAGE_ICON: Record<Stage, string> = { buy: '🛒', craft: '🔨', haul: '🚚', sell: '🏪' };
export const STAGE_NAME: Record<Stage, () => string> = { buy: () => t('調達・保管', 'Buy · store'), craft: () => t('製造', 'Craft'), haul: () => t('輸送', 'Haul'), sell: () => t('販売', 'Sell') };
export function stageMap(b: Pick<Brief, 'asks' | 'dept'>, touched: Stage[], bn0: Stage, bn1: Stage): StageMap {
  const stages = (['buy', 'craft', 'haul', 'sell'] as Stage[]).map((id) => ({ id, icon: STAGE_ICON[id], name: STAGE_NAME[id](), on: touched.includes(id), narrow0: id === bn0, narrow1: id === bn1 }));
  const ids: DeptId[] = [];
  if (b.dept) ids.push(b.dept);
  for (const a of b.asks) if (!ids.includes(a.dept)) ids.push(a.dept);
  const depts = ids.map((id) => ({ id, icon: DEPT[id].icon, name: DEPT[id].short, color: DEPT[id].color, own: id === b.dept, n: b.asks.filter((a) => a.dept === id).length }));
  return { stages, depts };
}

/** リスクの札（低・中・高）の名前 */
export const RISK_LV: Record<1 | 2 | 3, () => string> = { 1: () => t('低', 'Low'), 2: () => t('中', 'Mid'), 3: () => t('高', 'High') };
export const RISK_ICON: Record<Risk['kind'], string> = { read: '🎯', ad: '📣', stock: '📦', ops: '🔧', dept: '🤝', flow: '⛓', budget: '📊', cash: '💰' };
/** スライドに出すリスク（強い順に 4 つまで。資金が足りる 1 行は資金のメーターで見せるので外す） */
export function topRisks(rk: Risk[], n = 4): Risk[] {
  return rk
    .filter((x) => !(x.kind === 'cash' && x.lv === 1))
    .map((x, k) => ({ x, k }))
    .sort((a, b) => b.x.lv - a.x.lv || a.k - b.k)
    .slice(0, n)
    .map((y) => y.x);
}

/** 予算のメーター：月の予算（使った・この提案・残り。超えた分）。予算の無い町は null */
export interface BudgetBar {
  dept: DeptId;
  amt: number;
  used: number;
  /** この提案のうち予算に入る分・超える分・提案のあとの残り */
  mine: number;
  over: number;
  left: number;
}
export function budgetBar(b: Pick<Brief, 'budget'>): BudgetBar | null {
  const x = b.budget;
  if (!x) return null;
  const room = Math.max(0, x.rest);
  const mine = Math.min(x.need, room);
  return { dept: x.dept, amt: x.amt, used: Math.max(0, x.amt - room), mine, over: Math.max(0, x.need - room), left: Math.max(0, room - mine) };
}

// ---------------------------------------------------------------- 承認事項の行

/** 承認事項の行のアイコン（手の種類） */
export function askIcon(k: Ask['kind']): string {
  switch (k) {
    case 'ad':
      return '📣';
    case 'stock':
      return '🧺';
    case 'part':
    case 'staff':
      return '🙋';
    case 'skill':
    case 'level':
      return '✨';
    case 'invest':
      return '🔧';
    case 'build':
      return '🏗';
    case 'hire':
    case 'assign':
      return '🤝';
    case 'clear':
      return '🏷';
    case 'useup':
      return '🧪';
    case 'order':
      return '📦';
    case 'permit':
      return '⛏';
    case 'patent':
    case 'ma':
      return '⚖';
    case 'famous':
      return '⭐';
    case 'vacant':
      return '🏠';
    case 'shelf':
      return '🗄';
  }
}

/** 提案書の出どころ（スライドの上の小さな見出し） */
export type PropSrc = 'staff' | 'head' | 'store' | 'stock' | 'budget' | 'talk';
export const SRC_NAME: Record<PropSrc, () => string> = {
  staff: () => t('担当者からの提案', 'Proposal from your staff'),
  head: () => t('部長からの提案', 'Proposal from a division head'),
  store: () => t('倉庫の提案', 'Storage proposal'),
  stock: () => t('在庫の提案', 'Stock proposal'),
  budget: () => t('部長からの頼み', 'Request from a division head'),
  talk: () => t('部長との会話から', 'From your talk with a head'),
};
/** 出どころ（opts.src が無ければ手から：倉庫の手 → 倉庫・売りさばき／いまの素材で作る → 在庫・ほか → 担当者） */
export function srcOfPlan(p: Pick<Plan, 'acts'>): PropSrc {
  if (p.acts.some((a) => (a.k === 'build' && (a.id === 'warehouse' || a.id === 'logistics')) || (a.k === 'invest' && (a.id === 'rack' || a.id === 'dock')))) return 'store';
  if (p.acts.length && p.acts.every((a) => a.k === 'clear' || a.k === 'useup')) return 'stock';
  return 'staff';
}
