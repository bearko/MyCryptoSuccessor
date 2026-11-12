/**
 * 段 UIX3b：問い合わせ・顧客満足度・市場の見通し・広報と企業の格（入のときだけ。docs/ISLAND_UIX.md「画面：問い合わせ・顧客満足度・先読み・広報」）。
 * 画面の部品（sparts.ts：uxp-）で組み直した。器は今の札（open()）。返事を選ぶ所は「決める所」：返事のカードを選ぶ（合う返事は、はじめから選んである）→
 * 「この返事を送る」→ 手紙に「返信済」が打たれて、満足度の変わり方の札が出る。数字と決まりは p1/cs.ts・mkt.ts のまま。
 * 今の目印（案内が枠で囲む所：data-focus）は、同じ意味で付ける。
 */
import { t } from '../../../i18n';
import { el } from '../dom';
import { later } from '../loop';
import { uxKey, uxLamp, uxMeter, uxTape } from '../parts';
import { isCalm } from '../prefs';
import { uxSfx } from '../sound';
import { uxpBars, uxpCard, uxpGap, uxpPaper, uxpPrice, uxpRank, uxpRow, uxpSelect, uxpStamp, uxpStat } from '../sparts';
import { B } from './b-deps';
import { bDim, bIcon, bInk } from './b-icons';
import { bEmpty, bHead, dim, done, fold, histBars, key, noEmoji, num, payFx, put, sheet, stampLater, state } from './b-kit';
import './cs.css';
import type { Inquiry } from '../../p1/cs';
import type { CsHooks } from '../../p1/csui';
import type { ReplyKind } from '../../p1/data';
import type { P1State } from '../../p1/model';
import type { Ctx } from '../../p1/screens';

// ---------------------------------------------------------------- DOM なしの芯（テストから読む）

