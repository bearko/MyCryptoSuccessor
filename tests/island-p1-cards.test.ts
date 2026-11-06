// 提案・報告のカード（段 UI1。docs/ISLAND_PHASE1.md「提案・報告のカード」「ヒーローの個性」）：
// 1 か月目（チュートリアル）は出さない・出る数の上限と受け箱・販売の詰まりで店員の提案（毎月の費用を引いた利益の順）・SCM の大きいボタン・
// 口調の型と一言・セリフの字数・★3 の「任せる」・CS／炎上の予告／辞めたい／経理の助言／巻き返しの効き目・古いセーブ
import { describe, expect, it } from 'vitest';
import raw from '../src/generated/catalog.json';
import { CARD, MORALE } from '../src/island/p1/data';
import {
  cardInbox,
  cardsCompany,
  cardsDay,
  cardsMonth,
  chooseCard,
  enqueue,
  newCards,
  nextPop,
  quipOfCard,
  sayLength,
  sayOf,
  starOf,
  trustCard,
  type Card,
  type Draft,
} from '../src/island/p1/card';
import { allQuips, QUIP_CATS, QUIP_MAX, quipOf, TONES, toneOf, toneQuipCount, traitOf } from '../src/island/p1/persona';
import { bestSell, sellMoves, shopMonthly } from '../src/island/p1/moves';
import { refundCost, replyGain, noticeCost } from '../src/island/p1/cs';
import { talkGain } from '../src/island/p1/hr';
import { taxPlan } from '../src/island/p1/acct';
import { deserializeP1, jamOf, myShops, newP1, serializeP1, staffOf, step, type P1State, type Report } from '../src/island/p1/model';
import { runOnce } from '../scripts/island/sim';
import { openTier } from './l0util';

/** タオックスで ④ 販売が詰まっている月（自動プレイの最短の方針の写し） */
let sellSave: string | null = null;
function sellJam(): P1State {
  if (!sellSave)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!sellSave && m >= 2 && myShops(s).length && jamOf(s) === 'sell') sellSave = serializeP1(s);
      },
    });
  const s = deserializeP1(sellSave!)!;
  s.tut = 99;
  // 段 L0：ヒーローからの提案・知らせのカードは Rare の町から（会社が Rare の町を開いた状態にする。いまの町はタオックスのまま）
  return openTier(s, 'R');
}
const fakeReport = (s: P1State): Report => ({ ...(s.reports[s.reports.length - 1] ?? ({} as Report)), month: (s.reports[s.reports.length - 1]?.month ?? 0) + 1, comeback: undefined, rally: undefined });
const draft = (hero: number | null, kind: string, src: Draft['src'] = 'quit'): Draft => ({ src, kind, hero, q: 0.8, dept: null, issue: { k: 'quit', days: 30 }, choices: [{ act: { k: 'skip' }, cost: 0 }], pri: 1 });

describe('1 か月目（チュートリアル）にカードが出ない', () => {
  it('チュートリアルの 1 か月目は、月の締めまでカードが作られず、作られても時間を止めて出さない', () => {
    const s = newP1(1);
    expect(typeof s.tut).toBe('number');
    for (let d = 0; d < 20; d++) step(s);
    expect(s.reports.length).toBe(0);
    expect(s.cards?.inbox.length ?? 0).toBe(0);
    // チュートリアルの途中は、出す予定のカードがあっても出さない
    s.cards = newCards();
    s.cards.inbox.push({ id: 1, src: 'quit', kind: 'quit', hero: s.staff[0].hero, q: 0.8, dept: null, mk: 0, sector: s.sector ?? 'c1', day: s.day, issue: { k: 'quit', days: 30 }, choices: [{ act: { k: 'skip' }, cost: 0 }], pop: true });
    s.staff[0].quit = s.day + 30;
    expect(nextPop(s)).toBeNull();
    s.tut = 99;
    expect(nextPop(s)?.id).toBe(1);
    // 1 か月目の締めのあとの月末ポーズ（チュートリアルの終わり）も、2 か月目に入るまで待つ
    s.reports = [{ month: 1 } as Report];
    s.monthPause = true;
    expect(nextPop(s)).toBeNull();
    s.monthPause = false;
    expect(nextPop(s)?.id).toBe(1);
  });
});

