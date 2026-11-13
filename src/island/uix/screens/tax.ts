/**
 * 段 UIX3k：税と節税（経理）・疲れと職場の環境（総務）。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：税と節税・疲れと職場の環境」）。
 * 出す中身・計算・押す先は今の画面（p1/acctui.ts の openTax・taxReportCard・openGa・fatigueCard・masteryCard）と同じ。本体の関数は束（K）から使う。
 *
 * 税と節税
 * - いまの四半期：月のランプ（3 つ。いまの月まで点く）と「締めまで あと N 日」・数字の札（税の見込み・節税で減る税・税率）
 * - 見込みの表は紙に印字（今の「表で見る」の折りたたみを、はじめから出す）・税の見込みの差し引きは縦の棒（引くものは斜線・税のあとは琥珀）
 * - 「あと N G 設備に投資すると、税が N G 減る」：節税の枠（差し引ける額 ／ 上限）の計器と一言。上限まで使えたら「上限まで」の札が打たれる
 * - 前の四半期の税の報告（紙）・これまでの法人税（数字の札・四半期ごとの縦の棒 2 つ）・節税のしくみ（紙）・奥義の予告（錠の札）
 * - 下に貼りつく帯：「経理のパネル」（弱いキー）・「決算書を見る」（主のキー＝前の層）
 * 疲れと職場の環境
 * - 疲れの平均（数字の札と計器）・ヒーローごとのカード（顔・疲れの段の貼り札とランプ・計器・速さと士気・休ませるキー）
 *   休ませると「休憩中」の札が打たれる。疲れが大きく、休ませたほうがよい人のキーには赤いランプがまたたく
 * - 職場の環境：士気の目標（+2 ずつ。+12 まで）のランプの段・パネルと休憩所の行（取った・付いた＝緑のランプとチェック）
 * - 下に貼りつく帯：「設備投資」（弱いキー）・「総務のパネル」（主のキー）
 * 器は今の札（open()。keep：日ごとの描き直しは動きなしで値だけ合わせる。数字の札は前の値から回る）。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpEmpty, uxpFace, uxpFoot, uxpHead, uxpPaper, uxpPrint, uxpRow, uxpStamp, uxpStat, type Tone } from '../sparts';
import { fallBars } from './books';
import { K } from './k-deps';
import { kIcon, noEmoji } from './k-icons';
import './k-screens.css';
import type { Ctx } from '../../p1/screens';
import type { P1State, Staff } from '../../p1/model';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const TIER_NAME: Record<string, string> = { C: 'Common', U: 'Uncommon', R: 'Rare', E: 'Epic', L: 'Legendary' };
export type DedKind = 'capex' | 'rnd' | 'env';
export const DED_KINDS: DedKind[] = ['capex', 'rnd', 'env'];
export const DED_NAME: Record<DedKind, () => string> = {
  capex: () => t('設備投資', 'Capex'),
  rnd: () => t('研究開発', 'R&D'),
  env: () => t('総務の環境', 'Workplace'),
};
export const DED_NOTE: Record<DedKind, () => string> = {
  capex: () => t('建てる・設備・お金パネル', 'buildings, upgrades, money panels'),
  rnd: () => t('研究への寄付・発掘許可・商品開発', 'donations, dig permits, product development'),
  env: () => t('総務のパネル・職人の休憩所', 'General Affairs panels, break room'),
};
/** 疲れの段の名前と、ランプ・計器の色（色だけにしない：段の名前と % を必ず添える） */
export type Band = 'fresh' | 'ok' | 'tired' | 'worn';
export const BAND_NAME: Record<Band, () => string> = {
  fresh: () => t('元気', 'Fresh'),
  ok: () => t('ふつう', 'OK'),
  tired: () => t('疲れている', 'Tired'),
  worn: () => t('くたくた', 'Worn out'),
};
export const BAND_LAMP: Record<Band, '' | 'good' | 'bad' | 'cyan'> = { fresh: 'good', ok: 'cyan', tired: '', worn: 'bad' };
export const BAND_TONE: Record<Band, Tone> = { fresh: 'good', ok: '', tired: 'amber', worn: 'bad' };
/** 節税の枠の計器（差し引ける額 ／ 上限。上限が 0 なら 0） */
export const dedRatio = (ded: number, cap: number) => (cap > 0 ? Math.max(0, Math.min(1, ded / cap)) : 0);
/** 士気の目標の段（総務のパネル 1 枚で +2、+12 まで＝6 段） */
export const MORALE_STEPS = 6;
export const moraleSteps = (got: number) => Math.min(MORALE_STEPS, got);
/** 休ませたほうがよい（今の画面の is-on と同じ：休んでいない・疲れが目安以上） */
export const restHot = (resting: boolean, f: number, show: number) => !resting && f >= show;

