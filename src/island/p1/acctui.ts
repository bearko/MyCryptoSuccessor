/**
 * 経理・総務の画面（段 F。docs/ISLAND_PHASE1.md「経理」「総務」）：
 * - 経理 → 税と節税：いまの四半期の見込み（利益・税率・節税の支出と差し引き・上限）・「あと ○○ G 投資すると、税が △△ G 減る」・前の四半期の税の報告・これまでの記録・奥義の予告
 * - 決算書（landui.ts の openBooks）に足す「コストの大きい順」と「経理からの助言」の札
 * - 総務 → 疲れと職場の環境：ヒーローごとの疲れ（働きの速さ・士気への響き・休ませる）・職場の環境（総務のパネルと職人の休憩所）・奥義と掛け合わせの予告
 */
import { t } from '../../i18n';
import { acctAdvice, costRank, taxLine, type TaxRec } from './acct';
import { type Ledger } from './company';
import { type P1State } from './model';
import { type Ctx } from './screens';
import { bar, h, money } from './ui';
import { uxk } from '../uix/screens/k-slots';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const TIER_NAME: Record<string, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };

/** 奥義の予告の札（理解度 15・25・40。表示だけ） */
export function masteryCard(lines: string[], cross?: string): HTMLElement {
  const box = h('div', 'isl-card2 isl-acct-soon');
  box.append(h('h3', '', t('奥義と掛け合わせ（予告）', 'Masteries & cross panels (preview)')));
  const ul = h('ul', 'isl-acct-list');
  for (const x of lines) ul.append(h('li', 'isl-dim', x));
  if (cross) ul.append(h('li', 'isl-dim', cross));
  box.append(ul);
  return box;
}

/** 前の四半期の税の報告（1 枚） */
export function taxReportCard(r: TaxRec): HTMLElement {
  const box = h('div', 'isl-card2 isl-acct-report');
  box.append(h('h3', '', t(`🧾 第 ${r.q} 四半期の法人税`, `🧾 Q${r.q} corporate tax`)));
  const big = h('div', 'isl-row');
  big.append(h('b', 'isl-big', money(r.paid)), h('small', 'isl-dim', t(`税率 ${pct(r.rate)}（会社の格：${TIER_NAME[r.tier]}）`, `Rate ${pct(r.rate)} (company rank: ${TIER_NAME[r.tier]})`)));
  box.append(big);
  const rows = h('div', 'isl-books-tbl');
  const row = (k: string, v: number, cls = '') => {
    const x = h('div', `isl-books-row ${cls}`);
    x.append(h('span', '', k), h('b', v < 0 ? 'isl-bad' : '', money(v)));
    rows.append(x);
  };
  row(t('課税の対象の利益', 'Taxable profit'), r.base, 'is-head');
  if (r.carry) row(t('　繰越の損失', '  Loss carried forward'), -r.carry, 'is-sub');
  row(t('　節税の差し引き', '  Tax-saving deductions'), -r.ded, 'is-sub');
  row(t('課税される額', 'Taxed amount'), r.taxable, 'is-sum');
  row(t('法人税', 'Corporate tax'), -r.tax, 'is-total');
  box.append(rows);
  box.append(h('p', r.saved > 0 ? 'isl-good' : 'isl-dim', r.saved > 0 ? t(`節税で税が ${money(r.saved)} 減った（上限 ${money(r.cap)} のうち ${money(r.ded)} を差し引いた）`, `Tax savings cut ${money(r.saved)} (deducted ${money(r.ded)} of a ${money(r.cap)} cap)`) : t('この四半期は節税の支出がありませんでした。設備投資・研究開発・総務の環境の支出が税を減らします。', 'No tax-saving spending this quarter. Capex, R&D and workplace spending lower your tax.')));
  if (r.paid < r.tax) box.append(h('small', 'isl-bad', t(`資金が足りず、${money(r.tax - r.paid)} は次の四半期に払います`, `${money(r.tax - r.paid)} could not be paid and carries to next quarter`)));
  return box;
}

/** 経理 → 税と節税 */
export function openTax(ctx: Ctx, hooks: { books?: () => void; skills?: () => void } = {}) {
  // 段 UIX3k：新しい画面（uix/screens/tax.ts）へ
  return uxk.tax!(ctx, hooks);
}

/** 決算書に足す札：コストの大きい順（売上に対する割合の帯）と、経理からの助言（1〜3 行） */
export function costCard(s: P1State, l: Ledger, prev: Ledger | null, label: string, q?: number): HTMLElement {
  const box = h('div', 'isl-card2 isl-acct-cost');
  box.dataset.focus = 'cost-rank';
  box.append(h('h3', '', t(`コストの大きい順（${label}）`, `Costs, largest first (${label})`)));
  const rows = costRank(s, l);
  if (!rows.length) box.append(h('small', 'isl-dim', t('まだコストがありません。', 'No costs yet.')));
  const top = rows[0]?.v || 1;
  for (const r of rows.slice(0, 7)) {
    const x = h('div', 'isl-acct-crow');
    x.append(h('span', '', r.name), bar(r.v / top, 'var(--isl-gold)'), h('b', '', money(r.v)), h('small', 'isl-dim', l.sales > 0 ? t(`売上の ${pct(r.share)}`, `${pct(r.share)} of sales`) : '—'));
    box.append(x);
  }
  // 法人税は売上と比べず、下に別の行で（税にはほかの町から回った利益のぶんも入る）
  const tl = taxLine(s, l, q);
  if (tl) {
    const x = h('div', 'isl-acct-crow isl-acct-taxrow');
    x.dataset.focus = 'tax-line';
    x.append(h('span', '', t('法人税', 'Corporate tax')), h('b', '', money(tl.v)), h('small', 'isl-dim', t(`課税される利益の ${pct(tl.rate)}`, `${pct(tl.rate)} of taxable profit`)));
    box.append(x);
  }
  const adv = acctAdvice(s, l, prev);
  if (adv.length) {
    const a = h('div', 'isl-acct-advice');
    a.dataset.focus = 'advice';
    a.append(h('b', '', t('🧾 経理からの助言', '🧾 Advice from accounting')));
    const ul = h('ul', 'isl-acct-list');
    for (const x of adv) ul.append(h('li', '', x));
    a.append(ul);
    box.append(a);
  }
  return box;
}

/** 総務 → 疲れと職場の環境 */
export function openGa(ctx: Ctx, hooks: { invest?: () => void; skills?: () => void } = {}) {
  // 段 UIX3k：新しい画面（uix/screens/tax.ts）へ
  return uxk.ga!(ctx, hooks);
}
