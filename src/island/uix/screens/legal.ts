/**
 * 段 UIX3h：法務（M&A・契約・特許・争い）。方向 C「管制卓」。入のときだけ（docs/ISLAND_UIX.md「画面：法務」）。
 * 出す中身・計算・押す先は今の画面（p1/legalui.ts の openLegalMA・dealCard・openContract・openPatents・openSuits）と同じ。
 * 本体の関数は束（H.legal を L で）から使う。
 *
 * - どの画面も：Epic の町でなければ「Epic の町で」の紙。下に貼りつく帯に、ほかの法務の画面とパネルへのキー
 * - M&A：話の札（段のランプ：打診 → 調査 → 交渉 → 成立・「あと N 日」の札・公開の数字／調査の結果の札（見えない所は錠）・条項のキー・
 *   3 段の提示の札（受ける見込みの計器・足りないときは「あと N G」）・取り下げ）・町の他社の札（打診する・打診できない理由）・買った会社
 * - 契約：契約中（あと N か月の札と計器・途中でやめる）／期間を選ぶキー・条項のキー・結ぶ（主のキー → 「締結」が打たれる）・M&A の条項のしくみ・予告
 * - 特許：復刻品の札（未出願／審査中 あと N 日／特許 あと N か月／切れている の札）と出願・貸す・訴える・更新
 * - 争い：裁判の札（相手と額・進みの計器・勝ちの見込みの計器と内訳・和解）・これまでの裁判・理解度・予告
 */
import { t } from '../../../i18n';
import { el, type Kid } from '../dom';
import { uxKey, uxLamp, uxMeter } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpCard, uxpGap, uxpPaper, uxpRow, uxpSeg, uxpStamp } from '../sparts';
import { H } from './h-deps';
import { enter, hIcon, ink, keepOpen, keyLabel, lite, liveDraw, sect, tape, hEmpty } from './h-kit';
import type { Ctx } from '../../p1/screens';
import type { Clauses, Deal, OfferLevel, Supply } from '../../p1/legal';
import type { P1State } from '../../p1/model';
import type { LegalHooks } from '../../p1/legalui';

const L = () => H.legal;
// ---------------------------------------------------------------- DOM なしの芯（テストから読む）
export const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 受ける・勝ちの見込みの組（色だけにしない：% と言葉を添える） */
export const oddsTone = (v: number, hi = 0.6, mid = 0.35): 'good' | 'amber' | 'bad' => (v >= hi ? 'good' : v >= mid ? 'amber' : 'bad');
/** 話の段（打診・調査・交渉・成立）のどこまで済んだか：done・now・''（今の画面と同じ決め方） */
export function dealSteps(stage: Deal['stage'], dd: boolean): ('done' | 'now' | '')[] {
  const order: Deal['stage'][] = ['offer', 'dd', 'nego', 'signed'];
  const at = stage === 'talk' ? 1 : order.indexOf(stage);
  return [0, 1, 2, 3].map((k) => (k < at || (k === 1 && dd) ? 'done' : k === at ? 'now' : ''));
}
export type LegalKey = 'ma' | 'contract' | 'patent' | 'suit';
export const LEGAL_ICO: Record<LegalKey, string> = { ma: 'office', contract: 'seal', patent: 'shield', suit: 'scales' };

const rname = (rid: string) => L().rivalDef(rid)?.name ?? rid;
const pname = (key: string) => L().PRODUCT[key]?.name ?? key;
const STAGE_NAME: Record<Deal['stage'], () => string> = {
  offer: () => t('① 打診（返事待ち）', '① Approach (awaiting reply)'),
  talk: () => t('② 調査・③ 交渉', '② Diligence · ③ Negotiation'),
  dd: () => t('② 調査中', '② Diligence in progress'),
  nego: () => t('③ 提示の返事待ち', '③ Awaiting answer'),
  signed: () => t('⑤ 成立（次の月の締めで店が移る）', '⑤ Signed (stores transfer at the next close)'),
};
const LEVEL_NAME: Record<OfferLevel, () => string> = { low: () => t('安く', 'Low'), mid: () => t('ふつう', 'Fair'), high: () => t('高く', 'High') };
const CLAUSE_NAME: Record<keyof Clauses, () => string> = {
  split: () => t('支払いの分割', 'Installments'),
  staff: () => t('従業員の引き継ぎ', 'Keep the staff'),
  noCompete: () => t('競業避止', 'Non-compete'),
};
const CLAUSE_NOTE: Record<keyof Clauses, () => string> = {
  split: () => t(`${L().LEGAL.ma.split.months} 回に分けて払う（合わせて +${pct(L().LEGAL.ma.split.extra)}）・受ける見込み ${Math.round(L().LEGAL.ma.clause * 100)}%`, `Pay in ${L().LEGAL.ma.split.months} parts (+${pct(L().LEGAL.ma.split.extra)} total); acceptance ${Math.round(L().LEGAL.ma.clause * 100)}%`),
  staff: () => t(`店員ごと引き継ぐ：すぐ開く・引き継ぐ商売 ${pct(L().LEGAL.ma.keep.yes)}（無ければ ${L().LEGAL.ma.noStaffDays} 日休業・${pct(L().LEGAL.ma.keep.no)}）・受ける見込み +${Math.round(L().LEGAL.ma.staff * 100)}%`, `Keep the clerks: opens at once, keeps ${pct(L().LEGAL.ma.keep.yes)} of the business (else ${L().LEGAL.ma.noStaffDays} days closed, ${pct(L().LEGAL.ma.keep.no)}); acceptance +${Math.round(L().LEGAL.ma.staff * 100)}%`),
  noCompete: () => t(`相手のオーナーがこの町で新しい店を出さない（無ければ ${L().LEGAL.ma.returnAfter} か月ほどで 1 軒戻ってくる）・受ける見込み ${Math.round(L().LEGAL.ma.clause * 100)}%`, `The owner won’t reopen in this town (otherwise one store returns in about ${L().LEGAL.ma.returnAfter} months); acceptance ${Math.round(L().LEGAL.ma.clause * 100)}%`),
};
/** 交渉で選んでいる条項（画面を描き直しても残す。今と同じ） */
const picked: Record<number, Clauses> = {};
const supplyPick: { months: number; c: Supply['clauses'] } = { months: 6, c: { noPenalty: true } };
/** いま打った札（描き直したあと打つ） */
let justDid: string | null = null;

