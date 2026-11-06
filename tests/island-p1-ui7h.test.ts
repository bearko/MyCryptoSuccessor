/**
 * 段 UI7h：「見送り」を推奨する提案書の残りをなくす（チュートリアル以外）。
 * - 倉庫の提案：推奨が承認になる手だけ（置き換え：いまの素材で作るほかの品）。無ければカードを出さない（倉庫の状況は課題の一覧に残る）
 * - 流れが止まったお知らせ：直す手が無い・どれも推奨が承認にならないなら、推奨の札の無い知らせ（「わかった」で閉じる）
 * - 受け箱で古くなったカード・部長の提案の一覧：開いたときにもう一度見て、推奨が承認にならなければ取り下げ（理由の一行）
 * 仕様は docs/ISLAND_PHASE1.md「課題の定義・推奨の決め方…（段 UI7g）」の段 UI7h の追記。
 */
import { describe, expect, it } from 'vitest';
import { CLEAR, PRODUCTS, sku, type Sku } from '../src/island/p1/data';
import { deserializeP1, madeSkus, myShops, poolCap, serializeP1, type P1State, type Report } from '../src/island/p1/model';
import { planOf } from '../src/island/p1/plan';
import { briefOf, judgeOf } from '../src/island/p1/brief';
import {
  PROPOSAL_SRC,
  cardInbox,
  cardLive,
  cardsMonth,
  cardsOf,
  choiceText,
  enqueue,
  gateDraft,
  goneLine,
  goneNow,
  newCards,
  planOfChoice,
  shownRec,
  staleCard,
  staleWhy,
  stallDraft,
  stockCard,
  stockDraft,
  storeAct,
  withdrawStale,
  type Card,
} from '../src/island/p1/card';
import { issuesOf } from '../src/island/p1/issues';
import { newDeleg, type PropAct, type Proposal } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';
import { openTier } from './l0util';

/** 最初の町（自動プレイ）の月の締めの写し。シード・方針ごとに 1 回 */
const saves = new Map<string, string[]>();
function months(p: 'normal' | 'rta', seed: number, all = false): string[] {
  const k = `${p}:${seed}:${all}`;
  if (!saves.has(k)) {
    const xs: string[] = [];
    runOnce(p, seed, { onlyFirst: !all, onMonth: (s, _sec, m) => void (myShops(s).length && m >= 2 && xs.push(serializeP1(s))) });
    saves.set(k, xs);
  }
  return saves.get(k)!;
}
const load = (x: string): P1State => {
  const s = deserializeP1(x)!;
  s.tut = 99;
  // 段 L0：ヒーローからの提案・知らせのカードは Rare の町から（会社が Rare の町を開いた状態にする。いまの町は最初の町のまま）
  return openTier(s, 'R');
};
const isDo = (c: Card['choices'][number]) => c.act.k === 'do' || c.act.k === 'approve';
const card = (s: P1State, d: NonNullable<ReturnType<typeof stockDraft>>): Card => ({ ...d, id: 900 + cardsOf(s).seq, mk: cardsOf(s).mk, sector: s.sector ?? 'c1', day: s.day, pop: false }) as Card;
const judge = (s: P1State, a: PropAct) => judgeOf(s, planOf(s, [a], { hero: null, q: 0.9, dept: 'logistics' }), issuesOf(s));

