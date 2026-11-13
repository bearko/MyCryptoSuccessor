/**
 * 法務の画面（段 H2：Epic の町 ②。docs/ISLAND_PHASE1.md「Epic の町 ②：法務と M&A」）：
 * - 法務 → M&A：他社の一覧（売上・店の数・順位・打診できない理由）・話の札（打診 → 調査 → 値段の交渉（3 段の見込み％）＋条項 → 成立）・買った会社の記録
 * - 法務 → 契約：仕入れの契約（期間 3・6・12 か月と条項（違約金なし・独占））・途中でやめるときの違約金・M&A の条項のしくみ・営業 × 法務の予告
 * - 法務 → 特許：特許にできる復刻品（出願・審査・期間・使用料で貸す・更新）・特許を侵している他社を訴える・R&D × 法務の予告
 * - 法務 → 争い：裁判の札（相手・額・進み・勝ちの見込みと内訳・和解）・これまでの記録・奥義の予告
 * どの画面も Epic の町だけが中身（ほかのランクの町では「Epic の町で」の札）。プルダウン・数字入力は使わない（ボタンとカード）。
 */
import { t } from '../../i18n';
import { CROSS_RND_LEGAL, CROSS_SALES_LEGAL, LEGAL, LEGAL_MASTERY, PRODUCT, rivalDef } from './data';
import {
  MA_LOCK_TEXT,
  SUIT_NAME,
  byName,
  cancelDeal,
  cancelSupply,
  clauseCount,
  clauseSlots,
  cutOf,
  ddDays,
  ddFacts,
  ddFee,
  ddSees,
  dealOf,
  examDays,
  filePatent,
  firstPay,
  guidePrice,
  infringers,
  legalHere,
  legalLv,
  maLock,
  maMax,
  maMonths,
  offerChance,
  offerLock,
  openSuits as suitsOpen,
  patentDays,
  patentLock,
  patentOf,
  patentable,
  rivalSales,
  sendOffer,
  setLicense,
  settle,
  settleAmt,
  signSupply,
  startDD,
  startDeal,
  storesOf,
  sueInfringer,
  suitChance,
  suitParts,
  supplyLock,
  supplyPenalty,
  topRival,
  totalPrice,
  type Clauses,
  type Deal,
  type LegalReport,
  type OfferLevel,
  type Supply,
} from './legal';
import { masteryCard } from './acctui';
import { type P1State } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, h, money } from './ui';
import { uxh } from '../uix/screens/h-slots';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const rname = (rid: string) => rivalDef(rid)?.name ?? rid;
const pname = (key: string) => PRODUCT[key]?.name ?? key;
export interface LegalHooks {
  /** その部門のパネル（スキルツリーの法務の枝へ） */
  skills?: () => void;
  ma?: () => void;
  contract?: () => void;
  patent?: () => void;
  suit?: () => void;
}
/** ほかのランクの町では中身の代わりにこの札 */
function notHere(s: P1State): HTMLElement | null {
  if (legalHere(s)) return null;
  const box = h('div', 'isl-card2 isl-legal-soon');
  box.append(h('b', 'isl-gold', t('⚖ 法務の遊びは Epic の町で', '⚖ Legal play happens in Epic towns')), h('p', 'isl-dim', t('M&A・仕入れの契約・特許・訴えは、Epic の町にいるときだけ（いまの町はランクが下なので出ません）。進んでいる裁判と特許の記録は下に。', 'M&A, supply contracts, patents and suits only happen while you are in an Epic town (this town ranks lower). Ongoing trials and patents are listed below.')));
  return box;
}
/** 画面の下のボタン（ほかの法務の画面・パネル） */
function footer(hooks: LegalHooks, here: 'ma' | 'contract' | 'patent' | 'suit'): HTMLElement {
  const row = h('div', 'isl-row isl-legal-nav');
  const go: [typeof here, string, (() => void) | undefined][] = [
    ['ma', t('🤝 M&A', '🤝 M&A'), hooks.ma],
    ['contract', t('📜 契約', '📜 Contracts'), hooks.contract],
    ['patent', t('🛡 特許', '🛡 Patents'), hooks.patent],
    ['suit', t('⚖ 争い', '⚖ Disputes'), hooks.suit],
  ];
  for (const [k, name, f] of go) if (k !== here && f) row.append(btn(name, f));
  if (hooks.skills) row.append(btn(t('法務のパネル', 'Legal panels'), hooks.skills));
  return row;
}

// ---------------------------------------------------------------- M&A

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
  split: () => t(`${LEGAL.ma.split.months} 回に分けて払う（合わせて +${pct(LEGAL.ma.split.extra)}）・受ける見込み ${Math.round(LEGAL.ma.clause * 100)}%`, `Pay in ${LEGAL.ma.split.months} parts (+${pct(LEGAL.ma.split.extra)} total); acceptance ${Math.round(LEGAL.ma.clause * 100)}%`),
  staff: () => t(`店員ごと引き継ぐ：すぐ開く・引き継ぐ商売 ${pct(LEGAL.ma.keep.yes)}（無ければ ${LEGAL.ma.noStaffDays} 日休業・${pct(LEGAL.ma.keep.no)}）・受ける見込み +${Math.round(LEGAL.ma.staff * 100)}%`, `Keep the clerks: opens at once, keeps ${pct(LEGAL.ma.keep.yes)} of the business (else ${LEGAL.ma.noStaffDays} days closed, ${pct(LEGAL.ma.keep.no)}); acceptance +${Math.round(LEGAL.ma.staff * 100)}%`),
  noCompete: () => t(`相手のオーナーがこの町で新しい店を出さない（無ければ ${LEGAL.ma.returnAfter} か月ほどで 1 軒戻ってくる）・受ける見込み ${Math.round(LEGAL.ma.clause * 100)}%`, `The owner won’t reopen in this town (otherwise one store returns in about ${LEGAL.ma.returnAfter} months); acceptance ${Math.round(LEGAL.ma.clause * 100)}%`),
};
/** 交渉で選んでいる条項（画面を描き直しても残す） */
const picked: Record<number, Clauses> = {};

