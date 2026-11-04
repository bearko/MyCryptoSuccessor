// 段 UI4（docs/ISLAND_PHASE1.md「突発のできごと」「外交（Epic）」）：突発のできごと（1 か月目に出ない・出る数の上限・同じ種類が続かない・シードで再現・
// 損を避ける選択肢・効き目が期限で切れる）・Epic の外交（Epic だけ・石板のあとに初めての使者・仲が答え方で動く・交易を守れないと仲が下がる（罰は上限あり）・
// 依頼の報酬）・古いセーブ（版 20）。追加の要望：工房の作る物を替えたときの主力商品のまとめ替え・境界の町の名前と進出のポップアップ
import { describe, expect, it } from 'vitest';
import { CARD, DIPLO, EVENT, PRODUCT, PRODUCTS, type Sku } from '../src/island/p1/data';
import { cardsMonth, chooseCard, sayLength, sayOf, type Card } from '../src/island/p1/card';
import { BAD_KINDS, EV_KINDS, GOOD_KINDS, applyEvent, contestingTop, evMul, eventDue, isGood, makeEvent, newEvents, type EvKind } from '../src/island/p1/events';
import { applyDiplo, diploCompany, diploDay, diploMoved, dipOpts, dipReportText, meetPages, relOf, takeDipMonth, tradeClose, tradeTerms } from '../src/island/p1/diplo';
import { bulkMain, bulkMainNote, bulkMainRows, deserializeP1, jamOf, myShops, newP1, openGate, priceOf, serializeP1, setShelf, type P1State, type Report } from '../src/island/p1/model';
import { advanceGo, advanceOf, edgeNear, EDGE_NEAR } from '../src/island/p1/world';
import { sayLen } from '../src/island/p1/persona';
import { runOnce } from '../scripts/island/sim';

/** タオックスの 3 か月目くらい（自動プレイの最短の方針の写し。お店・作業台・売上あり） */
let townSave: string | null = null;
function town(): P1State {
  if (!townSave)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!townSave && m >= 3 && myShops(s).length && (s.reports[s.reports.length - 1]?.revenue ?? 0) > 0 && s.slots.some((x) => x.worker != null)) townSave = serializeP1(s);
      },
    });
  const s = deserializeP1(townSave!)!;
  s.tut = 99;
  s.money = 1e6;
  s.events = undefined;
  s.cards = undefined;
  // 1 位を争っていない月（争っている月はできごとを控える。下の「1 位を争っている月は出さない」で確かめる）
  s.reports[s.reports.length - 1].rank = 5;
  s.topStreak = 0;
  s.comeback = null;
  return s;
}
const fakeReport = (s: P1State): Report => ({ ...(s.reports[s.reports.length - 1] ?? ({} as Report)), month: (s.reports[s.reports.length - 1]?.month ?? 0) + 1, comeback: undefined, rally: undefined });
/** Epic の町（ヒトシタウン）。売上のある先月の報告つき */
function epic(): P1State {
  const s = newP1(5, 'E', 'e1');
  s.tut = 99;
  s.money = 1e8;
  s.day = 300;
  s.reports.push({ month: 1, revenue: 4_000_000, bySeries: {}, costs: { materials: 1_000_000, wages: 0, part: 0, upkeep: 0, build: 0, ads: 0 }, profit: 0, area: [], rank: 4, news: [] });
  return s;
}