/** 倉庫があふれた最初の町（rta の 2 か月目の写し・使っていない商品の在庫と素材で埋める） */
let rtaSave: string | null = null;
function crowded(): P1State {
  if (!rtaSave)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _x, m) => {
        if (!rtaSave && m >= 2 && myShops(s).length && s.slots.some((x) => x.sku && x.worker != null)) rtaSave = serializeP1(s);
      },
    });
  const s = deserializeP1(rtaSave!)!;
  s.tut = 99;
  s.money = 80000;
  const made = madeSkus(s);
  const x = PRODUCTS.filter((p) => !p.tech && !p.relic && (p.tier ?? 'C') === 'C')
    .map((p) => sku(p.key, 'C'))
    .find((y) => !made.includes(y)) as Sku;
  s.stock[x] = 20;
  s.mats.wood = (s.mats.wood ?? 0) + Math.ceil(poolCap(s) * 0.9);
  return s;
}
/** 倉庫の提案に「倉庫の強化（見送り）」と「いまの素材で作る（承認）」が並ぶ月（通常の自動プレイの 2 か月目） */
function mixed(): P1State {
  for (const x of months('normal', 1)) {
    const s = load(x);
    const d = stockDraft(s);
    if (!d) continue;
    const fix = d.choices.find((c) => c.act.k === 'do' && storeAct(c.act.a));
    const use = d.choices.find((c) => c.act.k === 'do' && c.act.a.k === 'useup');
    if (fix && use && judge(s, (fix.act as { a: PropAct }).a).rec === 'skip' && judge(s, (use.act as { a: PropAct }).a).rec === 'ok') return s;
  }
  throw new Error('no scene');
}

describe('倉庫の提案：推奨が承認になる手だけ', () => {
  it('倉庫の強化が見送り（損が大きい）の月は、その手を外し、推奨はいまの素材で作る手。提案書の推奨も承認', () => {
    const s = mixed();
    const raw = stockDraft(s)!;
    const d = stockCard(s)!;
    expect(d).toBeTruthy();
    expect(d.choices.some((c) => c.act.k === 'do' && storeAct(c.act.a))).toBe(false);
    expect(raw.choices.some((c) => c.act.k === 'do' && storeAct(c.act.a))).toBe(true);
    // 倉庫の手が外れたので、セリフの結びは使い切り
    expect(d.issue).toMatchObject({ k: 'store', next: 'useup' });
    expect(d.issue.k === 'store' && d.issue.fix).toBeFalsy();
    s.cards = newCards();
    const c = enqueue(s, d)!;
    const rk = shownRec(s, c);
    expect(c.choices[rk].act.k).toBe('do');
    const B = briefOf(s, planOfChoice(s, c, rk)!, { card: c.id });
    expect(B.rec).toBe('ok');
  });
  it('置き換え：残る手が無いとき、いまの素材で作るほかの品（推奨が承認）に置き換える', () => {
    const s = mixed();
    const raw = stockDraft(s)!;
    // 使い切りの手を外した下書き（倉庫の強化：見送り ＋ このまま）でも、ふるい分けが同じ品の手を探してくる
    const d0 = { ...raw, choices: raw.choices.filter((c) => !(c.act.k === 'do' && c.act.a.k === 'useup')) };
    expect(d0.choices.filter(isDo).every((c) => judge(s, (c.act as { a: PropAct }).a).rec === 'skip')).toBe(true);
    const d = gateDraft(s, d0, issuesOf(s))!;
    expect(d).toBeTruthy();
    const alt = d.choices.find((c) => c.act.k === 'do');
    expect(alt && alt.act.k === 'do' && alt.act.a.k).toBe('useup');
    expect(alt!.rec).toBe(true);
    expect(judge(s, (alt!.act as { a: PropAct }).a).rec).toBe('ok');
  });
  it('置き換えられない（どの手も損が大きい）月はカードを出さない。倉庫の状況は課題の一覧に残る', () => {
    const s = crowded();
    const raw = stockDraft(s)!;
    expect(raw).toBeTruthy();
    expect(raw.choices.filter(isDo).every((c) => judge(s, (c.act as { a: PropAct }).a).rec === 'skip')).toBe(true);
    expect(stockCard(s)).toBeNull();
    expect(issuesOf(s).some((x) => x.key === 'store')).toBe(true);
    const C = cardsOf(s);
    C.inbox = [];
    cardsMonth(s, s.reports[s.reports.length - 1]);
    expect(C.inbox.some((c) => c.src === 'stock')).toBe(false);
  });
  it('段 UI5c の決まりのまま：倉庫のカードは受け箱の枚数に数えず、ほかのカードを押し出さない', () => {
    const s = mixed();
    const d = stockCard(s)!;
    const C = cardsOf(s);
    C.inbox = Array.from({ length: 12 }, (_, i) => ({ ...card(s, d), src: 'clerk' as const, kind: `x${i}`, id: 2000 + i, pop: true, seen: false }));
    const before = C.inbox.map((c) => c.id).slice(-8);
    enqueue(s, d);
    expect(C.inbox.some((c) => c.src === 'stock')).toBe(true);
    for (const id of before) expect(C.inbox.some((c) => c.id === id)).toBe(true);
  });
});

