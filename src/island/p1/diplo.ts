/**
 * Epic の外交（段 UI4。DOM なし：card.ts・model.ts・main.ts・自動プレイ・テストが使う）。
 * Epic の石板 e3-b「返事の光」（霧の向こうの小さな光）の続き：e3-b を読んだら、または Epic の町に初めて着いてから DIPLO.afterMonths か月で、
 * 霧の向こうのランド（MCH のランドの名前）から初めての使者が来る（物語の会話 → カード）。そのあと DIPLO.nextMonths か月ごとに次のランド（3 つまで）。
 * - 仲の良さ（0〜100・初めは DIPLO.start）：答え方・約束を守ったか・依頼の達成で上下する。高いほど交易の上乗せと依頼の報酬が良い。
 *   Legendary・次の国（段 J）で効く予告（DIPLO.open を超えると「いつか道が開く…」）。
 * - 交易：復刻品・骨董を毎月 N 個届ける約束（期間・数・値段の上乗せ）。Epic の町の月の締めで工房の在庫（足りなければお店の裏の在庫）から渡す（月次報告の「交易」の行。売上に入る）。
 *   届けられなかった月は仲が下がり、お金の罰は小さく上限あり。Epic の町にいない月は休み（仲も下がらない）。
 * - 使者の依頼：「○○を N 個、期限までに」。工房の在庫から少しずつ渡し、そろったら報酬（お金・研究ポイント・仲）。断ってもよい（仲が少し下がる）。
 * 仕様は docs/ISLAND_PHASE1.md「外交（Epic）」。数字は data.ts の DIPLO。
 */
import { t } from '../../i18n';
import { DIPLO, EVENT, PRODUCT, isRelic, skuParts, type Sku } from './data';
import { book } from './company';
import { EVENT_OFF } from './events';
import { DAYS, myShops, priceOf, spend, tierEntered, type P1State } from './model';

/** 比べの計測で外交だけを止める（できごとは止めない） */
export const DIPLO_OFF = { on: false };
export type LandId = 'ruby' | 'strawberry' | 'blueberry';
export const LAND_IDS: LandId[] = DIPLO.lands.map((x) => x.id as LandId);
export const landDef = (id: string) => DIPLO.lands.find((x) => x.id === id) ?? DIPLO.lands[0];

export interface LandRel {
  id: LandId;
  rel: number;
  /** 会った会社の月 */
  met: number;
  /** 初めての使者の会話を見た（画面。自動プレイ・テストでは見なくてよい） */
  told?: boolean;
}
export interface Trade {
  id: number;
  land: LandId;
  /** 毎月の数・値段の上乗せ・残りの月 */
  n: number;
  bonus: number;
  left: number;
  months: number;
  kept: number;
  missed: number;
}
export interface Req {
  id: number;
  land: LandId;
  key: string;
  n: number;
  got: number;
  due: number;
  reward: number;
  rp: number;
}
/** カードに入れる外交の話（選ぶまでの中身） */
export interface DipData {
  kind: 'meet' | 'trade' | 'req';
  land: LandId;
  trade?: { n: number; bonus: number; months: number; price: number };
  req?: { key: string; n: number; days: number; reward: number; rp: number; price: number };
  host: number;
}
export interface DipMonth {
  yen: number;
  n: number;
  short: number;
  penalty: number;
  done: number;
  late: number;
}
export interface DipStat {
  met: number;
  trades: number;
  tradeYen: number;
  tradeN: number;
  missed: number;
  penalty: number;
  reqs: number;
  reqDone: number;
  reqLate: number;
  declined: number;
  hosted: number;
}
export interface DiploState {
  seq: number;
  /** Epic の町に初めて着いた会社の月 */
  since: number | null;
  lands: LandRel[];
  /** 次のランドの使者が来る会社の月・次の提案の会社の月 */
  next: number | null;
  offerAt: number | null;
  trades: Trade[];
  reqs: Req[];
  /** いまの町の月（月次報告の「交易」） */
  month: DipMonth;
  stat: DipStat;
}
const newMonth = (): DipMonth => ({ yen: 0, n: 0, short: 0, penalty: 0, done: 0, late: 0 });
export const newDipStat = (): DipStat => ({ met: 0, trades: 0, tradeYen: 0, tradeN: 0, missed: 0, penalty: 0, reqs: 0, reqDone: 0, reqLate: 0, declined: 0, hosted: 0 });
export const newDiplo = (): DiploState => ({ seq: 0, since: null, lands: [], next: null, offerAt: null, trades: [], reqs: [], month: newMonth(), stat: newDipStat() });
export const diploOf = (s: P1State): DiploState => (s.diplo ??= newDiplo());
/** 外交が開いている（初めての使者が来た） */
export const diploOpen = (s: Pick<P1State, 'diplo'>) => !!s.diplo?.lands.length;
const companyMonth = (s: P1State) => Math.round(s.day / DAYS);
const clamp = (v: number) => Math.max(0, Math.min(100, v));
export const relOf = (s: P1State, land: string) => s.diplo?.lands.find((x) => x.id === land)?.rel ?? DIPLO.start;
function relAdd(s: P1State, land: string, d: number) {
  const L = s.diplo?.lands.find((x) => x.id === land);
  if (L) L.rel = clamp(L.rel + d);
}

