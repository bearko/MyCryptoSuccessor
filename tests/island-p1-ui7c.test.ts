/**
 * 段 UI7c：お金以外の期待効果（短期・長期・士気・満足度・ブランド・研究）と、経営方針（社長の価値観）。
 * 指標の見積もり・方針ごとの推奨の切り替わり・束ね方・要約の一言の字数・セーブ。
 * 仕様は docs/ISLAND_PHASE1.md「経営方針とお金以外の期待効果（段 UI7c）」。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { heroById } from '../src/game/catalog';
import { CS, POLICY, SKILL, type PolicyId } from '../src/island/p1/data';
import { deserializeP1, myShops, serializeP1, type P1State } from '../src/island/p1/model';
import { afterOf, baseOf, planOf } from '../src/island/p1/plan';
import { PITCH_MAX, brandRate, briefOf, leadOf, moraleAvg, pitchOf, recOf, rpRate, satSettle, valuesOf } from '../src/island/p1/brief';
import { askDue, policyOf, setPolicy } from '../src/island/p1/policy';
import { newCards, planOfChoice, type Card } from '../src/island/p1/card';
import { actOk, type PropAct } from '../src/island/p1/deleg';
import { loadVoice } from '../src/island/p1/voice';
import { runOnce } from '../scripts/island/sim';

let save: string | null = null;
function town(): P1State {
  if (!save)
    runOnce('rta', 1, {
      onlyFirst: true,
      onMonth: (s, _sector, m) => {
        if (!save && m >= 2 && myShops(s).length) save = serializeP1(s);
      },
    });
  const s = deserializeP1(save!)!;
  s.tut = 99;
  s.money = 2_000_000;
  for (const k of Object.keys(s.ads)) s.ads[k] = 0;
  return s;
}
/** Uncommon の町として：問い合わせの記録（先月 2 件・1 件に合う返事・1 件期限切れ）・Uncommon の輪・職場の環境のパネルの前提 */
function uTown(): P1State {
  const s = town();
  s.tier = 'U';
  const r = s.reports[s.reports.length - 1];
  r.cs = { got: 2, answered: 1, good: 1, expired: 1, auto: 0, sat: 60, prev: 60, out: 2, closed: 0, open: 0 };
  s.flags.rings = [...new Set([...(s.flags.rings ?? []), 'U' as const])];
  r.dig = { found: 2, lv: 3, rp: 300 };
  for (const k of ['lounge', 'shift', 'welfare', 'cs_center', 'cs_faq']) if (!s.skills.includes(k)) s.skills.push(k);
  return s;
}
const canteen: PropAct = { k: 'skill', id: 'ga_canteen' };
const survey: PropAct = { k: 'skill', id: 'cs_survey' };

beforeAll(async () => {
  await loadVoice();
});

describe('お金以外の指標の見積もり（いまのモデルの効き方から）', () => {
  it('士気：職場の環境のパネル 1 つで、全員の目指す値の平均が MORALE.env 上がる', () => {
    const s = uTown();
    const a = moraleAvg(s)!;
    const c = structuredClone(s);
    c.skills.push('ga_canteen');
    expect(moraleAvg(c)! - a).toBeCloseTo(2, 5);
  });
  it('満足度：調査のパネルで、合う返事の上がり方が増え、落ち着く先が上がる。Common の町は出さない', () => {
    const s = uTown();
    const a = satSettle(s, s)!;
    const c = structuredClone(s);
    c.skills.push('cs_survey');
    expect(satSettle(s, c)!).toBeGreaterThan(a);
    // 落ち着く先 ＝ 始めの値 ＋ 月の動き ÷ 戻る力
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
    const cc = structuredClone(s);
    cc.tier = 'C';
    expect(satSettle(cc, cc)).toBeNull();
  });
  it('ブランド：広報室で月 +Lv・満足度が高いと +1。研究：先月の発掘の RP を、発掘の倍率で', () => {
    const s = uTown();
    const b0 = brandRate(s, 60);
    const c = structuredClone(s);
    c.skills.push('pr');
    expect(brandRate(c, 60) - b0).toBe(1);
    expect(brandRate(s, CS.brandHi) - b0).toBe(1);
    expect(rpRate(s, s)).toBeCloseTo(300, 6);
  });
  it('長期利益：宣伝だけの手は 1 か月目しか効かない（長期 ＝ 短期）。指標ごとの価値の合計が価値', () => {
    const s = town();
    const p = planOf(s, [{ k: 'ad', id: 'flyer' }], { hero: null, q: 0.9, dept: 'marketing' });
    const v = valuesOf(s, p);
    const sh = v.list.find((x) => x.key === 'short')!;
    const lg = v.list.find((x) => x.key === 'long')!;
    expect(lg.d).toBeCloseTo(sh.d, 6);
    expect(Object.values(v.parts).reduce((a, x) => a + x, 0)).toBeCloseTo(v.value, 6);
  });
});

