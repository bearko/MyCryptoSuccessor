/**
 * 段 H2：Epic の町 ②：法務と M&A（docs/ISLAND_PHASE1.md「Epic の町 ②：法務と M&A」）：
 * M&A（1 位は売らない・撤退した会社は買えない・調査で隠れた借金が見える／調べないと成立のときに差し引かれる・成立で店が自社に移りランキングから消える・
 * 買えるのは町の他社の半分まで・競業避止が無ければ元のオーナーが戻る）・特許（追随しない・使用料）・仕入れの契約（安くなる・違約金の上限）・
 * 争い（訴えは実際に起きたことからだけ・負けても止まらない）・Rare 以下の町には出ない・法務の理解度と条項・古いセーブ（版 18）。
 */
import { describe, expect, it } from 'vitest';
import { DEPT_SKILLS, LEGAL, LEGAL_SKILLS, PRODUCT, rivalDef, rivalsOf } from '../src/island/p1/data';
import { deptLevel } from '../src/island/p1/dept';
import {
  cancelSupply,
  clauseSlots,
  ddFacts,
  dealOf,
  fileSuit,
  filePatent,
  guidePrice,
  legalHere,
  legalOf,
  maLock,
  maMax,
  maMonths,
  offerChance,
  openSuits,
  patentActive,
  patentLock,
  sendOffer,
  setLicense,
  settle,
  signSupply,
  startDD,
  startDeal,
  storesOf,
  supplyLock,
  supplyPenalty,
  topRival,
  type Deal,
} from '../src/island/p1/legal';
import { copyIn } from '../src/island/p1/mkt';
import { allowedDirs, antiqueHere, build, deserializeP1, endMonth, matPrice, newP1, serializeP1, step, type P1State, type PBuilding } from '../src/island/p1/model';

function lot(s: P1State, id: string, skip = 0): [number, number, 'rd' | 'ld' | 'lu' | 'ru'] {
  let n = 0;
  for (let j = 0; j < s.n; j++)
    for (let i = 0; i < s.n; i++) {
      const d = allowedDirs(s, id, i, j);
      if (d.length && n++ >= skip) return [i, j, d[0]];
    }
  throw new Error('no lot');
}
function put(s: P1State, id: string, skip = 0): PBuilding {
  const b = build(s, id, ...lot(s, id, skip));
  if (typeof b === 'string') throw new Error(b);
  b.left = 1;
  step(s);
  return b;
}
/** Epic の町（ヒトシタウン）に工房とお店。最初の月の締めまで回す（ランキングがある） */
function epicTown(seed = 5, sector = 'e1'): P1State {
  const s = newP1(seed, 'E', sector);
  s.tut = 99;
  s.money = 1e8;
  s.flags.digMeet = 'done';
  put(s, 'workshop');
  put(s, 'general_store', 3);
  for (let k = 0; k < 40 && !s.reports.length; k++) step(s);
  expect(s.reports.length).toBeGreaterThan(0);
  return s;
}
/** 1 位でない、店のある他社（売上の大きい順に n 番目） */
const nonTop = (s: P1State, n = 0) =>
  s.rivals
    .filter((r) => !r.gone && r.id !== topRival(s))
    .sort((a, b) => b.base - a.base)
    .map((r) => r.id)[n];
