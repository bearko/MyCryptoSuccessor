/**
 * 段 UI7g：課題の一覧（DOM なし：card.ts・brief.ts・proposalui.ts・cardui.ts・テストが使う）。
 * いちばん大事な決まり：**事業の成長のボトルネックになっている課題を的確に定義し、複数あれば優先度を付ける。提案は必ず課題を持ち、
 * 課題を解かない手は提案にしない**（docs/SUCCESSOR_VISION.md 0 章：ヒーローはシゴデキ）。
 *
 * - 課題の一覧（issuesOf）：いまの町のモデルの数字から作る。新しい数字は作らない。
 *   - SCM の詰まり（調達・保管／製造／輸送／販売のいちばん細い段。model.ts の stageCaps・bottleneck・nextJam・stallOf）。
 *     優先の元＝その段を次に細い段まで太くしたときの流れの増え × 1 個の粗利 × ISSUE.boost（月の G）。流れが止まっていれば、月の粗利まるごと
 *   - 倉庫（埋まりが CLEAR.warn 以上。storefc.ts のあふれるまでの日数が短いほど重い）
 *   - 資金（ひと月の固定費を下回る・先月が赤字）・士気（平均が ISSUE.morale 未満・辞めたい人）・顧客満足度（Uncommon から。ISSUE.sat 未満）
 *   - 成長の余地（ブランド力が上限の手前・研究ポイント）：ほかの課題より下（月の売上 × ISSUE.grow）
 *   並びは優先の元の大きい順。pri は 1 から。
 * - 提案の課題（issueFor）：提案（Plan）を承認すると良くなる課題のうち、いちばん優先の高いもの。良くなるかは、提案書の見積もり（brief.ts の
 *   valuesOf の指標と月の売れる数）と、承認後の状態の数字（置き場所）で決める。お金の課題（SCM・倉庫・資金）は、どの手でも数字が良くなれば解く。
 *   お金以外の課題（士気・満足度・ブランド・研究）は、その種類の手（brief.ts の actTheme）だけが解く（雇う手の士気の平均の揺れを、士気の課題に数えない）。
 * 仕様は docs/ISLAND_PHASE1.md「課題の定義（段 UI7g）」。
 */
import { t } from '../../i18n';
import { CS, ISSUE, MORALE, POLICY } from './data';
import { DAYS, bottleneck, myShops, myWorkshop, nextJam, poolCap, poolUsed, stageCaps, stallOf, type P1State, type Stage, type StageCap } from './model';
import { reserveOf, unitMargin } from './deleg';
import { storeFull } from './stock';
import { storeFc } from './storefc';
import { moraleAvg, wantsToQuit } from './hr';
import { csOn } from './cs';
import { brandCap } from './company';
import { corpOf, policyName, policyOf, POL_OFF } from './policy';
import { POLICY_OF } from './data';

export type IssueKey = Stage | 'store' | 'cash' | 'profit' | 'morale' | 'sat' | 'brand' | 'rp';
export const STAGES: Stage[] = ['buy', 'craft', 'haul', 'sell'];
/** 課題 1 つ。score：優先の元（月の G）・pri：優先（1 から）・now：いまの数（流れの段は個／月）・note：根拠の 1 行 */
export interface CoIssue {
  key: IssueKey;
  pri: number;
  score: number;
  now: number;
  /** 流れが止まっている段（SCM） */
  stopped?: boolean;
  /** 伸ばす課題（方針の大事な指標。低いからではない） */
  grow?: boolean;
  note: string;
}

