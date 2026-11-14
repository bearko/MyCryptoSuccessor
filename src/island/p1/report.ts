
import { type DigSummary } from './digmeet';
import { t } from '../../i18n';
import { jamOf, type FlowKey, type P1State, type Report, type Stage } from './model';
import { type Speech } from './card';
import type { Plan } from './plan';
import { type Ctx } from './screens';
import { heroName, money, signed } from './ui';
import { cvBox, donutEl, fallEl, fallLegend, pctBarEl, shortN } from './chartkit';
import { uxs } from '../uix/screens/s-slots';
import { costParts, monthFall, salesParts } from './dash';

export const STAGE_NAME: Record<Stage, string> = { buy: t('① 調達', '① Buy'), craft: t('② 製造', '② Craft'), haul: t('③ 物流', '③ Haul'), sell: t('④ 販売', '④ Sell') };
/** 段ごとの直し方（ボトルネックのとき） */
export const STAGE_HINT: Record<Stage, string> = {
  buy: t('素材が足りていません。調達係を置くか、スキル「調達枠の拡大」「まとめ買い」で仕入れを増強しましょう。', 'Materials are short. Assign a buyer or widen buying with the Bigger quota / Bulk buying skills.'),
  craft: t('作る数が足りていません。作業台を増やす（工房の設備投資）・段取りの改善（スキル）か、製造の得意なヒーローを置きましょう。', 'Crafting is the limit. Add a bench (workshop investment), Better jigs (skill), or put a better crafter on the bench.'),
  haul: t('運ぶ数が足りていません。荷車を増やす・小型トラック（工房の設備投資）、遠いお店には物流拠点を。', 'Hauling is the limit. More carts or a Small truck (workshop investment); a hub for far shops.'),
  sell: t('売れる数が頭打ち。棚やお店の数ではなく、別の商品・届く場所・売り場の強さ・認知で伸びます（サプライチェーンの販売の内訳へ）。', 'Sales are capped. They grow with another item, reaching new homes, stronger shops or awareness — not more shelves or shops (see the SCM sales breakdown).'),
};
/** スマホ用の短い版（2 行以内） */
export const STAGE_HINT_SHORT: Record<Stage, string> = {
  buy: t('素材が足りない。調達係やスキルで仕入れを増強。', 'Short of materials. Add a buyer or buying skills.'),
  craft: t('作る数が足りない。作業台（設備投資）・スキル・職人を。', 'Crafting is short. Benches (investment), skills or a crafter.'),
  haul: t('運ぶ数が足りない。荷車（設備投資）・物流拠点を。', 'Hauling is short. Carts (investment) or a hub.'),
  sell: t('売れる数が頭打ち。別の商品・届く場所・売り場・認知で（販売の内訳へ）。', 'Sales capped: new item, reach, pull or awareness (breakdown).'),
};
/** 段を太くするスキル（スキルツリーの枝） */
export const STAGE_BRANCH: Record<Stage, string> = { buy: 'buy', craft: 'craft', haul: 'logi', sell: 'shop' };

/** 「今月のレベルアップ」の文（長い・短い）。無ければ null。多いときは Lv の上がった数の大きい 2 人と「ほか N 人」 */
export function levelUpText(r: Report): [string, string] | null {
  const ups = [...(r.levelUps ?? [])].sort((a, b) => b.to - b.from - (a.to - a.from) || b.to - a.to);
  const items = Object.entries(r.items ?? {}).reduce((a, [, n]) => a + (n ?? 0), 0);
  if (!ups.length && !items) return null;
  const one = (x: { hero: number; from: number; to: number }) => t(`${heroName(x.hero)} Lv ${x.from}→${x.to}`, `${heroName(x.hero)} Lv ${x.from}→${x.to}`);
  const head = ups.slice(0, 2).map(one).join(t('・', ', '));
  const more = ups.length > 2 ? t(`・ほか ${ups.length - 2} 人`, ` +${ups.length - 2} more`) : '';
  const it = items ? t(`${ups.length ? '・' : ''}強化アイテム +${items}`, `${ups.length ? ' · ' : ''}promotion items +${items}`) : '';
  const long = head + more + it;
  const short = (ups.length ? t(`${ups.length} 人`, `${ups.length} heroes`) : '') + it;
  return [long, short];
}