/** 話を段まで進める（日を回す） */
function until(s: P1State, d: Deal, stage: Deal['stage'], max = 40) {
  for (let k = 0; k < max && dealOf(s, d.id)?.stage !== stage; k++) step(s);
  expect(dealOf(s, d.id)?.stage).toBe(stage);
}
/** 次の月の締めまで回す */
function toClose(s: P1State) {
  const n = s.reports.length;
  for (let k = 0; k < 40 && s.reports.length === n; k++) step(s);
  return s.reports[s.reports.length - 1];
}
/** 調べずに・調べて、受けてくれる提示（見込みが当たるまで、断られたら「高く」で出し直す） */
function signDeal(s: P1State, rid: string, dd: boolean, clauses = {}, had?: Deal): Deal {
  const d = had ?? (startDeal(s, rid) as Deal);
  expect(typeof d).toBe('object');
  until(s, d, 'talk');
  if (dd && !d.dd) {
    expect(startDD(s, d.id)).toBeNull();
    until(s, d, 'talk');
  }
  for (let k = 0; k < 6 && dealOf(s, d.id)?.stage !== 'signed'; k++) {
    const x = dealOf(s, d.id)!;
    const lv = x.refused && s.day < x.refused.until ? 'high' : 'mid';
    if (x.refused && s.day < x.refused.until && x.refused.level === 'high') for (let j = 0; j < 31; j++) step(s);
    expect(sendOffer(s, d.id, lv, clauses)).toBeNull();
    // 返事は決まっている（いまの見込みで）：テストでは受けてくれたことにする
    dealOf(s, d.id)!.offer!.ok = true;
    for (let j = 0; j < LEGAL.ma.negoDays + 1 && dealOf(s, d.id)?.stage === 'nego'; j++) step(s);
  }
  expect(dealOf(s, d.id)?.stage).toBe('signed');
  return dealOf(s, d.id)!;
}

describe('1. M&A：打診できる会社', () => {
  it('その町の 1 位の会社は売らない・撤退した会社は買えない・Epic の町だけ', () => {
    const s = epicTown();
    const top = topRival(s);
    expect(top).not.toBeNull();
    expect(maLock(s, top!)).toBe('top');
    expect(startDeal(s, top!)).toBe('top');
    const rid = nonTop(s);
    expect(maLock(s, rid)).toBeNull();
    // 撤退した会社（店が無い）
    const gone = s.rivals.find((r) => r.id === nonTop(s, 1))!;
    gone.gone = true;
    expect(maLock(s, gone.id)).toBe('gone');
    // Rare の町には出ない
    const r = newP1(5, 'R', 'r1');
    expect(legalHere(r)).toBe(false);
    expect(maLock(r, r.rivals[1].id)).toBe('off');
    expect(patentLock(r, 'x')).toBe('off');
    expect(supplyLock(r, 6)).toBe('off');
  });

  it('値段の目安は月の売上の 6〜10 か月。受ける見込みは 安く < ふつう < 高く、条項（店員の引き継ぎ）で上がる', () => {
    const s = epicTown();
    const rid = nonTop(s);
    const m = maMonths(s, rid);
    expect(m).toBeGreaterThanOrEqual(LEGAL.ma.months[0]);
    expect(m).toBeLessThanOrEqual(LEGAL.ma.months[1]);
    expect(guidePrice(s, rid)).toBeGreaterThan(1e6);
    const [lo, mid, hi] = (['low', 'mid', 'high'] as const).map((x) => offerChance(s, rid, x));
    expect(lo).toBeLessThan(mid);
    expect(mid).toBeLessThan(hi);
    expect(offerChance(s, rid, 'mid', { staff: true })).toBeGreaterThan(mid);
    expect(offerChance(s, rid, 'mid', { noCompete: true })).toBeLessThan(mid);
  });
});