// ---------------------------------------------------------------- 共通
const ink = { color: '#1a1c2e', hi: '#1a1c2e', lo: '#8a7f5c', scale: 1 };
const lite = { color: '#f4ecd4', hi: '#fffdf3', lo: '#0b0d17', scale: 1 };
const sect = (title: string, ico: string, o: { kind?: 'amber' | 'dark'; note?: string; right?: HTMLElement | null } = {}) =>
  uxpHead([kIcon(ico, o.kind === 'dark' ? lite : ink), el('b', title)], { kind: o.kind ?? 'amber', note: o.note || undefined, right: o.right ?? undefined });
/** 奥義の予告：錠の札と、まだ使えない一覧（表示だけ。今の masteryCard と同じ中身） */
function mastery(lines: string[], cross?: string): HTMLElement {
  const all = cross ? [...lines, cross] : lines;
  return el(
    'section.uxk-sec.uxk-soon',
    sect(t('奥義と掛け合わせ（予告）', 'Masteries & cross panels (preview)'), 'lock', { kind: 'dark' }),
    el(
      'ul.uxk-soon-list',
      all.map((x) => el('li', uxLamp('', false), el('span', noEmoji(x)))),
    ),
  );
}
/** 紙の上の行（名前 …… 値。値は右そろえ） */
const paperRow = (k: string, v: string, cls: 'is-head' | 'is-sub' | 'is-sum' | 'is-total', tone: Tone = '') => {
  const r = uxpRow(k.replace(/^　/, ''), v, { tone });
  r.classList.add('uxk-bk-row', cls);
  return r;
};
/** 描き直しで動きを付けるか（開いたとき・押したあとだけ。日ごとの描き直しは動かさない） */
const built = new WeakMap<HTMLElement, { draw: (anim: boolean) => void }>();
function keepOpen(ctx: Ctx, title: string, make: (ctx: Ctx, body: HTMLElement) => (anim: boolean) => void) {
  K.open(
    ctx,
    title,
    (body) => {
      const cur = built.get(body);
      if (cur) return cur.draw(false);
      const draw = make(ctx, body);
      built.set(body, { draw });
      draw(true);
    },
    undefined,
    true,
  );
}

// ================================================================= 税と節税
export function openTaxUx(ctx: Ctx, hooks: { books?: () => void; skills?: () => void } = {}) {
  keepOpen(ctx, t('税と節税', 'Tax & savings'), (c, body) => taxScreen(c, body, hooks));
}