/** 話の札（いまの段に合わせて：調査・提示・条項・成立） */
function dealCard(ctx: Ctx, s: P1State, d: Deal): HTMLElement {
  const box = h('div', 'isl-card2 isl-ma-deal');
  box.dataset.focus = 'ma-deal';
  box.append(h('h3', '', t(`🤝 ${rname(d.rid)}との話`, `🤝 Talks with ${rname(d.rid)}`)), h('small', 'isl-tag is-good', STAGE_NAME[d.stage]()));
  const steps = h('div', 'isl-ma-steps');
  const order: Deal['stage'][] = ['offer', 'dd', 'nego', 'signed'];
  const at = d.stage === 'talk' ? 1 : order.indexOf(d.stage);
  [t('打診', 'Approach'), t('調査', 'Diligence'), t('交渉', 'Negotiate'), t('成立', 'Signed')].forEach((x, k) => steps.append(h('span', k < at || (k === 1 && d.dd) ? 'is-done' : k === at ? 'is-now' : '', x)));
  box.append(steps);
  if (d.stage === 'offer' || d.stage === 'dd' || d.stage === 'nego') {
    box.append(h('p', 'isl-dim', t(`あと ${Math.max(0, d.until - s.day)} 日（町はそのまま動き続けます）`, `${Math.max(0, d.until - s.day)} days to go (the town keeps running)`)));
    if (d.stage === 'nego' && d.offer) box.append(h('p', '', t(`提示：${LEVEL_NAME[d.offer.level]()}・${money(d.offer.price)}（受ける見込み ${pct(d.offer.chance)}）`, `Offer: ${LEVEL_NAME[d.offer.level]()} · ${money(d.offer.price)} (${pct(d.offer.chance)} odds)`)));
  }
  if (d.stage === 'signed') box.append(h('p', 'isl-good', t(`成立！ ${money(d.price ?? 0)}。次の月の締めで、${rname(d.rid)}の店（${storesOf(s, d.rid).length} 軒）が自社の店になります。`, `Signed! ${money(d.price ?? 0)}. At the next close, ${rname(d.rid)}’s ${storesOf(s, d.rid).length} store(s) become yours.`)));
  // 調査の結果（本当の数字。見えない項目は 🔒 と理由）
  if (d.dd || d.stage === 'talk') {
    const f = ddFacts(s, d);
    const grid = h('div', 'isl-ma-facts');
    grid.dataset.focus = 'ma-facts';
    const cell = (k: string, v: string, cls = '') => {
      const c = h('div', `isl-ma-fact ${cls}`);
      c.append(h('small', 'isl-dim', k), h('b', '', v));
      grid.append(c);
    };
    cell(t('月の売上', 'Monthly sales'), money(f.sales));
    cell(t('利益（月）', 'Profit / mo'), d.dd ? t(`${money(f.profit)}（${pct(f.margin)}）`, `${money(f.profit)} (${pct(f.margin)})`) : '???', d.dd ? '' : 'is-locked');
    cell(t('店の数', 'Stores'), t(`${f.stores} 軒`, `${f.stores}`));
    cell(t('伸び（取り分）', 'Growth (share)'), d.dd ? `×${f.ratio.toFixed(2)}` : '???', d.dd ? (f.ratio < 0.8 ? 'is-bad' : '') : 'is-locked');
    const see = ddSees(s);
    cell(t('売れ筋', 'Best-sellers'), d.dd ? (f.top ? f.top.map(pname).join(t('・', ', ')) || '—' : t('🔒 法務の理解度 3 から', '🔒 Legal understanding 3+')) : see.top ? '???' : t('🔒 理解度 3', '🔒 Und. 3'), d.dd && f.top ? '' : 'is-locked');
    cell(t('隠れた借金', 'Hidden debt'), d.dd ? (f.debt ? money(f.debt) : t('なし', 'None')) : '???', d.dd ? (f.debt ? 'is-bad' : 'is-good') : 'is-locked');
    cell(t('訴えの種', 'Pending claims'), d.dd ? (f.seed != null ? (f.seed ? money(f.seed) : t('なし', 'None')) : t('🔒 調査の目利き（パネル）', '🔒 Diligence eye (panel)')) : '???', d.dd && f.seed != null ? (f.seed ? 'is-bad' : 'is-good') : 'is-locked');
    box.append(h('h4', '', d.dd ? t('🔎 調査の結果（本当の数字）', '🔎 Diligence results (true numbers)') : t('🔎 公開の数字（調べると本当の数字が見える）', '🔎 Public numbers (diligence shows the truth)')), grid);
    if (d.dd && f.debt) box.append(h('small', 'isl-good', t('見つけた借金は、売り手が払って片づけます（調べなければ、成立のときにこちらが払う）。', 'Debt you found is settled by the seller (unchecked debt is yours at closing).')));
    if (d.dd && f.seed) box.append(h('small', 'isl-good', t('見つけた訴えの種は、売り手が片づけます。', 'Pending claims you found are cleared by the seller.')));
  }
  if (d.stage === 'talk') {
    const row = h('div', 'isl-row');
    if (!d.dd) {
      const fee = ddFee(s, d.rid);
      const b = btn(t(`🔎 調査する（調査料 ${money(fee)}・${ddDays(s)} 日）`, `🔎 Run diligence (${money(fee)}, ${ddDays(s)} days)`), () => {
        if (startDD(s, d.id) == null) ctx.toast(t(`🔎 ${rname(d.rid)}の調査を始めた（${ddDays(s)} 日）`, `🔎 Diligence on ${rname(d.rid)} started (${ddDays(s)} days)`));
        after(ctx);
      }, 'is-on');
      b.disabled = s.money < fee;
      row.append(b);
    }
    box.append(row);
    // 値段の交渉：3 段の提示と、受ける見込み（％）。条項（法務の力で通せる数まで）
    const nego = h('div', 'isl-ma-nego');
    nego.dataset.focus = 'ma-nego';
    const c = (picked[d.id] ??= { staff: true });
    const slots = clauseSlots(s);
    nego.append(h('h4', '', t(`💬 値段の交渉（目安 ${money(guidePrice(s, d.rid))}＝月の売上の ${maMonths(s, d.rid).toFixed(1)} か月ぶん）`, `💬 Negotiate (guide ${money(guidePrice(s, d.rid))} = ${maMonths(s, d.rid).toFixed(1)} months of sales)`)));
    // 条項
    const cl = h('div', 'isl-ma-clauses');
    cl.dataset.focus = 'ma-clauses';
    cl.append(h('small', 'isl-dim', t(`④ 契約の条項（通せるのは ${slots} つまで。いま ${clauseCount(c)}）`, `④ Clauses (up to ${slots}; now ${clauseCount(c)})`)));
    for (const k of ['staff', 'noCompete', 'split'] as (keyof Clauses)[]) {
      const on = !!c[k];
      const b = btn('', () => {
        if (!on && clauseCount(c) >= slots) {
          ctx.toast(t(`通せる条項は ${slots} つまで（法務の理解度 ${LEGAL.clauses.at}・契約の雛形で増える）`, `Up to ${slots} clauses (more at understanding ${LEGAL.clauses.at} or with Contract templates)`));
          return;
        }
        c[k] = !on;
        after(ctx);
      }, `isl-ma-clause ${on ? 'is-on' : ''}`);
      b.append(h('b', '', `${on ? '☑' : '☐'} ${CLAUSE_NAME[k]()}`), h('small', 'isl-dim', CLAUSE_NOTE[k]()));
      cl.append(b);
    }
    nego.append(cl);
    const offers = h('div', 'isl-ma-offers');
    for (const lv of ['low', 'mid', 'high'] as OfferLevel[]) {
      const lock = offerLock(s, d, lv, c);
      const ch = offerChance(s, d.rid, lv, c);
      const b = btn('', () => {
        const e = sendOffer(s, d.id, lv, c);
        if (e == null) ctx.toast(t(`💬 ${rname(d.rid)}に提示した（返事は ${LEGAL.ma.negoDays} 日後）`, `💬 Offer sent to ${rname(d.rid)} (answer in ${LEGAL.ma.negoDays} days)`));
        after(ctx);
      }, `isl-ma-offer ${lv === 'mid' ? 'is-on' : ''}`);
      b.append(h('b', '', LEVEL_NAME[lv]()), h('span', '', money(totalPrice(s, d.rid, lv, c))), h('small', ch >= 0.6 ? 'isl-good' : ch >= 0.35 ? 'isl-warn' : 'isl-bad', t(`受ける見込み ${pct(ch)}`, `${pct(ch)} odds`)));
      if (c.split) b.append(h('small', 'isl-dim', t(`いま ${money(firstPay(s, d.rid, lv, c))}`, `now ${money(firstPay(s, d.rid, lv, c))}`)));
      if (lock === 'wait') b.append(h('small', 'isl-bad', t(`断られた（あと ${Math.max(0, (d.refused?.until ?? 0) - s.day)} 日は同じか安い提示ができない）`, `Refused (${Math.max(0, (d.refused?.until ?? 0) - s.day)} days before the same or lower)`)));
      else if (lock === 'money') b.append(h('small', 'isl-bad', t(`あと ${money(firstPay(s, d.rid, lv, c) - s.money)}`, `${money(firstPay(s, d.rid, lv, c) - s.money)} short`)));
      b.disabled = !!lock;
      offers.append(b);
    }
    nego.append(offers);
    nego.append(h('small', 'isl-dim', t(`見込みは企業の格・法務の理解度・M&A 部門（パネル）・相手の状態（弱っていると上がる・2 位は下がる）と条項で決まります。断られたら ${LEGAL.ma.wait} 日待つか、条件を上げよう。`, `Odds depend on your standing, legal understanding, the M&A department panel, the rival’s state (weak: up; #2: down) and clauses. If refused, wait ${LEGAL.ma.wait} days or raise your offer.`)));
    if (!d.dd) nego.append(h('small', 'isl-warn', t('調べずに買うと、隠れた借金は成立のときにこちらが払い、訴えの種はあとで訴えになります。', 'Skip diligence and you pay any hidden debt at closing; pending claims turn into suits later.')));
    box.append(nego);
  }
  if (d.stage !== 'signed')
    box.append(
      btn(t('話を取り下げる', 'Call off the talks'), () => {
        cancelDeal(s, d.id);
        after(ctx);
      }),
    );
  return box;
}

