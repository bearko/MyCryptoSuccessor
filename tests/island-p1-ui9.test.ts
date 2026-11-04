/**
 * 段 UI9：提案書の品質基準。
 * ①推奨の一貫性：社長の前に出る提案書は、チュートリアル以外、必ず「推奨＝承認」。
 * - 人事の担当（hr）も PROPOSAL_SRC（ふるい分け・推奨の付け直し・失効）
 * - 作ったときの課題の一覧をカードに残し（Card.issues）、提案書は同じ課題で判断する
 * - 部長からの頼み（予算）の「今回の施策だけ承認」・束ねた手も同じふるい分け
 * - 提案書を開いた時点で承認でなくなっていれば取り下げ（withdrawCard）
 * - 短期が損でも承認を推すときは、理由に投資回収期間
 * 仕様は docs/ISLAND_PHASE1.md「提案書の品質基準（段 UI9）」。
 */
import { describe, expect, it } from 'vitest';
import { CARD } from '../src/island/p1/data';
import { bottleneck, deserializeP1, myShops, poolCap, serializeP1, stageCaps, stallOf, type P1State } from '../src/island/p1/model';
import { planOf } from '../src/island/p1/plan';
import { briefOf, judgeOf } from '../src/island/p1/brief';
import { PROPOSAL_SRC, cardInbox, cardsMonth, cardsOf, gateDraft, goneNow, newCards, planOfChoice, shownRec, stockDraft, storeAct, withdrawCard, withdrawStale, type Card, type Draft } from '../src/island/p1/card';
import { fitsLimit, isFlowKey, issuesOf, solvedBy } from '../src/island/p1/issues';
import { newDeleg, type PropAct, type Proposal } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

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
  return s;
};
const isDo = (c: Card['choices'][number]) => c.act.k === 'do' || c.act.k === 'approve';
const judge = (s: P1State, a: PropAct) => judgeOf(s, planOf(s, [a], { hero: null, q: 0.9, dept: 'logistics' }), issuesOf(s));

/** 倉庫の提案に「倉庫の強化（見送り）」と「いまの素材で作る（承認）」が並ぶ月（通常の自動プレイの 2 か月目） */
function mixed(): { s: P1State; fix: PropAct; use: PropAct } {
  for (const x of months('normal', 1)) {
    const s = load(x);
    const d = stockDraft(s);
    if (!d) continue;
    const fix = d.choices.find((c) => c.act.k === 'do' && storeAct(c.act.a));
    const use = d.choices.find((c) => c.act.k === 'do' && c.act.a.k === 'useup');
    if (fix && use && judge(s, (fix.act as { a: PropAct }).a).rec === 'skip' && judge(s, (use.act as { a: PropAct }).a).rec === 'ok') return { s, fix: (fix.act as { a: PropAct }).a, use: (use.act as { a: PropAct }).a };
  }
  throw new Error('no scene');
}
/** 倉庫が埋まっていて（warn 以上）、調達係のいる町（使わない素材で埋める） */
function crowdedBuy(): P1State {
  for (const x of months('normal', 1, true)) {
    const s = load(x);
    if (!s.staff.some((y) => y.task === 'buy')) continue;
    s.mats.wood = (s.mats.wood ?? 0) + Math.ceil(poolCap(s) * 0.95);
    if (bottleneck(stageCaps(s, true)) === 'buy' && !stallOf(s)) return s;
  }
  throw new Error('no scene');
}
/** 人事の担当のカードがある月 */
function hrScene(): { s: P1State; c: Card } {
  for (const seed of [1, 2, 3])
    for (const x of months('normal', seed, seed === 1)) {
      const s = load(x);
      s.cards = newCards();
      cardsMonth(s, s.reports[s.reports.length - 1]);
      const c = cardInbox(s).find((y) => y.src === 'hr');
      if (c) return { s, c };
    }
  throw new Error('no scene');
}

describe('①人事の担当の提案も、ふるい分け・推奨の付け直し・失効の対象', () => {
  it('hr は PROPOSAL_SRC。カードに作ったときの課題の一覧（issues）と解く課題（iss）が残る', () => {
    expect(PROPOSAL_SRC).toContain('hr');
    const { s, c } = hrScene();
    expect(c.issues?.length).toBeGreaterThan(0);
    expect(c.iss).toBeTruthy();
    const k = shownRec(s, c);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(isDo(c.choices[k])).toBe(true);
    const B = briefOf(s, planOfChoice(s, c, k)!, { card: c.id, iss: c.issues });
    expect(B.rec).toBe('ok');
    expect(B.iss).toBe(c.issues);
  });
  it('2 か月で失効する（部長の提案と同じ決まり）', () => {
    const { s, c } = hrScene();
    const C = cardsOf(s);
    C.mk += CARD.expire;
    cardsMonth(s, s.reports[s.reports.length - 1]);
    expect(C.inbox.some((x) => x.id === c.id)).toBe(false);
  });
});