// ---------------------------------------------------------------- 共通
/** ほかのランクの町：中身の代わりの紙 */
function notHere(s: P1State): HTMLElement | null {
  if (L().legalHere(s)) return null;
  return uxpPaper(
    { plain: true, cls: 'uxh-lg-soon' },
    el('p.uxh-it', hIcon('scales', ink), el('b', t('法務の遊びは Epic の町で', 'Legal play happens in Epic towns'))),
    el('p', t('M&A・仕入れの契約・特許・訴えは、Epic の町にいるときだけ（いまの町はランクが下なので出ません）。進んでいる裁判と特許の記録は下に。', 'M&A, supply contracts, patents and suits only happen while you are in an Epic town (this town ranks lower). Ongoing trials and patents are listed below.')),
  );
}
/** 画面の下：ほかの法務の画面・法務のパネル（今と同じく札の終わりに並べる。貼りつかせない：せまい画面で中身を隠さない） */
function footer(hooks: LegalHooks, here: LegalKey): HTMLElement {
  const go: [LegalKey, string, (() => void) | undefined][] = [
    ['ma', 'M&A', hooks.ma],
    ['contract', t('契約', 'Contracts'), hooks.contract],
    ['patent', t('特許', 'Patents'), hooks.patent],
    ['suit', t('争い', 'Disputes'), hooks.suit],
  ];
  const keys: Kid[] = [];
  for (const [k, name, f] of go) if (k !== here && f) keys.push(uxKey(keyLabel(LEGAL_ICO[k], name), () => f(), { kind: 'weak', ico: null, cls: `uxh-lg-go is-${k}` }));
  if (hooks.skills) keys.push(uxKey(keyLabel('star4', t('法務のパネル', 'Legal panels')), () => hooks.skills!(), { kind: 'weak', ico: null }));
  return el('div.uxh-lgnav.isl-legal-nav', keys);
}
/** 奥義と掛け合わせ（予告）：錠の札（今の masteryCard と同じ中身） */
function mastery(lines: string[], cross?: string): HTMLElement {
  const all = cross ? [...lines, cross] : lines;
  return el('section.uxh-sec.uxh-soon', sect(t('奥義と掛け合わせ（予告）', 'Masteries & cross panels (preview)'), 'lock', { kind: 'dark' }), el('div.uxh-soon-list', all.map((x) => el('p.uxh-soon-x', hIcon('lock', { ...lite, color: '#4a5486' }), el('span', x)))));
}
/** 条項のキー（入り切り：ランプと「入」「切」。色だけにしない） */
function clauseKey(name: string, note: string, on: boolean, fn: () => void): HTMLButtonElement {
  return uxKey(el('span.uxh-cl', uxLamp('good', on), el('span.uxh-cl-b', el('b', name), el('span.uxh-dim', note)), el('span.uxh-cl-s', on ? t('入', 'On') : t('切', 'Off'))), () => {
    uxSfx('toggle', { step: on ? 0 : 2 });
    fn();
  }, { ico: null, cls: `uxh-clause isl-ma-clause${on ? ' is-on' : ''}`, attrs: { 'aria-pressed': String(on), 'data-ux-quiet': '' } });
}
/** 見込みの札（% と計器と言葉） */
function odds(label: string, v: number, hi = 0.6, mid = 0.35): HTMLElement {
  const tone = oddsTone(v, hi, mid);
  const m = uxMeter(v, tone === 'good' ? 'good' : '');
  m.el.classList.add(`is-${tone}`);
  return el(`span.uxh-odds.is-${tone}`, el('span.uxh-odds-t', el('span', label), el('b.ux-num', pct(v))), m.el);
}
/** 打つ札（描き直したあと） */
function stampIf(key: string, box: HTMLElement, label: string) {
  if (justDid !== key) return;
  justDid = null;
  const st = uxpStamp(label, { kind: 'amber' });
  box.append(st.el);
  requestAnimationFrame(() => st.hit(box));
}
const act = (ctx: Ctx, key: string | null, fn: () => void) => () => {
  fn();
  justDid = key;
  H.after(ctx);
};