/** 課題の名前（ビジネスの言葉。「販売がボトルネック」「倉庫の逼迫」） */
export function issueName(k: IssueKey): string {
  switch (k) {
    case 'buy':
      return t('調達・保管がボトルネック', 'Buying & storage is the bottleneck');
    case 'craft':
      return t('製造がボトルネック', 'Crafting is the bottleneck');
    case 'haul':
      return t('輸送がボトルネック', 'Hauling is the bottleneck');
    case 'sell':
      return t('販売がボトルネック', 'Selling is the bottleneck');
    case 'store':
      return t('倉庫の逼迫', 'Storage running out');
    case 'cash':
      return t('資金繰り', 'Cash flow');
    case 'profit':
      return t('収益性の改善', 'Profitability');
    case 'morale':
      return t('士気の向上', 'Morale');
    case 'sat':
      return t('顧客満足度の向上', 'Satisfaction');
    case 'brand':
      return t('ブランド力の伸び', 'Brand growth');
    case 'rp':
      return t('研究の伸び', 'Research growth');
  }
}
/** 課題の短い名前（チップ・スライドの札） */
export function issueShort(k: IssueKey): string {
  switch (k) {
    case 'buy':
      return t('調達・保管', 'Buying');
    case 'craft':
      return t('製造', 'Crafting');
    case 'haul':
      return t('輸送', 'Hauling');
    case 'sell':
      return t('販売', 'Selling');
    default:
      return issueName(k);
  }
}
export const ISSUE_ICON: Record<IssueKey, string> = { buy: '🛒', craft: '🔨', haul: '🚚', sell: '🏪', store: '📦', cash: '💰', profit: '📈', morale: '😊', sat: '🤝', brand: '★', rp: '🔬' };
/** お金の課題（どの手でも数字が良くなれば解く） */
const MONEY: IssueKey[] = ['buy', 'craft', 'haul', 'sell', 'store', 'cash', 'profit'];
export const isFlowKey = (k: IssueKey): k is Stage => (STAGES as string[]).includes(k);

const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
const cap = (c: StageCap) => (c.stopped ? 0 : c.perMonth);
/** 月の売上の目安（先月。無ければ POLICY.floor） */
const salesOf = (s: P1State) => Math.max(POLICY.floor, s.reports[s.reports.length - 1]?.revenue ?? 0);

/**
 * いまの町の課題の一覧（優先の高い順。pri は 1 から）。お店も工房も無い町は空。
 */
