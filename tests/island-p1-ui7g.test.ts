/**
 * 段 UI7g：課題の定義（ボトルネック）・推奨の決め方・採用の費用（契約金と月給）・予算の縦の積み上げ棒。
 * 写真の場面（販売がボトルネックなのに、人事の担当が製造の担当を雇う提案をする）を再現し、直したあとは販売に効く提案になることを確かめる。
 * 仕様は docs/ISLAND_PHASE1.md「課題の定義（段 UI7g）」。
 */
import { describe, expect, it } from 'vitest';
import { SIGN } from '../src/island/p1/data';
import { bottleneck, stallOf, deserializeP1, hire, myShops, serializeP1, signFee, stageCaps, uncommonHeroes, wageMul, wageOf, whatIf, type P1State } from '../src/island/p1/model';
import { planOf } from '../src/island/p1/plan';
import { briefOf, contraOf, judgeOf, recOf } from '../src/island/p1/brief';
import { PROPOSAL_SRC, cardInbox, cardsMonth, hireOffer, planOfChoice, shownRec } from '../src/island/p1/card';
import { flowGain, isFlowKey, issuesOf } from '../src/island/p1/issues';
import { stackSegs, type Stack } from '../src/island/p1/slides';
import { setPolicy } from '../src/island/p1/policy';
import { heroRarityOf } from '../src/island/p1/hero';
import type { PropAct } from '../src/island/p1/deleg';
import { runOnce } from '../scripts/island/sim';

/** 通常の方針で最初の町を回し、お店のある月の締めの写し（2 か月目から） */
const saves = new Map<number, string[]>();
function months(seed: number): string[] {
  if (!saves.has(seed)) {
    const xs: string[] = [];
    runOnce('normal', seed, { onlyFirst: true, onMonth: (s, _sec, m) => void (myShops(s).length && m >= 2 && xs.push(serializeP1(s))) });
    saves.set(seed, xs);
  }
  return saves.get(seed)!;
}
const load = (x: string): P1State => {
  const s = deserializeP1(x)!;
  s.tut = 99;
  return s;
};
/** 写真の場面：販売がボトルネックで、雇える候補がいて、人事の担当が提案を持ってくる月 */
function photo(): P1State {
  for (const x of months(1)) {
    const s = load(x);
    if (bottleneck(stageCaps(s)) === 'sell' && s.hirePool.length && hireOffer(s)) return s;
  }
  throw new Error('no scene');
}

describe('課題の一覧（ボトルネックを先に・優先つき）', () => {
  it('SCM の詰まりの段（流れが止まっていれば止まっている段）が、課題の一覧の流れの課題と一致する。お金の課題が伸ばす課題より上', () => {
    for (const x of months(1).slice(0, 6)) {
      const s = load(x);
      const xs = issuesOf(s);
      const flow = xs.filter((y) => isFlowKey(y.key));
      // 段 UI9：倉庫が原因の調達の頭打ちは「倉庫の容量不足」に寄せる（流れの課題は出ない）
      const bn = stallOf(s)?.stage ?? bottleneck(stageCaps(s));
      if (flow.length) expect(flow[0].key).toBe(bn);
      else expect(xs[0]?.key).toBe('store');
      expect(xs.map((y) => y.pri)).toEqual(xs.map((_, k) => k + 1));
      // 段 UI9：収益性の改善は、ボトルネック・期限のある課題が無いときだけ
      expect(xs.some((y) => y.key === 'profit')).toBe(false);
    }
  });
  it('ボトルネックでない段を太くしても、会社の流れは増えない（flowGain 0）。詰まりの段は次に細い段まで', () => {
    const s = photo();
    const c = stageCaps(s, true);
    const bn = bottleneck(c);
    const other = (['buy', 'craft', 'haul'] as const).find((k) => k !== bn)!;
    expect(flowGain(s, other, 50, c)).toBe(0);
    expect(flowGain(s, 'sell', 5, c)).toBe(5);
  });
});