export interface ReportHooks {
  openSkills: (branch?: string) => void;
  openSupply: () => void;
  openRanking: () => void;
  /** 研究ノート（「今月の出土品」の導線） */
  openNotes?: () => void;
  /** ヒーローの育成（「今月のレベルアップ」の導線。段 E1） */
  openGrowth?: () => void;
  /** 営業の画面（Rare の町の「商圏の取り分」の導線） */
  openTrade?: () => void;
  /** 部長の提案（「担当の報告」の導線。段 D） */
  openProps?: () => void;
  /** 給与・労務（「士気と給与」の導線。段 E2） */
  openPay?: () => void;
  /** カスタマーサポート（「お客さんの声」の導線。段 G） */
  openCs?: () => void;
  /** 法務（「⚖ 法務」の導線。段 H2） */
  openLegal?: () => void;
  /** 外交（「🌐 交易」の導線。段 UI4） */
  openDiplo?: () => void;
  /** 段 UI5a：KPI ③ の「担当者からの提案」（提案書を開く） */
  openProposal?: (plan: Plan, say: string, role: string, speech?: Speech) => void;
  /** 効果音 */
  sfx?: (k: 'sale' | 'win' | 'levelup' | 'check' | 'report' | 'drum' | 'error') => void;
}

/** 通算の月 → 年目と月 */
const ym = (month: number) => ({ year: 1 + Math.floor((month - 1) / 12), month: ((month - 1) % 12) + 1 });

/** 報告のタイトル：「月次報告（1年目・3月）」 */
export function reportTitle(month: number): string {
  const d = ym(month);
  return t(`月次報告（${d.year}年目・${d.month}月）`, `Monthly report (Y${d.year} · M${d.month})`);
}

/** 段 UI8：月次報告の内訳のグラフ（商品ごとの割合・費用の内訳・売上から利益まで）。月次報告と、くわしい売上報告（screens.ts）で使う */
export function breakdownCharts(r: Report): HTMLElement[] {
  const out: HTMLElement[] = [];
  const mix = salesParts(r.bySeries);
  if (mix.length) {
    const a = cvBox(t('商品ごとの売上の割合', 'Sales by product'), mix.length > 1 ? t(`いちばんは${mix[0].name}（${Math.round((mix[0].v / Math.max(1, r.revenue)) * 100)}%）`, `Top: ${mix[0].name} (${Math.round((mix[0].v / Math.max(1, r.revenue)) * 100)}%)`) : '');
    a.body.append(pctBarEl(mix, t('商品ごとの売上の割合', 'Sales by product')));
    out.push(a.el);
  }
  const cs = costParts(r.costs);
  if (cs.length) {
    const tot = cs.reduce((x, c) => x + c.v, 0);
    const b = cvBox(t('費用の内訳', 'Costs'), t(`いちばん大きいのは${cs[0].name}（${Math.round((cs[0].v / Math.max(1, tot)) * 100)}%）`, `Largest: ${cs[0].name} (${Math.round((cs[0].v / Math.max(1, tot)) * 100)}%)`));
    b.body.append(donutEl(cs, { big: shortN(tot), small: t('合計', 'Total') }, t(`費用の合計 ${money(tot)}`, `Total costs ${money(tot)}`)));
    out.push(b.el);
  }
  const c = cvBox(t('売上から利益まで', 'From sales to profit'), r.profit >= 0 ? t(`売上の ${Math.round((r.profit / Math.max(1, r.revenue)) * 100)}% が利益に残った`, `${Math.round((r.profit / Math.max(1, r.revenue)) * 100)}% of sales left as profit`) : t('費用が売上を上回った（赤字）', 'Costs exceeded sales (loss)'));
  c.body.append(fallEl(monthFall(r), t(`売上 ${money(r.revenue)} から費用を引いて、利益 ${signed(r.profit, money)}`, `Sales ${money(r.revenue)} minus costs: profit ${signed(r.profit, money)}`)), fallLegend());
  out.push(c.el);
  return out;
}

