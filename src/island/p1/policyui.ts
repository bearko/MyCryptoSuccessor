/**
 * 経営方針の画面（決まりは policy.ts。DOM はここ）。
 * - 段 UI7c：openPolicyPick（マインちゃんが 1 回だけ聞く。全社方針の 1 つ目）・policyCard（経営企画の「受け箱」の上の札）。
 * - 段 K：openPolicyView（方針の画面：いまの全社方針と事業別の方針・効き目の数字（基本 × 部門のレベル × 部長の能力）・開放の一覧）・
 *   openCorpPick（全社方針を枠の数まで選ぶ）・openDeptPick（事業別の方針）・
 *   経営方針発表会（段 I2 の年初の会議）：BOARD_SCENES に「社長が全社方針を発表 → 部長のいない部門の方針」、BOARD_ITEM_LINES に「部長の事業別の方針の発表」を足す。
 * - 段 K2：全社方針の枠 +1（ランクアップの特別なパネル・無償）は、方針の画面の全社方針の「枠」の所で受け取る（slotClaim）。受け箱の上の札も光る。
 * - 方針のアイコンは絵文字の仮の絵（docs/ISLAND_ART_TODO.md）。
 */
import { t } from '../../i18n';
import { DEPT, type DeptId, type PolicyDef } from './data';
import {
  fxLine,
  fxVal,
  polFxOf,
  polPower,
  } from './policy';
import { heroNm } from './deleg';
import { type Ctx } from './screens';
import { uxd } from '../uix/screens/d-slots';
import type { P1State } from './model';
import './pol.css';
/** 効き目の数字：いまの強さ（基本 × 部門のレベル × 部長の能力 → 値） */
export function powerLines(s: P1State, p: PolicyDef): string[] {
  const w = polPower(s, p);
  return polFxOf(s, p).map((f) => {
    const who = w.who != null ? (p.sector ? t(`セクター長 ×${w.head.toFixed(2)}`, `sector heads ×${w.head.toFixed(2)}`) : t(`部長 ${heroNm(w.who)} ×${w.head.toFixed(2)}`, `head ${heroNm(w.who)} ×${w.head.toFixed(2)}`)) : p.sector ? t('セクター長なし ×1', 'no sector head ×1') : t('部長なし ×1', 'no head ×1');
    return t(
      `${fxLine(f.k, f.base)} × ${DEPT[p.dept].name} Lv${w.level} ×${w.lv.toFixed(2)} × ${who} → ${fxVal(f.k, f.v)}`,
      `${fxLine(f.k, f.base)} × ${DEPT[p.dept].name} Lv${w.level} ×${w.lv.toFixed(2)} × ${who} → ${fxVal(f.k, f.v)}`,
    );
  });
}

// ---------------------------------------------------------------- 段 UI7c：マインちゃんの問い（全社方針の 1 つ目）

/** 方針を選ぶ窓（時間が止まる .isl-modal）。mine：マインちゃんが聞く（1 回だけ）。then：閉じたあと（選んだ・あとで） */
export function openPolicyPick(ctx: Ctx, o: { mine?: boolean; then?: () => void } = {}) {
  return uxd.policyPick!(ctx, o);
}

/** 経営企画の「受け箱」の上の 1 枚：いまの全社方針・事業別の方針の数と「方針を見る」 */
export function policyCard(ctx: Ctx): HTMLElement {
  return uxd.policyCard!(ctx);
}

// ---------------------------------------------------------------- 段 K：方針の画面

/** 方針の画面（経営企画 → 受け箱の上の札 →「方針を見る」） */
export function openPolicyView(ctx: Ctx) {
  return uxd.policyView!(ctx);
}

/** 全社方針を選ぶ窓（枠の数まで。会議が始まったあとは、いまの方針を外せない＝空いた枠を埋めるだけ） */
export function openCorpPick(ctx: Ctx) {
  return uxd.corpPick!(ctx);
}
/** 事業別の方針を選ぶ窓 */
export function openDeptPick(ctx: Ctx, d: DeptId) {
  return uxd.deptPick!(ctx, d);
}

// 段 K3：経営方針発表会（段 I2 の年初の経営会議）は、カードを机に差し出す場面に替えた（policycardsui.ts）