describe('突発のできごと：出る時', () => {
  it('1 か月目（チュートリアル）の締めには出ない（町の 2 か月目の締めから）', () => {
    const s = newP1(1);
    expect(s.reports.length).toBe(0);
    expect(eventDue(s, 0)).toBeNull();
    const t = town();
    t.reports = t.reports.slice(0, 1);
    for (let mk = 0; mk < 6; mk++) expect(eventDue(t, mk)).toBeNull();
  });

  it('出る数は UI1 の上限（C 1・U 2・R 以上 3 枚／月）の中で、できごとは 2〜3 か月に 1 回。同じ種類は続かず、良いできごとと困りごとが交互', () => {
    const s = town();
    const kinds: EvKind[] = [];
    const at: number[] = [];
    for (let m = 0; m < 30; m++) {
      cardsMonth(s, fakeReport(s));
      const C = s.cards!;
      const pops = C.inbox.filter((c) => c.mk === C.mk && c.pop).length;
      expect(pops).toBeLessThanOrEqual(CARD.cap.C);
      const ev = C.inbox.find((c) => c.src === 'event' && c.mk === C.mk);
      if (ev) {
        expect(ev.pop).toBe(true);
        kinds.push(ev.ev!.kind);
        at.push(C.mk);
        // 選んで片づける（受け箱をあふれさせない）
        expect(chooseCard(s, ev.id, ev.ev!.opts.length - 1).ok).toBe(true);
      }
      s.cards!.inbox = s.cards!.inbox.filter((c) => c.src === 'event');
    }
    expect(kinds.length).toBeGreaterThanOrEqual(8);
    for (let k = 1; k < at.length; k++) {
      expect(at[k] - at[k - 1]).toBeGreaterThanOrEqual(EVENT.gap[0]);
      expect(at[k] - at[k - 1]).toBeLessThanOrEqual(EVENT.gap[1] + 1);
      expect(kinds[k]).not.toBe(kinds[k - 1]);
      expect(isGood(kinds[k])).not.toBe(isGood(kinds[k - 1]));
    }
  });

  it('1 位を争っている月（2 位以内・1 位の続き・他社の巻き返し）は出さず、落ち着いた締めで出す。制覇した町では出る。外交の新しい使者も控える', () => {
    const s = town();
    // 出る予定の締めを探す（争っていない写しで）
    const probe = town();
    let due = -1;
    for (let mk = 0; mk < 6 && due < 0; mk++) if (eventDue(probe, mk)) due = mk;
    expect(due).toBeGreaterThanOrEqual(0);
    const last = s.reports[s.reports.length - 1];
    for (const set of [() => (last.rank = 1), () => (last.rank = 2), () => (s.topStreak = 1), () => (s.comeback = { rid: 'x', left: 2, cool: 0, bonus: 0.2, used: [] })]) {
      last.rank = 5;
      s.topStreak = 0;
      s.comeback = null;
      set();
      expect(contestingTop(s)).toBe(true);
      for (let mk = 0; mk <= due; mk++) expect(eventDue(s, mk)).toBeNull();
    }
    // 落ち着いた（3 位以下・続きなし・巻き返しなし）締めで、予定どおり出る
    last.rank = 3;
    s.topStreak = 0;
    s.comeback = null;
    expect(contestingTop(s)).toBe(false);
    expect(eventDue(s, due)).not.toBeNull();
    // 制覇した町では 1 位でも出る
    const c = town();
    c.reports[c.reports.length - 1].rank = 1;
    c.topStreak = 3;
    c.cleared = true;
    expect(contestingTop(c)).toBe(false);
    for (let mk = 0; mk < due; mk++) expect(eventDue(c, mk)).toBeNull();
    expect(eventDue(c, due)).not.toBeNull();
    // 外交：石板を読んでいても、1 位を争っている月は使者が来ない
    const e = epic();
    e.tablets = ['tab_e3b'];
    e.day += 30;
    e.reports[0].rank = 1;
    expect(diploCompany(e)).toBeNull();
    e.reports[0].rank = 4;
    expect(diploCompany(e)?.kind).toBe('meet');
  });

  it('同じセーブ（シード）なら、同じできごとが同じ締めに出る（再現できる）', () => {
    const seq = () => {
      const s = town();
      const out: string[] = [];
      for (let m = 0; m < 20; m++) {
        cardsMonth(s, fakeReport(s));
        const ev = s.cards!.inbox.find((c) => c.src === 'event' && c.mk === s.cards!.mk);
        if (ev) {
          out.push(`${s.cards!.mk}:${ev.ev!.kind}`);
          chooseCard(s, ev.id, 0);
        }
      }
      return out.join(',');
    };
    const a = seq();
    expect(a.length).toBeGreaterThan(0);
    expect(seq()).toBe(a);
  });
});

