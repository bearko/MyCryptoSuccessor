/**
 * 経理（段 F。docs/ISLAND_PHASE1.md「経理」・docs/SUCCESSOR_ROADMAP.md 4-10・8 章の決定 3）：法人税・節税・決算書の見える化と助言。
 * DOM なし。数字は data.ts の TAX の 1 か所。テストは tests/island-p1-acct.test.ts。
 *
 * - 税は会社の四半期（会社の月 3 つ。ゲームの最初から 90 日ごと）の締めにかける。税率は会社の格（入ったいちばん上のランク）で決まり、
 *   Common の町の利益（タオックスのチュートリアルを含む）には、かけない。Uncommon 以上の町は単価が税のぶん高い（TAX.price。model.ts の priceOf・他社の売上）。
 * - 節税：四半期のあいだの設備投資・研究開発・総務の環境の支出の一部を、税の計算の前に利益から差し引く（上限は利益の TAX.cap）。
 * - 古いセーブ（版 15 まで）：税の記録は 0 から。四半期は次の区切りから（会社の月が 3 の倍数になった締め）。
 */
import { t } from '../../i18n';
import { ACCT_SKILLS, P1B, SKILL, TAX, deptOf, type DedKind, type Tier } from './data';
import { sectorDef, type Ledger } from './company';
import { headFx } from './deleg';
import { DAYS, has, lvMul, upkeepOf, type P1State } from './model';

/**
 * 段 F を止める（自動プレイ・テストで「段 F の前」と比べるためだけ。ふつうのゲームでは使わない）：税 0・単価の倍率 1・疲れが効かない
 */
export const ACCT_OFF = { on: false };

/** 四半期の途中の記録：課税の対象の利益（Common の町のぶんは入れない）・節税の支出（区分ごと）・締めた会社の月の数 */
export interface AcctQuarter {
  base: number;
  capex: number;
  rnd: number;
  env: number;
  months: number;
  /** ランクアップの災害の前の、この会社の月の課税の対象（帳消しにしたぶん。月の締めで引く） */
  skip?: number;
}
/** 締めた四半期の税の記録 */
export interface TaxRec {
  /** 四半期の番号（会社の月 ÷ 3） */
  q: number;
  /** 税率（会社の格）・格 */
  rate: number;
  tier: Tier;
  /** 課税の対象の利益（繰越の損失を引く前）・使った繰越の損失 */
  base: number;
  carry: number;
  /** 節税の支出（区分ごと）・差し引いた額（上限まで）・上限 */
  capex: number;
  rnd: number;
  env: number;
  ded: number;
  cap: number;
  /** 課税の対象（差し引いたあと）・税・節税で減った税・払った額（資金が足りないぶんは翌期へ） */
  taxable: number;
  tax: number;
  saved: number;
  paid: number;
}
export interface AcctState {
  cur: AcctQuarter;
  hist: TaxRec[];
  /** 払った税・節税で減らした税の合計（会社ぜんたい） */
  paid: number;
  saved: number;
  /** 繰越の損失（四半期の番号と残り。繰越の損失のパネル） */
  carry: { q: number; v: number }[];
  /** 資金が足りずに払いきれなかった税（翌期に払う） */
  owed: number;
  /** 決算の前のお知らせを出した四半期 */
  hinted?: number;
}
export const newQuarter = (): AcctQuarter => ({ base: 0, capex: 0, rnd: 0, env: 0, months: 0 });
export const newAcct = (): AcctState => ({ cur: newQuarter(), hist: [], paid: 0, saved: 0, carry: [], owed: 0 });
export const acctOf = (s: P1State): AcctState => (s.acct ??= newAcct());

const TIER_ORDER: Tier[] = ['C', 'U', 'R', 'E', 'L'];
/** 会社の格：出店したことのある、いちばん上のランク */
export function topTier(s: Pick<P1State, 'tier' | 'land'>): Tier {
  let k = TIER_ORDER.indexOf(s.tier ?? 'C');
  for (const id of s.land?.mine ?? []) k = Math.max(k, TIER_ORDER.indexOf(sectorDef(id).tier));
  return TIER_ORDER[Math.max(0, k)];
}
/** 税がかかる会社か（Uncommon 以上の町に出店したことがある） */
export const taxOn = (s: Pick<P1State, 'tier' | 'land'>) => !ACCT_OFF.on && topTier(s) !== 'C';
/** 法人税率（会社の格。Common だけの会社は 0） */
export const taxRate = (s: Pick<P1State, 'tier' | 'land'>) => (ACCT_OFF.on ? 0 : TAX.rate[topTier(s)]);
/** その町の単価の倍率（Uncommon 以上の町は物価が高い。自社も他社も） */
export const priceMul = (s: Pick<P1State, 'tier'>) => (ACCT_OFF.on ? 1 : TAX.price[s.tier ?? 'C']);

