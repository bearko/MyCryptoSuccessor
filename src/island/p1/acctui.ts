/**
 * 経理・総務の画面（段 F。docs/ISLAND_PHASE1.md「経理」「総務」）：
 * - 経理 → 税と節税：いまの四半期の見込み（利益・税率・節税の支出と差し引き・上限）・「あと ○○ G 投資すると、税が △△ G 減る」・前の四半期の税の報告・これまでの記録・奥義の予告
 * - 決算書（landui.ts の openBooks）に足す「コストの大きい順」と「経理からの助言」の札
 * - 総務 → 疲れと職場の環境：ヒーローごとの疲れ（働きの速さ・士気への響き・休ませる）・職場の環境（総務のパネルと職人の休憩所）・奥義と掛け合わせの予告
 */
import { t } from '../../i18n';
import { ACCT_MASTERY, CROSS_ACCT_GA, FATIGUE, GA_MASTERY, TAX, type DedKind } from './data';
import { acctAdvice, acctOf, costRank, taxLine, dedCap, dedRate, quarterNow, taxPlan, taxRate, topTier, type TaxRec } from './acct';
import { type Ledger } from './company';
import { fatigueAvg, fatigueBand, fatigueLoad, fatigueMorale, fatigueMul, fatigueOf, gaOn, envItems, type FatigueBand } from './ga';
import { moraleOf } from './hr';
import { setRest, type P1State, type Staff } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, fmt, h, heroIcon, heroName, money } from './ui';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const TIER_NAME: Record<string, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
/** 節税の区分の名前（画面の行は短く。中身は「節税のしくみ」に） */
const DED_NAME: Record<DedKind, () => string> = {
  capex: () => t('設備投資', 'Capex'),
  rnd: () => t('研究開発', 'R&D'),
  env: () => t('総務の環境', 'Workplace'),
};
const DED_NOTE: Record<DedKind, () => string> = {
  capex: () => t('建てる・設備・お金パネル', 'buildings, upgrades, money panels'),
  rnd: () => t('研究への寄付・発掘許可・商品開発', 'donations, dig permits, product development'),
  env: () => t('総務のパネル・職人の休憩所', 'General Affairs panels, break room'),
};

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
  open(ctx, t('税と節税', 'Tax & savings'), (body) => {
    const s = ctx.s();
    const A = acctOf(s);
    const p = taxPlan(s);
    const now = quarterNow(s);
    // いまの四半期の見込み
    const head = h('div', 'isl-card2 isl-acct-head');
    head.dataset.focus = 'tax-plan';
    head.append(h('h3', '', t(`第 ${now.q} 四半期（${now.inQ} か月目・締めまで あと ${now.days} 日）`, `Q${now.q} (month ${now.inQ}, ${now.days} days to close)`)));
    if (!p.on) {
      head.append(h('p', '', t(`いまは税がかかりません。Uncommon の町に出店すると、四半期ごとに利益に法人税（Uncommon ${pct(TAX.rate.U)}・Rare ${pct(TAX.rate.R)}・Epic ${pct(TAX.rate.E)}）がかかります。Common の町の利益にはかかりません。`, `No tax yet. Once you open in an Uncommon town, quarterly profit is taxed (Uncommon ${pct(TAX.rate.U)}, Rare ${pct(TAX.rate.R)}, Epic ${pct(TAX.rate.E)}). Common towns are never taxed.`)));
    } else {
      const big = h('div', 'isl-row');
      big.append(h('b', 'isl-big', money(p.tax)), h('small', 'isl-dim', t(`このままの税の見込み（税率 ${pct(taxRate(s))}・会社の格 ${TIER_NAME[topTier(s)]}）`, `Projected tax (rate ${pct(taxRate(s))}, company rank ${TIER_NAME[topTier(s)]})`)));
      head.append(big);
      const rows = h('div', 'isl-books-tbl');
      const row = (k: string, v: string, cls = '') => {
        const x = h('div', `isl-books-row ${cls}`);
        x.append(h('span', '', k), h('b', '', v));
        rows.append(x);
      };
      row(t('ここまでの課税の対象の利益', 'Taxable profit so far'), money(p.base), 'is-head');
      for (const k of ['capex', 'rnd', 'env'] as DedKind[]) row(`　${DED_NAME[k]()}`, t(`${money(p.q[k])} × ${pct(dedRate(s, k))}`, `${money(p.q[k])} × ${pct(dedRate(s, k))}`), 'is-sub');
      row(t('差し引ける額', 'Deductible'), money(p.ded), 'is-sum');
      row(t(`　上限（利益の ${pct(dedCap(s))}）`, `  Cap (${pct(dedCap(s))} of profit)`), money(p.cap), 'is-sub');
      row(t('節税で減る税', 'Tax saved'), money(p.saved), 'is-sum');
      head.append(rows);
      // あと ○○ G 投資すると、税が △△ G 減る
      const tip = h('div', `isl-acct-tip ${p.room > 0 ? 'is-hot2' : ''}`);
      tip.dataset.focus = 'tax-tip';
      if (p.base <= 0) tip.append(h('span', 'isl-dim', t('この四半期はまだ利益が出ていないので、税はかかりません。', 'No profit yet this quarter, so no tax.')));
      else if (p.room > 0)
        tip.append(
          h('b', '', t(`💡 この四半期にあと ${money(p.needCapex)} 設備に投資すると、税が ${money(p.save)} 減る`, `💡 Invest ${money(p.needCapex)} more in upgrades this quarter to cut tax by ${money(p.save)}`)),
          h('small', 'isl-dim', t(`研究開発なら ${money(p.needRnd)}。どの投資も、締めの前（四半期の 3 か月目まで）に払った分だけが入ります。`, `Or ${money(p.needRnd)} in R&D. Only spending before the quarter closes counts.`)),
        );
      else tip.append(h('b', 'isl-good', t(`✅ 節税は上限まで使えています（税 −${money(p.saved)}）`, `✅ Tax savings are at the cap (−${money(p.saved)})`)));
      head.append(tip);
    }
    body.append(head);
    // 前の四半期の税の報告
    const last = A.hist[A.hist.length - 1];
    if (last) body.append(taxReportCard(last));
    // これまで
    const hist = h('div', 'isl-card2');
    hist.append(h('h3', '', t('これまでの法人税', 'Tax so far')));
    hist.append(h('p', '', t(`払った税 ${money(A.paid)}・節税で減らした税 ${money(A.saved)}`, `Paid ${money(A.paid)} · saved ${money(A.saved)}`)));
    if (A.carry.length) hist.append(h('small', 'isl-dim', t(`繰り越している損失 ${money(A.carry.reduce((a, x) => a + x.v, 0))}`, `Losses carried forward ${money(A.carry.reduce((a, x) => a + x.v, 0))}`)));
    if (A.owed > 0) hist.append(h('small', 'isl-bad', t(`払いきれていない税 ${money(A.owed)}（次の締めで払います）`, `Unpaid tax ${money(A.owed)} (paid at the next close)`)));
    const list = h('div', 'isl-acct-hist');
    for (const r of [...A.hist].reverse().slice(0, 6)) {
      const x = h('div', 'isl-books-row is-sub');
      x.append(h('span', '', t(`第 ${r.q} 四半期・${pct(r.rate)}`, `Q${r.q} · ${pct(r.rate)}`)), h('b', '', t(`${money(r.paid)}（節税 −${fmt(r.saved)}）`, `${money(r.paid)} (saved ${fmt(r.saved)})`)));
      list.append(x);
    }
    if (A.hist.length) hist.append(list);
    else hist.append(h('small', 'isl-dim', t('まだ締めた四半期はありません。', 'No quarter has closed yet.')));
    const row = h('div', 'isl-row');
    if (hooks.books) row.append(btn(t('決算書を見る', 'Open statements'), () => hooks.books!(), 'is-on'));
    if (hooks.skills) row.append(btn(t('経理のパネル', 'Accounting panels'), () => hooks.skills!()));
    hist.append(row);
    body.append(hist);
    // 節税のしくみ
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('節税のしくみ', 'How tax savings work')));
    const ul = h('ul', 'isl-acct-list');
    for (const x of [
      t(`四半期（会社の月 3 つ）の締めに、利益へ法人税。税率は会社の格（入ったいちばん上のランク）：Uncommon ${pct(TAX.rate.U)}・Rare ${pct(TAX.rate.R)}・Epic ${pct(TAX.rate.E)}・Legendary ${pct(TAX.rate.L)}。`, `Each quarter (3 company months) profit is taxed. Rate by company rank: Uncommon ${pct(TAX.rate.U)}, Rare ${pct(TAX.rate.R)}, Epic ${pct(TAX.rate.E)}, Legendary ${pct(TAX.rate.L)}.`),
      t(`Uncommon からの町は物価が高く、単価が ${pct(TAX.price.U - 1)}（Rare ${pct(TAX.price.R - 1)}）高い。節税しなくても、ふつうに回せば困らない。`, `Uncommon+ towns have higher prices (+${pct(TAX.price.U - 1)}, Rare +${pct(TAX.price.R - 1)}), so you are fine without saving tax.`),
      t(`その四半期の設備投資（${DED_NOTE.capex()}）の ${pct(dedRate(s, 'capex'))}・研究開発（${DED_NOTE.rnd()}）の ${pct(dedRate(s, 'rnd'))}・総務の環境（${DED_NOTE.env()}）の ${pct(dedRate(s, 'env'))} を、税の計算の前に利益から差し引く（上限は利益の ${pct(dedCap(s))}）。`, `${pct(dedRate(s, 'capex'))} of capex (${DED_NOTE.capex()}), ${pct(dedRate(s, 'rnd'))} of R&D (${DED_NOTE.rnd()}) and ${pct(dedRate(s, 'env'))} of workplace spending (${DED_NOTE.env()}) that quarter come off profit before tax (cap ${pct(dedCap(s))} of profit).`),
      t('同じ投資でも、締めの前に入れるか、締めのあとに回すかで税が変わる。決算の 1 か月前にマインちゃんが知らせます。', 'The same investment saves tax only if it lands before the close. A month before, you get a heads-up.'),
    ])
      ul.append(h('li', '', x));
    how.append(ul);
    body.append(how);
    body.append(masteryCard(ACCT_MASTERY(), CROSS_ACCT_GA()));
  });
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

