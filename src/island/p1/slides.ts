/**
 * 段 UI7d：スライド型の提案書の材料（DOM なし：proposalui.ts・slideui.ts・テストが使う）。
 * brief.ts の Brief（提案書の中身）から、スライドの枚数と、グラフ・タイル・メーターの数字を作る。数字はどれも Brief の数字から出す
 * （グラフの合計・端の値が Brief の短期・長期・導入と一致する）。中身の計算は brief.ts のまま（表示だけ。自動プレイには効かない）。
 * 仕様は docs/ISLAND_PHASE1.md「スライド型の提案書（段 UI7d）」。
 */
import { t } from '../../i18n';
import { DEPT, POLICY, type DeptId, type ValueKey } from './data';
import { METRIC_TEXT, type Ask, type Brief, type Risk } from './brief';
import { DAYS, type P1State, type Stage } from './model';
import type { Plan } from './plan';
import { amountOf, budgetDepts, budgetOpen, deptBudget } from './budget';
import { quarterNow } from './acct';

// ---------------------------------------------------------------- スライドの枚数

/**
 * スライドの種類：sum 結論・change 何が変わる・effect 効果（今月）・long 効果（12 か月）・risk 影響とリスク・more 付録（詳しく）
 */
export type SlideId = 'sum' | 'change' | 'effect' | 'long' | 'risk' | 'more';
export const SLIDE_NAME: Record<SlideId, () => string> = {
  sum: () => t('結論', 'Summary'),
  change: () => t('変更点', 'Changes'),
  effect: () => t('効果：来月', 'Effect: next month'),
  long: () => t(`効果：${POLICY.months} か月`, `Effect: ${POLICY.months} months`),
  risk: () => t('影響とリスク', 'Impact and risks'),
  more: () => t('付録：詳しく', 'Appendix: details'),
};
/**
 * 費用の無い 1 つの手だけの小さな提案（結論と付録の 2 枚）。段 UI7e：月ごとの見込み（倉庫があふれた町・使い切りの手）は、
 * 来月と 12 か月の効き方が違うので小さくしない（効果のスライドで折れ線を見せる）
 */
export const smallBrief = (b: Pick<Brief, 'asks' | 'cost'> & { vals?: Pick<Brief['vals'], 'months'> }) => b.asks.length <= 1 && b.cost.money === 0 && b.cost.rp === 0 && b.cost.monthly === 0 && !b.vals?.months;
/**
 * スライドの並び：
 * - 費用の無い 1 つの手だけ（smallBrief）：結論・付録
 * - ほか：結論 → 何が変わる（手が 2 つ以上か、Before → After の絵があるとき）→ 効果（来月）→ 効果（12 か月。手が 2 つ以上のとき。1 つなら来月の 1 枚にまとめる）→ 影響とリスク → 付録
 */