/** 法務 → M&A（他社の一覧・話の札・買った会社） */
export function openLegalMA(ctx: Ctx, hooks: LegalHooks = {}, focusRid?: string) {
  // 段 UIX3h：新しい画面（入のときだけ。uix/screens/legal.ts）
  if (uxh.legalMA) return uxh.legalMA(ctx, hooks, focusRid);
  open(ctx, t('M&A（他社の買収）', 'M&A (acquisitions)'), (body) => {
    const s = ctx.s();
    const nh = notHere(s);
    if (nh) {
      body.append(nh, footer(hooks, 'ma'));
      return;
    }
    const M = s.area?.ma;
    const head = h('div', 'isl-card2');
    head.append(
      h('h3', '', t('🤝 伸びしろのある他社を見抜いて、買い取る', '🤝 Spot a rival with upside, and buy it')),
      h('p', 'isl-dim', t(`打診 → 調査 → 値段の交渉と条項 → 成立。成立すると、次の月の締めで相手の店が自社の店になり（建物・棚・売れ筋）、相手のエクステ以外の売上を引き継ぎます。町の 1 位は売らない。買えるのは町の他社の半分（${maMax(s)} 社）まで。`, `Approach → diligence → price & clauses → signed. At the next close the rival’s stores become yours (buildings, shelves, best-sellers) and you keep its non-extension sales. The town’s #1 won’t sell; you can buy up to half the rivals (${maMax(s)}).`)),
    );
    body.append(head);
    const d = dealOf(s);
    if (d) body.append(dealCard(ctx, s, d));
    // 他社の一覧
    const list = h('div', 'isl-card2 isl-ma-list');
    list.dataset.focus = 'ma-list';
    list.append(h('h3', '', t('🏢 町の他社', '🏢 Rivals in town')));
    const top = topRival(s);
    const rows = s.rivals.map((r) => ({ r, sales: rivalSales(s, r) })).sort((a, b) => b.sales - a.sales);
    for (const { r, sales } of rows) {
      const lock = maLock(s, r.id);
      const x = h('div', `isl-ma-row ${focusRid === r.id ? 'is-hot' : ''}`);
      const name = h('span', 'isl-ma-name');
      name.append(h('b', '', rname(r.id)));
      if (r.id === top) name.append(h('small', 'isl-tag is-bad', t('町の 1 位', '#1 in town')));
      if (r.gone && M?.bought.some((y) => y.rid === r.id)) name.append(h('small', 'isl-tag is-good', t('買収済み', 'Acquired')));
      x.append(name, h('span', '', r.gone ? '—' : t(`月 ${money(sales)}・${storesOf(s, r.id).length} 軒`, `${money(sales)}/mo · ${storesOf(s, r.id).length}`)));
      if (!r.gone) x.append(h('small', 'isl-dim', t(`目安 ${money(guidePrice(s, r.id))}`, `guide ${money(guidePrice(s, r.id))}`)));
      if (lock) x.append(h('small', lock === 'top' ? 'isl-bad' : 'isl-dim', MA_LOCK_TEXT[lock]()));
      else
        x.append(
          btn(t('打診する', 'Approach'), () => {
            const e = startDeal(s, r.id);
            if (typeof e !== 'string') ctx.toast(t(`🤝 ${rname(r.id)}に買収を打診した（返事は ${LEGAL.ma.replyDays} 日後）`, `🤝 Approached ${rname(r.id)} (reply in ${LEGAL.ma.replyDays} days)`));
            after(ctx);
          }, 'is-on'),
        );
      list.append(x);
    }
    body.append(list);
    // 買った会社
    if (M?.bought.length) {
      const b = h('div', 'isl-card2');
      b.append(h('h3', '', t('📁 買った会社', '📁 Acquired companies')));
      for (const x of M.bought) b.append(h('p', '', t(`${rname(x.rid)}：店 ${x.stores} 軒・${money(x.price)}・引き継いだ商売 月 ${money(x.base)}${x.noCompete ? '・競業避止あり' : ''}`, `${rname(x.rid)}: ${x.stores} store(s), ${money(x.price)}, carried business ${money(x.base)}/mo${x.noCompete ? ', non-compete' : ''}`)));
      body.append(b);
    }
    body.append(footer(hooks, 'ma'));
  });
}