// ---------------------------------------------------------------- 総務

const BAND_NAME: Record<FatigueBand, () => string> = {
  fresh: () => t('元気', 'Fresh'),
  ok: () => t('ふつう', 'OK'),
  tired: () => t('疲れている', 'Tired'),
  worn: () => t('くたくた', 'Worn out'),
};
const BAND_COLOR: Record<FatigueBand, string> = { fresh: 'var(--isl-good)', ok: '#9fd27a', tired: 'var(--isl-gold)', worn: 'var(--isl-bad)' };

/** 総務 → 疲れと職場の環境 */
export function openGa(ctx: Ctx, hooks: { invest?: () => void; skills?: () => void } = {}) {
  open(ctx, t('疲れと職場の環境', 'Fatigue & workplace'), (body) => {
    const s = ctx.s();
    const on = gaOn(s);
    const head = h('div', 'isl-card2 isl-ga-head');
    head.dataset.focus = 'fatigue';
    const avg = fatigueAvg(s);
    const big = h('div', 'isl-row');
    big.append(h('b', 'isl-big', pct(avg)), h('small', 'isl-dim', t('疲れの平均（持ち場のある人）', 'Average fatigue (heroes on duty)')));
    head.append(h('h3', '', t('疲れ', 'Fatigue')), big);
    head.append(
      h(
        'p',
        'isl-dim',
        on
          ? t(
              `疲れ ＝ 使ったスタミナ。働くと増え、休むと減ります。疲れが ${pct(FATIGUE.from)} を超えると、働きの速さ（${pct(FATIGUE.to)} で −${pct(FATIGUE.work)}）と士気の目標（−${FATIGUE.morale}）が下がります。尽きる前に早めに休ませると、休む日数は同じまま疲れを抑えられます。`,
              `Fatigue = stamina used. Work raises it, rest lowers it. Above ${pct(FATIGUE.from)} it slows work (−${pct(FATIGUE.work)} at ${pct(FATIGUE.to)}) and lowers the morale target (−${FATIGUE.morale}). Resting early keeps fatigue low for the same days off.`,
            )
          : t('疲れが働きと士気に響くのは、Uncommon の町に出店してからです（総務の部門が開いてから）。', 'Fatigue affects work and morale once you open in an Uncommon town (when General Affairs opens).'),
      ),
    );
    body.append(head);
    // ヒーローごと（疲れの大きい順）
    const grid = h('div', 'isl-hgrid');
    const list = [...s.staff].sort((a, b) => fatigueOf(b) - fatigueOf(a));
    for (const st of list) grid.append(fatigueCard(ctx, s, st));
    body.append(grid);
    // 職場の環境
    const env = h('div', 'isl-card2 isl-ga-env');
    env.dataset.focus = 'env';
    env.append(h('h3', '', t('職場の環境', 'Workplace')));
    const items = envItems(s);
    const got = items.filter((x) => x.on && x.kind === 'panel').length;
    env.append(h('p', 'isl-dim', t(`総務のパネル 1 枚につき士気の目標 +2（いま ${got} 枚・+${Math.min(12, got * 2)}。+12 まで）。休憩室・社員食堂は休むと戻るスタミナ、シフト制・仮眠室・職人の休憩所は働くときの減りに効きます（＝疲れが溜まりにくい）。`, `Each General Affairs panel adds +2 to the morale target (now ${got}, +${Math.min(12, got * 2)}; max +12). Lounge and canteen speed recovery; shifts, nap room and break room cut drain (less fatigue).`)));
    for (const x of items) {
      const r = h('div', `isl-ga-item ${x.on ? 'is-on' : ''}`);
      r.append(h('b', '', `${x.on ? '✔' : '–'} ${x.name}`), h('small', 'isl-dim', x.note), h('small', x.on ? 'isl-good' : 'isl-dim', x.on ? (x.kind === 'panel' ? t(`Lv ${x.lv}`, `Lv ${x.lv}`) : t('工房に付いている', 'Installed')) : x.kind === 'panel' ? t('未取得（総務のパネル）', 'Not taken (GA panel)') : t('未設置（設備投資）', 'Not installed (upgrade)')));
      env.append(r);
    }
    env.append(h('small', 'isl-dim', t('総務のパネルと職人の休憩所の費用は、経理の節税（総務の環境）にもなります。工房・お店の設備の新調も設備投資として節税に入ります。', 'GA panels and the break room also count as tax-saving workplace spending; workshop/shop upgrades count as capex.')));
    const row = h('div', 'isl-row');
    if (hooks.skills) row.append(btn(t('総務のパネル', 'GA panels'), () => hooks.skills!(), 'is-on'));
    if (hooks.invest) row.append(btn(t('設備投資', 'Upgrades'), () => hooks.invest!()));
    env.append(row);
    body.append(env);
    body.append(masteryCard(GA_MASTERY(), CROSS_ACCT_GA()));
  });
}