describe('出る数の上限（C 1・U 2・R 以上 3／同じヒーロー月 1／同じ種類 2 か月）と受け箱', () => {
  it('ランクごとの上限を超えたら、時間を止めずに受け箱へ', () => {
    for (const [tier, cap] of [['C', 1], ['U', 2], ['R', 3], ['E', 3]] as const) {
      const s = sellJam();
      s.tier = tier;
      s.cards = newCards();
      const cs = [1, 2, 3, 4].map((k) => enqueue(s, draft(9000 + k, `k${k}`))!);
      expect(cs.filter((c) => c.pop).length).toBe(cap);
      expect(cs.length).toBe(4);
      expect(s.cards.inbox.length).toBe(4);
      expect(CARD.cap[tier]).toBe(cap);
    }
  });
  it('同じヒーローは月に 1 回・同じ種類は 2 か月あける', () => {
    const s = sellJam();
    s.tier = 'R';
    s.cards = newCards();
    expect(enqueue(s, draft(1, 'a'))!.pop).toBe(true);
    // 同じヒーロー：2 枚目は受け箱だけ
    expect(enqueue(s, draft(1, 'b'))!.pop).toBe(false);
    // 次の締め：種類 a はまだ出さない（CARD.kindGap か月あける）、別の種類は出る
    s.cards.mk++;
    s.cards.popN = 0;
    s.cards.heroes = [];
    expect(enqueue(s, draft(2, 'a'))!.pop).toBe(false);
    expect(enqueue(s, draft(3, 'c'))!.pop).toBe(true);
    s.cards.mk++;
    s.cards.popN = 0;
    s.cards.heroes = [];
    expect(enqueue(s, draft(4, 'a'))!.pop).toBe(true);
    // 数え：出した・受け箱に回った
    expect((s.cards.stat.pop.R ?? 0) + (s.cards.stat.boxed.R ?? 0)).toBe(s.cards.stat.made.R);
  });
});

describe('販売が詰まりの月に、店員から販売の手の提案（毎月の費用を引いた利益の順）', () => {
  it('店員が話し手で、選択肢は見込み（毎月の費用を引いた利益）の大きい順・最後は「このまま」', () => {
    const s = sellJam();
    expect(jamOf(s)).toBe('sell');
    s.cards = newCards();
    cardsMonth(s, fakeReport(s));
    const c = cardInbox(s).find((x) => x.src === 'clerk');
    expect(c).toBeTruthy();
    const shop = Object.values(s.shops).find((sh) => sh.staff === c!.hero);
    expect(shop).toBeTruthy();
    const dos = c!.choices.filter((x) => x.act.k === 'do');
    expect(dos.length).toBeGreaterThanOrEqual(1);
    expect(dos.length).toBeLessThanOrEqual(CARD.choices - 1);
    for (let k = 1; k < dos.length; k++) expect(dos[k - 1].est!).toBeGreaterThanOrEqual(dos[k].est!);
    expect(c!.choices[c!.choices.length - 1].act.k).toBe('skip');
    expect(c!.choices.filter((x) => x.rec).length).toBe(1);
  });
  it('販売の手は、毎月の費用（2 軒目の維持費とアルバイト代）を引いた利益で並ぶ', () => {
    const s = sellJam();
    const ms = sellMoves(s);
    expect(ms.length).toBeGreaterThan(0);
    for (let k = 1; k < ms.length; k++) expect(ms[k - 1].net).toBeGreaterThanOrEqual(ms[k].net);
    for (const m of ms) if (m.kind !== 'ad') expect(m.net).toBe(Math.round(m.gross - m.monthly));
    const shop = ms.find((m) => m.kind === 'shop');
    if (shop) expect(shop.monthly).toBe(shopMonthly());
  });
});