// ---------------------------------------------------------------- 数え（交易・依頼の大きさ）

/** 交易できる品（Epic の町で売れる復刻品・骨董：この町に需要がある復刻品） */
export const tradeable = (s: P1State, x: Sku) => isRelic(skuParts(x)[0]) && (s.demand[skuParts(x)[0]] ?? 0) > 0;
/** 先月この町で売れた復刻品・骨董の数と、1 個の値段の平均（無ければ需要のある復刻品の値段） */
function relicSold(s: P1State): { n: number; price: number } {
  const r = s.reports[s.reports.length - 1];
  let yen = 0;
  let n = 0;
  for (const [k, v] of Object.entries(r?.bySeries ?? {})) {
    if (!isRelic(k) || !(v ?? 0)) continue;
    yen += v ?? 0;
    n += (v ?? 0) / Math.max(1, priceOf(s, `${k}:U` as Sku));
  }
  if (n > 0) return { n, price: yen / n };
  const keys = Object.keys(s.demand).filter((k) => isRelic(k) && (s.demand[k] ?? 0) > 0);
  const price = keys.length ? keys.reduce((a, k) => a + priceOf(s, `${k}:U` as Sku), 0) / keys.length : 0;
  return { n: 0, price };
}
const nice = (v: number) => Math.max(100, Math.round(v / 100) * 100);
export const hostCost = (s: P1State) => nice(Math.max(DIPLO.host.min, (s.reports[s.reports.length - 1]?.revenue ?? 0) * DIPLO.host.share));
export function tradeTerms(s: P1State, land: string): DipData['trade'] {
  const T = DIPLO.trade;
  const sold = relicSold(s);
  return { n: Math.max(T.min, Math.round(sold.n * T.share)), bonus: Math.round((T.bonus + relOf(s, land) * T.bonusRel) * 100) / 100, months: T.months, price: Math.round(sold.price) };
}
/** 依頼の品：この町でいちばん売れている棚の商品 */
export function reqTerms(s: P1State, land: string): DipData['req'] | null {
  const Q = DIPLO.req;
  const r = s.reports[s.reports.length - 1];
  const shelved = new Set(myShops(s).flatMap((b) => (s.shops[b.uid]?.shelves ?? []).filter((x): x is Sku => !!x)));
  const best = [...shelved].map((x) => ({ x, v: r?.bySeries[skuParts(x)[0]] ?? 0 })).sort((a, b) => b.v - a.v)[0];
  if (!best) return null;
  const price = priceOf(s, best.x);
  const units = best.v / Math.max(1, price);
  const n = Math.max(Q.min, Math.round(units * Q.share));
  return { key: skuParts(best.x)[0], n, days: Q.days, reward: nice(n * price * (Q.reward + relOf(s, land) * Q.rewardRel)), rp: Q.rp, price: Math.round(price) };
}

// ---------------------------------------------------------------- 会社の月の締め（使者・提案）