/** 差し引ける割合（区分ごと）。減価償却・研究開発の税制のパネルと経理の部長の補正 */
export function dedRate(s: P1State, kind: DedKind): number {
  const base = kind === 'capex' ? TAX.ded.capex + TAX.deprec * lvMul(s, 'ac_deprec') : kind === 'rnd' ? (has(s, 'ac_rnd') ? TAX.rnd : TAX.ded.rnd) : TAX.ded.env;
  return base * (1 + headFx(s, 'accounting'));
}
/** 差し引ける額の上限（四半期の利益に対する割合）。税理士の顧問で上がる */
export const dedCap = (s: P1State) => TAX.cap + (has(s, 'ac_advisor') ? TAX.advisor : 0);

/** 節税の支出を記録する（建てる・設備・お金パネル・寄付・発掘許可・商品開発。model.ts から） */
export function deduct(s: P1State, kind: DedKind, v: number) {
  if (!(v > 0)) return;
  acctOf(s).cur[kind] += v;
}
/** お金パネルの区分：総務のパネルは「総務の環境」、R&D（発掘の道具）は研究開発、ほかは設備投資 */
export function panelKind(id: string): DedKind {
  const k = SKILL[id];
  const d = k ? deptOf(k) : null;
  return d === 'general' ? 'env' : d === 'rnd' ? 'rnd' : 'capex';
}

/**
 * ひと月の課税の対象の利益：いまの町が Uncommon 以上なら、その月の営業利益 ＋ 営業外の収入。
 * Common の町のぶんは 0。managedU：Uncommon 以上のほかの町（セクター長）から本社へ回った利益。
 * ランクアップの災害の徴収と支度金は入れない（徴収のときに、その四半期のここまでの税は帳消し。acctReset）
 */
export function monthBase(s: Pick<P1State, 'tier'>, l: Ledger | undefined, managedU = 0): number {
  if (!l) return managedU;
  const here = (s.tier ?? 'C') !== 'C' ? l.sales - l.mats - l.wages - l.part - l.upkeep - l.ads + l.side + l.other + (l.museum ?? 0) : 0;
  return here + managedU;
}
/**
 * ランクアップの災害（reset.ts の resetForTier。所持金の全額の徴収）：その四半期のここまでの課税の対象・節税の支出と、払いきれていない税は帳消し
 * （ランドの徴収に入る）。払った税・節税の合計と記録は残る
 */
export function acctReset(s: P1State) {
  const A = acctOf(s);
  A.cur = { ...newQuarter(), months: A.cur.months, skip: monthBase(s, s.books?.cur) };
  A.owed = 0;
}

/** 区分ごとの支出 × 割合の合計（上限の前） */
export function dedRaw(s: P1State, q: Pick<AcctQuarter, 'capex' | 'rnd' | 'env'>): number {
  return q.capex * dedRate(s, 'capex') + q.rnd * dedRate(s, 'rnd') + q.env * dedRate(s, 'env');
}

/**
 * 会社の月の締め（model.ts の closeCompanyMonth から）：課税の対象の利益を足し、四半期の締め（会社の月が 3 の倍数）なら税を計算して払う。
 * l はこの月の帳簿（税はここに載る）。払った税の記録を返す（税がかからない会社・四半期の途中は null）
 */
export function acctMonth(s: P1State, l: Ledger, m: number, managedU: number): TaxRec | null {
  const A = acctOf(s);
  // ランクアップの災害のあった月：災害の前のぶん（帳消しにしたぶん）は引く
  A.cur.base += monthBase(s, l, managedU) - (A.cur.skip ?? 0);
  delete A.cur.skip;
  A.cur.months++;
  if (m % 3 !== 0) return null;
  return closeQuarter(s, Math.round(m / 3), l);
}