describe('SCM の大きいボタン', () => {
  it('いちばん見込みの大きい手（毎月の費用を引いた利益）になっている', () => {
    const s = sellJam();
    const ms = sellMoves(s).filter((m) => m.units > 0.5);
    const best = bestSell(s)!;
    expect(best).toBeTruthy();
    expect(best.net).toBe(Math.max(...ms.map((m) => m.net)));
    // 頭打ちの理由が「遠い」でも、2 軒目が見込みで負けていれば 2 軒目にはならない
    const shop = ms.find((m) => m.kind === 'shop');
    if (shop && shop.net < best.net) expect(best.kind).not.toBe('shop');
  });
});

describe('口調の型（属性・陣営から）とセリフ・一言', () => {
  const heroes = raw.heroes as { id: number; attributes: string[] }[];
  it('386 体すべてに型があり、8 種類とも使われている。性格の一言もある', () => {
    expect(heroes.length).toBe(386);
    const seen = new Set<string>();
    for (const h of heroes) {
      const tn = toneOf(h.id);
      expect(TONES).toContain(tn);
      seen.add(tn);
      expect(traitOf(h.id).length).toBeGreaterThan(0);
    }
    expect(seen.size).toBe(TONES.length);
  });
  it('属性で型が変わる（学問 → 学者・長柄武器 → 武人・隠密 → 寡黙）', () => {
    const by = (a: string) => heroes.filter((h) => h.attributes.includes(a)).map((h) => toneOf(h.id));
    const top = (xs: string[]) => [...new Set(xs)].sort((a, b) => xs.filter((x) => x === b).length - xs.filter((x) => x === a).length)[0];
    expect(top(by('理系学問'))).toBe('scholar');
    expect(top(by('長柄武器'))).toBe('warrior');
    expect(top(by('隠密'))).toBe('quiet');
  });
  it('課題のセリフは 60 字以内（すべてのヒーロー・すべての課題の種類・大きな数字でも）', () => {
    const s = sellJam();
    const issues: Card['issue'][] = [
      { k: 'sell', share: 0.29, pile: 1234 },
      { k: 'sell', share: 0.05, pile: 0 },
      { k: 'craft', n: 12345 },
      { k: 'buy', n: 12345 },
      { k: 'idle', what: 'assign', stage: 'haul' },
      { k: 'idle', what: 'ad' },
      { k: 'idle', what: 'permit' },
      { k: 'head' },
      { k: 'cs', kind: 'out', key: 'Lantern', n: 3 },
      { k: 'cs', kind: 'closed', key: null, n: 3 },
      { k: 'flame', cause: 'ignore' },
      { k: 'rally', by: 'クリプト・サン・シティ商会', sale: true, months: 3 },
      { k: 'quit', days: 45 },
      { k: 'tax', q: 12, need: 12345678, save: 1234567 },
    ];
    let n = 0;
    for (const h of heroes)
      for (const issue of issues) {
        const c: Card = { id: 1, src: 'clerk', kind: 'sell', hero: h.id, q: 0.8, dept: 'logistics', mk: 3, sector: 'c1', day: 0, issue, choices: [], pop: false };
        const len = sayLength(s, c);
        if (len > CARD.sayMax) throw new Error(`${h.id} ${issue.k} ${len} ${sayOf(s, c)}`);
        n++;
      }
    expect(n).toBe(386 * issues.length);
  });
  it('ウィットの一言：全部の型・全部の課題に 2 つ以上・どれも 30 字まで・月で回る', () => {
    for (const tn of TONES) for (const c of QUIP_CATS) expect(toneQuipCount(tn, c)).toBeGreaterThanOrEqual(2);
    for (const x of allQuips()) expect(x.text.replace(/\[\[|\]\]/g, '').length).toBeLessThanOrEqual(QUIP_MAX);
    // 同じ人・同じ課題でも、月が変われば別の一言（続けて同じにならない）
    for (const h of heroes.slice(0, 60)) for (const c of QUIP_CATS) expect(quipOf(h.id, c, 4)).not.toBe(quipOf(h.id, c, 5));
    // 課題の説明とは別（セリフに一言は入らない）
    const s = sellJam();
    const c: Card = { id: 7, src: 'clerk', kind: 'sell', hero: 1001, q: 0.8, dept: 'logistics', mk: 2, sector: 'c1', day: 0, issue: { k: 'sell', share: 0.3, pile: 40 }, choices: [], pop: false };
    expect(sayOf(s, c)).not.toContain(quipOfCard(c)!);
  });
});