/** 会社の月の締め：使者が来る・提案を持ってくる（カードの中身。無ければ null）。Epic の町に進出してから */
export function diploCompany(s: P1State): DipData | null {
  if (EVENT_OFF.on || DIPLO_OFF.on || !tierEntered(s, 'E')) return null;
  const D = diploOf(s);
  const m = companyMonth(s);
  D.since ??= m;
  if ((s.tier ?? 'C') !== 'E') return null;
  const host = hostCost(s);
  // 次のランドの使者（初めては石板 e3-b を読んだか、着いてから afterMonths か月）
  if (D.lands.length < LAND_IDS.length) {
    const first = !D.lands.length;
    const due = first ? m - D.since >= DIPLO.afterMonths || (s.tablets ?? []).includes('tab_e3b') : D.next != null && m >= D.next;
    if (due) {
      const id = LAND_IDS[D.lands.length];
      D.lands.push({ id, rel: DIPLO.start, met: m });
      D.next = m + DIPLO.nextMonths;
      D.offerAt = m + DIPLO.every;
      D.stat.met++;
      return { kind: 'meet', land: id, trade: tradeTerms(s, id), host };
    }
  }
  // 提案：会ったランドを順に。交易の約束が無ければ交易、あれば依頼
  if (D.lands.length && D.offerAt != null && m >= D.offerAt) {
    D.offerAt = m + DIPLO.every;
    const L = D.lands[(m / DIPLO.every) % D.lands.length | 0] ?? D.lands[0];
    if (!D.trades.some((x) => x.land === L.id)) return { kind: 'trade', land: L.id, trade: tradeTerms(s, L.id), host };
    if (!D.reqs.some((x) => x.land === L.id)) {
      const q = reqTerms(s, L.id);
      if (q) return { kind: 'req', land: L.id, req: q, host };
    }
  }
  return null;
}

// ---------------------------------------------------------------- 選ぶ

export interface DipOpt {
  id: 'sign' | 'host' | 'decline' | 'accept';
  cost: number;
  ev: number;
  light?: boolean;
}
/** 選択肢と見込み（G）：交易＝ n × 値段 × 上乗せ × 月数、依頼＝報酬 − 品の値段 ＋ 研究ポイント、もてなす＝ −費用（仲 +8 は次の話で効く） */
export function dipOpts(s: P1State, d: DipData): DipOpt[] {
  const M = Math.max(1, s.reports[s.reports.length - 1]?.revenue ?? 0);
  if (d.kind === 'req' && d.req) {
    // 品は値段どおりに売れるので、見込みはお礼と研究ポイントのぶん
    const ev = d.req.reward + d.req.rp * EVENT.val.rp * M * (EVENT.rp.C / EVENT.rp.E);
    return [
      { id: 'accept', cost: 0, ev: Math.round(ev) },
      { id: 'decline', cost: 0, ev: 0, light: true },
    ];
  }
  const tr = d.trade!;
  return [
    { id: 'sign', cost: 0, ev: Math.round(tr.n * tr.price * tr.bonus * tr.months) },
    { id: 'host', cost: d.host, ev: Math.round(-d.host + DIPLO.rel.host * EVENT.val.brand * M) },
    { id: 'decline', cost: 0, ev: 0, light: true },
  ];
}
/** おすすめ：払えるもののうち見込みのいちばん大きいもの */
export function dipRec(s: P1State, d: DipData): number {
  const os = dipOpts(s, d);
  let best = -1;
  os.forEach((o, k) => {
    if (o.cost <= s.money && (best < 0 || o.ev > os[best].ev)) best = k;
  });
  return best < 0 ? os.length - 1 : best;
}
/** 選んだ手を打つ。打てなければ理由 */
export function applyDiplo(s: P1State, d: DipData, k: number): string | null {
  const o = dipOpts(s, d)[k];
  if (!o) return 'none';
  if (o.cost > s.money) return 'money';
  const D = diploOf(s);
  switch (o.id) {
    case 'sign': {
      const tr = d.trade!;
      D.trades = D.trades.filter((x) => x.land !== d.land);
      D.trades.push({ id: ++D.seq, land: d.land, n: tr.n, bonus: tr.bonus, left: tr.months, months: tr.months, kept: 0, missed: 0 });
      relAdd(s, d.land, DIPLO.rel.sign);
      D.stat.trades++;
      break;
    }
    case 'host':
      s.money -= o.cost;
      spend(s, 'ads', o.cost, 'other');
      relAdd(s, d.land, DIPLO.rel.host);
      D.stat.hosted++;
      break;
    case 'accept': {
      const q = d.req!;
      D.reqs.push({ id: ++D.seq, land: d.land, key: q.key, n: q.n, got: 0, due: s.day + q.days, reward: q.reward, rp: q.rp });
      D.stat.reqs++;
      break;
    }
    case 'decline':
      relAdd(s, d.land, DIPLO.rel.decline);
      D.stat.declined++;
      break;
  }
  return null;
}