describe('2. M&A：調査・成立', () => {
  it('調査で隠れた借金が見える。見つけた借金は売り手が払う（成立で差し引かない）', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = epicTown(seed);
      const rid = nonTop(s);
      const d0 = startDeal(s, rid) as Deal;
      if (!d0.debt) continue;
      until(s, d0, 'talk');
      expect(ddFacts(s, d0).debt).toBeNull();
      expect(startDD(s, d0.id)).toBeNull();
      until(s, d0, 'talk');
      expect(dealOf(s, d0.id)!.dd).toBe(true);
      expect(ddFacts(s, dealOf(s, d0.id)!).debt).toBe(d0.debt);
      // 成立 → 締め：借金は差し引かない
      signDeal(s, rid, false, {}, dealOf(s, d0.id)!);
      const r = toClose(s);
      expect(r.legal?.closed[0]).toMatchObject({ rid, debt: 0 });
      return;
    }
    throw new Error('借金のある会社が見つからない');
  });

  it('調べないで買うと、隠れた借金は成立のときに差し引かれる', () => {
    for (let seed = 1; seed < 40; seed++) {
      const s = epicTown(seed);
      const rid = nonTop(s);
      const probe = startDeal(s, rid) as Deal;
      const debt = probe.debt;
      s.area!.ma!.deals = [];
      if (!debt) continue;
      signDeal(s, rid, false);
      const ma0 = s.books?.cur.ma ?? 0;
      const r = toClose(s);
      expect(r.legal?.closed[0]).toMatchObject({ rid, debt });
      expect((s.books?.months[s.books.months.length - 1]?.l.ma ?? 0) + (s.books?.cur.ma ?? 0) - ma0).toBeGreaterThanOrEqual(0);
      return;
    }
    throw new Error('借金のある会社が見つからない');
  });

  it('成立で、相手の店が自社の店になり（棚に売れ筋）、相手はランキングから消える。引き継いだ商売の売上が入る', () => {
    const s = epicTown();
    const rid = nonTop(s);
    const name = rivalDef(rid)!.name;
    expect(s.reports[0].area.some((x) => x.name === name)).toBe(true);
    const stores = storesOf(s, rid).map((b) => b.uid);
    expect(stores.length).toBeGreaterThan(0);
    signDeal(s, rid, true, { staff: true });
    const r = toClose(s);
    expect(r.legal?.closed.map((x) => x.rid)).toEqual([rid]);
    for (const uid of stores) {
      const b = s.buildings.find((x) => x.uid === uid)!;
      expect(b.owner).toBe('me');
      expect(s.shops[uid].shelves.some((x) => !!x)).toBe(true);
    }
    expect(s.rivals.find((x) => x.id === rid)!.gone).toBe(true);
    expect(r.area.some((x) => x.name === name && !x.me)).toBe(false);
    expect(storesOf(s, rid)).toHaveLength(0);
    // 次の月：引き継いだ商売の売上
    const r2 = toClose(s);
    expect(r2.legal?.acq ?? 0).toBeGreaterThan(0);
    expect(r2.area.some((x) => x.name === name)).toBe(false);
    // 空き店舗の入れ替わりで戻ってこない（競業避止なし：決まった月に 1 軒だけ戻る）
    let came: number | null = null;
    for (let k = 0; k < LEGAL.ma.returnAfter + 1 && came == null; k++) if (toClose(s).legal?.back.includes(rid)) came = k;
    expect(came).not.toBeNull();
    const back = s.rivals.find((x) => x.id === rid)!;
    expect(back.gone).toBe(false);
    expect(storesOf(s, rid)).toHaveLength(1);
  });

  it('競業避止があれば元のオーナーは戻らない。買えるのは町の他社の半分まで', () => {
    const s = epicTown();
    expect(maMax(s)).toBe(Math.floor(rivalsOf('e1').length / 2));
    const a = nonTop(s);
    signDeal(s, a, true, { noCompete: true });
    toClose(s);
    const b = nonTop(s);
    signDeal(s, b, true, { noCompete: true });
    toClose(s);
    for (let k = 0; k < LEGAL.ma.returnAfter + 1; k++) toClose(s);
    expect(s.rivals.find((x) => x.id === a)!.gone).toBe(true);
    const left = s.rivals.filter((r) => !r.gone && r.id !== topRival(s));
    for (const r of left) expect(maLock(s, r.id)).toBe('limit');
    // 町から他社がいなくならない
    expect(s.rivals.filter((r) => !r.gone).length).toBeGreaterThanOrEqual(rivalsOf('e1').length - maMax(s));
  });
});