function taxScreen(ctx: Ctx, body: HTMLElement, hooks: { books?: () => void; skills?: () => void }) {
  const root = el('div.uxk-tx.uxk-calm');
  const page = el('div.uxk-tx-page');
  const kids: HTMLElement[] = [];
  if (hooks.skills) kids.push(uxKey(t('経理のパネル', 'Accounting panels'), () => hooks.skills!(), { kind: 'weak', ico: null, cls: 'uxk-tx-panels' }));
  if (hooks.books) kids.push(uxKey([kIcon('sheet', ink), el('b', t('決算書を見る', 'Open statements'))], () => hooks.books!(), { kind: 'main', ico: null, cls: 'uxk-tx-books' }));
  root.append(page);
  if (kids.length) root.append(uxpFoot(...kids));
  body.append(root);
  let capped: boolean | null = null;

  return (anim: boolean) => {
    if (!root.isConnected) return;
    const s = ctx.s();
    const motion = anim && !isCalm();
    const A = K.acctOf(s);
    const p = K.taxPlan(s);
    const now = K.quarterNow(s);
    const prints: HTMLElement[][] = [];
    const grows: { grow: () => void }[] = [];
    const out: HTMLElement[] = [];

    // ---- いまの四半期
    const months = el('span.uxk-tx-months', { role: 'img', 'aria-label': t(`${now.inQ} か月目／3`, `Month ${now.inQ} of 3`) }, [1, 2, 3].map((m) => uxLamp(m < now.inQ ? 'good' : '', m <= now.inQ, m === now.inQ)));
    const head = el('section.uxk-sec.uxk-tx-head', { 'data-focus': 'tax-plan' });
    head.append(sect(t(`第 ${now.q} 四半期（${now.inQ} か月目）`, `Q${now.q} (month ${now.inQ})`), 'calc'), el('div.uxk-tx-close', months, el('span', t(`締めまで あと ${now.days} 日`, `${now.days} days to close`))));
    if (!p.on) {
      head.append(
        el(
          'div.uxk-tx-off',
          el('span.uxk-tx-off-top', uxLamp('', false), el('b', t('いまは税がかかりません', 'No tax yet'))),
          el('p', t(`Uncommon の町に出店すると、四半期ごとに利益に法人税（Uncommon ${pct(K.TAX.rate.U)}・Rare ${pct(K.TAX.rate.R)}・Epic ${pct(K.TAX.rate.E)}）がかかります。Common の町の利益にはかかりません。`, `Once you open in an Uncommon town, quarterly profit is taxed (Uncommon ${pct(K.TAX.rate.U)}, Rare ${pct(K.TAX.rate.R)}, Epic ${pct(K.TAX.rate.E)}). Common towns are never taxed.`)),
        ),
      );
    } else {
      const rate = K.taxRate(s);
      head.append(
        el(
          'div.uxp-stats.uxk-tx-stats',
          uxpStat(t('税の見込み', 'Projected tax'), Math.max(0, p.tax), { key: 'uxk.tx.tax', unit: 'G', size: 's', tone: 'amber', note: t('このままの見込み', 'If nothing changes') }).el,
          uxpStat(t('節税で減る税', 'Tax saved'), Math.max(0, p.saved), { key: 'uxk.tx.saved', unit: 'G', size: 's', tone: 'good' }).el,
          uxpStat(t('税率', 'Rate'), Math.round(rate * 100), { key: 'uxk.tx.rate', unit: '%', size: 's', digits: 2, note: t(`会社の格 ${TIER_NAME[K.topTier(s)]}`, `Company rank ${TIER_NAME[K.topTier(s)]}`) }).el,
        ),
      );
      // 見込みの表（今の「表で見る」：はじめから紙に印字）
      const rows = [
        paperRow(t('ここまでの課税の対象の利益', 'Taxable profit so far'), K.money(p.base), 'is-head'),
        ...DED_KINDS.map((k) => paperRow(t(`${DED_NAME[k]()}（× ${pct(K.dedRate(s, k))}）`, `${DED_NAME[k]()} (× ${pct(K.dedRate(s, k))})`), K.money(p.q[k]), 'is-sub')),
        paperRow(t('差し引ける額', 'Deductible'), K.money(p.ded), 'is-sum'),
        paperRow(t(`上限（利益の ${pct(K.dedCap(s))}）`, `Cap (${pct(K.dedCap(s))} of profit)`), K.money(p.cap), 'is-sub'),
        paperRow(t('節税で減る税', 'Tax saved'), K.money(p.saved), 'is-total', p.saved > 0 ? 'good' : ''),
      ];
      prints.push(rows);
      const paper = uxpPaper(el('div.uxk-bk-ttl', kIcon('sheet', ink), el('b', t('区分ごとの節税・上限', 'By kind, cap'))), el('div.uxk-bk-rows', rows));
      const pair = el('div.uxk-bk-pair', paper);
      // 税の見込みの差し引き（縦の棒）：利益 → 差し引き → 課税される額 → 税 → 税のあと
      if (p.base > 0) {
        const fall = K.taxFall(p);
        const bars = uxpBars(fallBars(fall), { height: 150, cls: 'uxk-tx-fall', auto: !motion });
        bars.el.style.minWidth = `${fall.length * 64}px`;
        bars.el.setAttribute('aria-label', t(`課税の対象の利益 ${K.money(p.base)}・税の見込み ${K.money(p.tax)}`, `Taxable ${K.money(p.base)}, tax ${K.money(p.tax)}`));
        grows.push(bars);
        pair.append(el('div.uxk-bk-graph', el('b.uxk-bk-sub', p.saved > 0 ? t(`節税で税が ${K.money(p.saved)} 減る見込み`, `Tax savings cut ${K.money(p.saved)}`) : t('節税の差し引きはまだ無い', 'No deductions yet')), bars.el));
      }
      head.append(pair);
      // あと ○○ G 投資すると、税が △△ G 減る：節税の枠の計器と一言
      const tip = el(`div.uxk-tx-tip${p.room > 0 ? '.is-hot2' : ''}`, { 'data-focus': 'tax-tip' });
      const meter = uxMeter(motion ? 0 : dedRatio(p.ded, p.cap), p.room > 0 || p.base <= 0 ? '' : 'good');
      const stamp = uxpStamp(t('上限まで', 'At the cap'), { kind: 'good' });
      if (p.base <= 0) tip.append(el('span.uxk-tx-tip-t', kIcon('bulb', lite), el('span', t('この四半期はまだ利益が出ていないので、税はかかりません。', 'No profit yet this quarter, so no tax.'))));
      else if (p.room > 0)
        tip.append(
          el('span.uxk-tx-tip-t', kIcon('bulb', { ...lite, color: '#ffb81f' }), el('b', t(`この四半期にあと ${K.money(p.needCapex)} 設備に投資すると、税が ${K.money(p.save)} 減る`, `Invest ${K.money(p.needCapex)} more in upgrades this quarter to cut tax by ${K.money(p.save)}`))),
          el('span.uxk-tx-tip-s', t(`研究開発なら ${K.money(p.needRnd)}。どの投資も、締めの前（四半期の 3 か月目まで）に払った分だけが入ります。`, `Or ${K.money(p.needRnd)} in R&D. Only spending before the quarter closes counts.`)),
        );
      else tip.append(el('span.uxk-tx-tip-t', kIcon('check', { ...lite, color: '#36e08b' }), el('b', t(`節税は上限まで使えています（税 −${K.money(p.saved)}）`, `Tax savings are at the cap (−${K.money(p.saved)})`)), stamp.el));
      if (p.base > 0) tip.append(el('span.uxk-tx-gauge', el('span.uxk-tx-gauge-k', t('節税の枠', 'Deduction room')), meter.el, el('span.uxk-tx-gauge-v.ux-num', `${K.money(p.ded)} / ${K.money(p.cap)}`)));
      head.append(tip);
      const atCap = p.base > 0 && p.room <= 0;
      if (motion) later(260, () => meter.set(dedRatio(p.ded, p.cap)));
      // 上限に届いた：札を打つ（開いたとき・届いた瞬間。描き直しでは止まった形）
      if (atCap) {
        if (motion || (capped === false && !isCalm())) later(motion ? 520 : 0, () => stamp.hit(tip));
        else stamp.show();
      }
      capped = atCap;
    }
    out.push(head);

    // ---- 前の四半期の税の報告
    const last = A.hist[A.hist.length - 1];
    if (last) {
      const rows = [
        paperRow(t('課税の対象の利益', 'Taxable profit'), K.money(last.base), 'is-head'),
        ...(last.carry ? [paperRow(t('繰越の損失', 'Loss carried forward'), K.money(-last.carry), 'is-sub', 'bad')] : []),
        paperRow(t('節税の差し引き', 'Tax-saving deductions'), K.money(-last.ded), 'is-sub', last.ded ? 'bad' : ''),
        paperRow(t('課税される額', 'Taxed amount'), K.money(last.taxable), 'is-sum'),
        paperRow(t('法人税', 'Corporate tax'), K.money(-last.tax), 'is-total', 'bad'),
      ];
      prints.push(rows);
      out.push(
        el(
          'section.uxk-sec',
          sect(t(`第 ${last.q} 四半期の法人税`, `Q${last.q} corporate tax`), 'receipt'),
          uxpPaper(
            el('div.uxk-tx-paid', el('span.uxk-tx-paid-k', t('払った税', 'Paid')), el('b.ux-num', K.money(last.paid)), el('span', t(`税率 ${pct(last.rate)}（会社の格：${TIER_NAME[last.tier]}）`, `Rate ${pct(last.rate)} (company rank: ${TIER_NAME[last.tier]})`))),
            el('div.uxk-bk-rows', rows),
            el(
              `p.uxk-tx-say${last.saved > 0 ? '.is-good' : ''}`,
              last.saved > 0 ? t(`節税で税が ${K.money(last.saved)} 減った（上限 ${K.money(last.cap)} のうち ${K.money(last.ded)} を差し引いた）`, `Tax savings cut ${K.money(last.saved)} (deducted ${K.money(last.ded)} of a ${K.money(last.cap)} cap)`) : t('この四半期は節税の支出がありませんでした。設備投資・研究開発・総務の環境の支出が税を減らします。', 'No tax-saving spending this quarter. Capex, R&D and workplace spending lower your tax.'),
            ),
            last.paid < last.tax ? el('p.uxk-tx-say.is-bad', t(`資金が足りず、${K.money(last.tax - last.paid)} は次の四半期に払います`, `${K.money(last.tax - last.paid)} could not be paid and carries to next quarter`)) : null,
          ),
        ),
      );
    }

    // ---- これまでの法人税
    const hist = el('section.uxk-sec', sect(t('これまでの法人税', 'Tax so far'), 'bars', { kind: 'dark' }));
    hist.append(
      el(
        'div.uxp-stats.uxk-tx-stats',
        uxpStat(t('払った税', 'Paid'), Math.max(0, A.paid), { key: 'uxk.tx.paid', unit: 'G', size: 's' }).el,
        uxpStat(t('節税で減らした税', 'Saved'), Math.max(0, A.saved), { key: 'uxk.tx.savedAll', unit: 'G', size: 's', tone: 'good' }).el,
      ),
    );
    const carry = A.carry.reduce((a: number, x: { v: number }) => a + x.v, 0);
    if (A.carry.length) hist.append(uxpRow(t('繰り越している損失', 'Losses carried forward'), K.money(carry), { tone: 'dim' }));
    if (A.owed > 0) hist.append(uxpRow(t('払いきれていない税', 'Unpaid tax'), K.money(A.owed), { tone: 'bad', note: t('次の締めで払います', 'Paid at the next close') }));
    if (A.hist.length >= 2) {
      const hs = A.hist.slice(-8);
      const lab = (r: { q: number }) => `Q${r.q}`;
      const paid = uxpBars(hs.map((r: { q: number; paid: number }) => ({ label: lab(r), value: r.paid })), { height: 132, cls: 'uxk-bk-trend', auto: !motion });
      const saved = uxpBars(hs.map((r: { q: number; saved: number }) => ({ label: lab(r), value: r.saved, kind: 'good' as const })), { height: 132, cls: 'uxk-bk-trend', auto: !motion });
      for (const b of [paid, saved]) b.el.style.minWidth = `${hs.length * 72}px`;
      paid.el.setAttribute('aria-label', t('払った税', 'Tax paid') + ': ' + hs.map((r: { q: number; paid: number; rate: number }) => t(`${lab(r)} ${K.money(r.paid)}（${pct(r.rate)}）`, `${lab(r)} ${K.money(r.paid)} (${pct(r.rate)})`)).join(' / '));
      saved.el.setAttribute('aria-label', t('節税で減った税', 'Tax saved') + ': ' + hs.map((r: { q: number; saved: number }) => `${lab(r)} ${K.money(r.saved)}`).join(' / '));
      grows.push(paid, saved);
      hist.append(el('div.uxk-bk-two', el('div.uxk-bk-graph', el('b.uxk-bk-sub', t('払った税', 'Tax paid')), paid.el), el('div.uxk-bk-graph', el('b.uxk-bk-sub', t('節税で減った税', 'Tax saved')), saved.el)));
    } else if (A.hist.length) {
      for (const r of [...A.hist].reverse().slice(0, 6)) hist.append(uxpRow(t(`第 ${r.q} 四半期・${pct(r.rate)}`, `Q${r.q} · ${pct(r.rate)}`), K.money(r.paid), { note: t(`節税 −${K.money(r.saved)}`, `saved ${K.money(r.saved)}`) }));
    } else hist.append(uxpEmpty(t('まだ締めた四半期はありません。', 'No quarter has closed yet.'), { ico: 'receipt', sub: t('四半期（会社の月 3 つ）が締まると、ここに並びます', 'Closed quarters (3 company months) appear here') }));
    out.push(hist);

    // ---- 節税のしくみ
    const how = [
      t(`四半期（会社の月 3 つ）の締めに、利益へ法人税。税率は会社の格（入ったいちばん上のランク）：Uncommon ${pct(K.TAX.rate.U)}・Rare ${pct(K.TAX.rate.R)}・Epic ${pct(K.TAX.rate.E)}・Legendary ${pct(K.TAX.rate.L)}。`, `Each quarter (3 company months) profit is taxed. Rate by company rank: Uncommon ${pct(K.TAX.rate.U)}, Rare ${pct(K.TAX.rate.R)}, Epic ${pct(K.TAX.rate.E)}, Legendary ${pct(K.TAX.rate.L)}.`),
      t(`Uncommon からの町は物価が高く、単価が ${pct(K.TAX.price.U - 1)}（Rare ${pct(K.TAX.price.R - 1)}）高い。節税しなくても、ふつうに回せば困らない。`, `Uncommon+ towns have higher prices (+${pct(K.TAX.price.U - 1)}, Rare +${pct(K.TAX.price.R - 1)}), so you are fine without saving tax.`),
      t(`その四半期の設備投資（${DED_NOTE.capex()}）の ${pct(K.dedRate(s, 'capex'))}・研究開発（${DED_NOTE.rnd()}）の ${pct(K.dedRate(s, 'rnd'))}・総務の環境（${DED_NOTE.env()}）の ${pct(K.dedRate(s, 'env'))} を、税の計算の前に利益から差し引く（上限は利益の ${pct(K.dedCap(s))}）。`, `${pct(K.dedRate(s, 'capex'))} of capex (${DED_NOTE.capex()}), ${pct(K.dedRate(s, 'rnd'))} of R&D (${DED_NOTE.rnd()}) and ${pct(K.dedRate(s, 'env'))} of workplace spending (${DED_NOTE.env()}) that quarter come off profit before tax (cap ${pct(K.dedCap(s))} of profit).`),
      t('同じ投資でも、締めの前に入れるか、締めのあとに回すかで税が変わる。決算の 1 か月前にマインちゃんが知らせます。', 'The same investment saves tax only if it lands before the close. A month before, you get a heads-up.'),
    ];
    out.push(el('section.uxk-sec', sect(t('節税のしくみ', 'How tax savings work'), 'scales', { kind: 'dark' }), uxpPaper({ plain: true }, el('ul.uxk-bk-list', how.map((x) => el('li', x))))));
    out.push(mastery(K.ACCT_MASTERY(), K.CROSS_ACCT_GA()));

    page.replaceChildren(...out);
    for (const g of page.querySelectorAll<HTMLElement>('.uxk-bk-graph')) g.scrollLeft = g.scrollWidth;
    // 動き：開いたとき、紙の行が上から打たれ、棒が伸びる。描き直し（日ごと）は、すぐ出す
    if (motion) {
      prints.forEach((rows, i) => uxpPrint(rows, { gap: 50, sound: i === 0 }));
      later(200, () => grows.forEach((b) => b.grow()));
    } else prints.forEach((rows) => uxpPrint(rows).finish());
  };
}

