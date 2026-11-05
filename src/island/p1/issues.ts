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
import { CS, INVEST, ISSUE, MORALE, P1B, POLICY } from './data';
import { DAYS, bottleneck, myShops, myWorkshop, nextJam, poolCap, poolUsed, stageCaps, stallOf, type P1State, type Stage, type StageCap } from './model';
import { reserveOf, unitMargin, type PropAct } from './deleg';
import { jammed } from './proj';
import { storeFull } from './stock';
import { storeFc } from './storefc';
import { moraleAvg, quitLeft, wantsToQuit } from './hr';
import { csOn } from './cs';
import { brandCap } from './company';
import { corpOf, policyName, policyOf, POL_OFF } from './policy';
import { POLICY_OF } from './data';

export type IssueKey = Stage | 'store' | 'cash' | 'profit' | 'morale' | 'sat' | 'brand' | 'rp';
/** 段 UI9b：優先度の 3 段 */
export type IssueLv = 'hi' | 'mid' | 'lo';
export const STAGES: Stage[] = ['buy', 'craft', 'haul', 'sell'];
/** 段 UI9：流れの段の制約の種類（人・設備・置き場所・需要）。手の種類（actKind）が合う手だけが、その課題を解く */
export type Limit = 'people' | 'equip' | 'room' | 'demand';
/** 段 UI9：手の種類（制約に対して）：人を置く・設備や能力を上げる・置き場所を空ける／増やす・販路（商品・宣伝・出店）・ほか */
export type ActKind = 'people' | 'equip' | 'room' | 'channel' | 'other';
/**
 * 課題 1 つ。段 UI9：優先は 重要度（impact：放置したときの事業への影響。G／月）× 緊急度（days：起こるまでの日数。期限が無ければ null）。
 * score：並びの元（impact × 緊急度の倍率 × 詰まりの段の倍率）・pri：優先（1 から）・now：いまの数（流れの段は個／月）・note：根拠の 1 行・
 * loss：放置したときの 1 行（「放置すると月 −N G・N 日後」）
 */
export interface CoIssue {
  key: IssueKey;
  pri: number;
  score: number;
  now: number;
  impact: number;
  days: number | null;
  /** 流れが止まっている段（SCM） */
  stopped?: boolean;
  /** 伸ばす課題（方針の大事な指標。低いからではない） */
  grow?: boolean;
  /** 段 UI9b：優先度（高・中・低。score ÷ 月の粗利を ISSUE.lv で 3 段に。古いセーブの課題には無い：issueLv が pri から補う） */
  lv?: IssueLv;
  /** 流れの段の制約の種類 */
  limit?: Limit;
  /** 解いたと言える最小の増え（流れ：売れる数 個／月。収益性：長期の利益 G） */
  min?: number;
  note: string;
  loss: string;
}

