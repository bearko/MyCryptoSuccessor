/**
 * カスタマーサポートとマーケの画面（段 G。docs/ISLAND_PHASE1.md「カスタマーサポート」「マーケ（市場調査・広報・企業の格）」「炎上」）：
 * - カスタマーサポート → 問い合わせ：受け箱（中身・期限）と返事の選択（謝る・返金・代わりの品。満足度の見込みと費用）・炎上のおそれと炎上の札
 * - カスタマーサポート → 顧客満足度：いまの満足度・効き目（来店・ブランド力）・月ごとの推移・上がる下がるのしくみ・奥義と掛け合わせの予告
 * - マーケ → 市場の見通し：需要と他社の 1〜3 か月先・他社の売れ筋・宣伝の打ち時
 * - マーケ → 広報と企業の格：企業の格（いま・次の段・効き目）・良いニュースの発表・火消し・お詫びの告知・奥義と掛け合わせの予告
 */
import { t } from '../../i18n';
import { FLAME } from './data';
import { apologize, noticeCost, putCost, putLock, putOut, putPower } from './cs';
import { type P1State } from './model';
import { after, type Ctx } from './screens';
import { bar, btn, h, money } from './ui';
import { uxb } from '../uix/screens/b-slots';

const pct = (v: number) => `${Math.round(v * 100)}%`;
export interface CsHooks {
  /** その部門のパネル（スキルツリーのその枝へ） */
  skills?: () => void;
  /** 顧客満足度・問い合わせ・広報の画面へ */
  sat?: () => void;
  inbox?: () => void;
  pr?: () => void;
}

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

/** カスタマーサポート → 問い合わせ（受け箱と返事の選択） */
export function openInbox(ctx: Ctx, hooks: CsHooks = {}) {
  // 段 UIX3b：新しい画面（uix/screens/cs.ts）
  return uxb.inbox!(ctx, hooks);
}

/** カスタマーサポート → 顧客満足度 */
export function openSat(ctx: Ctx, hooks: CsHooks = {}) {
  return uxb.sat!(ctx, hooks);
}

/** マーケ → 市場の見通し */
export function openForecast(ctx: Ctx, hooks: { skills?: () => void; ads?: () => void } = {}) {
  return uxb.forecast!(ctx, hooks);
}

/** マーケ → 広報と企業の格 */
export function openPr(ctx: Ctx, hooks: CsHooks = {}) {
  return uxb.pr!(ctx, hooks);
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