/**
 * 報告の詰まり：締めの時点で保存した値（Report.bottleneck = jamOf）。SCM ダッシュボードと同じ判定。
 * 古いセーブで保存が無ければ、いまの状態で同じ判定をする（実績の数の少なさでは決めない）
 */
export const reportJam = (s: P1State, r: Report): Stage => r.stall?.stage ?? r.bottleneck ?? jamOf(s);

/** 発表の長さ（ミリ秒）：カウント（金額に関係なく一定）→ 跳ね → 金貨 → 「タップで続ける」。待ちきれなければ 6 秒で自動 */
export const REVEAL = { count: 1600, hit: 400, coins: 800, auto: 6000, zero: 1200, tut: 400 } as const;

/**
 * 発表のカウントアップの値（0〜1 の進み k → 表示する金額）。
 * 進みは減速（1 − (1 − k)²）。途中は下 3 桁が転がる（桁数が多い月は転がり方が速く見えるだけで、長さは同じ）。最後の 15% で正確な値へ。
 * 純粋関数（テスト用に切り出し）
 */
export function countValue(to: number, k: number, rnd = Math.random): number {
  if (k >= 1) return to;
  const e = 1 - Math.pow(1 - k, 2);
  const jitter = k < 0.85 && to >= 1000 ? Math.floor(rnd() * 1000) - 500 : 0;
  return Math.min(to, Math.max(0, Math.round(to * e) + jitter));
}

/**
 * 発表（ドラムロール）を済ませた報告。1 回の報告で発表は 1 回だけ：同じ報告を開き直したとき（まとめ報告の「くわしい報告を見る」など）は
 * 発表を飛ばして本体をすぐ出す（カードの出る演出・順位のポンもしない）
 */
const announced = new WeakSet<Report>();
/** 発表を済ませたか（テスト用） */
export const wasAnnounced = (r: Report) => announced.has(r);

export /** 段 UX1（C-2）：利益に入らない入出金の名前 */
const FLOW_NAME: Record<FlowKey, () => string> = {
  reward: () => t('依頼の報酬', 'Request rewards'),
  event: () => t('できごとの謝礼', 'Event gifts'),
  evsales: () => t('できごとの売上の上乗せ', 'Event sales bonus'),
  permit: () => t('発掘の許可料', 'Dig permits'),
  side: () => t('他店でバイト', 'Part-time work'),
  museum: () => t('展示館の入館料', 'Museum admissions'),
  managed: () => t('任せている町から', 'From delegated towns'),
  tax: () => t('法人税', 'Corporate tax'),
  preopen: () => t('開業前の出費（利益には入る）', 'Pre-opening spend (in profit)'),
};
export function openMonthReport(ctx: Ctx, r: Report, hooks: ReportHooks, then?: () => void) {
  const again = announced.has(r);
  announced.add(r);
  // 段 UIX2s：新しい画面（uix/screens/report.ts）。発表を 1 回だけにする決まり（again）は今のまま
  return uxs.report!(ctx, r, hooks, then, again);
}

// ---------------------------------------------------------------- 発掘作業のまとめ報告（docs/ISLAND_PHASE1.md「まとめ報告」）

export interface DigSummaryHooks {
  /** 「くわしい報告を見る」（最新の月のいつもの月次報告） */
  detail: () => void;
  openNotes?: () => void;
  sfx?: ReportHooks['sfx'];
}

/**
 * 発掘作業のあいだに締めた月（1〜複数）をまとめた 1 枚（スマホ 390×844 でスクロールなし）：
 * 期間の売上の合計（カウントアップ。カウント中のタップで到達）・月ごとの小さな棒・順位の変化・資金の増減・今回の出土・詰まりと打ち手 1 つ。
 * ボタン「くわしい報告を見る」「続ける」。閉じたら then（main.ts が月末ポーズの「次の月へ」を出す）
 */
export function openDigSummary(ctx: Ctx, sum: DigSummary, hooks: DigSummaryHooks, then?: () => void) {
  // まとめ報告の発表は、最新の月の報告の発表も兼ねる（「くわしい報告を見る」でドラムロールを繰り返さない）
  announced.add(sum.latest);
  // 段 UIX2s：新しい画面（uix/screens/report.ts）
  return uxs.digSummary!(ctx, sum, hooks, then);
}