// ================================================================= M&A
export function openLegalMAUx(ctx: Ctx, hooks: LegalHooks = {}, focusRid?: string) {
  keepOpen(ctx, t('M&A（他社の買収）', 'M&A (acquisitions)'), (c, body) => {
    const root = el('div.uxh-lg');
    body.append(root);
    return liveDraw(root, (anim) => {
      const s = c.s();
      const nh = notHere(s);
      if (nh) {
        root.replaceChildren(el('div.uxh-page', nh, footer(hooks, 'ma')));
        return;
      }
      const LL = L();
      const M = s.area?.ma;
      const out: HTMLElement[] = [];
      out.push(
        el(
          'section.uxh-sec',
          sect(t('伸びしろのある他社を見抜いて、買い取る', 'Spot a rival with upside, and buy it'), 'office'),
          el('p.uxh-note', t(`打診 → 調査 → 値段の交渉と条項 → 成立。成立すると、次の月の締めで相手の店が自社の店になり（建物・棚・売れ筋）、相手のエクステ以外の売上を引き継ぎます。町の 1 位は売らない。買えるのは町の他社の半分（${LL.maMax(s)} 社）まで。`, `Approach → diligence → price & clauses → signed. At the next close the rival’s stores become yours (buildings, shelves, best-sellers) and you keep its non-extension sales. The town’s #1 won’t sell; you can buy up to half the rivals (${LL.maMax(s)}).`)),
        ),
      );
      const d = LL.dealOf(s);
      if (d) out.push(dealCard(c, s, d));
      // 町の他社
      const top = LL.topRival(s);
      const rows = s.rivals.map((r) => ({ r, sales: LL.rivalSales(s, r) })).sort((a, b) => b.sales - a.sales);
      const list = el('div.uxp-list.isl-ma-list', { 'data-focus': 'ma-list' });
      for (const { r, sales } of rows) {
        const lock = LL.maLock(s, r.id);
        const tags: Kid[] = [];
        if (r.id === top) tags.push(tape(t('町の 1 位', '#1 in town'), 'dark'));
        if (r.gone && M?.bought.some((y) => y.rid === r.id)) tags.push(tape(t('買収済み', 'Acquired'), 'good'));
        const card = uxpCard({
          pic: hIcon('shop', { ...lite, scale: 3 }),
          name: el('span.uxh-name', el('b', rname(r.id)), tags),
          desc: r.gone ? '—' : t(`月 ${H.money(sales)}・${LL.storesOf(s, r.id).length} 軒`, `${H.money(sales)}/mo · ${LL.storesOf(s, r.id).length}`),
          foot: [r.gone ? null : el('span.uxh-dim', t(`目安 ${H.money(LL.guidePrice(s, r.id))}`, `guide ${H.money(LL.guidePrice(s, r.id))}`)), lock ? el(`span${lock === 'top' ? '.uxh-warn' : '.uxh-dim'}`, LL.MA_LOCK_TEXT[lock]()) : null],
          right: lock
            ? null
            : uxKey(keyLabel('mail', t('打診する', 'Approach')), act(c, `ma:${r.id}`, () => {
                const e = LL.startDeal(s, r.id);
                if (typeof e !== 'string') c.toast(t(`${rname(r.id)}に買収を打診した（返事は ${LL.LEGAL.ma.replyDays} 日後）`, `Approached ${rname(r.id)} (reply in ${LL.LEGAL.ma.replyDays} days)`));
              }), { ico: null, cls: 'uxh-ma-go' }),
          cls: `uxh-ma-row isl-ma-row${focusRid === r.id ? ' is-hot' : ''}`,
          attrs: { 'data-rival': r.id },
        });
        list.append(card);
      }
      out.push(el('section.uxh-sec', sect(t('町の他社', 'Rivals in town'), 'shop', { kind: 'dark' }), list.childElementCount ? list : hEmpty(t('町に他社がいません。', 'No rivals in town.'), { ico: 'shop' })));
      if (M?.bought.length)
        out.push(
          el(
            'section.uxh-sec',
            sect(t('買った会社', 'Acquired companies'), 'folder', { kind: 'dark' }),
            uxpPaper({ plain: true }, M.bought.map((x) => uxpRow(rname(x.rid), H.money(x.price), { num: true, note: t(`店 ${x.stores} 軒・引き継いだ商売 月 ${H.money(x.base)}${x.noCompete ? '・競業避止あり' : ''}`, `${x.stores} store(s), carried business ${H.money(x.base)}/mo${x.noCompete ? ', non-compete' : ''}`) }))),
          ),
        );
      root.replaceChildren(el('div.uxh-page', out, footer(hooks, 'ma')));
      if (anim && !isCalm()) enter([...list.children] as HTMLElement[]);
      const hot = list.querySelector<HTMLElement>('.is-hot');
      if (anim && hot) requestAnimationFrame(() => hot.scrollIntoView({ block: 'center' }));
    });
  });
}

