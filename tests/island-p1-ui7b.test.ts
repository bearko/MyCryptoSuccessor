/**
 * 段 UI7b：判断しやすい提案書（brief.ts・proposalui.ts）。
 * 要約の一言の字数・月の費用の内訳の合計・この部門の予算の内外・「○○部に依頼」の付き方・宣伝の日割り・提案書の並びの順。
 * 仕様は docs/ISLAND_PHASE1.md「判断しやすい提案書（段 UI7b）」。
 */
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { heroById } from '../src/game/catalog';
import { ADS, SKILL, SKILLS } from '../src/island/p1/data';
import { deserializeP1, myShops, serializeP1, type P1State } from '../src/island/p1/model';
import { afterOf, baseOf, planOf } from '../src/island/p1/plan';
import { PITCH_MAX, actDept, briefOf, pitchOf, recOf } from '../src/island/p1/brief';
import { setBudget } from '../src/island/p1/budget';
import { heroNm, type PropAct } from '../src/island/p1/deleg';
import { loadVoice, voiceOf } from '../src/island/p1/voice';
import { TONES, toneOf } from '../src/island/p1/persona';
import { runOnce } from '../scripts/island/sim';

/** タオックスの 2 か月目の写し（お店あり）。Rare の町として予算を開く */
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
  s.money = 500_000;
  for (const k of Object.keys(s.ads)) s.ads[k] = 0;
  return s;
}
const len = (x: string) => [...x].length;

beforeAll(async () => {
  await loadVoice();
});

describe('要約の一言（ヒーローの口から）', () => {
  it('全員の口調・呼び方で、どの手の組み合わせでも 60 字に収まる', () => {
    // 名前のいちばん長いパネル・ヒーロー（雇う）で、手の組み合わせ（1 つ・同じ部門 2 つ・ほかの部門に頼む・3 つ）
    const longSkill = [...SKILLS].sort((a, b) => len(b.name) - len(a.name))[0].id;
    const ids = [...heroById.keys()];
    const longHero = [...ids].sort((a, b) => len(heroNm(b)) - len(heroNm(a)))[0];
    const acts: PropAct[][] = [
      [{ k: 'ad', id: 'event' }],
      [
        { k: 'ad', id: 'event' },
        { k: 'stock', uid: 1, key: 'Lantern', rar: 'U', idx: 0, add: false },
      ],
      [
        { k: 'skill', id: longSkill },
        { k: 'hire', hero: longHero, task: 'craft', target: null },
      ],
      [
        { k: 'build', id: 'warehouse', i: 0, j: 0, dir: 'rd' },
        { k: 'level', id: longSkill },
        { k: 'ad', id: 'poster' },
      ],
      [
        { k: 'stock', uid: 1, key: 'Lantern', rar: 'U', idx: 0, add: true },
        { k: 'staff', uid: 1, n: 2 },
      ],
    ];
    let voiced = 0;
    const tones = new Set<string>();
    for (const hero of [null, ...ids]) {
      if (hero != null && voiceOf(hero)) voiced++;
      if (hero != null) tones.add(toneOf(hero));
      for (const xs of acts)
        for (const d of ['marketing', 'logistics', 'hr'] as const) {
          const p = pitchOf(hero, xs, d);
          expect(len(p), `${hero} ${p}`).toBeLessThanOrEqual(PITCH_MAX);
          expect(p.length).toBeGreaterThan(4);
        }
    }
    // 史実の調査のあるヒーローの呼び方と、すべての口調の型を通した
    expect(voiced).toBeGreaterThan(100);
    expect(TONES.every((x) => tones.has(x))).toBe(true);
  });
  it('1 つの手は 25 字前後・ほかの部門の手は「○○部に…」と言う・呼び方は史実の調査のあるヒーローの呼び方', () => {
    const takasugi = 2021;
    const one = pitchOf(takasugi, [{ k: 'ad', id: 'event' }], 'marketing');
    expect(len(one)).toBeLessThanOrEqual(30);
    expect(one).toContain('店頭イベント');
    const to = voiceOf(takasugi)?.to;
    if (to) expect(one.startsWith(`${to}、`)).toBe(true);
    const two = pitchOf(
      takasugi,
      [
        { k: 'ad', id: 'event' },
        { k: 'stock', uid: 1, key: 'Lantern', rar: 'U', idx: 0, add: false },
      ],
      'marketing',
    );
    expect(two).toContain('商品の入れ替え');
    expect(two).toContain('物流部');
    // マインちゃん（話し手なし）
    expect(pitchOf(null, [{ k: 'ad', id: 'event' }], 'marketing')).toBe('社長、店頭イベントをしましょう。');
  });
});