/** 四半期の締め：繰越の損失 → 節税の差し引き（上限まで）→ 税率 → 払う（資金が足りないぶんは翌期へ） */
export function closeQuarter(s: P1State, q: number, l: Ledger): TaxRec | null {
  const A = acctOf(s);
  const c = A.cur;
  A.cur = newQuarter();
  const rate = taxRate(s);
  if (!taxOn(s) || rate <= 0) return null;
  let base = Math.round(c.base);
  // 繰越の損失（パネル）：古い損失から使う。使えるのは TAX.carry 四半期まで
  A.carry = A.carry.filter((x) => q - x.q <= TAX.carry && x.v > 0);
  let carry = 0;
  if (has(s, 'ac_carry'))
    for (const x of A.carry) {
      if (base <= 0) break;
      const use = Math.min(x.v, base);
      x.v -= use;
      base -= use;
      carry += use;
    }
  A.carry = A.carry.filter((x) => x.v > 0);
  if (base < 0) {
    if (has(s, 'ac_carry')) A.carry.push({ q, v: -base });
    base = 0;
  }
  const cap = Math.round(base * dedCap(s));
  const ded = Math.round(Math.min(dedRaw(s, c), cap));
  const taxable = base - ded;
  const tax = Math.round(taxable * rate);
  const saved = Math.round(ded * rate);
  const due = tax + A.owed;
  // 資金が TAX.keep を切るまでは取らない（町を回すお金を残す。残りは次の四半期へ）
  const paid = Math.max(0, Math.min(due, Math.floor(s.money - TAX.keep)));
  A.owed = due - paid;
  s.money -= paid;
  l.tax = (l.tax ?? 0) + paid;
  A.paid += paid;
  A.saved += saved;
  const rec: TaxRec = { q, rate, tier: topTier(s), base: Math.round(c.base), carry, capex: Math.round(c.capex), rnd: Math.round(c.rnd), env: Math.round(c.env), ded, cap, taxable, tax, saved, paid };
  A.hist = [...A.hist, rec].slice(-12);
  return rec;
}

/** 会社の月のいま（1 始まり）と、四半期の何か月目か（1〜3）・四半期の締めまでの日数 */
export function quarterNow(s: Pick<P1State, 'day'>): { m: number; inQ: number; q: number; days: number } {
  const m = Math.floor(s.day / DAYS) + 1;
  const inQ = ((m - 1) % 3) + 1;
  return { m, inQ, q: Math.ceil(m / 3), days: DAYS * 3 - (s.day % (DAYS * 3)) };
}

/**
 * いまの四半期の見込み（経理の画面・決算の前のお知らせ・自動プレイ）：ここまでの課税の対象の利益（今月のここまでを含む）・節税の支出と差し引き・上限・
 * 上限までの残り（room）を、設備投資なら needCapex G・研究開発なら needRnd G で埋めると、税が save G 減る
 */
export interface TaxPlan {
  on: boolean;
  rate: number;
  base: number;
  raw: number;
  ded: number;
  cap: number;
  room: number;
  needCapex: number;
  needRnd: number;
  save: number;
  tax: number;
  saved: number;
  q: AcctQuarter;
}
export function taxPlan(s: P1State): TaxPlan {
  const A = acctOf(s);
  const rate = taxRate(s);
  const q = A.cur;
  const base = Math.max(0, Math.round(q.base + monthBase(s, s.books?.cur) - (q.skip ?? 0)));
  const raw = Math.round(dedRaw(s, q));
  const cap = Math.round(base * dedCap(s));
  const ded = Math.min(raw, cap);
  const room = Math.max(0, cap - raw);
  const rc = dedRate(s, 'capex');
  const rr = dedRate(s, 'rnd');
  return {
    on: taxOn(s),
    rate,
    base,
    raw,
    ded,
    cap,
    room,
    needCapex: rc > 0 ? Math.round(room / rc) : 0,
    needRnd: rr > 0 ? Math.round(room / rr) : 0,
    save: Math.round(room * rate),
    tax: Math.round((base - ded) * rate),
    saved: Math.round(ded * rate),
    q,
  };
}

/** 決算の前のお知らせ（会社の月の締めのあと、次の締めが四半期の締めのとき 1 回）：「あと ○○ G 投資すると、税が △△ G 減る」。出さないときは null */
export function taxHint(s: P1State): string | null {
  const A = acctOf(s);
  const { inQ, q } = quarterNow(s);
  if (!taxOn(s) || inQ !== 3 - TAX.hint + 1 || A.hinted === q) return null;
  A.hinted = q;
  const p = taxPlan(s);
  if (p.base <= 0) return null;
  const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
  if (p.room <= 0) return t(`🧾 第 ${q} 四半期の決算まであと 1 か月：節税は上限まで使えています（税 −${g(p.saved)}）`, `🧾 Q${q} closes in a month: tax savings are at the cap (tax −${g(p.saved)})`);
  return t(`🧾 第 ${q} 四半期の決算まであと 1 か月：この四半期にあと ${g(p.needCapex)} 設備に投資すると、税が ${g(p.save)} 減る（経理）`, `🧾 Q${q} closes in a month: invest ${g(p.needCapex)} more in upgrades this quarter to cut tax by ${g(p.save)} (Accounting)`);
}

// ---------------------------------------------------------------- 見える化（決算書の「コストの大きい順」と「経理からの助言」）