// ---------------------------------------------------------------- 契約

const supplyPick: { months: number; c: Supply['clauses'] } = { months: 6, c: { noPenalty: true } };
/** 法務 → 契約（仕入れの契約） */
export function openContract(ctx: Ctx, hooks: LegalHooks = {}) {
  if (uxh.contract) return uxh.contract(ctx, hooks);
  open(ctx, t('契約', 'Contracts'), (body) => {
    const s = ctx.s();
    const nh = notHere(s);
    if (nh) body.append(nh);
    const L = s.legal;
    const box = h('div', 'isl-card2 isl-lg-supply');
    box.dataset.focus = 'lg-supply';
    box.append(h('h3', '', t('📦 仕入れの契約（卸問屋）', '📦 Supply contract (wholesaler)')), h('p', 'isl-dim', t('期間を決めて卸問屋と契約すると、Epic の町の素材が安くなる（長いほど安い）。途中でやめると違約金を訴えられる（上限あり）。', 'Sign with the wholesaler for a term and materials in Epic towns get cheaper (longer = cheaper). Quit early and they sue for a penalty (capped).')));
    const c = L?.supply;
    if (c && s.day < c.end) {
      box.append(h('p', 'isl-good', t(`契約中：${c.months} か月・素材 −${pct(c.cut)}・あと ${Math.ceil((c.end - s.day) / 30)} か月${c.clauses.noPenalty ? '・違約金なし' : ''}${c.clauses.excl ? '・独占' : ''}`, `Active: ${c.months} months, materials −${pct(c.cut)}, ${Math.ceil((c.end - s.day) / 30)} months left${c.clauses.noPenalty ? ', no penalty' : ''}${c.clauses.excl ? ', exclusive' : ''}`)), bar(1 - (c.end - s.day) / (c.months * 30), 'var(--isl-gold)'));
      const pen = supplyPenalty(s);
      box.append(
        btn(pen > 0 ? t(`途中でやめる（違約金 ${money(pen)} を訴えられる）`, `Quit early (sued for a ${money(pen)} penalty)`) : t('途中でやめる（違約金なし）', 'Quit early (no penalty)'), () => {
          const v = cancelSupply(s);
          ctx.toast(v ? t(`📜 契約をやめた。卸問屋が違約金 ${money(v)} を訴えてきた（争いの画面）`, `📜 Contract ended. The wholesaler is suing for ${money(v)} (Disputes)`) : t('📜 契約をやめた（違約金なし）', '📜 Contract ended (no penalty)'));
          after(ctx);
        }, pen > 0 ? 'is-danger' : ''),
      );
    } else if (legalHere(s)) {
      if (c) box.append(h('small', 'isl-warn', t('前の契約は切れています。結び直そう。', 'The last contract has ended. Sign again.')));
      const terms = h('div', 'isl-ma-offers');
      for (const m of LEGAL.supply.terms) {
        const b = btn('', () => {
          supplyPick.months = m;
          after(ctx);
        }, `isl-ma-offer ${supplyPick.months === m ? 'is-on' : ''}`);
        b.append(h('b', '', t(`${m} か月`, `${m} months`)), h('span', '', t(`素材 −${pct(cutOf(m, supplyPick.c.excl))}`, `materials −${pct(cutOf(m, supplyPick.c.excl))}`)));
        terms.append(b);
      }
      box.append(h('small', 'isl-dim', t('期間', 'Term')), terms);
      const slots = clauseSlots(s);
      const cl = h('div', 'isl-ma-clauses');
      cl.append(h('small', 'isl-dim', t(`条項（通せるのは ${slots} つまで）`, `Clauses (up to ${slots})`)));
      const items: [keyof Supply['clauses'], string, string][] = [
        ['noPenalty', t('違約金なし', 'No penalty'), t('途中でやめても違約金を払わない（訴えられない）', 'Quit any time without a penalty (no suit)')],
        ['excl', t('独占', 'Exclusive'), t(`この卸問屋だけから買う：素材 さらに −${pct(LEGAL.supply.excl)}・違約金 ×${LEGAL.supply.exclPen}`, `Buy only from this wholesaler: materials another −${pct(LEGAL.supply.excl)}; penalty ×${LEGAL.supply.exclPen}`)],
      ];
      for (const [k, name, note] of items) {
        const on = !!supplyPick.c[k];
        const b = btn('', () => {
          const n = (supplyPick.c.noPenalty ? 1 : 0) + (supplyPick.c.excl ? 1 : 0);
          if (!on && n >= slots) {
            ctx.toast(t(`通せる条項は ${slots} つまで`, `Up to ${slots} clauses`));
            return;
          }
          supplyPick.c[k] = !on;
          after(ctx);
        }, `isl-ma-clause ${on ? 'is-on' : ''}`);
        b.append(h('b', '', `${on ? '☑' : '☐'} ${name}`), h('small', 'isl-dim', note));
        cl.append(b);
      }
      box.append(cl);
      const lock = supplyLock(s, supplyPick.months, supplyPick.c);
      const sb = btn(t(`📜 ${supplyPick.months} か月の契約を結ぶ（素材 −${pct(cutOf(supplyPick.months, supplyPick.c.excl))}）`, `📜 Sign for ${supplyPick.months} months (materials −${pct(cutOf(supplyPick.months, supplyPick.c.excl))})`), () => {
        if (signSupply(s, supplyPick.months, supplyPick.c) == null) ctx.toast(t('📜 仕入れの契約を結んだ。Epic の町の素材が安くなった', '📜 Supply contract signed. Materials in Epic towns are cheaper'));
        after(ctx);
      }, 'is-on');
      sb.disabled = !!lock;
      box.append(sb);
    }
    body.append(box);
    // M&A の契約の条項
    const ma = h('div', 'isl-card2');
    ma.append(h('h3', '', t('🤝 M&A の契約の条項', '🤝 M&A clauses')), h('p', 'isl-dim', t(`通せる条項：いま ${clauseSlots(s)} つ（はじめ ${LEGAL.clauses.base}・法務の理解度 ${LEGAL.clauses.at} で +1・契約の雛形で +1）`, `Clauses you can push: ${clauseSlots(s)} now (start ${LEGAL.clauses.base}; +1 at understanding ${LEGAL.clauses.at}; +1 with Contract templates)`)));
    for (const k of ['staff', 'noCompete', 'split'] as (keyof Clauses)[]) ma.append(h('p', '', t(`${CLAUSE_NAME[k]()}：${CLAUSE_NOTE[k]()}`, `${CLAUSE_NAME[k]()}: ${CLAUSE_NOTE[k]()}`)));
    body.append(ma);
    body.append(masteryCard([], CROSS_SALES_LEGAL()));
    body.append(footer(hooks, 'contract'));
  });
}