describe('3. 特許', () => {
  /** Epic の復刻品を売っている町（独占は切れている） */
  function relicTown() {
    const s = epicTown();
    // 骨董でない Epic の復刻品（独占はとうに切れている）
    const key = Object.keys(PRODUCT).find((k) => PRODUCT[k].relic?.epic && !antiqueHere(s, k))!;
    s.recipes[key] = { at: 1, sold: -1000 };
    s.monthSales[key] = 50000;
    return { s, key };
  }
  it('特許がなければ、独占の切れた復刻品に他社が追随する', () => {
    const { s, key } = relicTown();
    s.alone[key] = 10;
    endMonth(s);
    expect(s.rivals.some((r) => (r.sells[key] ?? 0) > 0)).toBe(true);
  });
  it('特許の間は追随しない（止めた数を数える）。市場の見通しの「真似してくるまで」は出ない', () => {
    const { s, key } = relicTown();
    expect(filePatent(s, key)).toBeNull();
    for (let k = 0; k < LEGAL.patent.examDays + 1; k++) step(s);
    expect(patentActive(s, key)).toBe(true);
    s.monthSales[key] = 50000;
    s.alone[key] = 10;
    endMonth(s);
    expect(s.rivals.some((r) => (r.sells[key] ?? 0) > 0)).toBe(false);
    expect(s.legal!.patents[0].stopped).toBe(1);
    expect(copyIn(s, key)).toBeNull();
  });
  it('使用料で貸すと追随を許し、他社がその商品を売った額の数％が毎月入る', () => {
    const { s, key } = relicTown();
    filePatent(s, key);
    for (let k = 0; k < LEGAL.patent.examDays + 1; k++) step(s);
    setLicense(s, key, true);
    const rid = s.rivals[0].id;
    s.rivals[0].sells[key] = 1;
    s.rivalProd[rid] = { ...(s.rivalProd[rid] ?? {}), [key]: 100000 };
    const r = endMonth(s);
    expect(r.legal?.royalty).toBe(Math.round(100000 * LEGAL.patent.royalty));
  });
});

describe('4. 仕入れの契約', () => {
  it('契約で素材が安くなる（期間が長いほど）。途中でやめると違約金（上限）を卸問屋が訴える。違約金なしの条項なら訴えは無い', () => {
    const s = epicTown();
    const p0 = matPrice(s, 'wood');
    expect(signSupply(s, 12)).toBeNull();
    expect(matPrice(s, 'wood')).toBe(Math.round(p0 * (1 - LEGAL.supply.cut[12])));
    expect(signSupply(s, 6)).toBe('active');
    s.reports[s.reports.length - 1].costs.materials = 1e8;
    expect(supplyPenalty(s)).toBe(LEGAL.supply.cap);
    expect(cancelSupply(s)).toBe(LEGAL.supply.cap);
    expect(openSuits(s)).toHaveLength(1);
    expect(openSuits(s)[0]).toMatchObject({ kind: 'supply', side: 'def', claim: LEGAL.supply.cap });
    expect(matPrice(s, 'wood')).toBe(p0);
    // 違約金なし
    const t = epicTown();
    expect(clauseSlots(t)).toBeGreaterThanOrEqual(1);
    expect(signSupply(t, 6, { noPenalty: true })).toBeNull();
    t.reports[t.reports.length - 1].costs.materials = 1e8;
    expect(cancelSupply(t)).toBe(0);
    expect(openSuits(t)).toHaveLength(0);
  });
});

