/**
 * 段 UI7f：倉庫があふれる先の見込み（DOM なし：proj.ts・brief.ts・card.ts・slides.ts・テストが使う。表示だけ・自動プレイには効かない）。
 * - 記録：月の締め（model.ts の endMonth）が、その月末の倉庫（工房の物置・倉庫・物流拠点）の中身を報告に残す（Report.pool）
 * - 増え方：同じ町の月末の記録（直近 STORE_FC.hist 件）といまの中身の、はじめと終わりの差 ÷ 日数（実績の平均の増え方）。
 *   記録が STORE_FC.minDays 日ぶんに満たなければ、先月の流れの数（買った素材 − 作った数 × 1 個の素材 ＋ 作った数 − 運んだ数）
 * - あふれる日：（置ける数 − いまの中身）÷ 1 日の増え。増えていなければ null（あふれない）
 * - あふれたあと：倉庫はもう増えられないので、調達係は空いたぶんしか買えない（model.ts の buy）。増えていたぶん（月の増え）だけ作る数が減る
 *   （作る数 − 月の増え。0 なら調達も製造も止まる）。増えていたのが売れ残りの商品なら、作る数が売れる数まで下がるだけで売上は減らない
 * 仕様は docs/ISLAND_PHASE1.md「倉庫があふれる先の見込み（段 UI7f）」。
 */
import { t } from '../../i18n';
import { STORE_FC } from './data';
import { DAYS, batchOf, poolCap, poolUsed, recipeOf, steadySkus, type P1State } from './model';

/** 月末の倉庫の記録（Report.pool） */
export interface PoolRec {
  month: number;
  day: number;
  mats: number;
  goods: number;
  cap: number;
}
const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce<number>((a, n) => a + (n ?? 0), 0);
/** いまの倉庫の中身（素材は運んでいる・注文中を含む） */
export function poolNow(s: P1State): { mats: number; goods: number; used: number; cap: number } {
  const used = poolUsed(s);
  const goods = sum(s.stock);
  return { mats: used - goods, goods, used, cap: poolCap(s) };
}
/** この町の月末の記録（古い順。いちばん新しいものから n 件。ほかの町の記録・記録の無い月で切れる） */
export function poolHist(s: P1State, n = STORE_FC.hist): PoolRec[] {
  const at = s.sector ?? 'c1';
  const out: PoolRec[] = [];
  for (let k = s.reports.length - 1; k >= 0 && out.length < n; k--) {
    const r = s.reports[k];
    if (!r.pool || r.pool.at !== at) break;
    out.push({ month: r.month, day: r.pool.day, mats: r.pool.mats, goods: r.pool.goods, cap: r.pool.cap });
  }
  return out.reverse();
}

/** 1 個の商品に使う素材の数（作り続ける商品の平均。無ければ 1） */
function matsPerUnit(s: P1State): number {
  const xs = steadySkus(s);
  if (!xs.length) return 1;
  return xs.reduce((a, x) => a + (Object.values(recipeOf(x)) as number[]).reduce((b, q) => b + (q ?? 0), 0) / Math.max(1, batchOf(x, s)), 0) / xs.length;
}

export interface StoreFc {
  /** 記録（古い順） */
  hist: PoolRec[];
  /** いまの中身・置ける数 */
  mats: number;
  goods: number;
  used: number;
  cap: number;
  /** 1 日の増え（合計・素材・商品） */
  perDay: number;
  matsDay: number;
  goodsDay: number;
  /** 増え方の出どころ：hist＝月末の記録（実績）・flow＝先月の流れの数・none＝どちらも無い（増えない扱い） */
  src: 'hist' | 'flow' | 'none';
  /** あふれるまでの日数（もうあふれていれば 0。増えていなければ null） */
  days: number | null;
  /** あふれたあと、作る数が月にいくつ減るか（＝月の増え） */
  cut: number;
}
/** 1 日の増えがこれより小さければ、増えていない扱い */
const FLAT = 0.05;

/**
 * 倉庫があふれる先の見込み。o：置ける数・中身を差し替える（承認後：倉庫が増える・素材を使う）。増え方は同じ（記録といまの町の流れ）
 */
export function storeFc(s: P1State, o: { cap?: number; mats?: number; goods?: number } = {}): StoreFc {
  const now = poolNow(s);
  const hist = poolHist(s);
  let matsDay = 0;
  let goodsDay = 0;
  let src: StoreFc['src'] = 'none';
  // 記録の増え方（いちばん古い記録 → いま。いまが最後の記録と同じ日なら、その記録まで）
  const pts = [...hist.map((r) => ({ day: r.day, mats: r.mats, goods: r.goods }))];
  const last = pts[pts.length - 1];
  if (!last || s.day > last.day) pts.push({ day: s.day, mats: now.mats, goods: now.goods });
  const a = pts[0];
  const b = pts[pts.length - 1];
  if (pts.length >= 2 && b.day - a.day >= STORE_FC.minDays) {
    matsDay = (b.mats - a.mats) / (b.day - a.day);
    goodsDay = (b.goods - a.goods) / (b.day - a.day);
    src = 'hist';
  } else {
    // 先月の流れの数（買った素材は倉庫に入り、作るときに 1 個 mpu 個の素材が出て商品が 1 個入り、運ぶと出る）
    const f = s.reports[s.reports.length - 1]?.flow;
    if (f) {
      const mpu = matsPerUnit(s);
      matsDay = (f.bought - f.made * mpu) / DAYS;
      goodsDay = (f.made - f.hauled) / DAYS;
      src = 'flow';
    }
  }
  const mats = o.mats ?? now.mats;
  const goods = o.goods ?? now.goods;
  const used = mats + goods;
  const cap = o.cap ?? now.cap;
  const perDay = matsDay + goodsDay;
  const days = used >= cap ? 0 : perDay > FLAT ? (cap - used) / perDay : null;
  return { hist, mats, goods, used, cap, perDay, matsDay, goodsDay, src, days, cut: Math.max(0, perDay) * DAYS };
}