/** 話の札（いまの段に合わせて：調査・提示・条項・成立） */
function dealCard(ctx: Ctx, s: P1State, d: Deal): HTMLElement {
  const LL = L();
  const steps = dealSteps(d.stage, !!d.dd);
  const names = [t('打診', 'Approach'), t('調査', 'Diligence'), t('交渉', 'Negotiate'), t('成立', 'Signed')];
  const box = el(
    'section.uxh-sec.uxh-deal.isl-ma-deal',
    { 'data-focus': 'ma-deal' },
    sect(t(`${rname(d.rid)}との話`, `Talks with ${rname(d.rid)}`), 'office', { right: tape(STAGE_NAME[d.stage](), 'good') }),
    el('div.uxh-steps.isl-ma-steps', names.map((x, k) => el(`span.uxh-step${steps[k] ? '.is-' + steps[k] : ''}`, uxLamp(steps[k] === 'done' ? 'good' : '', !!steps[k], steps[k] === 'now'), el('span', x)))),
  );
  if (d.stage === 'offer' || d.stage === 'dd' || d.stage === 'nego') {
    box.append(el('p.uxh-days', tape(t(`あと ${Math.max(0, d.until - s.day)} 日`, `${Math.max(0, d.until - s.day)} days to go`), 'amber'), el('span.uxh-dim', t('町はそのまま動き続けます', 'the town keeps running'))));
    if (d.stage === 'nego' && d.offer) box.append(el('p', t(`提示：${LEVEL_NAME[d.offer.level]()}・${H.money(d.offer.price)}（受ける見込み ${pct(d.offer.chance)}）`, `Offer: ${LEVEL_NAME[d.offer.level]()} · ${H.money(d.offer.price)} (${pct(d.offer.chance)} odds)`)));
  }
  if (d.stage === 'signed') {
    box.append(el('p.is-good', t(`成立！ ${H.money(d.price ?? 0)}。次の月の締めで、${rname(d.rid)}の店（${LL.storesOf(s, d.rid).length} 軒）が自社の店になります。`, `Signed! ${H.money(d.price ?? 0)}. At the next close, ${rname(d.rid)}’s ${LL.storesOf(s, d.rid).length} store(s) become yours.`)));
    const st = uxpStamp(t('成立', 'Signed'), { kind: 'good' });
    st.show();
    box.append(st.el);
  }
  // 調査の結果（本当の数字。見えない項目は錠と理由）
  if (d.dd || d.stage === 'talk') {
    const f = LL.ddFacts(s, d);
    const see = LL.ddSees(s);
    const cell = (k: string, v: string | null, tone: '' | 'bad' | 'good' | 'locked' = '', why?: string) =>
      el(`div.uxh-fact.isl-ma-fact${tone ? '.is-' + tone : ''}`, el('span.uxh-fact-k', k), v != null ? el('b', v) : el('b.uxh-it', hIcon('lock', { ...lite, color: '#97a1cf' }), el('span', why ?? '???')));
    const grid = el(
      'div.uxh-facts.isl-ma-facts',
      { 'data-focus': 'ma-facts' },
      cell(t('月の売上', 'Monthly sales'), H.money(f.sales)),
      cell(t('利益（月）', 'Profit / mo'), d.dd ? t(`${H.money(f.profit)}（${pct(f.margin)}）`, `${H.money(f.profit)} (${pct(f.margin)})`) : null, d.dd ? '' : 'locked'),
      cell(t('店の数', 'Stores'), t(`${f.stores} 軒`, `${f.stores}`)),
      cell(t('伸び（取り分）', 'Growth (share)'), d.dd ? `×${f.ratio.toFixed(2)}` : null, d.dd ? (f.ratio < 0.8 ? 'bad' : '') : 'locked'),
      cell(t('売れ筋', 'Best-sellers'), d.dd && f.top ? f.top.map(pname).join(t('・', ', ')) || '—' : null, d.dd && f.top ? '' : 'locked', d.dd ? t('法務の理解度 3 から', 'Legal understanding 3+') : see.top ? '???' : t('理解度 3', 'Und. 3')),
      cell(t('隠れた借金', 'Hidden debt'), d.dd ? (f.debt ? H.money(f.debt) : t('なし', 'None')) : null, d.dd ? (f.debt ? 'bad' : 'good') : 'locked'),
      cell(t('訴えの種', 'Pending claims'), d.dd && f.seed != null ? (f.seed ? H.money(f.seed) : t('なし', 'None')) : null, d.dd && f.seed != null ? (f.seed ? 'bad' : 'good') : 'locked', d.dd ? t('調査の目利き（パネル）', 'Diligence eye (panel)') : '???'),
    );
    box.append(el('p.uxh-it', hIcon('search', lite), el('b', d.dd ? t('調査の結果（本当の数字）', 'Diligence results (true numbers)') : t('公開の数字（調べると本当の数字が見える）', 'Public numbers (diligence shows the truth)'))), grid);
    if (d.dd && f.debt) box.append(el('p.is-good', t('見つけた借金は、売り手が払って片づけます（調べなければ、成立のときにこちらが払う）。', 'Debt you found is settled by the seller (unchecked debt is yours at closing).')));
    if (d.dd && f.seed) box.append(el('p.is-good', t('見つけた訴えの種は、売り手が片づけます。', 'Pending claims you found are cleared by the seller.')));
  }
  if (d.stage === 'talk') {
    if (!d.dd) {
      const fee = LL.ddFee(s, d.rid);
      const gap = uxpGap(s.money, fee);
      box.append(
        el(
          'div.uxh-keys',
          uxKey(keyLabel('search', t(`調査する（調査料 ${H.money(fee)}・${LL.ddDays(s)} 日）`, `Run diligence (${H.money(fee)}, ${LL.ddDays(s)} days)`)), () => {
            if (s.money < fee) return gap.nudge();
            if (LL.startDD(s, d.id) == null) ctx.toast(t(`${rname(d.rid)}の調査を始めた（${LL.ddDays(s)} 日）`, `Diligence on ${rname(d.rid)} started (${LL.ddDays(s)} days)`));
            H.after(ctx);
          }, { ico: null, cls: 'uxh-dd' }),
        ),
        gap.el,
      );
    }
    // 値段の交渉：3 段の提示と、受ける見込み（％）。条項（法務の力で通せる数まで）
    const c = (picked[d.id] ??= { staff: true });
    const slots = LL.clauseSlots(s);
    const nego = el('div.uxh-nego.isl-ma-nego', { 'data-focus': 'ma-nego' }, el('p.uxh-it', hIcon('voice', lite), el('b', t(`値段の交渉（目安 ${H.money(LL.guidePrice(s, d.rid))}＝月の売上の ${LL.maMonths(s, d.rid).toFixed(1)} か月ぶん）`, `Negotiate (guide ${H.money(LL.guidePrice(s, d.rid))} = ${LL.maMonths(s, d.rid).toFixed(1)} months of sales)`))));
    const cl = el('div.uxh-clauses.isl-ma-clauses', { 'data-focus': 'ma-clauses' }, el('p.uxh-dim', t(`④ 契約の条項（通せるのは ${slots} つまで。いま ${LL.clauseCount(c)}）`, `④ Clauses (up to ${slots}; now ${LL.clauseCount(c)})`)));
    for (const k of ['staff', 'noCompete', 'split'] as (keyof Clauses)[]) {
      const on = !!c[k];
      cl.append(
        clauseKey(CLAUSE_NAME[k](), CLAUSE_NOTE[k](), on, () => {
          if (!on && LL.clauseCount(c) >= slots) {
            ctx.toast(t(`通せる条項は ${slots} つまで（法務の理解度 ${LL.LEGAL.clauses.at}・契約の雛形で増える）`, `Up to ${slots} clauses (more at understanding ${LL.LEGAL.clauses.at} or with Contract templates)`));
            return;
          }
          c[k] = !on;
          H.after(ctx);
        }),
      );
    }
    nego.append(cl);
    const offers = el('div.uxh-offers.isl-ma-offers');
    for (const lv of ['low', 'mid', 'high'] as OfferLevel[]) {
      const lock = LL.offerLock(s, d, lv, c);
      const ch = LL.offerChance(s, d.rid, lv, c);
      const first = LL.firstPay(s, d.rid, lv, c);
      const gap = uxpGap(s.money, first);
      const foot: Kid[] = [odds(t('受ける見込み', 'Odds'), ch)];
      if (c.split) foot.push(el('span.uxh-dim', t(`いま ${H.money(first)}`, `now ${H.money(first)}`)));
      if (lock === 'wait') foot.push(el('span.uxh-warn', t(`断られた（あと ${Math.max(0, (d.refused?.until ?? 0) - s.day)} 日は同じか安い提示ができない）`, `Refused (${Math.max(0, (d.refused?.until ?? 0) - s.day)} days before the same or lower)`)));
      if (lock === 'money') foot.push(gap.el);
      const key = uxKey(keyLabel('mail', t('提示する', 'Offer')), () => {
        if (lock === 'money') return gap.nudge();
        const e = LL.sendOffer(s, d.id, lv, c);
        if (e == null) ctx.toast(t(`${rname(d.rid)}に提示した（返事は ${LL.LEGAL.ma.negoDays} 日後）`, `Offer sent to ${rname(d.rid)} (answer in ${LL.LEGAL.ma.negoDays} days)`));
        justDid = 'offer';
        H.after(ctx);
      }, { kind: lv === 'mid' && !lock ? 'main' : '', ico: null, disabled: lock === 'wait' || (!!lock && lock !== 'money'), cls: 'uxh-offer-go' });
      offers.append(uxpCard({ name: el('span.uxh-name', el('b', LEVEL_NAME[lv]()), el('b.ux-num.uxh-amber', H.money(LL.totalPrice(s, d.rid, lv, c)))), foot, right: key, cls: `uxh-offer isl-ma-offer${lv === 'mid' ? ' is-on' : ''}` }));
    }
    nego.append(offers);
    nego.append(el('p.uxh-note', t(`見込みは企業の格・法務の理解度・M&A 部門（パネル）・相手の状態（弱っていると上がる・2 位は下がる）と条項で決まります。断られたら ${LL.LEGAL.ma.wait} 日待つか、条件を上げよう。`, `Odds depend on your standing, legal understanding, the M&A department panel, the rival’s state (weak: up; #2: down) and clauses. If refused, wait ${LL.LEGAL.ma.wait} days or raise your offer.`)));
    if (!d.dd) nego.append(el('p.uxh-warn', t('調べずに買うと、隠れた借金は成立のときにこちらが払い、訴えの種はあとで訴えになります。', 'Skip diligence and you pay any hidden debt at closing; pending claims turn into suits later.')));
    box.append(nego);
  }
  if (d.stage !== 'signed') box.append(el('div.uxh-keys', uxKey(keyLabel('close', t('話を取り下げる', 'Call off the talks')), act(ctx, null, () => L().cancelDeal(s, d.id)), { kind: 'danger', ico: null, cls: 'uxh-ma-cancel' })));
  stampIf('offer', box, t('提示済', 'Sent'));
  return box;
}