describe('★3 の「任せる」', () => {
  it('★ は出来と Lv で上がり、★3 で任せられる。任せた種類は次からカードなしで実行して報告', () => {
    expect(starOf(0.73, 1)).toBe(1);
    expect(starOf(0.82, 1)).toBe(2);
    expect(starOf(0.75, 12)).toBe(2);
    expect(starOf(0.9, 25)).toBe(3);
    expect(starOf(0.9, 5)).toBe(2);
    const s = sellJam();
    s.money = 5_000_000;
    s.cards = newCards();
    cardsMonth(s, fakeReport(s));
    const c = cardInbox(s).find((x) => x.src === 'clerk')!;
    expect(c).toBeTruthy();
    const st = staffOf(s, c.hero!)!;
    // 育てた店員（出来と Lv が高い）
    st.level = 40;
    st.stats = { ...st.stats, agi: 100, phy: 100, int: 100 };
    c.q = 0.95;
    const r = trustCard(s, c.id);
    expect(r.ok).toBe(true);
    expect(s.cards.trust).toContain(`${c.hero}:sell`);
    // 次の締め：同じ店員の販売の提案はカードにならず、実行されて報告に残る
    const before = s.cards.stat.auto.C ?? 0;
    const rep = fakeReport(s);
    cardsMonth(s, rep);
    const again = cardInbox(s).filter((x) => x.src === 'clerk' && x.kind === 'sell' && x.hero === c.hero && !x.held);
    if ((s.cards.stat.auto.C ?? 0) > before) {
      expect(again.length).toBe(0);
      expect(rep.cards?.auto.length).toBeGreaterThan(0);
      expect(s.cards.auto.length).toBeGreaterThan(0);
    } else expect(again.every((x) => !x.pop)).toBe(true);
  });
});

