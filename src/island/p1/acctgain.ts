/**
 * 段 I2c：税・経費の効き目（DOM なし：deleg.ts の部長の候補・boardplan.ts の経営会議の打ち手・テストが使う）。
 * パネルを取る・強化する前と後の状態（写し）を比べて、いまのモデルの数字から月あたりの減りを出す。モデルに無い効果は作らない：
 * - 経費：素材の値段（matPrice。材料費の分析など）→ 先月までの材料費 × 1 個の材料費の下がり方。維持費（upkeep。経費の見直しなど）→ 建物の維持費の差
 * - 税：直近の締めた四半期 4 つまでの平均（無ければいまの四半期を 3 か月に直したもの）の課税の対象と節税の支出で、差し引ける額（dedRaw と上限 dedCap）の増え × 税率 ÷ 3。
 *   税がかからない会社（Common だけ）は 0。経費が減ったぶん利益が増えて税が増えるのも引く（経費の減り × 税率）
 * - 繰越の損失（ac_carry）は、取ったあとに出た赤字の四半期から効く（いまの記録には効かない）ので 0
 * 仕様は docs/SUCCESSOR_ROADMAP.md「段 I2c」。
 */
import { acctOf, dedCap, dedRaw, taxOn, taxRate, type AcctQuarter } from './acct';
import { MONEY_LEVER } from './data';
import { steadySkus, unitCost, upkeepOf, type P1State } from './model';

export interface MoneyGain {
  /** 税の減り（月）・経費の減り（月。税が増えるぶんは引く前）・合計（経費 ×(1 − 税率) ＋ 税） */
  tax: number;
  cost: number;
  total: number;
}

/** 先月までの材料費（月。帳簿の直近 3 か月の平均。無ければ月次報告の材料費） */
function matsMonthly(s: P1State): number {
  const ms = s.books?.months.slice(-3) ?? [];
  if (ms.length) return ms.reduce((a, x) => a + (x.l.mats ?? 0), 0) / ms.length;
  return s.reports[s.reports.length - 1]?.costs.materials ?? 0;
}
/** 1 個の材料費の下がり方（作り続ける商品の平均。前 → 後の比） */
function matRatio(s: P1State, c: P1State): number {
  const xs = steadySkus(s);
  const a = xs.reduce((v, x) => v + unitCost(s, x), 0);
  const b = xs.reduce((v, x) => v + unitCost(c, x), 0);
  return a > 0 ? b / a : 1;
}
/** 自社の建物の維持費（月） */
const upkeepAll = (s: P1State) => s.buildings.filter((b) => b.owner === 'me' && b.left <= 0).reduce((a, b) => a + upkeepOf(s, b), 0);

/** 税の計算に使う四半期（直近の締めた四半期 4 つまで。無ければいまの四半期を 3 か月に直したもの） */
function quartersOf(s: P1State): { base: number; q: Pick<AcctQuarter, 'capex' | 'rnd' | 'env'> }[] {
  const A = acctOf(s);
  const hs = A.hist.slice(-4);
  if (hs.length) return hs.map((r) => ({ base: r.base, q: r }));
  const cur = A.cur;
  if (cur.months <= 0) return [];
  const k = 3 / cur.months;
  return [{ base: cur.base * k, q: { capex: cur.capex * k, rnd: cur.rnd * k, env: cur.env * k } }];
}

/** c：s にパネルを当てた写し。月あたりの税・経費の減り */
export function moneyGain(s: P1State, c: P1State): MoneyGain {
  const cost = Math.max(0, matsMonthly(s) * (1 - matRatio(s, c))) + Math.max(0, upkeepAll(s) - upkeepAll(c));
  let tax = 0;
  const rate = taxOn(s) ? taxRate(s) : 0;
  const Qs = rate > 0 ? quartersOf(s) : [];
  for (const Q of Qs) {
    if (Q.base <= 0) continue;
    const d0 = Math.min(dedRaw(s, Q.q), Q.base * dedCap(s));
    const d1 = Math.min(dedRaw(c, Q.q), Q.base * dedCap(c));
    tax += Math.max(0, ((d1 - d0) * rate) / 3) / Qs.length;
  }
  return { tax, cost, total: cost * (1 - rate) + tax };
}

/** 元が取れるまでの月数（導入の G ＋ RP × MONEY_LEVER.rpG）÷ 月の減り。減らなければ Infinity */
export const payMonths = (cost: number, rp: number, save: number) => (save > 0 ? (cost + rp * MONEY_LEVER.rpG) / save : Infinity);
/** 打つ価値のある税・経費の手か（MONEY_LEVER.pay か月で元が取れる） */
export const payOk = (cost: number, rp: number, save: number) => payMonths(cost, rp, save) <= MONEY_LEVER.pay;