// ================================================================= 契約
export function openContractUx(ctx: Ctx, hooks: LegalHooks = {}) {
  keepOpen(ctx, t('契約', 'Contracts'), (c, body) => {
    const root = el('div.uxh-lg');
    body.append(root);
    return liveDraw(root, () => {
      const s = c.s();
      const LL = L();
      const out: HTMLElement[] = [];
      const nh = notHere(s);
      if (nh) out.push(nh);
      const cur = s.legal?.supply;
      const box = el(
        'section.uxh-sec.uxh-supply.isl-lg-supply',
        { 'data-focus': 'lg-supply' },
        sect(t('仕入れの契約（卸問屋）', 'Supply contract (wholesaler)'), 'seal'),
        el('p.uxh-note', t('期間を決めて卸問屋と契約すると、Epic の町の素材が安くなる（長いほど安い）。途中でやめると違約金を訴えられる（上限あり）。', 'Sign with the wholesaler for a term and materials in Epic towns get cheaper (longer = cheaper). Quit early and they sue for a penalty (capped).')),
      );
      if (cur && s.day < cur.end) {
        const m = uxMeter(1 - (cur.end - s.day) / (cur.months * 30), 'good');
        const pen = LL.supplyPenalty(s);
        box.append(
          el('div.uxh-active', tape(t(`あと ${Math.ceil((cur.end - s.day) / 30)} か月`, `${Math.ceil((cur.end - s.day) / 30)} months left`), 'amber'), el('b.is-good', t(`契約中：${cur.months} か月・素材 −${pct(cur.cut)}${cur.clauses.noPenalty ? '・違約金なし' : ''}${cur.clauses.excl ? '・独占' : ''}`, `Active: ${cur.months} months, materials −${pct(cur.cut)}${cur.clauses.noPenalty ? ', no penalty' : ''}${cur.clauses.excl ? ', exclusive' : ''}`))),
          m.el,
          el(
            'div.uxh-keys',
            uxKey(keyLabel('close', pen > 0 ? t(`途中でやめる（違約金 ${H.money(pen)} を訴えられる）`, `Quit early (sued for a ${H.money(pen)} penalty)`) : t('途中でやめる（違約金なし）', 'Quit early (no penalty)')), act(c, null, () => {
              const v = LL.cancelSupply(s);
              c.toast(v ? t(`契約をやめた。卸問屋が違約金 ${H.money(v)} を訴えてきた（争いの画面）`, `Contract ended. The wholesaler is suing for ${H.money(v)} (Disputes)`) : t('契約をやめた（違約金なし）', 'Contract ended (no penalty)'));
            }), { kind: pen > 0 ? 'danger' : '', ico: null, cls: 'uxh-sup-quit' }),
          ),
        );
        stampIf('sign', box, t('締結', 'Signed'));
      } else if (LL.legalHere(s)) {
        if (cur) box.append(el('p.uxh-warn', t('前の契約は切れています。結び直そう。', 'The last contract has ended. Sign again.')));
        const seg = uxpSeg(
          LL.LEGAL.supply.terms.map((m) => ({ value: m, label: t(`${m} か月・−${pct(LL.cutOf(m, supplyPick.c.excl))}`, `${m} mo · −${pct(LL.cutOf(m, supplyPick.c.excl))}`) })),
          supplyPick.months,
          (v) => {
            supplyPick.months = v;
            H.after(c);
          },
          { label: t('期間', 'Term'), cls: 'uxh-terms isl-ma-offers' },
        );
        box.append(el('p.uxh-dim', t('期間', 'Term')), seg.el);
        const slots = LL.clauseSlots(s);
        const cl = el('div.uxh-clauses.isl-ma-clauses', el('p.uxh-dim', t(`条項（通せるのは ${slots} つまで）`, `Clauses (up to ${slots})`)));
        const items: [keyof Supply['clauses'], string, string][] = [
          ['noPenalty', t('違約金なし', 'No penalty'), t('途中でやめても違約金を払わない（訴えられない）', 'Quit any time without a penalty (no suit)')],
          ['excl', t('独占', 'Exclusive'), t(`この卸問屋だけから買う：素材 さらに −${pct(LL.LEGAL.supply.excl)}・違約金 ×${LL.LEGAL.supply.exclPen}`, `Buy only from this wholesaler: materials another −${pct(LL.LEGAL.supply.excl)}; penalty ×${LL.LEGAL.supply.exclPen}`)],
        ];
        for (const [k, name, note] of items) {
          const on = !!supplyPick.c[k];
          cl.append(
            clauseKey(name, note, on, () => {
              const n = (supplyPick.c.noPenalty ? 1 : 0) + (supplyPick.c.excl ? 1 : 0);
              if (!on && n >= slots) {
                c.toast(t(`通せる条項は ${slots} つまで`, `Up to ${slots} clauses`));
                return;
              }
              supplyPick.c[k] = !on;
              H.after(c);
            }),
          );
        }
        box.append(cl);
        const lock = LL.supplyLock(s, supplyPick.months, supplyPick.c);
        const main = uxKey(keyLabel('seal', t(`${supplyPick.months} か月の契約を結ぶ（素材 −${pct(LL.cutOf(supplyPick.months, supplyPick.c.excl))}）`, `Sign for ${supplyPick.months} months (materials −${pct(LL.cutOf(supplyPick.months, supplyPick.c.excl))})`), true), act(c, 'sign', () => {
          if (LL.signSupply(s, supplyPick.months, supplyPick.c) == null) c.toast(t('仕入れの契約を結んだ。Epic の町の素材が安くなった', 'Supply contract signed. Materials in Epic towns are cheaper'));
        }), { kind: 'main', ico: null, disabled: !!lock, cls: 'uxh-sup-sign' });
        box.append(el('div.uxh-keys', main));
      }
      out.push(box);
      out.push(
        el(
          'section.uxh-sec',
          sect(t('M&A の契約の条項', 'M&A clauses'), 'office', { kind: 'dark' }),
          el('p.uxh-note', t(`通せる条項：いま ${LL.clauseSlots(s)} つ（はじめ ${LL.LEGAL.clauses.base}・法務の理解度 ${LL.LEGAL.clauses.at} で +1・契約の雛形で +1）`, `Clauses you can push: ${LL.clauseSlots(s)} now (start ${LL.LEGAL.clauses.base}; +1 at understanding ${LL.LEGAL.clauses.at}; +1 with Contract templates)`)),
          uxpPaper({ plain: true }, (['staff', 'noCompete', 'split'] as (keyof Clauses)[]).map((k) => el('p', el('b', CLAUSE_NAME[k]()), t(`：${CLAUSE_NOTE[k]()}`, `: ${CLAUSE_NOTE[k]()}`)))),
        ),
      );
      out.push(mastery([], LL.CROSS_SALES_LEGAL()));
      root.replaceChildren(el('div.uxh-page', out, footer(hooks, 'contract')));
    });
  });
}