describe('①部長からの頼み（予算）の「今回の施策だけ承認」も同じふるい分け', () => {
  it('承認にならない施策の選択肢は外す。承認になる施策は残る', () => {
    const { s, fix, use } = mixed();
    const D = (s.deleg ??= newDeleg());
    const hero = s.staff[0].hero;
    const mk = (id: number, act: PropAct): Proposal => ({ id, dept: 'logistics', hero, month: s.reports.length, sector: s.sector ?? 'c1', act, est: 100, err: 0.1, unit: 'G', cost: 0, status: 'new' });
    D.inbox = [mk(601, fix), mk(602, use)];
    const draft = (pid: number): Draft => ({ src: 'budget', kind: 'budget:logistics', hero, q: 0.8, dept: 'logistics', issue: { k: 'budget', ask: { why: 'over', pid } }, choices: [{ act: { k: 'budget', dept: 'logistics', lv: 'M' as never }, cost: 0, rec: true }, { act: { k: 'approve', pid }, cost: 0 }, { act: { k: 'skip' }, cost: 0 }], pri: 30 });
    const a = gateDraft(s, draft(601), issuesOf(s))!;
    expect(a.choices.some((c) => c.act.k === 'approve')).toBe(false);
    expect(a.choices.some((c) => c.act.k === 'budget')).toBe(true);
    const b = gateDraft(s, draft(602), issuesOf(s))!;
    expect(b.choices.some((c) => c.act.k === 'approve')).toBe(true);
  });
});

describe('①提案書を開いた時点で承認でなくなっていれば取り下げ', () => {
  it('withdrawCard：受け箱から外し、理由の一行（資金が減った）。チュートリアルのあいだは何もしない', () => {
    const { s, c } = hrScene();
    const k = shownRec(s, c);
    const act = (c.choices[k].act as { a: PropAct }).a;
    const g = withdrawCard(s, c.id, act, 'money')!;
    expect(g.why).toBe('money');
    expect(cardsOf(s).inbox.some((x) => x.id === c.id)).toBe(false);
    expect(goneNow(s).map((x) => x.name)).toContain(g.name);
    s.tut = 3;
    expect(withdrawCard(s, -1, act, 'loss')).toBeNull();
  });
  it('作ったときの課題が一覧から消えていれば「課題がほかの手で解けた」で取り下げる', () => {
    const { s, c } = hrScene();
    c.iss = { key: 'rp', pri: 1 };
    c.issues = issuesOf(s);
    s.dig = null;
    const gone = withdrawStale(s);
    expect(gone.some((g) => g.why === 'solved')).toBe(true);
    expect(cardsOf(s).inbox.some((x) => x.id === c.id)).toBe(false);
  });
});

describe('①短期が損でも承認を推すときは、理由に投資回収期間', () => {
  it('契約金・導入費用で短期がマイナスの承認の提案書は、理由の 1 行に「投資回収期間」か「か月では上回る」', () => {
    let n = 0;
    for (const seed of [1, 2])
      for (const x of months('normal', seed, seed === 1)) {
        const s = load(x);
        s.cards = newCards();
        s.money = Math.max(s.money, 50000);
        cardsMonth(s, s.reports[s.reports.length - 1]);
        for (const c of cardInbox(s)) {
          if (!PROPOSAL_SRC.includes(c.src) || c.note) continue;
          const k = shownRec(s, c);
          if (k < 0 || !isDo(c.choices[k])) continue;
          const B = briefOf(s, planOfChoice(s, c, k)!, { card: c.id, iss: c.issues });
          if (B.rec !== 'ok') continue;
          const S = B.vals.list.find((m) => m.key === 'short');
          if (S && S.d < -0.5) {
            expect(B.why).toMatch(/投資回収期間 \d+ か月|か月では上回る/);
            n++;
          }
        }
      }
    expect(n).toBeGreaterThan(0);
  });
});

