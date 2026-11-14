/**
 * 法務の画面（段 H2：Epic の町 ②。docs/ISLAND_PHASE1.md「Epic の町 ②：法務と M&A」）：
 * - 法務 → M&A：他社の一覧（売上・店の数・順位・打診できない理由）・話の札（打診 → 調査 → 値段の交渉（3 段の見込み％）＋条項 → 成立）・買った会社の記録
 * - 法務 → 契約：仕入れの契約（期間 3・6・12 か月と条項（違約金なし・独占））・途中でやめるときの違約金・M&A の条項のしくみ・営業 × 法務の予告
 * - 法務 → 特許：特許にできる復刻品（出願・審査・期間・使用料で貸す・更新）・特許を侵している他社を訴える・R&D × 法務の予告
 * - 法務 → 争い：裁判の札（相手・額・進み・勝ちの見込みと内訳・和解）・これまでの記録・奥義の予告
 * どの画面も Epic の町だけが中身（ほかのランクの町では「Epic の町で」の札）。プルダウン・数字入力は使わない（ボタンとカード）。
 */
import { t } from '../../i18n';
import { LEGAL, PRODUCT, rivalDef } from './data';
import {
  MA_LOCK_TEXT,
  maLock,
  type LegalReport,
  } from './legal';
import { type P1State } from './model';
import { type Ctx } from './screens';
import { money } from './ui';
import { uxh } from '../uix/screens/h-slots';
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

/** 法務 → M&A（他社の一覧・話の札・買った会社） */
export function openLegalMA(ctx: Ctx, hooks: LegalHooks = {}, focusRid?: string) {
  // 段 UIX3h：新しい画面（uix/screens/legal.ts）
  return uxh.legalMA!(ctx, hooks, focusRid);
}
/** 法務 → 契約（仕入れの契約） */
export function openContract(ctx: Ctx, hooks: LegalHooks = {}) {
  return uxh.contract!(ctx, hooks);
}

// ---------------------------------------------------------------- 特許

/** 法務 → 特許 */
export function openPatents(ctx: Ctx, hooks: LegalHooks = {}) {
  return uxh.patents!(ctx, hooks);
}

// ---------------------------------------------------------------- 争い

/** 法務 → 争い（裁判の札・和解・記録） */
export function openSuits(ctx: Ctx, hooks: LegalHooks = {}) {
  return uxh.suits!(ctx, hooks);
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