describe('写真の場面：販売がボトルネックのとき、人事の担当は販売に効く提案をする', () => {
  it('製造の担当を雇う手は「課題（販売がボトルネック）の解消につながらない」で、提案にならない', () => {
    const s = photo();
    const iss = issuesOf(s);
    // 前（main）の人事の提案と同じ手：製造の段の「人を雇う」
    const w = whatIf(s, 'craft').find((x) => x.move.kind === 'person' && x.move.hire);
    const a: PropAct = w && w.move.kind === 'person' ? { k: 'hire', hero: w.move.hero, task: 'craft', target: w.move.target } : { k: 'hire', hero: s.hirePool[0], task: 'craft', target: 0 };
    const j = judgeOf(s, planOf(s, [a], { hero: null, q: 0.9, dept: 'hr' }), iss);
    expect(j.rec).toBe('skip');
    expect(j.why).toContain('販売がボトルネック');
    expect(j.issue?.key === 'sell').toBe(false);
  });
  it('人事の担当の提案は、お店の人の手（店員を置く・替える・従業員）で、課題は販売。提案書の推奨は承認・費用に契約金と月給', () => {
    const s = photo();
    const o = hireOffer(s)!;
    expect(o.card.iss?.key).toBe('sell');
    expect(o.card.iss?.pri).toBe(issuesOf(s).find((x) => x.key === 'sell')!.pri);
    for (const c of o.card.choices) {
      if (c.act.k !== 'do') continue;
      const a = c.act.a;
      expect(a.k === 'part' || ((a.k === 'hire' || a.k === 'assign') && a.task === 'shop')).toBe(true);
    }
    const p = planOfChoice(s, o.card, o.k)!;
    const B = briefOf(s, p);
    expect(B.rec).toBe('ok');
    expect(B.issue?.key).toBe('sell');
    expect(B.why).toContain('販売がボトルネック');
    expect(B.after.units).toBeGreaterThan(B.now.units);
    expect(B.stance).toBeTruthy();
    const h = p.acts.find((x) => x.k === 'hire') as Extract<PropAct, { k: 'hire' }> | undefined;
    if (h) {
      expect(B.cost.money).toBe(signFee(s, h.hero));
      expect(B.cost.monthly).toBe(Math.round(wageOf(h.hero) * wageMul(s)));
    }
  });
});

describe('提案は課題を持ち、見送りが推奨の提案書は出さない', () => {
  it('月の締めのヒーロー・部長の提案は、どれも課題つき・推奨の手の提案書は承認・流れの課題は詰まりの段', () => {
    let n = 0;
    for (const seed of [1, 2]) {
      for (const x of months(seed).slice(0, 8)) {
        const s = load(x);
        s.cards!.inbox = [];
        cardsMonth(s, s.reports[s.reports.length - 1]);
        const bn = stallOf(s)?.stage ?? bottleneck(stageCaps(s));
        for (const c of cardInbox(s)) {
          if (!(PROPOSAL_SRC.includes(c.src) || c.src === 'hr') || c.src === 'stall' || c.src === 'stock') continue;
          const k = shownRec(s, c);
          const p = planOfChoice(s, c, k);
          if (!p) continue;
          n++;
          expect(c.iss).toBeTruthy();
          const B = briefOf(s, p, { card: c.id });
          expect(B.rec).toBe('ok');
          expect(B.solved.length).toBeGreaterThan(0);
          if (c.iss && isFlowKey(c.iss.key)) expect(c.iss.key).toBe(bn);
        }
      }
    }
    expect(n).toBeGreaterThan(3);
  });
});

describe('推奨の決め方（方針と真っ向から反する・課題を解かない・予算と資金が足りない、だけが見送り）', () => {
  const vals = (list: { key: 'short' | 'long' | 'sat' | 'morale'; d: number }[], value = 1000) => ({ policy: 'balance' as const, list: list.map((x) => ({ ...x, now: 0, after: x.d, why: '' })), value, parts: { short: 0, long: 0, morale: 0, sat: 0, brand: 0, rp: 0 }, scale: 1, rpG: 1 });
  const co = { n: 0, money: 0, cash: 10000, left: 9000, reserve: 100 };
  const iss = [{ key: 'sell' as const, pri: 1, score: 1, now: 1, impact: 1, days: null, note: '', loss: '' }];
  it('課題に効き、払えるなら承認（方針に届かないだけでは見送らない）', () => {
    const r = recOf({ block: [], co, vals: vals([{ key: 'long', d: 500 }], -10), iss, issue: iss[0], solved: iss, contra: null });
    expect(r.rec).toBe('ok');
    expect(r.why).toContain('課題（販売がボトルネック）を解消');
  });
  it('課題を解かない・方針と真っ向から反する・資金が足りないは見送り（理由はそのどれか）', () => {
    expect(recOf({ block: [], co, vals: vals([{ key: 'long', d: 500 }]), iss, issue: null, solved: [], contra: null }).why).toContain('解消につながらない');
    expect(recOf({ block: [], co, vals: vals([{ key: 'long', d: 500 }]), iss, issue: iss[0], solved: iss, contra: { pn: 'お客様第一', chip: '🤝 −3' } }).why).toContain('真っ向から反する');
    expect(recOf({ block: ['資金不足'], co, vals: vals([]), iss, issue: iss[0], solved: iss, contra: null }).why).toContain('足りません');
  });
  it('方針と真っ向から反する：お客様第一で満足度が下がる手。バランスでは反しない', () => {
    const s = photo();
    setPolicy(s, 'customer');
    expect(contraOf(s, null, vals([{ key: 'sat', d: -3 }]))?.pn).toBe('お客様第一');
    expect(contraOf(s, null, vals([{ key: 'sat', d: 2 }]))).toBeNull();
    setPolicy(s, 'balance');
    expect(contraOf(s, null, vals([{ key: 'sat', d: -3 }]))).toBeNull();
  });
});