describe('5. 争い', () => {
  it('訴えは実際に起きたことからだけ：何もしなければ訴えは来ない（Epic の町を 6 か月）', () => {
    const s = epicTown();
    for (let k = 0; k < 6; k++) toClose(s);
    expect(s.legal?.suits ?? []).toHaveLength(0);
  });
  it('負けても失うのはお金だけ（上限・資金が TAX.keep を切らない）。町は動き続ける', () => {
    const s = epicTown();
    const x = fileSuit(s, { kind: 'supply', side: 'def', by: 'wholesale', claim: 5e6, evidence: false });
    // 必ず負ける（勝ちの見込みを 0 に）
    const save = { ...LEGAL.suit };
    LEGAL.suit.floor = 0;
    LEGAL.suit.base.def = -5;
    try {
      s.money = 60000;
      for (let k = 0; k < LEGAL.suit.months + 1; k++) toClose(s);
    } finally {
      Object.assign(LEGAL.suit, save);
      LEGAL.suit.base.def = 0.45;
    }
    expect(x.status).toBe('lost');
    // 払うのは上限まで。資金が TAX.keep を切るぶんは払いきれていないお金として月ごとに
    expect(x.paid ?? 0).toBeLessThanOrEqual(LEGAL.suit.maxPay);
    expect((x.paid ?? 0) + legalOf(s).owed).toBeLessThanOrEqual(LEGAL.suit.maxPay);
    // 止まらない：日を回すとまだ売れる
    const n = s.reports.length;
    toClose(s);
    expect(s.reports.length).toBe(n + 1);
  });
  it('和解：半分払って、すぐ終わる', () => {
    const s = epicTown();
    const x = fileSuit(s, { kind: 'ma', side: 'def', by: 'partner', claim: 200000, evidence: false });
    const m0 = s.money;
    expect(settle(s, x.id)).toBe(true);
    expect(x.status).toBe('settled');
    expect(m0 - s.money).toBe(100000);
  });
  it('Rare 以下の町では M&A・特許・訴え・仕入れの契約が出ない（Rare の町を 4 か月）', () => {
    const r = newP1(5, 'R', 'r1');
    r.tut = 99;
    r.money = 1e8;
    r.flags.digMeet = 'done';
    put(r, 'workshop');
    put(r, 'general_store', 3);
    for (let k = 0; k < 120; k++) step(r);
    expect(startDeal(r, r.rivals[1].id)).toBe('off');
    expect(signSupply(r, 6)).toBe('off');
    expect(r.legal?.suits ?? []).toHaveLength(0);
    expect(r.reports.every((x) => !x.legal)).toBe(true);
  });
});

describe('6. 法務の部門・パネル・セーブ', () => {
  it('法務のパネルは Epic の外周 4 枚（研究 2・お金 2）。理解度はパネルと経験（契約・特許・M&A・裁判）。条項は理解度 3・契約の雛形で増える', () => {
    expect(DEPT_SKILLS.legal.map((k) => k.id)).toEqual(LEGAL_SKILLS.map((k) => k.id));
    for (const k of LEGAL_SKILLS) expect([k.tier, k.branch], k.id).toEqual(['E', 'legal']);
    const s = epicTown();
    expect(deptLevel(s, 'legal')).toBe(0);
    expect(clauseSlots(s)).toBe(LEGAL.clauses.base);
    signSupply(s, 3);
    expect(deptLevel(s, 'legal')).toBe(1);
    legalOf(s).xp = LEGAL.clauses.at;
    expect(clauseSlots(s)).toBe(LEGAL.clauses.base + 1);
    s.skills.push('lg_template');
    expect(clauseSlots(s)).toBe(LEGAL.clauses.base + 2);
    expect(deptLevel(s, 'legal')).toBe(LEGAL.clauses.at + 1);
  });
  it('古いセーブ（版 18）：契約・特許・裁判・M&A は空で読める。版 19 で残る', () => {
    const s = epicTown();
    const old = JSON.parse(serializeP1(s));
    old.v = 18;
    delete old.legal;
    if (old.area) delete old.area.ma;
    const back = deserializeP1(JSON.stringify(old))!;
    expect(back.v).toBe(27);
    expect(back.legal).toBeUndefined();
    expect(back.area?.ma).toBeUndefined();
    expect(startDeal(back, nonTop(back))).toMatchObject({ stage: 'offer' });
    signSupply(back, 6);
    const again = deserializeP1(serializeP1(back))!;
    expect(again.legal?.supply?.months).toBe(6);
    expect(again.area?.ma?.deals).toHaveLength(1);
  });
});
