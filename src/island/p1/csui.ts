/**
 * カスタマーサポートとマーケの画面（段 G。docs/ISLAND_PHASE1.md「カスタマーサポート」「マーケ（市場調査・広報・企業の格）」「炎上」）：
 * - カスタマーサポート → 問い合わせ：受け箱（中身・期限）と返事の選択（謝る・返金・代わりの品。満足度の見込みと費用）・炎上のおそれと炎上の札
 * - カスタマーサポート → 顧客満足度：いまの満足度・効き目（来店・ブランド力）・月ごとの推移・上がる下がるのしくみ・奥義と掛け合わせの予告
 * - マーケ → 市場の見通し：需要と他社の 1〜3 か月先・他社の売れ筋・宣伝の打ち時
 * - マーケ → 広報と企業の格：企業の格（いま・次の段・効き目）・良いニュースの発表・火消し・お詫びの告知・奥義と掛け合わせの予告
 */
import { t } from '../../i18n';
import { ADS, CROSS_HR_MKT, CROSS_MKT_CS, CS, CS_MASTERY, FLAME, GRADE, GRADE_NAME, MKT_MASTERY, PR, PRODUCT, REPLY_FIT, type ReplyKind } from './data';
import { KIND_NAME, REPLY_NAME, apologize, careMul, centerRate, csOf, csOn, daysLeft, expireDays, inquiryText, noticeCost, putCost, putLock, putOut, putPower, refundCost, repeatMul, replyGain, replyLock, reply, satOf, swapItem, visitMul, type Inquiry } from './cs';
import { PR_KIND_NAME, forecast, gradeArea, gradeBrand, gradeHire, gradeName, gradeNext, gradeOf, horizon, newsOf, prCost, prGain, prLock, prOn, prWait, publish } from './mkt';
import { masteryCard } from './acctui';
import { runAd, type P1State } from './model';
import { after, open, type Ctx } from './screens';
import { bar, btn, fmt, h, money, skuName } from './ui';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sg = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)}`;
export interface CsHooks {
  /** その部門のパネル（スキルツリーのその枝へ） */
  skills?: () => void;
  /** 顧客満足度・問い合わせ・広報の画面へ */
  sat?: () => void;
  inbox?: () => void;
  pr?: () => void;
}

/** 満足度の札の色 */
const satCls = (v: number) => (v >= 75 ? 'is-good' : v >= 45 ? '' : 'is-bad');

/** 炎上のおそれ・炎上中の札（受け箱・満足度・広報の画面の上。手を打つボタン付き） */
export function flameCard(ctx: Ctx, s: P1State, hooks: CsHooks = {}): HTMLElement | null {
  const C = s.cs;
  if (!C || (!C.warn && !C.flame)) return null;
  if (C.flame) {
    const F = C.flame;
    const box = h('div', 'isl-card2 isl-flame is-fire');
    box.dataset.focus = 'flame';
    box.append(h('h3', '', t('🔥 炎上中', '🔥 Backlash in progress')));
    box.append(h('p', '', F.cause === 'out' ? t('品切れが続いたことが、町じゅうのうわさになっています。', 'Word of repeated sell-outs is all over town.') : t('問い合わせを放っておいたことが、町じゅうのうわさになっています。', 'Word that you ignored customers is all over town.')));
    const row = h('div', 'isl-flame-heat');
    row.append(h('small', 'isl-dim', t('熱さ', 'Heat')), bar(F.heat, '#ff6a4a'), h('b', 'isl-bad', t(`来店 −${pct(FLAME.hit * F.heat)}`, `Visits −${pct(FLAME.hit * F.heat)}`)));
    box.append(row);
    box.append(h('small', 'isl-dim', t(`月の締めごとに熱さが ${pct(1 / FLAME.months)} ずつ下がり、${FLAME.months} か月でおさまります。下げたブランド力（−${F.lost}）は熱さに合わせて戻ります。合う返事 1 件で熱さ −${pct(FLAME.reply)}。`, `Heat drops ${pct(1 / FLAME.months)} each close and is gone in ${FLAME.months} months. The lost brand (−${F.lost}) returns as it cools. Each fitting reply cuts heat ${pct(FLAME.reply)}.`)));
    const lock = putLock(s);
    const b = btn(t(`📣 火消し（熱さ −${pct(putPower(s))}・${money(putCost(s))}）`, `📣 Damage control (heat −${pct(putPower(s))}, ${money(putCost(s))})`), () => {
      if (putOut(s) == null) ctx.toast(t('🧯 釈明と対策を発表した。炎上の熱さが下がった', '🧯 You announced an explanation and a fix. The heat is down'));
      after(ctx);
    }, lock ? '' : 'is-on');
    b.disabled = !!lock;
    box.append(b);
    if (lock === 'cool') box.append(h('small', 'isl-dim', t(`次の火消しまで あと ${Math.max(0, (F.cool ?? 0) - s.day)} 日`, `Next damage control in ${Math.max(0, (F.cool ?? 0) - s.day)} days`)));
    if (lock === 'money') box.append(h('small', 'isl-bad', t(`あと ${money(putCost(s) - s.money)}`, `${money(putCost(s) - s.money)} short`)));
    if (hooks.inbox) box.append(btn(t('問い合わせに返事をする', 'Answer inquiries'), () => hooks.inbox!()));
    return box;
  }
  const W = C.warn!;
  const box = h('div', `isl-card2 isl-flame ${W.done ? 'is-done' : 'is-warn'}`);
  box.dataset.focus = 'flame-warn';
  box.append(h('h3', '', W.done ? t('✅ 炎上のおそれ（手を打った）', '✅ Backlash risk (handled)') : t('⚠ 炎上のおそれ', '⚠ Backlash risk')));
  box.append(
    h(
      'p',
      '',
      W.cause === 'out'
        ? t(`先月は主力商品の品切れが ${FLAME.outDays} 日以上ありました。今月も続くと炎上します。`, `Your main product was sold out ${FLAME.outDays}+ days last month. If it happens again this month, a backlash follows.`)
        : t(`先月は期限切れの問い合わせが ${FLAME.ignored} 件以上ありました。今月も続くと炎上します。`, `${FLAME.ignored}+ inquiries expired last month. If it happens again this month, a backlash follows.`),
    ),
  );
  if (W.done) box.append(h('small', 'isl-good', t('お詫びの告知を出しました。この予告からは炎上しません。', 'You posted an apology. This warning will not turn into a backlash.')));
  else {
    box.append(h('small', 'isl-dim', W.cause === 'out' ? t('手の打ち方：今月の品切れを減らす（作る・運ぶ・品出しを増やす）か、お詫びの告知を出す。', 'Fix it: cut sell-outs this month (make, haul, shelve more) or post an apology.') : t('手の打ち方：受け箱の問い合わせに返事をするか、お詫びの告知を出す。', 'Fix it: answer the inquiries in your inbox or post an apology.')));
    const cost = noticeCost(s);
    const b = btn(t(`🙇 お詫びの告知（${money(cost)}）`, `🙇 Post an apology (${money(cost)})`), () => {
      if (apologize(s) == null) ctx.toast(t('🙇 お詫びの告知を出した。炎上のおそれがおさまった', '🙇 Apology posted. The backlash risk has passed'));
      after(ctx);
    }, 'is-on');
    b.disabled = s.money < cost;
    box.append(b);
  }
  return box;
}

/** 満足度の小さな札（受け箱の上） */
function satStrip(s: P1State, hooks: CsHooks): HTMLElement {
  const v = satOf(s);
  const box = h('div', 'isl-card2 isl-cs-sat');
  box.dataset.focus = 'cs-sat';
  const top = h('div', 'isl-row');
  top.append(h('small', 'isl-dim', t('顧客満足度', 'Satisfaction')), h('b', `isl-big ${satCls(v)}`, `${v}`), h('small', repeatMul(s) >= 1 ? 'isl-good' : 'isl-bad', t(`来店 ${sg((repeatMul(s) - 1) * 100)}%`, `Visits ${sg((repeatMul(s) - 1) * 100)}%`)));
  box.append(top, bar(v / 100, v >= 75 ? 'var(--isl-good)' : v >= 45 ? 'var(--isl-gold)' : '#ff6a4a'));
  if (hooks.sat) box.append(btn(t('満足度のくわしい画面', 'Satisfaction details'), () => hooks.sat!()));
  return box;
}

/** 返事のボタン（満足度の見込み・費用。合う返事は金の枠） */
function replyBtn(ctx: Ctx, s: P1State, q: Inquiry, r: ReplyKind): HTMLElement {
  const lock = replyLock(s, r);
  const gain = replyGain(s, q, r);
  const fit = REPLY_FIT[q.kind] === r;
  const cost = r === 'refund' ? money(refundCost(s)) : r === 'swap' ? (swapItem(s) ? t(`${skuName(swapItem(s)!)} ×${CS.swapUnits}`, `${skuName(swapItem(s)!)} ×${CS.swapUnits}`) : t('在庫なし', 'No stock')) : t('無料', 'Free');
  const b = btn('', () => {
    const e = reply(s, q.id, r);
    if (e == null) ctx.toast(fit ? t(`😊 お客さんが喜んでくれた（満足度 +${Math.round(gain)}）`, `😊 The customer is happy (satisfaction +${Math.round(gain)})`) : t(`🙂 返事をした（満足度 +${Math.round(gain)}）`, `🙂 Replied (satisfaction +${Math.round(gain)})`));
    after(ctx);
  }, `isl-cs-reply ${fit ? 'is-fit' : ''}`);
  b.append(h('b', '', REPLY_NAME[r]()), h('small', fit ? 'isl-good' : 'isl-dim', t(`満足度 +${Math.round(gain)}`, `Satisfaction +${Math.round(gain)}`)), h('small', lock ? 'isl-bad' : 'isl-dim', lock === 'money' ? t(`あと ${money(refundCost(s) - s.money)}`, `${money(refundCost(s) - s.money)} short`) : cost));
  b.disabled = !!lock;
  return b;
}

/** カスタマーサポート → 問い合わせ（受け箱と返事の選択） */
export function openInbox(ctx: Ctx, hooks: CsHooks = {}) {
  open(ctx, t('問い合わせ', 'Inquiries'), (body) => {
    const s = ctx.s();
    const C = csOf(s);
    const fc = flameCard(ctx, s, { ...hooks, inbox: undefined });
    if (fc) body.append(fc);
    body.append(satStrip(s, hooks));
    const box = h('div', 'isl-card2 isl-cs-inbox');
    box.dataset.focus = 'cs-inbox';
    box.append(h('h3', '', t(`📨 受け箱（${C.inbox.length} 件）`, `📨 Inbox (${C.inbox.length})`)));
    if (!csOn(s)) box.append(h('p', 'isl-dim', t('Common の町には問い合わせは来ません。Uncommon 以上の町で、月の締めに先月の様子（品切れ・閉まっていた日・値段）から届きます。', 'Common towns send no inquiries. In Uncommon+ towns they arrive at the monthly close, based on last month (sell-outs, closed days, prices).')));
    else if (!C.inbox.length) box.append(h('p', 'isl-dim', t('いまは問い合わせがありません。月の締めに、先月の様子（品切れ・閉まっていた日・値段）から届きます。', 'No inquiries right now. They arrive at the monthly close, based on last month (sell-outs, closed days, prices).')));
    for (const q of C.inbox) {
      const card = h('div', 'isl-cs-q');
      const head = h('div', 'isl-cs-qhead');
      const left = daysLeft(s, q);
      head.append(h('span', `isl-tag ${q.kind === 'closed' ? '' : 'is-bad'}`, KIND_NAME[q.kind]()), h('b', '', q.key ? PRODUCT[q.key]?.name ?? '' : t('お店', 'Shop')), h('small', left <= 4 ? 'isl-bad' : 'isl-dim', t(`期限 あと ${left} 日`, `${left} days left`)));
      card.append(head, h('p', 'isl-cs-text', inquiryText(q)));
      const row = h('div', 'isl-cs-replies');
      for (const r of ['sorry', 'refund', 'swap'] as ReplyKind[]) row.append(replyBtn(ctx, s, q, r));
      card.append(row);
      box.append(card);
    }
    body.append(box);
    // しくみ
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('返事のしかた', 'How replies work')));
    const ul = h('ul', 'isl-acct-list');
    for (const x of [
      t(`中身に合う返事（品切れ → 代わりの品・値段 → 返金・閉まっていた → 謝る）で満足度 +${CS.good}。合わない返事は +${CS.ok}。`, `A fitting reply (sold out → substitute, price → refund, closed → apology) gives +${CS.good}; others +${CS.ok}.`),
      t(`期限（${expireDays(s)} 日）が切れると満足度 −${Math.abs(CS.ignore)}。受け箱は ${CS.inboxMax} 件まで。`, `Expired inquiries (after ${expireDays(s)} days) cost ${Math.abs(CS.ignore)}. The inbox holds ${CS.inboxMax}.`),
      t(`返金は ${money(refundCost(s))}、代わりの品は在庫からいちばん安い商品を ${CS.swapUnits} 個。宣伝と同じ販促の費用です。`, `A refund costs ${money(refundCost(s))}; a substitute uses ${CS.swapUnits} of your cheapest stock. Both count as promotion costs.`),
      centerRate(s) > 0 ? t(`サポートセンターが、届いた問い合わせの ${pct(centerRate(s))} を自動で受けています（出来 ${pct(CS.center.q)}）。`, `The support center auto-handles ${pct(centerRate(s))} of new inquiries (${pct(CS.center.q)} quality).`) : t('サポートセンター（パネル）があると、問い合わせの一部を自動で受けます。', 'With a support center (panel), some inquiries are handled automatically.'),
    ])
      ul.append(h('li', '', x));
    how.append(ul);
    if (hooks.skills) how.append(btn(t('カスタマーサポートのパネル', 'Customer Support panels'), () => hooks.skills!()));
    body.append(how);
  });
}

/** カスタマーサポート → 顧客満足度 */
export function openSat(ctx: Ctx, hooks: CsHooks = {}) {
  open(ctx, t('顧客満足度', 'Customer satisfaction'), (body) => {
    const s = ctx.s();
    const v = satOf(s);
    const fc = flameCard(ctx, s, hooks);
    if (fc) body.append(fc);
    const top = h('div', 'isl-card2 isl-cs-head');
    top.dataset.focus = 'cs-sat';
    const big = h('div', 'isl-row');
    big.append(h('b', `isl-big ${satCls(v)}`, t(`顧客満足度 ${v}`, `Satisfaction ${v}`)), h('small', 'isl-dim', t(`はじめ ${CS.start}・0〜100`, `Start ${CS.start} · 0–100`)));
    top.append(big, bar(v / 100, v >= 75 ? 'var(--isl-good)' : v >= 45 ? 'var(--isl-gold)' : '#ff6a4a'));
    const rows = h('div', 'isl-books-tbl');
    const row = (k: string, val: string, cls = '') => {
      const x = h('div', `isl-books-row ${cls}`);
      x.append(h('span', '', k), h('b', '', val));
      rows.append(x);
    };
    row(t('来店（リピーター）', 'Visits (regulars)'), csOn(s) ? `${sg((repeatMul(s) - 1) * 100)}%` : t('Common の町では効かない', 'No effect in Common towns'), 'is-head');
    if (s.cs?.flame) row(t('　炎上', '  Backlash'), `${sg((visitMul(s) / repeatMul(s) - 1) * 100)}%`, 'is-sub');
    row(t('ブランド力（月の締め）', 'Brand (monthly close)'), v >= CS.brandHi ? '+1' : v <= CS.brandLo ? '−1' : '±0', 'is-sub');
    top.append(rows);
    // 月ごとの推移（月の締めの満足度）
    const hist = s.reports.filter((r) => r.cs).slice(-12);
    if (hist.length) {
      const ch = h('div', 'isl-cs-hist');
      for (const r of hist) {
        const col = h('div', 'isl-cs-col');
        const b = h('i', satCls(r.cs!.sat));
        b.style.height = `${Math.max(4, r.cs!.sat)}%`;
        col.title = t(`${r.month} か月目：満足度 ${r.cs!.sat}・問い合わせ ${r.cs!.got} 件・返事 ${r.cs!.answered} 件・期限切れ ${r.cs!.expired} 件`, `Month ${r.month}: satisfaction ${r.cs!.sat}, ${r.cs!.got} inquiries, ${r.cs!.answered} replies, ${r.cs!.expired} expired`);
        col.append(b, h('small', '', `${r.cs!.sat}`));
        ch.append(col);
      }
      top.append(h('small', 'isl-dim', t('月の締めの満足度（新しい月が右）', 'Satisfaction at each close (newest on the right)')), ch);
    }
    // 満足度の調査：来月の見込み
    if (s.skills.includes('cs_survey')) {
      const C = csOf(s);
      const n = C.inbox.length;
      const good = Math.min(100, Math.round(v + n * CS.good * careMul(s) + (CS.start - (v + n * CS.good * careMul(s))) * CS.drift));
      const bad = Math.max(0, Math.round(v + n * CS.ignore + (CS.start - (v + n * CS.ignore)) * CS.drift));
      top.append(h('p', 'isl-good', t(`📋 調査：受け箱の ${n} 件にすべて合う返事をすると、来月の締めでおよそ ${good}。放っておくと ${bad}。`, `📋 Survey: answering all ${n} inquiries well puts next close near ${good}; ignoring them, ${bad}.`)));
    }
    if (hooks.inbox) top.append(btn(t(`問い合わせ（${csOf(s).inbox.length} 件）`, `Inquiries (${csOf(s).inbox.length})`), () => hooks.inbox!(), 'is-on'));
    body.append(top);
    const how = h('div', 'isl-card2');
    how.append(h('h3', '', t('上がるとき・下がるとき', 'What moves it')));
    const ul = h('ul', 'isl-acct-list');
    for (const x of [
      t(`問い合わせに合う返事：+${CS.good}（合わない返事 +${CS.ok}）・サポートセンターが受けた：+${Math.round(CS.good * CS.center.q * 10) / 10}`, `Fitting reply: +${CS.good} (others +${CS.ok}) · handled by the support center: +${Math.round(CS.good * CS.center.q * 10) / 10}`),
      t(`期限切れ：−${Math.abs(CS.ignore)}／件。月の締めごとに、はじめの ${CS.start} へ ${pct(CS.drift)} ずつ戻る`, `Expired: −${Math.abs(CS.ignore)} each. Each close it drifts ${pct(CS.drift)} back toward ${CS.start}`),
      t(`効き目：Uncommon 以上の町の来店が 100 で +${pct(CS.up)}・0 で −${pct(CS.down)}（満足度の調査で ×${CS.survey}）。${CS.brandHi} 以上で月にブランド力 +1、${CS.brandLo} 以下で −1`, `Effect: visits in Uncommon+ towns +${pct(CS.up)} at 100, −${pct(CS.down)} at 0 (×${CS.survey} with the survey). Brand +1/month at ${CS.brandHi}+, −1 at ${CS.brandLo} or less`),
      t(`炎上：主力商品の品切れ ${FLAME.outDays} 日以上の月・期限切れ ${FLAME.ignored} 件以上の月が、手を打たずに 2 か月続くと起きる（1 か月目に予告）`, `Backlash: ${FLAME.outDays}+ sell-out days or ${FLAME.ignored}+ expired inquiries two months running, unless you act (warned after the first)`),
    ])
      ul.append(h('li', '', x));
    how.append(ul);
    const r = h('div', 'isl-row');
    if (hooks.skills) r.append(btn(t('カスタマーサポートのパネル', 'Customer Support panels'), () => hooks.skills!()));
    if (hooks.pr) r.append(btn(t('広報（火消し）', 'PR (damage control)'), () => hooks.pr!()));
    how.append(r);
    body.append(how);
    body.append(masteryCard(CS_MASTERY(), CROSS_MKT_CS()));
  });
}

/** マーケ → 市場の見通し */
export function openForecast(ctx: Ctx, hooks: { skills?: () => void; ads?: () => void } = {}) {
  open(ctx, t('市場の見通し', 'Market outlook'), (body) => {
    const s = ctx.s();
    const f = forecast(s);
    // 宣伝の打ち時
    const tip = h('div', 'isl-card2 isl-mk-hints');
    tip.dataset.focus = 'mk-hints';
    tip.append(h('h3', '', t('📣 宣伝の打ち時', '📣 When to advertise')));
    for (const x of f.hints) {
      const line = h('div', `isl-mk-hint ${x.kind === 'calm' ? '' : 'is-hot2'}`);
      line.append(h('span', '', x.text));
      const ad = x.ad ? ADS.find((a) => a.id === x.ad) : null;
      if (ad && x.kind !== 'copy' && (s.ads[ad.id] ?? 0) <= 0) {
        const b = btn(t(`${ad.name}を打つ（${money(ad.cost)}）`, `Run ${ad.name} (${money(ad.cost)})`), () => {
          if (runAd(s, ad.id) == null) ctx.toast(t(`📣 ${ad.name}を始めた`, `📣 Started ${ad.name}`));
          after(ctx);
        });
        b.disabled = s.money < ad.cost;
        line.append(b);
      }
      tip.append(line);
    }
    if (hooks.ads) tip.append(btn(t('宣伝広報を開く', 'Open Advertising'), () => hooks.ads!()));
    body.append(tip);
    // 需要と他社の先読み
    const box = h('div', 'isl-card2 isl-mk-fore');
    box.dataset.focus = 'mk-fore';
    box.append(h('h3', '', t(`📈 需要の見通し（${f.h} か月先まで）`, `📈 Demand outlook (${f.h} month${f.h > 1 ? 's' : ''} ahead)`)));
    box.append(h('small', 'isl-dim', t('いまの需要の伸び（月 +1.5%）と、他社が真似してくるまでの数えから読む見通しです。', 'Read from current demand growth (+1.5%/month) and how long until rivals copy you.')));
    const tbl = h('div', 'isl-mk-tbl');
    tbl.style.setProperty('--h', String(f.h + 1));
    const head = h('div', 'isl-mk-row is-head');
    head.append(h('span', '', t('商品', 'Product')), h('span', '', t('いま', 'Now')), ...Array.from({ length: f.h }, (_, k) => h('span', '', t(`${k + 1} か月後`, `+${k + 1} mo`))), h('span', '', t('他社', 'Rivals')));
    tbl.append(head);
    for (const r of f.rows.slice(0, 10)) {
      const x = h('div', `isl-mk-row ${r.mine ? 'is-mine' : ''}`);
      const name = h('span', 'isl-mk-name');
      name.append(h('b', '', r.name));
      if (r.mine) name.append(h('small', 'isl-tag is-good', t('自社', 'Ours')));
      x.append(name, ...r.demand.map((d) => h('span', '', fmt(d))));
      const rv = h('span', 'isl-mk-rv');
      rv.append(h('b', '', t(`${r.sellers} 社`, `${r.sellers}`)));
      if (r.copyIn != null) rv.append(h('small', r.copyIn <= 1 ? 'isl-bad' : 'isl-warn', t(`${r.copyIn} か月で真似されそう`, `copied in ~${r.copyIn} mo`)));
      // 段 H2：特許の間は真似されない（Epic の町）
      if (r.patent > 0) rv.append(h('small', 'isl-good', t(`🛡 特許で真似されない（あと ${r.patent} か月）`, `🛡 Patented: no copies (${r.patent} mo left)`)));
      if (r.topOf.length) rv.append(h('small', 'isl-dim', t(`${r.topOf.join('・')}の売れ筋`, `best-seller of ${r.topOf.join(', ')}`)));
      x.append(rv);
      tbl.append(x);
    }
    box.append(tbl);
    body.append(box);
    // 他社の売れ筋
    const rv = h('div', 'isl-card2');
    rv.append(h('h3', '', t('🏪 他社の売れ筋', '🏪 Rivals’ best-sellers')));
    if (!f.rivals.length) rv.append(h('p', 'isl-dim', t('「市場調査の部署」（パネル）で、他社ごとのいちばん売れている商品と先月の売上が見えます。', 'The Research desk (panel) shows each rival’s best-seller and last month’s sales.')));
    for (const r of f.rivals) {
      const x = h('div', 'isl-books-row');
      x.append(h('span', '', r.name), h('b', '', t(`${r.key ? PRODUCT[r.key]?.name ?? r.key : '—'}・${money(r.sales)}`, `${r.key ? PRODUCT[r.key]?.name ?? r.key : '—'} · ${money(r.sales)}`)));
      rv.append(x);
    }
    if (horizon(s) < 3) rv.append(h('small', 'isl-dim', horizon(s) === 1 ? t('見通せるのは 1 か月先まで。マーケのパネル「市場調査の部署」で 2 か月先・他社の売れ筋、「需要の読み」で 3 か月先・真似されるまでの予報。', 'You see 1 month ahead. Marketing panels: Research desk → 2 months and rivals’ best-sellers; Demand modeling → 3 months and copy forecasts.') : t('「需要の読み」（パネル）で 3 か月先と、他社が真似してくる時期の予報が見えます。', 'Demand modeling (panel) adds a 3rd month and copy forecasts.')));
    if (hooks.skills) rv.append(btn(t('マーケのパネル', 'Marketing panels'), () => hooks.skills!()));
    body.append(rv);
  });
}

/** マーケ → 広報と企業の格 */
export function openPr(ctx: Ctx, hooks: CsHooks = {}) {
  open(ctx, t('広報と企業の格', 'PR & standing'), (body) => {
    const s = ctx.s();
    // 企業の格
    const g = gradeOf(s);
    const nx = gradeNext(s);
    const top = h('div', 'isl-card2 isl-mk-grade');
    top.dataset.focus = 'mk-grade';
    const big = h('div', 'isl-row');
    big.append(h('small', 'isl-dim', t('企業の格', 'Company standing')), h('b', 'isl-big isl-mk-gname', `${'★'.repeat(g)}${'☆'.repeat(GRADE.at.length - 1 - g)} ${gradeName(g)}`));
    top.append(big);
    const steps = h('div', 'isl-mk-steps');
    GRADE_NAME().forEach((n, k) => {
      const x = h('div', `isl-mk-step ${k <= g ? 'is-on' : ''} ${k === g ? 'is-now' : ''}`);
      x.append(h('b', '', n), h('small', 'isl-dim', `★ ${GRADE.at[k]}`));
      steps.append(x);
    });
    top.append(steps);
    top.append(h('small', 'isl-dim', nx ? t(`次の「${nx.name}」まで ブランド力 あと ${nx.need}（格に数えるブランド力 ${gradeBrand(s)}）`, `Next: “${nx.name}” — ${nx.need} more brand (counted brand ${gradeBrand(s)})`) : t('いちばん上の格です', 'Top standing')));
    const fx = h('ul', 'isl-acct-list');
    fx.append(h('li', '', t(`Rare の町の商圏で、自社の店の引き +${pct(gradeArea(s) - 1)}（段ごとに +${pct(GRADE.area)}）`, `Rare-town trade areas: your store pull +${pct(gradeArea(s) - 1)} (+${pct(GRADE.area)} per step)`)));
    fx.append(h('li', '', t(`雇える候補 +${gradeHire(s)} 人（地域の有名店で +1・世界ブランドで +2）`, `Hiring candidates +${gradeHire(s)} (Regional name +1, Global brand +2)`)));
    fx.append(h('li', 'isl-dim', t('カリスマ度（雇えるレアリティ）とは別の軸です。法務の契約への効き目は、法務の部門ができてから。', 'Separate from charisma (which rarities you can hire). Effects on legal contracts come with the Legal department.')));
    top.append(fx);
    body.append(top);
    const fc = flameCard(ctx, s, hooks);
    if (fc) body.append(fc);
    // 良いニュース
    const pr = h('div', 'isl-card2 isl-mk-pr');
    pr.dataset.focus = 'mk-pr';
    pr.append(h('h3', '', t('📰 良いニュースを発表する', '📰 Release good news')));
    if (!prOn(s)) pr.append(h('p', 'isl-dim', t('広報は Uncommon の町に出店してから。町の制覇・研究成果の発表・新商品・新しいお店など、実際に起きた良いニュースを発表すると、ブランド力が上がります。', 'PR opens once you set up in an Uncommon town. Announce real good news — conquering a town, presenting findings, new products, new shops — to raise your brand.')));
    else {
      const wait = prWait(s);
      const list = newsOf(s);
      if (!list.length) pr.append(h('p', 'isl-dim', t('いまは発表できるニュースがありません。町の制覇・研究成果の発表・新商品・新しいお店が、ニュースになります。', 'No news to announce right now. Conquests, findings, new products and new shops become news.')));
      list.forEach((x, n) => {
        const row = h('div', 'isl-mk-news');
        row.append(h('span', 'isl-tag', PR_KIND_NAME[x.kind]()), h('b', '', x.label), h('small', 'isl-good', `★ +${prGain(s, x.kind)}`));
        const lock = prLock(s);
        const b = btn(t(`発表する（${money(prCost(s))}）`, `Announce (${money(prCost(s))})`), () => {
          const v = publish(s, n);
          if (typeof v === 'number') ctx.toast(t(`📰 「${x.label}」を発表した！ ブランド力 +${v}`, `📰 Announced “${x.label}”! Brand +${v}`));
          after(ctx);
        }, lock ? '' : 'is-on');
        b.disabled = !!lock;
        row.append(b);
        pr.append(row);
      });
      if (wait > 0) pr.append(h('small', 'isl-dim', t(`次の発表まで あと ${wait} 日（${PR.cool} 日に 1 回）`, `Next release in ${wait} days (once every ${PR.cool} days)`)));
      pr.append(h('small', 'isl-dim', t(`ニュースは ${PR.keep} 日で古くなります（${PR.max} 件まで）。`, `News goes stale after ${PR.keep} days (keeps ${PR.max}).`)));
    }
    const r = h('div', 'isl-row');
    if (hooks.skills) r.append(btn(t('マーケのパネル', 'Marketing panels'), () => hooks.skills!()));
    if (hooks.sat) r.append(btn(t('顧客満足度', 'Satisfaction'), () => hooks.sat!()));
    pr.append(r);
    body.append(pr);
    body.append(masteryCard(MKT_MASTERY(), `${CROSS_MKT_CS()}\n${CROSS_HR_MKT()}`));
  });
}

/** 月次報告の「🎧 お客さんの声」の文（長い・短い）。報告に cs が無ければ null */
export function csReportText(r: { cs?: import('./cs').CsReport }): [string, string] | null {
  const c = r.cs;
  if (!c) return null;
  const d = c.sat - c.prev;
  const ds = d ? t(`（${d > 0 ? '+' : '−'}${Math.abs(d)}）`, ` (${d > 0 ? '+' : '−'}${Math.abs(d)})`) : '';
  const dsEn = ds;
  const fire = c.ignited ? t('・🔥 炎上！', ' · 🔥 Backlash!') : c.heat ? t('・🔥 炎上中', ' · 🔥 Backlash') : c.warn ? t('・⚠ 炎上のおそれ', ' · ⚠ Backlash risk') : '';
  const long = t(`問い合わせ ${c.got} 件（自動 ${c.auto}）・返事 ${c.answered}・期限切れ ${c.expired}・満足度 ${c.sat}${ds}${fire}`, `${c.got} inquiries (${c.auto} auto) · ${c.answered} replies · ${c.expired} expired · satisfaction ${c.sat}${dsEn}${fire}`);
  // スマホの短い文：炎上・炎上のおそれがあれば先に（1 行に収める）
  const fireS = c.ignited ? t('🔥 炎上！', '🔥 Backlash!') : c.heat ? t('🔥 炎上中', '🔥 Backlash') : c.warn ? t('⚠ 炎上のおそれ', '⚠ Risk') : '';
  const short = fireS ? t(`${fireS}・満足度 ${c.sat}`, `${fireS} · sat. ${c.sat}`) : t(`問い合わせ ${c.got}・満足度 ${c.sat}${ds}`, `${c.got} inq. · sat. ${c.sat}${dsEn}`);
  return [long, short];
}