describe('採用の費用：契約金（1 回・レアリティで上がる）と月給（毎月）', () => {
  it('契約金は月給 × レアリティの倍率（Common は 0・最初の町の 1 か月目は 0）。払えなければ雇えない', () => {
    const s = photo();
    const common = s.hirePool.find((x) => heroRarityOf(x) === 'C');
    if (common != null) expect(signFee(s, common)).toBe(0);
    // Uncommon のヒーローを候補に入れて確かめる
    const id = uncommonHeroes().find((x) => !s.staff.some((y) => y.hero === x))!;
    s.hirePool = [id, ...s.hirePool];
    const fee = signFee(s, id);
    expect(fee).toBe(Math.round((wageOf(id) * wageMul(s) * SIGN.mul[heroRarityOf(id)]) / SIGN.round) * SIGN.round);
    expect(fee).toBeGreaterThan(0);
    expect(SIGN.mul.U).toBeGreaterThan(SIGN.mul.C);
    expect(SIGN.mul.L).toBeGreaterThan(SIGN.mul.R);
    const first = { ...s, reports: [], sector: 'c1' } as P1State;
    expect(signFee(first, id)).toBe(0);
    const poor = load(serializeP1(s));
    poor.hirePool = s.hirePool;
    poor.money = fee - 1;
    expect(hire(poor, id)).toBe('money');
    const rich = load(serializeP1(s));
    rich.hirePool = s.hirePool;
    const m0 = rich.money;
    expect(hire(rich, id)).toBeNull();
    expect(m0 - rich.money).toBe(fee);
  });
});

describe('予算の縦の積み上げ棒（使った・使う見込み・この施策・残り）', () => {
  const base: Stack = { title: '', total: 100000, used: 30000, expect: 40000, delta: 10000, mode: 'spend', labUsed: 'u', labExp: 'e', labDelta: 'd' };
  it('増額：赤帯は見込みの上、点線は赤帯の上辺。残りは枠の残り', () => {
    const x = stackSegs(base);
    expect(x.segs.map((y) => y.cls)).toEqual(['is-used', 'is-exp', 'is-delta', 'is-left']);
    expect(x.line).toBe(80000);
    expect(x.left).toBe(20000);
  });
  it('減額：赤帯は見込みのうち減る分、点線は赤帯の下辺（新しい見込み）。枠を超える分', () => {
    const x = stackSegs({ ...base, delta: -15000 });
    expect(x.segs.map((y) => y.cls)).toEqual(['is-used', 'is-exp', 'is-delta', 'is-left']);
    expect(x.line).toBe(55000);
    expect(stackSegs({ ...base, delta: 50000 }).over).toBe(20000);
  });
  it('経営会議（枠の増減）：増額は枠の上に赤・減額は枠の上から削る赤（下辺に点線）', () => {
    const inc = stackSegs({ ...base, mode: 'cap', used: 0, delta: 30000 });
    expect(inc.segs.map((y) => y.cls)).toEqual(['is-exp', 'is-left', 'is-delta']);
    expect(inc.line).toBe(130000);
    const dec = stackSegs({ ...base, mode: 'cap', used: 0, delta: -30000 });
    expect(dec.line).toBe(70000);
    expect(dec.segs[dec.segs.length - 1].cls).toBe('is-delta');
  });
});