const pct = (v: number) => `${Math.round(v * 100)}%`;
/** 符号つきの数（小数 1 桁まで）：今の画面と同じ */
export const signed1 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)}`;
/** 満足度の様子：良い（75 以上）・ふつう・急ぎ（45 未満）。色だけにしない（言葉を添える） */
export const satTone = (v: number): 'good' | '' | 'bad' => (v >= 75 ? 'good' : v >= 45 ? '' : 'bad');
export const satSay = (v: number) => (v >= 75 ? t('喜ばれています', 'Customers are happy') : v >= 45 ? t('ふつう', 'Average') : t('不満がたまっています', 'Customers are unhappy'));
export const REPLIES: ReplyKind[] = ['sorry', 'refund', 'swap'];
/** はじめに選んでおく返事：中身に合う返事（打てるとき）→ 打てる返事のはじめ → 無ければ null */
export function firstReply(fit: ReplyKind, locked: (r: ReplyKind) => boolean): ReplyKind | null {
  if (!locked(fit)) return fit;
  return REPLIES.find((r) => !locked(r)) ?? null;
}
/** 返事を送ってから、手紙が片付くまで（「返信済」と結果の札を読む間） */
export const REPLY_DONE_MS = 900;
/** 企業の格の星（いまの段まで点く） */
export const gradeStars = (g: number, n: number) => Array.from({ length: n }, (_x, k) => k < g);

// ---------------------------------------------------------------- 共通：炎上の札・満足度の計器・奥義の予告

/** 炎上のおそれ・炎上中の札（問い合わせ・満足度・広報の上。手を打つキーつき）。今の目印 data-focus＝flame・flame-warn */
function flameCard(ctx: Ctx, s: P1State, hooks: CsHooks): HTMLElement | null {
  const C = s.cs;
  if (!C || (!C.warn && !C.flame)) return null;
  if (C.flame) {
    const F = C.flame;
    const heat = uxMeter(F.heat);
    heat.el.classList.add('is-full');
    const lock = B.putLock(s);
    const cost = B.putCost(s);
    const gap = uxpGap(s.money, cost);
    if (lock !== 'money') gap.el.hidden = true;
    const out = uxpStamp(t('発表済', 'Announced'));
    const box = el(
      'div.uxb-flame.is-fire',
      { 'data-focus': 'flame' },
      el('div.uxb-flame-head', uxLamp('bad', true, true), bIcon('fire', { scale: 2 }), el('b', t('炎上中', 'Backlash in progress')), out.el),
      el('p', F.cause === 'out' ? t('品切れが続いたことが、町じゅうのうわさになっています。', 'Word of repeated sell-outs is all over town.') : t('問い合わせを放っておいたことが、町じゅうのうわさになっています。', 'Word that you ignored customers is all over town.')),
      el('div.uxb-field.is-row', el('span.uxb-field-k', t('熱さ', 'Heat')), heat.el, el('span.uxb-field-v', el('span', t(`来店 −${pct(B.FLAME.hit * F.heat)}`, `Visits −${pct(B.FLAME.hit * F.heat)}`)))),
      dim(t(`月の締めごとに熱さが ${pct(1 / B.FLAME.months)} ずつ下がり、${B.FLAME.months} か月でおさまります。下げたブランド力（−${F.lost}）は熱さに合わせて戻ります。合う返事 1 件で熱さ −${pct(B.FLAME.reply)}。`, `Heat drops ${pct(1 / B.FLAME.months)} each close and is gone in ${B.FLAME.months} months. The lost brand (−${F.lost}) returns as it cools. Each fitting reply cuts heat ${pct(B.FLAME.reply)}.`)),
    );
    const go = uxKey(
      el('span.uxb-order-l', el('b', t(`火消し（熱さ −${pct(B.putPower(s))}）`, `Damage control (heat −${pct(B.putPower(s))})`)), num(`${B.fmt(cost)} G`)),
      () => {
        if (B.putLock(ctx.s()) === 'money') return gap.nudge();
        if (B.putOut(ctx.s()) != null) return uxSfx('deny');
        ctx.toast(t('釈明と対策を発表した。炎上の熱さが下がった', 'You announced an explanation and a fix. The heat is down'));
        payFx(box);
        out.hit(box);
        stampLater(() => done(ctx), 700);
      },
      { kind: lock ? '' : 'main', disabled: lock === 'cool', strong: true, cls: 'uxb-wide' },
    );
    put(box, go, gap.el, lock === 'cool' ? dim(bDim('hour'), t(`次の火消しまで あと ${Math.max(0, (F.cool ?? 0) - s.day)} 日`, `Next damage control in ${Math.max(0, (F.cool ?? 0) - s.day)} days`)) : null, hooks.inbox ? key(t('問い合わせに返事をする', 'Answer inquiries'), () => hooks.inbox!(), { ico: 'next', cls: 'uxb-wide' }) : null);
    return box;
  }
  const W = C.warn!;
  const cost = B.noticeCost(s);
  const gap = uxpGap(s.money, cost);
  const ok = uxpStamp(t('告知済', 'Posted'));
  if (W.done) ok.show();
  const box = el(
    `div.uxb-flame.${W.done ? 'is-done' : 'is-warn'}`,
    { 'data-focus': 'flame-warn' },
    el('div.uxb-flame-head', uxLamp(W.done ? 'good' : '', true, !W.done), bIcon(W.done ? 'check' : 'warn', { scale: 2 }), el('b', W.done ? t('炎上のおそれ（手を打った）', 'Backlash risk (handled)') : t('炎上のおそれ', 'Backlash risk')), ok.el),
    el(
      'p',
      W.cause === 'out'
        ? t(`先月は主力商品の品切れが ${B.FLAME.outDays} 日以上ありました。今月も続くと炎上します。`, `Your main product was sold out ${B.FLAME.outDays}+ days last month. If it happens again this month, a backlash follows.`)
        : t(`先月は期限切れの問い合わせが ${B.FLAME.ignored} 件以上ありました。今月も続くと炎上します。`, `${B.FLAME.ignored}+ inquiries expired last month. If it happens again this month, a backlash follows.`),
    ),
  );
  if (W.done) box.append(el('span.uxb-gain', bIcon('check', { color: '#36e08b', scale: 1 }), t('お詫びの告知を出しました。この予告からは炎上しません。', 'You posted an apology. This warning will not turn into a backlash.')));
  else
    put(
      box,
      dim(W.cause === 'out' ? t('手の打ち方：今月の品切れを減らす（作る・運ぶ・品出しを増やす）か、お詫びの告知を出す。', 'Fix it: cut sell-outs this month (make, haul, shelve more) or post an apology.') : t('手の打ち方：受け箱の問い合わせに返事をするか、お詫びの告知を出す。', 'Fix it: answer the inquiries in your inbox or post an apology.')),
      uxKey(
        el('span.uxb-order-l', el('b', t('お詫びの告知', 'Post an apology')), num(`${B.fmt(cost)} G`)),
        () => {
          if (ctx.s().money < cost) return gap.nudge();
          if (B.apologize(ctx.s()) != null) return uxSfx('deny');
          ctx.toast(t('お詫びの告知を出した。炎上のおそれがおさまった', 'Apology posted. The backlash risk has passed'));
          payFx(box);
          ok.hit(box);
          stampLater(() => done(ctx), 700);
        },
        { kind: s.money < cost ? '' : 'main', strong: true, cls: 'uxb-wide' },
      ),
      gap.el,
    );
  return box;
}
/** 満足度の計器（桁が回る・目盛り・来店への効き目）。big：満足度の画面の大きい形 */
function satGauge(s: P1State, big: boolean): HTMLElement {
  const v = B.satOf(s);
  const tone = satTone(v);
  const m = uxMeter(v / 100, tone === 'good' ? 'good' : '');
  m.el.classList.toggle('is-full', tone === 'bad');
  const rep = (B.repeatMul(s) - 1) * 100;
  const stat = uxpStat(t('顧客満足度', 'Satisfaction'), v, { key: 'b.cs.sat', digits: 3, size: big ? 'l' : '', tone: tone === 'good' ? 'good' : tone === 'bad' ? 'bad' : 'amber', ico: 'star', plus: true, note: big ? t(`はじめ ${B.CS.start}・0〜100`, `Start ${B.CS.start} · 0–100`) : undefined });
  return el('div.uxb-sat', { 'data-focus': 'cs-sat' }, el('div.uxp-stats', stat.el, el('div.uxb-sat-side', state(tone === 'bad' ? 'bad' : tone, satSay(v)), el(`span.uxb-sat-visit${rep >= 0 ? '.is-up' : '.is-down'}`, bIcon(rep >= 0 ? 'up' : 'down', { color: rep >= 0 ? '#36e08b' : '#ff5964', scale: 1 }), t(`来店 ${signed1(rep)}%`, `Visits ${signed1(rep)}%`)))), m.el);
}
/** 奥義と掛け合わせ（予告）：折りたたみ */
const mastery = (lines: string[], cross?: string) => fold(t('奥義と掛け合わせ（予告）', 'Masteries & cross panels (preview)'), (box) => box.append(el('ul.uxb-ul', [...lines, ...(cross ? cross.split('\n') : [])].map((x) => el('li', noEmoji(x))))), { ico: 'star' }).el;
const ul = (lines: string[]) => el('ul.uxb-ul', lines.map((x) => el('li', x)));

// ---------------------------------------------------------------- 問い合わせ

export function openInboxUx(ctx: Ctx, hooks: CsHooks = {}) {
  /** 返事を送ったあと、片付くのを待っている問い合わせ（その間は描き直さない） */
  let busy = false;
  const picked = new Map<number, ReplyKind>();
  sheet(ctx, t('問い合わせ', 'Inquiries'), null, 'uxb-inbox', (host, s) => {
    const C = B.csOf(s);
    put(host, flameCard(ctx, s, { ...hooks, inbox: undefined }), satGauge(s, false), hooks.sat ? key(t('満足度のくわしい画面', 'Satisfaction details'), () => hooks.sat!(), { ico: 'next', kind: 'weak' }) : null);
    const list = el('div.uxb-list', { 'data-focus': 'cs-inbox' }, bHead(t('受け箱', 'Inbox'), { ico: 'mail', right: num(String(C.inbox.length), 'uxb-count') }));
    if (!B.csOn(s)) list.append(bEmpty(t('Common の町には問い合わせは来ません', 'Common towns send no inquiries'), { ico: 'mail', sub: t('Uncommon 以上の町で、月の締めに先月の様子（品切れ・閉まっていた日・値段）から届きます。', 'In Uncommon+ towns they arrive at the monthly close, based on last month (sell-outs, closed days, prices).') }));
    else if (!C.inbox.length) list.append(bEmpty(t('いまは問い合わせがありません', 'No inquiries right now'), { ico: 'mail', sub: t('月の締めに、先月の様子（品切れ・閉まっていた日・値段）から届きます。', 'They arrive at the monthly close, based on last month (sell-outs, closed days, prices).') }));
    C.inbox.forEach((q, n) => list.append(inquiry(s, q, n === 0)));
    host.append(list);
    host.append(
      fold(
        t('返事のしかた', 'How replies work'),
        (box) =>
          put(
            box,
            ul([
              t(`中身に合う返事（品切れ → 代わりの品・値段 → 返金・閉まっていた → 謝る）で満足度 +${B.CS.good}。合わない返事は +${B.CS.ok}。`, `A fitting reply (sold out → substitute, price → refund, closed → apology) gives +${B.CS.good}; others +${B.CS.ok}.`),
              t(`期限（${B.expireDays(s)} 日）が切れると満足度 −${Math.abs(B.CS.ignore)}。受け箱は ${B.CS.inboxMax} 件まで。`, `Expired inquiries (after ${B.expireDays(s)} days) cost ${Math.abs(B.CS.ignore)}. The inbox holds ${B.CS.inboxMax}.`),
              t(`返金は ${B.money(B.refundCost(s))}、代わりの品は在庫からいちばん安い商品を ${B.CS.swapUnits} 個。宣伝と同じ販促の費用です。`, `A refund costs ${B.money(B.refundCost(s))}; a substitute uses ${B.CS.swapUnits} of your cheapest stock. Both count as promotion costs.`),
              B.centerRate(s) > 0 ? t(`サポートセンターが、届いた問い合わせの ${pct(B.centerRate(s))} を自動で受けています（出来 ${pct(B.CS.center.q)}）。`, `The support center auto-handles ${pct(B.centerRate(s))} of new inquiries (${pct(B.CS.center.q)} quality).`) : t('サポートセンター（パネル）があると、問い合わせの一部を自動で受けます。', 'With a support center (panel), some inquiries are handled automatically.'),
            ]),
            hooks.skills ? key(t('カスタマーサポートのパネル', 'Customer Support panels'), () => hooks.skills!(), { ico: 'star', kind: 'weak' }) : null,
          ),
        { ico: 'info' },
      ).el,
    );
  });

  /** 問い合わせ 1 件：手紙（中身・期限）と、返事のカード 3 つ・送るキー */
  function inquiry(s: P1State, q: Inquiry, first: boolean): HTMLElement {
    const left = B.daysLeft(s, q);
    const total = Math.max(1, B.expireDays(s));
    const tm = uxMeter(left / total, left <= 4 ? '' : 'good');
    tm.el.classList.toggle('is-full', left <= 4);
    const sent = uxpStamp(t('返信済', 'Replied'));
    const result = el('span.uxb-reply-result', { hidden: true });
    const letter = uxpPaper(
      { plain: true, cls: 'uxb-letter' },
      el('div.uxb-letter-head', el(`span.uxb-letter-kind${q.kind === 'closed' ? '' : '.is-bad'}`, bInk(q.kind === 'closed' ? 'shop' : 'warn'), B.KIND_NAME[q.kind]()), el('b', q.key ? (B.PRODUCT[q.key]?.name ?? '') : t('お店', 'Shop')), sent.el),
      el('p.uxb-letter-text', B.inquiryText(q)),
      el('div.uxb-letter-due', el('span', t('期限', 'Due')), tm.el, el(`span${left <= 4 ? '.uxb-letter-soon' : ''}`, t('あと ', ''), num(left), t(' 日', ' d left'))),
      result,
    );
    const fit = B.REPLY_FIT[q.kind];
    let now = picked.get(q.id) ?? firstReply(fit, (r) => !!B.replyLock(s, r));
    if (now && B.replyLock(s, now)) now = firstReply(fit, (r) => !!B.replyLock(s, r));
    const cards = new Map<ReplyKind, HTMLElement>();
    const send = uxKey(el('b', ''), () => go(), { kind: first ? 'main' : '', ico: 'check', strong: true, cls: 'uxb-wide uxb-send', disabled: !now, attrs: { 'data-ux-quiet': '' } });
    const label = send.querySelector('b')!;
    const setNow = (r: ReplyKind, feel: boolean) => {
      now = r;
      picked.set(q.id, r);
      for (const [k, c] of cards) uxpSelect(c, k === r, feel && k === r);
      label.textContent = t(`「${B.REPLY_NAME[r]()}」で返事を送る`, `Send: ${B.REPLY_NAME[r]()}`);
    };
    const opts = el('div.uxb-replies', { role: 'group', 'aria-label': t('返事を選ぶ', 'Choose a reply') });
    for (const r of REPLIES) {
      const lock = B.replyLock(s, r);
      const gain = Math.round(B.replyGain(s, q, r));
      const item = B.swapItem(s);
      const cost = r === 'refund' ? uxpPrice(B.refundCost(s)) : r === 'swap' ? el('span.uxb-dim', bDim('box'), item ? `${B.skuName(item)} ×${B.CS.swapUnits}` : t('在庫なし', 'No stock')) : uxpPrice(0);
      const c = uxpCard({
        name: B.REPLY_NAME[r](),
        tags: r === fit ? uxTape(t('合う返事', 'Fits'), 'amber') : null,
        desc: el(`span.uxb-gain${r === fit ? '' : '.is-off'}`, bIcon('up', { color: r === fit ? '#36e08b' : '#97a1cf', scale: 1 }), t(`満足度 +${gain}`, `Satisfaction +${gain}`)),
        foot: [cost, lock === 'money' ? el('span.uxb-reply-lock', bIcon('coin', { scale: 1 }), t(`あと ${B.money(B.refundCost(s) - s.money)}`, `${B.money(B.refundCost(s) - s.money)} to go`)) : null],
        onTap: lock ? () => uxSfx('deny') : () => setNow(r, true),
        off: !!lock,
        selected: now === r,
        cls: `uxb-reply${r === fit ? ' is-fit' : ''}`,
        attrs: { 'data-reply': r },
      });
      cards.set(r, c);
      opts.append(c);
    }
    if (now) setNow(now, false);
    else label.textContent = t('いまは返事を送れません', 'No reply available now');
    const box = el('div.uxb-inq', { 'data-inquiry': String(q.id) }, letter, opts, send);
    function go() {
      if (!now || busy) return;
      const cur = ctx.s();
      const r = now;
      const gain = Math.round(B.replyGain(cur, q, r));
      const before = cur.money;
      if (B.reply(cur, q.id, r) != null) return uxSfx('deny');
      busy = true;
      picked.delete(q.id);
      // 送った手応え：手紙に「返信済」が打たれ、結果の札（満足度 +N）が出る。少し読ませてから片付ける
      uxSfx('print');
      if (cur.money < before) payFx(box);
      sent.hit(letter);
      result.hidden = false;
      result.replaceChildren(uxTape([bInk('up'), el('b', t(`満足度 +${gain}`, `Satisfaction +${gain}`))], r === fit ? 'good' : ''), el('span', r === fit ? t('お客さんが喜んでくれた', 'The customer is happy') : t('返事をした', 'Replied')));
      opts.classList.add('is-sent');
      send.disabled = true;
      ctx.save();
      ctx.refresh();
      const finish = () => {
        busy = false;
        ctx.toast(r === fit ? t(`お客さんが喜んでくれた（満足度 +${gain}）`, `The customer is happy (satisfaction +${gain})`) : t(`返事をした（満足度 +${gain}）`, `Replied (satisfaction +${gain})`));
        done(ctx);
      };
      if (isCalm()) finish();
      else later(REPLY_DONE_MS, finish);
    }
    return box;
  }
}

// ---------------------------------------------------------------- 顧客満足度

export function openSatUx(ctx: Ctx, hooks: CsHooks = {}) {
  sheet(ctx, t('顧客満足度', 'Customer satisfaction'), null, 'uxb-satpage', (host, s) => {
    const v = B.satOf(s);
    const C = B.csOf(s);
    put(
      host,
      flameCard(ctx, s, hooks),
      satGauge(s, true),
      uxpRow(t('来店（リピーター）', 'Visits (regulars)'), B.csOn(s) ? `${signed1((B.repeatMul(s) - 1) * 100)}%` : t('Common の町では効かない', 'No effect in Common towns'), { ico: 'walk', tone: B.csOn(s) ? (B.repeatMul(s) >= 1 ? 'good' : 'bad') : 'dim' }),
      s.cs?.flame ? uxpRow(t('炎上', 'Backlash'), `${signed1((B.visitMul(s) / B.repeatMul(s) - 1) * 100)}%`, { ico: 'fire', tone: 'bad' }) : null,
      uxpRow(t('ブランド力（月の締め）', 'Brand (monthly close)'), v >= B.CS.brandHi ? '+1' : v <= B.CS.brandLo ? '−1' : '±0', { ico: 'star', tone: v >= B.CS.brandHi ? 'good' : v <= B.CS.brandLo ? 'bad' : 'dim' }),
    );
    const hist = B.satHist(s.reports);
    if (hist.length) {
      const d = hist.length >= 2 ? hist[hist.length - 1].v - hist[hist.length - 2].v : 0;
      put(
        host,
        bHead(t('月の締めの顧客満足度', 'Satisfaction at each close'), { ico: 'bars' }),
        hist.length >= 2 ? el(`span.uxb-gain${d >= 0 ? '' : '.is-wait'}`, bIcon(d >= 0 ? 'up' : 'down', { color: d >= 0 ? '#36e08b' : '#ffb81f', scale: 1 }), t(`先月から ${d >= 0 ? '+' : '−'}${Math.abs(d)}`, `${d >= 0 ? '+' : '−'}${Math.abs(d)} since last month`)) : null,
        histBars(hist.map((x, k) => ({ label: B.monLab(x.month), value: x.v, kind: k === hist.length - 1 ? 'main' : x.v <= B.CS.brandLo ? 'bad' : x.v >= B.CS.brandHi ? 'good' : '', text: String(Math.round(x.v)) })), { max: 100, height: 132 }),
        dim(t(`${B.CS.brandHi} 以上（緑）で月にブランド力 +1、${B.CS.brandLo} 以下（赤）で −1。`, `Brand +1/month at ${B.CS.brandHi}+ (green), −1 at ${B.CS.brandLo} or less (red).`)),
      );
    }
    if (s.skills.includes('cs_survey')) {
      const n = C.inbox.length;
      const good = Math.min(100, Math.round(v + n * B.CS.good * B.careMul(s) + (B.CS.start - (v + n * B.CS.good * B.careMul(s))) * B.CS.drift));
      const bad = Math.max(0, Math.round(v + n * B.CS.ignore + (B.CS.start - (v + n * B.CS.ignore)) * B.CS.drift));
      host.append(el('span.uxb-gain', bIcon('list', { color: '#36e08b', scale: 1 }), t(`調査：受け箱の ${n} 件にすべて合う返事をすると、来月の締めでおよそ ${good}。放っておくと ${bad}。`, `Survey: answering all ${n} inquiries well puts next close near ${good}; ignoring them, ${bad}.`)));
    }
    if (hooks.inbox) host.append(key(t(`問い合わせ（${C.inbox.length} 件）`, `Inquiries (${C.inbox.length})`), () => hooks.inbox!(), { kind: C.inbox.length ? 'main' : '', ico: 'next', cls: 'uxb-wide' }));
    host.append(
      fold(
        t('上がるとき・下がるとき', 'What moves it'),
        (box) =>
          put(
            box,
            ul([
              t(`問い合わせに合う返事：+${B.CS.good}（合わない返事 +${B.CS.ok}）・サポートセンターが受けた：+${Math.round(B.CS.good * B.CS.center.q * 10) / 10}`, `Fitting reply: +${B.CS.good} (others +${B.CS.ok}) · handled by the support center: +${Math.round(B.CS.good * B.CS.center.q * 10) / 10}`),
              t(`期限切れ：−${Math.abs(B.CS.ignore)}／件。月の締めごとに、はじめの ${B.CS.start} へ ${pct(B.CS.drift)} ずつ戻る`, `Expired: −${Math.abs(B.CS.ignore)} each. Each close it drifts ${pct(B.CS.drift)} back toward ${B.CS.start}`),
              t(`効き目：Uncommon 以上の町の来店が 100 で +${pct(B.CS.up)}・0 で −${pct(B.CS.down)}（満足度の調査で ×${B.CS.survey}）。${B.CS.brandHi} 以上で月にブランド力 +1、${B.CS.brandLo} 以下で −1`, `Effect: visits in Uncommon+ towns +${pct(B.CS.up)} at 100, −${pct(B.CS.down)} at 0 (×${B.CS.survey} with the survey). Brand +1/month at ${B.CS.brandHi}+, −1 at ${B.CS.brandLo} or less`),
              t(`炎上：主力商品の品切れ ${B.FLAME.outDays} 日以上の月・期限切れ ${B.FLAME.ignored} 件以上の月が、手を打たずに 2 か月続くと起きる（1 か月目に予告）`, `Backlash: ${B.FLAME.outDays}+ sell-out days or ${B.FLAME.ignored}+ expired inquiries two months running, unless you act (warned after the first)`),
            ]),
            el('div.uxb-acts', hooks.skills ? key(t('カスタマーサポートのパネル', 'Customer Support panels'), () => hooks.skills!(), { ico: 'star', kind: 'weak' }) : null, hooks.pr ? key(t('広報（火消し）', 'PR (damage control)'), () => hooks.pr!(), { kind: 'weak' }) : null),
          ),
        { ico: 'info' },
      ).el,
      mastery(B.CS_MASTERY(), B.CROSS_MKT_CS()),
    );
  });
}

// ---------------------------------------------------------------- 市場の見通し（先読み）

export function openForecastUx(ctx: Ctx, hooks: { skills?: () => void; ads?: () => void } = {}) {
  sheet(ctx, t('市場の見通し', 'Market outlook'), null, 'uxb-fore', (host, s) => {
    const f = B.forecast(s);
    // 宣伝の打ち時
    const tips = el('div.uxb-list', { 'data-focus': 'mk-hints' }, bHead(t('宣伝の打ち時', 'When to advertise'), { ico: 'horn' }));
    for (const x of f.hints) {
      const ad = x.ad ? B.ADS.find((a) => a.id === x.ad) : null;
      const can = !!ad && x.kind !== 'copy' && (s.ads[ad.id] ?? 0) <= 0;
      const gap = uxpGap(s.money, ad?.cost ?? 0);
      if (!can) gap.el.hidden = true;
      tips.append(
        uxpCard({
          pic: bIcon(x.kind === 'calm' ? 'info' : 'horn', { scale: 2, color: x.kind === 'calm' ? '#97a1cf' : '#ffb81f' }),
          name: el('span.uxb-hint', noEmoji(x.text)),
          foot: can ? [uxpPrice(ad!.cost), gap.el] : null,
          right:
            can && ad
              ? key(
                  t(`${ad.name}を打つ`, `Run ${ad.name}`),
                  () => {
                    if (ctx.s().money < ad.cost) return gap.nudge();
                    if (B.runAd(ctx.s(), ad.id) != null) return uxSfx('deny');
                    ctx.toast(t(`${ad.name}を始めた`, `Started ${ad.name}`));
                    payFx(tips);
                    done(ctx);
                  },
                  { strong: true },
                )
              : null,
          cls: `uxb-hintcard${x.kind === 'calm' ? '' : ' is-hot2'}`,
        }),
      );
    }
    if (hooks.ads) tips.append(key(t('宣伝広報を開く', 'Open Advertising'), () => hooks.ads!(), { ico: 'next', kind: 'weak' }));
    host.append(tips);
    // 需要の見通し：商品ごとの国民のニーズ（いま）の縦の棒と、先の月・他社
    const box = el('div.uxb-list', { 'data-focus': 'mk-fore' }, bHead(t(`需要の見通し（${f.h} か月先まで）`, `Demand outlook (${f.h} month${f.h > 1 ? 's' : ''} ahead)`), { ico: 'scope' }), dim(t('いまの需要の伸び（月 +1.5%）と、他社が真似してくるまでの数えから読む見通しです。', 'Read from current demand growth (+1.5%/month) and how long until rivals copy you.')));
    const rows = f.rows.slice(0, 10);
    const bars = [...rows].sort((a, b) => b.demand[0] - a.demand[0]);
    if (bars.length) {
      const top = bars[0];
      const up = f.h ? Math.round(((top.demand[f.h] - top.demand[0]) / Math.max(1, top.demand[0])) * 100) : 0;
      put(
        box,
        el('span.uxb-cap', t('商品ごとの国民のニーズ（いま・月）。琥珀の棒は自社の商品', 'Demand by product (now, per month). Amber bars are yours')),
        uxpBars(bars.slice(0, 8).map((r) => ({ label: r.name, value: r.demand[0], kind: r.mine ? 'main' : '' })), { height: 148, cls: 'uxb-fore-bars' }).el,
        f.h ? el('span.uxb-gain', bIcon('up', { color: '#36e08b', scale: 1 }), t(`${f.h} か月先には、どの商品も +${up}% ほど`, `In ${f.h} mo every item is +${up}% or so`)) : null,
      );
    }
    for (const r of rows) {
      const tags: (HTMLElement | null)[] = [r.mine ? uxTape(t('自社', 'Ours'), 'amber') : null];
      const notes: (HTMLElement | null)[] = [
        r.copyIn != null ? el(`span.uxb-gain.is-wait${r.copyIn <= 1 ? '.is-bad' : ''}`, bIcon('warn', { scale: 1 }), t(`${r.copyIn} か月で真似されそう`, `copied in ~${r.copyIn} mo`)) : null,
        r.patent > 0 ? el('span.uxb-gain', bIcon('lock', { color: '#36e08b', scale: 1 }), t(`特許で真似されない（あと ${r.patent} か月）`, `Patented: no copies (${r.patent} mo left)`)) : null,
        r.topOf.length ? el('span.uxb-dim', t(`${r.topOf.join('・')}の売れ筋`, `best-seller of ${r.topOf.join(', ')}`)) : null,
      ];
      box.append(
        uxpCard({
          name: r.name,
          tags,
          desc: [el('div.uxb-months', el('span', el('span.uxb-cap', t('いま', 'Now')), num(B.fmt(r.demand[0]))), ...r.demand.slice(1).map((d, k) => el('span', el('span.uxb-cap', t(`${k + 1} か月後`, `+${k + 1} mo`)), num(B.fmt(d)))), el('span', el('span.uxb-cap', t('他社', 'Rivals')), el('span', num(String(r.sellers)), t(' 社', '')))), ...notes],
          cls: `uxb-forecard${r.mine ? ' is-mine' : ''}`,
        }),
      );
    }
    host.append(box);
    // 他社の売れ筋（順位だけは横の棒）
    host.append(bHead(t('他社の売れ筋', 'Rivals’ best-sellers'), { ico: 'shop' }));
    if (!f.rivals.length) host.append(dim(t('「市場調査の部署」（パネル）で、他社ごとのいちばん売れている商品と先月の売上が見えます。', 'The Research desk (panel) shows each rival’s best-seller and last month’s sales.')));
    else {
      const mine = s.reports[s.reports.length - 1]?.revenue ?? null;
      const rb = B.rivalBars(f.rivals, mine, (k) => B.PRODUCT[k]?.name ?? k);
      const max = Math.max(1, ...rb.map((b) => b.v));
      host.append(el('div.uxp-ranks', rb.map((b, n) => uxpRank({ n: n + 1, name: b.name, value: `${B.fmt(b.v)} G`, ratio: b.v / max, me: b.me, note: b.item ? t(`売れ筋：${b.item}`, `Best: ${b.item}`) : undefined }))));
    }
    if (B.horizon(s) < 3) host.append(dim(B.horizon(s) === 1 ? t('見通せるのは 1 か月先まで。マーケのパネル「市場調査の部署」で 2 か月先・他社の売れ筋、「需要の読み」で 3 か月先・真似されるまでの予報。', 'You see 1 month ahead. Marketing panels: Research desk → 2 months and rivals’ best-sellers; Demand modeling → 3 months and copy forecasts.') : t('「需要の読み」（パネル）で 3 か月先と、他社が真似してくる時期の予報が見えます。', 'Demand modeling (panel) adds a 3rd month and copy forecasts.')));
    if (hooks.skills) host.append(key(t('マーケのパネル', 'Marketing panels'), () => hooks.skills!(), { ico: 'star', kind: 'weak' }));
  });
}

// ---------------------------------------------------------------- 広報と企業の格

export function openPrUx(ctx: Ctx, hooks: CsHooks = {}) {
  sheet(ctx, t('広報と企業の格', 'PR & standing'), null, 'uxb-pr', (host, s) => {
    const g = B.gradeOf(s);
    const nx = B.gradeNext(s);
    const names = B.GRADE_NAME();
    const stars = gradeStars(g, B.GRADE.at.length - 1);
    const gm = uxMeter(nx ? Math.max(0, 1 - nx.need / Math.max(1, B.GRADE.at[Math.min(g + 1, B.GRADE.at.length - 1)] - B.GRADE.at[g])) : 1);
    put(
      host,
      el(
        'div.uxb-grade',
        { 'data-focus': 'mk-grade' },
        el('span.uxb-jam-k', t('企業の格', 'Company standing')),
        el('div.uxb-grade-name', el('span.uxb-stars', { role: 'img', 'aria-label': `${g}/${stars.length}` }, stars.map((on) => bIcon('star', on ? { color: '#ffb81f', hi: '#ffe394', lo: '#b8650d', scale: 2 } : { color: '#3a4266', hi: '#4a5486', lo: '#20253d', scale: 2 }))), el('b', B.gradeName(g))),
        el('div.uxb-grade-steps', names.map((n, k) => el(`span.uxb-grade-step${k <= g ? '.is-on' : ''}${k === g ? '.is-now' : ''}`, uxLamp('', k <= g, k === g), el('b', n), el('span.uxb-dim', bDim('star'), num(B.GRADE.at[k]))))),
        gm.el,
        dim(nx ? t(`次の「${nx.name}」まで ブランド力 あと ${nx.need}（格に数えるブランド力 ${B.gradeBrand(s)}）`, `Next: “${nx.name}” — ${nx.need} more brand (counted brand ${B.gradeBrand(s)})`) : t('いちばん上の格です', 'Top standing')),
        ul([t(`Rare の町の商圏で、自社の店の引き +${pct(B.gradeArea(s) - 1)}（段ごとに +${pct(B.GRADE.area)}）`, `Rare-town trade areas: your store pull +${pct(B.gradeArea(s) - 1)} (+${pct(B.GRADE.area)} per step)`), t(`雇える候補 +${B.gradeHire(s)} 人（地域の有名店で +1・世界ブランドで +2）`, `Hiring candidates +${B.gradeHire(s)} (Regional name +1, Global brand +2)`), t('カリスマ度（雇えるレアリティ）とは別の軸です。法務の契約への効き目は、法務の部門ができてから。', 'Separate from charisma (which rarities you can hire). Effects on legal contracts come with the Legal department.')]),
      ),
      flameCard(ctx, s, hooks),
    );
    const pr = el('div.uxb-list', { 'data-focus': 'mk-pr' }, bHead(t('良いニュースを発表する', 'Release good news'), { ico: 'horn' }));
    if (!B.prOn(s)) pr.append(dim(t('広報は Uncommon の町に出店してから。町の制覇・研究成果の発表・新商品・新しいお店など、実際に起きた良いニュースを発表すると、ブランド力が上がります。', 'PR opens once you set up in an Uncommon town. Announce real good news — conquering a town, presenting findings, new products, new shops — to raise your brand.')));
    else {
      const wait = B.prWait(s);
      const list = B.newsOf(s);
      const cost = B.prCost(s);
      if (!list.length) pr.append(bEmpty(t('いまは発表できるニュースがありません', 'No news to announce right now'), { ico: 'horn', sub: t('町の制覇・研究成果の発表・新商品・新しいお店が、ニュースになります。', 'Conquests, findings, new products and new shops become news.') }));
      list.forEach((x, n) => {
        const lock = B.prLock(s);
        const gap = uxpGap(s.money, cost);
        if (lock !== 'money') gap.el.hidden = true;
        const st = uxpStamp(t('発表済', 'Announced'));
        const card = uxpCard({
          pic: bIcon('horn', { scale: 2, color: '#ffb81f' }),
          name: x.label,
          tags: [uxTape(B.PR_KIND_NAME[x.kind]()), st.el],
          desc: el('span.uxb-gain', bIcon('star', { color: '#36e08b', scale: 1 }), t(`ブランド力 +${B.prGain(s, x.kind)}`, `Brand +${B.prGain(s, x.kind)}`)),
          foot: [uxpPrice(cost), gap.el],
          right: uxKey(
            t('発表する', 'Announce'),
            () => {
              if (B.prLock(ctx.s()) === 'money') return gap.nudge();
              const v = B.publish(ctx.s(), n);
              if (typeof v !== 'number') return uxSfx('deny');
              ctx.toast(t(`「${x.label}」を発表した！ ブランド力 +${v}`, `Announced “${x.label}”! Brand +${v}`));
              payFx(card);
              st.hit(card);
              uxSfx('stamp');
              stampLater(() => done(ctx), 700);
            },
            { kind: lock ? '' : n === 0 ? 'main' : '', disabled: !!lock && lock !== 'money', cls: 'uxb-buykey', strong: true },
          ),
          cls: 'uxb-news',
        });
        pr.append(card);
      });
      if (wait > 0) pr.append(dim(bDim('hour'), t(`次の発表まで あと ${wait} 日（${B.PR.cool} 日に 1 回）`, `Next release in ${wait} days (once every ${B.PR.cool} days)`)));
      pr.append(dim(t(`ニュースは ${B.PR.keep} 日で古くなります（${B.PR.max} 件まで）。`, `News goes stale after ${B.PR.keep} days (keeps ${B.PR.max}).`)));
    }
    pr.append(el('div.uxb-acts', hooks.skills ? key(t('マーケのパネル', 'Marketing panels'), () => hooks.skills!(), { ico: 'star', kind: 'weak' }) : null, hooks.sat ? key(t('顧客満足度', 'Satisfaction'), () => hooks.sat!(), { kind: 'weak' }) : null));
    host.append(pr, mastery(B.MKT_MASTERY(), `${B.CROSS_MKT_CS()}\n${B.CROSS_HR_MKT()}`));
  });
}
