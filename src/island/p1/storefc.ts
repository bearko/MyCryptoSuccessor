/**
 * 段 UI7f：倉庫があふれる先の見込み（DOM なし：proj.ts・brief.ts・card.ts・slides.ts・テストが使う。表示だけ・自動プレイには効かない）。
 * - 記録：月の締め（model.ts の endMonth）が、その月末の倉庫（工房の物置・倉庫・物流拠点）の中身を報告に残す（Report.pool）
 * - 増え方：同じ町の月末の記録（直近 STORE_FC.hist 件）といまの中身の、はじめと終わりの差 ÷ 日数（実績の平均の増え方）。
 *   記録が STORE_FC.minDays 日ぶんに満たなければ、先月の流れの数（買った素材 − 作った数 × 1 個の素材 ＋ 作った数 − 運んだ数）
 * - あふれる日：（置ける数 − いまの中身）÷ 1 日の増え。増えていなければ null（あふれない）
 * - あふれたあと：倉庫はもう増えられないので、調達係は空いたぶんしか買えない（model.ts の buy）。
 *   - 商品の増え（作る数が売れる数より多い）：そのぶんだけ作る数が減る（作る数が売れる数まで下がるだけで、売上は減らない）
 *   - 素材の増え（使わない素材・出土品がたまる）：たまった素材は出ていかないので、調達する素材の置き場所（いま手元にある、作り続ける商品の素材の数）が
 *     日に素材の増えだけ減っていき、ramp 日でなくなる（作る数は ramp 日かけて 0 へ。調達も製造も止まり、お店は在庫だけ）
 * 仕様は docs/ISLAND_PHASE1.md「倉庫があふれる先の見込み（段 UI7f）」。
 */
import { t } from '../../i18n';
import { SALES1, STORE_FC } from './data';
import { DAYS, batchOf, date, goodsRoom, poolCap, poolUsed, procMats, recipeOf, steadySkus, type P1State } from './model';

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
  const goods = Math.ceil(goodsRoom(sum(s.stock)) - 1e-9);
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
  /** あふれたあと、作る数が月にいくつ減るか（商品の増えのぶん。個） */
  cut: number;
  /** あふれたあと、調達する素材の置き場所がなくなるまでの日数（素材が増えていなければ null） */
  ramp: number | null;
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
      goodsDay = goodsRoom(f.made - f.hauled) / DAYS;
      src = 'flow';
    }
  }
  const mats = o.mats ?? now.mats;
  const goods = o.goods ?? now.goods;
  const used = mats + goods;
  const cap = o.cap ?? now.cap;
  const perDay = matsDay + goodsDay;
  const days = used >= cap ? 0 : perDay > FLAT ? (cap - used) / perDay : null;
  // 調達する素材の置き場所：いま手元にある（運んでいる・注文中を含む）、作り続ける商品の素材
  const pm = new Set<string>(procMats(s).map((x) => x.m));
  const live = (Object.entries(s.mats) as [string, number][]).reduce((a, [m, n]) => a + (pm.has(m) ? n ?? 0 : 0), 0) + (s.buyTrip ? sum(s.buyTrip.cargo) : 0) + (s.orders ?? []).reduce((a, o) => a + o.qty, 0);
  const ramp = matsDay > FLAT ? Math.max(1, live / matsDay) : null;
  // 段 SALES1：goodsDay は枠（goodsRoom）なので、作る数（個）に直すときは SALES1.units を掛ける
  return { hist, mats, goods, used, cap, perDay, matsDay, goodsDay, src, days, cut: Math.max(0, goodsDay) * DAYS * SALES1.units, ramp };
}

/** あふれるまでの言い方（45 日まで「あと 23 日で」、ほかは「3 か月後に」） */
export function whenFull(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d <= 0) return t('もう', 'already');
  if (d <= 45) return t(`あと ${d} 日で`, `in ${d} days`);
  const m = Math.ceil(d / DAYS);
  return t(`${m} か月後に`, `in ${m} months`);
}

// ---------------------------------------------------------------- 月の名前（グラフの横軸と同じ、ゲームの暦の月）

/** 通算の月（報告の month。1 始まり）→ 年目と月 */
export const ymOf = (m: number) => ({ y: 1 + Math.floor((m - 1) / 12), m: ((m - 1) % 12) + 1 });
/** いまの年目（開店前は 1） */
const yearNow = (s: Pick<P1State, 'day' | 'open'>) => date(s)?.year ?? 1;
/** 通算の月の名前（「7 月」・年をまたげば「来年 2 月」「2 年後の 2 月」） */
export function monthName(s: Pick<P1State, 'day' | 'open'>, m: number): string {
  const { y, m: mm } = ymOf(m);
  const dy = y - yearNow(s);
  if (dy <= 0) return t(`${mm} 月`, `M${mm}`);
  if (dy === 1) return t(`来年 ${mm} 月`, `next year M${mm}`);
  return t(`${dy} 年後の ${mm} 月`, `M${mm} in ${dy} years`);
}
/** いまから days 日後が入る通算の月（開店前は null） */
export function monthAt(s: Pick<P1State, 'day' | 'open'>, days: number): number | null {
  if (s.open == null) return null;
  return 1 + Math.floor((s.day + Math.max(0, days) - s.open) / DAYS);
}
/** あふれる月の言い方（「7 月に」）・持つ月（あふれる月の前の月まで：「9 月まで」）。開店前は whenFull */
export const fullMonth = (s: P1State, days: number) => {
  const m = monthAt(s, days);
  return m == null ? whenFull(days) : t(`${monthName(s, m)}に`, `in ${monthName(s, m)}`);
};
export const holdMonth = (s: P1State, days: number) => {
  const m = monthAt(s, days);
  return m == null ? whenFull(days) : t(`${monthName(s, Math.max(1, m - 1))}まで`, `through ${monthName(s, Math.max(1, m - 1))}`);
};