describe('突発のできごと：選び方で損を避けられる', () => {
  it('20 種（良い 10・困りごと 10）。どのできごとにも、見込みで損 0 以上の選択肢がある（タオックス・Epic の町）', () => {
    expect(GOOD_KINDS.length).toBe(10);
    expect(BAD_KINDS.length).toBe(10);
    let made = 0;
    for (const s of [town(), epic()]) {
      // 在庫（大口の注文）
      for (const k of EV_KINDS) {
        for (let salt = 0; salt < 3; salt++) {
          const d = makeEvent(s, k, salt);
          if (!d) continue;
          made++;
          expect(d.opts.length).toBeGreaterThanOrEqual(2);
          expect(d.opts.length).toBeLessThanOrEqual(3);
          expect(Math.max(...d.opts.map((o) => o.ev)), `${k} ${JSON.stringify(d.opts)}`).toBeGreaterThanOrEqual(0);
          // 選ばずに閉じられない：様子を見る系（軽い手）が 1 つある
          expect(d.opts.filter((o) => o.light).length).toBe(1);
        }
      }
    }
    expect(made).toBeGreaterThan(30);
  });

  it('カードのセリフは 60 字まで（マインちゃん・ヒーロー・町の長・使者）', () => {
    const s = town();
    for (const k of EV_KINDS) {
      const d = makeEvent(s, k);
      if (!d) continue;
      const c = { id: 1, src: 'event', kind: `ev:${k}`, hero: d.who === 'mine' ? null : d.hero ?? null, q: 0.7, dept: null, mk: 0, sector: s.sector ?? 'c1', day: s.day, issue: { k: 'event' }, ev: d, choices: [], pop: true } as Card;
      expect(sayLength(s, c), sayOf(s, c)).toBeLessThanOrEqual(CARD.sayMax);
    }
    for (const land of ['ruby', 'strawberry']) for (const pg of meetPages(land)) expect(sayLen(pg.text)).toBeLessThanOrEqual(60);
  });

  it('効き目は期限で切れる（大雨の「在庫でしのぐ」：運ぶ日数 ×1.6 を 10 日）・ほかの町では効かない', () => {
    const s = town();
    const d = makeEvent(s, 'rain')!;
    const k = d.opts.findIndex((o) => o.id === 'wait');
    expect(applyEvent(s, d, k)).toBeNull();
    expect(evMul(s, 'haul')).toBeCloseTo(1.6);
    expect(evMul({ ...s, sector: 'c2' }, 'haul')).toBe(1);
    s.day += 9;
    expect(evMul(s, 'haul')).toBeCloseTo(1.6);
    s.day += 1;
    expect(evMul(s, 'haul')).toBe(1);
  });

  it('費用が足りない手は打てない（お金は減らない）・大口の注文は在庫から渡して売上に入る', () => {
    const s = town();
    const d = makeEvent(s, 'festival')!;
    s.money = 0;
    expect(applyEvent(s, d, 0)).toBe('money');
    expect(s.money).toBe(0);
    s.money = 1e6;
    const sku = Object.keys(s.stock)[0] as Sku;
    s.stock[sku] = 50;
    const o = makeEvent(s, 'bigorder');
    if (o) {
      const before = s.money;
      const n0 = s.stock[o.opts[0].order!.sku] ?? 0;
      expect(applyEvent(s, o, 0)).toBeNull();
      expect(s.money).toBeGreaterThan(before);
      expect(s.stock[o.opts[0].order!.sku]).toBe(n0 - o.opts[0].order!.n);
    }
  });
});