describe('①性質：チュートリアルのあとは、推奨が見送りの提案書が社長の前に出ない（人事・束ねた手を含む）', () => {
  it('自動プレイの月の締めごとに、受け箱の提案のカード（hr を含む）は、推奨の手の提案書（束ねたあと・作ったときの課題）が承認', () => {
    let n = 0;
    for (const [p, seed, all] of [['normal', 1, true], ['normal', 2, false], ['rta', 3, false], ['normal', 4, false]] as const) {
      for (const x of months(p, seed, all)) {
        const s = load(x);
        if (s.reports.length % 3 === 0) s.money = Math.round(s.money * 0.1);
        withdrawStale(s);
        for (const c of cardInbox(s)) {
          if (!PROPOSAL_SRC.includes(c.src) || c.note) continue;
          const rk = shownRec(s, c);
          expect(rk).toBeGreaterThanOrEqual(0);
          expect(isDo(c.choices[rk])).toBe(true);
          const plan = planOfChoice(s, c, rk);
          if (!plan) continue;
          const B = briefOf(s, plan, { card: c.id, iss: c.issues });
          expect(B.rec, `${c.src} ${B.why}`).toBe('ok');
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(10);
  });
});

describe('②課題の定義と優先度（重要度 × 緊急度）', () => {
  it('どの課題にも重要度（G／月）と放置したときの 1 行がある。期限のある課題は日数つき。優先は段 → score（重要度 × 緊急度）の順', () => {
    let seen = 0;
    for (const seed of [1, 2])
      for (const x of months('normal', seed, seed === 1)) {
        const s = load(x);
        const xs = issuesOf(s);
        for (const [k, y] of xs.entries()) {
          expect(y.pri).toBe(k + 1);
          expect(y.impact).toBeGreaterThan(0);
          expect(y.loss.length).toBeGreaterThan(0);
          if (y.days != null) expect(y.loss).toMatch(/日後|もう起きている/);
          if (y.grow) expect(y.loss).toContain('伸ばせば');
          else expect(y.loss).toContain('放置すると');
          if (isFlowKey(y.key)) expect(y.limit).toBeTruthy();
          seen++;
        }
        // 収益性の改善は、ボトルネック・期限のある課題が無いときだけ
        const pressing = xs.some((y) => (isFlowKey(y.key) || y.key === 'store' || y.key === 'cash' || ((y.key === 'morale' || y.key === 'sat') && !y.grow)));
        if (pressing) expect(xs.some((y) => y.key === 'profit')).toBe(false);
      }
    expect(seen).toBeGreaterThan(20);
  });
  it('倉庫が原因の調達の頭打ちは「倉庫の容量不足」に寄せる（調達の課題は出ない）。人を置く手は、その課題を解かない', () => {
    const s = crowdedBuy();
    const xs = issuesOf(s);
    expect(xs.some((y) => y.key === 'buy')).toBe(false);
    const st = xs.find((y) => y.key === 'store')!;
    expect(st).toBeTruthy();
    expect(st.limit).toBe('room');
    expect(st.note).toContain('置き場所で頭打ち');
    // 人の手（制約に合わない）は流れの課題を解かない
    expect(fitsLimit('room', ['people'])).toBe(false);
    expect(fitsLimit('room', ['room'])).toBe(true);
    expect(fitsLimit('demand', ['equip'])).toBe(false);
    expect(fitsLimit('demand', ['channel'])).toBe(true);
    expect(fitsLimit('people', ['equip'])).toBe(true);
  });
  it('微小な増え（min 未満）では流れの課題を解かない。制約の種類に合わない手も解かない', () => {
    const x = { key: 'sell' as const, pri: 1, score: 1, now: 100, impact: 1, days: null, limit: 'demand' as const, min: 2, note: '', loss: '' };
    const probe = { units0: 100, units1: 100.5, cap0: 0, cap1: 0, used0: 0, used1: 0, d: {}, themes: [] };
    expect(solvedBy([x], { ...probe, kinds: ['channel'] })).toHaveLength(0);
    expect(solvedBy([x], { ...probe, units1: 103, kinds: ['channel'] })).toHaveLength(1);
    expect(solvedBy([x], { ...probe, units1: 103, kinds: ['equip'] })).toHaveLength(0);
    const pf = { key: 'profit' as const, pri: 1, score: 1, now: 0, impact: 1000, days: null, min: 3000, grow: true, note: '', loss: '' };
    expect(solvedBy([pf], { ...probe, d: { long: 2000 } })).toHaveLength(0);
    expect(solvedBy([pf], { ...probe, d: { long: 3500 } })).toHaveLength(1);
  });
});
