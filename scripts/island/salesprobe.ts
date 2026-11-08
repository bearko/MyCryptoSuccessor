/**
 * 段 SALES1 の下調べ：自動プレイ（ふつうは通常・シード 1）を 1 回回し、ランクごとの終わりの 30 日で
 * 1 日に売れる数（お店ごと・合計）・自社どうしの取り合いの割合・ボトルネックの日数の割合を数える。
 * 走らせ方：`SALES1_PROBE=1 npx vitest run tests/island-p1-sales1.test.ts -t 下調べ --silent=false`（数分かかる。CPU を 1 つ使う）
 */
import { DAYS, cannibalRate, myShops, shopSplit, type DayResult, type P1State } from '../../src/island/p1/model';
import type { Tier } from '../../src/island/p1/data';
import { readBn, runOnce, type PolicyId } from './sim';

type Stage = 'buy' | 'craft' | 'haul' | 'sell';
interface DayRec {
  units: number;
  yen: number;
  shops: number;
  /** 棚に並べているお店ごとの 1 日の数 */
  perShop: number[];
  /** 取り合いの割合（5 日に 1 回だけ数える。数えない日は null） */
  cannibal: number | null;
  /** 需要から取れる数（棚に並んでいるとして）÷ 30 − 売れた数（逃した数の目安。0 未満は 0） */
  missed: number | null;
}
export interface TierProbe {
  tier: Tier;
  days: number;
  /** 終わりの 30 日の平均 */
  unitsPerDay: number;
  yenPerDay: number;
  shops: number;
  perShop: number;
  unitPrice: number;
  cannibal: number;
  missedPerDay: number;
  /** そのランクにいた日のうち、ボトルネックがその段だった日の割合 */
  bn: Record<Stage, number>;
}
export interface SalesProbe {
  policy: PolicyId;
  seed: number;
  tiers: TierProbe[];
  /** 最初の町で、お店が 1 軒のとき、はじめて売れた日からの 30 日の 1 日の数（平均と最大） */
  early: { days: number; avg: number; max: number; yenAvg: number };
  /** 30 日ごと：セクタ・お店・1 日の数・1 日の売上・取り合い・ボトルネックの多い段 */
  months: { sector: string; shops: number; units: number; yen: number; cannibal: number; sell: number }[];
}

export function salesProbe(policy: PolicyId = 'normal', seed = 1): SalesProbe {
  const recs: Partial<Record<Tier, DayRec[]>> = {};
  const bn: Partial<Record<Tier, Record<Stage, number>>> = {};
  const early: DayRec[] = [];
  const months: SalesProbe['months'] = [];
  let mon: { sector: string; recs: DayRec[]; sell: number } = { sector: 'c1', recs: [], sell: 0 };
  let k = 0;
  runOnce(policy, seed, {
    onDay: (s: P1State, _sector: string, d: DayResult) => {
      const tier = (s.tier ?? 'C') as Tier;
      const on = myShops(s).filter((b) => s.shops[b.uid]?.shelves.some((x) => x));
      const by: Record<number, number> = {};
      for (const x of d.sales) by[x.uid] = (by[x.uid] ?? 0) + 1;
      const units = d.sales.length;
      const yen = d.sales.reduce((a, x) => a + x.yen, 0);
      const counting = k++ % 5 === 0 && on.length > 0;
      const split = counting ? shopSplit(s) : null;
      const est = split ? Object.values(split).reduce((a, v) => a + v.sold, 0) / DAYS : 0;
      const rec: DayRec = { units, yen, shops: on.length, perShop: on.map((b) => by[b.uid] ?? 0), cannibal: split ? cannibalRate(s, split) : null, missed: split ? Math.max(0, est - units) : null };
      (recs[tier] ??= []).push(rec);
      const b = (bn[tier] ??= { buy: 0, craft: 0, haul: 0, sell: 0 });
      if (on.length) b[readBn(s) as Stage]++;
      if (s.sector === 'c1' && on.length === 1 && (early.length || rec.units > 0) && early.length < 30) early.push(rec);
      mon.recs.push(rec);
      mon.sector = s.sector ?? 'c1';
      if (on.length && readBn(s) === 'sell') mon.sell++;
      if (mon.recs.length >= 30) {
        const r = mon.recs;
        const av = (f: (x: DayRec) => number) => r.reduce((a, x) => a + f(x), 0) / r.length;
        const cs = r.filter((x) => x.cannibal != null);
        months.push({ sector: mon.sector, shops: av((x) => x.shops), units: av((x) => x.units), yen: av((x) => x.yen), cannibal: cs.length ? cs.reduce((a, x) => a + x.cannibal!, 0) / cs.length : 0, sell: mon.sell / r.length });
        mon = { sector: mon.sector, recs: [], sell: 0 };
      }
    },
  });
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  const tiers: TierProbe[] = [];
  for (const tier of ['C', 'U', 'R', 'E', 'L'] as Tier[]) {
    const all = recs[tier];
    if (!all?.length) continue;
    const last = all.filter((r) => r.shops > 0).slice(-30);
    const b = bn[tier]!;
    const n = b.buy + b.craft + b.haul + b.sell || 1;
    const units = avg(last.map((r) => r.units));
    tiers.push({
      tier,
      days: all.length,
      unitsPerDay: units,
      yenPerDay: avg(last.map((r) => r.yen)),
      shops: avg(last.map((r) => r.shops)),
      perShop: avg(last.map((r) => avg(r.perShop))),
      unitPrice: units > 0 ? avg(last.map((r) => r.yen)) / units : 0,
      cannibal: avg(last.filter((r) => r.cannibal != null).map((r) => r.cannibal!)),
      missedPerDay: avg(last.filter((r) => r.missed != null).map((r) => r.missed!)),
      bn: { buy: b.buy / n, craft: b.craft / n, haul: b.haul / n, sell: b.sell / n },
    });
  }
  return { policy, seed, tiers, early: { days: early.length, avg: avg(early.map((r) => r.units)), max: Math.max(0, ...early.map((r) => r.units)), yenAvg: avg(early.map((r) => r.yen)) }, months };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
export function probeTable(p: SalesProbe): string {
  const rows = p.tiers.map(
    (t) =>
      `| ${t.tier} | ${t.days} | ${t.shops.toFixed(1)} | ${t.unitsPerDay.toFixed(1)} | ${t.perShop.toFixed(1)} | ${Math.round(t.unitPrice).toLocaleString()} | ${Math.round(t.yenPerDay).toLocaleString()} | ${pct(t.cannibal)} | ${t.missedPerDay.toFixed(1)} | ${pct(t.bn.sell)} / ${pct(t.bn.craft)} / ${pct(t.bn.haul)} / ${pct(t.bn.buy)} |`,
  );
  return [
    `方針 ${p.policy}・シード ${p.seed}。序盤（最初の町・お店 1 軒・はじめて売れた日から ${p.early.days} 日）：1 日 平均 ${p.early.avg.toFixed(1)} 個（最大 ${p.early.max}）・${Math.round(p.early.yenAvg).toLocaleString()} G`,
    '',
    '| ランク | 日数 | お店 | 1 日の数（合計） | 1 日の数（1 軒） | 単価（G） | 1 日の売上（G） | 取り合い | 逃した数／日 | ボトルネック 販売／製造／輸送／調達 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
    '',
    '30 日ごと：' + p.months.map((m, i) => `${i + 1}:${m.sector} 店${m.shops.toFixed(1)} ${m.units.toFixed(1)}個 ${Math.round(m.yen)}G 取${pct(m.cannibal)} 販${pct(m.sell)}`).join(' / '),
  ].join('\n');
}