// ---------------------------------------------------------------- 毎日・月の締め（いまの町）

/** 1 日：依頼の品を工房の在庫から少しずつ渡し（その品の在庫の半分まで）、そろったら報酬。期限が過ぎたら仲が下がる */
export function diploDay(s: P1State): { done: Req[]; late: Req[] } | null {
  const D = s.diplo;
  if (!D?.reqs.length) return null;
  const out = { done: [] as Req[], late: [] as Req[] };
  for (const q of D.reqs) {
    if ((s.tier ?? 'C') === 'E') {
      for (const [x, n] of Object.entries(s.stock) as [Sku, number][]) {
        if (skuParts(x)[0] !== q.key || !(n > 0) || q.got >= q.n) continue;
        const take = Math.min(q.n - q.got, Math.ceil(n / 2));
        s.stock[x] = n - take;
        q.got += take;
        // 届けた品は値段どおりの売上（町の売上に入れる：依頼で在庫を出しても順位で損をしない）
        const yen = Math.round(take * priceOf(s, x));
        s.money += yen;
        s.monthSales[q.key] = (s.monthSales[q.key] ?? 0) + yen;
        s.monthUnits[q.key] = (s.monthUnits[q.key] ?? 0) + take;
        book(s, 'sales', yen);
      }
    }
    if (q.got >= q.n) {
      s.money += q.reward;
      book(s, 'other', -q.reward);
      s.rp = (s.rp ?? 0) + q.rp;
      relAdd(s, q.land, DIPLO.rel.done);
      D.month.done++;
      D.stat.reqDone++;
      out.done.push(q);
    } else if (s.day > q.due) {
      relAdd(s, q.land, DIPLO.rel.late);
      D.month.late++;
      D.stat.reqLate++;
      out.late.push(q);
    }
  }
  D.reqs = D.reqs.filter((q) => !out.done.includes(q) && !out.late.includes(q));
  return out.done.length || out.late.length ? out : null;
}