/** あふれるまでの言い方（45 日まで「あと 23 日で」、ほかは「3 か月後に」） */
export function whenFull(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d <= 0) return t('もう', 'already');
  if (d <= 45) return t(`あと ${d} 日で`, `in ${d} days`);
  const m = Math.ceil(d / DAYS);
  return t(`${m} か月後に`, `in ${m} months`);
}

// ---------------------------------------------------------------- グラフの数字（倉庫の提案のカード・提案書の結論）

/** 棒 1 本：月末の素材・商品（予想は fc）。label は「○ か月目」の数・いま（月の途中） */
export interface StoreBar {
  label: string;
  mats: number;
  goods: number;
  fc: boolean;
  /** 承認後の中身（予想の月。承認で中身が変わる手＝素材を使う・売りさばくのときだけ） */
  after?: number;
}
export interface StoreChart {
  bars: StoreBar[];
  /** 置ける数（いま）・承認後（変わらなければ null） */
  cap0: number;
  cap1: number | null;
  /** 予想の棒で、置ける数を初めて超える棒の番号（このまま・承認後。超えなければ null） */
  over0: number | null;
  over1: number | null;
  /** あふれるまでの日数（このまま・承認後） */
  days0: number | null;
  days1: number | null;
  src: StoreFc['src'];
  /** 予想の 1 か月の増え（合計） */
  perMonth: number;
}
/**
 * 倉庫の提案のグラフ：直近の月末の記録（実績の棒）→ これからの月末の予想（同じペースで伸ばす）。after：承認後の状態（無ければこのままだけ）
 */
export function storeChart(s: P1State, after?: P1State | null): StoreChart {
  const fc = storeFc(s);
  const aft = after ? poolNow(after) : null;
  const fc1 = aft ? storeFc(s, { cap: aft.cap, mats: aft.mats, goods: aft.goods }) : null;
  const bars: StoreBar[] = fc.hist.map((r) => ({ label: String(r.month), mats: r.mats, goods: r.goods, fc: false }));
  const lastRec = fc.hist[fc.hist.length - 1];
  const mid = !lastRec || s.day > lastRec.day;
  if (mid) bars.push({ label: t('いま', 'Now'), mats: fc.mats, goods: fc.goods, fc: false });
  const m0 = lastRec?.month ?? (s.reports[s.reports.length - 1]?.month ?? 0);
  const d0 = lastRec?.day ?? s.day;
  // 予想の月の数：あふれる月まで（STORE_FC.max まで）。あふれないなら STORE_FC.ahead
  const until = (d: number | null) => (d == null ? 0 : Math.ceil((s.day + d - d0) / DAYS));
  const n = Math.max(STORE_FC.ahead, Math.min(STORE_FC.max, Math.max(until(fc.days), until(fc1?.days ?? null))));
  const first = bars.length;
  const changed = !!aft && Math.abs(aft.used - fc.used) >= 0.5;
  for (let j = 1; j <= n; j++) {
    const dt = d0 + j * DAYS - s.day;
    const bar: StoreBar = { label: String(m0 + j), mats: Math.max(0, fc.mats + fc.matsDay * dt), goods: Math.max(0, fc.goods + fc.goodsDay * dt), fc: true };
    if (changed && fc1) bar.after = Math.max(0, fc1.mats + fc1.matsDay * dt) + Math.max(0, fc1.goods + fc1.goodsDay * dt);
    bars.push(bar);
  }
  const over = (cap: number, v: (b: StoreBar) => number) => {
    const k = bars.findIndex((b, i) => i >= first && v(b) >= cap - 1e-6);
    return k >= 0 ? k : null;
  };
  const tot = (b: StoreBar) => b.mats + b.goods;
  const cap1 = aft && aft.cap !== fc.cap ? aft.cap : null;
  return {
    bars,
    cap0: fc.cap,
    cap1,
    over0: fc.days === 0 ? null : over(fc.cap, tot),
    over1: aft ? over(aft.cap, (b) => b.after ?? tot(b)) : null,
    days0: fc.days,
    days1: fc1 ? fc1.days : null,
    src: fc.src,
    perMonth: fc.perDay * DAYS,
  };
}