describe('流れが止まったお知らせ', () => {
  const stallRep = (s: P1State, stall: Report['stall']): Report => ({ ...s.reports[s.reports.length - 1], month: 99, flow: { bought: 0, made: 0, hauled: 0, sold: 0 }, stall }) as Report;
  it('直す手が無いときは、推奨の札の無い知らせ（「わかった」で閉じる）。その月のあいだだけ受け箱に残る', () => {
    const s = load(months('normal', 1)[0]);
    const r = stallRep(s, { stage: 'craft', why: 'nomake', hero: null } as never);
    const d = gateDraft(s, stallDraft(s, r)!, issuesOf(s))!;
    expect(d.note).toBe(true);
    expect(d.choices).toHaveLength(1);
    expect(d.choices[0].rec).toBeFalsy();
    s.cards = newCards();
    const c = enqueue(s, d)!;
    expect(shownRec(s, c)).toBe(-1);
    expect(choiceText(s, c, c.choices[0]).label).toBe('わかった');
    expect(cardLive(s, c)).toBe(true);
    expect(staleWhy(s, c)).toBeNull();
    cardsOf(s).mk++;
    expect(cardLive(s, c)).toBe(false);
  });
  it('直す手が見送り（資金が足りない）なら外して知らせに。払えれば提案（推奨は承認になる手）', () => {
    const s = load(months('normal', 1)[0]);
    const r = stallRep(s, { stage: 'buy', why: 'full', hero: null } as never);
    const raw = stallDraft(s, r)!;
    const fix = raw.choices.find((c) => c.act.k === 'do');
    expect(fix && fix.act.k === 'do' && fix.act.a.k).toBe('build');
    s.money = 10;
    const d = gateDraft(s, raw, issuesOf(s))!;
    expect(d.note).toBe(true);
    expect(d.choices.some(isDo)).toBe(false);
    // 月の締め：知らせとして出す（時間を止めて出す。ほかの提案より先）
    s.cards = newCards();
    cardsMonth(s, r);
    const st = cardInbox(s).find((c) => c.src === 'stall')!;
    expect(st).toBeTruthy();
    expect(st.note).toBe(true);
    expect(st.pop).toBe(true);
    expect(shownRec(s, st)).toBe(-1);
  });
});

describe('受け箱で古くなったカードの取り下げ', () => {
  /** 費用のかかる手だけが推奨の承認になるカード（月の締めのあと） */
  function costly(): { s: P1State; c: Card } {
    for (const seed of [1, 2, 3])
      for (const x of months('normal', seed)) {
        const s = load(x);
        s.cards = newCards();
        s.money = Math.max(s.money, 30000);
        cardsMonth(s, s.reports[s.reports.length - 1]);
        for (const c of cardInbox(s)) {
          if (!(PROPOSAL_SRC.includes(c.src) || c.src === 'hr') || c.note) continue;
          const ok = c.choices.filter((y) => isDo(y));
          if (ok.length && ok.every((y) => y.cost > 0) && staleWhy(s, c) == null) return { s, c };
        }
      }
    throw new Error('no scene');
  }
  it('資金を使ったあとに開くと、見せずに取り下げ。理由の一行（資金が減った）', () => {
    const { s, c } = costly();
    s.money = 0;
    const w = staleWhy(s, c);
    expect(w?.why).toBe('money');
    const g = staleCard(s, c)!;
    expect(g).toBeTruthy();
    expect(cardsOf(s).inbox.some((x) => x.id === c.id)).toBe(false);
    expect(goneLine(g)).toMatch(/^状況が変わったので、.+は取り下げました（理由：資金が減った）$/);
    expect(goneNow(s).map((x) => x.name)).toContain(g.name);
  });
  it('推奨が承認のままなら取り下げない', () => {
    const { s, c } = costly();
    expect(staleCard(s, c)).toBeNull();
    expect(cardsOf(s).inbox.some((x) => x.id === c.id)).toBe(true);
  });
});