// ---------------------------------------------------------------- グラフの数字（倉庫の提案のカード・提案書の結論）

/** 棒 1 本：月末の素材・商品（予想は fc）。label は横軸の月（暦の月の数）・いま（月の途中）、name は文の月（「7 月」「来年 2 月」） */
export interface StoreBar {
  label: string;
  name: string;
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
 * 倉庫の提案のグラフ：直近の月末の記録（実績の棒）→ これからの月末の予想（同じペースで伸ばす）。
 * after：承認後の置き場所（cap）と、承認で空く中身（free：いまの素材で作るで使う素材など。days 日かけて空く）。無ければこのままだけ
 */
export function storeChart(s: P1State, after?: { cap: number; free: number; days?: number } | null): StoreChart {
  const fc = storeFc(s);
  const free = after ? Math.min(fc.mats, Math.max(0, after.free)) : 0;
  const aft = after ? { cap: after.cap, mats: fc.mats - free, goods: fc.goods, used: fc.used - free } : null;
  const fc1 = aft ? storeFc(s, { cap: aft.cap, mats: aft.mats, goods: aft.goods }) : null;
  const lab = (m: number) => String(ymOf(m).m);
  const bars: StoreBar[] = fc.hist.map((r) => ({ label: lab(r.month), name: monthName(s, r.month), mats: r.mats, goods: r.goods, fc: false }));
  const lastRec = fc.hist[fc.hist.length - 1];
  const mid = !lastRec || s.day > lastRec.day;
  if (mid) bars.push({ label: t('いま', 'Now'), name: t('いま', 'now'), mats: fc.mats, goods: fc.goods, fc: false });
  const m0 = lastRec?.month ?? (s.reports[s.reports.length - 1]?.month ?? 0);
  const d0 = lastRec?.day ?? s.day;
  // 予想の月の数：あふれる月まで（STORE_FC.max まで）。あふれないなら STORE_FC.ahead
  const until = (d: number | null) => (d == null ? 0 : Math.ceil((s.day + d - d0) / DAYS));
  const n = Math.max(STORE_FC.ahead, Math.min(STORE_FC.max, Math.max(until(fc.days), until(fc1?.days ?? null))));
  const first = bars.length;
  const changed = !!aft && Math.abs(aft.used - fc.used) >= 0.5;
  for (let j = 1; j <= n; j++) {
    const dt = d0 + j * DAYS - s.day;
    const bar: StoreBar = { label: lab(m0 + j), name: monthName(s, m0 + j), mats: Math.max(0, fc.mats + fc.matsDay * dt), goods: Math.max(0, fc.goods + fc.goodsDay * dt), fc: true };
    if (changed && fc1) {
      // 空くのは days 日かけて（いまの素材で作るは、作り終えるまで少しずつ素材を使う）
      const k = after?.days ? Math.min(1, dt / after.days) : 1;
      bar.after = Math.max(0, fc.mats - free * k + fc1.matsDay * dt) + Math.max(0, fc1.goods + fc1.goodsDay * dt);
    }
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

const fmtN = (v: number) => Math.abs(Math.round(v)).toLocaleString('en-US');
/** あふれる先の 1 行（このまま・承認後。グラフの下） */
export function storeNote(c: StoreChart): string {
  const pm = Math.round(c.perMonth);
  const pace = c.src === 'none' ? t('記録がまだ無い', 'no records yet') : t(`同じペース（月 ${pm >= 0 ? '+' : '−'}${fmtN(pm)} 個${c.src === 'hist' ? '・月末の記録から' : '・先月の流れから'}）`, `same pace (${pm >= 0 ? '+' : '−'}${fmtN(pm)}/mo${c.src === 'hist' ? ', from month-end records' : ', from last month’s flow'})`);
  const first = c.bars.findIndex((b) => b.fc);
  const now = c.days0 === 0 ? t('もうあふれている', 'already full') : c.over0 != null ? t(`As-Is：${c.bars[c.over0].name}にあふれる`, `As-Is: fills in ${c.bars[c.over0].name}`) : t('As-Is：グラフの間はあふれない', 'As-Is: doesn’t fill in this window');
  const hasAfter = c.cap1 != null || c.bars.some((b) => b.after != null);
  const o1 = c.over1;
  const aft = !hasAfter ? '' : o1 == null ? t('／To-Be：あふれない', ' / To-Be: doesn’t fill') : o1 - 1 >= first && first >= 0 ? t(`／To-Be：${c.bars[o1 - 1].name}まで持つ`, ` / To-Be: lasts through ${c.bars[o1 - 1].name}`) : t(`／To-Be：${c.bars[o1].name}にあふれる`, ` / To-Be: fills in ${c.bars[o1].name}`);
  return t(`${now}${aft}（${pace}）`, `${now}${aft} (${pace})`);
}