// ================================================================= 特許
export function openPatentsUx(ctx: Ctx, hooks: LegalHooks = {}) {
  keepOpen(ctx, t('特許', 'Patents'), (c, body) => {
    const root = el('div.uxh-lg');
    body.append(root);
    return liveDraw(root, (anim) => {
      const s = c.s();
      const LL = L();
      const out: HTMLElement[] = [];
      const nh = notHere(s);
      if (nh) out.push(nh);
      out.push(
        el(
          'section.uxh-sec',
          sect(t('復刻品を特許で守る', 'Protect revivals with patents'), 'shield'),
          el('p.uxh-note', t(`出願料 ${H.money(LL.LEGAL.patent.fee)}・審査 ${LL.examDays(s)} 日。特許の間（${Math.round(LL.patentDays(s) / 30)} か月）は Epic の町の他社が真似しない。使用料で貸すと真似を許し、他社がその商品を売った額の ${pct(LL.LEGAL.patent.royalty)} が毎月入る。`, `Filing ${H.money(LL.LEGAL.patent.fee)}, exam ${LL.examDays(s)} days. While patented (${Math.round(LL.patentDays(s) / 30)} months) Epic-town rivals don’t copy it. License it and they may copy, paying you ${pct(LL.LEGAL.patent.royalty)} of their sales each month.`)),
        ),
      );
      // 並べている・先月売れた復刻品を先に（今と同じ並び）
      const shelved = new Set(Object.values(s.shops).flatMap((sh) => sh.shelves.filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.split(':')[0])));
      const lastBy = s.reports[s.reports.length - 1]?.bySeries ?? {};
      const score = (k: string) => (LL.patentOf(s, k) ? 2e12 : 0) + (shelved.has(k) ? 1e12 : 0) + (lastBy[k] ?? 0);
      const keys = LL.patentable(s).sort((a, b) => score(b) - score(a));
      const list = el('div.uxp-list.uxh-patents.isl-lg-patents', { 'data-focus': 'lg-patents' });
      let firstFile = true;
      for (const k of keys) {
        const p = LL.patentOf(s, k);
        const lock = LL.patentLock(s, k);
        const tags: Kid[] = shelved.has(k) ? [tape(t('並べている', 'On shelves'), 'good')] : [];
        let state: HTMLElement;
        const right: Kid[] = [];
        if (!p) {
          state = tape(t('未出願', 'Not filed'), 'dark');
          right.push(
            uxKey(keyLabel('doc', t(`出願する（${H.money(LL.LEGAL.patent.fee)}）`, `File (${H.money(LL.LEGAL.patent.fee)})`), !lock && firstFile), act(c, `pat:${k}`, () => {
              if (LL.filePatent(s, k) == null) c.toast(t(`『${pname(k)}』を出願した（審査 ${LL.examDays(s)} 日）`, `Filed ${pname(k)} (exam ${LL.examDays(s)} days)`));
            }), { kind: !lock && firstFile ? 'main' : '', ico: null, disabled: !!lock, cls: 'uxh-pat-file' }),
          );
          if (!lock) firstFile = false;
        } else if (p.grant == null) state = tape(t(`審査中・あと ${Math.max(0, p.until - s.day)} 日`, `Under exam · ${Math.max(0, p.until - s.day)} days`), 'amber');
        else if (s.day < p.until) {
          state = tape(t(`特許・あと ${Math.ceil((p.until - s.day) / 30)} か月`, `Patented · ${Math.ceil((p.until - s.day) / 30)} mo`), 'good');
          right.push(uxKey(keyLabel('share', p.license ? t('貸すのをやめる', 'Stop licensing') : t(`使用料で貸す（${pct(LL.LEGAL.patent.royalty)}）`, `License (${pct(LL.LEGAL.patent.royalty)})`)), act(c, null, () => LL.setLicense(s, k, !p.license)), { kind: 'weak', ico: null }));
          for (const rid of LL.infringers(s, k))
            right.push(
              uxKey(keyLabel('scales', t(`${rname(rid)}を訴える（特許の侵害）`, `Sue ${rname(rid)} (infringement)`)), act(c, `pat:${k}`, () => {
                if (LL.sueInfringer(s, k, rid) == null) c.toast(t(`${rname(rid)}を訴えた（${LL.LEGAL.suit.months} か月の裁判）`, `Sued ${rname(rid)} (${LL.LEGAL.suit.months}-month trial)`));
              }), { kind: 'danger', ico: null }),
            );
        } else {
          state = tape(t('切れている', 'Expired'), '');
          right.push(
            uxKey(keyLabel('cycle', t(`更新する（${H.money(LL.LEGAL.patent.renew)}）`, `Renew (${H.money(LL.LEGAL.patent.renew)})`)), act(c, `pat:${k}`, () => {
              if (LL.filePatent(s, k) == null) c.toast(t(`『${pname(k)}』の特許を更新した`, `Renewed the patent on ${pname(k)}`));
            }), { ico: null, disabled: !!lock }),
          );
        }
        const desc = p && p.grant != null && s.day < p.until ? t(`${p.license ? '貸している・' : ''}止めた真似 ${p.stopped}`, `${p.license ? 'licensed · ' : ''}copies stopped ${p.stopped}`) : null;
        const card = uxpCard({ pic: hIcon('shield', { ...lite, scale: 3, color: p && p.grant != null && s.day < p.until ? '#36e08b' : '#97a1cf' }), name: el('span.uxh-name', el('b', pname(k)), tags), desc: el('span.uxh-pat-state', state, desc ? el('span.uxh-dim', desc) : null), right: right.length ? el('span.uxh-keys.is-col', right) : null, cls: 'uxh-pat isl-ma-row', attrs: { 'data-sku': k } });
        stampIf(`pat:${k}`, card, t('受付', 'Filed'));
        list.append(card);
      }
      out.push(el('section.uxh-sec', sect(t('特許にできる復刻品', 'Revivals you can patent'), 'list', { kind: 'dark' }), keys.length ? list : hEmpty(t('特許にできる復刻品はまだ無い（Rare・Epic の復刻品のレシピが開いたら）。', 'No revivals to patent yet (once Rare or Epic revival recipes open).'), { ico: 'shield' })));
      out.push(mastery([], LL.CROSS_RND_LEGAL()));
      root.replaceChildren(el('div.uxh-page', out, footer(hooks, 'patent')));
      if (anim && !isCalm()) enter([...list.children] as HTMLElement[]);
    });
  });
}