// ---------------------------------------------------------------- 特許

/** 法務 → 特許 */
export function openPatents(ctx: Ctx, hooks: LegalHooks = {}) {
  if (uxh.patents) return uxh.patents(ctx, hooks);
  open(ctx, t('特許', 'Patents'), (body) => {
    const s = ctx.s();
    const nh = notHere(s);
    if (nh) body.append(nh);
    const head = h('div', 'isl-card2');
    head.append(
      h('h3', '', t('🛡 復刻品を特許で守る', '🛡 Protect revivals with patents')),
      h('p', 'isl-dim', t(`出願料 ${money(LEGAL.patent.fee)}・審査 ${examDays(s)} 日。特許の間（${Math.round(patentDays(s) / 30)} か月）は Epic の町の他社が真似しない。使用料で貸すと真似を許し、他社がその商品を売った額の ${pct(LEGAL.patent.royalty)} が毎月入る。`, `Filing ${money(LEGAL.patent.fee)}, exam ${examDays(s)} days. While patented (${Math.round(patentDays(s) / 30)} months) Epic-town rivals don’t copy it. License it and they may copy, paying you ${pct(LEGAL.patent.royalty)} of their sales each month.`)),
    );
    body.append(head);
    // 並べている・先月売れた復刻品を先に（特許にする意味のあるものから）
    const shelved = new Set(Object.values(s.shops).flatMap((sh) => sh.shelves.filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.split(':')[0])));
    const lastBy = s.reports[s.reports.length - 1]?.bySeries ?? {};
    const score = (k: string) => (patentOf(s, k) ? 2e12 : 0) + (shelved.has(k) ? 1e12 : 0) + (lastBy[k] ?? 0);
    const keys = patentable(s).sort((a, b) => score(b) - score(a));
    const box = h('div', 'isl-card2 isl-lg-patents');
    box.dataset.focus = 'lg-patents';
    if (!keys.length) box.append(h('p', 'isl-dim', t('特許にできる復刻品はまだ無い（Rare・Epic の復刻品のレシピが開いたら）。', 'No revivals to patent yet (once Rare or Epic revival recipes open).')));
    for (const k of keys) {
      const p = patentOf(s, k);
      const x = h('div', 'isl-ma-row');
      const name = h('span', 'isl-ma-name');
      name.append(h('b', '', pname(k)));
      if (shelved.has(k)) name.append(h('small', 'isl-tag is-good', t('並べている', 'On shelves')));
      x.append(name);
      const lock = patentLock(s, k);
      if (!p) {
        x.append(h('small', 'isl-dim', t('未出願', 'Not filed')));
        const b = btn(t(`出願する（${money(LEGAL.patent.fee)}）`, `File (${money(LEGAL.patent.fee)})`), () => {
          if (filePatent(s, k) == null) ctx.toast(t(`🛡 『${pname(k)}』を出願した（審査 ${examDays(s)} 日）`, `🛡 Filed ${pname(k)} (exam ${examDays(s)} days)`));
          after(ctx);
        }, 'is-on');
        b.disabled = !!lock;
        x.append(b);
      } else if (p.grant == null) x.append(h('small', 'isl-warn', t(`審査中（あと ${Math.max(0, p.until - s.day)} 日）`, `Under exam (${Math.max(0, p.until - s.day)} days)`)));
      else if (s.day < p.until) {
        x.append(h('small', 'isl-good', t(`特許（あと ${Math.ceil((p.until - s.day) / 30)} か月）${p.license ? '・貸している' : ''}・止めた真似 ${p.stopped}`, `Patented (${Math.ceil((p.until - s.day) / 30)} mo)${p.license ? ' · licensed' : ''} · copies stopped ${p.stopped}`)));
        x.append(
          btn(p.license ? t('貸すのをやめる', 'Stop licensing') : t(`使用料で貸す（${pct(LEGAL.patent.royalty)}）`, `License (${pct(LEGAL.patent.royalty)})`), () => {
            setLicense(s, k, !p.license);
            after(ctx);
          }),
        );
        for (const rid of infringers(s, k))
          x.append(
            btn(t(`${rname(rid)}を訴える（特許の侵害）`, `Sue ${rname(rid)} (infringement)`), () => {
              if (sueInfringer(s, k, rid) == null) ctx.toast(t(`⚖ ${rname(rid)}を訴えた（${LEGAL.suit.months} か月の裁判）`, `⚖ Sued ${rname(rid)} (${LEGAL.suit.months}-month trial)`));
              after(ctx);
            }, 'is-danger'),
          );
      } else {
        x.append(h('small', 'isl-bad', t('切れている', 'Expired')));
        const b = btn(t(`更新する（${money(LEGAL.patent.renew)}）`, `Renew (${money(LEGAL.patent.renew)})`), () => {
          if (filePatent(s, k) == null) ctx.toast(t(`🛡 『${pname(k)}』の特許を更新した`, `🛡 Renewed the patent on ${pname(k)}`));
          after(ctx);
        }, 'is-on');
        b.disabled = !!lock;
        x.append(b);
      }
      box.append(x);
    }
    body.append(box);
    body.append(masteryCard([], CROSS_RND_LEGAL()));
    body.append(footer(hooks, 'patent'));
  });
}