/** 課題の名前（ビジネスの言葉。「販売がボトルネック」「倉庫の逼迫」） */
export function issueName(k: IssueKey): string {
  switch (k) {
    case 'buy':
      return t('調達がボトルネック', 'Buying is the bottleneck');
    case 'craft':
      return t('製造がボトルネック', 'Crafting is the bottleneck');
    case 'haul':
      return t('輸送がボトルネック', 'Hauling is the bottleneck');
    case 'sell':
      return t('販売がボトルネック', 'Selling is the bottleneck');
    case 'store':
      return t('倉庫の容量不足', 'Storage capacity shortfall');
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
      return t('調達', 'Buying');
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
/** 月の粗利の目安（売上 × 粗利の割合） */
const grossOf = (s: P1State) => salesOf(s) * unitShare(s);
/** 段 UI9：緊急度の倍率（期限なし 1・ISSUE.storeDays 日以内で 1〜2・もう起きていれば 2） */
export const urgencyOf = (days: number | null) => (days == null ? 1 : 1 + Math.max(0, Math.min(1, (ISSUE.storeDays - days) / ISSUE.storeDays)));
/** 段 UI9：放置したときの 1 行（「放置すると 月 −12,000 G・18 日後」） */
export function lossLine(x: Pick<CoIssue, 'impact' | 'days' | 'grow'>): string {
  if (x.grow) return t(`伸ばせば 月 +${g(x.impact)}`, `Upside about +${g(x.impact)}/mo`);
  const when = x.days == null ? '' : x.days < 1 ? t('・もう起きている', ', already happening') : t(`・${Math.round(x.days)} 日後`, `, in ${Math.round(x.days)} days`);
  return t(`放置すると 月 −${g(x.impact)}${when}`, `Left alone: −${g(x.impact)}/mo${when}`);
}
/** 段 UI9：流れの段の制約の種類（調達：置き場所（倉庫が埋まっている）か人・製造：人か設備・輸送：人か設備・販売：需要か処理力） */
export function limitOf(s: P1State, k: Stage, caps: Record<Stage, StageCap>): Limit {
  switch (k) {
    case 'buy':
      return storeFull(s) ? 'room' : 'people';
    case 'craft':
      return caps.craft.stopped || !s.slots.some((sl) => sl.worker != null) ? 'people' : 'equip';
    case 'haul':
      return s.staff.some((x) => x.task === 'transport') ? 'equip' : 'people';
    case 'sell':
      // 店員のいないお店があれば人員。需要から取れる数で頭打ちなら需要（販路の手だけが解く）。ほかはお店の処理力（人・什器）
      if (myShops(s).some((b) => s.shops[b.uid]?.shelves.some((x) => x) && s.shops[b.uid].staff == null)) return 'people';
      return caps.sell.why === 'demand' ? 'demand' : 'people';
  }
}
/** 段 UI9：手の種類（制約に対して） */
export function actKind(a: PropAct): ActKind {
  switch (a.k) {
    case 'hire':
    case 'assign':
    case 'part':
    case 'staff':
      return 'people';
    case 'ad':
    case 'stock':
    case 'famous':
    case 'vacant':
    case 'clear':
      return 'channel';
    case 'useup':
    case 'order':
      return 'room';
    case 'build':
      return P1B[a.id]?.kind === 'shop' ? 'channel' : a.id === 'warehouse' || a.id === 'logistics' ? 'room' : 'equip';
    case 'invest':
      return a.id === 'rack' || a.id === 'dock' ? 'room' : INVEST[a.id]?.kind === 'shop' ? 'channel' : 'equip';
    case 'skill':
    case 'level':
      return ['hire', 'slots', 'b_scout', 'headhunt', 'd_people', 'hr_brand'].includes(a.id) ? 'people' : 'equip';
    default:
      return 'other';
  }
}
/**
 * 制約の種類に合う手か：置き場所の制約は置き場所の手だけ・需要の制約は販路の手と店の人（需要から取れる数は店員の腕と稼働率込み）・
 * 人と設備の制約は人・設備・販路の手。工房の設備（作業台・パネル）は販売の需要の制約を解かない
 */
export const fitsLimit = (limit: Limit | undefined, kinds: ActKind[]): boolean => {
  if (!limit) return true;
  if (limit === 'room') return kinds.includes('room');
  if (limit === 'demand') return kinds.some((k) => k === 'channel' || k === 'people');
  return kinds.some((k) => k === 'people' || k === 'equip' || k === 'channel');
};

/**
 * いまの町の課題の一覧（優先の高い順。pri は 1 から）。お店も工房も無い町は空。
 * 段 UI9：倉庫が原因の調達の頭打ちは「調達」でなく「倉庫の容量不足」に寄せる。収益性の改善は、ボトルネック・期限のある課題が無いときだけ。
 * 重要度が月の粗利の ISSUE.raise 未満で期限の無い課題は提起しない
 */
export function issuesOf(s: P1State): CoIssue[] {
  const out: Omit<CoIssue, 'pri' | 'loss'>[] = [];
  const shops = myShops(s).length > 0;
  const gross = grossOf(s);
  const margin = unitMargin(s);
  let storeExtra: { impact: number; note: string } | null = null;
  if (shops && myWorkshop(s)) {
    const caps = stageCaps(s, true);
    const st = stallOf(s);
    const bn = st?.stage ?? bottleneck(caps);
    const now = cap(caps[bn]);
    let impact: number;
    let stopped = false;
    if (st || caps[bn].stopped) {
      // 流れが止まっている：月の粗利まるごと（止まる前の売上の目安 × 粗利）
      stopped = true;
      impact = Math.max(gross, ...STAGES.filter((k) => k !== bn).map((k) => cap(caps[k]) * margin));
    } else {
      const nj = nextJam(s, caps);
      const to = nj.same ? now * 1.3 : nj.n;
      impact = Math.max(ISSUE.min, (to - now) * margin);
    }
    const limit = limitOf(s, bn, caps);
    const others = STAGES.filter((k) => k !== bn).map((k) => `${stageWord(k)} ${Math.round(cap(caps[k]))}`);
    const note = stopped
      ? t(`${stageWord(bn)}が止まっている（ほかの段：${others.join('・')} 個／月）`, `${stageWord(bn)} has stopped (others: ${others.join(', ')}/mo)`)
      : t(`${stageWord(bn)} 月 ${Math.round(now)} 個が最小の処理量（${others.join('・')} 個／月）・制約：${limitWord(limit)}`, `${stageWord(bn)} ${Math.round(now)}/mo is the lowest throughput (${others.join(', ')}/mo); constraint: ${limitWord(limit)}`);
    // 段 UI9：調達の頭打ちが置き場所（倉庫が埋まっている）なら、課題は「倉庫の容量不足」（人を置いても解けない）
    if (bn === 'buy' && limit === 'room' && !(st && st.why !== 'full')) storeExtra = { impact, note };
    else out.push({ key: bn, score: impact * ISSUE.boost * urgencyOf(stopped ? 0 : null), impact, days: stopped ? 0 : null, now, stopped, limit, min: Math.max(0.05, now * ISSUE.solve), note });
  }
  // 倉庫：埋まりが警告を超えた。重要度＝あふれたあと月に減る作る数 × 粗利（置き場所が無くなれば月の粗利まるごと）。緊急度＝あふれるまでの日数
  if (shops && (storeFull(s) || storeExtra)) {
    const F = storeFc(s);
    const pc = Math.round((poolUsed(s) / Math.max(1, poolCap(s))) * 100);
    const days = F.days ?? (pc >= 100 ? 0 : null);
    let impact = Math.max(ISSUE.min, F.cut * margin);
    if (F.ramp != null || (days != null && days < 1 && jammed(s))) impact = Math.max(impact, gross);
    if (storeExtra) impact = Math.max(impact, storeExtra.impact);
    const when = days != null ? (days < 1 ? t(`倉庫 ${pc}%・もうあふれている`, `Storage ${pc}%, already full`) : t(`倉庫 ${pc}%・あと ${Math.round(days)} 日であふれる`, `Storage ${pc}%, full in ${Math.round(days)} days`)) : t(`倉庫 ${pc}%`, `Storage ${pc}%`);
    const note = storeExtra ? t(`${when}。調達は置き場所で頭打ち（${storeExtra.note}）`, `${when}. Buying is capped by storage (${storeExtra.note})`) : when;
    out.push({ key: 'store', score: impact * urgencyOf(days) * (storeExtra ? ISSUE.boost : 1), impact, days, now: pc, limit: 'room', note });
  }
  // 資金：ひと月の固定費を下回る・先月が赤字。緊急度＝いまのペースで資金が尽きるまでの日数（赤字のとき）
  const r = s.reports[s.reports.length - 1];
  const reserve = reserveOf(s);
  const short = Math.max(0, reserve - s.money);
  const loss = Math.max(0, -(r?.profit ?? 0));
  if (short > 0 || loss > 0) {
    // 尽きるまでの日数（12 か月より先なら期限なし）
    const d0 = loss > 0 ? Math.max(0, (Math.max(0, s.money) / loss) * DAYS) : null;
    const days = d0 != null && d0 <= POLICY.months * DAYS ? d0 : null;
    const impact = Math.max(short, loss);
    out.push({ key: 'cash', score: impact * urgencyOf(days), impact, days, now: s.money, note: loss > 0 ? t(`先月の利益 ${g(-loss)}・資金 ${g(s.money)}`, `Last month’s profit ${g(-loss)}, funds ${g(s.money)}`) : t(`資金 ${g(s.money)}（ひと月の固定費 ${g(reserve)}）`, `Funds ${g(s.money)} (a month of costs ${g(reserve)})`) });
  }
  // 士気：平均が低い・辞めたい人。緊急度＝辞めるまでの日数
  const mo = moraleAvg(s);
  const quitters = wantsToQuit(s);
  const quit = quitters.length;
  // 士気の重さ：働きの速さの帯（MORALE.band.lo 未満で ×0.9）と、辞める人
  if (mo != null && (mo < ISSUE.morale || quit > 0)) {
    const left = quitters.map((x) => quitLeft(s, x)).filter((v): v is number => v != null);
    const days = left.length ? Math.min(...left) : null;
    const impact = gross * ((mo < MORALE.band.lo ? 1 - MORALE.band.low : 0.03) + 0.05 * quit);
    out.push({ key: 'morale', score: impact * urgencyOf(days), impact, days, now: mo, note: quit ? t(`士気の平均 ${mo}・辞めたい人 ${quit} 人`, `Average morale ${mo}, ${quit} want to quit`) : t(`士気の平均 ${mo}`, `Average morale ${mo}`) });
  }
  // 顧客満足度（Uncommon から）。緊急度＝炎上の予告があれば、その日まで
  if (csOn(s) && s.cs) {
    const v = Math.round(s.cs.sat ?? CS.start);
    const warn = s.cs.warn && !s.cs.warn.done ? s.cs.warn : null;
    const days = warn ? Math.max(0, DAYS - (s.day - warn.day)) : null;
    if (v < ISSUE.sat || warn) out.push({ key: 'sat', score: gross * 0.05 * urgencyOf(days), impact: gross * 0.05, days, now: v, note: warn ? t(`顧客満足度 ${v}・炎上の予告`, `Satisfaction ${v}, flame warning`) : t(`顧客満足度 ${v}`, `Satisfaction ${v}`) });
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
      const impact = sales * ISSUE.grow * w[k];
      out.push({ key: k, grow: true, score: impact, impact, days: null, now: v, note: t(`${nm}（方針：${policyName(id)}）`, `${nm} (policy: ${policyName(id)})`) });
    }
  }
  // 段 UI9：収益性の改善は、ボトルネック・期限のある課題が無いときだけ（何でも解く受け皿にしない）。解いたと言えるのは長期が min 以上
  const pressing = out.some((x) => tierOf(x) < 2);
  if (shops && !pressing) {
    const impact = sales * ISSUE.grow * 0.8;
    out.push({ key: 'profit', score: impact, impact, days: null, min: impact * ISSUE.profitMonths, grow: true, now: r?.profit ?? 0, note: r ? t(`先月の売上 ${g(r.revenue)}・利益 ${g(r.profit)}`, `Last month: sales ${g(r.revenue)}, profit ${g(r.profit)}`) : t('月の利益の伸び', 'Monthly profit growth') });
  }
  // 成長の余地（ほかの課題より下）
  if (shops && (s.brand ?? 0) < brandCap(s)) out.push({ key: 'brand', grow: true, score: sales * ISSUE.grow, impact: sales * ISSUE.grow, days: null, now: Math.round(s.brand ?? 0), note: t(`ブランド力 ${Math.round(s.brand ?? 0)} / 上限 ${brandCap(s)}`, `Brand ${Math.round(s.brand ?? 0)} / cap ${brandCap(s)}`) });
  if (s.dig) out.push({ key: 'rp', grow: true, score: sales * ISSUE.grow * 0.5, impact: sales * ISSUE.grow * 0.5, days: null, now: Math.round(s.rp ?? 0), note: t(`研究ポイント ${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP`, `${Math.round(s.rp ?? 0).toLocaleString('en-US')} RP`) });
  // 段 UI9：提起に値しない課題（重要度が月の粗利の ISSUE.raise 未満で、期限が無い）は出さない
  const floor = gross * ISSUE.raise;
  // 並び：お金の課題（SCM の詰まり・倉庫・資金）→ 士気・満足度が低い → 伸ばす課題（方針の指標・収益性・ブランド・研究）。同じ段の中は score（重要度 × 緊急度）の大きい順
  return out
    .filter((x) => x.days != null || x.impact >= floor || x.stopped)
    .sort((a, b) => tierOf(a) - tierOf(b) || b.score - a.score)
    .map((x, k) => ({ ...x, pri: k + 1, lv: lvOf(x, gross), loss: lossLine(x) }));
}
/** 段 UI9b：優先度の 3 段（score ÷ 月の粗利。境は ISSUE.lv）。流れが止まっていれば「高」 */
function lvOf(x: Pick<CoIssue, 'score' | 'stopped'>, gross: number): IssueLv {
  if (x.stopped) return 'hi';
  const r = x.score / Math.max(1, gross);
  return r >= ISSUE.lv.hi ? 'hi' : r >= ISSUE.lv.mid ? 'mid' : 'lo';
}
/** 段 UI9b：課題の優先度（無ければ並びの番号から：1 位は高・2〜3 位は中・ほかは低） */
export const issueLv = (x: Pick<CoIssue, 'pri'> & Partial<Pick<CoIssue, 'lv' | 'stopped'>>): IssueLv => x.lv ?? (x.stopped ? 'hi' : x.pri <= 1 ? 'hi' : x.pri <= 3 ? 'mid' : 'lo');
/** 優先度の言葉（高・中・低） */
export const lvWord = (lv: IssueLv) => ({ hi: t('高', 'High'), mid: t('中', 'Mid'), lo: t('低', 'Low') })[lv];
/** 課題の段（0：お金の課題・1：士気と満足度が低い・2：伸ばす課題） */
function tierOf(x: Pick<CoIssue, 'key' | 'grow'>): number {
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
const stageWord = (k: Stage) => ({ buy: t('調達', 'Buying'), craft: t('製造', 'Crafting'), haul: t('輸送', 'Hauling'), sell: t('販売', 'Selling') })[k];
/** 制約の種類の言葉 */
export const limitWord = (l: Limit) => ({ people: t('人員', 'staffing'), equip: t('設備', 'equipment'), room: t('置き場所', 'storage space'), demand: t('需要', 'demand') })[l];

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
  /** 段 UI9：手の種類（制約に対して：actKind の集合）。無ければ制約の種類は見ない */
  kinds?: ActKind[];
}
/**
 * その提案で良くなる課題（優先の高い順）。お金以外の課題は、その種類の手だけ。
 * 段 UI9：流れの課題は、その段の制約の種類に合う手（fitsLimit）で、売れる数が min 以上増えるときだけ。収益性は長期が min 以上
 */
export function solvedBy(xs: CoIssue[], p: IssueProbe): CoIssue[] {
  const th = new Set(p.themes);
  const up = (k: keyof IssueProbe['d']) => (p.d[k] ?? 0) > 0.5;
  return xs.filter((x) => {
    // 流れの課題：売れる数が増える（制約に合う手）。止まっている段は、その段が動き出す（流れを戻す前提の手）
    if (isFlowKey(x.key)) {
      if (!!x.stopped && !!p.stops0?.includes(x.key) && !p.stops1?.includes(x.key)) return true;
      return p.units1 > p.units0 + (x.min ?? 0.05) && (!p.kinds || fitsLimit(x.limit, p.kinds));
    }
    switch (x.key) {
      case 'store':
        return p.cap1 > p.cap0 || p.used1 < p.used0 - 0.5 || (p.room ?? 0) > 0.5 || (!!p.jam0 && !p.jam1) || (p.full0 != null && (p.full1 == null || p.full1 > p.full0 + 1));
      case 'cash':
        return up('short');
      case 'profit':
        return (p.d.long ?? 0) >= (x.min ?? 0.5) && ((p.d.short ?? 0) > -0.5 || th.has('cost') || th.has('legal'));
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
/** 課題の札の 1 行（「課題：販売がボトルネック（優先度 高）」。段 UI9b：優先は 高・中・低） */
export const issueTag = (x: Pick<CoIssue, 'key' | 'pri'> & Partial<Pick<CoIssue, 'lv' | 'stopped'>>) => t(`課題：${issueName(x.key)}（優先度 ${lvWord(issueLv(x))}）`, `Issue: ${issueName(x.key)} (priority: ${lvWord(issueLv(x))})`);
/** 1 日あたりに直す（影響を受ける箇所の数字） */
export const perDay = (v: number) => v / DAYS;
