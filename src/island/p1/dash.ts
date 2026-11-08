/**
 * 段 UI8：数字の報告をグラフに（ゲーム全体）。グラフに渡す数をまとめる（DOM なし：chartkit.ts の部品と、テストが使う）。
 * - 月次報告：費用の内訳（ドーナツ）・商品ごとの売上の割合（100% の積み上げ棒）・売上から利益までの差し引き（ウォーターフォール）・
 *   資金の月の動き（ろうそく足：月のはじめ・いちばん高い・いちばん安い・月末）・順位（横棒とゴールライン）
 * - 決算書：P/L の差し引き（ウォーターフォール）・B/S の資産の中身（ドーナツ）・四半期の推移（線）
 * - 部門の画面：お店の売上 × 利益率（バブル）・士気と顧客満足度の推移（線と帯の基準線）・部門 × 月の予算の使い方（ヒートマップ）
 * 決まりは docs/ISLAND_UX_CHARTER.md「2-7. 数字の報告は、文字よりグラフ」と「2-8. 段 UI8 の棚卸し」。表示だけ（ゲームの数字・自動プレイには効かない）。
 */
import { t } from '../../i18n';
import { CS, DEPT, MORALE, PRODUCT, type DeptId } from './data';
import { pl, quarters, type Balance, type Books, type Ledger, type SectorRec } from './company';
import type { P1State, Rank, Report } from './model';

// ---------------------------------------------------------------- 月の名前

/** 会社の月 m（1 から）→ 年と月 */
export const ymOfMonth = (m: number) => ({ y: 1 + Math.floor((Math.max(1, m) - 1) / 12), m: ((Math.max(1, m) - 1) % 12) + 1 });
/** 横軸の短い名前（1 年目は「3月」、2 年目からの 1 月と最初の目盛りは「2年 1月」） */
export function monLab(m: number, first = false): string {
  const d = ymOfMonth(m);
  return d.y > 1 && (first || d.m === 1) ? t(`${d.y}年 ${d.m}月`, `Y${d.y} M${d.m}`) : t(`${d.m}月`, `M${d.m}`);
}
/** 吹き出しの見出し（年も） */
export const monHead = (m: number) => {
  const d = ymOfMonth(m);
  return t(`${d.y}年目 ${d.m}月`, `Y${d.y} M${d.m}`);
};

// ---------------------------------------------------------------- 割合（ドーナツ・100% の積み上げ）

/** 割合の 1 切れ：色（不透明）と模様（色だけに頼らない）と名前・値 */
export interface Part {
  key: string;
  name: string;
  v: number;
  /** 色の番号（chartkit の PALETTE）・模様（塗り・点・斜線・格子・横縞） */
  col: number;
  pat: 'solid' | 'dots' | 'hatch' | 'grid' | 'stripe';
}
const PATS: Part['pat'][] = ['solid', 'dots', 'hatch', 'grid', 'stripe'];