describe('Epic の外交', () => {
  it('外交は Epic だけ：Common の町では使者が来ない', () => {
    const s = town();
    s.day = 600;
    expect(diploCompany(s)).toBeNull();
    expect(s.diplo).toBeUndefined();
  });

  it('石板 e3-b「返事の光」を読んだら、初めての使者（ルビー）が来る。読まなければ着いてから 3 か月', () => {
    const s = epic();
    expect(diploCompany(s)).toBeNull();
    s.tablets = ['tab_e3b'];
    s.day += 30;
    const d = diploCompany(s)!;
    expect(d.kind).toBe('meet');
    expect(d.land).toBe('ruby');
    expect(relOf(s, 'ruby')).toBe(DIPLO.start);
    const u = epic();
    for (let m = 0; m < DIPLO.afterMonths; m++) {
      expect(diploCompany(u)).toBeNull();
      u.day += 30;
    }
    expect(diploCompany(u)?.kind).toBe('meet');
  });

  it('仲の良さは答え方で動く（もてなす +8・断る −3・結ぶ +5）。仲が高いほど交易の上乗せが大きい', () => {
    const s = epic();
    s.tablets = ['tab_e3b'];
    const d = diploCompany(s)!;
    const os = dipOpts(s, d);
    const low = tradeTerms(s, 'ruby')!.bonus;
    expect(applyDiplo(s, d, os.findIndex((o) => o.id === 'host'))).toBeNull();
    expect(relOf(s, 'ruby')).toBe(DIPLO.start + DIPLO.rel.host);
    expect(applyDiplo(s, d, os.findIndex((o) => o.id === 'decline'))).toBeNull();
    expect(relOf(s, 'ruby')).toBe(DIPLO.start + DIPLO.rel.host + DIPLO.rel.decline);
    expect(tradeTerms(s, 'ruby')!.bonus).toBeGreaterThan(low);
    expect(applyDiplo(s, d, os.findIndex((o) => o.id === 'sign'))).toBeNull();
    expect(s.diplo!.trades.length).toBe(1);
  });

  it('交易の約束を守れない月は仲が下がり、お金の罰は上限まで。守れた月は売上に入る', () => {
    const s = epic();
    s.tablets = ['tab_e3b'];
    const d = diploCompany(s)!;
    applyDiplo(s, d, 0);
    const tr = s.diplo!.trades[0];
    tr.n = 500;
    const r0 = relOf(s, 'ruby');
    const m0 = s.money;
    expect(tradeClose(s)).toBe(0);
    expect(relOf(s, 'ruby')).toBe(r0 + DIPLO.rel.missed);
    expect(m0 - s.money).toBeLessThanOrEqual(DIPLO.trade.penaltyMax);
    // 復刻品の在庫があれば届ける（需要のある復刻品）
    const key = Object.keys(s.demand).find((k) => k.startsWith('Relic-') && (s.demand[k] ?? 0) > 0) ?? Object.keys(PRODUCT).find((k) => k.startsWith('Relic-'))!;
    s.demand[key] = Math.max(1, s.demand[key] ?? 0);
    s.stock[`${key}:U` as Sku] = 600;
    const r1 = relOf(s, 'ruby');
    expect(tradeClose(s)).toBeGreaterThan(0);
    expect(relOf(s, 'ruby')).toBe(r1 + DIPLO.rel.kept);
  });

  it('町を移った月（移った日を含む締めの月）は交易を休む：届けなくても罰はなく、仲も下がらない。次の締めからまた届ける', () => {
    const s = epic();
    s.tablets = ['tab_e3b'];
    applyDiplo(s, diploCompany(s)!, 0);
    const tr = s.diplo!.trades[0];
    tr.n = 500;
    const left = tr.left;
    // 締めの 10 日前に町を移った（land.ts の moveTo が呼ぶ）
    s.day += 20;
    diploMoved(s);
    s.day += 10;
    takeDipMonth(s);
    const r0 = relOf(s, 'ruby');
    const m0 = s.money;
    expect(tradeClose(s)).toBe(0);
    expect(relOf(s, 'ruby')).toBe(r0);
    expect(s.money).toBe(m0);
    expect(tr.left).toBe(left);
    expect(s.diplo!.stat.missed).toBe(0);
    const m = takeDipMonth(s)!;
    expect(m.rest).toBe(true);
    expect(dipReportText(m)[0]).toContain('お休み');
    // 次の締め（移った日から 30 日）は、足りなければいつもどおり仲が下がり罰
    s.day += 30;
    expect(tradeClose(s)).toBe(0);
    expect(relOf(s, 'ruby')).toBe(r0 + DIPLO.rel.missed);
    expect(s.diplo!.stat.missed).toBe(1);
    expect(m0 - s.money).toBeLessThanOrEqual(DIPLO.trade.penaltyMax);
    expect(tr.left).toBe(left - 1);
  });

  it('使者の依頼：品がそろうと報酬（お金・研究ポイント・仲）。期限を過ぎると仲が下がる', () => {
    const s = epic();
    const key = PRODUCTS[0].key;
    const sku = `${key}:C` as Sku;
    s.diplo = { seq: 1, since: 9, lands: [{ id: 'ruby', rel: 30, met: 9 }], next: null, offerAt: null, trades: [], reqs: [{ id: 1, land: 'ruby', key, n: 10, got: 0, due: s.day + 5, reward: 50000, rp: 300 }], month: { yen: 0, n: 0, short: 0, penalty: 0, done: 0, late: 0 }, stat: { met: 1, trades: 0, tradeYen: 0, tradeN: 0, missed: 0, penalty: 0, reqs: 1, reqDone: 0, reqLate: 0, declined: 0, hosted: 0 } };
    s.stock[sku] = 40;
    const m0 = s.money;
    const rp0 = s.rp ?? 0;
    const r = diploDay(s)!;
    expect(r.done.length).toBe(1);
    // 届けた品は値段どおりの売上（町の売上に入る）＋ お礼
    const goods = Math.round(10 * priceOf(s, sku));
    expect(s.money - m0).toBe(50000 + goods);
    expect(s.monthSales[key] ?? 0).toBeGreaterThanOrEqual(goods);
    expect((s.rp ?? 0) - rp0).toBe(300);
    expect(relOf(s, 'ruby')).toBe(30 + DIPLO.rel.done);
    s.diplo.reqs.push({ id: 2, land: 'ruby', key, n: 999, got: 0, due: s.day - 1, reward: 1, rp: 0 });
    s.stock[sku] = 0;
    expect(diploDay(s)!.late.length).toBe(1);
    expect(relOf(s, 'ruby')).toBe(30 + DIPLO.rel.done + DIPLO.rel.late);
  });
});