describe('経営方針（社長の価値観）', () => {
  it('同じ提案（社員食堂：目先は赤字・士気が上がる）でも、「人を大事に」なら承認、「利益重視」なら見送る。理由に方針が出る', () => {
    const s = uTown();
    expect(actOk(s, canteen)).toBe(true);
    // テストの町は月の売上が 2 万 G ほどと小さいので、社員食堂の値段を 1 割にした写しで比べる（方針の切り替わりを見るため）
    const cost0 = SKILL.ga_canteen.cost;
    SKILL.ga_canteen.cost = Math.round(cost0 / 10);
    const p = planOf(s, [canteen], { hero: null, q: 0.9, dept: 'general' });
    setPolicy(s, 'people');
    const a = briefOf(s, p);
    expect(a.vals.list.some((x) => x.key === 'morale' && x.d > 0)).toBe(true);
    expect(a.vals.list.find((x) => x.key === 'short')!.d).toBeLessThan(0);
    expect(a.rec).toBe('ok');
    expect(a.why).toContain('人を大事に');
    setPolicy(s, 'profit');
    const b = briefOf(s, p);
    SKILL.ga_canteen.cost = cost0;
    expect(b.rec).toBe('skip');
    expect(b.why).toContain('利益重視');
  });
  it('方針はゲームの数字に効かない：指標そのものは方針で変わらない（価値と推奨だけ）', () => {
    const s = uTown();
    const p = planOf(s, [survey], { hero: null, q: 0.9, dept: 'support' });
    const base = baseOf(s);
    const after = afterOf(s, p);
    const out = POLICY.ids.map((id) => {
      setPolicy(s, id);
      return valuesOf(s, p, { base, after });
    });
    for (const v of out) expect(v.list.map((x) => Math.round(x.d))).toEqual(out[0].list.map((x) => Math.round(x.d)));
    expect(new Set(out.map((v) => Math.round(v.value))).size).toBeGreaterThan(1);
  });
  it('要約の一言：方針の大事な指標が上がるときは先に言う（ブランド重視なら「ブランド」）。全員・全方針で 60 字まで', () => {
    const s = uTown();
    const p = planOf(s, [canteen], { hero: null, q: 0.9, dept: 'general' });
    setPolicy(s, 'people');
    const v = valuesOf(s, p);
    expect(leadOf('people', v)).toBe('士気');
    expect(leadOf('balance', v)).toBeNull();
    expect(briefOf(s, p).pitch).toContain('士気が上がります');
    const acts: PropAct[][] = [
      [{ k: 'ad', id: 'event' }, { k: 'stock', uid: 1, key: 'Lantern', rar: 'U', idx: 0, add: false }],
      [{ k: 'skill', id: 'ga_canteen' }, { k: 'hire', hero: 1001, task: 'craft', target: null }],
    ];
    const leads = ['お客さんの満足度', '先の利益', 'ブランド', null];
    for (const hero of [null, ...heroById.keys()]) for (const xs of acts) for (const l of leads) expect([...pitchOf(hero, xs, 'general', l)].length).toBeLessThanOrEqual(PITCH_MAX);
  });
  it('束ね方：カードの推奨の手に、方針の価値が増える手だけを足す', () => {
    const s = uTown();
    s.cards = newCards();
    const hero = s.staff[0].hero;
    const st = s.staff[0];
    st.level = 30;
    const card = (choices: Card['choices']): Card => ({ id: 1, src: 'clerk', kind: 'sell', hero, q: 0.95, dept: 'logistics', mk: 0, sector: s.sector ?? 'c1', day: s.day, issue: { k: 'sell', share: 0.4, pile: 0 }, choices, pop: false });
    const flyer: PropAct = { k: 'ad', id: 'flyer' };
    // 宣伝（価値がプラス）に、目先が赤字の社員食堂：利益重視なら足さない・人を大事になら足す
    const c = card([
      { act: { k: 'do', a: flyer }, est: 5000, unit: 'ad', cost: 1500, rec: true },
      { act: { k: 'do', a: canteen }, est: 100, unit: 'G', cost: 20000 },
      { act: { k: 'skip' }, cost: 0 },
    ]);
    setPolicy(s, 'profit');
    expect(planOfChoice(s, c, 0)!.acts.map((x) => x.k)).toEqual(['ad']);
    setPolicy(s, 'people');
    const p = planOfChoice(s, c, 0)!;
    if (p.acts.length > 1) expect(p.acts.map((x) => x.k)).toEqual(['ad', 'skill']);
    else expect(planOfChoice(s, c, 0)!.acts.length).toBe(1);
  });
  it('推奨：価値がプラスなら承認・マイナスなら見送る（払えないときは見送る）', () => {
    const vals = { policy: 'brand' as PolicyId, list: [{ key: 'short' as const, now: 0, after: -2247, d: -2247, why: '' }, { key: 'brand' as const, now: 0, after: 12, d: 12, why: '' }], value: 500, parts: { short: -674, long: 0, morale: 0, sat: 0, brand: 1174, rp: 0 }, scale: 1, rpG: 1 };
    const b = { block: [] as string[], co: { n: 0, money: 0, cash: 1000, left: 500, reserve: 100 }, vals };
    const r = recOf(b);
    expect(r.rec).toBe('ok');
    expect(r.why).toBe('社長の方針（ブランド重視）なら承認：短期 −2,247 G でも ★ +12');
    expect(recOf({ ...b, vals: { ...vals, value: -1 } }).rec).toBe('skip');
  });
});

describe('セーブ・マインちゃんの問い', () => {
  it('方針はセーブに残る（無いセーブはバランス）。版は上げない', () => {
    const s = town();
    expect(policyOf(s)).toBe('balance');
    const v = s.v;
    setPolicy(s, 'customer');
    const back = deserializeP1(serializeP1(s))!;
    expect(policyOf(back)).toBe('customer');
    expect(back.flags.policyAsked).toBe(true);
    expect(back.v).toBe(v);
    const old = JSON.parse(serializeP1(s));
    delete old.policy;
    expect(policyOf(deserializeP1(JSON.stringify(old))!)).toBe('balance');
  });
  it('マインちゃんは 1 回だけ聞く（チュートリアルのあいだは聞かない）', () => {
    const s = town();
    expect(askDue(s)).toBe(true);
    s.tut = 5;
    expect(askDue(s)).toBe(false);
    s.tut = 99;
    setPolicy(s, 'balance');
    expect(askDue(s)).toBe(false);
  });
});
