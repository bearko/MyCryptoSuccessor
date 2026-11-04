/**
 * 段 UI7d：スライド型の提案書の材料（DOM なし：proposalui.ts・slideui.ts・テストが使う）。
 * brief.ts の Brief（提案書の中身）から、スライドの枚数と、グラフ・タイル・メーターの数字を作る。数字はどれも Brief の数字から出す
 * （グラフの合計・端の値が Brief の短期・長期・導入と一致する）。中身の計算は brief.ts のまま（表示だけ。自動プレイには効かない）。
 * 仕様は docs/ISLAND_PHASE1.md「スライド型の提案書（段 UI7d）」。
 */
import { t } from '../../i18n';
import { DEPT, POLICY, type DeptId, type ValueKey } from './data';
import { METRIC_TEXT, actNoun, judgeOf, type Ask, type Brief, type Risk } from './brief';
import { DAYS, type P1State, type Stage } from './model';
import { planCost, planOf, type Plan } from './plan';
import { amountOf, budgetDepts, budgetOpen, deptBudget } from './budget';
import { quarterNow } from './acct';
import { issueName, type CoIssue } from './issues';
import { actOk, type PropAct } from './deleg';
import type { Card } from './card';

// ---------------------------------------------------------------- スライドの枚数

/**
 * 段 UI9：コンサルの提案資料の型。sum エグゼクティブサマリー・issue 課題の定義（As-Is／To-Be／ギャップ）・move 打ち手（代替案との比較）・
 * effect 効果と費用（縦のウォーターフォール・12 か月の累計・回収）・risk リスクと対策・plan 実行計画（いつ効くか）・more 付録
 */
export type SlideId = 'sum' | 'issue' | 'move' | 'effect' | 'risk' | 'plan' | 'more';
/** 章の名前（下の点の名前。見出しは slideTitle のメッセージ型） */
export const SLIDE_NAME: Record<SlideId, () => string> = {
  sum: () => t('サマリー', 'Summary'),
  issue: () => t('課題の定義', 'The issue'),
  move: () => t('打ち手', 'The move'),
  effect: () => t('効果と費用', 'Effect and cost'),
  risk: () => t('リスクと対策', 'Risks and responses'),
  plan: () => t('実行計画', 'Execution'),
  more: () => t('付録', 'Appendix'),
};
/**
 * 費用の無い 1 つの手だけの小さな提案（サマリーと付録の 2 枚）。段 UI7e：月ごとの見込み（倉庫があふれた町・使い切りの手）は、
 * 来月と 12 か月の効き方が違うので小さくしない
 */
export const smallBrief = (b: Pick<Brief, 'asks' | 'cost'> & { vals?: Pick<Brief['vals'], 'months'> }) => b.asks.length <= 1 && b.cost.money === 0 && b.cost.rp === 0 && b.cost.monthly === 0 && !b.vals?.months;
/** スライドの並び：小さな提案はサマリー・付録。ほかは型の 7 枚 */
export function slideKinds(b: Pick<Brief, 'asks' | 'cost'> & { vals?: Pick<Brief['vals'], 'months'> }): SlideId[] {
  if (smallBrief(b)) return ['sum', 'more'];
  return ['sum', 'issue', 'move', 'effect', 'risk', 'plan', 'more'];
}

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const sg = (v: number) => `${v >= 0.5 ? '+' : v <= -0.5 ? '−' : '±'}${Math.abs(Math.round(v)).toLocaleString('en-US')} G`;
/** 投資回収期間（か月。導入が無い・月の利益が増えないなら null） */
export const paybackOf = (b: Pick<Brief, 'cost' | 'dProfit'>) => (b.cost.money > 0 && b.dProfit > 0.5 ? Math.max(1, Math.ceil(b.cost.money / b.dProfit)) : null);
/** 効果が出るまでの日数（建物の完成・着任・宣伝の日数のいちばん長いもの。無ければ 0＝承認と同時） */
export const leadOf = (b: Pick<Brief, 'cost'>) => Math.max(0, ...b.cost.items.map((it) => it.days ?? 0));
/** 課題の札の文（「倉庫の容量不足：放置すると 月 −12,000 G・18 日後」） */
export const issueLine = (x: Pick<CoIssue, 'key' | 'loss'>) => t(`${issueName(x.key)}：${x.loss}`, `${issueName(x.key)}: ${x.loss}`);