// ---------------------------------------------------------------- 争い

/** 法務 → 争い（裁判の札・和解・記録） */
export function openSuits(ctx: Ctx, hooks: LegalHooks = {}) {
  if (uxh.suits) return uxh.suits(ctx, hooks);
  open(ctx, t('争い', 'Disputes'), (body) => {
    const s = ctx.s();
    const head = h('div', 'isl-card2');
    head.append(
      h('h3', '', t('⚖ 争い（訴えと裁判）', '⚖ Disputes (suits and trials)')),
      h('p', 'isl-dim', t(`訴えは実際に起きたことからだけ（契約をやめた・調べずに買った・特許で真似を止めた・特許を侵された）。裁判は ${LEGAL.suit.months} か月の勝負で、毎月少しずつ進む。和解すれば早く終わる（額の半分）。負けても払うのはお金だけ（${money(LEGAL.suit.maxPay)} まで）。`, `Suits only come from real events (quitting a contract, buying unchecked, blocking copies with a patent, infringement). A trial runs ${LEGAL.suit.months} months, advancing each month. Settling ends it fast (half the claim). Losing only costs money (up to ${money(LEGAL.suit.maxPay)}).`)),
    );
    body.append(head);
    const open0 = suitsOpen(s);
    const box = h('div', 'isl-card2 isl-lg-suits');
    box.dataset.focus = 'lg-suits';
    if (!open0.length) box.append(h('p', 'isl-dim', t('いま進んでいる裁判は無い。', 'No trials in progress.')));
    for (const x of open0) {
      const c = h('div', 'isl-lg-suit');
      const ch = suitChance(s, x);
      const p = suitParts(s, x);
      c.append(h('b', '', `${SUIT_NAME[x.kind]()}`), h('small', 'isl-dim', x.side === 'def' ? t(`${byName(x.by)}から・請求 ${money(x.claim)}`, `From ${byName(x.by)} · claim ${money(x.claim)}`) : t(`${byName(x.by)}へ・賠償 ${money(x.claim)}`, `Against ${byName(x.by)} · damages ${money(x.claim)}`)));
      const prog = h('div', 'isl-row');
      prog.append(h('small', 'isl-dim', t(`進み ${x.months - x.left} / ${x.months} か月`, `${x.months - x.left} / ${x.months} months`)), bar((x.months - x.left) / x.months, 'var(--isl-gold)'));
      c.append(prog, h('b', ch >= 0.6 ? 'isl-good' : ch >= 0.4 ? 'isl-warn' : 'isl-bad', t(`勝ちの見込み ${pct(ch)}`, `Win odds ${pct(ch)}`)));
      c.append(h('small', 'isl-dim', t(`内訳：はじめ ${pct(p.base)}・理解度 +${pct(p.lv)}・顧問弁護士 +${pct(p.counsel)}・証拠 +${pct(p.evidence)}・企業の格 +${pct(p.grade)}・担当の INT +${pct(p.hero)}`, `Base ${pct(p.base)}, understanding +${pct(p.lv)}, counsel +${pct(p.counsel)}, evidence +${pct(p.evidence)}, standing +${pct(p.grade)}, lead’s INT +${pct(p.hero)}`)));
      c.append(
        btn(x.side === 'def' ? t(`和解する（${money(settleAmt(x))} 払う）`, `Settle (pay ${money(settleAmt(x))})`) : t(`和解する（${money(settleAmt(x))} 受け取る）`, `Settle (receive ${money(settleAmt(x))})`), () => {
          if (settle(s, x.id)) ctx.toast(t('🤝 和解した。裁判は終わり', '🤝 Settled. The trial is over'));
          after(ctx);
        }),
      );
      box.append(c);
    }
    body.append(box);
    const done = (s.legal?.suits ?? []).filter((x) => x.status !== 'open').slice(-6).reverse();
    if (done.length) {
      const hist = h('div', 'isl-card2');
      hist.append(h('h3', '', t('📁 これまでの裁判', '📁 Past trials')));
      const st = { won: t('勝ち', 'Won'), lost: t('負け', 'Lost'), settled: t('和解', 'Settled'), open: '' };
      for (const x of done) hist.append(h('p', x.status === 'won' ? 'isl-good' : x.status === 'lost' ? 'isl-bad' : '', t(`${SUIT_NAME[x.kind]()}（${byName(x.by)}）：${st[x.status]}${x.paid ? `・払った ${money(x.paid)}` : ''}${x.got ? `・受け取った ${money(x.got)}` : ''}`, `${SUIT_NAME[x.kind]()} (${byName(x.by)}): ${st[x.status]}${x.paid ? `, paid ${money(x.paid)}` : ''}${x.got ? `, received ${money(x.got)}` : ''}`)));
      body.append(hist);
    }
    body.append(h('p', 'isl-dim', t(`法務の理解度 ${legalLv(s)}（パネルと、契約・特許・M&A・裁判の経験。経験は ${LEGAL.xp.max} まで）`, `Legal understanding ${legalLv(s)} (panels plus experience from contracts, patents, M&A and trials; experience up to ${LEGAL.xp.max})`)));
    body.append(masteryCard(LEGAL_MASTERY()));
    body.append(footer(hooks, 'suit'));
  });
}