export function issuesOf(s: P1State): CoIssue[] {
  const out: Omit<CoIssue, 'pri'>[] = [];
  const shops = myShops(s).length > 0;
  if (shops && myWorkshop(s)) {
    const caps = stageCaps(s, true);
    const st = stallOf(s);
    const bn = st?.stage ?? bottleneck(caps);
    const margin = unitMargin(s);
    const now = cap(caps[bn]);
    let score: number;
    let stopped = false;
    if (st || caps[bn].stopped) {
      // 流れが止まっている：月の粗利まるごと（止まる前の売上の目安 × 粗利）
      stopped = true;
      score = Math.max(salesOf(s), ...STAGES.filter((k) => k !== bn).map((k) => cap(caps[k]) * margin)) * ISSUE.boost;
    } else {
      const nj = nextJam(s, caps);
      const to = nj.same ? now * 1.3 : nj.n;
      score = Math.max(ISSUE.min, (to - now) * margin * ISSUE.boost);
    }
    const others = STAGES.filter((k) => k !== bn).map((k) => `${stageWord(k)} ${Math.round(cap(caps[k]))}`);
    out.push({ key: bn, score, now, stopped, note: stopped ? t(`${stageWord(bn)}が止まっている（ほかの段：${others.join('・')} 個／月）`, `${stageWord(bn)} has stopped (others: ${others.join(', ')}/mo)`) : t(`${stageWord(bn)} 月 ${Math.round(now)} 個がいちばん少ない（${others.join('・')} 個／月）`, `${stageWord(bn)} ${Math.round(now)}/mo is the lowest (${others.join(', ')}/mo)`) });
  }
  // 倉庫：埋まりが警告を超えた。あふれるまでの日数が短いほど重い（もうあふれていれば月の粗利まるごと）
  if (shops && storeFull(s)) {
    const F = storeFc(s);
    const pc = Math.round((poolUsed(s) / Math.max(1, poolCap(s))) * 100);
    const days = F.days ?? (pc >= 100 ? 0 : null);
    const k = days == null ? 0.3 : Math.max(0.3, Math.min(1, (ISSUE.storeDays - days) / ISSUE.storeDays));
    out.push({ key: 'store', score: salesOf(s) * unitShare(s) * k * ISSUE.boost, now: pc, note: days != null ? (days < 1 ? t(`倉庫 ${pc}%・もうあふれている`, `Storage ${pc}%, already full`) : t(`倉庫 ${pc}%・あと ${Math.round(days)} 日であふれる`, `Storage ${pc}%, full in ${Math.round(days)} days`)) : t(`倉庫 ${pc}%`, `Storage ${pc}%`) });
  }
  // 資金：ひと月の固定費を下回る・先月が赤字
  const r = s.reports[s.reports.length - 1];
  const reserve = reserveOf(s);
  const short = Math.max(0, reserve - s.money);
  const loss = Math.max(0, -(r?.profit ?? 0));
  if (short > 0 || loss > 0) out.push({ key: 'cash', score: Math.max(short, loss), now: s.money, note: loss > 0 ? t(`先月の利益 ${g(-loss)}`, `Last month’s profit ${g(-loss)}`) : t(`資金 ${g(s.money)}（ひと月の固定費 ${g(reserve)}）`, `Funds ${g(s.money)} (a month of costs ${g(reserve)})`) });
  // 士気：平均が低い・辞めたい人
  const mo = moraleAvg(s);
  const quit = wantsToQuit(s).length;
  // 士気の重さ：働きの速さの帯（MORALE.band.lo 未満で ×0.9）と、辞める人
  if (mo != null && (mo < ISSUE.morale || quit > 0)) out.push({ key: 'morale', score: salesOf(s) * unitShare(s) * ((mo < MORALE.band.lo ? 1 - MORALE.band.low : 0.03) + 0.05 * quit), now: mo, note: quit ? t(`士気の平均 ${mo}・辞めたい人 ${quit} 人`, `Average morale ${mo}, ${quit} want to quit`) : t(`士気の平均 ${mo}`, `Average morale ${mo}`) });
  // 顧客満足度（Uncommon から）
  if (csOn(s) && s.cs) {
    const v = Math.round(s.cs.sat ?? CS.start);
    if (v < ISSUE.sat) out.push({ key: 'sat', score: salesOf(s) * unitShare(s) * 0.05, now: v, note: t(`顧客満足度 ${v}`, `Satisfaction ${v}`) });
  }
  // 方針の大事な指標（重み 1 以上の、お金以外の指標）：低くなくても「伸ばす」課題に（段 UI7c：コストセンターの提案が、お金以外の効果で通る道）
  const sales = salesOf(s);
  for (const id of POL_OFF.on ? [policyOf(s)] : corpOf(s)) {
    const w = POLICY_OF[id]?.w;
    if (!w) continue;
    for (const k of ['morale', 'sat'] as const) {
      if (w[k] < 1 || out.some((x) => x.key === k)) continue;
      if (k === 'sat' && !csOn(s)) continue;
      const v = k === 'morale' ? mo : Math.round(s.cs?.sat ?? CS.start);
      if (v == null) continue;
      const nm = k === 'morale' ? t(`士気の平均 ${v}`, `Morale ${v}`) : t(`顧客満足度 ${v}`, `Satisfaction ${v}`);
      out.push({ key: k, grow: true, score: sales * ISSUE.grow * w[k], now: v, note: t(`${nm}（方針：${policyName(id)}）`, `${nm} (policy: ${policyName(id)})`) });
    }
  }
  // 収益性の改善（いつも。いちばん下の段）：費用を減らす・利益を伸ばす手
  if (shops) out.push({ key: 'profit', score: sales * ISSUE.grow * 0.8, now: r?.profit ?? 0, note: r ? t(`先月の売上 ${g(r.revenue)}・利益 ${g(r.profit)}`, `Last month: sales ${g(r.revenue)}, profit ${g(r.profit)}`) : t('月の利益の伸び', 'Monthly profit growth') });
  // 成長の余地（ほかの課題より下）
  if (shops && (s.brand ?? 0) < brandCap(s)) out.push({ key: 'brand', score: salesOf(s) * ISSUE.grow, now: Math.round(s.brand ?? 0), note: t(`ブランド力 ${Math.round(s.brand ?? 0)} / 上限 ${brandCap(s)}`, `Brand ${Math.round(s.brand ?? 0)} / cap ${brandCap(s)}`) });
  if (s.dig) out.push({ key: 'rp', score: salesOf(s) * ISSUE.grow * 0.5, now: Math.round(s.rp ?? 0), note: t(`研究ポイント ${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP`, `${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP`) });
  // 並び：お金の課題（SCM の詰まり・倉庫・資金）→ 士気・満足度が低い → 伸ばす課題（方針の指標・収益性・ブランド・研究）。同じ段の中は優先の元の大きい順
  return out.sort((a, b) => tierOf(a) - tierOf(b) || b.score - a.score).map((x, k) => ({ ...x, pri: k + 1 }));
}
/** 課題の段（0：お金の課題・1：士気と満足度が低い・2：伸ばす課題） */
function tierOf(x: Omit<CoIssue, 'pri'>): number {
  if (MONEY.includes(x.key) && x.key !== 'profit') return 0;
  if ((x.key === 'morale' || x.key === 'sat') && !x.grow) return 1;
  return 2;
}
/** 売上のうち粗利の割合の目安（1 個の粗利 ÷ 1 個の売値。先月の数字から。無ければ 0.5） */
function unitShare(s: P1State): number {
  const r = s.reports[s.reports.length - 1];
  const sold = r?.flow?.sold ?? 0;
  if (!r || sold <= 0 || r.revenue <= 0) return 0.5;
  return Math.max(0.1, Math.min(1, (unitMargin(s) * sold) / r.revenue));
}
const stageWord = (k: Stage) => ({ buy: t('調達・保管', 'Buying'), craft: t('製造', 'Crafting'), haul: t('輸送', 'Hauling'), sell: t('販売', 'Selling') })[k];