describe('提案書の中身（briefOf）', () => {
  it('月の費用の内訳の合計が、月の費用の差（このまま → 承認後）と一致する（従業員を増やす手：毎月の費用の行がある）', () => {
    const s = town();
    const b = myShops(s)[0];
    const plan = planOf(
      s,
      [
        { k: 'staff', uid: b.uid, n: (s.shops[b.uid]?.part ?? 0) + 1 },
        { k: 'ad', id: 'flyer' },
      ],
      { hero: null, q: 0.8, dept: 'logistics' },
    );
    const B = briefOf(s, plan);
    const sum = B.costs.reduce((a, r) => a + (r.after - r.now), 0);
    expect(sum).toBeCloseTo(B.after.cost - B.now.cost, 6);
    expect(B.costs.some((r) => r.label.includes('従業員') && r.after > 0)).toBe(true);
    expect(B.after.monthly).toBeGreaterThan(0);
    // 承認事項の費用の合計は、導入の合計と同じ
    expect(B.asks.reduce((a, x) => a + x.money, 0)).toBe(B.cost.money);
    expect(B.asks.reduce((a, x) => a + x.monthly, 0)).toBe(B.cost.monthly);
    // 手ごとの分（順に足したときの増え方）の合計は、提案の全部と同じ
    expect(B.parts.reduce((a, x) => a + x.dProfit, 0)).toBeCloseTo(B.dProfit, 6);
  });
  it('宣伝は効く日数で日割り（5 日の店頭イベントで、月の売上が 1 か月ずっと効いたときより小さい）。宣伝だけの提案で棚の商品は変わらない', () => {
    const s = town();
    const plan = planOf(s, [{ k: 'ad', id: 'event' }], {
      hero: null,
      q: 0.9,
      dept: 'marketing',
    });
    const base = baseOf(s);
    const aft = afterOf(s, plan);
    const B = briefOf(s, plan, {}, base, aft);
    expect(B.after.adDays).toBe(ADS.find((a) => a.id === 'event')!.days);
    const full = briefOf(s, plan, {}, base, {
      ...aft,
      ads: { ...aft.ads, event: 30 },
    });
    expect(B.dSales).toBeGreaterThan(0);
    expect(B.dSales).toBeLessThan(full.dSales);
    for (const u of Object.keys(base.shops)) expect(aft.shops[Number(u)]?.shelves).toEqual(base.shops[Number(u)]?.shelves);
  });
  it('この部門の予算の内外：残りで足りれば予算内、足りなければ予算外（リスクにも出す）。Rare より前は予算なし', () => {
    const s = town();
    const plan = planOf(s, [{ k: 'ad', id: 'event' }], {
      hero: null,
      q: 0.9,
      dept: 'marketing',
    });
    s.tier = 'C';
    expect(briefOf(s, plan).budget).toBeNull();
    s.tier = 'R';
    setBudget(s, 'marketing', 'X', 50_000);
    const a = briefOf(s, plan);
    expect(a.budget?.dept).toBe('marketing');
    expect(a.budget?.need).toBe(a.cost.money);
    expect(a.budget?.inside).toBe(true);
    expect(a.risks.some((x) => x.includes('予算を'))).toBe(false);
    setBudget(s, 'marketing', 'X', 1000);
    const b = briefOf(s, plan);
    expect(b.budget?.inside).toBe(false);
    expect(b.risks.some((x) => x.includes('マーケティング部の予算を'))).toBe(true);
  });
  it('「○○部に依頼」：提案した部門と違う部門の手だけに付く（宣伝 → マーケ・商品と従業員 → 物流・パネル → パネルの部門）', () => {
    const s = town();
    const b = myShops(s)[0];
    const acts: PropAct[] = [
      { k: 'ad', id: 'event' },
      { k: 'staff', uid: b.uid, n: (s.shops[b.uid]?.part ?? 0) + 1 },
    ];
    const mk = planOf(s, acts, { hero: null, q: 0.9, dept: 'marketing' });
    const B1 = briefOf(s, mk);
    expect(B1.asks.map((x) => [x.dept, x.own])).toEqual([
      ['marketing', true],
      ['logistics', false],
    ]);
    expect(B1.risks.some((x) => x.startsWith('物流部の手が要る'))).toBe(true);
    const lg = briefOf(s, planOf(s, acts, { hero: null, q: 0.9, dept: 'logistics' }));
    expect(lg.asks.map((x) => x.own)).toEqual([false, true]);
    expect(lg.pitch).toContain('マーケ部');
    const hr = SKILLS.find((k) => actDept({ k: 'skill', id: k.id }) === 'hr')!;
    expect(actDept({ k: 'skill', id: hr.id })).toBe('hr');
    expect(actDept({ k: 'hire', hero: 1001, task: 'craft', target: null })).toBe('hr');
    expect(SKILL[hr.id]).toBeTruthy();
  });
  it('推奨：払えない・資金が足りなくなるなら見送る（方針の価値の推奨は段 UI7c のテスト）', () => {
    const vals = { policy: 'balance' as const, list: [], value: 1000, parts: { short: 0, long: 1000, morale: 0, sat: 0, brand: 0, rp: 0 }, scale: 1, rpG: 1 };
    const base = { block: [] as string[], co: { n: 0, money: 0, cash: 1000, left: 500, reserve: 100 }, vals };
    expect(recOf(base).rec).toBe('ok');
    expect(recOf({ ...base, block: ['資金不足'] }).rec).toBe('skip');
    expect(recOf({ ...base, co: { ...base.co, left: -1 } }).rec).toBe('skip');
    expect(recOf({ ...base, vals: { ...vals, value: -1 } }).rec).toBe('skip');
  });
});

describe('提案書の画面（proposalui.ts）', () => {
  it('並びの順：承認してほしいこと → 課題の背景 → 期待効果 → リスク → 詳しく（As-Is／To-Be）。ボタンは本文の外（下に固定）。フレーバーの一言は外した', () => {
    const src = readFileSync('src/island/p1/proposalui.ts', 'utf8');
    const at = (x: string) => src.indexOf(x);
    const keys = ["t('承認してほしいこと'", "t('課題の背景'", 't(`期待効果', "t('予想されるリスク'", "t('詳しく：As-Is"];
    const pos = keys.map(at);
    expect(pos.every((x) => x > 0)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
    expect(at('panel.append(body)')).toBeLessThan(at('panel.append(foot)'));
    expect(src).not.toContain('voiceQuip');
    expect(src).not.toContain('isl-prop-quip');
    // スマホでは「詳しく」を閉じておく
    expect(src).toContain('det.open = !phone');
  });
});