describe('セーブ（版 21）', () => {
  it('版 20 のセーブは読める：できごと・外交は空から（仲は初めの値）', () => {
    const s = town();
    const o = JSON.parse(serializeP1(s));
    o.v = 20;
    delete o.events;
    delete o.diplo;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(26);
    expect(back.events).toBeUndefined();
    expect(back.diplo).toBeUndefined();
    expect(relOf(back, 'ruby')).toBe(DIPLO.start);
    expect(evMul(back, 'demand')).toBe(1);
    // できごと・外交の中身は保存して戻せる
    back.events = newEvents();
    back.events.fx.push({ k: 'demand', mul: 1.2, until: back.day + 5, sector: back.sector ?? 'c1', ev: 'festival' });
    const again = deserializeP1(serializeP1(back))!;
    expect(evMul(again, 'demand')).toBeCloseTo(1.2);
  });
});

describe('追加の要望：作る物を替えたときの主力商品のまとめ替え', () => {
  const setup = () => {
    const s = town();
    const shops = myShops(s);
    const a = s.shops[shops[0].uid].shelves[0] as Sku;
    expect(a).toBeTruthy();
    const b = PRODUCTS.map((x) => `${x.key}:C` as Sku).find((x) => x !== a)!;
    return { s, a, b, uid: shops[0].uid };
  };
  it('主力が A のお店が一覧に出て、替えた店の主力が B になる（A は残りがあれば 2 段目へ）', () => {
    const { s, a, b, uid } = setup();
    const rows = bulkMainRows(s, a, b);
    expect(rows.some((r) => r.uid === uid)).toBe(true);
    const sh = s.shops[uid];
    sh.storage[a] = 12;
    if (sh.shelves.length < 2) sh.shelves.push(null);
    sh.shelves[1] = null;
    const note = bulkMainNote(s, a, bulkMainRows(s, a, b));
    expect(note.left).toBeGreaterThanOrEqual(12);
    expect(bulkMain(s, a, b, [uid])).toBe(1);
    expect(sh.shelves[0]).toBe(b);
    expect(sh.shelves[1]).toBe(a);
  });
  it('チェックを外したお店は替わらない・A を並べていないお店は出ない', () => {
    const { s, a, b, uid } = setup();
    expect(bulkMain(s, a, b, [])).toBe(0);
    expect(s.shops[uid].shelves[0]).toBe(a);
    setShelf(s, uid, 0, b);
    expect(bulkMainRows(s, a, b).some((r) => r.uid === uid)).toBe(false);
  });
  it('チュートリアルの 1 か月目は出さない', () => {
    const { s, a, b } = setup();
    s.tut = 5;
    expect(bulkMainRows(s, a, b)).toEqual([]);
  });
});

describe('追加の要望：境界の町の名前と進出のポップアップ', () => {
  it('画面の中心が境界に近づくと名前が出て、離れると消える', () => {
    const n = 16;
    const at: [number, number] = [n + 1, (n - 1) / 2];
    expect(edgeNear(n, [n - 2, 7], { dx: 1, dy: 0 }, at)).toBe(true);
    expect(edgeNear(n, [at[0] - EDGE_NEAR - 1, 7], { dx: 1, dy: 0 }, at)).toBe(false);
    expect(edgeNear(n, [7.5, 7.5], { dx: 1, dy: 0 }, at)).toBe(false);
    // 横にずれすぎても出さない
    expect(edgeNear(n, [n - 2, 7 + n], { dx: 1, dy: 0 }, at)).toBe(false);
  });
  it('「進出する」はいまの進出の関数（startMove）を呼ぶ。資金が足りなければ押せない', () => {
    const s = newP1(9);
    s.tut = 99;
    s.money = 1e7;
    openGate(s);
    const id = 'c2';
    expect(advanceOf(s, id).k).toBe('move');
    const called: string[] = [];
    const f = { go: () => called.push('go'), move: () => called.push('move'), rankup: () => called.push('rankup') };
    expect(advanceGo(advanceOf(s, id).k, f)).toBe(true);
    expect(called).toEqual(['move']);
    s.money = 0;
    const a = advanceOf(s, id);
    expect(a.k).toBe('short');
    expect(a.short).toBeGreaterThan(0);
    expect(advanceGo(a.k, f)).toBe(false);
    expect(called).toEqual(['move']);
  });
});
void jamOf;