/**
 * 流れの段の手（whatIf の手）の、会社の流れ（4 段のいちばん少ない数）の増え（個／月）。その段だけが太くなるとして、
 * 次に細い段で頭打ち。詰まりでない段を太くしても 0（ボトルネックを解かない手）。止まっている段を動かす手は、その段の増えのまま
 */
export function flowGain(s: P1State, stage: Stage, units: number, caps = stageCaps(s, true)): number {
  // 止まっている段を動かす手は、ほかの段に関係なく（流れを戻す前提の手）
  if (stage === 'sell' || caps[stage].stopped) return units;
  const others = Math.min(...STAGES.filter((k) => k !== stage).map((k) => cap(caps[k])));
  const b0 = cap(caps[stage]);
  return Math.max(0, Math.min(b0 + units, others) - Math.min(b0, others));
}

/** 提案の課題を決める材料（brief.ts の見積もりから） */
export interface IssueProbe {
  /** 来月の売れる数・置き場所の前後・倉庫があふれる日の前後 */
  units0: number;
  units1: number;
  cap0: number;
  cap1: number;
  used0: number;
  used1: number;
  full0?: number | null;
  full1?: number | null;
  /** 流れの止まっている段（このまま・承認後。stageCaps の stopped） */
  stops0?: Stage[];
  stops1?: Stage[];
  /** 倉庫があふれて入荷が止まるか（このまま・承認後）・空く置き場所（brief.ts の月ごとの見込み） */
  jam0?: boolean;
  jam1?: boolean;
  room?: number;
  /** 指標の差（短期・長期・士気・満足度・ブランド・研究） */
  d: Partial<Record<'short' | 'long' | 'morale' | 'sat' | 'brand' | 'rp', number>>;
  /** 手の種類（brief.ts の Theme の集合） */
  themes: string[];
}
/** その提案で良くなる課題（優先の高い順）。お金以外の課題は、その種類の手だけ */
export function solvedBy(xs: CoIssue[], p: IssueProbe): CoIssue[] {
  const th = new Set(p.themes);
  const up = (k: keyof IssueProbe['d']) => (p.d[k] ?? 0) > 0.5;
  return xs.filter((x) => {
    // 流れの課題：売れる数が増える。止まっている段は、その段が動き出す（流れを戻す前提の手）
    if (isFlowKey(x.key)) return p.units1 > p.units0 + 0.05 || (!!x.stopped && !!p.stops0?.includes(x.key) && !p.stops1?.includes(x.key));
    switch (x.key) {
      case 'store':
        return p.cap1 > p.cap0 || p.used1 < p.used0 - 0.5 || (p.room ?? 0) > 0.5 || (!!p.jam0 && !p.jam1) || (p.full0 != null && (p.full1 == null || p.full1 > p.full0 + 1));
      case 'cash':
        return up('short');
      case 'profit':
        return up('long') && (up('short') || (p.d.short ?? 0) > -0.5 || th.has('cost') || th.has('legal'));
      case 'morale':
        return (th.has('morale') || th.has('workplace')) && up('morale');
      case 'sat':
        return th.has('sat') && up('sat');
      case 'brand':
        return th.has('brand') && up('brand');
      case 'rp':
        return th.has('rp') && up('rp');
      default:
        return false;
    }
  });
}
export const moneyIssue = (k: IssueKey) => MONEY.includes(k);
/** 課題の札の 1 行（「課題：販売がボトルネック（優先 1）」） */
export const issueTag = (x: Pick<CoIssue, 'key' | 'pri'>) => t(`課題：${issueName(x.key)}（優先 ${x.pri}）`, `Issue: ${issueName(x.key)} (priority ${x.pri})`);
/** 1 日あたりに直す（影響を受ける箇所の数字） */
export const perDay = (v: number) => v / DAYS;