/** いまの町の月の締め（model.ts の endMonth）：交易の約束の数を工房の在庫から渡す（Epic の町だけ）。売上に入れる額を返す */
export function tradeClose(s: P1State): number {
  const D = s.diplo;
  if (!D?.trades.length || (s.tier ?? 'C') !== 'E') return 0;
  // 着いたばかりの町（2 か月まで）は休み：まだ工房もお店も立ち上がっていない（仲も下がらない）
  if (s.arrived != null && s.day - s.arrived < DIPLO.trade.grace) return 0;
  const T = DIPLO.trade;
  let yen = 0;
  for (const tr of D.trades) {
    let got = 0;
    let unit = 0;
    // 届ける品：工房の在庫 → お店の裏の在庫（月の締めの時点で工房が空でも、運んだぶんから出せる）
    const bins: Partial<Record<Sku, number>>[] = [s.stock, ...myShops(s).map((b) => s.shops[b.uid]?.storage).filter((x): x is Partial<Record<Sku, number>> => !!x)];
    const xs = bins.flatMap((bin) => (Object.entries(bin) as [Sku, number][]).filter(([x, n]) => n > 0 && tradeable(s, x)).map(([x, n]) => ({ bin, x, n }))).sort((a, b) => Number(b.bin === s.stock) - Number(a.bin === s.stock) || b.n - a.n);
    for (const { bin, x, n } of xs) {
      if (got >= tr.n) break;
      const take = Math.min(n, tr.n - got);
      bin[x] = n - take;
      const p = priceOf(s, x);
      unit = p;
      yen += Math.round(take * p * (1 + tr.bonus));
      got += take;
    }
    D.month.n += got;
    if (got >= tr.n) {
      tr.kept++;
      relAdd(s, tr.land, DIPLO.rel.kept);
    } else {
      tr.missed++;
      D.stat.missed++;
      D.month.short += tr.n - got;
      relAdd(s, tr.land, DIPLO.rel.missed);
      const price = unit || relicSold(s).price;
      const pen = Math.min(T.penaltyMax, Math.round((tr.n - got) * price * T.penalty));
      if (pen > 0) {
        s.money -= pen;
        spend(s, 'ads', pen, 'other');
        D.month.penalty += pen;
        D.stat.penalty += pen;
      }
    }
    tr.left--;
  }
  D.trades = D.trades.filter((x) => x.left > 0);
  if (yen > 0) {
    s.money += yen;
    book(s, 'sales', yen);
    D.month.yen += yen;
    D.stat.tradeYen += yen;
  }
  D.stat.tradeN += D.month.n;
  return yen;
}
/** 月次報告の「交易」（渡したら 0 に） */
export function takeDipMonth(s: P1State): DipMonth | null {
  const D = s.diplo;
  if (!D) return null;
  const m = D.month;
  D.month = newMonth();
  return m.yen || m.n || m.short || m.done || m.late || D.trades.length ? m : null;
}

// ---------------------------------------------------------------- 文

export const landName = (id: string) => landDef(id).name;
const g = (v: number) => `${Math.round(v).toLocaleString('en-US')} G`;
export function dipTitle(d: DipData): string {
  const L = landName(d.land);
  return d.kind === 'meet' ? t(`${L}からの初めての使者`, `First envoy from ${L}`) : d.kind === 'trade' ? t(`${L}からの交易の話`, `Trade offer from ${L}`) : t(`${L}の使者の依頼`, `A request from ${L}`);
}
/** 使者のセリフ（60 字まで） */
export function dipSay(d: DipData): string {
  const nm = d.req ? PRODUCT[d.req.key]?.name ?? d.req.key : '';
  switch (d.kind) {
    case 'meet':
      return t('霧の向こうから参りました。[[あなたの骨董や復刻品]]を、私どもの国で売らせてもらえませんか？', 'We come from beyond the mist. May we sell [[your antiques and revivals]] in our land?');
    case 'trade':
      return t(`また参りました。今度は[[毎月 ${d.trade!.n} 個]]、私どもの国へ届けていただけませんか？`, `We return. Could you send [[${d.trade!.n} a month]] to our land?`);
    case 'req':
      return t(`お願いがございます。[[${nm}を ${d.req!.n} 個]]、${d.req!.days} 日のうちに届けていただけませんか？`, `A request: [[${d.req!.n} × ${nm}]] within ${d.req!.days} days?`);
  }
}
export function dipOptText(s: P1State, d: DipData, o: DipOpt): { icon: string; label: string; sub: string } {
  const sep = t('・', ' · ');
  const sg = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  switch (o.id) {
    case 'sign': {
      const tr = d.trade!;
      return { icon: '🤝', label: t('交易の約束を結ぶ', 'Sign a trade pact'), sub: [t(`復刻品・骨董を毎月 ${tr.n} 個`, `${tr.n} revivals/antiques a month`), t(`1 個あたり +${Math.round(tr.bonus * 100)}%`, `+${Math.round(tr.bonus * 100)}% each`), t(`${tr.months} か月`, `${tr.months} months`), t(`見込み ${sg(o.ev)} G`, `Est. ${sg(o.ev)} G`)].join(sep) };
    }
    case 'host':
      return { icon: '📜', label: t('まずは使者をもてなす', 'Host the envoy first'), sub: [g(o.cost), t(`仲 +${DIPLO.rel.host}`, `Relations +${DIPLO.rel.host}`), t('次の話で条件が良くなる', 'Better terms next time')].join(sep) };
    case 'accept': {
      const q = d.req!;
      return { icon: '✅', label: t('引き受ける', 'Accept'), sub: [t(`品の代金 ${g(q.n * q.price)}`, `Goods ${g(q.n * q.price)}`), t(`お礼 ${g(q.reward)}`, `Thanks ${g(q.reward)}`), t(`研究 +${q.rp} RP`, `+${q.rp} RP`), t(`仲 +${DIPLO.rel.done}`, `Relations +${DIPLO.rel.done}`), t(`見込み ${sg(o.ev)} G`, `Est. ${sg(o.ev)} G`)].join(sep) };
    }
    case 'decline':
      return { icon: '🙅', label: t('今回は断る', 'Decline this time'), sub: t(`仲 ${DIPLO.rel.decline}`, `Relations ${DIPLO.rel.decline}`) };
  }
  void s;
}
/** 仲の良さの予告（Legendary・次の国） */
export const relTeaser = (rel: number) =>
  rel >= DIPLO.open ? t('仲が深まった。霧の向こうへの道が、いつか開く…', 'Close ties. Someday a road beyond the mist will open…') : t(`仲が ${DIPLO.open} を超えると、いつか霧の向こうへの道が開く…`, `Above ${DIPLO.open}, someday a road beyond the mist will open…`);