export interface CostRow {
  key: string;
  name: string;
  v: number;
  /** 売上に対する割合（売上 0 なら 0） */
  share: number;
}
/** 維持費の内訳（いまの町の自社の建物の維持費の割合で、帳簿の維持費を分ける） */
function upkeepSplit(s: P1State): { key: string; name: string; w: number }[] {
  const by: Record<string, number> = {};
  for (const b of s.buildings) {
    if (b.owner !== 'me' || b.left > 0) continue;
    const kind = P1B[b.id]?.kind ?? 'other';
    const k = kind === 'shop' || kind === 'warehouse' || kind === 'workshop' ? kind : 'other';
    by[k] = (by[k] ?? 0) + upkeepOf(s, b);
  }
  const all = Object.values(by).reduce((a, v) => a + v, 0);
  const NAME: Record<string, string> = { shop: t('お店の維持費', 'Shop upkeep'), warehouse: t('倉庫の維持費', 'Warehouse upkeep'), workshop: t('工房の維持費', 'Workshop upkeep'), other: t('ほかの建物の維持費', 'Other upkeep') };
  if (!all) return [{ key: 'upkeep', name: t('維持費', 'Upkeep'), w: 1 }];
  return Object.entries(by).map(([k, v]) => ({ key: `up_${k}`, name: NAME[k], w: v / all }));
}
/** コストの大きい順（素材・給料・維持費（建物の種類ごと）・アルバイト・宣伝・法人税）。0 の行は出さない */
export function costRank(s: P1State, l: Ledger): CostRow[] {
  const sales = l.sales || 0;
  const rows: { key: string; name: string; v: number }[] = [
    { key: 'mats', name: t('素材（売上原価）', 'Materials (COGS)'), v: l.mats },
    { key: 'wages', name: t('給料', 'Wages'), v: l.wages },
    ...upkeepSplit(s).map((x) => ({ key: x.key, name: x.name, v: Math.round(l.upkeep * x.w) })),
    { key: 'part', name: t('アルバイト', 'Part-timers'), v: l.part },
    { key: 'ads', name: t('宣伝', 'Advertising'), v: l.ads },
    { key: 'tax', name: t('法人税', 'Corporate tax'), v: l.tax ?? 0 },
  ];
  return rows
    .filter((r) => r.v > 0)
    .map((r) => ({ ...r, share: sales > 0 ? r.v / sales : 0 }))
    .sort((a, b) => b.v - a.v);
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
/**
 * 経理からの助言（1〜3 行。実際の数字から作る）：
 * 1. いちばん重いコストの売上に対する割合（維持費は建物の種類ごと）
 * 2. 前の四半期からいちばん増えたコスト（+10% 以上のとき。売上の伸びと並べて）
 * 3. 節税：この四半期にあと ○○ G 投資すると税が △△ G 減る／上限まで使えている／Uncommon から税がかかる
 * l：見ている四半期の帳簿、prev：その前の四半期の帳簿（無ければ 2 は出さない）
 */
export function acctAdvice(s: P1State, l: Ledger, prev?: Ledger | null): string[] {
  const out: string[] = [];
  const rank = costRank(s, l).filter((r) => r.key !== 'tax');
  const top = rank[0];
  if (top && l.sales > 0) out.push(t(`${top.name}が売上の ${pct(top.share)}（いちばん重いコスト）`, `${top.name} is ${pct(top.share)} of sales (the heaviest cost)`));
  if (prev && prev.sales > 0) {
    const pv = new Map(costRank(s, prev).map((r) => [r.key, r.v]));
    const ups = rank.map((r) => ({ r, d: (pv.get(r.key) ?? 0) > 0 ? r.v / (pv.get(r.key) ?? 1) - 1 : 0 })).filter((x) => x.d >= 0.1 && x.r.v >= l.sales * 0.02).sort((a, b) => b.d - a.d);
    const sd = l.sales / prev.sales - 1;
    const sign = (v: number) => `${v >= 0 ? '+' : '−'}${pct(Math.abs(v))}`;
    if (ups[0]) out.push(t(`${ups[0].r.name}が前の四半期より ${pct(ups[0].d)} 増えた（売上は ${sign(sd)}）`, `${ups[0].r.name} rose ${pct(ups[0].d)} from last quarter (sales ${sign(sd)})`));
  }
  const p = taxPlan(s);
  const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
  if (!p.on) out.push(t(`Uncommon の町に出店すると、四半期ごとに法人税（${pct(TAX.rate.U)}）がかかります`, `Once you open in an Uncommon town, corporate tax (${pct(TAX.rate.U)}) applies each quarter`));
  else if (p.base > 0 && p.room > 0) out.push(t(`この四半期にあと ${g(p.needCapex)} 設備に投資すると、税が ${g(p.save)} 減る`, `Invest ${g(p.needCapex)} more in upgrades this quarter to cut tax by ${g(p.save)}`));
  else if (p.base > 0) out.push(t(`節税は上限まで使えています（この四半期の税 −${g(p.saved)}）`, `Tax savings are at the cap (−${g(p.saved)} tax this quarter)`));
  return out.slice(0, 3);
}

/** 経理のパネル（画面の近道・テスト） */
export const acctPanels = () => ACCT_SKILLS;