// ---------------------------------------------------------------- 月次報告の 1 行・トースト

/** 月次報告の「⚖ 法務」の 1 行（[PC の文, スマホの短い文]） */
export function legalReportText(r: { legal?: LegalReport }): [string, string] | null {
  const x = r.legal;
  if (!x) return null;
  const parts: string[] = [];
  const short: string[] = [];
  if (x.closed.length) {
    parts.push(t('買収 ', 'Acquired ') + x.closed.map((c) => t(`${rname(c.rid)}（${c.stores} 軒）`, `${rname(c.rid)} (${c.stores})`)).join(t('・', ', ')));
    short.push(t(`買収 ${x.closed.length}`, `${x.closed.length} acq.`));
  }
  if (x.acq) {
    parts.push(t(`引き継いだ商売 ${money(x.acq)}`, `Carried business ${money(x.acq)}`));
    short.push(t(`引き継ぎ ${money(x.acq)}`, `carried ${money(x.acq)}`));
  }
  if (x.back.length) parts.push(t(`${x.back.map(rname).join('・')}が町に戻った`, `${x.back.map(rname).join(', ')} came back`));
  if (x.granted.length) parts.push(t(`特許 ${x.granted.map(pname).join('・')}`, `Patents: ${x.granted.map(pname).join(', ')}`));
  if (x.stopped) {
    parts.push(t(`止めた真似 ${x.stopped}`, `${x.stopped} copies stopped`));
    short.push(t(`真似を止めた ${x.stopped}`, `${x.stopped} blocked`));
  }
  if (x.royalty) parts.push(t(`使用料 ${money(x.royalty)}`, `Royalties ${money(x.royalty)}`));
  if (x.expired.length) parts.push(t(`切れた特許 ${x.expired.map(pname).join('・')}`, `Expired: ${x.expired.map(pname).join(', ')}`));
  if (x.newSuits || x.open || x.won || x.lost || x.settled) {
    parts.push(t(`裁判 ${x.open} 件（新しい訴え ${x.newSuits}・勝ち ${x.won}・負け ${x.lost}・和解 ${x.settled}）`, `Trials ${x.open} (new ${x.newSuits}, won ${x.won}, lost ${x.lost}, settled ${x.settled})`));
    short.push(t(`裁判 ${x.open}`, `${x.open} trials`));
  }
  if (x.saved) parts.push(t(`仕入れの契約 −${money(x.saved)}`, `Supply contract −${money(x.saved)}`));
  if (!parts.length) return null;
  return [parts.join(t('・', ' · ')), short.join(t('・', ' · ')) || parts[0]];
}
/** 1 日のお知らせ（打診の返事・調査の終わり・提示の返事・審査の終わり）のトーストの文 */
export function legalToasts(x: { deals: { rid: string; what: 'talk' | 'dd' | 'yes' | 'no' }[]; granted: string[] }): string[] {
  const out: string[] = [];
  for (const d of x.deals)
    out.push(
      d.what === 'talk'
        ? t(`🤝 ${rname(d.rid)}が買収の話を聞いてくれる。調査か、値段の交渉へ（法務 → M&A）`, `🤝 ${rname(d.rid)} will hear your offer. Investigate or negotiate (Legal → M&A)`)
        : d.what === 'dd'
          ? t(`🔎 ${rname(d.rid)}の調査が終わった。本当の数字が見える`, `🔎 Diligence on ${rname(d.rid)} is done. See the true numbers`)
          : d.what === 'yes'
            ? t(`🎉 ${rname(d.rid)}が買収を受けた！ 次の月の締めで店が自社に`, `🎉 ${rname(d.rid)} accepted! Its stores become yours at the next close`)
            : t(`🙅 ${rname(d.rid)}に断られた。${LEGAL.ma.wait} 日待つか、条件を上げよう`, `🙅 ${rname(d.rid)} said no. Wait ${LEGAL.ma.wait} days or raise your offer`),
    );
  for (const k of x.granted) out.push(t(`🛡 『${pname(k)}』が特許になった！ Epic の町の他社は真似できない`, `🛡 ${pname(k)} is patented! Epic-town rivals can’t copy it`));
  return out;
}
/** 打診のボタン（他社の店の吹き出し）：打診できない理由（null ならできる） */
export const maTileLock = (s: P1State, rid: string) => {
  const lock = maLock(s, rid);
  return lock ? MA_LOCK_TEXT[lock]() : null;
};