describe('部長の提案の一覧', () => {
  it('推奨が承認にならない提案は一覧に出さずに取り下げ（理由の一行）。承認になる提案は残る', () => {
    const s = mixed();
    const raw = stockDraft(s)!;
    const fix = (raw.choices.find((c) => c.act.k === 'do' && storeAct(c.act.a))!.act as { a: PropAct }).a;
    const use = (raw.choices.find((c) => c.act.k === 'do' && c.act.a.k === 'useup')!.act as { a: PropAct }).a;
    const D = (s.deleg ??= newDeleg());
    const hero = s.staff[0].hero;
    const mk = (id: number, act: PropAct): Proposal => ({ id, dept: 'logistics', hero, month: s.reports.length, sector: s.sector ?? 'c1', act, est: 100, err: 0.1, unit: 'G', cost: 0, status: 'new' });
    D.inbox = [mk(501, fix), mk(502, use)];
    s.cards = newCards();
    const gone = withdrawStale(s);
    expect(D.inbox.map((p) => p.id)).toEqual([502]);
    expect(gone).toHaveLength(1);
    expect(gone[0].why).toBe('loss');
    expect(goneLine(gone[0])).toContain('取り下げました（理由：見込みが下がった）');
    // 同じ状態でもう一度開いても、何もしない（見直しは 1 回）
    expect(withdrawStale(s)).toHaveLength(0);
  });
});

describe('チュートリアルのあいだは変えない', () => {
  it('ふるい分け・取り下げをしない（流れの止まりは、もとの選択肢のまま）', () => {
    const s = load(months('normal', 1)[0]);
    const r = { ...s.reports[s.reports.length - 1], stall: { stage: 'buy', why: 'full' } } as Report;
    s.money = 10;
    s.tut = 5;
    const raw = stallDraft(s, r)!;
    const d = gateDraft(s, raw, issuesOf(s))!;
    expect(d).toBe(raw);
    expect(d.note).toBeUndefined();
    s.cards = newCards();
    const c = enqueue(s, d)!;
    expect(staleWhy(s, c)).toBeNull();
    expect(withdrawStale(s)).toHaveLength(0);
  });
});

describe('性質：チュートリアルのあとは、推奨が見送りの提案書が社長の前に出ない', () => {
  it('自動プレイの月の締めごとに、受け箱を開いたあと（取り下げのあと）の提案のカードは、推奨が承認の手。提案書の推奨も承認', () => {
    let n = 0;
    let gone = 0;
    for (const [p, seed, all] of [['normal', 1, true], ['normal', 2, false], ['rta', 3, false]] as const) {
      for (const x of months(p, seed, all)) {
        const s = load(x);
        // 月の締めのあとに資金を使った月も混ぜる（3 か月に 1 回、資金を 1 割に）
        if (s.reports.length % 3 === 0) s.money = Math.round(s.money * 0.1);
        gone += withdrawStale(s).length;
        for (const c of cardInbox(s)) {
          if (!(PROPOSAL_SRC.includes(c.src) || c.src === 'hr')) continue;
          if (c.note) {
            expect(shownRec(s, c)).toBe(-1);
            continue;
          }
          const rk = shownRec(s, c);
          expect(rk).toBeGreaterThanOrEqual(0);
          expect(isDo(c.choices[rk])).toBe(true);
          const plan = planOfChoice(s, c, rk);
          if (!plan) continue;
          expect(briefOf(s, plan, { card: c.id, iss: c.issues }).rec).toBe('ok');
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(5);
    void gone;
    void CLEAR;
    // 段 UI9b：提案書と同じ束ねた手で短期利益を出すぶん重くなった（CI の 2 CPU で 80 秒ほど）。性質のテストなので長めに
  }, 240_000);
});