/**
 * 段 UI9：メッセージ型の一言（課題 → 打ち手 → 効果と回収期間を 1 文で）。
 * 「倉庫の容量不足で月 12,000 G を失っている。倉庫の増築で 3 か月以内に回収、長期 +45,000 G」
 */
export function headlineOf(b: Pick<Brief, 'issue' | 'asks' | 'cost' | 'dProfit' | 'vals'>, what: string): string {
  const L = b.vals.list.find((m) => m.key === 'long')?.d ?? 0;
  const pay = paybackOf(b);
  const head = b.issue
    ? b.issue.grow
      ? t(`${issueName(b.issue.key)}に月 ${g(b.issue.impact)} の余地。`, `${issueName(b.issue.key)}: about ${g(b.issue.impact)}/mo of upside. `)
      : b.issue.days != null && b.issue.days >= 1
        ? t(`${issueName(b.issue.key)}で ${Math.round(b.issue.days)} 日後から月 ${g(b.issue.impact)} を失う。`, `${issueName(b.issue.key)} costs ${g(b.issue.impact)}/mo from day ${Math.round(b.issue.days)}. `)
        : t(`${issueName(b.issue.key)}で月 ${g(b.issue.impact)} を失っている。`, `${issueName(b.issue.key)} is costing ${g(b.issue.impact)}/mo. `)
    : '';
  const tail = pay != null ? t(`${what}で ${pay} か月以内に回収、${POLICY.months} か月で ${sg(L)}`, `${what} pays back within ${pay} mo; ${sg(L)} over ${POLICY.months} months`) : b.dProfit > 0.5 ? t(`${what}で月 ${sg(b.dProfit)}、${POLICY.months} か月で ${sg(L)}`, `${what}: ${sg(b.dProfit)}/mo, ${sg(L)} over ${POLICY.months} months`) : t(`${what}で ${POLICY.months} か月 ${sg(L)}`, `${what}: ${sg(L)} over ${POLICY.months} months`);
  return head + tail;
}
/** 段 UI9：各ページのメッセージ型の見出し（何が言えるか） */
export function slideTitle(id: SlideId, b: Pick<Brief, 'issue' | 'asks' | 'cost' | 'dProfit' | 'vals' | 'rk' | 'after' | 'now'>, what: string): string {
  const L = b.vals.list.find((m) => m.key === 'long')?.d ?? 0;
  const pay = paybackOf(b);
  const lead = leadOf(b);
  switch (id) {
    case 'sum':
      return t('結論：承認を推奨', 'Conclusion: approve');
    case 'issue':
      return b.issue ? (b.issue.grow ? t(`${issueName(b.issue.key)}に月 ${g(b.issue.impact)} の余地がある`, `${issueName(b.issue.key)} has ${g(b.issue.impact)}/mo of upside`) : t(`${issueName(b.issue.key)}で月 ${g(b.issue.impact)} を失っている`, `${issueName(b.issue.key)} is costing ${g(b.issue.impact)}/mo`)) : t('解くべき課題', 'The issue');
    case 'move':
      return b.asks.length > 1 ? t(`${what} など ${b.asks.length} 件が最善の打ち手`, `${what} and ${b.asks.length - 1} more are the best moves`) : t(`${what}が最善の打ち手`, `${what} is the best move`);
    case 'effect':
      return pay != null ? t(`${pay} か月で回収、${POLICY.months} か月で ${sg(L)}`, `Pays back in ${pay} mo; ${sg(L)} over ${POLICY.months} months`) : t(`月の利益 ${sg(b.dProfit)}、${POLICY.months} か月で ${sg(L)}`, `${sg(b.dProfit)}/mo; ${sg(L)} over ${POLICY.months} months`);
    case 'risk': {
      const hi = b.rk.filter((x) => x.lv >= 2).length;
      return hi ? t(`下振れシナリオ ${hi} 件に対策あり`, `${hi} downside scenario${hi > 1 ? 's' : ''}, each with a response`) : t('大きな下振れシナリオは無い', 'No major downside scenario');
    }
    case 'plan':
      return lead > 0 ? t(`承認から ${lead} 日で効果が出る`, `Effect within ${lead} days of approval`) : t('承認と同時に実行、効果は来月から', 'Runs on approval; effect from next month');
    case 'more':
      return t('付録：計算の根拠', 'Appendix: the workings');
  }
}