function fatigueCard(ctx: Ctx, s: P1State, st: Staff): HTMLElement {
  const card = h('div', 'isl-card2 isl-ga-card');
  card.dataset.hero = String(st.hero);
  const f = fatigueOf(st);
  const band = fatigueBand(st);
  const top = h('div', 'isl-ga-top');
  top.append(heroIcon(st.hero, 32), h('b', '', heroName(st.hero)), h('span', `isl-ga-pct is-${band}`, t(`${pct(f)}・${BAND_NAME[band]()}`, `${pct(f)} · ${BAND_NAME[band]()}`)));
  card.append(top, bar(f, BAND_COLOR[band]));
  const load = fatigueLoad(s, st);
  const foot = h('div', 'isl-ga-foot');
  foot.append(
    h(
      'small',
      load > 0 ? 'isl-bad' : 'isl-dim',
      st.resting
        ? t(`休憩中（士気 ${Math.round(moraleOf(st))}）`, `Resting (morale ${Math.round(moraleOf(st))})`)
        : load > 0
          ? t(`速さ ×${fatigueMul(s, st).toFixed(2)}・士気の目標 ${Math.round(fatigueMorale(s, st))}（士気 ${Math.round(moraleOf(st))}）`, `Speed ×${fatigueMul(s, st).toFixed(2)}, morale target ${Math.round(fatigueMorale(s, st))} (morale ${Math.round(moraleOf(st))})`)
          : t(`響きなし（士気 ${Math.round(moraleOf(st))}）`, `No penalty (morale ${Math.round(moraleOf(st))})`),
    ),
  );
  const b = btn(st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest'), () => {
    setRest(s, st.hero, !st.resting);
    after(ctx);
  }, !st.resting && f >= FATIGUE.show ? 'is-on' : '');
  foot.append(b);
  card.append(foot);
  return card;
}