describe('いまある知らせをカードで選んでも、効き目は前と同じ', () => {
  const uState = () => {
    const s = sellJam();
    s.tier = 'U';
    s.cards = newCards();
    s.money = 1_000_000;
    return s;
  };
  it('問い合わせ：合う返事がおすすめで、選ぶと満足度が replyGain だけ上がる', () => {
    const s = uState();
    s.cs = { sat: 60, inbox: [{ id: 5, kind: 'price', key: 'Sensu', day: s.day }], next: 6, out: 0, closed: 0, carry: 0, autoCarry: 0, month: { got: 0, answered: 0, good: 0, expired: 0, auto: 0, refund: 0 }, warn: null, flame: null, flames: 0, warns: 0, expTotal: 0, news: [] };
    cardsMonth(s, fakeReport(s));
    const c = cardInbox(s).find((x) => x.src === 'cs')!;
    expect(c).toBeTruthy();
    const k = c.choices.findIndex((x) => x.rec);
    const ch = c.choices[k];
    expect(ch.act).toMatchObject({ k: 'reply', r: 'refund' });
    const gain = replyGain(s, { kind: 'price' }, 'refund');
    const m0 = s.money;
    const cost = refundCost(s);
    expect(chooseCard(s, c.id, k).ok).toBe(true);
    expect(s.cs.sat).toBeCloseTo(60 + gain, 6);
    expect(s.money).toBe(m0 - cost);
    expect(s.cs.inbox.length).toBe(0);
  });
  it('炎上の予告：お詫びの告知で予告が済み、費用は noticeCost', () => {
    const s = uState();
    s.cs = { sat: 60, inbox: [], next: 1, out: 0, closed: 0, carry: 0, autoCarry: 0, month: { got: 0, answered: 0, good: 0, expired: 0, auto: 0, refund: 0 }, warn: { cause: 'out', day: s.day }, flame: null, flames: 0, warns: 1, expTotal: 0, news: [] };
    cardsMonth(s, fakeReport(s));
    const c = cardInbox(s).find((x) => x.src === 'flame')!;
    expect(c).toBeTruthy();
    const m0 = s.money;
    expect(chooseCard(s, c.id, c.choices.findIndex((x) => x.act.k === 'apologize')).ok).toBe(true);
    expect(s.cs.warn?.done).toBe(true);
    expect(s.money).toBe(m0 - noticeCost(s));
  });
  it('辞めたい：本人が話し手。面談で士気 +talkGain（予告 1 回に 1 度）', () => {
    const s = uState();
    const st = s.staff[s.staff.length - 1];
    st.quit = s.day + 30;
    st.morale = 10;
    cardsDay(s, [st.hero]);
    const c = cardInbox(s).find((x) => x.src === 'quit')!;
    expect(c.hero).toBe(st.hero);
    const k = c.choices.findIndex((x) => x.act.k === 'talk');
    expect(c.choices[k].rec).toBe(true);
    expect(chooseCard(s, c.id, k).ok).toBe(true);
    expect(st.morale).toBeCloseTo(10 + talkGain(s), 6);
    expect(st.talked).toBe(true);
    expect(MORALE.quit.talk).toBeGreaterThan(0);
  });
  it('経理の助言（決算の 1 か月前）：見込みは税と節税の画面と同じ（あと ○○ G 投資すると税が △△ G 減る）', () => {
    const s = uState();
    s.land = { ...(s.land ?? ({} as NonNullable<P1State['land']>)), mine: [...(s.land?.mine ?? ['c1']), 'u1'] } as NonNullable<P1State['land']>;
    s.day = 60;
    s.acct = { cur: { base: 300_000, capex: 0, rnd: 0, env: 0, months: 2 }, hist: [], paid: 0, saved: 0, carry: [], owed: 0 };
    const p = taxPlan(s);
    expect(p.on).toBe(true);
    expect(p.room).toBeGreaterThan(0);
    cardsCompany(s);
    const c = cardInbox(s).find((x) => x.src === 'tax');
    expect(c).toBeTruthy();
    expect(c!.issue).toMatchObject({ k: 'tax', need: p.needCapex, save: p.save });
    const open = c!.choices.find((x) => x.act.k === 'open')!;
    expect(open.est).toBe(p.save);
  });
  it('巻き返し：マーケの担当が宣伝で返すか聞き、選ぶと宣伝が始まる（費用と期間はいまの宣伝のまま）', () => {
    const s = uState();
    const r = fakeReport(s);
    r.comeback = { by: 'ランタン堂', rid: 'lantern', months: 3, bonus: 1000 };
    cardsMonth(s, r);
    const c = cardInbox(s).find((x) => x.src === 'rally')!;
    expect(c).toBeTruthy();
    const k = c.choices.findIndex((x) => x.act.k === 'do');
    const a = c.choices[k].act as { k: 'do'; a: { k: 'ad'; id: string } };
    const m0 = s.money;
    expect(chooseCard(s, c.id, k).ok).toBe(true);
    expect(s.ads[a.a.id]).toBeGreaterThan(0);
    expect(s.money).toBe(m0 - c.choices[k].cost);
  });
});

describe('古いセーブ（版 19）', () => {
  it('版 19 のセーブを読むと版 20 になり、カードの受け箱・任せた種類は空から', () => {
    const s = sellJam();
    const o = JSON.parse(serializeP1(s));
    o.v = 19;
    delete o.cards;
    const back = deserializeP1(JSON.stringify(o))!;
    expect(back.v).toBe(28);
    expect(back.cards).toBeUndefined();
    back.tut = 99;
    cardsMonth(back, fakeReport(back));
    expect(back.cards?.trust).toEqual([]);
    expect(back.cards?.mk).toBe(1);
  });
});