// ================================================================= 疲れと職場の環境
export function openGaUx(ctx: Ctx, hooks: { invest?: () => void; skills?: () => void } = {}) {
  keepOpen(ctx, t('疲れと職場の環境', 'Fatigue & workplace'), (c, body) => gaScreen(c, body, hooks));
}

function gaScreen(ctx: Ctx, body: HTMLElement, hooks: { invest?: () => void; skills?: () => void }) {
  const root = el('div.uxk-ga.uxk-calm');
  const page = el('div.uxk-ga-page');
  const kids: HTMLElement[] = [];
  if (hooks.invest) kids.push(uxKey(t('設備投資', 'Upgrades'), () => hooks.invest!(), { kind: 'weak', ico: null, cls: 'uxk-ga-invest' }));
  if (hooks.skills) kids.push(uxKey([kIcon('sofa', ink), el('b', t('総務のパネル', 'GA panels'))], () => hooks.skills!(), { kind: 'main', ico: null, cls: 'uxk-ga-panels' }));
  root.append(page);
  if (kids.length) root.append(uxpFoot(...kids));
  body.append(root);
  /** いま休ませた・休憩をやめた人（描き直したあと、その札に印を打つ） */
  let justSet: { hero: number; rest: boolean } | null = null;
  const prevF = new Map<number, number>();

  return (anim: boolean) => {
    if (!root.isConnected) return;
    const s = ctx.s();
    const motion = anim && !isCalm();
    const on = K.gaOn(s);
    const avg = K.fatigueAvg(s);
    const out: HTMLElement[] = [];
    const meters: { m: ReturnType<typeof uxMeter>; v: number }[] = [];

    // ---- 疲れの平均
    const avgM = uxMeter(motion ? 0 : avg);
    meters.push({ m: avgM, v: avg });
    out.push(
      el(
        'section.uxk-sec.uxk-ga-head',
        { 'data-focus': 'fatigue' },
        sect(t('疲れ', 'Fatigue'), 'hourglass'),
        el(
          'div.uxk-ga-avg',
          uxpStat(t('疲れの平均', 'Average fatigue'), Math.round(avg * 100), { key: 'uxk.ga.avg', unit: '%', size: 's', digits: Math.round(avg * 100) >= 100 ? 3 : 2, tone: avg >= K.FATIGUE.from ? 'amber' : '', note: t('持ち場のある人', 'Heroes on duty') }).el,
          el('span.uxk-ga-avg-m', avgM.el, el('span.uxk-ga-marks', el('span', `0%`), el('span', { style: `left:${K.FATIGUE.from * 100}%` }, pct(K.FATIGUE.from)), el('span', '100%'))),
        ),
        el(
          'p.uxk-note',
          on
            ? t(
                `疲れ ＝ 使ったスタミナ。働くと増え、休むと減ります。疲れが ${pct(K.FATIGUE.from)} を超えると、働きの速さ（${pct(K.FATIGUE.to)} で −${pct(K.FATIGUE.work)}）と士気の目標（−${K.FATIGUE.morale}）が下がります。尽きる前に早めに休ませると、休む日数は同じまま疲れを抑えられます。`,
                `Fatigue = stamina used. Work raises it, rest lowers it. Above ${pct(K.FATIGUE.from)} it slows work (−${pct(K.FATIGUE.work)} at ${pct(K.FATIGUE.to)}) and lowers the morale target (−${K.FATIGUE.morale}). Resting early keeps fatigue low for the same days off.`,
              )
            : t('疲れが働きと士気に響くのは、Uncommon の町に出店してからです（総務の部門が開いてから）。', 'Fatigue affects work and morale once you open in an Uncommon town (when General Affairs opens).'),
        ),
      ),
    );

    // ---- ヒーローごと（疲れの大きい順）
    const list = [...s.staff].sort((a: Staff, b: Staff) => K.fatigueOf(b) - K.fatigueOf(a));
    const cards = el('div.uxp-list.uxk-ga-list');
    let hit: { card: HTMLElement; stamp: ReturnType<typeof uxpStamp> } | null = null;
    for (const st of list) {
      const r = heroCard(s, st, motion);
      meters.push(r.meter);
      cards.append(r.card);
      if (justSet && justSet.hero === st.hero) hit = { card: r.card, stamp: r.stamp };
    }
    if (!list.length) cards.append(uxpEmpty(t('まだヒーローがいません。', 'No heroes yet.'), { ico: 'people' }));
    out.push(el('section.uxk-sec', sect(t('ヒーローごと（疲れの大きい順）', 'By hero (most tired first)'), 'people', { kind: 'dark' }), cards));

    // ---- 職場の環境
    const items = K.envItems(s);
    const got = items.filter((x: { on: boolean; kind: string }) => x.on && x.kind === 'panel').length;
    const steps = el('span.uxk-ga-steps', { role: 'img', 'aria-label': t(`士気の目標 +${Math.min(12, got * 2)}（+12 まで）`, `Morale target +${Math.min(12, got * 2)} (max +12)`) }, Array.from({ length: MORALE_STEPS }, (_, i) => uxLamp('good', i < moraleSteps(got))));
    const env = el('section.uxk-sec.uxk-ga-env', { 'data-focus': 'env' }, sect(t('職場の環境', 'Workplace'), 'sofa', { right: el('span.uxk-ga-morale', steps, el('b.ux-num', `+${Math.min(12, got * 2)}`)) }));
    env.append(el('p.uxk-note', t(`総務のパネル 1 枚につき士気の目標 +2（いま ${got} 枚・+${Math.min(12, got * 2)}。+12 まで）。休憩室・社員食堂は休むと戻るスタミナ、シフト制・仮眠室・職人の休憩所は働くときの減りに効きます（＝疲れが溜まりにくい）。`, `Each General Affairs panel adds +2 to the morale target (now ${got}, +${Math.min(12, got * 2)}; max +12). Lounge and canteen speed recovery; shifts, nap room and break room cut drain (less fatigue).`)));
    const rows = el('div.uxk-ga-items');
    for (const x of items) {
      const state = x.on ? (x.kind === 'panel' ? t(`Lv ${x.lv}`, `Lv ${x.lv}`) : t('工房に付いている', 'Installed')) : x.kind === 'panel' ? t('未取得（総務のパネル）', 'Not taken (GA panel)') : t('未設置（設備投資）', 'Not installed (upgrade)');
      rows.append(
        el(
          `div.uxk-ga-item${x.on ? '.is-on' : ''}`,
          el('span.uxk-ga-item-ic', uxLamp('good', x.on), kIcon(x.on ? 'check' : x.kind === 'panel' ? 'lock' : 'sofa', x.on ? { ...lite, color: '#36e08b' } : { ...lite, color: '#7d86b3' })),
          el('span.uxk-ga-item-b', el('b', x.name), el('span.uxk-ga-item-n', noEmoji(x.note))),
          el(`span.uxk-ga-item-s${x.on ? '.is-good' : ''}`, state),
        ),
      );
    }
    env.append(rows, el('p.uxk-note', t('総務のパネルと職人の休憩所の費用は、経理の節税（総務の環境）にもなります。工房・お店の設備の新調も設備投資として節税に入ります。', 'GA panels and the break room also count as tax-saving workplace spending; workshop/shop upgrades count as capex.')));
    out.push(env);
    out.push(mastery(K.GA_MASTERY(), K.CROSS_ACCT_GA()));

    page.replaceChildren(...out);
    // 動き：開いたとき計器が 0 から振れる。休ませたときは、その札に印が打たれる
    if (motion) later(180, () => meters.forEach(({ m, v }) => m.set(v)));
    if (hit && justSet) {
      const h = hit;
      if (justSet.rest) later(isCalm() ? 0 : 60, () => h.stamp.hit(h.card));
      else uxSfx('toggle', { step: 0 });
    }
    justSet = null;
  };

  function heroCard(s: P1State, st: Staff, motion: boolean) {
    const f = K.fatigueOf(st);
    const band = K.fatigueBand(st) as Band;
    const load = K.fatigueLoad(s, st);
    const hot = restHot(!!st.resting, f, K.FATIGUE.show);
    const from = prevF.get(st.hero);
    prevF.set(st.hero, f);
    const meter = uxMeter(motion ? 0 : (from ?? f), band === 'fresh' ? 'good' : band === 'ok' ? 'cyan' : '');
    meter.el.classList.add(`is-${band}`);
    const stamp = uxpStamp(t('休憩中', 'Resting'), { kind: 'good' });
    if (st.resting) stamp.show();
    const effect = st.resting
      ? t(`休憩中（士気 ${Math.round(K.moraleOf(st))}）`, `Resting (morale ${Math.round(K.moraleOf(st))})`)
      : load > 0
        ? t(`速さ ×${K.fatigueMul(s, st).toFixed(2)}・士気の目標 ${Math.round(K.fatigueMorale(s, st))}（士気 ${Math.round(K.moraleOf(st))}）`, `Speed ×${K.fatigueMul(s, st).toFixed(2)}, morale target ${Math.round(K.fatigueMorale(s, st))} (morale ${Math.round(K.moraleOf(st))})`)
        : t(`響きなし（士気 ${Math.round(K.moraleOf(st))}）`, `No penalty (morale ${Math.round(K.moraleOf(st))})`);
    const label = st.resting ? t('休憩をやめる', 'Stop resting') : t('休ませる', 'Rest');
    const key = uxKey([hot ? uxLamp('bad', true, true) : kIcon(st.resting ? 'play' : 'moon', lite), el('b', label)], () => {
      const rest = !st.resting;
      K.setRest(s, st.hero, rest);
      justSet = { hero: st.hero, rest };
      K.after(ctx);
    }, { ico: null, cls: `uxk-ga-rest${hot ? ' is-hot2' : ''}`, attrs: { 'data-ux-quiet': '', 'aria-label': `${label} ${K.heroName(st.hero)}` } });
    const card = el(
      `div.uxp-card.has-right.uxk-ga-card${load > 0 && !st.resting ? '.is-load' : ''}${st.resting ? '.is-rest' : ''}`,
      { 'data-hero': String(st.hero) },
      el('span.uxp-card-pic', uxpFace(K.heroIcon(st.hero, 64), { win: 56 })),
      el(
        'span.uxp-card-body',
        el('span.uxp-card-name', el('b', K.heroName(st.hero)), el('span.uxk-ga-band', uxLamp(BAND_LAMP[band], true, band === 'worn'), uxTape(t(`${pct(f)}・${BAND_NAME[band]()}`, `${pct(f)} · ${BAND_NAME[band]()}`), band === 'worn' ? '' : band === 'tired' ? 'amber' : 'dark')), stamp.el),
        el('span.uxp-card-desc', el(`span.uxk-ga-eff${load > 0 && !st.resting ? '.is-bad' : ''}`, effect)),
        el('span.uxp-card-foot', el('span.uxk-ga-meter', meter.el, el('span.ux-num', pct(f)))),
      ),
      el('span.uxp-card-right', key),
    );
    if (!motion && from != null && from !== f) requestAnimationFrame(() => meter.set(f));
    return { card, stamp, meter: { m: meter, v: f } };
  }
}