export function slideKinds(b: Pick<Brief, 'asks' | 'cost'> & { vals?: Pick<Brief['vals'], 'months'> }, o: { visual: boolean }): SlideId[] {
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
  else if (extra && (Math.abs(b.dProfit) < 0.5 || b.vals.months)) out.push(extra);
  // 段 UI7e：月ごとの見込み（倉庫があふれた町・使い切りの手）は、来月の利益の差が続くわけではないので、空く置き場所を見せる
  else if (b.vals.months && b.vals.months.room > 0)
    out.push({ key: 'room', icon: '📦', label: t('倉庫の空き', 'Storage freed'), v: b.vals.months.room, unit: t('個', ''), tone: 'delta', sub: b.vals.months.jam0 && !b.vals.months.jam1 ? t('調達と製造が戻る', 'Buying and crafting resume') : t('素材を商品にする', 'Materials become goods') });
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
 * （長期の式を月に分けたもの：落ち着いた月 ＝（長期 − 1 か月目）÷（月数 − 1））。最後の点は長期の指標（now・after）と一致する。
 * 段 UI7e：月ごとの見込み（vals.months）があれば、その累計（在庫が切れる月・作業台が戻る月で曲がる）
 */
export function longLine(b: Pick<Brief, 'vals' | 'now' | 'after' | 'cost'>): { now: number[]; after: number[] } {
  const M = POLICY.months;
  const P = b.vals.months;
  if (P) {
    const acc = (xs: number[]) => xs.reduce<number[]>((a, x) => [...a, (a[a.length - 1] ?? 0) + x], []);
    return { now: acc(P.now), after: acc(P.after) };
  }
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

/** 段 UI7f：折れ線の縦の点線（倉庫があふれる日。このまま・承認後）。day はいまから何日目 */
export interface LineMark {
  day: number;
  label: string;
  cls: 'is-now' | 'is-after';
}
export function lineMarks(b: Pick<Brief, 'vals'>): LineMark[] {
  const P = b.vals.months;
  if (!P || P.full0 == null) return [];
  const out: LineMark[] = [{ day: P.full0, label: P.full0 < 1 ? t('もうあふれている', 'Already full') : t(`${Math.round(P.full0)} 日目にあふれる`, `Fills on day ${Math.round(P.full0)}`), cls: 'is-now' }];
  if (P.full1 != null && P.full1 < POLICY.months * 30 && Math.abs(P.full1 - P.full0) >= 1) out.push({ day: P.full1, label: t(`承認後 ${Math.round(P.full1)} 日目`, `After: day ${Math.round(P.full1)}`), cls: 'is-after' });
  return out;
}

/**
 * 段 UI7e：月ごとの見込みの説明（効果のスライドの折れ線の下）：使い切りの手で作る品がどこで・いつ・いくつ売れるか、倉庫があふれて入荷が止まるか。
 * name：商品の名前・shop：お店の名前（DOM なしで試せるように渡す）。月ごとの見込みが無ければ空
 */
export function projLines(b: Pick<Brief, 'vals'>, name: (x: string) => string, shop: (uid: number) => string): string[] {
  const P = b.vals.months;
  if (!P) return [];
  const out: string[] = [];
  const n1 = (v: number) => (v > 0 && v < 9.95 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toLocaleString('en-US'));
  const u = P.use;
  if (u) {
    const per = u.sold.slice(1).find((v) => v > 0.05) ?? 0;
    const where = u.shops.length ? t(`（${u.shops.map(shop).join('・')}）`, ` (${u.shops.map(shop).join(', ')})`) : '';
    const later = per > 0.05 ? t(`そのあと月 ${n1(per)} 個`, `then ${n1(per)}/mo`) : t('そのあとは空いた棚が無く売れ残る', 'then unsold (no free shelf)');
    out.push(t(`🧪 ${name(u.x)} ${u.units} 個（1 個 ${Math.round(u.price).toLocaleString('en-US')} G）：作業台 ${u.slot + 1} で ${Math.ceil(u.days)} 日 → 来月 ${n1(u.sold[0])} 個売れる・${later}${where}`, `🧪 ${u.units} ${name(u.x)} (${Math.round(u.price).toLocaleString('en-US')} G each): bench ${u.slot + 1} for ${Math.ceil(u.days)} days → ${n1(u.sold[0])} sell next month, ${later}${where}`));
  }
  if (P.jam0) {
    out.push(P.out0 != null ? t(`📦 このまま：倉庫があふれて素材が入らず、作業台が止まる → お店は在庫だけ（${P.out0} か月目に売り切れ）`, `📦 As is: storage full, no materials, benches stop → shops sell only stock (runs out in month ${P.out0})`) : t('📦 このまま：倉庫があふれて素材が入らず、作業台が止まる → お店は在庫だけ', '📦 As is: storage full, no materials, benches stop → shops sell only stock'));
    out.push(P.jam1 ? t('📦 承認後も倉庫はあふれたまま', '📦 Storage stays full after approval') : t(`📦 承認後：置き場所が ${Math.round(P.room)} 個空き、調達と製造が戻る`, `📦 After: ${Math.round(P.room)} spaces free, buying and crafting resume`));
  }
  // 段 UI7f：このペースで倉庫があふれる日（折れ線の縦の点線）と、承認後
  if (P.full0 != null) {
    const when = P.full0 < 1 ? t('もう倉庫があふれていて', 'storage is already full') : t(`${Math.round(P.full0)} 日目に倉庫があふれ`, `storage fills on day ${Math.round(P.full0)}`);
    const then = P.ramp != null ? t(`${Math.round(P.ramp)} 日で調達も製造も止まる → お店は在庫だけ${P.out0 != null ? `（${P.out0} か月目に売り切れ）` : ''}`, `buying and crafting stop within ${Math.round(P.ramp)} days → shops sell only stock${P.out0 != null ? ` (runs out in month ${P.out0})` : ''}`) : t(`作る数が月 ${Math.round(P.cut)} 個減る（売れ残りのぶん）`, `output drops ${Math.round(P.cut)}/mo (unsold goods)`);
    out.push(t(`📦 このまま：${when}、${then}`, `📦 As is: ${when}; ${then}`));
    out.push(P.full1 == null ? t(`📦 承認後：${POLICY.months} か月のうちにあふれない`, `📦 After: doesn’t fill within ${POLICY.months} months`) : t(`📦 承認後：${Math.round(P.full1)} 日目にあふれる`, `📦 After: fills on day ${Math.round(P.full1)}`));
  }
  return out;
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

/**
 * 4 段の地図（調達・製造・輸送・販売）：影響を受ける段（on）と、その段のひと月に流せる数の差を 1 日あたりに直したもの（d。個／日）。
 * 段 UI7g：「変わる」「細い」の札はやめ、数字で見せる（課題は結論の「課題」で出す）。narrow0・narrow1 は詰まりの段（このまま・承認後）
 */
export interface StageMap {
  stages: { id: Stage; icon: string; name: string; on: boolean; d: number; narrow0: boolean; narrow1: boolean }[];
  /** 承認事項を受け持つ部門（提案した部門を先に）と、提案した部門か */
  depts: { id: DeptId; icon: string; name: string; color: string; own: boolean; n: number }[];
}
export const STAGE_ICON: Record<Stage, string> = { buy: '🛒', craft: '🔨', haul: '🚚', sell: '🏪' };
export const STAGE_NAME: Record<Stage, () => string> = { buy: () => t('調達・保管', 'Buy · store'), craft: () => t('製造', 'Craft'), haul: () => t('輸送', 'Haul'), sell: () => t('販売', 'Sell') };
export function stageMap(b: Pick<Brief, 'asks' | 'dept'>, touched: Stage[], bn0: Stage, bn1: Stage, per: Partial<Record<Stage, number>> = {}): StageMap {
  const stages = (['buy', 'craft', 'haul', 'sell'] as Stage[]).map((id) => {
    const d = per[id] ?? 0;
    return { id, icon: STAGE_ICON[id], name: STAGE_NAME[id](), on: touched.includes(id) || Math.abs(d) >= 0.05, d, narrow0: id === bn0, narrow1: id === bn1 };
  });
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

/** 予算のメーター：月の予算（使った・この提案・残り。超えた分）。予算の無い町は null（段 UI7g から画面は縦の積み上げ棒 propStacks。数字の確かめに残す） */
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

// ---------------------------------------------------------------- 段 UI7g：予算の縦の積み上げ棒（事業部・会社）

/**
 * 予算の縦の積み上げ棒 1 本の材料（提案書の「予算」・経営会議の ③ 必要予算で同じ部品）。
 * mode 'spend'：使う額の増減（提案書：この施策で使う額が増える・減る）。'cap'：予算の枠の増減（経営会議：増額・減額）
 */
export interface Stack {
  title: string;
  /** 予算（枠。この施策の前） */
  total: number;
  /** 使った（期初から今日まで）・使う見込み（今日から期末まで） */
  used: number;
  expect: number;
  /** この施策による増減（＋増額・−減額） */
  delta: number;
  mode: 'spend' | 'cap';
  /** 凡例の名前（使った・使う見込み・この施策） */
  labUsed: string;
  labExp: string;
  labDelta: string;
}
export interface StackSeg {
  cls: 'is-used' | 'is-exp' | 'is-delta' | 'is-left';
  v: number;
  lab: string;
}
/**
 * 積み上げの段（下から）：使った（濃い灰）・使う見込み（薄い灰）・この施策（赤）・残り（緑）。
 * 増額は赤帯の上辺に点線（line＝赤帯の上の高さ）、減額は赤帯の下辺に点線（line＝赤帯の下の高さ）。どちらも「新しい水準」の線。
 * 'spend' の減額：使う見込みのうち減る分を赤に（その下が新しい見込み）。'cap' の増額：枠の上に足す分を赤・減額：枠の上から削る分を赤。
 * over：枠を超える分（使った ＋ 見込み ＋ 増える分 − 枠）。max：棒の目盛りの上（枠・新しい枠・使う合計の大きいほう）
 */
export function stackSegs(x: Stack): { segs: StackSeg[]; max: number; line: number | null; over: number; left: number } {
  const inc = Math.max(0, x.delta);
  const dec = Math.max(0, -x.delta);
  const segs: StackSeg[] = [];
  const add = (cls: StackSeg['cls'], v: number, lab: string) => v > 0.5 && segs.push({ cls, v, lab });
  let line: number | null = null;
  let left = 0;
  let over = 0;
  const base = x.used + x.expect;
  if (x.mode === 'spend') {
    const cut = Math.min(dec, x.expect);
    const exp = x.expect - cut;
    left = Math.max(0, x.total - x.used - exp - cut - inc);
    over = Math.max(0, x.used + exp + inc - x.total);
    add('is-used', x.used, x.labUsed);
    add('is-exp', exp, x.labExp);
    if (inc > 0.5) {
      add('is-delta', inc, x.labDelta);
      line = base + inc;
    } else if (cut > 0.5) {
      add('is-delta', cut, x.labDelta);
      line = x.used + exp;
    }
    add('is-left', left, '');
  } else {
    const t1 = Math.max(0, x.total + x.delta);
    left = Math.max(0, Math.min(x.total, t1) - base);
    over = Math.max(0, base - t1);
    add('is-used', x.used, x.labUsed);
    add('is-exp', x.expect, x.labExp);
    const room0 = Math.max(0, x.total - base);
    if (inc > 0.5) {
      add('is-left', room0, '');
      add('is-delta', inc, x.labDelta);
      line = Math.max(x.total, base) + inc;
    } else if (dec > 0.5) {
      add('is-left', left, '');
      const cut = Math.min(dec, x.total);
      add('is-delta', cut, x.labDelta);
      line = Math.max(base, x.total) - cut;
    } else add('is-left', room0, '');
  }
  // 上に少し余白（点線が枠に隠れないように）
  const max = Math.max(1, x.total, x.total + inc, segs.reduce((a, y) => a + y.v, 0)) * 1.08;
  return { segs, max, line, over, left };
}

/**
 * 提案書の予算の 2 本（事業部・会社＝全部門の予算の合計）。今期（四半期）の予算 ＝ この四半期に締めた月の予算 ＋ いまの月の予算 × 残りの月（いまの月を含む）。
 * 使った ＝ この四半期に締めた月の使った額 ＋ 今月ここまで。使う見込み ＝ いまのペース（この四半期の月の平均。無ければ先月。部門の従業員の給料を含む）で期末まで。
 * この施策 ＝ その部門の導入費用 ＋ 毎月の費用 × 期末までの月数。予算で任せる（Rare から）が開いていなければ空
 */
export function propStacks(s: P1State, b: Pick<Brief, 'budget' | 'asks' | 'cost'>): Stack[] {
  if (!b.budget || !budgetOpen(s)) return [];
  const q = quarterNow(s);
  const rest = q.days / DAYS;
  const one = (d: DeptId) => {
    const B = deptBudget(s, d);
    const amt = amountOf(s, d);
    const total = (B.qamt ?? 0) + amt * (4 - q.inQ);
    const used = (B.qused ?? 0) + B.used;
    const pace = q.inQ > 1 && B.qused ? B.qused / (q.inQ - 1) : (B.last?.used ?? B.used);
    const expect = Math.max(0, pace - B.used) + pace * (3 - q.inQ);
    return { total, used, expect };
  };
  const d = b.budget.dept;
  const mine = b.asks.filter((x) => x.dept === d);
  const delta = mine.reduce((a, x) => a + x.money + x.monthly * rest, 0);
  const all = budgetDepts(s).map(one);
  const sum = (k: 'total' | 'used' | 'expect') => all.reduce((a, x) => a + x[k], 0);
  const L = { labUsed: t('使った', 'Used'), labExp: t('使う見込み', 'Planned'), labDelta: delta >= 0 ? t('この施策', 'This plan') : t('この施策で減る', 'Saved by this') };
  const D = one(d);
  return [
    { title: t(`${DEPT[d].name}部（今期）`, `${DEPT[d].name} (this quarter)`), ...D, delta, mode: 'spend', ...L },
    { title: t('会社（全部門の合計・今期）', 'Company (all divisions, this quarter)'), total: sum('total'), used: sum('used'), expect: sum('expect'), delta, mode: 'spend', ...L },
  ];
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

/** 段 UI7g：影響を受ける箇所の数字（1 日あたり。「+2.4 個／日」「±0」） */
export function perDayText(d: number): string {
  if (Math.abs(d) < 0.05) return '±0';
  const v = Math.abs(d) < 10 ? (Math.round(Math.abs(d) * 10) / 10).toString() : Math.round(Math.abs(d)).toLocaleString('en-US');
  return t(`${d > 0 ? '+' : '−'}${v}個/日`, `${d > 0 ? '+' : '−'}${v}/day`);
}