// ---------------------------------------------------------------- 結論：KPI のタイル

export interface Kpi {
  key: ValueKey | 'setup' | 'month' | 'room' | 'payback' | 'lead';
  icon: string;
  label: string;
  /** 大きな数字（符号つきの差。導入費用は払う額）・単位 */
  v: number;
  unit: string;
  /** 増えるのが良いか（導入費用は 'cost'：色を付けない） */
  tone: 'delta' | 'cost';
  /** 小さなラベル（「このまま → 承認後」「1 回」） */
  sub: string;
  /** 段 UI9：数字の代わりに出す字（回収できない「—」・効果が出るまで「即日」） */
  text?: string;
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
  if (S) out.push({ key: 'short', icon: METRIC_TEXT.short.icon, label: t('短期利益', 'Short-term'), v: S.d, unit: 'G', tone: 'delta', sub: t('来月・導入費用を引いた差', 'Next month, net of setup') });
  if (L) out.push({ key: 'long', icon: METRIC_TEXT.long.icon, label: t('長期利益', 'Long-term'), v: L.d, unit: 'G', tone: 'delta', sub: t(`${POLICY.months} か月の合計の差`, `${POLICY.months}-month total`) });
  const setup = b.cost.money > 0 || b.cost.rp === 0;
  out.push({
    key: 'setup',
    icon: '💳',
    label: t('導入費用', 'Setup cost'),
    v: setup ? b.cost.money : b.cost.rp,
    unit: setup ? 'G' : 'RP',
    tone: 'cost',
    sub: [b.cost.money > 0 && b.cost.rp > 0 ? `+${b.cost.rp} RP` : '', b.cost.monthly ? t(`毎月 +${fmt(b.cost.monthly)} G`, `+${fmt(b.cost.monthly)} G/mo`) : t('1 回', 'once')].filter(Boolean).join(t('・', ' · ')),
  });
  // 段 UI9：投資回収期間・効果が出るまでの日数
  const pay = paybackOf(b);
  out.push({ key: 'payback', icon: '⏳', label: t('投資回収期間', 'Payback'), v: pay ?? 0, unit: t('か月', 'mo'), tone: 'cost', ...(pay == null ? { text: '—' } : {}), sub: pay != null ? t(`導入 ${fmt(b.cost.money)} G ÷ 月 ${sg(b.dProfit)}`, `${fmt(b.cost.money)} G ÷ ${sg(b.dProfit)}/mo`) : b.cost.money > 0 ? t('月の利益が増えない', 'No monthly gain') : t('導入費用なし', 'No setup cost') });
  const lead = leadOf(b);
  out.push({ key: 'lead', icon: '📅', label: t('効果が出るまで', 'Time to effect'), v: lead, unit: t('日', 'd'), tone: 'cost', ...(lead > 0 ? {} : { text: t('即日', 'Same day') }), sub: lead > 0 ? t('完成・着任・宣伝の日数', 'Build, arrival or ad days') : t('承認と同時', 'On approval') });
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
  else if (extra) out.push(extra);
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

/** ウォーターフォールの 1 本。kind 'start'：As-Is の月の利益（全体の棒）・'ask'：承認事項の行の増収／費用（増減の棒）・'setup'：導入（1 回）・'total'：To-Be の短期利益（全体の棒） */
export interface Fall {
  kind: 'start' | 'ask' | 'setup' | 'total';
  label: string;
  dept: DeptId | null;
  icon: string;
  v: number;
  from: number;
  to: number;
}
/**
 * 段 UI9：効果と費用のウォーターフォール（As-Is の月の利益 → 承認事項の行ごとの月の利益の増え（Brief.parts。手が 1 つなら月の利益の差）→ 導入（1 回）
 * → To-Be の短期利益）。両端は全体の棒、間は増減の棒。最後の棒 ＝ As-Is の利益 ＋ 短期の差（vals の short.after）
 */
export function fallOf(b: Pick<Brief, 'parts' | 'asks' | 'dProfit' | 'cost' | 'now'>): Fall[] {
  const out: Fall[] = [];
  let at = b.now.profit;
  out.push({ kind: 'start', label: t('As-Is の月の利益', 'As-Is monthly profit'), dept: null, icon: '💰', v: at, from: 0, to: at });
  const add = (kind: Fall['kind'], label: string, dept: DeptId | null, icon: string, v: number) => {
    out.push({ kind, label, dept, icon, v, from: at, to: at + v });
    at += v;
  };
  if (b.parts.length > 1) for (const x of b.parts) add('ask', shortWhat(x.what), x.dept, askIcon(x.kind), x.dProfit);
  else {
    const a = b.asks[0];
    add('ask', a ? shortWhat(a.what) : t('月の利益の差', 'Monthly profit change'), a?.dept ?? null, a ? askIcon(a.kind) : '💰', b.dProfit);
  }
  if (b.cost.money > 0) add('setup', t('導入費用（1 回）', 'Setup (once)'), null, '💳', -b.cost.money);
  out.push({ kind: 'total', label: t('To-Be の短期利益', 'To-Be short-term profit'), dept: null, icon: METRIC_TEXT.short.icon, v: at, from: 0, to: at });
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
    out.push(P.out0 != null ? t(`📦 As-Is：倉庫があふれて素材が入らず、作業台が止まる → お店は在庫だけ（${P.out0} か月目に売り切れ）`, `📦 As-Is: storage full, no materials, benches stop → shops sell only stock (runs out in month ${P.out0})`) : t('📦 As-Is：倉庫があふれて素材が入らず、作業台が止まる → お店は在庫だけ', '📦 As-Is: storage full, no materials, benches stop → shops sell only stock'));
    if (!P.jam1) out.push(t(`📦 To-Be：置き場所が ${Math.round(P.room)} 個空き、調達と製造が戻る`, `📦 To-Be: ${Math.round(P.room)} spaces free, buying and crafting resume`));
  }
  // 段 UI7f：このペースで倉庫があふれる日と、承認後。段 UI9：手が倉庫に効かない（承認後も同じ日）なら、手と無関係な As-Is／To-Be は出さない
  if (P.full0 != null && (P.full1 == null || Math.abs(P.full1 - P.full0) >= 1)) {
    const when = P.full0 < 1 ? t('もう倉庫があふれていて', 'storage is already full') : t(`${Math.round(P.full0)} 日目に倉庫があふれ`, `storage fills on day ${Math.round(P.full0)}`);
    const then = P.ramp != null ? t(`${Math.round(P.ramp)} 日で調達も製造も止まる → お店は在庫だけ${P.out0 != null ? `（${P.out0} か月目に売り切れ）` : ''}`, `buying and crafting stop within ${Math.round(P.ramp)} days → shops sell only stock${P.out0 != null ? ` (runs out in month ${P.out0})` : ''}`) : t(`処理量が月 ${Math.round(P.cut)} 個減る（売れ残りのぶん）`, `throughput drops ${Math.round(P.cut)}/mo (unsold goods)`);
    out.push(t(`📦 As-Is：${when}、${then}`, `📦 As-Is: ${when}; ${then}`));
    out.push(P.full1 == null ? t(`📦 To-Be：${POLICY.months} か月のうちにあふれない`, `📦 To-Be: doesn’t fill within ${POLICY.months} months`) : t(`📦 To-Be：${Math.round(P.full1)} 日目にあふれる`, `📦 To-Be: fills on day ${Math.round(P.full1)}`));
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
  // 会社の棒は経営会議の ③ と同じ「部長のいる部門の予算の合計」（予算を使うのは部長のいる部門だけ）。提案の部門は必ず入れる
  const headed = (x: DeptId) => s.staff.some((y) => y.heads?.includes(x) || (y.task === 'lead' && y.target === `H:${x}`));
  const all = budgetDepts(s).filter((x) => x === d || headed(x)).map(one);
  const sum = (k: 'total' | 'used' | 'expect') => all.reduce((a, x) => a + x[k], 0);
  const L = { labUsed: t('使った', 'Used'), labExp: t('使う見込み', 'Planned'), labDelta: delta >= 0 ? t('この施策', 'This plan') : t('この施策で減る', 'Saved by this') };
  const D = one(d);
  return [
    { title: t(`${DEPT[d].name}部（今期）`, `${DEPT[d].name} (this quarter)`), ...D, delta, mode: 'spend', ...L },
    { title: t('会社（全部門の合計・今期）', 'Company (all divisions, this quarter)'), total: sum('total'), used: sum('used'), expect: sum('expect'), delta, mode: 'spend', ...L },
  ];
}

// ---------------------------------------------------------------- 段 UI9：課題の定義（As-Is／To-Be／ギャップ）・代替案・対策・実行計画

/** 課題の定義のページの 1 行：事業の数字（As-Is → To-Be → ギャップ）。unit：単位の文。good：増えるのが良いか */
export interface GapRow {
  key: 'units' | 'sales' | 'profit' | 'full' | 'cap' | 'cash';
  label: string;
  asIs: number;
  toBe: number;
  fmt: (v: number) => string;
  good: 'up' | 'down';
}
/**
 * 課題の定義：事業の数字（処理量 個／月・売上・月の利益・倉庫があふれる日・置き場所・資金）の As-Is／To-Be／ギャップ。
 * 手と無関係な行（To-Be が As-Is と同じ倉庫の日・置き場所）は出さない。処理量・売上・利益はいつも
 */
export function gapRows(b: Pick<Brief, 'now' | 'after' | 'vals' | 'co' | 'cost'>, cap0: number, cap1: number): GapRow[] {
  const G = (v: number) => g(v);
  const N = (v: number) => t(`${Math.round(v).toLocaleString('en-US')} 個`, `${Math.round(v).toLocaleString('en-US')}`);
  const out: GapRow[] = [
    { key: 'units', label: t('処理量（売れる数）', 'Throughput (units sold)'), asIs: b.now.units, toBe: b.after.units, fmt: (v) => t(`${N(v)}／月`, `${N(v)}/mo`), good: 'up' },
    { key: 'sales', label: t('月の売上', 'Monthly sales'), asIs: b.now.sales, toBe: b.after.sales, fmt: G, good: 'up' },
    { key: 'profit', label: t('月の利益', 'Monthly profit'), asIs: b.now.profit, toBe: b.after.profit, fmt: G, good: 'up' },
  ];
  const M = b.vals.months;
  if (M?.full0 != null && (M.full1 == null || Math.abs(M.full1 - M.full0) >= 1)) out.push({ key: 'full', label: t('倉庫があふれる日', 'Storage fills on day'), asIs: M.full0, toBe: M.full1 ?? POLICY.months * DAYS, fmt: (v) => (v >= POLICY.months * DAYS ? t('あふれない', 'Never') : v < 1 ? t('もう満杯', 'Already full') : t(`${Math.round(v)} 日目`, `day ${Math.round(v)}`)), good: 'up' });
  if (cap1 !== cap0) out.push({ key: 'cap', label: t('置き場所', 'Storage space'), asIs: cap0, toBe: cap1, fmt: N, good: 'up' });
  if (b.cost.money > 0) out.push({ key: 'cash', label: t('資金（承認の直後）', 'Funds (right after approval)'), asIs: b.co.cash, toBe: b.co.left, fmt: G, good: 'up' });
  return out;
}

/** 代替案の 1 行（同じカードのほかの手。推奨の手と、効果・費用・回収で比べる） */
export interface Alt {
  name: string;
  /** 月の利益の差・12 か月の差・導入費用・回収（か月）・推奨が承認になるか */
  dProfit: number;
  long: number;
  money: number;
  payback: number | null;
  ok: boolean;
  chosen: boolean;
}
/**
 * 段 UI9：打ち手のページの「代替案との比較」。カードのほかの手（card.ts の shownRec が内部で比べている手）を 2 本まで、同じ判断（judgeOf）で並べる。
 * 推奨の手（いまの提案）を先頭に。カードが無ければ、いまの提案だけ
 */
export function altsOf(s: P1State, plan: Plan, b: Pick<Brief, 'dProfit' | 'vals' | 'cost'>, card: Card | null, iss: CoIssue[], base: P1State, n = 2): Alt[] {
  const L = b.vals.list.find((m) => m.key === 'long')?.d ?? 0;
  const mine: Alt = { name: plan.acts.map((a) => actNoun(a)).join(t('＋', ' + ')), dProfit: b.dProfit, long: L, money: b.cost.money, payback: paybackOf(b), ok: true, chosen: true };
  const out: Alt[] = [mine];
  if (!card) return out;
  const key = (a: PropAct) => JSON.stringify(a);
  const have = new Set(plan.acts.map(key));
  for (const c of card.choices) {
    if (out.length > n) break;
    const a = c.act.k === 'do' ? c.act.a : c.act.k === 'approve' ? s.deleg?.inbox.find((p) => p.id === (c.act as { pid: number }).pid)?.act : undefined;
    if (!a || have.has(key(a)) || !actOk(s, a)) continue;
    const p = planOf(s, [a], { hero: card.hero, q: card.q, dept: card.dept });
    const j = judgeOf(s, p, iss, base);
    const cost = planCost(s, p);
    out.push({ name: actNoun(a), dProfit: j.dProfit, long: j.long, money: cost.money, payback: paybackOf({ cost, dProfit: j.dProfit }), ok: j.rec === 'ok', chosen: false });
  }
  return out;
}

/** 段 UI9：リスクの種類ごとの対策（下振れのとき、いまの仕組みでできること） */
export function counterOf(k: Risk['kind']): string {
  switch (k) {
    case 'read':
      return t('翌月の月次報告で見込みと実績を比べる。下振れなら、人は持ち場を戻し、棚は並べ替える', 'Compare forecast with actuals in next month’s report; on a shortfall, move people back and re-shelve');
    case 'ad':
      return t('宣伝は期間限定。効き目が費用を下回れば次の宣伝は出さない', 'The ad is time-limited; if lift falls short of cost, don’t renew');
    case 'stock':
      return t('売れ残りは売りさばき（セール）か、いまの素材で別の品を作って減らす', 'Clear unsold stock with a sale or craft another item from the materials');
    case 'ops':
      return t('製造と販売の連動（主力の切り替え）は、いつでも工房の画面から戻せる', 'The crafting/selling switch can be undone any time from the workshop');
    case 'dept':
      return t('依頼先の部門が動けないときは、その行だけ見送って残りを実行する', 'If the other division can’t act, drop that line and run the rest');
    case 'flow':
      return t('次のボトルネックは、翌月の課題の一覧に出る。次の提案で解く', 'The next bottleneck appears in next month’s issues; the next proposal addresses it');
    case 'budget':
      return t('予算の上限を超えるぶんは会社の資金から。経営会議で予算を見直す', 'The excess comes from company funds; revisit the budget at the board meeting');
    case 'cash':
      return t('承認後の資金がひと月の固定費を下回るなら、高い手から順に見送る', 'If funds fall below a month of fixed costs, drop the costliest lines first');
  }
}

/** 実行計画の 1 行（いつ効くか） */
export interface Milestone {
  day: number;
  label: string;
  kind: 'now' | 'build' | 'arrive' | 'ad' | 'effect';
}
/** 段 UI9：実行計画（承認日 → 完成・着任・宣伝の終わり → 効果が出る月）。cost.items[].days から。日数の無い手は承認と同時 */
export function timelineOf(b: Pick<Brief, 'cost' | 'asks'>): Milestone[] {
  const out: Milestone[] = [{ day: 0, label: t('承認：すぐに実行', 'Approval: carried out at once'), kind: 'now' }];
  const timed = b.cost.items.filter((it) => (it.days ?? 0) > 0).sort((a, c) => (a.days ?? 0) - (c.days ?? 0));
  for (const it of timed) {
    const ask = b.asks.find((a) => a.at.includes(it.at ?? -1));
    const kind: Milestone['kind'] = ask?.kind === 'ad' ? 'ad' : ask?.kind === 'hire' || ask?.kind === 'assign' ? 'arrive' : 'build';
    out.push({ day: it.days ?? 0, label: kind === 'ad' ? t(`${it.label}：${it.days} 日間の宣伝が終わる`, `${it.label}: ${it.days}-day ad ends`) : kind === 'arrive' ? t(`${it.label}：${it.days} 日目に着任`, `${it.label}: starts on day ${it.days}`) : t(`${it.label}：${it.days} 日目に完成`, `${it.label}: done on day ${it.days}`), kind });
  }
  const lead = leadOf(b);
  out.push({ day: Math.max(lead, 1), label: lead > 0 ? t(`${lead} 日目から効果が出る（来月の報告で確かめる）`, `Effect from day ${lead} (check next month’s report)`) : t('来月の報告で効果を確かめる', 'Check the effect in next month’s report'), kind: 'effect' });
  return out;
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