// ================================================================= 争い
export function openSuitsUx(ctx: Ctx, hooks: LegalHooks = {}) {
  keepOpen(ctx, t('争い', 'Disputes'), (c, body) => {
    const root = el('div.uxh-lg');
    body.append(root);
    return liveDraw(root, (anim) => {
      const s = c.s();
      const LL = L();
      const out: HTMLElement[] = [];
      out.push(
        el(
          'section.uxh-sec',
          sect(t('争い（訴えと裁判）', 'Disputes (suits and trials)'), 'scales'),
          el('p.uxh-note', t(`訴えは実際に起きたことからだけ（契約をやめた・調べずに買った・特許で真似を止めた・特許を侵された）。裁判は ${LL.LEGAL.suit.months} か月の勝負で、毎月少しずつ進む。和解すれば早く終わる（額の半分）。負けても払うのはお金だけ（${H.money(LL.LEGAL.suit.maxPay)} まで）。`, `Suits only come from real events (quitting a contract, buying unchecked, blocking copies with a patent, infringement). A trial runs ${LL.LEGAL.suit.months} months, advancing each month. Settling ends it fast (half the claim). Losing only costs money (up to ${H.money(LL.LEGAL.suit.maxPay)}).`)),
        ),
      );
      const open0 = LL.suitsOpen(s);
      const list = el('div.uxp-list.uxh-suits.isl-lg-suits', { 'data-focus': 'lg-suits' });
      for (const x of open0) {
        const ch = LL.suitChance(s, x);
        const p = LL.suitParts(s, x);
        const prog = uxMeter((x.months - x.left) / x.months);
        const card = el(
          `div.uxh-suit.isl-lg-suit.is-${x.side}`,
          el('div.uxh-suit-h', hIcon('scales', { ...lite, scale: 2 }), el('span.uxh-suit-n', el('b', L().SUIT_NAME[x.kind]()), el('span.uxh-dim', x.side === 'def' ? t(`${LL.byName(x.by)}から・請求 ${H.money(x.claim)}`, `From ${LL.byName(x.by)} · claim ${H.money(x.claim)}`) : t(`${LL.byName(x.by)}へ・賠償 ${H.money(x.claim)}`, `Against ${LL.byName(x.by)} · damages ${H.money(x.claim)}`))), tape(x.side === 'def' ? t('訴えられた', 'Defending') : t('訴えた', 'Suing'), x.side === 'def' ? '' : 'amber')),
          el('div.uxh-suit-p', el('span.uxh-dim', t(`進み ${x.months - x.left} / ${x.months} か月`, `${x.months - x.left} / ${x.months} months`)), prog.el),
          odds(t('勝ちの見込み', 'Win odds'), ch, 0.6, 0.4),
          el('p.uxh-dim', t(`内訳：はじめ ${pct(p.base)}・理解度 +${pct(p.lv)}・顧問弁護士 +${pct(p.counsel)}・証拠 +${pct(p.evidence)}・企業の格 +${pct(p.grade)}・担当の INT +${pct(p.hero)}`, `Base ${pct(p.base)}, understanding +${pct(p.lv)}, counsel +${pct(p.counsel)}, evidence +${pct(p.evidence)}, standing +${pct(p.grade)}, lead’s INT +${pct(p.hero)}`)),
          el(
            'div.uxh-keys',
            uxKey(keyLabel('share', x.side === 'def' ? t(`和解する（${H.money(LL.settleAmt(x))} 払う）`, `Settle (pay ${H.money(LL.settleAmt(x))})`) : t(`和解する（${H.money(LL.settleAmt(x))} 受け取る）`, `Settle (receive ${H.money(LL.settleAmt(x))})`)), act(c, 'settle', () => {
              if (LL.settle(s, x.id)) c.toast(t('和解した。裁判は終わり', 'Settled. The trial is over'));
            }), { ico: null, cls: 'uxh-settle' }),
          ),
        );
        list.append(card);
      }
      out.push(el('section.uxh-sec', sect(t(`進んでいる裁判（${open0.length}）`, `Trials in progress (${open0.length})`), 'hourglass', { kind: 'dark' }), open0.length ? list : hEmpty(t('いま進んでいる裁判は無い。', 'No trials in progress.'), { ico: 'scales' })));
      const done = (s.legal?.suits ?? []).filter((x) => x.status !== 'open').slice(-6).reverse();
      if (done.length) {
        const st = { won: t('勝ち', 'Won'), lost: t('負け', 'Lost'), settled: t('和解', 'Settled'), open: '' };
        const hist = uxpPaper({ plain: true, cls: 'uxh-suit-hist' });
        for (const x of done) hist.append(uxpRow(t(`${L().SUIT_NAME[x.kind]()}（${LL.byName(x.by)}）`, `${L().SUIT_NAME[x.kind]()} (${LL.byName(x.by)})`), st[x.status], { tone: x.status === 'won' ? 'good' : x.status === 'lost' ? 'bad' : '', note: [x.paid ? t(`払った ${H.money(x.paid)}`, `paid ${H.money(x.paid)}`) : '', x.got ? t(`受け取った ${H.money(x.got)}`, `received ${H.money(x.got)}`) : ''].filter(Boolean).join(t('・', ', ')) || undefined }));
        out.push(el('section.uxh-sec', sect(t('これまでの裁判', 'Past trials'), 'folder', { kind: 'dark' }), hist));
      }
      out.push(el('p.uxh-note', t(`法務の理解度 ${LL.legalLv(s)}（パネルと、契約・特許・M&A・裁判の経験。経験は ${LL.LEGAL.xp.max} まで）`, `Legal understanding ${LL.legalLv(s)} (panels plus experience from contracts, patents, M&A and trials; experience up to ${LL.LEGAL.xp.max})`)));
      out.push(mastery(LL.LEGAL_MASTERY()));
      root.replaceChildren(el('div.uxh-page', out, footer(hooks, 'suit')));
      if (anim && !isCalm()) enter([...list.children] as HTMLElement[]);
      if (justDid === 'settle') {
        justDid = null;
        uxSfx('confirm');
      }
    });
  });
}