/** 月の費用の内訳（素材・給料・アルバイト・維持費・建物とスキル・宣伝）。0 は出さない・大きい順 */
export function costParts(c: Report['costs']): Part[] {
  const xs: [keyof Report['costs'], string][] = [
    ['materials', t('素材', 'Materials')],
    ['wages', t('給料', 'Wages')],
    ['part', t('アルバイト', 'Part-timers')],
    ['upkeep', t('維持費', 'Upkeep')],
    ['build', t('建物とスキル', 'Buildings & skills')],
    ['ads', t('宣伝', 'Ads')],
    // 段 TRADE1a：となり町から取り寄せた素材の関税
    ['duty', t('関税', 'Duty')],
  ];
  // 色と模様は科目で決める（月が変わっても同じ科目は同じ見た目）
  return xs
    .map(([k, name], i) => ({ key: k, name, v: Math.max(0, Math.round(c[k] ?? 0)), col: i, pat: PATS[i % PATS.length] }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
}

/** 商品ごとの売上の割合：大きい順に top 個、残りは「その他」 */
export function salesParts(by: Partial<Record<string, number>>, top = 4): Part[] {
  const xs = Object.entries(by)
    .filter(([, v]) => (v ?? 0) > 0)
    .map(([k, v]) => ({ key: k, name: PRODUCT[k]?.name ?? k, v: Math.round(v ?? 0) }))
    .sort((a, b) => b.v - a.v);
  const head = xs.slice(0, top).map((x, i) => ({ ...x, col: i, pat: PATS[i % PATS.length] }));
  const rest = xs.slice(top).reduce((a, x) => a + x.v, 0);
  if (rest > 0) head.push({ key: 'other', name: t('その他', 'Other'), v: rest, col: 7, pat: 'stripe' });
  return head;
}

// ---------------------------------------------------------------- 差し引き（ウォーターフォール）

/** ウォーターフォールの 1 本：start（はじめの合計）・up（足す）・down（引く）・total（途中・最後の合計）。from → to は棒の両端 */
export interface Step {
  key: string;
  name: string;
  kind: 'start' | 'up' | 'down' | 'total';
  v: number;
  from: number;
  to: number;
}
/** 段の並び（名前・増減）から、棒の両端を数える。total は、そこまでの合計 */
export function steps(xs: { key: string; name: string; v: number; total?: boolean }[]): Step[] {
  let at = 0;
  return xs.map((x, i) => {
    if (i === 0) {
      at = x.v;
      return { key: x.key, name: x.name, kind: 'start', v: x.v, from: 0, to: x.v };
    }
    if (x.total) return { key: x.key, name: x.name, kind: 'total', v: at, from: 0, to: at };
    const from = at;
    at += x.v;
    return { key: x.key, name: x.name, kind: x.v >= 0 ? 'up' : 'down', v: x.v, from, to: at };
  });
}
/** 月次報告：売上 → 費用（大きい順）→ 利益。最後の利益は Report.profit と一致する */
export function monthFall(r: Report): Step[] {
  const cs = costParts(r.costs);
  return steps([{ key: 'rev', name: t('売上', 'Sales'), v: r.revenue }, ...cs.map((c) => ({ key: c.key, name: c.name, v: -c.v })), { key: 'profit', name: t('利益', 'Profit'), v: 0, total: true }]);
}
/** 決算書の P/L：売上高 → 原価 → 販管費 → 営業利益 → 営業外 → 投資・特別 → 法人税 → 当期の利益（pl と一致） */
export function plFall(l: Ledger): Step[] {
  const p = pl(l);
  const xs: { key: string; name: string; v: number; total?: boolean }[] = [
    { key: 'sales', name: t('売上高', 'Sales'), v: p.sales },
    { key: 'cogs', name: t('原価（素材）', 'Cost of goods'), v: -p.cogs },
    { key: 'gross', name: t('売上総利益', 'Gross profit'), v: 0, total: true },
    { key: 'sga', name: t('販管費', 'SG&A'), v: -p.sga },
    { key: 'op', name: t('営業利益', 'Operating profit'), v: 0, total: true },
  ];
  if (Math.round(p.nonop)) xs.push({ key: 'nonop', name: t('営業外', 'Other income'), v: p.nonop });
  if (Math.round(p.special)) xs.push({ key: 'special', name: t('投資・特別', 'Investment & special'), v: -p.special });
  if (Math.round(p.tax)) xs.push({ key: 'tax', name: t('法人税', 'Tax'), v: -p.tax });
  xs.push({ key: 'net', name: t('当期の利益', 'Net profit'), v: 0, total: true });
  return steps(xs);
}

/** B/S の資産の中身（現金・在庫・建物・投資） */
export function bsParts(b: Balance): Part[] {
  return [
    { key: 'cash', name: t('現金', 'Cash'), v: Math.round(b.cash), col: 2, pat: 'solid' as const },
    { key: 'stock', name: t('在庫', 'Inventory'), v: Math.round(b.stock), col: 0, pat: 'dots' as const },
    { key: 'buildings', name: t('建物', 'Buildings'), v: Math.round(b.buildings), col: 3, pat: 'hatch' as const },
    { key: 'invest', name: t('他セクタへの投資', 'Invested in sectors'), v: Math.round(b.invest), col: 5, pat: 'grid' as const },
  ].filter((x) => x.v > 0);
}

/** 四半期ごとの売上高と当期の利益（締めた四半期と、いまの四半期の途中） */
export function quarterTrend(b: Books | undefined, n = 8): { q: number; sales: number; net: number; done: boolean }[] {
  if (!b) return [];
  return quarters(b)
    .slice(-n)
    .map((x) => ({ q: x.q, sales: Math.round(x.l.sales), net: Math.round(pl(x.l).net), done: x.done }));
}

// ---------------------------------------------------------------- 資金のろうそく足

/** 月のはじめ（o）・いちばん高い（h）・いちばん安い（l）・月末（c）。以前の報告（高い・安いの記録が無い）は、はじめと終わりの範囲だけ（est） */
export interface Candle {
  month: number;
  o: number;
  h: number;
  l: number;
  c: number;
  est: boolean;
}
export function moneyCandles(rs: Report[]): Candle[] {
  return rs
    .filter((r) => !!r.money)
    .map((r) => {
      const m = r.money!;
      const has = m.hi != null && m.lo != null;
      return { month: r.month, o: m.start, c: m.end, h: Math.max(m.start, m.end, has ? m.hi! : -Infinity), l: Math.min(m.start, m.end, has ? m.lo! : Infinity), est: !has };
    });
}

// ---------------------------------------------------------------- 順位

/** 順位の横棒：自社の印・次の順位までの差・1 位と 2 位の間のゴールライン */
export function rankRows(area: Rank[]): { name: string; v: number; me: boolean }[] {
  return area.map((x) => ({ name: x.me ? t('あなたの会社', 'Your company') : x.name, v: Math.round(x.sales), me: x.me }));
}
/** 自社の順位の推移（月ごと。記録が無い月は null） */
export function rankHist(rs: Report[], n = 12): { month: number; rank: number; of: number }[] {
  return rs.slice(-n).map((r) => ({ month: r.month, rank: r.rank, of: Math.max(r.rank, r.area.length) }));
}

// ---------------------------------------------------------------- 部門の画面

/** お店のバブル：横＝売上・縦＝利益率（素材代とアルバイト代を引いた割合）・大きさ＝商圏の家。先月の結果があれば先月、無ければ今月のここまで */
export interface Bubble {
  key: string;
  name: string;
  x: number;
  y: number;
  r: number;
  last: boolean;
}
export function shopBubbles(rows: { uid: number; name: string; homes: number }[], shops: P1State['shops']): Bubble[] {
  return rows
    .map((x) => {
      const sh = shops[x.uid];
      const last = !!sh?.last && sh.last.rev > 0;
      const rev = last ? sh.last!.rev : (sh?.rev ?? 0);
      const cost = last ? sh.last!.cost : (sh?.cost ?? 0);
      return { key: String(x.uid), name: x.name, x: Math.round(rev), y: rev > 0 ? Math.round(((rev - cost) / rev) * 100) : 0, r: x.homes, last };
    })
    .filter((b) => b.x > 0);
}

/** 月の締めの記録の推移（士気の平均・顧客満足度）。記録の無い月は抜く */
export function moraleHist(rs: Report[], n = 12): { month: number; v: number }[] {
  return rs
    .filter((r) => r.hr?.avg != null)
    .slice(-n)
    .map((r) => ({ month: r.month, v: r.hr!.avg! }));
}
export function satHist(rs: Report[], n = 12): { month: number; v: number }[] {
  return rs
    .filter((r) => !!r.cs)
    .slice(-n)
    .map((r) => ({ month: r.month, v: r.cs!.sat }));
}
/** 帯の基準線（士気：速くなる・遅くなる。満足度：ブランド力 +1・−1） */
export const MORALE_REFS = () => [
  { v: MORALE.band.hi, label: t(`${MORALE.band.hi} 速くなる`, `${MORALE.band.hi} faster`), cls: 'is-hi' },
  { v: MORALE.band.lo, label: t(`${MORALE.band.lo} 遅くなる`, `${MORALE.band.lo} slower`), cls: 'is-lo' },
];
export const SAT_REFS = () => [
  { v: CS.brandHi, label: t(`${CS.brandHi} ブランド +1`, `${CS.brandHi} brand +1`), cls: 'is-hi' },
  { v: CS.brandLo, label: t(`${CS.brandLo} ブランド −1`, `${CS.brandLo} brand −1`), cls: 'is-lo' },
];

/** 部門 × 月のヒートマップ：使った ÷ 月の予算（%）。予算の記録（Report.budget）のある月だけ */
export interface Heat {
  rows: { key: DeptId; name: string; color: string }[];
  cols: { month: number; label: string }[];
  /** rows × cols。null＝その月はその部門の記録が無い */
  cells: (null | { pct: number; used: number; amt: number; acts: number })[][];
}
export function budgetHeat(rs: Report[], n = 6): Heat {
  const ms = rs.filter((r) => r.budget?.depts.length).slice(-n);
  const ids: DeptId[] = [];
  for (const r of ms) for (const d of r.budget!.depts) if (!ids.includes(d.dept)) ids.push(d.dept);
  return {
    rows: ids.map((d) => ({ key: d, name: DEPT[d].short, color: DEPT[d].color })),
    cols: ms.map((r, k) => ({ month: r.month, label: monLab(r.month, k === 0) })),
    cells: ids.map((d) =>
      ms.map((r) => {
        const x = r.budget!.depts.find((y) => y.dept === d);
        if (!x) return null;
        return { pct: x.amt > 0 ? Math.round((x.used / x.amt) * 100) : 0, used: Math.round(x.used), amt: Math.round(x.amt), acts: x.acts };
      }),
    ),
  };
}
/** ヒートマップの濃さの段（0〜4）：0%・〜50%・〜90%・〜110%・それより上（予算を超えた） */
export const heatStep = (pct: number) => (pct <= 0 ? 0 : pct < 50 ? 1 : pct < 90 ? 2 : pct <= 110 ? 3 : 4);

/** 前の月との差（▲▼）：前が無ければ null */
export const delta = (cur: number, prev: number | null | undefined) => (prev == null ? null : cur - prev);

// ---------------------------------------------------------------- 段 UI8b：推移の線（記録がもうある所から）

/**
 * ブランド力の月末の推移。記録（Report.brandEnd）のある月はそのまま、無い以前の月は、すぐ後の月の値からその月の増え（Report.brand）を
 * 引いてさかのぼる（est。ほかの町にいた間の動きは入らないので「さかのぼった値」として点線で）。now0：今月のはじめのブランド力（会社の最後の締めの値）
 */
export function brandHist(rs: Report[], now0: number, n = 12): { month: number; v: number; est: boolean }[] {
  const xs = rs.slice(-n);
  const out: { month: number; v: number; est: boolean }[] = [];
  let next = now0;
  for (let k = xs.length - 1; k >= 0; k--) {
    const r = xs[k];
    const v = r.brandEnd ?? next;
    // 記録の無い月は、さかのぼった値（町を移った間の動きは入らない）
    out.push({ month: r.month, v: Math.max(0, Math.round(v)), est: r.brandEnd == null });
    next = v - (r.brand ?? 0);
  }
  return out.reverse();
}

/** 商圏の自社の取り分（%）の推移（Rare の町の報告だけ） */
export function shareHist(rs: Report[], n = 12): { month: number; v: number }[] {
  return rs
    .filter((r) => !!r.trade)
    .slice(-n)
    .map((r) => ({ month: r.month, v: Math.round(r.trade!.share * 1000) / 10 }));
}

/** SCM の月ごとの流れ（買った素材・作った・運んだ・売れた。個） */
export function flowHist(rs: Report[], n = 12): { month: number; bought: number; made: number; hauled: number; sold: number }[] {
  return rs
    .filter((r) => !!r.flow)
    .slice(-n)
    .map((r) => ({ month: r.month, ...r.flow! }));
}

/** 展示館の来館者と入館料の推移 */
export function museumHist(rs: Report[], n = 12): { month: number; visitors: number; income: number }[] {
  return rs
    .filter((r) => !!r.museum)
    .slice(-n)
    .map((r) => ({ month: r.month, visitors: r.museum!.visitors, income: Math.round(r.museum!.income) }));
}

/** セクター長の月ごとの結果（売上・利益・本社へ） */
export function sectorHist(rec: Pick<SectorRec, 'log'>, n = 12): SectorRec['log'] {
  return rec.log.slice(-n);
}

/** 税の見込み（いまの四半期）：課税の対象の利益 → 節税の差し引き → 課税される額 → 税（税率） */
export function taxFall(p: { base: number; ded: number; tax: number }): Step[] {
  return steps([
    { key: 'base', name: t('対象の利益', 'Taxable profit'), v: p.base },
    { key: 'ded', name: t('節税の差し引き', 'Deductions'), v: -p.ded },
    { key: 'taxable', name: t('課税される額', 'Taxed amount'), v: 0, total: true },
    { key: 'tax', name: t('法人税', 'Tax'), v: -p.tax },
    { key: 'after', name: t('税のあと', 'After tax'), v: 0, total: true },
  ]);
}

// ---------------------------------------------------------------- 段 UI8c：カリスマ度・セクタの比べ・他社の売れ筋・研究ノート

/** カリスマ度の内訳（積み上げのメーターの切れ。0 は出さない。色と模様は出どころで決まる） */
export function charismaSegs(p: { clear: number; present: number; brand: number; panel: number; extra: number }): Part[] {
  const xs: [keyof typeof p, string, Part['pat']][] = [
    ['clear', t('町の制覇', 'Conquests'), 'solid'],
    ['present', t('研究成果の発表', 'Findings'), 'dots'],
    ['brand', t('ブランド力', 'Brand'), 'hatch'],
    ['panel', t('採用ブランド', 'Employer brand'), 'grid'],
    ['extra', t('テスト', 'Test'), 'stripe'],
  ];
  return xs.map(([k, name, pat], i) => ({ key: k, name, v: Math.max(0, Math.round(p[k])), col: [1, 0, 3, 2, 7][i], pat })).filter((x) => x.v > 0);
}
/** 月の締めのカリスマ度（Report.hr.ch）の推移 */
export function charismaHist(rs: Report[], n = 12): { month: number; v: number }[] {
  return rs
    .filter((r) => r.hr != null)
    .slice(-n)
    .map((r) => ({ month: r.month, v: r.hr!.ch }));
}

/** セクタごとの先月の売上（いまの町は最後の報告、ほかの町はセクター長の記録の最後）。大きい順 */
export function sectorBars(cur: { id: string; rev: number | null }, recs: Record<string, Pick<SectorRec, 'log' | 'manager'>>, mine: string[], nameOf: (id: string) => string): { id: string; name: string; v: number; me: boolean; head: boolean; none: boolean }[] {
  return mine
    .map((id) => {
      if (id === cur.id) return { id, name: nameOf(id), v: Math.round(cur.rev ?? 0), me: true, head: true, none: cur.rev == null };
      const r = recs[id];
      const last = r?.log[r.log.length - 1];
      return { id, name: nameOf(id), v: Math.round(last?.rev ?? 0), me: false, head: r?.manager != null, none: !last };
    })
    .sort((a, b) => b.v - a.v);
}

/** 他社の売れ筋（先月の売上）に自社の先月の売上を並べる。大きい順 */
export function rivalBars(rivals: { name: string; key: string | null; sales: number }[], mine: number | null, prodName: (k: string) => string): { name: string; v: number; me: boolean; item: string }[] {
  const xs = rivals.map((r) => ({ name: r.name, v: Math.round(r.sales), me: false, item: r.key ? prodName(r.key) : '—' }));
  if (mine != null) xs.push({ name: t('あなたの会社', 'Your company'), v: Math.round(mine), me: true, item: '' });
  return xs.sort((a, b) => b.v - a.v);
}