/** 初めての使者の会話（物語。60 字まで × 数枚）。who：'mine' はマインちゃん、'envoy' は使者 */
export function meetPages(land: string): { who: 'mine' | 'envoy'; text: string }[] {
  const L = landName(land);
  const first = (diploFirst(land));
  if (first)
    return [
      { who: 'mine', text: t('[[太陽の塔]]の灯に、霧の向こうから[[返事]]が来たよ！ 小さな船が港に着いたって。', 'The [[sun tower]]’s beacon got an [[answer]]! A small ship reached the harbor.') },
      { who: 'envoy', text: t(`霧の向こうの[[${L}]]から参りました。あなたがたの灯を、ずっと見ておりました。`, `We come from [[${L}]] beyond the mist. We have watched your beacon all along.`) },
      { who: 'envoy', text: t('裂けた大地のあと、私どもも立て直してまいりました。[[交易]]から、またつながりませんか。', 'After the rift, we rebuilt too. Shall we reconnect, starting with [[trade]]?') },
      { who: 'mine', text: t('使者とは[[仲の良さ]]が大事だよ。約束を守るほど、良い話が来るみたい！', 'With envoys, [[relations]] matter. Keep your promises and better offers will come!') },
    ];
  return [
    { who: 'mine', text: t(`霧の向こうから、また船が来たよ！ 今度は[[${L}]]の使者だって。`, `Another ship from beyond the mist! This time, an envoy from [[${L}]].`) },
    { who: 'envoy', text: t(`[[${L}]]から参りました。私どもとも、つながっていただけませんか。`, `We come from [[${L}]]. Will you connect with us as well?`) },
  ];
}
const diploFirst = (land: string) => land === LAND_IDS[0];

/** 月次報告の 1 行（長い・短い） */
export function dipReportText(m: DipMonth): [string, string] {
  const xs: string[] = [];
  if (m.n) xs.push(t(`${m.n} 個を届けた（+${g(m.yen)}）`, `Sent ${m.n} (+${g(m.yen)})`));
  const pen = m.penalty ? g(m.penalty) : '';
  if (m.short) xs.push(pen ? t(`${m.short} 個足りなかった（仲が下がった・−${pen}）`, `${m.short} short (relations down, −${pen})`) : t(`${m.short} 個足りなかった（仲が下がった）`, `${m.short} short (relations down)`));
  if (m.done) xs.push(t(`依頼 ${m.done} 件を達成`, `${m.done} request(s) done`));
  if (m.late) xs.push(t(`依頼 ${m.late} 件が期限切れ`, `${m.late} request(s) expired`));
  if (!xs.length) xs.push(t('今月は届ける品が無かった', 'Nothing to send this month'));
  return [xs.join(t('・', ' · ')), m.n ? t(`+${g(m.yen)}`, `+${g(m.yen)}`) : xs[0]];
}
